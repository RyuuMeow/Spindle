const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/agent-install-ui/run-" + Date.now());
const home = path.join(base, "home"),
  profile = path.join(base, "profile");
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
for (const name of ["Roaming", "Local"])
  fs.mkdirSync(path.join(home, "AppData", name), { recursive: true });
const root = path.join(base, "Project");
const source = "title: Start\r\n---\r\nNarrator: Hello 世界\r\n===\r\n";
fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
fs.writeFileSync(path.join(root, "sample.yarn"), source);
fs.writeFileSync(
  path.join(root, ".spindle/project.json"),
  JSON.stringify({
    id: "installation-test",
    name: "Installation test",
    commands: [],
    files: [{ id: "test-document", name: "sample.yarn" }],
    excluded: [],
  }),
);
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [
      {
        id: "installation-test",
        name: "Installation test",
        root,
        lastOpenedAt: 1,
        recent: true,
      },
    ],
    preferences: {
      reopenLastProject: false,
      language: "zh-TW",
      autoCheckUpdates: false,
    },
  }),
);
const env = {
  ...process.env,
  USERPROFILE: home,
  HOME: home,
  APPDATA: path.join(home, "AppData/Roaming"),
  LOCALAPPDATA: path.join(home, "AppData/Local"),
  CODEX_HOME: path.join(home, ".codex"),
  CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
};
const portable = process.env.SPINDLE_PORTABLE === "1";
const launch = () =>
  portable
    ? require("./portable-test-driver.cjs").launch(pw, {
        executablePath: path.resolve(
          `release/Spindle-${require("../package.json").version}-Portable-x64.exe`,
        ),
        args: ["--user-data-dir=" + profile],
        env,
        logPath: path.join(base, "startup.log"),
        timeout: 60000,
      })
    : require("./portable-test-driver.cjs").launch(pw, {
        executablePath: require("electron"),
        args: [
          "dist-desktop/app/desktop/main.cjs",
          "--user-data-dir=" + profile,
        ],
        env,
        logPath: path.join(base, "startup.log"),
        timeout: 60000,
      });
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for installation UI state");
}
let app;
(async () => {
  const results = {
    portable,
    clientConfigLoaded: {},
    handshake: {},
    restart: false,
    uninstalled: false,
  };
  try {
    app = await launch();
    let page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    console.log("PASS desktop launched");
    if (portable) {
      const archive = await app.evaluate(({ app }) => {
        const fs = process.mainModule.require("node:fs"),
          path = process.mainModule.require("node:path"),
          crypto = process.mainModule.require("node:crypto");
        const root = app.getAppPath(),
          files = [];
        function walk(relative) {
          for (const entry of fs.readdirSync(path.join(root, relative), {
            withFileTypes: true,
          })) {
            const next = path.join(relative, entry.name);
            if (entry.isDirectory()) walk(next);
            else files.push(next.replaceAll("\\", "/"));
          }
        }
        walk("");
        return {
          version: app.getVersion(),
          files,
          skillHash: crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(root, "skills/spindle/SKILL.md")))
            .digest("hex"),
          runtimeHash: crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(root, "desktop/mcp-runtime.cjs")))
            .digest("hex"),
        };
      });
      const digest = (file) =>
        require("node:crypto")
          .createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
      assert.equal(archive.version, require("../version.json").version);
      assert.equal(archive.skillHash, digest("skills/spindle/SKILL.md"));
      assert.equal(
        archive.runtimeHash,
        digest("dist-desktop/app/desktop/mcp-runtime.cjs"),
      );
      assert.ok(archive.files.some((name) => name.endsWith(".wasm")));
      assert.ok(archive.files.some((name) => name.includes("elk-worker")));
      assert.ok(archive.files.includes("licenses/mcp-dependencies.txt"));
      assert.ok(
        !archive.files.some((name) =>
          /(^|\/)(outputs|scripts|fixtures|node_modules)(\/|$)|mcp-v1\.json|config\.toml|installed\.png/.test(
            name,
          ),
        ),
      );
      results.archiveFiles = archive.files.length;
      results.archiveVerified = true;
    }

    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page
      .getByRole("button", { name: "MCP／Agent 整合", exact: true })
      .click();
    await page.getByRole("radio", { name: "唯讀", exact: true }).click();
    for (const client of ["codex", "claude"]) {
      const card = page.getByRole("article", {
        name: client === "codex" ? "Codex 安裝" : "Claude Code 安裝",
      });
      await card
        .getByRole("button", { name: "安裝 MCP＋Skill", exact: true })
        .click();
      await card.getByText("MCP · 已安裝", { exact: true }).waitFor();
      await card.getByText("Skill · 已安裝", { exact: true }).waitFor();
      const info = (
        await page.evaluate(() => window.yarnDesktop.agent.installations())
      ).find((x) => x.client === client);
      assert.ok(info.configPath.startsWith(home));
      assert.ok(info.skillPath.startsWith(home));
      assert.ok(
        fs
          .readFileSync(path.join(info.skillPath, "SKILL.md"), "utf8")
          .includes("editorSessionId"),
      );
      await card.getByRole("button", { name: "檢查連線", exact: true }).click();
      await until(async () =>
        (await card.getByRole("status").textContent()).includes("20 個工具"),
      );
      results.handshake[client] = true;
      console.log("PASS installed and handshake: " + client);
      const entry =
        client === "codex"
          ? require("@iarna/toml").parse(
              fs.readFileSync(info.configPath, "utf8"),
            ).mcp_servers[info.serverName]
          : JSON.parse(fs.readFileSync(info.configPath, "utf8")).mcpServers[
              info.serverName
            ];
      const { Client } =
        await import("@modelcontextprotocol/sdk/client/index.js");
      const { StreamableHTTPClientTransport } =
        await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
      const sdk = new Client({
        name: "installed-config-regression",
        version: "0.9.2",
      });
      try {
        await sdk.connect(
          new StreamableHTTPClientTransport(new URL(entry.url), {
            requestInit: { headers: entry.http_headers || entry.headers },
          }),
        );
        const call = async (name, args = {}) => {
          const result = await sdk.callTool({ name, arguments: args });
          assert.ok(!result.isError, "MCP call failed: " + name);
          return result.structuredContent;
        };
        assert.equal((await sdk.listTools()).tools.length, 20);
        const session = (
          await call("open_project", { projectId: "installation-test" })
        ).sessions[0];
        const target = { editorSessionId: session.editorSessionId };
        await call("reveal_location", {
          ...target,
          documentId: "test-document",
          from: source.indexOf("Hello"),
          to: source.indexOf("Hello") + 5,
        });
        const context = await call("get_editor_context", target);
        assert.equal(context.selections[0].text, "Hello");
        const change = {
          ...target,
          snapshotId: context.snapshotId,
          operationId: client + "-readonly",
          change: {
            kind: "edits",
            documents: [
              {
                id: "test-document",
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
        assert.equal(
          (await sdk.callTool({ name: "apply_changes", arguments: change }))
            .isError,
          true,
        );
        await page.evaluate(() =>
          window.yarnDesktop.agent.configure({ mode: "write" }),
        );
        assert.equal(
          (
            await call("apply_changes", {
              ...change,
              operationId: client + "-write",
            })
          ).applied,
          true,
        );
        let editor;
        for (const candidate of app.windows())
          if (await candidate.locator(".monaco-editor").count())
            editor = candidate;
        assert.ok(editor);
        await editor.evaluate(async () => {
          const m = await new Promise((resolve) =>
            window.require(["vs/editor/editor.main"], resolve),
          );
          const e = m.editor
            .getEditors()
            .find((e) => e.getDomNode()?.offsetParent);
          e.trigger("keyboard", "undo", null);
        });
        await until(
          async () =>
            (
              await call("read_document", {
                ...target,
                documentId: "test-document",
              })
            ).text === source,
        );
        await page.evaluate(() =>
          window.yarnDesktop.agent.configure({ mode: "read" }),
        );
        results[client + "ContextEditUndo"] = true;
      } finally {
        await sdk.close();
      }
      const executable =
        process.env[
          client === "codex" ? "CODEX_EXECUTABLE" : "CLAUDE_EXECUTABLE"
        ];
      if (executable) {
        let output;
        try {
          output = execFileSync(
            executable,
            client === "codex"
              ? ["mcp", "list", "--json"]
              : ["mcp", "get", info.serverName],
            { env, encoding: "utf8", windowsHide: true, timeout: 30000 },
          );
        } catch {
          throw new Error("Client configuration read failed: " + client);
        }
        assert.ok(output.includes(info.serverName));
        // Do not persist CLI output: it may contain the Authorization header.
        results.clientConfigLoaded[client] = true;
        if (client === "codex") {
          results.codexSkillDiscovered =
            await require("./codex-skill-check.cjs")(
              executable,
              env,
              home,
              path.join(info.skillPath, "SKILL.md"),
            );
          assert.equal(results.codexSkillDiscovered, true);
        }
      } else results.clientConfigLoaded[client] = "CLI unavailable";
    }
    await page.screenshot({ path: path.join(base, "installed.png") });
    await page.getByRole("button", { name: "重設憑證", exact: true }).click();
    await until(
      async () =>
        (await page.getByText("MCP · 需要更新", { exact: true }).count()) === 2,
    );
    for (const name of ["Codex 安裝", "Claude Code 安裝"]) {
      await page
        .getByRole("article", { name })
        .getByRole("button", { name: "更新安裝", exact: true })
        .click();
    }
    const before = await page.evaluate(() =>
      window.yarnDesktop.agent.installations(),
    );
    assert.ok(
      before.every((x) => x.mcp === "installed" && x.skill === "installed"),
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.yarnDesktop?.agent);
    const after = await page.evaluate(() =>
      window.yarnDesktop.agent.installations(),
    );
    assert.ok(
      after.every((x) => x.mcp === "installed" && x.skill === "installed"),
    );
    results.restart = true;
    for (const client of ["codex", "claude"]) {
      const response = await page.evaluate(
        (client) => window.yarnDesktop.agent.installAction(client, "remove"),
        client,
      );
      assert.equal(response.installation.mcp, "missing");
      assert.equal(response.installation.skill, "missing");
    }
    results.uninstalled = true;
    results.passed = true;
    fs.writeFileSync(
      path.join(base, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify({ ...results, base }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
    process.exit(process.exitCode || 0);
  }
})();
