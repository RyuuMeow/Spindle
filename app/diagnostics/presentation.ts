import type { Issue } from "../parser";
import type { Project } from "../workspace/types";

export const DIAGNOSTIC_DELAY = 800;
type Document = Project["documents"][number];
type Pending = { from: number; to: number; at: number };
const lineAt = (text: string, offset: number) =>
  text.slice(0, offset).split("\n").length;
/** Runtime presentation only. Parsing and document synchronization remain immediate. */
export class DiagnosticPresentation {
  documents = new Map<string, Document>();
  pending = new Map<string, Pending>();
  latest: Issue[] = [];
  published: Issue[] = [];
  visible: Issue[] = [];
  revision = 0;
  update(
    documents: Document[],
    issues: Issue[],
    now: number,
    focus?: { id: string; line: number },
  ) {
    let changed = false;
    for (const doc of documents) {
      const old = this.documents.get(doc.id);
      if (old && old.text !== doc.text) {
        let from = 0,
          oldEnd = old.text.length,
          newEnd = doc.text.length;
        while (
          from < oldEnd &&
          from < newEnd &&
          old.text[from] === doc.text[from]
        )
          from++;
        while (
          oldEnd > from &&
          newEnd > from &&
          old.text[oldEnd - 1] === doc.text[newEnd - 1]
        ) {
          oldEnd--;
          newEnd--;
        }
        const first = lineAt(doc.text, from),
          last = lineAt(doc.text, newEnd);
        const oldLast = lineAt(old.text, oldEnd),
          delta = last - oldLast;
        this.visible = this.visible.flatMap((issue) => {
          if (issue.file !== old.name) return [issue];
          if (issue.line >= first && issue.line <= oldLast) return [];
          return [
            {
              ...issue,
              file: doc.name,
              line: issue.line > oldLast ? issue.line + delta : issue.line,
            },
          ];
        });
        const previous = this.pending.get(doc.id);
        this.pending.set(doc.id, {
          from: Math.min(first, previous?.from ?? first),
          to: Math.max(last, previous ? previous.to + delta : last),
          at: now,
        });
        changed = true;
      }
      if (
        doc.composing &&
        !old?.composing &&
        !this.pending.has(doc.id) &&
        focus?.id === doc.id
      )
        this.pending.set(doc.id, { from: focus.line, to: focus.line, at: now });
      if (old?.composing && !doc.composing && this.pending.has(doc.id))
        this.pending.get(doc.id)!.at = now;
      this.documents.set(doc.id, { ...doc });
    }
    for (const id of this.documents.keys())
      if (!documents.some((d) => d.id === id)) {
        this.documents.delete(id);
        this.pending.delete(id);
      }
    this.latest = issues;
    if (!this.pending.size && !documents.some((d) => d.composing)) {
      this.published = issues;
      this.visible = issues;
    } else
      this.visible = this.visible.filter((i) => !this.quiet(i.file, i.line));
    if (changed) this.revision++;
  }
  quiet(file: string, line: number) {
    return [...this.documents.values()].some(
      (d) =>
        d.name === file &&
        !!this.pending.get(d.id) &&
        line >= this.pending.get(d.id)!.from &&
        line <= this.pending.get(d.id)!.to,
    );
  }
  publish(now: number, force = false) {
    for (const [id, range] of this.pending)
      if (
        !this.documents.get(id)?.composing &&
        (force || now - range.at >= DIAGNOSTIC_DELAY)
      )
        this.pending.delete(id);
    if (
      !this.pending.size &&
      ![...this.documents.values()].some((d) => d.composing)
    ) {
      this.published = this.latest;
      this.visible = this.latest;
    }
  }
  leave(id: string, line: number) {
    const range = this.pending.get(id);
    if (
      range &&
      (line < range.from || line > range.to) &&
      !this.documents.get(id)?.composing
    ) {
      this.pending.delete(id);
      this.publish(Date.now());
    }
  }
}
