import type { Link, Node } from "../parser";
import type { DocumentRecord } from "../workspace/types";

export type SourceAnchor = {
  id: string; documentId: string; kind: "scene" | "transition" | "branch";
  from: number; to: number; signature: string; stamp: string;
};
export type GraphScene = {
  id: string; node?: Node; name: string;
  kind: "scene" | "external" | "missing" | "dynamic"; reference?: Link;
};
export type GraphTransition = {
  id: string; source: string; target: string; items: Link[]; label: boolean;
  groupId?: string; groupPath: string[]; order: number;
};
export type GraphBranch = {
  id: string; source: string; parentId?: string; order: number;
  depth: number; transitions: string[]; from: number; to: number;
};
export type GraphModel = {
  documentId: string; version: string; records: GraphScene[];
  groups: GraphTransition[]; branches: GraphBranch[]; anchors: SourceAnchor[];
};
export function stamp(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return text.length + ":" + (hash >>> 0).toString(36);
}
function offsets(text: string) {
  const result = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") result.push(i + 1);
  return result;
}
function mappedStart(old: string, next: string, from: number, to: number) {
  let a = 0, b = old.length, c = next.length;
  while (a < b && a < c && old[a] === next[a]) a++;
  while (b > a && c > a && old[b-1] === next[c-1]) { b--; c--; }
  if (to <= a) return from;
  if (from >= b) return from + c - b;
  if (a <= from && b >= to && c === a) return null;
  if (from <= a) return from;
  return null;
}
type Input = {
  file: string; nodes: Node[]; links: Link[]; documents?: DocumentRecord[];
  anchors?: SourceAnchor[]; previousTexts?: Record<string, string>;
};
/** Source object identity survives changes to filenames, titles and line numbers. */
export function buildGraphModel(input: Input): GraphModel {
  const docs = input.documents || [];
  const byFile = new Map(docs.map(d => [d.name, d]));
  const own = input.nodes.filter(n => n.file === input.file);
  const documentId = byFile.get(input.file)?.id || input.file;
  const previous = input.anchors || [];
  const used = new Set<string>();
  const anchors: SourceAnchor[] = [];
  const lineOffsets = new Map(docs.map(d => [d.id, offsets(d.text)]));
  function anchor(node: Node, kind: SourceAnchor["kind"], line: number, length: number, signature: string, column = 1) {
    const doc = byFile.get(node.file);
    const docId = doc?.id || node.file;
    const text = doc?.text || "";
    const from = (lineOffsets.get(docId)?.[line - 1] ?? line * 1024) + column - 1;
    const to = from + length;
    const hash = stamp(text);
    const candidates = previous.filter(a => a.documentId === docId && a.kind === kind && !used.has(a.id));
    const oldText = input.previousTexts?.[docId];
    const positional = candidates.filter(a => {
      if (a.stamp === hash) return a.from === from;
      return oldText !== undefined && mappedStart(oldText, text, a.from, a.to) === from;
    });
    const matching = candidates.filter(a => a.signature === signature);
    const match = positional.length === 1 ? positional[0] : matching.length === 1 ? matching[0] : undefined;
    const value: SourceAnchor = { id: match?.id || kind + ":" + crypto.randomUUID(), documentId: docId, kind, from, to, signature, stamp: hash };
    used.add(value.id); anchors.push(value); return value;
  }
  const records: GraphScene[] = [];
  const sceneIds = new Map<string, string>();
  for (const node of input.nodes) {
    const doc = byFile.get(node.file);
    const text = doc?.text.split(/\r?\n/).slice(node.start - 1, node.end).join("\n") || node.name;
    const a = anchor(node, "scene", node.start, text.length, node.name + ":" + stamp(text.replace(/^title[^\n]*\n/, "")));
    sceneIds.set(node.id, a.id);
    if (node.file === input.file) records.push({ id:a.id, node, name:node.name, kind:"scene" });
  }
  const groups: GraphTransition[] = [], branches: GraphBranch[] = [];
  const branchKeys = new Map<string, GraphBranch>();
  for (const link of input.links.filter(l => own.some(n => n.id === l.source))) {
    const source = own.find(n => n.id === link.source)!;
    const targets = input.nodes.filter(n => n.name === link.target);
    const target = !link.dynamic && targets.length === 1 ? targets[0] : undefined;
    const transition = anchor(source, "transition", link.line,
      link.kind.length + link.target.length + 5,
      source.name + "|" + link.kind + "|" + link.target + "|" + (link.context || []).map(c => c.kind+":"+c.text).join("/"), link.column);
    const targetId = target ? sceneIds.get(target.id)! : (link.dynamic ? "dynamic:" + transition.id : "missing:" + link.target);
    if (!records.some(r => r.id === targetId)) records.push({
      id:targetId, node:target, name:link.target,
      kind:link.dynamic ? "dynamic" : target ? "external" : "missing", reference:link
    });
    const groupPath: string[] = [];
    if (!link.unresolved) for (const context of link.context || []) {
      if (context.groupLine === undefined || context.kind === "unknown") continue;
      const key = source.id + ":" + context.groupLine;
      let branch = branchKeys.get(key);
      if (!branch) {
        const a = anchor(source, "branch", context.groupLine, 1,
          source.name + "|" + (context.kind === "option" ? "option" : "condition") + "|" + context.text);
        branch = {id:a.id, source:sceneIds.get(source.id)!, parentId:groupPath.at(-1),
          order:branches.length, depth:groupPath.length, transitions:[],from:a.from,to:a.to};
        branches.push(branch); branchKeys.set(key,branch);
      }
      if (!branch.transitions.includes(transition.id)) branch.transitions.push(transition.id);
      branch.to = Math.max(branch.to, transition.to);
      groupPath.push(branch.id);
    }
    groups.push({
      id:transition.id, source:sceneIds.get(source.id)!, target:targetId,
      items:[link], label:!!link.label || !!link.unresolved || link.kind==="detour" || source.id===target?.id,
      groupId:groupPath.at(-1), groupPath, order:groups.length,
    });
  }
  return {documentId, version:stamp(docs.map(d=>d.id+":"+d.version+":"+stamp(d.text)).join("|") || JSON.stringify(input.links)),
    records, groups, branches, anchors};
}
