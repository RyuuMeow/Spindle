"use client";
import { sceneLink } from "./scene-link";
import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { Command, Doc, Issue, Node } from "./parser";
import { builtins } from "./parser";
import {
  commandCall,
  commandMarkdown,
  commandHover,
  commandLabel,
  parameterLabel,
  parameterHelp,
  commandInput,
} from "./command-hints";
import { yarnEditorTheme } from "./editor-theme";
import { loadEditorLocale } from "./editor-locale";
loader.config({ paths: { vs: "/monaco/vs" } });
export default function CodeEditor({
  doc,
  commands,
  nodes,
  issues,
  onChange,
  onCursor,
  editorRef,
  goTo,
  lineNumbers,
  viewKey,
  viewStates,
  modelEpoch,
  monacoRef,
  onUndo,
  onComposition,
  persistedView,
  onView,
  onNavigate,
}: {
  monacoRef: any;
  modelEpoch: number;
  viewKey: string;
  viewStates: any;
  doc: Doc;
  commands: Command[];
  nodes: Node[];
  issues: Issue[];
  onChange: (
    s: string,
    event: import("monaco-editor").editor.IModelContentChangedEvent,
  ) => void;
  onCursor: (p: any) => void;
  editorRef: any;
  goTo: { file: string; line: number; column?: number; nonce: number } | null;
  lineNumbers: boolean;
  onUndo?: (redo?: boolean) => void;
  onComposition?: (active: boolean) => void;
  persistedView?: import("monaco-editor").editor.ICodeEditorViewState;
  onView?: (view: import("monaco-editor").editor.ICodeEditorViewState) => void;
  onNavigate?: (file: string, line: number) => void;
}) {
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
  cursorCallback.current = onCursor;
  const undoCallback = useRef(onUndo);
  undoCallback.current = onUndo;
  const compositionCallback = useRef(onComposition);
  compositionCallback.current = onComposition;
  const api = useRef<any>(null),
    providers = useRef<any[]>([]),
    latest = useRef({ commands, nodes });
  latest.current = { commands, nodes };
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
  const markers = () => {
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
  };
  useEffect(markers, [issues, doc.name]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
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
  }, [goTo, doc.name]);
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
        if (!m.languages.getLanguages().some((l: any) => l.id === "yarn"))
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
        m.editor.defineTheme("yarn-dark", yarnEditorTheme);
        providers.current.forEach((p) => p.dispose());
        providers.current = [
          m.languages.registerCompletionItemProvider("yarn", {
            triggerCharacters: ["<", " ", "$"],
            provideCompletionItems(model: any, pos: any) {
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
                  ...latest.current.commands.map((c) => ({
                    label: c.name,
                    kind: 1,
                    insertText: c.name,
                    detail: c.params
                      .map(
                        (p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`,
                      )
                      .join(", "),
                    documentation: c.description,
                    range,
                  })),
                  ...builtins.map((name) => ({
                    label: name,
                    kind: 14,
                    insertText: name,
                    detail: "Yarn 內建語法",
                    range,
                  })),
                ],
              };
            },
          }),
          m.languages.registerHoverProvider("yarn", {
            provideHover(model: any, pos: any) {
              const hint = commandHover(
                model.getLineContent(pos.lineNumber),
                pos.column - 1,
                latest.current.commands,
              );
              return hint
                ? {
                    range: new m.Range(
                      pos.lineNumber,
                      hint.from + 1,
                      pos.lineNumber,
                      hint.to + 1,
                    ),
                    contents: [
                      {
                        value: commandMarkdown(
                          hint.command,
                          hint.parameterIndex,
                        ),
                      },
                    ],
                  }
                : null;
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
                    tooltip: { value: commandMarkdown(call.command, index) },
                  });
                });
              }
              return { hints, dispose() {} };
            },
          }),
          m.languages.registerSignatureHelpProvider("yarn", {
            signatureHelpTriggerCharacters: [" "],
            signatureHelpRetriggerCharacters: [" "],
            provideSignatureHelp(model: any, pos: any) {
              const line = model
                .getLineContent(pos.lineNumber)
                .slice(0, pos.column - 1);
              const input = commandInput(line);
              if (input?.kind !== "argument") return null;
              const c = latest.current.commands.find(
                (c) => c.name === input.name,
              );
              if (!c || !c.params[input.index]) return null;
              return {
                value: {
                  signatures: [
                    {
                      label:
                        commandLabel(c) +
                        " " +
                        c.params
                          .map(
                            (p) =>
                              parameterLabel(p) +
                              ": " +
                              p.type +
                              (p.required ? "" : "?"),
                          )
                          .join(" "),
                      documentation: c.description,
                      parameters: c.params.map((p, index) => ({
                        label:
                          parameterLabel(p) +
                          ": " +
                          p.type +
                          (p.required ? "" : "?"),
                        documentation: parameterHelp(p, index),
                      })),
                    },
                  ],
                  activeSignature: 0,
                  activeParameter: input.index,
                },
                dispose() {},
              };
            },
          }),
        ];
      }}
      onMount={(editor, m) => {
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
        editor.onDidCompositionStart(() => compositionCallback.current?.(true));
        editor.onDidCompositionEnd(() => compositionCallback.current?.(false));
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
        editor.focus();
      }}
      options={{
        editContext: false,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: 16,
        lineHeight: 29,
        padding: { top: 16, bottom: 40 },
        minimap: { enabled: false },
        lineNumbers: lineNumbers ? "on" : "off",
        lineDecorationsWidth: 16,
        lineNumbersMinChars: 3,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
        guides: { indentation: false, bracketPairs: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        renderLineHighlight: "none",
        smoothScrolling: true,
        bracketPairColorization: { enabled: false },
        glyphMargin: false,
        folding: false,
        quickSuggestions: true,
        wordWrap: "on",
        wrappingIndent: "same",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
