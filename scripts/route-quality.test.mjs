import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
await build({
  stdin: {
    contents:
      'export * from "./app/graph/route-lanes.ts"; export * from "./app/graph/route-snapping.ts"; export * from "./app/graph/manual-routing.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "outputs/route-quality-test.mjs",
});
const { separateLanes, snapObjects, snapPin, moveObjects, laneConflict } =
  await import("../outputs/route-quality-test.mjs");
const route = (id, source, target, points, extra = {}) => ({
  id,
  source,
  target,
  sourceSide: "right",
  targetSide: "left",
  points,
  pins: [],
  fixedSegments: [],
  ...extra,
});
const p = (x, y) => ({ x, y });
const state = (...routes) => ({
  schema: 2,
  routing: "pins",
  lanes: 1,
  initialized: true,
  revision: 0,
  positions: {},
  trunks: {},
  routes: Object.fromEntries(routes.map((r) => [r.id, r])),
});
const different = () =>
  state(
    route("a", "s", "t1", [p(0, 0), p(300, 0), p(300, 160), p(600, 160)], {
      card: { x: 140, y: 0, width: 160, height: 32 },
    }),
    route(
      "b",
      "s",
      "t2",
      [p(0, 0), p(24, 0), p(24, 80), p(300, 80), p(300, 320), p(600, 320)],
      { card: { x: 140, y: 80, width: 160, height: 32 } },
    ),
  );
function overlaps(a, b) {
  let n = 0;
  for (let i = 1; i < a.points.length; i++)
    for (let j = 1; j < b.points.length; j++) {
      const p = a.points[i - 1],
        q = a.points[i],
        r = b.points[j - 1],
        s = b.points[j];
      if (
        p.x === q.x &&
        r.x === s.x &&
        Math.abs(p.x - r.x) < 16 &&
        p.x > 200 &&
        r.x > 200
      )
        n += Math.max(
          0,
          Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) -
            Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)),
        );
    }
  return n;
}
test("different destinations receive parallel lanes after their cards", () => {
  const s = different(),
    a = structuredClone(s.routes.a);
  assert.ok(overlaps(s.routes.a, s.routes.b) > 0);
  separateLanes(s, [], new Set(["b"]));
  assert.equal(overlaps(s.routes.a, s.routes.b), 0);
  assert.deepEqual(s.routes.a, a, "unaffected line stays point-for-point");
  assert.equal(
    s.routes.b.points.filter((p) => p.x === 316 || p.x === 284).length >= 2,
    true,
    "parallel offset is 16",
  );
  assert.deepEqual(s.routes.b.card, { x: 140, y: 80, width: 160, height: 32 });
});
test("same destination can share the co-directed final approach", () => {
  const a = route("a", "s1", "end", [
    p(0, 0),
    p(300, 0),
    p(300, 200),
    p(600, 200),
  ]);
  const b = route("b", "s2", "end", [
    p(0, 80),
    p(300, 80),
    p(300, 200),
    p(600, 200),
  ]);
  const s = state(a, b),
    before = structuredClone(s);
  separateLanes(s, [], new Set(["a", "b"]));
  assert.deepEqual(s, before);
  assert.equal(laneConflict(a, [b], s), 0);
});
test("same destination does not permit opposite-direction or pre-card overlap", () => {
  const a = route("a", "s1", "end", [
    p(0, 0),
    p(300, 0),
    p(300, 200),
    p(600, 200),
  ]);
  const b = route("b", "s2", "end", [
    p(400, 200),
    p(300, 200),
    p(300, 0),
    p(600, 0),
    p(600, 200),
  ]);
  assert.ok(laneConflict(a, [b], state(a, b)) > 0);
  const s = different();
  s.routes.b.target = s.routes.a.target;
  s.routes.b.card = { x: 460, y: 320, width: 160, height: 32 };
  assert.ok(laneConflict(s.routes.a, [s.routes.b], s) > 0);
});
test("parallel spacing applies to horizontal lanes too and retains pins", () => {
  const a = route("a", "s1", "t1", [
    p(0, 0),
    p(80, 0),
    p(80, 200),
    p(500, 200),
    p(500, 400),
    p(600, 400),
  ]);
  const b = route(
    "b",
    "s2",
    "t2",
    [
      p(0, 100),
      p(120, 100),
      p(120, 200),
      p(450, 200),
      p(450, 500),
      p(600, 500),
    ],
    { pins: [{ id: "p", x: 450, y: 500 }], controlOrder: ["pin:p"] },
  );
  const s = state(a, b);
  separateLanes(s, [], new Set(["b"]));
  assert.equal(laneConflict(b, [a], s), 0);
  assert.deepEqual(b.pins, [{ id: "p", x: 450, y: 500 }]);
});
test("lane spacing respects obstacles and does not introduce tiny steps", () => {
  const s = different();
  separateLanes(
    s,
    [{ id: "block", x: 305, y: 100, width: 30, height: 50 }],
    new Set(["b"]),
  );
  assert.equal(overlaps(s.routes.a, s.routes.b), 0);
  assert.ok(
    s.routes.b.points.some((p) => p.x === 284),
    "blocked right lane uses left lane",
  );
});
test("close card, scene and pin align to connected centers; outside threshold stays free", () => {
  const r = route("r", "a", "b", [p(232, 50), p(800, 50)], {
    card: { x: 450, y: 56, width: 160, height: 32 },
  });
  const s = state(r);
  s.positions = { a: p(0, 0), b: p(800, 0) };
  const sizes = {
    a: { width: 232, height: 100 },
    b: { width: 232, height: 100 },
  };
  const snapped = snapObjects(s, { r: p(370, 40) }, sizes);
  assert.equal(snapped.r.y, 34, "card center snaps 56 to50");
  const preview = moveObjects(s, snapped, sizes);
  assert.equal(preview.routes.r.card.y, 50);
  assert.equal(preview.routes.r.points.length, 2, "no tiny jog at either end");
  assert.deepEqual(
    snapObjects(s, { r: p(370, 50) }, sizes),
    { r: p(370, 50) },
    "16-unit intentional offset survives",
  );
  assert.deepEqual(
    snapObjects(s, { b: p(800, 2) }, sizes),
    { b: p(800, 6) },
    "scene center aligns to card without moving the card",
  );
  assert.deepEqual(snapPin(s, r, "pin", p(797, 55), sizes), p(800, 56));
});
test("mixed selection snaps as a rigid group and never chases its own members", () => {
  const r = route("r", "a", "b", [p(232, 50), p(800, 50)], {
    card: { x: 450, y: 50, width: 160, height: 32 },
  });
  const s = state(r);
  s.positions = { a: p(0, 0), b: p(800, 0) };
  const sizes = {
    a: { width: 232, height: 100 },
    b: { width: 232, height: 100 },
  };
  const moved = { a: p(12, 5), r: p(382, 39) };
  const snap = snapObjects(s, moved, sizes);
  assert.equal(snap.a.y, 0);
  assert.equal(snap.r.y, 34);
  assert.equal(snap.r.y - moved.r.y, snap.a.y - moved.a.y);
  assert.deepEqual(s.positions, { a: p(0, 0), b: p(800, 0) });
});
test("multiple destinations stay separated and repeated repair stays stable", () => {
  const s = different();
  s.routes.c = route(
    "c",
    "s",
    "t3",
    [p(0, 0), p(24, 0), p(24, 140), p(300, 140), p(300, 460), p(600, 460)],
    { card: { x: 140, y: 140, width: 160, height: 32 } },
  );
  separateLanes(s, [], new Set(["a", "b", "c"]));
  for (const [i, a] of Object.values(s.routes).entries())
    for (const b of Object.values(s.routes).slice(i + 1))
      assert.equal(overlaps(a, b), 0);
  const before = structuredClone(s);
  separateLanes(s, [], new Set(["a", "b", "c"]));
  assert.deepEqual(s, before);
});

