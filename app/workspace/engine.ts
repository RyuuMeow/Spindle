import { ChangeSet, Text } from "@codemirror/state";
import { rebaseUpdates, type Update } from "@codemirror/collab";
import type { Command } from "../parser";
import { validateCommand } from "../parser";
import {
  type DocumentRecord,
  type Project,
  type RecoveryEntry,
  type TextEdit,
  type WireUpdate,
  makeDocument,
  uuid,
} from "./types";

type HistoryItem = {
  label: string;
  entries: { id: string; before: string; after: string }[];
  clientID?: string;
  at?: number;
};
const text = (value: string) => Text.of(value.split("\n"));
export function applyTextEdits(value: string, edits: TextEdit[]) {
  return ChangeSet.of(edits, value.length, "\n").apply(text(value)).toString();
}
export function difference(before: string, after: string): TextEdit[] {
  if (before === after) return [];
  let start = 0,
    end = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return [
    {
      from: start,
      to: before.length - end,
      insert: after.slice(start, after.length - end),
    },
  ];
}
export const normalized = (value: string) => value.replace(/\r\n/g, "\n");
export function monacoSourceEdits(
  source: string,
  changes: {
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    text: string;
  }[],
): TextEdit[] {
  const offsets = [source.startsWith("\ufeff") ? 1 : 0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") offsets.push(i + 1);
  const offset = (line: number, column: number) =>
    Math.min(source.length, (offsets[line - 1] ?? source.length) + column - 1);
  return changes
    .map((change) => ({
      from: offset(change.range.startLineNumber, change.range.startColumn),
      to: offset(change.range.endLineNumber, change.range.endColumn),
      insert: change.text,
    }))
    .sort((a, b) => a.from - b.from);
}
export function sourceOffset(source: string, offset: number) {
  let raw = 0,
    visible = 0;
  while (raw < source.length && visible < offset) {
    if (source[raw] === "\r" && source[raw + 1] === "\n") raw++;
    raw++;
    visible++;
  }
  return raw;
}
export function viewOffset(source: string, offset: number) {
  return normalized(source.slice(0, offset)).length;
}
export function sourceEdits(source: string, edits: TextEdit[]): TextEdit[] {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  return edits.map((e) => ({
    from: sourceOffset(source, e.from),
    to: sourceOffset(source, e.to),
    insert: e.insert.replace(/\r?\n/g, eol),
  }));
}
export function validDocumentName(name: string) {
  return (
    !!name &&
    name.endsWith(".yarn") &&
    !name.startsWith("/") &&
    !/^[A-Za-z]:/.test(name) &&
    !name
      .split(/[\\/]/)
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(p) ||
          /[ .]$/.test(p) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  );
}
export function validateCommands(commands: Command[]) {
  if (!Array.isArray(commands)) throw Error("指令設定格式錯誤");
  for (const c of commands) {
    if (
      !c ||
      typeof c.name !== "string" ||
      (c.displayName !== undefined && typeof c.displayName !== "string") ||
      typeof c.description !== "string" ||
      typeof c.example !== "string" ||
      !Array.isArray(c.params) ||
      c.params.some(
        (p) =>
          !p ||
          typeof p.name !== "string" ||
          (p.displayName !== undefined && typeof p.displayName !== "string") ||
          (p.description !== undefined && typeof p.description !== "string") ||
          !["string", "number", "boolean"].includes(p.type) ||
          typeof p.required !== "boolean" ||
          typeof p.defaultValue !== "string",
      )
    )
      throw Error("指令設定格式錯誤");
    const error = validateCommand(
      c,
      commands.filter((x) => x !== c),
    );
    if (error) throw Error(error);
  }
}
export function validateProject(value: unknown): Project {
  const p = value as Project;
  if (
    !p ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.documents) ||
    !Array.isArray(p.excluded) ||
    !Array.isArray(p.recovery)
  )
    throw Error("專案資料格式錯誤");
  // Unapplied command forms belong only to their open tab, never to saved projects.
  delete (p as Project & { commandDraft?: unknown }).commandDraft;
  validateCommands(p.commands);
  p.folders = Array.isArray(p.folders)
    ? p.folders.filter(
        (n) => typeof n === "string" && validDocumentName(n + "/folder.yarn"),
      )
    : [];
  p.treeOrder = Array.isArray(p.treeOrder)
    ? p.treeOrder.filter((n) => typeof n === "string")
    : [];
  const ids = new Set<string>(),
    names = new Set<string>();
  for (const d of p.documents) {
    if (
      !d ||
      typeof d.id !== "string" ||
      !validDocumentName(d.name) ||
      typeof d.text !== "string" ||
      typeof d.saved !== "string" ||
      ids.has(d.id) ||
      names.has(d.name.toLowerCase())
    )
      throw Error("文件資料格式錯誤或名稱重複");
    ids.add(d.id);
    names.add(d.name.toLowerCase());
  }
  return p;
}

