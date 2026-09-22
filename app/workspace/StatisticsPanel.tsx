"use client";
import { t as tr } from "../i18n/index.ts";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { documentStatistics } from "./statistics";
import type { DocumentRecord } from "./types";
export default function StatisticsPanel({
  doc,
  width,
  onWidth,
  onNavigate,
}: {
  doc: DocumentRecord;
  width: number;
  onWidth: (width: number) => void;
  onNavigate: (line: number) => void;
}) {
  const data = useMemo(() => documentStatistics(doc.text), [doc.text]);
  const metrics = [
    [tr("mcb88dc73b257"), data.stats.scenes],
    [tr("m062cae7f1167"), data.stats.options],
    [tr("me3fea30618a7"), data.stats.characters],
    [tr("mc47b54e84e79"), data.stats.roles.length],
  ];
  const maxRole = Math.max(1, ...data.roles.map((r) => r[1])),
    maxScene = Math.max(1, ...data.scenes.map((s) => s.count));
  return (
    <aside
      className="document-side statistics-panel"
      aria-label={tr("me3ca8ea79b91")}
      style={{ width, flexBasis: width }}
    >
      <PanelResizeHandle
        side="right"
        value={width}
        min={220}
        max={420}
        label={tr("m95b6b11c063d")}
        onResize={onWidth}
      />
      <div className="section-heading">
        <strong>
          <BarChart3 size={15} /> {tr("me3ca8ea79b91")}
        </strong>
      </div>
      <div className="statistics-scroll">
        <p className="statistics-file">{doc.name}</p>
        <dl className="statistics-metrics">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h3>
          {tr("m8b4f3af4220d")}
          <small>{tr("mf3cd22fd562e")}</small>
        </h3>
        {data.roles.length ? (
          data.roles.map(([name, count]) => (
            <div className="statistics-bar" key={name}>
              <span>{name}</span>
              <b>{count}</b>
              <i style={{ width: (count / maxRole) * 100 + "%" }} />
            </div>
          ))
        ) : (
          <p className="empty-small">{tr("m6f267a4ca1de")}</p>
        )}
        <h3>
          {tr("mb0294e8b1885")}
          <small>{tr("m7e4b409508b0")}</small>
        </h3>
        {data.scenes.map((s) => (
          <button
            className="statistics-bar"
            key={s.line}
            onClick={() => onNavigate(s.line)}
          >
            <span>{s.name}</span>
            <b>{s.count}</b>
            <i style={{ width: (s.count / maxScene) * 100 + "%" }} />
          </button>
        ))}
      </div>
    </aside>
  );
}
