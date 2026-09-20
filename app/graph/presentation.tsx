import { Fragment } from "react";
import { contextLabel, type Link } from "../parser";
import type { GraphTransition } from "./model";
export function SemanticText({ text }: { text: string }) {
  return (
    <>
      {text.split(/("(?:\\.|[^"\\])*"|\$[A-Za-z_]\w*)/g).map((part, index) =>
        /^\$[A-Za-z_]\w*$/.test(part) ? (
          <span className="flow-variable" key={index}>
            {part.slice(1)}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
export function linkSummary(link: Link) {
  if (link.unresolved) return "條件尚未解析完整";
  const context = link.context || [],
    branch = context.at(-1);
  if (branch)
    return branch.kind === "option"
      ? branch.text
      : branch.kind === "else"
        ? "否則"
        : branch.kind === "elseif"
          ? "否則若 " + branch.text
          : contextLabel(branch);
  return (
    link.label ||
    (link.dynamic
      ? "動態目標"
      : link.kind === "detour"
        ? "呼叫後返回"
        : "直接轉場")
  );
}
export function parentSummary(link: Link) {
  return (link.context || [])
    .slice(0, -1)
    .map((c) =>
      c.kind === "option"
        ? c.text
        : c.kind === "else"
          ? "否則"
          : c.kind === "elseif"
            ? "否則若 " + c.text
            : c.kind === "if"
              ? "若 " + c.text
              : contextLabel(c),
    )
    .join(" / ");
}
export function measureLabels(groups: GraphTransition[]) {
  const context =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (context)
    context.font = '12px "Segoe UI", "Microsoft JhengHei", sans-serif';
  const width = (s: string) =>
    context?.measureText(s).width ??
    [...s].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 12 : 7), 0);
  const dimensions = Object.fromEntries(
    groups
      .filter((g) => g.label)
      .map((g) => {
        const text = linkSummary(g.items[0]);
        const w = Math.max(160, Math.min(240, width(text) + 38));
        let lines = 1,
          used = 0;
        for (const c of text) {
          used += width(c);
          if (used > w - 38) {
            lines++;
            used = width(c);
          }
        }
        return [
          g.id,
          {
            text,
            width: w,
            height:
              Math.max(32, lines * 18 + 14) +
              (parentSummary(g.items[0]) ? 18 : 0),
          },
        ];
      }),
  );
  // A group is a readable column, including when one condition wraps.
  for (const id of new Set(groups.map((g) => g.groupId).filter(Boolean))) {
    const members = groups.filter((g) => g.groupId === id && dimensions[g.id]);
    const w = Math.max(160, ...members.map((g) => dimensions[g.id].width));
    for (const g of members) {
      const d = dimensions[g.id];
      d.width = w;
      d.height =
        Math.max(32, Math.ceil(width(d.text) / (w - 38)) * 18 + 14) +
        (parentSummary(g.items[0]) ? 18 : 0);
    }
  }
  return dimensions;
}
