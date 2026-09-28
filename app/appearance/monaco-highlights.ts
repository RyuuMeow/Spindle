import type { editor } from "monaco-editor";
import type { Typography } from "./model";
import { highlightRanges } from "./highlights";
export function sourceHighlights(
  editor: editor.IStandaloneCodeEditor,
  style: () => Typography,
  declarations: () => string[] = () => [],
) {
  const decorations = editor.createDecorationsCollection();
  const root = editor.getDomNode();
  if (!root) return { dispose() {}, refresh() {} };
  const sheet = document.createElement("style");
  root.appendChild(sheet);
  const scope = `[data-highlight-editor="${editor.getId()}"]`;
  root.setAttribute("data-highlight-editor", editor.getId());
  let previousModel: editor.ITextModel | null = null;
  let previousInputs = "";
  let previousCss = "";
  const refresh = () => {
    const model = editor.getModel(),
      selection = editor.getSelection();
    const s = style();
    const css = `${scope} .spindle-selection-match { background-color: ${s.matches}; } ${scope} .spindle-symbol-match { ${s.symbolStyle === "background" ? `background-color: ${s.symbols}` : `box-shadow: inset 0 -1px ${s.symbols}`}; }`;
    if (css !== previousCss) {
      sheet.textContent = css;
      previousCss = css;
    }
    if (!model || !selection) {
      previousModel = null;
      previousInputs = "";
      decorations.clear();
      return;
    }
    const find = root.querySelector(".find-widget");
    const searching =
      !!find?.classList.contains("visible") &&
      !!find.querySelector<HTMLInputElement>(
        ".find-part input, .find-part textarea",
      )?.value;
    const names = declarations();
    const count = editor.getSelections()?.length;
    const from = model.getOffsetAt(selection.getStartPosition());
    const to = model.getOffsetAt(selection.getEndPosition());
    // View persistence and Find DOM updates can request refresh without changing
    // semantic inputs. Do not rescan the document or replace decorations on scroll.
    const inputs = JSON.stringify([
      model.getVersionId(),
      from,
      to,
      count,
      searching,
      s.highlightMatches,
      s.highlightSymbols,
      names,
    ]);
    if (model === previousModel && inputs === previousInputs) return;
    previousModel = model;
    previousInputs = inputs;
    const ranges =
      count === 1
        ? highlightRanges(model.getValue(), from, to, searching, s, names)
        : [];
    decorations.set(
      ranges.map((r) => {
        const start = model.getPositionAt(r.from),
          end = model.getPositionAt(r.to);
        return {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          options: {
            inlineClassName:
              r.kind === "match"
                ? "spindle-selection-match"
                : "spindle-symbol-match",
          },
        };
      }),
    );
  };
  // Observe only Find visibility/creation, not decoration changes produced by this handler.
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          r.target instanceof Element &&
          (r.target.closest(".find-widget") ||
            Array.from(r.addedNodes).some(
              (n) =>
                n instanceof Element &&
                (n.matches(".find-widget") || n.querySelector(".find-widget")),
            )),
      )
    )
      refresh();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  root.addEventListener("input", refresh);
  const listeners = [
    editor.onDidChangeCursorSelection(refresh),
    editor.onDidChangeModelContent(refresh),
    editor.onDidChangeModel(refresh),
  ];
  refresh();
  return {
    refresh,
    dispose() {
      observer.disconnect();
      root.removeEventListener("input", refresh);
      listeners.forEach((l) => l.dispose());
      decorations.clear();
      sheet.remove();
    },
  };
}
