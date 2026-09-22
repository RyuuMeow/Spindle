import {
  t as tr,
  message as renderMessage,
  type LocalizedMessage,
} from "./i18n/index.ts";
export type Param = {
  displayName?: string;
  description?: string;
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  defaultValue: string;
};
export type Command = {
  displayName?: string;
  name: string;
  description: string;
  params: Param[];
  example: string;
};
export type Doc = { name: string; text: string; saved: string };
export type Issue = {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  args?: readonly (string | number)[];
  severity: "error" | "warning";
};
export type Call = {
  name: string;
  args: string[];
  line: number;
  column: number;
};
export type Node = {
  id: string;
  name: string;
  file: string;
  start: number;
  body: number;
  end: number;
  headers: Record<string, string>;
  summary: string;
  calls: Call[];
};
export type LinkContext = {
  kind: "option" | "if" | "elseif" | "else" | "once" | "unknown";
  text: string;
  line: number;
  preceding?: string[];
  groupLine?: number;
  branchOrder?: number;
};
export type Link = {
  source: string;
  target: string;
  line: number;
  label: string;
  dynamic: boolean;
  kind: string;
  context?: LinkContext[];
  unresolved?: boolean;
  column?: number;
};
export function contextLabel(context: LinkContext) {
  if (context.kind === "option") return tr("m44d038ba2817", [context.text]);
  if (context.kind === "if") return tr("m092b023b0901", [context.text]);
  if (context.kind === "elseif")
    return tr("mf5096af35a4a", [context.text, context.preceding?.join("；")]);
  if (context.kind === "else")
    return context.preceding?.length
      ? tr("m7b497cb58944", [context.preceding.join("；")])
      : tr("m9d770c933b33", [context.text || tr("m5c1b20c671a1")]);
  if (context.kind === "once")
    return context.text
      ? tr("m5967bb5ba536", [context.text])
      : tr("mdd1f7bbe333e");
  return tr("m5e6f50458ec9", [context.text]);
}
export const builtins = [
  "jump",
  "detour",
  "return",
  "stop",
  "if",
  "elseif",
  "else",
  "endif",
  "once",
  "endonce",
  "set",
  "declare",
  "call",
  "wait",
];
export function tokenize(s: string) {
  return s.match(/"(?:\\.|[^"\\])*"|\{(?:[^{}]|\{[^{}]*\})*\}|[^\s]+/g) || [];
}
export function literalType(s: string) {
  if (/^\{/.test(s) || /^\$/.test(s)) return null;
  if (/^(true|false)$/.test(s)) return "boolean";
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return "number";
  return "string";
}
/** Conservative typing: unknown calls are never guessed. */
export function expressionType(
  source: string,
  variables: ReadonlyMap<string, string> = new Map(),
): string | null {
  const tokens =
    source.match(
      /"(?:\\.|[^"\\])*"|\$[A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_]\w*|==|!=|<=|>=|&&|\|\||[^\s]/g,
    ) || [];
  let index = 0;
  const precedence: Record<string, number> = {
    or: 1,
    "||": 1,
    xor: 1,
    and: 2,
    "&&": 2,
    "==": 3,
    "!=": 3,
    eq: 3,
    neq: 3,
    "<": 4,
    ">": 4,
    "<=": 4,
    ">=": 4,
    lt: 4,
    gt: 4,
    lte: 4,
    gte: 4,
    "+": 5,
    "-": 5,
    "*": 6,
    "/": 6,
    "%": 6,
  };
  const atom = (): string | null => {
    const token = tokens[index++];
    if (!token) return null;
    if (token === "(" || token === "{") {
      const value = parse(0);
      return tokens[index++] === (token === "(" ? ")" : "}") ? value : null;
    }
    if (["-", "+", "!", "not"].includes(token)) {
      const value = atom();
      return value === (token === "!" || token === "not" ? "boolean" : "number")
        ? value
        : null;
    }
    if (/^"/.test(token)) return "string";
    if (/^(true|false)$/.test(token)) return "boolean";
    if (/^(?:\d|\.\d)/.test(token)) return "number";
    if (token.startsWith("$")) return variables.get(token) || null;
    return null;
  };
  const parse = (minimum: number): string | null => {
    let left = atom();
    while (
      index < tokens.length &&
      (precedence[tokens[index]] ?? -1) >= minimum
    ) {
      const op = tokens[index++],
        right = parse(precedence[op] + 1);
      if (!left || !right) left = null;
      else if (precedence[op] <= 2)
        left = left === "boolean" && right === "boolean" ? "boolean" : null;
      else if (precedence[op] <= 4) left = left === right ? "boolean" : null;
      else if (op === "+" && left === "string" && right === "string")
        left = "string";
      else left = left === "number" && right === "number" ? "number" : null;
    }
    return left;
  };
  const result = parse(0);
  return index === tokens.length ? result : null;
}
export function bareAssignmentText(value: string) {
  return (
    /^[\p{L}_][\p{L}\p{N}_ ]*$/u.test(value.trim()) &&
    !/^(true|false)$/.test(value.trim()) &&
    !/\b(?:and|or|xor|not|eq|neq|lt|gt|lte|gte)\b/.test(value)
  );
}

