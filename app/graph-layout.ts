/** Geometry shared by the canvas and its regression tests. No browser dependency. */
export type Point = { x: number; y: number };
export type GraphRect = Point & { id: string; width: number; height: number };
export type GraphConnection = {
  id: string;
  source: string;
  target: string;
  label?: boolean;
  labelWidth?: number;
};
export type Side = "left" | "right" | "top" | "bottom";
export const CARD_WIDTH = 232;
export const CARD_HEIGHT = 108;
export const LABEL_WIDTH = 164;
export const LABEL_HEIGHT = 36;

/** Remove only DFS feedback edges for ranking; cycles still read from left to right. */
export function layoutGraph(
  ids: string[],
  edges: GraphConnection[],
  heights: Record<string, number> = {},
): Record<string, Point> {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of edges)
    if (adjacency.has(e.target) && e.source !== e.target)
      adjacency.get(e.source)?.push(e.target);
  const active = new Set<string>(),
    seen = new Set<string>(),
    forward = new Map(ids.map((id) => [id, [] as string[]]));
  function visit(id: string) {
    seen.add(id);
    active.add(id);
    for (const target of adjacency.get(id) || []) {
      if (active.has(target)) continue;
      forward.get(id)!.push(target);
      if (!seen.has(target)) visit(target);
    }
    active.delete(id);
  }
  ids.forEach((id) => {
    if (!seen.has(id)) visit(id);
  });
  const indegree = new Map(ids.map((id) => [id, 0])),
    ranks = new Map(ids.map((id) => [id, 0]));
  for (const targets of forward.values())
    for (const target of targets)
      indegree.set(target, indegree.get(target)! + 1);
  const queue = ids.filter((id) => !indegree.get(id));
  for (let i = 0; i < queue.length; i++)
    for (const target of forward.get(queue[i])!) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(queue[i])! + 1));
      indegree.set(target, indegree.get(target)! - 1);
      if (!indegree.get(target)) queue.push(target);
    }
  const columns = new Map<number, string[]>();
  ids.forEach((id) => {
    const rank = ranks.get(id)!;
    columns.set(rank, [...(columns.get(rank) || []), id]);
  });
  // Barycentric ordering keeps converging branches next to their neighbours.
  const order = new Map(ids.map((id, i) => [id, i]));
  for (let sweep = 0; sweep < 4; sweep++) {
    const ranksInOrder = [...columns.keys()].sort((a, b) =>
      sweep % 2 ? b - a : a - b,
    );
    for (const rank of ranksInOrder) {
      const members = columns.get(rank)!;
      const center = (id: string) => {
        const neighbours = edges.flatMap((e) =>
          sweep % 2
            ? e.source === id && ranks.get(e.target)! > rank
              ? [e.target]
              : []
            : e.target === id && ranks.get(e.source)! < rank
              ? [e.source]
              : [],
        );
        return neighbours.length
          ? neighbours.reduce((sum, n) => sum + (order.get(n) || 0), 0) /
              neighbours.length
          : order.get(id)!;
      };
      members.sort(
        (a, b) => center(a) - center(b) || ids.indexOf(a) - ids.indexOf(b),
      );
      members.forEach((id, i) => order.set(id, i));
    }
  }
  const result: Record<string, Point> = {};
  const largest = Math.max(
    ...[...columns.values()].map((m) =>
      m.reduce((h, id) => h + (heights[id] || CARD_HEIGHT) + 100, 0),
    ),
    0,
  );
  for (const [rank, members] of columns) {
    const size = members.reduce(
      (h, id) => h + (heights[id] || CARD_HEIGHT) + 100,
      0,
    );
    let y = 64 + (largest - size) / 2;
    for (const id of members) {
      result[id] = { x: 56 + rank * (CARD_WIDTH + 200), y };
      y += (heights[id] || CARD_HEIGHT) + 100;
    }
  }
  return result;
}

