"use client";
import { t as tr } from "../i18n/index.ts";

import { AlertTriangle, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import { CompactSelect } from "@/components/CompactSelect";
import { SegmentedControl } from "@/components/SegmentedControl";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import type { Issue } from "../parser";
const scopes = [
  { value: "all", label: tr("m3cda0b4acf98") },
  { value: "current", label: tr("meae7f2811778") },
];
const severities = [
  { value: "all", label: tr("m5c55a67935af") },
  { value: "error", label: tr("m157b2f926735") },
  { value: "warning", label: tr("m8f29b3132ccf") },
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
      aria-label={tr("mcf85ad10cef3")}
      style={{ height: issues.length ? height : Math.min(height, 110) }}
    >
      <PanelResizeHandle
        side="bottom"
        value={height}
        min={90}
        max={420}
        onResize={onHeight}
        label={tr("me294399c7732")}
      />
      <div className="problems-toolbar">
        <span className="problems-heading">
          {tr("mcf85ad10cef3")}
          <small>{issues.length}</small>
        </span>
        <span className="problems-note" title={tr("m9e4af203c96c")}>
          <Info size={13} />
        </span>
        <div className="problems-filters-wide">
          <SegmentedControl
            label={tr("m17a2002a282a")}
            value={scope}
            onChange={onScope}
            options={scopes}
          />
          <SegmentedControl
            label={tr("m6463fe4dbe25")}
            value={severity}
            onChange={onSeverity}
            options={severities}
          />
        </div>
        <div className="problems-filters-compact">
          <CompactSelect
            label={tr("m17a2002a282a")}
            value={scope}
            onChange={onScope}
            options={scopes}
          />
          <CompactSelect
            label={tr("m6463fe4dbe25")}
            value={severity}
            onChange={onSeverity}
            options={severities}
          />
        </div>
        <ChromeButton title={tr("m3b92db2cd505")} onClick={onClose}>
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
            {tr("mfcfdd68b5749")}
          </p>
        )}
      </div>
    </aside>
  );
}
