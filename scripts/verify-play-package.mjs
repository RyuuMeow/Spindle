import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const directory = fs
  .readdirSync("node_modules/.pnpm")
  .find((n) => n.startsWith("@electron+asar@"));
const asar = require(
  path.resolve("node_modules/.pnpm", directory, "node_modules/@electron/asar"),
);
const resources = path.resolve(
  process.argv[2] || "release/play-preview/win-unpacked/resources",
);
const archive = path.join(resources, "app.asar");
const files = asar.listPackage(archive).map((p) => p.replaceAll("\\", "/"));
for (const name of [
  "/desktop/play-service.cjs",
  "/desktop/mcp-runtime.cjs",
  "/desktop/play-runtime/Spindle.Play.exe",
  "/desktop/play-runtime/coreclr.dll",
  "/licenses/play/dotnet-license.txt",
  "/licenses/play/csvhelper-apache-2.0.txt",
])
  assert(files.includes(name), name);
assert(files.some((f) => f.endsWith(".wasm")));
assert(files.some((f) => f.includes("worker") && f.endsWith(".js")));
assert.equal(
  files.some((f) =>
    /\/(outputs|profile|test-profile|examples|tests|sdk)\//i.test(f),
  ),
  false,
);
const textFiles = files.filter(
  (f) => /\.(cjs|js|json|md)$/.test(f) && !f.includes("/play-runtime/"),
);
for (const file of textFiles) {
  const text = asar
    .extractFile(archive, path.normalize(file.slice(1)))
    .toString("utf8");
  assert(
    !text.includes("The lantern is still burning."),
    `Test story in ${file}`,
  );
  assert(!text.includes("Hello 世界 👨‍👩‍👧‍👦"), `Test story in ${file}`);
  assert(!text.includes("BEGIN PRIVATE KEY"), `Private key marker in ${file}`);
}
const helper = path.join(
  resources,
  "app.asar.unpacked/desktop/play-runtime/Spindle.Play.exe",
);
assert(fs.existsSync(helper));
console.log(
  JSON.stringify(
    {
      files: files.length,
      helper: true,
      wasm: true,
      worker: true,
      notices: files.filter((f) => f.includes("/licenses/play/")),
      testResources: false,
    },
    null,
    2,
  ),
);
