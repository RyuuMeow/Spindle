import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  out = path.resolve("outputs/tests");
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
const {
  DocumentEngine,
  validateCommands,
  sourceEdits,
  difference,
  restoreProjects,
  monacoSourceEdits,
  applyTextEdits,
} = load("app/workspace/engine.ts");
const { readLegacy, restoreSession } = load("app/workspace/storage.ts");
const { WorkspaceService } = load("desktop/workspace-service.ts");
const { readingStructure } = load("app/reading/structure.ts");
const { renamedScene, sceneRange, validSceneName, uniqueSceneName } = load(
  "app/workspace/authoring.ts",
);
const { parse } = load("app/parser.ts");
test("temporary Windows rename locks retry without falling back to non-atomic overwrite", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    root = path.join(base, "project");
  fs.mkdirSync(root);
  const file = path.join(root, "a.yarn");
  fs.writeFileSync(file, "before");
  const originalRename = fs.renameSync;
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => root,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    const p = (await service.request({ type: "openFolder" })).snapshot
        .projects[0],
      d = p.documents[0];
    service.engine.replace(p.id, d.id, "after", "test");
    let attempts = 0;
    fs.renameSync = (from, to) => {
      if (to === file && attempts++ === 0)
        throw Object.assign(Error("temporarily locked"), { code: "EPERM" });
      return originalRename(from, to);
    };
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(fs.readFileSync(file, "utf8"), "before");
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(fs.readFileSync(file, "utf8"), "after");
    assert.equal(service.engine.document(p.id, d.id).status, "saved");
    assert.equal(attempts, 2);
  } finally {
    fs.renameSync = originalRename;
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test("profile write failure is never reported as a saved draft and can be retried", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    originalRename = fs.renameSync;
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => null,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    const p = (
        await service.request({
          type: "bootstrap",
          legacy: {
            name: "drafts",
            documents: [
              { name: "draft.yarn", text: "before", saved: "before" },
            ],
            commands: [],
          },
        })
      ).snapshot.projects[0],
      d = p.documents[0];
    service.engine.replace(p.id, d.id, "unsaved draft", "test");
    fs.renameSync = (from, to) => {
      if (to.endsWith("workspace-v2.json"))
        throw Object.assign(Error("profile full"), { code: "ENOSPC" });
      return originalRename(from, to);
    };
    const failures = service.flush();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].status, "error");
    assert(service.profileError.includes("profile full"));
    assert.equal(failures[0].text, "unsaved draft");
    fs.renameSync = originalRename;
    assert.equal(service.flush().length, 0);
    assert.equal(service.profileError, "");
    assert.equal(service.engine.document(p.id, d.id).status, "draft");
    assert(
      fs
        .readFileSync(path.join(base, "profile", "workspace-v2.json"), "utf8")
        .includes("unsaved draft"),
    );
  } finally {
    fs.renameSync = originalRename;
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("duplicate identifiers in project metadata do not prevent script recovery", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    root = path.join(base, "project");
  fs.mkdirSync(path.join(root, ".yarn-workbench"), { recursive: true });
  fs.writeFileSync(path.join(root, "a.yarn"), "A");
  fs.writeFileSync(path.join(root, "b.yarn"), "B");
  fs.writeFileSync(
    path.join(root, ".yarn-workbench", "project.json"),
    JSON.stringify({
      files: [
        { id: "same", name: "a.yarn" },
        { id: "same", name: "b.yarn" },
      ],
    }),
  );
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => root,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    const p = (await service.request({ type: "openFolder" })).snapshot
      .projects[0];
    assert.equal(p.documents.length, 2);
    assert.notEqual(p.documents[0].id, p.documents[1].id);
    assert(
      fs
        .readdirSync(path.join(base, "profile"))
        .some((name) => name.startsWith("project-config-recovery-")),
    );
  } finally {
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test("malformed nested editor layouts are rejected independently of documents", () => {
  const session = {
    projectId: "p",
    tabs: [
      {
        id: "tab",
        documentId: "a",
        mode: "graph",
        line: 1,
        column: 1,
        graph: { undo: { bad: true } },
      },
    ],
    closedTabs: [],
  };
  assert.throws(() => restoreSession(session, "window", "p"), /圖表布局/);
  session.tabs[0].graph = {
    positions: { a: { x: 12, y: 45 } },
    undo: [],
    redo: [],
  };
  assert.equal(restoreSession(session, "window", "p").tabs[0].documentId, "a");
  session.tabs[0].selection = { anchor: "broken", head: 2 };
  assert.throws(() => restoreSession(session, "window", "p"), /選取/);
});

test("disk-full and read-only failures retain source and draft, then retry successfully", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    root = path.join(base, "project");
  fs.mkdirSync(root);
  const file = path.join(root, "a.yarn");
  fs.writeFileSync(file, "original");
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => root,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  const originalRename = fs.renameSync;
  try {
    const p = (await service.request({ type: "openFolder" })).snapshot
        .projects[0],
      d = p.documents[0];
    service.engine.replace(p.id, d.id, "retained draft", "test");
    fs.renameSync = (from, to) => {
      if (to === file)
        throw Object.assign(Error("no space left on device"), {
          code: "ENOSPC",
        });
      return originalRename(from, to);
    };
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(service.engine.document(p.id, d.id).status, "error");
    assert.equal(fs.readFileSync(file, "utf8"), "original");
    assert(
      fs
        .readFileSync(path.join(base, "profile", "workspace-v2.json"), "utf8")
        .includes("retained draft"),
    );
    assert(!fs.readdirSync(root).some((name) => name.endsWith(".tmp")));
    fs.renameSync = originalRename;
    fs.chmodSync(file, 0o444);
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(service.engine.document(p.id, d.id).status, "error");
    assert.equal(fs.readFileSync(file, "utf8"), "original");
    fs.chmodSync(file, 0o666);
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(service.engine.document(p.id, d.id).status, "saved");
    assert.equal(fs.readFileSync(file, "utf8"), "retained draft");
    const cancelled = await service.request({
      type: "export",
      projectId: p.id,
    });
    assert.equal(cancelled.cancelled, true);
  } finally {
    fs.renameSync = originalRename;
    fs.chmodSync(file, 0o666);
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test("Monaco multiple ranges preserve BOM and untouched mixed line endings", () => {
  const source = "\ufeffA\r\nB\nC\r\n";
  const changes = [
    {
      range: {
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 2,
      },
      text: "Z",
    },
    {
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
      },
      text: "X",
    },
  ];
  assert.equal(
    applyTextEdits(source, monacoSourceEdits(source, changes)),
    "\ufeffX\r\nB\nZ\r\n",
  );
});
test("whole-document replacement and undo retain every CRLF and BOM byte", () => {
  const p = project(),
    original = "\ufefftitle: A\r\n---\r\nA: text\r\n===\r\n";
  p.documents[0].text = original;
  p.documents[0].saved = original;
  const engine = new DocumentEngine([p]);
  engine.replace("p", "a", "title: B\r\n---\r\nnew\r\n===", "paste");
  engine.undo("p", "a");
  assert.equal(engine.document("p", "a").text, original);
  engine.undo("p", "a", true);
  assert.equal(engine.document("p", "a").text, "title: B\r\n---\r\nnew\r\n===");
});
test("scene rename changes only static unquoted references and preserves the file BOM", () => {
  const p = project();
  p.documents[0].text =
    '\ufefftitle: jump\r\n---\r\n<<jump\tjump>>\r\n<<say "<<jump jump>>">>\r\n// <<jump jump>>\r\n===\r\n';
  p.documents[1].text = "title: NewScene2\n---\n<<detour jump>>\n===\n";
  const node = parse(p.documents, []).nodes[0],
    result = renamedScene(p, node, "After");
  assert.equal(result.references, 2);
  const engine = new DocumentEngine([p]);
  engine.transaction("p", "rename", result.documents);
  assert(p.documents[0].text.startsWith("\ufefftitle: After"));
  assert(p.documents[0].text.includes("<<jump\tAfter>>"));
  assert(p.documents[0].text.includes('<<say "<<jump jump>>">>'));
  assert.equal(sceneRange(p.documents[0].text, node).from, 1);
  assert.equal(validSceneName("_Start"), false);
  assert.equal(uniqueSceneName(p, "NewScene2"), "NewScene22");
  engine.undo("p", "b");
  assert(p.documents[0].text.startsWith("\ufefftitle: jump"));
});
const { ChangeSet } = require("@codemirror/state");
test("damaged command settings and layout preserve valid documents", () => {
  const p = project();
  p.commands = [{ name: "broken" }];
  const restored = restoreProjects([p]);
  assert.equal(restored.projects[0].documents.length, 2);
  assert.deepEqual(restored.projects[0].commands, []);
  assert.equal(restored.warnings.length, 1);
});
test("reading regions retain source ranges, common continuation and unknown syntax", () => {
  const text =
      "title: Start\n---\n<<if $a>>\n  -> one\n    <<if $b>>\n      A: repeat\n    <<endif>>\n  -> two\n    A: repeat\n  A: common\n<<endif>>\n<<unknown $v>>\n===",
    lines = readingStructure(text);
  assert(lines.every((l) => text.slice(l.from, l.to) === l.text));
  assert.equal(lines.find((l) => l.text.includes("common")).optionEnd, true);
  assert.equal(lines.find((l) => l.text.includes("if $b")).depth, 2);
  assert.equal(lines.find((l) => l.command === "unknown").kind, "command");
  const unfinished = readingStructure("title: Start\n---\n<<if $a>>\nA: text");
  assert(unfinished.filter((l) => l.line >= 3).every((l) => !l.valid));
});
test("native autosave defers composition and never recreates an externally deleted file", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    root = path.join(base, "project");
  fs.mkdirSync(root);
  const file = path.join(root, "a.yarn");
  fs.writeFileSync(file, "initial");
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => root,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    const p = (await service.request({ type: "openFolder" })).snapshot
        .projects[0],
      d = p.documents[0];
    await service.request({
      type: "composition",
      projectId: p.id,
      documentId: d.id,
      active: true,
    });
    await service.request({
      type: "edit",
      projectId: p.id,
      documentId: d.id,
      version: 0,
      updates: [
        {
          clientID: "ime",
          changes: ChangeSet.of({ from: 7, insert: "中文" }, 7).toJSON(),
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 950));
    assert.equal(fs.readFileSync(file, "utf8"), "initial");
    await service.request({
      type: "composition",
      projectId: p.id,
      documentId: d.id,
      active: false,
    });
    await new Promise((r) => setTimeout(r, 950));
    assert.equal(fs.readFileSync(file, "utf8"), "initial中文");
    fs.unlinkSync(file);
    service.engine.replace(p.id, d.id, "retained", "test");
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(fs.existsSync(file), false);
    assert.equal(service.engine.document(p.id, d.id).text, "retained");
    assert.equal(service.engine.document(p.id, d.id).status, "missing");
  } finally {
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test("Save As binds a new disk document and command snapshots restore definitions", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-"));
  let chosen = path.join(base, "new.yarn");
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => base,
    chooseFiles: async () => [],
    saveDialog: async () => chosen,
    reveal: () => {},
    changed: () => {},
  });
  try {
    let r = await service.request({
      type: "bootstrap",
      legacy: {
        name: "drafts",
        documents: [{ name: "draft.yarn", text: "draft", saved: "draft" }],
        commands: [],
      },
    });
    const p = r.snapshot.projects[0],
      d = p.documents[0];
    r = await service.request({
      type: "saveAs",
      projectId: p.id,
      documentId: d.id,
    });
    const native = service.engine.document(r.projectId, r.documentId);
    assert.equal(native.path, chosen);
    service.engine.replace(r.projectId, r.documentId, "changed", "test");
    await service.request({
      type: "save",
      projectId: r.projectId,
      documentId: r.documentId,
    });
    assert.equal(fs.readFileSync(chosen, "utf8"), "changed");
    const cmd = { name: "test", description: "", example: "", params: [] };
    await service.request({
      type: "commands",
      projectId: p.id,
      commands: [cmd],
    });
    await service.request({ type: "commands", projectId: p.id, commands: [] });
    const entry = service.engine.project(p.id).recovery.at(-1);
    await service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: entry.id,
    });
    assert.deepEqual(service.engine.project(p.id).commands, [cmd]);
    chosen = native.path;
    await assert.rejects(
      service.request({ type: "saveAs", projectId: p.id, documentId: d.id }),
    );
    assert.equal(fs.readFileSync(chosen, "utf8"), "changed");
  } finally {
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
function project() {
  return {
    id: "p",
    name: "test",
    documents: [
      {
        id: "a",
        name: "a.yarn",
        text: "abc",
        saved: "abc",
        status: "draft",
        version: 0,
      },
      {
        id: "b",
        name: "b.yarn",
        text: "two",
        saved: "two",
        status: "draft",
        version: 0,
      },
    ],
    commands: [],
    excluded: [],
    recovery: [],
  };
}
test("corrupt layout cannot erase documents or empty projects", () => {
  for (const documents of [
    [],
    [{ name: "a.yarn", text: "mine", saved: "mine" }],
  ]) {
    const map = new Map([
      ["yarn-workbench.documents.v1", JSON.stringify(documents)],
      ["yarn-workbench.layout.v1", "broken"],
    ]);
    const storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    };
    const result = readLegacy(storage);
    assert.deepEqual(result.documents, documents);
    assert.equal(result.errors.length, 1);
    assert.equal(map.get("yarn-workbench.layout.v1"), "broken");
  }
});
test("concurrent versioned insertions survive and retransmission deduplicates", () => {
  const engine = new DocumentEngine([project()]),
    u1 = {
      clientID: "one",
      changes: ChangeSet.of({ from: 0, insert: "X" }, 3).toJSON(),
    },
    u2 = {
      clientID: "two",
      changes: ChangeSet.of({ from: 3, insert: "Y" }, 3).toJSON(),
    };
  engine.edit("p", "a", 0, [u1]);
  engine.edit("p", "a", 0, [u2]);
  assert.equal(engine.document("p", "a").text, "XabcY");
  engine.edit("p", "a", 0, [u1]);
  assert.equal(engine.document("p", "a").text, "XabcY");
});
test("cross-file transactions undo atomically and reject stale changes", () => {
  const engine = new DocumentEngine([project()]);
  engine.transaction("p", "rename", [
    { id: "a", version: 0, edits: difference("abc", "new") },
    { id: "b", version: 0, edits: difference("two", "next") },
  ]);
  engine.undo("p", "b");
  assert.equal(engine.document("p", "a").text, "abc");
  assert.equal(engine.document("p", "b").text, "two");
  engine.undo("p", "a", true);
  assert.equal(engine.document("p", "b").text, "next");
  assert.throws(() =>
    engine.transaction("p", "stale", [{ id: "a", version: 0, edits: [] }]),
  );
});

test("history restoration rejects a stale preview without overwriting a peer edit", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-"));
  const service = new WorkspaceService(base, {
    chooseFolder: async () => null,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    service.engine.projects.push(project());
    const p = service.engine.project("p");
    const d = service.engine.create(p.id, "draft.yarn", "original");
    const entry = service.engine.checkpoint(p.id, d.id, "before edit");
    service.engine.replace(p.id, d.id, "current", "edit");
    const previewVersion = d.version;
    service.engine.replace(p.id, d.id, "peer update", "peer");
    await assert.rejects(
      service.request({
        type: "recover",
        projectId: p.id,
        recoveryId: entry.id,
        expectedVersion: previewVersion,
        expectedText: "current",
      }),
      /內容已變更/,
    );
    assert.equal(d.text, "peer update");
    const before = d.version;
    await service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: entry.id,
      expectedVersion: before,
      expectedText: "peer update",
    });
    assert.equal(d.text, "original");
    assert(p.recovery.some((item) => item.text === "peer update"));
  } finally {
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test("source mapping retains existing CRLF and inserted newline style", () => {
  assert.deepEqual(
    sourceEdits("\ufeffa\r\nb\r\n", [{ from: 3, to: 4, insert: "c\nd" }]),
    [{ from: 4, to: 5, insert: "c\r\nd" }],
  );
});
test("native disk saves preserve BOM, detect conflict, keep deletion, and restore snapshots", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "yarn-workbench-test-")),
    root = path.join(base, "project");
  fs.mkdirSync(root);
  const file = path.join(root, "a.yarn");
  fs.writeFileSync(file, "\ufefftitle: A\r\n---\r\nHello\r\n===");
  let chosen = root;
  const service = new WorkspaceService(path.join(base, "profile"), {
    chooseFolder: async () => chosen,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal: () => {},
    changed: () => {},
  });
  try {
    let r = await service.request({ type: "openFolder" });
    const p = r.snapshot.projects[0],
      d = p.documents[0];
    service.engine.replace(p.id, d.id, d.text.replace("Hello", "Hi"), "test");
    await service.request({ type: "save", projectId: p.id, documentId: d.id });
    assert.equal(fs.readFileSync(file, "utf8"), d.text.replace("Hello", "Hi"));
    service.engine.replace(p.id, d.id, "local", "test");
    fs.writeFileSync(file, "external");
    r = await service.request({
      type: "save",
      projectId: p.id,
      documentId: d.id,
    });
    assert.equal(r.snapshot.projects[0].documents[0].status, "conflict");
    assert.equal(fs.readFileSync(file, "utf8"), "external");
    await service.request({
      type: "resolve",
      projectId: p.id,
      documentId: d.id,
      choice: "local",
    });
    assert.equal(fs.readFileSync(file, "utf8"), "local");
    await service.request({
      type: "removeDocument",
      projectId: p.id,
      documentId: d.id,
      deleteDisk: true,
    });
    assert.equal(fs.existsSync(file), false);
    const entry = service.snapshot().projects[0].recovery.at(-1);
    await service.request({
      type: "recover",
      projectId: p.id,
      recoveryId: entry.id,
    });
    assert.equal(fs.readFileSync(file, "utf8"), "local");
    assert.throws(() => service.openFolder(path.join(base, "missing")));
  } finally {
    service.dispose();
    assert(
      path
        .resolve(base)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "yarn-workbench-test-",
        ),
    );
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("command presentation metadata remains optional and survives restore", () => {
  const legacy = {
    name: "fade_in",
    description: "Fade",
    params: [
      { name: "duration", type: "number", required: true, defaultValue: "" },
    ],
    example: "<<fade_in 1>>",
  };
  assert.doesNotThrow(() => validateCommands([legacy]));
  const command = {
    ...legacy,
    displayName: "淡入",
    params: [
      { ...legacy.params[0], displayName: "秒數", description: "淡入耗時" },
    ],
  };
  assert.doesNotThrow(() => validateCommands([command]));
  const result = restoreProjects([
    {
      id: "p",
      name: "P",
      documents: [],
      commands: [command],
      excluded: [],
      recovery: [],
    },
  ]);
  assert.deepEqual(result.projects[0].commands, [command]);
  assert.throws(() => validateCommands([{ ...command, displayName: 42 }]));
  assert.throws(() =>
    validateCommands([
      { ...command, params: [{ ...command.params[0], description: {} }] },
    ]),
  );
});


test("top insertion keeps visible order, folder scope and concurrently added files", () => {
  const p = project(), engine = new DocumentEngine([p]);
  p.documents[0].name = "folder/A.yarn";
  p.documents[1].name = "folder/B.yarn";
  const outside = engine.create(p.id, "other/C.yarn", "outside");
  const peer = engine.create(p.id, "folder/Peer.yarn", "peer");
  const created = engine.create(p.id, "folder/New.yarn", "new", [outside.id, "b", "a"]);
  assert.deepEqual(p.documents.map(d => d.id), [outside.id, created.id, "b", "a", peer.id]);
  assert.equal(p.documents.find(d => d.id === peer.id).text, "peer");
  const ids = p.documents.map(d => d.id);
  assert.throws(() => engine.create(p.id, "folder/New.yarn", "bad", ids));
  assert.deepEqual(p.documents.map(d => d.id), ids);
});
