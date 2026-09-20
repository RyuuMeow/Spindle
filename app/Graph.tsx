"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  getViewportForBounds,
  type Node as FlowNode,
  type Edge,
  type NodeProps,
  type EdgeProps,
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
  CornerDownRight,
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
  layoutGraph,
  createConnectionRouter,
  type Point,
  type RoutedConnection,
} from "./graph-layout";
import "@xyflow/react/dist/style.css";
import "./graph.css";

type GraphLayout = { positions?: Record<string, Point>; viewport?: Viewport };
export type GraphState = GraphLayout & {
  undo?: GraphLayout[];
  redo?: GraphLayout[];
  detailsOpen?: boolean;
};
type RecordKind = "scene" | "external" | "missing" | "dynamic";
type SceneRecord = {
  id: string;
  node?: Node;
  name: string;
  kind: RecordKind;
  reference?: Link;
};
type ConnectionGroup = {
  id: string;
  source: string;
  target: string;
  items: Link[];
  label: boolean;
};
type CardData = SceneRecord & {
  editor?: ReactNode;
  warning: boolean;
  compact: boolean;
  zoom: number;
  open: () => void;
  menu?: (event: React.KeyboardEvent) => void;
};
type SceneFlowNode = FlowNode<CardData, "scene">;
type RouteData = {
  route: RoutedConnection;
  group: ConnectionGroup;
  active: boolean;
  muted: boolean;
  zoom: number;
  open: () => void;
};
type RouteEdge = Edge<RouteData, "route">;
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
  const overviewStyle = {
    "--overview-title-size": `${Math.max(14, 11 / Math.max(data.zoom, 0.35))}px`,
  } as CSSProperties;
  return (
    <div
      className={`flow-card flow-card--${data.kind}${selected ? " is-selected" : ""}${data.editor ? " is-editing" : data.compact ? " is-overview" : ""}${!data.editor && data.zoom < 0.35 ? " is-distant" : ""}`}
      style={overviewStyle}
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

function SemanticText({ text }: { text: string }) {
  return (
    <>
      {text.split(/("(?:\\.|[^"\\])*"|\$[A-Za-z_]\w*)/g).map((part, index) =>
        /^\$[A-Za-z_]\w*$/.test(part) ? (
          <span className="flow-variable" key={index}>
            {part.slice(1)}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function linkSummary(link: Link) {
  if (link.unresolved) return "條件尚未解析完整";
  const context = link.context || [];
  const option = context.findLast((item) => item.kind === "option");
  const branch = context.at(-1);
  const base =
    option?.text ||
    (branch
      ? branch.kind === "else"
        ? "否則"
        : branch.kind === "elseif"
          ? `否則若 ${branch.text}`
          : contextLabel(branch)
      : link.label ||
        (link.dynamic
          ? "動態目標"
          : link.kind === "detour"
            ? "呼叫後返回"
            : "直接轉場"));
  return context.length > 1 ? `${base} · ${context.length} 項前提` : base;
}

function StoryConnection({ id, data, markerEnd }: EdgeProps<RouteEdge>) {
  if (!data) return null;
  const { route, group, active, muted, zoom } = data;
  const multiple = group.items.length > 1,
    item = group.items[0];
  const label = multiple ? `${group.items.length} 個分支` : linkSummary(item);
  const showLabel = route.labelVisible && zoom >= 0.65;
  const Icon = group.items.some((link) => link.unresolved)
    ? AlertTriangle
    : item.kind === "detour"
      ? CornerUpLeft
      : item.context?.some((part) => part.kind === "option")
        ? CornerDownRight
        : item.context?.length
          ? GitBranch
          : ArrowRight;
  return (
    <>
      <g
        tabIndex={0}
        role="button"
        className="flow-edge-focus"
        aria-label={`${group.items[0].kind === "detour" ? "呼叫後返回" : "轉場"}，${label}。按 Enter 選取連線；詳情由圖表詳情按鈕開啟`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            data.open();
          }
        }}
      >
        <BaseEdge
          id={id}
          path={route.path}
          markerEnd={markerEnd}
          interactionWidth={22}
          style={{
            stroke: active ? "#d4dfeb" : muted ? "#555555" : "#999999",
            strokeWidth: active ? 2.4 : 1.6,
            strokeDasharray: item.dynamic
              ? "6 5"
              : item.kind === "detour"
                ? "3 4"
                : undefined,
          }}
        />
      </g>
      {showLabel && route.labelAnchor && (
        <line
          x1={route.labelAnchor.x}
          y1={route.labelAnchor.y}
          x2={Math.max(
            route.labelRect.x,
            Math.min(
              route.labelRect.x + route.labelRect.width,
              route.labelAnchor.x,
            ),
          )}
          y2={Math.max(
            route.labelRect.y,
            Math.min(
              route.labelRect.y + route.labelRect.height,
              route.labelAnchor.y,
            ),
          )}
          stroke={active ? "#d4dfeb" : "#777"}
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`flow-edge-label nodrag nopan${active ? " is-active" : ""}${muted ? " is-muted" : ""}`}
            style={{
              width: route.labelRect.width,
              transform: `translate(-50%, -50%) translate(${route.labelPoint.x}px, ${route.labelPoint.y}px)`,
            }}
            title={group.items
              .map(
                (link) =>
                  `${link.kind}: ${link.label || "無條件"} · 第 ${link.line} 行`,
              )
              .join("\n")}
            onClick={(event) => {
              event.stopPropagation();
              data.open();
            }}
          >
            <Icon size={14} />
            <span className="flow-edge-text">
              <SemanticText text={label} />
            </span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { scene: SceneCard };
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
  const flow = useReactFlow<SceneFlowNode, RouteEdge>();
  const [editing, setEditing] = useState<EditSession | null>(null);
  const canvasElement = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, Point>>(
    () => graphState?.positions || {},
  );
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
  const [previousLayout, setPreviousLayout] = useState<GraphLayout | null>(
    graphState?.undo?.at(-1) || null,
  );
  const [canRedo, setCanRedo] = useState(!!graphState?.redo?.length);
  const undoStack = useRef<GraphLayout[]>(graphState?.undo || []),
    redoStack = useRef<GraphLayout[]>(graphState?.redo || []),
    dragOrigin = useRef<GraphState | null>(null);
  const [search, setSearch] = useState(""),
    [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(
      null,
    );
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
  const currentGraph = useMemo(() => {
    const records: SceneRecord[] = own.map((node) => ({
      id: node.id,
      node,
      name: node.name,
      kind: "scene",
    }));
    const groups: ConnectionGroup[] = [];
    for (const link of out) {
      const node = link.dynamic
        ? undefined
        : allNodes.find((node) => node.name === link.target);
      const id = link.dynamic
        ? `dynamic:${link.source}:${link.target}`
        : node?.id || `missing:${link.target}`;
      if (!records.some((record) => record.id === id))
        records.push({
          id,
          node,
          name: link.target,
          kind: link.dynamic ? "dynamic" : node ? "external" : "missing",
          reference: link,
        });
      const groupId = JSON.stringify([link.source, id, link.kind]);
      const group = groups.find((group) => group.id === groupId);
      if (group) {
        group.items.push(link);
        group.label = true;
      } else
        groups.push({
          id: groupId,
          source: link.source,
          target: id,
          items: [link],
          label:
            !!link.label ||
            !!link.unresolved ||
            link.kind === "detour" ||
            link.source === id,
        });
    }
    return { records, groups };
  }, [own, out, allNodes]);
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
  const automatic = useMemo(
    () =>
      layoutGraph(
        records.map((record) => record.id),
        groups,
        cardHeights,
      ),
    [records, groups, cardHeights],
  );
  const selectedId = selected || targetSelection;
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
      onGraphState({
        positions: nextPositions,
        viewport: flow.getViewport(),
        undo: undoStack.current.slice(-50),
        redo: redoStack.current.slice(-50),
        detailsOpen: showDetails,
      });
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
      onGraphState,
      flow,
      showDetails,
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
        selected: record.id === selectedId,
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
      selectedId,
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
  const routeConnections = useMemo(() => createConnectionRouter(), []);
  const routes = useMemo(
    () =>
      routeConnections(
        geometry,
        groups.map((group) => {
          const label =
            group.items.length > 1
              ? group.items.length + " 個分支"
              : linkSummary(group.items[0]);
          const textWidth = [...label].reduce(
            (sum, c) => sum + (c.charCodeAt(0) > 255 ? 12 : 7),
            0,
          );
          return {
            ...group,
            labelWidth: Math.max(96, Math.min(200, textWidth + 34)),
          };
        }),
      ),
    [geometry, groups, routeConnections],
  );
  const edges: RouteEdge[] = routes.map((route) => {
    const group = groups.find((group) => group.id === route.id)!;
    const active = edgeSelection
      ? edgeSelection === group.id
      : !!selectedId &&
        (group.source === selectedId || group.target === selectedId);
    return {
      id: group.id,
      source: group.source,
      target: group.target,
      type: "route",
      sourceHandle: `out-${route.sourceSide}`,
      targetHandle: `in-${route.targetSide}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: active ? "#d4dfeb" : "#999999",
        width: 16,
        height: 16,
      },
      data: {
        route,
        group,
        active,
        muted: (!!selectedId || !!edgeSelection) && !active,
        zoom,
        open: () => {
          onSelect(null);
          setTargetSelection("");
          setEdgeSelection(group.id);
        },
      },
    };
  });
  const save = useCallback(
    (nextPositions?: Record<string, Point>, viewport?: Viewport) => {
      onGraphState({
        positions:
          nextPositions ||
          Object.fromEntries(nodes.map((node) => [node.id, node.position])),
        viewport: viewport || flow.getViewport(),
        undo: undoStack.current.slice(-50),
        redo: redoStack.current.slice(-50),
        detailsOpen: showDetails,
      });
    },
    [onGraphState, nodes, flow, showDetails],
  );
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
    if (needsFit.current) {
      needsFit.current = false;
      fitAll();
    }
  }, [fitAll]);
  useEffect(() => {
    if (focus === previousFocus.current) return;
    previousFocus.current = focus;
    const node = nodes.find((node) => node.id === selected);
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
    undoStack.current.push({
      positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
      viewport: flow.getViewport(),
    });
    redoStack.current = [];
    setCanRedo(false);
    setPreviousLayout({
      positions: Object.fromEntries(
        nodes.map((node) => [node.id, node.position]),
      ),
      viewport: flow.getViewport(),
    });
    needsFit.current = true;
    setPositions({ ...automatic });
    save(automatic);
  }
  function undoLayout() {
    if (editing) return;
    const previous = undoStack.current.pop();
    if (!previous?.positions) return;
    redoStack.current.push({
      positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
      viewport: flow.getViewport(),
    });
    setCanRedo(true);
    setPositions(previous.positions);
    if (previous.viewport) void flow.setViewport(previous.viewport);
    save(previous.positions, previous.viewport);
    setPreviousLayout(undoStack.current.at(-1) || null);
  }
  function redoLayout() {
    if (editing) return;
    const next = redoStack.current.pop();
    setCanRedo(redoStack.current.length > 0);
    if (!next?.positions) return;
    undoStack.current.push({
      positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
      viewport: flow.getViewport(),
    });
    setPositions(next.positions);
    if (next.viewport) void flow.setViewport(next.viewport);
    save(next.positions, next.viewport);
    setPreviousLayout(undoStack.current.at(-1) || null);
  }
  return (
    <div
      className="story-canvas"
      ref={canvasElement}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          )
        )
          return;
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
            拖曳卡片只調整版面；雙擊或 Enter
            編輯原文。空白處拖曳平移，滾輪縮放。
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
        <ReactFlow<SceneFlowNode, RouteEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          onNodesChange={(changes) => {
            const moved: Record<string, Point> = {};
            const measured: Record<string, number> = {};
            for (const change of changes) {
              if (change.type === "position" && change.position)
                moved[change.id] = change.position;
              if (
                change.type === "dimensions" &&
                change.dimensions &&
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
            if (Object.keys(moved).length)
              setPositions((previous) => ({ ...previous, ...moved }));
          }}
          onNodeClick={(_, node) => {
            setEdgeSelection("");
            if (node.data.node) {
              setTargetSelection("");
              onSelect(node.data.node);
            } else {
              onSelect(null);
              setTargetSelection(node.id);
            }
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            if (node.data.node) onNodeMenu?.(node.data.node, event);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setCanvasMenu({ x: event.clientX, y: event.clientY });
          }}
          onNodeDragStart={() => {
            dragOrigin.current = {
              positions: Object.fromEntries(
                nodes.map((n) => [n.id, n.position]),
              ),
              viewport: flow.getViewport(),
            };
          }}
          onPaneClick={() => {
            if (editing) {
              setCloseRequest((request) => request + 1);
              return;
            }
            onSelect(null);
            setTargetSelection("");
            setEdgeSelection("");
            setCanvasMenu(null);
          }}
          onEdgeClick={(_, edge) => {
            onSelect(null);
            setTargetSelection("");
            setEdgeSelection(edge.id);
          }}
          onNodeDragStop={(_, moved) => {
            if (dragOrigin.current) {
              undoStack.current.push(dragOrigin.current);
              redoStack.current = [];
              setCanRedo(false);
              setPreviousLayout(dragOrigin.current);
              dragOrigin.current = null;
            }
            const next = {
              ...Object.fromEntries(
                nodes.map((node) => [node.id, node.position]),
              ),
              [moved.id]: moved.position,
            };
            setPositions(next);
            save(next);
          }}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          onMoveEnd={(_, viewport) => save(undefined, viewport)}
          defaultViewport={graphState?.viewport}
        >
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
            title={editing ? "結束節點編輯後可整理" : "自動整理"}
            aria-label="自動整理"
            disabled={!!editing || !nodes.length}
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
      <ActionMenu
        onClose={() => setCanvasMenu(null)}
        menu={
          canvasMenu
            ? {
                ...canvasMenu,
                actions: [
                  { label: "建立場景", run: onCreate },
                  { label: "適應全部", run: () => fitAll() },
                  { label: "回到 100%", run: () => void flow.zoomTo(1) },
                  { label: "自動整理", run: arrange },
                  {
                    label: "復原布局",
                    disabled: !previousLayout,
                    run: undoLayout,
                  },
                  { label: "重做布局", disabled: !canRedo, run: redoLayout },
                ],
              }
            : null
        }
      />
    </div>
  );
}
