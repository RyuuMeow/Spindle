import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  out = path.resolve("outputs/tests/lifecycle-service.cjs");
fs.mkdirSync(path.dirname(out), { recursive: true });
buildSync({
  entryPoints: ["desktop/workspace-service.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { WorkspaceService } = require(out);
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-lifecycle-"));
  const options = {
    chooseFolder: async () => base,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  };
  let service = new WorkspaceService(path.join(base, "profile"), options);
  return {
    base,
    get service() {
      return service;
    },
    restart() {
      service.dispose();
      service = new WorkspaceService(path.join(base, "profile"), options);
      return service;
    },
    dispose() {
      service.dispose();
      assert(
        path
          .resolve(base)
          .startsWith(path.join(os.tmpdir(), "spindle-lifecycle-")),
      );
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}
test("startup stays empty; new project creates its own folder and strict metadata", async () => {
  const f = fixture();
  try {
    await f.service.request({ type: "bootstrap" });
    assert.equal(f.service.snapshot().projects.length, 0);
    const r = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Story",
    });
    const p = f.service.engine.project(r.projectId);
    assert.equal(p.root, path.join(f.base, "Story"));
    assert(fs.existsSync(path.join(p.root, ".spindle/project.json")));
    await assert.rejects(
      f.service.request({ type: "createProject", root: f.base, name: "Story" }),
      /已存在/,
    );
    await assert.rejects(
      f.service.request({ type: "createProject", root: f.base, name: ".." }),
      /有效/,
    );
    fs.writeFileSync(path.join(p.root, ".spindle/project.json"), "broken");
    assert.throws(() => f.service.openFolder(p.root), /設定無法/);
    assert.equal(
      fs.readFileSync(path.join(p.root, ".spindle/project.json"), "utf8"),
      "broken",
    );
  } finally {
    f.dispose();
  }
});
test("catalog recent removal is independent, rename keeps the folder, and reopen returns it", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 7; i++)
      await f.service.request({
        type: "createProject",
        root: f.base,
        name: "Story" + i,
      });
    let entries = f.service.snapshot().catalog;
    assert.equal(entries.length, 7);
    const e = entries[0];
    await f.service.request({
      type: "catalog",
      operation: "removeRecent",
      id: e.id,
    });
    assert.equal(
      f.service.snapshot().catalog.find((x) => x.id === e.id).recent,
      false,
    );
    await f.service.request({
      type: "catalog",
      operation: "rename",
      id: e.id,
      name: "Display name",
    });
    assert(fs.existsSync(e.root));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(e.root, ".spindle/project.json")))
        .name,
      "Display name",
    );
    f.service.openFolder(e.root);
    assert(f.service.snapshot().catalog.find((x) => x.id === e.id).recent);
    await f.service.request({ type: "catalog", operation: "remove", id: e.id });
    assert(!f.service.snapshot().catalog.some((x) => x.id === e.id));
    assert(fs.existsSync(e.root));
  } finally {
    f.dispose();
  }
});
test("file ownership uses the deepest known directory boundary; unknown files stay standalone", async () => {
  const f = fixture();
  try {
    const root = path.join(f.base, "Root"),
      nested = path.join(root, "Nested"),
      similar = root + "Other";
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(similar);
    for (const dir of [root, nested, similar])
      fs.writeFileSync(path.join(dir, "a.yarn"), "title: A\n---\nHello\n===");
    f.service.openFolder(root);
    const child = f.service.openFolder(nested);
    let r = await f.service.request({
      type: "openFiles",
      paths: [path.join(nested, "a.yarn")],
    });
    assert.equal(r.projectId, child.id);
    r = await f.service.request({
      type: "openFiles",
      paths: [path.join(similar, "a.yarn")],
    });
    const p = f.service.engine.project(r.projectId);
    assert.equal(p.kind, "standalone");
    assert(!fs.existsSync(path.join(similar, ".spindle")));
    const d = p.documents[0];
    f.service.engine.replace(p.id, d.id, "standalone saved", "edit");
    await f.service.request({ type: "save", projectId: p.id });
    assert.equal(fs.readFileSync(d.path, "utf8"), "standalone saved");
    f.service.engine.checkpoint(p.id, d.id, "test");
    await f.service.request({ type: "save", projectId: p.id });
    f.restart();
    r = await f.service.request({ type: "openFiles", paths: [d.path] });
    assert.equal(r.projectId, p.id);
    assert(f.service.engine.project(p.id).recovery.length);
  } finally {
    f.dispose();
  }
});
test("folder trash preserves binary assets and latest text, restores in place, purge survives restart", async () => {
  const f = fixture();
  try {
    const root = path.join(f.base, "Story"),
      dir = path.join(root, "Scenes");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.yarn"), "old");
    fs.writeFileSync(
      path.join(dir, "asset.bin"),
      Buffer.from([0, 1, 254, 255]),
    );
    const p = f.service.openFolder(root),
      d = p.documents[0];
    f.service.engine.replace(p.id, d.id, "latest", "edit");
    await f.service.request({
      type: "trashFolder",
      projectId: p.id,
      name: "Scenes",
    });
    assert(!fs.existsSync(dir));
    const e = p.recovery.find((x) => x.deleted);
    assert.equal(e.kind, "folder");
    assert(
      fs.existsSync(
        path.join(root, ".spindle/trash", e.id, "payload/asset.bin"),
      ),
    );
    await f.service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: e.id,
    });
    assert.equal(fs.readFileSync(path.join(dir, "a.yarn"), "utf8"), "latest");
    assert.deepEqual(
      fs.readFileSync(path.join(dir, "asset.bin")),
      Buffer.from([0, 1, 254, 255]),
    );
    assert(!p.recovery.some((x) => x.id === e.id));
    assert.equal(p.documents[0].id, d.id);
    await f.service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: d.id,
      deleteDisk: true,
    });
    const second = p.recovery.find((x) => x.deleted);
    await f.service.request({
      type: "purgeTrash",
      projectId: p.id,
      recoveryId: second.id,
    });
    f.restart();
    const reopened = f.service.openFolder(root);
    assert(!reopened.recovery.some((x) => x.deleted));
    assert(!fs.existsSync(path.join(dir, "a.yarn")));
  } finally {
    f.dispose();
  }
});
test("restoration never overwrites a replacement file and history migrates only once", async () => {
  const f = fixture();
  try {
    const root = path.join(f.base, "Story");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "a.yarn"), "old");
    let p = f.service.openFolder(root);
    const d = p.documents[0];
    f.service.engine.checkpoint(p.id, d.id, "history");
    await f.service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: d.id,
      deleteDisk: true,
    });
    const e = p.recovery.find((x) => x.deleted);
    fs.writeFileSync(path.join(root, "a.yarn"), "replacement");
    await f.service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: e.id,
    });
    assert.equal(
      fs.readFileSync(path.join(root, "a.yarn"), "utf8"),
      "replacement",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "a-recovered-2.yarn"), "utf8"),
      "old",
    );
    f.restart();
    p = f.service.openFolder(root);
    assert(!p.recovery.some((x) => x.id === e.id));
    assert(p.recovery.some((x) => x.reason === "history"));
  } finally {
    f.dispose();
  }
});
test("closing one scope ignores conflicts in another; explicit close clears auto-reopen target", async () => {
  const f = fixture();
  try {
    const create = async (name) => {
      const r = await f.service.request({
        type: "createProject",
        root: f.base,
        name,
      });
      return f.service.engine.project(r.projectId);
    };
    const a = await create("A"),
      b = await create("B");
    await f.service.request({
      type: "createDocument",
      projectId: a.id,
      name: "a.yarn",
      text: "A",
    });
    a.documents[0].status = "conflict";
    await f.service.request({ type: "preferences", reopenLastProject: true });
    await f.service.request({ type: "closeProject", projectId: b.id });
    assert.equal(f.service.catalog.preferences.lastProjectId, undefined);
    await assert.rejects(
      f.service.request({ type: "closeProject", projectId: a.id }),
    );
  } finally {
    f.dispose();
  }
});

