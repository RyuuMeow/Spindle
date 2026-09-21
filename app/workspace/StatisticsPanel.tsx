"use client";
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
    ["場景", data.stats.scenes],
    ["選項", data.stats.options],
    ["台詞字元", data.stats.characters],
    ["角色", data.stats.roles.length],
  ];
  const maxRole = Math.max(1, ...data.roles.map((r) => r[1])),
    maxScene = Math.max(1, ...data.scenes.map((s) => s.count));
  return (
    <aside
      className="document-side statistics-panel"
      aria-label="作者統計"
      style={{ width, flexBasis: width }}
    >
      <PanelResizeHandle
        side="right"
        value={width}
        min={220}
        max={420}
        label="調整分析寬度"
        onResize={onWidth}
      />
      <div className="section-heading">
        <strong>
          <BarChart3 size={15} /> 作者統計
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
          角色台詞分布 <small>行數</small>
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
          <p className="empty-small">尚無台詞</p>
        )}
        <h3>
          場景篇幅 <small>台詞行數</small>
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
