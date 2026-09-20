const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const playwright = require(
  process.env.PLAYWRIGHT_MODULE ||
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const portable = process.env.SPINDLE_PORTABLE === "1",
  version = require("../package.json").version;
const out = path.resolve(
    process.env.DESKTOP_TEST_OUTPUT || "outputs/project-launcher-ui",
  ),
  base = path.join(out, "run-" + Date.now()),
  profile = path.join(base, "profile"),
  root = path.join(base, "Story");
fs.mkdirSync(path.join(root, "Folder", "Nested"), { recursive: true });
fs.writeFileSync(
  path.join(root, "one.yarn"),
  "title: Start\n---\nNarrator: Hello from Spindle.\n-> Continue\n    <<jump Next>>\n===\n\ntitle: Next\n---\nMira: The end.\n===",
);
fs.writeFileSync(
  path.join(root, "Folder", "two.yarn"),
  "title: Two\n---\nMira: Saved dialogue.\n===",
);
fs.writeFileSync(
  path.join(root, "Folder", "asset.bin"),
  Buffer.from([0, 255, 128]),
);
fs.writeFileSync(
  path.join(root, "Folder", "Nested", "third.yarn"),
  "title: Third\n---\nHello\n===",
);
const results = { portable, version, checks: [], errors: [], requests: [] };
let app, page;
async function launch(args = []) {
  const instance = await (portable
    ? require("./portable-test-driver.cjs").launch(playwright, {
        executablePath: path.resolve(
          `release/Spindle-${version}-Portable-x64.exe`,
        ),
        args: [`--user-data-dir=${profile}`, ...args],
        timeout: 60000,
      })
    : playwright._electron.launch({
        executablePath: require("electron"),
        args: [
          "dist-desktop/app/desktop/main.cjs",
          `--user-data-dir=${profile}`,
          ...args,
        ],
        timeout: 30000,
      }));
  const first = await instance.firstWindow();
  first.on("pageerror", (error) => results.errors.push(error.message));
  first.on("request", (request) => {
    if (/worker|wasm/.test(request.url())) results.requests.push(request.url());
  });
  if (portable)
    assert.equal(
      await instance.evaluate(({ app }) => app.getVersion()),
      version,
    );
  return instance;
}
async function snap() {
  return page
    .evaluate(() => window.yarnDesktop.request({ type: "snapshot" }))
    .then((r) => r.snapshot);
}
async function pick(file) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
}
async function projectMenu(label) {
  await page.locator(".project-switch").click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
function done(s) {
  results.checks.push(s);
  console.log("PASS " + s);
}
(async () => {
  try {
    app = await launch();
    page = await app.firstWindow();
    page.on("pageerror", (e) => console.log("PAGEERROR " + e.message));
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    assert.equal((await snap()).projects.length, 0);
    await page.screenshot({ path: path.join(base, "01-home.png") });
    done("fresh start shows launcher without sample projects");
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByRole("checkbox", { name: "啟動時開啟上次專案" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "顯示與閱讀", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("checkbox", { name: "顯示行號", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "返回專案列表", exact: true })
      .click();
    done(
      "launcher settings expose global controls without temporary workspace preferences",
    );
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.getByRole("textbox", { name: "新專案名稱" }).fill("New Story");
    await pick(base);
    await page
      .getByRole("button", { name: "選擇父資料夾", exact: true })
      .click();
    await page
      .locator("form")
      .getByRole("button", { name: "建立專案", exact: true })
      .click();
    await page.locator(".project-switch").waitFor();
    assert(
      fs.existsSync(path.join(base, "New Story/.yarn-workbench/project.json")),
    );
    done("create form creates named subfolder and manifest");
    await projectMenu("關閉專案");
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    await pick(root);
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .click();
    await page.getByRole("button", { name: "one.yarn", exact: true }).waitFor();
    await page.getByRole("button", { name: "one.yarn", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    done("open folder creates project metadata and enters editor");
    await page.context().setOffline(true);
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__edge").length > 0,
    );
    assert(results.requests.some((url) => url.endsWith(".wasm")));
    assert(results.requests.some((url) => /layout\.worker/.test(url)));
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    await page.locator(".cm-editor").first().waitFor();
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    done("offline three-mode editing loads packaged graph Worker and WASM");
    const divider = await page.locator(".workspace-tab-divider").boundingBox();
    assert.equal(divider.width, 1);
    const arrows = await page
      .locator(".folder-disclosure")
      .evaluateAll((elements) =>
        elements.map((e) => ({
          button: e.getBoundingClientRect().toJSON(),
          icon: e.querySelector("svg").getBoundingClientRect().toJSON(),
        })),
      );
    assert(arrows.length);
    for (const a of arrows)
      assert(
        Math.abs(
          a.button.x + a.button.width / 2 - a.icon.x - a.icon.width / 2,
        ) < 1,
      );
    done("divider and disclosure SVG alignment");
    await page
      .getByRole("button", { name: "one.yarn", exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: /垃圾桶/ }).click();
    await page
      .getByRole("button", { name: "one.yarn", exact: true })
      .waitFor({ state: "hidden" });
    await projectMenu("最近刪除與指令復原");
    await page
      .locator(".history-entries button")
      .filter({ hasText: "one.yarn" })
      .click();
    await page.locator(".history-preview").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "返回編輯", exact: true }).count(),
      0,
    );
    await page.getByRole("radio", { name: "比較", exact: true }).click();
    await page.screenshot({ path: path.join(base, "02-recovery.png") });
    await projectMenu("設定…");
    await page.locator(".tab-shell").filter({ hasText: "專案復原" }).click();
    await page.locator(".history-preview").waitFor();
    assert.equal(
      await page
        .getByRole("radio", { name: "比較", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    done("recovery selection and compare survive switching tabs");
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await page.locator(".history-preview").waitFor({ state: "hidden" });
    assert(fs.existsSync(path.join(root, "one.yarn")));
    assert(await page.locator(".recovery-workspace").isVisible());
    done("restore removes trash item without navigation");
    // Create two deleted fixtures through the named desktop service, then exercise clear/cancel in the UI.
    let state = await snap(),
      p = state.projects.find((p) => p.root === root);
    await page.evaluate(
      async ({ id, doc }) => {
        await window.yarnDesktop.request({
          type: "removeDocument",
          projectId: id,
          documentId: doc,
          deleteDisk: true,
        });
        await window.yarnDesktop.request({
          type: "trashFolder",
          projectId: id,
          name: "Folder",
        });
      },
      { id: p.id, doc: p.documents.find((d) => d.name === "one.yarn").id },
    );
    await page
      .locator(".history-entries button")
      .filter({ hasText: "Folder" })
      .waitFor();
    await page
      .locator(".history-entries button")
      .filter({ hasText: "Folder" })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "復原", exact: true }).click();
    assert.deepEqual(
      fs.readFileSync(path.join(root, "Folder", "asset.bin")),
      Buffer.from([0, 255, 128]),
    );
    done("folder context restore preserves non-Yarn assets");
    await page
      .getByRole("textbox", { name: "篩選復原項目" })
      .fill("no matches");
    await page.getByRole("button", { name: "清空垃圾桶", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert(
      (await snap()).projects
        .find((p) => p.id === state.projects.find((p) => p.root === root).id)
        .recovery.some((e) => e.deleted),
    );
    await page.getByRole("button", { name: "清空垃圾桶", exact: true }).click();
    await page.getByRole("button", { name: "永久刪除", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert(
      !(await snap()).projects
        .find((p) => p.root === root)
        .recovery.some((e) => e.deleted),
    );
    done("clear trash ignores search filter and cancel preserves contents");
    await projectMenu("關閉專案");
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    assert.equal((await snap()).projects.length, 0);
    await page
      .locator(".launcher-project")
      .filter({ hasText: root })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "改名", exact: true }).click();
    await page
      .getByRole("textbox", { name: "專案名稱", exact: true })
      .fill("Renamed Story");
    await page
      .getByRole("textbox", { name: "專案名稱", exact: true })
      .press("Enter");
    await page.getByRole("button", { name: /Renamed Story/ }).waitFor();
    assert(fs.existsSync(root));
    done("launcher inline rename preserves directory");
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByRole("button", { name: "編輯與保存", exact: true }).click();
    await page.getByRole("checkbox", { name: "啟動時開啟上次專案" }).check();
    await page
      .getByRole("button", { name: "返回專案列表", exact: true })
      .click();
    await page.getByRole("button", { name: /Renamed Story/ }).click();
    await page.locator(".recovery-workspace").waitFor();
    done("reopening project restores recovery tab and query");
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.locator(".recovery-workspace").waitFor();
    done("opt-in reopens last project");
    await projectMenu("關閉專案");
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    done("explicit close suppresses auto-reopen");
    await app.close();
    const single = path.join(base, "single.yarn");
    fs.writeFileSync(single, "title: Alone\n---\nStandalone\n===");
    app = await launch([single]);
    page = await app.firstWindow();
    await page.locator(".monaco-editor .view-lines").waitFor();
    assert.equal(await page.locator(".file-list").count(), 0);
    assert(!fs.existsSync(path.join(base, ".yarn-workbench")));
    assert.equal((await snap()).projects[0].kind, "standalone");
    done("cold file launch opens independent single-file workspace");
    await page.screenshot({ path: path.join(base, "03-single-file.png") });
    await page.locator(".editor-surface").dispatchEvent("compositionstart");
    await projectMenu("關閉檔案");
    await page
      .getByRole("dialog")
      .filter({ hasText: "尚未完成保存" })
      .waitFor();
    assert(await page.locator(".monaco-editor").first().isVisible());
    await page.getByRole("button", { name: "返回編輯", exact: true }).click();
    await page.locator(".editor-surface").dispatchEvent("compositionend");
    await page.waitForTimeout(60);
    done("composition prevents leaving and retains editor");
    await page
      .locator(".monaco-editor")
      .first()
      .click({ position: { x: 160, y: 80 } });
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("// saved on exit");
    await app.close();
    assert(fs.readFileSync(single, "utf8").includes("saved on exit"));
    done("immediate native close flushes single-file edits");
    app = await launch([path.join(root, "Folder", "two.yarn")]);
    page = await app.firstWindow();
    await page.locator(".monaco-editor .view-lines").waitFor();
    assert.equal((await snap()).projects[0].kind, "project");
    assert(
      (await page.locator(".tab-shell.active").innerText()).includes("two"),
    );
    done(
      "known file cold launch resolves project and selects requested document",
    );

    const originalPage = page;
    await page.locator(".tab-shell.active").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "同稿另一個視圖", exact: true })
      .click();
    const sharedOpening = app.waitForEvent("window");
    await page.locator(".tab-shell.active").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "移至新視窗", exact: true })
      .click();
    const shared = await sharedOpening;
    await shared.locator(".monaco-editor .view-lines").waitFor();
    await projectMenu("關閉專案");
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    fs.appendFileSync(
      path.join(root, "Folder", "two.yarn"),
      "\n// external after peer close",
    );
    await shared.waitForFunction(async () => {
      const r = await window.yarnDesktop.request({ type: "snapshot" });
      return r.snapshot.projects.some((p) =>
        p.documents.some((d) => d.text.includes("external after peer close")),
      );
    });
    await (await app.browserWindow(originalPage)).evaluate((w) => w.close());
    await originalPage.waitForEvent("close").catch(() => {});
    page = shared;
    done("shared project remains watched until its final window leaves");
    const projectPage = page,
      opening = app.waitForEvent("window");
    await page.evaluate(
      (file) =>
        window.yarnDesktop.request({ type: "openFiles", paths: [file] }),
      single,
    );
    const peer = await opening;
    await peer.locator(".monaco-editor .view-lines").waitFor();
    assert.equal(app.windows().length, 2);
    await peer.evaluate(
      (file) =>
        window.yarnDesktop.request({ type: "openFiles", paths: [file] }),
      single,
    );
    assert.equal(app.windows().length, 2);
    done(
      "warm file routing opens one independent window and deduplicates repeated file opens",
    );
    const other = (
      await peer.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      )
    ).snapshot.projects.find((p) => p.kind === "standalone");
    await peer.evaluate(
      (p) =>
        window.yarnDesktop.request({
          type: "composition",
          projectId: p.id,
          documentId: p.documents[0].id,
          active: true,
        }),
      other,
    );
    page = projectPage;
    await projectMenu("關閉專案");
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    done("unrelated window composition does not block project close");
    await peer.evaluate(
      (p) =>
        window.yarnDesktop.request({
          type: "composition",
          projectId: p.id,
          documentId: p.documents[0].id,
          active: false,
        }),
      other,
    );

    await app.close();
    app = null;
    const catalogFile = path.join(profile, "project-catalog-v1.json"),
      catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
    for (let i = 1; i <= 7; i++) {
      const folder = path.join(base, "Recent " + i);
      fs.mkdirSync(path.join(folder, ".yarn-workbench"), { recursive: true });
      fs.writeFileSync(
        path.join(folder, ".yarn-workbench/project.json"),
        JSON.stringify({
          id: "recent-" + i,
          name: "Recent " + i,
          commands: [],
          files: [],
        }),
      );
      catalog.entries.push({
        id: "recent-" + i,
        name: "Recent " + i,
        root: folder,
        lastOpenedAt: Date.now() + i,
        recent: true,
      });
    }
    catalog.preferences.reopenLastProject = false;
    fs.writeFileSync(catalogFile, JSON.stringify(catalog));
    fs.renameSync(
      path.join(base, "Recent 1"),
      path.join(base, "Recent 1 moved"),
    );
    app = await launch();
    page = await app.firstWindow();
    await page
      .locator(".launcher-project")
      .filter({ hasText: "Renamed Story" })
      .waitFor();
    assert.equal(await page.locator(".launcher-project").count(), 9);
    const unavailable = page
      .locator(".launcher-project")
      .filter({ hasText: "Recent 1" });
    assert(await unavailable.locator("button").isDisabled());
    await unavailable.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "從列表中移除", exact: true })
      .click();
    assert(fs.existsSync(path.join(base, "Recent 1 moved")));
    done("unlimited catalog and invalid-path removal retain project files");
    await page.getByRole("button", { name: /Renamed Story/ }).click();
    await page.locator(".project-switch").click();
    assert.equal(
      await page
        .getByRole("menuitem")
        .filter({ hasText: /^Recent / })
        .count(),
      4,
    );
    await page
      .getByRole("menuitem", { name: "Recent 7", exact: true })
      .click({ button: "right" });
    assert(await page.locator(".project-menu").isVisible());
    await page
      .getByRole("menuitem", { name: "從最近列表中移除", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "從最近列表中移除", exact: true }).waitFor({ state: "hidden" });
    assert(await page.locator(".project-menu").isVisible());
    await page.keyboard.press("Escape");
    await page.locator(".project-menu").waitFor({ state: "hidden" });
    const recent = (await snap()).catalog.find((p) => p.id === "recent-7");
    assert(recent && !recent.recent);
    done(
      "project menu caps recent entries at five and removes recent independently",
    );
    await projectMenu("關閉專案");
    await page
      .locator(".launcher-project")
      .filter({ hasText: "Recent 7" })
      .waitFor();
    await page
      .getByRole("textbox", { name: "搜尋專案", exact: true })
      .fill("Recent 7");
    assert.equal(await page.locator(".launcher-project").count(), 1);
    await page.locator(".launcher-project").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "從列表中移除", exact: true })
      .click();
    assert(!(await snap()).catalog.some((p) => p.id === "recent-7"));
    assert(
      fs.existsSync(path.join(base, "Recent 7/.yarn-workbench/project.json")),
    );
    done("full catalog search and remove affect records only");
    await app.close();
    app = null;
    assert.deepEqual(results.errors, []);
    fs.writeFileSync(
      path.join(base, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify({ base, ...results }, null, 2));
  } catch (error) {
    console.error(error);
    if (page)
      await page
        .screenshot({ path: path.join(base, "failure.png") })
        .catch(() => {});
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    process.exitCode = 1;
  }
})();
