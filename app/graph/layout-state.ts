import type { Point, Side, GraphRect } from "../graph-layout";
import type { SourceAnchor, GraphModel } from "./model";

export type Pin = Point & { id: string };
export type CardAnchor = Point & {
  width: number;
  height: number;
  manual?: boolean;
};
export type RouteGeometry = {
  id: string;
  source: string;
  target: string;
  sourceSide: Side;
  targetSide: Side;
  points: Point[];
  pins: Pin[];
  fixedSegments: { a: Point; b: Point }[];
  card?: CardAnchor;
  groupId?: string;
  error?: string;
};
export type TrunkGeometry = {
  id: string;
  source: string;
  points: Point[];
  manual?: boolean;
};
export type GraphLayoutSnapshot = {
  schema: 2;
  revision: number;
  initialized: boolean;
  positions: Record<string, Point>;
  routes: Record<string, RouteGeometry>;
  trunks: Record<string, TrunkGeometry>;
};
export type GraphLayout = {
  positions?: Record<string, Point>;
  viewport?: { x: number; y: number; zoom: number };
  layout?: GraphLayoutSnapshot;
};
export type GraphState = GraphLayout & {
  anchors?: SourceAnchor[];
  undo?: GraphLayout[];
  redo?: GraphLayout[];
  detailsOpen?: boolean;
};
export type GraphLayoutRequest = {
  id: number;
  modelVersion: string;
  layoutVersion: number;
  scope:
    { kind: "all" } | { kind: "selected"; ids: string[] } | { kind: "repair" };
  model: GraphModel;
  snapshot: GraphLayoutSnapshot;
  sizes: Record<string, { width: number; height: number }>;
  labels: Record<string, { text: string; width: number; height: number }>;
};
export type GraphLayoutResult = {
  id: number;
  modelVersion: string;
  layoutVersion: number;
  snapshot: GraphLayoutSnapshot;
  elapsed: number;
  errors: string[];
};
export const cloneLayout = (state: GraphLayoutSnapshot): GraphLayoutSnapshot =>
  structuredClone(state);
