import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import ELK from "elkjs/lib/elk.bundled.js";
import { parse } from "../app/parser.ts";
import { buildGraphModel } from "../app/graph/model.ts";
import {
  migrateLayout,
  moveNodes,
  movePin,
  moveCard,
  freezeControlOrder,
  removePin,
  cardOnRoute,
  pointOnRoute,
} from "../app/graph/layout-state.ts";
import { segmentHitsRect, rectsOverlap } from "../app/graph-layout.ts";
await build({
  entryPoints: ["app/graph/layout-engine.ts"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  outfile: "outputs/graph-engine-test.mjs",
});
const { computeLayout } = await import("../outputs/graph-engine-test.mjs");
await build({
  stdin: {
    contents:
      'export * from "./app/graph/route-lanes.ts"; export * from "./app/graph/manual-routing.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "outputs/graph-lane-integration.mjs",
});
const { laneConflict, previewRoutes } =
  await import("../outputs/graph-lane-integration.mjs");
const elk = new ELK();
const scene = (name, body) => "title: " + name + "\n---\n" + body + "\n===\n";
function fixture(text) {
  const documents = [{ id: "document", name: "story.yarn", text, version: 0 }],
    model = buildGraphModel({
      file: "story.yarn",
      ...parse(documents, []),
      documents,
    });
  return {
    id: 1,
    modelVersion: model.version,
    layoutVersion: 0,
    scope: { kind: "all" },
    model,
    snapshot: migrateLayout(undefined, model),
    sizes: Object.fromEntries(
      model.records.map((r) => [r.id, { width: 232, height: 100 }]),
    ),
    labels: Object.fromEntries(
      model.groups
        .filter((g) => g.label)
        .map((g) => [g.id, { text: "choice", width: 180, height: 38 }]),
    ),
  };
}
const run = async (r) =>
  computeLayout({ ...r, layoutVersion: r.snapshot.revision }, undefined, elk);
function assertClear(result, request) {
  assert.deepEqual(result.errors, [], "automatic layout must be feasible");
  const s = result.snapshot,
    boxes = request.model.records.map((r) => ({
      id: r.id,
      ...s.positions[r.id],
      ...request.sizes[r.id],
    }));
  const cards = Object.values(s.routes)
    .filter((r) => r.card)
    .map((r) => ({
      id: r.id,
      x: r.card.x - r.card.width / 2,
      y: r.card.y - r.card.height / 2,
      width: r.card.width,
      height: r.card.height,
    }));
  for (const route of Object.values(s.routes)) {
    assert.ok(route.points.length >= 2);
    if (route.card)
      assert.ok(
        cardOnRoute(route.card, route.points),
        "card stays on its horizontal corridor",
      );
    if (route.groupId)
      assert.ok(
        s.trunks[route.groupId].points.every((p) =>
          pointOnRoute(p, route.points, 0.01),
        ),
        "branch follows group trunk",
      );
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      assert.ok(a.x === b.x || a.y === b.y, "orthogonal");
      for (const box of [
        ...boxes.filter((b) => b.id !== route.source && b.id !== route.target),
        ...cards.filter((c) => c.id !== route.id),
      ])
        assert.equal(
          segmentHitsRect(a, b, box),
          false,
          route.id + " intersects " + box.id,
        );
    }
  }
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      assert.equal(rectsOverlap(cards[i], cards[j]), false, "cards overlap");
}
const branching = () =>
  fixture(
    scene(
      "Start",
      "-> One\n  <<jump A>>\n-> Two\n  <<jump B>>\n-> Three\n  <<jump B>>",
    ) +
      scene("A", "<<jump End>>") +
      scene(
        "B",
        "<<if $x>>\n<<jump End>>\n<<else>>\n<<jump Start>>\n<<endif>>",
      ) +
      scene("End", "End") +
      scene("Unrelated", "unused"),
  );
test("ELK + libavoid preserve branch columns, source order and centered ports", async () => {
  const request = branching(),
    result = await run(request);
  assertClear(result, request);
  const { snapshot: s } = result;
  const source = request.model.records[0];
  assert.ok(
    request.model.records
      .slice(1, 4)
      .every((r) => s.positions[r.id].x > s.positions[source.id].x),
  );
  for (const b of request.model.branches) {
    const cards = request.model.groups
      .filter((g) => g.groupId === b.id)
      .map((g) => s.routes[g.id].card);
    assert.equal(new Set(cards.map((c) => c.x)).size, 1);
    for (let i = 1; i < cards.length; i++)
      assert.ok(
        cards[i].y -
          cards[i].height / 2 -
          (cards[i - 1].y + cards[i - 1].height / 2) >=
          24,
      );
  }
  for (const r of Object.values(s.routes))
    if (r.sourceSide === "right")
      assert.equal(r.points[0].y, s.positions[r.source].y + 50);
});
test("unrelated moves and repairs keep existing routes point-for-point", async () => {
  const r = branching(),
    first = await run(r),
    unrelated = r.model.records.at(-1).id;
  const moved = moveNodes(first.snapshot, {
    [unrelated]: { x: -600, y: -600 },
  });
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: moved,
  });
  assert.deepEqual(repaired.snapshot.routes, first.snapshot.routes);
});
test("selected arrangement leaves other nodes, boundary pin and card fixed", async () => {
  const r = branching(),
    first = await run(r),
    chosen = r.model.records[1].id;
  const boundary = r.model.groups.find((g) => g.target === chosen),
    edge = first.snapshot.routes[boundary.id];
  const a = edge.points.at(-2);
  edge.pins.push({ id: "manual", x: a.x, y: a.y });
  const before = structuredClone(first.snapshot);
  const next = await run({
    ...r,
    scope: { kind: "selected", ids: [chosen] },
    snapshot: first.snapshot,
  });
  for (const record of r.model.records)
    if (record.id !== chosen)
      assert.deepEqual(
        next.snapshot.positions[record.id],
        before.positions[record.id],
      );
  assert.deepEqual(
    next.snapshot.routes[edge.id].pins,
    before.routes[edge.id].pins,
  );
  assert.deepEqual(
    next.snapshot.routes[edge.id].card,
    before.routes[edge.id].card,
  );
});
test("feedback, self loops, narrow dimensions and long labels remain explicit", async () => {
  const r = fixture(
    scene("A", "-> Loop\n  <<jump A>>\n-> Continue\n  <<jump B>>") +
      scene("B", "<<jump A>>"),
  );
  for (const label of Object.values(r.labels)) {
    label.width = 240;
    label.height = 88;
  }
  const result = await run(r);
  assertClear(result, r);
  const loop = Object.values(result.snapshot.routes).find(
    (e) => e.source === e.target,
  );
  assert.ok(loop.points.length >= 4);
});
test("overlapping pin remains connected without exposing a layout conflict", async () => {
  const r = branching(),
    first = await run(r),
    edge = Object.values(first.snapshot.routes)[0],
    other = r.model.records.at(-1);
  const p = first.snapshot.positions[other.id];
  edge.pins.push({ id: "blocked", x: p.x + 30, y: p.y + 30 });
  edge.error = "repair";
  const next = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assert.ok(next.errors.includes(edge.id));
  assert.deepEqual(next.snapshot.routes[edge.id].pins, edge.pins);
  assert.ok(pointOnRoute(edge.pins[0], next.snapshot.routes[edge.id].points));
  assert.ok(!next.snapshot.routes[edge.id].error);
});
test("nested branch groups have separate columns without collapsing same target", async () => {
  const r = fixture(
    scene(
      "A",
      "-> One\n  <<if $x>>\n  <<jump B>>\n  <<else>>\n  <<jump C>>\n  <<endif>>\n-> Two\n  <<jump B>>",
    ) +
      scene("B", "b") +
      scene("C", "c"),
  );
  const result = await run(r);
  assertClear(result, r);
  assert.equal(Object.keys(result.snapshot.routes).length, 3);
  const nested = r.model.branches.find((b) => b.parentId),
    outer = r.model.groups.find((g) => g.groupId === nested.parentId);
  assert.ok(
    result.snapshot.routes[nested.transitions[0]].card.x >
      result.snapshot.routes[outer.id].card.x,
  );
});
test("layout benchmark records size, elapsed time and bends", async (t) => {
  const timings = [];
  for (const count of [10, 50, 120]) {
    const r = fixture(
      Array.from({ length: count }, (_, i) =>
        scene("N" + i, i < count - 1 ? "<<jump N" + (i + 1) + ">>" : "End"),
      ).join(""),
    );
    const result = await run(r);
    assertClear(result, r);
    timings.push({
      nodes: count,
      elapsedMs: Math.round(result.elapsed),
      bends: Object.values(result.snapshot.routes).reduce(
        (n, r) => n + r.points.length - 2,
        0,
      ),
    });
  }
  t.diagnostic(JSON.stringify(timings));
});

