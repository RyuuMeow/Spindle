"use client";
import { t as tr } from "../i18n/index.ts";

import {
  useDiagnostics,
  requestDiagnostics,
} from "../diagnostics/use-diagnostics";
import { copyText } from "@/app/clipboard";
import { useAgentContext } from "../mcp/use-agent-context";
import { lineOffset } from "./authoring";
import { EditorView } from "@codemirror/view";
import { AppearanceProvider } from "../appearance/context";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import {
  BookText,
  PanelLeft,
  ChevronDown,
  Plus,
  Search,
  Network,
  PenLine,
  BookOpen,
  Clock3,
  ListTree,
  Settings2,
  ArchiveRestore,
  ArrowDownAZ,
  ArrowUpZA,
  ListOrdered,
  LoaderCircle,
  FilePlus2,
  Pin,
  PinOff,
  BarChart3,
  Copy,
  Trash2,
  FolderOpen,
  Undo2,
  Redo2,
  FilePenLine,
  ExternalLink,
  Folder,
  FileText,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CircleAlert,
  FolderPlus,
  X,
  Check,
} from "lucide-react";
import type { editor as MonacoEditor, Position } from "monaco-editor";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Command } from "../parser";
import { ChromeButton } from "@/components/ChromeButton";
import WorkspaceTabs from "../WorkspaceTabs";
import CodeEditor from "../CodeEditor";
import { collectVariables } from "../variable-completion";
import Graph from "../Graph";
import { mapSessionGraphSources } from "../graph/map-sources";
import { type CommandActions } from "../CommandManager";
import CommandManager from "../CommandManager";
import { SearchOverlay } from "./SearchOverlay";
import { type SearchHit, type SearchScope } from "./search";
import { ProblemsPanel } from "./ProblemsPanel";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import ReadingEditor, { type ReadingActions } from "../reading/ReadingEditor";
import DialogueReader from "../reading/DialogueReader";
import StatisticsPanel from "./StatisticsPanel";
import { parse, type Node as YarnNode } from "../parser";
import { WorkspaceClient } from "./client";
import { restoreSession } from "./storage";
import { difference, monacoSourceEdits, validateCommands } from "./engine";
import { uniqueSceneName, validSceneName, sceneRange } from "./authoring";
import {
  defaultSession,
  makeProject,
  uuid,
  type WindowSession,
  type TabView,
  type DocumentRecord,
  type WorkspaceAction,
  type ActionResult,
} from "./types";
import ActionMenu, { type MenuAction, type MenuState } from "./ActionMenu";
import { SegmentedControl } from "@/components/SegmentedControl";
import SettingsView from "./SettingsView";
import { settingEntries, type SettingsSection } from "./settings-registry";
import RescueSettings from "./RescueSettings";
import { HistoryList, HistoryPreview } from "./HistoryView";
import RecoveryView from "./RecoveryView";
import type { RecoveryEntry } from "./types";
import { navigateSession, navigateHistory } from "./navigation";
import { orderedDocuments, uniqueDocumentName, folderOf } from "./file-order";
import { InlineNameEditor, type InlineDraft } from "./InlineNameEditor";
import FileTree from "./FileTree";
import { projectFolders, uniqueCopyName } from "./file-tree";
import "./workspace.css";

type Prompt = {
  title: string;
  description?: string;
  label?: string;
  value?: string;
  danger?: boolean;
  submitLabel?: string;
  run: (value: string) => Promise<void> | void;
};
const modes = {
  source: tr("m9982ffc60be9"),
  rendered: tr("m34e439ce0fb9"),
  graph: tr("m3f633044cfc6"),
};
const utilityNames: Record<string, string> = {
  "@new-document": tr("m47fcdf3ee211"),
  "@settings": tr("m0d8619aae051"),
  "@commands": tr("mae2f19d77e06"),
  "@recovery": tr("m525e69a5165d"),
};
const pendingWrite = (doc: DocumentRecord) =>
  ["pending", "saving"].includes(doc.status);
const saveLabels = {
  saved: tr("m17785778d3f8"),
  pending: tr("m65e79e864dc2"),
  saving: tr("mc79aaeb37b09"),
  draft: tr("m1aa3ecd6d58d"),
  conflict: tr("m611d89781f2f"),
  missing: tr("m7ebaa672118d"),
  error: tr("m38dd0a6e8c39"),
};

