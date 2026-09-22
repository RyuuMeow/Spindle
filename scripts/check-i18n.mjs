import fs from "node:fs";
import assert from "node:assert/strict";
const locales = ["en", "zh-TW", "zh-CN"],
  catalogs = locales.map((l) =>
    JSON.parse(fs.readFileSync(`app/i18n/${l}.json`)),
  );
const keys = Object.keys(catalogs[0]).sort();
for (let i = 0; i < locales.length; i++) {
  assert.deepEqual(
    Object.keys(catalogs[i]).sort(),
    keys,
    locales[i] + " has missing keys",
  );
  for (const key of keys) {
    assert.equal(typeof catalogs[i][key], "string");
    assert.ok(catalogs[i][key].trim(), key);
    assert.deepEqual(
      [...catalogs[i][key].matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort(),
      [...catalogs[0][key].matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort(),
      `${locales[i]} ${key} placeholders`,
    );
  }
}
console.log(
  `${keys.length} messages verified across ${locales.length} locales`,
);
