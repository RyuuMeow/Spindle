import fs from "node:fs";
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

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function atomicWrite(
  file: string,
  content: string,
  beforeCommit?: () => void,
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(fd, content, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    beforeCommit?.();
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
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
  changed: () => void;
};

export class WorkspaceService {
  engine: DocumentEngine;
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
    for (const p of projects) {
      for (const d of p.documents) d.composing = false;
      if (p.root) {
        this.scan(p);
        this.watch(p);
        for (const d of p.documents) this.schedule(p, d);
      }
    }
    this.snapshotTimer = setInterval(() => {
      for (const p of this.engine.projects)
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
      currentProjectId: this.currentProjectId,
      notices: this.notices,
    });
  }
  persist() {
    atomicWrite(this.profileFile, JSON.stringify(this.snapshot()));
  }
  private metadata(p: Project) {
    if (!p.root) return;
    const dir = path.join(p.root, ".yarn-workbench");
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      throw Error("專案設定目錄不可為符號連結");
    atomicWrite(
      path.join(dir, "project.json"),
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
        },
        null,
        2,
      ),
    );
  }
  private changed() {
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
  private watch(p: Project) {
    if (!p.root || this.watchers.has(p.id)) return;
    try {
      const watcher = fs.watch(p.root, { recursive: true }, (_event, file) => {
        if (
          file?.toString().includes(".yarn-workbench") ||
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
      });
      watcher.on("error", (error) => {
        this.notices.push("資料夾監看失敗：" + String(error));
        this.services.changed();
      });
      this.watchers.set(p.id, watcher);
    } catch (error) {
      this.notices.push("無法監看資料夾：" + String(error));
    }
  }
  private listFiles(root: string): string[] {
    const found: string[] = [];
    const visit = (directory: string) => {
      for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
          e.isSymbolicLink() ||
          [".git", ".yarn-workbench", "node_modules"].includes(e.name)
        )
          continue;
        const file = path.join(directory, e.name);
        if (e.isDirectory()) visit(file);
        else if (e.isFile() && e.name.endsWith(".yarn"))
          found.push(path.relative(root, file).replace(/\\/g, "/"));
      }
    };
    visit(root);
    return found.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }
  private scan(p: Project) {
    if (!p.root) return;
    try {
      const names = this.listFiles(p.root);
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
          const file = withinRoot(p.root, name),
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
    const existing = this.engine.projects.find(
      (p) => p.root?.toLowerCase() === root.toLowerCase(),
    );
    if (existing) {
      this.scan(existing);
      this.currentProjectId = existing.id;
      return existing;
    }
    const configFile = path.join(root, ".yarn-workbench", "project.json");
    let metadata: {
      id?: string;
      name?: string;
      commands?: Project["commands"];
      files?: { id: string; name: string }[];
      excluded?: string[];
    } = {};
    if (fs.existsSync(configFile)) {
      try {
        metadata = readJson(configFile) as typeof metadata;
        if (!metadata || typeof metadata !== "object")
          throw Error("設定格式無效");
        validateCommands(metadata.commands || []);
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
        const rescue = path.join(
          this.profile,
          "project-config-recovery-" + Date.now() + ".json",
        );
        atomicWrite(rescue, fs.readFileSync(configFile, "utf8"));
        this.notices.push(
          "專案設定無法讀取，劇本仍開啟；救援副本：" +
            rescue +
            "；" +
            String(error),
        );
        metadata = {};
      }
    }
    const p = makeProject(
      metadata.name || path.basename(root),
      [],
      metadata.commands || [],
    );
    p.root = root;
    p.id =
      metadata.id && !this.engine.projects.some((x) => x.id === metadata.id)
        ? metadata.id
        : p.id;
    p.excluded = Array.isArray(metadata.excluded) ? metadata.excluded : [];
    const loaded = this.listFiles(root)
      .filter((name) => !p.excluded.includes(name))
      .map((name) => {
        const file = withinRoot(root, name),
          value = readScript(file),
          id = metadata.files?.find((f) => f.name === name)?.id;
        return {
          id:
            id &&
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
    p.documents = loaded;
    validateProject(p);
    this.engine.projects.push(p);
    this.currentProjectId = p.id;
    try {
      this.metadata(p);
    } catch (error) {
      this.notices.push(
        "專案識別設定尚未寫入；文件內容仍保留於工作區：" + String(error),
      );
    }
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
      if (!this.engine.projects.length) {
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
      const root = await this.services.chooseFolder();
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
        if (!file.endsWith(".yarn")) throw Error("請開啟 .yarn 或專案資料夾");
        const p = this.openFolder(path.dirname(file));
        projectId = p.id;
        documentId = p.documents.find(
          (d) => d.path?.toLowerCase() === path.resolve(file).toLowerCase(),
        )?.id;
      }
    } else if (a.type === "createProject") {
      const root = a.root || (await this.services.chooseFolder());
      if (!root) return { snapshot: this.snapshot(), cancelled: true };
      const p = this.openFolder(root);
      p.name = a.name.trim() || path.basename(root);
      this.metadata(p);
      projectId = p.id;
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
      } else if (a.type === "commands") {
        validateCommands(a.commands);
        const previous = p.commands;
        if (JSON.stringify(previous) !== JSON.stringify(a.commands)) {
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
        p.commands = a.commands;
        try {
          this.metadata(p);
        } catch (error) {
          p.commands = previous;
          throw error;
        }
      } else if (a.type === "commandDraft") p.commandDraft = a.draft;
      else if (a.type === "createDocument") {
        const d = this.engine.create(p.id, a.name, a.text);
        documentId = d.id;
        if (p.root) {
          try {
            const file = withinRoot(p.root, d.name);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, d.text, { encoding: "utf8", flag: "wx" });
            d.path = file;
            d.diskHash = hash(d.text);
            d.status = "saved";
            this.metadata(p);
          } catch (error) {
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
          const target = withinRoot(p.root, name);
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
        this.engine.checkpoint(
          p.id,
          d.id,
          a.deleteDisk ? "刪除檔案" : "從專案移除",
          true,
        );
        this.persist();
        clearTimeout(this.timers.get(d.id));
        if (a.deleteDisk && d.path) {
          if (p.root) withinRoot(p.root, d.name);
          fs.unlinkSync(d.path);
        } else if (d.path) p.excluded.push(d.name);
        p.documents = p.documents.filter((x) => x.id !== d.id);
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
        if (entry.documentId === "@commands") {
          if (a.expectedText !== undefined && JSON.stringify(p.commands) !== a.expectedText) throw Error("指令已變更，請重新比較後再還原");
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
          if ((a.expectedVersion !== undefined && d.version !== a.expectedVersion) || (a.expectedText !== undefined && d.text !== a.expectedText)) throw Error("內容已變更，請重新比較後再還原");
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
            (p.root && fs.existsSync(withinRoot(p.root, name)))
          )
            name = entry.name.replace(/\.yarn$/, `-recovered-${i++}.yarn`);
          if (p.root) {
            const file = withinRoot(p.root, name);
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
            restored.path = withinRoot(p.root, name);
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
