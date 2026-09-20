import { useRef } from "react";
import {
  BaseEdge,
  ViewportPortal,
  type EdgeProps,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import {
  AlertTriangle,
  CornerUpLeft,
  CornerDownRight,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import type { Point, RoutedConnection } from "../graph-layout";
import type { GraphTransition } from "./model";
import {
  pointOnRoute,
  type RouteGeometry,
  type TrunkGeometry,
} from "./layout-state";
import { SemanticText, linkSummary, parentSummary } from "./presentation";
export type RouteAction =
  | { kind: "pin"; id: string }
  | { kind: "segment"; index: number }
  | { kind: "card" }
  | { kind: "trunk" };
export type RouteData = {
  route: RoutedConnection;
  geometry: RouteGeometry;
  trunk?: TrunkGeometry;
  group: GraphTransition;
  active: boolean;
  controls: boolean;
  muted: boolean;
  zoom: number;
  open: () => void;
  selectPin: (id: string) => void;
  begin: () => void;
  move: (action: RouteAction, point: Point, delta: Point) => void;
  end: (action?: RouteAction) => void;
  addPin: (index: number, point: Point) => void;
  context: (event: React.MouseEvent) => void;
  selectGroup: () => void;
};
export type RouteEdge = Edge<RouteData, "route">;
export function StoryConnection({ id, data, markerEnd }: EdgeProps<RouteEdge>) {
  const flow = useReactFlow(),
    drag = useRef<{
      action: RouteAction;
      start: Point;
      screen: Point;
      moved: boolean;
    } | null>(null);
  if (!data) return null;
  const { route, geometry, group, active, controls, muted, zoom } = data,
    item = group.items[0];
  const label = linkSummary(item);
  function down(
    event: React.PointerEvent<SVGElement | HTMLButtonElement>,
    action: RouteAction,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    data!.open();
    if (action.kind === "pin") data!.selectPin(action.id);
    drag.current = {
      action,
      start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      screen: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    data!.begin();
  }
  function move(event: React.PointerEvent) {
    const gesture = drag.current;
    if (!gesture) return;
    event.stopPropagation();
    if (
      !gesture.moved &&
      Math.hypot(
        event.clientX - gesture.screen.x,
        event.clientY - gesture.screen.y,
      ) < 3
    )
      return;
    gesture.moved = true;
    const point = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    data!.move(gesture.action, point, {
      x: point.x - gesture.start.x,
      y: point.y - gesture.start.y,
    });
  }
  function end(event: React.PointerEvent) {
    if (!drag.current) return;
    event.stopPropagation();
    const action = drag.current.action;
    drag.current = null;
    data!.end(action);
  }
  return (
    <>
      <g
        tabIndex={0}
        role="button"
        className="flow-edge-focus"
        aria-label={"轉場，" + label}
        onContextMenu={data.context}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            data.open();
          }
        }}
      >
        <BaseEdge
          id={id}
          path={route.path}
          markerEnd={markerEnd}
          interactionWidth={20}
          style={{
            stroke: geometry.error
              ? "#d9a16f"
              : active
                ? "#d4dfeb"
                : muted
                  ? "#555"
                  : "#999",
            strokeWidth: active ? 2.4 : 1.6,
            strokeDasharray: item.dynamic
              ? "6 5"
              : item.kind === "detour"
                ? "3 4"
                : undefined,
          }}
        />
      </g>
      {route.points.slice(1).map((b, index) => {
        const a = route.points[index],
          trunk = data.trunk,
          split = trunk?.points.at(-1);
        const shared =
          !!trunk &&
          ((pointOnRoute(a, trunk.points) && pointOnRoute(b, trunk.points)) ||
            (a.x === split?.x && b.x === split.x));
        return (
          <line
            key={index}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={
              "flow-route-hit nodrag nopan" + (controls ? " is-editable" : "")
            }
            style={{
              cursor: controls
                ? a.y === b.y
                  ? "ns-resize"
                  : "ew-resize"
                : "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (shared && !controls) data.selectGroup();
              else data.open();
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!shared || controls)
                data.addPin(
                  index,
                  flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                );
              else data.selectGroup();
            }}
            onPointerDown={(e) => {
              if (controls) down(e, { kind: "segment", index });
            }}
            onPointerMove={move}
            onPointerUp={end}
            onLostPointerCapture={end}
            onContextMenu={data.context}
          />
        );
      })}
      {controls && (
        <ViewportPortal>
          <svg
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "visible",
              pointerEvents: "none",
              zIndex: 60,
            }}
          >
            {geometry.pins.map((pin) => (
              <circle
                key={pin.id}
                data-pin-edge={id}
                data-pin-id={pin.id}
                className="flow-route-pin nodrag nopan"
                cx={pin.x}
                cy={pin.y}
                r={5 / Math.max(0.5, zoom)}
                aria-label="線路控制點"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  data.selectPin(pin.id);
                }}
                onPointerDown={(e) => down(e, { kind: "pin", id: pin.id })}
                onPointerMove={move}
                onPointerUp={end}
                onLostPointerCapture={end}
              />
            ))}
          </svg>
        </ViewportPortal>
      )}
    </>
  );
}

export type RouteCardNode = Node<
  {
    group: GraphTransition;
    geometry: RouteGeometry;
    muted: boolean;
    select: (additive: boolean) => void;
    context: (event: React.KeyboardEvent) => void;
  },
  "routeCard"
>;
export function RouteCard({ data, selected }: NodeProps<RouteCardNode>) {
  const { group, geometry, muted } = data,
    item = group.items[0];
  const label = linkSummary(item);
  const Icon = item.unresolved
    ? AlertTriangle
    : item.kind === "detour"
      ? CornerUpLeft
      : item.context?.some((p) => p.kind === "option")
        ? CornerDownRight
        : item.context?.length
          ? GitBranch
          : ArrowRight;

  return (
    <div
      data-route-id={group.id}
      role="button"
      tabIndex={0}
      aria-label={"轉場卡片，" + label}
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          data.select(e.shiftKey);
        }
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          e.stopPropagation();
          data.context(e);
        }
      }}
      className={
        "flow-edge-label flow-route-card" +
        (selected ? " is-active" : "") +
        (muted ? " is-muted" : "") +
        (geometry.error ? " has-conflict" : "")
      }
      style={{ width: geometry.card!.width, minHeight: geometry.card!.height }}
      title={
        geometry.error ||
        item.kind +
          ": " +
          (item.label || "無條件") +
          " · 第 " +
          item.line +
          " 行"
      }
    >
      <Icon size={14} />
      <span className="flow-edge-text">
        {parentSummary(item) && (
          <small className="flow-edge-parent">{parentSummary(item)}</small>
        )}
        <SemanticText text={label} />
      </span>
    </div>
  );
}
