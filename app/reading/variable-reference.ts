import type { EditorView } from "@codemirror/view";
import { variableAt, type YarnVariable } from "../variable-completion";
/** Replacement badges map either half to an endpoint; resolve the whole badge. */
export function readingVariableAt(
  view: EditorView,
  pos: number,
  variables: YarnVariable[],
) {
  const badge = view.dom.querySelector<HTMLElement>(".reading-variable:hover");
  const line = view.state.doc.lineAt(pos);
  if (badge) {
    const name = "$" + badge.textContent;
    for (const match of line.text.matchAll(/\$[A-Za-z_]\w*/g)) {
      if (
        match[0] !== name ||
        pos < line.from + match.index - 1 ||
        pos > line.from + match.index + name.length + 1
      )
        continue;
      return variableAt(line.text, match.index, variables);
    }
  }
  return variableAt(line.text, pos - line.from, variables);
}