test("vertical port snapping uses its transverse axis without shifting travel distance", () => {
  const r = route("r", "a", "b", [p(116, 100), p(116, 400)], {
    sourceSide: "bottom",
    targetSide: "top",
  });
  const s = state(r);
  s.positions = { a: p(0, 0), b: p(0, 400) };
  const sizes = {
    a: { width: 232, height: 100 },
    b: { width: 232, height: 100 },
  };
  assert.deepEqual(snapObjects(s, { b: p(6, 405) }, sizes), { b: p(0, 405) });
});

test("same source shares the departure path beyond the fixed trunk, including pin corners", () => {
  const a = route(
    "a",
    "s",
    "t1",
    [p(0, 0), p(40, 0), p(40, -180), p(600, -180)],
    {
      card: { x: 300, y: -180, width: 160, height: 32 },
      groupId: "first",
    },
  );
  const b = route(
    "b",
    "s",
    "t2",
    [p(0, 0), p(40, 0), p(40, -100), p(600, -100)],
    {
      card: { x: 300, y: -100, width: 160, height: 32 },
      groupId: "second",
      pins: [{ id: "corner", x: 40, y: -100 }],
      controlOrder: ["pin:corner", "card"],
    },
  );
  const s = state(a, b),
    before = structuredClone(s);
  assert.equal(
    laneConflict(b, [a], s),
    0,
    "the common departure is not a conflict",
  );
  separateLanes(s, [], new Set(["b"]));
  assert.deepEqual(
    s,
    before,
    "do not add a dogleg to separate the shared prefix",
  );
});

