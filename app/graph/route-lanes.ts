import type { Point, GraphRect } from "../graph-layout";
import { segmentHitsRect } from "../graph-layout";
import {
  cardOnRoute,
  orderedControls,
  pointOnRoute,
  simplify,
  type GraphLayoutSnapshot,
  type RouteGeometry,
} from "./layout-state";

export const LANE_GAP = 16;
const EPS = 0.01;
type Segment = {
  a: Point;
  b: Point;
  horizontal: boolean;
  lo: number;
  hi: number;
  axis: number;
  direction: number;
  distance: number;
};
function segments(points: Point[]): Segment[] {
  let distance = 0;
  return points
    .slice(1)
    .map((b, i) => {
      const a = points[i],
        horizontal = a.y === b.y;
      const av = horizontal ? a.x : a.y,
        bv = horizontal ? b.x : b.y;
      const segment = {
        a,
        b,
        horizontal,
        lo: Math.min(av, bv),
        hi: Math.max(av, bv),
        axis: horizontal ? a.y : a.x,
        direction: Math.sign(bv - av),
        distance,
      };
      distance += Math.abs(bv - av);
      return segment;
    })
    .filter((s) => s.hi > s.lo);
}
function distanceAt(route: RouteGeometry, point: Point) {
  for (const s of segments(route.points))
    if (pointOnRoute(point, [s.a, s.b], EPS))
      return s.distance + Math.abs(point.x - s.a.x) + Math.abs(point.y - s.a.y);
  return Infinity;
}
function tailStart(route: RouteGeometry) {
  const last = orderedControls(route).at(-1);
  return last ? distanceAt(route, last.points.at(-1)!) : 0;
}
function subtract(intervals: number[][], lo: number, hi: number) {
  return intervals.flatMap(([a, b]) =>
    hi <= a || lo >= b
      ? [[a, b]]
      : [
          [a, Math.max(a, lo)],
          [Math.min(b, hi), b],
        ].filter(([a, b]) => b - a > EPS),
  );
}
/** Only the short departure trunk and a co-directed destination tail may be shared. */
function conflict(
  a: Segment,
  b: Segment,
  route: RouteGeometry,
  other: RouteGeometry,
  state: GraphLayoutSnapshot,
  tails?: [number, number],
) {
  if (
    a.horizontal !== b.horizontal ||
    Math.abs(a.axis - b.axis) >= LANE_GAP - EPS
  )
    return 0;
  const lo = Math.max(a.lo, b.lo),
    hi = Math.min(a.hi, b.hi);
  if (hi - lo <= EPS) return 0;
  let remaining = [[lo, hi]];
  if (
    route.target === other.target &&
    a.direction === b.direction &&
    Math.abs(a.axis - b.axis) < EPS
  ) {
    const tailA = tails?.[0] ?? tailStart(route),
      tailB = tails?.[1] ?? tailStart(other);
    const at = (s: Segment, t: number) =>
      (s.horizontal ? s.a.x : s.a.y) +
      s.direction * Math.max(0, t - s.distance);
    const cutoffA = at(a, tailA),
      cutoffB = at(b, tailB);
    if (Number.isFinite(cutoffA) && Number.isFinite(cutoffB))
      remaining =
        a.direction > 0
          ? subtract(remaining, Math.max(cutoffA, cutoffB), Infinity)
          : subtract(remaining, -Infinity, Math.min(cutoffA, cutoffB));
  }
  if (route.source === other.source) {
    const start = route.points[0],
      next = route.points[1];
    const stub = {
      x: start.x + Math.sign(next.x - start.x) * 24,
      y: start.y + Math.sign(next.y - start.y) * 24,
    };
    const shared =
      route.groupId && route.groupId === other.groupId
        ? state.trunks[route.groupId]?.points || [start, stub]
        : [start, stub];
    for (const s of segments(shared))
      if (
        s.horizontal === a.horizontal &&
        Math.abs(s.axis - a.axis) < EPS &&
        Math.abs(s.axis - b.axis) < EPS
      )
        remaining = subtract(remaining, s.lo, s.hi);
  }
  return (
    remaining.reduce((n, [a, b]) => n + b - a, 0) *
    (LANE_GAP - Math.abs(a.axis - b.axis))
  );
}
type RouteInfo = { segments: Segment[]; tail: number };
type RouteCache = WeakMap<Point[], RouteInfo>;
function routeInfo(route: RouteGeometry, cache: RouteCache) {
  let value = cache.get(route.points);
  if (!value) {
    value = { segments: segments(route.points), tail: tailStart(route) };
    cache.set(route.points, value);
  }
  return value;
}
export function laneConflict(
  route: RouteGeometry,
  others: RouteGeometry[],
  state: GraphLayoutSnapshot,
  cache: RouteCache = new WeakMap(),
) {
  const own = routeInfo(route, cache);
  return others.reduce((n, other) => {
    const info = routeInfo(other, cache);
    return (
      n +
      info.segments.reduce(
        (n, b) =>
          n +
          own.segments.reduce(
            (n, a) =>
              n + conflict(a, b, route, other, state, [own.tail, info.tail]),
            0,
          ),
        0,
      )
    );
  }, 0);
}

