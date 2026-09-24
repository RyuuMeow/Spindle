import { readingStructure } from "../reading/structure.ts";

export type DialogueLengthPreference = { enabled: boolean; limit: number };
export const DEFAULT_DIALOGUE_LENGTH: DialogueLengthPreference = {
  enabled: true,
  limit: 80,
};
export const DIALOGUE_LENGTH_CODE = "diagnostic.dialogueLength";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Source estimate, not a prediction of rendered width or evaluated expressions. */
export function weightedDialogueLength(text: string) {
  let total = 0;
  for (const { segment } of graphemes.segment(text)) {
    total +=
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\p{Regional_Indicator}\u1100-\u115f\u2329\u232a\u3000-\u303f\uff01-\uff60\uffe0-\uffe6\ufe0f\u20e3]/u.test(
        segment,
      )
        ? 1
        : 0.5;
  }
  return total;
}

/** Omit syntax and unevaluated dynamic spans; never invent a replacement value. */
export function staticDialogueText(text: string) {
  let result = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === "\\" && i + 1 < text.length) {
      result += text[i + 1];
      i += 2;
      continue;
    }
    if (text.startsWith("//", i)) break;
    if (text[i] === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      const tag = /^#[\w:]+/.exec(text.slice(i));
      if (tag) {
        i += tag[0].length;
        continue;
      }
    }
    const delimiter = text.startsWith("<<", i)
      ? ">>"
      : text[i] === "{"
        ? "}"
        : null;
    if (delimiter) {
      let j = i + (delimiter === ">>" ? 2 : 1),
        quote = "";
      for (; j < text.length; j++) {
        if (text[j] === "\\") {
          j++;
          continue;
        }
        if (quote) {
          if (text[j] === quote) quote = "";
          continue;
        }
        if (text[j] === '"' || text[j] === "'") {
          quote = text[j];
          continue;
        }
        if (text.startsWith(delimiter, j)) break;
      }
      // Incomplete dynamic syntax cannot safely be measured as visible prose.
      i = Math.min(text.length, j + delimiter.length);
      continue;
    }
    if (text[i] === "[") {
      const markup =
        /^\[\/?(?:b|i|u|s|color|size|character|nomarkup)(?:\s+[^\]\r\n]*|=[^\]\r\n]*)?\]/.exec(
          text.slice(i),
        );
      if (markup) {
        i += markup[0].length;
        continue;
      }
    }
    result += text[i++];
  }
  return result.trimEnd();
}

export function dialogueLengthFindings(
  text: string,
  preference = DEFAULT_DIALOGUE_LENGTH,
) {
  if (!preference.enabled) return [];
  const limit =
    Number.isFinite(preference.limit) && preference.limit > 0
      ? preference.limit
      : DEFAULT_DIALOGUE_LENGTH.limit;
  return readingStructure(text).flatMap((line) => {
    if (line.kind !== "dialogue") return [];
    const leading = /^[ \t]*/.exec(line.text)![0].length;
    const speaker = /^[ \t]*[^:<>]+:\s*/.exec(line.text);
    const from = speaker?.[0].length ?? leading;
    const to = line.text.trimEnd().length;
    const length = weightedDialogueLength(
      staticDialogueText(line.text.slice(from, to)),
    );
    return length > limit
      ? [
          {
            line: line.line,
            column: from + 1,
            endColumn: to + 1,
            length,
            limit,
          },
        ]
      : [];
  });
}
