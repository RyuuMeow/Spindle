import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  tooltips,
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
import { builtins, type Command } from "../parser";
import {
  commandInput,
  parameterLabel,
  atCommandCloser,
} from "../command-hints";
import { commandPopup, completionDescription } from "../command-popup";
import { readingIcon } from "./icons";
import "../editor-assistance.css";

/** Same input contract for the continuous reader and the graph scene editor. */
export function commandEditing(
  commands: () => Command[],
  scenes: () => { name: string; file?: string }[] = () => [],
  characters: () => string[] = () => [],
) {
  const dismiss = StateEffect.define<boolean>();
  const focusChanged = StateEffect.define<boolean>();
  const focused = StateField.define({
    create: () => false,
    update: (value, tr) =>
      tr.effects.find((e) => e.is(focusChanged))?.value ?? value,
  });
  const hints = StateField.define<Tooltip | null>({
    create: () => null,
    update(value, tr) {
      if (!tr.state.field(focused) || tr.effects.some((e) => e.is(dismiss)))
        return null;
      if (
        !tr.docChanged &&
        !tr.selection &&
        !tr.effects.some((e) => e.is(focusChanged))
      )
        return value;
      const selection = tr.state.selection.main;
      if (
        !selection.empty ||
        tr.state.readOnly ||
        tr.isUserEvent("input.type.compose")
      )
        return null;
      const line = tr.state.doc.lineAt(selection.head);
      const input = commandInput(
        line.text.slice(0, selection.head - line.from),
      );
      if (input?.kind !== "argument") return null;
      const command = commands().find((c) => c.name === input.name);
      if (!command?.params[input.index]) return null;
      return {
        pos: selection.head,
        above: true,
        strictSide: false,
        create: () => ({ dom: commandPopup(command, input.index, true) }),
      };
    },
    provide: (field) => showTooltip.from(field),
  });
  const source: CompletionSource = (context) => {
    if (context.view?.composing || context.state.readOnly) return null;
    const line = context.state.doc.lineAt(context.pos);
    const prefix = line.text.slice(0, context.pos - line.from);
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
          ...commands().map((c) => ({
            label: c.name,
            type: "function",
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
          ...builtins.map((label) => ({
            label,
            type: "keyword",
            detail: "Yarn 內建語法",
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
    indentUnit.of("    "),
    // Keep overlays out of scaled/clipped graph nodes.
    tooltips({ parent: document.body }),
    focused,
    hints,
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        view.dispatch({ effects: focusChanged.of(true) });
      },
      blur: (_event, view) => {
        view.dispatch({ effects: focusChanged.of(false) });
      },
      compositionstart: (_event, view) => {
        view.dispatch({ effects: dismiss.of(true) });
        closeCompletion(view);
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
              !!completionStatus(view.state) || !!view.state.field(hints);
            closeCompletion(view);
            view.dispatch({ effects: dismiss.of(true) });
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
