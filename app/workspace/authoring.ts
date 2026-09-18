import { parse, type Node } from "../parser";
import type { Project, TextEdit } from "./types";
export const validSceneName = (name: string) =>
  /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
export function uniqueSceneName(p: Project, base = "NewScene") {
  const names = new Set(
    parse(p.documents, p.commands).nodes.map((n) => n.name),
  );
  let name = base,
    i = 2;
  while (names.has(name)) name = base + i++;
  return name;
}
export function lineOffset(text: string, line: number) {
  let offset = 0;
  for (let i = 1; i < line; i++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}
export function sceneRange(text: string, node: Node) {
  return {
    from: Math.max(text.startsWith('\ufeff')?1:0,lineOffset(text, node.start)),
    to: lineOffset(text, node.end + 1),
  };
}
export function renamedScene(p: Project, node: Node, name: string) {
  if (!validSceneName(name))
    throw Error("場景名稱須以英文字母起始，僅含字母、數字與底線");
  if (
    parse(p.documents, p.commands).nodes.some(
      (n) => n.name === name && n.id !== node.id,
    )
  )
    throw Error("專案已有同名場景");
  let references = 0;
  const documents = p.documents
    .map((d) => {
      const edits: TextEdit[] = [];
      if (d.name === node.file) {
        const offset = lineOffset(d.text, node.start),
          line = d.text.slice(offset).split(/\r?\n/, 1)[0],
          match = line.match(/^(\s*title\s*:\s*)(\S+)/);
        if (match)
          edits.push({
            from: offset + match[1].length,
            to: offset + match[1].length + match[2].length,
            insert: name,
          });
      }
      let offset = 0;
      for (const line of d.text.split("\n")) {
        let quote = false,
          limit = line.length;
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i] === '"' && line[i - 1] !== "\\") quote = !quote;
          if (!quote && line.slice(i, i + 2) === "//") {
            limit = i;
            break;
          }
        }
        const code=line.slice(0,limit).replace(/"(?:\\.|[^"\\])*"/g,value=>' '.repeat(value.length));
        for (const match of code.matchAll(/(<<\s*(?:jump|detour)\s+)([A-Za-z]\w*)\s*>>/g))
          if (match[2] === node.name) {
            const at =
              offset +
              match.index! +
              match[1].length;
            edits.push({ from: at, to: at + match[2].length, insert: name });
            references++;
          }
        offset += line.length + 1;
      }
      return {
        id: d.id,
        version: d.version,
        edits: edits.sort((a, b) => a.from - b.from),
      };
    })
    .filter((d) => d.edits.length);
  return { documents, references };
}
