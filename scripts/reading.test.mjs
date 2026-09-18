import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const { EditorState } = require("@codemirror/state");
const output = path.resolve("outputs/tests/reading.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({
  stdin: {
    contents: `export * from './app/reading/decorations'; export * from './app/reading/structure'; export * from './app/reading/tokens';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["@codemirror/*"],
});
const {
  readingStructure,
  readingVariables,
  commandEnd,
  readingDecorations,
  readingSceneRanges,
  restoreReadingFolds,
} = require(output);
const source = (body) =>
  `title: Start\ntags: opening village\n---\n${body}\n===\n`;
const bodyLine = (text) => readingStructure(source(text))[3];
function decorations(text, cursor = text.length, readOnly = false) {
  const state = EditorState.create({
    doc: text,
    selection: { anchor: cursor },
  });
  const ranges = [];
  readingDecorations(state, ["play_sound"], undefined, readOnly).between(
    0,
    state.doc.length,
    (from, to, value) => ranges.push({ from, to, spec: value.spec }),
  );
  return { state, ranges, widgets: ranges.filter((r) => r.spec.widget) };
}

test("variables distinguish command expressions from quoted strings and comments", () => {
  const line = bodyLine("<<set $score = $base + 1>> // $comment");
  assert.deepEqual(
    readingVariables(line).map((t) => t.name),
    ["score", "base"],
  );
  const command = '<<play_sound "wind >> $literal" $volume>> // $comment';
  assert.equal(commandEnd(command), command.indexOf(">> //"));
  assert.deepEqual(
    readingVariables(bodyLine(command)).map((t) => t.name),
    ["volume"],
  );
});

test("dialogue transforms interpolation, preserving literal dollars and unknown markup", () => {
  const line = bodyLine(
    'Mira: "$literal" [color=$tone]text[/color] {$gold} {format("$unit", $amount)} // {$comment}',
  );
  const tokens = readingVariables(line);
  assert.deepEqual(
    tokens.map((t) => t.name),
    ["gold", "amount"],
  );
  assert.equal(line.text.slice(tokens[0].from, tokens[0].to), "{$gold}");
  assert.deepEqual(
    readingVariables(bodyLine("Mira: \\{$escaped} {$unfinished")).map(
      (t) => t.name,
    ),
    [],
  );
});

test("inline option conditions retain their variable context", () => {
  const line = bodyLine('-> Buy <<if $gold > 3 and $name != "$literal">>');
  assert.deepEqual(
    readingVariables(line).map((t) => t.name),
    ["gold", "name"],
  );
});

test("set left and right operands share the same variable decoration", () => {
  const result = decorations(source("<<set $score = $base + 1>>"));
  assert.deepEqual(
    result.widgets
      .filter((r) => r.spec.widget.className === "reading-variable")
      .map((r) => r.spec.widget.label),
    ["score", "base"],
  );
  assert.ok(result.widgets.some((r) => r.spec.widget.icon === "assign"));
  assert.equal(
    result.state.doc.toString(),
    source("<<set $score = $base + 1>>"),
  );
});

test("cursor reveals the touched token without dismantling the rest of the line", () => {
  const text = source("<<set $score = $base + 1>>");
  const result = decorations(text, text.indexOf("$score") + 2);
  assert.deepEqual(
    result.widgets
      .filter((r) => r.spec.widget.className === "reading-variable")
      .map((r) => r.spec.widget.label),
    ["base"],
  );
  assert.ok(
    result.ranges.some((r) => r.spec.class === "reading-variable-source"),
  );
});

test("editing command delimiters reveals a complete source command", () => {
  const text = source("<<set $score = $base + 1>>"),
    start = text.indexOf("<<set"),
    end = text.indexOf(">>", start) + 2;
  const result = decorations(text, start + 2);
  assert.ok(!result.widgets.some((r) => r.from >= start && r.to <= end));
});

test("structural source reveal has an explicit editing state; read-only keeps its rule", () => {
  const text = source("Mira: text"),
    position = text.indexOf("===") + 1;
  const active = decorations(text, position);
  assert.ok(
    active.ranges.some((r) =>
      r.spec.attributes?.class.includes("reading-editing-syntax"),
    ),
  );
  assert.ok(!active.widgets.some((r) => r.from === text.indexOf("===")));
  const preview = decorations(text, position, true);
  assert.ok(
    preview.widgets.some(
      (r) =>
        r.from === text.indexOf("===") &&
        r.spec.widget.className === "reading-rule",
    ),
  );
});

test("unknown commands and incomplete branches keep original syntax visible", () => {
  const unknown = source("<<unknown $value>>");
  assert.ok(
    !decorations(unknown).widgets.some((r) => r.spec.widget.label === "value"),
  );
  const incomplete = source("<<if $key>>\nMira: {$value}");
  assert.ok(
    readingStructure(incomplete)
      .filter((l) => ["condition", "dialogue"].includes(l.kind))
      .every((l) => !l.valid),
  );
  assert.ok(
    !decorations(incomplete).widgets.some(
      (r) => r.spec.widget.className === "reading-variable",
    ),
  );
});

test("flat branches keep parent context and distinguish options from common continuation", () => {
  const text = source(
    "<<if $key>>\n  <<if $gold > 3>>\n    Mira: yes\n  <<else>>\n    Mira: no\n  <<endif>>\n<<endif>>\n-> A\n  Mira: a\n-> B\n  Mira: b\nMira: together",
  );
  const lines = readingStructure(text),
    options = lines.filter((l) => l.kind === "option");
  assert.equal(options[0].optionGroupStart, true);
  assert.equal(options[1].optionGroupStart, false);
  assert.equal(lines.find((l) => l.text === "Mira: together").optionEnd, true);
  assert.deepEqual(lines.find((l) => l.command === "else").context, ["$key"]);
  assert.equal(lines.find((l) => l.text === "Mira: together").depth, 0);
  assert.equal(lines.map((l) => l.text).join("\n"), text);
});

test("persisted folds restore only current complete scene boundaries, without duplicates", () => {
  const text =
      source("Mira: first") +
      source("Mira: second").replace("title: Start", "title: Next"),
    lines = readingStructure(text),
    valid = readingSceneRanges(lines).map(({ from, to }) => ({ from, to }));
  assert.deepEqual(
    restoreReadingFolds(lines, [
      valid[1],
      valid[0],
      valid[0],
      { from: 0, to: text.length },
      { from: valid[0].from, to: valid[1].to },
      { from: -1, to: 4 },
      { from: valid[0].from + 0.5, to: valid[0].to },
    ]),
    valid,
  );
  const changed = readingStructure(text.replace("===", "incomplete"));
  assert.equal(readingSceneRanges(changed).length, 1);
  assert.deepEqual(restoreReadingFolds(changed, valid), []);
});

test("CodeMirror fold mapping tracks edits before a scene before persistence validation", () => {
  const {
    codeFolding,
    foldEffect,
    foldedRanges,
  } = require("@codemirror/language");
  const text = source("Mira: first"),
    range = readingSceneRanges(readingStructure(text))[0];
  let state = EditorState.create({ doc: text, extensions: [codeFolding()] });
  state = state.update({ effects: foldEffect.of(range) }).state;
  const prefix = "// 外部視窗新增註記\n";
  state = state.update({ changes: { from: 0, insert: prefix } }).state;
  const mapped = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) =>
    mapped.push({ from, to }),
  );
  assert.deepEqual(mapped, [
    { from: range.from + prefix.length, to: range.to + prefix.length },
  ]);
  assert.deepEqual(
    restoreReadingFolds(readingStructure(state.doc.toString()), mapped),
    mapped,
  );
});
