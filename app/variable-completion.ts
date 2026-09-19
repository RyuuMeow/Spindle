import { commandEnd } from "./reading/tokens";
export type YarnVariable = {
  name: string;
  type: string;
  file: string;
  line: number;
  description: string;
  readOnly: boolean;
};
/** Index definitions, not every $word in prose, comments or string literals. */
export function collectVariables(
  documents: readonly { name: string; text: string }[],
): YarnVariable[] {
  const variables = new Map<string, YarnVariable & { declared: boolean }>();
  for (const doc of documents) {
    let comments: string[] = [];
    doc.text
      .replace(/^\ufeff/, "")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (/^\s*\/\/\//.test(line)) {
          comments.push(line.replace(/^\s*\/\/\/\s?/, ""));
          return;
        }
        const note = comments.join("\n");
        comments = [];
        const text = line.trimStart();
        const match =
          /^<<(declare|set)\s+(\$[A-Za-z_]\w*)\s*(?:[+*/%\-]?=|to\b)\s*/.exec(
            text,
          );
        const end = commandEnd(text);
        if (!match || end < match[0].length) return;
        const value = text.slice(match[0].length, end).trim();
        if (!value) return;
        const declared = match[1] === "declare",
          name = match[2];
        if (variables.has(name) && (!declared || variables.get(name)!.declared))
          return;
        const explicit = /\s+as\s+(number|string|bool(?:ean)?)$/.exec(value);
        const literal = explicit
          ? value.slice(0, explicit.index).trim()
          : value;
        const literalType = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(literal)
          ? "number"
          : /^(true|false)$/.test(literal)
            ? "boolean"
            : /^"(?:\\.|[^"\\])*"$/.test(literal)
              ? "string"
              : "";
        variables.set(name, {
          name,
          file: doc.name,
          line: index + 1,
          type: explicit
            ? explicit[1].replace(/^bool$/, "boolean")
            : literalType || "expression",
          description: note,
          readOnly: declared && !literalType,
          declared,
        });
      });
  }
  return [...variables.values()].sort((a, b) => a.name.localeCompare(b.name));
}
/** Find the actual expression under the caret, excluding quoted strings/comments. */
export function variableCompletionContext(
  prefix: string,
): { from: number; assignment: boolean } | null {
  if (/^\s*(?:title|tags|tracking|when|position):/.test(prefix)) return null;
  let mode: "command" | "expression" | null = null,
    start = 0,
    depth = 0,
    quote = "";
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (prefix.slice(i, i + 2) === "//") return null;
    if (mode && (char === '"' || char === "'")) {
      quote = char;
      continue;
    }
    if (
      !mode &&
      prefix.slice(i, i + 2) === "<<" &&
      (/^\s*$/.test(prefix.slice(0, i)) ||
        /^<<\s*(?:if|once)\b/.test(prefix.slice(i)))
    ) {
      mode = "command";
      start = i;
      i++;
      continue;
    }
    if (mode === "command" && prefix.slice(i, i + 2) === ">>") {
      mode = null;
      i++;
      continue;
    }
    if (!mode && char === "{") {
      mode = "expression";
      start = i;
      depth = 1;
    } else if (mode === "expression" && char === "{") depth++;
    else if (mode === "expression" && char === "}" && --depth === 0)
      mode = null;
  }
  if (!mode || quote) return null;
  const expression = prefix.slice(start);
  if (
    mode === "command" &&
    /^<<\s*declare\s+\$?[A-Za-z_0-9]*$/.test(expression)
  )
    return null;
  const assignment =
    mode === "command" && /^<<\s*set\s+\$?[A-Za-z_0-9]*$/.test(expression);
  const tail = (assignment ? /\$?[A-Za-z_0-9]*$/ : /\$[A-Za-z_0-9]*$/).exec(
    prefix,
  );
  if (!tail) return null;
  return { from: tail.index, assignment };
}
