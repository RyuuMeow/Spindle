import type { SourceSelection } from "./types";
export function readerRuns(text: string, kind: string) {
  const excluded = new Set<number>();
  for (const m of text.matchAll(/<<[^>]*>>|\s+#\S+/g))
    for (let i = m.index; i < m.index + m[0].length; i++) excluded.add(i);
  const prefix =
    kind === "title"
      ? /^\s*title\s*:\s*/.exec(text)
      : kind === "option"
        ? /^\s*->\s*/.exec(text)
        : null;
  if (prefix) for (let i = 0; i < prefix[0].length; i++) excluded.add(i);
  const indices = Array.from({ length: text.length }, (_, i) => i).filter(
    (i) => !excluded.has(i),
  );
  while (indices.length && /\s/.test(text[indices[0]])) indices.shift();
  while (indices.length && /\s/.test(text[indices.at(-1)!])) indices.pop();
  const runs: { from: number; to: number; text: string; strong: boolean }[] =
    [];
  const colon = kind === "dialogue" ? text.indexOf(":") : -1;
  for (const i of indices) {
    const strong = colon >= 0 && i <= colon;
    const last = runs.at(-1);
    if (last && last.to === i && last.strong === strong) {
      last.to++;
      last.text += text[i];
    } else runs.push({ from: i, to: i + 1, text: text[i], strong });
  }
  return runs;
}
export function readerSelection(host: HTMLElement): SourceSelection | null {
  const selection = window.getSelection();
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !host.contains(selection.anchorNode) ||
    !host.contains(selection.focusNode)
  )
    return null;
  const selected = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!selected) return null;
  const anchorStarts =
    selection.anchorNode === selected.startContainer &&
    selection.anchorOffset === selected.startOffset;
  const offset = (node: globalThis.Node, at: number, start: boolean) => {
    const el = (
      node.nodeType === 3 ? node.parentElement : (node as Element)
    )?.closest<HTMLElement>("[data-source-from]");
    if (el && host.contains(el)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.setEnd(node, at);
      return Number(el.dataset.sourceFrom) + range.toString().length;
    }
    // Native select-all / paragraph selections can end at an element boundary.
    let previous: HTMLElement | undefined;
    for (const span of host.querySelectorAll<HTMLElement>(
      "[data-source-from]",
    )) {
      const range = document.createRange();
      range.selectNodeContents(span);
      if (range.comparePoint(node, at) < 0)
        return start || !previous
          ? Number(span.dataset.sourceFrom)
          : Number(previous.dataset.sourceTo);
      previous = span;
    }
    return previous ? Number(previous.dataset.sourceTo) : null;
  };
  const anchor = offset(
      selection.anchorNode,
      selection.anchorOffset,
      anchorStarts,
    ),
    head = offset(selection.focusNode, selection.focusOffset, !anchorStarts);
  return anchor === null || head === null ? null : { anchor, head };
}
