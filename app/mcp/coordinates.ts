import { lineOffset } from "../workspace/authoring";
/** Source offsets include CRLF/BOM; editor line/column positions do not expose a BOM. */
export function offsetAt(
  source: string,
  position: { lineNumber: number; column: number },
) {
  return Math.min(
    source.length,
    lineOffset(source, position.lineNumber) +
      position.column -
      1 +
      (position.lineNumber === 1 && source.startsWith("\ufeff") ? 1 : 0),
  );
}
export function positionAt(source: string, offset: number) {
  const lineNumber = source.slice(0, offset).split("\n").length;
  const column = Math.max(
    1,
    offset -
      lineOffset(source, lineNumber) +
      1 -
      (lineNumber === 1 && source.startsWith("\ufeff") ? 1 : 0),
  );
  return { lineNumber, column };
}
