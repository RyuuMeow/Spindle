import type { editor, IDisposable } from "monaco-editor";
import type { Command } from "./parser";
import { commandHover, commandInput, atCommandCloser } from "./command-hints";
import { commandPopup, completionDescription } from "./command-popup";
import "./editor-assistance.css";

function place(
  dom: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
  beside = false,
) {
  dom.hidden = false;
  dom.style.left = "8px";
  dom.style.top = "8px";
  const width = dom.offsetWidth,
    height = dom.offsetHeight,
    gap = 6;
  const side = beside && rect.right + gap + width <= innerWidth - 8;
  const left = side
    ? rect.right + gap
    : Math.max(8, Math.min(rect.left, innerWidth - width - 8));
  const preferred =
    beside && rect.bottom + gap + height <= innerHeight - 8
      ? rect.bottom + gap
      : rect.top - height - gap;
  const top = side
    ? rect.top
    : preferred >= 8 && preferred + height <= innerHeight - 8
      ? preferred
      : rect.bottom + gap;
  dom.style.left = left + "px";
  dom.style.top = Math.max(8, Math.min(top, innerHeight - height - 8)) + "px";
}
/** Monaco retains its editor/list; descriptions use the reader's shared DOM. */
export function sourceCommandAssistance(
  editor: editor.IStandaloneCodeEditor,
  commands: () => Command[],
  placement: typeof import("monaco-editor").editor.ContentWidgetPositionPreference,
): IDisposable {
  const host = editor.getDomNode()!;
  host.dataset.spindleAssisted = "";
  const popup = document.createElement("div"),
    info = document.createElement("div");
  popup.className = "spindle-command-popup source-command-popup";
  info.className = "spindle-command-popup source-completion-info";
  popup.hidden = info.hidden = true;
  document.body.appendChild(info);
  let composing = false,
    signature = false,
    hoverTimer: ReturnType<typeof setTimeout> | undefined,
    frame = 0,
    disposed = false;
  let position: editor.IContentWidgetPosition | null = null;
  const widget: editor.IContentWidget = {
    getId: () => "spindle.command-assistance",
    getDomNode: () => popup,
    getPosition: () => position,
    allowEditorOverflow: true,
    suppressMouseDown: true,
  };
  editor.addContentWidget(widget);
  const show = (lineNumber: number, column: number, content: HTMLElement) => {
    popup.replaceChildren(content);
    popup.hidden = false;
    position = {
      position: { lineNumber, column },
      preference: [placement.ABOVE, placement.BELOW],
    };
    editor.layoutContentWidget(widget);
  };
  const hide = () => {
    clearTimeout(hoverTimer);
    popup.hidden = true;
    signature = false;
    position = null;
    if (!disposed) editor.layoutContentWidget(widget);
  };
  const parameter = () => {
    if (disposed || composing || !editor.hasTextFocus()) {
      hide();
      return;
    }
    const pos = editor.getPosition(),
      model = editor.getModel(),
      selection = editor.getSelection();
    if (!pos || !model || !selection?.isEmpty()) {
      hide();
      return;
    }
    const input = commandInput(
      model.getLineContent(pos.lineNumber).slice(0, pos.column - 1),
    );
    const c =
      input?.kind === "argument" &&
      commands().find((c) => c.name === input.name);
    if (!c || input?.kind !== "argument" || !c.params[input.index]) {
      hide();
      return;
    }
    clearTimeout(hoverTimer);
    signature = true;
    show(pos.lineNumber, pos.column, commandPopup(c, input.index, true));
  };
  const clear = () => {
    hide();
    info.hidden = true;
  };
  // Completion selection is exposed as rendered list text. Do not depend on
  // Monaco's private SuggestController or modify its persistent detail state.
  const completion = () => {
    frame = 0;
    if (disposed) return;
    const list = host.querySelector<HTMLElement>(".suggest-widget.visible");
    const name = list?.querySelector(
      ".monaco-list-row.focused .label-name",
    )?.textContent;
    const c = commands().find((c) => c.name === name);
    if (!list || !c?.description || composing) {
      info.hidden = true;
      return;
    }
    if (info.textContent !== c.description)
      info.replaceChildren(completionDescription(c.description));
    place(info, list.getBoundingClientRect(), true);
  };
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(completion);
  });
  observer.observe(host, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-selected"],
    characterData: true,
  });
  const bindings: IDisposable[] = [
    editor.onDidChangeCursorPosition(parameter),
    editor.onDidChangeModelContent(parameter),
    editor.onDidBlurEditorText(clear),
    editor.onDidChangeModel(clear),
    editor.onDidScrollChange(clear),
    editor.onDidLayoutChange(() => {
      if (position) editor.layoutContentWidget(widget);
      completion();
    }),
    editor.onDidCompositionStart(() => {
      composing = true;
      clear();
    }),
    editor.onDidCompositionEnd(() => {
      composing = false;
      parameter();
    }),
    editor.onKeyDown((e) => {
      if (e.browserEvent.key === "Escape") clear();
      if (composing || e.browserEvent.isComposing) return;
      const p = editor.getPosition(),
        model = editor.getModel(),
        selection = editor.getSelection();
      if (
        !p ||
        !model ||
        !selection?.isEmpty() ||
        editor.getSelections()?.length !== 1
      )
        return;
      const text = model.getLineContent(p.lineNumber),
        offset = p.column - 1;
      if (e.browserEvent.key === ">" && atCommandCloser(text, offset)) {
        e.preventDefault();
        e.stopPropagation();
        editor.setPosition({ lineNumber: p.lineNumber, column: p.column + 1 });
      } else if (
        e.browserEvent.key === "Backspace" &&
        offset >= 2 &&
        text.slice(offset - 2, offset + 2) === "<<>>"
      ) {
        e.preventDefault();
        e.stopPropagation();
        editor.executeEdits("command-pair", [
          {
            range: {
              startLineNumber: p.lineNumber,
              endLineNumber: p.lineNumber,
              startColumn: p.column - 2,
              endColumn: p.column + 2,
            },
            text: "",
          },
        ]);
        editor.setPosition({ lineNumber: p.lineNumber, column: p.column - 2 });
      }
    }),
    editor.onMouseMove((e) => {
      if (e.target.element && popup.contains(e.target.element)) {
        clearTimeout(hoverTimer);
        return;
      }
      if (signature || composing) return;
      clearTimeout(hoverTimer);
      const p = e.target.position,
        model = editor.getModel();
      if (!p || !model || e.event.ctrlKey || e.event.metaKey) {
        hide();
        return;
      }
      const hint = commandHover(
        model.getLineContent(p.lineNumber),
        p.column - 1,
        commands(),
      );
      if (!hint) {
        hide();
        return;
      }
      hoverTimer = setTimeout(() => {
        if (disposed || editor.getModel() !== model) return;
        show(
          p.lineNumber,
          hint.from + 1,
          commandPopup(hint.command, hint.parameterIndex),
        );
      }, 350);
    }),
    editor.onMouseLeave(() => {
      if (!signature) {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          if (!popup.matches(":hover")) hide();
        }, 120);
      }
    }),
  ];
  popup.addEventListener("mouseenter", () => clearTimeout(hoverTimer));
  popup.addEventListener("mouseleave", () => {
    if (!signature) hide();
  });
  window.addEventListener("blur", clear);
  window.addEventListener("resize", clear);
  return {
    dispose() {
      disposed = true;
      clear();
      observer.disconnect();
      cancelAnimationFrame(frame);
      bindings.forEach((b) => b.dispose());
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      delete host.dataset.spindleAssisted;
      editor.removeContentWidget(widget);
      popup.remove();
      info.remove();
    },
  };
}
