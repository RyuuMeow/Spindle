import type { Command, Param } from "./parser";
export type ArgumentSpan = { from: number; to: number };
/** Conservative positional tokenizer. Never guess around an unfinished quote/group. */
export function argumentSpans(text: string, offset = 0): ArgumentSpan[] | null {
  const spans: ArgumentSpan[] = [];
  let start = -1,
    quote = "",
    escaped = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0 && /\s/.test(char)) continue;
    if (start < 0) start = i;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if ("({[".includes(char)) stack.push(char);
    else if (")}]".includes(char)) {
      if (stack.pop() !== { ")": "(", "}": "{", "]": "[" }[char]) return null;
    } else if (/\s/.test(char) && !stack.length) {
      spans.push({ from: start + offset, to: i + offset });
      start = -1;
    }
  }
  if (quote || stack.length) return null;
  if (start >= 0)
    spans.push({ from: start + offset, to: text.length + offset });
  // Unwrapped operators make positional boundaries ambiguous.
  if (
    spans.some((s) =>
      /^(?:[-+*/%=<>!&|]+|and|or|not)$/.test(
        text.slice(s.from - offset, s.to - offset),
      ),
    )
  )
    return null;
  return spans;
}
export function commandCall(text: string, commands: Command[]) {
  const prefix = /^\s*<<\s*([A-Za-z_]\w*)\b\s*/.exec(text);
  if (!prefix) return null;
  const command = commands.find((c) => c.name === prefix[1]);
  if (!command) return null;
  let quote = "",
    escaped = false,
    end = -1;
  for (let i = prefix[0].length; i < text.length - 1; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (text.slice(i, i + 2) === ">>") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const args = argumentSpans(
    text.slice(prefix[0].length, end),
    prefix[0].length,
  );
  const nameFrom = text.indexOf(command.name, text.indexOf("<<") + 2);
  return {
    command,
    args,
    nameFrom,
    nameTo: nameFrom + command.name.length,
    end: end + 2,
  };
}
export const commandLabel = (command: Command) =>
  command.displayName?.trim() || command.name;
export const parameterLabel = (parameter: Param) =>
  parameter.displayName?.trim() || parameter.name;
export function parameterHelp(parameter: Param, index: number) {
  return `${parameterLabel(parameter)} · ${parameter.type} · 第 ${index + 1} 個參數${parameter.required ? "" : " · 選填"}${parameter.description ? "\n" + parameter.description : ""}`;
}
export function commandHelp(command: Command) {
  return `${commandLabel(command)}${command.displayName?.trim() ? " · " + command.name : ""}${command.description ? "\n" + command.description : ""}`;
}
export function commandHover(
  text: string,
  column: number,
  commands: Command[],
) {
  const call = commandCall(text, commands);
  if (!call || column < text.indexOf("<<") || column >= call.end) return null;
  const index =
    call.args?.findIndex((a) => column >= a.from && column < a.to) ?? -1;
  if (index >= 0 && call.command.params[index])
    return {
      from: call.args![index].from,
      to: call.args![index].to,
      text: parameterHelp(call.command.params[index], index),
      command: call.command,
      parameterIndex: index,
    };
  if (column > call.nameTo) return null;
  return {
    command: call.command,
    parameterIndex: -1,
    from: text.indexOf("<<"),
    to: call.nameTo,
    text: [
      commandHelp(call.command),
      ...call.command.params.map(parameterHelp),
    ].join("\n"),
  };
}

const markdownText = (text: string) =>
  text.replace(/[\\`*_{}\[\]<>()#+.!|~-]/g, "\\$&").replace(/\r?\n/g, " ");
/** Untrusted project descriptions are escaped; no HTML or command links. */
export function commandMarkdown(command: Command, parameterIndex = -1) {
  const esc = markdownText;
  const title =
    "**" +
    esc(commandLabel(command)) +
    "**" +
    (command.displayName?.trim()
      ? " · \x60" + command.name.replace(/`/g, "") + "\x60"
      : "");
  const rows = command.params.flatMap((p, index) =>
    parameterIndex >= 0 && parameterIndex !== index
      ? []
      : [
          "| " +
            (index + 1) +
            " | **" +
            esc(parameterLabel(p)) +
            "**" +
            (p.displayName?.trim() ? " (" + esc(p.name) + ")" : "") +
            " | " +
            esc(p.type) +
            " | " +
            (p.required ? "必填" : "選填") +
            " | " +
            esc(p.description || "—") +
            " |",
        ],
  );
  return [
    title,
    command.description ? esc(command.description) : "",
    rows.length
      ? [
          "| # | 參數 | 型別 | 需求 | 說明 |",
          "| --- | --- | --- | --- | --- |",
          ...rows,
        ].join("\n")
      : "",
    command.example && parameterIndex < 0
      ? "範例\n\n" + esc(command.example)
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