test("new nodes and text-only changes preserve existing geometry", async () => {
  const r = branching(),
    first = await run(r);
  const doc = { ...r.model.records[0].node };
  const original = r.model.anchors;
  const texts =
    r.model.records
      .filter((n) => n.node)
      .map((n) =>
        scene(
          n.name,
          n.name === "Start"
            ? "-> One\n  <<jump A>>\n-> Two\n  <<jump B>>\n-> Three\n  <<jump B>>"
            : n.name === "A"
              ? "<<jump End>>"
              : n.name === "B"
                ? "<<if $x>>\n<<jump End>>\n<<else>>\n<<jump Start>>\n<<endif>>"
                : "text",
        ),
      )
      .join("") + scene("New", "new");
  const documents = [
      { id: "document", name: doc.file, text: texts, version: 1 },
    ],
    model = buildGraphModel({
      file: doc.file,
      ...parse(documents, []),
      documents,
      anchors: original,
    });
  const request = {
    ...r,
    model,
    snapshot: first.snapshot,
    scope: { kind: "repair" },
    sizes: {
      ...r.sizes,
      ...Object.fromEntries(
        model.records
          .filter((n) => !r.sizes[n.id])
          .map((n) => [n.id, { width: 232, height: 100 }]),
      ),
    },
    labels: Object.fromEntries(
      model.groups
        .filter((g) => g.label)
        .map((g) => [g.id, { text: "choice", width: 180, height: 38 }]),
    ),
  };
  const repaired = await run(request);
  for (const [id, p] of Object.entries(first.snapshot.positions))
    assert.deepEqual(repaired.snapshot.positions[id], p);
  assert.equal(
    Object.keys(repaired.snapshot.positions).length,
    Object.keys(first.snapshot.positions).length + 1,
  );
});
test("multi-branch performance fixture reports routes, crossings, bends and elapsed", async (t) => {
  const times = [];
  for (const count of [12, 36, 72]) {
    const r = fixture(
      Array.from({ length: count }, (_, i) =>
        scene(
          "N" + i,
          i < count - 2
            ? "-> Next\n  <<jump N" +
                (i + 1) +
                ">>\n-> Skip\n  <<jump N" +
                (i + 2) +
                ">>"
            : "End",
        ),
      ).join(""),
    );
    const result = await run(r);
    assertClear(result, r);
    const routes = Object.values(result.snapshot.routes),
      segments = routes.flatMap((r) =>
        r.points.slice(1).map((b, i) => ({ a: r.points[i], b, id: r.id })),
      );
    let crossings = 0;
    for (let i = 0; i < segments.length; i++)
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i],
          b = segments[j];
        if (a.id === b.id) continue;
        const h = a.a.y === a.b.y ? a : b,
          v = h === a ? b : a;
        if (h.a.y !== h.b.y || v.a.x !== v.b.x) continue;
        if (
          v.a.x > Math.min(h.a.x, h.b.x) &&
          v.a.x < Math.max(h.a.x, h.b.x) &&
          h.a.y > Math.min(v.a.y, v.b.y) &&
          h.a.y < Math.max(v.a.y, v.b.y)
        )
          crossings++;
      }
    const sourceId = r.model.records[Math.floor(count / 2)].id;
    const moved = moveNodes(result.snapshot, {
      [sourceId]: {
        x: result.snapshot.positions[sourceId].x + 24,
        y: result.snapshot.positions[sourceId].y + 36,
      },
    });
    const dragStart = performance.now();
    previewRoutes(moved, r.sizes);
    const previewMs = performance.now() - dragStart;
    times.push({
      nodes: count,
      previewMs: Math.round(previewMs),
      routes: routes.length,
      elapsedMs: Math.round(result.elapsed),
      crossings,
      bends: routes.reduce((n, r) => n + r.points.length - 2, 0),
    });
  }
  t.diagnostic(JSON.stringify(times));
});

