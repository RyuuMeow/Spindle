"use client";
import {
  quietDiagnostic,
  diagnosticCursor,
} from "../diagnostics/use-diagnostics";
import { copyText } from "@/app/clipboard";
import { useEditorContext, captureCodeMirror } from "../mcp/editor-context";
import { useCodeMirrorAppearance } from "../appearance/codemirror";
import { appearanceVariables } from "../appearance/context";
import { collectVariables } from "../variable-completion";
import { commandEditing } from "../reading/command-input";
import { sceneLinks } from "../reading/scene-links";

import { useEffect, useRef, useState } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { completionStatus, closeCompletion } from "@codemirror/autocomplete";
import { Check, Copy, FileText, Minimize2, AlertTriangle } from "lucide-react";
import { type Command, type Node } from "../parser";
import type { DocumentRecord, TextEdit } from "../workspace/types";
import { difference } from "../workspace/engine";
import { readingStructure } from "../reading/structure";
import { readingDecorations } from "../reading/decorations";
import {
  mapSceneScope,
  sceneEdits,
  sceneScope,
  sceneText,
  type SceneScope,
} from "./scene-scope";
import {
  loadSceneDraft,
  saveSceneDraft,
  removeSceneDraft,
} from "./pending-draft";
import "../reading/reading.css";