test("inactive projects are not loaded, watched or snapshotted at startup", async () => {
  const f = fixture();
  try {
    const r = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Lazy",
    });
    const p = f.service.engine.project(r.projectId);
    await f.service.request({
      type: "createDocument",
      projectId: p.id,
      name: "a.yarn",
      text: "draft",
    });
    const doc = p.documents[0];
    f.service.engine.replace(p.id, doc.id, "unsaved cache", "test");
    f.service.persist();
    f.restart();
    assert.equal(f.service.snapshot().projects.length, 0);
    assert.equal(f.service.snapshot().catalog.length, 1);
    const reopened = f.service.openFolder(p.root);
    assert.equal(reopened.documents[0].text, "unsaved cache");
    f.service.flush(p.id);
    f.service.setActiveProjects([]);
    assert.equal(f.service.snapshot().projects.length, 0);
    assert.equal(
      f.service.openFolder(p.root).documents[0].text,
      "unsaved cache",
    );
  } finally {
    f.dispose();
  }
});

test("interrupted trash, restore and purge retain journals and retry without duplicates", async () => {
  const f = fixture(),
    rename = fs.renameSync;
  try {
    const r = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Journal",
    });
    let p = f.service.engine.project(r.projectId);
    await f.service.request({
      type: "createDocument",
      projectId: p.id,
      name: "a.yarn",
      text: "safe",
    });
    const doc = p.documents[0];
    const index = path.join(p.root, ".spindle/history/index.json");
    let fail = true;
    fs.renameSync = (from, to) => {
      if (fail && to === index) throw Error("index unavailable");
      return rename(from, to);
    };
    await assert.rejects(
      f.service.request({
        type: "removeDocument",
        projectId: p.id,
        documentId: doc.id,
        deleteDisk: true,
      }),
    );
    assert(fs.existsSync(doc.path));
    assert(p.documents.some((d) => d.id === doc.id));
    fail = false;
    await f.service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: doc.id,
      deleteDisk: true,
    });
    const entry = p.recovery.find((e) => e.deleted);
    fail = true;
    await assert.rejects(
      f.service.request({
        type: "recover",
        projectId: p.id,
        recoveryId: entry.id,
      }),
    );
    assert(fs.existsSync(doc.path));
    fail = false;
    await f.service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: entry.id,
    });
    assert.equal(p.documents.length, 1);
    assert(!p.recovery.some((e) => e.id === entry.id));
    await f.service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: doc.id,
      deleteDisk: true,
    });
    const second = p.recovery.find((e) => e.deleted);
    fail = true;
    await assert.rejects(
      f.service.request({
        type: "purgeTrash",
        projectId: p.id,
        recoveryId: second.id,
      }),
    );
    fail = false;
    f.restart();
    p = f.service.openFolder(p.root);
    assert(!p.recovery.some((e) => e.deleted));
    assert(!fs.existsSync(doc.path));
  } finally {
    fs.renameSync = rename;
    f.dispose();
  }
});

