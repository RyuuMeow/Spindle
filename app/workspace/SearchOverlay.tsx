"use client";
import { t as tr } from "../i18n/index.ts";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Search,
  X,
  Plus,
  Settings2,
  Terminal,
  CornerDownLeft,
} from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChromeButton } from "@/components/ChromeButton";
import {
  paletteSearch,
  type PaletteHit,
  type SettingEntry,
  type SearchScope,
} from "./search";
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
  commands = [],
  settings = [],
  recent = [],
  onChoose,
}: {
  documents: DocumentRecord[];
  query: string;
  onQuery: (value: string) => void;
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  onNavigate: (hit: import("./search").SearchHit, newTab: boolean) => void;
  commands?: import("../parser").Command[];
  settings?: SettingEntry[];
  recent?: string[];
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
    () =>
      paletteSearch({
        documents,
        commands,
        settings,
        recent,
        query,
        scope,
        canCreate: !!onCreate,
      }),
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
      aria-label={newTab ? tr("ma38d62ae74d4") : tr("m77fd2d10b9fd")}
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
          aria-label={
            scope === "files" ? tr("m99ee2db34b01") : tr("mcf9e54061438")
          }
          placeholder={
            newTab
              ? tr("m62ac9359e34b")
              : scope === "files"
                ? tr("med7fcd61895d")
                : tr("m7c4c744bf792")
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
            title={tr("m0c2d1a3aeaff")}
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
          <span>{tr("ma38d62ae74d4")}</span>
        ) : (
          <SegmentedControl
            label={tr("m0e63548278eb")}
            value={scope}
            onChange={(value) => onScope(value as SearchScope)}
            options={[
              { value: "all", label: tr("m5c55a67935af") },
              { value: "content", label: tr("m21e5bce6a622") },
              { value: "settings", label: tr("m0d8619aae051") },
              { value: "commands", label: tr("m6ee4a9a86f73") },
              { value: "files", label: tr("ma11ac5efe91d") },
            ]}
          />
        )}
        <span role="status">
          {query.trim()
            ? tr("m21f3677bcc05", [
                total,
                total > hits.length ? tr("m8974422d941c", [hits.length]) : "",
              ])
            : tr("m627b75e6aced")}
        </span>
      </div>
      <div
        className="search-overlay-results"
        id={listId}
        role="listbox"
        aria-label={tr("m0cbcf954d0cc")}
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
            {hit.kind === "create" ? (
              <Plus size={16} />
            ) : hit.kind === "setting" ? (
              <Settings2 size={16} />
            ) : hit.kind === "command" ? (
              <Terminal size={16} />
            ) : (
              <FileText size={16} />
            )}
            <span className="search-result-body">
              <span className="search-result-text">
                <Highlight
                  text={hit.text}
                  query={query}
                  context={
                    hit.kind === "document" && hit.hit.kind === "content"
                  }
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
            {invalidName
              ? tr("m31505fe0ec22")
              : documents.length
                ? tr("mac222982bd40")
                : tr("mc6650d11ca97")}
          </p>
        )}
      </div>
      <div className="search-overlay-footer">
        <span>
          {tr("m017f56f2238c")}
          {!newTab && tr("m897fd63576ef")}
        </span>
      </div>
    </div>,
    document.body,
  );
}
