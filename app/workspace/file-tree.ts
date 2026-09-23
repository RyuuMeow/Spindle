import { t as tr } from "../i18n/index.ts";
import type { Project, FileSortMode } from "./types";
import { validDocumentName } from "./engine";
import { folderOf } from "./file-order";
export type TreeEntry = {
  key: string;
  kind: "file" | "folder";
  path: string;
  name: string;
  documentId?: string;
};
export const withinFolder = (name: string, folder: string) =>
  name.startsWith(folder + "/");
export function projectFolders(p: Project): string[] {
  const folders = new Set((p.folders || []).filter(validFolderName));
  for (const name of [...p.documents.map((d) => d.name), ...folders].map(
    (n) => n + (folders.has(n) ? "/_" : ""),
  )) {
    const parts = name.split("/");
    for (let i = 1; i < parts.length; i++)
      folders.add(parts.slice(0, i).join("/"));
  }
  return [...folders];
}
export function validFolderName(name: string) {
  return (
    typeof name === "string" &&
    !!name &&
    validDocumentName(name + "/folder.yarn") &&
    !name
      .split("/")
      .some((p) =>
        [".git", ".spindle", "node_modules"].includes(p.toLowerCase()),
      )
  );
}
export function treeEntries(
  p: Project,
  parent: string,
  sort: FileSortMode = "manual",
): TreeEntry[] {
  const entries: TreeEntry[] = [
    ...projectFolders(p)
      .filter((f) => folderOf(f) === parent)
      .map((path) => ({
        key: "folder:" + path,
        kind: "folder" as const,
        path,
        name: path.split("/").at(-1)!,
      })),
    ...p.documents
      .filter((d) => folderOf(d.name) === parent)
      .map((d) => ({
        key: "file:" + d.id,
        kind: "file" as const,
        path: d.name,
        name: d.name.split("/").at(-1)!,
        documentId: d.id,
      })),
  ];
  const rank = new Map((p.treeOrder || []).map((key, i) => [key, i]));
  return entries.sort((a, b) =>
    sort === "manual"
      ? (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity)
      : (sort === "name-desc" ? -1 : 1) *
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
  );
}
export function uniqueCopyName(p: Project, name: string) {
  const names = new Set(p.documents.map((d) => d.name.toLowerCase()));
  const base = name.replace(/\.yarn$/, "") + "-copy";
  let candidate = base + ".yarn",
    i = 2;
  while (names.has(candidate.toLowerCase()))
    candidate = base + "-" + i++ + ".yarn";
  return candidate;
}
export function addFolder(p: Project, name: string) {
  if (
    !validFolderName(name) ||
    projectFolders(p).some((f) => f.toLowerCase() === name.toLowerCase()) ||
    p.documents.some((d) => d.name.toLowerCase() === name.toLowerCase())
  )
    throw Error(tr("m27a64609c761"));
  const parent = folderOf(name);
  if (parent && !projectFolders(p).includes(parent))
    throw Error(tr("mf3af13bc31d4"));
  p.folders = [...projectFolders(p), name];
  p.treeOrder = ["folder:" + name, ...(p.treeOrder || [])];
}
/** Validate a single filesystem rename before changing any shared identities. */
export function planTreeMove(
  p: Project,
  entry: string,
  parent: string,
  name?: string,
  before?: string,
) {
  const folder = entry.startsWith("folder:"),
    path = folder
      ? entry.slice(7)
      : p.documents.find((d) => "file:" + d.id === entry)?.name;
  if (!path || (folder && !projectFolders(p).includes(path)))
    throw Error(tr("m61718c8f1825"));
  if (parent && !projectFolders(p).includes(parent))
    throw Error(tr("m4792cc38291b"));
  const leaf = name ?? path.split("/").at(-1)!;
  if (/[\\/]/.test(leaf)) throw Error(tr("m1f74454a4fe9"));
  const target = (parent ? parent + "/" : "") + leaf;
  if (folder ? !validFolderName(target) : !validDocumentName(target))
    throw Error(tr("mb704197a45e2"));
  if (folder && (parent === path || withinFolder(parent, path)))
    throw Error(tr("m6a6598d3d64f"));
  if (
    target !== path &&
    [...projectFolders(p), ...p.documents.map((d) => d.name)].some(
      (n) => n.toLowerCase() === target.toLowerCase() && n !== path,
    )
  )
    throw Error(tr("m33a829bdc8e9"));
  const mapPath = (value: string) =>
    value === path
      ? target
      : folder && withinFolder(value, path)
        ? target + value.slice(path.length)
        : value;
  const nextKey = folder ? "folder:" + target : entry;
  if (name !== undefined && parent === folderOf(path) && before === undefined) {
    const previous = treeEntries(p, parent);
    before = previous[previous.findIndex((e) => e.key === entry) + 1]?.key;
  }
  if (before === entry) {
    const previous = treeEntries(p, parent);
    before = previous[previous.findIndex((e) => e.key === entry) + 1]?.key;
  }
  const siblings = treeEntries(p, parent)
    .map((e) => e.key)
    .filter((k) => k !== entry);
  const at = before ? siblings.indexOf(before) : siblings.length;
  if (before && at < 0) throw Error(tr("m6862e1c24707"));
  siblings.splice(at, 0, nextKey);
  const order = (p.treeOrder || [])
    .map((k) => (k.startsWith("folder:") ? "folder:" + mapPath(k.slice(7)) : k))
    .filter((k) => !siblings.includes(k) && k !== entry);
  return {
    path,
    target,
    folder,
    mapPath,
    treeOrder: [...siblings, ...order],
    documents: p.documents.filter((d) =>
      folder ? withinFolder(d.name, path) : "file:" + d.id === entry,
    ),
  };
}
export function applyTreeMove(
  p: Project,
  plan: ReturnType<typeof planTreeMove>,
) {
  p.folders = projectFolders(p).map(plan.mapPath);
  for (const d of plan.documents) d.name = plan.mapPath(d.name);
  p.excluded = p.excluded.map(plan.mapPath);
  p.treeOrder = plan.treeOrder;
}
