import type { Command, Doc } from "../parser";

export type SaveState =
  "saved" | "pending" | "saving" | "draft" | "conflict" | "missing" | "error";
export type TextEdit = { from: number; to: number; insert: string };
export type WireUpdate = { clientID: string; changes: unknown };
export type DocumentRecord = Doc & {
  id: string;
  version: number;
  path?: string;
  diskHash?: string;
  status: SaveState;
  error?: string;
  externalText?: string;
  composing?: boolean;
};
export type RecoveryEntry = {
  id: string;
  documentId: string;
  name: string;
  text: string;
  at: number;
  reason: string;
  deleted?: boolean;
  kind?: "file" | "folder";
  files?: { id: string; name: string; text: string }[];
};
export type ProjectCatalogEntry = {
  id: string;
  name: string;
  root: string;
  lastOpenedAt: number;
  recent: boolean;
  unavailable?: string;
};
export type AppPreferences = {
  editorAppearance?: import("../appearance/model").EditorAppearance;
  reopenLastProject: boolean;
  lastProjectId?: string;
};
export type RecoveryViewState = {
  scope: "deleted" | "commands";
  query: string;
  selectedId?: string;
  compare: "preview" | "diff";
  scrollTop: number;
  previewScrollTop?: number;
  baseline?: { text: string; version?: number };
};
export type Project = {
  persistenceError?: string;
  kind?: "project" | "standalone" | "legacy";
  id: string;
  name: string;
  root?: string;
  documents: DocumentRecord[];
  commands: Command[];
  excluded: string[];
  folders?: string[];
  treeOrder?: string[];
  recovery: RecoveryEntry[];
};
export type EditorMode = "source" | "rendered" | "graph";
export type TabView = {
  id: string;
  documentId: string;
  mode: EditorMode;
  dialogueOnly?: boolean;
  pinned?: boolean;
  line: number;
  column: number;
  scrollTop?: number;
  selection?: { anchor: number; head: number };
  folded?: { from: number; to: number }[];
  sourceView?: import("monaco-editor").editor.ICodeEditorViewState;
  graph?: import("../Graph").GraphState;
  views?: Record<string, DocumentViewState>;
  past?: NavigationLocation[];
  future?: NavigationLocation[];
};
export type DocumentViewState = Pick<
  TabView,
  | "mode"
  | "line"
  | "column"
  | "scrollTop"
  | "selection"
  | "folded"
  | "sourceView"
  | "graph"
>;
export type NavigationLocation = DocumentViewState & { documentId: string };
export type FileSortMode = "manual" | "name-asc" | "name-desc";
export type WindowSession = {
  screen?: "home" | "editor";
  recovery?: RecoveryViewState;
  id: string;
  projectId: string;
  tabs: TabView[];
  activeId: string;
  closedTabs: TabView[];
  left: boolean;
  lineNumbers: boolean;
  sidebarWidth: number;
  rightPanelWidth?: number;
  problemsHeight?: number;
  fileSortByProject?: Record<string, FileSortMode>;
  readingSize: number;
  readingLineHeight: number;
  readingWidth?: "standard" | "wide";
  outline?: Partial<Record<EditorMode, boolean>>;
  zoom: number;
};
export type WorkspaceSnapshot = {
  catalog?: ProjectCatalogEntry[];
  preferences?: AppPreferences;
  projects: Project[];
  currentProjectId: string;
  notices: string[];
};
export type WorkspaceAction =
  | {
      type: "bootstrap";
      legacy?: { name: string; documents: Doc[]; commands: Command[] };
    }
  | { type: "snapshot" }
  | { type: "updates"; projectId: string; documentId: string; version: number }
  | {
      type: "edit";
      projectId: string;
      documentId: string;
      version: number;
      updates: WireUpdate[];
    }
  | { type: "undo" | "redo"; projectId: string; documentId: string }
  | { type: "createProject"; name: string; root?: string }
  | { type: "renameProject"; projectId: string; name: string }
  | {
      type: "createDocument";
      projectId: string;
      name: string;
      text: string;
      firstInOrder?: string[];
    }
  | {
      type: "createScene";
      projectId: string;
      documentId: string;
      version: number;
      name: string;
    }
  | {
      type: "renameScene";
      projectId: string;
      documentId: string;
      version: number;
      fromName: string;
      name: string;
    }
  | {
      type: "renameDocument";
      projectId: string;
      documentId: string;
      name: string;
    }
  | {
      type: "removeDocument";
      projectId: string;
      documentId: string;
      deleteDisk: boolean;
    }
  | { type: "registerCommand"; projectId: string; command: Command }
  | { type: "commands"; projectId: string; commands: Command[]; expectedCommands?: string }
  | {
      type: "transaction";
      projectId: string;
      label: string;
      documents: { id: string; version: number; edits: TextEdit[] }[];
    }
  | {
      type: "composition";
      projectId: string;
      documentId: string;
      active: boolean;
    }
  | { type: "save"; projectId: string; documentId?: string }
  | { type: "saveAs"; projectId: string; documentId: string }
  | { type: "openFolder"; root?: string }
  | { type: "chooseProjectParent" }
  | {
      type: "catalog";
      operation: "remove" | "removeRecent" | "rename" | "reveal";
      id: string;
      name?: string;
    }
  | { type: "appearance"; patch: import("../appearance/model").AppearancePatch }
  | { type: "preferences"; reopenLastProject: boolean }
  | { type: "closeProject"; projectId: string }
  | { type: "purgeTrash"; projectId: string; recoveryId?: string }
  | { type: "migrateDraft"; projectId: string; name: string; root: string }
  | { type: "openFiles"; paths?: string[] }
  | {
      type: "resolve";
      projectId: string;
      documentId: string;
      choice: "disk" | "local";
    }
  | {
      type: "recover";
      projectId: string;
      recoveryId: string;
      expectedVersion?: number;
      expectedText?: string;
    }
  | { type: "reveal"; projectId: string; documentId?: string }
  | { type: "export"; projectId: string; documentId?: string }
  | { type: "import"; project: Project }
  | { type: "createFolder"; projectId: string; name: string }
  | {
      type: "moveEntry";
      projectId: string;
      entry: string;
      parent: string;
      name?: string;
      before?: string;
    }
  | { type: "trashFolder"; projectId: string; name: string }
  | { type: "sortDocuments"; projectId: string; documentIds: string[] };
