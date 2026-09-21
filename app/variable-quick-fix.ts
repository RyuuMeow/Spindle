import { bareAssignmentText } from "./parser";
import { commandEnd } from "./reading/tokens";
import type { YarnVariable } from "./variable-completion";
/** Add a literal default without evaluating an expression or changing the original assignment. */
export function missingDeclaration(
  line: string,
  column: number,
  variables: readonly YarnVariable[],
) {
  const start = line.search(/\S/);
  if (start < 0 || column < start) return null;
  const text = line.slice(start),
    end = commandEnd(text);
  const match =
    /^<<\s*set\s+(\$[A-Za-z_]\w*)\s*(=|to\b|\+=|-=|\*=|\/=|%=)\s*(.*?)\s*$/.exec(
      text.slice(0, end),
    );
  if (
    !match ||
    end < 0 ||
    column > start + end + 2 ||
    variables.some((v) => v.name === match[1] && v.declared)
  )
    return null;
  const value = match[3];
  let initial: string | null = /^"(?:\\.|[^"\\])*"$/.test(value)
    ? '""'
    : /^(true|false)$/.test(value)
      ? "false"
      : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
        ? "0"
        : null;
  const reference = variables.find((v) => v.name === value && v.declared);
  if (reference)
    initial =
      reference.type === "number"
        ? "0"
        : reference.type === "boolean"
          ? "false"
          : reference.type === "string"
            ? '""'
            : null;
  return {
    name: match[1],
    from: start + text.indexOf(match[1]),
    to: start + text.indexOf(match[1]) + match[1].length,
    insert:
      initial === null
        ? null
        : `${line.slice(0, start)}<<declare ${match[1]} = ${initial}>>`,
  };
}

/** A concrete text edit shared by source, reading and scene editors. */
export function variableQuickFix(
  line: string,
  column: number,
  variables: readonly YarnVariable[],
) {
  const start = line.search(/\S/),
    end = commandEnd(line.slice(start));
  if (start >= 0 && end >= 0 && column >= start && column <= start + end + 2) {
    const body = line.slice(start, start + end);
    const match =
      /^<<\s*set\s+\$[A-Za-z_]\w*\s*(?:=|to\b|[+*/%\-]=)\s*([\p{L}_][\p{L}\p{N}_ ]*?)\s*$/u.exec(
        body,
      );
    if (match && bareAssignmentText(match[1])) {
      const from = start + body.lastIndexOf(match[1]);
      return {
        name: "",
        from,
        to: from + match[1].length,
        insert: JSON.stringify(match[1]),
        replace: true,
        label: "補上雙引號",
      };
    }
  }
  const declaration = missingDeclaration(line, column, variables);
  return declaration
    ? { ...declaration, replace: false, label: "新增宣告" }
    : null;
}
