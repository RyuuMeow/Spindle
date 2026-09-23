import { t as tr } from "../app/i18n";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type {
  Project,
  RecoveryEntry,
  DocumentRecord,
} from "../app/workspace/types";
import { atomicWrite } from "./disk-io";
import { projectConfig } from "./project-catalog";

type TrashRecord = {
  version: 1;
  state: "prepared" | "deleted" | "restoring" | "purging";
  entry: RecoveryEntry;
  documents: DocumentRecord[];
  folders: string[];
  restoredName?: string;
};
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function checked(base: string, relative: string) {
  const target = path.resolve(base, relative),
    delta = path.relative(path.resolve(base), target);
  if (
    !delta ||
    delta === ".." ||
    delta.startsWith(".." + path.sep) ||
    path.isAbsolute(delta)
  )
    throw Error(tr("m7b6971429a5c"));
  let current = path.resolve(base);
  for (const part of delta.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw Error(tr("mca65eb9f5259"));
  }
  return target;
}
function checkTree(file: string) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw Error(tr("md76197cb5e9c"));
  if (stat.isDirectory())
    for (const item of fs.readdirSync(file)) checkTree(path.join(file, item));
}
function removeOwned(base: string, id: string) {
  const file = checked(base, id);
  if (fs.existsSync(file)) {
    checkTree(file);
    fs.rmSync(file, { recursive: true });
  }
}
function validEntries(value: unknown): RecoveryEntry[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (e) =>
        !e ||
        typeof e.id !== "string" ||
        typeof e.name !== "string" ||
        typeof e.documentId !== "string" ||
        typeof e.text !== "string" ||
        !Number.isFinite(e.at),
    )
  )
    throw Error(tr("m997a2a36c484"));
  return value;
}
/** Owns only Spindle history and trash; never touches the operating system recycle bin. */
export class RecoveryStore {
  private initialized = new Set<string>();
  private written = new Map<string, string>();
  constructor(private profile: string) {}
  forget(p: Project) {
    this.initialized.delete(p.id);
    this.written.delete(p.id);
  }
  has(p: Project) {
    return this.initialized.has(p.id);
  }
  private base(p: Project) {
    if (p.kind === "standalone")
      return checked(this.profile, "single-file-history/" + p.id);
    if (!p.root) throw Error(tr("m491c1744afe0"));
    projectConfig(p.root);
    return checked(p.root, ".spindle");
  }
  private index(p: Project) {
    return checked(this.base(p), "history/index.json");
  }
  private trash(p: Project) {
    return checked(this.base(p), "trash");
  }
  private recordFile(p: Project, id: string) {
    return checked(this.trash(p), id + "/entry.json");
  }
  private payload(p: Project, id: string) {
    return checked(this.trash(p), id + "/payload");
  }
  private writeRecord(p: Project, r: TrashRecord) {
    atomicWrite(this.recordFile(p, r.entry.id), JSON.stringify(r));
  }
  load(p: Project, ids = new Map<string, string>(), copiedIdentity = false) {
    if (this.has(p)) return;
    const file = this.index(p);
    if (fs.existsSync(file)) {
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      if (value.version !== 1) throw Error(tr("m16d970e4b663"));
      p.recovery = validEntries(value.entries);
    }
    if (copiedIdentity)
      for (const entry of p.recovery) {
        for (const id of [
          entry.documentId,
          ...(entry.files || []).map((d) => d.id),
        ])
          if (id !== "@commands" && !ids.has(id)) ids.set(id, randomUUID());
      }
    // The index is also the migration marker. Never reimport the old profile after it exists.
    p.recovery = p.recovery.map((e) => ({
      ...e,
      documentId: ids.get(e.documentId) || e.documentId,
      files: e.files?.map((d) => ({ ...d, id: ids.get(d.id) || d.id })),
    }));
    const trash = this.trash(p),
      cleanup: string[] = [];
    if (fs.existsSync(trash))
      for (const id of fs.readdirSync(trash)) {
        const manifest = this.recordFile(p, id);
        if (!fs.existsSync(manifest)) continue;
        const r = JSON.parse(fs.readFileSync(manifest, "utf8")) as TrashRecord;
        if (
          r.version !== 1 ||
          r.entry?.id !== id ||
          !Array.isArray(r.documents) ||
          !Array.isArray(r.folders)
        )
          throw Error(tr("ma46763f5e942"));
        validEntries([r.entry]);
        r.documents = r.documents.map((d) => ({
          ...d,
          id: ids.get(d.id) || d.id,
        }));
        r.entry.documentId = ids.get(r.entry.documentId) || r.entry.documentId;
        r.entry.files = r.entry.files?.map((d) => ({
          ...d,
          id: ids.get(d.id) || d.id,
        }));
        const exists = fs.existsSync(this.payload(p, id));
        if (
          r.state === "restoring" &&
          !exists &&
          r.restoredName &&
          fs.existsSync(checked(p.root!, r.restoredName))
        ) {
          this.adoptRestored(p, r);
          p.recovery = p.recovery.filter((e) => e.id !== id);
          cleanup.push(id);
          continue;
        }
        if (r.state === "prepared" && !exists) {
          removeOwned(trash, id);
          continue;
        }
        if (r.state === "purging") {
          this.removePayload(p, id);
          this.forgetEntry(p, r.entry);
          cleanup.push(id);
          continue;
        }
        if (exists) {
          r.state = "deleted";
          this.writeRecord(p, r);
          p.recovery = p.recovery.filter((e) => e.id !== id).concat(r.entry);
          const removed = new Set(r.documents.map((d) => d.id));
          p.documents = p.documents.filter((d) => !removed.has(d.id));
          p.folders = p.folders?.filter(
            (f) => f !== r.entry.name && !f.startsWith(r.entry.name + "/"),
          );
        }
      }
    this.initialized.add(p.id);
    this.persist(p);
    for (const id of cleanup) removeOwned(trash, id);
    for (const e of [...p.recovery])
      if (e.deleted && e.at < Date.now() - 30 * 86400000) this.purge(p, e.id);
  }
  persist(p: Project) {
    if (!this.has(p)) return;
    const groups = new Map<string, RecoveryEntry[]>();
    for (const e of p.recovery)
      if (!e.deleted)
        groups.set(e.documentId, [...(groups.get(e.documentId) || []), e]);
    const keep = new Set(
      [...groups.values()].flatMap((entries) =>
        entries
          .sort((a, b) => a.at - b.at)
          .slice(-50)
          .map((e) => e.id),
      ),
    );
    p.recovery = p.recovery.filter((e) => e.deleted || keep.has(e.id));
    const value = JSON.stringify({
      version: 1,
      migrated: true,
      entries: p.recovery,
    });
    if (this.written.get(p.id) === value) return;
    atomicWrite(this.index(p), value);
    this.written.set(p.id, value);
  }
  moveToTrash(p: Project, name: string, folder: boolean) {
    if (!p.root) throw Error(tr("md34c5c320c02"));
    const original = checked(p.root, name);
    checkTree(original);
    const documents = p.documents.filter((d) =>
      folder ? d.name.startsWith(name + "/") : d.name === name,
    );
    const entry: RecoveryEntry = {
      id: randomUUID(),
      documentId: folder ? "@folder:" + randomUUID() : documents[0].id,
      name,
      text: folder ? "" : documents[0].text,
      at: Date.now(),
      reason: folder ? tr("md879a69d9c20") : tr("m881b2412ca7d"),
      deleted: true,
      kind: folder ? "folder" : "file",
      files: documents.map((d) => ({ id: d.id, name: d.name, text: d.text })),
    };
    const r: TrashRecord = {
      version: 1,
      state: "prepared",
      entry,
      documents: structuredClone(documents),
      folders: (p.folders || []).filter(
        (f) => f === name || f.startsWith(name + "/"),
      ),
    };
    this.writeRecord(p, r);
    try {
      fs.renameSync(original, this.payload(p, entry.id));
      r.state = "deleted";
      this.writeRecord(p, r);
      const next = structuredClone(p),
        removed = new Set(documents.map((d) => d.id));
      next.documents = next.documents.filter((d) => !removed.has(d.id));
      next.folders = next.folders?.filter((f) => !r.folders.includes(f));
      next.recovery.push(entry);
      this.persist(next);
      p.documents = next.documents;
      p.folders = next.folders;
      p.recovery = next.recovery;
    } catch (error) {
      if (
        fs.existsSync(this.payload(p, entry.id)) &&
        !fs.existsSync(original)
      ) {
        try {
          fs.renameSync(this.payload(p, entry.id), original);
          removeOwned(this.trash(p), entry.id);
        } catch {
          /* Durable operation record enables restart recovery. */
        }
      }
      throw error;
    }
    return entry;
  }
  private uniqueName(p: Project, name: string) {
    let target = name,
      index = 2;
    const ext = path.extname(name),
      stem = ext ? name.slice(0, -ext.length) : name;
    while (
      fs.existsSync(checked(p.root!, target)) ||
      p.documents.some((d) => d.name.toLowerCase() === target.toLowerCase())
    )
      target = stem + "-recovered-" + index++ + ext;
    return target;
  }
  private adoptRestored(p: Project, r: TrashRecord) {
    const name = r.restoredName!,
      map = (value: string) => name + value.slice(r.entry.name.length);
    for (const old of r.documents) {
      const targetName = map(old.name),
        file = checked(p.root!, targetName);
      const samePath = p.documents.find((d) => d.name === targetName);
      if (samePath) p.documents = p.documents.filter((d) => d !== samePath);
      let id = old.id;
      if (p.documents.some((d) => d.id === id)) {
        id = randomUUID();
        const history = p.recovery.filter(
          (e) => e.documentId === old.id && !e.deleted,
        );
        p.recovery.push(
          ...history.map((e) => ({
            ...e,
            id: randomUUID(),
            documentId: id,
            name: targetName,
          })),
        );
      }
      const text = fs.readFileSync(file, "utf8");
      p.documents.push({
        ...old,
        id,
        name: targetName,
        path: file,
        text,
        saved: text,
        version: 0,
        diskHash: digest(text),
        status: "saved",
        error: undefined,
        externalText: undefined,
        composing: false,
      });
    }
    p.folders = [...new Set([...(p.folders || []), ...r.folders.map(map)])];
  }
  previewRestore(p: Project, entry: RecoveryEntry) {
    if (!p.root || !entry.deleted) throw Error("TRASH_ENTRY_NOT_FOUND");
    const payload = this.payload(p, entry.id);
    let files = 0,
      otherFiles = 0;
    const walk = (file: string) => {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error("SYMLINK_NOT_ALLOWED");
      if (stat.isDirectory())
        for (const leaf of fs.readdirSync(file)) walk(path.join(file, leaf));
      else {
        files++;
        if (!/\.yarn$/i.test(file) && file !== payload) otherFiles++;
      }
    };
    if (fs.existsSync(payload)) walk(payload);
    const manifest = this.recordFile(p, entry.id);
    const record = fs.existsSync(manifest)
      ? (JSON.parse(fs.readFileSync(manifest, "utf8")) as TrashRecord)
      : undefined;
    return {
      source: entry.name,
      destination: this.uniqueName(p, entry.name),
      files,
      otherFiles,
      documents: (record?.documents || []).map((d) => ({
        id: d.id,
        name: d.name,
        version: d.version,
      })),
    };
  }
  restore(p: Project, entry: RecoveryEntry) {
    if (!p.root) throw Error(tr("md34c5c320c02"));
    const manifest = this.recordFile(p, entry.id);
    let r: TrashRecord;
    if (fs.existsSync(manifest))
      r = JSON.parse(fs.readFileSync(manifest, "utf8"));
    else {
      // Old versions retained only a Yarn source snapshot, not the original folder payload.
      r = {
        version: 1,
        state: "deleted",
        entry,
        documents: [
          {
            id: entry.documentId,
            name: entry.name,
            text: entry.text,
            saved: entry.text,
            version: 0,
            status: "saved",
          },
        ],
        folders: [],
      };
      this.writeRecord(p, r);
      atomicWrite(this.payload(p, entry.id), entry.text);
    }
    if (r.state === "purging") throw Error(tr("m53662abf9af6"));
    if (!(
      r.state === "restoring" &&
      !fs.existsSync(this.payload(p, entry.id)) &&
      r.restoredName &&
      fs.existsSync(checked(p.root, r.restoredName))
    )) {
      r.restoredName = this.uniqueName(p, entry.name);
      r.state = "restoring";
      this.writeRecord(p, r);
      const target = checked(p.root, r.restoredName);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(this.payload(p, entry.id), target);
    }
    const next = structuredClone(p);
    this.adoptRestored(next, r);
    next.recovery = next.recovery.filter((e) => e.id !== entry.id);
    this.persist(next);
    p.documents = next.documents;
    p.folders = next.folders;
    p.recovery = next.recovery;
    removeOwned(this.trash(p), entry.id);
    return p.documents.find((d) => d.name === r.restoredName)?.id;
  }
  private removePayload(p: Project, id: string) {
    const file = this.payload(p, id);
    if (fs.existsSync(file)) {
      checkTree(file);
      fs.rmSync(file, { recursive: true });
    }
  }
  private forgetEntry(p: Project, entry: RecoveryEntry) {
    const owned = new Set(entry.files?.map((d) => d.id) || [entry.documentId]),
      active = new Set(p.documents.map((d) => d.id));
    const stillTrashed = new Set(
      p.recovery
        .filter((e) => e.deleted && e.id !== entry.id)
        .flatMap((e) => e.files?.map((d) => d.id) || [e.documentId]),
    );
    p.recovery = p.recovery.filter(
      (e) =>
        e.id !== entry.id &&
        (e.deleted ||
          !owned.has(e.documentId) ||
          active.has(e.documentId) ||
          stillTrashed.has(e.documentId)),
    );
  }
  purge(p: Project, id?: string) {
    for (const entry of [...p.recovery].filter(
      (e) => e.deleted && (!id || e.id === id),
    )) {
      const manifest = this.recordFile(p, entry.id);
      const r: TrashRecord = fs.existsSync(manifest)
        ? JSON.parse(fs.readFileSync(manifest, "utf8"))
        : { version: 1, state: "purging", entry, documents: [], folders: [] };
      r.state = "purging";
      this.writeRecord(p, r);
      this.removePayload(p, entry.id);
      const next = structuredClone(p);
      this.forgetEntry(next, entry);
      this.persist(next);
      p.recovery = next.recovery;
      removeOwned(this.trash(p), entry.id);
    }
  }
}
