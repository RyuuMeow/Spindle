import { t as tr } from "../i18n/index.ts";
import { authorStatistics, readingStructure } from "../reading/structure";
export function documentStatistics(text: string) {
  const roles = new Map<string, number>();
  const scenes: { name: string; line: number; count: number }[] = [];
  for (const line of readingStructure(text.replace(/\r\n/g, "\n"))) {
    if (line.kind === "title")
      scenes.push({
        name: line.text.replace(/^\s*title\s*:\s*/, ""),
        line: line.line,
        count: 0,
      });
    if (line.kind === "dialogue") {
      if (scenes.length) scenes[scenes.length - 1].count++;
      const role =
        line.text.match(/^\s*([^:<>]+):/)?.[1] || tr("m101f6e6d6095");
      roles.set(role, (roles.get(role) || 0) + 1);
    }
  }
  return {
    stats: authorStatistics(text),
    scenes,
    roles: [...roles].sort((a, b) => b[1] - a[1]),
  };
}
