import type { editor, IDisposable } from "monaco-editor";
import {
  canStartMarkup,
  linkedMarkup,
  linkedEnd,
  linkedCaret,
  linkedMirror,
  editLinkedName,
  type InlineLink,
} from "./inline-editing";

export function sourceInlineEditing(
  editor: editor.IStandaloneCodeEditor,
  m: typeof import("monaco-editor"),
) {
  let link: InlineLink | null = null,
    changing = false,
    composing = false;
  const decorations = editor.createDecorationsCollection();
  const clear = () => {
    link = null;
    decorations.clear();
  };
  const paint = () => {
    const model = editor.getModel();
    if (!model || !link) {
      decorations.clear();
      return;
    }
    const p = model.getPositionAt(linkedMirror(link));
    decorations.set([
      {
        range: new m.Range(p.lineNumber, p.column, p.lineNumber, p.column),
        options: {
          before: {
            content: "\u200b",
            inlineClassName: "inline-mirror-caret",
            cursorStops: m.editor.InjectedTextCursorStops.None,
          },
          showIfCollapsed: true,
        },
      },
    ]);
  };
  const replace = (
    from: number,
    to: number,
    text: string,
    caret: number,
    next: InlineLink | null,
  ) => {
    const model = editor.getModel();
    if (!model) return;
    const a = model.getPositionAt(from),
      b = model.getPositionAt(to);
    changing = true;
    try {
      editor.executeEdits(
        "inline-markup",
        [
          {
            range: new m.Range(a.lineNumber, a.column, b.lineNumber, b.column),
            text,
          },
        ],
        () => {
          const p = model.getPositionAt(caret);
          return [
            new m.Selection(p.lineNumber, p.column, p.lineNumber, p.column),
          ];
        },
      );
      link = next;
      paint();
    } finally {
      changing = false;
    }
  };
  const bindings: IDisposable[] = [
    editor.onDidChangeModel(clear),
    editor.onDidBlurEditorText(clear),
    editor.onMouseDown(clear),
    editor.onDidCompositionStart(() => {
      composing = true;
      clear();
    }),
    editor.onDidCompositionEnd(() => {
      composing = false;
    }),
    editor.onDidChangeModelContent(() => {
      if (!changing) clear();
    }),
    editor.onDidChangeCursorSelection(() => {
      if (!changing) clear();
    }),
    editor.onKeyDown((event) => {
      const key = event.browserEvent.key;
      if (
        composing ||
        event.browserEvent.isComposing ||
        editor.getOption(m.editor.EditorOption.readOnly)
      )
        return;
      const model = editor.getModel(),
        selection = editor.getSelection();
      if (!model || !selection || editor.getSelections()?.length !== 1) {
        clear();
        return;
      }
      const suggesting = !!editor
        .getDomNode()
        ?.querySelector(".suggest-widget.visible");
      if (
        ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(key) ||
        (["ArrowUp", "ArrowDown"].includes(key) && !suggesting)
      )
        clear();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (link) {
        if (key === "Backspace" && !link.name) {
          consume();
          replace(link.from, linkedEnd(link), link.content, link.from, null);
          return;
        }
        const next =
          key === "Backspace" && link.name
            ? { ...link, name: Array.from(link.name).slice(0, -1).join("") }
            : Array.from(key).length === 1
              ? editLinkedName(link, key)
              : null;
        if (next) {
          consume();
          replace(
            link.from,
            linkedEnd(link),
            linkedMarkup(next),
            linkedCaret(next),
            next,
          );
          editor.trigger("inline-markup", "editor.action.triggerSuggest", {});
          return;
        }
        if (key.length === 1 || key === "Backspace") clear();
      }
      const from = model.getOffsetAt(selection.getStartPosition()),
        to = model.getOffsetAt(selection.getEndPosition());
      const line = model.getLineContent(selection.startLineNumber);
      if (
        key === "Backspace" &&
        selection.isEmpty() &&
        line.slice(selection.startColumn - 2, selection.startColumn) === "[]" &&
        canStartMarkup(line, selection.startColumn - 2)
      ) {
        consume();
        replace(from - 1, from + 1, "", from - 1, null);
        return;
      }
      if (
        key === "[" &&
        selection.startLineNumber === selection.endLineNumber &&
        canStartMarkup(line, selection.startColumn - 1)
      ) {
        consume();
        editor.pushUndoStop();
        const content = model.getValueInRange(selection);
        const next = content ? { from, name: "", content } : null;
        replace(from, to, next ? linkedMarkup(next) : "[]", from + 1, next);
        editor.trigger("inline-markup", "editor.action.triggerSuggest", {});
      } else if (
        key === "]" &&
        selection.isEmpty() &&
        line[selection.startColumn - 1] === "]"
      ) {
        consume();
        editor.setPosition({
          lineNumber: selection.startLineNumber,
          column: selection.startColumn + 1,
        });
      }
    }),
  ];
  return {
    get link() {
      return link;
    },
    clear,
    dispose() {
      bindings.forEach((b) => b.dispose());
      decorations.clear();
    },
  };
}
