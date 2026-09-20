import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
const require = createRequire(import.meta.url),
  out = path.resolve("outputs/tests/tree");
fs.mkdirSync(out, { recursive: true });
function load(entry) {
  const target = path.join(out, path.basename(entry) + ".cjs");
  buildSync({
    entryPoints: [entry],
    outfile: target,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return require(target);
}
const { WorkspaceService } = load("desktop/workspace-service.ts");
const { planTreeMove, applyTreeMove, treeEntries, addFolder, validFolderName } =
  load("app/workspace/file-tree.ts");
const { makeProject } = load("app/workspace/types.ts");
function fixture() {
  const p = makeProject("tree", [
    { name: "One.yarn", text: "one", saved: "one" },
    { name: "Chapter/Two.yarn", text: "two", saved: "two" },
  ]);
  p.folders = ["Chapter", "Empty"];
  return p;
}
test("file moves between folders, order is relative to the target, identities and source stay intact", () => {
  const p = fixture(),
    d = p.documents[1],
    id = d.id;
  applyTreeMove(
    p,
    planTreeMove(p, "file:" + id, "", undefined, "file:" + p.documents[0].id),
  );
  assert.equal(d.name, "Two.yarn");
  assert.equal(d.text, "two");
  assert.equal(d.id, id);
  assert.ok(
    treeEntries(p, "").findIndex((e) => e.key === "file:" + id) <
      treeEntries(p, "").findIndex(
        (e) => e.key === "file:" + p.documents[0].id,
      ),
  );
  applyTreeMove(p, planTreeMove(p, "file:" + id, "Empty"));
  assert.equal(d.name, "Empty/Two.yarn");
});
test("folder moves preserve descendants and sibling order through rename; cycles and collisions reject without changes", () => {
  const p = fixture();
  addFolder(p, "Chapter/Sub");
  const d = p.documents[1];
  applyTreeMove(p, planTreeMove(p, "folder:Chapter", "Empty"));
  assert.equal(d.name, "Empty/Chapter/Two.yarn");
  assert.ok(p.folders.includes("Empty/Chapter/Sub"));
  const before = JSON.stringify(p);
  assert.throws(() => planTreeMove(p, "folder:Empty", "Empty/Chapter"));
  assert.equal(JSON.stringify(p), before);
  assert.throws(() => addFolder(p, "empty"));
  assert.throws(() => planTreeMove(p, "file:" + d.id, "", "One.yarn"));
  for (const name of [
    "../x",
    ".git",
    ".yarn-workbench",
    "node_modules",
    "a/../b",
    "CON",
  ])
    assert.equal(validFolderName(name), false, name);
});
test("disk folders and mixed order survive a fresh profile; failed moves/trash preserve originals", async () => {
  const base = fs.mkdtempSync(path.join(out, "disk-")),
    root = path.join(base, "project"),
    profile = path.join(base, "profile");
  fs.mkdirSync(path.join(root, "A"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "A", "story.yarn"),
    "\ufefftitle: One\r\n---\r\nMira: unchanged\r\n===",
  );
  fs.writeFileSync(path.join(root, "root.yarn"), "title: Root\n---\n===");
  let failTrash = true;
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (
      failTrash &&
      from === path.join(root, "Empty") &&
      to.endsWith("payload")
    )
      throw Error("trash unavailable");
    return rename(from, to);
  };
  const services = {
    chooseFolder: async () => root,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
    trash: async (file) => {
      if (failTrash) throw Error("trash unavailable");
      fs.renameSync(file, path.join(base, "trashed"));
    },
  };
  let service = new WorkspaceService(profile, services);
  try {
    let p = (await service.request({ type: "openFolder" })).snapshot
        .projects[0],
      id = p.id,
      d = p.documents.find((d) => d.name === "A/story.yarn"),
      source = d.text;
    await service.request({
      type: "createFolder",
      projectId: id,
      name: "Empty",
    });
    assert.ok(fs.statSync(path.join(root, "Empty")).isDirectory());
    await service.request({
      type: "moveEntry",
      projectId: id,
      entry: "folder:A",
      parent: "Empty",
    });
    assert.equal(service.engine.document(id, d.id).name, "Empty/A/story.yarn");
    assert.equal(
      fs.readFileSync(path.join(root, "Empty", "A", "story.yarn"), "utf8"),
      source,
    );
    await assert.rejects(
      service.request({
        type: "moveEntry",
        projectId: id,
        entry: "file:" + d.id,
        parent: "",
        name: "root.yarn",
      }),
    );
    assert.ok(fs.existsSync(path.join(root, "Empty", "A", "story.yarn")));
    await service.request({
      type: "moveEntry",
      projectId: id,
      entry: "file:" + d.id,
      parent: "",
      before: "folder:Empty",
    });
    assert.equal(
      fs.readFileSync(path.join(root, "story.yarn"), "utf8"),
      source,
    );
    await assert.rejects(
      service.request({ type: "trashFolder", projectId: id, name: "Empty" }),
    );
    assert.ok(fs.existsSync(path.join(root, "Empty")));
    assert.ok(service.engine.project(id).folders.includes("Empty"));
    const order = service.engine.project(id).treeOrder;
    service.dispose();
    service = new WorkspaceService(path.join(base, "fresh-profile"), services);
    p = (await service.request({ type: "openFolder" })).snapshot.projects[0];
    assert.deepEqual(p.treeOrder, order);
    assert.ok(p.folders.includes("Empty/A"));
    assert.equal(p.documents.find((x) => x.name === "story.yarn").id, d.id);
    failTrash = false;
    await service.request({
      type: "trashFolder",
      projectId: p.id,
      name: "Empty",
    });
    assert.ok(fs.readdirSync(path.join(root, ".yarn-workbench/trash")).length);
    assert.ok(!service.engine.project(p.id).folders.includes("Empty"));
  } finally {
    fs.renameSync = rename;
    service.dispose();
  }
});
