import { useEffect, useLayoutEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { sourceOffset, normalized } from "../workspace/engine";
import type { EditorCapture } from "./types";
const providers = new Map<string, () => EditorCapture | null>();
const revealers = new Map<string, (from: number, to: number) => void>();
export function revealEditor(
  kind: string,
  documentName: string,
  from: number,
  to: number,
) {
  if (
    providers.get(kind)?.()?.documentName !== documentName ||
    !revealers.has(kind)
  )
    return false;
  revealers.get(kind)!(from, to);
  return true;
}
export function useEditorContext(
  kind: string,
  read: () => EditorCapture | null,
  reveal?: (from: number, to: number) => void,
) {
  const latest = useRef(read);
  const latestReveal = useRef(reveal);
  useLayoutEffect(() => {
    latest.current = read;
    latestReveal.current = reveal;
  });
  useEffect(() => {
    const provider = () => latest.current();
    providers.set(kind, provider);
    if (latestReveal.current)
      revealers.set(kind, (from, to) => latestReveal.current?.(from, to));
    return () => {
      if (providers.get(kind) === provider) {
        providers.delete(kind);
        revealers.delete(kind);
      }
    };
  }, [kind]);
}
export function captureEditor(kind: string) {
  const base = providers.get(kind)?.() ?? null;
  const editor = kind === "graph" ? providers.get("graph-editor")?.() : null;
  return editor ? { ...editor, graph: base?.graph } : base;
}
export function captureCodeMirror(
  view: EditorView | null,
  documentName: string,
  source: string,
  scope = { from: 0, to: source.length },
  blocked = false,
): EditorCapture | null {
  if (!view) return null;
  const body = source.slice(scope.from, scope.to);
  const map = (offset: number) => scope.from + sourceOffset(body, offset);
  return {
    documentName,
    source,
    primarySelection: view.state.selection.mainIndex,
    selections: view.state.selection.ranges.map((r) => ({
      anchor: map(r.anchor),
      head: map(r.head),
    })),
    visibleRanges: view.visibleRanges.map((r) => ({
      from: map(r.from),
      to: map(r.to),
    })),
    composing: view.composing,
    blocked: blocked || normalized(body) !== view.state.doc.toString(),
  };
}
