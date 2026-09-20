"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ActionMenu from "./workspace/ActionMenu";
import SceneEditor, { type SceneEditorBindings } from "./graph/SceneEditor";
import type { SceneScope } from "./graph/scene-scope";
import { lineOffset } from "./workspace/authoring";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  Position,
  useReactFlow,
  MarkerType,
  SelectionMode,
  getViewportForBounds,
  type Node as FlowNode,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import {
  ArrowUpRight,
  AlertTriangle,
  Braces,
  Maximize,
  LayoutGrid,
  PenLine,
  Plus,
  Minus,
  LocateFixed,
  Undo2,
  Redo2,
  Search,
  X,
  GitBranch,
  Info,
  ArrowRight,
  CornerUpLeft,
  ChevronLeft,
  ChevronRight,
  PanelRight,
  FileText,
} from "lucide-react";
import { contextLabel, type Node, type Link, type Issue } from "./parser";
import { ChromeButton } from "@/components/ChromeButton";
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  type Point,
  type RoutedConnection,
} from "./graph-layout";
import "@xyflow/react/dist/style.css";
import "./graph.css";

import { useGraphModel, useGraphLayout } from "./graph/use-graph-layout";
import { SemanticText, measureLabels } from "./graph/presentation";
import { useRouteGestures } from "./graph/use-route-gestures";
import TrunkEditor from "./graph/TrunkEditor";
import {
  StoryConnection,
  RouteCard,
  type RouteCardNode,
  type RouteEdge,
} from "./graph/RouteEditor";
import {
  center,
  pathData,
  freezeControlOrder,
  removePin,
  type GraphState,
} from "./graph/layout-state";
import type {
  GraphScene as SceneRecord,
  GraphTransition as ConnectionGroup,
} from "./graph/model";
export type { GraphState } from "./graph/layout-state";
type RecordKind = SceneRecord["kind"];
type CardData = SceneRecord & {
  editor?: ReactNode;
  warning: boolean;
  compact: boolean;
  zoom: number;
  open: () => void;
  menu?: (event: React.KeyboardEvent) => void;
};
type SceneFlowNode = FlowNode<CardData, "scene">;
type GraphFlowNode = SceneFlowNode | RouteCardNode;
export type GraphProps = {
  file: string;
  allNodes: Node[];
  links: Link[];
  issues: Issue[];
  selected: string;
  onSelect: (node: Node | null) => void;
  onOpen: (node: Node) => void;
  onCreate: () => void;
  onGoTo?: (file: string, line: number) => void;
  focus: number;
  graphState?: GraphState;
  onGraphState: (state: GraphState) => void;
  onNodeMenu?: (
    node: Node,
    event: React.MouseEvent | React.KeyboardEvent,
  ) => void;
} & Partial<SceneEditorBindings>;
const EDIT_WIDTH = 480;
type EditSession = {
  documentId: string;
  record: SceneRecord;
  records: SceneRecord[];
  groups: ConnectionGroup[];
};
const kindLabel: Record<RecordKind, string> = {
  scene: "場景",
  external: "跨檔延續",
  missing: "找不到目標",
  dynamic: "執行時決定",
};
const sidePosition = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function SceneCard({ data, selected }: NodeProps<SceneFlowNode>) {
  const Icon =
    data.kind === "missing"
      ? AlertTriangle
      : data.kind === "dynamic"
        ? Braces
        : data.kind === "external"
          ? ArrowUpRight
          : GitBranch;
  const action =
    data.kind === "scene"
      ? "在節點內編輯"
      : data.kind === "external"
        ? "在節點內編輯"
        : "查看引用";
  return (
    <div
      className={`flow-card flow-card--${data.kind}${selected ? " is-selected" : ""}${data.editor ? " is-editing" : data.compact ? " is-overview" : ""}${!data.editor && data.zoom < 0.35 ? " is-distant" : ""}`}
      tabIndex={data.editor ? -1 : 0}
      role={data.editor ? undefined : "button"}
      aria-label={`${data.name}，${kindLabel[data.kind]}。按 Enter ${action}`}
      onKeyDown={(event) => {
        if (data.editor) return;
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
          data.menu?.(event);
        }
        if (event.key === "Enter") {
          event.stopPropagation();
          data.open();
        }
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!data.editor) data.open();
      }}
    >
      {Object.entries(sidePosition).map(([side, position]) => (
        <Fragment key={side}>
          <Handle
            id={`in-${side}`}
            type="target"
            position={position}
            isConnectable={false}
          />
          <Handle
            id={`out-${side}`}
            type="source"
            position={position}
            isConnectable={false}
          />
        </Fragment>
      ))}
      {data.editor || (
        <>
          <div className="flow-card-heading">
            {data.kind !== "scene" && (
              <Icon size={15} aria-label={kindLabel[data.kind]} />
            )}
            <strong className="flow-card-title" title={data.name}>
              {data.name}
            </strong>
            {data.warning && data.kind !== "missing" && (
              <AlertTriangle
                size={14}
                className="flow-warning"
                aria-label="有檢查問題"
              />
            )}
          </div>
          {data.kind === "external" ? (
            <span className="flow-card-file" title={data.node?.file}>
              {data.node?.file}
            </span>
          ) : data.node?.summary || data.kind !== "scene" ? (
            <p
              className="flow-card-summary"
              title={data.node?.summary || undefined}
            >
              {data.node?.summary ||
                (data.kind === "missing"
                  ? "找不到目標，請查看引用。"
                  : "動態目標，執行時決定。")}
            </p>
          ) : null}
          <button
            type="button"
            className="flow-card-action nodrag nopan"
            aria-label={action}
            title={action}
            onClick={(event) => {
              event.stopPropagation();
              data.open();
            }}
          >
            {data.kind === "scene" ? (
              <PenLine size={13} />
            ) : (
              <ArrowUpRight size={13} />
            )}
          </button>
        </>
      )}
    </div>
  );
}

const nodeTypes = { scene: SceneCard, routeCard: RouteCard };
const edgeTypes = { route: StoryConnection };