const remote = Annotation.define<boolean>();
const refresh = StateEffect.define<null>();
const editable = new Compartment();
export type SceneEditorBindings = {
  documents: DocumentRecord[];
  commands: Command[];
  onRegisterCommand?: (command: Command) => void;
  onDocumentEdit: (
    documentId: string,
    edits: TextEdit[],
    expectedText: string,
  ) => boolean;
  onDocumentSave?: (documentId: string) => void;
  onDocumentUndo: (documentId: string, redo?: boolean) => void;
  onDocumentComposition: (documentId: string, active: boolean) => void;
  onRenameScene?: (
    node: Node,
    name: string,
    expectedText: string,
  ) => Promise<boolean>;
};
type Props = SceneEditorBindings & {
  issues?: import("../parser").Issue[];
  doc: DocumentRecord;
  node: Node;
  onClose: (scope: SceneScope) => void;
  closeRequest?: number;
  canNavigate?: (name: string) => boolean;
  onNavigate?: (name: string) => void;
  onVariableNavigate?: (file: string, line: number) => void;
};
function bodyStructure(text: string) {
  return readingStructure("---\n" + text + "\n===")
    .slice(1, -1)
    .map((line) => ({
      ...line,
      from: line.from - 4,
      to: line.to - 4,
      line: line.line - 1,
    }))
    .filter((line) => line.from <= text.length);
}
export default function SceneEditor(props: Props) {
  const latest = useRef(props),
    host = useRef<HTMLDivElement>(null),
    viewRef = useRef<EditorView | null>(null);
  const appearanceConfig = useCodeMirrorAppearance(
    viewRef,
    "graph",
    collectVariables(props.documents),
  );
  latest.current = props;
  const [recovered] = useState(() =>
    loadSceneDraft(props.doc.id, props.node.name),
  );
  const recoveredMessage = recovered
    ? "已找回上次未提交的節點內容。正式劇本沒有被覆蓋，請複製需要的內容。"
    : "";
  const source = useRef(recovered?.source || props.doc.text),
    scope = useRef(recovered?.scope || sceneScope(props.doc.text, props.node));
  const blockedRef = useRef(recoveredMessage),
    composing = useRef(false);
  useEditorContext("graph-editor", () =>
    captureCodeMirror(
      viewRef.current,
      props.doc.name,
      source.current,
      scope.current,
      !!blockedRef.current || composing.current || closeGuard.current,
    ),
  );
  const [problem, setProblem] = useState(recoveredMessage),
    [title, setTitle] = useState<string | null>(null),
    [renaming, setRenaming] = useState(false),
    [renameError, setRenameError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const titleComposing = useRef(false);
  const draftName = useRef(props.node.name);
  const block = (message: string) => {
    draftName.current =
      source.current
        .slice(scope.current.sceneFrom, scope.current.from)
        .match(/^\uFEFF?\s*title\s*:\s*([^\r\n]*)/)?.[1]
        ?.trim() || draftName.current;
    try {
      saveSceneDraft(latest.current.doc.id, draftName.current, {
        source: source.current,
        scope: scope.current,
        text: viewRef.current?.state.doc.toString() || "",
        at: Date.now(),
      });
    } catch {
      message += " 本機草稿無法寫入，請在離開前複製內容。";
    }
    blockedRef.current = message;
    setProblem(message);
    viewRef.current?.dispatch({
      effects: editable.reconfigure([
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
      ]),
    });
  };
  const closeGuard = useRef(false);
  closeGuard.current = title !== null || renaming || titleComposing.current;
  const lastCloseRequest = useRef(props.closeRequest);
  useEffect(() => {
    if (props.closeRequest === lastCloseRequest.current) return;
    lastCloseRequest.current = props.closeRequest;
    close();
  }, [props.closeRequest]);
  function close() {
    if (
      composing.current ||
      titleComposing.current ||
      closeGuard.current ||
      blockedRef.current
    )
      return;
    latest.current.onClose(scope.current);
  }
  function reconcile() {
    const view = viewRef.current,
      next = latest.current.doc.text;
    if (
      !view ||
      composing.current ||
      blockedRef.current ||
      next === source.current
    )
      return;
    const mapped = mapSceneScope(source.current, next, scope.current);
    if (!mapped) {
      block(
        "場景邊界已被其他修改改變。已保留目前內容，請先複製後重新開啟場景。",
      );
      return;
    }
    source.current = next;
    scope.current = mapped;
    const value = sceneText(next, mapped);
    if (value !== view.state.doc.toString())
      view.dispatch({
        changes: difference(view.state.doc.toString(), value),
        annotations: remote.of(true),
      });
  }
  useEffect(() => {
    const decorations = StateField.define({
      create: (state) =>
        readingDecorations(
          state,
          latest.current.commands,
          bodyStructure(state.doc.toString()),
        ),
      update: (value, tr) =>
        composing.current
          ? value.map(tr.changes)
          : tr.docChanged ||
              tr.selection ||
              tr.effects.some((e) => e.is(refresh))
            ? readingDecorations(
                tr.state,
                latest.current.commands,
                bodyStructure(tr.state.doc.toString()),
              )
            : value,
      provide: (field) => EditorView.decorations.from(field),
    });
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: recovered?.text ?? sceneText(source.current, scope.current),
        extensions: [
          sceneLinks(
            (name) =>
              !composing.current &&
              !closeGuard.current &&
              !blockedRef.current &&
              !!latest.current.canNavigate?.(name),
            (name) => latest.current.onNavigate?.(name),
            () =>
              composing.current || closeGuard.current || blockedRef.current
                ? []
                : collectVariables(latest.current.documents),
            (file, line) => latest.current.onVariableNavigate?.(file, line),
          ),
          decorations,
          editable.of([
            EditorView.editable.of(!recovered),
            EditorState.readOnly.of(!!recovered),
          ]),
          EditorView.lineWrapping,
          drawSelection(),
          placeholder("輸入台詞、角色或命令…"),
          EditorView.contentAttributes.of({
            "aria-label": "場景內容",
            role: "textbox",
            "aria-multiline": "true",
          }),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                latest.current.onDocumentSave?.(latest.current.doc.id);
                return true;
              },
            },
            {
              key: "Mod-z",
              run: () => {
                if (!blockedRef.current)
                  latest.current.onDocumentUndo(latest.current.doc.id);
                return true;
              },
              shift: () => {
                if (!blockedRef.current)
                  latest.current.onDocumentUndo(latest.current.doc.id, true);
                return true;
              },
            },
            {
              key: "Mod-Shift-z",
              run: () => {
                latest.current.onDocumentUndo(latest.current.doc.id, true);
                return true;
              },
            },
            {
              key: "Mod-y",
              run: () => {
                latest.current.onDocumentUndo(latest.current.doc.id, true);
                return true;
              },
            },
            {
              key: "Escape",
              run: (view) => {
                if (view.composing || composing.current) return false;
                if (completionStatus(view.state)) return closeCompletion(view);
                close();
                return true;
              },
            },
            ...defaultKeymap,
            indentWithTab,
          ]),
          commandEditing(
            () => latest.current.commands,
            () =>
              latest.current.documents.flatMap((d) =>
                [...d.text.matchAll(/^title:\s*(\w+)/gm)].map((m) => ({
                  name: m[1],
                  file: d.name,
                  start: d.text.slice(0, m.index).split("\n").length,
                })),
              ),
            () => [
              ...new Set(
                latest.current.doc.text
                  .split(/\r?\n/)
                  .map((line) => line.match(/^\s*([^<>:\n]+):\s/)?.[1])
                  .filter(
                    (value): value is string =>
                      !!value && !["title", "tags"].includes(value),
                  ),
              ),
            ],
            () => collectVariables(latest.current.documents),
            (command) => latest.current.onRegisterCommand?.(command),
            (line) => {
              const offset =
                source.current.slice(0, scope.current.from).split("\n").length -
                1;
              return (latest.current.issues || [])
                .filter(
                  (i) =>
                    i.file === latest.current.doc.name &&
                    i.line === line + offset &&
                    i.severity === "error",
                )
                .map((i) => i.message);
            },
            (line) =>
              quietDiagnostic(
                latest.current.doc.name,
                line +
                  source.current.slice(0, scope.current.from).split("\n")
                    .length -
                  1,
              ),
            (line) =>
              diagnosticCursor(
                latest.current.doc.name,
                line +
                  source.current.slice(0, scope.current.from).split("\n")
                    .length -
                  1,
              ),
          ),
          EditorView.updateListener.of((update) => {
            if (
              !update.docChanged ||
              update.transactions.every((tr) => tr.annotation(remote))
            )
              return;
            const edits: TextEdit[] = [];
            update.changes.iterChanges((from, to, _a, _b, insert) =>
              edits.push({ from, to, insert: insert.toString() }),
            );
            try {
              const change = sceneEdits(source.current, scope.current, edits);
              if (
                !latest.current.onDocumentEdit(
                  latest.current.doc.id,
                  change.changes,
                  source.current,
                )
              ) {
                queueMicrotask(() =>
                  block(
                    "文件已同步到新版本，此次輸入尚未提交。文字保留在此，請複製後重新開啟場景。",
                  ),
                );
                return;
              }
              source.current = change.next;
              scope.current = change.scope;
            } catch (error) {
              queueMicrotask(() =>
                block(
                  error instanceof Error
                    ? error.message
                    : "修改無法提交，內容仍保留在此。",
                ),
              );
            }
          }),
          EditorView.domEventHandlers({
            compositionstart: () => {
              composing.current = true;
              latest.current.onDocumentComposition(latest.current.doc.id, true);
            },
            compositionend: () => {
              setTimeout(() => {
                if (!viewRef.current || viewRef.current.composing) return;
                composing.current = false;
                latest.current.onDocumentComposition(
                  latest.current.doc.id,
                  false,
                );
                reconcile();
                viewRef.current.dispatch({ effects: refresh.of(null) });
              }, 30);
            },
            copy: (event, view) => {
              const selection = view.state.selection.main;
              if (selection.empty) return false;
              const raw = source.current.slice(
                  scope.current.from,
                  scope.current.to,
                ),
                eol = raw.includes("\r\n") ? "\r\n" : "\n";
              event.clipboardData?.setData(
                "text/plain",
                view.state
                  .sliceDoc(selection.from, selection.to)
                  .replace(/\n/g, eol),
              );
              event.preventDefault();
              return true;
            },
          }),
          appearanceConfig.extension,
          EditorView.theme(
            {
              "&": {
                height: "auto",
                backgroundColor: "transparent",
                color: "#d4d4d4",
              },
              ".cm-scroller": {
                fontFamily: '"Segoe UI","Microsoft JhengHei",sans-serif',
              },
              ".cm-content": { caretColor: "#ddd" },
              ".cm-cursor": { borderLeftColor: "#ddd" },
              ".cm-selectionBackground": {
                backgroundColor: "#344956 !important",
              },
              ".cm-tooltip": {
                background: "#292929",
                border: "1px solid #555",
              },
            },
            { dark: true },
          ),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    return () => {
      if (composing.current)
        latest.current.onDocumentComposition(latest.current.doc.id, false);
      view.destroy();
      viewRef.current = null;
    };
    // The scene session owns this editor; source updates are reconciled without remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reconcile();
  });
  useEffect(() => {
    const view = viewRef.current;
    if (view && !view.composing) view.dispatch({});
  }, [props.issues, props.documents]);
  const titleEditing = title !== null;
  useEffect(() => {
    if (titleEditing) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [titleEditing]);
  const header = props.doc.text.slice(
    scope.current.sceneFrom,
    scope.current.from,
  );
  const name =
    header.match(/^\uFEFF?\s*title\s*:\s*([^\r\n]*)/)?.[1]?.trim() ||
    props.node.name;
  async function rename() {
    if (title === null || renaming || titleComposing.current) return;
    if (title.trim() === name) {
      setTitle(null);
      return;
    }
    if (!props.onRenameScene) return;
    setRenaming(true);
    setRenameError("");
    const line = source.current
      .slice(0, scope.current.sceneFrom)
      .split("\n").length;
    try {
      const ok = await props.onRenameScene(
        { ...props.node, name, file: props.doc.name, start: line },
        title.trim(),
        source.current,
      );
      if (ok) setTitle(null);
      else setRenameError("更名未完成，請檢查名稱或同步狀態。");
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "更名失敗");
    } finally {
      setRenaming(false);
    }
  }
  return (
    <section
      className="flow-scene-editor nodrag nopan nowheel"
      aria-label={`編輯場景 ${name}`}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (!event.nativeEvent.isComposing && !titleComposing.current)
            props.onDocumentSave?.(props.doc.id);
        }
      }}
    >
      <header className="flow-scene-editor-header">
        {title === null ? (
          <button
            className="flow-scene-title"
            title="更名場景並更新引用"
            disabled={!props.onRenameScene || !!problem}
            onClick={() => setTitle(name)}
          >
            {name}
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <input
              ref={titleRef}
              aria-label="場景名稱"
              value={title}
              disabled={renaming}
              onChange={(event) => setTitle(event.target.value)}
              onCompositionStart={() => {
                titleComposing.current = true;
              }}
              onCompositionEnd={() => {
                titleComposing.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  titleComposing.current ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                ) {
                  if (event.key === "Enter") event.preventDefault();
                  return;
                }
                if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  setTitle(null);
                  setRenameError("");
                }
              }}
            />
            <button type="submit" aria-label="確認更名" disabled={renaming}>
              <Check size={16} />
            </button>
          </form>
        )}
        <button
          className="flow-scene-close"
          aria-label="結束節點編輯"
          title={problem ? "請先處理未提交內容" : "結束編輯（Esc）"}
          disabled={!!problem}
          onClick={close}
        >
          <Minimize2 size={16} />
        </button>
      </header>
      <div className="flow-scene-location">
        <FileText size={13} />
        <span title={props.doc.name}>{props.doc.name}</span>
        <span className={`flow-scene-save is-${props.doc.status}`}>
          {props.doc.status === "saved"
            ? "已儲存"
            : props.doc.status === "draft"
              ? "草稿已保留"
              : props.doc.status === "saving"
                ? "儲存中"
                : props.doc.status === "pending"
                  ? "待儲存"
                  : props.doc.error || "需要處理儲存問題"}
        </span>
      </div>
      {renameError && (
        <p className="flow-scene-problem" role="alert">
          {renameError}
        </p>
      )}
      <div
        ref={host}
        className="reading-editor graph-scene-editor"
        style={appearanceVariables(appearanceConfig.style)}
      />
      {problem && (
        <div className="flow-scene-problem" role="alert">
          <AlertTriangle size={16} />
          <span>{problem}</span>
          <button
            onClick={() => {
              void copyText(viewRef.current?.state.doc.toString() || "").catch(
                () => setProblem(problem + " 複製失敗，仍可選取文字後複製。"),
              );
            }}
          >
            <Copy size={14} />
            複製內容
          </button>
          <button
            onClick={() => {
              try {
                removeSceneDraft(latest.current.doc.id, draftName.current);
              } catch {
                setProblem("無法移除復原草稿，請稍後重試。");
                return;
              }
              latest.current.onClose(scope.current);
            }}
          >
            捨棄未提交內容並結束
          </button>
        </div>
      )}
    </section>
  );
}
