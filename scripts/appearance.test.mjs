import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
fs.mkdirSync("outputs/tests", { recursive: true });
buildSync({ entryPoints: ["app/appearance/model.ts"], outfile: "outputs/tests/appearance.cjs", bundle: true, platform: "node", format: "cjs" });
const { defaultAppearance, patchAppearance, resolveAppearance, normalizeAppearance, migrateAppearance, fontStack } = createRequire(import.meta.url)("../outputs/tests/appearance.cjs");
test("independent field overrides and explicit inheritance follow new global values", () => {
 let a = patchAppearance(defaultAppearance(), { modes: { rendered: { fontSize: 22 } } });
 a = patchAppearance(a, { global: { fontSize: 18, lineHeight: 2 } });
 assert.equal(resolveAppearance(a, "rendered").fontSize, 22);
 assert.equal(resolveAppearance(a, "reader").fontSize, 18);
 assert.equal(resolveAppearance(a, "rendered").lineHeight, 2);
 a = patchAppearance(a, { modes: { rendered: { fontSize: null } } });
 assert.equal(resolveAppearance(a, "rendered").fontSize, 18);
 assert.equal("fontSize" in a.modes.rendered, false);
});
test("mode defaults differ from follow-all and source reset does not touch other modes", () => {
 let a = patchAppearance(defaultAppearance(), { modes: { source: null }, source: { tabSize: 8 } });
 assert.equal(resolveAppearance(a, "source").fontFamily, "system-sans");
 a = patchAppearance(a, { reset: "source" });
 assert.equal(resolveAppearance(a, "source").fontFamily, "system-mono");
 assert.equal(a.source.tabSize, 4);
 assert.equal(a.modes.graph.fontSize, 14);
});
test("invalid fields reject patches atomically, persisted invalid fields fall back", () => {
 const a = defaultAppearance();
 assert.throws(() => patchAppearance(a, { global: { fontSize: 20, background: "red;display:none" } }));
 assert.equal(a.global.fontSize, 16);
 assert.throws(() => patchAppearance(a, { source: { tabSize: 3 } }));
 assert.throws(() => patchAppearance(a, { global: { fontSize: Infinity } }));
 assert.equal(normalizeAppearance({ ...a, global: { fontSize: -1 } }).global.fontSize, 16);
 assert.equal(normalizeAppearance({ ...a, modes: { source: {} } }).modes.source.fontFamily, undefined);
});
test("sequential patches from independent windows preserve unrelated settings", () => {
 let a = patchAppearance(defaultAppearance(), { global: { fontSize: 20 } });
 a = patchAppearance(a, { modes: { reader: { lineHeight: 2.2 } } });
 assert.equal(a.global.fontSize, 20);
 assert.equal(a.modes.reader.lineHeight, 2.2);
 assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(a))), a);
});
test("legacy preferences migrate to both reading modes; font names are quoted", () => {
 const a = migrateAppearance({ readingSize: 20, readingLineHeight: 32, readingWidth: "wide", lineNumbers: true });
 assert.deepEqual(a.modes.reader, { fontSize: 20, lineHeight: 1.6 });
 assert.deepEqual(a.modes.reader, a.modes.rendered);
 assert.equal(a.widths.reader, "wide");
 assert.equal(a.source.lineNumbers, true);
 assert.ok(fontStack('a"b').startsWith('"a\\"b"'));
});
