import { useCallback, useRef } from "react";
import type { Point, GraphRect } from "../graph-layout";
import { snapPin } from "./route-snapping";
import { previewRoutes } from "./manual-routing";
import { cloneLayout, movePin, type GraphLayoutSnapshot } from "./layout-state";
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
      if (action.kind === "pin") {
        const pin = route.pins.find((p) => p.id === action.id);
        if (!pin) return;
        next.routes[id] = movePin(
          route,
          action.id,
          snapPin(
            next,
            route,
            action.id,
            {
              x: pin.x + delta.x,
              y: pin.y + delta.y,
            },
            Object.fromEntries(geometry.map((r) => [r.id, r])),
          ),
        );
      }
      next.revision = layoutRef.current.revision + 1;
      previewLayout(
        previewRoutes(next, Object.fromEntries(geometry.map((r) => [r.id, r]))),
      );
    },
    [geometry, layoutRef, previewLayout],
  );
  const endRoute = useCallback(() => {
    routeDragRef.current = null;
    commitLayout();
  }, [commitLayout]);
  return { routeDragRef, beginRoute, editRoute, endRoute };
}
