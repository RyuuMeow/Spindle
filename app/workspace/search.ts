import { t as tr } from "../i18n/index.ts";
import type { DocumentRecord } from "./types";
export type SearchScope = "all" | "files" | "content" | "settings" | "commands";
export type SearchHit = {
  documentId: string;
  file: string;
  line: number;
  column: number;
  text: string;
  scene?: string;
  kind?: "file" | "content";
};

/** Source positions stay in Yarn lines; snippets are only presentation. */
export function projectSearch(
  documents: DocumentRecord[],
  query: string,
  scope: SearchScope,
  limit = 150,
) {
  const needle = query.trim().toLocaleLowerCase();
  const hits: SearchHit[] = [];
  let total = 0;
  for (const doc of documents) {
    if (scope === "files" || !needle) {
      if (!needle || doc.name.toLocaleLowerCase().includes(needle)) {
        total++;
        if (hits.length < limit)
          hits.push({
            documentId: doc.id,
            file: doc.name,
            line: 1,
            column: 1,
            text: doc.name,
            kind: "file",
          });
      }
      continue;
    }
    let scene = "";
    const lines = doc.text.split(/\r\n|\n|\r/);
    for (let index = 0; index < lines.length; index++) {
      const text = lines[index];
      const title = text.match(/^\uFEFF?title:\s*(.*)/);
      if (title) scene = title[1].trim();
      const column = text.toLocaleLowerCase().indexOf(needle);
      if (column < 0) continue;
      total++;
      if (hits.length < limit)
        hits.push({
          documentId: doc.id,
          file: doc.name,
          line: index + 1,
          column: column + 1,
          text,
          scene,
          kind: "content",
        });
    }
  }
  return { hits, total };
}

export type PaletteHit =
  | {
      kind: "utility";
      id: string;
      text: string;
      detail: string;
      page: "commands";
    }
  | {
      kind: "document";
      id: string;
      text: string;
      detail: string;
      hit: SearchHit;
    }
  | {
      kind: "setting";
      id: string;
      text: string;
      detail: string;
      section: string;
      field?: string;
    }
  | { kind: "command"; id: string; text: string; detail: string; name: string }
  | { kind: "create"; id: string; text: string; detail: string; name?: string };
export type SettingEntry = {
  id: string;
  section: string;
  label: string;
  keywords: string;
  field?: string;
};
export function validDocumentName(name: string) {
  return (
    !!name &&
    name === name.trim() &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) &&
    !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  );
}
export function paletteSearch(input: {
  documents: DocumentRecord[];
  commands: { name: string; displayName?: string; description?: string }[];
  settings: SettingEntry[];
  recent?: string[];
  query: string;
  scope: SearchScope;
  canCreate: boolean;
}) {
  const q = input.query.trim(),
    needle = q.toLocaleLowerCase();
  const hits: PaletteHit[] = [];
  const matches = (value: string) =>
    !needle || value.toLocaleLowerCase().includes(needle);
  const createAlias =
    /^(new(?: script| document)?|新增(?:劇本)?|新建(?:剧本)?)$/i.test(q);
  if (input.canCreate && (!needle || createAlias))
    hits.push({
      kind: "create",
      id: "create",
      text: tr("m47fcdf3ee211"),
      detail: tr("me0097d9f001d"),
    });
  if (["all", "files", "content"].includes(input.scope)) {
    const order = input.recent || [];
    const documents = [...input.documents].sort((a, b) => {
      const rank = (id: string) =>
        order.includes(id) ? order.indexOf(id) : order.length;
      return rank(a.id) - rank(b.id);
    });
    const scopes: ("files" | "content")[] =
      input.scope === "all" && needle
        ? ["files", "content"]
        : [input.scope === "content" ? "content" : "files"];
    for (const scope of scopes)
      for (const hit of projectSearch(documents, q, scope).hits) {
        hits.push({
          kind: "document",
          id: `${hit.documentId}:${hit.kind}:${hit.line}`,
          text: hit.text,
          detail:
            hit.kind === "content"
              ? `${hit.file} · ${hit.line}`
              : tr("m627b75e6aced"),
          hit,
        });
      }
  }
  if (input.scope === "all" || input.scope === "settings" || !needle) {
    for (const entry of input.settings)
      if (
        (!needle ? !entry.field : true) &&
        matches(entry.label + " " + entry.keywords)
      )
        hits.push({
          kind: "setting",
          id: "setting:" + entry.id,
          text: entry.label,
          detail: tr("m0d8619aae051"),
          section: entry.section,
          field: entry.field,
        });
  }
  if (input.scope === "all" || input.scope === "commands") {
    for (const cmd of input.commands)
      if (
        matches(
          cmd.name +
            " " +
            (cmd.displayName || "") +
            " " +
            (cmd.description || ""),
        )
      )
        hits.push({
          kind: "command",
          id: "command:" + cmd.name,
          text: cmd.displayName ? `${cmd.displayName} · ${cmd.name}` : cmd.name,
          detail: cmd.description || tr("mae2f19d77e06"),
          name: cmd.name,
        });
  }
  if (
    !needle ||
    ((input.scope === "all" || input.scope === "commands") &&
      /^(commands|custom commands|自訂指令|自定义指令)$/i.test(q))
  )
    hits.push({
      kind: "utility",
      id: "commands-page",
      text: tr("mae2f19d77e06"),
      detail: tr("m6ee4a9a86f73"),
      page: "commands",
    });
  // Keep named actions below matches, never interpret an invalid path as a name.
  const invalidName =
    input.canCreate && !!needle && !hits.length && !validDocumentName(q);
  if (input.canCreate && needle && !hits.length && !invalidName)
    hits.push({
      kind: "create",
      id: "create",
      text: tr("m4c9b1edfa6f5", [q]),
      detail: tr("me0097d9f001d"),
      name: q,
    });
  const rank = (hit: PaletteHit) =>
    hit.kind === "create"
      ? -1
      : hit.text.toLocaleLowerCase() === needle
        ? 0
        : hit.kind === "document" && hit.hit.kind === "content"
          ? 3
          : 1;
  if (needle) hits.sort((a, b) => rank(a) - rank(b));
  return { hits: hits.slice(0, 150), total: hits.length, invalidName };
}