test("legacy history migrates once, rescue drafts map document identities, and purge spares commands", async () => {
  const f = fixture();
  try {
    await f.service.request({
      type: "bootstrap",
      legacy: {
        name: "Draft",
        documents: [{ name: "legacy.yarn", text: "hello", saved: "" }],
        commands: [],
      },
    });
    const legacy = f.service.snapshot().projects[0];
    f.service.engine.checkpoint(
      legacy.id,
      legacy.documents[0].id,
      "legacy history",
    );
    const r = await f.service.request({
      type: "migrateDraft",
      projectId: legacy.id,
      root: f.base,
      name: "Rescued",
    });
    const p = f.service.engine.project(r.projectId),
      d = p.documents[0];
    assert(
      p.recovery.some(
        (e) => e.documentId === d.id && e.reason === "legacy history",
      ),
    );
    assert(!f.service.engine.projects.some((p) => p.id === legacy.id));
    p.recovery.push({
      id: "commands",
      documentId: "@commands",
      text: "[]",
      at: Date.now(),
      reason: "before",
      name: "Commands",
    });
    await f.service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: d.id,
      deleteDisk: true,
    });
    await f.service.request({ type: "purgeTrash", projectId: p.id });
    assert(p.recovery.some((e) => e.id === "commands"));
    f.restart();
    const reopened = f.service.openFolder(p.root);
    assert(!reopened.recovery.some((e) => e.deleted));
    assert(reopened.recovery.some((e) => e.id === "commands"));
  } finally {
    f.dispose();
  }
});

