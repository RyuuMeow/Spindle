import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const output = path.resolve("outputs/tests/command-hints.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({
  entryPoints: ["app/command-hints.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const {
  commandInput,
  atCommandCloser,
  argumentSpans,
  commandCall,
  commandHover,
  commandLabel,
  parameterLabel,
} = createRequire(import.meta.url)(output);
const commands = [
  {
    name: "play_sound",
    displayName: "播放音效",
    description: "播放指定音效",
    params: [
      {
        name: "asset",
        displayName: "音效",
        type: "string",
        required: true,
        description: "資源名稱",
      },
      {
        name: "volume",
        displayName: "音量",
        type: "number",
        required: false,
        description: "0 到 1",
      },
    ],
  },
];
test("source spans preserve quotes, escapes and grouped expressions", () => {
  const text = '"wind \\"night\\"" {$volume * (1 + 2)}';
  const spans = argumentSpans(text, 7);
  assert.equal(spans.length, 2);
  assert.deepEqual(
    spans.map((s) => text.slice(s.from - 7, s.to - 7)),
    ['"wind \\"night\\""', "{$volume * (1 + 2)}"],
  );
});
test("ambiguous or unfinished arguments never get guessed labels", () => {
  for (const text of ['"wind', "{1 + 2", "(1]", "1 + 2"])
    assert.equal(argumentSpans(text), null);
});
test("ignore ordinary prose, comments and unknown commands", () => {
  for (const line of [
    "Narrator: play_sound",
    '// <<play_sound "wind">>',
    "<<unknown 1>>",
  ])
    assert.equal(commandCall(line, commands), null);
});
test("quoted closing delimiters do not terminate commands", () => {
  const call = commandCall(
    '  <<play_sound "wind >> sea" 0.5>> // hi',
    commands,
  );
  assert.equal(call.args.length, 2);
  assert.equal(call.nameFrom, 4);
});
test("hover explains positional argument display name and description", () => {
  const line = '<<play_sound "wind" 0.5>>';
  assert.match(
    commandHover(line, line.indexOf("0.5"), commands).text,
    /音量.*第 2 個參數/,
  );
  assert.match(
    commandHover(line, line.indexOf("wind"), commands).text,
    /資源名稱/,
  );
  assert.match(commandHover(line, 3, commands).text, /播放音效 · play_sound/);
});
test("legacy definitions keep machine names as display fallback", () => {
  assert.equal(commandLabel({ name: "fade_in" }), "fade_in");
  assert.equal(
    parameterLabel({ name: "duration", displayName: "  " }),
    "duration",
  );
});

test("structured help carries metadata and escapes project Markdown", () => {
  const { commandMarkdown } = createRequire(import.meta.url)(output);
  const hover = commandHover('<<play_sound "wind" 0.8>>', 5, commands);
  assert.equal(hover.command.displayName, "播放音效");
  assert.equal(hover.parameterIndex, -1);
  const markup = commandMarkdown({
    ...commands[0],
    description: "[unsafe](command:run) <script>",
  });
  assert(markup.includes("| # | 參數 |"));
  assert(markup.includes("`play_sound`"));
  assert(!markup.includes("[unsafe](command:run)"));
  assert(!markup.includes("<script>"));
  const argument = commandHover('<<play_sound "wind" 0.8>>', 20, commands);
  assert.equal(argument.parameterIndex, 1);
});

const linkOutput = path.resolve("outputs/tests/scene-link.cjs");
buildSync({
  entryPoints: ["app/scene-link.ts"],
  outfile: linkOutput,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sceneLink } = createRequire(import.meta.url)(linkOutput);
test("static transfer links preserve exact target source ranges", () => {
  for (const text of [
    "    <<jump _Start>>",
    "<<detour Village>> // jump Other",
  ]) {
    const link = sceneLink(text);
    assert(link);
    assert.equal(text.slice(link.from, link.to), link.name);
  }
});
test("dynamic, incomplete and commented targets never become scene links", () => {
  for (const text of [
    "// <<jump Village>>",
    "Narrator: <<jump Village>>",
    "<<jump {$target}>>",
    "<<jump Village",
    "<<jump Village extra>>",
  ])
    assert.equal(sceneLink(text), null);
});

test("completion stops at the name and tracks incomplete positional arguments", () => {
  for (const text of ["<<", "<<fa", "  <<play_sound"])
    assert.deepEqual(commandInput(text), { kind: "name" });
  for (const [text, index] of [
    ["<<play_sound ", 0],
    ['<<play_sound "wind ', 0],
    ['<<play_sound "wind >> sea" ', 1],
    ["<<play_sound (1 + ", 0],
    ["<<play_sound (1 + 2)   ", 1],
    ['<<play_sound "wind" 0.', 1],
  ]) {
    assert.deepEqual(commandInput(text), {
      kind: "argument",
      name: "play_sound",
      index,
    });
  }
  for (const text of [
    "// <<play_sound ",
    "Mira: <<play_sound ",
    '<<play_sound "wind" >>',
    "<<fade_in>> ",
  ])
    assert.equal(commandInput(text), null);
});

test("closing pair skipping only recognizes delimiters outside strings", () => {
  const text = '  <<play_sound "literal >>" 0.6>>';
  assert.equal(atCommandCloser(text, text.indexOf(">>")), false);
  assert.equal(atCommandCloser(text, text.lastIndexOf(">>")), true);
  assert.equal(atCommandCloser(text, text.lastIndexOf(">>") + 1), true);
  assert.equal(atCommandCloser("// <<fade_in 2>>", 14), false);
  assert.equal(atCommandCloser('<<play_sound "unfinished >>', 24), false);
});
