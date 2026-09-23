import { t as tr } from "../app/i18n";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { validateCommands } from "../app/workspace/engine";
import { atomicWrite } from "./disk-io";
import { projectConfig } from "./project-catalog";
import { entryPath, planProjectEntry } from "./project-entries";
import {
  addFolder,
  applyTreeMove,
  planTreeMove,
} from "../app/workspace/file-tree";
import type { Project, WorkspaceAction } from "../app/workspace/types";
export const projectMetadata = (p: Project) => ({
  version: 2,
  id: p.id,
  name: p.name,
  commands: p.commands,
  files: p.documents
    .filter((d) => d.path)
    .map((d) => ({ id: d.id, name: d.name })),
  excluded: p.excluded,
  folders: p.folders,
  treeOrder: p.treeOrder,
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Record = {
  version: 1;
  id: string;
  before: string;
  next: ReturnType<typeof projectMetadata>;
  source?: string;
  destination: string;
  contentHash?: string;
  inode?: number;
  device?: number;
  applied: boolean;
  createdId?: string;
};
/** Durable intent bridges filesystem mutation and project metadata. No user files are removed during replay. */
export class EntryJournal {
  active?: { root: string; file: string; record: Record };
  lastApplied = false;
  private directory(root: string) {
    projectConfig(root);
    const dir = path.join(root, ".spindle", "operations");
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      throw Error("SYMLINK_NOT_ALLOWED");
    return dir;
  }
  begin(p: Project, action: WorkspaceAction) {
    this.lastApplied = false;
    if (
      ![
        "createDocument",
        "createFolder",
        "moveEntry",
        "renameDocument",
      ].includes(action.type)
    )
      return;
    const directory = this.directory(p.root!);
    if (
      fs.existsSync(directory) &&
      fs.readdirSync(directory).some((n) => n.endsWith(".json"))
    )
      throw Error(
        "ENTRY_RECOVERY_REQUIRED: reopen the project to recover the pending operation",
      );
    const plan = planProjectEntry(p, action);
    if (plan.source === plan.destination) return;
    const next = structuredClone(p),
      id = randomUUID();
    let createdId: string | undefined, contentHash: string | undefined;
    if (action.type === "createDocument") {
      createdId = randomUUID();
      contentHash = digest(action.text);
      next.documents.push({
        id: createdId,
        name: action.name,
        text: action.text,
        saved: action.text,
        version: 0,
        status: "saved",
        path: entryPath(p.root!, action.name),
      });
    } else if (action.type === "createFolder") addFolder(next, action.name);
    else if (action.type === "moveEntry")
      applyTreeMove(
        next,
        planTreeMove(
          next,
          action.entry,
          action.parent,
          action.name,
          action.before,
        ),
      );
    else if (action.type === "renameDocument")
      next.documents.find((d) => d.id === action.documentId)!.name =
        action.name;
    const sourceStat = plan.source
      ? fs.statSync(entryPath(p.root!, plan.source))
      : undefined;
    const config = projectConfig(p.root!);
    const record: Record = {
      version: 1,
      id,
      before: digest(fs.readFileSync(config, "utf8")),
      next: projectMetadata(next),
      source: plan.source,
      destination: plan.destination!,
      contentHash,
      inode: sourceStat?.ino,
      device: sourceStat?.dev,
      applied: false,
      createdId,
    };
    const file = path.join(this.directory(p.root!), id + ".json");
    atomicWrite(file, JSON.stringify(record));
    this.active = { root: p.root!, file, record };
  }
  metadata(p: Project) {
    if (!this.active || this.active.root !== p.root) return;
    this.lastApplied = true;
    this.active.record.next = projectMetadata(p);
    this.active.record.applied = true;
    atomicWrite(this.active.file, JSON.stringify(this.active.record));
  }
  sourceReady() {
    const active = this.active;
    if (!active?.record.source) return;
    const stat = fs.statSync(entryPath(active.root, active.record.source));
    active.record.inode = stat.ino;
    active.record.device = stat.dev;
    atomicWrite(active.file, JSON.stringify(active.record));
  }
  wasApplied() {
    if (this.lastApplied) return true;
    const active = this.active;
    if (!active) return false;
    const { root, record: r } = active;
    const destination = entryPath(root, r.destination);
    if (!fs.existsSync(destination)) return false;
    const stat = fs.statSync(destination);
    if (r.source)
      return (
        stat.ino === r.inode &&
        stat.dev === r.device &&
        !fs.existsSync(entryPath(root, r.source))
      );
    return (
      !!r.contentHash &&
      stat.isFile() &&
      digest(fs.readFileSync(destination, "utf8")) === r.contentHash
    );
  }
  finish() {
    if (this.active) fs.unlinkSync(this.active.file);
    this.active = undefined;
  }
  fail() {
    this.lastApplied ||= this.wasApplied();
    if (this.active && !this.active.record.applied) {
      const { root, record, file } = this.active;
      // If execution failed before changing the disk, there is nothing to replay.
      const destination = entryPath(root, record.destination);
      if (!fs.existsSync(destination)) fs.unlinkSync(file);
    }
    this.active = undefined;
  }
  recover(root: string) {
    const directory = this.directory(root);
    if (!fs.existsSync(directory)) return;
    for (const name of fs
      .readdirSync(directory)
      .filter((n) => /^[0-9a-f-]+\.json$/.test(n))) {
      const file = path.join(directory, name);
      if (fs.lstatSync(file).isSymbolicLink())
        throw Error("SYMLINK_NOT_ALLOWED");
      const r = JSON.parse(fs.readFileSync(file, "utf8")) as Record;
      if (r.version !== 1 || !r.next || !Array.isArray(r.next.files))
        throw Error("INVALID_ENTRY_JOURNAL");
      validateCommands(r.next.commands);
      const originalMetadata = JSON.parse(
        fs.readFileSync(projectConfig(root), "utf8"),
      );
      if (
        typeof r.next.id !== "string" ||
        r.next.id !== originalMetadata.id ||
        typeof r.next.name !== "string"
      )
        throw Error("INVALID_ENTRY_JOURNAL");
      for (const d of r.next.files) entryPath(root, d.name);
      for (const f of r.next.folders || []) entryPath(root, f);
      const destination = entryPath(root, r.destination);
      const source = r.source ? entryPath(root, r.source) : undefined;
      const config = projectConfig(root),
        existing = fs.readFileSync(config, "utf8");
      if (JSON.stringify(JSON.parse(existing)) === JSON.stringify(r.next)) {
        fs.unlinkSync(file);
        continue;
      }
      if (digest(existing) !== r.before) throw Error(tr("m833dbd27ebe5"));
      if (!fs.existsSync(destination)) {
        if (!r.applied && (!source || fs.existsSync(source))) {
          fs.unlinkSync(file);
          continue;
        }
        throw Error(tr("m68b0b3ddd90e"));
      }
      const stat = fs.statSync(destination);
      const moved =
        source &&
        (!fs.existsSync(source) ||
          source.toLowerCase() === destination.toLowerCase()) &&
        stat.ino === r.inode &&
        stat.dev === r.device;
      const created =
        !source &&
        (r.contentHash
          ? stat.isFile() &&
            digest(fs.readFileSync(destination, "utf8")) === r.contentHash
          : stat.isDirectory() && fs.readdirSync(destination).length === 0);
      if (!moved && !created) throw Error(tr("mf4276996c58f"));
      atomicWrite(config, JSON.stringify(r.next, null, 2));
      fs.unlinkSync(file);
    }
  }
}
