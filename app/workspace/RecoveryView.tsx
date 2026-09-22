"use client";
import { t as tr, locale } from "../i18n/index.ts";

import { useState } from "react";
import { ArchiveRestore, FileText, Folder, Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChromeButton } from "@/components/ChromeButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ActionMenu, { type MenuState } from "./ActionMenu";
import { HistoryPreview } from "./HistoryView";
import type { Project, RecoveryEntry, RecoveryViewState } from "./types";

const emptyState: RecoveryViewState = {
  scope: "deleted",
  query: "",
  compare: "preview",
  scrollTop: 0,
};
export default function RecoveryView({
  project,
  state = emptyState,
  onChange,
  onRestore,
  onPurge,
}: {
  project: Project;
  state?: RecoveryViewState;
  onChange: (next: RecoveryViewState) => void;
  onRestore: (
    entry: RecoveryEntry,
    expectedVersion?: number,
    expectedText?: string,
  ) => Promise<boolean>;
  onPurge: (id?: string) => Promise<boolean>;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null),
    [purge, setPurge] = useState<RecoveryEntry | "all" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const entries = [...project.recovery]
    .filter(
      (e) =>
        (state.scope === "deleted"
          ? e.deleted
          : e.documentId === "@commands") &&
        e.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()),
    )
    .sort((a, b) => b.at - a.at);
  const selection = project.recovery.find((e) => e.id === state.selectedId);
  const currentText = (entry: RecoveryEntry) =>
    entry.documentId === "@commands"
      ? JSON.stringify(project.commands)
      : project.documents.find((d) => d.id === entry.documentId)?.text || "";
  function selected(entry?: RecoveryEntry): RecoveryViewState {
    return {
      ...state,
      selectedId: entry?.id,
      previewScrollTop: 0,
      baseline: entry
        ? {
            text: currentText(entry),
            version: project.documents.find((d) => d.id === entry.documentId)
              ?.version,
          }
        : undefined,
    };
  }
  function advance(entry: RecoveryEntry) {
    const index = entries.findIndex((e) => e.id === entry.id);
    onChange(selected(entries[index + 1] || entries[index - 1]));
  }
  async function restore(entry: RecoveryEntry) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const baseline =
        entry.id === state.selectedId ? state.baseline : undefined;
      if (await onRestore(entry, baseline?.version, baseline?.text)) {
        if (entry.deleted) advance(entry);
        else onChange({ ...state, baseline: { text: entry.text } });
      } else setError(tr("m7531e0b166b4"));
    } finally {
      setBusy(false);
    }
  }
  async function destroy() {
    if (!purge || busy) return;
    setBusy(true);
    setError("");
    try {
      if (await onPurge(purge === "all" ? undefined : purge.id)) {
        if (purge === "all")
          onChange({
            ...state,
            selectedId:
              state.scope === "deleted" ? undefined : state.selectedId,
            baseline: state.scope === "deleted" ? undefined : state.baseline,
          });
        else if (state.selectedId === purge.id) advance(purge);
        setPurge(null);
      } else setError(tr("m801c84af258a"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="recovery-workspace">
      <aside className="recovery-index">
        <div className="section-heading">
          <h2>
            <ArchiveRestore size={18} />
            {tr("m525e69a5165d")}
          </h2>
          {state.scope === "deleted" && (
            <ChromeButton
              title={tr("m2466ad0d23ed")}
              disabled={busy || !project.recovery.some((e) => e.deleted)}
              onClick={() => setPurge("all")}
            >
              <Trash2 size={16} />
            </ChromeButton>
          )}
        </div>
        <SegmentedControl
          label={tr("m0bcac8cf6eb9")}
          value={state.scope}
          onChange={(scope) =>
            onChange({
              ...emptyState,
              scope: scope as RecoveryViewState["scope"],
            })
          }
          options={[
            {
              value: "deleted",
              label: tr("mad101b80eb5e"),
              icon: <Trash2 size={14} />,
            },
            { value: "commands", label: tr("m4e1571bb0041") },
          ]}
        />
        <p className="panel-description">
          {state.scope === "deleted"
            ? tr("mc7d43be031a6")
            : tr("m79c03bd123f1")}
        </p>
        <input
          aria-label={tr("mfb256450d6c8")}
          placeholder={tr("m3733110aa464")}
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
        />
        <div
          className="history-entries"
          ref={(element) => {
            if (element && Math.abs(element.scrollTop - state.scrollTop) > 1)
              element.scrollTop = state.scrollTop;
          }}
          onScroll={(e) =>
            onChange({ ...state, scrollTop: e.currentTarget.scrollTop })
          }
        >
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={selection?.id === entry.id ? "active" : ""}
              aria-pressed={selection?.id === entry.id}
              onClick={() => onChange(selected(entry))}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  origin: event.currentTarget,
                  actions: [
                    {
                      label: tr("m2abdcba8d536"),
                      icon: <ArchiveRestore size={15} />,
                      disabled: busy,
                      run: () => void restore(entry),
                    },
                    ...(entry.deleted
                      ? [
                          {
                            label: tr("m6671987c7186"),
                            icon: <Trash2 size={15} />,
                            danger: true,
                            disabled: busy,
                            run: () => setPurge(entry),
                          },
                        ]
                      : []),
                  ],
                });
              }}
            >
              {entry.kind === "folder" ? (
                <Folder size={14} />
              ) : (
                <FileText size={14} />
              )}
              <span>
                <strong>{entry.name}</strong>
                <small>{new Date(entry.at).toLocaleString(locale())}</small>
              </span>
            </button>
          ))}
        </div>
        {!entries.length && (
          <p className="empty-small">
            {state.query ? tr("mf8de90b1911b") : tr("mf9eab13d8dbb")}
          </p>
        )}
        {error && !purge && (
          <p role="alert" className="workspace-notice">
            {error}
          </p>
        )}
      </aside>
      {selection ? (
        <HistoryPreview
          key={selection.id}
          entry={selection}
          currentText={state.baseline?.text || ""}
          stale={
            !selection.deleted &&
            currentText(selection) !== (state.baseline?.text || "")
          }
          onRestore={() => void restore(selection)}
          disabled={busy}
          compareMode={state.compare}
          onCompare={(compare) => onChange({ ...state, compare })}
          scrollTop={state.previewScrollTop}
          onScroll={(previewScrollTop) =>
            onChange({ ...state, previewScrollTop })
          }
        />
      ) : (
        <div className="empty-editor">
          <ArchiveRestore size={30} />
          <p>{tr("m23b0426a1ee0")}</p>
        </div>
      )}
      <ActionMenu menu={menu} onClose={() => setMenu(null)} />
      <Dialog
        open={!!purge}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPurge(null);
            setError("");
          }
        }}
      >
        <DialogContent className="workbench-dialog">
          <DialogTitle>
            {purge === "all" ? tr("mea01e3aea996") : tr("md8399a4544c9")}
          </DialogTitle>
          <DialogDescription>
            {purge === "all"
              ? tr("m8e11f3dab6a8", [
                  project.recovery.filter((e) => e.deleted).length,
                ])
              : tr("m9789e1105095", [purge?.name || ""])}
            {tr("m9aeebb241ac5")}
          </DialogDescription>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button disabled={busy} onClick={() => setPurge(null)}>
              {tr("m2cd0f3be8738")}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void destroy()}
            >
              {tr("m6671987c7186")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
