import type {
  AgentClient,
  AgentInstallation,
  InstallAction,
  InstallResult,
} from "./install-types";
import type { EditorMode } from "../workspace/types";
export type SourceSelection = { anchor: number; head: number };
export type EditorCapture = {
  documentName: string;
  source: string;
  selections: SourceSelection[];
  primarySelection?: number;
  visibleRanges: { from: number; to: number }[];
  composing?: boolean;
  blocked?: boolean;
  graph?: unknown;
};
export type EditorContextSnapshot = {
  projectId: string;
  tabId?: string;
  page: string;
  mode?: EditorMode | "reader";
  documentId?: string;
  lastDocumentId?: string;
  capture?: EditorCapture;
  pendingDocumentIds: string[];
};
export type EditorSessionInfo = {
  editorSessionId: string;
  windowId: string;
  projectId: string;
  projectName: string;
  root?: string;
  kind: string;
  focused: boolean;
  lastFocusedAt: number;
  tabs: { id: string; documentId: string; name: string; mode: EditorMode }[];
  activeTabId?: string;
  activePage?: string;
  activeMode?: EditorMode | "reader";
};
export type ContextRequest = {
  token: string;
  projectId: string;
  action: "capture" | "activate" | "reveal";
  tabId?: string;
  documentId?: string;
  from?: number;
  to?: number;
};
export type McpSettings = {
  mode: "disabled" | "read" | "write";
  port: number;
  url: string;
  running: boolean;
  error?: string;
  operations: { at: number; tool: string; outcome: string }[];
};
export type AgentBridge = {
  installations: () => Promise<AgentInstallation[]>;
  installAction: (
    client: AgentClient,
    action: InstallAction,
  ) => Promise<InstallResult>;
  selectInstallPath: (
    client: AgentClient,
    part: "config" | "skill",
  ) => Promise<AgentInstallation>;
  connectionFormat: (format: AgentClient | "http") => Promise<string>;
  onRequest: (callback: (request: ContextRequest) => void) => () => void;
  respond: (
    token: string,
    context?: EditorContextSnapshot,
    error?: string,
  ) => void;
  summary: (value: {
    projectId: string;
    activeTabId?: string;
    activePage?: string;
    activeMode?: EditorMode | "reader";
    tabs: { id: string; documentId: string; mode: EditorMode }[];
  }) => void;
  settings: () => Promise<McpSettings>;
  configure: (patch: {
    mode?: McpSettings["mode"];
    port?: number;
    resetToken?: boolean;
  }) => Promise<McpSettings>;
  connection: () => Promise<{
    url: string;
    headers: { Authorization: string };
  }>;
};