/** Recover each independent content area without allowing bad settings to hide scripts. */
export function restoreProjects(input: unknown) {
  if (!Array.isArray(input)) throw Error("工作區專案清單無效");
  const warnings: string[] = [];
  const projects: Project[] = input.map((value, index) => {
    if (!value || typeof value !== "object") throw Error("專案資料無效");
    const p = value as Project;
    const restored: Project = {
      ...p,
      id: typeof p.id === "string" ? p.id : uuid(),
      name: typeof p.name === "string" ? p.name : `復原專案 ${index + 1}`,
      commands: [],
      folders: Array.isArray(p.folders)
        ? p.folders.filter(
            (n) =>
              typeof n === "string" && validDocumentName(n + "/folder.yarn"),
          )
        : [],
      treeOrder: Array.isArray(p.treeOrder)
        ? p.treeOrder.filter((n) => typeof n === "string")
        : [],
      excluded: Array.isArray(p.excluded)
        ? p.excluded.filter((n) => typeof n === "string")
        : [],
      recovery: Array.isArray(p.recovery)
        ? p.recovery.filter(
            (e) =>
              e &&
              typeof e.id === "string" &&
              typeof e.text === "string" &&
              typeof e.name === "string" &&
              typeof e.documentId === "string" &&
              Number.isFinite(e.at),
          )
        : [],
    };
    try {
      validateCommands(p.commands);
      restored.commands = p.commands;
    } catch {
      warnings.push(
        restored.name + " 的指令設定損毀；劇本已保留，原設定存於救援副本",
      );
    }
    if (!Array.isArray(p.documents)) throw Error("文件清單無效");
    restored.documents = [];
    for (const doc of p.documents) {
      try {
        validateProject({
          ...restored,
          documents: [...restored.documents, doc],
        });
        restored.documents.push(doc);
      } catch {
        warnings.push(
          restored.name + " 有無法讀取的文件項目，原資料已保留供救援",
        );
      }
    }
    return validateProject(restored);
  });
  return { projects, warnings };
}

