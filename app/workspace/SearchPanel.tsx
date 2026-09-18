"use client";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Search,
  X,
  TextCursorInput,
} from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import type { DocumentRecord } from "./types";

export type SearchHit = {
  documentId: string;
  file: string;
  line: number;
  column: number;
  text: string;
};
export type SearchViewState = {
  selected: number;
  scrollTop: number;
  recent: string[];
};
export function SearchPanel({
  documents,
  query,
  onQuery,
  onClose,
  onNavigate,
  viewState,
  onViewState,
}: {
  documents: DocumentRecord[];
  query: string;
  onQuery: (query: string) => void;
  onClose: () => void;
  onNavigate: (hit: SearchHit, newTab: boolean, source?: boolean) => void;
  viewState: SearchViewState;
  onViewState: (state: SearchViewState) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null),
    initialScroll = useRef(viewState.scrollTop);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const needle = query.toLocaleLowerCase();
    return documents.flatMap((doc) =>
      doc.text.split(/\r?\n/).flatMap((text, index) => {
        const column = text.toLocaleLowerCase().indexOf(needle);
        return column < 0
          ? []
          : [
              {
                documentId: doc.id,
                file: doc.name,
                line: index + 1,
                column: column + 1,
                text,
              },
            ];
      }),
    );
  }, [documents, query]);
  const results = matches.slice(0, 300),
    current = Math.min(viewState.selected, Math.max(0, results.length - 1));
  useEffect(() => {
    input.current?.focus();
    if (scroll.current) scroll.current.scrollTop = initialScroll.current;
  }, []);
  function choose(index: number, newTab = false, source = false) {
    if (!results.length) return;
    const next = (index + results.length) % results.length;
    onViewState({
      ...viewState,
      selected: next,
      recent: [
        query,
        ...viewState.recent.filter((value) => value !== query),
      ].slice(0, 5),
    });
    onNavigate(results[next], newTab, source);
    requestAnimationFrame(() =>
      document
        .getElementById(`project-hit-${next}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  return (
    <div className="project-search">
      <div className="section-heading">
        <strong>搜尋</strong>
        <ChromeButton title="關閉搜尋" onClick={onClose}>
          <X size={16} />
        </ChromeButton>
      </div>
      <div className="panel-search-input">
        <Search size={15} />
        <input
          ref={input}
          aria-label="搜尋全專案文字"
          placeholder="台詞、角色、tag…"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            onViewState({ ...viewState, selected: 0, scrollTop: 0 });
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              choose(
                current +
                  (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
                e.ctrlKey || e.metaKey,
              );
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
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
            <X size={13} />
          </ChromeButton>
        )}
      </div>
      {query.trim() ? (
        <div className="search-summary">
          <span role="status">
            {matches.length} 筆命中
            {matches.length > 300 ? " · 顯示前 300 筆，請縮小查詢" : ""}
          </span>
          <ChromeButton
            title="上一筆"
            disabled={!results.length}
            onClick={() => choose(current - 1)}
          >
            <ArrowUp size={14} />
          </ChromeButton>
          <ChromeButton
            title="下一筆"
            disabled={!results.length}
            onClick={() => choose(current + 1)}
          >
            <ArrowDown size={14} />
          </ChromeButton>
        </div>
      ) : (
        <p className="empty-small">在專案中找出用法，結果會留在這裡。</p>
      )}
      {!query.trim() && viewState.recent.length > 0 && (
        <div className="recent-searches">
          <small>最近搜尋</small>
          {viewState.recent.map((value) => (
            <button
              key={value}
              onClick={() => {
                onQuery(value);
                onViewState({ ...viewState, selected: 0, scrollTop: 0 });
              }}
            >
              <Search size={13} />
              {value}
            </button>
          ))}
        </div>
      )}
      <div
        className="project-search-results"
        aria-label="搜尋結果"
        ref={scroll}
        onScroll={(event) =>
          onViewState({
            ...viewState,
            scrollTop: event.currentTarget.scrollTop,
          })
        }
      >
        {results.map((hit, index) => {
          const offset = hit.column - 1;
          return (
            <div key={`${hit.documentId}:${hit.line}`}>
              {(index === 0 ||
                results[index - 1].documentId !== hit.documentId) && (
                <div className="search-file" title={hit.file}>
                  <FileText size={13} />
                  <span>{hit.file}</span>
                </div>
              )}
              <div
                className={"search-hit " + (current === index ? "active" : "")}
              >
                <button
                  id={`project-hit-${index}`}
                  aria-current={current === index ? "location" : undefined}
                  onClick={(e) => choose(index, e.ctrlKey || e.metaKey)}
                  onKeyDown={(e) => {
                    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                      e.preventDefault();
                      choose(index + (e.key === "ArrowDown" ? 1 : -1));
                      requestAnimationFrame(() =>
                        document
                          .getElementById(
                            `project-hit-${(index + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length}`,
                          )
                          ?.focus(),
                      );
                    }
                  }}
                >
                  <small>{hit.line}</small>
                  <span>
                    {hit.text.slice(Math.max(0, offset - 32), offset)}
                    <mark>{hit.text.slice(offset, offset + query.length)}</mark>
                    {hit.text.slice(offset + query.length)}
                  </span>
                </button>
                <ChromeButton
                  title="在純文字定位"
                  onClick={() => choose(index, false, true)}
                >
                  <TextCursorInput size={14} />
                </ChromeButton>
              </div>
            </div>
          );
        })}
        {!!query.trim() && !results.length && (
          <p className="empty-small">沒有符合內容，試試其他詞。</p>
        )}
      </div>
    </div>
  );
}
