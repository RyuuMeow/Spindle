import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../app/parser.ts";
import { buildGraphModel } from "../app/graph/model.ts";
import {
  migrateLayout,
  moveNodes,
  simplify,
  validSnapshot,
} from "../app/graph/layout-state.ts";
function graph(text, prior, previousText) {
  const documents = [
    { id: "doc-1", name: "story.yarn", text, saved: text, version: 0 },
  ];
  const parsed = parse(documents, []);
  return buildGraphModel({
    file: "story.yarn",
    ...parsed,
    documents,
    anchors: prior?.anchors,
    previousTexts: previousText ? { "doc-1": previousText } : undefined,
  });
}
const scene = (name, body) => "title: " + name + "\n---\n" + body + "\n===\n";
test("independent same-destination branches retain source order and grouping", () => {
  const g = graph(
    scene(
      "Start",
      "<<if $a>>\n<<jump End>>\n<<elseif $b>>\n<<jump End>>\n<<else>>\n<<jump End>>\n<<endif>>\n<<if $c>>\n<<jump End>>\n<<endif>>",
    ) + scene("End", "end"),
  );
  assert.equal(g.groups.length, 4);
  assert.equal(g.branches.length, 2);
  assert.equal(g.branches[0].transitions.length, 3);
  assert.equal(new Set(g.groups.map((g) => g.id)).size, 4);
  assert.deepEqual(
    g.groups.map((g) => g.order),
    [0, 1, 2, 3],
  );
});
test("nested option/condition groups keep parent relationship, incomplete blocks stay unresolved", () => {
  const g = graph(
    scene(
      "Start",
      "-> One\n  <<if $a>>\n  <<jump End>>\n  <<else>>\n  <<jump Start>>\n  <<endif>>\n-> Two\n  <<jump End>>",
    ) + scene("End", "end"),
  );
  assert.equal(g.branches.length, 2);
  assert.equal(g.branches[1].parentId, g.branches[0].id);
  const bad = graph(scene("Start", "<<if $a>>\n<<jump End>>"));
  assert.equal(bad.groups.length, 1);
  assert.equal(bad.groups[0].items[0].unresolved, true);
  assert.equal(bad.branches.length, 0);
});
test("live text insertion and scene/file rename retain mapped identities", () => {
  const text = scene("Start", "A: Hello\n<<jump End>>") + scene("End", "end");
  const a = graph(text);
  const next = text.replace("A: Hello", "A: Hello\nA: More");
  const b = graph(next, a, text);
  assert.deepEqual(
    b.records.map((r) => r.id),
    a.records.map((r) => r.id),
  );
  assert.equal(b.groups[0].id, a.groups[0].id);
  const renamed = next.replace("title: Start", "title: Opening");
  const c = graph(renamed, b, next);
  assert.equal(c.records[0].id, b.records[0].id);
  const d = buildGraphModel({
    file: "moved.yarn",
    ...parse([{ name: "moved.yarn", text: renamed, saved: renamed }], []),
    documents: [{ id: "doc-1", name: "moved.yarn", text: renamed, version: 1 }],
    anchors: c.anchors,
  });
  assert.deepEqual(
    d.records.map((r) => r.id),
    c.records.map((r) => r.id),
  );
});
test("v1 migration preserves coordinates and never requests initial rearrangement", () => {
  const g = graph(scene("Start", "a"));
  const old = { positions: { [g.records[0].node.id]: { x: 45, y: 81 } } };
  const s = migrateLayout(old, g);
  assert.equal(s.initialized, true);
  assert.deepEqual(s.positions[g.records[0].id], { x: 45, y: 81 });
  assert.equal(validSnapshot(s), true);
});
test("group move transports interior pins/cards and preserves exterior geometry", () => {
  const s = {
    schema: 2,
    revision: 0,
    initialized: true,
    positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 500, y: 0 } },
    trunks: {},
    routes: {
      x: {
        id: "x",
        source: "a",
        target: "b",
        sourceSide: "right",
        targetSide: "left",
        points: [
          { x: 20, y: 0 },
          { x: 200, y: 0 },
        ],
        pins: [{ id: "p", x: 100, y: 0 }],
        fixedSegments: [],
        card: { x: 100, y: 0, width: 160, height: 32 },
      },
      y: {
        id: "y",
        source: "b",
        target: "c",
        sourceSide: "right",
        targetSide: "left",
        points: [
          { x: 220, y: 0 },
          { x: 500, y: 0 },
        ],
        pins: [],
        fixedSegments: [],
      },
    },
  };
  const n = moveNodes(s, { a: { x: 30, y: 50 }, b: { x: 230, y: 50 } });
  assert.deepEqual(n.routes.x.pins, [{ id: "p", x: 130, y: 50 }]);
  assert.deepEqual(n.routes.y, { ...s.routes.y, controlOrder: [], reroute: true });
  assert.deepEqual(
    simplify(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      [{ x: 10, y: 0 }],
    ),
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ],
  );
});
