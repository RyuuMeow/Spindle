import type { editor } from "monaco-editor";
import { readingStructure } from "../reading/structure";
import {
  characterColor,
  colorSurface,
  speakerSpan,
} from "./character-presentation";
import type { PreviewResources } from "./types";

let sequence = 0;
/** Only decorations change; models, history and selections remain untouched. */
export function sourceCharacters(
  view: editor.IStandaloneCodeEditor,
  get: () => {
    enabled: boolean;
    background: string;
    resources: PreviewResources | null;
  },
) {
  const collection = view.createDecorationsCollection();
  const sheet = document.createElement("style");
  const prefix = `spindle-character-${++sequence}-`;
  document.head.appendChild(sheet);
  const refresh = () => {
    const model = view.getModel(),
      settings = get();
    if (!model || !settings.enabled) {
      collection.clear();
      sheet.textContent = "";
      return;
    }
    const rules: string[] = [];
    const classes = new Map<string, string>();
    const decorations: editor.IModelDeltaDecoration[] = [];
    for (const line of readingStructure(model.getValue())) {
      if (line.kind !== "dialogue") continue;
      const speaker = speakerSpan(line.text);
      if (!speaker) continue;
      const actor = settings.resources?.config.characters.find(
        (c) => c.name === speaker.name,
      );
      const color = characterColor(
        speaker.name,
        actor,
        colorSurface(settings.background),
      );
      let className = classes.get(color);
      if (!className) {
        className = prefix + classes.size;
        classes.set(color, className);
        // DOM style serialization prevents a user-controlled color becoming CSS rules.
        const style = document.createElement("span").style;
        style.color = color;
        if (style.color)
          rules.push(
            `.monaco-editor .${className}{color:${style.color} !important}`,
          );
      }
      decorations.push({
        range: {
          startLineNumber: line.line,
          endLineNumber: line.line,
          startColumn: speaker.from + 1,
          endColumn: speaker.to + 1,
        },
        options: { inlineClassName: className },
      });
    }
    sheet.textContent = rules.join("\n");
    collection.set(decorations);
  };
  const subscriptions = [
    view.onDidChangeModelContent(refresh),
    view.onDidChangeModel(refresh),
  ];
  refresh();
  return {
    refresh,
    dispose() {
      subscriptions.forEach((s) => s.dispose());
      collection.clear();
      sheet.remove();
    },
  };
}
