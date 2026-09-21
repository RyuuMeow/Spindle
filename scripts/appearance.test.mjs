import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
fs.mkdirSync("outputs/tests", { recursive: true });
buildSync({
  entryPoints: ["app/appearance/model.ts"],
  outfile: "outputs/tests/appearance.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
const {
  defaultAppearance,
  patchAppearance,
  resolveAppearance,
  normalizeAppearance,
  migrateAppearance,
  fontStack,
} = createRequire(import.meta.url)("../outputs/tests/appearance.cjs");
test("independent field overrides and explicit inheritance follow new global values", () => {
  let a = patchAppearance(defaultAppearance(), {
    modes: { rendered: { fontSize: 22 } },
  });
  a = patchAppearance(a, { global: { fontSize: 18, lineHeight: 2 } });
  assert.equal(resolveAppearance(a, "rendered").fontSize, 22);
  assert.equal(resolveAppearance(a, "reader").fontSize, 18);
  assert.equal(resolveAppearance(a, "rendered").lineHeight, 2);
  a = patchAppearance(a, { modes: { rendered: { fontSize: null } } });
  assert.equal(resolveAppearance(a, "rendered").fontSize, 18);
  assert.equal("fontSize" in a.modes.rendered, false);
});
test("mode defaults differ from follow-all and source reset does not touch other modes", () => {
  let a = patchAppearance(defaultAppearance(), {
    modes: { source: null },
    source: { tabSize: 8 },
  });
  assert.equal(resolveAppearance(a, "source").fontFamily, "system-sans");
  a = patchAppearance(a, { reset: "source" });
  assert.equal(resolveAppearance(a, "source").fontFamily, "system-mono");
  assert.equal(a.source.tabSize, 4);
  assert.equal(a.modes.graph.fontSize, 14);
});
test("invalid fields reject patches atomically, persisted invalid fields fall back", () => {
  const a = defaultAppearance();
  assert.throws(() =>
    patchAppearance(a, {
      global: { fontSize: 20, background: "red;display:none" },
    }),
  );
  assert.equal(a.global.fontSize, 16);
  assert.throws(() => patchAppearance(a, { source: { tabSize: 3 } }));
  assert.throws(() => patchAppearance(a, { global: { fontSize: Infinity } }));
  assert.equal(
    normalizeAppearance({ ...a, global: { fontSize: -1 } }).global.fontSize,
    16,
  );
  assert.equal(
    normalizeAppearance({ ...a, modes: { source: {} } }).modes.source
      .fontFamily,
    undefined,
  );
});
test("sequential patches from independent windows preserve unrelated settings", () => {
  let a = patchAppearance(defaultAppearance(), { global: { fontSize: 20 } });
  a = patchAppearance(a, { modes: { reader: { lineHeight: 2.2 } } });
  assert.equal(a.global.fontSize, 20);
  assert.equal(a.modes.reader.lineHeight, 2.2);
  assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(a))), a);
});
test("legacy preferences migrate to both reading modes; font names are quoted", () => {
  const a = migrateAppearance({
    readingSize: 20,
    readingLineHeight: 32,
    readingWidth: "wide",
    lineNumbers: true,
  });
  assert.deepEqual(a.modes.reader, { fontSize: 20, lineHeight: 1.6 });
  assert.deepEqual(a.modes.reader, a.modes.rendered);
  assert.equal(a.widths.reader, "wide");
  assert.equal(a.source.lineNumbers, true);
  assert.ok(fontStack('a"b').startsWith('"a\\"b"'));
});

buildSync({
  entryPoints: ["app/appearance/highlights.ts"],
  outfile: "outputs/tests/highlights.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { highlightRanges } = createRequire(import.meta.url)(
  "../outputs/tests/highlights.cjs",
);
test("selection matches exclude selected range and take priority over symbols", () => {
  const text =
    "<<declare $key = false>>\n<<set $key = true>>\nMira: hello hello";
  const start = text.indexOf("$key"),
    settings = defaultAppearance().global;
  const ranges = highlightRanges(text, start, start + 4, false, settings);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].kind, "match");
  assert.deepEqual(highlightRanges(text, start, start + 4, true, settings), []);
  assert.deepEqual(
    highlightRanges(text, start, start + 4, false, {
      ...settings,
      highlightMatches: false,
    }),
    [],
  );
});
test("cursor highlights only known syntactic symbols, not dialogue or strings", () => {
  const text =
    'title: Start\n---\n<<declare $key = false>>\n<<set $key = true>>\n<<show "$key">>\nMira: $key hello hello\n<<jump Start>>';
  const settings = defaultAppearance().global;
  const result = highlightRanges(
    text,
    text.indexOf("$key") + 2,
    text.indexOf("$key") + 2,
    false,
    settings,
  );
  assert.equal(result.length, 2);
  assert(result.every((r) => r.kind === "symbol"));
  const dialogue = text.indexOf("hello") + 1;
  assert.deepEqual(
    highlightRanges(text, dialogue, dialogue, false, settings),
    [],
  );
  assert.equal(highlightRanges(text, 8, 8, false, settings).length, 2);
  assert.deepEqual(highlightRanges(text, 8, 8, true, settings), []);
  assert.deepEqual(
    highlightRanges(text, 8, 8, false, {
      ...settings,
      highlightSymbols: false,
    }),
    [],
  );
});

test("symbol style validates, inherits and can be overridden independently", () => {
  let a = patchAppearance(defaultAppearance(), {
    global: { symbolStyle: "background" },
    modes: { rendered: { symbolStyle: "underline" } },
  });
  assert.equal(resolveAppearance(a, "source").symbolStyle, "background");
  assert.equal(resolveAppearance(a, "rendered").symbolStyle, "underline");
  a = patchAppearance(a, { modes: { rendered: { symbolStyle: null } } });
  assert.equal(resolveAppearance(a, "rendered").symbolStyle, "background");
  assert.throws(() =>
    patchAppearance(a, { global: { symbolStyle: "invalid" } }),
  );
  assert.equal(
    normalizeAppearance({ version: 1 }).global.symbolStyle,
    "underline",
  );
});

test("project declarations enable symbol references in document and scene editors", () => {
  const text = "<<set $shared = 2>>";
  assert.equal(
    highlightRanges(text, 9, 9, false, defaultAppearance().global).length,
    0,
  );
  assert.equal(
    highlightRanges(text, 9, 9, false, defaultAppearance().global, ["$shared"])
      .length,
    1,
  );
});
