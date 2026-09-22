import { t as tr } from "../i18n/index.ts";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  hoverTooltip,
  closeHoverTooltips,
} from "@codemirror/view";
import type { Command } from "../parser";
import type { YarnVariable } from "../variable-completion";
import { collectVariables } from "../variable-completion";
import { variableQuickFix } from "../variable-quick-fix";
export function variableFixes(
  variables: () => YarnVariable[],
  errors: (line: number) => string[] = () => [],
  commands: () => Command[] = () => [],
  quiet: (line: number) => boolean = () => false,
) {
  const known = (view: EditorView) => [
    ...variables(),
    ...collectVariables([{ name: "", text: view.state.doc.toString() }]),
  ];
  const fixAt = (view: EditorView, pos: number) => {
    const line = view.state.doc.lineAt(pos);
    return variableQuickFix(
      line.text,
      pos - line.from,
      known(view),
      commands(),
    );
  };
  const apply = (view: EditorView, pos: number) => {
    if (view.composing || view.state.readOnly) return false;
    const line = view.state.doc.lineAt(pos),
      fix = fixAt(view, pos);
    if (!fix?.insert) return false;
    view.dispatch({
      changes: {
        from: line.from + (fix.replace ? fix.from : 0),
        to: line.from + (fix.replace ? fix.to : 0),
        insert: fix.replace ? fix.insert : fix.insert + "\n",
      },
      effects: closeHoverTooltips,
      userEvent: "input.declaration",
    });
    return true;
  };
  return {
    at: (state: import("@codemirror/state").EditorState, pos: number) => {
      const line = state.doc.lineAt(pos);
      if (quiet(state.doc.lineAt(pos).number)) return null;
      return variableQuickFix(
        line.text,
        pos - line.from,
        [
          ...variables(),
          ...collectVariables([{ name: "", text: state.doc.toString() }]),
        ],
        commands(),
      );
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
              if (quiet(i)) continue;
              const line = view.state.doc.line(i),
                fix = variableQuickFix(
                  line.text,
                  line.text.indexOf("<<") + 2,
                  vars,
                  commands(),
                );
              if (line.length && (fix || errors(line.number).length))
                marks.push(
                  Decoration.mark({ class: "cm-undeclared-variable" }).range(
                    line.from +
                      (fix && fix.to > fix.from
                        ? fix.from
                        : Math.max(0, line.text.indexOf("<<"))),
                    line.from +
                      (fix && fix.to > fix.from ? fix.to : line.length),
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
          if (quiet(view.state.doc.lineAt(pos).number)) return null;
          const fix = fixAt(view, pos);
          const line = view.state.doc.lineAt(pos);
          const messages = errors(line.number);
          if (!fix && !messages.length) return null;
          return {
            pos: line.from + (fix?.from ?? 0),
            end: line.from + (fix && fix.to > fix.from ? fix.to : line.length),
            above: true,
            create() {
              const dom = document.createElement("div");
              dom.className = "reading-command-tooltip command-quick-fix";
              const message = document.createElement("div");
              message.textContent = messages.length
                ? messages.join("\n")
                : fix!.replace
                  ? fix!.label
                  : tr("m5b27b0adfbe3", [fix!.name]);
              dom.appendChild(message);
              if (fix?.insert) {
                const button = document.createElement("button");
                button.textContent = fix.label;
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