export default function Graph(props: GraphProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  file,
  allNodes,
  links,
  issues,
  selected,
  onSelect,
  onOpen,
  onCreate,
  onGoTo,
  focus,
  graphState,
  onGraphState,
  onNodeMenu,
  documents,
  commands,
  onDocumentEdit,
  onDocumentUndo,
  onDocumentSave,
  onDocumentComposition,
  onRenameScene,
}: GraphProps) {
  const flow = useReactFlow<GraphFlowNode, RouteEdge>();
  const [editing, setEditing] = useState<EditSession | null>(null);
  const canvasElement = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const leftDragStart = useRef<Point | null>(null);
  const [closeRequest, setCloseRequest] = useState(0);
  const [zoom, setZoom] = useState(graphState?.viewport?.zoom || 1);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const measurementFrame = useRef<number | null>(null);
  const pendingHeights = useRef<Record<string, number>>({});
  useEffect(
    () => () => {
      if (measurementFrame.current !== null)
        cancelAnimationFrame(measurementFrame.current);
    },
    [],
  );
  const [targetSelection, setTargetSelection] = useState(""),
    [edgeSelection, setEdgeSelection] = useState("");
  const [nodeSelection, setNodeSelection] = useState<Set<string>>(new Set());
  const boxSelectionBase = useRef<Set<string> | null>(null);
  const [selectedPin, setSelectedPin] = useState<{
    edge: string;
    pin: string;
  } | null>(null);
  const [groupSelection, setGroupSelection] = useState("");
  const [search, setSearch] = useState(""),
    [canvasMenu, setCanvasMenu] = useState<{
      x: number;
      y: number;
      edge?: string;
      pin?: string;
    } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDetails, setShowDetails] = useState(
    graphState?.detailsOpen === true,
  );
  function updateDetails(value: boolean) {
    setShowDetails(value);
    onGraphState({ ...graphState, detailsOpen: value });
  }
  const [searchIndex, setSearchIndex] = useState(-1);
  const initialViewport = useRef(graphState?.viewport),
    placed = useRef(false),
    previousFocus = useRef(focus),
    needsFit = useRef(false);
  const own = useMemo(
    () => allNodes.filter((node) => node.file === file),
    [allNodes, file],
  );
  const out = useMemo(
    () => links.filter((link) => own.some((node) => node.id === link.source)),
    [links, own],
  );
  const currentGraph = useGraphModel(
    file,
    allNodes,
    links,
    documents,
    graphState?.anchors,
  );
  const { records, groups } = editing || currentGraph;
  const cardHeights = useMemo(
    () =>
      Object.fromEntries(
        records.map((record) => [
          record.id,
          heights[record.id] ||
            (record.kind === "external"
              ? 68
              : record.node?.summary
                ? CARD_HEIGHT
                : record.kind === "scene"
                  ? 50
                  : 92),
        ]),
      ),
    [records, heights],
  );
  const measuredLabels = useMemo(() => measureLabels(groups), [groups]);
  const sizes = useMemo(
    () =>
      Object.fromEntries(
        records.map((r) => [
          r.id,
          {
            width: editing?.record.id === r.id ? EDIT_WIDTH : CARD_WIDTH,
            height: cardHeights[r.id],
          },
        ]),
      ),
    [records, cardHeights, editing],
  );
  const fitAfterArrange = useRef<() => void>(() => {});
  const layout = useGraphLayout({
    model: currentGraph,
    state: graphState,
    sizes,
    labels: measuredLabels,
    suspended: !!editing,
    ready: records.length > 0 && records.every((r) => heights[r.id] > 0),
    onChange: onGraphState,
    viewport: () => flow.getViewport(),
    restoreViewport: (v) => {
      void flow.setViewport(v);
    },
    onArrangeAll: () => fitAfterArrange.current(),
  });
  const positions = layout.layout.positions;
  const automatic = useMemo(
    () =>
      Object.fromEntries(
        records.map((r, i) => [
          r.id,
          positions[r.id] || { x: (i % 3) * 360, y: Math.floor(i / 3) * 180 },
        ]),
      ),
    [records, positions],
  );
  const selectedId =
    records.find((r) => r.node?.id === selected)?.id || targetSelection;
  const previousLayout = layout.canUndo,
    canRedo = layout.canRedo;
  const setPositions = layout.translate;
  const persistLayout = layout.persist;
  const goToLink = useCallback(
    (link: Link) => {
      const source = own.find((node) => node.id === link.source);
      if (!source) return;
      if (onGoTo) onGoTo(source.file, link.line);
      else onOpen(source);
    },
    [own, onGoTo, onOpen],
  );
  const openRecord = useCallback(
    (record: SceneRecord) => {
      if (
        record.node &&
        documents &&
        onDocumentEdit &&
        onDocumentUndo &&
        onDocumentComposition
      ) {
        if (editing) return;
        const doc = documents.find((doc) => doc.name === record.node!.file);
        if (!doc) return;
        const nextPositions = Object.fromEntries(
          records.map((item) => [
            item.id,
            positions[item.id] || automatic[item.id],
          ]),
        );
        setPositions(nextPositions);
        setEditing({ documentId: doc.id, record, records, groups });
        const position = nextPositions[record.id],
          surface = canvasElement.current;
        const viewport = flow.getViewport(),
          nextZoom = Math.max(0.9, Math.min(1.15, viewport.zoom));
        const width = surface?.clientWidth || 800,
          height = surface?.clientHeight || 600;
        void flow.setViewport(
          {
            x: width / 2 - (position.x + EDIT_WIDTH / 2) * nextZoom,
            y:
              Math.max(64, (height - 470 * nextZoom) / 2) -
              position.y * nextZoom,
            zoom: nextZoom,
          },
          { duration: 160 },
        );
      } else if (record.node) onOpen(record.node);
      else if (record.reference) goToLink(record.reference);
    },
    [
      onOpen,
      goToLink,
      documents,
      onDocumentEdit,
      onDocumentUndo,
      onDocumentComposition,
      editing,
      records,
      groups,
      positions,
      automatic,
      flow,
      setPositions,
    ],
  );
  const finishEdit = useCallback(
    (scope: SceneScope) => {
      if (!editing) return;
      const doc = documents?.find((doc) => doc.id === editing.documentId);
      const nextRecord =
        doc &&
        currentGraph.records.find(
          (record) =>
            record.node?.file === doc.name &&
            lineOffset(doc.text, record.node.start) === scope.sceneFrom,
        );
      const nextPositions = { ...positions };
      if (nextRecord && nextRecord.id !== editing.record.id)
        nextPositions[nextRecord.id] = positions[editing.record.id];
      setPositions(nextPositions);
      persistLayout();
      if (nextRecord?.node) onSelect(nextRecord.node);
      setEditing(null);
      requestAnimationFrame(() =>
        canvasElement.current
          ?.querySelector<HTMLElement>(".flow-card.is-selected")
          ?.focus(),
      );
    },
    [
      editing,
      documents,
      currentGraph,
      onSelect,
      positions,
      persistLayout,
      setPositions,
    ],
  );
  const editorDocument =
    editing && documents?.find((doc) => doc.id === editing.documentId);
  const nodeEditor = useMemo(
    () =>
      editing &&
      editorDocument &&
      editing.record.node &&
      onDocumentEdit &&
      onDocumentUndo &&
      onDocumentComposition ? (
        <SceneEditor
          documents={documents || []}
          key={editing.documentId + editing.record.id}
          doc={editorDocument}
          node={editing.record.node}
          commands={commands || []}
          onDocumentEdit={onDocumentEdit}
          onDocumentSave={onDocumentSave}
          onDocumentUndo={onDocumentUndo}
          onDocumentComposition={onDocumentComposition}
          onRenameScene={onRenameScene}
          onClose={finishEdit}
          closeRequest={closeRequest}
          canNavigate={(name) =>
            allNodes.filter((n) => n.name === name).length === 1
          }
          onNavigate={(name) => {
            const target = allNodes.find((n) => n.name === name);
            if (target) onGoTo?.(target.file, target.body);
          }}
        />
      ) : undefined,
    [
      editing,
      editorDocument,
      documents,
      onDocumentEdit,
      onDocumentUndo,
      onDocumentComposition,
      commands,
      onRenameScene,
      onDocumentSave,
      finishEdit,
      closeRequest,
      allNodes,
      onGoTo,
    ],
  );
  const nodes: SceneFlowNode[] = useMemo(
    () =>
      records.map((record) => ({
        id: record.id,
        type: "scene",
        position: positions[record.id] || automatic[record.id],
        width: editing?.record.id === record.id ? EDIT_WIDTH : CARD_WIDTH,
        zIndex: editing?.record.id === record.id ? 100 : 0,
        draggable: !editing || editing.record.id !== record.id,
        measured: heights[record.id]
          ? {
              width: editing?.record.id === record.id ? EDIT_WIDTH : CARD_WIDTH,
              height: heights[record.id],
            }
          : undefined,
        selected: nodeSelection.has(record.id),
        data: {
          ...record,
          editor: editing?.record.id === record.id ? nodeEditor : undefined,
          compact: zoom < 0.6,
          zoom,
          open: () => openRecord(record),
          menu: record.node
            ? (event) => onNodeMenu?.(record.node!, event)
            : undefined,
          warning:
            !!record.node &&
            issues.some(
              (issue) =>
                issue.file === record.node!.file &&
                issue.line >= record.node!.start &&
                issue.line <= record.node!.end,
            ),
        },
      })),
    [
      records,
      positions,
      automatic,
      nodeSelection,
      zoom,
      openRecord,
      issues,
      onNodeMenu,
      heights,
      editing,
      nodeEditor,
    ],
  );
  const geometry = useMemo(
    () =>
      records.map((record) => ({
        id: record.id,
        ...(positions[record.id] || automatic[record.id]),
        width: editing?.record.id === record.id ? EDIT_WIDTH : CARD_WIDTH,
        height: cardHeights[record.id],
      })),
    [records, positions, automatic, cardHeights, editing],
  );
  const routes: RoutedConnection[] = useMemo(
    () =>
      Object.values(layout.layout.routes).flatMap((route) => {
        const group = groups.find((g) => g.id === route.id);
        const sourceRect = geometry.find((r) => r.id === route.source),
          targetRect = geometry.find((r) => r.id === route.target);
        if (!group || !sourceRect || !targetRect) return [];
        const points = route.points.map((p) => ({ ...p }));
        const start = center(sourceRect, route.sourceSide),
          end = center(targetRect, route.targetSide);
        if (points.length >= 2) {
          const old = points[0],
            last = points.at(-1)!;
          if (start.x !== old.x || start.y !== old.y) {
            const next = points[1];
            points.splice(
              0,
              1,
              start,
              route.sourceSide === "left" || route.sourceSide === "right"
                ? { x: next.x, y: start.y }
                : { x: start.x, y: next.y },
            );
          }
          if (end.x !== last.x || end.y !== last.y) {
            const previous = points.at(-2)!;
            points.splice(
              points.length - 1,
              1,
              route.targetSide === "left" || route.targetSide === "right"
                ? { x: previous.x, y: end.y }
                : { x: end.x, y: previous.y },
              end,
            );
          }
        }
        const labelPoint =
          route.card || points[Math.floor(points.length / 2)] || start;
        return [
          {
            ...group,
            points,
            path: pathData(points),
            sourceRect,
            targetRect,
            portSignature: "center",
            sourceSide: route.sourceSide,
            targetSide: route.targetSide,
            sourceFraction: 0.5,
            targetFraction: 0.5,
            labelVisible: group.label && !!route.card,
            labelPoint,
            labelRect: {
              id: route.id,
              x: labelPoint.x - (route.card?.width || 160) / 2,
              y: labelPoint.y - (route.card?.height || 32) / 2,
              width: route.card?.width || 160,
              height: route.card?.height || 32,
            },
          },
        ];
      }),
    [layout.layout.routes, groups, geometry],
  );
  const selectEdge = useCallback(
    (id: string) => {
      onSelect(null);
      setTargetSelection("");
      setNodeSelection(new Set());
      setGroupSelection("");
      setEdgeSelection(id);
      if (selectedPin?.edge !== id) setSelectedPin(null);
    },
    [onSelect, selectedPin?.edge],
  );
  useEffect(() => {
    if (edgeSelection) canvasElement.current?.focus();
  }, [edgeSelection]);
  const { routeDragRef, beginRoute, editRoute, endRoute } = useRouteGestures(
    layout,
    geometry,
  );
  const edges: RouteEdge[] = useMemo(
    () =>
      routes.map((route) => {
        const group = groups.find((g) => g.id === route.id)!;
        const active =
          nodeSelection.has(group.id) ||
          edgeSelection === group.id ||
          (!!groupSelection && group.groupId === groupSelection) ||
          (!edgeSelection &&
            !groupSelection &&
            (nodeSelection.has(group.source) ||
              nodeSelection.has(group.target)));
        return {
          id: group.id,
          source: group.source,
          target: group.target,
          type: "route",
          zIndex: edgeSelection === group.id ? 20 : active ? 10 : 0,
          sourceHandle: "out-" + route.sourceSide,
          targetHandle: "in-" + route.targetSide,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active ? "#d4dfeb" : "#999",
            width: 16,
            height: 16,
          },
          data: {
            route,
            geometry: layout.layout.routes[route.id],
            trunk: group.groupId
              ? layout.layout.trunks[group.groupId]
              : undefined,
            group,
            active,
            controls: edgeSelection === route.id,
            muted:
              (!!edgeSelection || !!groupSelection || nodeSelection.size > 0) &&
              !active,
            zoom,
            open: () => selectEdge(group.id),
            selectPin: (pin) => setSelectedPin({ edge: group.id, pin }),
            selectGroup: () => {
              selectEdge("");
              setGroupSelection(group.groupId || "");
            },
            begin: beginRoute,
            move: (action, point, delta) =>
              editRoute(group.id, action, point, delta),
            end: endRoute,
            addPin: (index, point) => {
              selectEdge(group.id);
              layout.transaction((next) => {
                const r = next.routes[group.id],
                  a = r.points[index],
                  b = r.points[index + 1];
                if (!a || !b) return next;
                const pin = {
                  id: crypto.randomUUID(),
                  x:
                    a.x === b.x
                      ? a.x
                      : Math.max(
                          Math.min(a.x, b.x),
                          Math.min(Math.max(a.x, b.x), point.x),
                        ),
                  y:
                    a.y === b.y
                      ? a.y
                      : Math.max(
                          Math.min(a.y, b.y),
                          Math.min(Math.max(a.y, b.y), point.y),
                        ),
                };
                freezeControlOrder(r);
                r.pins.push(pin);
                freezeControlOrder(r);
                r.points.splice(index + 1, 0, { x: pin.x, y: pin.y });
                next.revision++;
                setSelectedPin({ edge: group.id, pin: pin.id });
                return next;
              });
            },
            context: (event) => {
              event.preventDefault();
              event.stopPropagation();
              selectEdge(group.id);
              setCanvasMenu({
                x: event.clientX,
                y: event.clientY,
                edge: group.id,
              });
            },
          },
        };
      }),
    [
      routes,
      groups,
      edgeSelection,
      groupSelection,
      nodeSelection,
      zoom,
      layout,
      selectEdge,
      beginRoute,
      editRoute,
      endRoute,
    ],
  );
  const cardNodes: RouteCardNode[] = routes
    .filter((r) => r.labelVisible && zoom >= 0.35)
    .map((r) => ({
      id: r.id,
      type: "routeCard",
      position: { x: r.labelRect.x, y: r.labelRect.y },
      width: r.labelRect.width,
      height: r.labelRect.height,
      measured: { width: r.labelRect.width, height: r.labelRect.height },
      selected: nodeSelection.has(r.id),
      zIndex: 50,
      draggable: !editing,
      data: {
        group: groups.find((g) => g.id === r.id)!,
        geometry: layout.layout.routes[r.id],
        muted: false,
        select: (additive) => {
          setNodeSelection((prior) => {
            const next = additive ? new Set(prior) : new Set<string>();
            if (additive && next.has(r.id)) next.delete(r.id);
            else next.add(r.id);
            return next;
          });
          setEdgeSelection(r.id);
          setSelectedPin(null);
          setGroupSelection("");
        },
        context: (event) => {
          const b = event.currentTarget.getBoundingClientRect();
          if (!nodeSelection.has(r.id)) setNodeSelection(new Set([r.id]));
          setCanvasMenu({ x: b.left, y: b.bottom, edge: r.id });
        },
      },
    }));
  const selectionLabel = nodeSelection.size
    ? "整理選取的 " + nodeSelection.size + " 個物件"
    : "整理全部";
  const save = persistLayout;
  const fitAll = useCallback(
    (duration = 200) => {
      if (!nodes.length) return;
      const boxes = [
        ...nodes.map((node) => ({
          ...node.position,
          width: CARD_WIDTH,
          height: cardHeights[node.id],
        })),
        ...routes
          .filter((route) => route.labelVisible)
          .map((route) => route.labelRect),
        ...routes.flatMap((route) =>
          route.points.map((point) => ({ ...point, width: 0, height: 0 })),
        ),
      ];
      const x = Math.min(...boxes.map((box) => box.x)),
        y = Math.min(...boxes.map((box) => box.y));
      const bounds = {
        x,
        y,
        width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
        height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
      };
      const surface = canvasElement.current?.querySelector(".react-flow");
      if (
        surface &&
        surface.clientWidth &&
        surface.clientHeight &&
        flow.viewportInitialized
      )
        void flow.setViewport(
          getViewportForBounds(
            {
              x: bounds.x - 32,
              y: bounds.y - 32,
              width: bounds.width + 64,
              height: bounds.height + 64,
            },
            surface.clientWidth,
            surface.clientHeight,
            0.2,
            1,
            0.08,
          ),
          { duration },
        );
    },
    [nodes, routes, flow, cardHeights],
  );
  useEffect(() => {
    if (
      !flow.viewportInitialized ||
      placed.current ||
      !records.length ||
      !records.every((record) => heights[record.id] > 0)
    )
      return;
    placed.current = true;
    if (initialViewport.current) void flow.setViewport(initialViewport.current);
    else fitAll(0);
  }, [flow, fitAll, records, heights]);
  useEffect(() => {
    fitAfterArrange.current = () => fitAll();
  }, [fitAll]);
  useEffect(() => {
    if (needsFit.current) {
      needsFit.current = false;
      fitAll();
    }
  }, [fitAll]);
  useEffect(() => {
    if (focus === previousFocus.current) return;
    previousFocus.current = focus;
    const node = nodes.find((node) => node.data.node?.id === selected);
    if (node)
      void flow.setCenter(
        node.position.x + CARD_WIDTH / 2,
        node.position.y + cardHeights[node.id] / 2,
        { zoom: flow.getZoom(), duration: 200 },
      );
  }, [focus, nodes, selected, flow, cardHeights]);
  const selection = records.find((record) => record.id === selectedId);
  const selectedGroup = groups.find((group) => group.id === edgeSelection);
  const firstIssue = issues.find(
    (issue) => issue.file === file && issue.severity === "error",
  );
  const matches = search.trim()
    ? nodes.filter((node) =>
        node.data.name
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : [];
  function locateMatch(index: number) {
    if (!matches.length) return;
    const next = (index + matches.length) % matches.length;
    const node = matches[next];
    setSearchIndex(next);
    setEdgeSelection("");
    if (node.data.node) {
      setTargetSelection("");
      onSelect(node.data.node);
    } else {
      onSelect(null);
      setTargetSelection(node.id);
    }
    void flow.setCenter(
      node.position.x + CARD_WIDTH / 2,
      node.position.y + cardHeights[node.id] / 2,
      { zoom: Math.max(flow.getZoom(), 0.8), duration: 150 },
    );
  }
  function stepMatch(direction: number) {
    locateMatch(
      (searchIndex < 0 ? (direction < 0 ? 0 : -1) : searchIndex) + direction,
    );
  }
  function closeSearch() {
    setShowSearch(false);
    canvasElement.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="找場景"]')
      ?.focus();
  }
  function arrange() {
    if (editing) return;
    layout.request(
      nodeSelection.size
        ? {
            kind: "selected",
            ids: [...nodeSelection].filter(
              (id) => !!layout.layout.positions[id],
            ),
            cards: [...nodeSelection].filter(
              (id) => !!layout.layout.routes[id]?.card,
            ),
          }
        : { kind: "all" },
      true,
    );
  }
  function undoLayout() {
    layout.history();
  }
  function redoLayout() {
    layout.history(true);
  }
  const rightDrag = useRef<{
    x: number;
    y: number;
    viewport: Viewport;
    moved: boolean;
    node?: Node;
    edge?: string;
    pin?: string;
  } | null>(null);
  function routeAction(action: "simplify" | "reset") {
    if (!canvasMenu?.edge) return;
    const id = canvasMenu.edge;
    layout.transaction((next) => {
      const r = next.routes[id];
      if (!r) return next;
      if (action === "reset") delete next.routes[id];
      else {
        freezeControlOrder(r);
        r.fixedSegments = [];
        r.controlOrder = r.controlOrder!.filter(
          (k) => !k.startsWith("segment:"),
        );
        r.reroute = true;
      }
      next.revision++;
      return next;
    });
  }
  function deletePin(edge: string, pin: string) {
    layout.transaction((next) => {
      if (next.routes[edge])
        next.routes[edge] = removePin(next.routes[edge], pin);
      next.revision++;
      return next;
    });
    setSelectedPin(null);
  }
  return (
    <div
      className={"story-canvas" + (dragging ? " is-dragging" : "")}
      ref={canvasElement}
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        const hit = event.target as Element;
        if (
          event.button === 0 &&
          (hit.classList.contains("react-flow__pane") ||
            hit.closest(".react-flow__node")) &&
          !hit.closest(".flow-route-pin,.flow-route-hit,.flow-trunk-hit") &&
          !hit.closest("input,textarea,[contenteditable=true]")
        ) {
          setSelectedPin(null);
          setGroupSelection("");
          setEdgeSelection("");
        }
        leftDragStart.current =
          event.button === 0 &&
          !!hit.closest(".react-flow__node,.flow-route-pin") &&
          !hit.closest(
            "input,textarea,[contenteditable=true],.flow-scene-editor",
          )
            ? { x: event.clientX, y: event.clientY }
            : null;
        if (event.button === 0)
          boxSelectionBase.current =
            event.shiftKey &&
            (event.target as Element).classList.contains("react-flow__pane")
              ? new Set(nodeSelection)
              : null;
        if (
          event.button !== 2 ||
          (event.target as Element).closest(
            "input,textarea,[contenteditable=true],.flow-scene-editor,.flow-navigation,.action-menu",
          )
        )
          return;
        const target = event.target as Element;
        const id = target.closest(".react-flow__node")?.getAttribute("data-id");
        const edge =
          target.closest("[data-pin-edge]")?.getAttribute("data-pin-edge") ||
          target.closest("[data-route-id]")?.getAttribute("data-route-id") ||
          target.closest(".react-flow__edge")?.getAttribute("data-id") ||
          undefined;
        if (id && layout.layout.routes[id]?.card && !nodeSelection.has(id))
          setNodeSelection(new Set([id]));
        rightDrag.current = {
          x: event.clientX,
          y: event.clientY,
          viewport: flow.getViewport(),
          moved: false,
          node: records.find((r) => r.id === id)?.node,
          edge,
          pin:
            target.closest("[data-pin-id]")?.getAttribute("data-pin-id") ||
            undefined,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerMoveCapture={(event) => {
        const left = leftDragStart.current;
        if (
          left &&
          event.buttons === 1 &&
          Math.hypot(event.clientX - left.x, event.clientY - left.y) > 3
        )
          setDragging(true);
        const right = rightDrag.current;
        if (!right) return;
        const dx = event.clientX - right.x,
          dy = event.clientY - right.y;
        if (!right.moved && Math.hypot(dx, dy) <= 5) return;
        right.moved = true;
        setDragging(true);
        setCanvasMenu(null);
        void flow.setViewport({
          ...right.viewport,
          x: right.viewport.x + dx,
          y: right.viewport.y + dy,
        });
        event.stopPropagation();
      }}
      onPointerUpCapture={(event) => {
        setDragging(false);
        leftDragStart.current = null;
        const right = rightDrag.current;
        if (!right) return;
        rightDrag.current = null;
        event.stopPropagation();
        if (right.moved) {
          layout.persist();
          return;
        }
        if (right.node) onNodeMenu?.(right.node, event);
        else
          setCanvasMenu({
            x: event.clientX,
            y: event.clientY,
            edge: right.edge,
            pin: right.pin,
          });
      }}
      onPointerCancel={() => {
        setDragging(false);
        leftDragStart.current = null;
        rightDrag.current = null;
        routeDragRef.current = null;
        layout.cancel();
      }}
      onContextMenuCapture={(event) => {
        if (
          (event.target as Element).closest(
            "input,textarea,[contenteditable=true],.flow-scene-editor",
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          )
        )
          return;
        if (e.key === "Escape") {
          setDragging(false);
          leftDragStart.current = null;
          routeDragRef.current = null;
          if (layout.cancel()) {
            e.preventDefault();
            e.stopPropagation();
          }
          setCanvasMenu(null);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && selectedPin) {
          e.preventDefault();
          e.stopPropagation();
          deletePin(selectedPin.edge, selectedPin.pin);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redoLayout();
          else undoLayout();
        }
      }}
    >
      {showSearch && (
        <div
          className="flow-find"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeSearch();
            }
          }}
        >
          <div className="flow-find-input">
            <Search size={15} />
            <input
              autoFocus
              aria-label="圖內搜尋場景"
              placeholder="找場景"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchIndex(-1);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === "ArrowDown" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  stepMatch(event.shiftKey || event.key === "ArrowUp" ? -1 : 1);
                }
              }}
            />
            <span role="status">
              {search.trim()
                ? matches.length
                  ? searchIndex < 0
                    ? `${matches.length} 項`
                    : `${searchIndex + 1} / ${matches.length}`
                  : "無結果"
                : ""}
            </span>
            <ChromeButton
              title="上一個場景"
              aria-label="上一個場景"
              disabled={!matches.length}
              onClick={() => stepMatch(-1)}
            >
              <ChevronLeft size={15} />
            </ChromeButton>
            <ChromeButton
              title="下一個場景"
              aria-label="下一個場景"
              disabled={!matches.length}
              onClick={() => stepMatch(1)}
            >
              <ChevronRight size={15} />
            </ChromeButton>
            <ChromeButton
              title="關閉圖內搜尋"
              aria-label="關閉圖內搜尋"
              onClick={closeSearch}
            >
              <X size={15} />
            </ChromeButton>
          </div>
          {search.trim() && (
            <div className="flow-find-results" aria-label="符合的場景">
              {matches.length ? (
                matches.map((node, index) => (
                  <button
                    type="button"
                    key={node.id}
                    className={index === searchIndex ? "is-active" : ""}
                    onClick={() => locateMatch(index)}
                  >
                    <span>{node.data.name}</span>
                    {node.data.kind === "external" && (
                      <small>{node.data.node?.file}</small>
                    )}
                  </button>
                ))
              ) : (
                <p>沒有符合「{search}」的場景</p>
              )}
            </div>
          )}
        </div>
      )}
      {showHelp && (
        <div className="flow-guide">
          <div>
            <strong>本檔場景與轉場</strong>
            <ChromeButton
              type="button"
              aria-label="關閉圖例"
              onClick={() => setShowHelp(false)}
              title="關閉圖例"
            >
              <X size={14} />
            </ChromeButton>
          </div>
          <p>
            拖曳卡片只調整版面；雙擊或 Enter 編輯原文。左鍵框選，Shift
            加選，右鍵拖曳平移，滾輪縮放。移動卡片或 pin 理線；雙擊支線新增
            pin。
          </p>
          <p>
            {own.length} 個場景 · {out.length}{" "}
            個轉場；實線為跳轉，短虛線為呼叫後返回。條件僅呈現，不模擬執行。
          </p>
          <p>
            <ArrowUpRight size={13} />
            跨檔延續 <AlertTriangle size={13} />
            找不到目標 <Braces size={13} />
            執行時決定
          </p>
        </div>
      )}
      {nodes.length ? (
        <ReactFlow<GraphFlowNode, RouteEdge>
          nodes={[...nodes, ...cardNodes]}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          panOnDrag={false}
          selectionOnDrag={!editing}
          selectionMode={SelectionMode.Full}
          selectionKeyCode={null}
          multiSelectionKeyCode="Shift"
          panActivationKeyCode={null}
          nodeDragThreshold={0}
          nodeClickDistance={5}
          nodesFocusable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          minZoom={0.2}
          maxZoom={2}
          zoomOnScroll={!editing}
          zoomOnPinch={!editing}
          colorMode="dark"
          onSelectionEnd={() => {
            boxSelectionBase.current = null;
          }}
          onNodesChange={(changes) => {
            const preserved = boxSelectionBase.current;
            const moved: Record<string, Point> = {};
            const selections = changes.filter((c) => c.type === "select");
            if (selections.length)
              setNodeSelection((previous) => {
                const next = new Set(previous);
                for (const c of selections) {
                  if (c.type === "select") {
                    if (c.selected) next.add(c.id);
                    else if (!preserved?.has(c.id)) next.delete(c.id);
                  }
                }
                return next;
              });
            const measured: Record<string, number> = {};
            for (const change of changes) {
              if (change.type === "position" && change.position) {
                const c = layout.current.current.routes[change.id]?.card;
                const old =
                  layout.current.current.positions[change.id] ||
                  (c && { x: c.x - c.width / 2, y: c.y - c.height / 2 });
                if (
                  !old ||
                  old.x !== change.position.x ||
                  old.y !== change.position.y
                )
                  moved[change.id] = change.position;
              }
              if (
                change.type === "dimensions" &&
                change.dimensions &&
                records.some((r) => r.id === change.id) &&
                heights[change.id] !== change.dimensions.height
              )
                measured[change.id] = change.dimensions.height;
            }
            if (Object.keys(measured).length) {
              pendingHeights.current = {
                ...pendingHeights.current,
                ...measured,
              };
              if (measurementFrame.current === null)
                measurementFrame.current = requestAnimationFrame(() => {
                  measurementFrame.current = null;
                  const next = pendingHeights.current;
                  pendingHeights.current = {};
                  setHeights((previous) => ({ ...previous, ...next }));
                });
            }
            if (Object.keys(moved).length) layout.translate(moved);
          }}
          onNodeClick={(_, node) => {
            if (node.type === "routeCard") {
              setEdgeSelection(node.id);
              setGroupSelection("");
              setSelectedPin(null);
              onSelect(null);
              return;
            }
            setGroupSelection("");
            setSelectedPin(null);
            setEdgeSelection("");
            if (node.data.node) {
              setTargetSelection("");
              onSelect(node.data.node);
            } else {
              onSelect(null);
              setTargetSelection(node.id);
            }
          }}
          onNodeDragStart={() => {
            canvasElement.current?.focus();
            layout.begin();
          }}
          onSelectionDragStart={() => {
            canvasElement.current?.focus();
            layout.begin();
          }}
          onSelectionDragStop={() => layout.commit()}
          onPaneClick={() => {
            if (editing) {
              setCloseRequest((request) => request + 1);
              return;
            }
            onSelect(null);
            setNodeSelection(new Set());
            setGroupSelection("");
            setSelectedPin(null);
            setTargetSelection("");
            setEdgeSelection("");
            setCanvasMenu(null);
          }}
          onEdgeClick={(_, edge) => selectEdge(edge.id)}
          onNodeDragStop={() => layout.commit()}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          onMoveEnd={() => save()}
          defaultViewport={graphState?.viewport}
        >
          {Object.values(layout.layout.trunks).map((trunk) => (
            <TrunkEditor
              key={trunk.id}
              trunk={trunk}
              select={() => {
                selectEdge("");
                setGroupSelection(trunk.id);
              }}
            />
          ))}
          <Background bgColor="#1f1f1f" color="#393939" gap={24} size={1} />
        </ReactFlow>
      ) : (
        <div className="flow-empty">
          <GitBranch size={32} />
          <h2>
            {firstIssue ? "先修正原文，才能顯示場景" : "這份劇本還沒有場景"}
          </h2>
          <p>
            {firstIssue
              ? firstIssue.message
              : "建立第一個場景，故事的連結就會出現在這裡。"}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() =>
              firstIssue && onGoTo ? onGoTo(file, firstIssue.line) : onCreate()
            }
          >
            {firstIssue && onGoTo ? (
              <>
                <PenLine size={15} />
                查看第 {firstIssue.line} 行
              </>
            ) : (
              <>
                <Plus size={15} />
                建立場景
              </>
            )}
          </button>
        </div>
      )}
      {showDetails && (
        <aside className="flow-connection-detail" aria-label="圖表詳情">
          <div>
            <strong>
              {selectedGroup && selectedGroup.items.length > 1
                ? `${selectedGroup.items.length} 個分支通往同一場景`
                : selectedGroup
                  ? "轉場詳情"
                  : selection
                    ? "場景詳情"
                    : "圖表詳情"}
            </strong>
            <ChromeButton
              type="button"
              aria-label="關閉圖表詳情"
              onClick={() => updateDetails(false)}
              title="關閉圖表詳情"
            >
              <X size={15} />
            </ChromeButton>
          </div>
          {selectedGroup ? (
            <>
              <p className="flow-detail-route">
                <span>
                  {
                    records.find((record) => record.id === selectedGroup.source)
                      ?.name
                  }
                </span>
                <ArrowRight size={14} />
                <span>
                  {
                    records.find((record) => record.id === selectedGroup.target)
                      ?.name
                  }
                </span>
              </p>
              <ul className="flow-link-details">
                {selectedGroup.items.map((link, index) => (
                  <li key={`${link.line}:${index}`}>
                    <div className="flow-detail-kind">
                      {link.kind === "detour" ? (
                        <CornerUpLeft size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                      {link.kind === "detour" ? "呼叫後返回" : "跳轉"}
                    </div>
                    {link.unresolved && (
                      <p className="flow-detail-warning">
                        <AlertTriangle size={14} />
                        條件尚未解析完整，請查看原文。
                      </p>
                    )}
                    {link.context?.length ? (
                      <ol className="flow-context-path">
                        {link.context.map((part, partIndex) => (
                          <li key={partIndex}>
                            <SemanticText text={contextLabel(part)} />
                            <small>第 {part.line} 行</small>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>{link.label || "直接轉場"}</p>
                    )}
                    <button
                      type="button"
                      className="flow-source-link"
                      onClick={() => goToLink(link)}
                    >
                      <FileText size={14} />
                      查看第 {link.line} 行<ArrowUpRight size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : selection ? (
            <>
              <h3>{selection.name}</h3>
              {selection.kind !== "scene" && <p>{kindLabel[selection.kind]}</p>}
              {selection.node && (
                <>
                  <p className="flow-detail-file">
                    <FileText size={14} />
                    {selection.node.file} · 第 {selection.node.start} 行
                  </p>
                  {selection.node.headers.tags && (
                    <div className="flow-tags">
                      {selection.node.headers.tags
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                    </div>
                  )}
                  {selection.node.calls.length > 0 && (
                    <>
                      <h4>命令</h4>
                      <ul className="flow-command-details">
                        {selection.node.calls.map((call, index) => (
                          <li key={index}>
                            <code>
                              {call.name} {call.args.join(" ")}
                            </code>
                            <button
                              type="button"
                              title={`查看第 ${call.line} 行`}
                              aria-label={`查看第 ${call.line} 行`}
                              onClick={() =>
                                onGoTo?.(selection.node!.file, call.line)
                              }
                            >
                              <ArrowUpRight size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
              <button
                className="flow-source-link"
                type="button"
                onClick={() => openRecord(selection)}
              >
                <PenLine size={14} />
                {selection.kind === "scene"
                  ? "編輯原文"
                  : selection.kind === "external"
                    ? "前往劇本"
                    : "查看引用"}
              </button>
            </>
          ) : (
            <p>選取場景或轉場，查看標籤、完整前提與來源。</p>
          )}
        </aside>
      )}
      {!!nodes.length && (
        <div className="flow-navigation" aria-label="畫布縮放">
          <ChromeButton
            title="找場景"
            aria-label="找場景"
            aria-expanded={showSearch}
            onClick={() => setShowSearch((value) => !value)}
          >
            <Search size={16} />
          </ChromeButton>
          <span />
          <ChromeButton
            type="button"
            aria-label="縮小"
            disabled={zoom <= 0.2}
            onClick={() => void flow.zoomOut({ duration: 150 })}
            title="縮小"
          >
            <Minus size={15} />
          </ChromeButton>
          <button
            type="button"
            className="flow-zoom-value"
            title="回到 100%"
            onClick={() => void flow.zoomTo(1, { duration: 150 })}
          >
            {Math.round(zoom * 100)}%
          </button>
          <ChromeButton
            type="button"
            aria-label="放大"
            disabled={zoom >= 2}
            onClick={() => void flow.zoomIn({ duration: 150 })}
            title="放大"
          >
            <Plus size={15} />
          </ChromeButton>
          <span />
          <ChromeButton
            type="button"
            title="適應全部"
            aria-label="適應全部"
            onClick={() => fitAll()}
          >
            <Maximize size={15} />
          </ChromeButton>
          <ChromeButton
            type="button"
            title="定位選取場景"
            aria-label="定位選取場景"
            disabled={!selection}
            onClick={() => {
              const node = nodes.find((node) => node.id === selectedId);
              if (node)
                void flow.setCenter(
                  node.position.x + CARD_WIDTH / 2,
                  node.position.y + cardHeights[node.id] / 2,
                  { zoom: Math.max(zoom, 1), duration: 200 },
                );
            }}
          >
            <LocateFixed size={15} />
          </ChromeButton>
          <span />
          <ChromeButton
            title={
              editing
                ? "結束節點編輯後可整理"
                : nodeSelection.size
                  ? selectionLabel
                  : "整理全部"
            }
            aria-label="自動整理"
            disabled={!!editing || !nodes.length || layout.busy}
            onClick={arrange}
          >
            <LayoutGrid size={16} />
          </ChromeButton>
          <ChromeButton
            title="復原布局"
            aria-label="復原布局"
            disabled={!!editing || !previousLayout}
            onClick={undoLayout}
          >
            <Undo2 size={16} />
          </ChromeButton>
          <ChromeButton
            title="重做布局"
            aria-label="重做布局"
            disabled={!!editing || !canRedo}
            onClick={redoLayout}
          >
            <Redo2 size={16} />
          </ChromeButton>
          <span />
          <ChromeButton
            title="圖表詳情"
            aria-label="圖表詳情"
            aria-expanded={showDetails}
            onClick={() => updateDetails(!showDetails)}
          >
            <PanelRight size={16} />
          </ChromeButton>
          <ChromeButton
            title="圖例與操作說明"
            aria-label="圖例與操作說明"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((value) => !value)}
          >
            <Info size={16} />
          </ChromeButton>
        </div>
      )}
      {layout.error && (
        <div className="flow-layout-error" role="status">
          <AlertTriangle size={14} />
          <span>{layout.error}</span>
          <button onClick={() => layout.request({ kind: "repair" })}>
            重試
          </button>
        </div>
      )}
      <ActionMenu
        onClose={() => setCanvasMenu(null)}
        menu={
          canvasMenu
            ? {
                ...canvasMenu,
                actions:
                  canvasMenu.pin && canvasMenu.edge
                    ? [
                        {
                          label: "刪除 pin",
                          run: () =>
                            deletePin(canvasMenu.edge!, canvasMenu.pin!),
                        },
                      ]
                    : canvasMenu.edge
                      ? [
                          { label: selectionLabel, run: arrange },
                          {
                            label: "簡化線路",
                            run: () => routeAction("simplify"),
                          },
                          {
                            label: "恢復自動線路",
                            run: () => routeAction("reset"),
                          },
                          {
                            label: "查看來源",
                            run: () => {
                              const g = groups.find(
                                (g) => g.id === canvasMenu.edge,
                              );
                              if (g) goToLink(g.items[0]);
                            },
                          },
                        ]
                      : [
                          { label: "建立場景", run: onCreate },
                          { label: "適應全部", run: () => fitAll() },
                          {
                            label: "回到 100%",
                            run: () => void flow.zoomTo(1),
                          },
                          {
                            label: nodeSelection.size
                              ? selectionLabel
                              : "整理全部",
                            run: arrange,
                          },
                          {
                            label: "復原布局",
                            disabled: !previousLayout,
                            run: undoLayout,
                          },
                          {
                            label: "重做布局",
                            disabled: !canRedo,
                            run: redoLayout,
                          },
                        ],
              }
            : null
        }
      />
    </div>
  );
}
