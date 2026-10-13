import { findCommand, type CommandInfo } from "../command-catalog";
import { scanMarkup, type MarkupTag } from "../inline-markup";
import type { Command } from "../parser";
import { inlinePaletteDefaults } from "../appearance/model";

export type InlineGroup = {
  tag: MarkupTag;
  closing?: MarkupTag;
  command: CommandInfo;
  color: string;
  lane: number;
};
/** Colors depend on marker order, never caret or viewport; overlapping ranges get separate lanes. */
export function inlinePresentation(
  text: string,
  commands: Command[],
  palette = inlinePaletteDefaults,
) {
  const groups: InlineGroup[] = [];
  const open: { tag: MarkupTag; group?: InlineGroup }[] = [];
  let sequence = 0;
  for (const tag of scanMarkup(text)) {
    if (!tag.complete || tag.malformed) continue;
    if (tag.closing) {
      if (tag.properties.length || tag.selfClosing) continue;
      const index = open.findLastIndex((entry) => entry.tag.name === tag.name);
      const closed = !tag.name
        ? open.splice(0)
        : index < 0
          ? []
          : open.splice(index, 1);
      for (const entry of closed) if (entry.group) entry.group.closing = tag;
      continue;
    }
    const command = findCommand(
      tag.name,
      commands,
      true,
      tag.properties,
      false,
      tag.selfClosing ? "selfClosing" : "paired",
    );
    let group: InlineGroup | undefined;
    if (command) {
      const occupied = new Set(
        open.flatMap((entry) => (entry.group ? [entry.group.lane] : [])),
      );
      let lane = 0;
      while (occupied.has(lane)) lane++;
      group = {
        tag,
        command,
        color: palette[sequence++ % palette.length],
        lane,
      };
      groups.push(group);
    }
    if (!tag.selfClosing) open.push({ tag, group });
  }
  const scopes = groups
    .filter((group) => group.closing && group.closing.from > group.tag.to)
    .map((group) => ({ from: group.tag.to, to: group.closing!.from, group }));
  const markers = groups.flatMap((group) => [
    { tag: group.tag, command: group.command, group },
    ...(group.closing
      ? [{ tag: group.closing, command: group.command, group }]
      : []),
  ]);
  return { groups, markers, scopes };
}
/** Disjoint runs avoid nested span backgrounds covering another range's underline. */
export function inlineScopeRuns(
  scopes: ReturnType<typeof inlinePresentation>["scopes"],
) {
  const boundaries = [
    ...new Set(scopes.flatMap((scope) => [scope.from, scope.to])),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).flatMap((from, index) => {
    const to = boundaries[index + 1];
    const groups = scopes
      .filter((scope) => scope.from <= from && scope.to >= to)
      .map((scope) => scope.group);
    return groups.length ? [{ from, to, groups }] : [];
  });
}
export function inlineRangeStyle(groups: InlineGroup[]) {
  const maxLane = Math.max(...groups.map((group) => group.lane));
  return {
    backgroundImage: groups
      .map(
        (group) => "linear-gradient(" + group.color + "," + group.color + ")",
      )
      .join(","),
    backgroundSize: groups.map(() => "100% 2px").join(","),
    backgroundPosition: groups
      .map((group) => "left bottom " + (maxLane - group.lane) * 3 + "px")
      .join(","),
    paddingBottom: (maxLane + 1) * 3 + "px",
  };
}
