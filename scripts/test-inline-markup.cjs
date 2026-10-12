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
      return result.snapshot.projects[0].documents[0].text;
    };
    const expectText = async (expected) => {
      await assert.doesNotReject(
        async () => {
          await page.waitForFunction(async (expected) => {
            const r = await window.yarnDesktop.request({ type: "snapshot" });
            return r.snapshot.projects[0].documents[0].text.includes(expected);
          }, expected);
        },
        expected + " actual: " + (await content()),
      );
    };
    for (const [mode, editor, list] of [
      ["純文字", ".monaco-editor textarea", ".suggest-widget.visible"],
      ["閱讀編輯", ".reading-editor .cm-content", ".spindle-completions"],
    ]) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      await page.locator(editor).first().focus();
      const reset = async (body = "Mira: ") => {
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("Control+a");
        await page.keyboard.insertText("title: Start\n---\n" + body + "\n===");
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("End");
      };
      await reset();
      await page.keyboard.type("[pa", { delay: 90 });
      await page.locator(list).waitFor();
      await page.keyboard.press("Tab");
      await expectText("Mira: [pause=500 /]");
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
      if (mode === "純文字") await page.keyboard.press("Tab");
      await expectText("Mira: [wave]hello[/wave]");
      checks.push(mode + ": wrap selected text with completion");
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
      checks.push(mode + ": name completion preserves existing parameters and closer");
      await page.screenshot({
        path: path.join(out, mode === "純文字" ? "source.png" : "reading.png"),
      });
    }
    await page
      .getByRole("button", { name: "Inline markup test", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "自訂指令", exact: true }).click();
    const inline = page.getByRole("checkbox", {
      name: "行內標記",
      exact: true,
    });
    await inline.waitFor();
    assert(await inline.isChecked());
    await page.getByRole("combobox", { name: "行內標記", exact: true }).click();
    await page.getByRole("option", { name: "自閉合", exact: true }).click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page.waitForFunction(
      async () =>
        (await window.yarnDesktop.request({ type: "snapshot" })).snapshot
          .projects[0].commands[0].markupMode === "selfClosing",
    );
    await inline.click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page.waitForFunction(
      async () =>
        !(await window.yarnDesktop.request({ type: "snapshot" })).snapshot
          .projects[0].commands[0].inline,
    );
    await inline.click();
    await page.getByRole("combobox", { name: "行內標記", exact: true }).click();
    await page.getByRole("option", { name: "成對", exact: true }).click();
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page.waitForFunction(
      async () =>
        (await window.yarnDesktop.request({ type: "snapshot" })).snapshot
          .projects[0].commands[0].markupMode === "paired",
    );
    await page.getByText("內建行內標記", { exact: true }).click();
    await page.screenshot({ path: path.join(out, "settings.png") });
    checks.push(
      "Command list: inline toggle and both shapes persist; builtins are read-only",
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
