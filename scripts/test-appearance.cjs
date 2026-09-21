const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const { _electron } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/appearance/run-" + Date.now()),
  root = path.join(base, "Project");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "sample.yarn"),
  "title: Start\n---\nMira: Hello Lighthouse\n-> Travel to the Lighthouse\n  <<jump End>>\n===\ntitle: End\n---\nMira: Lighthouse\n===\n",
);
(async () => {
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [
        "dist-desktop/app/desktop/main.cjs",
        "--user-data-dir=" + path.join(base, "profile"),
      ],
    });
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, root);
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .click();
    await page
      .getByRole("button", { name: "sample.yarn", exact: true })
      .click();
    const menu = async (name) => {
      await page.getByRole("button", { name: "Project", exact: true }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    const tab = (name) =>
      page.getByRole("tab", { name: new RegExp("：" + name + "$") });
    const native = await app.browserWindow(page);
    await native.evaluate((w) => w.setContentSize(1440, 1000));
    const patch = async (patch) =>
      page.evaluate(
        (patch) => window.yarnDesktop.request({ type: "appearance", patch }),
        patch,
      );
    const snap = async () =>
      (
        await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        )
      ).snapshot;
    await page.locator(".monaco-editor .view-lines").waitFor();
    const originalText = (await snap()).projects[0].documents[0].text;
    await page.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("probe");
    await page
      .locator(".monaco-editor .view-lines")
      .evaluate((e) => (e.dataset.retained = "source"));
    await patch({
      global: { fontSize: 20, lineHeight: 2, foreground: "#abcdef" },
    });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".monaco-editor .view-lines"))
          .fontSize === "20px",
    );
    assert.equal(
      await page
        .locator(".monaco-editor .view-lines")
        .getAttribute("data-retained"),
      "source",
    );
    await page.keyboard.press("Control+z");
    for (
      let n = 0;
      n < 30 && (await snap()).projects[0].documents[0].text !== originalText;
      n++
    )
      await page.waitForTimeout(100);
    assert.equal(
      (await snap()).projects[0].documents[0].text,
      originalText,
      "style updates retain undo",
    );
    // Selection matching, symbol references and Find must be mutually exclusive.
    const setSourceSelection = async (word, selected) =>
      page.evaluate(
        async ({ word, selected }) => {
          const m = await new Promise((resolve) =>
            window.require(["vs/editor/editor.main"], resolve),
          );
          const editor = m.editor
            .getEditors()
            .find((e) => e.getDomNode()?.offsetParent);
          const model = editor.getModel(),
            offset = model.getValue().indexOf(word),
            start = model.getPositionAt(offset),
            end = model.getPositionAt(offset + (selected ? word.length : 1));
          editor.setSelection({
            startLineNumber: end.lineNumber,
            startColumn: selected ? start.column : end.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          });
          editor.focus();
        },
        { word, selected },
      );
    await setSourceSelection("Lighthouse", true);
    await page.locator(".spindle-selection-match").first().waitFor();
    assert.equal(await page.locator(".spindle-symbol-match").count(), 0);
    await page.keyboard.press("Control+f");
    await page.waitForFunction(
      () => !document.querySelector(".spindle-selection-match"),
    );
    await page.keyboard.press("Escape");
    await setSourceSelection("Start", false);
    await page.locator(".spindle-symbol-match").first().waitFor();
    assert.equal(await page.locator(".spindle-selection-match").count(), 0);
    await setSourceSelection("Lighthouse", false);
    await page.waitForFunction(
      () =>
        !document.querySelector(
          ".spindle-symbol-match, .spindle-selection-match",
        ),
    );
    const fonts = await page.evaluate(() => window.yarnDesktop.fonts());
    assert(fonts.includes("Consolas"), JSON.stringify(fonts));
    await menu("設定…");
    const global = page.locator(".appearance-global");
    const opacity = global.getByRole("slider", {
      name: "文字選取底色不透明度",
      exact: true,
    });
    await opacity.focus();
    await opacity.press("Home");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="文字選取底色不透明度"]')
          ?.value === "0",
    );
    assert.equal(
      (await snap()).preferences.editorAppearance.global.selection.slice(7),
      "00",
    );
    await opacity.press("End");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="文字選取底色不透明度"]')
          ?.value === "100",
    );
    const percent = global.getByRole("spinbutton", {
      name: "文字選取底色不透明度百分比",
      exact: true,
    });
    await percent.fill("50");
    await percent.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="文字選取底色不透明度"]')
          ?.value === "50",
    );
    assert.equal(
      (await snap()).preferences.editorAppearance.global.selection.slice(7),
      "80",
    );
    assert.equal(
      await global
        .getByRole("textbox", { name: "文字選取底色", exact: true })
        .inputValue(),
      "#464646",
    );
    const track = await opacity.locator("..").evaluate((e) => ({
      background: getComputedStyle(e).backgroundImage,
      paint: getComputedStyle(e.querySelector(".appearance-opacity-paint"))
        .backgroundImage,
    }));
    assert(track.background.includes("conic-gradient"));
    assert(track.paint.includes("linear-gradient"));
    assert(track.paint.includes("rgba(70, 70, 70, 0)"));
    const gradient = track.paint;
    await opacity.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(base, "opacity.png") });
    const trackBox = await opacity.locator("..").boundingBox();
    await page.mouse.move(
      trackBox.x + trackBox.width / 2,
      trackBox.y + trackBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(trackBox.x, trackBox.y + trackBox.height / 2);
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="文字選取底色不透明度"]')
          ?.value === "0",
    );
    await page.mouse.move(trackBox.x, trackBox.y + trackBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      trackBox.x + trackBox.width,
      trackBox.y + trackBox.height / 2,
    );
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="文字選取底色不透明度"]')
          ?.value === "100",
    );
    assert.equal(
      await opacity
        .locator("..")
        .evaluate(
          (e) =>
            getComputedStyle(e.querySelector(".appearance-opacity-paint"))
              .backgroundImage,
        ),
      gradient,
      "track gradient stays fixed when opacity changes",
    );
    await percent.fill("100");
    await percent.press("Enter");
    const size = global.getByRole("spinbutton", {
      name: "文字大小",
      exact: true,
    });
    await size.fill("23");
    await size.press("Enter");
    for (
      let n = 0;
      n < 30 &&
      (await snap()).preferences.editorAppearance.global.fontSize !== 23;
      n++
    )
      await page.waitForTimeout(100);
    assert.equal(
      (await snap()).preferences.editorAppearance.global.fontSize,
      23,
    );
    // Invalid edits survive switching categories and tabs, without persisting.
    await size.fill("99");
    await size.press("Enter");
    await global.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "快捷鍵", exact: true }).click();
    await page.getByRole("button", { name: "編輯器風格", exact: true }).click();
    assert.equal(await size.inputValue(), "99");
    await tab("sample.yarn").click();
    await tab("設定").click();
    assert.equal(await size.inputValue(), "99");
    assert.equal(
      (await snap()).preferences.editorAppearance.global.fontSize,
      23,
    );
    await size.press("Escape");
    await global.locator("summary").click();
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    const rendered = page.getByRole("region", {
      name: "閱讀編輯風格",
      exact: true,
    });
    await rendered
      .getByRole("combobox", { name: "文字大小來源", exact: true })
      .click();
    await page.getByRole("option", { name: "自訂", exact: true }).click();
    await rendered
      .getByRole("spinbutton", { name: "文字大小", exact: true })
      .fill("25");
    await rendered
      .getByRole("spinbutton", { name: "文字大小", exact: true })
      .press("Enter");
    await page.screenshot({ path: path.join(base, "settings.png") });
    await tab("sample.yarn").click();
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    await page.locator(".reading-editor .cm-content").waitFor();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".reading-editor .cm-scroller"))
          .fontSize === "25px",
    );
    await page
      .locator(".reading-editor .cm-content")
      .evaluate((e) => (e.dataset.retained = "rendered"));
    await patch({
      modes: { rendered: { fontSize: 21, selection: "#aa4455" } },
    });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".reading-editor .cm-scroller"))
          .fontSize === "21px",
    );
    assert.equal(
      await page
        .locator(".reading-editor .cm-content")
        .getAttribute("data-retained"),
      "rendered",
    );
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page.locator(".flow-card").first().waitFor();
    await page.waitForTimeout(2200);
    const session = async () =>
      page.evaluate(() => window.yarnDesktop.session.load());
    const before = await session();
    const beforeGraph = before.tabs.find(
      (t) => t.documentId !== "@settings",
    ).graph;
    await patch({ modes: { graph: { fontSize: 22, lineHeight: 2 } } });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".flow-card")).fontSize ===
        "22px",
    );
    await page.waitForTimeout(1800);
    const after = await session();
    const afterGraph = after.tabs.find(
      (t) => t.documentId !== "@settings",
    ).graph;
    assert.ok(beforeGraph?.layout?.initialized);
    assert.deepEqual(afterGraph.layout.positions, beforeGraph.layout.positions);
    await page.screenshot({ path: path.join(base, "graph.png") });
    assert.equal(
      (await snap()).projects[0].documents[0].text,
      fs.readFileSync(path.join(root, "sample.yarn"), "utf8"),
    );
    await page.locator(".flow-card").first().dblclick();
    await page.locator(".graph-scene-editor .cm-content").waitFor();
    await page
      .locator(".graph-scene-editor .cm-content")
      .evaluate((e) => (e.dataset.retained = "graph-editor"));
    await patch({ modes: { graph: { fontSize: 24 } } });
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector(".graph-scene-editor .cm-scroller"),
        ).fontSize === "24px",
    );
    assert.equal(
      await page
        .locator(".graph-scene-editor .cm-content")
        .getAttribute("data-retained"),
      "graph-editor",
    );
    await page.getByRole("button", { name: "純閱讀", exact: true }).click();
    await page.locator(".dialogue-reader").waitFor();
    await patch({ modes: { reader: { fontSize: 17, lineHeight: 2.4 } } });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".dialogue-reader"))
          .fontSize === "17px",
    );
    assert.equal(
      await page
        .locator(".dialogue-reader")
        .evaluate((e) => getComputedStyle(e).lineHeight),
      "40.8px",
    );
    // Moving a document tab creates another managed window; both share app preferences.
    const nextWindow = app.waitForEvent("window");
    await page.evaluate(async () => {
      const s = await window.yarnDesktop.session.load();
      const tab = s.tabs.find((t) => t.documentId !== "@settings");
      await window.yarnDesktop.windows.move(tab, s.projectId);
    });
    const second = await nextWindow;
    second.on("pageerror", (e) => errors.push(e.message));
    await second.getByRole("radio", { name: "純文字", exact: true }).click();
    await second.locator(".monaco-editor .view-lines").waitFor();
    await patch({ global: { fontSize: 27 } });
    await second.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".monaco-editor .view-lines"))
          .fontSize === "27px",
    );
    await Promise.all([
      patch({ global: { foreground: "#cdddee" } }),
      second.evaluate(() =>
        window.yarnDesktop.request({
          type: "appearance",
          patch: { modes: { reader: { lineHeight: 2.2 } } },
        }),
      ),
    ]);
    const current = (await snap()).preferences.editorAppearance;
    assert.equal(current.global.foreground, "#cdddee");
    assert.equal(current.modes.reader.lineHeight, 2.2);
    assert.deepEqual(errors, []);
    console.log(
      "PASS appearance UI: fonts, validation, inheritance, tab state, live source/reading/graph updates",
    );
  } finally {
    await app?.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