export function migrateLayout(
  state: GraphState | undefined,
  model: GraphModel,
): GraphLayoutSnapshot {
  if (state?.layout?.schema === 2) return cloneLayout(state.layout);
  const positions: Record<string, Point> = {};
  for (const record of model.records) {
    const p = state?.positions?.[record.node?.id || record.id];
    if (p) positions[record.id] = { ...p };
  }
  return {
    schema: 2,
    revision: 0,
    initialized: Object.keys(positions).length > 0,
    positions,
    routes: {},
    trunks: {},
  };
}
export function center(rect: GraphRect, side: Side): Point {
  return side === "left"
    ? { x: rect.x, y: rect.y + rect.height / 2 }
    : side === "right"
      ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
      : side === "top"
        ? { x: rect.x + rect.width / 2, y: rect.y }
        : { x: rect.x + rect.width / 2, y: rect.y + rect.height };
}
export function simplify(points: Point[], keep: Point[] = []): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    if (result.at(-1)?.x === p.x && result.at(-1)?.y === p.y) continue;
    while (result.length >= 2) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (keep.some((k) => k.x === b.x && k.y === b.y)) break;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))
        result.pop();
      else break;
    }
    result.push({ ...p });
  }
  return result;
}
export function pathData(points: Point[]) {
  return points.map((p, i) => (i ? "L" : "M") + p.x + "," + p.y).join(" ");
}
export function projectCard(
  points: Point[],
  point: Point,
  width: number,
  height: number,
  peers: CardAnchor[] = [],
  fallback?: CardAnchor,
): CardAnchor {
  const candidates = points.slice(1).flatMap((b, i) => {
    const a = points[i];
    if (a.y !== b.y || Math.abs(b.x - a.x) < width + 16) return [];
    const low = Math.min(a.x, b.x) + width / 2 + 8,
      high = Math.max(a.x, b.x) - width / 2 - 8;
    let x = Math.max(low, Math.min(high, point.x));
    const peer = peers.find(
      (p) => Math.abs(p.x - x) < 12 && p.x >= low && p.x <= high,
    );
    if (peer) x = peer.x;
    return [{ x, y: a.y, width, height, manual: true }];
  });
  return (
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - point.x, a.y - point.y) -
        Math.hypot(b.x - point.x, b.y - point.y),
    )[0] ||
    fallback || { x: point.x, y: point.y, width, height, manual: true }
  );
}
export function moveNodes(
  state: GraphLayoutSnapshot,
  moved: Record<string, Point>,
): GraphLayoutSnapshot {
  const next = cloneLayout(state);
  const delta = (id: string) =>
    moved[id] && state.positions[id]
      ? {
          x: moved[id].x - state.positions[id].x,
          y: moved[id].y - state.positions[id].y,
        }
      : null;
  Object.assign(next.positions, moved);
  for (const r of Object.values(next.routes)) {
    const a = delta(r.source),
      b = delta(r.target);
    if (a && b && a.x === b.x && a.y === b.y) {
      r.points = r.points.map((p) => ({ x: p.x + a.x, y: p.y + a.y }));
      r.pins = r.pins.map((p) => ({ ...p, x: p.x + a.x, y: p.y + a.y }));
      r.fixedSegments = r.fixedSegments.map((s) => ({
        a: { x: s.a.x + a.x, y: s.a.y + a.y },
        b: { x: s.b.x + a.x, y: s.b.y + a.y },
      }));
      if (r.card) {
        r.card.x += a.x;
        r.card.y += a.y;
      }
    }
  }
  for (const t of Object.values(next.trunks)) {
    const members = Object.values(state.routes).filter(
      (r) => r.groupId === t.id,
    );
    const a = delta(t.source);
    if (
      a &&
      members.every((r) => {
        const b = delta(r.target);
        return b && b.x === a.x && b.y === a.y;
      })
    )
      t.points = t.points.map((p) => ({ x: p.x + a.x, y: p.y + a.y }));
  }
  next.revision++;
  return next;
}
export function moveSegment(
  route: RouteGeometry,
  index: number,
  point: Point,
): RouteGeometry {
  const next = structuredClone(route),
    a = next.points[index],
    b = next.points[index + 1];
  if (!a || !b) return next;
  const horizontal = a.y === b.y;
  const na = horizontal ? { x: a.x, y: point.y } : { x: point.x, y: a.y };
  const nb = horizontal ? { x: b.x, y: point.y } : { x: point.x, y: b.y };
  const prefix = next.points.slice(0, index),
    suffix = next.points.slice(index + 2);
  if (index === 0) prefix.push({ ...a });
  if (index === next.points.length - 2) suffix.unshift({ ...b });
  next.points = simplify([...prefix, na, nb, ...suffix], next.pins);
  next.fixedSegments = [
    ...next.fixedSegments.filter(
      (s) => !(pointOnRoute(s.a, [a, b]) && pointOnRoute(s.b, [a, b])),
    ),
    { a: na, b: nb },
  ];
  return next;
}
export function pointOnRoute(p: Point, points: Point[], tolerance = 1) {
  return points.slice(1).some((b, i) => {
    const a = points[i];
    return a.x === b.x
      ? Math.abs(p.x - a.x) <= tolerance &&
          p.y >= Math.min(a.y, b.y) - tolerance &&
          p.y <= Math.max(a.y, b.y) + tolerance
      : a.y === b.y &&
          Math.abs(p.y - a.y) <= tolerance &&
          p.x >= Math.min(a.x, b.x) - tolerance &&
          p.x <= Math.max(a.x, b.x) + tolerance;
  });
}
export function validSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as GraphLayoutSnapshot;
  const point = (p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const collection = (o: unknown) =>
    !!o && typeof o === "object" && !Array.isArray(o);
  if (
    v.schema !== 2 ||
    !Number.isFinite(v.revision) ||
    !collection(v.positions) ||
    !collection(v.routes) ||
    !collection(v.trunks)
  )
    return false;
  return (
    Object.values(v.positions).every(point) &&
    Object.values(v.routes).every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        ["left", "right", "top", "bottom"].includes(r.sourceSide) &&
        ["left", "right", "top", "bottom"].includes(r.targetSide) &&
        Array.isArray(r.points) &&
        r.points.length >= 2 &&
        r.points.every(point) &&
        Array.isArray(r.pins) &&
        r.pins.every((p) => point(p) && typeof p.id === "string") &&
        Array.isArray(r.fixedSegments) &&
        r.fixedSegments.every((s) => point(s.a) && point(s.b)) &&
        (!r.card ||
          (point(r.card) &&
            Number.isFinite(r.card.width) &&
            Number.isFinite(r.card.height))),
    ) &&
    Object.values(v.trunks).every(
      (t) => t && Array.isArray(t.points) && t.points.every(point),
    )
  );
}
