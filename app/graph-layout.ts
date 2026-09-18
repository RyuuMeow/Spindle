/** Geometry shared by the canvas and its regression tests. No browser dependency. */
export type Point = { x: number; y: number };
export type GraphRect = Point & { id: string; width: number; height: number };
export type GraphConnection = {
  id: string;
  source: string;
  target: string;
  label?: boolean;
};
export type Side = "left" | "right" | "top" | "bottom";
export const CARD_WIDTH = 232;
export const CARD_HEIGHT = 108;
export const LABEL_WIDTH = 164;
export const LABEL_HEIGHT = 36;

/** Collapse cycles first so a feedback link cannot make ranks grow forever. */
export function layoutGraph(
  ids: string[],
  edges: GraphConnection[],
  heights: Record<string, number> = {},
): Record<string, Point> {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges)
    if (adjacency.has(edge.target))
      adjacency.get(edge.source)?.push(edge.target);
  let next = 0;
  const indexes = new Map<string, number>(),
    low = new Map<string, number>();
  const stack: string[] = [],
    active = new Set<string>(),
    groups: string[][] = [];
  function visit(id: string) {
    indexes.set(id, next);
    low.set(id, next++);
    stack.push(id);
    active.add(id);
    for (const target of adjacency.get(id) || []) {
      if (!indexes.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (active.has(target))
        low.set(id, Math.min(low.get(id)!, indexes.get(target)!));
    }
    if (low.get(id) === indexes.get(id)) {
      const group: string[] = [];
      let item: string;
      do {
        item = stack.pop()!;
        active.delete(item);
        group.push(item);
      } while (item !== id);
      groups.push(group.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));
    }
  }
  ids.forEach((id) => {
    if (!indexes.has(id)) visit(id);
  });
  const groupOf = new Map(
    groups.flatMap((group, index) => group.map((id) => [id, index] as const)),
  );
  const successors = groups.map(() => new Set<number>()),
    indegree = groups.map(() => 0),
    ranks = groups.map(() => 0);
  for (const edge of edges) {
    const a = groupOf.get(edge.source),
      b = groupOf.get(edge.target);
    if (
      a !== undefined &&
      b !== undefined &&
      a !== b &&
      !successors[a].has(b)
    ) {
      successors[a].add(b);
      indegree[b]++;
    }
  }
  const queue = indegree.flatMap((value, index) => (value ? [] : [index]));
  for (let i = 0; i < queue.length; i++)
    for (const target of successors[queue[i]]) {
      ranks[target] = Math.max(ranks[target], ranks[queue[i]] + 1);
      if (--indegree[target] === 0) queue.push(target);
    }
  const columns = new Map<number, string[]>();
  groups
    .sort((a, b) => ids.indexOf(a[0]) - ids.indexOf(b[0]))
    .forEach((group) => {
      const rank = ranks[groupOf.get(group[0])!];
      columns.set(rank, [...(columns.get(rank) || []), ...group]);
    });
  const result: Record<string, Point> = {};
  for (const [rank, members] of columns) {
    let y = 64;
    members.forEach((id) => {
      result[id] = { x: 56 + rank * (CARD_WIDTH + 236), y };
      y += (heights[id] || CARD_HEIGHT) + 100;
    });
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
        (d && d !== nd ? 24 : 0) +
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
  for (const connection of connections) {
    const source = byId.get(connection.source),
      target = byId.get(connection.target);
    if (!source || !target) continue;
    let sourceSide: Side, targetSide: Side;
    if (source.id === target.id) {
      sourceSide = "right";
      targetSide = "top";
    } else if (Math.abs(target.x - source.x) > CARD_WIDTH / 2) {
      sourceSide = target.x > source.x ? "right" : "left";
      targetSide = sourceSide === "right" ? "left" : "right";
    } else {
      sourceSide = target.y > source.y ? "right" : "left";
      targetSide = sourceSide;
    }
    const reverse = connections.some(
      (edge) =>
        edge.source === connection.target && edge.target === connection.source,
    );
    const siblings = connections.filter(
      (edge) =>
        edge.source === connection.source && edge.target !== connection.source,
    );
    const incoming = connections.filter(
      (edge) =>
        edge.target === connection.target && edge.source !== connection.target,
    );
    const sourceFraction = reverse
      ? sourceSide === "right"
        ? 0.35
        : 0.65
      : 0.25 +
        0.5 *
          ((siblings.findIndex((e) => e.id === connection.id) + 1) /
            (siblings.length + 1));
    const targetFraction = reverse
      ? targetSide === "left"
        ? 0.35
        : 0.65
      : 0.25 +
        0.5 *
          ((incoming.findIndex((e) => e.id === connection.id) + 1) /
            (incoming.length + 1));
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
    const points = simplify([
      port(source, sourceSide, 0, sourceFraction),
      ...findPath(
        port(source, sourceSide, 22, sourceFraction),
        port(target, targetSide, 22, targetFraction),
        obstacles,
        routed,
      ),
      port(target, targetSide, 0, targetFraction),
    ]);
    const segments = points
      .slice(1)
      .map((b, i) => ({
        a: points[i],
        b,
        length: Math.abs(points[i].x - b.x) + Math.abs(points[i].y - b.y),
      }));
    let label: Point | undefined, labelRect: GraphRect | undefined;
    for (const segment of segments) {
      if (connection.label === false) break;
      if (
        segment.length <
        (segment.a.y === segment.b.y ? LABEL_WIDTH + 16 : LABEL_HEIGHT + 16)
      )
        continue;
      for (const fraction of [0.5, 0.3, 0.7]) {
        const middle = {
          x: segment.a.x + (segment.b.x - segment.a.x) * fraction,
          y: segment.a.y + (segment.b.y - segment.a.y) * fraction,
        };
        const candidate = {
          id: `label:${connection.id}`,
          x: middle.x - LABEL_WIDTH / 2,
          y: middle.y - LABEL_HEIGHT / 2,
          width: LABEL_WIDTH,
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
