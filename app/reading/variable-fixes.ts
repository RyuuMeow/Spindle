import {
  Decoration,
  EditorView,
  ViewPlugin,
  hoverTooltip,
  closeHoverTooltips,
} from "@codemirror/view";
import type { YarnVariable } from "../variable-completion";
import { collectVariables } from "../variable-completion";
import { missingDeclaration } from "../variable-quick-fix";
export function variableFixes(
  variables: () => YarnVariable[],
  errors: (line: number) => string[] = () => [],
) {
  const known = (view: EditorView) => [
    ...variables(),
    ...collectVariables([{ name: "", text: view.state.doc.toString() }]),
  ];
  const fixAt = (view: EditorView, pos: number) => {
    const line = view.state.doc.lineAt(pos);
    return missingDeclaration(line.text, pos - line.from, known(view));
  };
  const apply = (view: EditorView, pos: number) => {
    if (view.composing || view.state.readOnly) return false;
    const line = view.state.doc.lineAt(pos),
      fix = fixAt(view, pos);
    if (!fix?.insert) return false;
    view.dispatch({
      changes: { from: line.from, insert: fix.insert + "\n" },
      effects: closeHoverTooltips,
      userEvent: "input.declaration",
    });
    return true;
  };
  return {
    at: (state: import("@codemirror/state").EditorState, pos: number) => {
      const line = state.doc.lineAt(pos);
      return missingDeclaration(line.text, pos - line.from, [
        ...variables(),
        ...collectVariables([{ name: "", text: state.doc.toString() }]),
      ]);
    },
    apply,
    extension: [
      EditorView.theme({
        ".cm-undeclared-variable": {
          textDecoration: "underline wavy #df7777",
          textUnderlineOffset: "3px",
        },
      }),
      ViewPlugin.fromClass(
        class {
          decorations;
          constructor(view: EditorView) {
            this.decorations = this.build(view);
          }
          update(update: import("@codemirror/view").ViewUpdate) {
            this.decorations = this.build(update.view);
          }
          build(view: EditorView) {
            const vars = known(view),
              marks = [];
            for (let i = 1; i <= view.state.doc.lines; i++) {
              const line = view.state.doc.line(i),
                fix = missingDeclaration(
                  line.text,
                  line.text.indexOf("<<") + 2,
                  vars,
                );
              if (line.length && (fix || errors(line.number).length))
                marks.push(
                  Decoration.mark({ class: "cm-undeclared-variable" }).range(
                    line.from +
                      (fix?.from ?? Math.max(0, line.text.indexOf("<<"))),
                    line.from + (fix?.to ?? line.length),
                  ),
                );
            }
            return Decoration.set(marks);
          }
        },
        { decorations: (v) => v.decorations },
      ),
      hoverTooltip(
        (view, pos) => {
          if (view.composing || view.state.readOnly) return null;
          const fix = fixAt(view, pos);
          const line = view.state.doc.lineAt(pos);
          const messages = errors(line.number);
          if (!fix && !messages.length) return null;
          return {
            pos: line.from + (fix?.from ?? 0),
            end: line.from + (fix?.to ?? line.length),
            above: true,
            create() {
              const dom = document.createElement("div");
              dom.className = "reading-command-tooltip command-quick-fix";
              const message = document.createElement("div");
              message.textContent = messages.length
                ? messages.join("\n")
                : `變數「${fix!.name}」尚未宣告`;
              dom.appendChild(message);
              if (fix?.insert) {
                const button = document.createElement("button");
                button.textContent = "新增宣告";
                button.onmousedown = (e) => e.preventDefault();
                button.onclick = () => apply(view, pos);
                dom.appendChild(button);
              }
              return { dom };
            },
          };
        },
        { hoverTime: 350, hideOnChange: true },
      ),
    ],
  };
}
