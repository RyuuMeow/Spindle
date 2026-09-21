import fs from "node:fs";
import path from "node:path";
import {
  addFolder,
  planTreeMove,
  projectFolders,
  withinFolder,
} from "../app/workspace/file-tree";
import { validDocumentName } from "../app/workspace/engine";
import type { Project, WorkspaceAction } from "../app/workspace/types";
export const entryActions = [
  "createDocument",
  "createFolder",
  "moveEntry",
  "renameDocument",
  "trashFolder",
  "removeDocument",
];
export function entryPath(root: string, name: string) {
  const normalized = name.replace(/\\/g, "/");
  if (
    !normalized ||
    !validDocumentName(normalized + "/placeholder.yarn") ||
    normalized.split("/").some((p) => p.toLowerCase() === ".spindle")
  )
    throw Error("INVALID_PROJECT_PATH");
  const absolute = path.resolve(root, normalized),
    relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("INVALID_PROJECT_PATH");
  let current = root;
  if (fs.lstatSync(root).isSymbolicLink()) throw Error("SYMLINK_NOT_ALLOWED");
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw Error("SYMLINK_NOT_ALLOWED");
  }
  return absolute;
}
export function inspectEntry(root: string, name: string) {
  const file = entryPath(root, name);
  let files = 0,
    otherFiles = 0;
  const walk = (item: string) => {
    const stat = fs.lstatSync(item);
    if (stat.isSymbolicLink()) throw Error("SYMLINK_NOT_ALLOWED");
    if (stat.isDirectory() && path.basename(item).toLowerCase() === ".spindle") throw Error("PROTECTED_PROJECT_METADATA");
    if (stat.isDirectory())
      for (const leaf of fs.readdirSync(item)) walk(path.join(item, leaf));
    else {
      files++;
      if (!/\.yarn$/i.test(item)) otherFiles++;
    }
  };
  if (fs.existsSync(file)) walk(file);
  return { files, otherFiles };
}
export function planProjectEntry(p: Project, action: WorkspaceAction) {
  if (!p.root || p.kind === "standalone") throw Error("PROJECT_REQUIRED");
  const root = p.root;
  let source: string | undefined, destination: string | undefined;
  let documents = [] as Project["documents"];
  if (action.type === "createDocument" || action.type === "createFolder") {
    destination = action.name.replace(/\\/g, "/");
    if (action.type === "createFolder")
      addFolder(structuredClone(p), destination);
    else {
      if (!validDocumentName(destination)) throw Error("INVALID_DOCUMENT_NAME");
      const parent = destination.split("/").slice(0, -1).join("/");
      if (parent && !projectFolders(p).includes(parent))
        throw Error("PARENT_NOT_FOUND");
    }
  } else if (action.type === "moveEntry" || action.type === "renameDocument") {
    const move =
      action.type === "moveEntry"
        ? action
        : {
            entry: "file:" + action.documentId,
            parent: action.name
              .replace(/\\/g, "/")
              .split("/")
              .slice(0, -1)
              .join("/"),
            name: action.name.replace(/\\/g, "/").split("/").at(-1),
          };
    const plan = planTreeMove(
      p,
      move.entry,
      move.parent,
      move.name,
      action.type === "moveEntry" ? action.before : undefined,
    );
    source = plan.path;
    destination = plan.target;
    documents = plan.documents;
  } else if (action.type === "trashFolder") {
    source = action.name;
    if (!projectFolders(p).includes(source)) throw Error("ENTRY_NOT_FOUND");
    documents = p.documents.filter((d) => withinFolder(d.name, source!));
  } else if (action.type === "removeDocument") {
    const d = p.documents.find((d) => d.id === action.documentId);
    if (!d) throw Error("ENTRY_NOT_FOUND");
    source = d.name;
    documents = [d];
  } else throw Error("INVALID_ENTRY_ACTION");
  if (destination) {
    const target = entryPath(root, destination);
    if (
      destination.toLowerCase() !== source?.toLowerCase() &&
      (fs.existsSync(target) ||
        [...projectFolders(p), ...p.documents.map((d) => d.name)].some(
          (n) => n.toLowerCase() === destination!.toLowerCase(),
        ))
    )
      throw Error("DESTINATION_EXISTS");
  }
  const count = source
    ? inspectEntry(root, source)
    : { files: 0, otherFiles: 0 };
  return {
    source,
    destination,
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      version: d.version,
    })),
    ...count,
  };
}
