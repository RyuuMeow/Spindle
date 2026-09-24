import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-presentation-"));
function load(entry) {
  const outfile = path.join(root, path.basename(entry) + ".cjs");
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return createRequire(import.meta.url)(outfile);
}
const { resolvePresentation, patchPresentation } = load(
  "app/workspace/presentation-preferences.ts",
);
const { ProjectCatalog } = load("desktop/project-catalog.ts");
const { WorkspaceClient } = load("app/workspace/client.ts");
test("defaults and invalid values resolve safely", () => {
  assert.deepEqual(resolvePresentation(), {
    editorCharacters: {
      showPortraits: false,
      useNameColors: true,
      sourceNameColors: false,
    },
    playPresentation: { showPortraits: true, useNameColors: true },
    dialogueLength: { enabled: true, limit: 80 },
  });
  for (const limit of [0, -1, 1001, Infinity, NaN, "80", 4.5, null])
    assert.equal(
      resolvePresentation({ dialogueLength: { limit } }).dialogueLength.limit,
      80,
    );
});
test("partial patches preserve sibling and unrelated groups and reject invalid fields", () => {
  const original = resolvePresentation();
  const first = patchPresentation(original, {
    editorCharacters: { showPortraits: true },
    dialogueLength: { limit: 120 },
  });
  const second = patchPresentation(first, {
    editorCharacters: { sourceNameColors: true },
    playPresentation: { useNameColors: false },
    dialogueLength: { limit: 0, enabled: "no" },
  });
  assert.deepEqual(second.editorCharacters, {
    showPortraits: true,
    sourceNameColors: true,
    useNameColors: true,
  });
  assert.deepEqual(second.dialogueLength, { enabled: true, limit: 120 });
  assert.deepEqual(second.playPresentation, {
    showPortraits: true,
    useNameColors: false,
  });
  assert.deepEqual(original, resolvePresentation());
});
test("ProjectCatalog persists presentation without overwriting unrelated preferences", () => {
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  const catalog = new ProjectCatalog(profile, []);
  catalog.preferences = {
    reopenLastProject: true,
    language: "zh-TW",
    ...patchPresentation(catalog.preferences, {
      dialogueLength: { enabled: false, limit: 40 },
      editorCharacters: { showPortraits: true },
    }),
  };
  catalog.persist();
  const reopened = new ProjectCatalog(profile, []);
  assert.equal(reopened.preferences.language, "zh-TW");
  assert.equal(reopened.preferences.reopenLastProject, true);
  assert.deepEqual(reopened.preferences.dialogueLength, {
    enabled: false,
    limit: 40,
  });
  assert.equal(reopened.preferences.editorCharacters.showPortraits, true);
});
test("Browser clients serialize preference writes and merge persisted peer fields", async () => {
  const oldWindow = globalThis.window,
    oldStorage = globalThis.localStorage;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const storage = new Map(),
    locks = [];
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async (name, callback) => {
          locks.push(name);
          return callback();
        },
      },
    },
  });
  try {
    const first = new WorkspaceClient(),
      second = new WorkspaceClient();
    await first.action({
      type: "preferences",
      editorCharacters: { showPortraits: true },
      language: "zh-TW",
    });
    await second.action({
      type: "preferences",
      editorCharacters: { sourceNameColors: true },
      dialogueLength: { limit: 100 },
    });
    const saved = JSON.parse(storage.get("spindle.preferences.v1"));
    assert.deepEqual(saved.editorCharacters, {
      showPortraits: true,
      sourceNameColors: true,
      useNameColors: true,
    });
    assert.equal(saved.language, "zh-TW");
    assert.equal(saved.dialogueLength.limit, 100);
    assert.deepEqual(locks, ["spindle-appearance", "spindle-appearance"]);
    const reopened = new WorkspaceClient();
    await reopened.refresh();
    assert.equal(reopened.getSnapshot().preferences.dialogueLength.limit, 100);
  } finally {
    globalThis.window = oldWindow;
    globalThis.localStorage = oldStorage;
    if (oldNavigator)
      Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
  }
});
