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
  if (context.kind === "option") return `選擇「${context.text}」`;
  if (context.kind === "if") return `若 ${context.text}`;
  if (context.kind === "elseif")
    return `否則若 ${context.text}（前述皆不成立：${context.preceding?.join("；")}）`;
  if (context.kind === "else")
    return context.preceding?.length
      ? `否則（前述皆不成立：${context.preceding.join("；")}）`
      : `否則（${context.text || "所屬條件未解析"}）`;
  if (context.kind === "once")
    return context.text ? `僅首次，且 ${context.text}` : "僅首次";
  return `未解析：${context.text}`;
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
export function assignmentTypeError(
  args: string,
  types: ReadonlyMap<string, string>,
): string | null {
  const match = /^(\$[A-Za-z_]\w*)\s*(=|to\b|[+*/%\-]=)\s*(.+)$/.exec(args);
  if (!match) return null;
  const expected = types.get(match[1]),
    actual = expressionType(match[3], types);
  if (!expected || !actual || expected === "expression") return null;
  const compound = match[2] !== "=" && match[2] !== "to";
  if (
    expected !== actual ||
    (compound &&
      expected !== "number" &&
      !(match[2] === "+=" && expected === "string"))
  )
    return (
      "變數「" +
      match[1] +
      "」宣告為 " +
      expected +
      "，不能以 " +
      match[2] +
      " 指派 " +
      actual
    );
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
    message: string,
    severity: "error" | "warning" = "error",
    column = 1,
  ) => issues.push({ file, line, message, severity, column });
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
      if (!inBody) issue(doc.name, n.start, "節點缺少 --- 本文起始標記");
      if (!closed) issue(doc.name, n.start, "節點缺少 === 結束標記");
      for (const s of stack) {
        issue(
          doc.name,
          s.line,
          `缺少 ${s.name === "if" ? "endif" : "endonce"}`,
        );
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
          issue(
            doc.name,
            line,
            "節點名稱須以英文字母起始，僅含字母、數字及底線",
          );
        return;
      }
      if (!n) {
        if (s) issue(doc.name, line, "內容不在節點內");
        return;
      }
      if (s === "===") {
        finish(line, true);
        return;
      }
      if (s === "---") {
        if (inBody) issue(doc.name, line, "重複的 --- 標記");
        inBody = true;
        n.body = line + 1;
        return;
      }
      if (!inBody) {
        if (!s) return;
        const h = s.match(/^([\w-]+):\s*(.*)$/);
        if (h) n.headers[h[1]] = h[2];
        else issue(doc.name, line, "無效的節點標頭；預期 key: value 或 ---");
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
            text: match[2].trim() || (match[1] === "if" ? "if 缺少條件" : ""),
            line,
          });
        options.push({ indent, context });
      }
      if (!n.summary && !s.startsWith("<<") && !s.startsWith("->"))
        n.summary = s.replace(/#[\w:]+/g, "").trim();
      if ((s.match(/<</g) || []).length !== (s.match(/>>/g) || []).length) {
        issue(doc.name, line, "指令未完成：請檢查 << 與 >>");
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
              text: args.join(" ") || (name === "if" ? "if 缺少條件" : ""),
              line,
            },
            previous: args.length ? [args.join(" ")] : [],
          });
        }
        if (name === "if" && !args.length) issue(doc.name, line, "if 缺少條件");
        if (name === "else" || name === "elseif") {
          const block = stack.at(-1);
          if (!block) {
            issue(doc.name, line, `${name} 沒有對應的區塊`);
            unknownContexts.push({
              kind: "unknown",
              text: `${name} 沒有對應的區塊`,
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
                    ? "此區塊已執行過"
                    : ""
                  : args.join(" ") || "elseif 缺少條件",
              line,
              preceding: [...block.previous],
            };
            if (name === "elseif") {
              if (!args.length) issue(doc.name, line, "elseif 缺少條件");
              else block.previous.push(args.join(" "));
            }
          }
        }
        if (name === "endif" || name === "endonce") {
          const expected = name === "endif" ? "if" : "once";
          if (stack.at(-1)?.name !== expected)
            issue(doc.name, line, `${name} 沒有對應的 ${expected}`);
          else stack.pop();
        }
        if (name === "jump" || name === "detour") {
          if (!args.length) issue(doc.name, line, `${name} 缺少目標節點`);
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
              issue(
                doc.name,
                line,
                "跳轉目標格式不正確；動態目標請使用 {表達式}",
              );
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
            issue(doc.name, line, `${name} 需要變數、指定運算子與值`);
          continue;
        }
        const def = commands.find((c) => c.name === name);
        if (!def) {
          issue(
            doc.name,
            line,
            `未註冊指令「${name}」；可能由外部執行環境提供`,
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
                `${name} 缺少必要參數：${p.name} (${p.type})`,
                "error",
                column,
              );
          } else {
            const actual = literalType(args[i]);
            if (actual && actual !== p.type)
              issue(
                doc.name,
                line,
                `${name}.${p.name} 預期 ${p.type}，收到 ${actual}`,
                "error",
                column,
              );
          }
        });
        if (args.length > def.params.length)
          issue(
            doc.name,
            line,
            `${name} 最多接受 ${def.params.length} 個參數`,
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
          `變數「${call.args[0]}」尚未宣告；請先新增 declare`,
          "error",
          call.column,
        );
      if (call.name === "set") {
        const error = assignmentTypeError(call.args.join(" "), declarations);
        if (error) issue(n.file, call.line, error, "error", call.column);
      }
    }
  const names = new Map<string, Node[]>();
  for (const n of nodes) names.set(n.name, [...(names.get(n.name) || []), n]);
  for (const [name, group] of names)
    if (group.length > 1)
      for (const n of group) issue(n.file, n.start, `節點名稱重複：${name}`);
  for (const link of links) {
    const n = nodes.find((n) => n.id === link.source)!;
    if (!link.dynamic && !names.has(link.target))
      issue(n.file, link.line, `找不到跳轉目標：${link.target}`);
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
  if (!/^[A-Za-z_]\w*$/.test(c.name)) return "指令名稱須以字母或底線起始";
  if (builtins.includes(c.name)) return "名稱與內建指令衝突";
  if (others.some((x) => x.name === c.name)) return "指令名稱重複";
  let optional = false;
  const names = new Set<string>();
  for (const p of c.params) {
    if (!/^[A-Za-z_]\w*$/.test(p.name) || names.has(p.name))
      return "參數名稱不合法或重複";
    names.add(p.name);
    if (!p.required) optional = true;
    else if (optional) return "必填參數必須放在選填參數之前";
    if (
      !p.required &&
      (!p.defaultValue || literalType(p.defaultValue) !== p.type)
    )
      return "選填參數須提供符合型別的預設值";
  }
  return "";
}
