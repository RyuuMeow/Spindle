import { t as tr } from "../../app/i18n";
import { parse } from "../../app/parser";
import {
  collectVariables,
  variableReferenceAt,
} from "../../app/variable-completion";
import { variableQuickFix } from "../../app/variable-quick-fix";
import { unregisteredCommand } from "../../app/command-quick-fix";
import { commandCatalog, findCommand } from "../../app/command-catalog";
import { documentStatistics } from "../../app/workspace/statistics";
import { lineOffset, sceneRange } from "../../app/workspace/authoring";
import type { Project, TextEdit } from "../../app/workspace/types";
import type { Command } from "../../app/parser";
export type Fix = {
  id: string;
  label: string;
  documentId: string;
  version: number;
  edit?: TextEdit;
  command?: Command;
};
export function semantics(p: Project) {
  const parsed = parse(p.documents, p.commands),
    variables = collectVariables(p.documents);
  const file = (name: string) => p.documents.find((d) => d.name === name);
  const calls = parsed.nodes.flatMap((n) =>
    n.calls.map((c) => ({
      ...c,
      documentId: file(n.file)?.id,
      file: n.file,
      scene: n.name,
      registered: !!findCommand(c.name, p.commands),
    })),
  );
  const fixes: Fix[] = [];
  const issues = parsed.issues.map((issue, index) => {
    const d = file(issue.file),
      fixIds: string[] = [];
    if (d) {
      const from = lineOffset(d.text, issue.line),
        line = d.text.slice(from).split(/\r?\n/, 1)[0];
      const fix = variableQuickFix(
        line,
        Math.max(0, issue.column - 1),
        variables,
        p.commands,
      );
      const registration = unregisteredCommand(
        line,
        Math.max(0, issue.column - 1),
        p.commands,
      );
      let candidate: Omit<Fix, "id"> | undefined;
      if (fix?.insert !== null && fix?.insert !== undefined)
        candidate = {
          label: fix.label,
          documentId: d.id,
          version: d.version,
          edit: fix.replace
            ? { from: from + fix.from, to: from + fix.to, insert: fix.insert }
            : {
                from,
                to: from,
                insert: fix.insert + (d.text.includes("\r\n") ? "\r\n" : "\n"),
              },
        };
      else if (
        registration &&
        calls
          .filter((c) => c.name === registration.command.name)
          .every((c) => {
            const doc = file(c.file);
            if (!doc) return false;
            const text = doc.text
              .slice(lineOffset(doc.text, c.line))
              .split(/\r?\n/, 1)[0];
            const other = unregisteredCommand(
              text,
              text.indexOf("<<") + 2,
              p.commands,
            );
            return (
              other &&
              JSON.stringify(other.command.params) ===
                JSON.stringify(registration.command.params)
            );
          })
      )
        candidate = {
          label: tr("m05cc9992623a") + registration.command.name,
          documentId: d.id,
          version: d.version,
          command: registration.command,
        };
      if (candidate) {
        let existing = fixes.find(
          (f) =>
            JSON.stringify(f.edit || f.command) ===
              JSON.stringify(candidate!.edit || candidate!.command) &&
            f.documentId === d.id,
        );
        if (!existing) {
          existing = { id: "fix-" + fixes.length, ...candidate };
          fixes.push(existing);
        }
        fixIds.push(existing.id);
      }
    }
    return {
      ...issue,
      id: "issue-" + index,
      documentId: d?.id,
      version: d?.version,
      fixIds,
    };
  });
  return { ...parsed, variables, calls, issues, fixes };
}
export function projectQuery(
  p: Project,
  kind: string,
  data: ReturnType<typeof semantics>,
): unknown[] {
  const source = (name: string) => p.documents.find((d) => d.name === name);
  if (kind === "documents")
    return p.documents.map((d) => ({
      id: d.id,
      name: d.name,
      version: d.version,
      status: d.status,
      length: d.text.length,
    }));
  if (kind === "scenes")
    return data.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      file: n.file,
      start: n.start,
      end: n.end,
      documentId: source(n.file)?.id,
      range: source(n.file) && sceneRange(source(n.file)!.text, n),
    }));
  if (kind === "links")
    return data.links.map((l) => ({
      ...l,
      documentId: source(data.nodes.find((n) => n.id === l.source)?.file || "")
        ?.id,
    }));
  if (kind === "variables")
    return data.variables.map((v) => ({
      ...v,
      documentId: source(v.file)?.id,
    }));
  if (kind === "commands") return commandCatalog(p.commands);
  if (kind === "calls") return data.calls;
  if (kind === "unknown_commands") {
    const usages = data.calls
      .filter((c) => !c.registered)
      .map((c) => {
        const d = source(c.file)!;
        const from = lineOffset(d.text, c.line);
        const example = d.text.slice(from).split(/\r?\n/, 1)[0];
        const inferred = unregisteredCommand(
          example,
          Math.max(0, c.column - 1),
          p.commands,
        );
        return {
          ...c,
          example,
          range: { from, to: from + example.length },
          inferredParameters: inferred?.command.params ?? null,
        };
      });
    const variants = new Map<string, Set<string>>();
    for (const usage of usages) {
      const set = variants.get(usage.name) || new Set<string>();
      set.add(JSON.stringify(usage.inferredParameters));
      variants.set(usage.name, set);
    }
    return usages.map((usage) => ({
      ...usage,
      inference: {
        confirmed: false,
        ambiguous: variants.get(usage.name)!.size > 1,
      },
    }));
  }
  const references: unknown[] = [];
  for (const d of p.documents) {
    let from = 0;
    for (const [index, line] of d.text.split("\n").entries()) {
      for (const m of line.matchAll(/\$[A-Za-z_]\w*/g)) {
        const hit = variableReferenceAt(line, m.index + 1);
        if (hit)
          references.push({
            name: hit.name,
            declared: data.variables.some(
              (v) => v.declared && v.name === hit.name,
            ),
            documentId: d.id,
            file: d.name,
            line: index + 1,
            from: from + m.index,
            to: from + m.index + m[0].length,
          });
      }
      from += line.length + 1;
    }
  }
  return references;
}
export function statistics(
  p: Project,
  documentId?: string,
  sceneName?: string,
) {
  const docs = documentId
    ? p.documents.filter((d) => d.id === documentId)
    : p.documents;
  if (documentId && !docs.length) throw Error("DOCUMENT_NOT_FOUND");
  const nodes = parse(docs, p.commands).nodes.filter(
    (n) => !sceneName || n.name === sceneName,
  );
  if (sceneName && nodes.length !== 1) throw Error("SCENE_NOT_UNIQUE");
  const values = docs
    .filter((d) => !sceneName || nodes[0].file === d.name)
    .map((d) => {
      const range = sceneName
        ? sceneRange(d.text, nodes[0])
        : { from: 0, to: d.text.length };
      const text = d.text.slice(range.from, range.to),
        data = documentStatistics(text);
      return {
        documentId: d.id,
        name: d.name,
        ...data,
        dialogueLines: data.roles.reduce((sum, [, count]) => sum + count, 0),
        commandCalls: parse([{ ...d, text }], p.commands).nodes.reduce(
          (sum, n) => sum + n.calls.length,
          0,
        ),
      };
    });
  const totals = {
    scenes: 0,
    options: 0,
    characters: 0,
    words: 0,
    dialogueLines: 0,
    commandCalls: 0,
    roles: [] as string[],
  };
  for (const d of values) {
    for (const key of ["scenes", "options", "characters", "words"] as const)
      totals[key] += d.stats[key];
    totals.dialogueLines += d.dialogueLines;
    totals.commandCalls += d.commandCalls;
  }
  totals.roles = [
    ...new Set(values.flatMap((d) => d.roles.map(([name]) => name))),
  ];
  const commandUsage = new Map<string, number>();
  for (const node of nodes)
    for (const call of node.calls)
      commandUsage.set(call.name, (commandUsage.get(call.name) || 0) + 1);
  return {
    totals,
    documents: values,
    commandUsage: [...commandUsage].map(([name, count]) => ({ name, count })),
  };
}
