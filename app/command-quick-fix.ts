import type { Command } from "./parser";
import { findCommand } from "./command-catalog";
import { argumentSpans } from "./command-hints";
import { scanMarkup, openMarkup } from "./inline-markup";
/** Only complete, unambiguous calls are eligible; comments and builtins are excluded. */
export function unregisteredCommand(
  text: string,
  offset: number,
  commands: Command[],
) {
  if (/^\s*(?:title|tags|tracking|when|position)\s*:/.test(text)) return null;
  const tags = scanMarkup(text);
  const hit = tags.find((tag) => offset >= tag.from && offset < tag.to);
  if (
    hit &&
    hit.name &&
    hit.complete &&
    !hit.malformed &&
    !findCommand(hit.name, commands, true)
  ) {
    const opening = hit.closing
      ? openMarkup(tags.slice(0, tags.indexOf(hit))).findLast(
          (tag) => tag.name === hit.name && !tag.closing,
        )
      : hit;
    if (
      !opening ||
      opening.malformed ||
      !opening.complete ||
      !/^[A-Za-z_]\w*$/.test(opening.name) ||
      opening.properties.some((p) => !/^[A-Za-z_]\w*$/.test(p.name))
    )
      return null;
    let depth = 1;
    const closing =
      !opening.selfClosing &&
      tags.slice(tags.indexOf(opening) + 1).find((tag) => {
        if (tag.closing && !tag.name) return true;
        if (tag.name !== opening.name || tag.selfClosing) return false;
        depth += tag.closing ? -1 : 1;
        return depth === 0;
      });
    const command: Command = {
      name: opening.name,
      inline: true,
      markupMode: opening.selfClosing ? "selfClosing" : "paired",
      description: "",
      example: text.slice(opening.from, closing ? closing.to : opening.to),
      params: [
        ...new Map(opening.properties.map((p) => [p.name, p])).values(),
      ].map((p) => ({
        name: p.name,
        type: /^(true|false)$/i.test(p.value)
          ? "boolean"
          : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(p.value)
            ? "number"
            : "string",
        required: true,
        defaultValue: "",
      })),
    };
    return { command, from: hit.from, to: hit.to };
  }
  const match = /^\s*<<\s*([A-Za-z_]\w*)\b([\s\S]*?)>>\s*(?:\/\/.*)?$/.exec(
    text,
  );
  if (!match || findCommand(match[1], commands)) return null;
  const from = text.indexOf("<<"),
    to = text.lastIndexOf(">>") + 2;
  if (offset < from || offset > to) return null;
  const spans = argumentSpans(match[2]);
  if (!spans) return null;
  const command: Command = {
    name: match[1],
    description: "",
    example: text.slice(from, to),
    params: spans.map((span, index) => {
      const value = match[2].slice(span.from, span.to);
      return {
        name: "arg" + (index + 1),
        type: /^(true|false)$/.test(value)
          ? "boolean"
          : /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)
            ? "number"
            : "string",
        required: true,
        defaultValue: "",
      };
    }),
  };
  return { command, from, to };
}
