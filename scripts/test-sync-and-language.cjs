const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/sync-language-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialDocs, initialCommands } = require(path.join(out, "sample.cjs"));
const profile = fs.mkdtempSync(path.join(out, "profile-"));
initialCommands[0].displayName = "淡入";
initialCommands[0].params[0].displayName = "秒數";
initialCommands[0].params[0].description = "淡入所需秒數";
const documents = initialDocs.map((d, index) => ({
  ...d,
  id: "document-" + index,
  version: 0,
  status: "draft",
}));
documents[1].text += "\n/// 專案分數\n<<declare $project_score = 5>>\n";
const first = documents[0];
const historical = first.text.replace(
  "遠方的燈塔卻沒有亮起",
  "海上的燈塔仍然明亮",
);
const project = {
  id: "design-test",
  name: "The Last Light",
  documents,
  commands: initialCommands,
  excluded: [],
  recovery: [
    {
      id: "version-1",
      documentId: first.id,
      name: first.name,
      text: historical,
      at: Date.now() - 100000,
      reason: "定期快照",
    },
    {
      id: "deleted-1",
      documentId: "removed",
      name: "Deleted.yarn",
      text: "title: Deleted\n---\n保留的刪除內容\n===",
      at: Date.now() - 90000,
      reason: "刪除前",
      deleted: true,
    },
  ],
};
fs.writeFileSync(
  path.join(profile, "workspace-v2.json"),
  JSON.stringify({
    projects: [project],
    currentProjectId: project.id,
    notices: [],
  }),
);
const results = {
    scope:
      "Isolated Electron profile; actual 1440px UI; native Windows trash with disposable fixture",
  },
  errors = [];
