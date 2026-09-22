"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Search, X, Plus, Settings2, Terminal, CornerDownLeft } from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChromeButton } from "@/components/ChromeButton";
import { paletteSearch, type PaletteHit, type SettingEntry, type SearchScope } from "./search";
import type { DocumentRecord } from "./types";
import "./overlays.css";
export type SearchDismissReason = "escape" | "outside" | "blur" | "choose";

function Highlight({
  text,
  query,
  context = false,
}: {
  text: string;
  query: string;
  context?: boolean;
}) {
  const needle = query.trim();
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (!needle || index < 0) return <>{text}</>;
  const start = context ? Math.max(0, index - 35) : 0;
  return (
    <>
      {start > 0 ? "…" : ""}
      {text.slice(start, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(
        index + needle.length,
        context ? index + needle.length + 100 : undefined,
      )}
    </>
  );
}

export function SearchOverlay({
  documents,
  query,
  onQuery,
  scope,
  onScope,
  onNavigate,
  onClose,
  newTab = false,
  onCreate,
  commands = [], settings = [], recent = [], onChoose,
}: {
  documents: DocumentRecord[];
  query: string;
  onQuery: (value: string) => void;
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  onNavigate: (hit: import("./search").SearchHit, newTab: boolean) => void;
  commands?: import("../parser").Command[]; settings?: SettingEntry[]; recent?: string[];
  onChoose?: (hit: PaletteHit) => void;
  onClose: (reason: SearchDismissReason) => void;
  newTab?: boolean;
  onCreate?: (name?: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const listId = useId(),
    composing = useRef(false),
    closing = useRef(false);
  const originalFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [selection, setSelection] = useState({ query, scope, index: 0 });
  const { hits, total, invalidName } = useMemo(
    () => paletteSearch({documents,commands,settings,recent,query,scope,canCreate:!!onCreate}),
    [documents, commands, settings, recent, query, scope, onCreate],
  );
  const current =
    selection.query === query && selection.scope === scope
      ? Math.min(selection.index, Math.max(0, hits.length - 1))
      : 0;
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    originalFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    input.current?.focus();
    input.current?.select();
    const dismiss = (reason: SearchDismissReason) => {
      if (closing.current) return;
      closing.current = true;
      onCloseRef.current(reason);
      if (reason === "escape")
        requestAnimationFrame(
          () =>
            originalFocus.current?.isConnected && originalFocus.current.focus(),
        );
    };
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) dismiss("outside");
    };
    const focus = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node)) dismiss("blur");
    };
    const blur = () => dismiss("blur");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    document
      .getElementById(`${listId}-${current}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [listId, current, query, scope]);
  const select = (index: number) => setSelection({ query, scope, index });
  function choose(index: number, explicitNew = false) {
    if (!hits[index] || composing.current) return;
    closing.current = true;
    const hit = hits[index];
    if (hit.kind === "document") onNavigate(hit.hit, newTab || explicitNew);
    else if (hit.kind === "create") onCreate?.(hit.name);
    else onChoose?.(hit);
    onClose("choose");
  }
  function escape() {
    closing.current = true;
    onClose("escape");
    requestAnimationFrame(
      () => originalFocus.current?.isConnected && originalFocus.current.focus(),
    );
  }
  return createPortal(
    <div
      ref={panel}
      className="search-overlay"
      role="dialog"
      aria-label={newTab ? "新增分頁" : "全局搜尋"}
      data-workspace-overlay="search"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || composing.current) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          escape();
        }
      }}
    >
      <div className="search-overlay-input">
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          aria-label={scope === "files" ? "搜尋劇本" : "搜尋全專案文字"}
          placeholder={
            newTab
              ? "選擇劇本，在新分頁開啟"
              : scope === "files"
                ? "搜尋檔名或路徑"
                : "搜尋台詞、角色、場景…"
          }
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={
            hits.length ? `${listId}-${current}` : undefined
          }
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current) return;
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              (event.key.startsWith("Arrow") || event.ctrlKey)
            ) {
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? hits.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        hits.length) %
                      Math.max(1, hits.length);
              select(Math.max(0, next));
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              choose(current, event.ctrlKey || event.metaKey);
            }
          }}
        />
        {query && (
          <ChromeButton
            title="清除搜尋"
            onClick={() => {
              onQuery("");
              input.current?.focus();
            }}
          >
            <X size={15} />
          </ChromeButton>
        )}
        <kbd>Esc</kbd>
      </div>
      <div className="search-overlay-meta">
        {newTab ? (
          <span>新增分頁</span>
        ) : (
          <SegmentedControl
            label="搜尋範圍"
            value={scope}
            onChange={(value) => onScope(value as SearchScope)}
            options={[
              { value: "all", label: "全部" },
              { value: "content", label: "內容" },
              { value: "settings", label: "設定" },
              { value: "commands", label: "指令" },
              { value: "files", label: "檔案" },
            ]}
          />
        )}
        <span role="status">
          {query.trim()
            ? `${total} 個結果${total > hits.length ? `，顯示前 ${hits.length} 筆` : ""}`
            : "劇本"}
        </span>
      </div>
      <div
        className="search-overlay-results"
        id={listId}
        role="listbox"
        aria-label="搜尋結果"
      >
        {hits.map((hit, index) => (
          <button
            type="button"
            role="option"
            aria-selected={current === index}
            tabIndex={-1}
            id={`${listId}-${index}`}
            key={hit.id}
            className={current === index ? "active" : ""}
            onPointerMove={() => select(index)}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => choose(index, event.ctrlKey || event.metaKey)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                choose(index, true);
              }
            }}
          >
            {hit.kind === "create" ? <Plus size={16}/> : hit.kind === "setting" ? <Settings2 size={16}/> : hit.kind === "command" ? <Terminal size={16}/> : <FileText size={16}/> }
            <span className="search-result-body">
              <span className="search-result-text">
                <Highlight
                  text={hit.text}
                  query={query}
                  context={hit.kind === "document" && hit.hit.kind === "content"}
                />
              </span>
              <small>{hit.detail}</small>
            </span>
            {current === index && (
              <CornerDownLeft
                size={14}
                className="search-result-enter"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
        {!hits.length && (
          <p className="search-overlay-empty">
            {invalidName ? "名稱不可包含路徑、保留名稱或無效字元。" : documents.length
              ? "沒有符合的項目，試試其他關鍵字。"
              : "專案還沒有劇本。"}
          </p>
        )}
      </div>
      <div className="search-overlay-footer">
        <span>方向鍵選擇 · Enter 開啟{!newTab && " · Ctrl+Enter 新分頁"}</span>

      </div>
    </div>,
    document.body,
  );
}
