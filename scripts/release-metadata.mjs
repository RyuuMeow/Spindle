import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const { version } = JSON.parse(fs.readFileSync("version.json", "utf8"));
const tag =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : undefined;
if (tag && tag !== `v${version}`) throw Error("Tag and version disagree");
const notes = {};
for (const locale of ["en", "zh-TW", "zh-CN"]) {
  const markdown = fs.readFileSync(`releases/${version}/${locale}.md`, "utf8");
  if (!markdown.startsWith(`# Spindle ${version}\n`))
    throw Error("Release note version mismatch");
  const features = markdown.split("## Features\n")[1]?.split(/\n## /)[0].trim();
  if (!features) throw Error("Missing Features section");
  notes[locale] = { features, markdown };
}
const assets = [];
for (const kind of ["Portable", "Setup"]) {
  const name = `Spindle-${version}-${kind}-x64.exe`,
    file = path.join("release", name);
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  assets.push({
    name,
    size: fs.statSync(file).size,
    sha256: hash.digest("hex"),
  });
}
fs.writeFileSync(
  `release/Spindle-${version}-release.json`,
  JSON.stringify({ version, assets, notes, unsigned: true }, null, 2) + "\n",
);
fs.writeFileSync(
  `release/SHA256SUMS-${version}.txt`,
  assets.map((a) => `${a.sha256}  ${a.name}`).join("\n") + "\n",
);
fs.writeFileSync(
  `release/Spindle-${version}-notes.md`,
  notes.en.markdown +
    "\n---\n\n" +
    notes["zh-TW"].markdown +
    "\n---\n\n" +
    notes["zh-CN"].markdown,
);
console.log(assets);
