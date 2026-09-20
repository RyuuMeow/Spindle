import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  tooltips,
  closeHoverTooltips,
  hasHoverTooltips,
  type Tooltip,
} from "@codemirror/view";
import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionStatus,
  closeCompletion,
  startCompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import type { Command } from "../parser";
import { unregisteredCommand } from "../command-quick-fix";
import { commandCatalog } from "../command-catalog";
import {
  variableCompletionContext,
  type YarnVariable,
} from "../variable-completion";
import {
  commandInput,
  emptyParameterHint,
  parameterLabel,
  atCommandCloser,
} from "../command-hints";
import { commandPopup, completionDescription } from "../command-popup";
import { commandTooltips } from "./command-tooltips";
import { readingIcon } from "./icons";
import "../editor-assistance.css";

/** Same input contract for the continuous reader and the graph scene editor. */
export function commandEditing(
  commands: () => Command[],
  scenes: () => { name: string; file?: string }[] = () => [],
  characters: () => string[] = () => [],
  variables: () => YarnVariable[] = () => [],
  register?: (command: Command) => void,
) {
  const dismiss = StateEffect.define<boolean>();
  const focusChanged = StateEffect.define<boolean>();
  const compositionChanged = StateEffect.define<boolean>();
  const composing = StateField.define({
    create: () => false,
    update: (value, tr) =>
      tr.effects.find((e) => e.is(compositionChanged))?.value ?? value,
  });
  const focused = StateField.define({
    create: () => false,
    update: (value, tr) =>
      tr.effects.find((e) => e.is(focusChanged))?.value ?? value,
  });
  const dismissed = StateField.define({
    create: () => false,
    update(value, tr) {
      if (tr.effects.some((e) => e.is(dismiss))) return true;
      if (
        tr.docChanged ||
        (tr.selection && !tr.newSelection.eq(tr.startState.selection)) ||
        (tr.effects.some((e) => e.is(focusChanged) && e.value) &&
          !tr.startState.field(focused))
      )
        return false;
      return value;
    },
  });
  const hints = StateField.define<Tooltip | null>({
    create: () => null,
    update(value, tr) {
      if (
        !tr.state.field(focused) ||
        completionStatus(tr.state) !== null ||
        tr.state.field(composing) ||
        tr.state.field(dismissed)
      )
        return null;
      if (
        !tr.docChanged &&
        !tr.selection &&
        completionStatus(tr.startState) === completionStatus(tr.state) &&
        !tr.effects.some((e) => e.is(focusChanged) || e.is(compositionChanged))
      )
        return value;
      const selection = tr.state.selection.main;
      if (
        !selection.empty ||
        tr.state.selection.ranges.length !== 1 ||
        tr.state.readOnly ||
        tr.isUserEvent("input.type.compose")
      )
        return null;
      const line = tr.state.doc.lineAt(selection.head);
      const hint = emptyParameterHint(
        line.text,
        selection.head - line.from,
        commands(),
      );
      if (!hint) return null;
      return {
        pos: selection.head,
        above: true,
        strictSide: false,
        create: () => ({ dom: commandPopup(hint.command, hint.index, true) }),
      };
    },
    provide: (field) => showTooltip.from(field),
  });
  const source: CompletionSource = (context) => {
    if (context.view?.composing || context.state.readOnly) return null;
    const line = context.state.doc.lineAt(context.pos);
    const prefix = line.text.slice(0, context.pos - line.from);
    const variable = variableCompletionContext(prefix);
    if (variable)
      return {
        from: line.from + variable.from,
        to:
          context.pos +
          (/^\w*/.exec(line.text.slice(context.pos - line.from))?.[0].length ||
            0),
        options: variables()
          .filter((v) => !variable.assignment || !v.readOnly)
          .map((v) => ({
            label: v.name,
            type: "variable",
            detail: v.type + (v.readOnly ? " · 唯讀" : "") + " · " + v.file,
            info: v.description
              ? () => completionDescription(v.description)
              : undefined,
          })),
      };
    const input = commandInput(prefix);
    const word = context.matchBefore(/[\w$]*/)!;
    if (/^\s*<<\s*(jump|detour)\s+\w*$/.test(prefix))
      return {
        from: word.from,
        options: scenes().map((n) => ({
          label: n.name,
          detail: n.file,
          type: "scene",
        })),
      };
    if (input?.kind === "name")
      return {
        from: word.from,
        options: [
          ...commandCatalog(commands()).map((c) => ({
            label: c.name,
            type: c.builtin ? "keyword" : "function",
            detail: c.params
              .map(
                (p) =>
                  parameterLabel(p) + (p.required ? "" : "?") + ": " + p.type,
              )
              .join(", "),
            info: c.description
              ? () => completionDescription(c.description!)
              : undefined,
          })),
        ],
      };
    if (prefix.includes("<<") || (!context.explicit && word.from === word.to))
      return null;
    return {
      from: word.from,
      options: characters().map((label) => ({ label, type: "variable" })),
    };
  };
  return [
    EditorState.phrases.of({
      Find: "尋找",
      Replace: "取代",
      next: "下一個",
      previous: "上一個",
      all: "全部選取",
      "match case": "區分大小寫",
      regexp: "正規表示式",
      "by word": "全字匹配",
      replace: "取代",
      "replace all": "全部取代",
      close: "關閉",
      "Go to line": "前往行",
      go: "前往",
    }),
    indentUnit.of("    "),
    // Keep overlays out of scaled/clipped graph nodes.
    tooltips({ parent: document.body }),
    keymap.of([
      {
        key: "Alt-Enter",
        run: (view) => {
          if (!register || view.composing || view.state.readOnly) return false;
          const pos = view.state.selection.main.head,
            line = view.state.doc.lineAt(pos);
          const candidate = unregisteredCommand(
            line.text,
            pos - line.from,
            commands(),
          );
          if (!candidate) return false;
          register(candidate.command);
          view.dispatch({ effects: closeHoverTooltips });
          return true;
        },
      },
    ]),
    focused,
    composing,
    dismissed,
    hints,
    commandTooltips(
      commands,
      (state) =>
        !!state.field(hints) ||
        state.field(composing) ||
        completionStatus(state) !== null,
      register,
    ),
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        view.dispatch({ effects: focusChanged.of(true) });
      },
      blur: (_event, view) => {
        view.dispatch({
          effects: [focusChanged.of(false), closeHoverTooltips],
        });
      },
      compositionstart: (_event, view) => {
        view.dispatch({
          effects: [compositionChanged.of(true), closeHoverTooltips],
        });
        closeCompletion(view);
      },
      compositionend: (_event, view) => {
        view.dispatch({ effects: compositionChanged.of(false) });
      },
    }),
    Prec.highest(
      EditorView.inputHandler.of((view, from, to, text) => {
        if (
          view.composing ||
          view.state.readOnly ||
          from !== to ||
          view.state.selection.ranges.length !== 1
        )
          return false;
        const line = view.state.doc.lineAt(from),
          prefix = line.text.slice(0, from - line.from);
        if (text === "<" && /^\s*<$/.test(prefix)) {
          const exists = view.state.sliceDoc(from, from + 2) === ">>";
          view.dispatch({
            changes: { from, to, insert: exists ? "<" : "<>>" },
            selection: { anchor: from + 1 },
            userEvent: "input.type",
          });
          startCompletion(view);
          return true;
        }
        // Step through existing delimiters, never insert a second closing pair.
        if (
          text === ">" &&
          view.state.sliceDoc(from, from + 1) === ">" &&
          atCommandCloser(line.text, from - line.from)
        ) {
          view.dispatch({
            selection: { anchor: from + 1 },
            userEvent: "select",
          });
          closeCompletion(view);
          return true;
        }
        return false;
      }),
    ),
    Prec.highest(
      keymap.of([
        { key: "Tab", run: acceptCompletion },
        {
          key: "Escape",
          run: (view) => {
            if (view.composing) return false;
            const consumed =
              !!completionStatus(view.state) ||
              !!view.state.field(hints) ||
              hasHoverTooltips(view.state);
            closeCompletion(view);
            view.dispatch({ effects: [dismiss.of(true), closeHoverTooltips] });
            return consumed;
          },
        },
        {
          key: "Backspace",
          run: (view) => {
            const s = view.state.selection.main;
            if (
              view.composing ||
              view.state.readOnly ||
              !s.empty ||
              view.state.selection.ranges.length !== 1 ||
              view.state.sliceDoc(Math.max(0, s.head - 2), s.head + 2) !==
                "<<>>"
            )
              return false;
            view.dispatch({
              changes: { from: s.head - 2, to: s.head + 2, insert: "" },
              selection: { anchor: s.head - 2 },
              userEvent: "delete.backward",
            });
            closeCompletion(view);
            return true;
          },
        },
        ...closeBracketsKeymap,
      ]),
    ),
    EditorState.languageData.of(() => [
      { closeBrackets: { brackets: ["(", "{", '"'], before: " )}>" } },
    ]),
    closeBrackets(),
    autocompletion({
      override: [source],
      activateOnTypingDelay: 80,
      icons: false,
      tooltipClass: () => "spindle-completions",
      addToOptions: [
        {
          position: 20,
          render: (completion) => {
            const icon = readingIcon(
              completion.type === "function"
                ? "cube"
                : completion.type === "scene"
                  ? "jump"
                  : "document",
            );
            icon.classList.add("command-completion-icon");
            return icon;
          },
        },
      ],
      positionInfo: (_view, list, _option, info, space) => {
        const width = info.right - info.left,
          height = info.bottom - info.top;
        const beside = list.right + width + 8 <= space.right;
        const below = list.bottom + height + 6 <= space.bottom;
        return {
          style: beside
            ? "left:100%;top:0;margin-left:6px"
            : "left:0;top:" +
              (below ? "100%" : -(height + 6) + "px") +
              ";margin-top:" +
              (below ? 6 : 0) +
              "px;max-width:" +
              Math.min(list.right - list.left, space.right - space.left - 16) +
              "px",
        };
      },
    }),
  ];
}
