import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
const outfile = path.resolve("outputs/tests/character-presentation.cjs");
buildSync({
  entryPoints: ["app/play/character-presentation.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { characterColor, speakerSpan, colorSurface } = createRequire(
  import.meta.url,
)(outfile);
const character = {
  name: "Mira",
  displayName: "米菈",
  color: "#AABBCC",
  portraits: {},
  sprites: {},
};

test("automatic name color is stable by source identity, not display name or discovery order", () => {
  const first = characterColor("Mira");
  for (const other of ["Narrator", "米菈", "😀", "Mira"]) characterColor(other);
  assert.equal(characterColor("Mira"), first);
  assert.equal(
    characterColor("Mira", { ...character, colorMode: "auto" }),
    first,
  );
  assert.equal(
    characterColor("Mira", {
      ...character,
      displayName: "Changed",
      colorMode: "auto",
    }),
    first,
  );
  assert.equal(characterColor("é"), characterColor("e\u0301"));
  assert.match(first, /^#[a-f0-9]{6}$/i);
});
test("automatic colors adapt to the surface while explicit and legacy custom colors remain exact", () => {
  assert.notEqual(
    characterColor("Mira", undefined, "dark"),
    characterColor("Mira", undefined, "light"),
  );
  for (const mode of [undefined, "custom"])
    for (const surface of ["dark", "light"])
      assert.equal(
        characterColor("Mira", { ...character, colorMode: mode }, surface),
        "#AABBCC",
      );
  assert.equal(colorSurface("#ffffff"), "light");
  assert.equal(colorSurface("#1c1c1c"), "dark");
  assert.equal(colorSurface("unsupported"), "dark");
});
test("speaker ranges use ASCII colon and exact UTF-16 source positions", () => {
  const source = "  米菈😀  :\tHello: again";
  const range = speakerSpan(source);
  assert.equal(source.slice(range.from, range.to), "米菈😀");
  assert.equal(source.slice(range.bodyFrom), "Hello: again");
  assert.equal(speakerSpan("米菈：沒有 ASCII 冒號"), null);
  assert.equal(speakerSpan("   : Missing speaker"), null);
  assert.equal(speakerSpan("Narration without speaker"), null);
});
