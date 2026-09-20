import type { Point, GraphRect, Side } from "../graph-layout";
import { segmentHitsRect } from "../graph-layout";
import {
  center,
  moveTrunkSource,
  simplify,
  orderedControls,
  moveNodes,
  moveCard,
  type RouteGeometry,
  type GraphLayoutSnapshot,
  type TrunkGeometry,
} from "./layout-state";
import { separateLanes } from "./route-lanes";
export const stub = (p: Point, side: Side, n = 24): Point => ({
  x: p.x + (side === "right" ? n : side === "left" ? -n : 0),
  y: p.y + (side === "bottom" ? n : side === "top" ? -n : 0),
});
const vector = (a: Point, b: Point) => ({
  x: Math.sign(b.x - a.x),
  y: Math.sign(b.y - a.y),
});
export function retraces(points: Point[]) {
  const path = points.filter(
    (p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  return path.slice(2).some((c, i) => {
    const a = path[i],
      b = path[i + 1];
    return (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
  });
}
/** Small deterministic candidate set for pointer feedback. The worker handles complex obstacles on release. */
export function connectLeg(
  before: Point[],
  after: Point[],
  boxes: GraphRect[],
  previous: Point[] = before,
): Point[] | null {
  const from = before.at(-1)!,
    to = after[0];
  if (from.x === to.x && from.y === to.y) return [from];
  const incoming =
    before.length > 1 ? vector(before.at(-2)!, from) : { x: 0, y: 0 };
  const outgoing = after.length > 1 ? vector(to, after[1]) : { x: 0, y: 0 };
  const a = { x: from.x + incoming.x * 16, y: from.y + incoming.y * 16 };
  const b = { x: to.x - outgoing.x * 16, y: to.y - outgoing.y * 16 };
  const xs = [
    a.x,
    b.x,
    (a.x + b.x) / 2,
    ...boxes.flatMap((r) => [r.x - 16, r.x + r.width + 16]),
  ];
  const ys = [
    a.y,
    b.y,
    (a.y + b.y) / 2,
    ...boxes.flatMap((r) => [r.y - 16, r.y + r.height + 16]),
  ];
  const candidates = [
    [a, { x: a.x, y: b.y }, b],
    [a, { x: b.x, y: a.y }, b],
    ...xs.map((x) => [a, { x, y: a.y }, { x, y: b.y }, b]),
    ...ys.map((y) => [a, { x: a.x, y }, { x: b.x, y }, b]),
  ].map((p) => simplify([from, ...p, to]));
  const valid = candidates.filter(
    (p) =>
      !retraces([...previous, ...p, ...after]) &&
      p
        .slice(1)
        .every((q, i) => !boxes.some((r) => segmentHitsRect(p[i], q, r))),
  );
  const cost = (p: Point[]) =>
    p
      .slice(1)
      .reduce(
        (sum, q, i) => sum + Math.abs(q.x - p[i].x) + Math.abs(q.y - p[i].y),
        0,
      ) +
    p.length * 12;
  return valid.sort((a, b) => cost(a) - cost(b))[0] || null;
}
export function controlParts(
  route: RouteGeometry,
  trunk?: TrunkGeometry,
): Point[][] {
  const start = route.points[0],
    end = route.points.at(-1)!;
  return [
    trunk?.points.length
      ? trunk.points
      : [start, stub(start, route.sourceSide)],
    ...orderedControls(route).map((c) => c.points),
    [stub(end, route.targetSide), end],
  ];
}
export function previewRoute(
  route: RouteGeometry,
  boxes: GraphRect[],
  trunk?: TrunkGeometry,
): RouteGeometry {
  const parts = controlParts(route, trunk),
    points: Point[] = [];
  parts.forEach((part, i) => {
    if (i)
      points.push(
        ...(connectLeg(parts[i - 1], part, boxes, points) || [
          parts[i - 1].at(-1)!,
          { x: part[0].x, y: parts[i - 1].at(-1)!.y },
          part[0],
        ]),
      );
    points.push(...part);
  });
  return { ...route, points: simplify(points, route.pins), reroute: true };
}
export function previewRoutes(
  state: GraphLayoutSnapshot,
  sizes: Record<string, { width: number; height: number }>,
) {
  const boxes = Object.entries(state.positions).map(([id, p]) => ({
    id,
    ...p,
    ...(sizes[id] || { width: 232, height: 108 }),
  }));
  for (const trunk of Object.values(state.trunks)) {
    const source = boxes.find((b) => b.id === trunk.source);
    if (!source || trunk.points.length < 2) continue;
    moveTrunkSource(trunk, center(source, "right"));
  }
  const cards = Object.values(state.routes)
    .filter((r) => r.card)
    .map((r) => ({
      id: r.id,
      x: r.card!.x - r.card!.width / 2,
      y: r.card!.y - r.card!.height / 2,
      width: r.card!.width,
      height: r.card!.height,
    }));
  const affected = new Set(
    Object.values(state.routes)
      .filter((r) => r.reroute)
      .map((r) => r.id),
  );
  for (const r of Object.values(state.routes))
    if (r.reroute) {
      const s = boxes.find((b) => b.id === r.source),
        t = boxes.find((b) => b.id === r.target);
      if (s) r.points[0] = center(s, r.sourceSide);
      if (t) r.points[r.points.length - 1] = center(t, r.targetSide);
      const trunk = r.groupId ? state.trunks[r.groupId] : undefined;
      state.routes[r.id] = previewRoute(r, [...boxes, ...cards], trunk);
    }
  return separateLanes(state, boxes, affected);
}
/** React Flow positions cover scenes and line cards, including a mixed selection. */
export function moveObjects(
  state: GraphLayoutSnapshot,
  moved: Record<string, Point>,
  sizes: Record<string, { width: number; height: number }>,
) {
  const scenes = Object.fromEntries(
    Object.entries(moved).filter(([id]) => state.positions[id]),
  );
  const next = moveNodes(state, scenes);
  for (const [id, p] of Object.entries(moved)) {
    const old = state.routes[id];
    if (old?.card) {
      const target = {
        x: p.x + old.card.width / 2,
        y: p.y + old.card.height / 2,
      };
      const c = next.routes[id].card!;
      if (c.x !== target.x || c.y !== target.y)
        next.routes[id] = moveCard(next.routes[id], target);
    }
  }
  return previewRoutes(next, sizes);
}
