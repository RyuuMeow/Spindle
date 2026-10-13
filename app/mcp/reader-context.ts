import type { SourceSelection } from "./types";
import { scanMarkup, skipValue } from "../inline-markup";
import { commandEnd } from "../reading/tokens";
import type { ReadingLine } from "../reading/structure";

/** Collapse gaps after hidden rows are removed, preserving original source offsets. */
export function readerLines(lines: ReadingLine[]): ReadingLine[] {
  const content: ReadingLine[] = [];
  let blank: ReadingLine | undefined;
  for (const line of lines) {
    if (line.kind === "blank") {
      if (content.length) blank ??= line;
      continue;
    }
    if (
      !["title", "dialogue", "option"].includes(line.kind) ||
      !readerRuns(line.text, line.kind).length
    )
      continue;
    if (blank) content.push(blank);
    content.push(line);
    blank = undefined;
  }
  return content;
}

export function readerRuns(text: string, kind: string) {
  const excluded = new Set<number>();
  const hide = (from: number, to: number) => {
    for (let i = from; i < to; i++) excluded.add(i);
  };
  const tags = scanMarkup(text).filter((tag) => tag.complete && !tag.malformed);
  let literal = false;
  if (kind !== "title")
    for (let i = 0; i < text.length; i++) {
      const tag = tags.find((tag) => tag.from === i);
      if (tag) {
        hide(tag.from, tag.to);
        if (tag.name === "nomarkup") literal = !tag.closing && !tag.selfClosing;
        i = tag.to - 1;
        continue;
      }
      if (literal) continue;
      if (text[i] === "\\") {
        i++;
        continue;
      }
      if (text[i] === "{") {
        i = skipValue(text, i) - 1;
        continue;
      }
      if (text.startsWith("//", i)) {
        hide(i, text.length);
        break;
      }
      if (text.startsWith("<<", i)) {
        const end = commandEnd(text.slice(i));
        if (end >= 0) {
          hide(i, i + end + 2);
          i += end + 1;
          continue;
        }
      }
      if (text[i] === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
        const value = /^#\S+/.exec(text.slice(i))?.[0];
        if (value) {
          hide(i, i + value.length);
          i += value.length - 1;
        }
      }
    }
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
  if (
    excluded.size &&
    kind === "dialogue" &&
    /^[^:]+:\s*$/.test(runs.map((r) => r.text).join(""))
  )
    return [];
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
