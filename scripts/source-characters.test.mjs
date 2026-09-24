import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const output = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "spindle-character-")),
  "source.cjs",
);
buildSync({
  entryPoints: ["app/play/source-characters.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sourceCharacters } = createRequire(import.meta.url)(output);
test("Source character colors are opt-in decorations and refresh without model mutation", () => {
  const prior = globalThis.document;
  const nodes = [];
  globalThis.document = {
    head: { appendChild: (n) => nodes.push(n) },
    createElement: () => ({
      style: {},
      textContent: "",
      remove() {
        this.removed = true;
      },
    }),
  };
  try {
    let ranges = [],
      settings = { enabled: false, background: "#1c1c1c", resources: null };
    const text =
      "title: Start\n---\n小明: 你好。\n<<unknown arg:5>>\n旁白\n===";
    const listeners = [];
    const view = {
      createDecorationsCollection: () => ({
        set: (r) => (ranges = r),
        clear: () => (ranges = []),
      }),
      getModel: () => ({ getValue: () => text }),
      onDidChangeModelContent: (f) => {
        listeners.push(f);
        return { dispose() {} };
      },
      onDidChangeModel: (f) => {
        listeners.push(f);
        return { dispose() {} };
      },
    };
    const decoration = sourceCharacters(view, () => settings);
    assert.equal(ranges.length, 0);
    settings = { ...settings, enabled: true };
    decoration.refresh();
    assert.equal(ranges.length, 1);
    assert.deepEqual(ranges[0].range, {
      startLineNumber: 3,
      endLineNumber: 3,
      startColumn: 1,
      endColumn: 3,
    });
    const first = nodes[0].textContent;
    listeners[0]();
    assert.equal(nodes[0].textContent, first);
    settings = { ...settings, enabled: false };
    decoration.refresh();
    assert.equal(ranges.length, 0);
    assert.equal(nodes[0].textContent, "");
    decoration.dispose();
    assert.equal(nodes[0].removed, true);
  } finally {
    globalThis.document = prior;
  }
});
