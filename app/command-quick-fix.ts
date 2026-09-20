import type { Command } from "./parser";
import { findCommand } from "./command-catalog";
import { argumentSpans } from "./command-hints";
/** Only complete, unambiguous calls are eligible; comments and builtins are excluded. */
export function unregisteredCommand(
  text: string,
  offset: number,
  commands: Command[],
) {
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
