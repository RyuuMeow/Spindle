/** Source range of a static Yarn transfer; expressions and prose are not links. */
export function sceneLink(text: string) {
  const match = /^\s*<<\s*(?:jump|detour)\s+([A-Za-z_]\w*)\s*>>/.exec(text);
  if (!match) return null;
  const from = match[0].lastIndexOf(match[1]);
  return { name: match[1], from, to: from + match[1].length };
}

export type SceneLocation = { name: string; file?: string; start?: number };
export function sceneAt(text: string, offset: number, scenes: SceneLocation[]) {
  const link = sceneLink(text);
  if (!link || offset < link.from || offset >= link.to) return null;
  const matches = scenes.filter((scene) => scene.name === link.name);
  return matches.length === 1 ? { ...link, scene: matches[0] } : null;
}
