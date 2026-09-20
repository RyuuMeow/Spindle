import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type { GraphRect, Point, Side } from "../graph-layout";
import { segmentHitsRect, rectsOverlap } from "../graph-layout";
import { avoidRoutes } from "./avoid";
import {
  center,
  cloneLayout,
  simplify,
  pointOnRoute,
  cardOnRoute,
  type GraphLayoutRequest,
  type GraphLayoutResult,
  type RouteGeometry,
  type CardAnchor,
} from "./layout-state";

const GAP = 16,
  STUB = 24;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const boxOf = (id: string, card: CardAnchor): GraphRect => ({
  id,
  x: card.x - card.width / 2,
  y: card.y - card.height / 2,
  width: card.width,
  height: card.height,
});
const expand = (r: GraphRect, n: number): GraphRect => ({
  ...r,
  x: r.x - n,
  y: r.y - n,
  width: r.width + n * 2,
  height: r.height + n * 2,
});
function outside(p: Point, side: Side, n = STUB): Point {
  return {
    x: p.x + (side === "right" ? n : side === "left" ? -n : 0),
    y: p.y + (side === "bottom" ? n : side === "top" ? -n : 0),
  };
}
function clear(points: Point[], boxes: GraphRect[]) {
  return (
    points.length >= 2 &&
    points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    points
      .slice(1)
      .every(
        (p, i) =>
          (p.x === points[i].x || p.y === points[i].y) &&
          !boxes.some((b) => segmentHitsRect(points[i], p, b)),
      )
  );
}
function ports(id: string, width: number, height: number) {
  return [
    {
      id: id + ":in",
      x: 0,
      y: height / 2,
      width: 0,
      height: 0,
      layoutOptions: { "elk.port.side": "WEST" },
    },
    {
      id: id + ":out",
      x: width,
      y: height / 2,
      width: 0,
      height: 0,
      layoutOptions: { "elk.port.side": "EAST" },
    },
  ];
}
export async function computeLayout(
  request: GraphLayoutRequest,
  wasmUrl?: string,
  engine?: ELK,
): Promise<GraphLayoutResult> {
  const started = performance.now(),
    { model, sizes, labels } = request;
  const state = cloneLayout(request.snapshot),
    errors: string[] = [];
  if (!engine) throw Error("ELK engine is required");
  const all = request.scope.kind === "all";
  const chosen = new Set(
    all
      ? model.records.map((r) => r.id)
      : request.scope.kind === "selected"
        ? request.scope.ids
        : [],
  );
  const rearrange = request.scope.kind !== "repair";
  const activeIds = new Set(model.records.map((r) => r.id));
  const edgeIds = new Set(model.groups.map((r) => r.id));
  state.positions = Object.fromEntries(
    Object.entries(state.positions).filter(([id]) => activeIds.has(id)),
  );
  state.routes = Object.fromEntries(
    Object.entries(state.routes).filter(([id]) => edgeIds.has(id)),
  );
  state.trunks = Object.fromEntries(
    Object.entries(state.trunks).filter(([id]) =>
      model.branches.some((b) => b.id === id),
    ),
  );
  const size = (id: string) => sizes[id] || { width: 232, height: 108 };
  const branchComplete = (id: string) =>
    model.branches
      .find((b) => b.id === id)
      ?.transitions.every((e) => {
        const edge = model.groups.find((g) => g.id === e)!;
        return chosen.has(edge.source) && chosen.has(edge.target);
      });
  const resetEdges = new Set(
    model.groups
      .filter(
        (e) =>
          rearrange &&
          chosen.has(e.source) &&
          chosen.has(e.target) &&
          (!e.groupId || branchComplete(e.groupId)),
      )
      .map((e) => e.id),
  );
  for (const id of resetEdges) delete state.routes[id];
  for (const branch of model.branches)
    if (all || (rearrange && branchComplete(branch.id)))
      delete state.trunks[branch.id];
  for (const [id, route] of Object.entries(state.routes)) {
    const label = labels[id];
    if (route.card && label)
      route.card = { ...route.card, width: label.width, height: label.height };
  }
  const cardSlots = new Map<string, CardAnchor>();
  const groupPositions = new Map<string, Point>();
  if (rearrange && chosen.size) {
    const children: ElkNode[] = model.records
      .filter((r) => chosen.has(r.id))
      .map((r) => ({
        id: r.id,
        ...size(r.id),
        ports: ports(r.id, size(r.id).width, size(r.id).height),
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      }));
    const complete = model.branches.filter((b) => branchComplete(b.id));
    for (const branch of complete) {
      const members = model.groups.filter((e) => e.groupId === branch.id);
      const width = Math.max(
        160,
        ...members.map((e) => labels[e.id]?.width || 160),
      );
      let y = 16;
      const cards: ElkNode[] = members.map((e) => {
        const height = labels[e.id]?.height || 32;
        const card = { id: "card:" + e.id, x: 16, y, width, height };
        y += height + 24;
        return card;
      });
      children.push({
        id: branch.id,
        width: width + 32,
        height: Math.max(48, y - 8),
        children: cards,
        layoutOptions: {
          "elk.algorithm": "fixed",
          "elk.portConstraints": "FIXED_POS",
        },
        ports: ports(branch.id, width + 32, Math.max(48, y - 8)),
      });
    }
    const feedback = new Set<string>(),
      active = new Set<string>(),
      seenNodes = new Set<string>();
    function visit(id: string) {
      seenNodes.add(id);
      active.add(id);
      for (const e of model.groups.filter((e) => e.source === id)) {
        if (active.has(e.target)) feedback.add(e.id);
        else if (!seenNodes.has(e.target)) visit(e.target);
      }
      active.delete(id);
    }
    model.records.forEach((r) => {
      if (!seenNodes.has(r.id)) visit(r.id);
    });
    const edges: ElkExtendedEdge[] = [];
    const seen = new Set<string>();
    function edge(source: string, target: string, id: string) {
      const key = source + "|" + target;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ id, sources: [source + ":out"], targets: [target + ":in"] });
    }
    for (const e of model.groups.filter(
      (e) => chosen.has(e.source) && chosen.has(e.target),
    )) {
      let source = e.source;
      for (const group of e.groupPath.filter((id) =>
        complete.some((b) => b.id === id),
      )) {
        edge(source, group, "trunk:" + source + group);
        source = group;
      }
      if (!feedback.has(e.id)) edge(source, e.target, e.id);
    }
    const output: ElkNode = await engine.layout({
      id: "graph",
      children,
      edges,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.randomSeed": "42",
        "elk.spacing.nodeNode": "64",
        "elk.layered.spacing.nodeNodeBetweenLayers": "100",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      },
    });
    const oldSelected = Object.entries(state.positions).filter(([id]) =>
      chosen.has(id),
    );
    const offset =
      all || !oldSelected.length
        ? { x: 0, y: 0 }
        : {
            x: Math.min(...oldSelected.map(([, p]) => p.x)),
            y: Math.min(...oldSelected.map(([, p]) => p.y)),
          };
    const exterior = model.records
      .filter((r) => !chosen.has(r.id) && state.positions[r.id])
      .map((r) => ({ id: r.id, ...state.positions[r.id], ...size(r.id) }));
    // Translate only the arranged subset when its measured envelope meets a fixed obstacle.
    const bounds = {
      id: "scope",
      x: offset.x,
      y: offset.y,
      width: output.width || 1,
      height: output.height || 1,
    };
    for (let tries = 0; tries < exterior.length + 1; tries++) {
      const hit = exterior.find((b) => rectsOverlap(expand(bounds, 24), b));
      if (!hit) break;
      bounds.y = hit.y + hit.height + 64;
    }
    for (const item of output.children || []) {
      const p = { x: (item.x || 0) + bounds.x, y: (item.y || 0) + bounds.y };
      if (chosen.has(item.id)) state.positions[item.id] = p;
      else {
        groupPositions.set(item.id, p);
        for (const card of item.children || [])
          cardSlots.set(card.id.slice(5), {
            x: p.x + (card.x || 0) + (card.width || 160) / 2,
            y: p.y + (card.y || 0) + (card.height || 32) / 2,
            width: card.width || 160,
            height: card.height || 32,
          });
      }
    }
  }
  // Added objects occupy a nearby vacant slot; existing objects never get repacked.
  for (const record of model.records)
    if (!state.positions[record.id]) {
      const neighbor = model.groups.find(
        (e) => e.target === record.id && state.positions[e.source],
      );
      const base = neighbor ? state.positions[neighbor.source] : { x: 0, y: 0 };
      const p = {
        x: base.x + (neighbor ? size(neighbor.source).width + 360 : 0),
        y: base.y,
      };
      for (let n = 0; n < model.records.length + 1; n++) {
        const hit = Object.entries(state.positions).some(([id, q]) =>
          rectsOverlap(expand({ id, ...q, ...size(id) }, 32), {
            id: record.id,
            ...p,
            ...size(record.id),
          }),
        );
        if (!hit) break;
        p.y += size(record.id).height + 64;
      }
      state.positions[record.id] = p;
    }
  const boxes = model.records.map((r) => ({
    id: r.id,
    ...state.positions[r.id],
    ...size(r.id),
  }));
  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const trunk of Object.values(state.trunks)) {
    const source = byId.get(trunk.source);
    if (!source || trunk.points.length < 2) continue;
    const port = center(source, "right"),
      old = trunk.points[0],
      second = trunk.points[1];
    if (!same(port, old)) {
      if (second.y === old.y) second.y = port.y;
      else if (second.x === old.x) second.x = port.x;
      trunk.points[0] = port;
    }
  }
  // Reserve complete group columns before routing. Group and source order are fixed.
  for (const branch of model.branches) {
    const members = model.groups.filter((e) => e.groupId === branch.id);
    if (!members.length) continue;
    const source = byId.get(branch.source)!;
    const oldTrunk = state.trunks[branch.id];
    const p = groupPositions.get(branch.id);
    const width = Math.max(
      160,
      ...members.map((e) => labels[e.id]?.width || 160),
    );
    const total =
      members.reduce((n, e) => n + (labels[e.id]?.height || 32) + 24, 0) - 24;
    let top = p ? p.y + 16 : source.y + source.height / 2 - total / 2;
    let x = p
      ? p.x + 16 + width / 2
      : source.x +
        source.width +
        STUB * 2 +
        width / 2 +
        branch.depth * (width + 64);
    if (oldTrunk && !p) {
      const existing = members.find((e) => state.routes[e.id]?.card);
      if (existing) {
        const card = state.routes[existing.id].card!;
        x = card.x;
        top =
          card.y -
          card.height / 2 -
          members
            .slice(0, members.indexOf(existing))
            .reduce((n, e) => n + (labels[e.id]?.height || 32) + 24, 0);
      }
    }
    if (!oldTrunk && !p) {
      // Only the new column moves when it is blocked; persisted cards remain fixed.
      for (let n = 0; n < boxes.length + model.branches.length + 4; n++) {
        const column = {
          id: branch.id,
          x: x - width / 2,
          y: top,
          width,
          height: total,
        };
        const obstacle = [
          ...boxes,
          ...Object.values(state.routes)
            .filter((r) => r.card && r.groupId !== branch.id)
            .map((r) => boxOf(r.id, r.card!)),
        ].find((b) => rectsOverlap(expand(column, 16), b));
        if (!obstacle) break;
        top = obstacle.y + obstacle.height + 32;
      }
    }
    for (const e of members) {
      if (!cardSlots.has(e.id) && !state.routes[e.id]?.card)
        cardSlots.set(e.id, {
          x,
          y: top + (labels[e.id]?.height || 32) / 2,
          width,
          height: labels[e.id]?.height || 32,
        });
      top += (labels[e.id]?.height || 32) + 24;
    }
    const port = center(source, "right");
    if (!oldTrunk)
      state.trunks[branch.id] = {
        id: branch.id,
        source: branch.source,
        points: [
          port,
          {
            x:
              port.x +
              STUB +
              branch.depth * (width + 64) +
              model.branches.filter(
                (b) =>
                  b.source === branch.source &&
                  b.depth === branch.depth &&
                  b.order < branch.order,
              ).length *
                GAP,
            y: port.y,
          },
        ],
      };
  }
  // Place standalone labels on their own clear horizontal leg.
  for (const e of model.groups)
    if (e.label && !state.routes[e.id]?.card && !cardSlots.has(e.id)) {
      const s = byId.get(e.source)!,
        t = byId.get(e.target)!;
      const width = labels[e.id]?.width || 160,
        height = labels[e.id]?.height || 32;
      let card = {
        x: s.x + s.width + STUB * 2 + width / 2,
        y: s.y + s.height / 2,
        width,
        height,
      };
      if (t.x > s.x + s.width + width + STUB * 4)
        card.x = (s.x + s.width + t.x) / 2;
      for (let i = 0; i < boxes.length + model.groups.length + 1; i++) {
        const hit = [
          ...boxes,
          ...cardSlots.values().map((c, i) => boxOf("card:" + i, c)),
        ].find((b) => rectsOverlap(expand(boxOf(e.id, card), 24), b));
        if (!hit) break;
        card = { ...card, y: hit.y + hit.height + height / 2 + 32 };
      }
      cardSlots.set(e.id, card);
    }
  const cards = new Map(
    model.groups
      .filter((e) => e.label)
      .map((e) => [e.id, state.routes[e.id]?.card || cardSlots.get(e.id)!])
      .filter(([, c]) => !!c) as [string, CardAnchor][],
  );
  const trunkLegs = model.branches.flatMap((branch) => {
    const trunk = state.trunks[branch.id];
    if (
      !trunk ||
      (request.snapshot.trunks[branch.id] && !all && !branchComplete(branch.id))
    )
      return [];
    const members = model.groups
      .filter((e) => e.groupId === branch.id)
      .map((e) => cards.get(e.id))
      .filter((c): c is CardAnchor => !!c);
    if (!members.length) return [];
    const source = byId.get(branch.source)!,
      port = center(source, "right");
    const split = {
      x: trunk.points.at(-1)!.x,
      y: branch.depth
        ? members.reduce((s, c) => s + c.y, 0) / members.length
        : port.y,
    };
    return [{ id: branch.id, from: outside(port, "right"), to: split }];
  });
  if (trunkLegs.length) {
    const trunks = await avoidRoutes(
      [...boxes, ...Array.from(cards, ([id, c]) => boxOf(id, c))],
      trunkLegs,
      wasmUrl,
    );
    for (const leg of trunkLegs) {
      const trunk = state.trunks[leg.id];
      trunk.points = simplify([
        center(byId.get(trunk.source)!, "right"),
        ...(trunks.get(leg.id) || [leg.from, leg.to]),
      ]);
    }
  }
  const plans: {
    edge: (typeof model.groups)[number];
    old?: RouteGeometry;
    route: RouteGeometry;
    fixed: Point[][];
    matches: (points: Point[]) => boolean;
    legs: { id: string; from: Point; to: Point }[];
  }[] = [];
  for (const e of model.groups) {
    const s = byId.get(e.source)!,
      t = byId.get(e.target)!,
      old = state.routes[e.id];
    const sourceSide: Side =
      old?.sourceSide ||
      (e.groupId
        ? "right"
        : e.source === e.target
          ? "top"
          : t.x < s.x
            ? "bottom"
            : "right");
    const targetSide: Side =
      old?.targetSide ||
      (e.source === e.target ? "right" : t.x < s.x ? "bottom" : "left");
    const start = center(s, sourceSide),
      end = center(t, targetSide);
    const card = cards.get(e.id);
    const blockers = [
      ...boxes.filter((b) => b.id !== e.source && b.id !== e.target),
      ...Array.from(cards, ([id, c]) => boxOf(id, c)).filter(
        (b) => b.id !== e.id,
      ),
    ];
    const trunk = e.groupId && state.trunks[e.groupId];
    const constraintsMatch = (points: Point[]) =>
      (!card || cardOnRoute(card, points)) &&
      (!trunk || trunk.points.every((p) => pointOnRoute(p, points, 0.01)));
    if (
      old &&
      same(old.points[0], start) &&
      same(old.points.at(-1)!, end) &&
      clear(old.points, blockers) &&
      old.pins.every((p) => pointOnRoute(p, old.points)) &&
      constraintsMatch(old.points) &&
      old.fixedSegments.every(
        (s) => pointOnRoute(s.a, old.points) && pointOnRoute(s.b, old.points),
      ) &&
      (!old.error || old.error === "等待修整")
    ) {
      delete old.error;
      continue;
    }
    const route: RouteGeometry = {
      id: e.id,
      source: e.source,
      target: e.target,
      groupId: e.groupId,
      sourceSide,
      targetSide,
      points: [],
      pins: old?.pins || [],
      fixedSegments: old?.fixedSegments || [],
      card,
    };
    let fixed: Point[][] = [[start, outside(start, sourceSide)]];
    if (trunk && sourceSide === "right") {
      const split = trunk.points.at(-1)!;
      fixed[0] = [
        ...trunk.points.map((p) => ({ ...p })),
        { x: split.x, y: card?.y ?? split.y },
      ];
    }
    // Fixed checkpoints/segments are visited in their existing source-to-target order.
    // The card corridor is also a fixed portion so moving a card never changes its route.
    const waypoints: { at: number; points: Point[] }[] = [];
    const rank = (p: Point) => {
      const pts = old?.points || [];
      let distance = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i],
          len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        if (pointOnRoute(p, [a, b]))
          return distance + Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
        distance += len;
      }
      return Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
    };
    if (card)
      waypoints.push({
        at: rank(card),
        points: [
          { x: card.x - card.width / 2 - STUB, y: card.y },
          { x: card.x + card.width / 2 + STUB, y: card.y },
        ],
      });
    for (const pin of route.pins)
      waypoints.push({ at: rank(pin), points: [{ x: pin.x, y: pin.y }] });
    for (const segment of route.fixedSegments)
      waypoints.push({ at: rank(segment.a), points: [segment.a, segment.b] });
    waypoints.sort((a, b) => a.at - b.at);
    fixed.push(...waypoints.map((p) => p.points), [
      outside(end, targetSide),
      end,
    ]);
    if (
      old &&
      old.points.length > 2 &&
      !old.error &&
      constraintsMatch(old.points)
    ) {
      const interior = old.points.slice(1, -1);
      const portions: Point[][] = [];
      const allBoxes = [
        ...boxes,
        ...Array.from(cards, ([id, c]) => boxOf(id, c)).filter(
          (b) => b.id !== e.id,
        ),
      ];
      for (let i = 1; i < interior.length; i++)
        if (clear([interior[i - 1], interior[i]], allBoxes))
          portions.push([interior[i - 1], interior[i]]);
      // Preserve every valid exterior segment. Only holes and moved endpoints are routed.
      for (const pin of route.pins)
        if (!portions.some((p) => pointOnRoute(pin, p)))
          portions.push([{ x: pin.x, y: pin.y }]);
      for (const segment of route.fixedSegments)
        if (
          !portions.some(
            (p) => pointOnRoute(segment.a, p) && pointOnRoute(segment.b, p),
          )
        )
          portions.push([segment.a, segment.b]);
      portions.sort((a, b) => rank(a[0]) - rank(b[0]));
      if (portions.length)
        fixed = [
          [start, outside(start, sourceSide)],
          ...portions,
          [outside(end, targetSide), end],
        ];
    }
    const legs = fixed
      .slice(1)
      .map((part, i) => ({
        id: e.id + ":" + i,
        from: fixed[i].at(-1)!,
        to: part[0],
      }))
      .filter((l) => !same(l.from, l.to));
    plans.push({ edge: e, old, route, fixed, legs, matches: constraintsMatch });
  }
  if (plans.length) {
    // Cards are obstacles except for their explicitly reserved fixed corridor.
    const obstacles = [
      ...boxes,
      ...Array.from(cards, ([id, c]) => boxOf(id, c)),
    ];
    const solved = await avoidRoutes(
      obstacles,
      plans.flatMap((p) => p.legs),
      wasmUrl,
    );
    for (const plan of plans) {
      const points: Point[] = [];
      plan.fixed.forEach((part, i) => {
        if (i) points.push(...(solved.get(plan.edge.id + ":" + (i - 1)) || []));
        points.push(...part);
      });
      const route = plan.route;
      const blockers = [
        ...boxes.filter((b) => b.id !== route.source && b.id !== route.target),
        ...Array.from(cards, ([id, c]) => boxOf(id, c)).filter(
          (b) => b.id !== route.id,
        ),
      ];
      const result = simplify(points, route.pins);
      if (
        !clear(result, blockers) ||
        !plan.matches(result) ||
        !route.pins.every((p) => pointOnRoute(p, result)) ||
        !route.fixedSegments.every(
          (s) => pointOnRoute(s.a, result) && pointOnRoute(s.b, result),
        )
      ) {
        const message =
          "固定線路與障礙衝突；保留布局，可移動 pin 或恢復自動線路";
        errors.push(plan.edge.id);
        state.routes[plan.edge.id] = plan.old
          ? { ...plan.old, error: message }
          : {
              ...route,
              points:
                result.length >= 2
                  ? result
                  : [
                      center(byId.get(route.source)!, "right"),
                      center(byId.get(route.target)!, "left"),
                    ],
              error: message,
            };
      } else state.routes[route.id] = { ...route, points: result };
    }
  }
  state.initialized = true;
  state.revision++;
  return {
    id: request.id,
    modelVersion: request.modelVersion,
    layoutVersion: request.layoutVersion,
    snapshot: state,
    elapsed: performance.now() - started,
    errors,
  };
}
