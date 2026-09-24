import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const output = path.resolve("outputs/panel-layout-tests/layout.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({
  entryPoints: ["app/workspace/panel-layout.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { panelLayout } = createRequire(import.meta.url)(output);

test("docked panels always leave at least 320 CSS pixels for the editor", () => {
  for (const width of [400, 534, 600, 800, 1000, 1280, 1600])
    for (const left of [false, true])
      for (const right of [false, true])
        for (const focus of ["left", "right"])
          for (const preferred of [220, 420]) {
            const result = panelLayout(
              width,
              left,
              right,
              preferred,
              preferred,
              focus,
            );
            if (result.overlay) continue;
            const visibleLeft = left && (!result.compact || focus === "left");
            const visibleRight =
              right && (!result.compact || focus === "right");
            const center =
              width -
              12 -
              (visibleLeft ? result.leftWidth + 6 : 0) -
              (visibleRight ? result.rightWidth + 6 : 0);
            assert.ok(
              center >= 320,
              JSON.stringify({ width, left, right, focus, result, center }),
            );
          }
});

test("shrinking clamps a sidebar without mutating its saved width; widening restores it", () => {
  assert.equal(panelLayout(600, true, false, 420, 260, "left").leftWidth, 262);
  assert.equal(panelLayout(1000, true, false, 420, 260, "left").leftWidth, 420);
  assert.equal(panelLayout(480, true, false, 420, 260, "left").overlay, true);
});

test("large sidebars use focus priority when both cannot fit, and both return when space allows", () => {
  const small = panelLayout(1000, true, true, 420, 420, "right");
  assert.equal(small.compact, true);
  assert.equal(small.overlay, false);
  assert.equal(panelLayout(1400, true, true, 420, 420, "right").compact, false);
});
