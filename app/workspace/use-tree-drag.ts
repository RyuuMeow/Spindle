import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { FileSortMode, Project } from "./types";
import { treeEntries, withinFolder } from "./file-tree";
import { folderOf } from "./file-order";

type Drop = {
  key: string;
  position: "before" | "after" | "inside";
  parent: string;
  before?: string;
};
type Gesture = {
  key: string;
  pointer: number;
  x: number;
  y: number;
  row: HTMLElement;
  active: boolean;
};

/** Local tree gestures: no OS drag loop, no file payload, and no tree reflow on pickup. */
export function useTreeDrag(
  project: Project,
  sort: FileSortMode,
  onMove: (entry: string, parent: string, before?: string) => Promise<void>,
) {
  const host = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(""),
    [drop, setDrop] = useState<Drop | null>(null);
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.row.hasPointerCapture(g.pointer))
      g.row.releasePointerCapture(g.pointer);
    setDragging("");
    setDrop(null);
  };
  useEffect(() => {
    const blur = () => {
      gesture.current = null;
      setDragging("");
      setDrop(null);
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  const hit = (x: number, y: number, source: string): Drop | null => {
    const element = document.elementFromPoint(x, y);
    if (!element || !host.current?.contains(element)) return null;
    const row = element.closest<HTMLElement>("[data-entry]"),
      end = element.closest<HTMLElement>("[data-folder-end]");
    let target: Drop;
    if (row) {
      const key = row.dataset.entry!;
      if (key === source) return null;
      const folder = key.startsWith("folder:"),
        path = folder
          ? key.slice(7)
          : project.documents.find((d) => "file:" + d.id === key)?.name;
      if (!path) return null;
      const rect = row.getBoundingClientRect(),
        ratio = (y - rect.top) / rect.height;
      const position =
        folder && ratio > 0.25 && ratio < 0.75
          ? "inside"
          : ratio < 0.5
            ? "before"
            : "after";
      const parent = position === "inside" ? path : folderOf(path),
        siblings = treeEntries(project, parent, sort);
      target = {
        key,
        position,
        parent,
        before:
          position === "inside"
            ? undefined
            : position === "before"
              ? key
              : siblings[siblings.findIndex((e) => e.key === key) + 1]?.key,
      };
    } else if (end)
      target = {
        key: "end:" + end.dataset.folderEnd,
        position: "before",
        parent: end.dataset.folderEnd!,
      };
    else return null;
    const folder = source.startsWith("folder:") ? source.slice(7) : null;
    return folder !== null &&
      (target.parent === folder || withinFolder(target.parent, folder))
      ? null
      : target;
  };
  return {
    host,
    dragging,
    drop,
    cancel,
    begin(e: PointerEvent<HTMLElement>, key: string) {
      if (
        e.button !== 0 ||
        !e.isPrimary ||
        (e.target as HTMLElement).closest(
          "input,.file-options,.folder-disclosure",
        )
      )
        return;
      suppressClick.current = false;
      gesture.current = {
        key,
        pointer: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        row: e.currentTarget,
        active: false,
      };
    },
    move(e: PointerEvent) {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return;
      if (!g.active) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
        g.active = true;
        suppressClick.current = true;
        g.row.setPointerCapture(g.pointer);
        setDragging(g.key);
      }
      e.preventDefault();
      setDrop(hit(e.clientX, e.clientY, g.key));
      const scroller = host.current?.parentElement,
        bounds = scroller?.getBoundingClientRect();
      if (scroller && bounds) {
        if (e.clientY < bounds.top + 28) scroller.scrollTop -= 14;
        else if (e.clientY > bounds.bottom - 28) scroller.scrollTop += 14;
      }
    },
    finish(e: PointerEvent) {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return;
      const target = g.active ? hit(e.clientX, e.clientY, g.key) : null;
      cancel();
      if (g.active) {
        e.preventDefault();
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      if (target) void onMove(g.key, target.parent, target.before);
    },
    click(e: MouseEvent) {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false;
      }
    },
  };
}
