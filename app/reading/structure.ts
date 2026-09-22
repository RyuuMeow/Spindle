import { t as tr } from "../i18n/index.ts";
export type ReadingLine = {
  from: number;
  to: number;
  text: string;
  line: number;
  kind:
    | "title"
    | "tags"
    | "header"
    | "start"
    | "end"
    | "dialogue"
    | "option"
    | "condition"
    | "command"
    | "blank"
    | "comment"
    | "raw";
  depth: number;
  context: string[];
  optionEnd: boolean;
  optionGroupStart?: boolean;
  command?: string;
  argument?: string;
  valid: boolean;
};
export function readingStructure(source: string): ReadingLine[] {
  const lines: ReadingLine[] = [],
    stack: { name: string; label: string; line: number }[] = [],
    options: { indent: number; label: string; line: number }[] = [];
  let offset = 0,
    inBody = false;
  source.split("\n").forEach((text, index) => {
    const clean = text.trim(),
      indent = text.search(/\S/),
      entry: ReadingLine = {
        from: offset,
        to: offset + text.length,
        text,
        line: index + 1,
        kind: "raw",
        depth: stack.length,
        context: stack.map((s) => s.label),
        optionEnd: false,
        valid: true,
      };
    offset += text.length + 1;
    if (!clean) {
      entry.kind = "blank";
    } else if (clean.startsWith("//")) {
      entry.kind = "comment";
    } else if (/^title\s*:/.test(clean)) {
      for (const s of stack)
        for (let i = s.line; i < lines.length; i++) lines[i].valid = false;
      stack.length = 0;
      options.length = 0;
      entry.depth = 0;
      entry.context = [];
      entry.kind = "title";
      inBody = false;
    } else if (clean === "---") {
      entry.kind = "start";
      inBody = true;
    } else if (clean === "===") {
      entry.kind = "end";
      for (const s of stack)
        for (let i = s.line; i < lines.length; i++) lines[i].valid = false;
      stack.length = 0;
      options.length = 0;
      inBody = false;
      entry.depth = 0;
    } else if (!inBody) {
      if (/^tags\s*:/.test(clean)) entry.kind = "tags";
      else entry.kind = "header";
    } else {
      let previousSibling = false;
      while (clean && options.length && indent <= options.at(-1)!.indent) {
        if (indent === options.at(-1)!.indent) previousSibling = true;
        options.pop();
        entry.optionEnd = true;
      }
      entry.context = [...stack, ...options]
        .sort((a, b) => a.line - b.line)
        .map((s) => s.label);
      if (/^->/.test(clean)) {
        entry.kind = "option";
        entry.optionGroupStart = !previousSibling;
        options.push({ indent, label: clean.slice(2).trim(), line: index });
        entry.optionEnd = false;
      } else {
        const match = clean.match(
          /^<<\s*([A-Za-z_]\w*)(?:\s+([\s\S]*?))?\s*>>\s*(?:\/\/.*)?$/,
        );
        if (match) {
          entry.command = match[1];
          entry.argument = match[2] || "";
          entry.kind = [
            "if",
            "elseif",
            "else",
            "endif",
            "once",
            "endonce",
          ].includes(match[1])
            ? "condition"
            : "command";
          if (match[1] === "if" || match[1] === "once") {
            stack.push({
              name: match[1],
              label: match[2] || tr("mf64725f34d2f"),
              line: index,
            });
            entry.depth = stack.length;
            entry.context = [...stack.slice(0, -1), ...options]
              .sort((a, b) => a.line - b.line)
              .map((s) => s.label);
          } else if (match[1] === "endif" || match[1] === "endonce") {
            if (stack.at(-1)?.name !== (match[1] === "endif" ? "if" : "once"))
              entry.valid = false;
            else stack.pop();
          } else if (match[1] === "else" || match[1] === "elseif") {
            if (!stack.length) entry.valid = false;
            else {
              entry.context = [...stack.slice(0, -1), ...options]
                .sort((a, b) => a.line - b.line)
                .map((s) => s.label);
              stack[stack.length - 1].label =
                match[1] === "else" ? tr("m9be688476db3") : match[2] || "";
            }
          }
        } else if (!clean.startsWith("<<") && !clean.startsWith("//"))
          entry.kind = "dialogue";
      }
    }
    lines.push(entry);
  });
  for (const s of stack)
    for (let i = s.line; i < lines.length; i++) lines[i].valid = false;
  return lines;
}

export type ReadingFold = { from: number; to: number };

/** Only complete scenes can fold; an unfinished scene never absorbs the next. */
export function readingSceneRanges(lines: ReadingLine[]) {
  const ranges: (ReadingFold & { start: number })[] = [];
  let title: ReadingLine | undefined;
  for (const line of lines) {
    if (line.kind === "title") title = line;
    if (line.kind === "end" && title) {
      ranges.push({ start: title.from, from: title.to, to: line.to });
      title = undefined;
    }
  }
  return ranges;
}

/** Persisted offsets must still describe complete scenes in this source. */
export function restoreReadingFolds(
  lines: ReadingLine[],
  folds: readonly ReadingFold[],
) {
  const requested = new Set(
    folds
      .filter(
        (range) =>
          Number.isSafeInteger(range.from) && Number.isSafeInteger(range.to),
      )
      .map((range) => `${range.from}:${range.to}`),
  );
  return readingSceneRanges(lines)
    .filter((range) => requested.has(`${range.from}:${range.to}`))
    .map(({ from, to }) => ({ from, to }));
}

export function readableText(source: string) {
  return readingStructure(source.replace(/\r\n/g, "\n"))
    .map((l) => {
      if (l.kind === "title") return l.text.replace(/^\s*title\s*:\s*/, "");
      if (["tags", "header", "start", "end"].includes(l.kind)) return "";
      if (l.kind === "option") return l.text.trim().replace(/^->\s*/, "• ");
      if (l.kind === "dialogue") return l.text.trim();
      return l.text.trim();
    })
    .filter(Boolean)
    .join("\n");
}
export function authorStatistics(source: string) {
  const lines = readingStructure(source.replace(/\r\n/g, "\n"));
  const dialogue = lines
    .filter((l) => l.kind === "dialogue")
    .map((l) => l.text.replace(/^\s*[^:<>]+:\s*/, ""));
  return {
    scenes: lines.filter((l) => l.kind === "title").length,
    options: lines.filter((l) => l.kind === "option").length,
    characters: dialogue.join("").replace(/\s/g, "").length,
    words: (dialogue.join(" ").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [])
      .length,
    roles: [
      ...new Set(
        lines
          .filter((l) => l.kind === "dialogue")
          .map((l) => l.text.match(/^\s*([^:<>]+):/)?.[1])
          .filter(Boolean),
      ),
    ],
  };
}
