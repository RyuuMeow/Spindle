import {
  Decoration,
  EditorView,
  ViewPlugin,
  hoverTooltip,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Issue } from "../parser";
import { DIALOGUE_LENGTH_CODE } from "./dialogue-length";

/** Receives published/visible diagnostics, so local typing follows the shared delay. */
export function readingLengthWarnings(getIssues: () => Issue[]) {
  const ranges = (view: EditorView) =>
    getIssues()
      .filter(
        (i) =>
          i.code === DIALOGUE_LENGTH_CODE && i.line <= view.state.doc.lines,
      )
      .flatMap((i) => {
        const line = view.state.doc.line(i.line);
        const from = Math.min(line.to, line.from + i.column - 1);
        const to = Math.min(
          line.to,
          line.from + (i.endColumn ?? line.length + 1) - 1,
        );
        return to > from ? [{ from, to, issue: i }] : [];
      });
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }
        build(view: EditorView) {
          return Decoration.set(
            ranges(view).map((r) =>
              Decoration.mark({ class: "reading-length-warning" }).range(
                r.from,
                r.to,
              ),
            ),
            true,
          );
        }
        update(update: ViewUpdate) {
          if (update.docChanged || update.transactions.length)
            this.decorations = this.build(update.view);
        }
      },
      { decorations: (v) => v.decorations },
    ),
    hoverTooltip((view, pos) => {
      if (view.composing) return null;
      const range = ranges(view).find((r) => pos >= r.from && pos < r.to);
      if (!range) return null;
      const line = view.state.doc.lineAt(pos);
      const local = pos - line.from;
      // Semantic hovers own commands, interpolation and role names.
      if (
        [...line.text.matchAll(/<<[^\n]*?>>|\{[^\n]*?\}/g)].some(
          (m) => local >= m.index && local < m.index + m[0].length,
        )
      )
        return null;
      // Existing errors take priority over advisory prose length.
      if (
        getIssues().some(
          (i) => i.line === range.issue.line && i.severity === "error",
        )
      )
        return null;
      return {
        pos: range.from,
        end: range.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "reading-length-message";
          dom.textContent = range.issue.message;
          return { dom };
        },
      };
    }),
    EditorView.baseTheme({
      ".reading-length-warning": {
        textDecoration: "underline wavy var(--warning, #d9b96e)",
        textUnderlineOffset: "3px",
      },
      ".reading-length-message": { padding: "8px 12px", maxWidth: "360px" },
    }),
  ];
}
