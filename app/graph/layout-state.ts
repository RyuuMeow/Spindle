import type { Point, Side, GraphRect } from "../graph-layout";
import type { SourceAnchor, GraphModel } from "./model";

export type Pin = Point & {
  id: string;
  axis?: "horizontal" | "vertical";
  direction?: 1 | -1;
};
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
  fixedSegments: { id?: string; a: Point; b: Point }[];
  controlOrder?: string[];
  reroute?: boolean;
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
  routing?: "pins";
  lanes?: 1;
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
    | { kind: "all" }
    | { kind: "selected"; ids: string[]; cards?: string[] }
    | { kind: "repair" };
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
  if (state?.layout?.schema === 2) return normalizeRouting(state.layout);
  const positions: Record<string, Point> = {};
  for (const record of model.records) {
    const p = state?.positions?.[record.node?.id || record.id];
    if (p) positions[record.id] = { ...p };
  }
  return {
    schema: 2,
    routing: "pins",
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
        ...s,
        a: { x: s.a.x + a.x, y: s.a.y + a.y },
        b: { x: s.b.x + a.x, y: s.b.y + a.y },
      }));
      if (r.card) {
        r.card.x += a.x;
        r.card.y += a.y;
      }
    } else if (a || b) {
      freezeControlOrder(r);
      r.reroute = true;
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
/** Resolve legacy checkpoints once, then keep their source-to-target identity order. */
export function orderedControls(route: RouteGeometry) {
  const controls = [
    ...(route.card
      ? [
          {
            key: "card",
            points: [
              { x: route.card.x - route.card.width / 2 - 24, y: route.card.y },
              { x: route.card.x + route.card.width / 2 + 24, y: route.card.y },
            ],
            center: route.card,
          },
        ]
      : []),
    ...route.pins.map((p) => ({
      key: "pin:" + p.id,
      center: p,
      points: [{ x: p.x, y: p.y }],
    })),
  ];
  const rank = (p: Point) => {
    let distance = 0;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      if (pointOnRoute(p, [a, b]))
        return distance + Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
      distance += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    }
    return (
      distance +
      Math.abs(p.x - route.points[0].x) +
      Math.abs(p.y - route.points[0].y)
    );
  };
  const order = (route.controlOrder || []).filter((k) =>
    controls.some((c) => c.key === k),
  );
  for (const c of controls
    .filter((c) => !order.includes(c.key))
    .sort((a, b) => rank(a.center) - rank(b.center))) {
    const i = order.findIndex(
      (k) => rank(controls.find((c) => c.key === k)!.center) > rank(c.center),
    );
    order.splice(i < 0 ? order.length : i, 0, c.key);
  }
  return order.map((k) => controls.find((c) => c.key === k)!);
}
export function freezeControlOrder(route: RouteGeometry) {
  route.controlOrder = orderedControls(route).map((c) => c.key);
}
export function movePin(
  route: RouteGeometry,
  id: string,
  point: Point,
): RouteGeometry {
  const next = structuredClone(route);
  freezeControlOrder(next);
  const pin = next.pins.find((p) => p.id === id);
  if (!pin) return next;
  Object.assign(pin, point);
  next.reroute = true;
  return next;
}
export function moveCard(route: RouteGeometry, point: Point): RouteGeometry {
  const next = structuredClone(route);
  freezeControlOrder(next);
  if (next.card) Object.assign(next.card, point, { manual: true });
  next.reroute = true;
  return next;
}
export function removePin(route: RouteGeometry, id: string): RouteGeometry {
  const next = structuredClone(route);
  freezeControlOrder(next);
  next.pins = next.pins.filter((p) => p.id !== id);
  next.controlOrder = next.controlOrder!.filter((k) => k !== "pin:" + id);
  next.reroute = true;
  return next;
}
export function cardOnRoute(card: CardAnchor, points: Point[]): boolean {
  return points.slice(1).some((b, i) => {
    const a = points[i];
    return (
      a.y === b.y &&
      Math.abs(a.y - card.y) < 0.01 &&
      Math.min(a.x, b.x) <= card.x - card.width / 2 &&
      Math.max(a.x, b.x) >= card.x + card.width / 2
    );
  });
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
        r.pins.every(
          (p) =>
            point(p) &&
            typeof p.id === "string" &&
            (!p.axis || ["horizontal", "vertical"].includes(p.axis)) &&
            (p.direction === undefined ||
              p.direction === 1 ||
              p.direction === -1),
        ) &&
        (r.controlOrder === undefined ||
          (Array.isArray(r.controlOrder) &&
            r.controlOrder.every((k) => typeof k === "string"))) &&
        (r.reroute === undefined || typeof r.reroute === "boolean") &&
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

/** Retire hidden segment/direction locks once, while preserving all visible controls. */
export function normalizeRouting(
  state: GraphLayoutSnapshot,
): GraphLayoutSnapshot {
  const next = cloneLayout(state);
  const legacy = next.routing !== "pins";
  const updateLanes = next.lanes !== 1;
  next.routing = "pins";
  next.lanes = 1;
  for (const route of Object.values(next.routes)) {
    if (updateLanes) route.reroute = true;
    if (
      legacy ||
      route.fixedSegments.length ||
      route.pins.some((p) => p.axis || p.direction)
    ) {
      freezeControlOrder(route);
      route.fixedSegments = [];
      route.pins = route.pins.map(({ id, x, y }) => ({ id, x, y }));
      delete route.error;
      route.reroute = true;
    }
  }
  for (const trunk of Object.values(next.trunks)) {
    if (!trunk.manual || !trunk.points.length) continue;
    const start = trunk.points[0];
    trunk.points = [{ ...start }, { x: start.x + 24, y: start.y }];
    delete trunk.manual;
    for (const route of Object.values(next.routes))
      if (route.groupId === trunk.id) route.reroute = true;
  }
  return next;
}

export function moveTrunkSource(trunk: TrunkGeometry, port: Point) {
  const origin = trunk.points[0];
  if (!origin) return;
  const dx = port.x - origin.x,
    dy = port.y - origin.y;
  if (dx || dy)
    trunk.points = trunk.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
