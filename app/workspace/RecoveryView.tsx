"use client";
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
      } else setError("未能復原，原項目仍保留。請重試。");
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
      } else setError("未能永久刪除，請重試。");
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
            專案復原
          </h2>
          {state.scope === "deleted" && (
            <ChromeButton
              title="清空垃圾桶"
              disabled={busy || !project.recovery.some((e) => e.deleted)}
              onClick={() => setPurge("all")}
            >
              <Trash2 size={16} />
            </ChromeButton>
          )}
        </div>
        <SegmentedControl
          label="復原範圍"
          value={state.scope}
          onChange={(scope) =>
            onChange({
              ...emptyState,
              scope: scope as RecoveryViewState["scope"],
            })
          }
          options={[
            { value: "deleted", label: "最近刪除", icon: <Trash2 size={14} /> },
            { value: "commands", label: "指令版本" },
          ]}
        />
        <p className="panel-description">
          {state.scope === "deleted"
            ? "刪除項目保留 30 天。"
            : "每組指令保留最近 50 個版本。"}
        </p>
        <input
          aria-label="篩選復原項目"
          placeholder="搜尋名稱"
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
                      label: "復原",
                      icon: <ArchiveRestore size={15} />,
                      disabled: busy,
                      run: () => void restore(entry),
                    },
                    ...(entry.deleted
                      ? [
                          {
                            label: "永久刪除",
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
                <small>{new Date(entry.at).toLocaleString("zh-TW")}</small>
              </span>
            </button>
          ))}
        </div>
        {!entries.length && (
          <p className="empty-small">
            {state.query ? "沒有符合的復原項目。" : "這裡目前沒有項目。"}
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
          <p>選擇項目以預覽內容</p>
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
            {purge === "all" ? "清空垃圾桶？" : "永久刪除？"}
          </DialogTitle>
          <DialogDescription>
            {purge === "all"
              ? `永久刪除目前專案垃圾桶中的 ${project.recovery.filter((e) => e.deleted).length} 個項目，不受搜尋篩選影響。`
              : `永久刪除「${purge?.name || ""}」。`}
            此操作無法復原。
          </DialogDescription>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button disabled={busy} onClick={() => setPurge(null)}>
              取消
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void destroy()}
            >
              永久刪除
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
