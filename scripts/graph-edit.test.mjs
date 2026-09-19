import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
const require = createRequire(import.meta.url),
  output = path.resolve("outputs/tests/graph-edit.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({
  stdin: {
    contents: `export * from './app/graph/scene-scope'; export {parse} from './app/parser';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sceneScope, sceneText, sceneEdits, mapSceneScope, parse } = require(
  output,
);
const source =
  "\uFEFFtitle: First\r\ntags: hello\r\n---\r\nMira: same\r\n<<set $gold = 1>>\r\n===\r\n\r\ntitle: Other\r\n---\r\nMira: same\r\n===\r\n";
const first = parse([{ name: "chapter.yarn", text: source, saved: source }], [])
  .nodes[0];
test("scope preserves BOM, CRLF and adjacent identical dialogue", () => {
  const scope = sceneScope(source, first);
  assert.equal(sceneText(source, scope), "Mira: same\n<<set $gold = 1>>");
  const edit = sceneEdits(source, scope, [
    { from: 6, to: 10, insert: "new\nMira: next" },
  ]);
  assert.equal(edit.next.slice(0, scope.from), source.slice(0, scope.from));
  assert.equal(edit.next.slice(edit.scope.to), source.slice(scope.to));
  assert.ok(edit.next.includes("Mira: new\r\nMira: next"));
  assert.ok(edit.next.endsWith("Mira: same\r\n===\r\n"));
  assert.ok(edit.next.startsWith("\ufeff"));
});
test("outside edits map range, not a matching dialogue string", () => {
  const scope = sceneScope(source, first),
    prefix = "// inserted\r\n",
    shifted = mapSceneScope(source, prefix + source, scope);
  assert.equal(shifted.from, scope.from + prefix.length);
  assert.equal(sceneText(prefix + source, shifted), sceneText(source, scope));
  const after = source + "// after\n";
  assert.deepEqual(mapSceneScope(source, after, scope), scope);
});
test("scene rename maps header without changing body", () => {
  const scope = sceneScope(source, first),
    next = source.replace("First", "LongerFirst");
  const mapped = mapSceneScope(source, next, scope);
  assert.ok(mapped);
  assert.equal(sceneText(next, mapped), sceneText(source, scope));
});
test("remote body changes are reconciled in the same scope", () => {
  const scope = sceneScope(source, first),
    next = source.replace("Mira: same", "Mira: remote");
  const mapped = mapSceneScope(source, next, scope);
  assert.ok(mapped);
  assert.equal(mapped.to, scope.to + 2);
  assert.ok(sceneText(next, mapped).startsWith("Mira: remote"));
});
test("boundary deletion pauses rather than editing another scene", () => {
  const scope = sceneScope(source, first);
  assert.equal(mapSceneScope(source, source.slice(scope.to), scope), null);
  assert.equal(
    mapSceneScope(source, source.replace("---\r\n", ""), scope),
    null,
  );
});
test("incomplete body syntax remains editable without depending on parser id", () => {
  const scope = sceneScope(source, first),
    text = sceneText(source, scope),
    at = text.indexOf(">>");
  const change = sceneEdits(source, scope, [
    { from: at, to: at + 2, insert: "" },
  ]);
  assert.ok(sceneText(change.next, change.scope).includes("<<set $gold = 1"));
  assert.equal(change.next.slice(change.scope.to), source.slice(scope.to));
});
test("out-of-range changes are rejected before applying", () => {
  assert.throws(
    () =>
      sceneEdits(source, sceneScope(source, first), [
        { from: -1, to: 1, insert: "" },
      ]),
    /範圍/,
  );
});
test("empty scene inserts keep the closing delimiter on its own line", () => {
  const empty = "title: Empty\r\n---\r\n===\r\n";
  const node = parse([{ name: "empty.yarn", text: empty, saved: empty }], []).nodes[0];
  const scope = sceneScope(empty, node);
  const change = sceneEdits(empty, scope, [{ from: 0, to: 0, insert: "Mira: First\nMira: Next" }]);
  assert.equal(change.next, "title: Empty\r\n---\r\nMira: First\r\nMira: Next\r\n===\r\n");
  assert.equal(sceneText(change.next, change.scope), "Mira: First\nMira: Next");
});
test("single line body inherits file CRLF on multiline insertion", () => {
  const text = "title: One\r\n---\r\nMira: First\r\n===\r\n";
  const node = parse([{ name: "one.yarn", text, saved: text }], []).nodes[0];
  const change = sceneEdits(text, sceneScope(text, node), [{ from: 11, to: 11, insert: "\nMira: Next" }]);
  assert.equal(change.next, "title: One\r\n---\r\nMira: First\r\nMira: Next\r\n===\r\n");
});
