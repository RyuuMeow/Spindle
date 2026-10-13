const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const playwright = require("playwright");
const out = path.resolve("outputs/inline-markup-ui");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const project = {
  id: "inline-test",
  name: "Inline markup test",
  excluded: [],
  recovery: [],
  documents: [
    {
      id: "doc",
      name: "test.yarn",
      text: "title: Start\n---\nMira: \n===",
      saved: "",
      version: 0,
      status: "draft",
    },
  ],
  commands: [
    {
      name: "wave",
      inline: true,
      markupMode: "paired",
      description: "Wave",
      params: [],
      example: "[wave]text[/wave]",
    },
    {
      name: "tint",
      inline: true,
      markupMode: "paired",
      description: "Tint help",
      params: [
        {
          name: "color",
          displayName: "顏色",
          description: "文字的色彩",
          type: "string",
          required: true,
          defaultValue: '"red"',
        },
        {
          name: "strength",
          displayName: "強度",
          description: "零到一",
          type: "number",
          required: true,
          defaultValue: "1",
        },
        {
          name: "enabled",
          displayName: "啟用",
          type: "boolean",
          required: false,
          defaultValue: "true",
        },
      ],
      example: '[tint color="red" strength=1]text[/tint]',
    },
    {
      name: "shift",
      inline: true,
      markupMode: "selfClosing",
      description: "Move help",
      params: ["x", "y", "fast"].map((name) => ({
        name,
        type: name === "fast" ? "boolean" : "number",
        required: true,
        defaultValue: "",
      })),
      example: "[shift x=1 y=2 fast=true /]",
    },
  ],
};
fs.writeFileSync(
  path.join(profile, "workspace-v2.json"),
  JSON.stringify({
    projects: [project],
    currentProjectId: project.id,
    notices: [],
  }),
);
fs.writeFileSync(
  path.join(profile, "preferences.json"),
  JSON.stringify({ language: "zh-TW" }),
);
const projectRoot = path.join(profile, "Project");
fs.mkdirSync(path.join(projectRoot, ".spindle"), { recursive: true });
fs.writeFileSync(
  path.join(projectRoot, "test.yarn"),
  project.documents[0].text,
);
fs.writeFileSync(
  path.join(projectRoot, ".spindle", "project.json"),
  JSON.stringify({
    version: 2,
    name: project.name,
    commands: project.commands,
  }),
);
let app, page;
const errors = [],
  checks = [];
