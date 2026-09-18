import type { DocumentRecord, FileSortMode } from "./types";
export const folderOf = (name: string) => name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
const compareName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) || a.localeCompare(b);
export function orderedDocuments(documents: DocumentRecord[], mode: FileSortMode) {
  return mode === "manual" ? documents : [...documents].sort((a,b) => (mode === "name-desc" ? -1 : 1) * compareName(a.name, b.name));
}
export function uniqueDocumentName(documents: DocumentRecord[], folder = "") {
  const used = new Set(documents.map(d => d.name.toLowerCase()));
  const prefix = folder ? folder + "/" : "";
  let name = "Untitled.yarn", i = 2;
  while (used.has((prefix + name).toLowerCase())) name = "Untitled " + i++ + ".yarn";
  return name;
}
export function reorderWithinFolder(documents: DocumentRecord[], fromId: string, toId: string): string[] {
  const from = documents.find(d => d.id === fromId), to = documents.find(d => d.id === toId);
  if (!from || !to || from.id === to.id || folderOf(from.name) !== folderOf(to.name)) return documents.map(d => d.id);
  const group = documents.filter(d => folderOf(d.name) === folderOf(from.name)).map(d => d.id).filter(id => id !== fromId);
  group.splice(group.indexOf(toId), 0, fromId);
  let index = 0;
  return documents.map(d => folderOf(d.name) === folderOf(from.name) ? group[index++] : d.id);
}
