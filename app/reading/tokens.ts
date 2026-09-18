import type { ReadingLine } from "./structure";

export type VariableToken = { from: number; to: number; name: string };

/** Scan a Yarn expression, preserving quoted strings and comments verbatim. */
function expressionVariables(text: string, from: number, to: number) {
  const tokens: VariableToken[] = [];
  let quote = "";
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") break;
    if (ch !== "$") continue;
    const variable = text.slice(i, to).match(/^\$([A-Za-z_]\w*)/);
    if (!variable) continue;
    tokens.push({ from: i, to: i + variable[0].length, name: variable[1] });
    i += variable[0].length - 1;
  }
  return tokens;
}

/** The final command delimiter must be outside strings and before a comment. */
export function commandEnd(text: string) {
  let quote = "";
  for (let i = 2; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">" && text[i + 1] === ">") return i;
  }
  return -1;
}

export function readingVariables(line: ReadingLine): VariableToken[] {
  if (!line.valid) return [];
  const text = line.text;
  if (line.kind === "command" || line.kind === "condition") {
    const end = commandEnd(text.trimStart());
    const leading = text.length - text.trimStart().length;
    return end < 0 ? [] : expressionVariables(text, leading + 2, leading + end);
  }
  if (line.kind !== "dialogue" && line.kind !== "option") return [];
  const tokens: VariableToken[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text.slice(i, i + 2) === "//") break;
    // Plain dialogue "$name" is literal; interpolation and inline conditions
    // are the expression contexts in which it denotes a variable.
    if (text[i] === "{") {
      let quote = "",
        end = i + 1;
      for (; end < text.length; end++) {
        if (text[end] === "\\") {
          end++;
          continue;
        }
        if (quote) {
          if (text[end] === quote) quote = "";
          continue;
        }
        if (text[end] === '"' || text[end] === "'") quote = text[end];
        else if (text[end] === "}") break;
      }
      if (end === text.length) continue;
      const expression = text.slice(i + 1, end),
        variables = expressionVariables(text, i + 1, end);
      if (/^\$[A-Za-z_]\w*$/.test(expression) && variables.length === 1)
        tokens.push({ from: i, to: end + 1, name: variables[0].name });
      else tokens.push(...variables);
      i = end;
    } else if (/^<<\s*if\s/.test(text.slice(i))) {
      const end = commandEnd(text.slice(i));
      if (end >= 0) {
        tokens.push(...expressionVariables(text, i + 2, i + end));
        i += end + 1;
      }
    }
  }
  return tokens;
}
