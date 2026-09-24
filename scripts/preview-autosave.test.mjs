import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const outfile = path.resolve("outputs/tests/preview-autosave.cjs");
buildSync({
  entryPoints: ["app/play/preview-autosave.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const {
  PreviewAutosave,
  mergePreview,
  registerPreviewDraft,
  flushPreviewDrafts,
} = require(outfile);
const config = () => ({
  version: 1,
  revision: 0,
  characters: [
    {
      name: "Mira",
      displayName: "Mira",
      color: "#112233",
      portraits: {},
      sprites: {},
    },
  ],
  backgrounds: {},
  bindings: [],
});
const resources = (value) => ({
  config: structuredClone(value),
  images: {},
  speakers: [],
  commands: [],
  commandDefinitions: [],
});
function harness() {
  let saved = config(),
    calls = 0;
  const bridge = {
    resources: async () => resources(saved),
    save: async (value) => {
      if (value.revision !== saved.revision)
        throw Error("PREVIEW_VERSION_CONFLICT");
      calls++;
      saved = { ...structuredClone(value), revision: value.revision + 1 };
      return resources(saved);
    },
  };
  const controller = new PreviewAutosave(bridge, () => {});
  return {
    controller,
    bridge,
    get saved() {
      return saved;
    },
    set saved(v) {
      saved = v;
    },
    get calls() {
      return calls;
    },
  };
}
test("independent character fields and command definitions merge", () => {
  const base = config(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.characters[0].displayName = "New";
  remote.characters[0].color = "#ffffff";
  remote.revision = 1;
  remote.bindings.push({
    command: "portrait",
    effect: "show",
    assetArgument: 1,
    characterArgument: 0,
    position: "left",
    fade: true,
  });
  const result = mergePreview(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.value.characters[0].displayName, "New");
  assert.equal(result.value.characters[0].color, "#ffffff");
  assert.equal(result.value.bindings.length, 1);
  assert.equal(result.value.revision, 1);
});
test("same field and delete-versus-edit conflicts preserve local content", () => {
  const base = config(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.characters[0].displayName = "Mine";
  remote.characters[0].displayName = "Other";
  assert.deepEqual(mergePreview(base, local, remote).conflicts, [
    "characters.Mira.displayName",
  ]);
  remote.characters = [];
  assert.deepEqual(mergePreview(base, local, remote).conflicts, [
    "characters.Mira",
  ]);
});
test("400ms autosave coalesces input and does not save merely loading", async () => {
  const h = harness();
  await h.controller.load();
  assert.equal(h.calls, 0);
  h.controller.update((c) => (c.characters[0].displayName = "A"));
  h.controller.update((c) => (c.characters[0].displayName = "AB"));
  await new Promise((r) => setTimeout(r, 460));
  assert.equal(h.calls, 1);
  assert.equal(h.saved.characters[0].displayName, "AB");
  h.controller.dispose();
});
test("typing during an in-flight response remains and is saved in the next generation", async () => {
  const h = harness();
  await h.controller.load();
  let release;
  const original = h.bridge.save;
  let first = true;
  h.bridge.save = async (c) => {
    if (first) {
      first = false;
      await new Promise((r) => (release = r));
    }
    return original(c);
  };
  h.controller.update((c) => (c.characters[0].displayName = "First"));
  const flight = h.controller.flush();
  await new Promise((r) => setImmediate(r));
  h.controller.update((c) => (c.characters[0].displayName = "Second"));
  release();
  assert.equal(await flight, true);
  assert.equal(h.saved.characters[0].displayName, "Second");
  assert.equal(h.controller.state.dirty, false);
  h.controller.dispose();
});
test("IME and invalid values block leave without writing; corrected values save", async () => {
  const h = harness();
  await h.controller.load();
  const off = registerPreviewDraft(h.controller, "p");
  h.controller.composition(true);
  h.controller.update((c) => (c.characters[0].displayName = "中"));
  assert.equal(await flushPreviewDrafts("p"), false);
  assert.equal(h.calls, 0);
  h.controller.composition(false);
  h.controller.update((c) => (c.characters[0].color = "bad"));
  assert.equal(await h.controller.flush(), false);
  assert.equal(h.calls, 0);
  h.controller.update((c) => (c.characters[0].color = "#334455"));
  assert.equal(await flushPreviewDrafts("p"), true);
  off();
  h.controller.dispose();
});
test("external conflict and disk failure leave draft available for retry or explicit reload", async () => {
  const h = harness();
  await h.controller.load();
  h.controller.update((c) => (c.characters[0].displayName = "Mine"));
  h.saved = { ...config(), revision: 1 };
  h.saved.characters[0].displayName = "Other";
  assert.equal(await h.controller.flush(), false);
  assert.equal(h.calls, 0);
  assert.match(h.controller.state.error, /FIELD_CONFLICT/);
  assert.equal(h.controller.state.draft.characters[0].displayName, "Mine");
  await h.controller.reload();
  assert.equal(h.controller.state.draft.characters[0].displayName, "Other");
  const original = h.bridge.save;
  h.bridge.save = async () => {
    throw Error("disk unavailable");
  };
  h.controller.update((c) => (c.characters[0].displayName = "Retry"));
  assert.equal(await h.controller.flush(), false);
  assert.equal(h.controller.state.dirty, true);
  h.bridge.save = original;
  assert.equal(await h.controller.flush(), true);
  h.controller.dispose();
});
test("clean refresh follows another window; disposal cancels pending timers", async () => {
  const h = harness();
  await h.controller.load();
  h.saved.characters[0].displayName = "Remote";
  await h.controller.refresh();
  assert.equal(h.controller.state.draft.characters[0].displayName, "Remote");
  h.controller.update((c) => (c.characters[0].displayName = "Do not save"));
  h.controller.dispose();
  await new Promise((r) => setTimeout(r, 430));
  assert.equal(h.calls, 0);
});

test("two concurrent editors merge independent changes across the read-save race", async () => {
  const h = harness();
  const second = new PreviewAutosave(h.bridge, () => {});
  await Promise.all([h.controller.load(), second.load()]);
  h.controller.update((c) => {
    c.characters[0].displayName = "Window one";
  });
  second.update((c) => {
    c.characters[0].color = "#ffffff";
  });
  assert.deepEqual(await Promise.all([h.controller.flush(), second.flush()]), [
    true,
    true,
  ]);
  assert.equal(h.saved.characters[0].displayName, "Window one");
  assert.equal(h.saved.characters[0].color, "#ffffff");
  h.controller.dispose();
  second.dispose();
});