/** Only variable-required slots and known names inside expressions qualify. */
export function missingVariablePrefixes(line: string, names: Iterable<string>) {
  const known = new Set([...names].map((n) => n.replace(/^\$/, "")));
  const hits: { from: number; to: number; name: string }[] = [];
  const clean = line.replace(/"(?:\\.|[^"\\])*"|\/\/.*$/g, (m) =>
    " ".repeat(m.length),
  );
  const target = /^\s*<<\s*(?:declare|set)\s+([A-Za-z_]\w*)\b/.exec(clean);
  if (target) {
    const from = target[0].lastIndexOf(target[1]);
    hits.push({ from, to: from + target[1].length, name: target[1] });
  }
  const regions: { text: string; from: number }[] = [];
  const call = /^\s*<<\s*(?:set|declare|if|elseif|once)\b/.exec(clean);
  if (call)
    regions.push({
      text: clean.slice(
        call[0].length,
        clean.indexOf(">>") < 0 ? undefined : clean.indexOf(">>"),
      ),
      from: call[0].length,
    });
  for (const m of clean.matchAll(/\{([^{}]*)\}/g))
    regions.push({ text: m[1], from: m.index! + 1 });
  for (const region of regions)
    for (const m of region.text.matchAll(/[A-Za-z_]\w*/g)) {
      const from = region.from + m.index!;
      if (
        known.has(m[0]) &&
        clean[from - 1] !== "$" &&
        !/^\s*\(/.test(clean.slice(from + m[0].length)) &&
        !/^(true|false|and|or|not|xor|as|number|string|boolean|to)$/.test(
          m[0],
        ) &&
        !hits.some((h) => h.from === from)
      )
        hits.push({ from, to: from + m[0].length, name: m[0] });
    }
  return hits;
}