test("same-source sharing follows the actual split, independent of collinear pin vertices or port side", () => {
  for (const vertical of [false, true]) {
    const transform = (p) => (vertical ? { x: p.y, y: p.x } : p);
    const a = route(
      "a",
      "s",
      "t1",
      [p(0, 0), p(120, 0), p(120, 160), p(600, 160)].map(transform),
    );
    const b = route(
      "b",
      "s",
      "t2",
      [p(0, 0), p(60, 0), p(120, 0), p(120, 320), p(700, 320)].map(transform),
      {
        pins: [{ id: "along", ...transform(p(60, 0)) }],
        controlOrder: ["pin:along"],
      },
    );
    if (vertical) a.sourceSide = b.sourceSide = "bottom";
    const s = state(a, b),
      before = structuredClone(s);
    assert.equal(laneConflict(a, [b], s), 0);
    assert.equal(laneConflict(b, [a], s), 0);
    separateLanes(s, [], new Set(["a", "b"]));
    assert.deepEqual(s, before);
  }
});

test("same source does not allow unrelated ports, reverse travel, or rejoining after a split", () => {
  const a = route("a", "s", "t1", [
    p(0, 0),
    p(200, 0),
    p(200, 100),
    p(600, 100),
  ]);
  const b = route("b", "s", "t2", [
    p(0, 0),
    p(80, 0),
    p(80, 200),
    p(300, 200),
    p(300, 100),
    p(700, 100),
  ]);
  assert.ok(
    laneConflict(a, [b], state(a, b)) > 0,
    "same-source routes cannot rejoin after splitting toward different targets",
  );
  const reverse = route("reverse", "s", "t3", [
    p(0, 0),
    p(40, 0),
    p(40, -100),
    p(200, -100),
    p(200, 100),
    p(100, 100),
    p(100, 300),
  ]);
  assert.ok(laneConflict(a, [reverse], state(a, reverse)) > 0);
  const anotherPort = { ...a, id: "port", target: "t4", sourceSide: "bottom" };
  assert.ok(laneConflict(a, [anotherPort], state(a, anotherPort)) > 0);
});
