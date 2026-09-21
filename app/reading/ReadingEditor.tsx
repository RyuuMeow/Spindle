"use client";
import { useEditorContext, captureCodeMirror } from "../mcp/editor-context";
import { useCodeMirrorAppearance } from "../appearance/codemirror";
import { appearanceVariables } from "../appearance/context";
import type { YarnVariable } from "../variable-completion";
import { commandEditing } from "./command-input";
import { sceneLinks } from "./scene-links";

import { useEffect, useRef } from "react";
import {
  Annotation,
  RangeSet,
  EditorState,
  StateField,
  StateEffect,
  Compartment,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutterLineClass,
  keymap,
  drawSelection,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, openSearchPanel } from "@codemirror/search";
import {
  foldGutter,
  foldKeymap,
  foldService,
  foldEffect,
  unfoldEffect,
  unfoldAll,
  foldedRanges,
  codeFolding,
} from "@codemirror/language";

import { difference, normalized, sourceOffset } from "../workspace/engine";
import type { TextEdit, DocumentRecord } from "../workspace/types";
import type { Command } from "../parser";

import {
  readingStructure,
  readableText,
  readingSceneRanges,
  restoreReadingFolds,
  type ReadingFold,
} from "./structure";
import { readingLayout } from "./layout";
import { readingDecorations } from "./decorations";
import { readingIcon } from "./icons";
import "./reading.css";