test("moving a pin across a straight leg makes a continuous detour without retracing", async () => {
  const r = fixture(scene("A", "<<jump B>>") + scene("B", "end"));
  const first = await run(r),
    edge = Object.values(first.snapshot.routes)[0];
  const a = edge.points[0],
    b = edge.points.at(-1),
    pin = { id: "pin", x: (a.x + b.x) / 2, y: a.y };
  edge.points.splice(1, 0, { x: pin.x, y: pin.y });
  edge.pins.push(pin);
  first.snapshot.routes[edge.id] = movePin(edge, pin.id, {
    x: pin.x + 5,
    y: pin.y + 38,
  });
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assertClear(repaired, r);
  const route = repaired.snapshot.routes[edge.id];
  assert.ok(pointOnRoute(route.pins[0], route.points));
  assert.equal(
    new Set(route.points.map((p) => p.x + "," + p.y)).size,
    route.points.length,
    "no duplicated vertices",
  );
  for (let i = 2; i < route.points.length; i++) {
    const a = route.points[i - 2],
      b = route.points[i - 1],
      c = route.points[i];
    assert.ok(
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0,
      "no immediate retracing",
    );
  }
  const again = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: repaired.snapshot,
  });
  assert.deepEqual(
    again.snapshot.routes,
    repaired.snapshot.routes,
    "settled repair is stable",
  );
});

