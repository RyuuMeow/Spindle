import { StateEffect, StateField, Prec } from "@codemirror/state";
import { EditorView, Decoration, WidgetType, keymap } from "@codemirror/view";
import { startCompletion, completionStatus } from "@codemirror/autocomplete";
import {
  canStartMarkup,
  linkedMarkup,
  linkedEnd,
  linkedCaret,
  linkedMirror,
  editLinkedName,
  type InlineLink,
} from "../inline-editing";

const setLink = StateEffect.define<InlineLink | null>();
export const inlineLink = StateField.define<InlineLink | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setLink)) return effect.value;
    if (
      tr.docChanged ||
      tr.selection ||
      tr.isUserEvent("undo") ||
      tr.isUserEvent("redo")
    )
      return null;
    return value;
  },
});
class MirrorCaret extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "inline-mirror-caret";
    span.textContent = "\u200b";
    span.setAttribute("aria-hidden", "true");
    return span;
  }
}
export function clearInlineLink(view: EditorView) {
  if (view.state.field(inlineLink, false))
    view.dispatch({ effects: setLink.of(null) });
}
const changeLink = (
  view: EditorView,
  previous: InlineLink,
  next: InlineLink,
) => {
  view.dispatch({
    changes: {
      from: previous.from,
      to: linkedEnd(previous),
      insert: linkedMarkup(next),
    },
    selection: { anchor: linkedCaret(next) },
    effects: setLink.of(next),
    userEvent: "input.type",
  });
  startCompletion(view);
};
export const inlineEditing = [
  inlineLink,
  EditorView.decorations.compute([inlineLink], (state) => {
    const link = state.field(inlineLink);
    return link
      ? Decoration.set([
          Decoration.widget({ widget: new MirrorCaret(), side: -1 }).range(
            linkedMirror(link),
          ),
        ])
      : Decoration.none;
  }),
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (
        ["ArrowLeft", "ArrowRight", "Escape", "Home", "End"].includes(
          event.key,
        ) ||
        (["ArrowUp", "ArrowDown"].includes(event.key) &&
          !completionStatus(view.state))
      )
        clearInlineLink(view);
      return false;
    },
    mousedown(_e, view) {
      clearInlineLink(view);
    },
    blur(_e, view) {
      clearInlineLink(view);
    },
  }),
  Prec.highest(
    keymap.of([
      {
        key: "Backspace",
        run(view) {
          const link = view.state.field(inlineLink);
          if (
            view.composing ||
            view.state.readOnly ||
            view.state.selection.ranges.length !== 1
          )
            return false;
          if (!link) {
            const selection = view.state.selection.main,
              line = view.state.doc.lineAt(selection.head);
            if (
              !selection.empty ||
              view.state.sliceDoc(
                Math.max(0, selection.head - 1),
                selection.head + 1,
              ) !== "[]" ||
              !canStartMarkup(line.text, selection.head - line.from - 1)
            )
              return false;
            view.dispatch({
              changes: {
                from: selection.head - 1,
                to: selection.head + 1,
                insert: "",
              },
              selection: { anchor: selection.head - 1 },
              userEvent: "delete.backward",
            });
            return true;
          }
          if (!link.name) {
            view.dispatch({
              changes: {
                from: link.from,
                to: linkedEnd(link),
                insert: link.content,
              },
              selection: { anchor: link.from },
              effects: setLink.of(null),
              userEvent: "delete.backward",
            });
            return true;
          }
          changeLink(view, link, {
            ...link,
            name: Array.from(link.name).slice(0, -1).join(""),
          });
          return true;
        },
      },
    ]),
  ),
  Prec.highest(
    EditorView.inputHandler.of((view, from, to, text) => {
      if (
        view.composing ||
        view.state.readOnly ||
        view.state.selection.ranges.length !== 1
      )
        return false;
      const link = view.state.field(inlineLink);
      if (link) {
        const next = editLinkedName(link, text);
        if (next) {
          changeLink(view, link, next);
          return true;
        }
        clearInlineLink(view);
      }
      const line = view.state.doc.lineAt(from);
      if (
        text === "[" &&
        to <= line.to &&
        canStartMarkup(line.text, from - line.from)
      ) {
        const selected = view.state.sliceDoc(from, to);
        const next = selected ? { from, name: "", content: selected } : null;
        view.dispatch({
          changes: { from, to, insert: next ? linkedMarkup(next) : "[]" },
          selection: { anchor: from + 1 },
          effects: setLink.of(next),
          userEvent: "input.type",
        });
        startCompletion(view);
        return true;
      }
      if (
        text === "]" &&
        from === to &&
        view.state.sliceDoc(from, from + 1) === "]"
      ) {
        view.dispatch({ selection: { anchor: from + 1 }, userEvent: "select" });
        return true;
      }
      return false;
    }),
  ),
];
