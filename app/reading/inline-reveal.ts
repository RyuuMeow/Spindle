import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { scanMarkup } from "../inline-markup";

export type InlineReveal = {
  from: number;
  openTo: number;
  closeFrom: number;
  to: number;
  paired: boolean;
};
export const revealInline = StateEffect.define<InlineReveal>();
/** A reveal belongs to one pair. Unfinished edits remain visible after the caret leaves. */
export const inlineReveal = StateField.define<InlineReveal | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(revealInline)) return effect.value;
    if (!value) return null;
    if (tr.docChanged)
      value = {
        ...value,
        from: tr.changes.mapPos(value.from, -1),
        openTo: tr.changes.mapPos(value.openTo, 1),
        closeFrom: tr.changes.mapPos(value.closeFrom, -1),
        to: tr.changes.mapPos(value.to, 1),
      };
    if (value.from >= value.to) return null;
    if (
      tr.selection &&
      !tr.state.selection.ranges.some(
        (r) => r.from <= value!.to && r.to >= value!.from,
      )
    ) {
      const tags = scanMarkup(tr.state.doc.sliceString(value.from, value.to));
      const first = tags[0],
        last = tags.at(-1);
      if (
        first?.complete &&
        !first.malformed &&
        (!value.paired ||
          (last?.closing &&
            last.complete &&
            !last.malformed &&
            (!last.name || last.name === first.name)))
      )
        return null;
    }
    return value;
  },
});

export function highlightInlineRange(
  root: HTMLElement,
  target: EventTarget | null,
) {
  const hit =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-inline-groups]")
      : null;
  const groups = new Set(hit?.dataset.inlineGroups?.split(" ") || []);
  for (const span of root.querySelectorAll<HTMLElement>("[data-inline-groups]"))
    span.classList.toggle(
      "reading-inline-active",
      (span.dataset.inlineGroups?.split(" ") || []).some((group) =>
        groups.has(group),
      ),
    );
}
/** Reapply after CodeMirror redraws marks, including graph focus/diagnostic updates. */
export const inlineHover = ViewPlugin.fromClass(
  class {
    private point: { x: number; y: number } | null = null;
    private frame = 0;
    constructor(private view: EditorView) {
      view.dom.addEventListener("pointermove", this.move);
      view.dom.addEventListener("pointerover", this.move);
      view.dom.addEventListener("pointerleave", this.leave);
    }
    private move = (event: PointerEvent) => {
      this.point = { x: event.clientX, y: event.clientY };
      highlightInlineRange(this.view.dom, event.target);
    };
    private leave = () => {
      this.point = null;
      highlightInlineRange(this.view.dom, null);
    };
    update() {
      cancelAnimationFrame(this.frame);
      if (this.point)
        this.frame = requestAnimationFrame(() => {
          if (this.point)
            highlightInlineRange(
              this.view.dom,
              document.elementFromPoint(this.point.x, this.point.y),
            );
        });
    }
    destroy() {
      cancelAnimationFrame(this.frame);
      this.view.dom.removeEventListener("pointermove", this.move);
      this.view.dom.removeEventListener("pointerover", this.move);
      this.view.dom.removeEventListener("pointerleave", this.leave);
    }
  },
);
