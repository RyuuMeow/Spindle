import { markupCompletion } from "./inline-markup";

/** A short-lived name-only link; arguments and body are never mirrored. */
export type InlineLink = { from: number; name: string; content: string };
export const linkedMarkup = (link: InlineLink) =>
  `[${link.name}]${link.content}[/${link.name}]`;
export const linkedEnd = (link: InlineLink) =>
  link.from + linkedMarkup(link).length;
export const linkedCaret = (link: InlineLink) =>
  link.from + 1 + link.name.length;
export const linkedMirror = (link: InlineLink) => linkedEnd(link) - 1;
export function canStartMarkup(line: string, offset: number) {
  // Reuse the scanner's exclusions for escapes, literal spans, commands and expressions.
  return !!markupCompletion(line.slice(0, offset) + "[", offset + 1, []);
}
export function editLinkedName(link: InlineLink, text: string) {
  if (!/^[\p{L}\p{N}_|]+$/u.test(text)) return null;
  return { ...link, name: link.name + text };
}
