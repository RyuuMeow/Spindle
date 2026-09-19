import type { DocumentRecord } from "./types";
export type SearchScope = "files" | "content";
export type SearchHit = {
  documentId: string;
  file: string;
  line: number;
  column: number;
  text: string;
  scene?: string;
  kind?: "file" | "content";
};

/** Source positions stay in Yarn lines; snippets are only presentation. */
export function projectSearch(
  documents: DocumentRecord[],
  query: string,
  scope: SearchScope,
  limit = 150,
) {
  const needle = query.trim().toLocaleLowerCase();
  const hits: SearchHit[] = [];
  let total = 0;
  for (const doc of documents) {
    if (scope === "files" || !needle) {
      if (!needle || doc.name.toLocaleLowerCase().includes(needle)) {
        total++;
        if (hits.length < limit)
          hits.push({
            documentId: doc.id,
            file: doc.name,
            line: 1,
            column: 1,
            text: doc.name,
            kind: "file",
          });
      }
      continue;
    }
    let scene = "";
    const lines = doc.text.split(/\r\n|\n|\r/);
    for (let index = 0; index < lines.length; index++) {
      const text = lines[index];
      const title = text.match(/^\uFEFF?title:\s*(.*)/);
      if (title) scene = title[1].trim();
      const column = text.toLocaleLowerCase().indexOf(needle);
      if (column < 0) continue;
      total++;
      if (hits.length < limit)
        hits.push({
          documentId: doc.id,
          file: doc.name,
          line: index + 1,
          column: column + 1,
          text,
          scene,
          kind: "content",
        });
    }
  }
  return { hits, total };
}
