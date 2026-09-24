import type { PlayEvent, PlaySource, PreviewConfig } from "./types";
import { argumentSpans } from "../command-hints";
import { speakerSpan } from "./character-presentation";

/** Tokenize the already evaluated command; never evaluate Yarn expressions here. */
export function commandArguments(text: string): string[] {
  return (argumentSpans(text) || [])
    .map((span) => text.slice(span.from, span.to))
    .map((token) => {
      if (token.startsWith('"')) {
        try {
          return JSON.parse(token) as string;
        } catch {
          return token.slice(1, -1);
        }
      }
      return token.startsWith("'") ? token.slice(1, -1) : token;
    });
}
export function dialogueText(text: string) {
  const span = speakerSpan(text);
  return {
    speaker: span?.name || "",
    text: span ? text.slice(span.bodyFrom) : text,
  };
}
export type Stage = {
  background?: string;
  backgroundFade?: boolean;
  expressions: Record<string, string>;
  exits: Record<
    string,
    { character: string; expression: string; fade: boolean; hidden: true }
  >;
  cast: Partial<
    Record<
      "left" | "center" | "right",
      { character: string; expression: string; fade: boolean }
    >
  >;
};
/** Pure replay means back never repeats side effects or retains future visual state. */
export function previewStage(
  events: PlayEvent[],
  config: PreviewConfig,
  stage: Stage = { cast: {}, expressions: {}, exits: {} },
): Stage {
  for (const event of events) {
    if (event.kind !== "command") continue;
    const [command, ...args] = commandArguments(event.text),
      binding = config.bindings.find((b) => b.command === command);
    if (!binding) continue;
    const character = args[binding.characterArgument],
      asset = args[binding.assetArgument];
    if (binding.effect === "background") {
      stage.background = config.backgrounds[asset];
      stage.backgroundFade = binding.fade;
    } else if (binding.effect === "hide") {
      for (const position of ["left", "center", "right"] as const)
        if (stage.cast[position]?.character === character) {
          if (binding.fade)
            stage.exits[position] = { ...stage.cast[position]!, hidden: true };
          delete stage.cast[position];
        }
    } else if (binding.effect === "show") {
      delete stage.exits[binding.position];
      stage.expressions[character] = asset || "default";
      if (config.characters.some((c) => c.name === character))
        stage.cast[binding.position] = {
          character,
          expression: asset || "default",
          fade: binding.fade,
        };
    } else {
      stage.expressions[character] = asset || "default";
      for (const actor of Object.values(stage.cast))
        if (actor.character === character)
          actor.expression = asset || "default";
    }
  }
  return stage;
}
/** Map only unchanged prefix/suffix. Ambiguous edited content is shown as snapshot. */
export function mapPlaySource(
  source: PlaySource,
  before: string,
  after: string,
): number | null {
  if (before === after) return source.from;
  let prefix = 0,
    suffix = 0;
  while (
    prefix < Math.min(before.length, after.length) &&
    before[prefix] === after[prefix]
  )
    prefix++;
  while (
    suffix < Math.min(before.length, after.length) - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const start = before.lastIndexOf("\n", Math.max(0, source.from - 1)) + 1;
  const end = before.indexOf("\n", source.from);
  if ((end < 0 ? before.length : end) < prefix) return source.from;
  if (start > before.length - suffix)
    return source.from + after.length - before.length;
  return null;
}
