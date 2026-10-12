import { findCommand, type CommandInfo } from "../command-catalog";
import { scanMarkup, type MarkupTag } from "../inline-markup";
import type { Command } from "../parser";

/** Keep source offsets and Yarn's overlapping/close-all ranges intact. */
export function inlinePresentation(text: string, commands: Command[]) {
  const markers: { tag: MarkupTag; command: CommandInfo }[] = [];
  const scopes: { from: number; to: number }[] = [];
  const open: { tag: MarkupTag; command?: CommandInfo }[] = [];
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
      for (const entry of closed) {
        if (entry.command && tag.from > entry.tag.to)
          scopes.push({ from: entry.tag.to, to: tag.from });
      }
      const command = closed.findLast((entry) => entry.command)?.command;
      if (command) markers.push({ tag, command });
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
    if (!tag.selfClosing) open.push({ tag, command });
    if (command) markers.push({ tag, command });
  }
  return { markers, scopes };
}
