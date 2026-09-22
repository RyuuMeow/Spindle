import { t as tr } from "./i18n/index.ts";
import type { Command } from "./parser";
import {
  findCommand,
  builtinCommands,
  builtinArgumentSpans,
  builtinParameterIndex,
  type CommandInfo,
  type HelpParameter,
} from "./command-catalog";
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
  const command = findCommand(prefix[1], commands);
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
  const args = command.builtin
    ? builtinArgumentSpans(
        command.name,
        text.slice(prefix[0].length, end),
        prefix[0].length,
      )
    : argumentSpans(text.slice(prefix[0].length, end), prefix[0].length);
  const nameFrom = text.indexOf(command.name, text.indexOf("<<") + 2);
  return {
    command,
    args,
    nameFrom,
    nameTo: nameFrom + command.name.length,
    end: end + 2,
  };
}
export const commandLabel = (command: CommandInfo) =>
  command.displayName?.trim() || command.name;
export const parameterLabel = (parameter: HelpParameter) =>
  parameter.displayName?.trim() || parameter.name;
export function parameterHelp(parameter: HelpParameter, index: number) {
  return tr("m02d73521f6a3", [
    parameterLabel(parameter),
    parameter.type,
    index + 1,
    parameter.required ? "" : tr("m49a0147d0c20"),
    parameter.description ? "\n" + parameter.description : "",
  ]);
}
export function commandHelp(command: CommandInfo) {
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
export function commandMarkdown(command: CommandInfo, parameterIndex = -1) {
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
            (p.required ? tr("m11da9dc44285") : tr("mefd49a86e463")) +
            " | " +
            esc(p.description || "—") +
            " |",
        ],
  );
  return [
    title,
    command.description ? esc(command.description) : "",
    rows.length
      ? [tr("m91800b12709f"), "| --- | --- | --- | --- | --- |", ...rows].join(
          "\n",
        )
      : "",
    command.example && parameterIndex < 0
      ? tr("m38a5716e46c9") + esc(command.example)
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Cursor-prefix context: whitespace inside quotes/groups never advances a parameter. */
export function commandInput(
  prefix: string,
): { kind: "name" } | { kind: "argument"; name: string; index: number } | null {
  if (/^\s*<<\s*[A-Za-z_]*\w*$/.test(prefix)) return { kind: "name" };
  const match = /^\s*<<\s*([A-Za-z_]\w*)[ \t]+(.*)$/.exec(prefix);
  if (!match) return null;
  let index = 0,
    token = false,
    quote = "",
    escaped = false;
  const stack: string[] = [];
  const text = match[2];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      token = true;
    } else if (text.slice(i, i + 2) === ">>" && !stack.length) return null;
    else if ("([{".includes(char)) {
      stack.push(char);
      token = true;
    } else if (")]}".includes(char)) {
      if (stack.pop() !== { ")": "(", "]": "[", "}": "{" }[char]) return null;
    } else if (/\s/.test(char) && !stack.length) {
      if (token) {
        index++;
        token = false;
      }
    } else token = true;
  }
  return {
    kind: "argument",
    name: match[1],
    index: builtinCommands.some((c) => c.name === match[1])
      ? builtinParameterIndex(match[1], text)
      : index,
  };
}

/** Automatic help is only for an empty slot, using both sides of the caret.
 * Incomplete/ambiguous values count as occupied; help must not validate syntax.
 */
export function emptyParameterHint(
  text: string,
  column: number,
  commands: Command[],
) {
  const input = commandInput(text.slice(0, column));
  if (input?.kind !== "argument") return null;
  const command = findCommand(input.name, commands);
  if (!command?.params[input.index]) return null;
  const prefix = /^\s*<<\s*[A-Za-z_]\w*[ \t]+/.exec(text)!;
  const start = prefix[0].length;
  let end = text.length,
    quote = "",
    escaped = false;
  const stack: string[] = [];
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) stack.push(c);
    else if (")]}".includes(c)) stack.pop();
    else if (!stack.length && text.slice(i, i + 2) === ">>") {
      end = i;
      break;
    }
  }
  const body = text.slice(start, end);
  if (command.builtin) {
    let value = body;
    if (command.name === "set" || command.name === "declare") {
      if (input.index === 1) {
        const assignment = /^\s*\$[A-Za-z_]\w*\s*(?:[+*/%\-]?=|to\b)\s*/.exec(
          body,
        );
        if (!assignment) return null;
        value = body.slice(assignment[0].length);
      }
    } else if (command.name === "once") {
      // An omitted optional condition is not an unfinished argument.
      const condition = /^\s*if[ \t]+/.exec(body);
      if (!condition || column < start + condition[0].length) return null;
      value = body.slice(condition[0].length);
    }
    if (value.trim()) return null;
  } else {
    const args = argumentSpans(body);
    if (!args || args[input.index]) return null;
  }
  return { command, index: input.index };
}

/** Is the caret at an existing closing delimiter, outside quoted arguments? */
export function atCommandCloser(line: string, column: number) {
  if (!/^\s*<</.test(line)) return false;
  let quote = "",
    escaped = false;
  for (let i = line.indexOf("<<") + 2; i < line.length - 1; i++) {
    const char = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (line.slice(i, i + 2) === ">>")
      return column === i || column === i + 1;
  }
  return false;
}
