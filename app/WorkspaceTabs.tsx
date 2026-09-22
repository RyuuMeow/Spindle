"use client";
import { t as tr } from "./i18n/index.ts";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  FileText,
  Pin,
  ArchiveRestore,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ControlTooltip } from "@/components/ui/tooltip";

export type TabPresentation = {
  id: string;
  file: string;
  dirty: boolean;
  mode: string;
  location: string;
  pinned?: boolean;
};

type Props = {
  tabs: TabPresentation[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onMenu?: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onReorder?: (id: string, index: number) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (event: React.DragEvent) => void;
  onExternalDrop?: (index: number) => void;
};

export default function WorkspaceTabs({
  tabs,
  activeId,
  onActivate,
  onClose,
  onAdd,
  onMenu,
  onReorder,
  onDragStart,
  onDragEnd,
  onExternalDrop,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [dragging, setDragging] = useState(""),
    [dropIndex, setDropIndex] = useState(-1);

  useEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    const update = () => {
      setOverflow(scroller.scrollWidth > scroller.clientWidth + 1);
      const selected = scroller.querySelector<HTMLElement>(".tab-shell.active");
      if (!selected) return;
      const bounds = scroller.getBoundingClientRect();
      const tabBounds = selected.getBoundingClientRect();
      if (tabBounds.left < bounds.left)
        scroller.scrollLeft -= bounds.left - tabBounds.left;
      else if (tabBounds.right > bounds.right)
        scroller.scrollLeft += tabBounds.right - bounds.right;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    const list = scroller.querySelector("[role=tablist]");
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [activeId, tabs]);

  function closeTab(id: string) {
    onClose(id);
    requestAnimationFrame(() =>
      viewport.current
        ?.querySelector<HTMLButtonElement>("[role=tab][data-state=active]")
        ?.focus(),
    );
  }

  return (
    <div
      className="tab-strip"
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          setDragging("");
          setDropIndex(-1);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-yarn-tab")) {
          e.preventDefault();
          setDropIndex(tabs.length);
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("application/x-yarn-tab")) return;
        e.preventDefault();
        const id = e.dataTransfer.getData("application/x-yarn-tab");
        if (tabs.some((t) => t.id === id)) onReorder?.(id, tabs.length);
        else onExternalDrop?.(tabs.length);
        setDropIndex(-1);
        setDragging("");
      }}
    >
      <Tabs
        ref={viewport}
        value={activeId}
        onValueChange={onActivate}
        className="file-tabs"
      >
        <TabsList aria-label={tr("m53127dbd0a28")}>
          {tabs.map((tab, index) => {
            const utilityNames: Record<string, string> = {
              "@commands": tr("mae2f19d77e06"),
              "@settings": tr("m0d8619aae051"),
              "@recovery": tr("m525e69a5165d"),
            };
            const name = utilityNames[tab.file] || tab.file;
            const mode = utilityNames[tab.file]
              ? tr("m0d8619aae051")
              : tab.mode === "graph"
                ? tr("mbdd207e8c6e3")
                : tr("m0bfa2376e1d1");
            const title = `${name} · ${mode}${tab.location ? " · " + tab.location : ""}${tab.dirty ? tr("m4d4dc771e260") : ""}`;
            const Icon =
              tab.file === "@recovery"
                ? ArchiveRestore
                : utilityNames[tab.file]
                  ? Settings2
                  : FileText;
            return (
              <div
                key={tab.id}
                draggable
                className={
                  "tab-shell " +
                  (activeId === tab.id ? "active" : "") +
                  (dropIndex === index ? " tab-drop-before" : "") +
                  (index === tabs.length - 1 && dropIndex === tabs.length
                    ? " tab-drop-after"
                    : "")
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu?.(tab.id, e);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onClose(tab.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  ) {
                    e.preventDefault();
                    onMenu?.(tab.id, e);
                  }
                  if (
                    e.altKey &&
                    e.shiftKey &&
                    ["ArrowLeft", "ArrowRight"].includes(e.key)
                  ) {
                    e.preventDefault();
                    onReorder?.(
                      tab.id,
                      Math.max(
                        0,
                        Math.min(
                          tabs.length,
                          index + (e.key === "ArrowLeft" ? -1 : 2),
                        ),
                      ),
                    );
                  }
                }}
                onDragStart={(e) => {
                  setDragging(tab.id);
                  e.dataTransfer.setData("application/x-yarn-tab", tab.id);
                  e.dataTransfer.effectAllowed = "move";
                  onDragStart?.(tab.id);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-yarn-tab"))
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropIndex(
                    index + (e.clientX > rect.x + rect.width / 2 ? 1 : 0),
                  );
                  const viewportBounds =
                    viewport.current?.getBoundingClientRect();
                  if (viewportBounds && viewport.current) {
                    if (e.clientX < viewportBounds.left + 30)
                      viewport.current.scrollLeft -= 15;
                    if (e.clientX > viewportBounds.right - 30)
                      viewport.current.scrollLeft += 15;
                  }
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-yarn-tab"))
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData("application/x-yarn-tab");
                  if (tabs.some((t) => t.id === id))
                    onReorder?.(id, dropIndex < 0 ? index : dropIndex);
                  else onExternalDrop?.(dropIndex < 0 ? index : dropIndex);
                  setDropIndex(-1);
                  setDragging("");
                }}
                onDragEnd={(e) => {
                  setDragging("");
                  setDropIndex(-1);
                  onDragEnd?.(e);
                }}
                data-dragging={dragging === tab.id || undefined}
              >
                <TabsTrigger
                  value={tab.id}
                  aria-label={tr("ma9cde878bdf7", [index + 1, name])}
                  title={title}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="tab-name">
                    {tab.pinned && (
                      <Pin size={11} aria-label={tr("m317c1a85ec1c")} />
                    )}
                    {name.replace(/\.yarn$/, "")}
                  </span>
                </TabsTrigger>
                <ControlTooltip label={tr("maa9a10827fb5")}>
                  <button
                    className="tab-close"
                    aria-label={tr("m65ea34b018df", [index + 1, tab.file])}
                    onClick={() => closeTab(tab.id)}
                  >
                    <X size={13} />
                  </button>
                </ControlTooltip>
              </div>
            );
          })}
        </TabsList>
      </Tabs>
      <ControlTooltip label={tr("m6e28bae41c7e")}>
        <button
          className="new-tab"
          aria-label={tr("ma38d62ae74d4")}
          onClick={onAdd}
        >
          <Plus size={17} />
        </button>
      </ControlTooltip>
      {overflow && (
        <DropdownMenu>
          <ControlTooltip label={tr("m87241a211d76")}>
            <DropdownMenuTrigger
              className="tab-overflow"
              aria-label={tr("m87241a211d76")}
            >
              <ChevronDown size={16} />
            </DropdownMenuTrigger>
          </ControlTooltip>
          <DropdownMenuContent
            align="end"
            className="desktop-menu open-tabs-menu"
          >
            {tabs.map((tab, index) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => onActivate(tab.id)}
              >
                <Check
                  size={14}
                  style={{
                    visibility: tab.id === activeId ? "visible" : "hidden",
                  }}
                />
                <span>
                  <strong>
                    {{
                      "@commands": tr("mae2f19d77e06"),
                      "@settings": tr("m0d8619aae051"),
                      "@recovery": tr("m525e69a5165d"),
                    }[tab.file] || tab.file}
                  </strong>
                  <small>
                    {tr("m842433f0a425")}
                    {index + 1} ·{" "}
                    {tab.file === "@commands"
                      ? tr("m0d8619aae051")
                      : tab.mode === "graph"
                        ? tr("mbdd207e8c6e3")
                        : tr("m0bfa2376e1d1")}
                    {tab.location && " · " + tab.location}
                    {tab.dirty && tr("m4d4dc771e260")}
                  </small>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
