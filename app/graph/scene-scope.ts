import type { Node } from "../parser";
import type { TextEdit } from "../workspace/types";
import { lineOffset } from "../workspace/authoring";
import {
  applyTextEdits,
  difference,
  normalized,
  sourceEdits,
} from "../workspace/engine";

export type SceneScope = { sceneFrom: number; from: number; to: number };
export function sceneScope(source: string, node: Node): SceneScope {
  const end = lineOffset(source, node.end);
  const closed = source.slice(end).split(/\r?\n/, 1)[0].trim() === "===";
  const body = lineOffset(source, node.body);
  const terminatorGap = source.slice(0, end).endsWith("\r\n") ? 2 : 1;
  return {
    sceneFrom: lineOffset(source, node.start),
    from: body,
    to: closed
      ? Math.max(body, end - terminatorGap)
      : lineOffset(source, node.end + 1),
  };
}
/** A crossing edit invalidates the lens instead of silently attaching it to a different scene. */
export function mapSceneScope(
  before: string,
  after: string,
  scope: SceneScope,
): SceneScope | null {
  const change = difference(before, after)[0];
  if (!change) return scope;
  const delta = change.insert.length - (change.to - change.from);
  if (change.to <= scope.from && change.from < scope.from) {
    const next = {
      sceneFrom:
        change.to <= scope.sceneFrom
          ? scope.sceneFrom + delta
          : scope.sceneFrom,
      from: scope.from + delta,
      to: scope.to + delta,
    };
    const header = after.slice(next.sceneFrom, next.from);
    if (
      !/^\uFEFF?\s*title\s*:/.test(header) ||
      !/(?:^|\n)---\s*(?:\r?\n)$/.test(header)
    )
      return null;
    return next;
  }
  if (change.from >= scope.to) return scope;
  if (change.from >= scope.from && change.to <= scope.to)
    return { ...scope, to: scope.to + delta };
  return null;
}
export function sceneText(source: string, scope: SceneScope) {
  return normalized(source.slice(scope.from, scope.to));
}
export function sceneEdits(
  source: string,
  scope: SceneScope,
  edits: TextEdit[],
) {
  const body = source.slice(scope.from, scope.to),
    length = normalized(body).length;
  if (edits.some((e) => e.from < 0 || e.to < e.from || e.to > length))
    throw Error("修改超出目前場景範圍");
  const changes = sourceEdits(body, edits).map((e) => ({
    ...e,
    insert: e.insert.replace(/\r?\n/g, source.includes("\r\n") ? "\r\n" : "\n"),
    from: e.from + scope.from,
    to: e.to + scope.from,
  }));
  let boundaryGap = 0;
  if (
    scope.from === scope.to &&
    source.slice(scope.to).startsWith("===") &&
    changes.some((change) => change.insert.length)
  ) {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    changes[changes.length - 1].insert += eol;
    boundaryGap = eol.length;
  }
  const next = applyTextEdits(source, changes);
  return {
    changes,
    next,
    scope: {
      ...scope,
      to: scope.to + next.length - source.length - boundaryGap,
    },
  };
}
