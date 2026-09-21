import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const out = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "spindle-diagnostics-")),
  "presentation.cjs",
);
buildSync({
  entryPoints: ["app/diagnostics/presentation.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { DiagnosticPresentation } = createRequire(import.meta.url)(out);
const document = (text, composing = false) => ({
  id: "one",
  name: "one.yarn",
  text,
  saved: text,
  status: "saved",
  version: 0,
  composing,
});
const issue = (line, message = "missing") => ({
  file: "one.yarn",
  line,
  column: 1,
  message,
  severity: "error",
});
test("retyping hides current diagnostics immediately and resets the 800ms timer", () => {
  const c = new DiagnosticPresentation();
  c.update([document("<<wait >>\nother")], [issue(1), issue(2)], 0);
  c.update([document("<<wait 1>>\nother")], [issue(2)], 10);
  assert.deepEqual(
    c.visible.map((i) => i.line),
    [2],
  );
  assert.equal(c.published.length, 2);
  c.publish(809);
  assert.equal(c.pending.size, 1);
  c.update([document("<<wait >>\nother")], [issue(1), issue(2)], 810);
  c.publish(1609);
  assert.equal(c.pending.size, 1);
  c.publish(1610);
  assert.equal(c.visible.length, 2);
});
test("line insertion maps unaffected diagnostics without publishing transient counts", () => {
  const c = new DiagnosticPresentation();
  c.update([document("first\nsecond\nthird")], [issue(3)], 0);
  c.update([document("first changed\nnew\nsecond\nthird")], [issue(4)], 1);
  assert.equal(c.visible[0].line, 4);
  assert.equal(c.published[0].line, 3);
});
test("composition never publishes on force and restarts delay on commit", () => {
  const c = new DiagnosticPresentation();
  c.update([document("<<wait >>")], [issue(1)], 0);
  c.update([document("<<wait a>>", true)], [issue(1)], 1);
  c.publish(5000, true);
  assert.equal(c.visible.length, 0);
  c.update([document("<<wait a>>")], [issue(1)], 5000);
  c.publish(5799);
  assert.equal(c.visible.length, 0);
  c.publish(5800);
  assert.equal(c.visible.length, 1);
});
test("caret within edited line leaves delay intact, leaving line publishes", () => {
  const c = new DiagnosticPresentation();
  c.update([document("a\nb")], [issue(1)], 0);
  c.update([document("aa\nb")], [issue(1)], Date.now());
  c.leave("one", 1);
  assert.equal(c.pending.size, 1);
  c.leave("one", 2);
  assert.equal(c.pending.size, 0);
  assert.equal(c.visible.length, 1);
});
test("removing a document cancels pending diagnostics and cannot resurrect it", () => {
  const c = new DiagnosticPresentation();
  c.update([document("a")], [issue(1)], 0);
  c.update([document("aa")], [issue(1)], 1);
  c.update([], [], 2);
  c.publish(900);
  assert.equal(c.visible.length, 0);
  assert.equal(c.pending.size, 0);
});
