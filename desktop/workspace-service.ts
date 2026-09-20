import { findCommand } from "../app/command-catalog";
import {
  addFolder,
  applyTreeMove,
  planTreeMove,
  projectFolders,
  validFolderName,
  withinFolder,
} from "../app/workspace/file-tree";
import fs from "node:fs";
import { appendedScene, renamedSceneByName } from "../app/workspace/authoring";
export { navigateSession } from "../app/workspace/navigation";
export { restoreSession } from "../app/workspace/storage";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DocumentEngine,
  validDocumentName,
  validateCommands,
  validateProject,
  restoreProjects,
} from "../app/workspace/engine";
import {
  makeProject,
  type Project,
  type WorkspaceAction,
  type WorkspaceSnapshot,
  type ActionResult,
  type DocumentRecord,
} from "../app/workspace/types";

import {
  ProjectCatalog,
  canonicalPath,
  pathKey,
  projectConfig,
  validProjectFolderName,
} from "./project-catalog";
import { WorkspaceCache } from "./workspace-cache";
import { RecoveryStore } from "./recovery-store";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export { atomicWrite } from "./disk-io";
import { atomicWrite } from "./disk-io";
function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function readScript(file: string) {
  const b = fs.readFileSync(file);
  const value = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(b);
  return value;
}
export function withinRoot(root: string, name: string) {
  if (!validDocumentName(name)) throw Error("檔案路徑無效");
  const absolute = path.resolve(root, name),
    relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("檔案必須位於專案資料夾");
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw Error("不直接寫入符號連結，請開啟實際來源資料夾");
  }
  return absolute;
}
type Services = {
  chooseFolder: () => Promise<string | null>;
  chooseFiles: () => Promise<string[]>;
  saveDialog: (name: string) => Promise<string | null>;
  reveal: (file: string) => void;
  trash?: (file: string) => Promise<void>;
  changed: () => void;
};

