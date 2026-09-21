import {
  migrateAppearance,
  normalizeAppearance,
  patchAppearance,
} from "../appearance/model";
import { findCommand } from "../command-catalog";
import {
  addFolder,
  applyTreeMove,
  planTreeMove,
  projectFolders,
  withinFolder,
} from "./file-tree";
import { appendedScene, renamedSceneByName } from "./authoring";
import {
  EditorState,
  ChangeSet,
  Text,
  type Transaction,
} from "@codemirror/state";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
} from "@codemirror/collab";
import {
  DocumentEngine,
  sourceEdits,
  validateCommands,
  validateProject,
} from "./engine";
import {
  readLegacy,
  readWorkspace,
  restoreSession,
  storageKeys,
} from "./storage";
import {
  type WorkspaceAction,
  type WorkspaceSnapshot,
  type ActionResult,
  type TextEdit,
  type WindowSession,
  makeProject,
  defaultSession,
  uuid,
} from "./types";

class BrowserService {
  preferences: import("./types").AppPreferences = { reopenLastProject: false };
  engine: DocumentEngine;
  notices: string[] = [];
  constructor() {
    try {
      const raw = JSON.parse(
        localStorage.getItem("spindle.preferences.v1") || "null",
      );
      this.preferences = {
        reopenLastProject: raw?.reopenLastProject === true,
        editorAppearance: raw?.editorAppearance
          ? normalizeAppearance(raw.editorAppearance)
          : migrateAppearance(
              JSON.parse(
                localStorage.getItem("yarn-workbench.session.v2") || "null",
              ) || undefined,
            ),
      };
      localStorage.setItem(
        "spindle.preferences.v1",
        JSON.stringify(this.preferences),
      );
    } catch (error) {
      this.notices.push("風格設定無法讀取：" + String(error));
    }
    const restored = readWorkspace(localStorage);
    if (restored.error) this.notices.push(restored.error);
    this.engine = new DocumentEngine(restored.value || []);
  }
  snapshot(): WorkspaceSnapshot {
    try {
      const raw = JSON.parse(
        localStorage.getItem("spindle.preferences.v1") || "null",
      );
      if (raw)
        this.preferences = {
          ...this.preferences,
          editorAppearance: normalizeAppearance(raw.editorAppearance),
        };
    } catch (error) {
      const message = "風格設定無法讀取：" + String(error);
      if (!this.notices.includes(message)) this.notices.push(message);
    }
    return structuredClone({
      preferences: this.preferences,
      projects: this.engine.projects,
      currentProjectId: this.engine.projects[0]?.id || "",
      notices: this.notices,
    });
  }
  async request(a: WorkspaceAction): Promise<ActionResult> {
    let projectId: string | undefined, documentId: string | undefined;
    if (a.type === "updates")
      return {
        snapshot: this.snapshot(),
        updates: this.engine.updates(a.projectId, a.documentId, a.version),
      };
    if (a.type === "snapshot") return { snapshot: this.snapshot() };
    if (a.type === "bootstrap") {
      if (!this.engine.projects.length) {
        const p = makeProject(
          this.notices.length ? "復原工作區" : a.legacy?.name || "未命名專案",
          this.notices.length ? [] : a.legacy?.documents || [],
          this.notices.length ? [] : a.legacy?.commands || [],
        );
        this.engine.projects.push(p);
      }
    } else if (a.type === "appearance") {
      this.snapshot();
      const next = {
        ...this.preferences,
        editorAppearance: patchAppearance(
          this.preferences.editorAppearance,
          a.patch,
        ),
      };
      localStorage.setItem("spindle.preferences.v1", JSON.stringify(next));
      this.preferences = next;
    } else if (a.type === "createProject") {
      const p = makeProject(a.name);
      this.engine.projects.push(p);
      projectId = p.id;
    } else if (a.type === "import") {
      const p = validateProject(a.project);
      p.id = uuid();
      for (const d of p.documents) {
        d.id = uuid();
        d.status = "draft";
        delete d.path;
        delete d.diskHash;
      }
      delete p.root;
      this.engine.projects.push(p);
      projectId = p.id;
    } else if ("projectId" in a) {
      const p = this.engine.project(a.projectId);
      if (a.type === "edit")
        this.engine.edit(p.id, a.documentId, a.version, a.updates);
      else if (a.type === "undo" || a.type === "redo")
        this.engine.undo(p.id, a.documentId, a.type === "redo");
      else if (a.type === "transaction")
        this.engine.transaction(p.id, a.label, a.documents);
      else if (a.type === "createScene" || a.type === "renameScene") {
        const documents =
          a.type === "createScene"
            ? appendedScene(p, a.documentId, a.version, a.name)
            : renamedSceneByName(p, a.documentId, a.version, a.fromName, a.name)
                .documents;
        this.engine.transaction(
          p.id,
          a.type === "createScene" ? "新增場景" : "更名場景",
          documents,
        );
        documentId = a.documentId;
      } else if (a.type === "createDocument")
        documentId = this.engine.create(
          p.id,
          a.name,
          a.text,
          a.firstInOrder,
        ).id;
      else if (a.type === "createFolder") addFolder(p, a.name);
      else if (a.type === "moveEntry")
        applyTreeMove(p, planTreeMove(p, a.entry, a.parent, a.name, a.before));
      else if (a.type === "trashFolder") {
        const children = p.documents.filter((d) =>
          withinFolder(d.name, a.name),
        );
        for (const d of children)
          this.engine.checkpoint(p.id, d.id, "刪除資料夾", true);
        p.documents = p.documents.filter((d) => !children.includes(d));
        p.folders = projectFolders(p).filter(
          (f) => f !== a.name && !withinFolder(f, a.name),
        );
      } else if (a.type === "renameProject") p.name = a.name;
      else if (a.type === "renameDocument") {
        const d = this.engine.document(p.id, a.documentId);
        if (d.name === a.name)
          return { snapshot: this.snapshot(), projectId, documentId: d.id };
        const temporary = this.engine.create(p.id, a.name, d.text);
        p.documents = p.documents.filter((x) => x.id !== temporary.id);
        d.name = a.name;
      } else if (a.type === "commands" || a.type === "registerCommand") {
        if (a.type === "commands" && a.expectedCommands !== undefined && a.expectedCommands !== JSON.stringify(p.commands)) throw Error("指令定義已變更，請重新載入後套用；草稿已保留。");
        if (
          a.type === "registerCommand" &&
          findCommand(a.command.name, p.commands)
        )
          return { snapshot: this.snapshot() };
        const commands =
          a.type === "registerCommand"
            ? [...p.commands, a.command]
            : a.commands;
        validateCommands(commands);
        p.recovery.push({
          id: uuid(),
          documentId: "@commands",
          name: "指令定義",
          text: JSON.stringify(p.commands),
          at: Date.now(),
          reason: "修改指令前",
        });
        p.commands = commands;
      } else if (a.type === "save") {
        for (const d of p.documents.filter(
          (d) => !a.documentId || d.id === a.documentId,
        )) {
          d.saved = d.text;
          d.status = "draft";
        }
      } else if (a.type === "composition")
        this.engine.document(p.id, a.documentId).composing = a.active;
      else if (a.type === "removeDocument") {
        this.engine.checkpoint(p.id, a.documentId, "移到垃圾桶", true);
        p.documents = p.documents.filter((d) => d.id !== a.documentId);
      } else if (a.type === "purgeTrash") {
        p.recovery = p.recovery.filter(
          (e) =>
            !e.deleted || (a.recoveryId !== undefined && e.id !== a.recoveryId),
        );
      } else if (a.type === "recover") {
        const e = p.recovery.find((e) => e.id === a.recoveryId);
        if (!e) throw Error("找不到快照");
        if (e.documentId === "@commands") {
          if (
            a.expectedText !== undefined &&
            JSON.stringify(p.commands) !== a.expectedText
          )
            throw Error("指令已變更，請重新比較後再還原");
          const previous = p.commands,
            next = JSON.parse(e.text);
          validateCommands(next);
          p.commands = next;
          p.recovery.push({
            id: uuid(),
            documentId: "@commands",
            name: "指令定義",
            text: JSON.stringify(previous),
            at: Date.now(),
            reason: "恢復指令前",
          });
          documentId = "@commands";
        } else {
          const d = p.documents.find((d) => d.id === e.documentId);
          if (d) {
            if (
              (a.expectedVersion !== undefined &&
                d.version !== a.expectedVersion) ||
              (a.expectedText !== undefined && d.text !== a.expectedText)
            )
              throw Error("內容已變更，請重新比較後再還原");
            this.engine.checkpoint(p.id, d.id, "恢復前");
            this.engine.replace(p.id, d.id, e.text, "恢復");
            documentId = d.id;
          } else {
            let name = e.name,
              i = 2;
            while (p.documents.some((d) => d.name === name))
              name = e.name.replace(/\.yarn$/, `-${i++}.yarn`);
            documentId = this.engine.create(p.id, name, e.text).id;
          }
        }
        if (e?.deleted)
          p.recovery = p.recovery.filter((item) => item.id !== e.id);
      } else if (a.type === "sortDocuments")
        p.documents = a.documentIds.map((id) => this.engine.document(p.id, id));
      else if (a.type === "export") {
        const d = p.documents.find((d) => d.id === a.documentId);
        download(
          d?.name || p.name + ".yarn-workspace.json",
          d
            ? d.text
            : JSON.stringify(
                {
                  format: "yarn-workbench",
                  version: 2,
                  name: p.name,
                  files: p.documents.map((d) => ({
                    name: d.name,
                    text: d.text,
                  })),
                  commands: p.commands,
                  folders: p.folders,
                },
                null,
                2,
              ),
        );
      } else throw Error("此操作僅適用桌面版");
    } else throw Error("此操作僅適用桌面版");
    localStorage.setItem(
      storageKeys.workspace,
      JSON.stringify(this.engine.projects),
    );
    return { snapshot: this.snapshot(), projectId, documentId };
  }
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class WorkspaceClient {
  private adapter: { request: (a: WorkspaceAction) => Promise<ActionResult> };
  private states = new Map<string, EditorState>();
  private listeners = new Set<() => void>();
  private sourceListeners = new Set<
    (id: string, transaction: Transaction) => void
  >();
  subscribeSourceChanges = (
    listener: (id: string, transaction: Transaction) => void,
  ) => {
    this.sourceListeners.add(listener);
    return () => {
      this.sourceListeners.delete(listener);
    };
  };
  private applyState(id: string, transaction: Transaction) {
    this.states.set(id, transaction.state);
    if (transaction.docChanged)
      for (const listener of this.sourceListeners) listener(id, transaction);
  }
  private state: WorkspaceSnapshot = {
    projects: [],
    currentProjectId: "",
    notices: [],
  };
  private authority: WorkspaceSnapshot = this.state;
  private clientID = uuid();
  private syncing: Promise<void> = Promise.resolve();
  private pumping: Promise<void> | null = null;
  private unsubscribe?: () => void;
  private disposed = false;
  private composing = new Set<string>();
  error = "";
  windowId = window.yarnDesktop?.windowId || "browser";
  constructor() {
    if (window.yarnDesktop) this.adapter = window.yarnDesktop;
    else {
      const browser = new BrowserService();
      this.adapter = {
        request: async (action) =>
          action.type === "appearance" && navigator.locks
            ? navigator.locks.request("spindle-appearance", () =>
                browser.request(action),
              )
            : browser.request(action),
      };
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private emit() {
    this.state = {
      ...this.authority,
      projects: this.authority.projects.map((p) => ({
        ...p,
        documents: p.documents.map((d) => {
          const state = this.states.get(d.id);
          return state
            ? {
                ...d,
                text: state.doc.toString(),
                version: getSyncedVersion(state),
                status:
                  sendableUpdates(state).length &&
                  !["conflict", "missing"].includes(d.status)
                    ? "pending"
                    : d.status,
              }
            : d;
        }),
      })),
    };
    for (const listener of this.listeners) listener();
  }
  async initialize() {
    const legacy = readLegacy(localStorage);
    if (
      legacy.exists &&
      !localStorage.getItem("yarn-workbench.migration-backup.v1")
    )
      localStorage.setItem(
        "yarn-workbench.migration-backup.v1",
        JSON.stringify(
          Object.fromEntries(
            [
              storageKeys.documents,
              storageKeys.project,
              storageKeys.layout,
            ].map((key) => [key, localStorage.getItem(key)]),
          ),
        ),
      );
    const input = {
      name: legacy.config?.name || "復原工作區",
      documents: legacy.documents || [],
      commands: legacy.config?.commands || [],
    };
    const result = await this.adapter.request({
      type: "bootstrap",
      legacy: input,
    });
    await this.reconcile({
      ...result.snapshot,
      notices: [...result.snapshot.notices, ...legacy.errors],
    });
    if (window.yarnDesktop && !this.disposed)
      this.unsubscribe = window.yarnDesktop.subscribe(() => {
        void this.refresh().catch((e) => this.fail(e));
      });
    else if (!this.disposed) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === "spindle.preferences.v1")
          void this.refresh().catch((e) => this.fail(e));
      };
      window.addEventListener("storage", onStorage);
      this.unsubscribe = () => window.removeEventListener("storage", onStorage);
    }
  }
  private fail(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.emit();
  }
  private reconcile(snapshot: WorkspaceSnapshot) {
    const work = this.syncing.then(async () => {
      for (const p of snapshot.projects)
        for (const d of p.documents) {
          let state = this.states.get(d.id);
          if (!state) {
            state = EditorState.create({
              doc: Text.of(d.text.split("\n")),
              extensions: [
                EditorState.lineSeparator.of("\n"),
                collab({ clientID: this.clientID, startVersion: d.version }),
              ],
            });
            this.states.set(d.id, state);
          } else if (
            !this.composing.has(d.id) &&
            d.version > getSyncedVersion(state)
          ) {
            const { updates } = await this.adapter.request({
              type: "updates",
              projectId: p.id,
              documentId: d.id,
              version: getSyncedVersion(state),
            });
            state = this.states.get(d.id)!;
            if (!this.composing.has(d.id) && updates?.length)
              this.applyState(
                d.id,
                state.update(
                  receiveUpdates(
                    state,
                    updates.map((u) => ({
                      clientID: u.clientID,
                      changes: ChangeSet.fromJSON(u.changes),
                    })),
                  ),
                ),
              );
          }
        }
      const ids = new Set(
        snapshot.projects.flatMap((p) => p.documents.map((d) => d.id)),
      );
      for (const id of this.states.keys())
        if (!ids.has(id)) this.states.delete(id);
      this.authority = snapshot;
      this.emit();
    });
    this.syncing = work.catch((error) => this.fail(error));
    return work;
  }
  async refresh() {
    const result = await this.adapter.request({ type: "snapshot" });
    await this.reconcile(result.snapshot);
  }
  edit(
    projectId: string,
    documentId: string,
    edits: TextEdit[],
    normalizedCoordinates = true,
  ) {
    const state = this.states.get(documentId);
    if (!state) return;
    const changes = normalizedCoordinates
      ? sourceEdits(state.doc.toString(), edits)
      : edits;
    this.applyState(documentId, state.update({ changes }));
    this.error = "";
    this.emit();
    void this.flush(projectId).catch((error) => this.fail(error));
  }
  pendingInputIds(projectId: string) {
    return this.state.projects.filter(p => p.id === projectId).flatMap(p => p.documents)
      .filter(d => this.composing.has(d.id) || (this.states.has(d.id) && sendableUpdates(this.states.get(d.id)!).length > 0))
      .map(d => d.id);
  }
  hasPendingWritesIn(projectId?: string) {
    return this.state.projects
      .filter((p) => !projectId || p.id === projectId)
      .some((p) =>
        p.documents.some(
          (d) =>
            this.composing.has(d.id) ||
            (this.states.has(d.id) &&
              sendableUpdates(this.states.get(d.id)!).length > 0) ||
            ["pending", "saving"].includes(d.status),
        ),
      );
  }
  get hasPendingWrites() {
    return this.hasPendingWritesIn();
  }
  async prepareClose(projectId?: string) {
    const ids = new Set(
      this.state.projects
        .filter((p) => !projectId || p.id === projectId)
        .flatMap((p) => p.documents.map((d) => d.id)),
    );
    if ([...this.composing].some((id) => ids.has(id)))
      throw Error("文字仍在組字中，請完成輸入後再離開。");
    await this.flush(projectId);
  }
  async flush(projectId?: string): Promise<void> {
    if (this.pumping) {
      await this.pumping;
      return this.flush(projectId);
    }
    this.pumping = (async () => {
      for (;;) {
        let pending = false;
        for (const p of this.authority.projects.filter(
          (p) => !projectId || p.id === projectId,
        ))
          for (const d of p.documents) {
            if (this.composing.has(d.id)) continue;
            const state = this.states.get(d.id);
            if (!state) continue;
            const updates = sendableUpdates(state);
            if (!updates.length) continue;
            pending = true;
            const result = await this.adapter.request({
              type: "edit",
              projectId: p.id,
              documentId: d.id,
              version: getSyncedVersion(state),
              updates: updates.map((u) => ({
                clientID: u.clientID,
                changes: u.changes.toJSON(),
              })),
            });
            await this.reconcile(result.snapshot);
          }
        if (!pending) break;
      }
    })().finally(() => {
      this.pumping = null;
    });
    return this.pumping;
  }
  async action(action: WorkspaceAction) {
    if (action.type === "composition") {
      if (action.active) this.composing.add(action.documentId);
      else {
        await new Promise((resolve) => setTimeout(resolve, 30));
        this.composing.delete(action.documentId);
        await this.flush(action.projectId);
      }
      const result = await this.adapter.request(action);
      await this.reconcile(result.snapshot);
      return result;
    }
    if ("projectId" in action) await this.flush(action.projectId);
    const result = await this.adapter.request(action);
    await this.reconcile(result.snapshot);
    return result;
  }
  async loadSession(): Promise<WindowSession | null> {
    try {
      const value = window.yarnDesktop
        ? await window.yarnDesktop.session.load()
        : JSON.parse(
            localStorage.getItem("yarn-workbench.session.v2") || "null",
          );
      if (value === null) {
        const legacy = readLegacy(localStorage),
          layout = legacy.layout,
          p = this.state.projects[0];
        if (layout && Array.isArray(layout.tabs) && p) {
          const session = defaultSession(this.windowId, p.id);
          session.tabs = layout.tabs.flatMap((raw, index) => {
            const tab =
              typeof raw === "string"
                ? { id: "restored-" + index, file: raw }
                : (raw as { id?: string; file?: string });
            const d = p.documents.find((d) => d.name === tab?.file);
            if (!d && tab?.file !== "@commands") return [];
            return [
              {
                id: typeof tab.id === "string" ? tab.id : uuid(),
                documentId: d?.id || "@commands",
                mode: "source" as const,
                line: 1,
                column: 1,
              },
            ];
          });
          session.activeId =
            session.tabs.find((t) => t.id === layout.activeId)?.id ||
            session.tabs[0]?.id ||
            "";
          session.left = layout.left !== false;
          session.lineNumbers = layout.lineNumbers === true;
          return session;
        }
      }
      return restoreSession(value, this.windowId, this.state.currentProjectId);
    } catch (error) {
      if (!window.yarnDesktop) {
        const raw = localStorage.getItem("yarn-workbench.session.v2");
        if (raw)
          try {
            localStorage.setItem(
              "yarn-workbench.session.v2.recovery." + Date.now(),
              raw,
            );
          } catch {
            /* Keep original layout. */
          }
      }
      this.fail(error);
      return null;
    }
  }
  async saveSession(session: WindowSession) {
    if (window.yarnDesktop) return window.yarnDesktop.session.save(session);
    localStorage.setItem("yarn-workbench.session.v2", JSON.stringify(session));
  }
  dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
