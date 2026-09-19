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
    contents: `export * from './app/reading/decorations'; export * from './app/reading/structure'; export * from './app/reading/tokens'; export * from './app/reading/layout';`,
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
  readingLayout,
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

test("cursor reveals the whole active line without changing source", () => {
  const text = source("<<set $score = $base + 1>>");
  const result = decorations(text, text.indexOf("$score") + 2);
  assert.deepEqual(
    result.widgets
      .filter((r) => r.spec.widget.className === "reading-variable")
      .map((r) => r.spec.widget.label),
    [],
  );
  assert.ok(
    result.ranges.some((r) =>
      r.spec.class?.includes("reading-variable-source"),
    ),
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

test("semantic groups add breathing room even when the source has no blank lines", () => {
  const compact = source(
    'Mira: first\n<<play_sound "wind">>\n<<set $gold = 2>>\nMira: next',
  );
  const spaced = compact.replace("first\n", "first\n\n\n");
  function groupGaps(text) {
    const lines = readingStructure(text),
      layout = readingLayout(lines);
    return lines.flatMap((line, index) =>
      line.kind === "blank"
        ? []
        : [
            {
              text: line.text,
              before: layout[index].before,
              after: layout[index].after,
            },
          ],
    );
  }
  assert.deepEqual(groupGaps(compact), groupGaps(spaced));
  const gaps = groupGaps(compact);
  assert.equal(
    gaps.find((line) => line.text.startsWith("<<play_sound")).before,
    12,
  );
  assert.equal(gaps.find((line) => line.text.startsWith("<<set")).before, 0);
  assert.equal(gaps.find((line) => line.text === "Mira: next").before, 12);
  assert.equal(decorations(spaced).state.doc.toString(), spaced);
});

test("every branch has balanced leading and trailing content spacing", () => {
  const lines = readingStructure(
    source(
      "<<if $key>>\nMira: yes\n<<jump Yes>>\n<<else>>\nMira: no\n<<jump No>>\n<<endif>>\nMira: together",
    ),
  );
  const layout = readingLayout(lines);
  const item = (text) => layout[lines.findIndex((line) => line.text === text)];
  assert.equal(item("<<if $key>>").before, item("<<else>>").before);
  assert.equal(item("Mira: yes").before, 8);
  assert.equal(item("Mira: no").before, 8);
  assert.equal(item("<<jump Yes>>").after, 16);
  assert.equal(item("<<jump No>>").after, 16);
  assert.equal(item("Mira: together").before, 20);
  assert.ok(item("Mira: together").classes.includes("reading-after-region"));
});

test("scene separators own their spacing rather than source blank lines", () => {
  for (const blanks of ["", "\n", "\n\n\n"]) {
    const text =
      source("Mira: first") +
      blanks +
      source("Mira: second").replace("title: Start", "title: Next");
    const lines = readingStructure(text),
      layout = readingLayout(lines);
    const nextTitle = lines.findIndex((line) => line.text === "title: Next");
    assert.equal(layout[nextTitle].before, 0);
    assert.ok(
      layout[lines.findIndex((line) => line.kind === "end")].classes.includes(
        "reading-scene-boundary",
      ),
    );
    for (let index = nextTitle - 1; lines[index]?.kind === "blank"; index--)
      assert.equal(layout[index].collapseBlank, true);
  }
});

test("visual blank collapsing keeps selected source lines accessible", () => {
  const text = source("Mira: first\n\n\nMira: second");
  const position = text.indexOf("\n\n\n") + 1;
  const resting = decorations(text, text.length, true);
  assert.ok(
    resting.ranges.some(
      (range) =>
        range.from === position &&
        range.spec.attributes?.class.includes("reading-blank-collapsed"),
    ),
  );
  const selected = decorations(text, position);
  const line = selected.ranges.find(
    (range) => range.from === position && range.spec.attributes,
  );
  assert.ok(line.spec.attributes.class.includes("reading-blank-active"));
  assert.ok(!line.spec.attributes.class.includes("reading-blank-collapsed"));
  assert.equal(selected.state.doc.toString(), text);
});

test("inline option conditions are quiet source-mapped annotations", () => {
  const text = source("-> Buy <<if $gold > 3>>");
  const result = decorations(text);
  assert.ok(
    result.widgets.some(
      (range) =>
        range.spec.widget.className === "reading-inline-keyword" &&
        range.spec.widget.label === "若 ",
    ),
  );
  assert.ok(result.widgets.some((range) => range.spec.widget.label === "gold"));
  assert.ok(
    result.ranges.some(
      (range) => range.spec.class === "reading-inline-condition",
    ),
  );
  assert.equal(result.state.doc.toString(), text);
});

test("editing an inline condition delimiter reveals the complete expression", () => {
  const text = source("-> Buy <<if $gold > 3>>");
  const begin = text.indexOf("<<if"),
    end = text.indexOf(">>") + 2;
  for (const cursor of [begin + 2, end - 1]) {
    const result = decorations(text, cursor);
    assert.ok(
      !result.widgets.some((range) => range.from >= begin && range.to <= end),
    );
    assert.equal(result.state.doc.toString(), text);
  }
});

test("unknown commands retain their source while keeping branch containment and spacing", () => {
  const text = source(
    "<<if $key>>\n<<unregistered $gold>>\n<<else>>\nMira: no\n<<endif>>",
  );
  const result = decorations(text);
  const from = text.indexOf("<<unregistered");
  const row = result.ranges.find(
    (range) => range.from === from && range.spec.attributes,
  );
  assert.ok(row.spec.attributes.class.includes("reading-raw"));
  assert.ok(row.spec.attributes.class.includes("reading-region"));
  assert.ok(row.spec.attributes.style.includes("--reading-gap-before:8px"));
  assert.ok(row.spec.attributes.style.includes("--reading-gap-after:16px"));
  assert.ok(
    !result.widgets.some(
      (range) =>
        range.from >= from &&
        range.to <= from + "<<unregistered $gold>>".length,
    ),
  );
});
test("display command metadata adds virtual labels without changing Yarn or selected source", () => {
  const text = source('<<play_sound "wind" {$volume}>>');
  const definition = {
    name: "play_sound",
    displayName: "播放音效",
    description: "播放資源",
    params: [
      { name: "asset", displayName: "音效", type: "string", required: true },
      { name: "volume", displayName: "音量", type: "number", required: true },
    ],
  };
  const state = EditorState.create({
    doc: text,
    selection: { anchor: text.length },
  });
  const widgets = [];
  readingDecorations(state, [definition]).between(
    0,
    text.length,
    (from, to, value) => {
      if (value.spec.widget)
        widgets.push({ from, to, widget: value.spec.widget });
    },
  );
  assert.equal(state.doc.toString(), text);
  assert.ok(widgets.some((w) => w.widget.label === "播放音效 "));
  const labels = widgets.filter(
    (w) => w.widget.className === "reading-parameter-hint",
  );
  assert.deepEqual(
    labels.map((w) => w.widget.label),
    ["音效:", "音量:"],
  );
  assert.ok(labels.every((w) => w.from === w.to));
  assert.equal(labels[0].from, text.indexOf('"wind"'));
  const active = EditorState.create({
    doc: text,
    selection: { anchor: text.indexOf("wind") },
  });
  const activeHints = [];
  readingDecorations(active, [definition]).between(
    0,
    text.length,
    (_from, _to, value) => {
      if (value.spec.widget?.className === "reading-parameter-hint")
        activeHints.push(value);
    },
  );
  assert.equal(activeHints.length, 0);
});
