import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const require = createRequire(import.meta.url);
function load(entry) {
  const outfile = path.resolve(
    "outputs/tests/mcp-" + path.basename(entry) + ".cjs",
  );
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return require(outfile);
}
const { WorkspaceService } = load("desktop/workspace-service.ts");
const { AgentApplication } = load("desktop/mcp/application.ts");
const { McpRuntime } = load("desktop/mcp/runtime.ts");
const { parse } = load("app/parser.ts");
const { readerRuns } = load("app/mcp/reader-context.ts");
const { offsetAt, positionAt } = load("app/mcp/coordinates.ts");
const agentWindows = require("../desktop/mcp-windows.cjs");
async function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-mcp-test-"));
  const profile = path.join(base, "profile");
  fs.mkdirSync(profile);
  const roots = ["A", "B"].map((name) => {
    const root = path.join(base, name);
    fs.mkdirSync(root);
    fs.writeFileSync(
      path.join(root, "sample.yarn"),
      "title: Start\r\n---\r\n<<declare $gold = 0>>\r\n<<set $gold = wrong>>\r\nNarrator: Hello 😀 世界\r\n<<jump End>>\r\n===\r\ntitle: End\r\n---\r\nNarrator: End\r\n===\r\n",
    );
    return root;
  });
  const service = new WorkspaceService(profile, {
    chooseFolder: async () => null,
    chooseFiles: async () => [],
    saveDialog: async () => null,
    reveal() {},
    changed() {},
  });
  const projects = [];
  for (const root of roots) {
    const r = await service.request({ type: "openFolder", root });
    projects.push(service.engine.project(r.projectId));
  }
  service.setActiveProjects(projects.map((p) => p.id));
  let entries = projects.map((p, i) => ({
    editorSessionId: "session-" + i,
    windowId: "window-" + i,
    projectId: p.id,
    projectName: p.name,
    kind: "project",
    focused: i === 0,
    lastFocusedAt: i,
    tabs: [
      {
        id: "tab-" + i,
        documentId: p.documents[0].id,
        name: p.documents[0].name,
        mode: "source",
      },
    ],
    activeTabId: "tab-" + i,
  }));
  const state = {
    pending: [],
    local: null,
    page: "document",
    selection: null,
    focus: [],
    beforeCapture: null,
  };
  const host = {
    list: () => entries,
    async request(id) {
      if (state.beforeCapture) await state.beforeCapture();
      const s = entries.find((e) => e.editorSessionId === id);
      if (!s) throw Error("EDITOR_SESSION_EXPIRED");
      const p = service.engine.project(s.projectId),
        d = p.documents[0],
        at = d.text.indexOf("Hello");
      return {
        projectId: p.id,
        tabId: s.activeTabId,
        page: state.page,
        documentId: state.page === "document" ? d.id : undefined,
        lastDocumentId: d.id,
        mode: "source",
        pendingDocumentIds: state.pending,
        capture:
          state.page === "document"
            ? {
                documentName: d.name,
                source: state.local ?? d.text,
                selections: state.selection || [{ anchor: at + 5, head: at }],
                visibleRanges: [{ from: 0, to: d.text.length }],
              }
            : undefined,
      };
    },
    focus(id) {
      state.focus.push(id);
    },
    async open(projectId) {
      return entries.filter((e) => e.projectId === projectId);
    },
  };
  const app = new AgentApplication(service, host, () => true);
  const ctx = () =>
    app.execute("get_editor_context", { editorSessionId: "session-0" });
  t.after(() => service.dispose());
  return {
    app,
    service,
    projects,
    state,
    host,
    profile,
    ctx,
    replaceEntries: (values) => {
      entries = values;
    },
  };
}
test("context maps original CRLF and reverse selections; utility pages never expose drafts", async (t) => {
  const f = await fixture(t),
    c = await f.ctx();
  assert.equal(c.selections[0].text, "Hello");
  assert(c.selections[0].anchor > c.selections[0].head);
  assert.equal(c.cursor.line, 5);
  f.state.page = "settings";
  const settings = await f.ctx();
  assert.equal(settings.page, "settings");
  assert.equal(settings.document, null);
  assert.equal(settings.surrounding, null);
  assert(settings.lastDocumentId);
});
test("Monaco coordinates preserve CRLF, BOM and UTF-16 surrogate offsets", () => {
  const source = "\ufefftitle: X\r\n---\r\nMira: 😀 好\r\n===";
  for (const offset of [
    1,
    source.indexOf("Mira"),
    source.indexOf("好"),
    source.length,
  ])
    assert.equal(offsetAt(source, positionAt(source, offset)), offset);
  assert.equal(
    offsetAt(source, { lineNumber: 3, column: 7 }),
    source.indexOf("😀"),
  );
});
test("reader displayed runs retain exact source offsets across hidden commands/tags", () => {
  const source = "  Mira: hi <<pause>> world #tag";
  const runs = readerRuns(source, "dialogue");
  assert.equal(runs.map((r) => r.text).join(""), "Mira: hi  world");
  for (const r of runs) assert.equal(source.slice(r.from, r.to), r.text);
});
test("independent explicit targets and closed identities never fall back", async (t) => {
  const f = await fixture(t);
  const a = await f.ctx();
  await f.app.execute("activate_editor_session", {
    editorSessionId: "session-1",
  });
  assert.deepEqual(f.state.focus, []);
  assert.equal((await f.ctx()).projectId, a.projectId);
  await f.app.execute("activate_editor_session", {
    editorSessionId: "session-1",
    focus: true,
  });
  assert.deepEqual(f.state.focus, ["session-1"]);
  f.replaceEntries(
    f.host.list().filter((e) => e.editorSessionId !== "session-0"),
  );
  await assert.rejects(f.ctx(), /EXPIRED/);
});
test("selection moves do not redirect snapshot edits; one transaction Undo restores the batch", async (t) => {
  const f = await fixture(t),
    c = await f.ctx(),
    d = f.projects[0].documents[0];
  f.state.selection = [{ anchor: 0, head: 5 }];
  const call = {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    operationId: "edit-1",
    change: {
      kind: "edits",
      documents: [
        {
          id: d.id,
          version: d.version,
          edits: [
            {
              from: c.selections[0].from,
              to: c.selections[0].to,
              insert: "Welcome",
            },
          ],
        },
      ],
    },
  };
  const before = d.text;
  const result = await f.app.execute("apply_changes", call);
  assert.equal(result.applied, true);
  assert(d.text.includes("Welcome"));
  const version = d.version;
  assert.deepEqual(await f.app.execute("apply_changes", call), result);
  assert.equal(d.version, version);
  await assert.rejects(
    f.app.execute("apply_changes", { ...call, label: "different" }),
    /OPERATION_ID_REUSED/,
  );
  await f.service.request({
    type: "undo",
    projectId: f.projects[0].id,
    documentId: d.id,
  });
  assert.equal(d.text, before);
});
test("stale text, additions to project and other project documents are rejected", async (t) => {
  const f = await fixture(t),
    c = await f.ctx(),
    p = f.projects[0],
    d = p.documents[0];
  const call = {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    preview: true,
    change: {
      kind: "edits",
      documents: [
        {
          id: f.projects[1].documents[0].id,
          version: 0,
          edits: [{ from: 0, to: 0, insert: "bad" }],
        },
      ],
    },
  };
  await assert.rejects(
    f.app.execute("apply_changes", call),
    /DOCUMENT_NOT_FOUND/,
  );
  f.service.engine.replace(p.id, d.id, d.text + "\n", "human");
  await assert.rejects(
    f.app.execute("apply_changes", {
      ...call,
      change: {
        kind: "rename_scene",
        documentId: d.id,
        fromName: "End",
        name: "Exit",
      },
    }),
    /VERSION_CONFLICT/,
  );
});
test("incomplete input and unsynchronized graph drafts cannot be edited", async (t) => {
  const f = await fixture(t),
    c = await f.ctx(),
    d = f.projects[0].documents[0];
  const call = {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    preview: true,
    change: { kind: "create_scene", documentId: d.id, name: "Next" },
  };
  f.state.pending = [d.id];
  assert.equal((await f.ctx()).synchronized, false);
  await assert.rejects(f.app.execute("apply_changes", call), /INPUT_PENDING/);
  f.state.pending = [];
  f.state.local = d.text + "draft";
  assert.equal((await f.ctx()).selections.length, 0);
  await assert.rejects(f.app.execute("apply_changes", call), /INPUT_PENDING/);
});
test("diagnostics match UI parser and selected quick fixes replace typed values", async (t) => {
  const f = await fixture(t),
    p = f.projects[0];
  const report = await f.app.execute("validate_project", {
    editorSessionId: "session-0",
  });
  assert.deepEqual(
    report.items.map((i) => i.message),
    parse(p.documents, p.commands).issues.map((i) => i.message),
  );
  const fix = report.fixes.find((f) => f.edit?.insert === "0");
  assert(fix);
  await f.app.execute("apply_quick_fixes", {
    editorSessionId: "session-0",
    snapshotId: report.snapshotId,
    operationId: "fix-1",
    fixIds: [fix.id],
  });
  assert(p.documents[0].text.includes("<<set $gold = 0>>"));
});
test("command upserts preserve other definitions, create history and honor CAS", async (t) => {
  const f = await fixture(t),
    p = f.projects[0],
    c = await f.ctx();
  const command = {
    name: "show_item",
    description: "顯示道具",
    example: "<<show_item apple>>",
    params: [
      { name: "item", type: "string", required: true, defaultValue: "" },
    ],
  };
  const call = {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    operationId: "command-1",
    commands: [command],
  };
  assert.equal(
    (await f.app.execute("update_commands", { ...call, preview: true }))
      .applied,
    false,
  );
  assert.equal(p.commands.length, 0);
  await f.app.execute("update_commands", call);
  assert.equal(p.commands[0].name, "show_item");
  assert(p.recovery.some((e) => e.documentId === "@commands"));
  await assert.rejects(
    f.service.request({
      type: "commands",
      projectId: p.id,
      commands: [],
      expectedCommands: "[]",
    }),
    /已變更/,
  );
});
test("cross-file rename validates project snapshot and retains unrelated prose", async (t) => {
  const f = await fixture(t),
    p = f.projects[0],
    d = p.documents[0];
  await f.service.request({
    type: "createDocument",
    projectId: p.id,
    name: "other.yarn",
    text: "title: Other\n---\n<<jump End>>\nMira: End\n===\n",
  });
  const c = await f.ctx();
  await f.app.execute("apply_changes", {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    operationId: "rename",
    change: {
      kind: "rename_scene",
      documentId: d.id,
      fromName: "End",
      name: "Exit",
    },
  });
  assert(p.documents.every((d) => !d.text.includes("<<jump End>>")));
  assert(p.documents[1].text.includes("Mira: End"));
  await f.service.request({ type: "undo", projectId: p.id, documentId: d.id });
  assert(p.documents[1].text.includes("<<jump End>>"));
});
test("query pagination and statistics use shared source semantics", async (t) => {
  const f = await fixture(t);
  const result = await f.app.execute("query_project", {
    editorSessionId: "session-0",
    kind: "scenes",
    limit: 1,
  });
  assert.equal(result.total, 2);
  assert.equal(result.nextOffset, 1);
  const stats = await f.app.execute("get_statistics", {
    editorSessionId: "session-0",
  });
  assert.equal(stats.totals.scenes, 2);
  assert.equal(stats.totals.dialogueLines, 2);
});
test("queued mutation rechecks source version immediately before committing", async (t) => {
  const f = await fixture(t),
    c = await f.ctx(),
    p = f.projects[0],
    d = p.documents[0];
  const original = f.service.requestChecked.bind(f.service);
  f.service.requestChecked = (action, check) => {
    f.service.engine.replace(p.id, d.id, d.text + "// human", "human");
    return original(action, check);
  };
  await assert.rejects(
    f.app.execute("apply_changes", {
      editorSessionId: "session-0",
      snapshotId: c.snapshotId,
      operationId: "race",
      change: { kind: "create_scene", documentId: d.id, name: "Nope" },
    }),
    /VERSION_CONFLICT/,
  );
  assert(!d.text.includes("title: Nope"));
});
test("window bindings invalidate A→B→A identities even without intermediate list calls", () => {
  const events = new Map(),
    window = { isDestroyed: () => false, isFocused: () => true, on: () => {} };
  const item = { id: "w", projectId: "A", window },
    windows = new Map([["w", item]]);
  const host = agentWindows({
    windows,
    sessions: () => ({}),
    service: { engine: { project: (id) => ({ id, name: id, documents: [] }) } },
    ipcMain: { on: (name, callback) => events.set(name, callback) },
    owner: () => item,
  });
  const id = host.list()[0].editorSessionId;
  item.projectId = "B";
  host.rebound(item);
  item.projectId = "A";
  host.rebound(item);
  assert.notEqual(host.list()[0].editorSessionId, id);
});
test("official MCP client, authentication, readonly, revocation and stable port conflict", async (t) => {
  const f = await fixture(t);
  const runtime = new McpRuntime(f.profile, f.service, f.host);
  await runtime.configure({ mode: "read" });
  t.after(() => runtime.stop());
  const info = runtime.connection();
  const url = new URL(info.url);
  assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { ...info.headers, Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  const client = new Client({ name: "spindle-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: info.headers },
    }),
  );
  t.after(() => client.close());
  assert.equal((await client.listTools()).tools.length, 13);
  const context = (
    await client.callTool({
      name: "get_editor_context",
      arguments: { editorSessionId: "session-0" },
    })
  ).structuredContent;
  assert(context.snapshotId);
  const buddy = new Client({ name: "spindle-second-agent", version: "1" });
  await buddy.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: info.headers } }));
  const pair = await Promise.all([client.callTool({ name: "get_editor_context", arguments: { editorSessionId: "session-0" } }), buddy.callTool({ name: "get_editor_context", arguments: { editorSessionId: "session-1" } })]);
  assert.notEqual(pair[0].structuredContent.projectId, pair[1].structuredContent.projectId);
  await buddy.close();

  const denied = await client.callTool({
    name: "update_commands",
    arguments: {
      editorSessionId: "session-0",
      snapshotId: context.snapshotId,
      operationId: "readonly",
      commands: [
        { name: "new_command", params: [], description: "", example: "" },
      ],
    },
  });
  assert(denied.isError);
  await client.close();
  const secondProfile = path.join(path.dirname(f.profile), "second");
  fs.mkdirSync(secondProfile);
  const other = new McpRuntime(secondProfile, f.service, f.host);
  await other.configure({ mode: "read", port: runtime.settings().port });
  assert.match(other.settings().error, /連接埠/);
  await other.stop();
  await runtime.configure({ resetToken: true });
  assert.equal(
    (await fetch(url, { method: "POST", headers: info.headers, body: "{}" }))
      .status,
    401,
  );
  assert.equal(runtime.settings().url, info.url);
});

