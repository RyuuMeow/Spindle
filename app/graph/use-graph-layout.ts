import { moveObjects } from "./manual-routing";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Node, Link } from "../parser";
import type { DocumentRecord } from "../workspace/types";
import type { Point } from "../graph-layout";
import { buildGraphModel, stamp, type SourceAnchor } from "./model";
import {
  cloneLayout,
  migrateLayout,
  type GraphLayout,
  type GraphState,
  type GraphLayoutSnapshot,
  type GraphLayoutRequest,
  type GraphLayoutResult,
} from "./layout-state";

export function useGraphModel(
  file: string,
  nodes: Node[],
  links: Link[],
  documents: DocumentRecord[] | undefined,
  anchors: SourceAnchor[] | undefined,
) {
  const [cache, setCache] = useState(() => ({
    file,
    nodes,
    links,
    documents,
    model: buildGraphModel({ file, nodes, links, documents, anchors }),
    texts: Object.fromEntries((documents || []).map((d) => [d.id, d.text])),
  }));
  if (
    file !== cache.file ||
    nodes !== cache.nodes ||
    links !== cache.links ||
    documents !== cache.documents
  ) {
    const mapped = cache.model.anchors.map(
      (a) =>
        anchors?.find(
          (n) =>
            n.id === a.id &&
            n.stamp ===
              stamp(documents?.find((d) => d.id === a.documentId)?.text || ""),
        ) || a,
    );
    const model = buildGraphModel({
      file,
      nodes,
      links,
      documents,
      anchors: mapped,
      previousTexts: cache.texts,
    });
    setCache({
      file,
      nodes,
      links,
      documents,
      model,
      texts: Object.fromEntries((documents || []).map((d) => [d.id, d.text])),
    });
    return model;
  }
  return cache.model;
}
type Settings = {
  model: ReturnType<typeof buildGraphModel>;
  state: GraphState | undefined;
  sizes: GraphLayoutRequest["sizes"];
  labels: GraphLayoutRequest["labels"];
  suspended: boolean;
  ready: boolean;
  onChange: (s: GraphState) => void;
  viewport: () => { x: number; y: number; zoom: number };
  restoreViewport: (v: { x: number; y: number; zoom: number }) => void;
  onArrangeAll: () => void;
};
export function useGraphLayout(settings: Settings) {
  const latest = useRef(settings);
  useLayoutEffect(() => {
    latest.current = settings;
  }, [settings]);
  const [layout, setLayout] = useState(() =>
    migrateLayout(settings.state, settings.model),
  );
  const current = useRef(layout);
  const undo = useRef<GraphLayout[]>(settings.state?.undo || []),
    redo = useRef<GraphLayout[]>(settings.state?.redo || []);
  const gesture = useRef<GraphLayout | null>(null);
  const cancelledGesture = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyCounts, setHistoryCounts] = useState({
    undo: settings.state?.undo?.length || 0,
    redo: settings.state?.redo?.length || 0,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null),
    serial = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRequestTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);
  const pending = useRef<{
    id: number;
    modelVersion: string;
    revision: number;
    before?: GraphLayout;
    fit: boolean;
  } | null>(null);
  const persist = useCallback((next = current.current) => {
    const s = latest.current;
    s.onChange({
      ...s.state,
      layout: next,
      positions: next.positions,
      anchors: s.model.anchors,
      viewport: s.viewport(),
      undo: undo.current.slice(-50),
      redo: redo.current.slice(-50),
    });
  }, []);
  const apply = useCallback((next: GraphLayoutSnapshot) => {
    current.current = next;
    setLayout(next);
  }, []);
  const snapshot = useCallback(
    (): GraphLayout => ({
      layout: cloneLayout(current.current),
      positions: structuredClone(current.current.positions),
      viewport: latest.current.viewport(),
    }),
    [],
  );
  const push = useCallback((before: GraphLayout) => {
    undo.current = [...undo.current, before].slice(-50);
    redo.current = [];
    setHistoryRevision((n) => n + 1);
    setHistoryCounts({ undo: undo.current.length, redo: 0 });
  }, []);
  const createWorker = useCallback(() => {
    const instance = new Worker(
      new URL("./layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<GraphLayoutResult & { error?: string }>,
    ) => {
      const result = event.data,
        request = pending.current;
      if (!request || request.id !== result.id) return;
      clearRequestTimer();
      pending.current = null;
      setBusy(false);
      if (
        result.modelVersion !== latest.current.model.version ||
        request.revision !== current.current.revision
      )
        return;
      if (result.error) {
        setError("圖表整理未完成，已保留原布局。" + result.error);
        return;
      }
      if (request.before) push(request.before);
      apply(result.snapshot);
      persist(result.snapshot);
      setError(
        result.errors.length
          ? "部分固定路線有衝突；選取標示的線路以調整或重試。"
          : "",
      );
      if (request.fit)
        requestAnimationFrame(() => latest.current.onArrangeAll());
    };
    instance.onerror = (event) => {
      clearRequestTimer();
      instance.terminate();
      worker.current = null;
      pending.current = null;
      setBusy(false);
      setError("圖表引擎無法執行，已保留原布局。" + event.message);
    };
    return instance;
  }, [apply, persist, push, clearRequestTimer]);
  useEffect(() => {
    createWorker();
    return () => {
      clearRequestTimer();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [createWorker, clearRequestTimer]);
  const request = useCallback(
    (scope: GraphLayoutRequest["scope"], history = false) => {
      const s = latest.current;
      if (s.suspended || !s.ready || gesture.current) return;
      const instance = worker.current || createWorker();
      const id = ++serial.current,
        revision = current.current.revision;
      pending.current = {
        id,
        revision,
        modelVersion: s.model.version,
        before: history ? snapshot() : undefined,
        fit: scope.kind === "all",
      };
      setBusy(history);
      clearRequestTimer();
      timeoutRef.current = setTimeout(() => {
        if (pending.current?.id !== id) return;
        instance.terminate();
        worker.current = null;
        pending.current = null;
        setBusy(false);
        setError("圖表整理逾時，已保留原布局。可按重試重新啟動引擎。");
      }, 30000);
      instance.postMessage({
        id,
        modelVersion: s.model.version,
        layoutVersion: revision,
        scope,
        model: s.model,
        snapshot: current.current,
        sizes: s.sizes,
        labels: s.labels,
      } satisfies GraphLayoutRequest);
    },
    [snapshot, createWorker, clearRequestTimer],
  );
  const geometryKey = JSON.stringify([
    layout.positions,
    settings.sizes,
    settings.labels,
  ]);
  useEffect(() => {
    if (!settings.ready || settings.suspended) return;
    const timer = setTimeout(
      () => request({ kind: current.current.initialized ? "repair" : "all" }),
      50,
    );
    return () => clearTimeout(timer);
  }, [
    geometryKey,
    settings.model.version,
    settings.ready,
    settings.suspended,
    request,
  ]);
  const begin = useCallback(() => {
    if (gesture.current) return;
    clearRequestTimer();
    pending.current = null;
    setBusy(false);
    cancelledGesture.current = false;
    gesture.current = snapshot();
  }, [snapshot, clearRequestTimer]);
  const preview = useCallback(
    (next: GraphLayoutSnapshot) => {
      apply(next);
    },
    [apply],
  );
  const cancel = useCallback(() => {
    if (!gesture.current) return false;
    const previous = gesture.current;
    gesture.current = null;
    cancelledGesture.current = true;
    if (previous.layout)
      apply({ ...previous.layout, revision: current.current.revision + 1 });
    persist();
    return true;
  }, [apply, persist]);
  const commit = useCallback(
    (repair = true) => {
      if (!gesture.current) return;
      const before = gesture.current;
      gesture.current = null;
      if (JSON.stringify(before.layout) !== JSON.stringify(current.current)) {
        push(before);
        persist();
      }
      if (repair) request({ kind: "repair" });
    },
    [persist, push, request],
  );
  const translate = useCallback(
    (positions: Record<string, Point>) => {
      if (cancelledGesture.current) return;
      apply(moveObjects(current.current, positions, latest.current.sizes));
    },
    [apply],
  );
  const transaction = useCallback(
    (change: (layout: GraphLayoutSnapshot) => GraphLayoutSnapshot) => {
      begin();
      apply(change(cloneLayout(current.current)));
      commit();
    },
    [begin, apply, commit],
  );
  const history = useCallback(
    (forward = false) => {
      if (latest.current.suspended) return;
      clearRequestTimer();
      pending.current = null;
      setBusy(false);
      const from = forward ? redo : undo,
        to = forward ? undo : redo;
      const previous = from.current.pop();
      if (!previous) return;
      to.current = [...to.current, snapshot()].slice(-50);
      const next = previous.layout
        ? cloneLayout(previous.layout)
        : migrateLayout(
            { ...latest.current.state, ...previous, layout: undefined },
            latest.current.model,
          );
      next.revision = current.current.revision + 1;
      apply(next);
      if (previous.viewport) latest.current.restoreViewport(previous.viewport);
      setHistoryRevision((n) => n + 1);
      setHistoryCounts({
        undo: undo.current.length,
        redo: redo.current.length,
      });
      setError("");
      persist(next);
    },
    [apply, persist, snapshot, clearRequestTimer],
  );
  return {
    layout,
    current,
    historyRevision,
    busy,
    error,
    begin,
    preview,
    cancel,
    commit,
    translate,
    transaction,
    request,
    history,
    persist,
    canUndo: historyCounts.undo > 0,
    canRedo: historyCounts.redo > 0,
  };
}
