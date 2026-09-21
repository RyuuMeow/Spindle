import type { Typography } from "./model";
export type HighlightRange = {
  from: number;
  to: number;
  kind: "match" | "symbol";
};
/** Only syntactic variable references with a declaration and uniquely named scene references qualify. */
function symbols(text: string) {
  const declarations = new Set(
    Array.from(
      text.matchAll(/<<declare\s+(\$[\p{L}_][\p{L}\p{N}_]*)/gu),
      (m) => m[1],
    ),
  );
  const titles = new Map<string, number>();
  for (const m of text.matchAll(/^title:[ \t]*(\S+)[ \t]*$/gm))
    titles.set(m[1], (titles.get(m[1]) || 0) + 1);
  const result: { from: number; to: number; key: string }[] = [];
  for (const m of text.matchAll(/^title:[ \t]*(\S+)[ \t]*$/gm)) {
    if (titles.get(m[1]) === 1) {
      const from = m.index! + m[0].indexOf(m[1], 6);
      result.push({ from, to: from + m[1].length, key: "scene:" + m[1] });
    }
  }
  for (const call of text.matchAll(/<<[^\n]*?>>|\{[^\n}]*\}/g)) {
    // Quoted strings and comments are not symbol references.
    const before = text.slice(
      text.lastIndexOf("\n", call.index!) + 1,
      call.index!,
    );
    if (before.includes("//")) continue;
    const masked = call[0].replace(/"(?:\\.|[^"\\])*"/g, (s) =>
      " ".repeat(s.length),
    );
    for (const m of masked.matchAll(/\$[\p{L}_][\p{L}\p{N}_]*/gu))
      if (declarations.has(m[0])) {
        const from = call.index! + m.index!;
        result.push({ from, to: from + m[0].length, key: "var:" + m[0] });
      }
    const jump =
      /^<<\s*(?:jump|detour)\s+([\p{L}_][\p{L}\p{N}_.-]*)\s*>>$/u.exec(masked);
    if (jump && titles.get(jump[1]) === 1) {
      const from = call.index! + masked.indexOf(jump[1], masked.indexOf(" "));
      result.push({ from, to: from + jump[1].length, key: "scene:" + jump[1] });
    }
  }
  return result;
}
export function highlightRanges(
  text: string,
  from: number,
  to: number,
  searching: boolean,
  style: Pick<Typography, "highlightMatches" | "highlightSymbols">,
): HighlightRange[] {
  if (searching) return [];
  if (from !== to) {
    const query = text.slice(from, to);
    if (!style.highlightMatches || !query.trim()) return [];
    const result: HighlightRange[] = [];
    for (
      let at = text.indexOf(query);
      at >= 0 && result.length < 2000;
      at = text.indexOf(query, at + query.length)
    ) {
      if (at + query.length <= from || at >= to)
        result.push({ from: at, to: at + query.length, kind: "match" });
    }
    return result;
  }
  if (!style.highlightSymbols) return [];
  const references = symbols(text),
    active = references.find((r) => r.from <= from && r.to >= from);
  return active
    ? references
        .filter((r) => r.key === active.key)
        .map((r) => ({ from: r.from, to: r.to, kind: "symbol" }))
    : [];
}
