import type { ReadingLine } from "./structure";

export type ReadingLayout = {
  before: number;
  after: number;
  classes: string[];
};

/** Visual grouping is derived from source structure, never written to the document. */
export function readingLayout(lines: readonly ReadingLine[]): ReadingLayout[] {
  const layout = lines.map(() => ({
    before: 0,
    after: 0,
    classes: [] as string[],
  }));
  const content = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.kind !== "blank");
  for (let position = 0; position < content.length; position++) {
    const { line, index } = content[position];
    const previous = content[position - 1];
    const next = content[position + 1];
    const current = layout[index];
    if (!line.valid) continue;
    const prior = previous?.line;
    const separated = !!previous && index - previous.index > 1;
    const startsBranch =
      line.kind === "condition" &&
      ["if", "once", "else", "elseif"].includes(line.command || "");
    const closesBranch =
      line.kind === "condition" &&
      ["endif", "endonce"].includes(line.command || "");
    const priorBranchHeader =
      prior?.kind === "condition" &&
      ["if", "once", "else", "elseif"].includes(prior.command || "");
    const priorBranchEnd =
      prior?.kind === "condition" &&
      ["endif", "endonce"].includes(prior.command || "");

    if (line.kind === "title") {
      if (prior && prior.kind !== "end") current.before = 24;
    } else if (line.kind === "tags") {
      current.before = 6;
    } else if (line.kind === "start") {
      current.classes.push("reading-header-end");
      current.after = 24;
    } else if (line.kind === "end") {
      current.classes.push("reading-scene-boundary");
      current.before = current.after = 24;
    } else if (startsBranch) {
      current.before = 16;
      if (prior && prior.kind !== "start" && !priorBranchHeader) {
        layout[previous!.index].after = Math.max(
          layout[previous!.index].after,
          16,
        );
      }
    } else if (closesBranch) {
      if (previous && prior?.kind !== "start")
        layout[previous.index].after = Math.max(
          layout[previous.index].after,
          16,
        );
      if (line.depth > 1) current.classes.push("reading-region-nested-end");
    } else if (priorBranchHeader) {
      current.before = 8;
      current.classes.push("reading-branch-body-start");
    } else if (priorBranchEnd) {
      current.before = 20;
      current.classes.push("reading-after-region");
    } else if (line.kind === "option") {
      current.before = line.optionGroupStart ? 16 : 12;
      if (line.optionGroupStart && previous && prior?.kind !== "start") {
        layout[previous.index].after = Math.max(
          layout[previous.index].after,
          16,
        );
      }
    } else if (line.optionEnd) {
      current.before = 16;
      if (previous)
        layout[previous.index].after = Math.max(
          layout[previous.index].after,
          16,
        );
    } else if (prior?.kind === "option") {
      current.before = 4;
      current.classes.push("reading-option-body-start");
    } else if (
      prior &&
      prior.kind !== "start" &&
      prior.kind !== "title" &&
      prior.kind !== "tags"
    ) {
      if (separated || line.kind !== prior.kind) current.before = 12;
    }
    // Blanks supply the outer gap, while borders retain their inner content inset.
    if (separated) {
      if (!startsBranch && !line.optionGroupStart && !line.optionEnd)
        current.before = 0;
      layout[previous.index].after = 0;
    }
    if (
      next?.line.kind === "condition" &&
      ["else", "elseif", "endif", "endonce"].includes(next.line.command || "")
    ) {
      current.classes.push("reading-branch-body-end");
    }
  }
  return layout;
}
