"use client";
import {
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  Folder,
  FileText,
  MoreHorizontal,
  AlertTriangle,
} from "lucide-react";
import type { Project, DocumentRecord, FileSortMode } from "./types";
import type { InlineDraft } from "./InlineNameEditor";
import { treeEntries, withinFolder } from "./file-tree";
import "./file-tree.css";
const MIME = "application/x-spindle-entry";
export default function FileTree({
  project,
  sort,
  documentId,
  onFolder,
  draft,
  inline,
  onOpen,
  onRenameFile,
  onRenameFolder,
  onFileMenu,
  onFolderMenu,
  onMove,
}: {
  project: Project;
  sort: FileSortMode;
  documentId?: string;
  folder: string | null;
  onFolder: (path: string) => void;
  draft: InlineDraft | null;
  inline: () => ReactNode;
  onOpen: (doc: DocumentRecord, newTab: boolean) => void;
  onRenameFile: (doc: DocumentRecord) => void;
  onRenameFolder: (path: string) => void;
  onFileMenu: (event: MouseEvent | KeyboardEvent, doc: DocumentRecord) => void;
  onFolderMenu: (event: MouseEvent | KeyboardEvent, path: string) => void;
  onMove: (entry: string, parent: string, before?: string) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>()),
    [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [dragging, setDragging] = useState(""),
    [drop, setDrop] = useState<{
      key: string;
      position: "before" | "after" | "inside";
    } | null>(null);
  const drag = useRef("");
  const stop = () => {
    drag.current = "";
    setDragging("");
    setDrop(null);
  };
  const valid = (parent: string) =>
    !drag.current.startsWith("folder:") ||
    (parent !== drag.current.slice(7) &&
      !withinFolder(parent, drag.current.slice(7)));
  async function move(parent: string, before?: string) {
    const source = drag.current;
    stop();
    if (source) await onMove(source, parent, before);
  }
  const render = (parent = "", depth = 0): ReactNode => {
    const entries = treeEntries(project, parent, sort);
    return (
      <>
        {draft?.folder === parent &&
          ["new-document", "new-folder"].includes(draft.kind) &&
          inline()}
        {entries.map((entry, index) => {
          const doc = project.documents.find((d) => d.id === entry.documentId);
          const editing =
            draft &&
            (entry.kind === "folder"
              ? draft.kind === "rename-folder" &&
                draft.originalFolder === entry.path
              : draft.kind === "rename-document" &&
                draft.documentId === entry.documentId);
          const open =
            !collapsed.has(entry.path) ||
            !!(
              draft?.folder &&
              (draft.folder === entry.path ||
                withinFolder(draft.folder, entry.path))
            );
          const isFolder = entry.kind === "folder",
            selected = isFolder
              ? selectedFolder === entry.path
              : !selectedFolder && documentId === entry.documentId;
          const menu = (e: MouseEvent | KeyboardEvent) =>
            isFolder ? onFolderMenu(e, entry.path) : doc && onFileMenu(e, doc);
          const rename = () =>
            isFolder ? onRenameFolder(entry.path) : doc && onRenameFile(doc);
          return (
            <div
              key={entry.key}
              className={
                "tree-group " +
                (drop?.key === entry.key ? "tree-drop-" + drop.position : "")
              }
              style={
                { "--tree-indent": depth * 14 + "px" } as React.CSSProperties
              }
            >
              <div
                className={
                  "tree-entry file-entry " + (selected ? "active" : "")
                }
                data-entry={entry.key}
                draggable={!draft}
                onDragStart={(e) => {
                  drag.current = entry.key;
                  setDragging(entry.key);
                  e.dataTransfer.setData(MIME, entry.key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={stop}
                onDragOver={(e) => {
                  if (!drag.current || drag.current === entry.key) {
                    setDrop(null);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect(),
                    ratio = (e.clientY - rect.top) / rect.height;
                  const position =
                    isFolder && ratio > 0.25 && ratio < 0.75
                      ? "inside"
                      : ratio < 0.5
                        ? "before"
                        : "after";
                  if (!valid(position === "inside" ? entry.path : parent))
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setDrop({ key: entry.key, position });
                }}
                onDrop={(e) => {
                  if (!drop || drop.key !== entry.key) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const into = drop.position === "inside";
                  void move(
                    into ? entry.path : parent,
                    into
                      ? undefined
                      : drop.position === "before"
                        ? entry.key
                        : entries[index + 1]?.key,
                  );
                }}
                onContextMenu={menu}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    stop();
                    return;
                  }
                  if (e.target instanceof HTMLInputElement) return;
                  if (e.key === "F2") {
                    e.preventDefault();
                    rename();
                  } else if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  ) {
                    e.preventDefault();
                    menu(e);
                  }
                }}
              >
                {editing ? (
                  inline()
                ) : (
                  <>
                    {isFolder && (
                      <button
                        className="folder-disclosure"
                        aria-label={(open ? "收合 " : "展開 ") + entry.path}
                        aria-expanded={open}
                        onClick={() =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            if (open) next.add(entry.path);
                            else next.delete(entry.path);
                            return next;
                          })
                        }
                      >
                        <ChevronRight
                          size={13}
                          style={{
                            transform: open ? "rotate(90deg)" : undefined,
                          }}
                        />
                      </button>
                    )}
                    <button
                      className="file-row"
                      title={doc?.path || entry.path}
                      aria-label={isFolder ? "資料夾 " + entry.path : undefined}
                      onClick={(e) => {
                        if (e.detail > 1) return;
                        if (isFolder) {
                          setSelectedFolder(entry.path);
                          onFolder(entry.path);
                        } else if (doc) {
                          setSelectedFolder(null);
                          onOpen(doc, e.ctrlKey || e.metaKey);
                        }
                      }}
                      onDoubleClick={(e) => {
                        if (
                          !e.ctrlKey &&
                          !e.metaKey &&
                          !e.altKey &&
                          !e.shiftKey
                        ) {
                          e.preventDefault();
                          rename();
                        }
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1 && doc) {
                          e.preventDefault();
                          onOpen(doc, true);
                        }
                      }}
                    >
                      {isFolder ? <Folder size={14} /> : <FileText size={14} />}
                      <span>{entry.name}</span>
                      {doc &&
                        ["error", "missing", "conflict"].includes(
                          doc.status,
                        ) && <AlertTriangle size={13} />}
                    </button>
                    <button
                      className="file-options"
                      aria-label={
                        (isFolder ? "資料夾選項 " : "劇本選項 ") + entry.path
                      }
                      onClick={menu}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </>
                )}
              </div>
              {isFolder && open && render(entry.path, depth + 1)}
            </div>
          );
        })}
        <div
          className={
            "tree-end " +
            (drop?.key === "end:" + parent ? "tree-drop-before" : "")
          }
          data-folder-end={parent}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedFolder(parent || null);
              onFolder(parent);
            }
          }}
          onDragOver={(e) => {
            if (!drag.current || !valid(parent)) return;
            e.preventDefault();
            e.stopPropagation();
            setDrop({ key: "end:" + parent, position: "before" });
          }}
          onDrop={(e) => {
            if (!drag.current || !valid(parent)) return;
            e.preventDefault();
            e.stopPropagation();
            void move(parent);
          }}
        >
          {dragging && !parent && <span>移到專案最外層</span>}
        </div>
      </>
    );
  };
  return (
    <div
      className={"file-tree " + (dragging ? "is-dragging" : "")}
      onKeyDown={(e) => {
        if (e.key === "Escape") stop();
      }}
    >
      {render()}
    </div>
  );
}
