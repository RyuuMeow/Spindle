import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

await import("./prepare-brand-assets.mjs");

const root = new URL("../", import.meta.url);
for (const file of ["main.cjs", "preload.cjs", "mcp-windows.cjs", "window-lifecycle.cjs"])
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("desktop/" + file, root))]);
const destination = new URL("dist-desktop/app/", root);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
await mkdir(new URL("desktop/", destination), { recursive: true });
await cp(
  new URL("desktop/main.cjs", root),
  new URL("desktop/main.cjs", destination),
);
await cp(
  new URL("desktop/window-lifecycle.cjs", root),
  new URL("desktop/window-lifecycle.cjs", destination),
);
await cp(
  new URL("desktop/system-fonts.cjs", root),
  new URL("desktop/system-fonts.cjs", destination),
);
await cp(new URL("desktop/mcp-windows.cjs", root), new URL("desktop/mcp-windows.cjs", destination));
await cp(
  new URL("desktop/preload.cjs", root),
  new URL("desktop/preload.cjs", destination),
);
await cp(
  new URL("desktop/icon.png", root),
  new URL("desktop/icon.png", destination),
);
await build({
  entryPoints: [
    new URL("desktop/workspace-service.ts", root).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: new URL(
    "desktop/workspace-service.cjs",
    destination,
  ).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  target: "node22",
});
const mcpBuild = await build({
  metafile: true,
  entryPoints: [fileURLToPath(new URL("desktop/mcp/runtime.ts", root))],
  bundle: true, platform: "node", format: "cjs", target: "node22",
  outfile: fileURLToPath(new URL("desktop/mcp-runtime.cjs", destination)),
});
// Bundle the license notices of dependencies actually included in the MCP runtime.
const notices = new Map();
for (const input of Object.keys(mcpBuild.metafile.inputs).filter(p => p.includes("node_modules/"))) {
  let folder = path.dirname(path.resolve(input));
  while (folder.includes("node_modules")) {
    try {
      const metadata = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
      if (metadata.name && metadata.version) {
        const key = metadata.name + "@" + metadata.version;
        if (!notices.has(key)) {
          const files = (await readdir(folder)).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name));
          const texts = await Promise.all(files.map(name => readFile(path.join(folder, name), "utf8")));
          notices.set(key, key + " (" + (metadata.license || "see package") + ")\n" + texts.join("\n"));
        }
        break;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    folder = path.dirname(folder);
  }
}
await mkdir(new URL("licenses/", destination), { recursive: true });
await writeFile(new URL("licenses/mcp-dependencies.txt", destination), [...notices.values()].join("\n\n---\n\n"));
for (const name of ["elkjs", "libavoid-js", "monaco-editor", "react", "react-dom", "@xyflow/react"]) {
  const directory = new URL("node_modules/" + name + "/", root);
  const files = (await readdir(directory)).filter(file => /^(license|licence|copying|notice|thirdpartynotices)(\.|$)/i.test(file));
  const texts = await Promise.all(files.map(file => readFile(new URL(file, directory), "utf8")));
  await writeFile(new URL("licenses/" + name.replaceAll("/", "-").replace("@", "") + ".txt", destination), name + "\n" + texts.join("\n\n"));
}
const stagedRenderer = new URL("dist-desktop/renderer/", destination);
const relativeStage = path.relative(
  fileURLToPath(destination),
  fileURLToPath(stagedRenderer),
);
if (relativeStage !== path.join("dist-desktop", "renderer"))
  throw Error("Unexpected renderer staging path");
// This is generated output below dist-desktop/app; never retain previous hashed bundles.
await rm(stagedRenderer, { recursive: true, force: true });
await cp(
  new URL("dist-desktop/renderer/", root),
  new URL("dist-desktop/renderer/", destination),
  { recursive: true },
);
await writeFile(
  new URL("package.json", destination),
  JSON.stringify(
    {
      name: "spindle",
      version: pkg.version,
      private: true,
      description: "Local-first Yarn Spinner dialogue editor",
      author: "Spindle",
      main: "desktop/main.cjs",
    },
    null,
    2,
  ),
);
