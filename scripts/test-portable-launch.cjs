const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { launch } = require("./portable-test-driver.cjs");
const playwright = require(
  process.env.PLAYWRIGHT_MODULE ||
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const version = require("../package.json").version;
const executablePath = path.resolve(
  `release/Yarn-Workbench-${version}-Portable-x64.exe`,
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/portable-startup-regression",
);
fs.mkdirSync(out, { recursive: true });
const profile = path.join(out, "profile-" + Date.now()),
  otherProfile = profile + "-other";
const results = { version };
let first, second;
const open = (profile) =>
  launch(playwright, {
    executablePath,
    args: ["--user-data-dir=" + profile],
    timeout: 60000,
  });
(async () => {
  try {
    const started = Date.now();
    first = await open(profile);
    const page = await first.firstWindow();
    await page
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .waitFor({ timeout: 30000 });
    // DOM availability can precede Electron's ready-to-show by one paint.
    // Observe the real native state without forcing the window to show.
    const visibleDeadline = Date.now() + 10000;
    let visible = false;
    while (Date.now() < visibleDeadline) {
      visible = await first.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      );
      if (visible) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(visible, "Startup window was not shown");
    results.workspaceReadyMs = Date.now() - started;
    await page.bringToFront();
    await (await first.browserWindow(page)).evaluate((w) => w.focus());
    await page
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .click();
    await page
      .locator(".monaco-editor .view-lines")
      .waitFor({ timeout: 30000 });
    results.editorReadyMs = Date.now() - started;
    const initial = await first.evaluate(({ app, BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        version: app.getVersion(),
        executable: process.execPath,
        visible: w.isVisible(),
        scale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
      };
    });
    assert.equal(initial.version, version);
    assert(initial.visible);
    results.initial = initial;
    second = await open(otherProfile);
    const secondPage = await second.firstWindow();
    await secondPage.getByRole("button", {name:"Chapter_01.yarn",exact:true}).waitFor({timeout:30000});
    const secondDeadline = Date.now() + 10000;
    let secondVisible = false;
    while (Date.now() < secondDeadline) {
      secondVisible = await second.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible());
      if (secondVisible) break;
      await new Promise(resolve => setTimeout(resolve,100));
    }
    assert(secondVisible, "Second isolated startup window was not shown");
    await secondPage.bringToFront();
    await (await second.browserWindow(secondPage)).evaluate((w) => w.focus());
    await (
      await second.firstWindow()
    )
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .click();
    await (
      await second.firstWindow()
    )
      .locator(".monaco-editor .view-lines")
      .waitFor({ timeout: 30000 });
    const otherPath = await second.evaluate(() => process.execPath);
    assert.notEqual(path.dirname(initial.executable), path.dirname(otherPath));
    results.uniqueExtractionDirectories = true;
    await second.evaluate(({ app }) => app.exit(0));
    second = null;
    await page.bringToFront();
    await (await first.browserWindow(page)).evaluate((w) => w.focus());
    await page.reload();
    await page
      .locator(".monaco-editor .view-lines")
      .waitFor({ timeout: 30000 });
    results.otherInstanceExitPreservesResources = true;
    await first.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].minimize(),
    );
    const duplicate = spawn(executablePath, ["--user-data-dir=" + profile], {
      windowsHide: true,
      stdio: "ignore",
    });
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Second launch did not finish")),
        30000,
      );
      duplicate.once("error", reject);
      duplicate.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.equal(exitCode, 0);
    assert(
      await first.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (w) => w.isVisible() && !w.isMinimized(),
        ),
      ),
    );
    results.repeatLaunchRestoresWindow = true;
    await page.reload();
    await page
      .locator(".monaco-editor .view-lines")
      .waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(out, "native-dpi.png") });
    results.passed = true;
    console.log(JSON.stringify(results));
  } catch (error) {
    results.passed = false;
    results.error = error.stack;
    for (const [index, page] of [...(first?.windows() || []), ...(second?.windows() || [])].entries())
      await page
        .screenshot({ path: path.join(out, `failure-${index}.png`) })
        .catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    await second?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await first?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
