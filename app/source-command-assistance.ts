import type { editor, IDisposable } from "monaco-editor";
import { sceneAt, type SceneLocation } from "./scene-link";
import type { Command } from "./parser";
import { findCommand } from "./command-catalog";
import { variableAt } from "./variable-completion";
import type { YarnVariable } from "./variable-completion";
import {
  commandHover,
  emptyParameterHint,
  atCommandCloser,
} from "./command-hints";
import {
  commandPopup,
  completionDescription,
  variablePopup,
  scenePopup,
} from "./command-popup";
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
  variables: () => YarnVariable[] = () => [],
  hasError: (line: number) => boolean = () => false,
  scenes: () => SceneLocation[] = () => [],
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
    suggesting = false,
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
    if (
      disposed ||
      composing ||
      suggesting ||
      !editor.hasTextFocus() ||
      editor.getRawOptions().readOnly
    ) {
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
    const hint = emptyParameterHint(
      model.getLineContent(pos.lineNumber),
      pos.column - 1,
      commands(),
    );
    if (!hint || editor.getSelections()?.length !== 1) {
      hide();
      return;
    }
    clearTimeout(hoverTimer);
    signature = true;
    show(
      pos.lineNumber,
      pos.column,
      commandPopup(hint.command, hint.index, true),
    );
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
    if (!!list !== suggesting) {
      suggesting = !!list;
      parameter();
    }
    const name = list?.querySelector(
      ".monaco-list-row.focused .label-name",
    )?.textContent;
    const c = findCommand(name || "", commands());
    const description =
      c?.description || variables().find((v) => v.name === name)?.description;
    if (!list || !description || composing) {
      info.hidden = true;
      return;
    }
    if (info.textContent !== description)
      info.replaceChildren(completionDescription(description));
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
    editor.onDidChangeCursorSelection(parameter),
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
      if (e.target.position && hasError(e.target.position.lineNumber)) {
        hide();
        return;
      }
      if (signature || composing || suggesting) return;
      clearTimeout(hoverTimer);
      const p = e.target.position,
        model = editor.getModel();
      if (!p || !model || e.event.ctrlKey || e.event.metaKey) {
        hide();
        return;
      }
      const variable = variableAt(
        model.getLineContent(p.lineNumber),
        p.column - 1,
        variables(),
      );
      const scene = sceneAt(
        model.getLineContent(p.lineNumber),
        p.column - 1,
        scenes(),
      );
      const hint = commandHover(
        model.getLineContent(p.lineNumber),
        p.column - 1,
        commands(),
      );
      if (!hint && !variable && !scene) {
        hide();
        return;
      }
      hoverTimer = setTimeout(() => {
        if (
          disposed ||
          signature ||
          composing ||
          suggesting ||
          editor.getModel() !== model
        )
          return;
        show(
          p.lineNumber,
          (variable?.from ?? scene?.from ?? hint!.from) + 1,
          variable
            ? variablePopup(variable.variable)
            : scene
              ? scenePopup(scene.scene)
              : commandPopup(hint!.command, hint!.parameterIndex),
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
