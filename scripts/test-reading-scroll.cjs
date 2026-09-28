const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron } = require("playwright");
async function wheelProbe(page, selector, lineSelector) {
  const surface = page.locator(selector);
  await surface.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  await page.evaluate(
    ({ selector, lineSelector }) => {
      const surface = document.querySelector(selector);
      const probe = {
        maxBottomGap: 0,
        samples: 0,
        blankFrames: 0,
        stopped: false,
      };
      window.__readingScrollProbe = probe;
      const sample = () => {
        if (probe.stopped) return;
        const lines = surface.querySelectorAll(lineSelector);
        const last = lines[lines.length - 1];
        const gap = last
          ? surface.getBoundingClientRect().bottom -
            last.getBoundingClientRect().bottom
          : surface.clientHeight;
        // The intentional end-of-document padding is not a loading gap.
        if (
          surface.scrollTop + surface.clientHeight <
          surface.scrollHeight - 120
        ) {
          probe.maxBottomGap = Math.max(probe.maxBottomGap, gap);
          if (gap > 100) probe.blankFrames++;
        }
        probe.samples++;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { selector, lineSelector },
  );
  const box = await surface.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  const result = await page.evaluate((selector) => {
    const probe = window.__readingScrollProbe;
    probe.stopped = true;
    return { ...probe, scrollTop: document.querySelector(selector).scrollTop };
  }, selector);
  await surface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForTimeout(200);
  result.reachedLastLine = await surface.evaluate((element) =>
    element.textContent.includes("1999"),
  );
  assert(result.reachedLastLine, "Bottom navigation must render the last line");
  assert(result.scrollTop > 5000, "Wheel input must actually scroll the story");
  return result;
}
const out = path.resolve("outputs/reading-scroll/" + Date.now()),
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
  "title: Start\n---\n" +
    Array.from(
      { length: 2000 },
      (_, i) =>
        `Mira: 第 ${i} 行的海風吹過窗邊。 The wind passes by the window.` +
        (process.argv.includes("--wrapped") && i % 4 === 0
          ? " 海風吹過窗邊，遠方的燈塔仍然亮著。".repeat(16)
          : ""),
    ).join("\n") +
    "\n===",
);
fs.writeFileSync(
  path.join(project, "Check.yarn"),
  "title: Check\n---\n<<declare $valid = 0>>\n<<set $valid = 2>>\n===",
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
    await page
      .getByRole("radio", { name: "Reading editor", exact: true })
      .click();
    await page.locator(".reading-editor .cm-content").waitFor();
    await page.waitForTimeout(800);
    const result = await page.evaluate(async () => {
      const dom = document.querySelector(".reading-editor .cm-content"),
        view = dom.cmTile.root.view;
      let dispatches = 0,
        reads = 0,
        effects = 0;
      const readStacks = {};
      const old = view.dispatch.bind(view),
        doc = view.state.doc,
        toString = doc.toString.bind(doc);
      view.dispatch = (...args) => {
        dispatches++;
        if (args.some((a) => a.effects)) effects++;
        return old(...args);
      };
      doc.toString = () => {
        reads++;
        const stack = new Error().stack.split("\n").slice(2, 5).join("\n");
        readStacks[stack] = (readStacks[stack] || 0) + 1;
        return toString();
      };
      const times = [];
      let maxBottomGap = 0;
      for (let i = 0; i < 60; i++) {
        const t = performance.now();
        view.scrollDOM.scrollTop = (i + 1) * 60;
        await new Promise(requestAnimationFrame);
        times.push(performance.now() - t);
        const bounds = view.scrollDOM.getBoundingClientRect(),
          lines = [...dom.querySelectorAll(".cm-line")];
        const bottom = Math.max(
          ...lines.map((l) => l.getBoundingClientRect().bottom),
        );
        maxBottomGap = Math.max(maxBottomGap, bounds.bottom - bottom);
      }
      await new Promise((r) => setTimeout(r, 200));
      view.dispatch = old;
      doc.toString = toString;
      return {
        dispatches,
        effects,
        reads,
        readStacks,
        maxBottomGap,
        scrollTop: view.scrollDOM.scrollTop,
        elapsedMs: times.reduce((a, b) => a + b, 0),
        maxFrameMs: Math.max(...times),
        lineCount: doc.lines,
      };
    });
    await page.evaluate(() =>
      window.yarnDesktop.request({
        type: "preferences",
        editorCharacters: { showPortraits: true, useNameColors: false },
      }),
    );
    await page.locator(".reading-editor .reading-portrait").first().waitFor();
    assert.equal(
      await page.locator(".reading-editor .reading-character-name").count(),
      0,
      "Presentation changes must still rebuild the visible character styles",
    );
    await page.evaluate(() =>
      window.yarnDesktop.request({
        type: "preferences",
        editorCharacters: { showPortraits: false, useNameColors: true },
      }),
    );
    await page
      .locator(".reading-editor .reading-character-name")
      .first()
      .waitFor();
    assert.equal(
      await page.locator(".reading-editor .reading-portrait").count(),
      0,
    );
    result.wheel = await wheelProbe(
      page,
      ".reading-editor .cm-scroller",
      ".cm-line",
    );
    await page.screenshot({ path: path.join(out, "reading-at-bottom.png") });
    await page
      .getByRole("button", { name: "Reading only", exact: true })
      .click();
    await page.locator(".dialogue-reader").waitFor();
    result.readerWheel = await wheelProbe(
      page,
      ".dialogue-reader",
      "p[data-line]",
    );
    await page.screenshot({ path: path.join(out, "reader-at-bottom.png") });
    await page
      .getByRole("button", { name: "Reading only", exact: true })
      .click();
    await page.getByRole("button", { name: "Check.yarn", exact: true }).click();
    await page.locator(".reading-editor .cm-content").waitFor();
    const replaceAssignment = async (text) => {
      await page.evaluate(() => {
        const view = document.querySelector(".reading-editor .cm-content")
          .cmTile.root.view;
        const line = view.state.doc.line(4);
        view.dispatch({ selection: { anchor: line.from, head: line.to } });
        view.focus();
      });
      await page.keyboard.insertText(text);
    };
    await replaceAssignment("<<set $missing = 2>>");
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".cm-undeclared-variable").count(),
      0,
      "Typing must keep variable diagnostics quiet",
    );
    await page.locator(".cm-undeclared-variable").first().waitFor();
    await replaceAssignment("<<set $valid = 2>>");
    await page.waitForTimeout(1100);
    assert.equal(
      await page.locator(".cm-undeclared-variable").count(),
      0,
      "Published diagnostics must clear after correcting the variable",
    );
    result.diagnosticRefresh =
      "quiet typing, delayed publication, correction passed";
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify({ out, ...result }));
    if (!process.argv.includes("--measure-only")) {
      assert.equal(
        result.effects,
        0,
        "Plain scrolling must not rebuild reading decorations",
      );
      assert.equal(
        result.reads,
        0,
        "Plain scrolling must not scan full document",
      );
      assert.ok(
        result.maxBottomGap < 100,
        "Viewport must retain content while scrolling",
      );
      assert.equal(
        result.wheel.blankFrames,
        0,
        "Fast reading-editor wheel gesture must retain viewport coverage",
      );
      assert.equal(
        result.readerWheel.blankFrames,
        0,
        "Reader wheel gesture must retain viewport coverage",
      );
    }
  } finally {
    // This disposable profile has no user documents or persistence assertions.
    // Exit its test process without triggering an unrelated workspace-close handshake.
    if (app) {
      await app.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      });
      await app.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