test("invalid tabs, ambiguous scene names and conflicting command examples are not guessed", async (t) => {
  const f = await fixture(t),
    p = f.projects[0],
    d = p.documents[0];
  await assert.rejects(
    f.app.execute("activate_editor_session", {
      editorSessionId: "session-0",
      tabId: "missing",
    }),
    /TAB_NOT_FOUND/,
  );
  await f.service.request({
    type: "createDocument",
    projectId: p.id,
    name: "ambiguous.yarn",
    text: "title: End\n---\n<<custom 2>>\n<<custom false>>\n===\n",
  });
  const c = await f.ctx();
  await assert.rejects(
    f.app.execute("apply_changes", {
      editorSessionId: "session-0",
      snapshotId: c.snapshotId,
      operationId: "ambiguous",
      change: {
        kind: "rename_scene",
        documentId: d.id,
        fromName: "End",
        name: "Exit",
      },
    }),
    /SCENE_NOT_UNIQUE/,
  );
  const issues = await f.app.execute("validate_project", {
    editorSessionId: "session-0",
  });
  assert(!issues.fixes.some((f) => f.command?.name === "custom"));
  assert.equal(
    (
      await f.app.execute("query_project", {
        editorSessionId: "session-0",
        kind: "unknown_commands",
      })
    ).items.length,
    2,
  );
});

