"use client";
import { t as tr, locale } from "../i18n/index.ts";

import { Fragment, useEffect, useEffectEvent, useRef, useState } from "react";
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
  scrollTop,
  onScroll,
}: {
  original: string;
  text: string;
  compare: boolean;
  line: number;
  scrollTop?: number;
  onScroll?: (top: number) => void;
}) {
  const scrolled = useEffectEvent((top: number) => onScroll?.(top));
  const restoreScroll = useEffectEvent((view: editor.IStandaloneCodeEditor) => {
    if (scrollTop !== undefined) view.setScrollTop(scrollTop);
  });
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
          restoreScroll(view.getModifiedEditor());
          const listener = view
            .getModifiedEditor()
            .onDidScrollChange((e: { scrollTop: number }) =>
              scrolled(e.scrollTop),
            );
          // Detach before disposal: the diff worker may still be resolving a comparison.
          dispose = () => {
            view.setModel(null);
            view.dispose();
            listener.dispose();
            before.dispose();
            modified.dispose();
          };
        } else {
          const view = monaco.editor.create(host.current, {
            ...options,
            model: modified,
          });
          view.revealLineInCenter(Math.min(line, modified.getLineCount()));
          restoreScroll(view);
          const listener = view.onDidScrollChange((e: { scrollTop: number }) =>
            scrolled(e.scrollTop),
          );
          dispose = () => {
            listener.dispose();
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
      {error && (
        <p role="alert">
          {tr("m6066c9a6c2b6")}
          {error}
        </p>
      )}
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
      aria-label={tr("m4c3cec274391")}
      style={{ width, flexBasis: width }}
    >
      <PanelResizeHandle
        side="right"
        value={width}
        min={220}
        max={420}
        onResize={onWidth}
        label={tr("m66f06b427838")}
      />
      <div className="section-heading">
        <strong>
          <Clock3 size={15} />
          {tr("m4c3cec274391")}
        </strong>
        <ChromeButton title={tr("mc4319d6fde7b")} onClick={onClose}>
          <X size={15} />
        </ChromeButton>
      </div>
      <p className="panel-description">{tr("mf64ddf7d7854")}</p>
      <div className="history-entries">
        {[...entries]
          .sort((a, b) => b.at - a.at)
          .map((entry, index, sorted) => (
            <Fragment key={entry.id}>
              {(index === 0 ||
                new Date(sorted[index - 1].at).toDateString() !==
                  new Date(entry.at).toDateString()) && (
                <h3 className="history-day">
                  {new Date(entry.at).toLocaleDateString(locale(), {
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
                    {new Date(entry.at).toLocaleString(locale(), {
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
      {!entries.length && <p className="empty-small">{tr("m291f10bd457e")}</p>}
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
  compareMode,
  onCompare,
  scrollTop,
  onScroll,
  disabled,
}: {
  entry: RecoveryEntry;
  currentText: string;
  stale: boolean;
  onReturn?: () => void;
  onRestore: () => void;
  toolbarTarget?: HTMLElement | null;
  line?: number;
  compareMode?: "preview" | "diff";
  onCompare?: (value: "preview" | "diff") => void;
  scrollTop?: number;
  onScroll?: (top: number) => void;
  disabled?: boolean;
}) {
  const [localCompare, setCompare] = useState("preview");
  const compare = compareMode || localCompare;
  const [folderFile, setFolderFile] = useState(entry.files?.[0]?.id);
  const text =
    entry.kind === "folder"
      ? entry.files?.find((f) => f.id === folderFile)?.text || ""
      : entry.text;
  const heading = (
    <div
      className={
        "history-preview-heading" +
        (toolbarTarget ? " in-document-toolbar" : "")
      }
    >
      {onReturn && (
        <ChromeButton title={tr("m9f2b484bc113")} onClick={onReturn}>
          <ArrowLeft size={16} />
        </ChromeButton>
      )}
      <span>
        <strong>{entry.name}</strong>
        <small>
          {new Date(entry.at).toLocaleString(locale())} {tr("m51f76a1414d4")}
        </small>
      </span>
      <SegmentedControl
        label={tr("m7e3265d4022b")}
        value={compare}
        onChange={(value) =>
          onCompare ? onCompare(value as "preview" | "diff") : setCompare(value)
        }
        options={[
          { value: "preview", label: tr("m88638a3f4b7f") },
          { value: "diff", label: tr("m2ddd4be2e164") },
        ]}
      />
      <button
        className="history-restore"
        disabled={stale || disabled}
        onClick={onRestore}
      >
        <RotateCcw size={14} />
        {entry.deleted ? tr("m2abdcba8d536") : tr("mcd31b7281ae1")}
      </button>
    </div>
  );
  return (
    <section className="history-preview" aria-label={tr("m30464539bb09")}>
      {toolbarTarget ? createPortal(heading, toolbarTarget) : heading}
      {stale && (
        <p className="workspace-notice" role="alert">
          {tr("m18cb7b54b6ad")}
        </p>
      )}
      {compare === "diff" && (
        <p className="diff-legend">{tr("m6fa78c4a5837")}</p>
      )}
      {entry.kind === "folder" && (
        <div className="recovery-folder-files">
          <span>{tr("me32690155855")}</span>
          {entry.files?.map((file) => (
            <button
              key={file.id}
              className={folderFile === file.id ? "active" : ""}
              onClick={() => setFolderFile(file.id)}
            >
              {file.name}
            </button>
          ))}
        </div>
      )}
      <HistorySource
        original={currentText}
        text={text}
        compare={compare === "diff"}
        scrollTop={scrollTop}
        onScroll={onScroll}
        line={line}
      />
    </section>
  );
}
