import type { EditorState } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import type { Command } from "../parser";
import { unregisteredCommand } from "../command-quick-fix";
import { closeHoverTooltips } from "@codemirror/view";
import { commandHover } from "../command-hints";
import { commandPopup } from "../command-popup";
export const commandTooltips = (
  commands: () => Command[],
  blocked: (state: EditorState) => boolean,
  register?: (command: Command) => void,
) =>
  hoverTooltip(
    (view, pos) => {
      if (view.composing || blocked(view.state)) return null;
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
              "未註冊指令「" + candidate.command.name + "」";
            const button = document.createElement("button");
            button.textContent = "新增指令";
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