test("repair restores a displaced card corridor and retires a legacy dragged trunk", async () => {
  const r = branching(),
    first = await run(r),
    branch = r.model.branches[0];
  const trunk = first.snapshot.trunks[branch.id],
    oldX = trunk.points.at(-1).x;
  trunk.points.at(-1).x += 12;
  trunk.manual = true;
  for (const id of branch.transitions) {
    const edge = first.snapshot.routes[id];
    edge.points = edge.points.map((p, i) =>
      i > 0 && p.x === oldX ? { ...p, x: p.x + 12 } : p,
    );
    edge.error = "等待修整";
  }
  const edge = first.snapshot.routes[branch.transitions[1]];
  // A previously valid endpoint-only repair missed the card while routing around it.
  edge.points = edge.points.map((p) =>
    p.y === edge.card.y ? { ...p, y: p.y - 24 } : p,
  );
  const result = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assertClear(result, r);
  assert.ok(!result.snapshot.trunks[branch.id].manual);
  assert.equal(result.snapshot.trunks[branch.id].points.at(-1).x, oldX);
  for (const id of branch.transitions)
    assert.deepEqual(
      result.snapshot.routes[id].card,
      first.snapshot.routes[id].card,
    );
});

test("moving a branch source keeps its card lanes and unrelated routes valid", async () => {
  const r = branching(),
    first = await run(r),
    source = r.model.records[0].id,
    p = first.snapshot.positions[source];
  const moved = moveNodes(first.snapshot, {
    [source]: { x: p.x + 12, y: p.y + 20 },
  });
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: moved,
  });
  assertClear(repaired, r);
  for (const [id, old] of Object.entries(first.snapshot.routes)) {
    if (old.card) assert.deepEqual(repaired.snapshot.routes[id].card, old.card);
    if (old.source !== source && old.target !== source)
      assert.deepEqual(repaired.snapshot.routes[id], old);
  }
});

