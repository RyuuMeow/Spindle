import type { CommandInfo } from "./command-catalog";
import { commandLabel, parameterLabel } from "./command-hints";
import { readingIcon } from "./reading/icons";
/** Text-only DOM construction: project descriptions never become HTML. */
export function commandPopup(
  command: CommandInfo,
  parameterIndex = -1,
  signature = false,
) {
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
  add(heading, "strong", "", commandLabel(command));
  if (command.displayName?.trim())
    add(heading, "code", "command-tip-id", command.name);
  if (command.description && !signature)
    add(dom, "p", "command-tip-description", command.description);
  if (command.syntax) add(dom, "code", "command-tip-example", command.syntax);
  if (signature) {
    const strip = add(dom, "div", "command-tip-signature", "");
    command.params.forEach((p, index) => {
      const item = add(
        strip,
        "span",
        "command-tip-slot" + (index === parameterIndex ? " is-active" : ""),
        parameterLabel(p),
      );
      if (index === parameterIndex) item.setAttribute("aria-current", "true");
    });
  }
  const params = add(dom, "div", "command-tip-parameters", "");
  command.params.forEach((p, index) => {
    if (parameterIndex >= 0 && parameterIndex !== index) return;
    const row = add(params, "div", "command-tip-parameter", "");
    add(row, "span", "command-tip-index", String(index + 1));
    const body = add(row, "div", "command-tip-body", "");
    const label = add(body, "div", "command-tip-label", "");
    add(label, "strong", "", parameterLabel(p));
    if (p.displayName?.trim()) add(label, "code", "command-tip-id", p.name);
    add(label, "span", "command-tip-type", p.type);
    if (!p.required) add(label, "span", "command-tip-optional", "選填");
    if (p.description) add(body, "p", "command-tip-description", p.description);
    if (p.defaultValue !== undefined && p.defaultValue !== "")
      add(
        body,
        "div",
        "command-tip-default",
        "預設值：" + String(p.defaultValue),
      );
  });
  if (
    command.example &&
    command.example !== command.syntax &&
    parameterIndex < 0
  ) {
    add(dom, "div", "command-tip-caption", "範例");
    add(dom, "code", "command-tip-example", command.example);
  }

  dom.setAttribute("role", "tooltip");
  if (signature) dom.classList.add("command-parameter-popup");
  return dom;
}
export function completionDescription(text: string) {
  const dom = document.createElement("div");
  dom.className = "command-completion-description";
  dom.textContent = text;
  return dom;
}

export function variablePopup(
  variable: import("./variable-completion").YarnVariable,
) {
  const dom = document.createElement("div");
  dom.className = "reading-command-tooltip variable-tooltip";
  for (const [className, text] of [
    ["command-tip-heading", variable.name + " · " + variable.type],
    ["command-tip-example", "初始值：" + (variable.initialValue ?? "未知")],
    ["command-tip-description", variable.description],
    [
      "command-tip-caption",
      variable.file + ":" + variable.line + " · Ctrl＋點擊前往宣告",
    ],
  ]) {
    if (!text) continue;
    const row = document.createElement("div");
    row.className = className;
    row.textContent = text;
    dom.appendChild(row);
  }
  return dom;
}
