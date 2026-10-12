import type { Command } from "./parser";
import { commandCatalog } from "./command-catalog";
import { argumentSpans, commandInput } from "./command-hints";
import { scanMarkup } from "./inline-markup";
import { mismatch } from "./command-overloads";

/** Replace a complete value token, retaining no stale quote or suffix. */
export function commandValueCompletion(
  text: string,
  offset: number,
  commands: Command[],
) {
  const catalog = commandCatalog(commands);
  const tag = scanMarkup(text).find(
    (t) => !t.closing && offset > t.from && offset <= t.to,
  );
  let from: number, to: number, values: string[];
  if (tag) {
    const property = tag.properties.find(
      (p) => offset >= p.valueFrom && offset <= p.to,
    );
    if (
      !property ||
      property.value.startsWith("{") ||
      property.value.startsWith("$")
    )
      return null;
    from = property.valueFrom;
    to = property.to;
    const prior = tag.properties.filter((p) => p !== property);
    values = catalog
      .filter(
        (c) =>
          c.inline && c.name === tag.name && mismatch(c, prior, true) === 0,
      )
      .flatMap(
        (c) => c.params.find((p) => p.name === property.name)?.allowList || [],
      );
  } else {
    const prefix = text.slice(0, offset);
    const input = commandInput(prefix);
    if (input?.kind !== "argument") return null;
    const start = /^\s*<<\s*\w+\s+/.exec(text)?.[0].length;
    if (start === undefined) return null;
    const body = prefix.slice(start);
    const spans = argumentSpans(body);
    // Finish a quote solely to tokenize the cursor prefix; expressions remain opaque.
    const complete = spans || argumentSpans(body + '"');
    if (!complete) return null;
    const active = complete[input.index];
    from = active ? start + active.from : offset;
    if (/^[{$]/.test(text.slice(from))) return null;
    const suffix = text.slice(from);
    const token =
      /^(?:"(?:\\.|[^"\\])*"|"[^"\r\n]*|[^\s>]+)/.exec(suffix)?.[0] || "";
    to = Math.max(offset, from + token.length);
    const prior = complete
      .slice(0, input.index)
      .map((s) => body.slice(s.from, s.to));
    values = catalog
      .filter(
        (c) =>
          !c.inline && c.name === input.name && mismatch(c, prior, true) === 0,
      )
      .flatMap((c) => c.params[input.index]?.allowList || []);
  }
  if (!values.length) return null;
  const tokenPrefix = text.slice(from, offset);
  let typed = tokenPrefix;
  if (typed.startsWith('"')) {
    try {
      typed = JSON.parse(
        typed.endsWith('"') && typed.length > 1 ? typed : typed + '"',
      );
    } catch {
      typed = typed.slice(1);
    }
  }
  return {
    from,
    to,
    values: [...new Set(values)]
      .filter((value) => value.startsWith(typed))
      .map((value) => ({ label: value, insertText: JSON.stringify(value) })),
  };
}
