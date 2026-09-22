import { t as tr } from "../i18n/index.ts";
import type { EditorState } from "@codemirror/state";
import { hoverTooltip, type EditorView } from "@codemirror/view";
import type { Command } from "../parser";
import { unregisteredCommand } from "../command-quick-fix";
import { closeHoverTooltips } from "@codemirror/view";
import { commandHover } from "../command-hints";
import { commandPopup } from "../command-popup";
export const commandTooltips = (
  commands: () => Command[],
  blocked: (state: EditorState) => boolean,
  register?: (command: Command) => void,
  errorAt: (
    state: EditorState,
    pos: number,
    view: EditorView,
  ) => boolean = () => false,
) =>
  hoverTooltip(
    (view, pos) => {
      if (
        view.composing ||
        blocked(view.state) ||
        errorAt(view.state, pos, view)
      )
        return null;
      const line = view.state.doc.lineAt(pos);
      const hint = commandHover(line.text, pos - line.from, commands());
      if (!hint) {
        const candidate =
          register &&
          !view.state.readOnly &&
          unregisteredCommand(line.text, pos - line.from, commands());
        if (!candidate) return null;
        return {
          pos: line.from + candidate.from,
          end: line.from + candidate.to,
          above: true,
          create() {
            const dom = document.createElement("div");
            dom.className = "reading-command-tooltip command-quick-fix";
            const message = document.createElement("div");
            message.textContent =
              tr("m54ff568e9852") + candidate.command.name + "」";
            const button = document.createElement("button");
            button.textContent = tr("m05cc9992623a");
            button.title = "Alt+Enter";
            button.onmousedown = (event) => event.preventDefault();
            button.onclick = () => {
              register?.(candidate.command);
              view.dispatch({ effects: closeHoverTooltips });
            };
            dom.appendChild(message);
            dom.appendChild(button);
            return { dom };
          },
        };
      }
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
