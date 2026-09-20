const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/graph-layout-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialDocs } = require(path.join(out, "sample.cjs"));
const profile = fs.mkdtempSync(path.join(out, "profile-"));
fs.writeFileSync(
  path.join(profile, "workspace-v2.json"),
  JSON.stringify({
    projects: [
      {
        id: "graph-test",
        name: "Graph test",
        commands: [],
        documents: initialDocs.map((d, i) => ({
          ...d,
          id: "doc-" + i,
          version: 0,
          status: "draft",
        })),
        folders: [],
        excluded: [],
        recovery: [],
      },
    ],
    currentProjectId: "graph-test",
    notices: [],
  }),
);
function assertRouteGeometry(snapshot) {
  for (const route of Object.values(snapshot.layout.routes)) {
    assert.ok(!route.error, route.id + ": " + route.error);
    if (route.card) {
      const c = route.card;
      assert.ok(
        route.points.slice(1).some((b, i) => {
          const a = route.points[i];
          return (
            a.y === b.y &&
            Math.abs(c.y - a.y) < 0.01 &&
            Math.min(a.x, b.x) <= c.x - c.width / 2 &&
            Math.max(a.x, b.x) >= c.x + c.width / 2
          );
        }),
        "card must stay on its own horizontal route",
      );
    }
    for (let i = 2; i < route.points.length; i++) {
      const a = route.points[i - 2],
        b = route.points[i - 1],
        c = route.points[i];
      assert.ok(
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= -0.01,
        route.id + " immediately retraces at " + JSON.stringify(b),
      );
    }
  }
}
let app, page;
const result = { errors: [], console: [], requests: [] };
(async () => {
  try {
    const launch =
      process.env.DESKTOP_PORTABLE_TEST === "1"
        ? (o) => require("./portable-test-driver.cjs").launch(playwright, o)
        : (o) => playwright._electron.launch(o);
    app = await launch({
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
    await page.context().setOffline(true);
    result.version = await app.evaluate(({ app }) => app.getVersion());
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => result.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") result.console.push(m.text());
    });
    page.on("request", (r) => {
      if (/worker|wasm/.test(r.url())) result.requests.push(r.url());
    });
    await (
      await app.browserWindow(page)
    ).evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .click();
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page.waitForTimeout(2000);
    result.routes = await page.locator(".react-flow__edge").count();
    result.cards = await page.locator(".flow-edge-label").allTextContents();
    result.warning = await page.locator(".flow-layout-error").allTextContents();
    await page.screenshot({ path: path.join(out, "initial.png") });
    result.graph = await page.evaluate(() => {
      const e = document.querySelector(".story-canvas");
      return e?.textContent;
    });
    assert.ok(result.routes >= 5, "WASM should produce scene routes");

    const state = async () => {
      const s = await page.evaluate(() => window.yarnDesktop.session.load());
      return s.tabs.find((t) => t.id === s.activeId).graph;
    };
    const settle = () => page.waitForTimeout(400);
    const point = async (p) => {
      const box = await page.locator(".react-flow").boundingBox();
      const s = await state();
      return {
        x: box.x + s.viewport.x + p.x * s.viewport.zoom,
        y: box.y + s.viewport.y + p.y * s.viewport.zoom,
      };
    };
    const geometry = (s) =>
      JSON.parse(
        JSON.stringify({
          positions: s.layout.positions,
          routes: s.layout.routes,
          trunks: s.layout.trunks,
        }),
      );
    const initial = await state();
    assert.equal(initial.layout.schema, 2);
    const byName = (name) =>
      page.locator(".react-flow__node").filter({
        has: page.locator(".flow-card-title", {
          hasText: new RegExp("^" + name + "$"),
        }),
      });
    await byName("Start").click();
    await page.keyboard.down("Shift");
    await byName("Village").click();
    await page.keyboard.up("Shift");
    await settle();
    assert.equal(
      await page.locator(".react-flow__node.selected").count(),
      2,
      "Shift multi-select",
    );
    const beforeArrange = await state(),
      selectedIds = await page
        .locator(".react-flow__node.selected")
        .evaluateAll((items) => items.map((e) => e.dataset.id));
    await page.getByRole("button", { name: "自動整理", exact: true }).click();
    await page.waitForTimeout(800);
    const arranged = await state();
    for (const [id, p] of Object.entries(beforeArrange.layout.positions))
      if (!selectedIds.includes(id))
        assert.deepEqual(
          arranged.layout.positions[id],
          p,
          "partial layout moved an unselected node",
        );
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(
      (await state()).layout.positions,
      beforeArrange.layout.positions,
      "arrangement undo restores positions",
    );
    result.multiSelect = true;
    result.partialArrange = true;
    // Right-button movement pans without opening a context menu.
    const view = (await state()).viewport;
    await page.mouse.move(600, 210);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(660, 245, { steps: 8 });
    assert.equal(
      await page
        .locator(".story-canvas")
        .evaluate((e) => getComputedStyle(e).cursor),
      "grabbing",
    );
    await page.mouse.up({ button: "right" });
    await settle();
    assert.equal(
      await page.getByRole("menu").count(),
      0,
      "right drag must not open menu",
    );
    const afterPan = (await state()).viewport;
    assert.ok(Math.abs(afterPan.x - view.x - 60) < 2);
    await page.mouse.click(600, 210, { button: "right" });
    await settle();
    assert.ok(
      await page
        .getByRole("menuitem", { name: "建立場景", exact: true })
        .count(),
    );
    await page.keyboard.press("Escape");
    result.rightPan = true;
    // Return the viewport so every route control is reachable.
    await page.getByRole("button", { name: "適應全部", exact: true }).click();
    await settle();
    await page.mouse.click(600, 200);
    const beforeMove = await state(),
      light = await byName("Lighthouse").boundingBox();
    const lightId = await byName("Lighthouse").getAttribute("data-id");
    await page.mouse.move(light.x + 30, light.y + 15);
    await page.mouse.down();
    await page.mouse.move(light.x + 55, light.y + 70, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const afterMove = await state();
    assert.notDeepEqual(
      afterMove.layout.positions[lightId],
      beforeMove.layout.positions[lightId],
    );
    for (const [id, r] of Object.entries(beforeMove.layout.routes))
      if (r.source !== lightId && r.target !== lightId)
        assert.deepEqual(
          afterMove.layout.routes[id].points,
          r.points,
          "unrelated route changed",
        );
    result.localRouting = true;
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    // An independent line accepts a pin, not a scene/source edit.
    let g = await state();
    const direct = Object.values(g.layout.routes).find(
      (r) => !r.groupId && !r.card,
    );
    assert.ok(direct, "fixture has a direct transition");
    const segments = direct.points
      .slice(1)
      .map((b, i) => ({
        a: direct.points[i],
        b,
        index: i,
        length:
          Math.abs(b.x - direct.points[i].x) +
          Math.abs(b.y - direct.points[i].y),
      }))
      .sort((a, b) => b.length - a.length);
    const seg = segments[0],
      middle = await point({
        x: (seg.a.x + seg.b.x) / 2,
        y: (seg.a.y + seg.b.y) / 2,
      });
    await page.mouse.dblclick(middle.x, middle.y);
    await settle();
    g = await state();
    assert.equal(
      g.layout.routes[direct.id].pins.length,
      1,
      "double click inserts pin",
    );
    const pin = g.layout.routes[direct.id].pins[0],
      pinScreen = await point(pin);
    await page.mouse.move(pinScreen.x, pinScreen.y);
    await page.mouse.down();
    await page.mouse.move(pinScreen.x + 20, pinScreen.y + 22, { steps: 6 });
    assert.equal(
      await page
        .locator(".story-canvas")
        .evaluate((e) => getComputedStyle(e).cursor),
      "grabbing",
    );
    await page.mouse.up();
    await page.waitForTimeout(700);
    const movedPin = (await state()).layout.routes[direct.id].pins[0];
    assert.ok(movedPin.x !== pin.x || movedPin.y !== pin.y);
    assertRouteGeometry(await state());
    result.pin = true;
    // Escape rolls back an in-progress pin drag.
    const beforeCancel = await state(),
      ps = await point(movedPin);
    await page.mouse.move(ps.x, ps.y);
    await page.mouse.down();
    await page.mouse.move(ps.x + 20, ps.y - 12, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await settle();
    assert.deepEqual(
      (await state()).layout.routes[direct.id].pins,
      beforeCancel.layout.routes[direct.id].pins,
    );
    result.cancel = true;
    // Card follows the pointer freely; the route follows its new checkpoint.
    const label = page.locator(".flow-edge-label").first(),
      labelId = await label.getAttribute("data-route-id");
    const beforeCard = await state(),
      lb = await label.boundingBox();
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width / 2 + 18, lb.y + lb.height / 2 - 75, {
      steps: 6,
    });
    await page.mouse.up();
    await settle();
    const afterCard = await state();
    assert.equal(afterCard.layout.routes[labelId].card.manual, true);
    assert.notDeepEqual(
      afterCard.layout.routes[labelId].points,
      beforeCard.layout.routes[labelId].points,
    );
    result.cardDrag = {
      before: beforeCard.layout.routes[labelId].card,
      after: afterCard.layout.routes[labelId].card,
      viewportBefore: beforeCard.viewport,
      viewportAfter: afterCard.viewport,
      lb,
    };
    assert.ok(
      Math.abs(
        afterCard.layout.routes[labelId].card.y -
          beforeCard.layout.routes[labelId].card.y +
          75 / beforeCard.viewport.zoom,
      ) < 2,
      JSON.stringify(result.cardDrag),
    );
    assertRouteGeometry(afterCard);
    result.card = true;
    // Shared trunk drag is a single grouped edit.
    const trunk = Object.values(afterCard.layout.trunks)[0],
      split = trunk.points.at(-1),
      ts = await point(split);
    await page.mouse.move(ts.x, ts.y);
    await page.mouse.down();
    await page.mouse.move(ts.x + 12, ts.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const afterTrunk = await state();
    assert.ok(afterTrunk.layout.trunks[trunk.id].manual);
    assertRouteGeometry(afterTrunk);
    result.trunk = true;
    await label.click({ button: "right" });
    await settle();
    assert.ok(
      await page
        .getByRole("menuitem", { name: "簡化線路", exact: true })
        .count(),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".flow-connection-detail").count(),
      0,
      "line/card never opens details",
    );
    // Delete applies only to the selected pin; Undo restores geometry.
    const deleteBefore = await state();
    const directControl = page.locator(
      '.react-flow__edge[data-id="' + direct.id + '"] .flow-edge-focus',
    );
    await directControl.focus();
    await directControl.press("Enter");
    await settle();
    await page.locator('[data-pin-edge="' + direct.id + '"]').click();
    await page.keyboard.press("Delete");
    await settle();
    assert.equal((await state()).layout.routes[direct.id].pins.length, 0);
    assert.equal(
      Object.keys((await state()).layout.routes).length,
      Object.keys(deleteBefore.layout.routes).length,
    );
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(
      (await state()).layout.routes[direct.id].pins,
      deleteBefore.layout.routes[direct.id].pins,
    );
    result.deletePinUndo = true;
    await directControl.focus();
    await directControl.press("Enter");
    await settle();
    await page
      .locator('[data-pin-edge="' + direct.id + '"]')
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "刪除 pin", exact: true }).click();
    await settle();
    assert.equal((await state()).layout.routes[direct.id].pins.length, 0);
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    result.pinContextDelete = true;
    // Card-only selection and arrange; no scene should move.
    await page.mouse.click(600, 200);
    const firstCards = page.locator(".react-flow__node-routeCard");
    await firstCards.nth(0).click();
    await page.keyboard.down("Shift");
    await firstCards.nth(1).click();
    await page.keyboard.up("Shift");
    assert.equal(
      await page.locator(".react-flow__node-routeCard.selected").count(),
      2,
    );
    const beforeCardsArrange = await state();
    await page.getByRole("button", { name: "自動整理", exact: true }).click();
    await page.waitForTimeout(800);
    assert.deepEqual(
      (await state()).layout.positions,
      beforeCardsArrange.layout.positions,
    );
    assertRouteGeometry(await state());
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(geometry(await state()), geometry(beforeCardsArrange));
    result.cardSelectionArrange = true;
    const keyboardCard = firstCards.nth(0).locator(".flow-route-card");
    await keyboardCard.focus();
    await keyboardCard.press("Enter");
    assert.equal(
      await page.locator(".react-flow__node-routeCard.selected").count(),
      1,
    );
    await keyboardCard.press("Shift+F10");
    await page
      .getByRole("menuitem", { name: "簡化線路", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    result.cardKeyboard = true;
    const beforeSwitch = await state();
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await settle();
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page.waitForTimeout(700);
    const afterSwitch = await state();
    assert.deepEqual(
      afterSwitch.layout.positions,
      beforeSwitch.layout.positions,
    );
    assert.deepEqual(
      afterSwitch.layout.routes[direct.id].pins,
      beforeSwitch.layout.routes[direct.id].pins,
    );
    result.modePersistence = true;
    const docs = (
      await page.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      )
    ).snapshot.projects[0].documents;
    assert.deepEqual(
      docs.map((d) => d.text),
      initialDocs.map((d) => d.text),
      "geometry must not edit Yarn",
    );

    result.textIntact = true;
    // Exact transaction maps run while the graph is unmounted.
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await settle();
    await page
      .locator(".monaco-editor .view-lines")
      .click({ position: { x: 70, y: 45 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("// graph identity test\n");
    await settle();
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page.waitForTimeout(800);
    const mapped = await state();
    assert.deepEqual(
      Object.keys(mapped.layout.routes).sort(),
      Object.keys(afterSwitch.layout.routes).sort(),
      "source edit should keep transition IDs",
    );
    assert.deepEqual(mapped.layout.positions, afterSwitch.layout.positions);
    assert.deepEqual(
      mapped.layout.routes[direct.id].pins,
      afterSwitch.layout.routes[direct.id].pins,
    );
    result.sourceMapping = true;
    assertRouteGeometry(mapped);
    result.persisted = geometry(mapped);
    await app.close();
    app = null;
    app = await launch({
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
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => result.errors.push(e.message));
    await (
      await app.browserWindow(page)
    ).evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.locator(".react-flow__edge").first().waitFor();
    await page.waitForTimeout(900);
    assert.deepEqual(
      geometry(await state()),
      result.persisted,
      "restart must restore full manual geometry",
    );
    result.restart = true;

    // Full-containment box selection and group movement use a separate node set.
    await page.getByRole("button", { name: "適應全部", exact: true }).click();
    await settle();
    const boxSelect = async (name, shift = false) => {
      const b = await byName(name).boundingBox();
      if (shift) await page.keyboard.down("Shift");
      await page.mouse.move(b.x - 7, b.y - 7);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width + 7, b.y + b.height + 7, {
        steps: 12,
      });
      await page.mouse.up();
      if (shift) await page.keyboard.up("Shift");
      await settle();
    };
    await page.mouse.click(500, 150);
    await boxSelect("Start");
    assert.equal(await page.locator(".react-flow__node.selected").count(), 1);
    await boxSelect("Village", true);
    assert.equal(await page.locator(".react-flow__node.selected").count(), 2);
    const beforeGroup = await state(),
      groupIds = await page
        .locator(".react-flow__node.selected")
        .evaluateAll((es) => es.map((e) => e.dataset.id));
    const groupBox = await byName("Start").boundingBox();
    await page.evaluate(() => {
      window.graphFrames = [];
      window.graphSampling = true;
      let previous = performance.now();
      const sample = (now) => {
        if (!window.graphSampling) return;
        window.graphFrames.push(now - previous);
        previous = now;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.mouse.move(groupBox.x + 20, groupBox.y + 15);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + 45, groupBox.y + 45, { steps: 12 });
    await page.mouse.up();
    await settle();
    const groupMoved = await state(),
      deltas = groupIds.map((id) => ({
        x:
          groupMoved.layout.positions[id].x -
          beforeGroup.layout.positions[id].x,
        y:
          groupMoved.layout.positions[id].y -
          beforeGroup.layout.positions[id].y,
      }));
    assert.ok(deltas[0].x !== 0 || deltas[0].y !== 0);
    assert.ok(
      Math.abs(deltas[0].x - deltas[1].x) < 0.01 &&
        Math.abs(deltas[0].y - deltas[1].y) < 0.01,
    );
    result.boxSelect = true;
    result.groupMove = true;
    result.dragFrameGaps = await page.evaluate(() => {
      window.graphSampling = false;
      const a = window.graphFrames.sort((x, y) => x - y);
      return {
        samples: a.length,
        p95Ms: Math.round(a[Math.floor(a.length * 0.95)] || 0),
        maxMs: Math.round(a.at(-1) || 0),
      };
    });
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(
      (await state()).layout.positions,
      beforeGroup.layout.positions,
    );
    // A line card is box-selectable and moves with a scene in the same selection.
    await page.mouse.click(500, 150);
    const freeCard = page.locator(
      '.react-flow__node-routeCard[data-id="' + labelId + '"]',
    );
    const cb = await freeCard.boundingBox();
    await page.mouse.move(cb.x - 7, cb.y - 7);
    await page.mouse.down();
    await page.mouse.move(cb.x + cb.width + 7, cb.y + cb.height + 7, {
      steps: 10,
    });
    await page.mouse.up();
    await settle();
    assert.equal(await page.locator(".react-flow__node.selected").count(), 1);
    assert.equal(
      await page.locator(".react-flow__node-routeCard.selected").count(),
      1,
    );
    await boxSelect("Start", true);
    assert.equal(await page.locator(".react-flow__node.selected").count(), 2);
    const mixedBefore = await state(),
      startId = await byName("Start").getAttribute("data-id");
    const mb = await freeCard.boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await page.mouse.down();
    await page.mouse.move(mb.x + mb.width / 2 + 16, mb.y + mb.height / 2 - 20, {
      steps: 8,
    });
    await page.mouse.up();
    await settle();
    const mixedAfter = await state();
    for (const axis of ["x", "y"])
      assert.ok(
        Math.abs(
          mixedAfter.layout.positions[startId][axis] -
            mixedBefore.layout.positions[startId][axis] -
            (mixedAfter.layout.routes[labelId].card[axis] -
              mixedBefore.layout.routes[labelId].card[axis]),
        ) < 0.01,
      );
    assertRouteGeometry(mixedAfter);
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(geometry(await state()), geometry(mixedBefore));
    result.cardBoxAndMixedMove = true;
    // Fixed segment edit is local and reversible.
    const segmentBefore = await state(),
      manualRoute = segmentBefore.layout.routes[direct.id];
    await page
      .locator(
        '.react-flow__edge[data-id="' + direct.id + '"] .flow-edge-focus',
      )
      .focus();
    await page
      .locator(
        '.react-flow__edge[data-id="' + direct.id + '"] .flow-edge-focus',
      )
      .press("Enter");
    await settle();
    const leg = manualRoute.points
      .slice(1)
      .map((b, i) => ({ a: manualRoute.points[i], b }))
      .sort(
        (a, b) =>
          Math.abs(b.a.x - b.b.x) +
          Math.abs(b.a.y - b.b.y) -
          (Math.abs(a.a.x - a.b.x) + Math.abs(a.a.y - a.b.y)),
      )[0];
    const spot = await point({
      x: leg.a.x * 0.6 + leg.b.x * 0.4,
      y: leg.a.y * 0.6 + leg.b.y * 0.4,
    });
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(
      spot.x + (leg.a.x === leg.b.x ? 12 : 0),
      spot.y + (leg.a.y === leg.b.y ? 12 : 0),
      { steps: 8 },
    );
    await page.mouse.up();
    await settle();
    assert.ok(
      (await state()).layout.routes[direct.id].fixedSegments.length >
        manualRoute.fixedSegments.length,
    );
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(geometry(await state()), geometry(segmentBefore));
    result.segmentUndo = true;
    const beforeAll = await state();
    await page.getByRole("button", { name: "自動整理", exact: true }).click();
    await page.waitForTimeout(900);
    assert.ok(
      Object.values((await state()).layout.routes).every(
        (r) =>
          r.pins.length === 0 &&
          r.fixedSegments.length === 0 &&
          !r.card?.manual,
      ),
    );
    await page.getByRole("button", { name: "復原布局", exact: true }).click();
    await settle();
    assert.deepEqual(geometry(await state()), geometry(beforeAll));
    result.fullArrangeUndo = true;
    // Inline text editing keeps its separate document history.
    await byName("Start").locator(".flow-card-title").dblclick();
    const content = page.getByRole("textbox", {
      name: "場景內容",
      exact: true,
    });
    await content.waitFor();
    await content.press("Control+Home");
    await page.keyboard.insertText("// inline regression\n");
    await settle();
    const withEdit = (
      await page.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      )
    ).snapshot.projects[0].documents[0].text;
    assert.ok(withEdit.includes("inline regression"));
    await content.press("Control+z");
    await settle();
    const withoutEdit = (
      await page.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      )
    ).snapshot.projects[0].documents[0].text;
    assert.equal(withoutEdit.includes("inline regression"), false);
    await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
    await content.waitFor({ state: "detached" });
    result.inlineEditing = true;
    await page.getByRole("button", { name: "適應全部", exact: true }).click();
    await settle();
    assert.ok(result.requests.some((url) => url.endsWith(".wasm")));
    result.offlineEngines = true;

    await page.screenshot({ path: path.join(out, "edited.png") });
    await page.screenshot({
      path: path.join(out, "edited.jpg"),
      type: "jpeg",
      quality: 55,
    });

    assert.equal(result.errors.length, 0);
  } catch (e) {
    if (page) await page.screenshot({ path: path.join(out, "failure.png") });
    result.failure = e.stack;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    if (app) await app.close();
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(result).filter(
            ([k]) => !["persisted", "graph", "cards"].includes(k),
          ),
        ),
        null,
        2,
      ),
    );
  }
})();
