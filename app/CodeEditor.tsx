"use client";
import { missingDeclaration } from "./variable-quick-fix";
import { sourceHighlights } from "./appearance/monaco-highlights";
import { unregisteredCommand } from "./command-quick-fix";
import { sourceCommandAssistance } from "./source-command-assistance";
import { sceneLink } from "./scene-link";
import {
  useEffect,
  useEffectEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { editor, Position, IDisposable } from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";
import type { Command, Doc, Issue, Node } from "./parser";
import { commandCatalog } from "./command-catalog";
import {
  variableCompletionContext,
  type YarnVariable,
} from "./variable-completion";
import { commandCall, parameterLabel, commandInput } from "./command-hints";
import { appearanceTheme } from "./editor-theme";
import { useAppearance } from "./appearance/context";
import { fontStack } from "./appearance/model";
import { loadEditorLocale } from "./editor-locale";
loader.config({ paths: { vs: "/monaco/vs" } });
export default function CodeEditor({
  doc,
  commands,
  variables = [],
  nodes,
  issues,
  onChange,
  onCursor,
  editorRef,
  goTo,
  viewKey,
  viewStates,
  modelEpoch,
  monacoRef,
  onUndo,
  onComposition,
  persistedView,
  onView,
  onNavigate,
  onRegisterCommand,
}: {
  monacoRef: RefObject<unknown>;
  modelEpoch: number;
  viewKey: string;
  viewStates: RefObject<Record<string, editor.ICodeEditorViewState>>;
  doc: Doc;
  commands: Command[];
  variables?: YarnVariable[];
  nodes: Node[];
  issues: Issue[];
  onChange: (
    s: string,
    event: import("monaco-editor").editor.IModelContentChangedEvent,
  ) => void;
  onCursor: (p: Position) => void;
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>;
  goTo: { file: string; line: number; column?: number; nonce: number } | null;
  lineNumbers?: boolean;
  onUndo?: (redo?: boolean) => void;
  onComposition?: (active: boolean) => void;
  persistedView?: import("monaco-editor").editor.ICodeEditorViewState;
  onView?: (view: import("monaco-editor").editor.ICodeEditorViewState) => void;
  onRegisterCommand?: (command: Command) => void;
  onNavigate?: (file: string, line: number) => void;
}) {
  const { appearance, style } = useAppearance("source");
  const highlightStyle = useRef(style);
  const highlights = useRef<ReturnType<typeof sourceHighlights> | null>(null);
  useLayoutEffect(() => {
    highlightStyle.current = style;
    highlights.current?.refresh();
  }, [style]);
  const themeApi = useRef<typeof import("monaco-editor") | null>(null);
  useEffect(() => {
    themeApi.current?.editor.defineTheme(
      "yarn-dark",
      appearanceTheme(appearance),
    );
  }, [appearance]);

  const currentDoc = useRef(doc),
    syncingModel = useRef(false);
  useLayoutEffect(() => {
    currentDoc.current = doc;
  }, [doc]);
  const viewCallback = useRef(onView),
    navigationCallback = useRef(onNavigate),
    restoredView = useRef(persistedView);
  useEffect(() => {
    viewCallback.current = onView;
    navigationCallback.current = onNavigate;
    restoredView.current = persistedView;
  });
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    loadEditorLocale().then(() => {
      if (mounted) setLocaleReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const cursorCallback = useRef(onCursor);

  const undoCallback = useRef(onUndo);

  const compositionCallback = useRef(onComposition);
  const composing = useRef(false);

  const api = useRef<typeof import("monaco-editor") | null>(null),
    providers = useRef<IDisposable[]>([]),
    latest = useRef({ commands, nodes, variables, onRegisterCommand, issues });
  useLayoutEffect(() => {
    cursorCallback.current = onCursor;
    undoCallback.current = onUndo;
    compositionCallback.current = onComposition;
    latest.current = { commands, nodes, variables, onRegisterCommand, issues };
    highlights.current?.refresh();
  });
  const hintChanges = useRef<import("monaco-editor").Emitter<void> | null>(
    null,
  );
  useEffect(() => {
    hintChanges.current?.fire();
  }, [commands]);
  useEffect(
    () => () => {
      providers.current.forEach((p) => p.dispose());
      hintChanges.current?.dispose();
      hintChanges.current = null;
    },
    [],
  );
  const markers = useCallback(() => {
    if (!api.current) return;
    for (const m of api.current.editor.getModels()) {
      const filename = decodeURIComponent(m.uri.path.slice(1));
      api.current.editor.setModelMarkers(
        m,
        "yarn",
        issues
          .filter((i) => i.file === filename)
          .map((i) => ({
            startLineNumber: i.line,
            startColumn: i.column,
            endLineNumber: i.line,
            endColumn: Math.max(
              i.column + 2,
              m.getLineMaxColumn(Math.min(i.line, m.getLineCount())),
            ),
            message: i.message,
            severity: i.severity === "error" ? 8 : 4,
          })),
      );
    }
  }, [issues]);
  useEffect(markers, [markers, doc.name]);
  const restoreCurrentView = useEffectEvent(() => {
    const e = editorRef.current;
    if (!e) return;
    const v = viewStates.current[viewKey] || restoredView.current;
    if (v) e.restoreViewState(v);
    else {
      e.setPosition({ lineNumber: 1, column: 1 });
      e.setScrollTop(0);
    }
    if (goTo?.file === doc.name) {
      e.setPosition({ lineNumber: goTo.line, column: goTo.column || 1 });
      e.revealLineInCenter(goTo.line);
    }
    const p = e.getPosition();
    if (p) cursorCallback.current(p);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => restoreCurrentView());
    return () => cancelAnimationFrame(frame);
  }, [viewKey]);
  useEffect(() => {
    if (goTo?.file === doc.name && editorRef.current) {
      editorRef.current.setPosition({
        lineNumber: goTo.line,
        column: goTo.column || 1,
      });
      editorRef.current.revealLineInCenter(goTo.line);
      editorRef.current.focus();
    }
  }, [goTo, doc.name, editorRef]);
  if (!localeReady)
    return <div className="editor-loading">正在載入文字編輯器…</div>;
  return (
    <Editor
      path={
        "file:///" + encodeURIComponent(doc.name) + "?workspace=" + modelEpoch
      }
      language="yarn"
      theme="yarn-dark"
      value={doc.text}
      saveViewState
      keepCurrentModel
      onChange={(s, event) =>
        !syncingModel.current &&
        onChange(
          (doc.text.startsWith("\ufeff") && !s?.startsWith("\ufeff")
            ? "\ufeff"
            : "") + (s ?? ""),
          event,
        )
      }
      loading={<div className="editor-loading">正在載入文字編輯器…</div>}
      beforeMount={(m) => {
        api.current = m;
        monacoRef.current = m;
        if (
          !m.languages
            .getLanguages()
            .some((l: { id: string }) => l.id === "yarn")
        )
          m.languages.register({ id: "yarn", extensions: [".yarn"] });
        if (onUndo) {
          m.editor.registerCommand("undo", () => undoCallback.current?.());
          m.editor.registerCommand("redo", () => undoCallback.current?.(true));
        }
        m.languages.setLanguageConfiguration("yarn", {
          comments: { lineComment: "//" },
          brackets: [
            ["{", "}"],
            ["(", ")"],
            ["<<", ">>"],
          ],
          autoClosingPairs: [
            { open: "{", close: "}" },
            { open: "(", close: ")" },
            { open: '"', close: '"' },
            { open: "<<", close: ">>" },
          ],
          surroundingPairs: [
            { open: '"', close: '"' },
            { open: "{", close: "}" },
          ],
        });
        m.languages.setMonarchTokensProvider("yarn", {
          tokenizer: {
            root: [
              [/\/\/.*$/, "comment"],
              [
                /^(title)(\s*:)(.*)$/,
                ["keyword.header", "delimiter", "type.identifier"],
              ],
              [
                /^(tags|when|tracking|position)(\s*:)(.*)$/,
                ["keyword.header", "delimiter", "tag"],
              ],
              [/^\s*(---|===)\s*$/, "delimiter.node"],
              [
                /<<\s*(if|else|elseif|endif|once|endonce|declare|set|jump|detour|return|stop)\b/,
                { token: "keyword", next: "@command" },
              ],
              [/<<\s*[\w]+/, { token: "function", next: "@command" }],
              [/<< /, { token: "function", next: "@command" }],
              [/->/, "keyword.option"],
              [/\$[A-Za-z_]\w*/, "variable"],
              [/\{[^}]*\}/, "variable"],
              [/#[\w:]+/, "tag"],
              [/^[ \t]*[^:<>]+:/, "type.identifier"],
            ],
            command: [
              [/>>/, { token: "function", next: "@pop" }],
              [/"(?:\\.|[^"\\])*"/, "string"],
              [/\$[A-Za-z_]\w*/, "variable"],
              [/-?\d+(\.\d+)?/, "number"],
              [/\b(true|false)\b/, "number"],
              [/[=<>+*/-]+/, "operator"],
              [/[A-Za-z_]\w*/, "identifier"],
            ],
          },
        });
        themeApi.current = m;
        m.editor.defineTheme("yarn-dark", appearanceTheme(appearance));
        providers.current.forEach((p) => p.dispose());
        providers.current = [
          m.languages.registerCompletionItemProvider("yarn", {
            triggerCharacters: ["<", " ", "$"],
            provideCompletionItems(model: editor.ITextModel, pos: Position) {
              const word = model.getWordUntilPosition(pos),
                prefix = model
                  .getLineContent(pos.lineNumber)
                  .slice(0, pos.column - 1),
                range = {
                  startLineNumber: pos.lineNumber,
                  endLineNumber: pos.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: pos.column,
                };
              const variable = variableCompletionContext(prefix);
              if (variable)
                return {
                  suggestions: latest.current.variables
                    .filter((v) => !variable.assignment || !v.readOnly)
                    .map((v) => ({
                      label: v.name,
                      kind: m.languages.CompletionItemKind.Variable,
                      insertText: v.name,
                      detail:
                        v.type + (v.readOnly ? " · 唯讀" : "") + " · " + v.file,
                      range: {
                        ...range,
                        startColumn: variable.from + 1,
                        endColumn:
                          model.getWordAtPosition(pos)?.endColumn || pos.column,
                      },
                    })),
                };
              if (/^\s*<<\s*(jump|detour)\s+\w*$/.test(prefix))
                return {
                  suggestions: latest.current.nodes.map((n) => ({
                    label: n.name,
                    kind: 18,
                    insertText: n.name,
                    detail: n.file,
                    range,
                  })),
                };
              if (commandInput(prefix)?.kind !== "name")
                return { suggestions: [] };
              return {
                suggestions: [
                  ...commandCatalog(latest.current.commands).map((c) => ({
                    label: c.name,
                    kind: c.builtin ? 14 : 1,
                    insertText: c.name,
                    detail: c.params
                      .map(
                        (p) =>
                          `${parameterLabel(p)}${p.required ? "" : "?"}: ${p.type}`,
                      )
                      .join(", "),
                    range,
                  })),
                ],
              };
            },
          }),
          m.languages.registerInlayHintsProvider("yarn", {
            onDidChangeInlayHints: (hintChanges.current ||= new m.Emitter())
              .event,
            provideInlayHints(
              model: import("monaco-editor").editor.ITextModel,
              range: import("monaco-editor").Range,
            ) {
              const hints: import("monaco-editor").languages.InlayHint[] = [];
              for (
                let line = range.startLineNumber;
                line <= range.endLineNumber;
                line++
              ) {
                const call = commandCall(
                  model.getLineContent(line),
                  latest.current.commands,
                );
                if (
                  !call?.args ||
                  call.command.builtin ||
                  call.args.length > call.command.params.length
                )
                  continue;
                call.args.forEach((arg, index) => {
                  const parameter = call.command.params[index];
                  hints.push({
                    position: { lineNumber: line, column: arg.from + 1 },
                    label: parameterLabel(parameter) + ":",
                    kind: m.languages.InlayHintKind.Parameter,
                    paddingRight: true,
                  });
                });
              }
              return { hints, dispose() {} };
            },
          }),
        ];
      }}
      onMount={(editor, m) => {
        // Monaco React reuses retained models without applying value on mount.
        // Refresh before restoring the cursor or accepting the first keystroke.
        const syncModel = () => {
          const model = editor.getModel();
          if (
            !model ||
            model.getValue(undefined, true) === currentDoc.current.text
          )
            return;
          syncingModel.current = true;
          try {
            model.setValue(currentDoc.current.text);
          } finally {
            syncingModel.current = false;
          }
        };
        syncModel();
        highlights.current = sourceHighlights(
          editor,
          () => highlightStyle.current,
          () =>
            latest.current.variables
              .filter((v) => v.declared)
              .map((v) => v.name),
        );
        editor.onDidDispose(() => highlights.current?.dispose());
        editor.onDidChangeModel(syncModel);
        const assistance = sourceCommandAssistance(
          editor,
          () => latest.current.commands,
          m.editor.ContentWidgetPositionPreference,
          () => latest.current.variables,
          (line) =>
            latest.current.issues.some(
              (i) =>
                i.file === currentDoc.current.name &&
                i.line === line &&
                i.severity === "error",
            ),
        );
        editor.onDidDispose(() => assistance.dispose());
        const register = editor.addCommand(
          0,
          (_context, line: string, column: number, lineNumber: number) => {
            if (editor.getModel()?.getLineContent(lineNumber) !== line) return;
            const candidate = unregisteredCommand(
              line,
              column,
              latest.current.commands,
            );
            if (candidate)
              latest.current.onRegisterCommand?.(candidate.command);
          },
        );
        const addDeclaration = (lineNumber: number) => {
          const model = editor.getModel();
          if (!model || composing.current) return;
          const line = model.getLineContent(lineNumber);
          const fix = missingDeclaration(
            line,
            line.indexOf("<<") + 2,
            latest.current.variables,
          );
          if (!fix?.insert) return;
          editor.pushUndoStop();
          editor.executeEdits("declare-variable", [
            {
              range: new m.Range(lineNumber, 1, lineNumber, 1),
              text: fix.insert + model.getEOL(),
            },
          ]);
          editor.pushUndoStop();
        };
        const declareCommand = editor.addCommand(
          0,
          (_ctx, lineNumber: number, expected: string) => {
            if (editor.getModel()?.getLineContent(lineNumber) === expected)
              addDeclaration(lineNumber);
          },
        );
        const fixes = m.languages.registerCodeActionProvider("yarn", {
          providedCodeActionKinds: ["quickfix"],
          provideCodeActions(
            model: editor.ITextModel,
            range: import("monaco-editor").Range,
          ) {
            if (
              model !== editor.getModel() ||
              !latest.current.onRegisterCommand
            )
              return { actions: [], dispose() {} };
            const line = model.getLineContent(range.startLineNumber);
            const declaration = missingDeclaration(
              line,
              range.startColumn - 1,
              latest.current.variables,
            );
            if (declaration?.insert && declareCommand)
              return {
                actions: [
                  {
                    title: "新增宣告「" + declaration.name + "」",
                    kind: "quickfix",
                    isPreferred: true,
                    command: {
                      id: declareCommand,
                      title: "新增宣告",
                      arguments: [range.startLineNumber, line],
                    },
                  },
                ],
                dispose() {},
              };
            const candidate = unregisteredCommand(
              line,
              range.startColumn - 1,
              latest.current.commands,
            );
            return {
              actions:
                candidate && register
                  ? [
                      {
                        title: "新增指令「" + candidate.command.name + "」",
                        kind: "quickfix",
                        isPreferred: true,
                        command: {
                          id: register,
                          title: "新增指令",
                          arguments: [
                            line,
                            range.startColumn - 1,
                            range.startLineNumber,
                          ],
                        },
                      },
                    ]
                  : [],
              dispose() {},
            };
          },
        });
        editor.addAction({
          id: "spindle.quickFix",
          label: "快速修正",
          keybindings: [m.KeyMod.Alt | m.KeyCode.Enter],
          run: () => {
            if (composing.current) return;
            const model = editor.getModel(),
              position = editor.getPosition();
            if (
              model &&
              position &&
              missingDeclaration(
                model.getLineContent(position.lineNumber),
                position.column - 1,
                latest.current.variables,
              )?.insert
            ) {
              addDeclaration(position.lineNumber);
              return;
            }
            const candidate =
              model &&
              position &&
              unregisteredCommand(
                model.getLineContent(position.lineNumber),
                position.column - 1,
                latest.current.commands,
              );
            if (candidate && latest.current.onRegisterCommand)
              latest.current.onRegisterCommand(candidate.command);
            else return editor.getAction("editor.action.quickFix")?.run();
          },
        });
        const quickHover = m.languages.registerHoverProvider("yarn", {
          provideHover(model: editor.ITextModel, position: Position) {
            if (
              model !== editor.getModel() ||
              !register ||
              !latest.current.onRegisterCommand
            )
              return null;
            const line = model.getLineContent(position.lineNumber);
            const declaration = missingDeclaration(
              line,
              position.column - 1,
              latest.current.variables,
            );
            if (declaration?.insert && declareCommand)
              return {
                range: new m.Range(
                  position.lineNumber,
                  declaration.from + 1,
                  position.lineNumber,
                  declaration.to + 1,
                ),
                contents: [
                  {
                    value:
                      "[新增宣告](command:" +
                      declareCommand +
                      "?" +
                      encodeURIComponent(
                        JSON.stringify([position.lineNumber, line]),
                      ) +
                      ") · Alt+Enter",
                    isTrusted: { enabledCommands: [declareCommand] },
                  },
                ],
              };
            const candidate = unregisteredCommand(
              line,
              position.column - 1,
              latest.current.commands,
            );
            if (!candidate) return null;
            const args = encodeURIComponent(
              JSON.stringify([line, position.column - 1, position.lineNumber]),
            );
            return {
              range: new m.Range(
                position.lineNumber,
                candidate.from + 1,
                position.lineNumber,
                candidate.to + 1,
              ),
              contents: [
                {
                  value:
                    "[新增指令](command:" +
                    register +
                    "?" +
                    args +
                    ") · Alt+Enter",
                  isTrusted: { enabledCommands: [register] },
                },
              ],
            };
          },
        });
        editor.onDidDispose(() => {
          fixes.dispose();
          quickHover.dispose();
        });
        editorRef.current = editor;
        api.current = m;
        for (const model of m.editor.getModels()) {
          if (
            model.uri.query.startsWith("workspace=") &&
            model.uri.query !== "workspace=" + modelEpoch
          )
            model.dispose();
        }
        editor.onDidChangeCursorPosition((e) =>
          cursorCallback.current(e.position),
        );
        const preserveView = () => {
          const state = editor.saveViewState();
          if (state) viewCallback.current?.(state);
        };
        editor.onDidChangeCursorSelection(preserveView);
        editor.onDidScrollChange(preserveView);
        const linkAt = (position: import("monaco-editor").Position | null) => {
          const model = editor.getModel();
          if (!position || !model) return null;
          const link = sceneLink(model.getLineContent(position.lineNumber));
          if (
            !link ||
            position.column - 1 < link.from ||
            position.column - 1 >= link.to
          )
            return null;
          const matches = latest.current.nodes.filter(
            (n) => n.name === link.name,
          );
          return matches.length === 1
            ? { ...link, node: matches[0], line: position.lineNumber }
            : null;
        };
        const navigate = () => {
          const position = editor.getPosition(),
            model = editor.getModel();
          if (!position || !model) return;
          const link = sceneLink(model.getLineContent(position.lineNumber));
          const target =
            link && linkAt(new m.Position(position.lineNumber, link.from + 1));
          if (target)
            navigationCallback.current?.(target.node.file, target.node.body);
        };
        editor.addAction({
          id: "yarn.goToScene",
          label: "前往場景原文",
          keybindings: [m.KeyCode.F12],
          contextMenuGroupId: "navigation",
          run: navigate,
        });
        const links = editor.createDecorationsCollection();
        let point: { x: number; y: number } | null = null;
        const showLink = (modifier: boolean) => {
          const position =
            point && editor.getTargetAtClientPoint(point.x, point.y)?.position;
          const link = modifier && linkAt(position || null);
          links.set(
            link
              ? [
                  {
                    range: new m.Range(
                      link.line,
                      link.from + 1,
                      link.line,
                      link.to + 1,
                    ),
                    options: { inlineClassName: "spindle-source-link" },
                  },
                ]
              : [],
          );
        };
        const key = (event: KeyboardEvent) =>
          showLink(event.ctrlKey || event.metaKey);
        const blur = () => {
          point = null;
          links.clear();
        };
        window.addEventListener("keydown", key, true);
        window.addEventListener("keyup", key, true);
        window.addEventListener("blur", blur);
        editor.onMouseMove((event) => {
          point = { x: event.event.posx, y: event.event.posy };
          showLink(event.event.ctrlKey || event.event.metaKey);
        });
        editor.onMouseLeave(blur);
        editor.onDidChangeModel(blur);
        editor.onDidChangeModelContent(blur);
        editor.onDidScrollChange(blur);
        editor.onMouseDown((event) => {
          if (
            !event.event.leftButton ||
            !(event.event.ctrlKey || event.event.metaKey)
          )
            return;
          const link = linkAt(event.target.position);
          if (!link) return;
          event.event.preventDefault();
          links.clear();
          navigationCallback.current?.(link.node.file, link.node.body);
        });
        editor.onDidDispose(() => {
          window.removeEventListener("keydown", key, true);
          window.removeEventListener("keyup", key, true);
          window.removeEventListener("blur", blur);
        });
        editor.onDidCompositionStart(() => {
          composing.current = true;
          compositionCallback.current?.(true);
        });
        editor.onDidCompositionEnd(() => {
          composing.current = false;
          compositionCallback.current?.(false);
        });
        if (undoCallback.current) {
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyZ, () =>
            undoCallback.current?.(),
          );
          editor.addCommand(
            m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyZ,
            () => undoCallback.current?.(true),
          );
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyY, () =>
            undoCallback.current?.(true),
          );
        }
        markers();
        if (goTo?.file === doc.name) {
          editor.setPosition({
            lineNumber: goTo.line,
            column: goTo.column || 1,
          });
          editor.revealLineInCenter(goTo.line);
        }
        if (!goTo && (viewStates.current[viewKey] || restoredView.current))
          editor.restoreViewState(
            viewStates.current[viewKey] || restoredView.current,
          );
        // Monaco may finish loading after the user has opened another surface.
        const focused = document.activeElement;
        const otherInput =
          focused?.matches("input, textarea, [contenteditable=true]") &&
          !editor.getDomNode()?.contains(focused);
        if (
          !otherInput &&
          !document.querySelector(
            '[role="menu"], [role="dialog"], [role="listbox"]',
          )
        )
          editor.focus();
      }}
      options={{
        editContext: false,
        occurrencesHighlight: "off",
        selectionHighlight: false,
        fontFamily: fontStack(style.fontFamily),
        fontSize: style.fontSize,
        lineHeight: style.fontSize * style.lineHeight,
        padding: { top: 16, bottom: 40 },
        minimap: { enabled: false },
        lineNumbers: appearance.source.lineNumbers ? "on" : "off",
        lineDecorationsWidth: 16,
        lineNumbersMinChars: 3,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
        guides: {
          indentation: appearance.source.indentGuides,
          bracketPairs: false,
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: appearance.source.tabSize,
        insertSpaces: appearance.source.insertSpaces,
        renderWhitespace: appearance.source.whitespace,
        renderLineHighlight: style.highlightLine ? "line" : "none",
        smoothScrolling: true,
        bracketPairColorization: { enabled: false },
        glyphMargin: false,
        folding: false,
        quickSuggestions: true,
        wordWrap: appearance.source.wordWrap ? "on" : "off",
        wrappingIndent: "same",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