export function segmentHitsRect(a: Point, b: Point, rect: GraphRect): boolean {
  const right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  if (a.x === b.x)
    return (
      a.x > rect.x &&
      a.x < right &&
      Math.max(a.y, b.y) > rect.y &&
      Math.min(a.y, b.y) < bottom
    );
  if (a.y === b.y)
    return (
      a.y > rect.y &&
      a.y < bottom &&
      Math.max(a.x, b.x) > rect.x &&
      Math.min(a.x, b.x) < right
    );
  return false;
}
export function rectsOverlap(a: GraphRect, b: GraphRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
function port(rect: GraphRect, side: Side, offset = 0, fraction = 0.5): Point {
  return side === "left"
    ? { x: rect.x - offset, y: rect.y + rect.height * fraction }
    : side === "right"
      ? { x: rect.x + rect.width + offset, y: rect.y + rect.height * fraction }
      : side === "top"
        ? { x: rect.x + rect.width * fraction, y: rect.y - offset }
        : {
            x: rect.x + rect.width * fraction,
            y: rect.y + rect.height + offset,
          };
}
function simplify(points: Point[]): Point[] {
  return points.filter(
    (p, i) =>
      !i ||
      i === points.length - 1 ||
      !(
        (points[i - 1].x === p.x && p.x === points[i + 1].x) ||
        (points[i - 1].y === p.y && p.y === points[i + 1].y)
      ),
  );
}

/** Rectilinear A* around cards. Labels never deform connection geometry. */
function findPath(start: Point, end: Point, obstacles: GraphRect[]): Point[] {
  const midX = (start.x + end.x) / 2,
    midY = (start.y + end.y) / 2;
  const simple = [
    [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end],
    [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end],
  ];
  for (const candidate of simple) {
    const points = simplify(
      candidate.filter(
        (p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y,
      ),
    );
    if (!obstacles.some((rect) => intersects(points, rect))) return points;
  }
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.x, r.x + r.width]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.y, r.y + r.height]),
    ]),
  ].sort((a, b) => a - b);
  const key = (x: number, y: number, d: number) => `${x},${y},${d}`;
  const startX = xs.indexOf(start.x),
    startY = ys.indexOf(start.y);
  const initial = key(startX, startY, 0);
  const costs = new Map([[initial, 0]]),
    previous = new Map<string, string>();
  const states = new Map([[initial, { x: startX, y: startY, d: 0 }]]);
  const pending = [{ id: initial, score: 0 }];
  let finish: string | undefined;
  while (pending.length) {
    pending.sort((a, b) => b.score - a.score);
    const current = pending.pop()!;
    const { x, y, d } = states.get(current.id)!;
    const a = { x: xs[x], y: ys[y] };
    if (a.x === end.x && a.y === end.y) {
      finish = current.id;
      break;
    }
    for (const [nx, ny, nd] of [
      [x - 1, y, 1],
      [x + 1, y, 1],
      [x, y - 1, 2],
      [x, y + 1, 2],
    ]) {
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const b = { x: xs[nx], y: ys[ny] };
      if (obstacles.some((rect) => segmentHitsRect(a, b, rect))) continue;
      const id = key(nx, ny, nd);
      const cost =
        costs.get(current.id)! +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        (d && d !== nd ? 100 : 0);
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, cost);
      previous.set(id, current.id);
      states.set(id, { x: nx, y: ny, d: nd });
      pending.push({
        id,
        score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y),
      });
    }
  }
  if (!finish)
    // Overlapping cards may enclose an endpoint. Keep the connector local.
    return simplify([start, { x: end.x, y: start.y }, end]);
  const result: Point[] = [];
  for (let id: string | undefined = finish; id; id = previous.get(id)) {
    const state = states.get(id)!;
    result.unshift({ x: xs[state.x], y: ys[state.y] });
  }
  return simplify(result);
}

export type RoutedConnection = GraphConnection & {
  sourceRect: GraphRect;
  targetRect: GraphRect;
  portSignature: string;
  points: Point[];
  path: string;
  sourceSide: Side;
  targetSide: Side;
  sourceFraction: number;
  targetFraction: number;
  labelPoint: Point;
  labelAnchor?: Point;
  labelRect: GraphRect;
  labelVisible: boolean;
};

