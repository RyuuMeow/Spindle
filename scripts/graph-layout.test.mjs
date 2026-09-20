import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  layoutGraph,
  routeConnections,
  rectsOverlap,
  segmentHitsRect,
} from "../app/graph-layout.ts";
import { parse, contextLabel } from "../app/parser.ts";

const edge = (source, target, id = `${source}-${target}`) => ({
  id,
  source,
  target,
});
const rect = (id, x, y) => ({
  id,
  x,
  y,
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
});
const geometry = (ids, edges) => {
  const positions = layoutGraph(ids, edges);
  return ids.map((id) => rect(id, positions[id].x, positions[id].y));
};
function assertNoCardIntersections(routes, cards) {
  for (const route of routes)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      assert.ok(
        a.x === b.x || a.y === b.y,
        `${route.id} has a diagonal segment`,
      );
      for (const card of cards)
        assert.equal(
          segmentHitsRect(a, b, card),
          false,
          `${route.id} crosses ${card.id}`,
        );
    }
}

test("branches progress toward their destination, with no overlapping cards", () => {
  const ids = ["start", "left", "right", "finish"];
  const edges = [
    edge("start", "left"),
    edge("start", "right"),
    edge("left", "finish"),
    edge("right", "finish"),
  ];
  const positions = layoutGraph(ids, edges),
    cards = geometry(ids, edges);
  assert.ok(
    positions.start.x < positions.left.x &&
      positions.left.x < positions.finish.x,
  );
  assert.equal(positions.left.x, positions.right.x);
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      assert.equal(rectsOverlap(cards[i], cards[j]), false);
  assertNoCardIntersections(routeConnections(cards, edges), cards);
});

test("feedback cycles terminate, external targets remain beyond the cycle, disconnected scenes survive", () => {
  const ids = ["start", "ask", "village", "external", "orphan"];
  const edges = [
    edge("start", "ask"),
    edge("ask", "village"),
    edge("village", "start"),
    edge("village", "external"),
  ];
  const positions = layoutGraph(ids, edges);
  assert.deepEqual(Object.keys(positions).sort(), ids.slice().sort());
  assert.ok(positions.external.x > positions.village.x);
  assert.deepEqual(
    layoutGraph(ids, edges),
    positions,
    "layout should be deterministic",
  );
  const cards = geometry(ids, edges);
  assertNoCardIntersections(routeConnections(cards, edges), cards);
});

test("a connection goes around an intervening card instead of passing behind its text", () => {
  const cards = [
    rect("source", 0, 100),
    rect("obstacle", 524, 100),
    rect("target", 1048, 100),
  ];
  const [route] = routeConnections(cards, [edge("source", "target")]);
  assertNoCardIntersections([route], cards);
  assert.ok(
    route.points.some((point) => point.y < 100 || point.y > 280),
    "path needs a separate lane",
  );
});

test("a self-loop has a visible path outside its own card", () => {
  const cards = [rect("start", 70, 80)];
  const [route] = routeConnections(cards, [edge("start", "start")]);
  assertNoCardIntersections([route], cards);
  assert.ok(route.points.some((point) => point.x > 70 + CARD_WIDTH));
  assert.ok(route.points.some((point) => point.y < 80));
  assert.notEqual(route.sourceSide, route.targetSide);
});

test("labels stay off cards and each other, and later connections route around reserved labels", () => {
  const ids = ["a", "b", "c", "missing", "dynamic", "external"];
  const edges = [
    edge("a", "b"),
    edge("a", "a"),
    edge("a", "missing"),
    edge("a", "dynamic"),
    edge("b", "c"),
    edge("c", "a"),
    edge("b", "external"),
  ];
  const cards = geometry(ids, edges),
    routes = routeConnections(cards, edges);
  assertNoCardIntersections(routes, cards);
  for (let i = 0; i < routes.length; i++) {
    for (const card of cards)
      assert.equal(
        rectsOverlap(routes[i].labelRect, card),
        false,
        `${routes[i].id} label overlaps ${card.id}`,
      );
    for (let j = 0; j < i; j++) {
      assert.equal(
        rectsOverlap(routes[i].labelRect, routes[j].labelRect),
        false,
        "labels overlap",
      );
      for (let k = 1; k < routes[i].points.length; k++)
        assert.equal(
          segmentHitsRect(
            routes[i].points[k - 1],
            routes[i].points[k],
            routes[j].labelRect,
          ),
          false,
          `${routes[i].id} crosses ${routes[j].id} label`,
        );
    }
  }
});

