import { hoverTooltip } from "@codemirror/view";
import type { Command } from "../parser";
import { commandHover } from "../command-hints";
export const commandTooltips = (commands: () => Command[]) =>
  hoverTooltip(
    (view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const hint = commandHover(line.text, pos - line.from, commands());
      if (!hint) return null;
      return {
        pos: line.from + hint.from,
        end: line.from + hint.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "reading-command-tooltip";
          dom.textContent = hint.text;
          return { dom };
        },
      };
    },
    { hoverTime: 350 },
  );
