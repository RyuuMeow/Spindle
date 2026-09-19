"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loader } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { ArrowLeft, Clock3, RotateCcw, X } from "lucide-react";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { ChromeButton } from "@/components/ChromeButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import type { RecoveryEntry } from "./types";
import { yarnEditorTheme } from "../editor-theme";

function HistorySource({
  original,
  text,
  compare,
  line,
}: {
  original: string;
  text: string;
  compare: boolean;
  line: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void loader
      .init()
      .then((monaco) => {
        if (cancelled || !host.current) return;
        monaco.editor.defineTheme("yarn-history", yarnEditorTheme);
        const options: editor.IStandaloneEditorConstructionOptions = {
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: 24,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          theme: "yarn-history",
        };
        const modified = monaco.editor.createModel(text, "plaintext");
        if (compare) {
          const before = monaco.editor.createModel(original, "plaintext");
          const view = monaco.editor.createDiffEditor(host.current, {
            ...options,
            renderSideBySide: false,
            originalEditable: false,
          });
          view.setModel({ original: before, modified });
          view
            .getModifiedEditor()
            .revealLineInCenter(Math.min(line, modified.getLineCount()));
          // Detach before disposal: the diff worker may still be resolving a comparison.
          dispose = () => {
            view.setModel(null);
            view.dispose();
            before.dispose();
            modified.dispose();
          };
        } else {
          const view = monaco.editor.create(host.current, {
            ...options,
            model: modified,
          });
          view.revealLineInCenter(Math.min(line, modified.getLineCount()));
          dispose = () => {
            view.setModel(null);
            view.dispose();
            modified.dispose();
          };
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [original, text, compare, line]);
  return (
    <div className="history-source" ref={host}>
      {error && <p role="alert">無法開啟版本預覽：{error}</p>}
    </div>
  );
}

export function HistoryList({
  width,
  onWidth,
  entries,
  selected,
  onSelect,
  onClose,
}: {
  width: number;
  onWidth: (value: number) => void;
  entries: RecoveryEntry[];
  selected?: string;
  onSelect: (entry: RecoveryEntry) => void;
  onClose: () => void;
}) {
  return (
    <aside
      className="document-side history-list"
      aria-label="版本歷史"
      style={{ width, flexBasis: width }}
    >
      <PanelResizeHandle
        side="right"
        value={width}
        min={220}
        max={420}
        onResize={onWidth}
        label="調整版本歷史寬度"
      />
      <div className="section-heading">
        <strong>
          <Clock3 size={15} />
          版本歷史
        </strong>
        <ChromeButton title="關閉版本歷史" onClick={onClose}>
          <X size={15} />
        </ChromeButton>
      </div>
      <p className="panel-description">
        選擇版本以預覽。還原前會保留目前內容。
      </p>
      <div className="history-entries">
        {[...entries]
          .sort((a, b) => b.at - a.at)
          .map((entry, index, sorted) => (
            <Fragment key={entry.id}>
              {(index === 0 ||
                new Date(sorted[index - 1].at).toDateString() !==
                  new Date(entry.at).toDateString()) && (
                <h3 className="history-day">
                  {new Date(entry.at).toLocaleDateString("zh-TW", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </h3>
              )}
              <button
                className={selected === entry.id ? "active" : ""}
                aria-pressed={selected === entry.id}
                onClick={() => onSelect(entry)}
              >
                <Clock3 size={14} />
                <span>
                  <strong>
                    {new Date(entry.at).toLocaleString("zh-TW", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </strong>
                  <small>{entry.reason}</small>
                </span>
              </button>
            </Fragment>
          ))}
      </div>
      {!entries.length && (
        <p className="empty-small">尚無歷史版本。編輯後會定期建立快照。</p>
      )}
    </aside>
  );
}

export function HistoryPreview({
  entry,
  currentText,
  stale,
  onReturn,
  onRestore,
  toolbarTarget,
  line = 1,
}: {
  entry: RecoveryEntry;
  currentText: string;
  stale: boolean;
  onReturn: () => void;
  onRestore: () => void;
  toolbarTarget?: HTMLElement | null;
  line?: number;
}) {
  const [compare, setCompare] = useState("preview");
  const heading = (
    <div
      className={
        "history-preview-heading" +
        (toolbarTarget ? " in-document-toolbar" : "")
      }
    >
      <ChromeButton title="返回編輯" onClick={onReturn}>
        <ArrowLeft size={16} />
      </ChromeButton>
      <span>
        <strong>{entry.name}</strong>
        <small>{new Date(entry.at).toLocaleString("zh-TW")} · 唯讀</small>
      </span>
      <SegmentedControl
        label="版本呈現"
        value={compare}
        onChange={setCompare}
        options={[
          { value: "preview", label: "預覽" },
          { value: "diff", label: "比較" },
        ]}
      />
      <button className="history-restore" disabled={stale} onClick={onRestore}>
        <RotateCcw size={14} />
        還原此版本
      </button>
    </div>
  );
  return (
    <section className="history-preview" aria-label="唯讀版本預覽">
      {toolbarTarget ? createPortal(heading, toolbarTarget) : heading}
      {stale && (
        <p className="workspace-notice" role="alert">
          目前內容已變更。請返回編輯，再選取版本重新比較。
        </p>
      )}
      {compare === "diff" && (
        <p className="diff-legend">
          紅色：目前版本移除的文字；綠色：還原後加入的文字。
        </p>
      )}
      <HistorySource
        original={currentText}
        text={entry.text}
        compare={compare === "diff"}
        line={line}
      />
    </section>
  );
}
