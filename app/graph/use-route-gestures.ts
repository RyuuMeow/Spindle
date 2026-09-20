import { useCallback, useRef } from "react";
import type { Point, GraphRect } from "../graph-layout";
import { rectsOverlap } from "../graph-layout";
import {
  cloneLayout,
  moveSegment,
  movePin,
  projectCard,
  type GraphLayoutSnapshot,
} from "./layout-state";
import type { RouteAction } from "./RouteEditor";
import type { useGraphLayout } from "./use-graph-layout";
export function useRouteGestures(
  layout: ReturnType<typeof useGraphLayout>,
  geometry: GraphRect[],
) {
  const routeDragRef = useRef<GraphLayoutSnapshot | null>(null);
  const {
    current: layoutRef,
    begin: beginLayout,
    preview: previewLayout,
    commit: commitLayout,
  } = layout;
  const beginRoute = useCallback(() => {
    routeDragRef.current = cloneLayout(layoutRef.current);
    beginLayout();
  }, [layoutRef, beginLayout]);
  const editRoute = useCallback(
    (id: string, action: RouteAction, _point: Point, delta: Point) => {
      const origin = routeDragRef.current;
      if (!origin) return;
      const next = cloneLayout(origin),
        route = next.routes[id];
      if (!route) return;
      if (action.kind === "card" && route.card) {
        const wanted = { x: route.card.x + delta.x, y: route.card.y + delta.y };
        const peers = Object.values(origin.routes)
          .filter((r) => r.groupId === route.groupId && r.id !== id && r.card)
          .map((r) => r.card!);
        const candidate = projectCard(
          route.points,
          wanted,
          route.card.width,
          route.card.height,
          peers,
          route.card,
        );
        const box = {
          id,
          x: candidate.x - candidate.width / 2,
          y: candidate.y - candidate.height / 2,
          width: candidate.width,
          height: candidate.height,
        };
        const blockers = [
          ...geometry,
          ...Object.values(origin.routes)
            .filter((r) => r.id !== id && r.card)
            .map((r) => ({
              id: r.id,
              x: r.card!.x - r.card!.width / 2,
              y: r.card!.y - r.card!.height / 2,
              width: r.card!.width,
              height: r.card!.height,
            })),
        ];
        if (!blockers.some((b) => rectsOverlap(box, b))) route.card = candidate;
      } else if (action.kind === "pin") {
        const pin = route.pins.find((p) => p.id === action.id);
        if (!pin) return;
        next.routes[id] = movePin(route, action.id, {
          x: pin.x + delta.x,
          y: pin.y + delta.y,
        });
      } else if (action.kind === "segment") {
        const a = route.points[action.index],
          b = route.points[action.index + 1];
        if (a && b)
          next.routes[id] = moveSegment(route, action.index, {
            x: a.x + delta.x,
            y: a.y + delta.y,
          });
      }
      next.revision = layoutRef.current.revision + 1;
      previewLayout(next);
    },
    [geometry, layoutRef, previewLayout],
  );
  const endRoute = useCallback(
    (action?: RouteAction) => {
      routeDragRef.current = null;
      commitLayout(action?.kind !== "card");
    },
    [commitLayout],
  );
  return { routeDragRef, beginRoute, editRoute, endRoute };
}
