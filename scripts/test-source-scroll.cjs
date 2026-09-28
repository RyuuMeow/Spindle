const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/source-scroll/" + Date.now()),
  project = path.join(out, "project"),
  profile = path.join(out, "profile");
fs.mkdirSync(project, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [],
    preferences: { language: "en", autoCheckUpdates: false },
  }),
);
fs.writeFileSync(
  path.join(project, "Large.yarn"),
  "title: Start\n---\n<<declare $score = 0>>\n" +
    Array.from(
      { length: 2000 },
      (_, i) => `Mira: Line ${i} has {$score} points.`,
    ).join("\n") +
    "\n===",
);
(async () => {
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: ["dist-desktop/app/desktop/main.cjs", "--user-data-dir=" + profile],
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, project);
    await page
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    await page.getByRole("button", { name: "Large.yarn", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    await page.waitForTimeout(1200);
    const result = await page.evaluate(async () => {
      const m = await new Promise((r) =>
        window.require(["vs/editor/editor.main"], r),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent),
        model = e.getModel();
      e.setPosition({ lineNumber: 3, column: 15 });
      await new Promise((r) => setTimeout(r, 200));
      let reads = 0,
        changes = 0;
      const get = model.getValue.bind(model);
      model.getValue = (...args) => {
        reads++;
        return get(...args);
      };
      const sheet = e.getDomNode().querySelector("style");
      const observer = new MutationObserver((r) => (changes += r.length));
      if (sheet) observer.observe(sheet, { childList: true, subtree: true });
      const times = [];
      for (let i = 0; i < 60; i++) {
        const t = performance.now();
        e.setScrollTop((i + 1) * 20);
        await new Promise(requestAnimationFrame);
        times.push(performance.now() - t);
      }
      observer.disconnect();
      model.getValue = get;
      return {
        reads,
        highlightStyleMutations: changes,
        elapsedMs: times.reduce((a, b) => a + b, 0),
        maxFrameMs: Math.max(...times),
        scrollTop: e.getScrollTop(),
      };
    });
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify({ out, ...result }));
    if (!process.argv.includes("--measure-only")) {
      assert.equal(
        result.highlightStyleMutations,
        0,
        "Scrolling must not rewrite highlight styles",
      );
      assert.ok(
        result.reads < 10,
        "Scrolling must not rescan full document every frame",
      );
    }
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
