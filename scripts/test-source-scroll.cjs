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
fs.writeFileSync(
  path.join(project, "Other.yarn"),
  "title: Other\n---\nMira: Other document.\n===\n",
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
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const result = await page.evaluate(async () => {
      const m = await new Promise((r) =>
        window.require(["vs/editor/editor.main"], r),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent),
        model = e.getModel();
      e.setPosition({ lineNumber: 3, column: 15 });
      await new Promise((r) => setTimeout(r, 200));
      let reads = 0,
        changes = 0,
        viewCaptures = 0,
        optionUpdates = 0;
      const saveView = e.saveViewState.bind(e),
        updateOptions = e.updateOptions.bind(e);
      e.saveViewState = (...args) => {
        viewCaptures++;
        return saveView(...args);
      };
      e.updateOptions = (...args) => {
        optionUpdates++;
        return updateOptions(...args);
      };
      const get = model.getValue.bind(model);
      model.getValue = (...args) => {
        reads++;
        return get(...args);
      };
      const sheet = e.getDomNode().querySelector("style");
      const observer = new MutationObserver((r) => (changes += r.length));
      if (sheet) observer.observe(sheet, { childList: true, subtree: true });
      const times = [];
      for (let i = 0; i < 120; i++) {
        const t = performance.now();
        e.setScrollTop((i + 1) * 80);
        await new Promise(requestAnimationFrame);
        times.push(performance.now() - t);
      }
      await new Promise((r) => setTimeout(r, 350));
      observer.disconnect();
      model.getValue = get;
      e.saveViewState = saveView;
      e.updateOptions = updateOptions;
      return {
        reads,
        highlightStyleMutations: changes,
        viewCaptures,
        optionUpdates,
        elapsedMs: times.reduce((a, b) => a + b, 0),
        maxFrameMs: Math.max(...times),
        scrollTop: e.getScrollTop(),
      };
    });
    const { profile: cpu } = await cdp.send("Profiler.stop");
    fs.writeFileSync(path.join(out, "scroll.cpuprofile"), JSON.stringify(cpu));
    // Leave before the trailing persistence timer fires. The outgoing view is
    // captured by workspace navigation and must never leak into the new model.
    await page.evaluate(async () => {
      const m = await new Promise((r) =>
        window.require(["vs/editor/editor.main"], r),
      );
      m.editor
        .getEditors()
        .find((e) => e.getDomNode()?.offsetParent)
        .setScrollTop(12000);
    });
    await page.getByRole("button", { name: "Other.yarn", exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: "Large.yarn", exact: true }).click();
    await page.waitForTimeout(300);
    result.restoredScrollTop = await page.evaluate(async () => {
      const m = await new Promise((r) =>
        window.require(["vs/editor/editor.main"], r),
      );
      return m.editor
        .getEditors()
        .find((e) => e.getDomNode()?.offsetParent)
        .getScrollTop();
    });
    assert.equal(
      result.restoredScrollTop,
      12000,
      "Switching documents during scroll retains outgoing viewport",
    );
    // Real wheel input exercises Monaco's smooth-scroll animation as well as
    // native painting, which setScrollTop alone does not cover.
    await page.evaluate(async () => {
      const m = await new Promise((r) =>
        window.require(["vs/editor/editor.main"], r),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
      e.setScrollTop(0);
      await new Promise((r) => setTimeout(r, 250));
      const samples = [],
        oldOptions = e.updateOptions.bind(e),
        oldSave = e.saveViewState.bind(e);
      let options = 0,
        views = 0,
        frame,
        last = performance.now();
      e.updateOptions = (...args) => {
        options++;
        return oldOptions(...args);
      };
      e.saveViewState = (...args) => {
        views++;
        return oldSave(...args);
      };
      const sample = (now) => {
        samples.push(now - last);
        last = now;
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      window.finishSourceWheel = () => {
        cancelAnimationFrame(frame);
        e.updateOptions = oldOptions;
        e.saveViewState = oldSave;
        const sorted = [...samples].sort((a, b) => a - b);
        return {
          frames: samples.length,
          optionUpdates: options,
          viewCaptures: views,
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
          maxFrameMs: Math.max(...samples),
          scrollTop: e.getScrollTop(),
        };
      };
    });
    const box = await page
      .locator(".monaco-editor .view-lines")
      .first()
      .boundingBox();
    await page.mouse.move(box.x + 100, Math.max(200, box.y + 100));
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, 350);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(400);
    result.wheel = await page.evaluate(() => window.finishSourceWheel());
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify({ out, ...result }));
    // Monaco normalizes wheel deltas (this fixture advances about 50px per
    // event), so raw input delta sums are not the expected scroll distance.
    assert(result.wheel.scrollTop > 500, "Wheel input must scroll Source");
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
      assert.ok(
        result.viewCaptures < 10,
        "Scroll frames must not capture and publish full view state",
      );
      assert.equal(
        result.optionUpdates,
        0,
        "Scrolling must not reconfigure Monaco options",
      );
      assert.equal(result.wheel.optionUpdates, 0);
      assert(
        result.wheel.viewCaptures < 10,
        "Smooth-scroll frames must coalesce view persistence",
      );
    }
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
