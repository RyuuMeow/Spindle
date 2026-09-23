import { t as tr } from "../i18n/index.ts";
import { tabOut } from "../tab-out";
import { sceneAt } from "../scene-link";
import { readingVariableAt } from "./variable-reference";
import { variableFixes } from "./variable-fixes";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  hoverTooltip,
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
import {
  commandPopup,
  completionDescription,
  variablePopup,
  scenePopup,
} from "../command-popup";
import { commandTooltips } from "./command-tooltips";
import { readingIcon } from "./icons";
import "../editor-assistance.css";

/** Same input contract for the continuous reader and the graph scene editor. */
export function commandEditing(
  commands: () => Command[],
  scenes: () => { name: string; file?: string; start?: number }[] = () => [],
  characters: () => string[] = () => [],
  variables: () => YarnVariable[] = () => [],
  register?: (command: Command) => void,
  errors: (line: number) => string[] = () => [],
  quiet: (line: number) => boolean = () => false,
  caret: (line: number) => void = () => {},
) {
  const declarations = variableFixes(variables, errors, commands, quiet);
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
            detail:
              v.type + (v.readOnly ? tr("m51f76a1414d4") : "") + " · " + v.file,
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
            apply: c.name === "declare" ? "declare $" : c.name,
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
    declarations.extension,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet && !update.docChanged && !update.view.composing)
        caret(update.state.doc.lineAt(update.state.selection.main.head).number);
    }),
    EditorState.phrases.of({
      Find: tr("md47270a2ecc5"),
      Replace: tr("md8f014b5b2bd"),
      next: tr("m6268327544de"),
      previous: tr("mf60cafb25326"),
      all: tr("mff53602b6059"),
      "match case": tr("mad64d85961ad"),
      regexp: tr("m30039975a18f"),
      "by word": tr("m9e51de68bf75"),
      replace: tr("md8f014b5b2bd"),
      "replace all": tr("m66ca1495f7df"),
      close: tr("mc7fdddf79eaa"),
      "Go to line": tr("m54a9ea29586a"),
      go: tr("mfa96079c3b2f"),
    }),
    indentUnit.of("    "),
    // Keep overlays out of scaled/clipped graph nodes.
    tooltips({ parent: document.body }),
    keymap.of([
      {
        key: "Alt-Enter",
        run: (view) => {
          if (view.composing || view.state.readOnly) return false;
          if (declarations.apply(view, view.state.selection.main.head))
            return true;
          if (!register) return false;
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
    hoverTooltip(
      (view, pos) => {
        const line = view.state.doc.lineAt(pos);
        if (
          view.composing ||
          view.state.field(hints) ||
          completionStatus(view.state) !== null ||
          errors(line.number).length
        )
          return null;
        const scene = sceneAt(line.text, pos - line.from, scenes());
        const hit = readingVariableAt(view, pos, variables());
        return hit
          ? {
              pos: line.from + hit.from,
              end: line.from + hit.to,
              above: true,
              create: () => ({ dom: variablePopup(hit.variable) }),
            }
          : scene
            ? {
                pos: line.from + scene.from,
                end: line.from + scene.to,
                above: true,
                create: () => ({ dom: scenePopup(scene.scene) }),
              }
            : null;
      },
      { hoverTime: 350, hideOnChange: true },
    ),
    commandTooltips(
      commands,
      (state) =>
        !!state.field(hints) ||
        state.field(composing) ||
        completionStatus(state) !== null,
      register,
      (state, pos, view) =>
        quiet(state.doc.lineAt(pos).number) ||
        errors(state.doc.lineAt(pos).number).length > 0 ||
        !!declarations.at(state, pos) ||
        !!readingVariableAt(view, pos, variables()) ||
        !!sceneAt(
          state.doc.lineAt(pos).text,
          pos - state.doc.lineAt(pos).from,
          scenes(),
        ),
    ),
    EditorView.domEventHandlers({
      mousemove: (event, view) => {
        if (!view.state.field(hints)) return;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (
          pos !== null &&
          (errors(view.state.doc.lineAt(pos).number).length ||
            declarations.at(view.state, pos))
        )
          view.dispatch({ effects: dismiss.of(true) });
      },
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
          key: "Tab",
          run: (view) => {
            if (
              view.composing ||
              view.state.readOnly ||
              completionStatus(view.state)
            )
              return false;
            const ranges = view.state.selection.ranges;
            if (ranges.some((range) => !range.empty)) return false;
            const targets = ranges.map((range) => {
              const line = view.state.doc.lineAt(range.head);
              const next = tabOut(line.text, range.head - line.from);
              return next === null ? null : line.from + next;
            });
            if (targets.some((target) => target === null)) return false;
            view.dispatch({
              selection: EditorSelection.create(
                targets.map((target) => EditorSelection.cursor(target!)),
                view.state.selection.mainIndex,
              ),
              scrollIntoView: true,
              userEvent: "select",
            });
            return true;
          },
        },
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
