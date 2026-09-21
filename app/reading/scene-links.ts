import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { readingVariableAt } from "./variable-reference";
import { type YarnVariable } from "../variable-completion";
import { sceneLink } from "../scene-link";
/** Same source-range hit test drives both link feedback and navigation. */
export function sceneLinks(
  canFollow: (name: string) => boolean,
  follow: (name: string) => void,
  variables: () => YarnVariable[] = () => [],
  followVariable?: (file: string, line: number) => void,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      point: { x: number; y: number } | null = null;
      modifier = false;
      destroyed = false;
      badge: HTMLElement | null = null;
      active: { from: number; to: number } | null = null;
      constructor(readonly view: EditorView) {
        window.addEventListener("keydown", this.key, true);
        window.addEventListener("keyup", this.key, true);
        window.addEventListener("blur", this.blur);
      }
      hit() {
        if (!this.point) return null;
        const pos = this.view.posAtCoords(this.point, false);
        if (pos === null) return null;
        const line = this.view.state.doc.lineAt(pos);
        const variable = readingVariableAt(this.view, pos, variables());
        if (variable && followVariable)
          return {
            from: line.from + variable.from,
            to: line.from + variable.to,
            follow: () =>
              followVariable(variable.variable.file, variable.variable.line),
          };
        const link = sceneLink(line.text);
        return link &&
          pos >= line.from + link.from &&
          pos < line.from + link.to &&
          canFollow(link.name)
          ? {
              ...link,
              from: line.from + link.from,
              to: line.from + link.to,
              follow: () => follow(link.name),
            }
          : null;
      }
      refresh = () => {
        const next = this.modifier ? this.hit() : null;
        this.badge?.classList.remove("spindle-source-link");
        this.badge = next
          ? this.view.dom.querySelector<HTMLElement>(".reading-variable:hover")
          : null;
        this.badge?.classList.add("spindle-source-link");
        if (next?.from === this.active?.from && next?.to === this.active?.to)
          return;
        this.active = next;
        this.view.dispatch({});
      };
      key = (event: KeyboardEvent) => {
        const next = event.ctrlKey || event.metaKey;
        if (next === this.modifier) return;
        this.modifier = next;
        this.refresh();
      };
      blur = () => {
        this.modifier = false;
        this.point = null;
        this.refresh();
      };
      update(update: ViewUpdate) {
        if (update.docChanged) this.active = null;
        if (update.geometryChanged || update.viewportChanged) {
          this.view.requestMeasure({
            key: this,
            read: () => (this.modifier ? this.hit() : null),
            write: () => {
              // CodeMirror runs measure writes inside its update. Dispatch only
              // after that phase, and hit-test again against the final layout.
              queueMicrotask(() => {
                if (!this.destroyed) this.refresh();
              });
            },
          });
        }
        const link = this.active;
        this.decorations = link
          ? Decoration.set([
              Decoration.mark({ class: "spindle-source-link" }).range(
                link.from,
                link.to,
              ),
            ])
          : Decoration.none;
      }
      destroy() {
        this.destroyed = true;
        this.badge?.classList.remove("spindle-source-link");
        window.removeEventListener("keydown", this.key, true);
        window.removeEventListener("keyup", this.key, true);
        window.removeEventListener("blur", this.blur);
      }
    },
    {
      decorations: (value) => value.decorations,
      eventHandlers: {
        mousemove(event) {
          this.point = { x: event.clientX, y: event.clientY };
          this.modifier = event.ctrlKey || event.metaKey;
          this.refresh();
        },
        mouseleave() {
          this.point = null;
          this.refresh();
        },
        mousedown(event) {
          if (event.button !== 0 || !(event.ctrlKey || event.metaKey))
            return false;
          this.point = { x: event.clientX, y: event.clientY };
          const link = this.hit();
          if (!link) return false;
          event.preventDefault();
          link.follow();
          return true;
        },
      },
    },
  );
}
