import fs from "node:fs";
import path from "node:path";
import type {
  AppPreferences,
  Project,
  ProjectCatalogEntry,
} from "../app/workspace/types";
import { atomicWrite } from "./disk-io";

export const canonicalPath = (value: string) => fs.realpathSync(value);
export const pathKey = (value: string) =>
  path.resolve(value).toLocaleLowerCase();
export function containsPath(root: string, file: string) {
  const relative = path.relative(pathKey(root), pathKey(file));
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}
export function projectConfig(root: string) {
  const folder = path.join(root, ".yarn-workbench");
  if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
    throw Error("專案設定目錄不可為符號連結");
  const file = path.join(folder, "project.json");
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
    throw Error("專案設定不可為符號連結");
  return file;
}
export function validProjectFolderName(name: string) {
  return (
    !!name.trim() &&
    name === name.trim() &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) &&
    !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
    name !== "." &&
    name !== ".."
  );
}
export class ProjectCatalog {
  entries: ProjectCatalogEntry[] = [];
  preferences: AppPreferences = { reopenLastProject: false };
  private file: string;
  constructor(profile: string, legacy: Project[]) {
    this.file = path.join(profile, "project-catalog-v1.json");
    if (fs.existsSync(this.file)) {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (
        value.version !== 1 ||
        !Array.isArray(value.entries) ||
        value.entries.some(
          (e: ProjectCatalogEntry) =>
            !e ||
            typeof e.id !== "string" ||
            typeof e.root !== "string" ||
            typeof e.name !== "string",
        )
      )
        throw Error("專案清單格式損毀，原始資料已保留");
      this.entries = value.entries;
      this.preferences = {
        reopenLastProject: value.preferences?.reopenLastProject === true,
        lastProjectId: value.preferences?.lastProjectId,
      };
    } else {
      this.entries = legacy
        .filter((p) => p.root && p.kind !== "standalone")
        .map((p, i) => ({
          id: p.id,
          name: p.name,
          root: p.root!,
          lastOpenedAt: legacy.length - i,
          recent: true,
        }));
      this.persist();
    }
  }
  persist() {
    atomicWrite(
      this.file,
      JSON.stringify({
        version: 1,
        entries: this.entries,
        preferences: this.preferences,
      }),
    );
  }
  list() {
    return this.entries
      .map((e) => {
        let unavailable: string | undefined;
        try {
          if (!fs.statSync(e.root).isDirectory()) throw Error("不是資料夾");
          fs.accessSync(e.root, fs.constants.R_OK);
          const file = projectConfig(e.root);
          if (fs.existsSync(file)) {
            const config = JSON.parse(fs.readFileSync(file, "utf8"));
            if (!config || Array.isArray(config) || typeof config !== "object")
              throw Error("設定無效");
          }
        } catch {
          unavailable = "專案路徑已失效或無法存取";
        }
        return { ...e, unavailable };
      })
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }
  opened(p: Project) {
    if (!p.root || p.kind === "standalone") return;
    this.entries = this.entries.filter(
      (e) => e.id !== p.id && pathKey(e.root) !== pathKey(p.root!),
    );
    this.entries.unshift({
      id: p.id,
      name: p.name,
      root: p.root,
      lastOpenedAt: Date.now(),
      recent: true,
    });
    this.preferences.lastProjectId = p.id;
    this.persist();
  }
  match(file: string) {
    const actual = canonicalPath(file);
    return this.list()
      .filter((e) => !e.unavailable)
      .map((e) => ({ ...e, root: canonicalPath(e.root) }))
      .filter((e) => containsPath(e.root, actual))
      .sort((a, b) => b.root.length - a.root.length)[0];
  }
  remove(id: string, recentOnly: boolean) {
    if (recentOnly)
      this.entries = this.entries.map((e) =>
        e.id === id ? { ...e, recent: false } : e,
      );
    else {
      this.entries = this.entries.filter((e) => e.id !== id);
      if (this.preferences.lastProjectId === id)
        delete this.preferences.lastProjectId;
    }
    this.persist();
  }
  rename(id: string, name: string) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || !name.trim()) throw Error("專案或名稱無效");
    const file = projectConfig(entry.root);
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config))
      throw Error("專案設定無效");
    atomicWrite(
      file,
      JSON.stringify({ ...config, name: name.trim() }, null, 2),
    );
    entry.name = name.trim();
    this.persist();
  }
}