test("empty and single-scene stories do not invent nodes or connections", () => {
  assert.deepEqual(layoutGraph([], []), {});
  assert.deepEqual(routeConnections([], []), []);
  assert.deepEqual(Object.keys(layoutGraph(["only"], [])), ["only"]);
});

test("opposite directions use separate ports and route lanes", () => {
  for (const cards of [
    [rect("a", 0, 0), rect("b", 460, 0)],
    [rect("a", 0, 0), rect("b", 0, 240)],
  ]) {
    const [forward, backward] = routeConnections(cards, [
      edge("a", "b"),
      edge("b", "a"),
    ]);
    assertNoCardIntersections([forward, backward], cards);
    assert.notDeepEqual(forward.points[0], backward.points.at(-1));
    assert.notDeepEqual(forward.points.at(-1), backward.points[0]);
    assert.notDeepEqual(forward.points, backward.points.slice().reverse());
  }
});

test("content heights affect layout and every route uses actual card bounds", () => {
  const ids = ["a", "b", "c"];
  const edges = [edge("a", "b"), edge("b", "a"), edge("a", "c")];
  const heights = { a: 220, b: 50, c: 66 };
  const positions = layoutGraph(ids, edges, heights);
  const cards = ids.map((id) => ({
    ...rect(id, positions[id].x, positions[id].y),
    height: heights[id],
  }));
  assert.ok(positions.b.x > positions.a.x, "cycle forward edge retains reading direction");
  assert.ok(positions.c.y >= positions.b.y + heights.b, "same-column cards respect measured height");
  for(let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) assert.equal(rectsOverlap(cards[i],cards[j]),false);
  assertNoCardIntersections(routeConnections(cards, edges), cards);
});

test("visible labels stay attached to their own path, and direct transitions need no reserved badge", () => {
  const cards = [rect("a", 0, 0), rect("b", 460, 0), rect("c", 460, 230)];
  const routes = routeConnections(cards, [
    edge("a", "b"),
    { ...edge("a", "c"), label: false },
  ]);
  assert.equal(routes[1].labelVisible, false);
  for (const route of routes.filter((route) => route.labelVisible)) {
    assert.ok(
      route.points.slice(1).some((b, index) => {
        const a = route.points[index],
          p = route.labelAnchor || route.labelPoint;
        return a.x === b.x
          ? p.x === a.x &&
              p.y >= Math.min(a.y, b.y) &&
              p.y <= Math.max(a.y, b.y)
          : p.y === a.y &&
              p.x >= Math.min(a.x, b.x) &&
              p.x <= Math.max(a.x, b.x);
      }),
      "a label must not become a detached floating relationship",
    );
  }
});

function parseStory(body) {
  const text = `title: Start\n---\n${body}\n===\ntitle: Shop\n---\n店\n===\ntitle: Home\n---\n家\n===`;
  return parse([{ name: "test.yarn", text, saved: text }], []);
}

test("graph links retain outer conditions, nested choice ancestry and inline option conditions", () => {
  const result = parseStory(`<<if $has_key>>
-> 購買 <<if $gold > 3>>
    -> 買道具
        <<if $stock > 0>>
            <<jump Shop>>
        <<endif>>
<<endif>>
<<jump Home>>`);
  assert.deepEqual(
    result.links[0].context.map((item) => [item.kind, item.text]),
    [
      ["if", "$has_key"],
      ["option", "購買"],
      ["if", "$gold > 3"],
      ["option", "買道具"],
      ["if", "$stock > 0"],
    ],
  );
  assert.deepEqual(
    result.links[1].context,
    [],
    "shared content must not inherit an ended choice or condition",
  );
  assert.equal(result.links[0].unresolved, false);
  assert.deepEqual(result.issues, []);
});

