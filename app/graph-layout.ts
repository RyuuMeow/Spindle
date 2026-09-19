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

/** Rectilinear A* on obstacle boundaries. It also routes around earlier labels. */
function findPath(
  start: Point,
  end: Point,
  obstacles: GraphRect[],
  previousRoutes: RoutedConnection[],
): Point[] {
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.x, r.x + r.width]),
      ...previousRoutes.flatMap((r) =>
        r.points.flatMap((p) => [p.x - 16, p.x + 16]),
      ),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.y, r.y + r.height]),
      ...previousRoutes.flatMap((r) =>
        r.points.flatMap((p) => [p.y - 16, p.y + 16]),
      ),
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
      let crossingCost = 0;
      for (const route of previousRoutes)
        for (let i = 1; i < route.points.length; i++) {
          const c = route.points[i - 1],
            e = route.points[i];
          if (
            a.x === b.x &&
            c.x === e.x &&
            a.x === c.x &&
            Math.min(Math.max(a.y, b.y), Math.max(c.y, e.y)) >
              Math.max(Math.min(a.y, b.y), Math.min(c.y, e.y))
          )
            crossingCost += 400;
          else if (
            a.y === b.y &&
            c.y === e.y &&
            a.y === c.y &&
            Math.min(Math.max(a.x, b.x), Math.max(c.x, e.x)) >
              Math.max(Math.min(a.x, b.x), Math.min(c.x, e.x))
          )
            crossingCost += 400;
          else if (
            a.x === b.x &&
            c.y === e.y &&
            a.x > Math.min(c.x, e.x) &&
            a.x < Math.max(c.x, e.x) &&
            c.y > Math.min(a.y, b.y) &&
            c.y < Math.max(a.y, b.y)
          )
            crossingCost += 80;
          else if (
            a.y === b.y &&
            c.x === e.x &&
            c.x > Math.min(a.x, b.x) &&
            c.x < Math.max(a.x, b.x) &&
            a.y > Math.min(c.y, e.y) &&
            a.y < Math.max(c.y, e.y)
          )
            crossingCost += 80;
        }
      const cost =
        costs.get(current.id)! +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        (d && d !== nd ? 80 : 0) +
        crossingCost;
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
    return [
      start,
      { x: start.x, y: Math.min(...ys) - 40 },
      { x: end.x, y: Math.min(...ys) - 40 },
      end,
    ];
  const result: Point[] = [];
  for (let id: string | undefined = finish; id; id = previous.get(id)) {
    const state = states.get(id)!;
    result.unshift({ x: xs[state.x], y: ys[state.y] });
  }
  return simplify(result);
}

export type RoutedConnection = GraphConnection & {
  points: Point[];
  path: string;
  sourceSide: Side;
  targetSide: Side;
  sourceFraction: number;
  targetFraction: number;
  labelPoint: Point;
  labelRect: GraphRect;
  labelVisible: boolean;
};

