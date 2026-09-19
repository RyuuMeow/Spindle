const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/assistance-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialDocs, initialCommands } = require(path.join(out, "sample.cjs"));
const profile = fs.mkdtempSync(path.join(out, "profile-"));
initialCommands[0].displayName = "淡入";
initialCommands[0].params[0].displayName = "秒數";
initialCommands[0].params[0].description = "淡入所需秒數";
const documents = initialDocs.map((d, index) => ({
  ...d,
  id: "document-" + index,
  version: 0,
  status: "draft",
}));
const first = documents[0];
const historical = first.text.replace(
  "遠方的燈塔卻沒有亮起",
  "海上的燈塔仍然明亮",
);
const project = {
  id: "design-test",
  name: "The Last Light",
  documents,
  commands: initialCommands,
  excluded: [],
  recovery: [
    {
      id: "version-1",
      documentId: first.id,
      name: first.name,
      text: historical,
      at: Date.now() - 100000,
      reason: "定期快照",
    },
    {
      id: "deleted-1",
      documentId: "removed",
      name: "Deleted.yarn",
      text: "title: Deleted\n---\n保留的刪除內容\n===",
      at: Date.now() - 90000,
      reason: "刪除前",
      deleted: true,
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
const results = {
    scope:
      "Isolated Electron profile; real product UI; 1440px and 800px (sidebar collapsed for narrow editor input)",
  },
  errors = [];
let app, page;
async function mode(name) {
  await page.getByRole("radio", { name, exact: true }).click();
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name + ".png") });
}
(async () => {
  try {
    const launcher =
      process.env.DESKTOP_PORTABLE_TEST === "1"
        ? (options) =>
            require("./portable-test-driver.cjs").launch(playwright, options)
        : (options) => playwright._electron.launch(options);
    app = await launcher({
      executablePath:
        process.env.DESKTOP_EXECUTABLE ||
        path.resolve("node_modules/electron/dist/electron.exe"),
      args: [
        ...(process.env.DESKTOP_EXECUTABLE
          ? []
          : [path.resolve("dist-desktop/app/desktop/main.cjs")]),
        "--user-data-dir=" + profile,
        "--force-device-scale-factor=1",
      ],
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: first.name, exact: true }).click();

    assert((await page.title()).includes("Spindle"));
    const brand = await app.evaluate(({ app }) => ({
      name: app.getName(),
      profile: app.getPath("userData"),
    }));
    assert.equal(brand.name, "Spindle");
    assert.equal(path.resolve(brand.profile), path.resolve(profile));
    results.brandAndProfile = true;
    await page.evaluate(() => document.fonts.ready);

    await app.evaluate(({ clipboard }) => {
      global.__clipboardFormats = clipboard
        .availableFormats()
        .map((format) => [format, clipboard.readBuffer(format)]);
    });
    const snapshot = async () =>
      (
        await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        )
      ).snapshot;
    const text = async () => {
      await page.waitForTimeout(120);
      return (await snapshot()).projects[0].documents[0].text;
    };
    const currentLine = async () => (await text()).split(/\r?\n/).at(-1);
    async function newLine() {
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Enter");
    }
    for (const [name, editor, list, info] of [
      [
        "純文字",
        ".monaco-editor",
        ".suggest-widget.visible",
        ".source-completion-info:not([hidden])",
      ],
      [
        "閱讀編輯",
        ".reading-editor .cm-content",
        ".spindle-completions",
        ".cm-completionInfo",
      ],
    ]) {
      await mode(name);
      await page.locator(editor).click();
      await newLine();
      await page.keyboard.type("<<", { delay: 90 });
      await page.locator(list).waitFor();
      assert.equal(await currentLine(), "<<>>", name + " pairing");
      await page.keyboard.type("fade", { delay: 80 });
      await page.locator(info).waitFor();
      assert.match(await page.locator(info).innerText(), /指定秒數/);
      await shot(
        name === "純文字" ? "01-source-completion" : "03-reading-completion",
      );
      await page.keyboard.press("Enter");
      await page.keyboard.type(" ");
      await page.locator(".command-parameter-popup").waitFor();
      assert.match(
        await page.locator(".command-tip-slot.is-active").innerText(),
        /秒數/,
      );
      assert.equal(await page.locator(list).count(), 0);
      await shot(
        name === "純文字" ? "02-source-parameter" : "04-reading-parameter",
      );
      await page.keyboard.type("1.5>>", { delay: 60 });
      assert.equal(await currentLine(), "<<fade_in 1.5>>", name + " closing");
      await page.keyboard.press("Escape");
      if (name === "閱讀編輯") {
        const active = page
          .locator(".reading-source")
          .filter({ hasText: "<<fade_in 1.5>>" });
        assert.equal(
          await active.locator(".reading-function,.reading-variable").count(),
          0,
        );
        assert.equal(await active.locator(".yarn-source-function").count(), 2);
      }
      await newLine();
      await page.keyboard.type("<<", { delay: 70 });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
      assert.equal(await currentLine(), "", name + " empty pair deletion");
      await app.evaluate(({ clipboard }) => clipboard.writeText("<<"));
      await page.keyboard.press("Control+v");
      assert.equal(await currentLine(), "<<", name + " paste unchanged");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(150);
      assert.equal(await currentLine(), "", name + " undo");
      results[name] = true;
    }
    // Two-argument hints ignore quoted spaces; Escape dismisses until next edit.
    await page.keyboard.type('<<play_sound "wind ', { delay: 55 });
    assert.match(
      await page.locator(".command-tip-slot.is-active").innerText(),
      /clip/,
    );
    await page.keyboard.type('sea" ', { delay: 55 });
    assert.match(
      await page.locator(".command-tip-slot.is-active").innerText(),
      /volume/,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".command-parameter-popup").count(), 0);
    await page.keyboard.type("0.6>>", { delay: 50 });
    const before = await text();
    await mode("純文字");
    await mode("閱讀編輯");
    assert.equal(await text(), before);
    results.parameterAndModes = true;
    await page.locator(".reading-editor .cm-content").click();
    await newLine();
    await page.keyboard.type("<<fade_in ", { delay: 55 });
    await page.locator(".command-parameter-popup").waitFor();
    await page.getByRole("button", { name: "結構檢查", exact: true }).click();
    const backgroundDoc = (await snapshot()).projects[0].documents[0];
    await page.evaluate(
      (d) =>
        window.yarnDesktop.request({
          type: "transaction",
          projectId: "design-test",
          label: "background sync",
          documents: [
            {
              id: d.id,
              version: d.version,
              edits: [
                {
                  from: d.text.length,
                  to: d.text.length,
                  insert: "\n// background",
                },
              ],
            },
          ],
        }),
      backgroundDoc,
    );
    await page.waitForTimeout(180);
    assert.equal(await page.locator(".command-parameter-popup").count(), 0);
    await page.getByRole("button", { name: "結構檢查", exact: true }).click();
    results.blurSync = true;

    await mode("流程圖");
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    await page.locator(".graph-scene-editor .cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("<<", { delay: 80 });
    await page.locator(".spindle-completions").waitFor();
    await page.keyboard.type("fade", { delay: 65 });
    await page.locator(".cm-completionInfo").waitFor();
    await page.keyboard.press("Tab");
    await page.keyboard.type(" ");
    await page.locator(".command-parameter-popup").waitFor();
    assert.match(
      await page.locator(".command-tip-slot.is-active").innerText(),
      /秒數/,
    );
    await shot("05-graph-parameter");
    await page.keyboard.type("2>>", { delay: 60 });
    await page
      .getByRole("button", { name: "結束節點編輯", exact: true })
      .click();
    assert((await text()).includes("<<fade_in 2>>"));
    results.graph = true;
    await mode("純文字");
    // Geometry uses real diagnostic data, including 3-digit counts.
    results.badgeCounts = [];
    for (const count of [1, 12, 123]) {
      const snap = await snapshot(),
        d = snap.projects[0].documents[0];
      const value =
        "title: Start\n---\n" +
        Array.from(
          { length: count },
          (_, i) => "<<jump Missing" + i + ">>",
        ).join("\n") +
        "\n===";
      await page.evaluate(
        ({ id, version, value, length }) =>
          window.yarnDesktop.request({
            type: "transaction",
            projectId: "design-test",
            label: "test diagnostics",
            documents: [
              { id, version, edits: [{ from: 0, to: length, insert: value }] },
            ],
          }),
        { id: d.id, version: d.version, value, length: d.text.length },
      );
      await page.waitForTimeout(180);
      const button = page.getByRole("button", {
        name: "結構檢查",
        exact: true,
      });
      const bounds = await button.evaluate((el) => {
        const p = el.getBoundingClientRect();
        return [...el.children].every((c) => {
          const r = c.getBoundingClientRect();
          return r.left >= p.left && r.right <= p.right;
        });
      });
      assert(bounds, "badge stays inside for " + count);
      results.badgeCounts.push(Number(await button.locator("b").innerText()));
    }

    await win.evaluate((w) => w.setContentSize(800, 960));
    await page.waitForTimeout(150);
    const narrow = await page
      .getByRole("button", { name: "結構檢查", exact: true })
      .evaluate((el) => {
        const p = el.getBoundingClientRect();
        return [...el.children].every(
          (c) => c.getBoundingClientRect().right <= p.right,
        );
      });
    assert(narrow);

    results.narrow = true;
    await page
      .getByRole("button", { name: "切換劇本側欄", exact: true })
      .click();
    await page.locator(".monaco-editor").click();
    await newLine();
    await page.keyboard.type("<<fade", { delay: 65 });
    await page.locator(".source-completion-info:not([hidden])").waitFor();
    const panel = await page.locator(".source-completion-info").boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= 800);
    assert(panel.y >= 0 && panel.y + panel.height <= 960);
    await shot("06-narrow-completion");
    await mode("閱讀編輯");
    await page.locator(".reading-editor .cm-content").click();
    await newLine();
    await page.keyboard.type("<<fade", { delay: 65 });
    await page.locator(".cm-completionInfo").waitFor();
    const cmPanel = await page.locator(".cm-completionInfo").boundingBox();
    assert(
      cmPanel.x >= 0 &&
        cmPanel.x + cmPanel.width <= 800 &&
        cmPanel.y >= 0 &&
        cmPanel.y + cmPanel.height <= 960,
      JSON.stringify(cmPanel),
    );
    results.narrowGeometry = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".reading-editor .cm-content,.reading-editor .cm-scroller,.reading-source,.spindle-completions",
        ),
      ].map((el) => ({
        class: el.className,
        text: el.textContent.slice(-50),
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        scroll: el.scrollLeft,
        scrollY: el.scrollTop,
      })),
    );
    await shot("07-narrow-reading-completion");
    results.passed = true;
    assert.equal(errors.length, 0, errors.join("\n"));
  } catch (e) {
    results.error = e.stack;
    process.exitCode = 1;
    console.error(e);
    if (page) await shot("failure").catch(() => {});
  } finally {
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(results);
    await app
      ?.evaluate(({ app, clipboard }) => {
        if (global.__clipboardFormats) {
          clipboard.clear();
          for (const [format, buffer] of global.__clipboardFormats)
            clipboard.writeBuffer(format, buffer);
        }
        app.exit(0);
      })
      .catch(() => {});
  }
})();
