import { useEffect, useMemo, useState, type RefObject } from "react";
import { Compartment } from "@codemirror/state";
import { EditorView, highlightActiveLine } from "@codemirror/view";
import { highlightSelectionMatches } from "@codemirror/search";
import { useAppearance } from "./context";
import { fontStack, type AppearanceMode, type Typography } from "./model";
function theme(s: Typography) {
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
    highlightSelectionMatches(),
    ...(s.highlightLine ? [highlightActiveLine()] : []),
  ];
}
export function useCodeMirrorAppearance(
  ref: RefObject<EditorView | null>,
  mode: AppearanceMode,
) {
  const { style, appearance } = useAppearance(mode),
    [compartment] = useState(() => new Compartment());
  const extension = useMemo(() => theme(style), [style]);
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