test("unrelated composing documents do not block a scoped text edit", async (t) => {
  const f = await fixture(t),
    p = f.projects[0],
    d = p.documents[0];
  await f.service.request({
    type: "createDocument",
    projectId: p.id,
    name: "unrelated.yarn",
    text: "title: Other\n---\nHi\n===\n",
  });
  const c = await f.ctx();
  f.state.pending = [p.documents[1].id];
  const result = await f.app.execute("apply_changes", {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    operationId: "scoped",
    change: {
      kind: "edits",
      documents: [
        {
          id: d.id,
          version: d.version,
          edits: [
            { from: d.text.length, to: d.text.length, insert: "// test" },
          ],
        },
      ],
    },
  });
  assert.equal(result.applied, true);
});

test("revocation before commit prevents mutation; persistence failure after commit remains applied", async (t) => {
  const f = await fixture(t),
    c = await f.ctx(),
    d = f.projects[0].documents[0];
  const change = {
    editorSessionId: "session-0",
    snapshotId: c.snapshotId,
    operationId: "revoked",
    change: { kind: "create_scene", documentId: d.id, name: "NewScene" },
  };
  await assert.rejects(
    f.app.execute("apply_changes", change, () => {
      throw Error("ACCESS_REVOKED");
    }),
    /ACCESS_REVOKED/,
  );
  const original = f.service.requestChecked.bind(f.service);
  f.service.requestChecked = async (action, check, onFailure) => {
    await original(action, check);
    onFailure();
    throw Error("simulated profile write failure");
  };
  const applied = await f.app.execute("apply_changes", {
    ...change,
    operationId: "failed-save",
  });
  assert.equal(applied.applied, true);
  assert.match(applied.persistenceError, /profile write failure/);
  assert(d.text.includes("title: NewScene"));
  assert.deepEqual(
    await f.app.execute("apply_changes", {
      ...change,
      operationId: "failed-save",
    }),
    applied,
  );
});

