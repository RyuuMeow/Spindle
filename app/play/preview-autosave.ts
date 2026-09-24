import {
  previewSchema,
  type PreviewConfig,
  type PreviewResources,
} from "./types";

const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Merge independent fields; deletion versus modification is a conflict. */
export function mergePreview(
  base: PreviewConfig,
  local: PreviewConfig,
  remote: PreviewConfig,
) {
  const conflicts: string[] = [];
  function merge(b: unknown, l: unknown, r: unknown, key: string): unknown {
    if (equal(l, b)) return r;
    if (equal(r, b) || equal(l, r)) return l;
    if (
      (key === "characters" || key === "bindings") &&
      Array.isArray(b) &&
      Array.isArray(l) &&
      Array.isArray(r)
    ) {
      const identity = key === "characters" ? "name" : "command";
      const rows = (v: Record<string, unknown>[]) =>
        new Map(v.map((row) => [String(row[identity]), row]));
      const bm = rows(b),
        lm = rows(l),
        rm = rows(r);
      return [...new Set([...rm.keys(), ...lm.keys()])]
        .map((id) => merge(bm.get(id), lm.get(id), rm.get(id), `${key}.${id}`))
        .filter((v) => v !== undefined);
    }
    if (object(b) && object(l) && object(r)) {
      return Object.fromEntries(
        [...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
          .map((k) => [
            k,
            k === "revision" && !key
              ? r[k]
              : merge(b[k], l[k], r[k], key ? `${key}.${k}` : k),
          ])
          .filter(([, v]) => v !== undefined),
      );
    }
    conflicts.push(key);
    return l;
  }
  return { value: merge(base, local, remote, "") as PreviewConfig, conflicts };
}

export type PreviewSaveState = {
  resources: PreviewResources | null;
  draft: PreviewConfig | null;
  error: string;
  busy: boolean;
  dirty: boolean;
};
type Bridge = {
  resources(): Promise<PreviewResources>;
  save(config: PreviewConfig): Promise<PreviewResources>;
};

export class PreviewAutosave {
  state: PreviewSaveState = {
    resources: null,
    draft: null,
    error: "",
    busy: false,
    dirty: false,
  };
  private base: PreviewConfig | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<boolean>;
  private composing = false;
  private disposed = false;
  private loadGeneration = 0;
  constructor(
    private bridge: Bridge,
    private changed: (state: PreviewSaveState) => void,
  ) {}
  private publish(patch: Partial<PreviewSaveState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  async load() {
    const generation = ++this.loadGeneration;
    try {
      const resources = await this.bridge.resources();
      if (this.disposed || generation !== this.loadGeneration) return;
      this.base = resources.config;
      this.publish({
        resources,
        draft: structuredClone(resources.config),
        dirty: false,
        error: "",
      });
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async refresh() {
    if (this.state.dirty || this.state.busy || this.disposed) return;
    const generation = ++this.loadGeneration;
    try {
      const resources = await this.bridge.resources();
      if (
        this.disposed ||
        this.state.dirty ||
        this.state.busy ||
        generation !== this.loadGeneration
      )
        return;
      this.base = resources.config;
      this.publish({
        resources,
        draft: structuredClone(resources.config),
        error: "",
      });
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  update(change: (config: PreviewConfig) => void) {
    if (this.disposed || !this.state.draft) return;
    const draft = structuredClone(this.state.draft);
    change(draft);
    this.publish({ draft, dirty: !equal(draft, this.base), error: "" });
    this.schedule();
  }
  addImage(id: string, data: string) {
    if (this.state.resources)
      this.publish({
        resources: {
          ...this.state.resources,
          images: { ...this.state.resources.images, [id]: data },
        },
      });
  }
  composition(active: boolean) {
    this.composing = active;
    clearTimeout(this.timer);
    if (!active) this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.composing && !this.disposed && this.state.dirty)
      this.timer = setTimeout(() => {
        void this.flush();
      }, 400);
  }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.composing) return Promise.resolve(false);
    if (this.flight) return this.flight;
    this.flight = this.commit().finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  private async commit() {
    if (!this.state.dirty) return true;
    this.publish({ busy: true, error: "" });
    try {
      let retries = 0;
      while (this.state.dirty && !this.disposed) {
        if (this.composing || !this.base || !this.state.draft) return false;
        previewSchema.parse(this.state.draft);
        const remote = await this.bridge.resources();
        if (this.disposed || this.composing) return false;
        const submitted = structuredClone(this.state.draft!);
        const merged = mergePreview(this.base, submitted, remote.config);
        if (merged.conflicts.length)
          throw Error(`PREVIEW_FIELD_CONFLICT: ${merged.conflicts.join(", ")}`);
        let result: PreviewResources;
        try {
          result = await this.bridge.save(previewSchema.parse(merged.value));
        } catch (error) {
          // Only a known non-applied revision conflict may be retried automatically.
          if (
            String(error).includes("PREVIEW_VERSION_CONFLICT") &&
            retries++ < 2
          )
            continue;
          throw error;
        }
        retries = 0;
        if (this.disposed) return false;
        // A response acknowledges only the submitted generation. Preserve newer typing.
        const pending = mergePreview(
          submitted,
          this.state.draft!,
          result.config,
        );
        this.base = result.config;
        this.publish({
          resources: result,
          draft: pending.value,
          dirty: !equal(pending.value, result.config),
        });
        if (pending.conflicts.length)
          throw Error(
            `PREVIEW_FIELD_CONFLICT: ${pending.conflicts.join(", ")}`,
          );
      }
      return !this.disposed;
    } catch (error) {
      this.publish({ error: String(error) });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }
  async reload() {
    clearTimeout(this.timer);
    if (this.flight) await this.flight;
    await this.load();
  }
  dispose() {
    this.disposed = true;
    ++this.loadGeneration;
    clearTimeout(this.timer);
  }
}

const pending = new Map<PreviewAutosave, string>();
export function registerPreviewDraft(controller: PreviewAutosave, key: string) {
  pending.set(controller, key);
  return () => {
    pending.delete(controller);
  };
}
export async function flushPreviewDrafts(key?: string) {
  for (const [controller, project] of pending)
    if ((!key || project === key) && !(await controller.flush())) return false;
  return true;
}
export function hasPendingPreviewDrafts(key?: string) {
  return [...pending].some(
    ([controller, project]) =>
      (!key || project === key) && controller.state.dirty,
  );
}