function valid(
  route: RouteGeometry,
  points: Point[],
  boxes: GraphRect[],
  state: GraphLayoutSnapshot,
) {
  if (
    points[0].x !== route.points[0].x ||
    points[0].y !== route.points[0].y ||
    points.at(-1)!.x !== route.points.at(-1)!.x ||
    points.at(-1)!.y !== route.points.at(-1)!.y
  )
    return false;
  if (
    points
      .slice(1)
      .some(
        (p, i) =>
          (p.x !== points[i].x && p.y !== points[i].y) ||
          boxes.some((b) => segmentHitsRect(points[i], p, b)),
      )
  )
    return false;
  if (
    points.slice(2).some((c, i) => {
      const a = points[i],
        b = points[i + 1];
      return (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
    })
  )
    return false;
  if (
    route.pins.some((p) => !pointOnRoute(p, points, EPS)) ||
    (route.card && !cardOnRoute(route.card, points))
  )
    return false;
  const trunk = route.groupId && state.trunks[route.groupId];
  return !trunk || trunk.points.every((p) => pointOnRoute(p, points, EPS));
}
const cost = (points: Point[]) =>
  segments(points).reduce((n, s) => n + s.hi - s.lo, 0) + points.length * 24;
function offsetCandidates(points: Point[], index: number, offset: number) {
  const a = points[index],
    b = points[index + 1],
    horizontal = a.y === b.y;
  const shift = (p: Point) =>
    horizontal ? { x: p.x, y: p.y + offset } : { x: p.x + offset, y: p.y };
  const along = (p: Point, n: number) => ({
    x: p.x + Math.sign(b.x - a.x) * n,
    y: p.y + Math.sign(b.y - a.y) * n,
  });
  const variants: Point[][] = [];
  // Move free corners; if a corner belongs to a visible control, retain a short lead-in.
  for (const keepA of [false, true])
    for (const keepB of [false, true]) {
      const lead = keepA ? along(a, 24) : a,
        tail = keepB ? along(b, -24) : b;
      if (
        (tail.x - lead.x) * (b.x - a.x) + (tail.y - lead.y) * (b.y - a.y) <=
        0
      )
        continue;
      variants.push([
        ...points.slice(0, index),
        ...(keepA ? [a, lead] : []),
        shift(lead),
        shift(tail),
        ...(keepB ? [tail, b] : []),
        ...points.slice(index + 2),
      ]);
    }
  return variants;
}
/** Settled, unrelated routes are reservations. Only affected routes receive parallel lanes. */
export function separateLanes(
  state: GraphLayoutSnapshot,
  boxes: GraphRect[],
  affected: Set<string>,
) {
  const cache: RouteCache = new WeakMap();
  const routes = Object.values(state.routes);
  const settled = routes.filter((r) => !affected.has(r.id));
  const cards = routes
    .filter((r) => r.card)
    .map((r) => ({
      id: r.id,
      x: r.card!.x - r.card!.width / 2,
      y: r.card!.y - r.card!.height / 2,
      width: r.card!.width,
      height: r.card!.height,
    }));
  for (const route of routes.filter((r) => affected.has(r.id))) {
    const blockers = [...boxes, ...cards.filter((b) => b.id !== route.id)];
    let score = laneConflict(route, settled, state, cache);
    // Each accepted change must reduce overlap. Never trade constraints for spacing.
    for (let pass = 0; pass < 12 && score > EPS; pass++) {
      let best: Point[] | undefined,
        bestScore = score,
        bestCost = Infinity;
      const own = routeInfo(route, cache).segments;
      for (let i = 0; i < route.points.length - 1; i++) {
        const s = own[i];
        if (!s) continue;
        const conflicts = settled.flatMap((r) =>
          routeInfo(r, cache).segments.filter(
            (b) =>
              conflict(s, b, route, r, state, [
                routeInfo(route, cache).tail,
                routeInfo(r, cache).tail,
              ]) > EPS,
          ),
        );
        if (!conflicts.length) continue;
        const offsets = [
          ...new Set(
            conflicts.flatMap((b) => [
              b.axis - s.axis - LANE_GAP,
              b.axis - s.axis + LANE_GAP,
              b.axis - s.axis - LANE_GAP * 2,
              b.axis - s.axis + LANE_GAP * 2,
            ]),
          ),
        ];
        for (const offset of offsets)
          for (const candidate of offsetCandidates(route.points, i, offset)) {
            const points = simplify(candidate, route.pins);
            if (!valid(route, points, blockers, state)) continue;
            const nextScore = laneConflict(
                { ...route, points },
                settled,
                state,
                cache,
              ),
              nextCost = cost(points);
            if (
              nextScore < score - EPS &&
              (nextScore < bestScore - EPS ||
                (Math.abs(nextScore - bestScore) < EPS && nextCost < bestCost))
            ) {
              best = points;
              bestScore = nextScore;
              bestCost = nextCost;
            }
          }
      }
      if (!best) break;
      route.points = best;
      score = bestScore;
    }
    settled.push(route);
  }
  return state;
}