(async () => {
  try {
    app = await playwright._electron.launch({
      executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
      args: [
        path.resolve("dist-desktop/app/desktop/main.cjs"),
        "--user-data-dir=" + profile,
      ],
      env: { ...process.env, SPINDLE_LOCALE: "zh-TW" },
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1280, 900);
      w.show();
      w.focus();
    });
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, projectRoot);
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .click();
    await page.getByRole("button", { name: "test.yarn", exact: true }).click();
    const content = async () => {
      const result = await page.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      );
      return result.snapshot.projects.find((p) => p.root === projectRoot)
        .documents[0].text;
    };
    // waitForFunction treats an async predicate's Promise as truthy. Poll the
    // awaited IPC result here so assertions actually wait for persisted edits.
    const until = async (check, message) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await check()) return;
        await page.waitForTimeout(40);
      }
      throw Error(message);
    };
    const savedCommands = () =>
      page.evaluate(
        async (root) =>
          (
            await window.yarnDesktop.request({ type: "snapshot" })
          ).snapshot.projects.find((p) => p.root === root).commands,
        projectRoot,
      );
    const expectText = async (expected) => {
      await until(
        async () => (await content()).includes(expected),
        expected + " actual: " + (await content()),
      );
    };
    for (const [mode, editor, list] of [
      ["純文字", ".monaco-editor textarea", ".suggest-widget.visible"],
      ["閱讀編輯", ".reading-editor .cm-content", ".spindle-completions"],
      ["流程圖", ".graph-scene-editor .cm-content", ".spindle-completions"],
    ].filter(
      ([mode]) =>
        !process.env.INLINE_TEST_MODE || process.env.INLINE_TEST_MODE === mode,
    )) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      if (mode === "流程圖")
        await page
          .locator(".flow-card-title")
          .filter({ hasText: /^Start$/ })
          .dblclick();
      await page.locator(editor).first().focus();
      const reset = async (body = "Mira: ") => {
        if (mode !== "流程圖") await page.keyboard.press("Escape");
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("Control+a");
        await page.keyboard.insertText(
          mode === "流程圖"
            ? body + "\n"
            : "title: Start\n---\n" + body + "\n===",
        );
        await page.keyboard.press("Control+Home");
        if (mode !== "流程圖") {
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowDown");
        }
        await page.keyboard.press("End");
      };
      if (mode !== "純文字") {
        const sample =
          'Mira: [tint color="blue" strength=0.5]你好 [pause=500 /] 世界[/tint]\nMira: Next';
        await reset(sample);
        await page.keyboard.press("Control+End");
        await page
          .locator(".reading-inline-name")
          .filter({ hasText: "tint" })
          .waitFor();
        assert.equal(await page.locator(".reading-inline-close").count(), 0);
        assert((await page.locator(".reading-inline-scope").count()) > 0);
        await expectText(sample);
        await page.screenshot({
          path: path.join(
            out,
            mode === "流程圖"
              ? "graph-inline-style.png"
              : "reading-inline-style.png",
          ),
        });
        await page
          .locator(".reading-inline-name")
          .filter({ hasText: "tint" })
          .click();
        await page
          .locator(".reading-inline-source")
          .filter({ hasText: '[tint color="blue" strength=0.5]' })
          .waitFor();
        assert.equal(await page.locator(".reading-inline-marker").count(), 1);
        await page
          .locator(".reading-inline-source")
          .filter({ hasText: "[/tint]" })
          .waitFor();
        await page.keyboard.press("Control+End");
        await page
          .locator(".reading-inline-name")
          .filter({ hasText: "tint" })
          .waitFor();
        await expectText(sample);
        if (mode === "流程圖") {
          await page.keyboard.press("Escape");
          await page
            .locator(".flow-card-summary .reading-inline-marker")
            .first()
            .waitFor();
          await page.screenshot({
            path: path.join(out, "graph-inline-summary.png"),
          });
          await page
            .locator(".flow-card-title")
            .filter({ hasText: /^Start$/ })
            .dblclick();
          await page.locator(editor).first().focus();
        }
        checks.push(
          mode +
            ": inline markers and paired scopes render, clicking restores editable source without changing text",
        );
      }
      await reset();
      await page.keyboard.type("[pa", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [pause= /]");
      await page.locator(".command-parameter-popup").waitFor();
      await page.keyboard.type("750");
      await page.keyboard.press("Tab");
      await page.keyboard.type("done");
      await expectText("Mira: [pause=750 /]done");
      checks.push(mode + ": self-closing snippet, value selection, Tab exit");
      await reset();
      await page.keyboard.type("[wa", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await page.keyboard.type("hello");
      await expectText("Mira: [wave]hello[/wave]");
      checks.push(mode + ": paired snippet leaves caret inside");
      await reset("Mira: [wave]hello");
      await page.keyboard.type("[/", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [wave]hello[/wave]");
      checks.push(mode + ": closing completion from open markup");
      await reset("Mira: hello");
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.press("Control+Space");
      await page.locator(list).waitFor();
      await page
        .locator(list)
        .getByText("wave", { exact: true })
        .first()
        .click();
      await expectText("Mira: [wave]hello[/wave]");
      checks.push(mode + ": wrap selected text with completion");
      await reset("Mira: hello");
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.type("[", { delay: 90 });
      await expectText("Mira: []hello[/]");
      await page.locator(".inline-mirror-caret:visible").waitFor();
      await page.keyboard.type("wa", { delay: 90 });
      await expectText("Mira: [wa]hello[/wa]");
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [wave]hello[/wave]");
      await page.keyboard.type("!");
      await expectText("Mira: [wave]hello![/wave]");
      checks.push(
        mode +
          ": bracket wraps selection, mirrors name and completion ends the link",
      );
      await reset("Mira: hello");
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.type("[ti", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText('Mira: [tint color="" strength=]hello[/tint]');
      await page
        .locator(".command-tip-slot.is-active")
        .filter({ hasText: "顏色" })
        .waitFor();
      await page.keyboard.type("blue");
      await page.keyboard.press("Tab");
      await page
        .locator(".command-tip-slot.is-active")
        .filter({ hasText: "強度" })
        .waitFor();
      await page.keyboard.type("0.5");
      await page.keyboard.press("Tab");
      await page.keyboard.type("!");
      await expectText('Mira: [tint color="blue" strength=0.5]hello![/tint]');
      await page.keyboard.press("Control+Home");
      if (mode !== "純文字") {
        if (mode === "流程圖") await page.keyboard.press("Control+End");
        await page
          .locator(".reading-parameter-hint")
          .filter({ hasText: "顏色:" })
          .waitFor();
        await page
          .locator(".reading-parameter-hint")
          .filter({ hasText: "強度:" })
          .waitFor();
        // Diagnostics intentionally suppress hover during the 800 ms edit quiet period.
        await page.waitForTimeout(900);
        await page.mouse.move(20, 20);
        await page
          .locator(".reading-parameter-hint")
          .filter({ hasText: "顏色:" })
          .hover();
        await page
          .locator(".reading-command-tooltip:visible")
          .filter({ hasText: "文字的色彩" })
          .waitFor();
      }
      checks.push(
        mode +
          ": empty string/number Tab stops, active parameter help and virtual labels",
      );
      await reset();
      await page.keyboard.type("[shift", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [shift x= y= fast= /]");
      for (const [name, value] of [
        ["x", "1"],
        ["y", "2"],
        ["fast", "true"],
      ]) {
        await page
          .locator(".command-tip-slot.is-active")
          .filter({ hasText: new RegExp("^" + name + "$") })
          .waitFor();
        await page.keyboard.type(value);
        await page.keyboard.press("Tab");
      }
      await expectText("Mira: [shift x=1 y=2 fast=true /]");
      checks.push(
        mode +
          ": consecutive empty numeric and boolean slots retain distinct help",
      );
      await reset('Mira: [tint color="blue" strength=0.5]text[/tint]');
      await page.keyboard.press("Home");
      for (let i = 0; i < 'Mira: [tint color="blue" strength=0.5'.length; i++)
        await page.keyboard.press("ArrowRight");
      await page.keyboard.type(" en", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText(
        'Mira: [tint color="blue" strength=0.5 enabled=]text[/tint]',
      );
      await page.keyboard.type("true");
      await expectText(
        'Mira: [tint color="blue" strength=0.5 enabled=true]text[/tint]',
      );
      checks.push(
        mode + ": missing optional property completes into an empty value",
      );
      await reset();
      await page.keyboard.type("[");
      await expectText("Mira: []");
      await page.keyboard.press("Backspace");
      await expectText("Mira: \n");
      await reset("Mira: hello");
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.type("[");
      await page.keyboard.press("Backspace");
      await expectText("Mira: hello\n");
      checks.push(
        mode +
          ": empty pair deletion and canceling an empty wrapper preserve source",
      );
      await reset("Mira: hello");
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.type("[ab", { delay: 90 });
      await page.keyboard.press("Backspace");
      await expectText("Mira: [a]hello[/a]");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type("X");
      await expectText("Mira: [a]Xhello[/a]");
      checks.push(
        mode + ": Backspace mirrors and moving into body ends the link",
      );
      await reset("Mira: 後面的文字");
      await page.keyboard.press("Home");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
      await page.keyboard.type("[pa", { delay: 90 });
      await expectText("Mira: [pa]後面的文字");
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await page.keyboard.type("100");
      await expectText("Mira: [pause=100 /]後面的文字");
      checks.push(mode + ": pair and completion preserve following dialogue");
      await reset();
      await page.keyboard.type("[wa", { delay: 70 });
      await page.keyboard.press("Escape");
      await page.keyboard.type("]");
      await expectText("Mira: [wa]\n");
      assert(!(await content()).includes("[wa]]"));
      checks.push(mode + ": manually typed closer skips the existing bracket");
      await reset("Mira: [nomarkup][raw]");
      await page.keyboard.type("[/no", { delay: 70 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [nomarkup][raw][/nomarkup]");
      checks.push(mode + ": literal regions still offer their own closer");
      await reset("Mira: [wa rate=2]text[/wave]");
      await page.keyboard.press("Home");
      for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Control+Space");
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [wave rate=2]text[/wave]\n");
      checks.push(
        mode + ": name completion preserves existing parameters and closer",
      );
      await page.screenshot({
        path: path.join(
          out,
          mode === "純文字"
            ? "source.png"
            : mode === "閱讀編輯"
              ? "reading.png"
              : "graph.png",
        ),
      });
      const unknown =
        mode === "純文字"
          ? "source_fx"
          : mode === "閱讀編輯"
            ? "reading_fx"
            : "graph_fx";
      await reset(`Mira: [${unknown} speed=2 enabled=true /]`);
      await page.keyboard.press("Home");
      for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Alt+Enter");
      await until(
        async () => (await savedCommands()).some((c) => c.name === unknown),
        "registered " + unknown,
      );
      const registered = (await savedCommands()).find(
        (c) => c.name === unknown,
      );
      assert(
        registered,
        JSON.stringify({ unknown, commands: await savedCommands() }),
      );
      assert.equal(registered.markupMode, "selfClosing");
      assert.deepEqual(
        registered.params.map((p) => [p.name, p.type]),
        [
          ["speed", "number"],
          ["enabled", "boolean"],
        ],
      );
      assert.equal(await page.locator(".command-workspace:visible").count(), 0);
      assert(await page.locator(editor).first().isVisible());
      if (mode !== "流程圖") await page.locator(editor).first().focus();
      await expectText(`Mira: [${unknown} speed=2 enabled=true /]`);
      checks.push(
        mode +
          ": unknown markup quick fix saves inferred inline metadata without leaving the editor",
      );
    }
    await page
      .locator(".tab-name")
      .filter({ hasText: /^test$/ })
      .click();
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(
      "title: Start\n---\nMira: [expression_fx amount={2 + 3} /]\n===",
    );
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+Enter");
    await until(
      async () =>
        (await savedCommands()).some(
          (c) => c.name === "expression_fx" && c.params[0].type === "number",
        ),
      "expression type inferred and saved",
    );
    checks.push(
      "Quick fix infers expression parameter types and saves without switching tabs",
    );
    await page
      .getByRole("button", { name: "Inline markup test", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "自訂指令", exact: true }).click();
    await page
      .locator(".command-list")
      .getByRole("button")
      .filter({ hasText: "wave" })
      .click();
    const inline = page.getByRole("checkbox", {
      name: "行內標記",
      exact: true,
    });
    await inline.waitFor();
    assert(await inline.isChecked());
    await page.getByRole("combobox", { name: "行內標記", exact: true }).click();
    await page.getByRole("option", { name: "自閉合", exact: true }).click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await until(
      async () => (await savedCommands())[0].markupMode === "selfClosing",
      "self-closing persisted",
    );
    await inline.click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await until(
      async () => !(await savedCommands())[0].inline,
      "inline off persisted",
    );
    await inline.click();
    await page.getByRole("combobox", { name: "行內標記", exact: true }).click();
    await page.getByRole("option", { name: "成對", exact: true }).click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await until(
      async () => (await savedCommands())[0].markupMode === "paired",
      "paired persisted",
    );
    assert.equal(
      await page.getByText("內建行內標記", { exact: true }).count(),
      0,
    );
    const sidebar = page.locator(".command-list-panel");
    const grip = page.getByRole("separator", {
      name: "調整指令清單寬度",
      exact: true,
    });
    const original = (await sidebar.boundingBox()).width;
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + 50, {
      steps: 6,
    });
    await page.mouse.up();
    assert.equal((await sidebar.boundingBox()).width, original + 120);
    await grip.press("Home");
    assert.equal((await sidebar.boundingBox()).width, 160);
    const geometry = await page
      .locator(".command-list")
      .evaluate((element) => ({
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        clipped: [...element.querySelectorAll(".command-row-label")].every(
          (label) =>
            getComputedStyle(label).overflowX === "hidden" &&
            label.getBoundingClientRect().right <=
              label.closest("button").getBoundingClientRect().right,
        ),
      }));
    assert.equal(geometry.horizontalOverflow, 0);
    assert(geometry.clipped);
    const narrow = await grip.boundingBox();
    await page.mouse.move(narrow.x + 3, narrow.y + 50);
    await page.mouse.down();
    await page.mouse.move(narrow.x + 100, narrow.y + 50);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal((await sidebar.boundingBox()).width, 160);
    await grip.press("ArrowRight");
    assert.equal((await sidebar.boundingBox()).width, 168);
    checks.push(
      "Command sidebar clips long signatures, supports drag/keyboard resize and Escape cancellation",
    );
    await page.screenshot({ path: path.join(out, "settings.png") });
    checks.push(
      "Command list: inline toggle and both shapes persist; builtins are absent",
    );
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (page)
      await page
        .screenshot({ path: path.join(out, "failure.png") })
        .catch(() => {});
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(checks);
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
