import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
const require = createRequire(import.meta.url);
function load(file) {
  const out = path.resolve(
    "outputs/tests/play-" + path.basename(file) + ".cjs",
  );
  buildSync({
    entryPoints: [file],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return require(out);
}
const { previewStage, commandArguments, mapPlaySource } = load(
  "app/play/presentation.ts",
);
const { emptyPreview, previewSchema } = load("app/play/types.ts");
const { PreviewResourcesStore } = load("desktop/preview-resources.ts");
const { PlayProcess } = load("desktop/play-process.ts");

test("missing or closed helper rejects work without an unhandled pipe error", async () => {
  const failures = [];
  const helper = new PlayProcess(path.resolve("outputs/not-a-runtime.exe"), message => failures.push(message));
  await assert.rejects(helper.request({ action: "state" }), /PLAY_HELPER_/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(failures.includes("PLAY_HELPER_UNAVAILABLE"));
  await assert.rejects(helper.request({ action: "next" }), /PLAY_HELPER_CLOSED/);
  helper.close();
});
test("declarative effects replay and rewind without executing arbitrary commands", () => {
  const config = emptyPreview();
  config.backgrounds.hall = "a".repeat(64) + ".png";
  config.characters.push({
    name: "Mira",
    displayName: "Mira",
    color: "#ffffff",
    portraits: {},
    sprites: {},
  });
  config.bindings = [
    {
      command: "scene",
      effect: "background",
      assetArgument: 0,
      characterArgument: 0,
      position: "center",
      fade: true,
    },
    {
      command: "portrait",
      effect: "show",
      assetArgument: 1,
      characterArgument: 0,
      position: "left",
      fade: false,
    },
    {
      command: "hide",
      effect: "hide",
      assetArgument: 1,
      characterArgument: 0,
      position: "left",
      fade: false,
    },
  ];
  const events = [
    "scene hall",
    'portrait Mira "happy face"',
    "arbitrary_system_command",
    "hide Mira",
  ].map((text, i) => ({ kind: "command", text, id: i }));
  assert.equal(previewStage(events, config).cast.left, undefined);
  assert.equal(previewStage(events, config).expressions.Mira, "happy face");
  assert.equal(
    previewStage(events.slice(0, 2), config).cast.left.expression,
    "happy face",
  );
  assert.equal(previewStage([], config).background, undefined);
  assert.deepEqual(commandArguments('give "a b" 3'), ["give", "a b", "3"]);
});
test("source mapping uses unchanged ranges and never guesses duplicate edited text", () => {
  const old = "title: Start\n---\nMira: Hello 😀\n===",
    source = {
      from: old.indexOf("Mira:"),
      line: 3,
      column: 1,
      documentId: "doc",
      version: 1,
    };
  assert.equal(
    mapPlaySource(source, old, "// inserted\n" + old),
    source.from + 12,
  );
  assert.equal(
    mapPlaySource(source, old, old.replace("Hello", "Goodbye")),
    null,
  );
  assert.equal(mapPlaySource(source, old, old), source.from);
});
test("project preview storage validates references, preserves versions, rejects malformed files", () => {
  const root = fs.mkdtempSync(path.resolve("outputs/tests/preview-")),
    store = new PreviewResourcesStore();
  const project = {
    id: "a",
    name: "A",
    root,
    kind: "project",
    documents: [{ text: "title: Start\n---\nMira: Hi\n===", name: "a.yarn" }],
    commands: [],
  };
  assert.deepEqual(store.read(project).speakers, ["Mira"]);
  const config = emptyPreview(),
    saved = store.save(project, config);
  assert.equal(saved.config.revision, 1);
  assert.throws(() => store.save(project, config), /VERSION_CONFLICT/);
  assert.throws(() =>
    previewSchema.parse({
      ...saved.config,
      backgrounds: { a: "../../private.png" },
    }),
  );
  fs.writeFileSync(path.join(root, ".spindle", "preview.json"), "broken");
  assert.throws(() => store.save(project, saved.config));
  assert.equal(
    fs.readFileSync(path.join(root, ".spindle", "preview.json"), "utf8"),
    "broken",
  );
  assert.throws(
    () => store.save({ ...project, kind: "standalone" }, emptyPreview()),
    /REQUIRES_PROJECT/,
  );
});
