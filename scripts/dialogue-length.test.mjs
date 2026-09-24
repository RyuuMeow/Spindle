import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-length-"));
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
const { weightedDialogueLength: count, dialogueLengthFindings: findings } =
  load("app/diagnostics/dialogue-length.ts");
const { parse } = load("app/parser.ts");
const { semantics } = load("desktop/mcp/semantics.ts");
const { AgentApplication } = load("desktop/mcp/application.ts");
const { DiagnosticPresentation } = load("app/diagnostics/presentation.ts");
const scene = (body) => `title: Start\n---\n${body}\n===`;
test("weights user-visible graphemes, including emoji sequences", () => {
  assert.equal(count("中文ＡA é e\u0301 👩‍👩‍👧‍👦🇹🇼"), 8);
  assert.equal(count("あ한　１"), 4);
});
test("only dialogue and narration count, excluding role and syntax", () => {
  const text = scene(
    "小明: [b]中文[/b] {$dynamic} <<wait 999>> #line:abc // comment\n旁白很長\n-> 選項非常長\n<<wait 999999>>\n// comment",
  );
  const result = findings(text, { enabled: true, limit: 3 });
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 4);
  assert.equal(result[0].length, 4);
});
test("threshold is strict; disabled and default 80", () => {
  assert.equal(findings(scene("a".repeat(160))).length, 0);
  assert.equal(findings(scene("a".repeat(161))).length, 1);
  assert.equal(
    findings(scene("中".repeat(81)), { enabled: false, limit: 80 }).length,
    0,
  );
});
test("source range remains UTF-16 and excludes speaker/indent and CRLF", () => {
  const text = scene("  小明: 👩‍👩‍👧‍👦中文").replaceAll("\n", "\r\n");
  const [found] = findings(text, { enabled: true, limit: 2 });
  const line = text.split("\r\n")[2];
  assert.equal(line.slice(found.column - 1, found.endColumn - 1), "👩‍👩‍👧‍👦中文");
  assert.equal(found.length, 3);
});
test("parser and MCP share warning and never attach unrelated command fixes", () => {
  const text = scene("長".repeat(81) + " <<unknown_command>>");
  const doc = { id: "doc", name: "a.yarn", text, saved: text, version: 1 };
  const warning = parse([doc], []).issues.find(
    (i) => i.code === "diagnostic.dialogueLength",
  );
  assert.equal(warning.severity, "warning");
  assert.ok(warning.endColumn > warning.column);
  const result = semantics({ id: "p", documents: [doc], commands: [] });
  assert.deepEqual(
    result.issues.find((i) => i.code === warning.code).fixIds,
    [],
  );
  assert.equal(
    semantics(
      { id: "p", documents: [doc], commands: [] },
      { dialogueLength: { enabled: false, limit: 80 } },
    ).issues.some((i) => i.code === warning.code),
    false,
  );
});
test("MCP analysis cache changes when global length preference changes", () => {
  const text = scene("中".repeat(81));
  const project = {
    id: "p",
    documents: [{ id: "d", name: "a.yarn", text, saved: text, version: 1 }],
    commands: [],
    recovery: [],
  };
  const service = { catalog: { preferences: {} } };
  const app = new AgentApplication(service, {});
  const initial = app.analyze(project);
  assert.ok(initial.issues.some((i) => i.code === "diagnostic.dialogueLength"));
  service.catalog.preferences.dialogueLength = { enabled: true, limit: 90 };
  assert.equal(
    app
      .analyze(project)
      .issues.some((i) => i.code === "diagnostic.dialogueLength"),
    false,
  );
  service.catalog.preferences.dialogueLength = { enabled: false, limit: 1 };
  assert.equal(
    app
      .analyze(project)
      .issues.some((i) => i.code === "diagnostic.dialogueLength"),
    false,
  );
});
test("length warnings and published counts respect the same 800ms/IME gate", () => {
  const make = (body, composing = false) => ({
    id: "d",
    name: "a.yarn",
    text: scene(body),
    saved: "",
    version: 1,
    composing,
  });
  const c = new DiagnosticPresentation();
  const short = make("短");
  c.update([short], parse([short], []).issues, 0);
  const long = make("長".repeat(81));
  const issues = parse([long], []).issues;
  c.update([long], issues, 10);
  c.publish(809);
  assert.equal(c.visible.length, 0);
  assert.equal(c.published.length, 0);
  c.publish(810);
  assert.equal(c.visible.length, 1);
  assert.equal(c.published.length, 1);
  const composing = make("短", true);
  c.update([composing], [], 900, { id: "d", line: 3 });
  assert.equal(c.visible.length, 0);
  assert.equal(c.published.length, 1);
  c.publish(2000, true);
  assert.equal(c.published.length, 1);
  c.update([make("短")], [], 2100);
  c.publish(2899);
  assert.equal(c.published.length, 1);
  c.publish(2900);
  assert.equal(c.published.length, 0);
});