test("large responses are explicitly bounded without losing identifiers", () => {
  const { boundedResult } = load("desktop/mcp/bounded-result.ts");
  const result = boundedResult({
    snapshotId: "snapshot",
    items: Array.from({ length: 500 }, (_, i) => ({
      text: "x".repeat(50000),
      id: "id-" + i,
    })),
  });
  assert(result.responseTruncated);
  assert.equal(result.items.length, 200);
  assert.equal(result.items[199].id, "id-199");
  assert(result.truncatedFields.length);
  assert(JSON.stringify(result).length < 180000);
});

test("large project queries paginate and reuse unchanged semantic analysis", async (t) => {
  const f = await fixture(t),
    p = f.projects[0],
    d = p.documents[0];
  const text = Array.from(
    { length: 1500 },
    (_, i) =>
      `title: Scene${i}\n---\nNarrator: Text ${i}\n<<jump Scene${(i + 1) % 1500}>>\n===\n`,
  ).join("");
  f.service.engine.replace(p.id, d.id, text, "fixture");
  const start = performance.now();
  const first = await f.app.execute("query_project", {
    editorSessionId: "session-0",
    kind: "scenes",
    limit: 100,
  });
  const cold = performance.now() - start;
  const next = performance.now();
  const second = await f.app.execute("query_project", {
    editorSessionId: "session-0",
    kind: "scenes",
    offset: 100,
    limit: 100,
  });
  const warm = performance.now() - next;
  assert.equal(first.total, 1500);
  assert.equal(first.items.length, 100);
  assert.equal(second.nextOffset, 200);
  t.diagnostic(
    JSON.stringify({
      scenes: 1500,
      coldMs: Math.round(cold),
      warmMs: Math.round(warm),
    }),
  );
});

test("failed MCP configuration writes preserve the active mode and credential", async (t) => {
  const f = await fixture(t),
    runtime = new McpRuntime(f.profile, f.service, f.host);
  const before = runtime.connection();
  runtime.file = path.join(f.profile, "blocked-target");
  fs.mkdirSync(runtime.file);
  await assert.rejects(runtime.configure({ mode: "write", resetToken: true }));
  assert.equal(runtime.settings().mode, "disabled");
  assert.deepEqual(runtime.connection(), before);
});
