const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  );
}
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/workspace-integration",
);
fs.mkdirSync(out, { recursive: true });
const root = path.join(out, "project-" + Date.now()),
  profile = path.join(out, "profile-" + Date.now());
fs.mkdirSync(path.join(root, "sub"), { recursive: true });
const source =
  "title: Departure\r\ntags: story checkpoint\r\n---\r\nNarrator: 雨停了。\r\n<<if $has_key>>\r\n    Mira: 鑰匙帶著嗎？\r\n    -> 現在出發\r\n        <<jump Lighthouse>>\r\n    -> 再準備一下\r\n        Mira: 我在這裡等你。\r\n<<else>>\r\n    Mira: 等等，你還沒有鑰匙。\r\n<<endif>>\r\n===\r\n";
const file = path.join(root, "story.yarn");
fs.writeFileSync(file, source);
fs.writeFileSync(
  path.join(root, "sub", "story.yarn"),
  "title: Lighthouse\n---\nMira: 抵達燈塔。\n===\n",
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(80);
  }
  throw Error(message);
}
let app;
const results = {},
  errors = [];
async function launch() {
  const launchElectron =
    process.env.DESKTOP_PORTABLE_TEST === "1"
      ? (options) =>
          require("./portable-test-driver.cjs").launch(playwright, options)
      : (options) => playwright._electron.launch(options);
  app = await launchElectron({
    executablePath:
      process.env.DESKTOP_EXECUTABLE ||
      path.resolve("node_modules/electron/dist/electron.exe"),
    args: [
      ...(process.env.DESKTOP_EXECUTABLE
        ? []
        : [path.resolve("dist-desktop/app/desktop/main.cjs")]),
      `--user-data-dir=${profile}`,
      "--force-device-scale-factor=1",
    ],
    timeout: 60000,
  });
  app.on("window", (page) =>
    page.on("pageerror", (e) => errors.push(e.message)),
  );
  const page = await app.firstWindow();
  const nativeWindow = await app.browserWindow(page);
  await nativeWindow.evaluate((w) => {
    w.show();
    w.focus();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page
    .getByRole("button", { name: "切換劇本側欄", exact: true })
    .waitFor();
  return page;
}
const snapshot = (page) =>
  page.evaluate(() => window.yarnDesktop.request({ type: "snapshot" }));
async function current(page) {
  const r = await snapshot(page);
  return r.snapshot.projects.find((p) => p.root === root);
}
async function chooseMode(page, name) {
  const labels = { 渲染: "閱讀編輯", 流程: "流程圖" };
  await page
    .getByRole("radio", { name: labels[name] || name, exact: true })
    .click();
  await page
    .locator(
      name === "渲染"
        ? ".cm-content"
        : name === "純文字"
          ? ".monaco-editor .view-lines"
          : ".story-canvas",
    )
    .waitFor();
}
(async () => {
  try {
    const page = await launch();
    if (process.env.DESKTOP_EXECUTABLE)
      assert.equal(
        await page.evaluate(() => window.yarnDesktop.version),
        require("../package.json").version,
      );
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, root);
    await page
      .getByRole("button", { name: "The Last Light", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "開啟專案資料夾…", exact: true })
      .click();
    await page.locator(".monaco-editor .view-lines").waitFor();
    await until(async () => !!(await current(page)), "folder did not open");
    assert.equal((await current(page)).documents.length, 2);
    const tabBox = await page.locator(".tab-shell").first().boundingBox(),
      plusBox = await page
        .getByRole("button", { name: "新增分頁", exact: true })
        .boundingBox();
    assert(
      plusBox.x - tabBox.x - tabBox.width >= 0 &&
        plusBox.x - tabBox.x - tabBox.width <= 12,
    );
    assert.equal(await page.evaluate(() => typeof window.process), "undefined");
    results.titlebarRegression = true;
    results.sameBasenames = true;
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("// source autosave 中文");
    await until(
      () => fs.readFileSync(file, "utf8").includes("// source autosave 中文"),
      "source autosave failed",
    );
    assert(fs.readFileSync(file, "utf8").includes("\r\n"));
    results.sourceAutosave = true;
    const before = fs.readFileSync(file, "utf8");
    await chooseMode(page, "渲染");
    await page.locator(".reading-tag").first().waitFor();
    assert.equal(await page.locator(".reading-tag").count(), 2);
    assert((await page.locator(".reading-variable").count()) > 0);
    await page.screenshot({ path: path.join(out, "01-rendered.png") });
    await chooseMode(page, "純文字");
    await sleep(1000);
    assert.equal(fs.readFileSync(file, "utf8"), before);
    results.modeRoundtrip = true;
    await chooseMode(page, "渲染");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n// rendered autosave");
    await until(
      () => fs.readFileSync(file, "utf8").includes("// rendered autosave"),
      "rendered autosave failed",
    );
    await page.keyboard.press("Control+z");
    await until(
      () => fs.readFileSync(file, "utf8") === before,
      "render undo failed",
    );
    results.renderedEditing = true;
    await chooseMode(page, "純文字");
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+y");
    await until(
      () => fs.readFileSync(file, "utf8").includes("// rendered autosave"),
      "cross-mode redo failed",
    );
    results.sharedHistory = true;
    const contractText = fs.readFileSync(file, "utf8");
    await chooseMode(page, "渲染");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      contractText,
    );
    assert.equal(await page.locator(".reading-tag").count(), 0);
    await app.evaluate(({ clipboard }) =>
      clipboard.write({
        text: "title: Replacement\n---\n中文跨區塊貼上\n===",
        html: "<b>styled</b>",
      }),
    );
    await page.keyboard.press("Control+v");
    await until(
      () => fs.readFileSync(file, "utf8").includes("中文跨區塊貼上"),
      "cross-block paste failed",
    );
    assert(!fs.readFileSync(file, "utf8").includes("<b>"));
    await page.keyboard.press("Control+z");
    await until(
      () => fs.readFileSync(file, "utf8") === contractText,
      "cross-block undo failed",
    );
    results.rawCopyAndPlainPaste = true;
    await chooseMode(page, "純文字");
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Control+t");
      await page
        .getByRole("combobox", { name: "搜尋劇本", exact: true })
        .fill("story.yarn");
      await page.keyboard.press("Enter");
    }
    assert.equal(await page.locator(".tab-shell").count(), 10);
    const activeTab = page.locator(".tab-shell.active [role=tab]"),
      activeKey = await activeTab.getAttribute("id");
    await activeTab.focus();
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    assert.equal(
      await page
        .locator(".tab-shell")
        .nth(8)
        .locator("[role=tab]")
        .getAttribute("id"),
      activeKey,
    );
    await page.locator(".tab-shell.active").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "關閉其他分頁", exact: true })
      .click();
    await until(
      async () => (await page.locator(".tab-shell").count()) === 1,
      "batch close failed",
    );
    results.manyTabsAndKeyboardSort = true;
    await page.keyboard.press("Control+p");
    await page
      .getByRole("combobox", { name: "搜尋劇本", exact: true })
      .fill("sub/story");
    await page.keyboard.press("Control+Enter");
    await page.locator(".tab-shell").nth(1).waitFor();
    await page.keyboard.press("Control+w");
    await until(
      async () => (await page.locator(".tab-shell").count()) === 1,
      "close shortcut failed",
    );
    await page.keyboard.press("Control+Shift+t");
    await until(
      async () => (await page.locator(".tab-shell").count()) === 2,
      "reopen shortcut failed",
    );
    results.tabShortcuts = true;
    await page.keyboard.press("Control+Shift+f");
    await page
      .getByRole("combobox", { name: "搜尋全專案文字", exact: true })
      .fill("鑰匙");
    await page.locator(".search-overlay-results [role=option]").first().click();
    await page.locator(".monaco-editor .view-lines").waitFor();
    results.projectSearch = true;
    await page.locator(".tab-shell.active").click({ button: "right" });
    const secondPromise = app.waitForEvent("window");
    await page
      .getByRole("menuitem", { name: "移至新視窗", exact: true })
      .click();
    const second = await secondPromise;
    second.setDefaultTimeout(15000);
    await second.locator(".monaco-editor .view-lines").waitFor();
    await page
      .getByRole("button", { name: "story.yarn", exact: true })
      .filter({ has: page.locator("svg") })
      .evaluateAll(
        (buttons, file) => buttons.find((b) => b.title === file).click(),
        file,
      );
    await page.locator(".monaco-editor .view-lines").waitFor();
    await second.locator(".monaco-editor").click();
    await second.keyboard.press("Control+End");
    await second.keyboard.insertText("\r\n// second window");
    await until(
      () => fs.readFileSync(file, "utf8").includes("// second window"),
      "second window autosave failed",
    );
    await until(
      async () =>
        await page
          .locator(".monaco-editor .view-lines")
          .innerText()
          .then((t) => t.replace(/\s/g, " ").includes("second window")),
      "peer editor not updated",
    );
    results.multiWindowSync = true;
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+z");
    await until(
      () => !fs.readFileSync(file, "utf8").includes("// second window"),
      "cross-window undo failed",
    );
    await second.locator(".monaco-editor").click();
    await second.keyboard.press("Control+y");
    await until(
      () => fs.readFileSync(file, "utf8").includes("// second window"),
      "cross-window redo failed",
    );
    results.crossWindowHistory = true;
    await second.locator(".monaco-editor").click();
    await second.keyboard.press("Control+End");
    await second.keyboard.insertText("\n// local conflict");
    fs.writeFileSync(file, source + "// external change");
    await until(
      async () =>
        (await current(second)).documents.find((d) => d.name === "story.yarn")
          .status === "conflict",
      "external conflict was not detected",
    );
    assert(fs.readFileSync(file, "utf8").endsWith("// external change"));
    await second.getByRole("button", { name: "處理", exact: true }).click();
    await second
      .getByRole("button", { name: "以目前版本覆寫", exact: true })
      .click();
    await until(
      () => fs.readFileSync(file, "utf8").includes("// local conflict"),
      "conflict resolution failed",
    );
    results.conflictProtection = true;
    await chooseMode(second, "流程");
    await second.locator(".flow-card").first().waitFor();
    const card = second
        .locator(".react-flow__node")
        .filter({ hasText: "Departure" })
        .first(),
      originalTransform = await card.getAttribute("style"),
      box = await card.boundingBox();
    await second.mouse.move(box.x + 70, box.y + 40);
    await second.mouse.down();
    await second.mouse.move(box.x + 120, box.y + 95, { steps: 8 });
    await second.mouse.up();
    await until(
      async () => (await card.getAttribute("style")) !== originalTransform,
      "graph drag failed",
    );
    await second.getByRole("button", { name: "復原布局", exact: true }).click();
    await until(
      async () => (await card.getAttribute("style")) === originalTransform,
      "graph drag undo failed",
    );
    await second.getByRole("button", { name: "重做布局", exact: true }).click();
    results.graphDragHistory = true;
    await second.screenshot({ path: path.join(out, "02-graph.png") });
    const nativeWindow = await app.browserWindow(second);
    await nativeWindow.evaluate((w) => w.setContentSize(800, 650));
    await chooseMode(second, "渲染");
    await second.screenshot({ path: path.join(out, "03-narrow.png") });
    results.narrowWidth = true;
    const projectName = path.basename(root);
    await second
      .getByRole("button", { name: projectName, exact: true })
      .click();
    await second
      .getByRole("menuitem", { name: "自訂指令", exact: true })
      .click();
    await second
      .getByRole("textbox", { name: "變數名稱", exact: true })
      .fill("bad name");
    await until(
      async () =>
        !!(await current(second)).commandDraft?.draft?.name.includes("bad"),
      "command draft not persisted",
    );
    results.invalidDraftRecoverySaved = true;
    await until(async () => {
      const s = await second.evaluate(() => window.yarnDesktop.session.load());
      return s.tabs.some((t) => t.documentId === "@commands");
    }, "command tool tab must persist");
    await app.evaluate(({ app }) => app.exit(0));
    const restored = await launch();
    await until(
      async () =>
        (await current(restored)).documents.some((d) =>
          d.text.includes("second window"),
        ),
      "restart lost document",
    );
    await restored
      .getByRole("button", { name: projectName, exact: true })
      .click();
    await restored
      .getByRole("menuitem", { name: "自訂指令 · 有草稿", exact: true })
      .click();
    assert.equal(
      await restored
        .getByRole("textbox", { name: "變數名稱", exact: true })
        .inputValue(),
      "bad name",
    );
    results.restartRecovery = true;
    await app.evaluate(({ app }) => app.exit(0));
    fs.writeFileSync(
      path.join(profile, "windows-v2.json"),
      JSON.stringify({
        bad: {
          bounds: { x: "broken", y: 0, width: 800, height: 600 },
          session: { projectId: "bad", tabs: [], closedTabs: [] },
        },
      }),
    );
    const repaired = await launch();
    assert(
      (await current(repaired)).documents.some((d) =>
        d.text.includes("second window"),
      ),
    );
    assert(
      fs
        .readdirSync(profile)
        .some((name) => name.startsWith("windows-v2.json.damaged-")),
    );
    results.corruptLayoutRecovery = true;
    assert.equal(errors.length, 0, errors.join("\n"));
    results.passed = true;
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ ...results, errors }, null, 2),
    );
    console.log(JSON.stringify(results));
  } catch (error) {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        { ...results, passed: false, error: error.stack, errors },
        null,
        2,
      ),
    );
    for (const [index, p] of (app?.windows() || []).entries())
      await p
        .screenshot({ path: path.join(out, `failure-${index}.png`) })
        .catch(() => {});
    throw error;
  } finally {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
