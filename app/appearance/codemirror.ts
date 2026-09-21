import { useEffect, useMemo, useState, type RefObject } from "react";
import { Compartment } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  ViewPlugin,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import { searchPanelOpen, getSearchQuery } from "@codemirror/search";
import { highlightRanges } from "./highlights";
import { useAppearance } from "./context";
import { fontStack, type AppearanceMode, type Typography } from "./model";
function theme(s: Typography, declarations: string[]) {
  return [
    EditorView.theme({
      "&": { backgroundColor: s.background, color: s.foreground },
      ".cm-scroller": {
        fontFamily: fontStack(s.fontFamily),
        fontSize: `${s.fontSize}px`,
        lineHeight: String(s.lineHeight),
      },
      ".cm-content": { caretColor: s.cursor },
      ".cm-cursor": { borderLeftColor: s.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: s.selection + " !important",
      },
      ".cm-symbolMatch":
        s.symbolStyle === "background"
          ? { backgroundColor: s.symbols }
          : { boxShadow: `inset 0 -1px ${s.symbols}` },
      ".cm-selectionMatch": { backgroundColor: s.matches },
      ".cm-searchMatch": { backgroundColor: s.search },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: s.searchCurrent,
      },
      ".cm-activeLine": { backgroundColor: s.activeLine },
      ".cm-panels, .cm-tooltip": {
        fontFamily: '"Segoe UI", "Microsoft JhengHei", sans-serif',
        fontSize: "13px",
        lineHeight: "1.5",
      },
    }),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }
        update(update: import("@codemirror/view").ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.transactions.length
          )
            this.decorations = this.build(update.view);
        }
        build(view: EditorView) {
          const { state } = view,
            selection = state.selection.main;
          const ranges =
            state.selection.ranges.length === 1
              ? highlightRanges(
                  state.doc.toString(),
                  selection.from,
                  selection.to,
                  searchPanelOpen(state) && !!getSearchQuery(state).search,
                  s,
                  declarations,
                )
              : [];
          return Decoration.set(
            ranges.map((r) =>
              Decoration.mark({
                class:
                  r.kind === "match" ? "cm-selectionMatch" : "cm-symbolMatch",
              }).range(r.from, r.to),
            ),
            true,
          );
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    ...(s.highlightLine ? [highlightActiveLine()] : []),
  ];
}
export function useCodeMirrorAppearance(
  ref: RefObject<EditorView | null>,
  mode: AppearanceMode,
  variables: readonly import("../variable-completion").YarnVariable[] = [],
) {
  const { style, appearance } = useAppearance(mode),
    [compartment] = useState(() => new Compartment());
  const declared = JSON.stringify(
    variables
      .filter((v) => v.declared)
      .map((v) => v.name)
      .sort(),
  );
  const extension = useMemo(
    () => theme(style, JSON.parse(declared)),
    [style, declared],
  );
  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    let disposed = false;
    const apply = () => {
      if (!disposed) {
        view.dispatch({ effects: compartment.reconfigure(extension) });
        view.requestMeasure();
      }
    };
    if (view.composing) {
      const afterComposition = () => setTimeout(apply, 0);
      view.dom.addEventListener("compositionend", afterComposition, {
        once: true,
      });
      return () => {
        disposed = true;
        view.dom.removeEventListener("compositionend", afterComposition);
      };
    }
    apply();
    return () => {
      disposed = true;
    };
  }, [extension, ref, compartment]);
  return { style, appearance, extension: compartment.of(extension) };
}
