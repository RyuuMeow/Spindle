import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
const require = createRequire(import.meta.url);
const outfile = path.resolve("outputs/tests/agent-installation.cjs");
fs.mkdirSync(path.dirname(outfile), { recursive: true });
buildSync({
  entryPoints: ["desktop/agent-installation.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { AgentInstaller } = require(outfile);
function fixture(t, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-agent-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  let connection = {
    url: "http://127.0.0.1:7234/mcp",
    headers: { Authorization: "Bearer test-only" },
  };
  const profile = path.join(home, "profile"),
    skillSource = path.join(home, "source.md");
  fs.writeFileSync(
    skillSource,
    "---\nname: spindle\ndescription: test\n---\nTesting skill\n",
  );
  const options = {
    home,
    env: {},
    defaultProfile: profile,
    skillSource,
    connection: () => connection,
    enabled: () => true,
    ...extra,
  };
  const installer = new AgentInstaller(profile, options);
  return {
    home,
    installer,
    options,
    skillSource,
    rotate() {
      connection = {
        ...connection,
        headers: { Authorization: "Bearer rotated-test-only" },
      };
    },
  };
}
for (const client of ["codex", "claude"]) {
  test(`${client}: install, idempotent, token/skill update, remove preserves unrelated settings`, (t) => {
    const f = fixture(t),
      target = f.installer.target(client);
    fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
    const original =
      client === "codex"
        ? '# Keep this comment\r\nmodel = "test"\r\n[mcp_servers.other]\r\nurl = "https://example.test"\r\n'
        : '{\n  "preferences": {"theme":"dark"},\n  "mcpServers":{"other":{"type":"http","url":"https://example.test"}}\n}\n';
    fs.writeFileSync(target.configPath, original);
    assert.equal(f.installer.inspect(client).mcp, "missing");
    assert.equal(f.installer.install(client).installation.skill, "installed");
    const first = fs.readFileSync(target.configPath, "utf8");
    f.installer.install(client);
    assert.equal(fs.readFileSync(target.configPath, "utf8"), first);
    f.rotate();
    assert.equal(f.installer.inspect(client).mcp, "outdated");
    f.installer.install(client);
    assert.equal(f.installer.inspect(client).mcp, "installed");
    fs.appendFileSync(f.skillSource, "New version\n");
    assert.equal(f.installer.inspect(client).skill, "outdated");
    f.installer.install(client);
    assert.equal(f.installer.inspect(client).skill, "installed");
    const records = fs.readFileSync(
      path.join(f.home, ".spindle-agent/installations-v1.json"),
      "utf8",
    );
    assert.ok(!records.includes("Bearer"));
    assert.ok(!records.includes("rotated-test-only"));
    f.installer.remove(client);
    assert.equal(f.installer.inspect(client).mcp, "missing");
    assert.ok(!fs.existsSync(target.skillPath));
    const final = fs.readFileSync(target.configPath, "utf8");
    if (client === "codex") assert.equal(final, original);
    else {
      const json = JSON.parse(final);
      assert.equal(json.preferences.theme, "dark");
      assert.deepEqual(Object.keys(json.mcpServers), ["other"]);
    }
  });
  test(`${client}: external entry edits and malformed configurations are protected`, (t) => {
    const f = fixture(t),
      target = f.installer.target(client);
    f.installer.install(client);
    fs.appendFileSync(
      target.configPath,
      client === "codex" ? "\n[invalid" : "bad",
    );
    const before = fs.readFileSync(target.configPath, "utf8");
    assert.equal(f.installer.inspect(client).mcp, "conflict");
    assert.throws(() => f.installer.install(client));
    assert.equal(fs.readFileSync(target.configPath, "utf8"), before);
  });
  test(`${client}: unowned same-name entry is not taken over`, (t) => {
    const f = fixture(t),
      target = f.installer.target(client);
    fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
    fs.writeFileSync(
      target.configPath,
      client === "codex"
        ? '[mcp_servers.spindle]\nurl="http://localhost/other"\n'
        : '{"mcpServers":{"spindle":{"url":"http://localhost/other"}}}',
    );
    assert.equal(f.installer.inspect(client).mcp, "conflict");
    assert.throws(() => f.installer.install(client));
    assert.equal(f.installer.remove(client).installation.mcp, "conflict");
  });
}
test("shared Skill remains until the last profile removes its installation", (t) => {
  const f = fixture(t),
    other = new AgentInstaller(path.join(f.home, "second"), f.options);
  f.installer.install("codex");
  other.install("codex");
  assert.notEqual(other.inspect("codex").serverName, "spindle");
  f.installer.remove("codex");
  assert.equal(other.inspect("codex").skill, "installed");
  other.remove("codex");
  assert.ok(!fs.existsSync(other.target("codex").skillPath));
});
test("user edited Skill is preserved on uninstall and blocks updating", (t) => {
  const f = fixture(t);
  f.installer.install("claude");
  const skill = path.join(f.installer.target("claude").skillPath, "SKILL.md");
  fs.appendFileSync(skill, "User edits");
  assert.equal(f.installer.inspect("claude").skill, "conflict");
  assert.throws(() => f.installer.install("claude"));
  f.installer.remove("claude");
  assert.ok(fs.readFileSync(skill, "utf8").endsWith("User edits"));
});
test("partial commit journal can resume after restart and token rotation", (t) => {
  let writes = 0;
  const f = fixture(t, {
    beforeWrite() {
      if (++writes === 2) throw new Error("Injected skill failure");
    },
  });
  assert.equal(f.installer.install("codex").installation.pending, true);
  const restarted = new AgentInstaller(path.join(f.home, "profile"), {
    ...f.options,
    beforeWrite: undefined,
  });
  f.rotate();
  assert.equal(restarted.install("codex").installation.pending, false);
  assert.equal(restarted.inspect("codex").mcp, "installed");
});
test("concurrent external write is preserved and reported as partial", (t) => {
  let injected = false;
  const f = fixture(t, {
    beforeWrite() {
      if (injected) return;
      injected = true;
      fs.mkdirSync(path.dirname(f.installer.target("codex").configPath), {
        recursive: true,
      });
      fs.writeFileSync(
        f.installer.target("codex").configPath,
        '# External change\nmodel="other"\n',
      );
    },
  });
  const result = f.installer.install("codex");
  assert.equal(result.installation.pending, true);
  assert.equal(
    fs.readFileSync(f.installer.target("codex").configPath, "utf8"),
    '# External change\nmodel="other"\n',
  );
  assert.equal(f.installer.install("codex").installation.pending, false);
});
test("custom paths, environment paths, disabled mode, and duplicate JSON keys", (t) => {
  const f = fixture(t),
    config = path.join(f.home, "中文 目錄", "custom.toml");
  f.installer.setTarget("codex", "config", config);
  f.installer.setTarget("codex", "skill", path.join(f.home, "共用 Skills"));
  f.installer.install("codex");
  assert.ok(fs.existsSync(config));
  assert.throws(() =>
    f.installer.setTarget("codex", "config", path.join(f.home, "else.toml")),
  );
  const disabled = new AgentInstaller(path.join(f.home, "disabled"), {
    ...f.options,
    enabled: () => false,
  });
  assert.throws(() => disabled.install("claude"));
  const env = new AgentInstaller(path.join(f.home, "env"), {
    ...f.options,
    env: {
      CODEX_HOME: path.join(f.home, "codex-home"),
      CLAUDE_CONFIG_DIR: path.join(f.home, "claude-home"),
    },
  });
  assert.equal(
    env.target("codex").configPath,
    path.join(f.home, "codex-home/config.toml"),
  );
  assert.equal(
    env.target("claude").configPath,
    path.join(f.home, "claude-home/.claude.json"),
  );
  fs.writeFileSync(
    f.installer.target("claude").configPath,
    '{"mcpServers":{},"mcpServers":{}}',
  );
  assert.equal(f.installer.inspect("claude").mcp, "conflict");
});
