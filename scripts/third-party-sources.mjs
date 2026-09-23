import fs from "node:fs";
import { createHash } from "node:crypto";
const sources = JSON.parse(fs.readFileSync("third-party-sources.json", "utf8"));
fs.mkdirSync("release", { recursive: true });
for (const entry of sources) {
  const file = `release/${entry.name}-source.zip`;
  let data = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!data) {
    const response = await fetch(entry.url);
    if (!response.ok) throw Error(`Source download failed: ${entry.name}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(data).digest("hex") !== entry.sha256)
    throw Error(`Source checksum mismatch: ${entry.name}`);
  fs.writeFileSync(file, data);
  console.log(entry.name);
}
