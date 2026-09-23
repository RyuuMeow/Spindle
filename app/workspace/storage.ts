import { t as tr } from "../i18n/index.ts";
import { validSnapshot } from "../graph/layout-state";
import type { Command, Doc } from "../parser";
import { validateCommands, restoreProjects } from "./engine";
import {
  defaultSession,
  type Project,
  type WindowSession,
  type TabView,
  type FileSortMode,
  type NavigationLocation,
} from "./types";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
function validGraphLayout(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    (value.layout === undefined || validSnapshot(value.layout)) &&
    (value.positions === undefined ||
      (record(value.positions) &&
        Object.values(value.positions).every(
          (p) => record(p) && finite(p.x) && finite(p.y),
        ))) &&
    (value.viewport === undefined ||
      (record(value.viewport) &&
        finite(value.viewport.x) &&
        finite(value.viewport.y) &&
        finite(value.viewport.zoom) &&
        value.viewport.zoom > 0))
  );
}
function validateTabState(tab: TabView) {
  if (
    tab.folded &&
    (!Array.isArray(tab.folded) ||
      !tab.folded.every(
        (range) =>
          record(range) &&
          finite(range.from) &&
          finite(range.to) &&
          range.from >= 0 &&
          range.to > range.from,
      ))
  )
    throw Error(tr("mfe9cdd0aa670"));
  if (
    tab.selection &&
    (!finite(tab.selection.anchor) ||
      !finite(tab.selection.head) ||
      tab.selection.anchor < 0 ||
      tab.selection.head < 0)
  )
    throw Error(tr("m53031b2ec600"));
  if (
    tab.graph &&
    (!validGraphLayout(tab.graph) ||
      [tab.graph.undo, tab.graph.redo].some(
        (history) =>
          history !== undefined &&
          (!Array.isArray(history) || !history.every(validGraphLayout)),
      ))
  )
    throw Error(tr("m61c7cdfdc5fd"));
  if (tab.sourceView) {
    const view = tab.sourceView;
    if (
      !Array.isArray(view.cursorState) ||
      !record(view.viewState) ||
      !record(view.contributionsState) ||
      !finite(view.viewState.scrollLeft) ||
      !finite(view.viewState.firstPositionDeltaTop) ||
      !view.viewState.firstPosition ||
      !finite(view.viewState.firstPosition.lineNumber) ||
      !finite(view.viewState.firstPosition.column) ||
      !view.cursorState.every(
        (cursor) =>
          cursor &&
          [cursor.position, cursor.selectionStart].every(
            (point) =>
              point &&
              finite(point.lineNumber) &&
              finite(point.column) &&
              point.lineNumber >= 1 &&
              point.column >= 1,
          ),
      )
    )
      throw Error(tr("md1db89b3c28a"));
  }
  if (tab.views) {
    if (!record(tab.views)) throw Error(tr("mcb41a9dcac43"));
    for (const view of Object.values(tab.views)) {
      if (
        !record(view) ||
        !["source", "rendered", "graph"].includes(String(view.mode)) ||
        !finite(view.line) ||
        !finite(view.column)
      )
        throw Error(tr("mcb41a9dcac43"));
      validateTabState({
        mode: view.mode,
        line: view.line,
        column: view.column,
        scrollTop: view.scrollTop,
        selection: view.selection,
        folded: view.folded,
        sourceView: view.sourceView,
        graph: view.graph,
      } as TabView);
    }
  }
  for (const stack of [tab.past, tab.future]) {
    if (
      stack !== undefined &&
      (!Array.isArray(stack) ||
        stack.some(
          (location) =>
            !record(location) ||
            typeof location.documentId !== "string" ||
            !["source", "rendered", "graph"].includes(String(location.mode)) ||
            !finite(location.line) ||
            !finite(location.column),
        ))
    )
      throw Error(tr("m8e96b335dc59"));
  }
  return {
    ...tab,
    past: tab.past?.slice(-100) as NavigationLocation[] | undefined,
    future: tab.future?.slice(-100) as NavigationLocation[] | undefined,
  };
}
export function restoreSession(
  value: unknown,
  id: string,
  projectId: string,
): WindowSession | null {
  if (value === null) return null;
  const v = value as Partial<WindowSession>;
  if (
    !v ||
    typeof v.projectId !== "string" ||
    !Array.isArray(v.tabs) ||
    !Array.isArray(v.closedTabs)
  )
    throw Error(tr("m8d99484844d0"));
  const tabs = (items: TabView[]) =>
    items
      .filter(
        (t) =>
          t &&
          typeof t.id === "string" &&
          typeof t.documentId === "string" &&
          t.documentId !== "@new-document" &&
          ["source", "rendered", "graph"].includes(t.mode),
      )
      .map((t) => ({
        ...validateTabState(t),
        line: finite(t.line) ? Math.max(1, Math.floor(t.line)) : 1,
        column: finite(t.column) ? Math.max(1, Math.floor(t.column)) : 1,
        scrollTop: finite(t.scrollTop) ? Math.max(0, t.scrollTop) : 0,
      }));
  return {
    ...defaultSession(id, projectId),
    ...v,
    screen: v.screen === "home" ? "home" : "editor",
    recovery:
      v.recovery && record(v.recovery)
        ? {
            scope: v.recovery.scope === "commands" ? "commands" : "deleted",
            query: typeof v.recovery.query === "string" ? v.recovery.query : "",
            selectedId:
              typeof v.recovery.selectedId === "string"
                ? v.recovery.selectedId
                : undefined,
            compare: v.recovery.compare === "diff" ? "diff" : "preview",
            scrollTop: Math.max(0, Number(v.recovery.scrollTop) || 0),
            previewScrollTop: Math.max(
              0,
              Number(v.recovery.previewScrollTop) || 0,
            ),
            baseline:
              record(v.recovery.baseline) &&
              typeof v.recovery.baseline.text === "string"
                ? {
                    text: v.recovery.baseline.text,
                    version: finite(v.recovery.baseline.version)
                      ? v.recovery.baseline.version
                      : undefined,
                  }
                : undefined,
          }
        : undefined,
    id,
    projectId: v.projectId,
    tabs: tabs(v.tabs),
    closedTabs: tabs(v.closedTabs),
    sidebarWidth: Math.max(180, Math.min(420, Number(v.sidebarWidth) || 240)),
    rightPanelWidth: Math.max(
      220,
      Math.min(420, Number(v.rightPanelWidth) || 260),
    ),
    problemsHeight: Math.max(
      90,
      Math.min(420, Number(v.problemsHeight) || 140),
    ),
    fileSortByProject: record(v.fileSortByProject)
      ? (Object.fromEntries(
          Object.entries(v.fileSortByProject).filter(([, mode]) =>
            ["manual", "name-asc", "name-desc"].includes(String(mode)),
          ),
        ) as Record<string, FileSortMode>)
      : {},
    readingSize: Math.max(12, Math.min(28, Number(v.readingSize) || 16)),
    readingWidth: v.readingWidth === "wide" ? "wide" : "standard",
    outline: Object.fromEntries(
      (["source", "rendered", "graph"] as const).map((mode) => [
        mode,
        record(v.outline) && v.outline[mode] === true,
      ]),
    ),
    readingLineHeight: Math.max(
      22,
      Math.min(48, Number(v.readingLineHeight) || 29),
    ),
    zoom: Math.max(0.6, Math.min(2, Number(v.zoom) || 1)),
  };
}
export const storageKeys = {
  documents: "yarn-workbench.documents.v1",
  project: "yarn-workbench.project.v1",
  layout: "yarn-workbench.layout.v1",
  workspace: "yarn-workbench.workspace.v2",
};
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readProtected<T>(
  storage: StorageLike,
  key: string,
  validate: (value: unknown) => T,
): { value: T | null; error: string | null; exists: boolean } {
  const raw = storage.getItem(key);
  if (raw === null) return { value: null, error: null, exists: false };
  try {
    return { value: validate(JSON.parse(raw)), error: null, exists: true };
  } catch {
    let copied = false;
    try {
      storage.setItem(key + ".recovery." + Date.now(), raw);
      copied = true;
    } catch {
      /* Original key remains untouched. */
    }
    return {
      value: null,
      error: tr("m1e40e0769d38", [
        key,
        copied ? tr("me2ea375ac58a") : tr("m430246f89eff"),
      ]),
      exists: true,
    };
  }
}
export function readLegacy(storage: StorageLike) {
  const docs = readProtected(storage, storageKeys.documents, (value) => {
    if (
      !Array.isArray(value) ||
      !value.every(
        (d) =>
          d &&
          typeof d.name === "string" &&
          typeof d.text === "string" &&
          typeof d.saved === "string",
      )
    )
      throw Error();
    return value as Doc[];
  });
  const config = readProtected(storage, storageKeys.project, (value) => {
    const c = value as { name: string; commands: Command[] };
    if (!c || typeof c.name !== "string") throw Error();
    validateCommands(c.commands);
    return c;
  });
  const layout = readProtected(storage, storageKeys.layout, (value) => {
    if (!value || typeof value !== "object") throw Error();
    return value as Record<string, unknown>;
  });
  return {
    documents: docs.value,
    config: config.value,
    layout: layout.value,
    exists: docs.exists || config.exists,
    blocked: !!docs.error || !!config.error,
    errors: [docs.error, config.error, layout.error].filter(
      (x): x is string => !!x,
    ),
  };
}
export function readWorkspace(storage: StorageLike) {
  const warnings: string[] = [];
  const result = readProtected(storage, storageKeys.workspace, (value) => {
    const restored = restoreProjects(value);
    warnings.push(...restored.warnings);
    if (warnings.length) {
      storage.setItem(
        storageKeys.workspace + ".recovery." + Date.now(),
        storage.getItem(storageKeys.workspace)!,
      );
    }
    return restored.projects as Project[];
  });
  return { ...result, error: result.error || warnings.join(" ") || null };
}