export type ActionResult = {
  path?: string;
  snapshot: WorkspaceSnapshot;
  updates?: WireUpdate[];
  projectId?: string;
  documentId?: string;
  cancelled?: boolean;
};
export type DesktopBridge = {
  copyText: (text: string) => Promise<void>;
  agent: import("../mcp/types").AgentBridge;
  fonts: () => Promise<string[]>;
  ready: () => Promise<void>;
  platform: string;
  titleBarOverlay: boolean;
  windowId: string;
  version: string;
  request: (action: WorkspaceAction) => Promise<ActionResult>;
  subscribe: (callback: () => void) => () => void;
  session: {
    project: (projectId: string) => Promise<WindowSession | null>;
    load: () => Promise<WindowSession | null>;
    save: (session: WindowSession) => Promise<void>;
  };
  windows: {
    list: () => Promise<{ id: string; title: string; projectId?: string }[]>;
    move: (
      tab: TabView,
      projectId: string,
      targetId?: string,
      point?: { x: number; y: number },
    ) => Promise<void>;
    onTransfer: (
      callback: (tab: TabView, projectId: string) => void,
    ) => () => void;
    drag: (tab: TabView, projectId: string) => Promise<void>;
    drop: (targetIndex: number) => Promise<void>;
    cancelDrag: () => Promise<void>;
    endDrag: (
      point: { x: number; y: number },
      cancelled: boolean,
    ) => Promise<void>;
    onRemoved: (callback: (tabId: string) => void) => () => void;
    onDropIndex: (
      callback: (value: { tabId: string; targetIndex: number }) => void,
    ) => () => void;
  };
  onPrepareClose: (callback: (token: string) => void) => () => void;
  onCloseCancelled: (callback: () => void) => () => void;
  closePrepared: (token: string, error?: string) => void;
  onOpened: (callback: (result: ActionResult) => void) => () => void;
  paths: (files: File[]) => string[];
  zoom: (factor: number) => void;
  openLogs: () => Promise<void>;
};

export const uuid = () => crypto.randomUUID();
export function makeDocument(name: string, text: string): DocumentRecord {
  return { id: uuid(), name, text, saved: text, version: 0, status: "draft" };
}
export function makeProject(
  name: string,
  documents: Doc[] = [],
  commands: Command[] = [],
): Project {
  return {
    id: uuid(),
    name,
    documents: documents.map((d) => ({
      ...makeDocument(d.name, d.text),
      saved: d.saved,
    })),
    commands,
    excluded: [],
    recovery: [],
  };
}
export function defaultSession(id: string, projectId: string): WindowSession {
  return {
    id,
    projectId,
    tabs: [],
    activeId: "",
    closedTabs: [],
    left: true,
    lineNumbers: false,
    sidebarWidth: 220,
    rightPanelWidth: 260,
    problemsHeight: 140,
    fileSortByProject: {},
    readingSize: 16,
    readingLineHeight: 29,
    readingWidth: "standard",
    outline: {},
    zoom: 1,
  };
}
