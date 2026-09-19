"use client";

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
        <TabsList aria-label="開啟的劇本">
          {tabs.map((tab, index) => {
            const utilityNames: Record<string, string> = {
              "@commands": "自訂指令",
              "@settings": "設定",
              "@recovery": "專案復原",
            };
            const name = utilityNames[tab.file] || tab.file;
            const mode = utilityNames[tab.file]
              ? "設定"
              : tab.mode === "graph"
                ? "流程"
                : "撰寫";
            const title = `${name} · ${mode}${tab.location ? " · " + tab.location : ""}${tab.dirty ? " · 尚未儲存" : ""}`;
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
                  aria-label={`分頁 ${index + 1}：${name}`}
                  title={title}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="tab-name">
                    {tab.pinned && <Pin size={11} aria-label="已固定" />}
                    {name.replace(/\.yarn$/, "")}
                  </span>
                </TabsTrigger>
                <ControlTooltip label="關閉分頁">
                  <button
                    className="tab-close"
                    aria-label={`關閉分頁 ${index + 1}：${tab.file}`}
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
      <ControlTooltip label="新增分頁 · 選擇或建立劇本">
        <button className="new-tab" aria-label="新增分頁" onClick={onAdd}>
          <Plus size={17} />
        </button>
      </ControlTooltip>
      {overflow && (
        <DropdownMenu>
          <ControlTooltip label="所有開啟的分頁">
            <DropdownMenuTrigger
              className="tab-overflow"
              aria-label="所有開啟的分頁"
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
                      "@commands": "自訂指令",
                      "@settings": "設定",
                      "@recovery": "專案復原",
                    }[tab.file] || tab.file}
                  </strong>
                  <small>
                    分頁 {index + 1} ·{" "}
                    {tab.file === "@commands"
                      ? "設定"
                      : tab.mode === "graph"
                        ? "流程"
                        : "撰寫"}
                    {tab.location && " · " + tab.location}
                    {tab.dirty && " · 尚未儲存"}
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
