import type { EditorState } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import type { Command } from "../parser";
import { commandHover } from "../command-hints";
import { commandPopup } from "../command-popup";
export const commandTooltips = (
  commands: () => Command[],
  blocked: (state: EditorState) => boolean,
) =>
  hoverTooltip(
    (view, pos) => {
      if (view.composing || blocked(view.state)) return null;
      const line = view.state.doc.lineAt(pos);
      const hint = commandHover(line.text, pos - line.from, commands());
      if (!hint) return null;
      return {
        pos: line.from + hint.from,
        end: line.from + hint.to,
        above: true,
        create() {
          return { dom: commandPopup(hint.command, hint.parameterIndex) };
        },
      };
    },
    { hoverTime: 350, hideOnChange: true, hideOn: (tr) => blocked(tr.state) },
  );
