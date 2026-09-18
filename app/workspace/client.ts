import { appendedScene, renamedSceneByName } from "./authoring";
import { EditorState, ChangeSet, Text } from "@codemirror/state";
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
import { initialDocs, initialCommands } from "../sample";
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
  engine: DocumentEngine;
  notices: string[] = [];
  constructor() {
    const restored = readWorkspace(localStorage);
    if (restored.error) this.notices.push(restored.error);
    this.engine = new DocumentEngine(restored.value || []);
  }
  snapshot(): WorkspaceSnapshot {
    return structuredClone({
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
        const documents = a.type === "createScene" ? appendedScene(p, a.documentId, a.version, a.name) : renamedSceneByName(p, a.documentId, a.version, a.fromName, a.name).documents;
        this.engine.transaction(p.id, a.type === "createScene" ? "新增場景" : "更名場景", documents);
        documentId = a.documentId;
      } else if (a.type === "createDocument")
        documentId = this.engine.create(p.id, a.name, a.text).id;
      else if (a.type === "renameProject") p.name = a.name;
      else if (a.type === "renameDocument") {
        const d = this.engine.document(p.id, a.documentId);
        if (d.name === a.name) return { snapshot: this.snapshot(), projectId, documentId: d.id };
        const temporary = this.engine.create(p.id, a.name, d.text);
        p.documents = p.documents.filter((x) => x.id !== temporary.id);
        d.name = a.name;
      } else if (a.type === "commands") {
        validateCommands(a.commands);
        p.recovery.push({
          id: uuid(),
          documentId: "@commands",
          name: "指令定義",
          text: JSON.stringify(p.commands),
          at: Date.now(),
          reason: "修改指令前",
        });
        p.commands = a.commands;
      } else if (a.type === "commandDraft") p.commandDraft = a.draft;
      else if (a.type === "save") {
        for (const d of p.documents.filter(
          (d) => !a.documentId || d.id === a.documentId,
        )) {
          d.saved = d.text;
          d.status = "draft";
        }
      } else if (a.type === "composition")
        this.engine.document(p.id, a.documentId).composing = a.active;
      else if (a.type === "removeDocument") {
        this.engine.checkpoint(p.id, a.documentId, "從專案移除", true);
        p.documents = p.documents.filter((d) => d.id !== a.documentId);
      } else if (a.type === "recover") {
        const e = p.recovery.find((e) => e.id === a.recoveryId);
        if (!e) throw Error("找不到快照");
        if (e.documentId === "@commands") {
          if (a.expectedText !== undefined && JSON.stringify(p.commands) !== a.expectedText) throw Error("指令已變更，請重新比較後再還原");
          const previous = p.commands,
            next = JSON.parse(e.text);
          validateCommands(next);
          p.commands = next;
          delete p.commandDraft;
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
            if ((a.expectedVersion !== undefined && d.version !== a.expectedVersion) || (a.expectedText !== undefined && d.text !== a.expectedText)) throw Error("內容已變更，請重新比較後再還原");
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
                  commandDraft: p.commandDraft,
                  name: p.name,
                  files: p.documents.map((d) => ({
                    name: d.name,
                    text: d.text,
                  })),
                  commands: p.commands,
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
    this.adapter = window.yarnDesktop || new BrowserService();
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
    const legacy = readLegacy(localStorage),
      pristine = !legacy.exists;
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
    if (pristine) {
      input.name = "The Last Light";
      input.documents = initialDocs;
      input.commands = initialCommands;
    }
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
              this.states.set(
                d.id,
                state.update(
                  receiveUpdates(
                    state,
                    updates.map((u) => ({
                      clientID: u.clientID,
                      changes: ChangeSet.fromJSON(u.changes),
                    })),
                  ),
                ).state,
              );
          }
        }
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
    this.states.set(documentId, state.update({ changes }).state);
    this.error = "";
    this.emit();
    void this.flush().catch((error) => this.fail(error));
  }
  flush(): Promise<void> {
    if (this.pumping) return this.pumping;
    this.pumping = (async () => {
      for (;;) {
        let pending = false;
        for (const p of this.authority.projects)
          for (const d of p.documents) {
            if (this.composing.has(d.id)) continue;
            const state = this.states.get(d.id)!;
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
        await this.flush();
      }
      const result = await this.adapter.request(action);
      await this.reconcile(result.snapshot);
      return result;
    }
    await this.flush();
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
