import { t as tr } from "./i18n/index.ts";
import { commandCall } from "./command-hints";
import type { Command } from "./parser";
import {
  bareAssignmentText,
  missingVariablePrefixes,
  expressionType,
} from "./parser";
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
      ? "true"
      : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
        ? "0"
        : null;
  const reference = variables.find((v) => v.name === value && v.declared);
  if (reference)
    initial =
      reference.type === "number"
        ? "0"
        : reference.type === "boolean"
          ? "true"
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
  commands: Command[] = [],
) {
  const prefixes = missingVariablePrefixes(
    line,
    variables.filter((v) => v.declared).map((v) => v.name),
  );
  const prefix =
    prefixes.find((h) => column >= h.from && column <= h.to) || prefixes[0];
  if (prefix)
    return {
      name: prefix.name,
      from: prefix.from,
      to: prefix.to,
      insert: "$" + prefix.name,
      replace: true,
      label: tr("m7d1ce55bf07e"),
    };
  const types = new Map(
    variables.filter((v) => v.declared).map((v) => [v.name, v.type]),
  );
  const assignment =
    /^(\s*<<\s*(set|declare)\s+(\$[A-Za-z_]\w*)\s*(?:=|to\b|[+*/%\-]=)\s*)(.*?)(\s*(?:as\s+(number|string|boolean|bool))?\s*>>)/.exec(
      line,
    );
  const defaults: Record<string, string> = {
    number: "0",
    string: '""',
    boolean: "true",
    bool: "true",
  };
  const empty = /^(\s*<<\s*(declare|set)\s+(\$[A-Za-z_]\w*)\s*)(>>)/.exec(line);
  if (empty) {
    const type =
      types.get(empty[3]) || (empty[2] === "declare" ? "number" : "");
    if (defaults[type])
      return {
        name: empty[3],
        from: empty[1].length,
        to: empty[1].length,
        insert: " = " + defaults[type],
        replace: true,
        label: tr("mace55b15c9d6") + type + tr("mf2921e5b0707"),
      };
  }
  if (assignment) {
    const value = assignment[4].trim(),
      expected =
        assignment[6]?.replace(/^bool$/, "boolean") ||
        types.get(assignment[3]) ||
        (assignment[2] === "declare" && !value ? "number" : ""),
      actual = bareAssignmentText(value)
        ? "string"
        : expressionType(value, types);
    if (
      defaults[expected] &&
      (!value || (actual && actual !== "expression" && actual !== expected))
    ) {
      const from = assignment[1].length;
      return {
        name: assignment[3],
        from,
        to: from + assignment[4].length,
        insert: defaults[expected],
        replace: true,
        label: value
          ? tr("m2c8212e0cc81") +
            expected +
            tr("m576a77a40390") +
            defaults[expected]
          : tr("ma266c7aeb367") +
            expected +
            tr("mf2921e5b0707") +
            defaults[expected],
      };
    }
  }
  const condition = /^(\s*<<\s*(?:if|elseif)\b\s*)(.*?)>>/.exec(line);
  if (condition) {
    const value = condition[2].trim(),
      type = expressionType(value, types);
    if (!value || (type && type !== "expression" && type !== "boolean"))
      return {
        name: "",
        from: condition[1].length,
        to: condition[1].length + condition[2].length,
        insert: (/\s$/.test(condition[1]) ? "" : " ") + "true",
        replace: true,
        label: tr("mf20c365309ac"),
      };
  }
  const call = commandCall(line, commands);
  if (call?.args && !["set", "declare"].includes(call.command.name)) {
    for (let i = 0; i < call.command.params.length; i++) {
      const param = call.command.params[i],
        span = call.args[i],
        initial = defaults[param.type];
      if (!initial) continue;
      if (!span && param.required) {
        const remaining = call.command.params
          .slice(i)
          .filter((p) => p.required);
        if (remaining.some((p) => !defaults[p.type])) continue;
        const at = call.end - 2;
        return {
          name: "",
          from: at,
          to: at,
          insert:
            (line[at - 1]?.match(/\s/) ? "" : " ") +
            remaining.map((p) => defaults[p.type]).join(" "),
          replace: true,
          label: tr("mcf348191b695"),
        };
      }
      if (span) {
        const value = line.slice(span.from, span.to),
          actual =
            expressionType(value, types) ||
            (bareAssignmentText(value) ? "string" : null);
        if (
          param.type !== "string" &&
          /^[A-Za-z_]\w*$/.test(value) &&
          types.get("$" + value) === param.type
        )
          return {
            name: value,
            from: span.from,
            to: span.to,
            insert: "$" + value,
            replace: true,
            label: tr("m7d1ce55bf07e"),
          };
        if (actual && actual !== "expression" && actual !== param.type)
          return {
            name: "",
            from: span.from,
            to: span.to,
            insert: initial,
            replace: true,
            label:
              tr("me400c5484ebf") +
              param.name +
              tr("m2c8212e0cc81") +
              param.type +
              tr("m576a77a40390") +
              initial,
          };
      }
    }
  }
  const start = line.search(/\S/),
    end = commandEnd(line.slice(start));
  if (start >= 0 && end >= 0 && column >= start && column <= start + end + 2) {
    const body = line.slice(start, start + end);
    const match =
      /^<<\s*set\s+(\$[A-Za-z_]\w*)\s*(?:=|to\b|\+=)\s*([\p{L}_][\p{L}\p{N}_ ]*?)\s*$/u.exec(
        body,
      );
    if (
      match &&
      bareAssignmentText(match[2]) &&
      variables.some(
        (v) => v.name === match[1] && v.declared && v.type === "string",
      )
    ) {
      const from = start + body.lastIndexOf(match[2]);
      return {
        name: "",
        from,
        to: from + match[2].length,
        insert: JSON.stringify(match[2]),
        replace: true,
        label: tr("m961797814b59"),
      };
    }
  }
  const declaration = missingDeclaration(line, column, variables);
  return declaration
    ? { ...declaration, replace: false, label: tr("mb4d233ea3787") }
    : null;
}