test("copied project folders keep distinct project and document identities after reopening", async () => {
  const f = fixture();
  try {
    const r = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Original",
    });
    const original = f.service.engine.project(r.projectId);
    await f.service.request({
      type: "createDocument",
      projectId: original.id,
      name: "a.yarn",
      text: "A",
    });
    f.service.setActiveProjects([]);
    const copy = path.join(f.base, "Copy");
    fs.cpSync(original.root, copy, { recursive: true });
    const clone = f.service.openFolder(copy),
      reopened = f.service.openFolder(original.root);
    assert.notEqual(clone.id, reopened.id);
    assert.notEqual(clone.documents[0].id, reopened.documents[0].id);
    assert.equal(f.service.catalog.entries.length, 2);
  } finally {
    f.dispose();
  }
});

test("workspace cache failures only block the owning workspace", async () => {
  const f = fixture();
  try {
    const one = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "One",
    });
    const two = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Two",
    });
    const save = f.service.cache.save.bind(f.service.cache);
    f.service.cache.save = (project) => {
      if (project.id === two.projectId) throw Error("injected cache failure");
      save(project);
    };
    await f.service.request({ type: "closeProject", projectId: one.projectId });
    assert.equal(f.service.profileError, "");
    assert.match(
      f.service.engine.project(two.projectId).persistenceError,
      /cache failure/,
    );
    await assert.rejects(
      f.service.request({ type: "closeProject", projectId: two.projectId }),
      /cache failure/,
    );
    f.service.cache.save = save;
    await f.service.request({ type: "closeProject", projectId: two.projectId });
    assert.equal(
      f.service.engine.project(two.projectId).persistenceError,
      undefined,
    );
  } finally {
    f.dispose();
  }
});

test("quick registration is atomic, deduplicated and survives reopening", async () => {
  const f = fixture();
  try {
    const r = await f.service.request({
      type: "createProject",
      root: f.base,
      name: "Commands",
    });
    const projectId = r.projectId;
    const command = {
      name: "show_item",
      description: "",
      example: "<<show_item apple>>",
      params: [
        { name: "arg1", type: "string", required: true, defaultValue: "" },
      ],
    };
    await Promise.all([
      f.service.request({ type: "registerCommand", projectId, command }),
      f.service.request({ type: "registerCommand", projectId, command }),
      f.service.request({
        type: "registerCommand",
        projectId,
        command: { ...command, name: "show_other" },
      }),
    ]);
    assert.deepEqual(
      f.service.engine.project(projectId).commands.map((c) => c.name),
      ["show_item", "show_other"],
    );
    const root = f.service.engine.project(projectId).root;
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, ".spindle/project.json")))
        .commands.length,
      2,
    );
    f.restart();
    await f.service.request({ type: "openFolder", root });
    assert.equal(f.service.engine.project(projectId).commands.length, 2);
  } finally {
    f.dispose();
  }
});

test("appearance patches persist globally and do not reimport old sessions", async () => {
  const f = fixture();
  try {
    await Promise.all([
      f.service.request({
        type: "appearance",
        patch: { global: { fontSize: 22 } },
      }),
      f.service.request({
        type: "appearance",
        patch: { modes: { reader: { lineHeight: 2.1 } } },
      }),
    ]);
    await assert.rejects(
      f.service.request({
        type: "appearance",
        patch: { global: { fontSize: -1 } },
      }),
    );
    fs.writeFileSync(
      path.join(f.base, "profile", "windows-v2.json"),
      JSON.stringify({ old: { session: { readingSize: 28 } } }),
    );
    f.restart();
    const a = f.service.snapshot().preferences.editorAppearance;
    assert.equal(a.global.fontSize, 22);
    assert.equal(a.modes.reader.lineHeight, 2.1);
    assert.equal(a.modes.reader.fontSize, undefined);
  } finally {
    f.dispose();
  }
});
