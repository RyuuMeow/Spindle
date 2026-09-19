import { hoverTooltip } from "@codemirror/view";
import type { Command } from "../parser";
import { commandHover, commandLabel, parameterLabel } from "../command-hints";
import { readingIcon } from "./icons";
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
          const add = (
            parent: HTMLElement,
            tag: string,
            className: string,
            text: string,
          ) => {
            const el = document.createElement(tag);
            el.className = className;
            el.textContent = text;
            parent.appendChild(el);
            return el;
          };
          const heading = add(dom, "div", "command-tip-heading", "");
          heading.appendChild(readingIcon("command"));
          add(heading, "strong", "", commandLabel(hint.command));
          if (hint.command.displayName?.trim())
            add(heading, "code", "command-tip-id", hint.command.name);
          if (hint.command.description)
            add(dom, "p", "command-tip-description", hint.command.description);
          const params = add(dom, "div", "command-tip-parameters", "");
          hint.command.params.forEach((p, index) => {
            if (hint.parameterIndex >= 0 && hint.parameterIndex !== index)
              return;
            const row = add(params, "div", "command-tip-parameter", "");
            add(row, "span", "command-tip-index", String(index + 1));
            const body = add(row, "div", "command-tip-body", "");
            const label = add(body, "div", "command-tip-label", "");
            add(label, "strong", "", parameterLabel(p));
            if (p.displayName?.trim())
              add(label, "code", "command-tip-id", p.name);
            add(label, "span", "command-tip-type", p.type);
            if (!p.required) add(label, "span", "command-tip-optional", "選填");
            if (p.description)
              add(body, "p", "command-tip-description", p.description);
            if (p.defaultValue !== undefined && p.defaultValue !== "")
              add(
                body,
                "div",
                "command-tip-default",
                "預設值：" + String(p.defaultValue),
              );
          });
          if (hint.command.example && hint.parameterIndex < 0) {
            add(dom, "div", "command-tip-caption", "範例");
            add(dom, "code", "command-tip-example", hint.command.example);
          }
          return { dom };
        },
      };
    },
    { hoverTime: 350 },
  );