test("elseif and else preserve all previous branches without evaluating expressions", () => {
  const result = parseStory(`<<if $has_key>>
    <<if $gold > 5>>
        <<jump Shop>>
    <<elseif $coupon>>
        <<detour Shop>>
    <<else>>
        <<jump Home>>
    <<endif>>
<<endif>>`);
  assert.equal(result.links[1].kind, "detour");
  assert.deepEqual(result.links[1].context[1].preceding, ["$gold > 5"]);
  assert.deepEqual(result.links[2].context[1].preceding, [
    "$gold > 5",
    "$coupon",
  ]);
  for (const link of result.links)
    assert.equal(link.context[0].text, "$has_key");
  assert.match(
    contextLabel(result.links[2].context[1]),
    /\$gold > 5.*\$coupon/,
  );
  assert.deepEqual(result.issues, []);
});

test("incomplete condition blocks mark graph relationships as unresolved", () => {
  const result = parseStory("<<if $key>>\n<<jump Shop>>");
  assert.equal(result.links[0].unresolved, true);
  assert.ok(
    result.issues.some((issue) => issue.message.includes("缺少 endif")),
  );
  const missingExpression = parseStory("-> 選项 <<if>>\n    <<jump Shop>>");
  assert.equal(missingExpression.links[0].unresolved, true);
  assert.ok(
    missingExpression.issues.some((issue) =>
      issue.message.includes("if 缺少條件"),
    ),
  );
  const unfinishedExpression = parseStory(
    "-> 選項 <<if $key\n    <<jump Shop>>",
  );
  assert.equal(unfinishedExpression.links[0].unresolved, true);
  const orphanElse = parseStory("<<else>>\n<<jump Shop>>");
  assert.equal(orphanElse.links[0].unresolved, true);
});


test("unrelated scene movement preserves connection geometry and feedback lanes", () => {
  const cards = [rect("a", 0, 100), rect("b", 460, 100), rect("other", 0, 600)];
  const edges = [edge("a", "b"), edge("b", "a")];
  const before = routeConnections(cards, edges);
  const after = routeConnections(cards.map(r => r.id === "other" ? {...r, y:-300} : r), edges, before);
  assert.deepEqual(after.map(r=>r.path),before.map(r=>r.path));
});
test("moving a sibling target does not reshuffle ports on a stationary branch", () => {
  const cards = [rect("a",0,0),rect("b",460,0),rect("c",460,300)];
  const edges = [edge("a","b"),edge("a","c")];
  const before = routeConnections(cards,edges);
  const after = routeConnections(cards.map(r=>r.id==="c"?{...r,y:-250}:r),edges,before);
  assert.equal(after[0].path,before[0].path);
  assert.notEqual(after[1].path,before[1].path);
});
test("a moved obstacle invalidates only the paths it now obstructs", () => {
  const cards = [rect("a",0,0),rect("b",700,0),rect("obstacle",350,350),rect("c",0,700),rect("d",700,700)];
  const edges=[edge("a","b"),edge("c","d")];
  const before=routeConnections(cards,edges),moved=cards.map(r=>r.id==="obstacle"?{...r,y:0}:r);
  const after=routeConnections(moved,edges,before);
  assert.notEqual(after[0].path,before[0].path);assert.equal(after[1].path,before[1].path);
  assertNoCardIntersections(after,moved);
});
test("compressed real gaps remain direct instead of producing escape loops",()=>{
  for(const gap of [4,12,28,40]) {
    const cards=[rect("a",0,0),rect("b",CARD_WIDTH+gap,0)];
    const [route]=routeConnections(cards,[edge("a","b")]);
    assertNoCardIntersections([route],cards);assert.equal(route.points.length,2);
    assert.equal(route.points[1].x-route.points[0].x,gap);
  }
});
test("long labels cannot force unrelated lines into detours",()=>{
  const ids=["a","b","c","d"],edges=[edge("a","b"),edge("a","c"),edge("b","d"),edge("c","a")];
  const cards=geometry(ids,edges);
  const labelled=routeConnections(cards,edges.map(e=>({...e,labelWidth:220})));
  const plain=routeConnections(cards,edges.map(e=>({...e,label:false})));
  assert.deepEqual(labelled.map(r=>r.path),plain.map(r=>r.path));
});
