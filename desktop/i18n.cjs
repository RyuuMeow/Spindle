// Source-side runtime for direct module tests. Desktop staging bundles the typed runtime.
const fs = require("node:fs"),
  path = require("node:path");
const language =
  process.env.SPINDLE_LOCALE || Intl.DateTimeFormat().resolvedOptions().locale;
const selected = /^zh/i.test(language)
  ? /Hant|TW|HK|MO/i.test(language)
    ? "zh-TW"
    : "zh-CN"
  : "en";
const messages = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../app/i18n", selected + ".json"),
    "utf8",
  ),
);
exports.locale = () => selected;
exports.t = (key, args = []) =>
  messages[key].replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n)] ?? ""));
