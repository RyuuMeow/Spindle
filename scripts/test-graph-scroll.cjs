const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron } = require("playwright");
const sceneCount = Number(process.env.GRAPH_SCENES || 24);
const out = path.resolve("outputs/graph-scroll/" + Date.now()),
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
  path.join(project, "Graph.yarn"),
  Array.from(
    { length: sceneCount },
    (_, i) =>
      `title: Scene_${i}\n---\nMira: Scene ${i} dialogue and a short summary.\n-> Continue to scene ${(i + 1) % sceneCount}\n    <<jump Scene_${(i + 1) % sceneCount}>>\n===`,
  ).join("\n\n"),
);
let app;
(async () => {
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [
        process.env.GRAPH_MAIN || "dist-desktop/app/desktop/main.cjs",
        "--user-data-dir=" + profile,
        "--force-device-scale-factor=1",
      ],
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    await (
      await app.browserWindow(page)
    ).evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, project);
    await page
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    await page.getByRole("button", { name: "Graph.yarn", exact: true }).click();
    // Count real DOM measurement and worker activity, without altering graph state.
    await page.evaluate(() => {
      const NativeObserver = window.ResizeObserver,
        post = Worker.prototype.postMessage;
      window.graphMeasure = {
        observers: 0,
        measures: 0,
        workers: 0,
        mutations: 0,
        frames: [],
      };
      window.graphCaptureEvents = [];
      for (const name of ["pointercancel", "lostpointercapture"])
        document.addEventListener(
          name,
          (event) =>
            window.graphCaptureEvents.push({
              type: event.type,
              target: event.target.className?.baseVal ?? event.target.className,
              buttons: event.buttons,
            }),
          true,
        );
      window.ResizeObserver = class extends NativeObserver {
        constructor(callback) {
          super((entries, observer) => {
            window.graphMeasure.measures += entries.filter((e) =>
              e.target.matches(".flow-route-card"),
            ).length;
            callback(entries, observer);
          });
        }
        observe(el, options) {
          if (el.matches(".flow-route-card")) window.graphMeasure.observers++;
          return super.observe(el, options);
        }
      };
      Worker.prototype.postMessage = function (...args) {
        window.graphMeasure.workers++;
        return post.apply(this, args);
      };
      window.graphBegin = () => {
        window.graphMeasure = {
          observers: 0,
          measures: 0,
          workers: 0,
          mutations: 0,
          frames: [],
        };
        window.graphObserver = new MutationObserver((records) => {
          window.graphMeasure.mutations += records.filter(
            (r) =>
              !r.target.matches?.(
                ".react-flow__viewport,.react-flow__background",
              ),
          ).length;
        });
        window.graphObserver.observe(document.querySelector(".react-flow"), {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
        let last = performance.now();
        const frame = (now) => {
          window.graphMeasure.frames.push(now - last);
          last = now;
          window.graphRaf = requestAnimationFrame(frame);
        };
        window.graphRaf = requestAnimationFrame(frame);
      };
      window.graphEnd = () => {
        cancelAnimationFrame(window.graphRaf);
        window.graphObserver.disconnect();
        const m = window.graphMeasure,
          sorted = [...m.frames].sort((a, b) => a - b);
        return {
          ...m,
          frames: m.frames.length,
          maxFrameMs: Math.max(...m.frames),
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
          framesOver25ms: m.frames.filter((t) => t > 25).length,
        };
      };
    });
    await page.getByRole("radio", { name: "Flowchart", exact: true }).click();
    await page.locator(".flow-route-card").first().waitFor();
    await page.waitForTimeout(2500);
    await page.locator(".flow-zoom-value").click();
    await page.waitForTimeout(700);
    const state = () =>
      page.evaluate(async () => {
        const s = await window.yarnDesktop.session.load();
        return s.tabs.find((t) => t.id === s.activeId).graph;
      });
    await page.getByRole("button", { name: "Find scene", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search scenes in graph" })
      .fill("Scene_" + Math.floor(sceneCount / 2));
    await page
      .getByRole("textbox", { name: "Search scenes in graph" })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Search scenes in graph" })
      .press("Escape");
    await page.waitForTimeout(400);
    const visible = await page
      .locator(".react-flow__node-scene")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const r = node.getBoundingClientRect();
            return (
              r.left > 235 && r.right < 1440 && r.top > 95 && r.bottom < 890
            );
          })
          .map((node) => node.getAttribute("data-id")),
      );
    assert.ok(visible.length > 0, "Benchmark must paint visible scene cards");
    const scene = page.locator(
        '.react-flow__node-scene[data-id="' + visible[0] + '"]',
      ),
      sceneBox = await scene.boundingBox();
    const arranged = await state();
    await page.mouse.move(sceneBox.x + 35, sceneBox.y + 16);
    await page.mouse.down();
    await page.mouse.move(sceneBox.x + 60, sceneBox.y + 31, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    assert.notDeepEqual(
      (await state()).layout.positions,
      arranged.layout.positions,
      "Fixture includes a manual node move",
    );
    const segment = await page
      .locator(".flow-route-hit")
      .evaluateAll((lines) => {
        for (const line of lines) {
          const r = line.getBoundingClientRect(),
            x = r.left + r.width / 2,
            y = r.top + r.height / 2;
          if (
            x > 260 &&
            x < 1400 &&
            y > 110 &&
            y < 870 &&
            Math.max(r.width, r.height) > 40 &&
            document.elementFromPoint(x, y) === line
          )
            return {
              id: line.closest(".react-flow__edge").getAttribute("data-id"),
              x,
              y,
            };
        }
      });
    assert.ok(segment, "Visible route segment available for pin editing");
    await page
      .locator(
        '.react-flow__edge[data-id="' + segment.id + '"] .flow-edge-focus',
      )
      .focus();
    await page.keyboard.press("Enter");
    await page.mouse.dblclick(segment.x, segment.y);
    await page.waitForTimeout(600);
    const before = await state();
    assert.equal(
      before.layout.routes[segment.id].pins.length,
      1,
      "Fixture includes a manual route pin",
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    await page.evaluate(() => window.graphBegin());
    await page.mouse.move(900, 420);
    for (let i = 0; i < 80; i++) {
      await page.mouse.wheel(0, i < 40 ? 3 : -3);
      await page.waitForTimeout(12);
    }
    await page.waitForTimeout(250);
    const zoom = await page.evaluate(() => window.graphEnd());
    const { profile: cpu } = await cdp.send("Profiler.stop");
    fs.writeFileSync(path.join(out, "zoom.cpuprofile"), JSON.stringify(cpu));
    await page.evaluate(() => window.graphBegin());
    await page.mouse.move(850, 400);
    await page.mouse.down({ button: "right" });
    for (let i = 0; i < 80; i++) {
      await page.mouse.move(
        850 + (i < 40 ? i : 80 - i) * 3,
        400 + (i < 40 ? i : 80 - i),
      );
      await page.waitForTimeout(12);
    }
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(250);
    const pan = await page.evaluate(() => window.graphEnd());
    const after = await state();
    await page.screenshot({ path: path.join(out, "graph.png") });
    const result = {
      out,
      nodes: await page.locator(".react-flow__node-scene").count(),
      routes: await page.locator(".react-flow__edge").count(),
      visibleScenes: visible.length,
      pinnedRoute: segment.id,
      zoom,
      pan,
      geometryPreserved:
        JSON.stringify(before.layout) === JSON.stringify(after.layout),
      viewportBefore: before.viewport,
      viewportAfter: after.viewport,
      captureEvents: await page.evaluate(() => window.graphCaptureEvents),
    };
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    assert.ok(
      result.geometryPreserved,
      "Viewport movement must preserve manual graph geometry and pins",
    );
    assert.ok(
      Math.abs(after.viewport.x - before.viewport.x - 3) < 1 &&
        Math.abs(after.viewport.y - before.viewport.y - 1) < 1,
      "The complete right-drag gesture must be retained, not just its first frames",
    );
    if (!process.argv.includes("--measure-only")) {
      assert.equal(
        zoom.observers,
        0,
        "Zoom must not recreate route-card observers",
      );
      assert.equal(
        pan.observers,
        0,
        "Pan must not recreate route-card observers",
      );
      assert.equal(
        zoom.workers + pan.workers,
        0,
        "Viewport movement must not reroute the graph",
      );
    }
    // Detail thresholds change presentation but never the author's geometry.
    await page.mouse.move(900, 420);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".flow-route-card").count(), 0);
    await page.mouse.wheel(0, -1400);
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".flow-route-card").count(), sceneCount);
    assert.deepEqual(
      (await state()).layout,
      before.layout,
      "Crossing zoom detail thresholds preserves routes, pins and manual positions",
    );
    const labelSizes = () =>
      page.locator(".flow-route-card").evaluateAll((cards) =>
        cards.map((card) => ({
          id: card.dataset.routeId,
          height: Math.ceil(parseFloat(getComputedStyle(card).height)),
        })),
      );
    const fonts = [];
    for (const patch of [
      { fontFamily: "Arial" },
      { fontFamily: "Segoe UI" },
      { fontSize: 20, lineHeight: 1.8 },
    ]) {
      await page.evaluate(
        (patch) =>
          window.yarnDesktop.request({
            type: "appearance",
            patch: { modes: { graph: patch } },
          }),
        patch,
      );
      await page.waitForTimeout(1600);
      const changed = await state(),
        sizes = await labelSizes();
      for (const { id, height } of sizes)
        assert.equal(
          changed.layout.routes[id].card.height,
          height,
          "Stored label geometry must match measured font height",
        );
      assert.deepEqual(
        changed.layout.positions,
        before.layout.positions,
        "Appearance changes preserve manual scene positions",
      );
      assert.deepEqual(
        changed.layout.routes[segment.id].pins,
        before.layout.routes[segment.id].pins,
        "Appearance changes preserve manual pins",
      );
      fonts.push({ patch, height: sizes[0]?.height });
    }
    result.thresholdsPreserved = true;
    result.fonts = fonts;
    // Escape ends a real right-button pan and retains its last visible viewport.
    const beforeCancel = await state();
    await page.locator(".story-canvas").focus();
    await page.mouse.move(850, 400);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(895, 425, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.move(925, 445, { steps: 3 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(300);
    const afterCancel = await state();
    assert.ok(
      Math.abs(afterCancel.viewport.x - beforeCancel.viewport.x - 45) < 1 &&
        Math.abs(afterCancel.viewport.y - beforeCancel.viewport.y - 25) < 1,
      "Escape preserves the final pan viewport and ends the gesture",
    );
    assert.equal(await page.locator(".story-canvas.is-dragging").count(), 0);
    result.panEscapePreserved = true;
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        thresholdsPreserved: true,
        fonts,
        panEscapePreserved: true,
      }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