const remote = Annotation.define<boolean>();
const refreshDecorations = StateEffect.define<null>();
export type ReadingActions = {
  find: () => void;
  copyReadable: () => Promise<void>;
  fold: () => void;
  unfold: () => void;
  focus: () => void;
  unfoldAll: () => void;
  follow: () => void;
};
type Props = {
  doc: DocumentRecord;
  commands: Command[];
  onRegisterCommand?: (command: Command) => void;
  variables?: YarnVariable[];
  issues?: import("../parser").Issue[];
  scenes?: { name: string; file: string; start?: number }[];
  onEdit: (edits: TextEdit[]) => void;
  onUndo: (redo?: boolean) => void;
  onCursor: (line: number, column: number, scrollTop: number) => void;
  onComposition: (active: boolean) => void;
  goTo?: { file: string; line: number; column?: number; nonce: number } | null;
  line: number;
  column: number;
  scrollTop?: number;
  selection?: { anchor: number; head: number };
  onSelection?: (selection: { anchor: number; head: number }) => void;
  onNavigate?: (target: string) => void;
  onVariableNavigate?: (file: string, line: number) => void;
  canNavigate?: (target: string) => boolean;
  fontSize?: number;
  lineHeight?: number;
  readingWidth?: "standard" | "wide";
  readOnly?: boolean;
  folded?: ReadingFold[];
  onFoldedChange?: (folded: ReadingFold[]) => void;
  actionsRef: { current: ReadingActions | null };
};
export default function ReadingEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    viewRef = useRef<EditorView | null>(null),
    readOnlyConfig = useRef(new Compartment()),
    latest = useRef(props);
  useEditorContext("rendered", () => captureCodeMirror(viewRef.current, props.doc.name, props.doc.text));
  const appearanceConfig = useCodeMirrorAppearance(
    viewRef,
    "rendered",
    props.variables,
  );
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    const config = latest.current;
    let composing = false;
    let initialized = false;
    let lastFolded = JSON.stringify(config.folded || []);
    const reportFolded = (state: EditorState) => {
      if (!initialized) return;
      const ranges: ReadingFold[] = [];
      foldedRanges(state).between(0, state.doc.length, (from, to) => {
        ranges.push({ from, to });
      });
      const signature = JSON.stringify(ranges);
      if (signature !== lastFolded) {
        lastFolded = signature;
        latest.current.onFoldedChange?.(ranges);
      }
    };
    const follow = (
      view: EditorView,
      position = view.state.selection.main.head,
    ) => {
      const line = view.state.doc.lineAt(position),
        entry = readingStructure(view.state.doc.toString())[line.number - 1];
      if (
        ["jump", "detour"].includes(entry.command || "") &&
        /^[A-Za-z_]\w*$/.test(entry.argument || "")
      ) {
        latest.current.onNavigate?.(entry.argument!);
        return true;
      }
      return false;
    };
    const structure = StateField.define({
      create: (state) => readingStructure(state.doc.toString()),
      update: (value, tr) =>
        tr.docChanged ? readingStructure(tr.state.doc.toString()) : value,
    });
    const decorations = StateField.define({
      create: (state) =>
        readingDecorations(
          state,
          config.commands,
          state.field(structure),
          state.readOnly,
        ),
      update: (value, tr) =>
        composing
          ? value.map(tr.changes)
          : tr.docChanged ||
              tr.selection ||
              tr.reconfigured ||
              tr.effects.some((e) => e.is(refreshDecorations))
            ? readingDecorations(
                tr.state,
                latest.current.commands,
                tr.state.field(structure),
                tr.state.readOnly,
              )
            : value,
      provide: (field) => EditorView.decorations.from(field),
    });
    const state = EditorState.create({
      doc: normalized(config.doc.text),
      extensions: [
        sceneLinks(
          (name) => !!latest.current.canNavigate?.(name),
          (name) => latest.current.onNavigate?.(name),
          () => latest.current.variables || [],
          (file, line) => latest.current.onVariableNavigate?.(file, line),
        ),
        structure,
        decorations,
        readOnlyConfig.current.of([
          EditorState.readOnly.of(!!config.readOnly),
          EditorView.editable.of(!config.readOnly),
        ]),
        EditorView.lineWrapping,
        drawSelection(),
        placeholder("在這裡開始撰寫 Yarn 劇本"),
        gutterLineClass.compute([structure], (state) => {
          const lines = state.field(structure);
          const layout = readingLayout(lines);
          class HeadingGap extends GutterMarker {
            elementClass = "reading-fold-heading-gap";
          }
          const marker = new HeadingGap();
          return RangeSet.of(
            lines.flatMap((line, index) =>
              line.kind === "title" && layout[index].before > 0
                ? [marker.range(line.from)]
                : [],
            ),
          );
        }),
        foldGutter({
          markerDOM: (open) => {
            const marker = document.createElement("span");
            marker.className = "reading-fold-marker";
            marker.title = open ? "收合場景" : "展開場景";
            marker.setAttribute("aria-label", marker.title);
            marker.appendChild(readingIcon(open ? "expanded" : "collapsed"));
            return marker;
          },
        }),
        codeFolding({
          placeholderDOM: (_view, unfold) => {
            const marker = document.createElement("span");
            marker.className = "reading-folded";
            marker.textContent = "已收合";
            marker.title = "展開場景";
            marker.setAttribute("role", "button");
            marker.setAttribute("aria-label", "展開場景");
            marker.tabIndex = 0;
            marker.onclick = unfold;
            marker.onkeydown = (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                marker.click();
              }
            };
            return marker;
          },
        }),
        foldService.of((state, start) => {
          return (
            readingSceneRanges(state.field(structure)).find(
              (range) => range.start === start,
            ) || null
          );
        }),
        keymap.of([
          { key: "F12", run: follow },
          ...(["Backspace", "Delete"] as const).map((key) => ({
            key,
            run: (view: EditorView) => {
              const selection = view.state.selection.main;
              if (!selection.empty) return false;
              const line = view.state.doc.lineAt(selection.head),
                adjacent =
                  key === "Backspace" &&
                  selection.head === line.from &&
                  line.number > 1
                    ? line.number - 1
                    : key === "Delete" &&
                        selection.head === line.to &&
                        line.number < view.state.doc.lines
                      ? line.number + 1
                      : 0;
              if (!adjacent) return false;
              const entry = readingStructure(view.state.doc.toString())[
                adjacent - 1
              ];
              if (
                !["title", "tags", "start", "end", "condition"].includes(
                  entry.kind,
                ) ||
                !entry.valid
              )
                return false;
              view.dispatch({
                selection: {
                  anchor: key === "Backspace" ? entry.to : entry.from,
                },
                scrollIntoView: true,
              });
              return true;
            },
          })),
          {
            key: "Mod-z",
            run: (view) => {
              if (view.state.readOnly) return true;
              latest.current.onUndo();
              return true;
            },
          },
          {
            key: "Mod-Shift-z",
            run: (view) => {
              if (view.state.readOnly) return true;
              latest.current.onUndo(true);
              return true;
            },
          },
          {
            key: "Mod-y",
            run: (view) => {
              if (view.state.readOnly) return true;
              latest.current.onUndo(true);
              return true;
            },
          },
          ...defaultKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        EditorState.transactionExtender.of((tr) => {
          if (!tr.selection && !tr.docChanged) return null;
          const effects: ReturnType<typeof unfoldEffect.of>[] = [];
          const valid = new Set(
            readingSceneRanges(tr.state.field(structure)).map(
              (range) => `${range.from}:${range.to}`,
            ),
          );
          foldedRanges(tr.state).between(0, tr.state.doc.length, (from, to) => {
            if (
              !valid.has(`${from}:${to}`) ||
              tr.selection?.ranges.some((r) =>
                r.empty
                  ? r.from > from && r.from < to
                  : r.from < to && r.to > from,
              )
            )
              effects.push(unfoldEffect.of({ from, to }));
          });
          return effects.length ? { effects } : null;
        }),
        commandEditing(
          () => latest.current.commands,
          () => latest.current.scenes || [],
          () => [],
          () => latest.current.variables || [],
          (command) => latest.current.onRegisterCommand?.(command),
          (line) =>
            (latest.current.issues || [])
              .filter(
                (i) =>
                  i.file === latest.current.doc.name &&
                  i.line === line &&
                  i.severity === "error",
              )
              .map((i) => i.message),
        ),
        EditorView.updateListener.of((update) => {
          reportFolded(update.state);
          if (
            update.docChanged &&
            !update.transactions.every((t) => t.annotation(remote))
          ) {
            const edits: TextEdit[] = [];
            update.changes.iterChanges((from, to, _a, _b, insert) =>
              edits.push({ from, to, insert: insert.toString() }),
            );
            latest.current.onEdit(edits);
          }
          if (update.selectionSet || update.docChanged) {
            const { anchor, head } = update.state.selection.main;
            latest.current.onSelection?.({ anchor, head });
            const position = update.state.selection.main.head,
              line = update.state.doc.lineAt(position);
            latest.current.onCursor(
              line.number,
              position - line.from + 1,
              update.view.scrollDOM.scrollTop,
            );
          }
        }),
        EditorView.domEventHandlers({
          compositionstart: () => {
            composing = true;
            latest.current.onComposition(true);
          },
          compositionend: () => {
            latest.current.onComposition(false);
            setTimeout(() => {
              const view = viewRef.current;
              if (!view || view.composing) return;
              composing = false;
              const next = normalized(latest.current.doc.text);
              if (view.state.doc.toString() !== next)
                view.dispatch({
                  changes: difference(view.state.doc.toString(), next),
                  annotations: remote.of(true),
                });
              view.dispatch({ effects: refreshDecorations.of(null) });
            }, 30);
          },
          scroll: (_event, view) => {
            const pos = view.state.selection.main.head,
              line = view.state.doc.lineAt(pos);
            latest.current.onCursor(
              line.number,
              pos - line.from + 1,
              view.scrollDOM.scrollTop,
            );
          },
          copy: (event, view) => {
            const selection = view.state.selection.main;
            if (selection.empty) return false;
            const source = latest.current.doc.text;
            event.clipboardData?.setData(
              "text/plain",
              source.slice(
                sourceOffset(source, selection.from),
                sourceOffset(source, selection.to),
              ),
            );
            event.preventDefault();
            return true;
          },
        }),
        appearanceConfig.extension,
        EditorView.theme(
          {
            "&": {
              height: "100%",
              backgroundColor: "#1c1c1c",
              color: "#d4d4d4",
            },
            ".cm-scroller": {
              fontFamily: '"Segoe UI","Microsoft JhengHei",sans-serif',
            },
            ".cm-content": { padding: "0", caretColor: "#ddd" },
            ".cm-gutters": {
              background: "#1c1c1c",
              border: "0",
              color: "#888",
            },
            ".cm-cursor": { borderLeftColor: "#ddd" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              background: "#3a4654",
            },
            ".cm-panels": { background: "#282828", color: "#ddd" },
            ".cm-tooltip": {
              background: "#282828",
              border: "1px solid #3b3b3b",
              color: "#ddd",
            },
          },
          { dark: true },
        ),
      ],
    });
    const view = new EditorView({ state, parent: host.current! });
    viewRef.current = view;
    const line = view.state.doc.line(
      Math.min(config.line || 1, view.state.doc.lines),
    );
    view.dispatch({
      selection: config.selection
        ? {
            anchor: Math.min(state.doc.length, config.selection.anchor),
            head: Math.min(state.doc.length, config.selection.head),
          }
        : {
            anchor: Math.min(line.to, line.from + (config.column || 1) - 1),
          },
    });
    const restoredFolds = restoreReadingFolds(
      view.state.field(structure),
      config.folded || [],
    ).filter(
      ({ from, to }) =>
        !view.state.selection.ranges.some((range) =>
          range.empty
            ? range.from > from && range.from < to
            : range.from < to && range.to > from,
        ),
    );
    if (restoredFolds.length)
      view.dispatch({
        effects: restoredFolds.map((range) => foldEffect.of(range)),
      });
    initialized = true;
    reportFolded(view.state);
    view.scrollDOM.scrollTop = config.scrollTop || 0;
    const sceneRanges = () => readingSceneRanges(view.state.field(structure));
    const currentScene = () =>
      sceneRanges().find(
        (r) =>
          r.start <= view.state.selection.main.head &&
          r.to >= view.state.selection.main.head,
      );
    config.actionsRef.current = {
      follow: () => {
        follow(view);
      },
      find: () => openSearchPanel(view),
      copyReadable: async () => {
        const s = view.state.selection.main;
        await navigator.clipboard.writeText(
          readableText(
            s.empty
              ? view.state.doc.toString()
              : view.state.sliceDoc(s.from, s.to),
          ),
        );
      },
      fold: () => {
        const range = currentScene();
        if (range)
          view.dispatch({
            effects: foldEffect.of(range),
            selection: { anchor: range.from },
          });
      },
      unfold: () => {
        const range = currentScene();
        if (range) view.dispatch({ effects: unfoldEffect.of(range) });
      },
      focus: () => {
        const current = currentScene();
        if (!current) return;
        unfoldAll(view);
        view.dispatch({
          effects: sceneRanges()
            .filter((r) => r.start !== current.start)
            .map((r) => foldEffect.of(r)),
        });
      },
      unfoldAll: () => {
        unfoldAll(view);
      },
    };
    return () => {
      view.destroy();
      viewRef.current = null;
      config.actionsRef.current = null;
    };
    // Appearance reconfigures its own compartment; it must not recreate the document view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.doc.id, props.actionsRef]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.composing) return;
    const next = normalized(props.doc.text),
      before = view.state.doc.toString();
    if (before !== next)
      view.dispatch({
        changes: difference(before, next),
        annotations: remote.of(true),
      });
  }, [props.doc.text]);
  useEffect(() => {
    const view = viewRef.current,
      target = props.goTo;
    if (!view || !target || target.file !== props.doc.name) return;
    const line = view.state.doc.line(
      Math.max(1, Math.min(target.line, view.state.doc.lines)),
    );
    const anchor = Math.min(
      line.to,
      line.from + Math.max(0, (target.column || 1) - 1),
    );
    const effects: ReturnType<typeof unfoldEffect.of>[] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      if (anchor >= from && anchor <= to)
        effects.push(unfoldEffect.of({ from, to }));
    });
    view.dispatch({
      selection: { anchor },
      effects: [...effects, EditorView.scrollIntoView(anchor, { y: "center" })],
    });
    view.focus();
  }, [props.goTo, props.doc.id, props.doc.name]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyConfig.current.reconfigure([
        EditorState.readOnly.of(!!props.readOnly),
        EditorView.editable.of(!props.readOnly),
      ]),
    });
  }, [props.readOnly]);
  useEffect(() => {
    const view = viewRef.current;
    if (view && !view.composing)
      view.dispatch({ effects: refreshDecorations.of(null) });
  }, [props.commands, props.issues, props.variables]);
  return (
    <div
      ref={host}
      className="reading-editor"
      style={
        {
          ...appearanceVariables(appearanceConfig.style),
          "--reading-width":
            appearanceConfig.appearance.widths.rendered === "wide"
              ? "900px"
              : "760px",
        } as React.CSSProperties
      }
      aria-label="即時渲染編輯器"
      onContextMenu={(event) => {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("yarn-editor-menu", {
            detail: { x: event.clientX, y: event.clientY, reading: true },
          }),
        );
      }}
    />
  );
}
