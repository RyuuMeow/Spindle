import * as TOML from "@iarna/toml";
import {
  parseTree,
  findNodeAtLocation,
  getNodeValue,
  modify,
  applyEdits,
  type ParseError,
} from "jsonc-parser/lib/esm/main.js";
import type { AgentClient } from "../app/mcp/install-types";
export type Connection = { url: string; headers: { Authorization: string } };
export function entryFor(client: AgentClient, connection: Connection) {
  return client === "codex"
    ? { url: connection.url, http_headers: connection.headers }
    : { type: "http", ...connection };
}
export function readEntry(
  client: AgentClient,
  source: string,
  name: string,
): unknown {
  try {
    if (client === "codex") {
      const root = TOML.parse(source);
      const servers = root.mcp_servers;
      if (
        servers !== undefined &&
        (!servers || typeof servers !== "object" || Array.isArray(servers))
      )
        throw new Error();
      return (servers as Record<string, unknown> | undefined)?.[name];
    }
    const errors: ParseError[] = [];
    const tree = parseTree(source.trim() ? source : "{}", errors, {
      disallowComments: true,
      allowTrailingComma: false,
    });
    if (errors.length || tree?.type !== "object") throw new Error();
    const servers = findNodeAtLocation(tree, ["mcpServers"]);
    if (servers && servers.type !== "object") throw new Error();
    // Duplicate keys are ambiguous: never modify a configuration with them.
    function unique(node: NonNullable<typeof tree>) {
      if (node.type === "object") {
        const keys = node.children?.map((p) => p.children?.[0].value) ?? [];
        if (new Set(keys).size !== keys.length) throw new Error();
      }
      node.children?.forEach(unique);
    }
    unique(tree);
    const node = findNodeAtLocation(tree, ["mcpServers", name]);
    return node ? getNodeValue(node) : undefined;
  } catch {
    throw new Error("設定檔格式無法安全解析；原檔未修改。");
  }
}
function markers(name: string) {
  return [`# Spindle managed ${name} begin`, `# Spindle managed ${name} end`];
}
export function patchEntry(
  client: AgentClient,
  source: string,
  name: string,
  value: unknown,
) {
  const old = readEntry(client, source, name);
  if (client === "claude") {
    const original = source.trim() ? source : "{}\n";
    const result = applyEdits(
      original,
      modify(original, ["mcpServers", name], value, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: source.includes("\r\n") ? "\r\n" : "\n",
        },
      }),
    );
    readEntry(client, result, name);
    return result;
  }
  const [begin, end] = markers(name);
  const start = source.indexOf(begin),
    finish = source.indexOf(end);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block =
    value === undefined
      ? ""
      : begin +
        newline +
        TOML.stringify({
          mcp_servers: { [name]: value },
        } as unknown as TOML.JsonMap).replace(/\r?\n/g, newline) +
        end +
        newline;
  let result: string;
  if (start >= 0 && finish > start) {
    if (
      source.indexOf(begin, start + begin.length) >= 0 ||
      source.indexOf(end, finish + end.length) >= 0
    )
      throw new Error("Spindle 設定區塊重複。");
    // Verify the marked block contains exactly this server, never another table.
    const parsed = TOML.parse(source.slice(start + begin.length, finish));
    const table = parsed.mcp_servers as Record<string, unknown> | undefined;
    if (
      Object.keys(parsed).some((k) => k !== "mcp_servers") ||
      !table ||
      Object.keys(table).some((k) => k !== name)
    )
      throw new Error("Spindle 設定區塊已被修改；保留原檔。");
    const tail = finish + end.length;
    const length = source.startsWith("\r\n", tail)
      ? 2
      : source[tail] === "\n"
        ? 1
        : 0;
    result = source.slice(0, start) + block + source.slice(tail + length);
  } else {
    if (old !== undefined || start >= 0 || finish >= 0)
      throw new Error("同名設定不是 Spindle 管理的區塊。");
    result = source + (source && !source.endsWith("\n") ? newline : "") + block;
  }
  readEntry(client, result, name);
  const unrelated = (text: string) => {
    const root = TOML.parse(text);
    const servers = root.mcp_servers as Record<string, unknown> | undefined;
    if (servers) {
      delete servers[name];
      if (!Object.keys(servers).length) delete root.mcp_servers;
    }
    return JSON.stringify(root);
  };
  if (unrelated(source) !== unrelated(result))
    throw new Error("修改會影響其他 TOML 設定；保留原檔。");
  return result;
}
