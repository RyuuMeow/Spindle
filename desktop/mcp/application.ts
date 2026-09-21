import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";
import { schemas } from "./schemas";
import { semantics, projectQuery, statistics, type Fix } from "./semantics";
import { applyTextEdits, validateCommands } from "../../app/workspace/engine";
import {
  appendedScene,
  renamedSceneByName,
  lineOffset,
} from "../../app/workspace/authoring";
import { variableAt } from "../../app/variable-completion";
import { findCommand } from "../../app/command-catalog";
import { positionAt } from "../../app/mcp/coordinates";
import { sceneAt } from "../../app/scene-link";
import type { Project, WorkspaceAction } from "../../app/workspace/types";
import type {
  EditorSessionInfo,
  EditorContextSnapshot,
  ContextRequest,
} from "../../app/mcp/types";
import type { WorkspaceService } from "../workspace-service";
type Input<K extends keyof typeof schemas> = z.infer<(typeof schemas)[K]>;
export type AgentHost = {
  list(): EditorSessionInfo[];
  request(
    id: string,
    action: Omit<ContextRequest, "projectId" | "token">,
  ): Promise<EditorContextSnapshot>;
  open(projectId: string, focus: boolean): Promise<EditorSessionInfo[]>;
  focus(id: string): void;
};
type Snapshot = {
  id: string;
  sessionId: string;
  projectId: string;
  at: number;
  stamp: string;
  fixes: Fix[];
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const projectStamp = (p: Project) =>
  digest([
    p.id,
    p.commands,
    p.documents.map((d) => [d.id, d.name, d.version, d.text]),
  ]);
function page<T>(values: T[], start = 0, limit = 100) {
  return {
    items: values.slice(start, start + limit),
    total: values.length,
    nextOffset: start + limit < values.length ? start + limit : null,
  };
}
function bounds(text: string, from: number, to: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > text.length
  )
    throw Error("INVALID_SOURCE_RANGE");
}
export class AgentApplication {
  private analyses = new Map<
    string,
    { stamp: string; data: ReturnType<typeof semantics> }
  >();
  private analyze(p: Project) {
    const stamp = projectStamp(p),
      cached = this.analyses.get(p.id);
    if (cached?.stamp === stamp) return cached.data;
    const data = semantics(p);
    this.analyses.set(p.id, { stamp, data });
    while (this.analyses.size > 16)
      this.analyses.delete(this.analyses.keys().next().value!);
    return data;
  }
  private authorization = new AsyncLocalStorage<() => void>();
  private snapshots = new Map<string, Snapshot>();
  private operations = new Map<
    string,
    { fingerprint: string; result: Promise<unknown> }
  >();
  constructor(
    private service: WorkspaceService,
    private host: AgentHost,
    private writable: () => boolean,
  ) {}
  private session(id: string) {
    const value = this.host.list().find((s) => s.editorSessionId === id);
    if (!value) throw Error("EDITOR_SESSION_EXPIRED");
    return value;
  }
  private project(id: string) {
    return this.service.engine.project(this.session(id).projectId);
  }
  private snapshot(id: string, p: Project, fixes: Fix[] = []) {
    const value: Snapshot = {
      id: randomUUID(),
      sessionId: id,
      projectId: p.id,
      at: Date.now(),
      stamp: projectStamp(p),
      fixes,
    };
    this.snapshots.set(value.id, value);
    while (this.snapshots.size > 128)
      this.snapshots.delete(this.snapshots.keys().next().value!);
    return value;
  }
  private checkSnapshot(id: string, snapshotId: string) {
    const s = this.snapshots.get(snapshotId),
      p = this.project(id);
    if (
      !s ||
      s.sessionId !== id ||
      s.projectId !== p.id ||
      Date.now() - s.at > 600000
    )
      throw Error("SNAPSHOT_EXPIRED");
    if (s.stamp !== projectStamp(p)) throw Error("VERSION_CONFLICT");
    return s;
  }
  private async synchronized(id: string) {
    const original = this.session(id);
    const contexts = await Promise.all(
      this.host
        .list()
        .filter((s) => s.projectId === original.projectId)
        .map((s) =>
          this.host.request(s.editorSessionId, { action: "capture" }),
        ),
    );
    const p = this.project(id),
      pending = new Set(contexts.flatMap((c) => c.pendingDocumentIds));
    for (const c of contexts)
      if (c.capture) {
        const d = p.documents.find((d) => d.id === c.documentId);
        if (
          d &&
          (c.capture.blocked ||
            c.capture.composing ||
            c.capture.source !== d.text)
        )
          pending.add(d.id);
      }
    return { p, pending: [...pending], contexts };
  }
  execute(
    name: keyof typeof schemas,
    input: unknown,
    authorize: () => void = () => {},
  ): Promise<unknown> {
    return this.authorization.run(authorize, () =>
      this.executeAuthorized(name, input),
    );
  }
  private async executeAuthorized(
    name: keyof typeof schemas,
    input: unknown,
  ): Promise<unknown> {
    // Validate again at the application boundary, including direct integration tests.
    const parsed = schemas[name].parse(input);
    if (
      ["apply_changes", "update_commands", "apply_quick_fixes"].includes(name)
    ) {
      const a = parsed as Input<"apply_changes">;
      this.session(a.editorSessionId);
      if (!a.preview) {
        if (!this.writable()) throw Error("MCP_READ_ONLY");
        if (!a.operationId) throw Error("OPERATION_ID_REQUIRED");
        const key = a.editorSessionId + ":" + a.operationId,
          fingerprint = digest([name, parsed]);
        const old = this.operations.get(key);
        if (old) {
          if (old.fingerprint !== fingerprint)
            throw Error("OPERATION_ID_REUSED");
          return old.result;
        }
        const result = this.dispatch(name, parsed);
        this.operations.set(key, { fingerprint, result });
        return result;
      }
    }
    return this.dispatch(name, parsed);
  }
  private async dispatch(
    name: keyof typeof schemas,
    input: unknown,
  ): Promise<unknown> {
    if (name === "list_editor_sessions") return { sessions: this.host.list() };
    if (name === "list_projects") {
      const a = input as Input<"list_projects">,
        sessions = this.host.list();
      const values = this.service.catalog
        .list()
        .filter(
          (e) =>
            !a.query ||
            (e.name + " " + e.root)
              .toLocaleLowerCase()
              .includes(a.query.toLocaleLowerCase()),
        )
        .map((e) => ({
          ...e,
          sessions: sessions
            .filter((s) => s.projectId === e.id)
            .map((s) => s.editorSessionId),
        }));
      return page(values, a.offset, a.limit);
    }
    if (name === "open_project") {
      const a = input as Input<"open_project">;
      return { sessions: await this.host.open(a.projectId, a.focus) };
    }
    if (name === "activate_editor_session" || name === "reveal_location") {
      const a = input as Input<"reveal_location"> &
        Input<"activate_editor_session">;
      const p = this.project(a.editorSessionId);
      if (
        name === "activate_editor_session" &&
        a.tabId &&
        !this.session(a.editorSessionId).tabs.some((t) => t.id === a.tabId)
      )
        throw Error("TAB_NOT_FOUND");
      if (name === "reveal_location") {
        const d = p.documents.find((d) => d.id === a.documentId);
        if (!d) throw Error("DOCUMENT_NOT_FOUND");
        bounds(d.text, a.from, a.to ?? a.from);
      }
      await this.host.request(
        a.editorSessionId,
        name === "reveal_location"
          ? {
              action: "reveal",
              documentId: a.documentId,
              from: a.from,
              to: a.to,
            }
          : { action: "activate", tabId: a.tabId },
      );
      if (a.focus) this.host.focus(a.editorSessionId);
      return this.context({
        editorSessionId: a.editorSessionId,
        surroundingLines: 10,
      });
    }
    if (name === "get_editor_context")
      return this.context(input as Input<"get_editor_context">);
    if (name === "apply_changes")
      return this.changes(input as Input<"apply_changes">);
    if (name === "update_commands")
      return this.commands(input as Input<"update_commands">);
    if (name === "apply_quick_fixes")
      return this.fixes(input as Input<"apply_quick_fixes">);
    const a = input as Input<"query_project"> &
      Input<"read_document"> &
      Input<"get_statistics">;
    const { p, pending } = await this.synchronized(a.editorSessionId);
    const data = this.analyze(p),
      snapshot = this.snapshot(a.editorSessionId, p, data.fixes);
    const base = {
      editorSessionId: a.editorSessionId,
      projectId: p.id,
      commandVersion: digest(p.commands),
      snapshotId: snapshot.id,
      pendingDocumentIds: pending,
    };
    if (name === "read_document") {
      const d = p.documents.find((d) => d.id === a.documentId);
      if (!d) throw Error("DOCUMENT_NOT_FOUND");
      const end = a.to ?? d.text.length;
      bounds(d.text, a.from, end);
      const to = Math.min(end, a.from + 32000);
      return {
        ...base,
        documentId: d.id,
        name: d.name,
        version: d.version,
        status: d.status,
        from: a.from,
        to,
        text: d.text.slice(a.from, to),
        truncated: to < end,
        nextFrom: to < end ? to : null,
      };
    }
    if (a.documentId && !p.documents.some((d) => d.id === a.documentId))
      throw Error("DOCUMENT_NOT_FOUND");
    if (name === "get_statistics")
      return { ...base, ...statistics(p, a.documentId, a.sceneName) };
    if (name === "validate_project") {
      const result = page(
        data.issues.filter(
          (i) => !a.documentId || i.documentId === a.documentId,
        ),
        a.offset,
        a.limit,
      );
      const used = new Set(result.items.flatMap((i) => i.fixIds));
      return {
        ...base,
        ...result,
        fixes: data.fixes.filter((f) => used.has(f.id)),
      };
    }
    let items = projectQuery(p, a.kind, data);
    if (a.documentId)
      items = items.filter(
        (item) =>
          (item as { documentId?: string; id?: string }).documentId ===
            a.documentId ||
          (a.kind === "documents" &&
            (item as { id: string }).id === a.documentId),
      );
    if (a.query)
      items = items.filter((item) =>
        JSON.stringify(item)
          .toLocaleLowerCase()
          .includes(a.query!.toLocaleLowerCase()),
      );
    return { ...base, ...page(items, a.offset, a.limit) };
  }
  private async context(a: Input<"get_editor_context">) {
    const raw = await this.host.request(a.editorSessionId, {
      action: "capture",
    });
    const p = this.project(a.editorSessionId),
      d = p.documents.find((d) => d.id === raw.documentId),
      c = raw.capture;
    const data = this.analyze(p),
      snapshot = this.snapshot(a.editorSessionId, p, data.fixes);
    const ready =
      !!d &&
      !!c &&
      !c.blocked &&
      !c.composing &&
      !raw.pendingDocumentIds.includes(d.id) &&
      c.source === d.text;
    const cursor =
      ready && c.selections.length
        ? c.selections[c.primarySelection ?? 0]?.head
        : undefined;
    const line =
      cursor === undefined
        ? undefined
        : d!.text.slice(0, cursor).split("\n").length;
    const column =
      cursor === undefined ? undefined : positionAt(d!.text, cursor).column;
    const lineText =
      line === undefined
        ? ""
        : d!.text.slice(lineOffset(d!.text, line)).split(/\r?\n/, 1)[0];
    let budget = 12000;
    const selections = ready
      ? c.selections.slice(0, 100).map((r) => {
          const from = Math.min(r.anchor, r.head),
            to = Math.max(r.anchor, r.head);
          bounds(d!.text, from, to);
          const text = d!.text.slice(from, Math.min(to, from + budget));
          budget -= text.length;
          return { ...r, from, to, text, truncated: text.length < to - from };
        })
      : [];
    const from =
      line === undefined
        ? 0
        : lineOffset(d!.text, Math.max(1, line - a.surroundingLines));
    const to =
      line === undefined
        ? 0
        : lineOffset(d!.text, line + a.surroundingLines + 1);
    const commandName = /<<\s*([A-Za-z_]\w*)/.exec(lineText)?.[1];
    return {
      editorSessionId: a.editorSessionId,
      projectId: p.id,
      commandVersion: digest(p.commands),
      snapshotId: snapshot.id,
      capturedAt: new Date().toISOString(),
      page: raw.page,
      tabId: raw.tabId,
      mode: raw.mode,
      lastDocumentId: raw.lastDocumentId,
      document: d
        ? { id: d.id, name: d.name, version: d.version, status: d.status }
        : null,
      synchronized: ready || raw.page !== "document",
      composing: c?.composing || false,
      pendingDocumentIds: raw.pendingDocumentIds,
      cursor: line === undefined ? null : { line, column, offset: cursor },
      selections,
      primarySelection: c?.primarySelection ?? 0,
      selectionsTruncated: !!c && c.selections.length > 100,
      visibleRanges: ready ? c.visibleRanges.slice(0, 200) : [],
      surrounding:
        ready && line
          ? {
              from,
              to: Math.min(to, from + 12000),
              text: d!.text.slice(from, Math.min(to, from + 12000)),
              truncated: to - from > 12000,
            }
          : null,
      scene: line
        ? data.nodes
            .filter(
              (n) => n.file === d?.name && n.start <= line && n.end >= line,
            )
            .map((n) => ({
              id: n.id,
              name: n.name,
              file: n.file,
              start: n.start,
              end: n.end,
            }))[0]
        : null,
      diagnostics: line
        ? data.issues.filter((i) => i.file === d?.name && i.line === line)
        : [],
      symbol: line
        ? variableAt(
            lineText,
            cursor! - lineOffset(d!.text, line),
            data.variables,
          )?.variable ||
          sceneAt(lineText, cursor! - lineOffset(d!.text, line), data.nodes) ||
          (commandName && findCommand(commandName, p.commands)) ||
          null
        : null,
      graph: c?.graph,
    };
  }
  private async prepare(id: string, snapshotId: string, touched?: string[]) {
    const { p, pending } = await this.synchronized(id);
    this.checkSnapshot(id, snapshotId);
    if (pending.some((id) => !touched || touched.includes(id)))
      throw Error("INPUT_PENDING");
    return p;
  }
  private async commit(
    id: string,
    snapshotId: string,
    action: WorkspaceAction,
    touched: string[],
  ) {
    let applied = false,
      appliedOnFailure = false;
    const p = this.project(id),
      before = projectStamp(p);
    try {
      await this.service.requestChecked(
        action,
        () => {
          this.authorization.getStore()?.();
          if (!this.writable()) throw Error("MCP_READ_ONLY");
          this.checkSnapshot(id, snapshotId);
          for (const d of p.documents.filter((d) => touched.includes(d.id))) {
            if (d.composing) throw Error("INPUT_PENDING");
            if (["conflict", "missing", "error"].includes(d.status))
              throw Error("DOCUMENT_NOT_WRITABLE: " + d.name);
          }
        },
        () => {
          appliedOnFailure = projectStamp(p) !== before;
        },
      );
      applied = true;
    } catch (error) {
      if (!appliedOnFailure) throw error;
      return {
        applied: true,
        editorSessionId: id,
        projectId: p.id,
        commandVersion: digest(p.commands),
        diagnostics: this.analyze(p).issues,
        persistenceError: String(error),
        documents: p.documents
          .filter((d) => touched.includes(d.id))
          .map((d) => ({ id: d.id, version: d.version, status: d.status })),
      };
    }
    const issues = this.analyze(p).issues;
    const next = this.snapshot(id, p);
    return {
      applied,
      editorSessionId: id,
      projectId: p.id,
      commandVersion: digest(p.commands),
      snapshotId: next.id,
      diagnostics: issues,
      documents: p.documents
        .filter((d) => touched.includes(d.id))
        .map((d) => ({ id: d.id, version: d.version, status: d.status })),
      persistenceError:
        p.persistenceError || this.service.profileError || undefined,
    };
  }
  private async changes(a: Input<"apply_changes">) {
    const change = a.change;
    const touched =
      change.kind === "edits"
        ? change.documents.map((d) => d.id)
        : change.kind === "create_scene"
          ? [change.documentId]
          : undefined;
    const p = await this.prepare(a.editorSessionId, a.snapshotId, touched);
    let documents: {
      id: string;
      version: number;
      edits: { from: number; to: number; insert: string }[];
    }[];
    if (change.kind === "edits") documents = change.documents;
    else {
      const d = p.documents.find((d) => d.id === change.documentId);
      if (!d) throw Error("DOCUMENT_NOT_FOUND");
      if (
        change.kind === "rename_scene" &&
        this.analyze(p).nodes.filter((n) => n.name === change.fromName)
          .length !== 1
      )
        throw Error("SCENE_NOT_UNIQUE");
      documents =
        change.kind === "create_scene"
          ? appendedScene(p, d.id, d.version, change.name)
          : renamedSceneByName(p, d.id, d.version, change.fromName, change.name)
              .documents;
    }
    if (new Set(documents.map((d) => d.id)).size !== documents.length)
      throw Error("DUPLICATE_DOCUMENT");
    const preview = documents.map((item) => {
      const d = p.documents.find((d) => d.id === item.id);
      if (!d) throw Error("DOCUMENT_NOT_FOUND");
      if (d.version !== item.version) throw Error("VERSION_CONFLICT");
      const edits = [...item.edits].sort((a, b) => a.from - b.from);
      for (let i = 0; i < edits.length; i++) {
        const e = edits[i];
        bounds(d.text, e.from, e.to);
        if (i && (e.from < edits[i - 1].to || e.from === edits[i - 1].from))
          throw Error("OVERLAPPING_EDITS");
      }
      return {
        documentId: d.id,
        name: d.name,
        version: d.version,
        edits,
        afterLength: applyTextEdits(d.text, edits).length,
      };
    });
    const after = {
      ...p,
      documents: p.documents.map((d) => {
        const change = documents.find((e) => e.id === d.id);
        return change
          ? { ...d, text: applyTextEdits(d.text, change.edits) }
          : d;
      }),
    };
    if (a.preview)
      return { applied: false, preview, diagnostics: semantics(after).issues };
    const result = await this.commit(
      a.editorSessionId,
      a.snapshotId,
      { type: "transaction", projectId: p.id, label: a.label, documents },
      documents.map((d) => d.id),
    );
    return {
      ...result,
      summary: preview.map((d) => ({
        documentId: d.documentId,
        name: d.name,
        edits: d.edits.length,
      })),
    };
  }
  private async commands(a: Input<"update_commands">) {
    const p = await this.prepare(a.editorSessionId, a.snapshotId);
    if (p.kind === "standalone") throw Error("PROJECT_REQUIRED");
    if (new Set(a.commands.map((c) => c.name)).size !== a.commands.length)
      throw Error("DUPLICATE_COMMAND");
    const commands = [...p.commands];
    for (const command of a.commands) {
      if (findCommand(command.name, [])) throw Error("BUILTIN_COMMAND");
      const index = commands.findIndex((c) => c.name === command.name);
      if (index < 0) commands.push(command);
      else commands[index] = command;
    }
    validateCommands(commands);
    if (a.preview)
      return {
        applied: false,
        commands: a.commands,
        diagnostics: semantics({ ...p, commands }).issues,
      };
    return this.commit(
      a.editorSessionId,
      a.snapshotId,
      {
        type: "commands",
        projectId: p.id,
        commands,
        expectedCommands: JSON.stringify(p.commands),
      },
      [],
    );
  }
  private async fixes(a: Input<"apply_quick_fixes">) {
    const snapshot = this.checkSnapshot(a.editorSessionId, a.snapshotId);
    if (new Set(a.fixIds).size !== a.fixIds.length)
      throw Error("DUPLICATE_FIX");
    const fixes = a.fixIds.map((id) => {
      const fix = snapshot.fixes.find((f) => f.id === id);
      if (!fix) throw Error("FIX_NOT_FOUND");
      return fix;
    });
    if (fixes.some((f) => f.command) && fixes.some((f) => f.edit))
      throw Error("MIXED_HISTORY_SCOPES");
    if (fixes[0].command)
      return this.commands({
        ...a,
        commands: [
          ...new Map(fixes.map((f) => [f.command!.name, f.command!])).values(),
        ],
      });
    const documents = [...new Set(fixes.map((f) => f.documentId))].map(
      (id) => ({
        id,
        version: fixes.find((f) => f.documentId === id)!.version,
        edits: fixes.filter((f) => f.documentId === id).map((f) => f.edit!),
      }),
    );
    return this.changes({
      ...a,
      label: "Agent 快速修正",
      change: { kind: "edits", documents },
    });
  }
}
