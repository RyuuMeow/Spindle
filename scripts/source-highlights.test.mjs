import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const output = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "spindle-highlights-")),
  "module.cjs",
);
buildSync({
  entryPoints: ["app/appearance/monaco-highlights.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sourceHighlights } = createRequire(import.meta.url)(output);
test("Source highlights ignore scroll refreshes while tracking content, selection, declarations, Find and style", () => {
  const priorDocument = globalThis.document,
    priorObserver = globalThis.MutationObserver;
  let cssWrites = 0,
    reads = 0,
    sets = 0,
    version = 1,
    selected = 7,
    searching = false,
    names = ["$score"];
  let text = "Hello {$score} {$score}",
    ranges = [];
  const sheet = {
    set textContent(v) {
      cssWrites++;
    },
    remove() {},
  };
  globalThis.document = { createElement: () => sheet };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  try {
    const root = {
      appendChild() {},
      setAttribute() {},
      querySelector: () => ({
        classList: { contains: () => searching },
        querySelector: () => ({ value: searching ? "score" : "" }),
      }),
      addEventListener() {},
      removeEventListener() {},
    };
    const model = {
      getVersionId: () => version,
      getValue: () => {
        reads++;
        return text;
      },
      getOffsetAt: (p) => p.column - 1,
      getPositionAt: (o) => ({ lineNumber: 1, column: o + 1 }),
    };
    const selection = {
      getStartPosition: () => ({ lineNumber: 1, column: selected + 1 }),
      getEndPosition: () => ({ lineNumber: 1, column: selected + 1 }),
    };
    const subscription = () => ({ dispose() {} });
    const view = {
      getId: () => 1,
      getDomNode: () => root,
      getModel: () => model,
      getSelection: () => selection,
      getSelections: () => [selection],
      createDecorationsCollection: () => ({
        set: (r) => {
          sets++;
          ranges = r;
        },
        clear: () => {
          ranges = [];
        },
      }),
      onDidChangeCursorSelection: subscription,
      onDidChangeModelContent: subscription,
      onDidChangeModel: subscription,
    };
    let style = {
      matches: "#ff0000",
      symbols: "#00ff00",
      symbolStyle: "background",
      highlightMatches: true,
      highlightSymbols: true,
    };
    const h = sourceHighlights(
      view,
      () => style,
      () => names,
    );
    assert.equal(ranges.length, 2);
    for (let i = 0; i < 100; i++) h.refresh();
    assert.equal(reads, 1);
    assert.equal(sets, 1);
    assert.equal(cssWrites, 1);
    style = { ...style, symbols: "#0000ff" };
    h.refresh();
    assert.equal(cssWrites, 2);
    assert.equal(
      reads,
      1,
      "Color changes restyle existing ranges without scanning",
    );
    names = [];
    h.refresh();
    assert.equal(ranges.length, 0);
    assert.equal(reads, 2);
    names = ["$score"];
    h.refresh();
    assert.equal(ranges.length, 2);
    selected = 0;
    h.refresh();
    assert.equal(ranges.length, 0);
    selected = 7;
    h.refresh();
    assert.equal(ranges.length, 2);
    searching = true;
    h.refresh();
    assert.equal(ranges.length, 0);
    searching = false;
    h.refresh();
    assert.equal(ranges.length, 2);
    text += " {$score}";
    version++;
    h.refresh();
    assert.equal(ranges.length, 3);
    style = { ...style, highlightSymbols: false };
    h.refresh();
    assert.equal(ranges.length, 0);
    h.dispose();
  } finally {
    globalThis.document = priorDocument;
    globalThis.MutationObserver = priorObserver;
  }
});
