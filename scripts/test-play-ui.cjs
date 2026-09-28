const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/play-ui/" + Date.now()),
  root = path.join(out, "Story"),
  profile = path.join(out, "profile");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "Story.yarn"),
  "\uFEFFtitle: Start\n---\n<<declare $key = false>>\nMira: Hello 世界 👨‍👩‍👧‍👦\n<<give_item key 1>>\n-> Open <<if $key>>\n    <<jump Room>>\n-> Stay\n    Mira: Wait\n===",
);
fs.writeFileSync(
  path.join(root, "Room.yarn"),
  "\uFEFFtitle: Room\n---\nMira: Inside\n===",
);
let app, client;
async function launch() {
  return process.env.SPINDLE_PLAY_PORTABLE
    ? await require("./portable-test-driver.cjs").launch(
        require("playwright"),
        {
          executablePath: path.resolve(process.env.SPINDLE_PLAY_PORTABLE),
          args: [`--user-data-dir=${profile}`],
          timeout: 60000,
        },
      )
    : await _electron.launch({
        executablePath: require("electron"),
        args: [
          "dist-desktop/app/desktop/main.cjs",
          `--user-data-dir=${profile}`,
        ],
        timeout: 30000,
      });
}
(async () => {
  app = await launch();
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", {
      name: /^(開啟專案資料夾|Open project folder|打开项目文件夹)$/,
    })
    .waitFor();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [root],
    });
  }, root);
  await page
    .getByRole("button", {
      name: /^(開啟專案資料夾|Open project folder|打开项目文件夹)$/,
    })
    .click();
  await page.getByRole("button", { name: "Story.yarn", exact: true }).click();
  await page.locator(".monaco-editor .view-lines").first().waitFor();
  // Import a real raster through the trusted native dialog, then persist mappings.
  const imagePath = path.join(out, "portrait.png");
  fs.writeFileSync(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4i8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await app.evaluate(({ dialog }, imagePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [imagePath],
    });
  }, imagePath);
  const resource = await page.evaluate(async () => {
    const image = await window.yarnDesktop.play.importImage();
    const r = await window.yarnDesktop.play.resources();
    r.config.characters.push({
      name: "Mira",
      displayName: "Mira Preview",
      color: "#abcdef",
      portrait: image.id,
      portraits: { happy: image.id },
      sprites: { default: image.id },
    });
    r.config.backgrounds.room = image.id;
    return window.yarnDesktop.play.save(r.config);
  });
  assert.equal(resource.config.revision, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".spindle", "preview.json")))
      .characters[0].displayName,
    "Mira Preview",
  );
  const opened = app.waitForEvent("window");
  await page.evaluate(() => window.yarnDesktop.play.open());
  const play = await opened;
  play.on("pageerror", (e) => errors.push(e.message));
  await play.locator(".play-app").waitFor();
  let s = await play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  await page.evaluate(() =>
    window.yarnDesktop.agent.configure({ mode: "read", port: 0 }),
  );
  const connection = await page.evaluate(() =>
    window.yarnDesktop.agent.connection(),
  );
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  client = new Client({ name: "play-integration-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers: connection.headers },
    }),
  );
  const tools = await client.listTools();
  assert(tools.tools.some((t) => t.name === "get_play_context"));
  assert(!tools.tools.some((t) => t.name === "advance_play"));
  const sessions = (
    await client.callTool({
      name: "list_play_sessions",
      arguments: { editorSessionId: s.editorSessionId },
    })
  ).structuredContent;
  assert.equal(sessions.sessions[0].playSessionId, s.id);
  assert(["ready", "line"].includes(s.state.status), JSON.stringify(s.state));
  const act = (input) =>
    play.evaluate(async (input) => {
      const s = await window.yarnDesktop.play.action({ action: "state" });
      return window.yarnDesktop.play.action(input, s.state.revision);
    }, input);
  s = await act({ action: "start", scene: "Start" });
  assert.equal(s.state.status, "line");
  await play.locator(".play-line").waitFor();
  await play.screenshot({ path: path.join(out, "novel.png") });
  s = await act({ action: "next" });
  assert.equal(s.state.options[0].available, false);
  s = await act({ action: "setVariable", name: "$key", value: true });
  assert.equal(s.state.options[0].available, true);
  const context = (
    await client.callTool({
      name: "get_play_context",
      arguments: { editorSessionId: s.editorSessionId, playSessionId: s.id },
    })
  ).structuredContent;
  assert.deepEqual(
    context.options.map((o) => o.available),
    s.state.options.map((o) => o.available),
  );
  assert.equal(context.variables.find((v) => v.name === "$key").value, true);
  const expired = await client.callTool({
    name: "get_play_context",
    arguments: { editorSessionId: s.editorSessionId, playSessionId: "expired" },
  });
  assert.equal(expired.isError, true);
  await play.getByRole("button", { name: "VN", exact: true }).click();
  const afterMode = await play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  assert.deepEqual(afterMode.state, s.state);
  await play.screenshot({ path: path.join(out, "vn-options.png") });
  assert.equal(
    await play.locator(".play-stage .lucide-external-link").count(),
    0,
  );
  assert((await play.locator(".play-debug .lucide-external-link").count()) > 0);
  const beforeGame = s.state.revision;
  await play
    .getByRole("button", {
      name: /^(Enter game view|進入遊戲畫面|进入游戏画面)$/,
    })
    .click();
  await play.locator(".play-app.immersive").waitFor();
  assert.equal(await play.locator(".play-debug").count(), 0);
  await play.screenshot({ path: path.join(out, "vn-game.png") });
  await play.keyboard.press("Escape");
  assert.equal(
    (
      await play.evaluate(() =>
        window.yarnDesktop.play.action({ action: "state" }),
      )
    ).state.revision,
    beforeGame,
  );
  await app.evaluate(async ({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      if (
        await w.webContents.executeJavaScript(
          "window.yarnDesktop?.play.isWindow",
        )
      )
        w.setSize(760, 540);
  });
  await play.waitForTimeout(100);
  const geometry = await play.evaluate(() => {
    const choices = document
      .querySelector(".play-vn-choices")
      .getBoundingClientRect();
    const dialogue = document
      .querySelector(".play-vn-dialogue")
      .getBoundingClientRect();
    return {
      overlap: choices.bottom > dialogue.top,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.deepEqual(geometry, { overlap: false, overflow: false });
  await play.screenshot({ path: path.join(out, "vn-narrow.png") });
  await app.evaluate(async ({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      if (
        await w.webContents.executeJavaScript(
          "window.yarnDesktop?.play.isWindow",
        )
      )
        w.setSize(1200, 800);
  });
  s = await act({ action: "choose", optionId: s.state.options[0].id });
  assert.equal(s.state.scene, "Room");
  const source = s.state.events.filter((e) => e.kind === "line").at(-1).source;
  await play.evaluate(
    (source) => window.yarnDesktop.play.reveal(source),
    source,
  );
  s = await act({ action: "back" });
  assert.equal(s.state.status, "options");
  s = await act({ action: "setVariable", name: "$key", value: false });
  assert.equal(s.state.options[0].available, false);
  await page.evaluate(async () => {
    const s = (await window.yarnDesktop.request({ type: "snapshot" })).snapshot;
    const p =
        s.projects.find((p) => p.id === s.currentProjectId) || s.projects[0],
      d = p.documents.find((d) => d.name === "Story.yarn");
    await window.yarnDesktop.request({
      type: "transaction",
      projectId: p.id,
      label: "Play isolation test",
      documents: [
        {
          id: d.id,
          version: d.version,
          edits: [
            {
              from: d.text.indexOf("Hello"),
              to: d.text.indexOf("Hello") + 5,
              insert: "Changed",
            },
          ],
        },
      ],
    });
  });
  await play.waitForFunction(
    async () =>
      (await window.yarnDesktop.play.action({ action: "state" })).stale,
  );
  const old = await play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  assert(
    old.documents.find((d) => d.name === "Story.yarn").text.includes("Hello"),
  );
  s = await act({ action: "latest" });
  assert(
    s.documents.find((d) => d.name === "Story.yarn").text.includes("Changed"),
  );
  const count = (await app.windows()).length;
  await page.evaluate(() => window.yarnDesktop.play.open());
  assert.equal((await app.windows()).length, count);
  await play.evaluate(() => window.yarnDesktop.play.characters());
  await page.locator(".characters-view").waitFor();
  await page.screenshot({ path: path.join(out, "characters.png") });
  const secondEditorOpened = app.waitForEvent("window");
  await page.evaluate(async () => {
    const current = await window.yarnDesktop.session.load();
    const tab = current.tabs.find((t) => !t.documentId.startsWith("@"));
    await window.yarnDesktop.windows.move(
      { ...tab, id: crypto.randomUUID() },
      current.projectId,
    );
  });
  const secondEditor = await secondEditorOpened;
  await secondEditor.locator(".monaco-editor").first().waitFor();
  const secondPlayOpened = app.waitForEvent("window");
  await secondEditor.evaluate(() => window.yarnDesktop.play.open());
  const secondPlay = await secondPlayOpened;
  await secondPlay.locator(".play-app").waitFor();
  let peer = await secondPlay.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  if (peer.state.status === "ready")
    peer = await secondPlay.evaluate(
      (r) =>
        window.yarnDesktop.play.action({ action: "start", scene: "Start" }, r),
      peer.state.revision,
    );
  assert.notEqual(peer.id, s.id);
  assert.notEqual(peer.editorSessionId, s.editorSessionId);
  await secondPlay.evaluate(
    (r) =>
      window.yarnDesktop.play.action(
        { action: "setVariable", name: "$key", value: true },
        r,
      ),
    peer.state.revision,
  );
  const original = await play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  assert.equal(
    original.state.variables.find((v) => v.name === "$key").value,
    false,
  );
  const wrongOwner = await client.callTool({
    name: "get_play_context",
    arguments: {
      editorSessionId: original.editorSessionId,
      playSessionId: peer.id,
    },
  });
  assert.equal(wrongOwner.isError, true);
  const peerClosed = secondPlay.waitForEvent("close");
  await secondEditor.evaluate(() => window.close());
  await peerClosed;
  await client.close();
  client = null;
  await app.close();
  app = null;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  app = await launch();
  const reopened = await app.firstWindow();
  reopened.on("pageerror", (e) => errors.push(e.message));
  const openButton = reopened.getByRole("button", {
    name: /^(開啟專案資料夾|Open project folder|打开项目文件夹)$/,
  });
  await openButton.waitFor();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [root],
    });
  }, root);
  await openButton.click();
  await reopened.getByRole("tab").first().waitFor();
  const persisted = await reopened.evaluate(() =>
    window.yarnDesktop.play.resources(),
  );
  assert.equal(persisted.config.characters[0].displayName, "Mira Preview");
  assert(Object.keys(persisted.images).length > 0);
  assert(
    fs.readFileSync(path.join(root, "Story.yarn"), "utf8").includes("Changed"),
  );
  const afterRestartOpened = app.waitForEvent("window");
  await reopened.evaluate(() => window.yarnDesktop.play.open());
  const freshPlay = await afterRestartOpened;
  await freshPlay.locator(".play-app").waitFor();
  let fresh = await freshPlay.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
  if (fresh.state.status === "ready")
    fresh = await freshPlay.evaluate(
      (r) =>
        window.yarnDesktop.play.action({ action: "start", scene: "Start" }, r),
      fresh.state.revision,
    );
  assert.notEqual(fresh.id, original.id);
  assert.equal(
    fresh.state.variables.find((v) => v.name === "$key").value,
    false,
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "cross-file",
          "choices",
          "override",
          "rewind",
          "novel-vn",
          "source",
          "fixed-version",
          "latest",
          "one-window",
          "characters",
          "asset-import-persistence",
          "actual-mcp-read-context",
          "same-project-two-window-isolation",
          "owner-close-disposes-play",
          "restart-persists-resources-not-runtime",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS Play desktop UI", out);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client?.close();
    if (app) await app.close();
  });