function WorkbenchContent({
  client,
  initialSession,
  onNavigate,
}: {
  client: WorkspaceClient;
  initialSession: WindowSession | null;
  onNavigate?: (action: WorkspaceAction | "home" | "create") => Promise<void>;
}) {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const [session, setSession] = useState<WindowSession>(
    () =>
      initialSession ||
      defaultSession(client.windowId, snapshot.currentProjectId),
  );
  useEffect(
    () =>
      client.subscribeSourceChanges((id, transaction) => {
        setSession((s) =>
          mapSessionGraphSources(
            s,
            id,
            transaction.changes,
            transaction.state.doc.toString(),
            transaction.startState.doc.toString(),
          ),
        );
      }),
    [client],
  );
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [promptValue, setPromptValue] = useState(""),
    [promptError, setPromptError] = useState(""),
    [busy, setBusy] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<InlineDraft | null>(null);
  const inlineSubmitting = useRef(false),
    inlineOrigin = useRef<HTMLElement | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const [toast, setToast] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [searchQuery, setSearchQuery] = useState(""),
    [searchScope, setSearchScope] = useState<SearchScope>("all"),
    [quickNewTab, setQuickNewTab] = useState(false),
    [sceneQuery, setSceneQuery] = useState(""),
    [problems, setProblems] = useState(false),
    [issueScope, setIssueScope] = useState("all"),
    [issueSeverity, setIssueSeverity] = useState("all");
  const [selected, setSelected] = useState(""),
    [focus, setFocus] = useState(0),
    [historyOpen, setHistoryOpen] = useState(false),
    [historyCompare, setHistoryCompare] = useState<"preview" | "diff">(
      "preview",
    ),
    [statisticsOpen, setStatisticsOpen] = useState(false),
    [historySelection, setHistorySelection] = useState<{
      entry: RecoveryEntry;
      text: string;
      version: number;
    } | null>(null),
    [settingsSection, setSettingsSection] =
      useState<SettingsSection>("reading"),
    [conflict, setConflict] = useState<DocumentRecord | null>(null),
    [commandDirty, setCommandDirty] = useState(false);
  const [settingsNavigation, setSettingsNavigation] = useState<{
    section: SettingsSection;
    field?: string;
    nonce: number;
  }>();
  const [commandTarget, setCommandTarget] = useState<{
    name: string;
    nonce: number;
  }>();
  const pendingDocument = useRef<{ tabId: string; origin: string } | null>(
    null,
  );
  const [goto, setGoto] = useState<{
    file: string;
    line: number;
    column?: number;
    nonce: number;
  } | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null),
    monacoRef = useRef<unknown>(null),
    editorViews = useRef<Record<string, MonacoEditor.ICodeEditorViewState>>({}),
    readingActions = useRef<ReadingActions | null>(null),
    commandActions = useRef<CommandActions | null>(null);
  const input = useRef<HTMLInputElement>(null),
    dragCancelled = useRef(false);
  const project =
    snapshot.projects.find((p) => p.id === session.projectId) ||
    snapshot.projects[0];
  const standalone = project?.kind === "standalone";
  const tabs = session.tabs.filter(
    (t) =>
      !!utilityNames[t.documentId] ||
      project?.documents.some((d) => d.id === t.documentId),
  );
  const active = tabs.find((t) => t.id === session.activeId) || tabs[0];
  const navigationAvailable = {
    back: !!active?.past?.length,
    forward: !!active?.future?.length,
  };
  const doc = project?.documents.find((d) => d.id === active?.documentId),
    mode = active?.mode || "source";
  const analysis = useMemo(
    () =>
      project
        ? parse(project.documents, project.commands)
        : { nodes: [], issues: [], links: [] },
    [project],
  );
  const diagnostics = useDiagnostics(
    project,
    analysis.issues,
    doc?.id,
    active?.line,
  );
  const variables = useMemo(
    () => collectVariables(project?.documents || []),
    [project?.documents],
  );
  useAgentContext(client, session, (request) => {
    if (request.action === "activate" && request.tabId) {
      if (!tabs.some((t) => t.id === request.tabId))
        throw Error("TAB_NOT_FOUND");
      activate(request.tabId);
    }
    if (request.action === "reveal") {
      const target = project.documents.find((d) => d.id === request.documentId);
      if (!target) throw Error("DOCUMENT_NOT_FOUND");
      const offset = request.from ?? 0;
      const line = target.text.slice(0, offset).split("\n").length;
      openDocument(
        target.id,
        false,
        line,
        offset - lineOffset(target.text, line) + 1,
        true,
        "source",
      );
    }
  });
  const utility = !!utilityNames[active?.documentId || ""];
  const commandHasDraft = commandDirty;
  const outlineOpen = !!session.outline?.[mode];
  const [narrowPanels, setNarrowPanels] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setNarrowPanels(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [historyToolbar, setHistoryToolbar] = useState<HTMLDivElement | null>(
    null,
  );
  const [sideFocus, setSideFocus] = useState<"left" | "right">("left");
  const showOutline =
    !!doc &&
    outlineOpen &&
    !historyOpen &&
    !statisticsOpen &&
    (!narrowPanels || sideFocus === "right" || !session.left);
  function resetTransient() {
    setHistorySelection(null);
    setHistoryOpen(false);
    setStatisticsOpen(false);
  }
  function showSearch() {
    const cmHost = document.activeElement?.closest(".cm-editor"),
      cm = cmHost ? EditorView.findFromDOM(cmHost as HTMLElement) : null,
      editor = mode === "source" ? editorRef.current : null,
      selection = editor?.getSelection(),
      selected = cm
        ? cm.state.sliceDoc(
            cm.state.selection.main.from,
            cm.state.selection.main.to,
          )
        : selection
          ? editor?.getModel()?.getValueInRange(selection)
          : window.getSelection()?.toString();
    if (selected) setSearchQuery(selected);
    setQuickNewTab(false);
    setSearchScope("all");
    setSearchOpen(true);
  }
  function showFiles(newTab = false) {
    setQuickNewTab(newTab);
    setSearchScope("files");
    setSearchQuery("");
    setSearchOpen(true);
  }
  function openCommands() {
    capture();
    setSearchOpen(false);
    openDocument("@commands");
  }
  function openSettings(section: typeof settingsSection = "reading") {
    setSettingsSection(section);
    setSettingsNavigation({ section, nonce: Date.now() });
    openDocument("@settings");
  }
  function navigateHit(hit: SearchHit, newTab: boolean, source = false) {
    const nextMode = source ? "source" : mode;
    openDocument(hit.documentId, newTab, hit.line, hit.column, true, nextMode);
    if (nextMode === "graph") {
      const node = analysis.nodes
        .filter(
          (n) =>
            n.file === hit.file && n.start <= hit.line && n.end >= hit.line,
        )
        .at(-1);
      setSelected(node?.id || "");
      setFocus((f) => f + 1);
    }
  }
  async function restoreEntry(
    entry: RecoveryEntry,
    expectedVersion?: number,
    expectedText?: string,
  ) {
    ask({
      title: tr("mc07fb8c4d3e4") + entry.name + "？",
      description: tr("m3777094a62ad"),
      submitLabel: tr("mcd31b7281ae1"),
      run: async () => {
        await client.flush(project.id);
        const result = await perform({
          type: "recover",
          projectId: project.id,
          recoveryId: entry.id,
          expectedVersion,
          expectedText,
        });
        if (!result) throw Error(tr("m90f6f4e13d24"));
        setHistorySelection(null);
        setHistoryOpen(false);
        if (result.documentId) openDocument(result.documentId, false);
        notify(tr("m98902be3e465"));
      },
    });
  }
  const nodes = analysis.nodes.filter((n) => n.file === doc?.name),
    errorCount = diagnostics.published.filter(
      (i) => i.severity === "error",
    ).length,
    warningCount = diagnostics.published.filter(
      (i) => i.severity === "warning",
    ).length;
  useEffect(() => {
    window.yarnDesktop?.zoom(session.zoom);
  }, [session.zoom]);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void client
        .saveSession({
          ...session,
          projectId: project?.id || session.projectId,
        })
        .catch((e) => setToast(String(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [session, project?.id, client]);
  const [closing, setClosing] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [leaveFailure, setLeaveFailure] = useState<{
    message: string;
    action: WorkspaceAction | "home" | "create";
  } | null>(null);
  const leaving = useRef(false);
  async function saveBeforeLeaving() {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await client.prepareClose(project.id);
    const sourceView = editorRef.current?.saveViewState();
    const saved = {
      ...session,
      screen: "editor" as const,
      projectId: project.id,
      tabs: session.tabs.map((t) =>
        t.id === active?.id && mode === "source" && sourceView
          ? { ...t, sourceView }
          : t,
      ),
    };
    await client.saveSession(saved);
    await client.action({ type: "save", projectId: project.id });
    const state = client.getSnapshot(),
      current = state.projects.find((p) => p.id === project.id);
    const failed = current?.documents.find(
      (d) => d.composing || ["error", "conflict", "missing"].includes(d.status),
    );
    if (
      failed ||
      current?.persistenceError ||
      state.notices.find((message) => message.startsWith(tr("m32b9dabb0ba4")))
    )
      throw Error(
        (failed?.composing ? tr("md6ebdebd8c14") : failed?.error) ||
          current?.persistenceError ||
          state.notices.find((message) =>
            message.startsWith(tr("m32b9dabb0ba4")),
          ) ||
          tr("m8f52fe1c3c78"),
      );
  }
  async function leaveWorkspace(action: WorkspaceAction | "home" | "create") {
    if (!onNavigate || leaving.current) return;
    leaving.current = true;
    setClosing(true);
    setCloseSaving(false);
    const timer = setTimeout(() => {
      if (client.hasPendingWritesIn(project.id)) setCloseSaving(true);
    }, 250);
    try {
      await saveBeforeLeaving();
      if (typeof action === "string")
        await client.action({ type: "closeProject", projectId: project.id });
      await onNavigate(action);
    } catch (error) {
      setLeaveFailure({ message: String(error), action });
    } finally {
      clearTimeout(timer);
      leaving.current = false;
      setClosing(false);
      setCloseSaving(false);
    }
  }
  const prepareWebReload = useEffectEvent(async (event: Event) => {
    const { resolve, reject } = (
      event as CustomEvent<{
        resolve: () => void;
        reject: (error: unknown) => void;
      }>
    ).detail;
    try {
      if (commandDirty) throw Error(tr("drafts.close"));
      await saveBeforeLeaving();
      resolve();
    } catch (error) {
      reject(error);
    }
  });
  useEffect(() => {
    if (window.yarnDesktop) return;
    const handler = (event: Event) => void prepareWebReload(event);
    window.addEventListener("spindle:prepare-reload", handler);
    return () => window.removeEventListener("spindle:prepare-reload", handler);
  }, []);
  const prepareClose = useEffectEvent(async (token: string) => {
    if (leaving.current) {
      window.yarnDesktop?.closePrepared(token, tr("m108cf73c6a09"));
      return;
    }
    leaving.current = true;
    setClosing(true);
    setCloseSaving(false);
    const timer = setTimeout(() => {
      if (client.hasPendingWritesIn(project.id)) setCloseSaving(true);
    }, 250);
    try {
      if (commandDirty) {
        const decision = await window.yarnDesktop?.commandDraftDecision();
        if (decision === "cancel") throw Error(tr("drafts.close"));
        if (decision === "apply" && !(await commandActions.current?.save()))
          throw Error(tr("drafts.close"));
        if (decision === "discard") commandActions.current?.discard();
      }
      await saveBeforeLeaving();
      window.yarnDesktop?.closePrepared(token);
    } catch (error) {
      setClosing(false);
      window.yarnDesktop?.closePrepared(token, String(error));
      notify(String(error));
    } finally {
      clearTimeout(timer);
      leaving.current = false;
    }
  });
  useEffect(() => {
    const desktop = window.yarnDesktop;
    if (!desktop) return;
    const prepare = desktop.onPrepareClose((token) => void prepareClose(token));
    const cancel = desktop.onCloseCancelled(() => {
      setClosing(false);
      setCloseSaving(false);
    });
    return () => {
      prepare();
      cancel();
    };
  }, []);
  const persistStructure = useEffectEvent(() => {
    void client
      .saveSession({ ...session, projectId: project?.id || session.projectId })
      .catch((e) => setToast(String(e)));
  });
  const structureKey = JSON.stringify([
    session.projectId,
    session.activeId,
    session.tabs.map((t) => [t.id, t.documentId, t.mode, t.pinned]),
  ]);
  useEffect(() => {
    persistStructure();
  }, [structureKey]);
  useEffect(() => {
    document.title = `${doc?.name || project?.name || "Spindle"} — ${project?.name || ""} · Spindle`;
  }, [doc?.name, project?.name]);
  function registerCommand(command: Command) {
    void perform({ type: "registerCommand", projectId: project.id, command });
  }
  async function perform(action: WorkspaceAction) {
    try {
      if (
        onNavigate &&
        ["openFolder", "createProject", "migrateDraft"].includes(action.type)
      ) {
        await leaveWorkspace(action);
        return;
      }
      const result = await client.action(action);
      if (onNavigate && action.type === "import") {
        await leaveWorkspace("home");
        notify(tr("m7d5909bba540"));
        return;
      }
      if (action.type === "save") {
        const recoveryFailure = result.snapshot.notices.find((message) =>
          message.startsWith(tr("m32b9dabb0ba4")),
        );
        if (recoveryFailure) throw Error(recoveryFailure + tr("mc555cf5542a0"));
      }
      if (client.error) notify(client.error);
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }
  function ask(next: Prompt) {
    setPromptValue(next.value || "");
    setPromptError("");
    setPrompt(next);
  }
  function tabPatch(patch: Partial<TabView>) {
    setSession((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === (s.activeId || active?.id) ? { ...t, ...patch } : t,
      ),
    }));
  }
  function capture() {
    if (active && editorRef.current && mode === "source") {
      const state = editorRef.current.saveViewState();
      if (state) {
        editorViews.current[active.id + ":" + active.documentId] = state;
        setSession((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === active.id ? { ...t, sourceView: state } : t,
          ),
        }));
      }
    }
  }
  function activate(id: string) {
    if (inlineSubmitting.current) return;
    if (pendingDocument.current?.tabId === id) return;
    cancelInline();
    capture();
    resetTransient();
    setSession((s) => ({ ...s, activeId: id }));
    setGoto(null);
    setSelected("");
  }
  function openDocument(
    id: string,
    newTab = false,
    line?: number,
    column?: number,
    record = true,
    forcedMode?: TabView["mode"],
  ) {
    if (inlineSubmitting.current) return;
    cancelInline();
    resetTransient();
    capture();
    const document = project.documents.find((d) => d.id === id);
    setSession((current) => {
      // Utility pages are explicitly selected by their own menu, not discovered by file navigation.
      if (utilityNames[id] && !newTab) {
        const existing = current.tabs.find((t) => t.documentId === id);
        if (existing) return { ...current, activeId: existing.id };
        return navigateSession(
          current,
          id,
          { newTab: true, line, column, mode: forcedMode, record },
          uuid(),
        );
      }
      return navigateSession(
        current,
        id,
        { newTab, line, column, mode: forcedMode, record },
        uuid(),
      );
    });
    setSelected("");
    if (document)
      setSession((s) => ({
        ...s,
        recentDocuments: [
          id,
          ...(s.recentDocuments || []).filter((x) => x !== id),
        ].slice(0, 30),
      }));
    if (document && line !== undefined)
      setGoto((previous) => ({
        file: document.name,
        line,
        column: column ?? 1,
        nonce: (previous?.nonce || 0) + 1,
      }));
    else setGoto(null);
  }
  function go(file: string, line: number, column = 1) {
    const d = project.documents.find((d) => d.name === file);
    if (d) openDocument(d.id, false, line, column, true, "source");
  }
  function history(back: boolean) {
    setInlineDraft(null);
    capture();
    resetTransient();
    setGoto(null);
    setSelected("");
    const validIds = new Set(project.documents.map((d) => d.id));
    const target = [...(back ? active?.past || [] : active?.future || [])]
      .reverse()
      .find((location) => validIds.has(location.documentId));
    if (active && target) {
      const key = active.id + ":" + target.documentId;
      if (target.sourceView) editorViews.current[key] = target.sourceView;
      else delete editorViews.current[key];
    }
    setSession((current) => navigateHistory(current, back, validIds));
  }
  function modeChange(next: TabView["mode"]) {
    capture();
    resetTransient();
    tabPatch({ mode: next });
    if (next === "source" && doc)
      setGoto((previous) => ({
        file: doc.name,
        line: active.line,
        column: active.column,
        nonce: (previous?.nonce || 0) + 1,
      }));
  }
  function reorder(id: string, index: number) {
    setSession((s) => {
      const old = s.tabs.findIndex((t) => t.id === id),
        tab = s.tabs[old];
      if (!tab) return s;
      const rest = s.tabs.filter((t) => t.id !== id);
      rest.splice(Math.max(0, index - (old < index ? 1 : 0)), 0, tab);
      return { ...s, tabs: rest };
    });
  }
  async function closeTabs(ids: string[], force = false) {
    if (inlineSubmitting.current) return;
    if (pendingDocument.current && ids.includes(pendingDocument.current.tabId))
      cancelInline();
    if (!force) {
      await client.flush(project.id);
      const result = await perform({ type: "save", projectId: project.id });
      if (!result) return;
      const failed = result.snapshot.projects
        .find((p) => p.id === project.id)
        ?.documents.filter(
          (d) =>
            ids.some(
              (id) => tabs.find((t) => t.id === id)?.documentId === d.id,
            ) && ["conflict", "error", "missing"].includes(d.status),
        );
      if (failed?.length) {
        ask({
          title: tr("m0e4cd8db9388"),
          description:
            failed.map((d) => d.name + "：" + d.error).join("\n") +
            tr("m1ca48e5d4368"),
          submitLabel: tr("m1e18232c29fd"),
          run: () => closeTabs(ids, true),
        });
        return;
      }
    }
    capture();
    setSession((s) => {
      const closing = s.tabs.filter((t) => ids.includes(t.id)),
        remaining = s.tabs.filter((t) => !ids.includes(t.id));
      return {
        ...s,
        tabs: remaining,
        activeId: ids.includes(s.activeId)
          ? remaining[
              Math.min(
                s.tabs.findIndex((t) => t.id === s.activeId),
                remaining.length - 1,
              )
            ]?.id || ""
          : s.activeId,
        closedTabs: [...s.closedTabs, ...closing].slice(-30),
      };
    });
  }
  function reopen() {
    setSession((s) => {
      const tab = s.closedTabs.at(-1);
      if (!tab) return s;
      return {
        ...s,
        tabs: [...s.tabs, { ...tab, id: uuid() }],
        activeId: "",
        closedTabs: s.closedTabs.slice(0, -1),
      };
    });
    setSession((s) => ({ ...s, activeId: s.tabs.at(-1)?.id || "" }));
  }
  async function selectProject(id: string, force = false) {
    if (id === project.id) return;
    if (onNavigate) {
      const entry = snapshot.catalog?.find((p) => p.id === id);
      if (entry) await leaveWorkspace({ type: "openFolder", root: entry.root });
      return;
    }
    setInlineDraft(null);
    setActiveFolder(null);
    resetTransient();
    const result = await perform({ type: "save", projectId: project.id });
    if (!result) return;
    if (
      !force &&
      result.snapshot.projects
        .find((p) => p.id === project.id)
        ?.documents.some((d) =>
          ["error", "conflict", "missing"].includes(d.status),
        )
    ) {
      ask({
        title: tr("me5d43a490c3c"),
        description: result.snapshot.projects
          .find((p) => p.id === project.id)
          ?.documents.filter((d) =>
            ["error", "conflict", "missing"].includes(d.status),
          )
          .map((d) => d.name + "：" + d.error)
          .join("\n"),
        submitLabel: tr("mcbdd4c94f552"),
        run: () => selectProject(id, true),
      });
      return;
    }
    capture();
    const saved = localStorage.getItem("yarn-project-view-" + id);
    let previous: WindowSession | null = null;
    try {
      previous = saved
        ? restoreSession(JSON.parse(saved), client.windowId, id)
        : null;
    } catch {
      notify(tr("me94957411044"));
    }
    localStorage.setItem(
      "yarn-project-view-" + project.id,
      JSON.stringify(session),
    );
    setSession(
      previous
        ? { ...previous, id: client.windowId }
        : defaultSession(client.windowId, id),
    );
  }
  async function adopt(result: ActionResult | undefined, force = false) {
    if (!result || result.cancelled) return;
    if (onNavigate && result.projectId === project.id) {
      if (result.documentId) openDocument(result.documentId, false);
      return;
    }
    const id = result.projectId;
    setInlineDraft(null);
    setActiveFolder(null);
    if (id) {
      if (!force && project && project.id !== id) {
        const saved = await perform({ type: "save", projectId: project.id });
        if (!saved) return;
        const failed = saved.snapshot.projects
          .find((p) => p.id === project.id)
          ?.documents.filter((d) =>
            ["error", "conflict", "missing"].includes(d.status),
          );
        if (failed?.length) {
          ask({
            title: tr("me5d43a490c3c"),
            description: failed.map((d) => d.name + "：" + d.error).join("\n"),
            submitLabel: tr("mcbdd4c94f552"),
            run: () => adopt(result, true),
          });
          return;
        }
      }
      const p = result.snapshot.projects.find((p) => p.id === id);
      const documentId = result.documentId || p?.documents[0]?.id;
      const tab: TabView | undefined = documentId
        ? { id: uuid(), documentId, mode: "source", line: 1, column: 1 }
        : undefined;
      setSession({
        ...defaultSession(client.windowId, id),
        tabs: tab ? [tab] : [],
        activeId: tab?.id || "",
      });
    }
  }
  function cancelInline() {
    if (inlineSubmitting.current) return;
    if (pendingDocument.current) {
      const pending = pendingDocument.current;
      setSession((s) => ({
        ...s,
        tabs: s.tabs.filter((t) => t.id !== pending.tabId),
        activeId: pending.origin,
      }));
      pendingDocument.current = null;
    }
    setInlineDraft(null);
    requestAnimationFrame(
      () => inlineOrigin.current?.isConnected && inlineOrigin.current.focus(),
    );
  }
  function beginInline(next: InlineDraft) {
    if (inlineSubmitting.current) return;
    inlineOrigin.current = document.activeElement as HTMLElement;
    setInlineDraft(next);
  }
  function createFromSearch(name?: string) {
    const folder = activeFolder ?? (utility ? "" : folderOf(doc?.name || ""));
    capture();
    const tabId = uuid();
    pendingDocument.current = { tabId, origin: session.activeId };
    setSession((s) =>
      navigateSession(
        { ...s, left: true },
        "@new-document",
        { newTab: true },
        tabId,
      ),
    );
    setSearchOpen(false);
    beginInline({
      kind: "new-document",
      folder: projectFolders(project).includes(folder) ? folder : "",
      value: name || uniqueDocumentName(project.documents, folder),
      provisional: true,
    });
  }
  function newDocument(inNewTab = false) {
    if (standalone) {
      void perform({ type: "openFiles" });
      return;
    }
    const candidate = activeFolder ?? folderOf(doc?.name || "");
    const folder = projectFolders(project).includes(candidate) ? candidate : "";
    setSearchOpen(false);
    setSideFocus("left");
    setSession((s) => ({ ...s, left: true }));
    beginInline({
      kind: "new-document",
      folder,
      value: uniqueDocumentName(project.documents, folder),
      newTab: inNewTab,
    });
  }
  function renameDocumentInline(d: DocumentRecord) {
    setSearchOpen(false);
    setSideFocus("left");
    setSession((s) => ({ ...s, left: true }));
    beginInline({
      kind: "rename-document",
      documentId: d.id,
      folder: folderOf(d.name),
      value: d.name.split("/").at(-1)!,
    });
  }
  function newFolder(parent = activeFolder ?? "") {
    const folders = projectFolders(project);
    let value = "New Folder",
      index = 2;
    while (folders.includes((parent ? parent + "/" : "") + value))
      value = "New Folder " + index++;
    setSession((s) => ({ ...s, left: true }));
    setSideFocus("left");
    beginInline({ kind: "new-folder", folder: parent, value });
  }
  function renameFolderInline(path: string) {
    beginInline({
      kind: "rename-folder",
      folder: folderOf(path),
      originalFolder: path,
      value: path.split("/").at(-1)!,
    });
  }
  function folderMenu(path: string): MenuAction[] {
    return [
      {
        label: tr("m67b8c733279b"),
        icon: <FolderPlus size={15} />,
        run: () => newFolder(path),
      },
      {
        label: tr("m47fcdf3ee211"),
        icon: <FilePlus2 size={15} />,
        run: () => {
          setSession((s) => ({ ...s, left: true }));
          beginInline({
            kind: "new-document",
            folder: path,
            value: uniqueDocumentName(project.documents, path),
          });
        },
      },
      {
        label: tr("mdc993eb727db"),
        icon: <FilePenLine size={15} />,
        run: () => renameFolderInline(path),
      },
      {
        label: tr("m7b109ada159b"),
        icon: <Folder size={15} />,
        run: () => moveMenu("folder:" + path),
      },
      null,
      {
        label: tr("m4a086dd00b9b"),
        icon: <Trash2 size={15} />,
        danger: true,
        run: () =>
          void perform({
            type: "trashFolder",
            projectId: project.id,
            name: path,
          }),
      },
    ];
  }
  function moveMenu(entry: string) {
    const origin = menu;
    requestAnimationFrame(() =>
      setMenu({
        x: origin?.x || 200,
        y: origin?.y || 180,
        actions: ["", ...projectFolders(project)]
          .filter(
            (parent) =>
              !entry.startsWith("folder:") ||
              (parent !== entry.slice(7) &&
                !parent.startsWith(entry.slice(7) + "/")),
          )
          .map((parent) => ({
            label: parent || tr("mad3639a602e1"),
            icon: <Folder size={15} />,
            run: () =>
              void perform({
                type: "moveEntry",
                projectId: project.id,
                entry,
                parent,
              }).then((r) => {
                if (r) setFileSort("manual");
              }),
          })),
      }),
    );
  }
  async function duplicateDocument(d: DocumentRecord) {
    await client.flush(project.id);
    const latest = client
      .getSnapshot()
      .projects.find((p) => p.id === project.id)!;
    const source = latest.documents.find((x) => x.id === d.id);
    if (!source) return;
    const result = await perform({
      type: "createDocument",
      projectId: project.id,
      name: uniqueCopyName(latest, source.name),
      text: source.text,
      firstInOrder: displayedDocuments.map((d) => d.id),
    });
    const created = result?.snapshot.projects
      .find((p) => p.id === project.id)
      ?.documents.find((d) => d.id === result.documentId);
    if (created) {
      openDocument(created.id);
      setFileSort("manual");
      renameDocumentInline(created);
    }
  }
  function newScene() {
    if (!doc) return;
    setHistoryOpen(false);
    setHistorySelection(null);
    setSideFocus("right");
    setSceneQuery("");
    setSession((s) => ({ ...s, outline: { ...s.outline, [mode]: true } }));
    beginInline({
      kind: "new-scene",
      documentId: doc.id,
      version: doc.version,
      value: uniqueSceneName(project),
    });
  }
  function renameSceneInline(node: YarnNode) {
    const target = project.documents.find((d) => d.name === node.file);
    if (!target) return;
    if (target.id !== doc?.id) openDocument(target.id);
    setHistoryOpen(false);
    setSideFocus("right");
    setSceneQuery("");
    setSession((s) => ({ ...s, outline: { ...s.outline, [mode]: true } }));
    beginInline({
      kind: "rename-scene",
      documentId: target.id,
      version: target.version,
      sceneName: node.name,
      value: node.name,
    });
  }
  async function submitInline() {
    const draft = inlineDraft;
    if (!draft || inlineSubmitting.current) return;
    const name = draft.value.trim();
    inlineSubmitting.current = true;
    setInlineDraft((previous) =>
      previous ? { ...previous, busy: true, error: undefined } : previous,
    );
    try {
      await client.flush(project.id);
      const latest = client
        .getSnapshot()
        .projects.find((p) => p.id === project.id);
      if (!latest) throw Error(tr("m14d579d4a0c3"));
      if (draft.kind === "new-folder" || draft.kind === "rename-folder") {
        if (!name || /[\\/]/.test(name)) throw Error(tr("m044277ffa28a"));
        const path = (draft.folder ? draft.folder + "/" : "") + name;
        await client.action(
          draft.kind === "new-folder"
            ? { type: "createFolder", projectId: project.id, name: path }
            : {
                type: "moveEntry",
                projectId: project.id,
                entry: "folder:" + draft.originalFolder,
                parent: draft.folder || "",
                name,
              },
        );
        setActiveFolder(path);
        setFileSort("manual");
        setInlineDraft(null);
      } else if (
        draft.kind === "new-document" ||
        draft.kind === "rename-document"
      ) {
        if (!name || /[\\/]/.test(name)) throw Error(tr("mfddb2b6425c0"));
        const filename = name.endsWith(".yarn") ? name : name + ".yarn";
        const relative = (draft.folder ? draft.folder + "/" : "") + filename;
        const existing = latest.documents.find(
          (d) => d.id === (draft.documentId || draft.createdId),
        );
        const result = await client.action(
          existing
            ? {
                type: "renameDocument",
                projectId: project.id,
                documentId: existing.id,
                name: relative,
              }
            : {
                type: "createDocument",
                projectId: project.id,
                firstInOrder: displayedDocuments.map((d) => d.id),
                name: relative,
                text: "title: " + uniqueSceneName(latest) + "\n---\n\n===\n",
              },
        );
        const created = result.snapshot.projects
          .find((p) => p.id === project.id)
          ?.documents.find((d) => d.id === (result.documentId || existing?.id));
        if (
          created &&
          ["error", "missing", "conflict"].includes(created.status)
        ) {
          setInlineDraft((previous) =>
            previous ? { ...previous, createdId: created.id } : previous,
          );
          throw Error(created.error || tr("m7f421624d815"));
        }
        if (!created) throw Error(tr("mfa941e733477"));
        setInlineDraft(null);
        if (draft.kind === "new-document") {
          setFileSort("manual");
          if (pendingDocument.current) {
            const pending = pendingDocument.current;
            pendingDocument.current = null;
            setSession((s) => ({
              ...s,
              activeId: pending.tabId,
              tabs: s.tabs.map((t) =>
                t.id === pending.tabId
                  ? { ...t, documentId: created.id, past: [], future: [] }
                  : t,
              ),
            }));
          } else openDocument(created.id, !!draft.newTab);
        }
      } else {
        const target = latest.documents.find((d) => d.id === draft.documentId);
        if (!target) throw Error(tr("maa6484ef65ac"));
        if (!validSceneName(name)) throw Error(tr("m0989b4859445"));
        if (draft.kind === "rename-scene" && name === draft.sceneName) {
          setInlineDraft(null);
          return;
        }
        const result = await client.action(
          draft.kind === "new-scene"
            ? {
                type: "createScene",
                projectId: project.id,
                documentId: target.id,
                version: target.version,
                name,
              }
            : {
                type: "renameScene",
                projectId: project.id,
                documentId: target.id,
                version: target.version,
                fromName: draft.sceneName!,
                name,
              },
        );
        const updated = result.snapshot.projects.find(
          (p) => p.id === project.id,
        )!;
        const node = parse(updated.documents, updated.commands).nodes.find(
          (n) => n.file === target.name && n.name === name,
        );
        setInlineDraft(null);
        if (node) {
          openDocument(target.id, false, node.body, 1, true, mode);
          setSelected(node.id);
          if (mode === "graph") setFocus((f) => f + 1);
        }
      }
    } catch (error) {
      setInlineDraft((previous) =>
        previous
          ? {
              ...previous,
              busy: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : previous,
      );
    } finally {
      inlineSubmitting.current = false;
    }
  }
  function inlineName() {
    return inlineDraft ? (
      <InlineNameEditor
        draft={inlineDraft}
        onChange={(value) =>
          setInlineDraft((previous) =>
            previous ? { ...previous, value, error: undefined } : previous,
          )
        }
        onSubmit={() => void submitInline()}
        onCancel={cancelInline}
      />
    ) : null;
  }
  function showMenu(event: MouseEvent | KeyboardEvent, actions: MenuAction[]) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: "clientX" in event ? event.clientX : rect.left,
      y: "clientY" in event ? event.clientY : rect.bottom,
      actions,
      origin: event.currentTarget as HTMLElement,
    });
  }
  function menuKeys(event: KeyboardEvent, actions: MenuAction[]) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
      showMenu(event, actions);
  }
  function tabMenu(
    id: string,
    windowList: { id: string; title: string; projectId?: string }[] = [],
  ): MenuAction[] {
    const tab = tabs.find((t) => t.id === id)!;
    return [
      {
        label: tr("maa9a10827fb5"),
        icon: <X size={15} />,
        run: () => void closeTabs([id]),
      },
      {
        label: tr("m1c42e1dbcc4e"),
        run: () =>
          void closeTabs(
            tabs.filter((t) => t.id !== id && !t.pinned).map((t) => t.id),
          ),
      },
      {
        label: tr("m16a9494c6443"),
        run: () =>
          void closeTabs(
            tabs
              .slice(tabs.findIndex((t) => t.id === id) + 1)
              .filter((t) => !t.pinned)
              .map((t) => t.id),
          ),
      },
      {
        label: tr("mf16334e03bc9"),
        run: () =>
          void closeTabs(tabs.filter((t) => !t.pinned).map((t) => t.id)),
      },
      {
        label: tr("m5d54e52e5d14"),
        disabled: !session.closedTabs.length,
        run: reopen,
      },
      null,
      {
        label: tab.pinned ? tr("m20590a6a7b9a") : tr("m11a5d69200e6"),
        icon: tab.pinned ? <PinOff size={15} /> : <Pin size={15} />,
        run: () =>
          setSession((s) => ({
            ...s,
            tabs: s.tabs.map((t) =>
              t.id === id ? { ...t, pinned: !t.pinned } : t,
            ),
          })),
      },
      {
        label: tr("m5d0299b8bf75"),
        disabled: !!utilityNames[tab.documentId],
        run: () => openDocument(tab.documentId, true, tab.line, tab.column),
      },
      ...(window.yarnDesktop
        ? [
            null,
            {
              label: tr("m1b8ce46d4f3c"),
              run: () =>
                void window
                  .yarnDesktop!.windows.move(tab, project.id)
                  .catch((e) => notify(String(e))),
            },
            ...windowList
              .filter(
                (w) => w.id !== client.windowId && w.projectId === project.id,
              )
              .map((w) => ({
                label: tr("mbf451b4bfdfe") + w.title,
                run: () =>
                  void window
                    .yarnDesktop!.windows.move(tab, project.id, w.id)
                    .catch((e) => notify(String(e))),
              })),
          ]
        : []),
    ];
  }
  function fileMenu(d: DocumentRecord): MenuAction[] {
    return [
      {
        label: tr("mb7d4526756b3"),
        icon: <ExternalLink size={15} />,
        run: () => openDocument(d.id, true),
      },
      {
        label: tr("m4c3cec274391"),
        icon: <Clock3 size={15} />,
        run: () => {
          openDocument(d.id);
          setHistoryOpen(true);
        },
      },
      {
        label: tr("mdc993eb727db"),
        icon: <FilePenLine size={15} />,
        run: () => renameDocumentInline(d),
      },
      {
        label: tr("m7b109ada159b"),
        icon: <Folder size={15} />,
        run: () => moveMenu("file:" + d.id),
      },
      {
        label: tr("mf1f3ea857593"),
        icon: <Copy size={15} />,
        run: () => void duplicateDocument(d).catch((e) => notify(String(e))),
      },
      null,
      {
        label: window.yarnDesktop ? tr("m764829a168df") : tr("m40c2e3f77dac"),
        run: () =>
          void perform({
            type: "export",
            projectId: project.id,
            documentId: d.id,
          }),
      },
      ...(window.yarnDesktop
        ? [
            {
              label: tr("m40b45c5c9ac4"),
              disabled: !d.path,
              run: () =>
                void perform({
                  type: "reveal",
                  projectId: project.id,
                  documentId: d.id,
                }),
            },
            {
              label: tr("m0ad53126b2f9"),
              disabled: !d.path,
              run: () =>
                void copyText(d.path || "").catch((e) => notify(String(e))),
            },
          ]
        : []),
      null,
      {
        label: tr("m4a086dd00b9b"),
        icon: <Trash2 size={15} />,
        danger: true,
        run: () =>
          void perform({
            type: "removeDocument",
            projectId: project.id,
            documentId: d.id,
            deleteDisk: true,
          }),
      },
    ];
  }
  function sceneMenu(node: YarnNode): MenuAction[] {
    const d = project.documents.find((d) => d.name === node.file)!;
    return [
      { label: tr("m8ab2c257bdec"), run: () => go(node.file, node.body) },
      {
        label: tr("mc406ef3984bf"),
        run: () => openDocument(d.id, true, node.body),
      },
      {
        label: tr("mebaad66708ec"),
        run: () => {
          showSearch();
          setSearchQuery(node.name);
        },
      },
      null,
      {
        label: tr("m152bcd653980"),
        run: () => renameSceneInline(node),
      },
      {
        label: tr("mb7c6eeaf4ef3"),
        icon: <Copy size={15} />,
        run: () =>
          void (async () => {
            await client.flush(project.id);
            const latest = client
              .getSnapshot()
              .projects.find((p) => p.id === project.id)!;
            const source = latest.documents.find((item) => item.id === d.id)!;
            const current = parse(latest.documents, latest.commands).nodes.find(
              (n) => n.file === source.name && n.name === node.name,
            );
            if (!current) return;
            const name = uniqueSceneName(latest, node.name + "Copy"),
              range = sceneRange(source.text, current),
              nl = source.text.includes("\r\n") ? "\r\n" : "\n";
            const copy = source.text
              .slice(range.from, range.to)
              .replace(/^(\s*title\s*:\s*)\S+/, (_m, prefix) => prefix + name);
            const r = await perform({
              type: "transaction",
              projectId: project.id,
              label: tr("mb7c6eeaf4ef3"),
              documents: [
                {
                  id: source.id,
                  version: source.version,
                  edits: [{ from: range.to, to: range.to, insert: nl + copy }],
                },
              ],
            });
            if (r) {
              const p = r.snapshot.projects.find((p) => p.id === project.id)!;
              const created = parse(p.documents, p.commands).nodes.find(
                (n) => n.file === source.name && n.name === name,
              );
              if (created) renameSceneInline(created);
            }
          })(),
      },
      {
        label: tr("m2e60b137242e"),
        icon: <Folder size={15} />,
        run: () => {
          const origin = menu;
          requestAnimationFrame(() =>
            setMenu({
              x: origin?.x || 240,
              y: origin?.y || 200,
              actions: project.documents
                .filter((item) => item.id !== d.id)
                .map((target) => ({
                  label: target.name,
                  icon: <FileText size={15} />,
                  run: () =>
                    void (async () => {
                      await client.flush(project.id);
                      const latest = client
                        .getSnapshot()
                        .projects.find((p) => p.id === project.id)!;
                      const source = latest.documents.find(
                          (item) => item.id === d.id,
                        ),
                        destination = latest.documents.find(
                          (item) => item.id === target.id,
                        );
                      const current =
                        source &&
                        parse(latest.documents, latest.commands).nodes.find(
                          (n) => n.file === source.name && n.name === node.name,
                        );
                      if (!source || !destination || !current) return;
                      const range = sceneRange(source.text, current),
                        nl = destination.text.includes("\r\n") ? "\r\n" : "\n";
                      await perform({
                        type: "transaction",
                        projectId: project.id,
                        label: tr("m943c9c62ee56"),
                        documents: [
                          {
                            id: source.id,
                            version: source.version,
                            edits: [{ ...range, insert: "" }],
                          },
                          {
                            id: destination.id,
                            version: destination.version,
                            edits: [
                              {
                                from: destination.text.length,
                                to: destination.text.length,
                                insert:
                                  nl + source.text.slice(range.from, range.to),
                              },
                            ],
                          },
                        ],
                      });
                    })(),
                })),
            }),
          );
        },
      },
      null,
      {
        label: tr("mdd2852f76d71"),
        icon: <Trash2 size={15} />,
        danger: true,
        run: () =>
          void perform({
            type: "transaction",
            projectId: project.id,
            label: tr("mdd2852f76d71"),
            documents: [
              {
                id: d.id,
                version: d.version,
                edits: [{ ...sceneRange(d.text, node), insert: "" }],
              },
            ],
          }),
      },
    ];
  }
  async function moveScene(sourceId: string, target: YarnNode) {
    const source = analysis.nodes.find((n) => n.id === sourceId);
    if (!source || source.id === target.id || source.file !== target.file)
      return;
    const d = project.documents.find((d) => d.name === source.file)!;
    const a = sceneRange(d.text, source),
      b = sceneRange(d.text, target);
    await perform({
      type: "transaction",
      projectId: project.id,
      label: tr("m5520294e7fa3"),
      documents: [
        {
          id: d.id,
          version: d.version,
          edits: [
            { ...a, insert: "" },
            { from: b.from, to: b.from, insert: d.text.slice(a.from, a.to) },
          ].sort((x, y) => x.from - y.from),
        },
      ],
    });
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const entries = await Promise.all(
        [...files].map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      if (entries.length === 1 && entries[0].name.endsWith(".json")) {
        const data = JSON.parse(entries[0].text);
        if (
          data.format !== "yarn-workbench" ||
          ![1, 2].includes(data.version) ||
          !Array.isArray(data.files)
        )
          throw Error(tr("m34f5922a7b94"));
        validateCommands(data.commands);
        const p = makeProject(
          data.name,
          data.files.map((f: { name: string; text: string }) => ({
            ...f,
            saved: f.text,
          })),
          data.commands,
        );
        if (Array.isArray(data.folders)) p.folders = data.folders;
        await adopt(await perform({ type: "import", project: p }));
      } else {
        for (const entry of entries) {
          const r = await perform({
            type: "createDocument",
            projectId: project.id,
            ...entry,
          });
          if (r?.documentId) openDocument(r.documentId);
        }
      }
    } catch (e) {
      notify(String(e));
    }
    if (input.current) input.current.value = "";
  }
  const keyboard = useEffectEvent((e: globalThis.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (e.defaultPrevented || closing) return;
    const overlay =
      e.target instanceof Element &&
      e.target.closest(
        '[data-workspace-overlay], [role="dialog"], [role="alertdialog"]',
      );
    if (overlay) {
      if (
        mod &&
        key === "s" &&
        active?.documentId === "@commands" &&
        !(
          e.target instanceof Element &&
          e.target.closest('[role="alertdialog"]')
        )
      ) {
        e.preventDefault();
        if (!e.isComposing) void commandActions.current?.save();
      } else if (
        (mod && ["w", "t", "p", "s", "tab"].includes(key)) ||
        (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key))
      )
        e.preventDefault();
      return;
    }
    if (e.isComposing) return;
    if (e.key === "Escape") {
      if (historySelection) {
        setHistorySelection(null);
        return;
      }
      dragCancelled.current = true;
      void window.yarnDesktop?.windows.cancelDrag();
    }
    if (mod && key === "s") {
      e.preventDefault();
      if (active?.documentId === "@commands") {
        void commandActions.current?.save().then((ok) => {
          if (!ok) commandActions.current?.focusError();
        });
        return;
      }
      void perform({
        type: "save",
        projectId: project.id,
        ...(!e.shiftKey && doc ? { documentId: doc.id } : {}),
      });
    } else if (mod && key === "t") {
      e.preventDefault();
      if (e.shiftKey) reopen();
      else {
        showFiles(true);
      }
    } else if (mod && key === "w") {
      e.preventDefault();
      if (active) void closeTabs([active.id]);
    } else if (mod && e.key === "Tab") {
      e.preventDefault();
      const i = tabs.findIndex((t) => t.id === active?.id);
      if (tabs.length)
        activate(
          tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length].id,
        );
    } else if (mod && (key === "p" || (key === "f" && e.shiftKey))) {
      e.preventDefault();
      if (key === "p") {
        showFiles();
      } else showSearch();
    } else if (
      e.altKey &&
      !e.shiftKey &&
      ["ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      history(e.key === "ArrowLeft");
    } else if (mod && key === "f" && mode === "graph") {
      e.preventDefault();
      showSearch();
    } else if (
      mod &&
      window.yarnDesktop &&
      ["+", "=", "-", "0"].includes(e.key)
    ) {
      e.preventDefault();
      const zoom =
        e.key === "0"
          ? 1
          : Math.max(
              0.6,
              Math.min(2, session.zoom + (e.key === "-" ? -0.1 : 0.1)),
            );
      setSession((s) => ({ ...s, zoom }));
      window.yarnDesktop?.zoom(zoom);
    }
  });
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => keyboard(event);
    // Monaco consumes this key before a bubbling workspace listener can see it.
    const searchCapture = (event: globalThis.KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f" &&
        !event.isComposing
      ) {
        keyboard(event);
        if (event.defaultPrevented) event.stopPropagation();
      }
    };
    window.addEventListener("keydown", searchCapture, true);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", searchCapture, true);
      window.removeEventListener("keydown", handler);
    };
  }, []);
  const onOpened = useEffectEvent((result: ActionResult) => {
    void adopt(result);
  });
  useEffect(() => {
    const bridge = window.yarnDesktop;
    if (!bridge) return;
    const removals = bridge.windows.onRemoved((id) =>
      setSession((s) => ({
        ...s,
        tabs: s.tabs.filter((t) => t.id !== id),
        activeId:
          s.activeId === id
            ? s.tabs.find((t) => t.id !== id)?.id || ""
            : s.activeId,
      })),
    );
    const additions = bridge.windows.onTransfer((tab, projectId) => {
      setSession((s) => ({
        ...s,
        projectId,
        tabs: s.tabs.filter((t) => t.id !== tab.id).concat(tab),
        activeId: tab.id,
      }));
      void client.refresh();
    });
    const drops = bridge.windows.onDropIndex(({ tabId, targetIndex }) =>
      reorder(tabId, targetIndex),
    );
    const opened = bridge.onOpened(onOpened);
    void bridge.ready();
    return () => {
      removals();
      additions();
      drops();
      opened();
    };
  }, [client]);
  const editorMenu = useEffectEvent((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!doc) return;
    setMenu({
      x: detail.x,
      y: detail.y,
      actions: [
        {
          label: tr("m3f7281dde090"),
          icon: <Undo2 size={15} />,
          run: () =>
            void perform({
              type: "undo",
              projectId: project.id,
              documentId: doc.id,
            }),
        },
        {
          label: tr("m03717b6f1070"),
          icon: <Redo2 size={15} />,
          run: () =>
            void perform({
              type: "redo",
              projectId: project.id,
              documentId: doc.id,
            }),
        },
        null,
        {
          label: tr("m7e60518d053d"),
          run: () =>
            void readingActions.current
              ?.copyReadable()
              .catch((e) => notify(String(e))),
        },
        {
          label: tr("md47270a2ecc5"),
          run: () => readingActions.current?.find(),
        },
        {
          label: tr("m19eedc9329cd"),
          run: () => readingActions.current?.follow(),
        },
        {
          label: tr("m65a013dc9e0a"),
          run: () => readingActions.current?.fold(),
        },
        {
          label: tr("mc507f7f09fdc"),
          run: () => readingActions.current?.focus(),
        },
        {
          label: tr("m2b27eca8913b"),
          run: () => readingActions.current?.unfoldAll(),
        },
        {
          label: tr("m61e2c710505b"),
          run: () => readingActions.current?.unfold(),
        },
      ],
    });
  });
  useEffect(() => {
    const handler = (event: Event) => editorMenu(event);
    window.addEventListener("yarn-editor-menu", handler);
    return () => window.removeEventListener("yarn-editor-menu", handler);
  }, []);
  const currentIssues = diagnostics.published.filter(
    (i) =>
      (issueScope === "all" || i.file === doc?.name) &&
      (issueSeverity === "all" || i.severity === issueSeverity),
  );
  const fileSort = session.fileSortByProject?.[project.id] || "manual";
  const displayedDocuments = orderedDocuments(project.documents, fileSort);
  function setFileSort(value: "manual" | "name-asc" | "name-desc") {
    setSession((s) => ({
      ...s,
      fileSortByProject: { ...s.fileSortByProject, [project.id]: value },
    }));
  }
  if (!project)
    return <div className="empty-editor">{tr("m54df28110c50")}</div>;
  return (
    <main
      className={
        "workbench dark" +
        (window.yarnDesktop?.titleBarOverlay ? " desktop-overlay" : "")
      }
      onMouseUp={(e) => {
        if (e.button === 3 || e.button === 4) {
          e.preventDefault();
          history(e.button === 3);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        if (window.yarnDesktop)
          void perform({
            type: "openFiles",
            paths: window.yarnDesktop.paths([...e.dataTransfer.files]),
          }).then(adopt);
        else void importFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".yarn,.json"
        hidden
        onChange={(e) => void importFiles(e.target.files)}
      />
      <header className="workspace-header">
        <div className="workspace-identity">
          <ChromeButton
            aria-label={tr("m2d2bb5d9817d")}
            title={tr("m2d2bb5d9817d")}
            disabled={utility || standalone}
            onClick={() => {
              setSideFocus("left");
              setSession((s) => ({ ...s, left: !s.left }));
            }}
          >
            <PanelLeft size={18} />
          </ChromeButton>
          <DropdownMenu
            open={projectMenuOpen}
            onOpenChange={(open) => {
              if (open || menu?.parent !== "project") setProjectMenuOpen(open);
            }}
            modal={false}
          >
            <DropdownMenuTrigger
              className="project-switch"
              aria-label={project.name}
            >
              <BookText size={18} />
              <strong>{project.name}</strong>
              <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="desktop-menu project-menu"
              onInteractOutside={(event) => {
                if (menu?.parent === "project") event.preventDefault();
              }}
            >
              <DropdownMenuItem
                onSelect={() =>
                  onNavigate
                    ? void leaveWorkspace("create")
                    : ask({
                        title: tr("m4efd9b7b6756"),
                        label: tr("mc4f17fe66069"),
                        value: tr("md70df31e32d2"),
                        run: async (name) => {
                          await adopt(
                            await perform({ type: "createProject", name }),
                          );
                        },
                      })
                }
              >
                <FolderPlus size={15} />
                {tr("m181ad3312ed1")}
              </DropdownMenuItem>
              {onNavigate && (
                <>
                  <DropdownMenuItem
                    onSelect={() => void leaveWorkspace({ type: "openFolder" })}
                  >
                    <FolderOpen size={15} />
                    {tr("m7e116545a4ad")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void perform({ type: "openFiles" })}
                  >
                    <FileText size={15} />
                    {tr("ma1e8c391c80d")}
                  </DropdownMenuItem>
                </>
              )}
              {!standalone && (
                <DropdownMenuItem onSelect={() => input.current?.click()}>
                  <FilePlus2 size={15} />
                  {tr("mfa648d30197e")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {(onNavigate
                ? (snapshot.catalog || []).filter((p) => p.recent).slice(0, 5)
                : snapshot.projects
              ).map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  disabled={"unavailable" in p && !!p.unavailable}
                  onSelect={() => void selectProject(p.id)}
                  onContextMenu={(event) => {
                    if (!onNavigate) return;
                    event.preventDefault();
                    event.stopPropagation();
                    showMenu(event, [
                      {
                        label: tr("m4679d41e738f"),
                        icon: <Trash2 size={15} />,
                        run: () =>
                          void perform({
                            type: "catalog",
                            operation: "removeRecent",
                            id: p.id,
                          }),
                      },
                    ]);
                    const origin = event.currentTarget as HTMLElement;
                    setMenu((current) =>
                      current
                        ? { ...current, origin, parent: "project" }
                        : current,
                    );
                  }}
                >
                  <Check
                    size={15}
                    style={{
                      visibility: p.id === project.id ? "visible" : "hidden",
                    }}
                  />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {!onNavigate && (
                <DropdownMenuItem
                  onSelect={() =>
                    void perform({ type: "save", projectId: project.id })
                  }
                >
                  {tr("m96d510bbf21a")}
                  <span className="menu-shortcut">Ctrl+Shift+S</span>
                </DropdownMenuItem>
              )}
              {!standalone && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      void perform({ type: "export", projectId: project.id })
                    }
                  >
                    <ExternalLink size={15} />
                    {tr("m13861276e06f")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openDocument("@recovery")}>
                    <ArchiveRestore size={15} />
                    {tr("mdfe27c2e6e7e")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => requestAnimationFrame(openCommands)}
                  >
                    <Settings2 size={15} />
                    {tr("mae2f19d77e06")}
                    {commandHasDraft ? tr("m96f6a0f923e8") : ""}
                  </DropdownMenuItem>
                </>
              )}
              {project.root && (
                <DropdownMenuItem
                  onSelect={() =>
                    void perform({ type: "reveal", projectId: project.id })
                  }
                >
                  <FolderOpen size={15} />
                  {tr("mb89391aa4985")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openSettings()}>
                <Settings2 size={15} />
                {tr("mc98007f226ed")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSettings("about")}>
                {tr("m09ace4e0d455")}
              </DropdownMenuItem>
              {onNavigate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void leaveWorkspace("home")}
                  >
                    <X size={15} />
                    {standalone ? tr("m1903e4e73f4b") : tr("me642581df698")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>{" "}
          </DropdownMenu>
        </div>
        <div className="workspace-tab-divider" aria-hidden="true" />
        <WorkspaceTabs
          activeId={active?.id || ""}
          tabs={tabs.map((t) => {
            const d = project.documents.find((d) => d.id === t.documentId);
            return {
              id: t.id,
              file: d?.name || t.documentId,
              dirty: !!d && pendingWrite(d),
              mode: t.mode === "graph" ? "graph" : "text",
              location: d
                ? tr("maf91f32f7ba8", [modes[t.mode], t.line])
                : project.name,
              pinned: t.pinned,
            };
          })}
          onActivate={activate}
          onClose={(id) => void closeTabs([id])}
          onAdd={() => {
            showFiles(true);
          }}
          onMenu={(id, e) => {
            showMenu(e, tabMenu(id));
            void window.yarnDesktop?.windows
              .list()
              .then((windows) =>
                setMenu((current) =>
                  current
                    ? { ...current, actions: tabMenu(id, windows) }
                    : null,
                ),
              );
          }}
          onReorder={reorder}
          onDragStart={(id) => {
            dragCancelled.current = false;
            const tab = tabs.find((t) => t.id === id);
            if (tab) void window.yarnDesktop?.windows.drag(tab, project.id);
          }}
          onDragEnd={(e) =>
            void window.yarnDesktop?.windows
              .endDrag(
                { x: e.screenX, y: e.screenY },
                dragCancelled.current || (e.screenX === 0 && e.screenY === 0),
              )
              .catch((error) => notify(String(error)))
          }
          onExternalDrop={(index) =>
            void window.yarnDesktop?.windows
              .drop(index)
              .catch((e) => notify(String(e)))
          }
        />
      </header>
      {(client.error || snapshot.notices.length > 0) && (
        <div className="workspace-notice" role="alert">
          <AlertTriangle size={14} />
          <span>{client.error || snapshot.notices.join(" ")}</span>
          <button
            onClick={() => {
              const raw = Object.fromEntries(
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("yarn-workbench"))
                  .map((k) => [k, localStorage.getItem(k)]),
              );
              const blob = new Blob([JSON.stringify(raw, null, 2)], {
                  type: "application/json",
                }),
                url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = "yarn-recovery.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {tr("md4ac3777de8f")}
          </button>
        </div>
      )}
      <div className="document-toolbar" ref={setHistoryToolbar}>
        {!historySelection && (
          <>
            <div className="document-heading">
              <ChromeButton
                title={tr("m6366c7c54bb5")}
                aria-label={tr("m572cf45ba436")}
                disabled={!navigationAvailable.back}
                onClick={() => history(true)}
              >
                <ArrowLeft size={15} />
              </ChromeButton>
              <ChromeButton
                title={tr("m4c9b86bdf289")}
                aria-label={tr("m9b49a6e0393e")}
                disabled={!navigationAvailable.forward}
                onClick={() => history(false)}
              >
                <ArrowRight size={15} />
              </ChromeButton>
              <span title={doc?.path || doc?.name}>
                {doc?.name ||
                  utilityNames[active?.documentId || ""] ||
                  tr("m1c5ab76e581d")}
              </span>
              {doc && ["error", "conflict", "missing"].includes(doc.status) && (
                <span
                  className={"save-status " + doc.status}
                  role="status"
                  title={
                    saveLabels[doc.status] +
                    (doc.path ? " · " + doc.path : tr("mb09d56aec273"))
                  }
                >
                  <AlertTriangle size={13} />
                  <span>{saveLabels[doc.status]}</span>
                </span>
              )}
            </div>
            <div className="document-actions">
              {doc && (
                <>
                  <SegmentedControl
                    label={tr("mc25be7b46423")}
                    value={mode}
                    onChange={(value) => {
                      tabPatch({ dialogueOnly: false });
                      modeChange(value as TabView["mode"]);
                    }}
                    options={[
                      {
                        value: "source",
                        label: modes.source,
                        icon: <PenLine size={15} />,
                      },
                      {
                        value: "rendered",
                        label: modes.rendered,
                        icon: <BookOpen size={15} />,
                      },
                      {
                        value: "graph",
                        label: modes.graph,
                        icon: <Network size={15} />,
                      },
                    ]}
                  />
                  <div className="document-icon-tools">
                    <ChromeButton
                      title={tr("m9c633473d49a")}
                      aria-label={tr("mf40b96ff73c0")}
                      aria-pressed={!!active.dialogueOnly}
                      onClick={() => {
                        capture();
                        tabPatch({ dialogueOnly: !active.dialogueOnly });
                      }}
                    >
                      <BookText size={16} />
                    </ChromeButton>
                    <ChromeButton
                      title={tr("m4c3cec274391")}
                      aria-pressed={historyOpen}
                      onClick={() => {
                        capture();
                        setSideFocus("right");
                        setHistorySelection(null);
                        setStatisticsOpen(false);
                        setHistoryOpen(!historyOpen);
                      }}
                    >
                      <Clock3 size={16} />
                    </ChromeButton>
                    <ChromeButton
                      title={tr("m9c44f8a4637d")}
                      aria-pressed={showOutline}
                      onClick={() => {
                        setHistoryOpen(false);
                        setStatisticsOpen(false);
                        setSideFocus("right");
                        setHistorySelection(null);
                        setSession((s) => ({
                          ...s,
                          outline: { ...s.outline, [mode]: !showOutline },
                        }));
                      }}
                    >
                      <ListTree size={16} />
                    </ChromeButton>
                    <ChromeButton
                      title={
                        tr("m628f065501a2") +
                        errorCount +
                        tr("m3399917a26f3") +
                        warningCount +
                        tr("ma8b7a4480407")
                      }
                      aria-label={tr("mcf85ad10cef3")}
                      aria-pressed={problems}
                      className="check-button"
                      onClick={() => {
                        requestDiagnostics();
                        setProblems((v) => !v);
                      }}
                    >
                      {errorCount > 0 && (
                        <span className="diagnostic-count error">
                          <CircleAlert size={16} />
                          <b>{errorCount}</b>
                        </span>
                      )}
                      {warningCount > 0 && (
                        <span className="diagnostic-count warning">
                          <AlertTriangle size={16} />
                          <b>{warningCount}</b>
                        </span>
                      )}
                      {!errorCount && !warningCount && <Check size={16} />}
                    </ChromeButton>
                    <ChromeButton
                      title={tr("me3ca8ea79b91")}
                      aria-label={tr("me3ca8ea79b91")}
                      aria-pressed={statisticsOpen}
                      onClick={() => {
                        setStatisticsOpen(!statisticsOpen);
                        setHistoryOpen(false);
                        setHistorySelection(null);
                        setSideFocus("right");
                      }}
                    >
                      <BarChart3 size={16} />
                    </ChromeButton>
                    {!doc.path && (
                      <button
                        className="draft-save"
                        onClick={() =>
                          void perform({
                            type: window.yarnDesktop ? "saveAs" : "export",
                            projectId: project.id,
                            documentId: doc.id,
                          })
                        }
                      >
                        <FilePlus2 size={15} />
                        <span>{tr("mf0ce89ab17f9")}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
              <ChromeButton
                title={tr("mf8ff4ec5e324")}
                aria-label={tr("m3b406d1c3710")}
                aria-pressed={searchOpen}
                onClick={showSearch}
              >
                <Search size={16} />
              </ChromeButton>
            </div>
          </>
        )}
      </div>
      <div
        className={
          "workspace-body " +
          (sideFocus === "left" ? "left-priority " : "") +
          (utility ? "utility-surface" : "") +
          ((showOutline || historyOpen || statisticsOpen) && !utility
            ? " has-document-side"
            : "")
        }
      >
        {session.left &&
          !standalone &&
          (!utility || inlineDraft?.kind.endsWith("document")) && (
            <aside
              className="workspace-sidebar"
              style={{ width: session.sidebarWidth }}
            >
              <div className="section-heading">
                <span>{tr("m627b75e6aced")}</span>
                <div>
                  <ChromeButton
                    title={
                      fileSort === "name-asc"
                        ? tr("m06be05a30639")
                        : fileSort === "name-desc"
                          ? tr("ma8c46cf0616f")
                          : tr("m6ea8a7b7ac40")
                    }
                    aria-label={
                      fileSort === "name-asc"
                        ? tr("m5e3ccf27d155")
                        : fileSort === "name-desc"
                          ? tr("mabcbf8218926")
                          : tr("m1f50bd5ddbca")
                    }
                    onClick={() =>
                      setFileSort(
                        fileSort === "name-asc" ? "name-desc" : "name-asc",
                      )
                    }
                    onContextMenu={(e) =>
                      showMenu(e, [
                        {
                          label: tr("m1f50bd5ddbca"),
                          run: () => setFileSort("manual"),
                        },
                        {
                          label: tr("m5e3ccf27d155"),
                          run: () => setFileSort("name-asc"),
                        },
                        {
                          label: tr("mabcbf8218926"),
                          run: () => setFileSort("name-desc"),
                        },
                      ])
                    }
                    onKeyDown={(e) =>
                      menuKeys(e, [
                        {
                          label: tr("m1f50bd5ddbca"),
                          run: () => setFileSort("manual"),
                        },
                        {
                          label: tr("m5e3ccf27d155"),
                          run: () => setFileSort("name-asc"),
                        },
                        {
                          label: tr("mabcbf8218926"),
                          run: () => setFileSort("name-desc"),
                        },
                      ])
                    }
                  >
                    {fileSort === "name-desc" ? (
                      <ArrowUpZA size={15} />
                    ) : fileSort === "name-asc" ? (
                      <ArrowDownAZ size={15} />
                    ) : (
                      <ListOrdered size={15} />
                    )}
                  </ChromeButton>
                  <ChromeButton
                    title={tr("m67b8c733279b")}
                    onClick={() => newFolder()}
                  >
                    <FolderPlus size={15} />
                  </ChromeButton>
                  <ChromeButton
                    title={tr("m47fcdf3ee211")}
                    aria-label={tr("m47fcdf3ee211")}
                    onClick={() => newDocument()}
                  >
                    <Plus size={15} />
                  </ChromeButton>
                </div>
              </div>
              <div className="workspace-files">
                <FileTree
                  key={project.id}
                  project={project}
                  sort={fileSort}
                  documentId={doc?.id}
                  folder={activeFolder}
                  onFolder={setActiveFolder}
                  draft={inlineDraft}
                  inline={inlineName}
                  onOpen={(d, newTab) => {
                    setActiveFolder(folderOf(d.name));
                    openDocument(d.id, newTab);
                  }}
                  onRenameFile={renameDocumentInline}
                  onRenameFolder={renameFolderInline}
                  onFileMenu={(e, d) => showMenu(e, fileMenu(d))}
                  onFolderMenu={(e, path) => showMenu(e, folderMenu(path))}
                  onMove={async (entry, parent, before) => {
                    const r = await perform({
                      type: "moveEntry",
                      projectId: project.id,
                      entry,
                      parent,
                      before,
                    });
                    if (r) {
                      setFileSort("manual");
                      setActiveFolder(parent);
                    }
                  }}
                />
                {!project.documents.length && (
                  <p className="empty-small">
                    {tr("m38e52dafbea7")}
                    <button onClick={() => newDocument()}>
                      {tr("m28238f630328")}
                    </button>
                  </p>
                )}
              </div>
              <PanelResizeHandle
                side="left"
                value={session.sidebarWidth}
                min={180}
                max={420}
                label={tr("ma1f0112c8a95")}
                onResize={(sidebarWidth) =>
                  setSession((s) => ({ ...s, sidebarWidth }))
                }
              />
            </aside>
          )}
        <section className="workspace-center">
          {doc && ["conflict", "missing", "error"].includes(doc.status) && (
            <div className="workspace-notice" role="alert">
              <AlertTriangle size={15} />
              <span>{doc.error || saveLabels[doc.status]}</span>
              <button onClick={() => setConflict(doc)}>
                {tr("mcece58780d3c")}
              </button>
            </div>
          )}
          {tabs.some((tab) => tab.documentId === "@commands") && (
            <div
              className="retained-utility"
              hidden={active?.documentId !== "@commands"}
            >
              <CommandManager
                key={project.id}
                revealName={commandTarget?.name}
                revealNonce={commandTarget?.nonce}
                commands={project.commands}
                notify={notify}
                onDirtyChange={setCommandDirty}
                actionsRef={commandActions}
                referenceCount={(name) =>
                  analysis.nodes.reduce(
                    (sum, n) =>
                      sum + n.calls.filter((c) => c.name === name).length,
                    0,
                  )
                }
                onChange={async (commands, expectedCommands) =>
                  !!(await perform({
                    type: "commands",
                    projectId: project.id,
                    commands,
                    expectedCommands,
                  }))
                }
              />
            </div>
          )}
          {tabs.some((tab) => tab.documentId === "@settings") && (
            <div
              className="retained-utility"
              hidden={active?.documentId !== "@settings"}
            >
              <SettingsView
                navigation={settingsNavigation}
                rescue={<RescueSettings client={client} />}
                initialSection={settingsSection}
                focusOnMount={false}
                appPreferences={snapshot.preferences}
                onAppearance={(patch) =>
                  void perform({ type: "appearance", patch })
                }
                onAppPreferences={
                  true
                    ? (value) =>
                        void perform({
                          type: "preferences",
                          ...value,
                        })
                    : undefined
                }
                preferences={session}
                onChange={(next) => setSession((s) => ({ ...s, ...next }))}
                onResetLayout={() =>
                  setSession((s) => ({
                    ...s,
                    left: true,
                    sidebarWidth: 220,
                    rightPanelWidth: 260,
                    problemsHeight: 140,
                    outline: {},
                  }))
                }
                onOpenData={
                  window.yarnDesktop
                    ? () =>
                        void window.yarnDesktop
                          ?.openLogs()
                          .catch((e) => notify(String(e)))
                    : undefined
                }
                version={window.yarnDesktop?.version || "Web"}
              />
            </div>
          )}
          {active?.documentId === "@new-document" ? (
            <div className="settings-content">
              <h2>{tr("m47fcdf3ee211")}</h2>
              <p>{inlineDraft?.folder || tr("mad3639a602e1")}</p>
              <p>{tr("mddde16c6ddf6")}</p>
            </div>
          ) : active?.documentId === "@commands" ||
            active?.documentId === "@settings" ? null : active?.documentId ===
            "@recovery" ? (
            <RecoveryView
              key={project.id}
              project={project}
              state={session.recovery}
              onChange={(recovery) => setSession((s) => ({ ...s, recovery }))}
              onPurge={async (recoveryId) =>
                !!(await perform({
                  type: "purgeTrash",
                  projectId: project.id,
                  recoveryId,
                }))
              }
              onRestore={async (entry, expectedVersion, expectedText) =>
                !!(await perform({
                  type: "recover",
                  projectId: project.id,
                  recoveryId: entry.id,
                  expectedVersion,
                  expectedText,
                }))
              }
            />
          ) : doc ? (
            <div
              className="editor-pane"
              style={historySelection ? { display: "none" } : undefined}
              inert={!!historySelection}
            >
              {active.dialogueOnly && (
                <DialogueReader
                  text={doc.text}
                  name={doc.name}
                  line={active.line}
                  goTo={goto}
                />
              )}
              {!active.dialogueOnly && mode === "source" && (
                <div
                  className="editor-surface"
                  onCompositionStart={() =>
                    void perform({
                      type: "composition",
                      projectId: project.id,
                      documentId: doc.id,
                      active: true,
                    })
                  }
                  onCompositionEnd={() =>
                    void perform({
                      type: "composition",
                      projectId: project.id,
                      documentId: doc.id,
                      active: false,
                    })
                  }
                >
                  <CodeEditor
                    onRegisterCommand={registerCommand}
                    persistedView={active.sourceView}
                    onView={(sourceView) => tabPatch({ sourceView })}
                    onNavigate={go}
                    key={project.id}
                    doc={doc}
                    commands={project.commands}
                    variables={variables}
                    nodes={analysis.nodes}
                    issues={diagnostics.visible}
                    onChange={(value, event) => {
                      const source = client
                        .getSnapshot()
                        .projects.find((p) => p.id === project.id)!
                        .documents.find((d) => d.id === doc.id)!.text;
                      client.edit(
                        project.id,
                        doc.id,
                        event.isEolChange
                          ? difference(source, value)
                          : monacoSourceEdits(source, event.changes),
                        false,
                      );
                    }}
                    onCursor={(p: Position) =>
                      tabPatch({
                        line: p.lineNumber,
                        column: p.column,
                        selection: undefined,
                      })
                    }
                    editorRef={editorRef}
                    monacoRef={monacoRef}
                    modelEpoch={
                      snapshot.projects.findIndex((p) => p.id === project.id) +
                      1
                    }
                    viewKey={active.id + ":" + doc.id}
                    viewStates={editorViews}
                    goTo={goto}
                    onUndo={(redo) =>
                      void perform({
                        type: redo ? "redo" : "undo",
                        projectId: project.id,
                        documentId: doc.id,
                      })
                    }
                  />
                </div>
              )}
              {!active.dialogueOnly && mode === "rendered" && (
                <ReadingEditor
                  onVariableNavigate={go}
                  issues={diagnostics.visible}
                  onRegisterCommand={registerCommand}
                  goTo={goto}
                  scenes={analysis.nodes}
                  canNavigate={(name) =>
                    analysis.nodes.filter((node) => node.name === name)
                      .length === 1
                  }
                  onNavigate={(name) => {
                    const node = analysis.nodes.find((n) => n.name === name);
                    if (node) {
                      const target = project.documents.find(
                        (d) => d.name === node.file,
                      );
                      if (target)
                        openDocument(
                          target.id,
                          false,
                          node.body,
                          1,
                          true,
                          "rendered",
                        );
                    } else notify(tr("me4b39c373b97") + name);
                  }}
                  key={active.id + doc.id}
                  doc={doc}
                  commands={project.commands}
                  variables={variables}
                  line={active.line}
                  column={active.column}
                  scrollTop={active.scrollTop}
                  selection={active.selection}
                  folded={active.folded}
                  onFoldedChange={(folded) => tabPatch({ folded })}
                  onSelection={(selection) => tabPatch({ selection })}
                  onEdit={(edits) => client.edit(project.id, doc.id, edits)}
                  onUndo={(redo) =>
                    void perform({
                      type: redo ? "redo" : "undo",
                      projectId: project.id,
                      documentId: doc.id,
                    })
                  }
                  onComposition={(value) =>
                    void perform({
                      type: "composition",
                      projectId: project.id,
                      documentId: doc.id,
                      active: value,
                    })
                  }
                  onCursor={(line, column, scrollTop) =>
                    tabPatch({ line, column, scrollTop })
                  }
                  actionsRef={readingActions}
                />
              )}
              {!active.dialogueOnly && mode === "graph" && (
                <Graph
                  onRegisterCommand={registerCommand}
                  key={active.id + ":" + doc.id}
                  file={doc.name}
                  documents={project.documents}
                  commands={project.commands}
                  onDocumentEdit={(documentId, edits, expectedText) => {
                    const current = client
                      .getSnapshot()
                      .projects.find((p) => p.id === project.id)
                      ?.documents.find((d) => d.id === documentId);
                    if (!current || current.text !== expectedText) return false;
                    client.edit(project.id, documentId, edits, false);
                    return true;
                  }}
                  onDocumentUndo={(documentId, redo) =>
                    void perform({
                      type: redo ? "redo" : "undo",
                      projectId: project.id,
                      documentId,
                    })
                  }
                  onDocumentSave={(documentId) =>
                    void perform({
                      type: "save",
                      projectId: project.id,
                      documentId,
                    })
                  }
                  onDocumentComposition={(documentId, active) =>
                    void perform({
                      type: "composition",
                      projectId: project.id,
                      documentId,
                      active,
                    })
                  }
                  onRenameScene={async (node, name, expectedText) => {
                    const current = client
                      .getSnapshot()
                      .projects.find((p) => p.id === project.id)
                      ?.documents.find((d) => d.name === node.file);
                    if (!current || current.text !== expectedText) {
                      notify(tr("me8153c416722"));
                      return false;
                    }
                    return !!(await perform({
                      type: "renameScene",
                      projectId: project.id,
                      documentId: current.id,
                      version: current.version,
                      fromName: node.name,
                      name,
                    }));
                  }}
                  allNodes={analysis.nodes}
                  links={analysis.links}
                  issues={diagnostics.published}
                  editorIssues={diagnostics.visible}
                  selected={selected}
                  onSelect={(n) => setSelected(n?.id || "")}
                  onOpen={(n) => go(n.file, n.body)}
                  onGoTo={go}
                  onCreate={newScene}
                  focus={focus}
                  graphState={active.graph}
                  onGraphState={(graph) => tabPatch({ graph })}
                  onNodeMenu={(node, event) => showMenu(event, sceneMenu(node))}
                />
              )}
            </div>
          ) : (
            <div className="empty-editor">
              <BookText size={36} />
              <h2>
                {project.documents.length
                  ? tr("m20c81a3a79e0")
                  : tr("m9acaf2907b3c")}
              </h2>
              <p>
                {project.documents.length
                  ? tr("m2d6200bec9c3")
                  : tr("me93802c2c235")}
              </p>
              <div className="empty-actions">
                <button className="primary" onClick={() => newDocument()}>
                  {tr("m47fcdf3ee211")}
                </button>
                <button
                  onClick={() => {
                    showFiles();
                  }}
                >
                  {tr("m2048d78f9db8")}
                </button>
                {window.yarnDesktop && (
                  <button
                    onClick={() =>
                      void perform({ type: "openFolder" }).then(adopt)
                    }
                  >
                    {tr("m9ea1db41d4bb")}
                  </button>
                )}
              </div>
            </div>
          )}
          {doc && historySelection && (
            <HistoryPreview
              key={historySelection.entry.id}
              compareMode={historyCompare}
              onCompare={setHistoryCompare}
              toolbarTarget={historyToolbar}
              line={active.line}
              entry={historySelection.entry}
              currentText={historySelection.text}
              stale={
                doc.version !== historySelection.version ||
                doc.text !== historySelection.text
              }
              onReturn={() => {
                setHistorySelection(null);
                requestAnimationFrame(() => {
                  if (mode === "source") editorRef.current?.focus();
                  else
                    document
                      .querySelector<HTMLElement>(
                        mode === "rendered" ? ".cm-content" : ".story-canvas",
                      )
                      ?.focus();
                });
              }}
              onRestore={() =>
                void restoreEntry(
                  historySelection.entry,
                  historySelection.version,
                  historySelection.text,
                )
              }
            />
          )}
          {problems && !utility && !historySelection && (
            <ProblemsPanel
              issues={currentIssues}
              scope={issueScope}
              onScope={setIssueScope}
              severity={issueSeverity}
              onSeverity={setIssueSeverity}
              height={session.problemsHeight ?? 140}
              onHeight={(problemsHeight) =>
                setSession((s) => ({ ...s, problemsHeight }))
              }
              onClose={() => setProblems(false)}
              onNavigate={(issue) => go(issue.file, issue.line, issue.column)}
            />
          )}
        </section>
        {showOutline && !utility && (
          <aside
            className="document-side workspace-scenes"
            aria-label={tr("m9c44f8a4637d")}
            style={{
              width: session.rightPanelWidth ?? 260,
              flexBasis: session.rightPanelWidth ?? 260,
            }}
          >
            <PanelResizeHandle
              side="right"
              value={session.rightPanelWidth ?? 260}
              min={220}
              max={420}
              label={tr("mc0a9957d0f32")}
              onResize={(rightPanelWidth) =>
                setSession((s) => ({ ...s, rightPanelWidth }))
              }
            />
            <div className="section-heading">
              <strong>
                {tr("mcb88dc73b257")}
                <small>{nodes.length}</small>
              </strong>
              <div>
                <ChromeButton
                  title={tr("m0478321878a2")}
                  aria-label={tr("m0478321878a2")}
                  disabled={!doc}
                  onClick={newScene}
                >
                  <Plus size={15} />
                </ChromeButton>
              </div>
            </div>
            <div className="node-search">
              <Search size={13} />
              <input
                aria-label={tr("m3cf6f8a53f47")}
                placeholder={tr("m1caeda23f27a")}
                value={sceneQuery}
                onChange={(e) => setSceneQuery(e.target.value)}
              />
            </div>
            <div className="node-scroll">
              {nodes
                .filter((n) =>
                  (
                    n.name +
                    " " +
                    n.headers.tags +
                    " " +
                    (doc
                      ? doc.text.slice(
                          sceneRange(doc.text, n).from,
                          sceneRange(doc.text, n).to,
                        )
                      : n.summary)
                  )
                    .toLowerCase()
                    .includes(sceneQuery.toLowerCase()),
                )
                .map((n) =>
                  inlineDraft?.kind === "rename-scene" &&
                  inlineDraft.documentId === doc?.id &&
                  inlineDraft.sceneName === n.name ? (
                    <div key={n.id}>{inlineName()}</div>
                  ) : (
                    <button
                      key={n.id}
                      className={
                        "node-row " + (selected === n.id ? "active" : "")
                      }
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("application/x-yarn-scene", n.id)
                      }
                      onDragOver={(e) => {
                        if (
                          e.dataTransfer.types.includes(
                            "application/x-yarn-scene",
                          )
                        )
                          e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void moveScene(
                          e.dataTransfer.getData("application/x-yarn-scene"),
                          n,
                        );
                      }}
                      onClick={() => {
                        setSelected(n.id);
                        if (mode === "graph" && !active.dialogueOnly)
                          setFocus((f) => f + 1);
                        else if (doc)
                          openDocument(doc.id, false, n.body, 1, true, mode);
                      }}
                      onContextMenu={(e) => showMenu(e, sceneMenu(n))}
                      onKeyDown={(e) => {
                        if (e.key === "F2") {
                          e.preventDefault();
                          renameSceneInline(n);
                        } else menuKeys(e, sceneMenu(n));
                      }}
                    >
                      <FileText size={13} />
                      <span>{n.name}</span>
                    </button>
                  ),
                )}
              {inlineDraft?.kind === "new-scene" &&
                inlineDraft.documentId === doc?.id &&
                inlineName()}
            </div>
          </aside>
        )}
        {doc && statisticsOpen && !utility && (
          <StatisticsPanel
            doc={doc}
            width={session.rightPanelWidth ?? 260}
            onWidth={(rightPanelWidth) =>
              setSession((s) => ({ ...s, rightPanelWidth }))
            }
            onNavigate={(line) => {
              openDocument(doc.id, false, line, 1, true, mode);
              if (mode === "graph" && !active.dialogueOnly) {
                const node = nodes.find((n) => n.start === line);
                setSelected(node?.id || "");
                setFocus((f) => f + 1);
              }
              setStatisticsOpen(true);
              setSideFocus("right");
            }}
          />
        )}
        {doc && historyOpen && !utility && (
          <HistoryList
            width={session.rightPanelWidth ?? 260}
            onWidth={(rightPanelWidth) =>
              setSession((s) => ({ ...s, rightPanelWidth }))
            }
            entries={project.recovery.filter(
              (entry) => entry.documentId === doc.id && !entry.deleted,
            )}
            selected={historySelection?.entry.id}
            onSelect={(entry) => {
              capture();
              setHistorySelection({
                entry,
                text: doc.text,
                version: doc.version,
              });
            }}
            onClose={() => {
              setHistoryOpen(false);
              setHistorySelection(null);
            }}
          />
        )}
      </div>
      <ActionMenu menu={menu} onClose={() => setMenu(null)} />
      <Dialog
        open={!!prompt}
        onOpenChange={(open) => {
          if (!open && !busy) setPrompt(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{prompt?.title || tr("med31fbb483ee")}</DialogTitle>
          <DialogDescription style={{ whiteSpace: "pre-line" }}>
            {prompt?.description || tr("meb65ff62ffbe")}
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setPromptError("");
              try {
                await prompt?.run(promptValue);
                setPrompt(null);
              } catch (error) {
                setPromptError(String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {prompt?.label && (
              <label>
                {prompt.label}
                <input
                  autoFocus
                  aria-label={prompt.label}
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  required
                />
              </label>
            )}
            {promptError && (
              <p className="error" role="alert">
                {promptError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => setPrompt(null)}
                disabled={busy}
              >
                {tr("m2cd0f3be8738")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className={prompt?.danger ? "destructive" : "primary"}
              >
                {busy
                  ? tr("md166e71ff3ae")
                  : prompt?.submitLabel || tr("m20db9f87b860")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {searchOpen && (
        <SearchOverlay
          documents={project.documents}
          query={searchQuery}
          onQuery={setSearchQuery}
          scope={searchScope}
          onScope={setSearchScope}
          newTab={quickNewTab}
          onNavigate={navigateHit}
          onClose={() => setSearchOpen(false)}
          commands={project.commands}
          settings={settingEntries}
          recent={session.recentDocuments}
          onChoose={(hit) => {
            if (hit.kind === "setting") {
              openSettings(hit.section as SettingsSection);
              setSettingsNavigation({
                section: hit.section as SettingsSection,
                field: hit.field,
                nonce: Date.now(),
              });
            }
            if (hit.kind === "utility") openCommands();
            if (hit.kind === "command") {
              openCommands();
              setCommandTarget({ name: hit.name, nonce: Date.now() });
            }
          }}
          onCreate={standalone ? undefined : createFromSearch}
        />
      )}
      <Dialog
        open={!!conflict}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <DialogContent className="conflict-dialog">
          <DialogTitle>
            {tr("mcece58780d3c")} {conflict?.name}
          </DialogTitle>
          <DialogDescription>
            {conflict?.error}
            {tr("mc97238f67983")}
          </DialogDescription>
          <div className="conflict-columns">
            <label>
              {tr("mc2f0001e7e2e")}
              <textarea readOnly value={conflict?.text || ""} />
            </label>
            <label>
              {tr("ma58034b77334")}
              <textarea
                readOnly
                value={conflict?.externalText ?? tr("mf225be1f7f06")}
              />
            </label>
          </div>
          <div className="dialog-actions">
            <button
              onClick={() => {
                if (conflict)
                  void perform({
                    type: "saveAs",
                    projectId: project.id,
                    documentId: conflict.id,
                  }).then((r) => {
                    if (r && !r.cancelled) setConflict(null);
                  });
              }}
            >
              {tr("m2754144d1c1d")}
            </button>
            {conflict?.externalText !== undefined && (
              <>
                <button
                  onClick={() =>
                    void perform({
                      type: "resolve",
                      projectId: project.id,
                      documentId: conflict.id,
                      choice: "disk",
                    }).then((r) => {
                      if (r) setConflict(null);
                    })
                  }
                >
                  {tr("mfcfd41034f23")}
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    void perform({
                      type: "resolve",
                      projectId: project.id,
                      documentId: conflict.id,
                      choice: "local",
                    }).then((r) => {
                      if (r) setConflict(null);
                    })
                  }
                >
                  {tr("m8f0008e2e546")}
                </button>
              </>
            )}
            {conflict?.status === "error" && (
              <button
                onClick={() =>
                  void perform({
                    type: "save",
                    projectId: project.id,
                    documentId: conflict.id,
                  })
                }
              >
                {tr("m7a824d822e96")}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!leaveFailure}
        onOpenChange={(open) => {
          if (!open) setLeaveFailure(null);
        }}
      >
        <DialogContent className="workbench-dialog">
          <DialogTitle>{tr("mc1f4025e9e8c")}</DialogTitle>
          <DialogDescription>{leaveFailure?.message}</DialogDescription>
          <div className="dialog-actions">
            <button onClick={() => setLeaveFailure(null)}>
              {tr("m9f2b484bc113")}
            </button>
            <button
              onClick={() => {
                const action = leaveFailure!.action;
                setLeaveFailure(null);
                void leaveWorkspace(action);
              }}
            >
              {tr("m7a824d822e96")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {closing && (
        <div
          className="close-save-overlay"
          tabIndex={-1}
          ref={(element) => element?.focus()}
          onKeyDownCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {closeSaving && (
            <div className="close-save-panel" role="status" aria-live="polite">
              <LoaderCircle size={20} className="save-spinner" />
              <span>{tr("m6bdb4435095e")}</span>
            </div>
          )}
        </div>
      )}
      {toast && !prompt && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label={tr("m641c2d091bbc")} onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}

export default function Workbench(
  props: Parameters<typeof WorkbenchContent>[0],
) {
  const snapshot = useSyncExternalStore(
    props.client.subscribe,
    props.client.getSnapshot,
    props.client.getSnapshot,
  );
  return (
    <AppearanceProvider value={snapshot.preferences?.editorAppearance}>
      <WorkbenchContent {...props} />
    </AppearanceProvider>
  );
}
