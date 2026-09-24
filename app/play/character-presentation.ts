import type { PreviewConfig } from "./types";
type Character = PreviewConfig["characters"][number];
// Paired tones retain identity against either VN paper or editor surfaces.
const palette = [
  ["#e3b98c", "#825329"],
  ["#9bc9d8", "#32677b"],
  ["#c7afe8", "#725397"],
  ["#9dccad", "#386e4c"],
  ["#e1a9b9", "#914c65"],
  ["#d2c484", "#756529"],
  ["#a8bcef", "#496298"],
  ["#dcafa0", "#875846"],
];
export function characterColor(
  name: string,
  character?: Character,
  surface: "dark" | "light" = "dark",
) {
  if (character && character.colorMode !== "auto") return character.color;
  let hash = 2166136261;
  for (const value of name.normalize("NFC"))
    hash = Math.imul(hash ^ value.codePointAt(0)!, 16777619) >>> 0;
  return palette[hash % palette.length][surface === "light" ? 1 : 0];
}
/** Source offsets, not rendered/display names. Call only on dialogue lines. */
export function speakerSpan(text: string) {
  const match = /^(\s*)([^:\n\r]+?):[\t ]*/.exec(text);
  if (!match || !match[2].trim()) return null;
  const name = match[2].trimEnd();
  return {
    name,
    from: match[1].length,
    to: match[1].length + name.length,
    bodyFrom: match[0].length,
  };
}
export function colorSurface(background: string): "dark" | "light" {
  const hex = background.replace(/^#/, "").slice(0, 6);
  if (!/^[a-f\d]{6}$/i.test(hex)) return "dark";
  const rgb = [0, 2, 4].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  );
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 145
    ? "light"
    : "dark";
}