test("freely moved card is an ordered route checkpoint, without dragging other cards or scenes", async () => {
  const r = branching(),
    first = await run(r),
    before = structuredClone(first.snapshot);
  const edge = Object.values(first.snapshot.routes).find((e) => e.card);
  const target = { x: edge.card.x + 100, y: edge.card.y - 180 };
  first.snapshot.routes[edge.id] = moveCard(edge, target);
  const next = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assertClear(next, r);
  assert.equal(next.snapshot.routes[edge.id].card.x, target.x);
  assert.equal(next.snapshot.routes[edge.id].card.y, target.y);
  assert.deepEqual(next.snapshot.positions, before.positions);
  for (const [id, old] of Object.entries(before.routes))
    if (id !== edge.id) assert.deepEqual(next.snapshot.routes[id], old);
});
test("multiple reroute pins retain connection order through large moves and a moved card", async () => {
  const r = branching(),
    first = await run(r),
    edge = Object.values(first.snapshot.routes).find((e) => e.card);
  // Two checkpoints in the free space after a branch card, as in the reported screenshot.
  freezeControlOrder(edge);
  edge.pins.push(
    {
      id: "one",
      x: edge.card.x + 180,
      y: edge.card.y,
      axis: "horizontal",
      direction: 1,
    },
    {
      id: "two",
      x: edge.card.x + 400,
      y: edge.card.y,
      axis: "horizontal",
      direction: 1,
    },
  );
  edge.controlOrder = ["card", "pin:one", "pin:two"];
  let edited = movePin(edge, "one", {
    x: edge.card.x + 180,
    y: edge.card.y - 240,
  });
  edited = movePin(edited, "two", {
    x: edge.card.x + 440,
    y: edge.card.y - 190,
  });
  first.snapshot.routes[edge.id] = edited;
  const next = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assertClear(next, r);
  const actual = next.snapshot.routes[edge.id];
  assert.deepEqual(actual.controlOrder, ["card", "pin:one", "pin:two"]);
  for (const p of actual.pins) assert.ok(pointOnRoute(p, actual.points));
  for (let i = 2; i < actual.points.length; i++) {
    const a = actual.points[i - 2],
      b = actual.points[i - 1],
      c = actual.points[i];
    assert.ok(
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0,
      "pin must not be a spur",
    );
  }
  const removed = removePin(actual, "one");
  next.snapshot.routes[edge.id] = removed;
  const result = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: next.snapshot,
  });
  assertClear(result, r);
  assert.deepEqual(
    result.snapshot.routes[edge.id].pins.map((p) => p.id),
    ["two"],
  );
});
test("card-only arrange resets selected routes and keeps all unselected geometry fixed", async () => {
  const r = branching(),
    first = await run(r),
    selected = r.model.branches[0].transitions.slice(0, 2);
  for (const [i, id] of selected.entries())
    first.snapshot.routes[id] = moveCard(first.snapshot.routes[id], {
      x: 500 + i * 100,
      y: -300 - i * 70,
    });
  const before = structuredClone(first.snapshot);
  const result = await run({
    ...r,
    scope: { kind: "selected", ids: [], cards: selected },
    snapshot: first.snapshot,
  });
  assertClear(result, r);
  assert.deepEqual(result.snapshot.positions, before.positions);
  assert.equal(
    new Set(selected.map((id) => result.snapshot.routes[id].card.x)).size,
    1,
  );
  assert.ok(
    result.snapshot.routes[selected[0]].card.y <
      result.snapshot.routes[selected[1]].card.y,
  );
  for (const [id, old] of Object.entries(before.routes))
    if (!selected.includes(id))
      assert.deepEqual(result.snapshot.routes[id], old);
});

test("legacy dragged segments are retired without moving nodes, cards or pins", async () => {
  const r = fixture(scene("A", "<<jump B>>") + scene("B", "hello"));
  const first = await run(r),
    old = first.snapshot;
  const edge = Object.values(old.routes)[0];
  const a = edge.points[0],
    b = edge.points.at(-1);
  edge.points = [
    a,
    { x: a.x + 40, y: a.y },
    { x: a.x + 40, y: a.y - 180 },
    { x: b.x - 40, y: a.y - 180 },
    { x: b.x - 40, y: b.y },
    b,
  ];
  edge.fixedSegments = [
    { id: "old-drag", a: edge.points[2], b: edge.points[3] },
  ];
  edge.controlOrder = ["segment:old-drag"];
  delete old.routing;
  const next = await run({ ...r, scope: { kind: "repair" }, snapshot: old });
  assert.deepEqual(next.snapshot.positions, old.positions);
  const route = next.snapshot.routes[edge.id];
  assert.deepEqual(route.fixedSegments, []);
  assert.deepEqual(route.pins, []);
  assert.equal(
    route.points.length,
    2,
    "aligned unobstructed endpoints need one straight line",
  );
});

