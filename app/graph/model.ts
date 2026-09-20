import type { Link, Node } from "../parser";
import type { DocumentRecord } from "../workspace/types";

export type SourceAnchor = {
  id: string;
  documentId: string;
  kind: "scene" | "transition" | "branch";
  from: number;
  to: number;
  signature: string;
  stamp: string;
  fingerprint?: string;
};
export type GraphScene = {
  id: string;
  node?: Node;
  name: string;
  kind: "scene" | "external" | "missing" | "dynamic";
  reference?: Link;
};
export type GraphTransition = {
  id: string;
  source: string;
  target: string;
  items: Link[];
  label: boolean;
  groupId?: string;
  groupPath: string[];
  order: number;
};
export type GraphBranch = {
  id: string;
  source: string;
  parentId?: string;
  order: number;
  depth: number;
  transitions: string[];
  from: number;
  to: number;
};
export type GraphModel = {
  documentId: string;
  version: string;
  records: GraphScene[];
  groups: GraphTransition[];
  branches: GraphBranch[];
  anchors: SourceAnchor[];
};
export function stamp(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return text.length + ":" + (hash >>> 0).toString(36);
}
function offsets(text: string) {
  const result = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") result.push(i + 1);
  return result;
}
function mappedStart(old: string, next: string, from: number, to: number) {
  let a = 0,
    b = old.length,
    c = next.length;
  while (a < b && a < c && old[a] === next[a]) a++;
  while (b > a && c > a && old[b - 1] === next[c - 1]) {
    b--;
    c--;
  }
  if (to <= a) return from;
  if (from >= b) return from + c - b;
  if (a <= from && b >= to && c === a) return null;
  if (from <= a) return from;
  return null;
}
type Input = {
  file: string;
  nodes: Node[];
  links: Link[];
  documents?: DocumentRecord[];
  anchors?: SourceAnchor[];
  previousTexts?: Record<string, string>;
};
/** Source object identity survives changes to filenames, titles and line numbers. */
export function buildGraphModel(input: Input): GraphModel {
  const docs = input.documents || [];
  const byFile = new Map(docs.map((d) => [d.name, d]));
  const own = input.nodes.filter((n) => n.file === input.file);
  const documentId = byFile.get(input.file)?.id || input.file;
  const previous = input.anchors || [];
  const used = new Set<string>();
  const anchors: SourceAnchor[] = [];
  const lineOffsets = new Map(docs.map((d) => [d.id, offsets(d.text)]));
  const nameCounts = new Map<string, number>();
  const signatureCounts = new Map<string, number>(),
    fingerprintCounts = new Map<string, number>();
  for (const n of input.nodes) {
    const doc = byFile.get(n.file),
      text =
        doc?.text
          .split(/\r?\n/)
          .slice(n.start - 1, n.end)
          .join("\n") || n.name;
    const key =
      (doc?.id || n.file) + "|" + stamp(text.replace(/^title[^\n]*\n/, ""));
    fingerprintCounts.set(key, (fingerprintCounts.get(key) || 0) + 1);
  }
  for (const n of input.nodes) {
    const key = (byFile.get(n.file)?.id || n.file) + "|" + n.name;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  function anchor(
    node: Node,
    kind: SourceAnchor["kind"],
    line: number,
    length: number,
    signature: string,
    column = 1,
    fingerprint?: string,
  ) {
    const doc = byFile.get(node.file);
    const docId = doc?.id || node.file;
    const text = doc?.text || "";
    const from =
      (lineOffsets.get(docId)?.[line - 1] ?? line * 1024) + column - 1;
    const to = from + length;
    const hash = stamp(text);
    const candidates = previous.filter(
      (a) => a.documentId === docId && a.kind === kind && !used.has(a.id),
    );
    const oldText = input.previousTexts?.[docId];
    const positional = candidates.filter((a) => {
      if (a.stamp === hash) return a.from === from;
      return (
        oldText !== undefined &&
        mappedStart(oldText, text, a.from, a.to) === from
      );
    });
    const original = previous.filter(
      (a) => a.documentId === docId && a.kind === kind,
    );
    const matching = candidates.filter((a) => a.signature === signature);
    const unique =
      original.filter((a) => a.signature === signature).length === 1 &&
      (kind === "scene"
        ? (nameCounts.get(docId + "|" + node.name) || 0) === 1
        : (signatureCounts.get(kind + "|" + docId + "|" + signature) || 0) ===
          1);
    const fingerprints = fingerprint
      ? candidates.filter((a) => a.fingerprint === fingerprint)
      : [];
    const uniqueFingerprint =
      fingerprint &&
      fingerprintCounts.get(docId + "|" + fingerprint) === 1 &&
      original.filter((a) => a.fingerprint === fingerprint).length === 1 &&
      fingerprints.length === 1;
    const match =
      positional.length === 1
        ? positional[0]
        : unique && matching.length === 1
          ? matching[0]
          : uniqueFingerprint
            ? fingerprints[0]
            : undefined;
    const value: SourceAnchor = {
      id: match?.id || kind + ":" + crypto.randomUUID(),
      documentId: docId,
      kind,
      from,
      to,
      signature,
      stamp: hash,
      fingerprint,
    };
    used.add(value.id);
    anchors.push(value);
    return value;
  }
  const records: GraphScene[] = [];
  const sceneIds = new Map<string, string>();
  for (const node of input.nodes) {
    const doc = byFile.get(node.file);
    const text =
      doc?.text
        .split(/\r?\n/)
        .slice(node.start - 1, node.end)
        .join("\n") || node.name;
    const range = doc ? lineOffsets.get(doc.id)! : undefined;
    const length = range
      ? (range[node.end] ?? doc!.text.length) - range[node.start - 1]
      : text.length;
    const a = anchor(
      node,
      "scene",
      node.start,
      length,
      node.name,
      1,
      stamp(text.replace(/^title[^\n]*\n/, "")),
    );
    sceneIds.set(node.id, a.id);
    if (node.file === input.file)
      records.push({ id: a.id, node, name: node.name, kind: "scene" });
  }
  const sourceLinks = input.links.filter((l) =>
    own.some((n) => n.id === l.source),
  );
  const transitionSignature = (l: Link) =>
    sceneIds.get(l.source) +
    "|" +
    l.kind +
    "|" +
    l.target +
    "|" +
    (l.context || []).map((c) => c.kind + ":" + c.text).join("/");
  const countedBranches = new Set<string>();
  for (const l of sourceLinks) {
    const source = own.find((n) => n.id === l.source)!,
      docId = byFile.get(source.file)?.id || source.file;
    const key = "transition|" + docId + "|" + transitionSignature(l);
    signatureCounts.set(key, (signatureCounts.get(key) || 0) + 1);
    for (const c of l.context || []) {
      const object = source.id + ":" + c.groupLine;
      if (
        l.unresolved ||
        c.groupLine === undefined ||
        c.kind === "unknown" ||
        countedBranches.has(object)
      )
        continue;
      countedBranches.add(object);
      const key =
        "branch|" +
        docId +
        "|" +
        sceneIds.get(source.id) +
        "|" +
        (c.kind === "option" ? "option" : "condition") +
        "|" +
        c.text;
      signatureCounts.set(key, (signatureCounts.get(key) || 0) + 1);
    }
  }
  const groups: GraphTransition[] = [],
    branches: GraphBranch[] = [];
  const branchKeys = new Map<string, GraphBranch>();
  for (const link of sourceLinks) {
    const source = own.find((n) => n.id === link.source)!;
    const targets = input.nodes.filter((n) => n.name === link.target);
    const target =
      !link.dynamic && targets.length === 1 ? targets[0] : undefined;
    const transition = anchor(
      source,
      "transition",
      link.line,
      link.kind.length + link.target.length + 5,
      transitionSignature(link),
      link.column,
    );
    const targetId = target
      ? sceneIds.get(target.id)!
      : link.dynamic
        ? "dynamic:" + transition.id
        : "missing:" + link.target;
    if (!records.some((r) => r.id === targetId))
      records.push({
        id: targetId,
        node: target,
        name: link.target,
        kind: link.dynamic ? "dynamic" : target ? "external" : "missing",
        reference: link,
      });
    const groupPath: string[] = [];
    if (!link.unresolved)
      for (const context of link.context || []) {
        if (context.groupLine === undefined || context.kind === "unknown")
          continue;
        const key = source.id + ":" + context.groupLine;
        let branch = branchKeys.get(key);
        if (!branch) {
          const a = anchor(
            source,
            "branch",
            context.groupLine,
            1,
            sceneIds.get(source.id) +
              "|" +
              (context.kind === "option" ? "option" : "condition") +
              "|" +
              context.text,
          );
          branch = {
            id: a.id,
            source: sceneIds.get(source.id)!,
            parentId: groupPath.at(-1),
            order: branches.length,
            depth: groupPath.length,
            transitions: [],
            from: a.from,
            to: a.to,
          };
          branches.push(branch);
          branchKeys.set(key, branch);
        }
        if (!branch.transitions.includes(transition.id))
          branch.transitions.push(transition.id);
        branch.to = Math.max(branch.to, transition.to);
        groupPath.push(branch.id);
      }
    groups.push({
      id: transition.id,
      source: sceneIds.get(source.id)!,
      target: targetId,
      items: [link],
      label:
        !!link.label ||
        !!link.unresolved ||
        link.kind === "detour" ||
        source.id === target?.id,
      groupId: groupPath.at(-1),
      groupPath,
      order: groups.length,
    });
  }
  return {
    documentId,
    version: stamp(
      docs.map((d) => d.id + ":" + d.version + ":" + stamp(d.text)).join("|") ||
        JSON.stringify(input.links),
    ),
    records,
    groups,
    branches,
    anchors,
  };
}
