const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  pw = require("playwright");
const base = path.resolve("outputs/language-restart-" + Date.now()),
  profile = path.join(base, "profile"),
  root = path.join(base, "Story");
fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(root, "Story.yarn"),
  "title: Start\n---\nNarrator: Saved text\n===\n",
);
fs.writeFileSync(
  path.join(root, ".spindle/project.json"),
  JSON.stringify({
    id: "restart-story",
    name: "Restart story",
    commands: [],
    files: [{ id: "story", name: "Story.yarn" }],
    excluded: [],
  }),
);
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [
      {
        id: "restart-story",
        name: "Restart story",
        root,
        lastOpenedAt: 1,
        recent: true,
      },
    ],
    preferences: {
      language: "en",
      reopenLastProject: true,
      lastProjectId: "restart-story",
      autoCheckUpdates: false,
    },
  }),
);
(async () => {
  const app = await require("./portable-test-driver.cjs").launch(pw, {
    executablePath: path.resolve(
      process.env.SPINDLE_PORTABLE_PATH ||
        `release/Spindle-${require("../version.json").version}-Portable-x64.exe`,
    ),
    args: ["--user-data-dir=" + profile],
    env: process.env,
    logPath: path.join(base, "startup.log"),
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".monaco-editor");
  const args = await app.evaluate(() => process.argv),
    port = args
      .find((a) => a.startsWith("--remote-debugging-port="))
      .split("=")[1];
  const initial = await page.evaluate(() => window.yarnDesktop.session.load());
  await page.evaluate(() =>
    window.yarnDesktop.request({ type: "preferences", language: "zh-CN" }),
  );
  assert.equal(await page.evaluate(() => window.yarnDesktop.locale), "en");
  page.evaluate(() => window.yarnDesktop.restart()).catch(() => {});
  await page.waitForEvent("close", { timeout: 30000 });
  await app.disconnect();
  let browser, next;
  for (let i = 0; i < 120; i++) {
    try {
      browser = await pw.chromium.connectOverCDP("http://127.0.0.1:" + port, {
        timeout: 500,
      });
      next = browser.contexts()[0].pages()[0];
      await next.waitForSelector(".monaco-editor", { timeout: 1000 });
      if ((await next.evaluate(() => window.yarnDesktop.locale)) === "zh-CN")
        break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(next);
  assert.equal(await next.evaluate(() => window.yarnDesktop.locale), "zh-CN");
  const current = await next.evaluate(() => window.yarnDesktop.session.load());
  assert.equal(initial.projectId, "restart-story");
  assert.equal(current.projectId, initial.projectId);
  assert.deepEqual(
    current.tabs.map((t) => t.documentId),
    initial.tabs.map((t) => t.documentId),
  );
  assert.equal(current.activeId, initial.activeId);
  assert.equal(
    fs.readFileSync(path.join(root, "Story.yarn"), "utf8"),
    "title: Start\n---\nNarrator: Saved text\n===\n",
  );
  assert.ok(!fs.existsSync(path.join(profile, "restart-once-v1.json")));
  console.log(
    "PASS actual language relaunch, restored editor and preserved document",
  );
  console.log(base);
  await next.evaluate(() => window.close());
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