test("pin is a turn point, not an invisible fixed direction corridor", async () => {
  const r = fixture(scene("A", "<<jump B>>") + scene("B", "hello"));
  const first = await run(r),
    edge = Object.values(first.snapshot.routes)[0];
  first.snapshot.positions[edge.source] = { x: 0, y: 0 };
  first.snapshot.positions[edge.target] = { x: 800, y: 0 };
  edge.pins = [{ id: "turn", x: 480, y: 220, axis: "vertical", direction: -1 }];
  edge.controlOrder = ["pin:turn"];
  edge.reroute = true;
  const next = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: first.snapshot,
  });
  assertClear(next, r);
  const route = next.snapshot.routes[edge.id],
    i = route.points.findIndex((p) => p.x === 480 && p.y === 220);
  assert.ok(i > 0 && i < route.points.length - 1);
  const a = route.points[i - 1],
    b = route.points[i + 1];
  assert.ok(a.x !== b.x && a.y !== b.y, "the pin can be the actual corner");
});

test("moving endpoints does not keep obsolete automatic bends or a backward trunk", async () => {
  const r = branching(),
    first = await run(r),
    branch = r.model.branches[0];
  const id = branch.source,
    p = first.snapshot.positions[id];
  const moved = moveNodes(first.snapshot, {
    [id]: { x: p.x + 80, y: p.y + 16 },
  });
  const next = await run({ ...r, scope: { kind: "repair" }, snapshot: moved });
  assertClear(next, r);
  const trunk = next.snapshot.trunks[branch.id];
  assert.ok(
    trunk.points[1].x > trunk.points[0].x,
    "exit stub still points out of the node",
  );
  assert.equal(trunk.points[1].x - trunk.points[0].x, 24);
  for (const route of Object.values(next.snapshot.routes))
    assert.equal(route.fixedSegments.length, 0);
});

test("worker and drag preview separate overlapping branch exits without moving cards", async () => {
  const r = fixture(
    scene("A", "-> One\n  <<jump B>>\n-> Two\n  <<jump C>>") +
      scene("B", "hello") +
      scene("C", "hello"),
  );
  const first = await run(r),
    s = first.snapshot;
  const [a, b, c] = r.model.records.map((r) => r.id);
  s.positions = {
    [a]: { x: 0, y: 0 },
    [b]: { x: 1000, y: 120 },
    [c]: { x: 1000, y: 280 },
  };
  const routes = Object.values(s.routes);
  for (const [i, edge] of routes.entries()) {
    edge.card = {
      x: 450,
      y: 50 + i * 80,
      width: 180,
      height: 38,
      manual: true,
    };
    edge.reroute = true;
  }
  const preview = previewRoutes(structuredClone(s), r.sizes);
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: preview,
  });
  assertClear(repaired, r);
  const after = Object.values(repaired.snapshot.routes);
  assert.equal(laneConflict(after[0], [after[1]], repaired.snapshot), 0);
  for (const edge of after) {
    assert.deepEqual(edge.card, s.routes[edge.id].card);
    assert.deepEqual(
      edge.points,
      preview.routes[edge.id].points,
      "release preserves the lane preview in a feasible corridor",
    );
  }
});
test("lane migration repairs overlap once without moving explicit controls", async () => {
  const r = branching(),
    first = await run(r),
    old = structuredClone(first.snapshot);
  delete old.lanes;
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: old,
  });
  assert.equal(repaired.snapshot.lanes, 2);
  assert.deepEqual(repaired.snapshot.positions, old.positions);
  for (const [id, edge] of Object.entries(old.routes)) {
    assert.deepEqual(repaired.snapshot.routes[id].pins, edge.pins);
    if (edge.card?.manual)
      assert.deepEqual(repaired.snapshot.routes[id].card, edge.card);
  }
  const again = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: repaired.snapshot,
  });
  assert.deepEqual(again.snapshot.routes, repaired.snapshot.routes);
});

