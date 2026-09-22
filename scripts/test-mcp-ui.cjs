const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/mcp-ui/run-" + Date.now()),
  profile = path.join(base, "profile");
fs.mkdirSync(profile, { recursive: true });
const source =
  "title: Start\r\n---\r\n<<declare $gold = 0>>\r\n<<set $gold = wrong>>\r\nMira: Hello 世界😀\r\n-> Go\r\n    <<jump End>>\r\n===\r\ntitle: End\r\n---\r\nMira: End\r\n===\r\n";
const entries = ["Alpha", "Beta"].map((name, i) => {
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
  fs.writeFileSync(path.join(root, "sample.yarn"), source);
  const id = "project-" + i;
  fs.writeFileSync(
    path.join(root, ".spindle/project.json"),
    JSON.stringify({
      id,
      name,
      commands: [],
      files: [{ id: "document-" + i, name: "sample.yarn" }],
      excluded: [],
    }),
  );
  return { id, name, root, lastOpenedAt: i, recent: true };
});
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries,
    preferences: { reopenLastProject: false },
  }),
);
const portable = process.env.SPINDLE_PORTABLE === "1";
const launchDesktop = () => portable
  ? require("./portable-test-driver.cjs").launch(pw, { executablePath: path.resolve(`release/Spindle-${require("../package.json").version}-Portable-x64.exe`), args: ["--user-data-dir=" + profile], timeout: 60000 })
  : pw._electron.launch({ executablePath: require("electron"), args: ["dist-desktop/app/desktop/main.cjs", "--user-data-dir=" + profile] });
