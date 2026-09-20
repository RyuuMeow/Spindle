import type { Point } from "../graph-layout";
import {
  center,
  type GraphLayoutSnapshot,
  type RouteGeometry,
} from "./layout-state";

// Smaller than lane spacing, so a deliberate 16-unit parallel lane is never collapsed.
export const ALIGN_SNAP = 8;
type Sizes = Record<string, { width: number; height: number }>;
function ports(state: GraphLayoutSnapshot, route: RouteGeometry, sizes: Sizes) {
  return (
    [
      ["source", route.sourceSide],
      ["target", route.targetSide],
    ] as const
  ).flatMap(([end, side]) => {
    const id = route[end],
      p = state.positions[id];
    return p
      ? [
          {
            id,
            point: center(
              { id, ...p, ...(sizes[id] || { width: 232, height: 108 }) },
              side,
            ),
          },
        ]
      : [];
  });
}
function nearest(value: number, candidates: number[]) {
  return (
    candidates
      .map((v) => v - value)
      .filter((d) => Math.abs(d) <= ALIGN_SNAP)
      .sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0
  );
}
export function snapPin(
  state: GraphLayoutSnapshot,
  route: RouteGeometry,
  id: string,
  point: Point,
  sizes: Sizes,
): Point {
  const anchors = [
    ...ports(state, route, sizes).map((p) => p.point),
    ...route.pins.filter((p) => p.id !== id),
    ...(route.card ? [route.card] : []),
  ];
  return {
    x:
      point.x +
      nearest(
        point.x,
        anchors.map((p) => p.x),
      ),
    y:
      point.y +
      nearest(
        point.y,
        anchors.map((p) => p.y),
      ),
  };
}
/** Snap only what is being moved. A mixed selection receives one rigid translation. */
export function snapObjects(
  state: GraphLayoutSnapshot,
  moved: Record<string, Point>,
  sizes: Sizes,
) {
  const selected = new Set(Object.keys(moved)),
    dx: number[] = [],
    dy: number[] = [];
  const propose = (from: Point, to: Point, horizontalOnly = false) => {
    if (!horizontalOnly && Math.abs(to.x - from.x) <= ALIGN_SNAP)
      dx.push(to.x - from.x);
    if (Math.abs(to.y - from.y) <= ALIGN_SNAP) dy.push(to.y - from.y);
  };
  for (const route of Object.values(state.routes)) {
    const ends = ports(state, route, sizes);
    const carriesControls =
      selected.has(route.source) && selected.has(route.target);
    const cardMoved = moved[route.id];
    if (cardMoved && route.card) {
      const c = {
        x: cardMoved.x + route.card.width / 2,
        y: cardMoved.y + route.card.height / 2,
      };
      for (const end of ends)
        if (!selected.has(end.id)) propose(c, end.point, true);
      if (!carriesControls) for (const pin of route.pins) propose(c, pin, true);
    }
    for (const end of ends)
      if (moved[end.id]) {
        const old = state.positions[end.id],
          next = moved[end.id];
        const port = {
          x: end.point.x + next.x - old.x,
          y: end.point.y + next.y - old.y,
        };
        if (route.card && !selected.has(route.id) && !carriesControls)
          propose(port, route.card, true);
        if (!route.card)
          for (const other of ends)
            if (!selected.has(other.id))
              propose(
                port,
                other.point,
                route.sourceSide === "left" || route.sourceSide === "right",
              );
        if (!carriesControls)
          for (const pin of route.pins)
            propose(
              port,
              pin,
              route.sourceSide === "left" || route.sourceSide === "right",
            );
      }
  }
  const x = dx.sort((a, b) => Math.abs(a) - Math.abs(b))[0] || 0,
    y = dy.sort((a, b) => Math.abs(a) - Math.abs(b))[0] || 0;
  return Object.fromEntries(
    Object.entries(moved).map(([id, p]) => [id, { x: p.x + x, y: p.y + y }]),
  );
}
