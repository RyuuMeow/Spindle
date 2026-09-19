/** Source range of a static Yarn transfer; expressions and prose are not links. */
export function sceneLink(text: string) {
  const match = /^\s*<<\s*(?:jump|detour)\s+([A-Za-z_]\w*)\s*>>/.exec(text);
  if (!match) return null;
  const from = match[0].lastIndexOf(match[1]);
  return { name: match[1], from, to: from + match[1].length };
}