export class WorkspaceService {
  engine: DocumentEngine;
  catalog: ProjectCatalog;
  recoveryStore: RecoveryStore;
  private cache: WorkspaceCache;
  private active = new Set<string>();
  notices: string[] = [];
  profileError = "";
  currentProjectId = "";
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private writeRetries = new Map<string, number>();
  private watchers = new Map<string, fs.FSWatcher>();
  private scans = new Map<string, ReturnType<typeof setTimeout>>();
  private profileFile: string;
  private snapshotTimer: ReturnType<typeof setInterval>;
  private lastSnapshots = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private profile: string,
    private services: Services,
  ) {
    this.profileFile = path.join(profile, "workspace-v2.json");
    let projects: Project[] = [];
    if (fs.existsSync(this.profileFile))
      try {
        const state = readJson(this.profileFile) as WorkspaceSnapshot;
        const restored = restoreProjects(state.projects);
        projects = restored.projects;
        this.notices.push(...restored.warnings);
        if (restored.warnings.length)
          fs.copyFileSync(
            this.profileFile,
            this.profileFile + ".damaged-" + Date.now(),
          );
        this.currentProjectId = state.currentProjectId;
      } catch (error) {
        const backup = this.profileFile + ".damaged-" + Date.now();
        fs.copyFileSync(this.profileFile, backup);
        this.notices.push(
          "工作區資料無法讀取，已保留救援副本：" +
            backup +
            "；" +
            String(error),
        );
      }
    this.engine = new DocumentEngine(projects);
    this.catalog = new ProjectCatalog(profile, projects);
    this.recoveryStore = new RecoveryStore(profile);
    this.cache = new WorkspaceCache(profile);
    for (const p of projects) {
      p.kind ||= p.root ? "project" : "legacy";
      for (const d of p.documents) d.composing = false;
    }
    for (const p of projects.filter((p) => p.root || p.kind === "standalone"))
      this.cache.save(p);
    this.engine.projects = projects.filter(
      (p) => !p.root && p.kind !== "standalone",
    );
    this.snapshotTimer = setInterval(() => {
      for (const p of this.engine.projects.filter((p) => this.active.has(p.id)))
        for (const d of p.documents)
          if (this.lastSnapshots.get(d.id) !== d.text) {
            this.engine.checkpoint(p.id, d.id, "定期快照");
            this.lastSnapshots.set(d.id, d.text);
          }
      this.changed();
    }, 60000);
    this.snapshotTimer.unref();
  }
  snapshot(): WorkspaceSnapshot {
    return structuredClone({
      projects: this.engine.projects,
      catalog: this.catalog.list(),
      preferences: this.catalog.preferences,
      currentProjectId: this.currentProjectId,
      notices: this.notices,
    });
  }
  persist() {
    for (const p of this.engine.projects.filter(
      (p) => p.root || p.kind === "standalone",
    )) {
      try {
        this.cache.save(this.recoveryStore.has(p) ? { ...p, recovery: [] } : p);
        if (p.persistenceError?.startsWith("工作區草稿尚未保存："))
          delete p.persistenceError;
      } catch (error) {
        // A different window's cache must not block leaving this workspace.
        p.persistenceError = "工作區草稿尚未保存：" + String(error);
      }
    }
    const state = this.snapshot();
    state.projects = state.projects.filter(
      (p) => !p.root && p.kind !== "standalone",
    );
    atomicWrite(this.profileFile, JSON.stringify(state));
  }
  private metadata(p: Project) {
    if (!p.root || p.kind === "standalone") return;
    const dir = path.join(p.root, ".spindle");
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      throw Error("專案設定目錄不可為符號連結");
    atomicWrite(
      projectConfig(p.root),
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    );
  }
  private changed() {
    for (const p of this.engine.projects.filter((p) => this.active.has(p.id))) {
      try {
        this.recoveryStore.persist(p);
        delete p.persistenceError;
      } catch (error) {
        p.persistenceError = "版本歷史尚未保存：" + String(error);
      }
    }
    try {
      for (const p of this.engine.projects)
        for (const d of p.documents)
          if (!d.path && d.error?.startsWith("復原草稿寫入失敗：")) {
            d.status = "draft";
            delete d.error;
          }
      this.persist();
      this.profileError = "";
      this.notices = this.notices.filter(
        (message) => !message.startsWith("復原草稿寫入失敗："),
      );
    } catch (error) {
      const message = "復原草稿寫入失敗：" + String(error);
      this.profileError = message;
      for (const p of this.engine.projects)
        for (const d of p.documents)
          if (!d.path) {
            d.status = "error";
            d.error = message;
          }
      if (!this.notices.includes(message)) this.notices.push(message);
    }
    this.services.changed();
  }
  async request(action: WorkspaceAction): Promise<ActionResult> {
    const task = this.queue.then(() => this.execute(action));
    this.queue = task.catch(() => undefined);
    return task;
  }
  private schedule(p: Project, d: DocumentRecord) {
    clearTimeout(this.timers.get(d.id));
    this.timers.delete(d.id);
    if (
      !d.path ||
      d.composing ||
      ["conflict", "missing"].includes(d.status) ||
      d.text === d.saved
    )
      return;
    this.timers.set(
      d.id,
      setTimeout(() => {
        this.timers.delete(d.id);
        this.saveDocument(p, d);
        this.changed();
      }, 800),
    );
  }
  saveDocument(p: Project, d: DocumentRecord, force = false) {
    clearTimeout(this.timers.get(d.id));
    this.timers.delete(d.id);
    if (d.composing) {
      d.status = "pending";
      return false;
    }
    if (!d.path) {
      d.saved = d.text;
      d.status = "draft";
      return true;
    }
    if (!force && ["conflict", "missing"].includes(d.status)) return false;
    try {
      if (p.root && withinRoot(p.root, d.name) !== d.path)
        throw Error("文件路徑與專案不一致");
      if (!fs.existsSync(d.path)) {
        d.status = "missing";
        d.error = "來源檔案已移除；請另存或明確恢復";
        return false;
      }
      const disk = readScript(d.path);
      if (!force && d.diskHash && hash(disk) !== d.diskHash) {
        d.externalText = disk;
        d.status = "conflict";
        d.error = "磁碟檔案已由其他程式修改";
        return false;
      }
      if ((fs.statSync(d.path).mode & 0o222) === 0) throw Error("檔案為唯讀");
      d.status = "saving";
      atomicWrite(d.path, d.text, () => {
        if (!fs.existsSync(d.path!)) throw Error("來源檔案已移除");
        if (!force && d.diskHash && hash(readScript(d.path!)) !== d.diskHash)
          throw Error("寫入期間磁碟版本已改變");
      });
      d.saved = d.text;
      d.diskHash = hash(d.text);
      d.status = "saved";
      this.writeRetries.delete(d.id);
      delete d.error;
      delete d.externalText;
      return true;
    } catch (error) {
      d.status = "error";
      try {
        if (!fs.existsSync(d.path)) {
          d.status = "missing";
        } else {
          const disk = readScript(d.path);
          if (d.diskHash && hash(disk) !== d.diskHash) {
            d.status = "conflict";
            d.externalText = disk;
          }
        }
      } catch {
        /* Keep the write failure and in-memory content. */
      }
      d.error = String(error);
      const code = (error as NodeJS.ErrnoException).code;
      const attempts = this.writeRetries.get(d.id) || 0;
      if (
        d.status === "error" &&
        code &&
        ["EPERM", "EBUSY", "EACCES"].includes(code) &&
        attempts < 3
      ) {
        this.writeRetries.set(d.id, attempts + 1);
        this.timers.set(
          d.id,
          setTimeout(
            () => {
              this.saveDocument(p, d);
              this.changed();
            },
            120 * (attempts + 1),
          ),
        );
      }
      return false;
    }
  }
  flush(projectId?: string) {
    const failures: DocumentRecord[] = [];
    for (const p of this.engine.projects.filter(
      (p) => !projectId || p.id === projectId,
    ))
      for (const d of p.documents)
        if (
          d.composing ||
          d.text !== d.saved ||
          ["error", "conflict", "missing"].includes(d.status)
        ) {
          if (!this.saveDocument(p, d)) failures.push(d);
        }
    this.changed();
    for (const p of this.engine.projects.filter(
      (p) => !projectId || p.id === projectId,
    ))
      for (const d of p.documents)
        if (!d.path && d.status === "error" && !failures.includes(d))
          failures.push(d);
    return failures;
  }
  setActiveProjects(ids: string[]) {
    const next = new Set(ids);
    for (const id of this.active)
      if (!next.has(id)) {
        this.watchers.get(id)?.close();
        this.watchers.delete(id);
        clearTimeout(this.scans.get(id));
        this.scans.delete(id);
        const departing = this.engine.projects.find((p) => p.id === id);
        if (departing && (departing.root || departing.kind === "standalone")) {
          this.cache.save(
            this.recoveryStore.has(departing)
              ? { ...departing, recovery: [] }
              : departing,
          );
          this.recoveryStore.forget(departing);
          this.engine.projects = this.engine.projects.filter(
            (p) => p.id !== id,
          );
        }
        for (const d of departing?.documents || []) {
          this.engine.resetDocument(d.id);
          clearTimeout(this.timers.get(d.id));
          this.timers.delete(d.id);
        }
      }
    const added = [...next].filter((id) => !this.active.has(id));
    this.active = next;
    for (const p of this.engine.projects.filter((p) => added.includes(p.id))) {
      this.scan(p);
      this.watch(p);
      for (const d of p.documents) this.schedule(p, d);
    }
  }
  private watch(p: Project) {
    const watchRoot =
      p.kind === "standalone" ? path.dirname(p.documents[0].path!) : p.root;
    if (!watchRoot || this.watchers.has(p.id)) return;
    try {
      const watcher = fs.watch(
        watchRoot,
        { recursive: p.kind !== "standalone" },
        (_event, file) => {
          if (
            file?.toString().includes(".spindle") ||
            file?.toString().endsWith(".tmp")
          )
            return;
          clearTimeout(this.scans.get(p.id));
          this.scans.set(
            p.id,
            setTimeout(() => {
              this.scan(p);
              this.changed();
            }, 180),
          );
        },
      );
      watcher.on("error", (error) => {
        this.notices.push("資料夾監看失敗：" + String(error));
        this.services.changed();
      });
      this.watchers.set(p.id, watcher);
    } catch (error) {
      this.notices.push("無法監看資料夾：" + String(error));
    }
  }
  private listFiles(root: string, folders?: string[]): string[] {
    const found: string[] = [];
    const visit = (directory: string) => {
      for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
          e.isSymbolicLink() ||
          [".git", ".spindle", "node_modules"].includes(e.name)
        )
          continue;
        const file = path.join(directory, e.name);
        if (e.isDirectory()) {
          folders?.push(path.relative(root, file).replace(/\\/g, "/"));
          visit(file);
        } else if (e.isFile() && e.name.toLowerCase().endsWith(".yarn"))
          found.push(path.relative(root, file).replace(/\\/g, "/"));
      }
    };
    visit(root);
    return found.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }
  private scan(p: Project) {
    if (!p.root && p.kind !== "standalone") return;
    try {
      const folders: string[] = [];
      const names =
        p.kind === "standalone"
          ? p.documents.map((d) => d.name)
          : this.listFiles(p.root!, folders);
      p.folders = folders;
      for (const d of p.documents.filter((d) => d.path)) {
        if (!fs.existsSync(d.path!)) {
          d.status = "missing";
          d.error = "來源檔案已移除；內容仍保留";
          continue;
        }
        const disk = readScript(d.path!);
        if (hash(disk) === d.diskHash) continue;
        if (d.text === d.saved && !d.composing) {
          this.engine.replace(p.id, d.id, disk, "外部更新");
          d.saved = disk;
          d.diskHash = hash(disk);
          d.status = "saved";
          delete d.externalText;
          delete d.error;
        } else {
          d.externalText = disk;
          d.status = "conflict";
          d.error = "本地與磁碟都有修改，自動保存已暫停";
        }
      }
      for (const name of names)
        if (
          !p.excluded.includes(name) &&
          !p.documents.some((d) => d.name.toLowerCase() === name.toLowerCase())
        ) {
          const file = withinRoot(p.root!, name),
            value = readScript(file);
          const d = this.engine.create(p.id, name, value);
          d.path = file;
          d.diskHash = hash(value);
          d.status = "saved";
        }
    } catch (error) {
      this.notices.push("重新讀取專案失敗：" + String(error));
      for (const d of p.documents.filter((d) => d.path)) {
        d.status = "error";
        d.error = String(error);
      }
    }
  }
  openFolder(root: string) {
    root = fs.realpathSync(root);
    let existing = this.engine.projects.find(
      (p) =>
        p.kind !== "standalone" && p.root?.toLowerCase() === root.toLowerCase(),
    );

    const configFile = projectConfig(root);
    let metadata: {
      id?: string;
      name?: string;
      commands?: Project["commands"];
      files?: { id: string; name: string }[];
      excluded?: string[];
      folders?: string[];
      treeOrder?: string[];
    } = {};
    if (fs.existsSync(configFile)) {
      try {
        metadata = readJson(configFile) as typeof metadata;
        if (
          !metadata ||
          Array.isArray(metadata) ||
          typeof metadata !== "object"
        )
          throw Error("設定格式無效");
        validateCommands(
          metadata.commands === undefined ? [] : metadata.commands,
        );
        if (
          metadata.files &&
          (!Array.isArray(metadata.files) ||
            metadata.files.some(
              (f) =>
                !f || typeof f.id !== "string" || typeof f.name !== "string",
            ))
        )
          throw Error("專案檔案清單無效");
        if (
          metadata.files &&
          (new Set(metadata.files.map((f) => f.id)).size !==
            metadata.files.length ||
            new Set(metadata.files.map((f) => f.name.toLowerCase())).size !==
              metadata.files.length)
        )
          throw Error("專案檔案識別重複");
        if (
          (metadata.name !== undefined && typeof metadata.name !== "string") ||
          (metadata.id !== undefined && typeof metadata.id !== "string") ||
          (metadata.excluded !== undefined &&
            (!Array.isArray(metadata.excluded) ||
              metadata.excluded.some((n) => typeof n !== "string")))
        )
          throw Error("專案設定格式無效");
      } catch (error) {
        throw Error("專案設定無法讀取，原始設定已保留：" + String(error));
      }
    }
    if (!existing) {
      const cachedId =
        metadata.id ||
        this.catalog.entries.find((e) => pathKey(e.root) === pathKey(root))?.id;
      const cached = cachedId ? this.cache.load(cachedId) : undefined;
      if (cached?.root && pathKey(cached.root) === pathKey(root)) {
        existing = cached;
        this.engine.projects.push(existing);
        for (const d of existing.documents) {
          d.version = 0;
          d.composing = false;
          this.engine.resetDocument(d.id);
        }
      }
    }
    if (existing) {
      existing.kind = "project";
      if (metadata.name) existing.name = metadata.name;
      this.recoveryStore.load(existing);
      this.scan(existing);
      this.metadata(existing);
      this.currentProjectId = existing.id;
      this.active.add(existing.id);
      this.watch(existing);
      this.catalog.opened(existing);
      return existing;
    }

    const p = makeProject(
      metadata.name || path.basename(root),
      [],
      metadata.commands || [],
    );
    p.root = root;
    p.kind = "project";
    p.id =
      metadata.id &&
      !this.engine.projects.some((x) => x.id === metadata.id) &&
      !this.catalog.entries.some(
        (e) => e.id === metadata.id && pathKey(e.root) !== pathKey(root),
      )
        ? metadata.id
        : p.id;
    p.excluded = Array.isArray(metadata.excluded) ? metadata.excluded : [];
    p.folders = [];
    p.treeOrder = Array.isArray(metadata.treeOrder)
      ? metadata.treeOrder.filter((k) => typeof k === "string")
      : [];
    const loaded = this.listFiles(root, p.folders)
      .filter((name) => !p.excluded.includes(name))
      .map((name) => {
        const file = withinRoot(root, name),
          value = readScript(file),
          id = metadata.files?.find((f) => f.name === name)?.id;
        return {
          id:
            id &&
            p.id === metadata.id &&
            !this.engine.projects.some((project) =>
              project.documents.some((document) => document.id === id),
            )
              ? id
              : randomUUID(),
          name,
          text: value,
          saved: value,
          version: 0,
          path: file,
          diskHash: hash(value),
          status: "saved" as const,
        };
      });
    const savedOrder = new Map(
      (metadata.files || []).map((file, index) => [
        file.name.toLowerCase(),
        index,
      ]),
    );
    p.documents = loaded.sort(
      (a, b) =>
        (savedOrder.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
        (savedOrder.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER),
    );
    validateProject(p);
    const remap = new Map(
      (metadata.files || []).flatMap((f) => {
        const d = p.documents.find((d) => d.name === f.name);
        return d ? [[f.id, d.id]] : [];
      }),
    );
    this.recoveryStore.load(p, remap, !!metadata.id && p.id !== metadata.id);
    this.metadata(p);
    this.engine.projects.push(p);
    this.currentProjectId = p.id;
    this.active.add(p.id);
    this.watch(p);
    this.catalog.opened(p);
    return p;
  }
  openStandalone(file: string) {
    file = canonicalPath(file);
    let existing = this.engine.projects.find(
      (p) =>
        p.kind === "standalone" &&
        pathKey(p.documents[0]?.path || "") === pathKey(file),
    );
    if (!existing) {
      existing = this.cache.load("single-" + hash(pathKey(file)).slice(0, 24));
      if (existing) {
        this.engine.projects.push(existing);
        for (const d of existing.documents) {
          d.version = 0;
          d.composing = false;
          this.engine.resetDocument(d.id);
        }
      }
    }
    if (existing) {
      this.recoveryStore.load(existing);
      this.scan(existing);
      this.active.add(existing.id);
      this.watch(existing);
      return existing;
    }
    const p = makeProject(path.basename(file));
    p.kind = "standalone";
    p.id = "single-" + hash(pathKey(file)).slice(0, 24);
    this.engine.projects.push(p);
    const d = this.engine.create(p.id, path.basename(file), readScript(file));
    d.path = file;
    d.diskHash = hash(d.text);
    d.status = "saved";
    this.recoveryStore.load(p);
    this.currentProjectId = p.id;
    this.active.add(p.id);
    this.watch(p);
    return p;
  }
  private async execute(a: WorkspaceAction): Promise<ActionResult> {
    let projectId: string | undefined, documentId: string | undefined;
    if (a.type === "snapshot") return { snapshot: this.snapshot() };
    if (a.type === "updates")
      return {
        snapshot: this.snapshot(),
        updates: this.engine.updates(a.projectId, a.documentId, a.version),
      };
    if (a.type === "bootstrap") {
      if (!this.engine.projects.length && a.legacy?.documents.length) {
        const p = makeProject(
          this.notices.length ? "復原工作區" : a.legacy?.name || "未命名專案",
          this.notices.length ? [] : a.legacy?.documents || [],
          this.notices.length ? [] : a.legacy?.commands || [],
        );
        validateProject(p);
        this.engine.projects.push(p);
        this.currentProjectId = p.id;
      }
    } else if (a.type === "openFolder") {
      const root = a.root || (await this.services.chooseFolder());
      if (!root) return { snapshot: this.snapshot(), cancelled: true };
      projectId = this.openFolder(root).id;
    } else if (a.type === "openFiles") {
      const files = a.paths || (await this.services.chooseFiles());
      if (!files.length) return { snapshot: this.snapshot(), cancelled: true };
      for (const file of files) {
        if (fs.statSync(file).isDirectory()) {
          projectId = this.openFolder(file).id;
          continue;
        }
        if (!file.toLowerCase().endsWith(".yarn"))
          throw Error("請開啟 .yarn 或專案資料夾");
        const match = this.catalog.match(file);
        const p = match
          ? this.openFolder(match.root)
          : this.openStandalone(file);
        projectId = p.id;
        documentId = p.documents.find(
          (d) => d.path?.toLowerCase() === canonicalPath(file).toLowerCase(),
        )?.id;
      }
    } else if (a.type === "createProject") {
      const root = a.root || (await this.services.chooseFolder());
      if (!root) return { snapshot: this.snapshot(), cancelled: true };
      if (!validProjectFolderName(a.name))
        throw Error("請輸入有效的專案資料夾名稱");
      const parent = canonicalPath(root),
        target = path.join(parent, a.name);
      if (fs.existsSync(target)) throw Error("目的資料夾已存在");
      fs.mkdirSync(target);
      const p = this.openFolder(target);
      projectId = p.id;
    } else if (a.type === "chooseProjectParent") {
      const selected = await this.services.chooseFolder();
      return {
        snapshot: this.snapshot(),
        path: selected || undefined,
        cancelled: !selected,
      };
    } else if (a.type === "catalog") {
      const entry = this.catalog.entries.find((e) => e.id === a.id);
      if (!entry) throw Error("專案紀錄已不存在");
      if (a.operation === "reveal") this.services.reveal(entry.root);
      else if (a.operation === "rename") {
        this.catalog.rename(a.id, a.name || "");
        const loaded = this.engine.projects.find((p) => p.id === a.id);
        if (loaded) loaded.name = a.name!.trim();
      } else this.catalog.remove(a.id, a.operation === "removeRecent");
    } else if (a.type === "preferences") {
      this.catalog.preferences.reopenLastProject = a.reopenLastProject;
      this.catalog.persist();
    } else if (a.type === "closeProject") {
      const failed = this.flush(a.projectId);
      if (
        failed.length ||
        this.profileError ||
        this.engine.project(a.projectId).persistenceError
      )
        throw Error(
          failed.map((d) => d.name + "：" + d.error).join("\n") ||
            this.engine.project(a.projectId).persistenceError ||
            this.profileError,
        );
      if (this.catalog.preferences.lastProjectId === a.projectId) {
        delete this.catalog.preferences.lastProjectId;
        this.catalog.persist();
      }
    } else if (a.type === "migrateDraft") {
      const legacy = this.engine.project(a.projectId);
      const created = await this.execute({
        type: "createProject",
        name: a.name,
        root: a.root,
      });
      const p = this.engine.project(created.projectId!);
      p.commands = structuredClone(legacy.commands);
      p.commandDraft = structuredClone(legacy.commandDraft);
      const remap = new Map<string, string>();
      for (const d of legacy.documents) {
        const result = await this.execute({
          type: "createDocument",
          projectId: p.id,
          name: d.name,
          text: d.text,
        });
        if (result.documentId) remap.set(d.id, result.documentId);
      }
      p.recovery = structuredClone(legacy.recovery).map((e) => ({
        ...e,
        documentId: remap.get(e.documentId) || e.documentId,
        files: e.files?.map((f) => ({ ...f, id: remap.get(f.id) || f.id })),
      }));
      this.recoveryStore.persist(p);
      this.metadata(p);
      projectId = p.id;
      this.engine.projects = this.engine.projects.filter(
        (item) => item !== legacy,
      );
    } else if (a.type === "purgeTrash") {
      const p = this.engine.project(a.projectId);
      this.recoveryStore.load(p);
      this.recoveryStore.purge(p, a.recoveryId);
    } else if (a.type === "import") {
      const p = validateProject(a.project);
      p.id = randomUUID();
      delete p.root;
      for (const d of p.documents) {
        d.id = randomUUID();
        delete d.path;
        delete d.diskHash;
        d.version = 0;
        d.status = "draft";
      }
      this.engine.projects.push(p);
      this.currentProjectId = p.id;
      projectId = p.id;
    } else {
      const p = this.engine.project(a.projectId);
      if (a.type === "edit") {
        this.engine.edit(p.id, a.documentId, a.version, a.updates);
        this.schedule(p, this.engine.document(p.id, a.documentId));
      } else if (a.type === "undo" || a.type === "redo") {
        this.engine.undo(p.id, a.documentId, a.type === "redo");
        for (const d of p.documents) this.schedule(p, d);
      } else if (a.type === "transaction") {
        this.engine.transaction(p.id, a.label, a.documents);
        for (const d of p.documents) this.schedule(p, d);
      } else if (a.type === "createScene" || a.type === "renameScene") {
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
        for (const d of p.documents) this.schedule(p, d);
      } else if (a.type === "composition") {
        const d = this.engine.document(p.id, a.documentId);
        d.composing = a.active;
        this.schedule(p, d);
      } else if (a.type === "save") {
        if (a.documentId) {
          const d = this.engine.document(p.id, a.documentId);
          this.saveDocument(p, d);
        } else this.flush(p.id);
      } else if (a.type === "renameProject") {
        p.name = a.name.trim() || p.name;
        this.metadata(p);
        this.catalog.opened(p);
      } else if (a.type === "commands" || a.type === "registerCommand") {
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
        const previous = p.commands;
        if (JSON.stringify(previous) !== JSON.stringify(commands)) {
          p.recovery.push({
            id: randomUUID(),
            documentId: "@commands",
            name: "指令定義",
            text: JSON.stringify(previous),
            at: Date.now(),
            reason: "修改指令前",
          });
          p.recovery = p.recovery
            .filter((e) => e.documentId !== "@commands")
            .concat(
              p.recovery.filter((e) => e.documentId === "@commands").slice(-50),
            );
          this.persist();
        }
        p.commands = commands;
        try {
          this.metadata(p);
        } catch (error) {
          p.commands = previous;
          throw error;
        }
      } else if (a.type === "commandDraft") p.commandDraft = a.draft;
      else if (a.type === "createDocument") {
        const d = this.engine.create(p.id, a.name, a.text, a.firstInOrder);
        documentId = d.id;
        if (p.root) {
          let createdFile: string | undefined;
          let createdIdentity: fs.Stats | undefined;
          try {
            const file = withinRoot(p.root, d.name);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const fd = fs.openSync(file, "wx");
            createdFile = file;
            try {
              createdIdentity = fs.fstatSync(fd);
              fs.writeFileSync(fd, d.text, { encoding: "utf8" });
              fs.fsyncSync(fd);
            } finally {
              fs.closeSync(fd);
            }
            d.path = file;
            d.diskHash = hash(d.text);
            d.status = "saved";
            this.metadata(p);
          } catch (error) {
            if (!d.path) {
              // Only remove the file created by this request. EEXIST or a replacement
              // from another process must never cause deletion of somebody else's file.
              let cleanupFailure: unknown;
              if (createdFile && createdIdentity) {
                try {
                  const current = fs.lstatSync(createdFile);
                  if (
                    !current.isSymbolicLink() &&
                    current.dev === createdIdentity.dev &&
                    current.ino === createdIdentity.ino
                  )
                    fs.unlinkSync(createdFile);
                } catch (cleanupError) {
                  if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
                    cleanupFailure = cleanupError;
                }
              }
              p.documents = p.documents.filter(
                (document) => document.id !== d.id,
              );
              if (cleanupFailure)
                throw Error(
                  String(error) +
                    "；未完成檔案無法清理，請檢查磁碟權限後重試：" +
                    String(cleanupFailure),
                );
              throw error;
            }
            d.status = "error";
            d.error = String(error);
          }
        }
      } else if (a.type === "saveAs") {
        const d = this.engine.document(p.id, a.documentId),
          file = await this.services.saveDialog(d.name);
        if (!file) return { snapshot: this.snapshot(), cancelled: true };
        if (!file.endsWith(".yarn")) throw Error("檔案副檔名必須為 .yarn");
        const absolute = path.resolve(file),
          relative = p.root ? path.relative(p.root, absolute) : null;
        if (
          this.engine.projects.some((project) =>
            project.documents.some(
              (other) =>
                other.id !== d.id &&
                other.path?.toLowerCase() === absolute.toLowerCase(),
            ),
          )
        )
          throw Error("目的檔案已在工作區開啟，請使用其他檔名");
        const inside =
          relative && !relative.startsWith("..") && !path.isAbsolute(relative);
        if (inside) {
          withinRoot(p.root!, relative.replace(/\\/g, "/"));
          atomicWrite(absolute, d.text);
          d.path = absolute;
          d.name = relative.replace(/\\/g, "/");
          d.saved = d.text;
          d.diskHash = hash(d.text);
          d.status = "saved";
          delete d.error;
          delete d.externalText;
          this.metadata(p);
          documentId = d.id;
          projectId = p.id;
        } else {
          const targetRoot = path.dirname(absolute),
            targetName = path.basename(absolute);
          if (!validDocumentName(targetName)) throw Error("目的檔名無效");
          const target = this.openFolder(targetRoot);
          if (
            target.documents.some(
              (other) => other.path?.toLowerCase() === absolute.toLowerCase(),
            )
          )
            throw Error("目的檔案已存在於專案，請選擇其他檔名");
          atomicWrite(absolute, d.text);
          const copy = this.engine.create(target.id, targetName, d.text);
          copy.path = absolute;
          copy.diskHash = hash(d.text);
          copy.status = "saved";
          target.excluded = target.excluded.filter(
            (name) => name !== targetName,
          );
          this.metadata(target);
          projectId = target.id;
          documentId = copy.id;
        }
      } else if (a.type === "createFolder") {
        const draft = structuredClone(p);
        addFolder(draft, a.name);
        if (p.root)
          fs.mkdirSync(
            path.dirname(withinRoot(p.root, a.name + "/folder.yarn")),
          );
        p.folders = draft.folders;
        p.treeOrder = draft.treeOrder;
        this.metadata(p);
      } else if (a.type === "moveEntry") {
        const plan = planTreeMove(p, a.entry, a.parent, a.name, a.before);
        if (p.root && plan.path !== plan.target) {
          for (const d of plan.documents)
            if (d.path && !this.saveDocument(p, d))
              throw Error(d.error || "請先完成儲存");
          const from = plan.folder
            ? path.dirname(withinRoot(p.root, plan.path + "/folder.yarn"))
            : withinRoot(p.root, plan.path);
          const to = plan.folder
            ? path.dirname(withinRoot(p.root, plan.target + "/folder.yarn"))
            : withinRoot(p.root, plan.target);
          if (fs.existsSync(to) && from.toLowerCase() !== to.toLowerCase())
            throw Error("目的位置已存在");
          // Both paths are verified inside the project, including symlink ancestors.
          if (plan.folder || plan.documents.some((d) => d.path))
            fs.renameSync(from, to);
          for (const d of plan.documents)
            if (d.path) d.path = withinRoot(p.root, plan.mapPath(d.name));
        }
        applyTreeMove(p, plan);
        this.metadata(p);
      } else if (a.type === "trashFolder") {
        if (!validFolderName(a.name) || !projectFolders(p).includes(a.name))
          throw Error("資料夾已不存在");
        const children = p.documents.filter((d) =>
          withinFolder(d.name, a.name),
        );
        for (const d of children)
          if (!this.saveDocument(p, d)) throw Error(d.error || "請先完成保存");
        this.recoveryStore.moveToTrash(p, a.name, true);
        for (const d of children) {
          clearTimeout(this.timers.get(d.id));
          this.engine.resetDocument(d.id);
        }
        this.metadata(p);
      } else if (a.type === "renameDocument") {
        const d = this.engine.document(p.id, a.documentId),
          name = a.name.replace(/\\/g, "/");
        if (
          !validDocumentName(name) ||
          p.documents.some(
            (x) => x.id !== d.id && x.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw Error("檔名無效或已存在");
        if (d.path && p.root) {
          if (!this.saveDocument(p, d)) throw Error(d.error || "請先完成儲存");
          const target = withinRoot(p.root!, name);
          if (
            fs.existsSync(target) &&
            target.toLowerCase() !== d.path.toLowerCase()
          )
            throw Error("目的檔案已存在");
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(d.path, target);
          d.path = target;
        }
        d.name = name;
        this.metadata(p);
      } else if (a.type === "removeDocument") {
        const d = this.engine.document(p.id, a.documentId);
        if (!p.root) throw Error("單檔模式不提供專案刪除操作");
        if (!this.saveDocument(p, d)) throw Error(d.error || "請先完成保存");
        this.recoveryStore.moveToTrash(p, d.name, false);
        clearTimeout(this.timers.get(d.id));
        this.engine.resetDocument(d.id);
        this.metadata(p);
      } else if (a.type === "resolve") {
        const d = this.engine.document(p.id, a.documentId);
        this.engine.checkpoint(p.id, d.id, "解決外部修改前");
        if (a.choice === "disk") {
          if (!d.path || !fs.existsSync(d.path))
            throw Error("磁碟檔案已不存在，請另存");
          const disk = readScript(d.path);
          this.engine.replace(p.id, d.id, disk, "採用磁碟版本");
          d.saved = disk;
          d.diskHash = hash(disk);
          d.status = "saved";
          delete d.error;
          delete d.externalText;
        } else this.saveDocument(p, d, true);
      } else if (a.type === "recover") {
        const entry = p.recovery.find((e) => e.id === a.recoveryId);
        if (!entry) throw Error("找不到復原項目");
        if (entry.deleted) {
          const before = new Set(p.documents.map((d) => d.id));
          documentId = this.recoveryStore.restore(p, entry);
          for (const d of p.documents)
            if (!before.has(d.id)) this.engine.resetDocument(d.id);
          this.metadata(p);
          this.changed();
          return { snapshot: this.snapshot(), documentId };
        }
        if (entry.documentId === "@commands") {
          if (
            a.expectedText !== undefined &&
            JSON.stringify(p.commands) !== a.expectedText
          )
            throw Error("指令已變更，請重新比較後再還原");
          const commands = JSON.parse(entry.text);
          validateCommands(commands);
          const previous = p.commands;
          p.commands = commands;
          try {
            this.metadata(p);
          } catch (error) {
            p.commands = previous;
            throw error;
          }
          p.recovery.push({
            id: randomUUID(),
            documentId: "@commands",
            name: "指令定義",
            text: JSON.stringify(previous),
            at: Date.now(),
            reason: "恢復指令前",
          });
          delete p.commandDraft;
          this.changed();
          return { snapshot: this.snapshot(), documentId: "@commands" };
        }
        const d = p.documents.find((d) => d.id === entry.documentId);
        if (d) {
          if (
            (a.expectedVersion !== undefined &&
              d.version !== a.expectedVersion) ||
            (a.expectedText !== undefined && d.text !== a.expectedText)
          )
            throw Error("內容已變更，請重新比較後再還原");
          this.engine.checkpoint(p.id, d.id, "恢復快照前");
          this.engine.replace(p.id, d.id, entry.text, "恢復快照");
          this.schedule(p, d);
          documentId = d.id;
        } else {
          let name = entry.name,
            i = 2;
          while (
            p.documents.some(
              (d) => d.name.toLowerCase() === name.toLowerCase(),
            ) ||
            (p.root && fs.existsSync(withinRoot(p.root!, name)))
          )
            name = entry.name.replace(/\.yarn$/, `-recovered-${i++}.yarn`);
          if (p.root) {
            const file = withinRoot(p.root!, name);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, entry.text, {
              encoding: "utf8",
              flag: "wx",
            });
          }
          const restored = this.engine.create(p.id, name, entry.text);
          documentId = restored.id;
          p.excluded = p.excluded.filter((n) => n !== name);
          if (p.root) {
            restored.path = withinRoot(p.root!, name);
            restored.diskHash = hash(restored.text);
            restored.status = "saved";
            this.metadata(p);
          }
        }
      } else if (a.type === "sortDocuments") {
        if (
          a.documentIds.length !== p.documents.length ||
          new Set(a.documentIds).size !== p.documents.length
        )
          throw Error("排序清單無效");
        const docs = a.documentIds.map((id) => this.engine.document(p.id, id));
        p.documents = docs;
        this.metadata(p);
      } else if (a.type === "reveal") {
        const file = a.documentId
          ? this.engine.document(p.id, a.documentId).path
          : p.root;
        if (!file) throw Error("此項目尚未連結磁碟路徑");
        this.services.reveal(file);
      } else if (a.type === "export") {
        const d = a.documentId
          ? this.engine.document(p.id, a.documentId)
          : null;
        const name = d
          ? path.basename(d.name)
          : p.name + ".yarn-workspace.json";
        const file = await this.services.saveDialog(name);
        if (!file) return { snapshot: this.snapshot(), cancelled: true };
        atomicWrite(
          file,
          d
            ? d.text
            : JSON.stringify(
                {
                  format: "yarn-workbench",
                  version: 2,
                  commandDraft: p.commandDraft,
                  name: p.name,
                  files: p.documents.map((d) => ({
                    id: d.id,
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
      }
    }
    this.changed();
    return { snapshot: this.snapshot(), projectId, documentId };
  }
  dispose() {
    for (const t of this.timers.values()) clearTimeout(t);
    for (const t of this.scans.values()) clearTimeout(t);
    for (const w of this.watchers.values()) w.close();
    clearInterval(this.snapshotTimer);
  }
}
