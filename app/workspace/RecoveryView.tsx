"use client";
import { useState } from "react";
import { ArchiveRestore, FileText, Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { HistoryPreview } from "./HistoryView";
import type { Project, RecoveryEntry } from "./types";

export default function RecoveryView({
  project,
  onRestore,
}: {
  project: Project;
  onRestore: (
    entry: RecoveryEntry,
    expectedVersion?: number,
    expectedText?: string,
  ) => void;
}) {
  const [scope, setScope] = useState("deleted"),
    [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{
    entry: RecoveryEntry;
    text: string;
    version?: number;
  } | null>(null);
  const current =
    selection?.entry.documentId === "@commands"
      ? JSON.stringify(project.commands)
      : project.documents.find((d) => d.id === selection?.entry.documentId)
          ?.text || "";
  const entries = [...project.recovery]
    .filter(
      (entry) =>
        (scope === "deleted"
          ? entry.deleted
          : entry.documentId === "@commands") &&
        entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => b.at - a.at);
  return (
    <div className="recovery-workspace">
      <aside className="recovery-index">
        <h2>
          <ArchiveRestore size={18} />
          專案復原
        </h2>
        <SegmentedControl
          label="復原範圍"
          value={scope}
          onChange={(value) => {
            setScope(value);
            setSelection(null);
          }}
          options={[
            { value: "deleted", label: "最近刪除", icon: <Trash2 size={14} /> },
            { value: "commands", label: "指令版本" },
          ]}
        />
        <p className="panel-description">
          {scope === "deleted"
            ? "刪除項目保留 30 天。劇本版本請從文件工具列的歷史開啟。"
            : "檢查定義內容後，再還原指令版本。"}
        </p>
        <input
          aria-label="篩選復原項目"
          placeholder="搜尋名稱"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="history-entries">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={selection?.entry.id === entry.id ? "active" : ""}
              onClick={() => {
                const doc = project.documents.find(
                  (d) => d.id === entry.documentId,
                );
                setSelection({
                  entry,
                  text:
                    entry.documentId === "@commands"
                      ? JSON.stringify(project.commands)
                      : doc?.text || "",
                  version: doc?.version,
                });
              }}
            >
              <FileText size={14} />
              <span>
                <strong>{entry.name}</strong>
                <small>{new Date(entry.at).toLocaleString("zh-TW")}</small>
              </span>
            </button>
          ))}
        </div>
        {!entries.length && <p className="empty-small">沒有符合的復原項目。</p>}
      </aside>
      {selection ? (
        <HistoryPreview
          entry={selection.entry}
          currentText={selection.text}
          stale={current !== selection.text}
          onReturn={() => setSelection(null)}
          onRestore={() =>
            onRestore(selection.entry, selection.version, selection.text)
          }
        />
      ) : (
        <div className="empty-editor">
          <ArchiveRestore size={30} />
          <p>選擇項目以預覽內容</p>
        </div>
      )}
    </div>
  );
}