let app, client;
const errors = [];
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError)
    throw Error(
      name + ": " + result.content.map((c) => c.text || "").join(" "),
    );
  return result.structuredContent;
}
async function pageFor(session) {
  for (let i = 0; i < 100; i++) {
    for (const page of app.windows()) {
      if (
        (await page
          .evaluate(() => window.yarnDesktop?.windowId)
          .catch(() => null)) === session.windowId
      ) {
        page.on("pageerror", (error) => errors.push(error.message));
        await page.locator(".monaco-editor .view-lines").waitFor();
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error("missing editor page");
}
async function monaco(page, operation) {
  return page.evaluate(async (operation) => {
    const m = await new Promise((resolve) =>
      window.require(["vs/editor/editor.main"], resolve),
    );
    const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
    if (operation === "select") {
      e.setSelections([
        new m.Selection(5, 12, 5, 7),
        new m.Selection(5, 13, 5, 15),
      ]);
      e.focus();
    }
    if (operation === "move") e.setPosition({ lineNumber: 1, column: 1 });
    if (operation === "undo") e.trigger("keyboard", "undo", null);
    return e.getModel().getValue();
  }, operation);
}
(async () => {
  try {
    app = await launchDesktop();
    console.log("PASS desktop launched");
    const home = await app.firstWindow();
    home.on("pageerror", (error) => errors.push(error.message));
    await home.getByRole("button", { name: "設定", exact: true }).click();
    await home
      .getByRole("button", { name: "MCP／Agent 整合", exact: true })
      .click();
    await home.getByRole("radio", { name: "允許修改", exact: true }).click();
    await home.getByText("執行中", { exact: true }).waitFor();
    const previousClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      await home.getByRole("button", { name: "複製 MCP 連線資料", exact: true }).click();
      await home.getByRole("status").filter({ hasText: "已複製連線資料" }).waitFor();
      const config = JSON.parse(fs.readFileSync(path.join(profile, "mcp-v1.json"), "utf8"));
      const matches = await app.evaluate(({ clipboard }, config) => {
        const entries = Object.values(JSON.parse(clipboard.readText()).mcpServers);
        if (entries.length !== 1) return false;
        const value = entries[0];
        return value.url === `http://127.0.0.1:${config.port}/mcp` && value.headers.Authorization === `Bearer ${config.token}`;
      }, config);
      assert.equal(matches, true);
      assert.equal(await home.getByRole("alert").count(), 0);
      console.log("PASS native clipboard connection copy");
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard);
    }
    await home.screenshot({ path: path.join(base, "settings.png") });
    console.log("PASS MCP configured through settings");
    const connection = await home.evaluate(() =>
      window.yarnDesktop.agent.connection(),
    );
    const { Client } =
      await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    client = new Client({ name: "spindle-desktop-regression", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers: connection.headers },
      }),
    );
    assert.equal((await call("list_editor_sessions")).sessions.length, 0);
    assert.equal((await call("list_projects")).total, 2);
    const focusedBefore = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id,
    );
    const [openA, duplicateA] = await Promise.all([
      call("open_project", { projectId: entries[0].id }),
      call("open_project", { projectId: entries[0].id }),
    ]);
    const a = openA.sessions[0];
    assert.equal(a.editorSessionId, duplicateA.sessions[0].editorSessionId);
    const b = (await call("open_project", { projectId: entries[1].id }))
      .sessions[0];
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id,
      ),
      focusedBefore,
    );
    const page = await pageFor(a);
    await pageFor(b);
    const target = { editorSessionId: a.editorSessionId };
    assert.equal((await call("list_editor_sessions")).sessions.length, 2);
    console.log(
      "PASS known projects, concurrent open deduplication and isolated sessions",
    );
    await monaco(page, "select");
    await call("activate_editor_session", {
      editorSessionId: b.editorSessionId,
      focus: true,
    });
    const context = await call("get_editor_context", target);
    assert.equal(context.selections[0].text, "Hello");
    assert(context.selections[0].anchor > context.selections[0].head);
    assert.equal(context.selections.length, 2);
    assert.equal(context.cursor.line, 5);
    assert.equal(context.selections[0].from, source.indexOf("Hello"));
    await monaco(page, "move");
    const change = {
      ...target,
      snapshotId: context.snapshotId,
      operationId: "ui-edit",
      change: {
        kind: "edits",
        documents: [
          {
            id: context.document.id,
            version: context.document.version,
            edits: [
              {
                from: context.selections[0].from,
                to: context.selections[0].to,
                insert: "Welcome",
              },
            ],
          },
        ],
      },
    };
    const result = await call("apply_changes", change);
    assert.equal(result.applied, true);
    assert.deepEqual(await call("apply_changes", change), result);
    await page.getByText("Welcome", { exact: false }).first().waitFor();
    assert((await monaco(page)).includes("Welcome"));
    assert.equal(
      (
        await call("read_document", {
          editorSessionId: b.editorSessionId,
          documentId: "document-1",
        })
      ).text,
      source,
    );
    await monaco(page, "undo");
    for (let i = 0; i < 50 && !(await monaco(page)).includes("Hello"); i++)
      await page.waitForTimeout(30);
    assert((await monaco(page)).includes("Hello"));
    await call("reveal_location", {
      ...target,
      documentId: context.document.id,
      from: source.indexOf("世界"),
      to: source.indexOf("世界") + 2,
    });
    assert.equal(
      (await call("get_editor_context", target)).selections[0].text,
      "世界",
    );
    console.log(
      "PASS live source selections, CRLF offsets, focus isolation, versioned edits, retry and Undo",
    );
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    const line = page
      .locator(".reading-editor .cm-line")
      .filter({ hasText: /Hello/ });
    await line.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    const reading = await call("get_editor_context", target);
    assert.equal(reading.mode, "rendered");
    assert(reading.selections[0].text.includes("Hello"));
    assert.equal(reading.cursor.line, 5);
    await page.screenshot({ path: path.join(base, "reading.png") });
    await page.getByRole("button", { name: "純閱讀", exact: true }).click();
    await page.locator('.dialogue-reader p[data-line="5"]').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.waitForTimeout(50);
    const reader = await call("get_editor_context", target);
    assert.equal(reader.mode, "reader");
    assert.equal(reader.selections[0].text, "Mira: Hello 世界😀");
    await page.getByRole("button", { name: "純閱讀", exact: true }).click();
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .click();
    assert(
      (await call("get_editor_context", target)).graph.nodes.some(
        (n) => n.name === "Start",
      ),
    );
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    const graphLine = page
      .locator(".graph-scene-editor .cm-line")
      .filter({ hasText: /Hello/ });
    await graphLine.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    const graph = await call("get_editor_context", target);
    assert(graph.selections[0].text.includes("Hello"));
    assert(graph.graph.nodes.some((n) => n.name === "Start"));
    assert.equal(graph.cursor.line, 5);
    console.log("PASS reading and graph source mapping");
    await call("reveal_location", {
      ...target,
      documentId: context.document.id,
      from: 0,
    });
    const report = await call("validate_project", target);
    const fix = report.fixes.find((f) => f.edit?.insert === "0");
    assert(fix);
    await call("apply_quick_fixes", {
      ...target,
      snapshotId: report.snapshotId,
      operationId: "ui-fix",
      fixIds: [fix.id],
    });
    const current = await call("get_editor_context", target);
    await call("update_commands", {
      ...target,
      snapshotId: current.snapshotId,
      operationId: "ui-command",
      commands: [
        {
          name: "show_item",
          params: [],
          description: "顯示道具",
          example: "<<show_item>>",
        },
      ],
    });
    assert(
      (
        await call("query_project", {
          ...target,
          kind: "commands",
          query: "show_item",
        })
      ).items.length,
    );
    const menu = async (name) => {
      await page.locator(".project-switch").click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    await menu("自訂指令");
    const draftName = page.getByRole("textbox", {
      name: "變數名稱",
      exact: true,
    });
    await draftName.fill("local_draft");
    const utility = await call("get_editor_context", target);
    assert.equal(utility.page, "commands");
    assert.equal(utility.document, null);
    assert(!JSON.stringify(utility).includes("local_draft"));
    await call("update_commands", {
      ...target,
      snapshotId: utility.snapshotId,
      operationId: "ui-stale-command",
      commands: [
        {
          name: "show_item",
          params: [],
          description: "新說明",
          example: "<<show_item>>",
        },
      ],
    });
    assert.equal(await draftName.inputValue(), "local_draft");
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page
      .getByText(/指令定義已由其他操作更新/)
      .first()
      .waitFor();
    await page.keyboard.press("Control+w");
    await call("reveal_location", {
      ...target,
      documentId: context.document.id,
      from: 0,
    });
    console.log(
      "PASS reader native selection and command draft conflict protection",
    );
    await page
      .locator(".monaco-editor textarea")
      .dispatchEvent("compositionstart", { data: "中" });
    const composing = await call("get_editor_context", target);
    assert(composing.composing || composing.pendingDocumentIds.length);
    const blocked = await client.callTool({
      name: "apply_changes",
      arguments: {
        ...target,
        snapshotId: composing.snapshotId,
        operationId: "ui-composing",
        change: {
          kind: "create_scene",
          documentId: context.document.id,
          name: "ShouldNotExist",
        },
      },
    });
    assert(blocked.isError);
    await page
      .locator(".monaco-editor textarea")
      .dispatchEvent("compositionend", { data: "" });
    await page.waitForTimeout(100);
    const timings = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await call("get_editor_context", target);
      timings.push(Date.now() - start);
    }
    fs.writeFileSync(
      path.join(base, "context-timing.json"),
      JSON.stringify({ milliseconds: timings, maximum: Math.max(...timings) }),
    );
    // A second view of the same project has its own live identity.
    const bridgeSession = await page.evaluate(() =>
      window.yarnDesktop.session.load(),
    );
    await page.evaluate(
      async ({ tab, projectId }) => {
        await window.yarnDesktop.windows.move(tab, projectId);
      },
      { tab: bridgeSession.tabs[0], projectId: entries[0].id },
    );
    let sameProject;
    for (let i = 0; i < 50; i++) {
      sameProject = (await call("list_editor_sessions")).sessions.filter(
        (s) => s.projectId === entries[0].id,
      );
      if (sameProject.length === 2) break;
      await page.waitForTimeout(30);
    }
    assert.equal(sameProject.length, 2);
    assert.equal(
      (await call("open_project", { projectId: entries[0].id })).sessions
        .length,
      2,
    );
    console.log(
      "PASS diagnostics, quick fixes, command registration and multiple views of one project",
    );
    let operation = 0;
    async function fileTool(name, args) {
      const snap = await call("list_project_entries", target);
      return call(name, { ...target, snapshotId: snap.snapshotId, operationId: "ui-file-" + ++operation, ...args });
    }
    const tabBeforeFiles = (await call("get_editor_context", target)).tabId;
    await fileTool("create_folder", { name: "AgentScenes" });
    const added = await fileTool("create_document", { parent: "AgentScenes", name: "Extra.yarn", text: "title: Extra\n---\nMira: Test\n===" });
    const addedId = added.entries[0].id;
    fs.writeFileSync(path.join(entries[0].root, "AgentScenes/asset.bin"), Buffer.from([2, 4, 6]));
    await fileTool("move_entry", { entry: "file:" + addedId, parent: "AgentScenes", name: "Renamed.yarn" });
    await fileTool("move_entry", { entry: "folder:AgentScenes", parent: "", name: "AgentArchive" });
    const deleted = await fileTool("trash_entry", { entry: "folder:AgentArchive" });
    assert.equal(fs.existsSync(path.join(entries[0].root, "AgentArchive")), false);
    const restored = await fileTool("restore_trash", { recoveryId: deleted.trashIds[0] });
    assert(restored.entries.some(d => d.id === addedId && d.name === "AgentArchive/Renamed.yarn"));
    assert.deepEqual(fs.readFileSync(path.join(entries[0].root, "AgentArchive/asset.bin")), Buffer.from([2, 4, 6]));
    assert.equal((await call("get_editor_context", target)).tabId, tabBeforeFiles);
    assert.equal((await call("list_trash", target)).total, 0);
    console.log("PASS MCP file/folder lifecycle, identity, assets and no navigation");
    const bPage = await pageFor(b);
    await bPage.close();
    const expired = await client.callTool({
      name: "get_editor_context",
      arguments: { editorSessionId: b.editorSessionId },
    });
    assert(expired.isError);
    assert.deepEqual(errors, []);
    await client.close();
    client = null;
    await app.evaluate(({ app }) => app.exit(0));
    app = null;
    app = await launchDesktop();
    const restarted = await app.firstWindow();
    await restarted
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    const nextConnection = await restarted.evaluate(() =>
      window.yarnDesktop.agent.connection(),
    );
    assert.equal(nextConnection.url, connection.url);
    client = new Client({ name: "spindle-restart-regression", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(nextConnection.url), {
        requestInit: { headers: nextConnection.headers },
      }),
    );
    const next = (await call("open_project", { projectId: entries[0].id }))
      .sessions[0];
    await pageFor(next);
    assert.notEqual(next.editorSessionId, a.editorSessionId);
    assert(
      (await client.callTool({ name: "get_editor_context", arguments: target }))
        .isError,
    );
    assert(
      (
        await call("query_project", {
          editorSessionId: next.editorSessionId,
          kind: "commands",
          query: "show_item",
        })
      ).items.length,
    );
    const reopened = await call("list_project_entries", { editorSessionId: next.editorSessionId, parent: "AgentArchive" });
    assert(reopened.items.some(d => d.documentId === addedId && d.path === "AgentArchive/Renamed.yarn"));
    assert.equal((await call("list_trash", { editorSessionId: next.editorSessionId })).total, 0);
    console.log("PASS restored file identity and empty trash persist after restart");
    console.log(
      "PASS composition protection, live context timing and restart identity invalidation",
    );
    fs.writeFileSync(
      path.join(base, "result.json"),
      JSON.stringify(
        {
          passed: true,
          portable,
          version: require("../package.json").version,
          errors,
          tests: [
            "sessions",
            "source",
            "reading",
            "graph",
            "transactions",
            "commands",
            "closed-session",
            "native-clipboard",
            "file-folder-lifecycle",
            "file-identity-restart",
          ],
        },
        null,
        2,
      ),
    );
    console.log("PASS desktop MCP regression");
  } finally {
    await client?.close();
    if (app) {
      for (const [i, page] of app.windows().entries())
        await page
          .screenshot({ path: path.join(base, "final-" + i + ".png") })
          .catch(() => {});
      await app.evaluate(({ app }) => app.exit(0));
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