test("shared departure with a pre-card pin stays direct in preview, worker and lane-v1 migration", async () => {
  const r = fixture(
    scene(
      "A",
      "-> One\n  <<jump B>>\n-> Two\n  <<jump C>>\n-> Three\n  <<jump D>>",
    ) +
      scene("B", "hello") +
      scene("C", "hello") +
      scene("D", "hello"),
  );
  const first = await run(r),
    s = first.snapshot;
  const [a, ...targets] = r.model.records.map((r) => r.id);
  s.positions = {
    [a]: { x: 0, y: 0 },
    ...Object.fromEntries(
      targets.map((id, i) => [id, { x: 1000, y: -180 + i * 100 }]),
    ),
  };
  const routes = Object.values(s.routes);
  for (const [i, edge] of routes.entries()) {
    edge.card = {
      x: 450,
      y: -130 + i * 90,
      width: 180,
      height: 38,
      manual: true,
    };
    edge.reroute = true;
  }
  const pinned = routes[1];
  pinned.pins = [{ id: "turn", x: 300, y: pinned.card.y }];
  pinned.controlOrder = ["pin:turn", "card"];
  const preview = previewRoutes(structuredClone(s), r.sizes);
  const repaired = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: preview,
  });
  assertClear(repaired, r);
  const direct = repaired.snapshot.routes[pinned.id];
  assert.deepEqual(direct.points, preview.routes[pinned.id].points);
  const beforeCard = direct.points.slice(
    0,
    direct.points.findIndex(
      (p) => p.x >= direct.card.x - direct.card.width / 2,
    ),
  );
  assert.ok(beforeCard.length >= 3);
  assert.ok(
    beforeCard.every((p) => p.y <= 50 && p.y >= pinned.card.y),
    "no opposite-direction dogleg between port and pin",
  );
  assert.deepEqual(direct.pins, pinned.pins);
  assert.deepEqual(direct.card, pinned.card);

  const legacy = structuredClone(repaired.snapshot);
  legacy.lanes = 1;
  const old = legacy.routes[pinned.id],
    pin = old.pins[0];
  const i = old.points.findIndex((p) => p.x === pin.x && p.y === pin.y);
  assert.ok(i > 0);
  old.points = [
    old.points[0],
    { x: 272, y: 50 },
    { x: 272, y: 82 },
    { x: 300, y: 82 },
    ...old.points.slice(i),
  ];
  const migrated = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: legacy,
  });
  assertClear(migrated, r);
  assert.deepEqual(migrated.snapshot.positions, legacy.positions);
  assert.deepEqual(
    migrated.snapshot.routes[pinned.id].points,
    direct.points,
    "retire the stored automatic dogleg",
  );
  for (const edge of Object.values(legacy.routes)) {
    assert.deepEqual(migrated.snapshot.routes[edge.id].pins, edge.pins);
    assert.deepEqual(migrated.snapshot.routes[edge.id].card, edge.card);
  }
  const again = await run({
    ...r,
    scope: { kind: "repair" },
    snapshot: migrated.snapshot,
  });
  assert.deepEqual(again.snapshot.routes, migrated.snapshot.routes);
});

test("appearance size repairs preserve positions, manual cards and pins", async () => {
  const request = fixture(
    scene("A", "-> Travel\n  <<jump B>>") + scene("B", "Hello"),
  );
  const initial = (await run(request)).snapshot;
  const route = Object.values(initial.routes)[0];
  assert.ok(route.card);
  route.card.manual = true;
  route.pins = [
    { id: "manual-pin", x: route.card.x + 180, y: route.card.y - 100 },
  ];
  const positions = structuredClone(initial.positions),
    card = { ...route.card };
  request.snapshot = initial;
  request.scope = { kind: "repair" };
  for (const size of Object.values(request.sizes)) size.height = 150;
  request.labels[route.id] = { text: "choice", width: 230, height: 80 };
  const result = (await run(request)).snapshot;
  assert.deepEqual(result.positions, positions);
  assert.deepEqual(result.routes[route.id].pins, route.pins);
  assert.equal(result.routes[route.id].card.x, card.x);
  assert.equal(result.routes[route.id].card.y, card.y);
  assert.equal(result.routes[route.id].card.height, 80);
});
