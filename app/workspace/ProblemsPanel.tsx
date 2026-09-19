"use client";
import { AlertTriangle, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import { CompactSelect } from "@/components/CompactSelect";
import { SegmentedControl } from "@/components/SegmentedControl";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import type { Issue } from "../parser";
const scopes = [
  { value: "all", label: "全專案" },
  { value: "current", label: "目前劇本" },
];
const severities = [
  { value: "all", label: "全部" },
  { value: "error", label: "錯誤" },
  { value: "warning", label: "提醒" },
];
export function ProblemsPanel({
  issues,
  scope,
  onScope,
  severity,
  onSeverity,
  height,
  onHeight,
  onClose,
  onNavigate,
}: {
  issues: Issue[];
  scope: string;
  onScope: (value: string) => void;
  severity: string;
  onSeverity: (value: string) => void;
  height: number;
  onHeight: (value: number) => void;
  onClose: () => void;
  onNavigate: (issue: Issue) => void;
}) {
  return (
    <aside
      className={`workspace-problems ${issues.length ? "" : "is-empty"}`}
      aria-label="結構檢查"
      style={{ height: issues.length ? height : Math.min(height, 110) }}
    >
      <PanelResizeHandle
        side="bottom"
        value={height}
        min={90}
        max={420}
        onResize={onHeight}
        label="調整結構檢查高度"
      />
      <div className="problems-toolbar">
        <span className="problems-heading">
          結構檢查 <small>{issues.length}</small>
        </span>
        <span
          className="problems-note"
          title="靜態結構檢查，不執行 Yarn；非官方編譯器。"
        >
          <Info size={13} />
        </span>
        <div className="problems-filters-wide">
          <SegmentedControl
            label="檢查範圍"
            value={scope}
            onChange={onScope}
            options={scopes}
          />
          <SegmentedControl
            label="問題嚴重度"
            value={severity}
            onChange={onSeverity}
            options={severities}
          />
        </div>
        <div className="problems-filters-compact">
          <CompactSelect
            label="檢查範圍"
            value={scope}
            onChange={onScope}
            options={scopes}
          />
          <CompactSelect
            label="問題嚴重度"
            value={severity}
            onChange={onSeverity}
            options={severities}
          />
        </div>
        <ChromeButton title="關閉檢查" onClick={onClose}>
          <X size={15} />
        </ChromeButton>
      </div>
      <div className="issues-scroll">
        {issues.map((issue, index) => (
          <button
            key={`${issue.file}:${issue.line}:${index}`}
            className="issue-row"
            onClick={() => onNavigate(issue)}
          >
            {issue.severity === "error" ? (
              <CircleAlert size={14} className="error" />
            ) : (
              <AlertTriangle size={14} className="warning" />
            )}
            <span>{issue.message}</span>
            <small title={issue.file}>
              {issue.file} : {issue.line}
            </small>
          </button>
        ))}
        {!issues.length && (
          <p className="problems-empty">
            <CircleCheck size={15} />
            此範圍未發現結構問題。
          </p>
        )}
      </div>
    </aside>
  );
}
