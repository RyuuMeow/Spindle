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
test("infeasible pin is retained and reported instead of silently removed", async () => {
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
  assert.deepEqual(next.snapshot.routes[edge.id].points, edge.points);
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
    times.push({
      nodes: count,
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

test("repair restores a displaced card corridor and keeps a manually moved shared trunk", async () => {
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
  assert.deepEqual(result.snapshot.trunks[branch.id], trunk);
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
