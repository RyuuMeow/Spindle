import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { createRestartCoordinator } = require("../desktop/restart.cjs");
buildSync({
  entryPoints: ["desktop/update-service.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: "outputs/tests/update-service.cjs",
});
const {
  candidate,
  trustedAsset,
  UpdateService,
} = require("../outputs/tests/update-service.cjs");

test("release metadata accepts Windows checkout line endings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spindle-release-notes-"));
  try {
    fs.mkdirSync(path.join(root, "releases", "0.10.0"), { recursive: true });
    fs.mkdirSync(path.join(root, "release"));
    fs.writeFileSync(path.join(root, "version.json"), '{"version":"0.10.0"}');
    for (const locale of ["en", "zh-TW", "zh-CN"])
      fs.writeFileSync(
        path.join(root, "releases", "0.10.0", `${locale}.md`),
        "# Spindle 0.10.0\r\n\r\n## Features\r\n- Verified\r\n\r\n## Changes\r\n- Notes\r\n",
      );
    for (const kind of ["Portable", "Setup"])
      fs.writeFileSync(
        path.join(root, "release", `Spindle-0.10.0-${kind}-x64.exe`),
        "test artifact",
      );
    execFileSync(process.execPath, [path.resolve("scripts/release-metadata.mjs")], {
      cwd: root,
    });
    const metadata = JSON.parse(
      fs.readFileSync(path.join(root, "release", "Spindle-0.10.0-release.json")),
    );
    assert.equal(metadata.notes.en.features, "- Verified");
    assert.equal(metadata.notes["zh-TW"].markdown.includes("\r"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("update candidates reject drafts, prereleases, same version and downgrades", () => {
  for (const [tag, draft, pre] of [
    ["v0.10.0", false, false],
    ["v0.9.9", false, false],
    ["v0.11.0", true, false],
    ["v0.11.0-rc.1", false, false],
    ["v0.11.0", false, true],
  ])
    assert.equal(
      candidate({ tag_name: tag, draft, prerelease: pre }, "0.10.0"),
      null,
    );
  assert.equal(
    candidate(
      { tag_name: "v0.11.0", draft: false, prerelease: false },
      "0.10.0",
    ),
    "0.11.0",
  );
});
test("update assets are restricted to the product repository", () => {
  assert.ok(
    trustedAsset(
      "https://github.com/RyuuMeow/Spindle/releases/download/v0.11.0/a.exe",
    ),
  );
  for (const url of [
    "http://github.com/RyuuMeow/Spindle/releases/download/a",
    "https://github.com/other/Spindle/releases/download/a",
    "https://github.com.evil.test/RyuuMeow/Spindle/releases/download/a",
  ])
    assert.equal(trustedAsset(url), false);
});
function windowsFixture(fail = false) {
  const ipcMain = new EventEmitter(),
    windows = new Map();
  let committed = false,
    recorded = false;
  const sent = [];
  for (let i = 1; i <= 2; i++) {
    const webContents = new EventEmitter();
    webContents.id = i;
    webContents.send = (channel, token) => {
      sent.push([i, channel]);
      if (channel === "workspace:prepare-close")
        queueMicrotask(() =>
          ipcMain.emit(
            "workspace:close-prepared",
            { sender: webContents },
            { token, error: fail && i === 2 ? "IME pending" : undefined },
          ),
        );
    };
    windows.set(i, {
      id: i,
      projectId: "project" + i,
      window: { isDestroyed: () => false, webContents },
    });
  }
  return {
    ipcMain,
    windows,
    sent,
    restart: createRestartCoordinator({
      windows,
      ipcMain,
      flush: () => {},
      record: () => {
        recorded = true;
      },
      commit: () => {
        committed = true;
      },
      timeout: 50,
    }),
    state: () => ({ committed, recorded }),
  };
}
test("restart waits for all windows and commits only once", async () => {
  const f = windowsFixture();
  await f.restart();
  assert.deepEqual(f.state(), { committed: true, recorded: true });
  assert.equal(f.ipcMain.listenerCount("workspace:close-prepared"), 0);
});
test("one blocked renderer cancels every prepared window without closing", async () => {
  const f = windowsFixture(true);
  await assert.rejects(f.restart(), /IME pending/);
  assert.deepEqual(f.state(), { committed: false, recorded: false });
  assert.equal(
    f.sent.filter((x) => x[1] === "workspace:close-cancelled").length,
    2,
  );
});
test("release checks never download executables and respect skipped versions", async () => {
  const original = globalThis.fetch,
    requests = [],
    prompts = [];
  const version = "0.11.0",
    name = `Spindle-${version}-Portable-x64.exe`,
    url = (n) =>
      `https://github.com/RyuuMeow/Spindle/releases/download/v${version}/${n}`;
  globalThis.fetch = async (urlValue) => {
    requests.push(urlValue);
    return new Response(
      JSON.stringify(
        requests.length % 2 === 1
          ? {
              tag_name: "v" + version,
              draft: false,
              prerelease: false,
              assets: [
                { name, browser_download_url: url(name), size: 3 },
                {
                  name: `Spindle-${version}-release.json`,
                  browser_download_url: url(`Spindle-${version}-release.json`),
                  size: 100,
                },
              ],
            }
          : {
              version,
              assets: [{ name, size: 3, sha256: "0".repeat(64) }],
              notes: { en: { features: "New feature", markdown: "# Changes" } },
            },
      ),
    );
  };
  try {
    const service = new UpdateService({
      profile: "unused",
      locale: "zh-TW",
      portable: "app.exe",
      executable: "app.exe",
      preferences: () => ({ skippedVersion: version }),
      skip: () => {},
      changed: (s, p) => prompts.push(p),
      prepare: async () => {},
      exit: () => {},
      resources: "unused",
    });
    await service.check(false);
    assert.equal(service.state.phase, "available");
    assert.equal(service.state.notes, "# Changes");
    assert.equal(prompts.at(-1), false);
    await service.check(true);
    assert.equal(prompts.at(-1), true);
    assert.ok(!requests.some((u) => u.endsWith(".exe")));
  } finally {
    globalThis.fetch = original;
  }
});
test("all translation keys and placeholder sets agree", () => {
  const catalogs = ["en", "zh-TW", "zh-CN"].map((l) =>
    JSON.parse(fs.readFileSync(path.resolve("app/i18n", l + ".json"))),
  );
  for (const c of catalogs.slice(1)) {
    assert.deepEqual(Object.keys(c).sort(), Object.keys(catalogs[0]).sort());
    for (const key in c)
      assert.deepEqual(
        [...c[key].matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort(),
        [...catalogs[0][key].matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort(),
      );
  }
});