export function assignmentDiagnostic(
  args: string,
  types: ReadonlyMap<string, string>,
): LocalizedMessage | null {
  const match = /^(\$[A-Za-z_]\w*)\s*(=|to\b|[+*/%\-]=)\s*(.+)$/.exec(args);
  if (!match) return null;
  const expected = types.get(match[1]),
    bare = bareAssignmentText(match[3]),
    actual = bare ? "string" : expressionType(match[3], types);
  if (!expected || !actual || expected === "expression") return null;
  const compound = match[2] !== "=" && match[2] !== "to";
  if (
    expected !== actual ||
    (compound &&
      expected !== "number" &&
      !(match[2] === "+=" && expected === "string"))
  )
    return {
      code: "diagnostic.96d2c60e238e",
      args: [match[1], expected, match[2], actual],
    };
  if (bare && expected === "string")
    return {
      code: "diagnostic.72bc28708b9c",
      args: [match[3].trim(), match[3].trim()],
    };
  return null;
}
function uncomment(s: string) {
  let quote = false;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '"' && s[i - 1] !== "\\") quote = !quote;
    if (!quote && s.slice(i, i + 2) === "//") return s.slice(0, i);
  }
  return s;
}
export function parse(docs: Doc[], commands: Command[]) {
  const nodes: Node[] = [],
    links: Link[] = [],
    issues: Issue[] = [];
  const issue = (
    file: string,
    line: number,
    value: LocalizedMessage,
    severity: "error" | "warning" = "error",
    column = 1,
  ) =>
    issues.push({
      file,
      line,
      message: renderMessage(value),
      code: value.code,
      args: value.args,
      severity,
      column,
    });
  for (const doc of docs) {
    let n: Node | null = null,
      inBody = false,
      stack: {
        name: string;
        line: number;
        branch: LinkContext;
        previous: string[];
      }[] = [],
      options: { indent: number; context: LinkContext[] }[] = [],
      unknownContexts: LinkContext[] = [];
    const finish = (line: number, closed: boolean) => {
      if (!n) return;
      n.end = Math.max(n.start, line);
      if (!inBody)
        issue(doc.name, n.start, { code: "diagnostic.2127bc217c62", args: [] });
      if (!closed)
        issue(doc.name, n.start, { code: "diagnostic.3293f1132b1c", args: [] });
      for (const s of stack) {
        issue(doc.name, s.line, {
          code: "diagnostic.19a090117231",
          args: [s.name === "if" ? "endif" : "endonce"],
        });
        for (const link of links)
          if (link.source === n.id && link.line >= s.line)
            link.unresolved = true;
      }
      nodes.push(n);
      n = null;
      stack = [];
      options = [];
      unknownContexts = [];
      inBody = false;
    };
    const lines = doc.text.split(/\r?\n/);
    lines.forEach((raw, index) => {
      const line = index + 1,
        s = uncomment(raw).trim(),
        indent = raw.search(/\S/);
      if (/^title\s*:/.test(s)) {
        finish(line - 1, false);
        const name = s.replace(/^title\s*:\s*/, "").trim();
        n = {
          id:
            doc.name +
            "::" +
            name +
            "::" +
            nodes.filter((x) => x.file === doc.name && x.name === name).length,
          name,
          file: doc.name,
          start: line,
          body: line,
          end: line,
          headers: { title: name },
          summary: "",
          calls: [],
        };
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
          issue(doc.name, line, { code: "diagnostic.20bf5f7ee70f", args: [] });
        return;
      }
      if (!n) {
        if (s)
          issue(doc.name, line, { code: "diagnostic.cefbb5a823ca", args: [] });
        return;
      }
      if (s === "===") {
        finish(line, true);
        return;
      }
      if (s === "---") {
        if (inBody)
          issue(doc.name, line, { code: "diagnostic.914972502775", args: [] });
        inBody = true;
        n.body = line + 1;
        return;
      }
      if (!inBody) {
        if (!s) return;
        const h = s.match(/^([\w-]+):\s*(.*)$/);
        if (h) n.headers[h[1]] = h[2];
        else
          issue(doc.name, line, { code: "diagnostic.32b2c232d4dc", args: [] });
        return;
      }
      if (!s) return;
      const optionLine = s.startsWith("->");
      let sibling: LinkContext | undefined;
      while (options.length && indent <= options[options.length - 1].indent) {
        const previous = options.pop()!;
        if (previous.indent === indent) sibling = previous.context[0];
      }
      if (optionLine) {
        const context: LinkContext[] = [
          {
            kind: "option",
            groupLine: sibling?.groupLine ?? line,
            branchOrder: sibling ? (sibling.branchOrder ?? 0) + 1 : 0,
            text: s
              .slice(2)
              .replace(/<<.*?>>/g, "")
              .trim(),
            line,
          },
        ];
        for (const match of s.matchAll(/<<(if|once)\b\s*([\s\S]*?)>>/g))
          context.push({
            kind:
              match[1] === "if" && !match[2].trim()
                ? "unknown"
                : (match[1] as "if" | "once"),
            text:
              match[2].trim() || (match[1] === "if" ? tr("maacdf12a6848") : ""),
            line,
          });
        options.push({ indent, context });
      }
      if (!n.summary && !s.startsWith("<<") && !s.startsWith("->"))
        n.summary = s.replace(/#[\w:]+/g, "").trim();
      if ((s.match(/<</g) || []).length !== (s.match(/>>/g) || []).length) {
        issue(doc.name, line, { code: "diagnostic.dd80a03d00ba", args: [] });
        if (/<<(?:if|elseif|else|endif|once|endonce)\b/.test(s))
          unknownContexts.push({ kind: "unknown", text: s, line });
      }
      for (const match of s.matchAll(/<<([\s\S]*?)>>/g)) {
        const tokens = tokenize(match[1].trim()),
          name = tokens.shift() || "",
          args = tokens,
          column = raw.indexOf(s) + (match.index || 0) + 1;
        n.calls.push({ name, args, line, column });
        if (
          (name === "if" || name === "once") &&
          !optionLine &&
          s.startsWith("<<")
        ) {
          stack.push({
            name,
            line,
            branch: {
              kind: name === "if" && !args.length ? "unknown" : name,
              groupLine: line,
              branchOrder: 0,
              text:
                args.join(" ") || (name === "if" ? tr("maacdf12a6848") : ""),
              line,
            },
            previous: args.length ? [args.join(" ")] : [],
          });
        }
        if (name === "if" && !args.length)
          issue(doc.name, line, { code: "diagnostic.91d74a7b4fde", args: [] });
        if (name === "else" || name === "elseif") {
          const block = stack.at(-1);
          if (!block) {
            issue(doc.name, line, {
              code: "diagnostic.7187d618d181",
              args: [name],
            });
            unknownContexts.push({
              kind: "unknown",
              text: tr("m6aae440c9598", [name]),
              line,
            });
          } else {
            block.branch = {
              kind: name === "elseif" && !args.length ? "unknown" : name,
              groupLine: block.line,
              branchOrder: (block.branch.branchOrder ?? 0) + 1,
              text:
                name === "else"
                  ? block.name === "once"
                    ? tr("m51218839a0a9")
                    : ""
                  : args.join(" ") || tr("m0327042580f1"),
              line,
              preceding: [...block.previous],
            };
            if (name === "elseif") {
              if (!args.length)
                issue(doc.name, line, {
                  code: "diagnostic.a3b47dbacff6",
                  args: [],
                });
              else block.previous.push(args.join(" "));
            }
          }
        }
        if (name === "endif" || name === "endonce") {
          const expected = name === "endif" ? "if" : "once";
          if (stack.at(-1)?.name !== expected)
            issue(doc.name, line, {
              code: "diagnostic.e0e54e3e365b",
              args: [name, expected],
            });
          else stack.pop();
        }
        if (name === "jump" || name === "detour") {
          if (!args.length)
            issue(doc.name, line, {
              code: "diagnostic.1d264537a640",
              args: [name],
            });
          else {
            const target = args.join(" "),
              dynamic = target.startsWith("{"),
              context = [
                ...unknownContexts,
                ...options.flatMap((option) => option.context),
                ...stack.map((block) => ({
                  ...block.branch,
                  preceding: block.branch.preceding?.slice(),
                })),
              ].sort((a, b) => a.line - b.line);
            links.push({
              source: n.id,
              column,
              target,
              line,
              label: context.map(contextLabel).join(" · "),
              dynamic,
              kind: name,
              context,
              unresolved: context.some((item) => item.kind === "unknown"),
            });
            if (!dynamic && !/^[A-Za-z][A-Za-z0-9_]*$/.test(target))
              issue(doc.name, line, {
                code: "diagnostic.9450d7050fd1",
                args: [],
              });
          }
          continue;
        }
        if (builtins.includes(name)) {
          if (
            ["declare", "set"].includes(name) &&
            !/^\$[A-Za-z_]\w*\s*(?:=|to|\+=|-=|\*=|\/=)\s*.+/.test(
              args.join(" "),
            )
          )
            issue(doc.name, line, {
              code: "diagnostic.d7f2a009889c",
              args: [name],
            });
          continue;
        }
        const def = commands.find((c) => c.name === name);
        if (!def) {
          issue(
            doc.name,
            line,
            { code: "diagnostic.f9bb37d04146", args: [name] },
            "warning",
            column,
          );
          continue;
        }
        def.params.forEach((p, i) => {
          if (args[i] === undefined) {
            if (p.required)
              issue(
                doc.name,
                line,
                {
                  code: "diagnostic.fe1c7fa80313",
                  args: [name, p.name, p.type],
                },
                "error",
                column,
              );
          } else {
            const actual = literalType(args[i]);
            if (actual && actual !== p.type)
              issue(
                doc.name,
                line,
                {
                  code: "diagnostic.d3a3eee6d4d4",
                  args: [name, p.name, p.type, actual],
                },
                "error",
                column,
              );
          }
        });
        if (args.length > def.params.length)
          issue(
            doc.name,
            line,
            {
              code: "diagnostic.b249637e4133",
              args: [name, def.params.length],
            },
            "error",
            column,
          );
      }
    });
    finish(lines.length, false);
  }
  const declarations = new Map<string, string>();
  const definitions = nodes
    .flatMap((n) => n.calls)
    .filter((c) => c.name === "declare");
  for (let pass = 0; pass <= definitions.length; pass++) {
    let changed = false;
    for (const call of definitions) {
      const match =
        /^(\$[A-Za-z_]\w*)\s*(?:=|to\b)\s*(.+?)(?:\s+as\s+(number|string|bool(?:ean)?))?$/.exec(
          call.args.join(" "),
        );
      if (!match) continue;
      const type =
        match[3]?.replace(/^bool$/, "boolean") ||
        expressionType(match[2], declarations) ||
        "expression";
      if (
        !declarations.has(match[1]) ||
        (declarations.get(match[1]) === "expression" && type !== "expression")
      ) {
        declarations.set(match[1], type);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const doc of docs)
    doc.text.split(/\r?\n/).forEach((line, index) => {
      for (const hit of missingVariablePrefixes(line, declarations.keys()))
        issue(
          doc.name,
          index + 1,
          { code: "diagnostic.dbaff876fe7f", args: [hit.name] },
          "error",
          hit.from + 1,
        );
    });
  for (const n of nodes)
    for (const call of n.calls) {
      if (
        call.name === "set" &&
        /^\$[A-Za-z_]\w*$/.test(call.args[0] || "") &&
        !declarations.has(call.args[0])
      )
        issue(
          n.file,
          call.line,
          { code: "diagnostic.824d0fcbe7bf", args: [call.args[0]] },
          "error",
          call.column,
        );
      if (["if", "elseif", "wait"].includes(call.name)) {
        const expected = call.name === "wait" ? "number" : "boolean";
        const actual = expressionType(call.args.join(" "), declarations);
        if (call.name === "wait" && !call.args.length)
          issue(
            n.file,
            call.line,
            { code: "diagnostic.62512d211a63", args: [] },
            "error",
            call.column,
          );
        else if (actual && actual !== "expression" && actual !== expected)
          issue(
            n.file,
            call.line,
            {
              code: "diagnostic.bcc4e5a9d58c",
              args: [call.name, expected, actual],
            },
            "error",
            call.column,
          );
      }
      const custom = commands.find((c) => c.name === call.name);
      custom?.params.forEach((param, index) => {
        const arg = call.args[index];
        if (!arg || !(arg.startsWith("$") || arg.startsWith("{"))) return;
        const type = expressionType(arg, declarations);
        if (type && type !== "expression" && type !== param.type)
          issue(
            n.file,
            call.line,
            {
              code: "diagnostic.28b5e49e9854",
              args: [call.name, param.name, param.type, type],
            },
            "error",
            call.column,
          );
      });
      if (call.name === "set") {
        const error = assignmentDiagnostic(call.args.join(" "), declarations);
        if (error) issue(n.file, call.line, error, "error", call.column);
      }
    }
  const names = new Map<string, Node[]>();
  for (const n of nodes) names.set(n.name, [...(names.get(n.name) || []), n]);
  for (const [name, group] of names)
    if (group.length > 1)
      for (const n of group)
        issue(n.file, n.start, {
          code: "diagnostic.a52b23e5a5bd",
          args: [name],
        });
  for (const link of links) {
    const n = nodes.find((n) => n.id === link.source)!;
    if (!link.dynamic && !names.has(link.target))
      issue(n.file, link.line, {
        code: "diagnostic.cf6241ad8a25",
        args: [link.target],
      });
  }
  return {
    nodes,
    links,
    issues: issues.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    ),
  };
}
export function validateCommand(c: Command, others: Command[]) {
  if (!/^[A-Za-z_]\w*$/.test(c.name)) return tr("mb7b256c22693");
  if (builtins.includes(c.name)) return tr("m3c2a16fcb0dc");
  if (others.some((x) => x.name === c.name)) return tr("ma9b64210374a");
  let optional = false;
  const names = new Set<string>();
  for (const p of c.params) {
    if (!/^[A-Za-z_]\w*$/.test(p.name) || names.has(p.name))
      return tr("me286e1bc240d");
    names.add(p.name);
    if (!p.required) optional = true;
    else if (optional) return tr("m958506619752");
    if (
      !p.required &&
      (!p.defaultValue || literalType(p.defaultValue) !== p.type)
    )
      return tr("m55782245af4d");
  }
  return "";
}

export function assignmentTypeError(
  args: string,
  types: ReadonlyMap<string, string>,
): string | null {
  const result = assignmentDiagnostic(args, types);
  return result ? renderMessage(result) : null;
}
