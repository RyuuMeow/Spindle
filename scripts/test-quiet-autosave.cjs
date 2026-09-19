const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/quiet-autosave",
);
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const root = fs.mkdtempSync(path.join(out, "project-"));
const file = path.join(root, "Story.yarn");
fs.writeFileSync(file, "title: Start\n---\nNarrator: Hello.\n===\n");
const results = {};
let app;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page
      .getByRole("button", { name: "切換劇本側欄", exact: true })
      .waitFor();
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
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
    await page
      .getByRole("button", { name: "Story.yarn", exact: true })
      .click({ button: "middle" });
    assert.equal(await page.locator(".tab-context").count(), 0);
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+End");
    await page.evaluate(() => {
      window.__widths = [];
      window.__watch = setInterval(
        () =>
          window.__widths.push(
            [...document.querySelectorAll(".tab-shell")].map(
              (e) => e.getBoundingClientRect().width,
            ),
          ),
        16,
      );
    });
    await page.keyboard.insertText("// quiet autosave");
    await sleep(1200);
    const widths = await page.evaluate(() => {
      clearInterval(window.__watch);
      return window.__widths;
    });
    assert(widths.length > 10);
    assert(
      widths.every((row) =>
        row.every((w, i) => Math.abs(w - widths[0][i]) < 0.1),
      ),
    );
    assert.equal(
      await page
        .locator(".dirty-dot, .save-status, .file-tree .save-spinner")
        .count(),
      0,
    );
    assert(fs.readFileSync(file, "utf8").includes("// quiet autosave"));
    results.quietStableTabs = true;
    await page.screenshot({ path: path.join(out, "01-quiet-editor.png") });
    // A clean close handshake stays visually silent.
    await win.evaluate((w) =>
      w.webContents.send("workspace:prepare-close", "test-clean"),
    );
    await page.locator(".close-save-overlay").waitFor();
    assert.equal(await page.locator(".close-save-panel").count(), 0);
    await win.evaluate((w) => w.webContents.send("workspace:close-cancelled"));
    await page.locator(".close-save-overlay").waitFor({ state: "detached" });
    results.cleanCloseSilent = true;
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+End");
    // A close request while edits are pending must present progress, then cancel safely.
    await page.keyboard.insertText("\n// progress");
    await win.evaluate((w) =>
      w.webContents.send("workspace:prepare-close", "test-progress"),
    );
    await page.locator(".close-save-panel").waitFor();
    await page.screenshot({ path: path.join(out, "02-close-saving.png") });
    await win.evaluate((w) => w.webContents.send("workspace:close-cancelled"));
    await page.locator(".close-save-overlay").waitFor({ state: "detached" });
    results.closeProgress = true;
    // Real OS close with conflicting disk content must keep this window alive.
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n// local conflict");
    fs.writeFileSync(file, "title: External\n---\nExternal change\n===\n");
    await app.evaluate(({ dialog }) => {
      global.__closeWarnings = [];
      dialog.showMessageBoxSync = (_w, options) => {
        global.__closeWarnings.push(options.message);
        return 0;
      };
      dialog.showMessageBox = async (_w, options) => {
        global.__closeWarnings.push(options.message);
        return { response: 0 };
      };
    });
    await win.evaluate((w) => w.close());
    for (let n = 0; n < 100; n++) {
      if (await app.evaluate(() => global.__closeWarnings.length)) break;
      await sleep(50);
    }
    assert((await app.evaluate(() => global.__closeWarnings.length)) > 0);
    assert(!page.isClosed());
    await page.locator(".close-save-overlay").waitFor({ state: "detached" });
    assert(fs.readFileSync(file, "utf8").includes("External change"));
    results.closeConflictPreservesWindow = true;
    // Resolve through the product action, then edit and immediately request native close.
    await page.evaluate(async () => {
      const r = await window.yarnDesktop.request({ type: "snapshot" });
      const p = r.snapshot.projects.find((p) => p.root);
      await window.yarnDesktop.request({
        type: "resolve",
        projectId: p.id,
        documentId: p.documents[0].id,
        choice: "local",
      });
    });
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n// final immediate close");
    const closed = page.waitForEvent("close");
    await win.evaluate((w) => w.close());
    await closed;
    assert(fs.readFileSync(file, "utf8").includes("// final immediate close"));
    results.immediateCloseWritesLastEdit = true;
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ ...results, passed: true }, null, 2),
    );
    console.log(results);
  } catch (e) {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ ...results, error: String(e) }, null, 2),
    );
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
  }
})();