let app, page;
async function mode(name) {
  await page.getByRole("radio", { name, exact: true }).click();
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name + ".png") });
}
(async () => {
  try {
    const launcher =
      process.env.DESKTOP_PORTABLE_TEST === "1"
        ? (options) =>
            require("./portable-test-driver.cjs").launch(playwright, options)
        : (options) => playwright._electron.launch(options);
    app = await launcher({
      executablePath:
        process.env.DESKTOP_EXECUTABLE ||
        path.resolve("node_modules/electron/dist/electron.exe"),
      args: [
        ...(process.env.DESKTOP_EXECUTABLE
          ? []
          : [path.resolve("dist-desktop/app/desktop/main.cjs")]),
        "--user-data-dir=" + profile,
        "--force-device-scale-factor=1",
      ],
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (request) =>
      errors.push(request.url() + ": " + request.failure()?.errorText),
    );
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: first.name, exact: true }).click();

    assert((await page.title()).includes("Spindle"));
    const brand = await app.evaluate(({ app }) => ({
      name: app.getName(),
      profile: app.getPath("userData"),
    }));
    assert.equal(brand.name, "Spindle");
    assert.equal(path.resolve(brand.profile), path.resolve(profile));
    results.brandAndProfile = true;
    await page.evaluate(() => document.fonts.ready);

    await app.evaluate(({ clipboard }) => {
      global.__clipboardFormats = clipboard
        .availableFormats()
        .map((format) => [format, clipboard.readBuffer(format)]);
    });
    const snapshot = async () =>
      (
        await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        )
      ).snapshot;
    const text = async () => {
      await page.waitForTimeout(120);
      return (await snapshot()).projects[0].documents[0].text;
    };
    const currentLine = async () => (await text()).split(/\r?\n/).at(-1);
    async function newLine() {
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Enter");
    }

    await page.locator(".monaco-editor .view-lines").waitFor();
    const beforeSync = await text();
    await mode("閱讀編輯");
    await page.locator(".reading-editor .cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n// mode_sync_probe");
    await mode("純文字");
    await page.locator(".monaco-editor .view-lines").waitFor();
    await page.waitForFunction(
      () =>
        window.monaco.editor
          .getModels()
          .some((m) => m.getValue().includes("mode_sync_probe")),
      null,
      { timeout: 3000 },
    );
    assert((await text()).includes("mode_sync_probe"));
    // Separate the edits from the engine's intentional 500 ms typing group.
    await page.waitForTimeout(550);
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("_first_key");
    assert((await text()).endsWith("mode_sync_probe_first_key"));
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() =>
      window.monaco.editor
        .getModels()
        .some((m) => m.getValue().endsWith("mode_sync_probe")),
    );
    await page.keyboard.press("Control+z");
    assert.equal(await text(), beforeSync, "mode switch does not add history");
    await page.keyboard.press("Control+y");
    assert((await text()).endsWith("mode_sync_probe"));
    results.modeSyncAndUndo = true;

    for (const name of ["純文字", "閱讀編輯"]) {
      await mode(name);
      await page
        .locator(
          name === "純文字" ? ".monaco-editor" : ".reading-editor .cm-content",
        )
        .click();
      await newLine();
      await page.keyboard.type("<<set ", { delay: 85 });
      const list = page.locator(
        name === "純文字" ? ".suggest-widget.visible" : ".spindle-completions",
      );
      await list.waitFor();
      assert(
        (await list.innerText()).includes("$project_score"),
        "cross-file variable " + name,
      );
      await list
        .locator(name === "純文字" ? ".label-name" : ".cm-completionLabel")
        .filter({ hasText: /^\$project_score$/ })
        .click();
      await page.keyboard.type(" = ", { delay: 70 });
      await page
        .locator(".command-tip-slot.is-active")
        .filter({ hasText: /^值$/ })
        .waitFor();
      await shot("variables-" + name);
      await page.keyboard.type("7>>", { delay: 50 });
      assert(
        (await text()).includes("<<set $project_score = 7>>"),
        "single dollar and closer " + name,
      );
      await page.keyboard.press("Escape");
      await newLine();
      await page.keyboard.type("<<wait ", { delay: 85 });
      await page.locator(".command-parameter-popup").waitFor();
      assert.match(
        await page.locator(".command-parameter-popup").innerText(),
        /秒數/,
      );
      assert.match(
        await page.locator(".command-parameter-popup").innerText(),
        /整數或小數/,
      );
      await shot("builtin-" + name);
      await page.keyboard.type("0.5>>", { delay: 60 });
      await page.keyboard.press("Escape");
      await newLine();
      await page.keyboard.type("<<if $gold >= 5 and ", { delay: 80 });
      await page
        .locator(".command-tip-slot.is-active")
        .filter({ hasText: /^條件$/ })
        .waitFor();
      await page.keyboard.type("true>>", { delay: 40 });
      await page.keyboard.press("Escape");
      results[name] = true;
    }
    await mode("流程圖");
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    await page.locator(".graph-scene-editor .cm-content").click();
    await newLine();
    await page.keyboard.type("<<set $proj", { delay: 90 });
    const graphList = page.locator(".spindle-completions");
    await graphList
      .locator(".cm-completionLabel")
      .filter({ hasText: /^\$project_score$/ })
      .click();
    await page.keyboard.type(" = 8>>", { delay: 60 });
    await page
      .getByRole("button", { name: "結束節點編輯", exact: true })
      .click();
    await mode("純文字");
    await page.waitForFunction(() =>
      window.monaco.editor
        .getModels()
        .some((m) => m.getValue().includes("<<set $project_score = 8>>")),
    );
    results.graphSyncAndVariables = true;

    // Capture transient spinners, not just the post-save state.
    await page.evaluate(() => {
      window.__renameSpinners = [];
      window.__renameObserver = new MutationObserver(() => {
        if (document.querySelector(".inline-name-editor .save-spinner"))
          window.__renameSpinners.push(true);
      });
      window.__renameObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    const target = page.getByRole("button", { name: "Shop.yarn", exact: true });
    await target.dblclick();
    const filename = page.getByRole("textbox", {
      name: "劇本名稱",
      exact: true,
    });
    await filename.fill("RenamedShop");
    await filename.press("Enter");
    await page
      .getByRole("button", { name: "RenamedShop.yarn", exact: true })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => {
        window.__renameObserver.disconnect();
        return window.__renameSpinners;
      }),
      [],
    );
    results.quietRename = true;
    const tabCount = await page.locator("[role=tab]").count();
    await page
      .getByRole("button", { name: "RenamedShop.yarn", exact: true })
      .click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "移到垃圾桶", exact: true })
      .click();
    await page
      .getByRole("button", { name: "RenamedShop.yarn", exact: true })
      .waitFor({ state: "detached" });
    assert.equal(await page.getByRole("dialog").count(), 0);
    const deleted = (await snapshot()).projects[0].recovery.find(
      (r) => r.name === "RenamedShop.yarn" && r.deleted,
    );
    assert(deleted, "trash preserves recoverable source");
    await page.evaluate(
      (recoveryId) =>
        window.yarnDesktop.request({
          type: "recover",
          projectId: "design-test",
          recoveryId,
        }),
      deleted.id,
    );
    await page
      .getByRole("button", { name: "RenamedShop.yarn", exact: true })
      .waitFor();
    assert.equal(await page.locator("[role=tab]").count(), tabCount - 1, "recovering a deleted document does not open an unsolicited tab");
    results.deleteWithoutPromptAndRestore = true;

    const diskRoot = fs.mkdtempSync(path.join(out, "trash-project-"));
    const diskFile = path.join(diskRoot, "TrashProbe.yarn");
    const diskText = "title: TrashProbe\n---\nRestorable fixture\n===";
    fs.writeFileSync(diskFile, diskText);
    await app.evaluate(({ dialog, shell }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
      const realTrash = shell.trashItem.bind(shell);
      global.__trashCalls = [];
      shell.trashItem = async (file) => {
        global.__trashCalls.push(file);
        return realTrash(file);
      };
    }, diskRoot);
    await page
      .getByRole("button", { name: "The Last Light", exact: true })
      .click();
    await page.getByRole("menuitem", { name: /開啟專案資料夾/ }).click();
    const diskRow = page.getByRole("button", {
      name: "TrashProbe.yarn",
      exact: true,
    });
    await diskRow.waitFor();
    await diskRow.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "移到垃圾桶", exact: true })
      .click();
    await diskRow.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("dialog").count(), 0);
    const diskProject = (await snapshot()).projects.find(
      (p) => p.root === diskRoot,
    );
    assert.equal(diskProject.documents.length, 0, "disk trash operation completes before checking the filesystem");
    assert(!fs.existsSync(diskFile));
    assert.deepEqual(await app.evaluate(() => global.__trashCalls), [diskFile]);
    const entry = diskProject.recovery.find(
      (r) => r.name === "TrashProbe.yarn" && r.deleted,
    );
    assert.equal(entry.text, diskText);
    await page.evaluate(
      ({ projectId, recoveryId }) =>
        window.yarnDesktop.request({ type: "recover", projectId, recoveryId }),
      { projectId: diskProject.id, recoveryId: entry.id },
    );
    await diskRow.waitFor();
    assert.equal(fs.readFileSync(diskFile, "utf8"), diskText);
    results.nativeTrashAndRestore = true;
    results.passed = true;
    assert.equal(errors.length, 0, errors.join("\n"));
  } catch (e) {
    results.error = e.stack;
    process.exitCode = 1;
    console.error(e);
    if (page) await shot("failure").catch(() => {});
  } finally {
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(results);
    await app
      ?.evaluate(({ app, clipboard }) => {
        if (global.__clipboardFormats) {
          clipboard.clear();
          for (const [format, buffer] of global.__clipboardFormats)
            clipboard.writeBuffer(format, buffer);
        }
        app.exit(0);
      })
      .catch(() => {});
  }
})();