function sameRect(a: GraphRect, b: GraphRect) {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}
function padded(rect: GraphRect, margin: number): GraphRect {
  return {
    ...rect,
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}
function intersects(points: Point[], rect: GraphRect) {
  return points.slice(1).some((p, i) => segmentHitsRect(points[i], p, rect));
}

/** Keep valid connections fixed; moved endpoints and newly obstructed paths alone reroute. */
export function createConnectionRouter() {
  let previous: RoutedConnection[] = [];
  return (rects: GraphRect[], connections: GraphConnection[]) => {
    previous = routeConnections(rects, connections, previous);
    return previous;
  };
}
export function routeConnections(
  rects: GraphRect[],
  connections: GraphConnection[],
  previous: RoutedConnection[] = [],
): RoutedConnection[] {
  const byId = new Map(rects.map((r) => [r.id, r])),
    old = new Map(previous.map((r) => [r.id, r]));
  const routed: RoutedConnection[] = [];
  for (const connection of connections) {
    const source = byId.get(connection.source),
      target = byId.get(connection.target);
    if (!source || !target) continue;
    // Source order belongs to the story, never to the Y coordinate of a dragged neighbour.
    const siblings = connections.filter((e) => e.source === connection.source),
      incoming = connections.filter((e) => e.target === connection.target);
    const portSignature = JSON.stringify([
      siblings.map((e) => e.id),
      incoming.map((e) => e.id),
    ]);
    const cached = old.get(connection.id);
    const reusable =
      cached &&
      cached.source === connection.source &&
      cached.target === connection.target &&
      cached.portSignature === portSignature &&
      sameRect(cached.sourceRect, source) &&
      sameRect(cached.targetRect, target) &&
      !rects.some(
        (r) =>
          r.id !== source.id &&
          r.id !== target.id &&
          intersects(cached.points, padded(r, 6)),
      );
    if (reusable) {
      routed.push({ ...cached, ...connection });
      continue;
    }
    const feedback = target.x + target.width < source.x;
    let sourceSide: Side, targetSide: Side;
    if (source.id === target.id) {
      sourceSide = "right";
      targetSide = "top";
    } else if (feedback) {
      sourceSide = "top";
      targetSide = "top";
    } else if (target.x >= source.x + source.width) {
      sourceSide = "right";
      targetSide = "left";
    } else if (source.x >= target.x + target.width) {
      sourceSide = "left";
      targetSide = "right";
    } else {
      sourceSide = target.y > source.y ? "right" : "left";
      targetSide = sourceSide;
    }
    const fraction = (items: GraphConnection[]) =>
      items.length < 2
        ? 0.5
        : 0.08 +
          (0.84 * items.findIndex((e) => e.id === connection.id)) /
            (items.length - 1);
    const sourceFraction = fraction(siblings),
      targetFraction = fraction(incoming);
    // A narrow real gap must remain a gap after adding visual clearance.
    const clearance = (rect: GraphRect) =>
      Math.min(
        8,
        ...rects
          .filter((r) => r.id !== rect.id)
          .map((r) => {
            const dx = Math.max(
              r.x - rect.x - rect.width,
              rect.x - r.x - r.width,
              0,
            );
            const dy = Math.max(
              r.y - rect.y - rect.height,
              rect.y - r.y - r.height,
              0,
            );
            return Math.max(dx, dy) / 3;
          }),
      );
    const sourceMargin = clearance(source),
      targetMargin = clearance(target);
    const obstacles = rects.map((r) => padded(r, clearance(r)));
    const start = port(source, sourceSide, sourceMargin, sourceFraction),
      end = port(target, targetSide, targetMargin, targetFraction);
    // Feedback lanes depend only on their endpoints, not on unrelated scene bounds.
    const lane =
      Math.min(source.y, target.y) -
      48 -
      siblings.findIndex((e) => e.id === connection.id) * 24;
    const middle = feedback
      ? [
          ...findPath(start, { x: start.x, y: lane }, obstacles),
          ...findPath(
            { x: start.x, y: lane },
            { x: end.x, y: lane },
            obstacles,
          ),
          ...findPath({ x: end.x, y: lane }, end, obstacles),
        ]
      : findPath(start, end, obstacles);
    const points = simplify(
      [
        port(source, sourceSide, 0, sourceFraction),
        ...middle,
        port(target, targetSide, 0, targetFraction),
      ].filter(
        (p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y,
      ),
    );
    routed.push({
      ...connection,
      sourceRect: source,
      targetRect: target,
      portSignature,
      sourceSide,
      targetSide,
      sourceFraction,
      targetFraction,
      points,
      path: points.map((p, i) => (i ? "L" : "M") + p.x + "," + p.y).join(" "),
      labelPoint: points[0],
      labelRect: {
        id: "label:" + connection.id,
        ...points[0],
        width: 0,
        height: 0,
      },
      labelVisible: false,
    });
  }
  // Place text after all lines. Crowded text may sit beside its line with a short leader.
  const labels: GraphRect[] = [];
  const result = routed.map((route) => ({
    ...route,
    labelVisible: false,
    labelAnchor: undefined as Point | undefined,
    labelRect: { ...route.labelRect, width: 0, height: 0 },
  }));
  const clearLeader = (
    route: RoutedConnection,
    anchor: Point,
    candidate: GraphRect,
  ) => {
    const end = {
      x: Math.max(
        candidate.x,
        Math.min(candidate.x + candidate.width, anchor.x),
      ),
      y: Math.max(
        candidate.y,
        Math.min(candidate.y + candidate.height, anchor.y),
      ),
    };
    return (
      ![...rects, ...labels].some((r) => segmentHitsRect(anchor, end, r)) &&
      !routed.some(
        (other) =>
          other.id !== route.id &&
          other.points.slice(1).some((b, i) => {
            const a = other.points[i];
            return segmentHitsRect(anchor, end, {
              id: other.id,
              x: Math.min(a.x, b.x) - 0.5,
              y: Math.min(a.y, b.y) - 0.5,
              width: Math.abs(a.x - b.x) + 1,
              height: Math.abs(a.y - b.y) + 1,
            });
          }),
      )
    );
  };
  const validLabel = (
    route: RoutedConnection,
    candidate: GraphRect,
    anchor?: Point,
  ) =>
    ![...rects, ...labels].some((r) => rectsOverlap(candidate, r)) &&
    !routed.some(
      (other) => other.id !== route.id && intersects(other.points, candidate),
    ) &&
    (!anchor || clearLeader(route, anchor, candidate));
  // Reserve valid previous labels before finding positions for changed routes.
  for (const route of result) {
    const cached = old.get(route.id),
      width = Math.max(80, Math.min(220, route.labelWidth || LABEL_WIDTH));
    if (
      route.label !== false &&
      cached?.labelVisible &&
      cached.path === route.path &&
      cached.labelRect.width === width &&
      validLabel(route, cached.labelRect, cached.labelAnchor)
    ) {
      route.labelVisible = true;
      route.labelPoint = cached.labelPoint;
      route.labelAnchor = cached.labelAnchor;
      route.labelRect = cached.labelRect;
      labels.push(cached.labelRect);
    }
  }
  for (const route of result) {
    if (route.label === false || route.labelVisible) continue;
    const width = Math.max(80, Math.min(220, route.labelWidth || LABEL_WIDTH));
    const segments = route.points
      .slice(1)
      .map((b, i) => ({
        a: route.points[i],
        b,
        length:
          Math.abs(route.points[i].x - b.x) + Math.abs(route.points[i].y - b.y),
      }))
      .sort(
        (a, b) =>
          Number(b.a.y === b.b.y) - Number(a.a.y === a.b.y) ||
          b.length - a.length,
      );
    outer: for (const offset of [0, -28, 28, -44, 44])
      for (const segment of segments) {
        if (
          segment.length <
          (offset
            ? 20
            : segment.a.y === segment.b.y
              ? width + 12
              : LABEL_HEIGHT + 12)
        )
          continue;
        for (const fraction of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const p = {
            x: segment.a.x + (segment.b.x - segment.a.x) * fraction,
            y: segment.a.y + (segment.b.y - segment.a.y) * fraction,
          };
          const center = {
            x: p.x + (segment.a.x === segment.b.x ? offset * 3 : 0),
            y: p.y + (segment.a.y === segment.b.y ? offset : 0),
          };
          const candidate = {
            id: "label:" + route.id,
            x: center.x - width / 2,
            y: center.y - LABEL_HEIGHT / 2,
            width,
            height: LABEL_HEIGHT,
          };
          if (!validLabel(route, candidate, offset ? p : undefined)) continue;
          if (offset) route.labelAnchor = p;
          route.labelVisible = true;
          route.labelPoint = center;
          route.labelRect = candidate;
          labels.push(candidate);
          break outer;
        }
      }
  }
  return result;
}