export function routeConnections(
  rects: GraphRect[],
  connections: GraphConnection[],
): RoutedConnection[] {
  const byId = new Map(rects.map((rect) => [rect.id, rect]));
  const labels: GraphRect[] = [],
    routed: RoutedConnection[] = [];
  let feedbackLane = 0;
  for (const connection of [...connections].sort((a, b) => {
    const backward = (e: GraphConnection) =>
      (byId.get(e.target)?.x ?? 0) <= (byId.get(e.source)?.x ?? 0) ? 1 : 0;
    return backward(a) - backward(b);
  })) {
    const labelWidth = Math.max(
      80,
      Math.min(220, connection.labelWidth || LABEL_WIDTH),
    );
    const source = byId.get(connection.source),
      target = byId.get(connection.target);
    if (!source || !target) continue;
    const feedback = target.x < source.x - CARD_WIDTH / 2;
    let sourceSide: Side, targetSide: Side;
    if (source.id === target.id) {
      sourceSide = "right";
      targetSide = "top";
    } else if (feedback) {
      sourceSide = "top";
      targetSide = "top";
    } else if (Math.abs(target.x - source.x) > CARD_WIDTH / 2) {
      sourceSide = target.x > source.x ? "right" : "left";
      targetSide = sourceSide === "right" ? "left" : "right";
    } else {
      sourceSide = target.y > source.y ? "right" : "left";
      targetSide = sourceSide;
    }
    const siblings = connections
      .filter((e) => e.source === connection.source)
      .sort(
        (a, b) => (byId.get(a.target)?.y || 0) - (byId.get(b.target)?.y || 0),
      );
    const incoming = connections
      .filter((e) => e.target === connection.target)
      .sort(
        (a, b) => (byId.get(a.source)?.y || 0) - (byId.get(b.source)?.y || 0),
      );
    const fraction = (items: GraphConnection[]) =>
      items.length < 2
        ? 0.5
        : 0.08 +
          (0.84 * items.findIndex((e) => e.id === connection.id)) /
            (items.length - 1);
    const sourceFraction = fraction(siblings);
    const targetFraction = fraction(incoming);
    const obstacles = [
      ...rects.map((rect) => ({
        ...rect,
        x: rect.x - 22,
        y: rect.y - 22,
        width: rect.width + 44,
        height: rect.height + 44,
      })),
      ...labels,
    ];
    const start = port(source, sourceSide, 22, sourceFraction),
      end = port(target, targetSide, 22, targetFraction);
    const lane =
      Math.min(...rects.map((r) => r.y)) -
      60 -
      (feedback ? feedbackLane++ * 64 : 0);
    const middle = feedback
      ? [
          ...findPath(start, { x: start.x, y: lane }, obstacles, routed),
          { x: end.x, y: lane },
          ...findPath({ x: end.x, y: lane }, end, obstacles, routed),
        ]
      : findPath(start, end, obstacles, routed);
    const points = simplify(
      [
        port(source, sourceSide, 0, sourceFraction),
        ...middle,
        port(target, targetSide, 0, targetFraction),
      ].filter(
        (p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y,
      ),
    );
    const segments = points.slice(1).map((b, i) => ({
      a: points[i],
      b,
      length: Math.abs(points[i].x - b.x) + Math.abs(points[i].y - b.y),
    }));
    let label: Point | undefined, labelRect: GraphRect | undefined;
    for (const segment of [...segments].sort(
      (a, b) =>
        (b.a.y === b.b.y ? 1 : 0) - (a.a.y === a.b.y ? 1 : 0) ||
        b.length - a.length,
    )) {
      if (connection.label === false) break;
      if (
        segment.length <
        (segment.a.y === segment.b.y ? labelWidth + 16 : LABEL_HEIGHT + 16)
      )
        continue;
      for (const fraction of [0.5, 0.3, 0.7]) {
        const middle = {
          x: segment.a.x + (segment.b.x - segment.a.x) * fraction,
          y: segment.a.y + (segment.b.y - segment.a.y) * fraction,
        };
        const candidate = {
          id: `label:${connection.id}`,
          x: middle.x - labelWidth / 2,
          y: middle.y - LABEL_HEIGHT / 2,
          width: labelWidth,
          height: LABEL_HEIGHT,
        };
        if ([...rects, ...labels].some((rect) => rectsOverlap(candidate, rect)))
          continue;
        if (
          routed.some((route) =>
            route.points
              .slice(1)
              .some((b, i) => segmentHitsRect(route.points[i], b, candidate)),
          )
        )
          continue;
        label = middle;
        labelRect = candidate;
        break;
      }
      if (label) break;
    }
    const labelVisible = !!label && !!labelRect;
    if (labelRect) labels.push(labelRect);
    routed.push({
      ...connection,
      sourceSide,
      targetSide,
      sourceFraction,
      targetFraction,
      points,
      path: points
        .map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`)
        .join(" "),
      labelPoint: label || points[0],
      labelRect: labelRect || {
        id: `label:${connection.id}`,
        ...points[0],
        width: 0,
        height: 0,
      },
      labelVisible,
    });
  }
  return routed;
}
