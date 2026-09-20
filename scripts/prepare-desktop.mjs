import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

await import("./prepare-brand-assets.mjs");

const root = new URL("../", import.meta.url);
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
