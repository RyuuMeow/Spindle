import { type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { Command } from "../parser";
import { scanMarkup } from "../inline-markup";
import {
  commandLabel,
  commandHelp,
  inlineParameterLabels,
} from "../command-hints";
import {
  inlinePresentation,
  inlineScopeRuns,
  inlineRangeStyle,
} from "./inline-presentation";
import { inlineReveal, revealInline, type InlineReveal } from "./inline-reveal";
import { sourceTokens } from "./source-tokens";

class InlineName extends WidgetType {
  readonly className = "reading-inline-name";
  constructor(
    readonly label: string,
    readonly title: string,
    readonly reveal: InlineReveal,
    readonly readOnly: boolean,
  ) {
    super();
  }
  eq(other: InlineName) {
    return (
      this.label === other.label &&
      this.title === other.title &&
      this.readOnly === other.readOnly &&
      JSON.stringify(this.reveal) === JSON.stringify(other.reveal)
    );
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "reading-inline-name";
    span.textContent = this.label;
    span.title = this.title;
    if (!this.readOnly)
      span.onmousedown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          effects: revealInline.of(this.reveal),
          selection: { anchor: this.reveal.from + 1 },
        });
        view.focus();
      };
    return span;
  }
  ignoreEvent() {
    return false;
  }
}
class InlineLabel extends WidgetType {
  constructor(
    readonly label: string,
    readonly title: string,
  ) {
    super();
  }
  eq(other: InlineLabel) {
    return this.label === other.label && this.title === other.title;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "reading-parameter-hint";
    span.textContent = this.label;
    span.title = this.title;
    return span;
  }
  ignoreEvent() {
    return false;
  }
}
export function inlineDecorations(
  state: EditorState,
  text: string,
  base: number,
  commands: Command[],
  palette: string[],
  readOnly: boolean,
) {
  const ranges: Range<Decoration>[] = [];
  const raw: { from: number; to: number }[] = [];
  const inline = inlinePresentation(text, commands, palette);
  const expanded = state.field(inlineReveal, false);
  const touches = (from: number, to: number) =>
    !readOnly &&
    state.selection.ranges.some(
      (range) => range.from <= base + to && range.to >= base + from,
    );
  const revealed = new Set(
    inline.groups.filter(
      (group) =>
        (!group.tag.selfClosing && !group.closing) ||
        touches(group.tag.from, group.tag.to) ||
        (group.closing && touches(group.closing.from, group.closing.to)) ||
        (expanded && expanded.from === base + group.tag.from),
    ),
  );
  const revealedClosers = new Set(
    [...revealed].flatMap((group) =>
      group.closing ? [group.closing.from] : [],
    ),
  );
  const hide = (from: number, to: number) => {
    if (to > from)
      ranges.push(
        Decoration.replace({ inclusive: false }).range(base + from, base + to),
      );
  };
  for (const run of inlineScopeRuns(inline.scopes)) {
    const style = inlineRangeStyle(run.groups);
    const css = Object.entries(style)
      .map(
        ([key, value]) =>
          key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + ":" + value,
      )
      .join(";");
    ranges.push(
      Decoration.mark({
        class: "reading-inline-scope",
        attributes: {
          style: css,
          "data-inline-groups": run.groups
            .map((group) => base + group.tag.from)
            .join(" "),
        },
      }).range(base + run.from, base + run.to),
    );
  }
  const hiddenClosers = new Set<number>();
  for (const group of inline.groups) {
    const { tag, closing, command, color } = group;
    if (revealed.has(group)) {
      raw.push({ from: tag.from, to: tag.to });
      if (closing) raw.push({ from: closing.from, to: closing.to });
      continue;
    }
    ranges.push(
      Decoration.mark({
        class: "reading-inline-marker",
        inclusive: true,
        attributes: {
          style: "--inline-color:" + color,
          "data-inline-groups": String(base + tag.from),
        },
      }).range(base + tag.from, base + tag.to),
    );
    ranges.push(
      Decoration.replace({
        widget: new InlineName(
          commandLabel(command),
          commandHelp(command),
          {
            from: base + tag.from,
            openTo: base + tag.to,
            closeFrom: base + (closing?.from ?? tag.to),
            to: base + (closing?.to ?? tag.to),
            paired: !tag.selfClosing,
          },
          readOnly,
        ),
        inclusive: false,
      }).range(base + tag.from, base + tag.from + tag.name.length + 1),
    );
    const tail = /\s*\/?\]$/.exec(text.slice(tag.from, tag.to));
    if (tail) hide(tag.to - tail[0].length, tag.to);
    if (
      closing &&
      !revealedClosers.has(closing.from) &&
      !hiddenClosers.has(closing.from)
    ) {
      hide(closing.from, closing.to);
      hiddenClosers.add(closing.from);
    }
  }
  if (
    expanded &&
    expanded.from >= base &&
    expanded.from <= base + text.length
  ) {
    raw.push({
      from: expanded.from - base,
      to: Math.min(text.length, expanded.openTo - base),
    });
    if (expanded.paired)
      raw.push({
        from: Math.max(0, expanded.closeFrom - base),
        to: Math.min(text.length, expanded.to - base),
      });
  }
  for (const tag of scanMarkup(text)) {
    if (!inline.markers.some((marker) => marker.tag.from === tag.from))
      raw.push({ from: tag.from, to: tag.to });
  }
  for (const hint of inlineParameterLabels(text, commands)) {
    if (raw.some((span) => hint.from >= span.from && hint.to <= span.to))
      continue;
    ranges.push(
      Decoration.replace({
        widget: new InlineLabel(
          hint.shorthand && !hint.distinct ? " " : hint.label + ":",
          hint.help,
        ),
        inclusive: false,
      }).range(base + hint.from, base + hint.to),
    );
  }
  const seen = new Set<string>();
  for (const span of raw) {
    const key = span.from + ":" + span.to;
    if (span.to <= span.from || seen.has(key)) continue;
    seen.add(key);
    ranges.push(
      Decoration.mark({ class: "reading-inline-source" }).range(
        base + span.from,
        base + span.to,
      ),
    );
    for (const token of sourceTokens(text)) {
      const from = Math.max(span.from, token.from),
        to = Math.min(span.to, token.to);
      if (to > from)
        ranges.push(
          Decoration.mark({ class: token.className }).range(
            base + from,
            base + to,
          ),
        );
    }
  }
  return { ranges, raw };
}
