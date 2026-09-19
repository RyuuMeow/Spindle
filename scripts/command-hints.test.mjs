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