/** Authority-owned text history. Every accepted update has a monotonic version. */
export class DocumentEngine {
  private logs = new Map<string, Update[]>();
  private history = new Map<string, HistoryItem[]>();
  private redoHistory = new Map<string, HistoryItem[]>();
  constructor(public projects: Project[]) {
    for (const p of projects) {
      p.recovery = p.recovery.filter(
        (entry) => !entry.deleted || entry.at > Date.now() - 30 * 86400000,
      );
      for (const d of p.documents) {
        d.version = 0;
        this.logs.set(d.id, []);
      }
    }
  }
  project(id: string) {
    const p = this.projects.find((p) => p.id === id);
    if (!p) throw Error("找不到專案");
    return p;
  }
  document(projectId: string, id: string) {
    const d = this.project(projectId).documents.find((d) => d.id === id);
    if (!d) throw Error("找不到文件");
    return d;
  }
  resetDocument(id: string) {
    this.logs.delete(id);
    this.history.delete(id);
    this.redoHistory.delete(id);
  }
  updates(projectId: string, id: string, version: number): WireUpdate[] {
    this.document(projectId, id);
    const log = this.logs.get(id) || [];
    if (!Number.isInteger(version) || version < 0 || version > log.length)
      throw Error("文件版本無效，請重新同步");
    return log
      .slice(version)
      .map((u) => ({ clientID: u.clientID, changes: u.changes.toJSON() }));
  }
  private accept(d: DocumentRecord, changes: ChangeSet, clientID: string) {
    d.text = changes.apply(text(d.text)).toString();
    const log = this.logs.get(d.id) || [];
    log.push({ changes, clientID });
    this.logs.set(d.id, log);
    d.version = log.length;
    if (!["conflict", "missing"].includes(d.status))
      d.status = d.path ? (d.text === d.saved ? "saved" : "pending") : "draft";
  }
  private remember(item: HistoryItem) {
    for (const e of item.entries) {
      const list = this.history.get(e.id) || [];
      list.push(item);
      this.history.set(e.id, list.slice(-300));
      this.redoHistory.set(e.id, []);
    }
  }
  edit(projectId: string, id: string, version: number, wire: WireUpdate[]) {
    const d = this.document(projectId, id),
      log = this.logs.get(id) || [];
    if (!Number.isInteger(version) || version < 0 || version > log.length)
      throw Error("文件版本無效");
    if (!Array.isArray(wire) || wire.length > 1000) throw Error("修改格式無效");
    const updates = wire.map((u) => ({
      clientID: u.clientID,
      changes: ChangeSet.fromJSON(u.changes),
    }));
    const accepted = rebaseUpdates(updates, log.slice(version));
    const before = d.text;
    // Validate the whole submission before publishing any part.
    let preview = text(before);
    for (const u of accepted) preview = u.changes.apply(preview);
    for (const u of accepted) this.accept(d, u.changes, u.clientID);
    if (before !== d.text) {
      const previous = this.history.get(id)?.at(-1),
        clientID = accepted[0]?.clientID,
        now = Date.now();
      if (
        previous?.clientID === clientID &&
        previous.entries.length === 1 &&
        now - (previous.at || 0) < 500 &&
        previous.entries[0].after === before
      ) {
        previous.entries[0].after = d.text;
        previous.at = now;
        this.redoHistory.set(id, []);
      } else
        this.remember({
          label: "編輯",
          clientID,
          at: now,
          entries: [{ id, before, after: d.text }],
        });
    }
  }
  transaction(
    projectId: string,
    label: string,
    changes: { id: string; version: number; edits: TextEdit[] }[],
  ) {
    const entries = changes.map((e) => {
      const d = this.document(projectId, e.id);
      if (d.version !== e.version) throw Error("文件已變更，請重新執行此操作");
      return {
        id: d.id,
        before: d.text,
        after: applyTextEdits(d.text, e.edits),
      };
    });
    if (new Set(entries.map((e) => e.id)).size !== entries.length)
      throw Error("交易包含重複文件");
    for (const e of entries) {
      const d = this.document(projectId, e.id);
      this.accept(
        d,
        ChangeSet.of(difference(e.before, e.after), e.before.length, "\n"),
        "transaction-" + uuid(),
      );
    }
    if (entries.some((e) => e.before !== e.after))
      this.remember({ label, entries });
  }
  undo(projectId: string, id: string, redo = false) {
    const from = redo ? this.redoHistory : this.history,
      to = redo ? this.history : this.redoHistory;
    const item = from.get(id)?.at(-1);
    if (!item) return;
    for (const e of item.entries) {
      const d = this.document(projectId, e.id);
      if (
        d.text !== (redo ? e.before : e.after) ||
        from.get(e.id)?.at(-1) !== item
      )
        throw Error("相關文件已有後續修改，請先撤銷後續操作");
    }
    for (const e of item.entries) {
      const d = this.document(projectId, e.id),
        next = redo ? e.after : e.before;
      this.accept(
        d,
        ChangeSet.of(difference(d.text, next), d.text.length, "\n"),
        "history-" + uuid(),
      );
      from.get(e.id)!.pop();
      const list = to.get(e.id) || [];
      list.push(item);
      to.set(e.id, list);
    }
  }
  replace(projectId: string, id: string, value: string, label: string) {
    const d = this.document(projectId, id);
    this.transaction(projectId, label, [
      { id, version: d.version, edits: difference(d.text, value) },
    ]);
  }
  create(
    projectId: string,
    name: string,
    value: string,
    firstInOrder?: string[],
  ) {
    const p = this.project(projectId);
    name = name.replace(/\\/g, "/");
    if (
      !validDocumentName(name) ||
      p.documents.some((d) => d.name.toLowerCase() === name.toLowerCase())
    )
      throw Error("檔名無效或已存在");
    const d = makeDocument(name, value);
    if (firstInOrder) {
      const rank = new Map(firstInOrder.map((id, index) => [id, index]));
      const ordered = [...p.documents].sort(
        (a, b) =>
          (rank.get(a.id) ?? firstInOrder.length) -
          (rank.get(b.id) ?? firstInOrder.length),
      );
      const folder = (value: string) =>
        value.slice(0, value.lastIndexOf("/") + 1);
      const first = ordered.findIndex(
        (item) => folder(item.name) === folder(name),
      );
      ordered.splice(first < 0 ? ordered.length : first, 0, d);
      p.documents = ordered;
      if (p.treeOrder) p.treeOrder = ["file:" + d.id, ...p.treeOrder];
    } else p.documents.push(d);
    this.logs.set(d.id, []);
    return d;
  }
  checkpoint(
    projectId: string,
    id: string,
    reason: string,
    deleted = false,
  ): RecoveryEntry {
    const p = this.project(projectId),
      d = this.document(projectId, id),
      entry = {
        id: uuid(),
        documentId: id,
        name: d.name,
        text: d.text,
        at: Date.now(),
        reason,
        deleted,
      };
    p.recovery.push(entry);
    p.recovery = p.recovery.filter((e) =>
      e.deleted ? e.at > Date.now() - 30 * 86400000 : true,
    );
    const snapshots = p.recovery.filter(
      (e) => e.documentId === id && !e.deleted,
    );
    const remove = new Set(snapshots.slice(0, -50).map((e) => e.id));
    p.recovery = p.recovery.filter((e) => !remove.has(e.id));
    return entry;
  }
}
