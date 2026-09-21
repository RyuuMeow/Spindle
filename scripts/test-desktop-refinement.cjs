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
  process.env.DESKTOP_TEST_OUTPUT || "outputs/desktop-refinement",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["scripts/fixtures/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialDocs, initialCommands } = require(path.join(out, "sample.cjs"));
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const documents = initialDocs.map((d, index) => ({
  ...d,
  id: "document-" + index,
  version: 0,
  status: "draft",
}));
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
      "Isolated Electron profile; real product UI; 1440/1100/800 CSS pixels",
  },
  errors = [];
let app, page;
const snapshot = () =>
  page.evaluate(() => window.yarnDesktop.request({ type: "snapshot" }));
const current = async () =>
  (await snapshot()).snapshot.projects.find((p) => p.id === "design-test")
    .documents[0];
const wait = async (fn, msg) => {
  for (let n = 0; n < 100; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(msg);
};
async function menu(name) {
  await page
    .getByRole("button", { name: "The Last Light", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
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
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: first.name, exact: true }).click();
    const activeId = () =>
      page.locator("[role=tab][data-state=active]").getAttribute("id");
    const originalTab = await activeId();
    await mode("閱讀編輯");
    await page.locator(".reading-title").first().waitFor();
    await shot("01-reading");
    await page
      .getByRole("button", { name: "Lighthouse.yarn", exact: true })
      .click({ button: "middle" });
    assert.equal(await page.locator("[role=tab]").count(), 2);
    const explicitTab = await activeId();
    assert.notEqual(explicitTab, originalTab);
    await page.locator("[role=tab]").first().click();
    await page
      .getByRole("button", { name: "Lighthouse.yarn", exact: true })
      .click();
    assert.equal(
      await activeId(),
      originalTab,
      "ordinary file click must not activate another matching tab",
    );
    assert.equal(await page.locator("[role=tab]").count(), 2);
    await page.getByRole("button", { name: "Shop.yarn", exact: true }).click();
    assert.equal(await activeId(), originalTab);
    await page.keyboard.press("Alt+ArrowLeft");
    await wait(
      async () =>
        (await page.locator(".document-heading").innerText()).includes(
          "Lighthouse.yarn",
        ),
      "per-tab history",
    );
    results.currentTabNavigation = true;
    await page.getByRole("button", { name: first.name, exact: true }).click();
    await page.getByRole("button", { name: "新增劇本", exact: true }).click();
    let name = page.getByRole("textbox", { name: "劇本名稱", exact: true });
    await name.waitFor();
    assert(
      await name.evaluate(
        (el) => el.selectionStart === 0 && el.selectionEnd === el.value.replace(/\.yarn$/, "").length,
      ),
    );
    assert.equal(await page.getByRole("dialog").count(), 0);
    await name.press("Escape");
    assert.equal((await snapshot()).snapshot.projects[0].documents.length, 3);
    await page.getByRole("button", { name: "新增劇本", exact: true }).click();
    await name.fill("NewChapter");
    await name.press("Enter");
    await page
      .getByRole("button", { name: "NewChapter.yarn", exact: true })
      .waitFor();
    assert.equal(await activeId(), originalTab);
    assert.equal(await page.locator("[role=tab]").count(), 2);
    results.inlineFileCreation = true;
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    await page.getByRole("button", { name: "新增場景", exact: true }).click();
    name = page.getByRole("textbox", { name: "場景名稱", exact: true });
    await name.waitFor();
    assert(
      await name.evaluate(
        (el) => el.selectionStart === 0 && el.selectionEnd === el.value.length,
      ),
    );
    await name.press("Escape");
    await page.getByRole("button", { name: "新增場景", exact: true }).click();
    await name.fill("NewScene");
    await name.press("Enter");
    await page
      .locator(".node-scroll")
      .getByRole("button", { name: "NewScene", exact: true })
      .waitFor();
    assert.equal(await activeId(), originalTab);
    assert.equal(
      await page.getByRole("button", { name: /固定大綱|關閉大綱/ }).count(),
      0,
    );
    const grip = page.getByRole("separator", { name: "調整大綱寬度" });
    const initialWidth = Number(await grip.getAttribute("aria-valuenow"));
    await grip.focus();
    await grip.press("ArrowLeft");
    assert.equal(
      Number(await grip.getAttribute("aria-valuenow")),
      initialWidth + 8,
    );
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    results.inlineSceneAndOutline = true;
    await page.getByRole("button", { name: "手動排序", exact: true }).click();
    await page.getByRole("button", { name: "名稱升冪", exact: true }).click();
    const sorting = page.getByRole("button", { name: "名稱降冪", exact: true });
    assert(await sorting.isVisible());
    assert(await sorting.locator("svg").count());
    results.sortFeedback = true;
    await page.getByRole("button", { name: first.name, exact: true }).click();
    await mode("閱讀編輯");
    await page.getByRole("button", { name: "全專案搜尋", exact: true }).click();
    const search = page.getByRole("dialog", { name: "全局搜尋", exact: true });
    await search.waitFor();
    assert.equal(await page.locator("[data-slot=dialog-overlay]").count(), 0);
    let query = page.getByRole("combobox", {
      name: "搜尋全專案文字",
      exact: true,
    });
    await query.fill("Mira");
    const unchanged = await activeId();
    await query.press("ArrowDown");
    assert.equal(await activeId(), unchanged);
    await search.getByRole("radio", { name: "檔案", exact: true }).click();
    assert(await search.isVisible());
    await search.getByRole("radio", { name: "內容", exact: true }).click();
    await query.focus();
    await query.press("Enter");
    await search.waitFor({ state: "detached" });
    assert.equal(await activeId(), unchanged);
    await page.getByRole("button", { name: "全專案搜尋", exact: true }).click();
    await search.waitFor();
    await query.fill("Lighthouse");
    await query.press("Escape");
    await search.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "全專案搜尋", exact: true }).click();
    await search.waitFor();
    await page
      .locator(".workspace-header")
      .click({ position: { x: 1050, y: 20 } });
    await search.waitFor({ state: "detached" });
    await page.keyboard.press("Control+p");
    await search.waitFor();
    await page
      .getByRole("combobox", { name: "搜尋劇本", exact: true })
      .fill("Shop");
    await shot("02-search");
    await page
      .getByRole("combobox", { name: "搜尋劇本", exact: true })
      .press("Enter");
    await search.waitFor({ state: "detached" });
    assert.equal(await activeId(), originalTab);
    results.searchPalette = true;
    await page.getByRole("button", { name: first.name, exact: true }).click();
    const beforeCommands = await activeId(),
      tabCount = await page.locator("[role=tab]").count();
    await menu("自訂指令");
    const commands = page.locator(".command-workspace");
    await commands.waitFor();
    assert.equal(await page.locator("[role=tab]").count(), tabCount + 1);
    assert.notEqual(await activeId(), beforeCommands);
    assert.equal(await page.locator("[data-slot=dialog-overlay]").count(), 0);
    await commands.getByRole("combobox", { name: "參數 1 型別" }).click();
    await page.getByRole("option", { name: "數字", exact: true }).click();
    const commandName = commands.getByRole("textbox", {
      name: "變數名稱",
      exact: true,
    });
    await commandName.fill("invalid-name");
    await page.keyboard.press("Control+s");
    assert.equal(
      (await snapshot()).snapshot.projects[0].commands[0].name,
      "fade_in",
    );
    await page.keyboard.press("Control+w");
    await commands.waitFor({ state: "detached" });
    await menu("自訂指令 · 有草稿");
    await commands.waitFor();
    assert.equal(await commandName.inputValue(), "invalid-name");
    await commandName.fill("fade_in");
    await commands
      .getByRole("textbox", { name: "指令名稱（顯示）", exact: true })
      .fill("淡入");
    await commands
      .getByRole("textbox", { name: "參數 1 顯示名稱", exact: true })
      .fill("秒數");
    await commands.locator('summary').first().click();
    await commands.getByRole('textbox',{name:'參數 1 說明',exact:true}).fill('淡入所需秒數');
    await page.keyboard.press("Control+s");
    await wait(
      async () =>
        (await snapshot()).snapshot.projects[0].commands[0].displayName ===
        "淡入",
      "display names saved",
    );
    await shot("03-command-settings");
    await win.evaluate(w=>w.setContentSize(800,760));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await shot("03a-command-settings-narrow");
    await win.evaluate(w=>w.setContentSize(1440,960));
    await page.keyboard.press("Control+w");
    await commands.waitFor({ state: "detached" });
    await page.locator(`[id="${beforeCommands}"]`).click();
    results.commandTabAndDrafts = true;
    await mode("閱讀編輯");
    await page
      .locator(".reading-parameter-hint")
      .filter({ hasText: "秒數:" })
      .first()
      .waitFor();
    assert((await current()).text.includes("<<fade_in 1.5>>"));
    assert(!(await current()).text.includes("秒數:"));
    await page
      .locator(".reading-function")
      .filter({ hasText: "淡入" })
      .first()
      .hover();
    await page.locator('.reading-command-tooltip').filter({hasText:'淡入所需秒數'}).waitFor();
    await shot("03b-command-reading-hints");
    await mode("純文字");
    await page
      .locator(".monaco-editor .view-lines")
      .getByText("秒數:", { exact: true })
      .first()
      .waitFor();
    await shot("03c-source-inlay-hints");
    await mode("閱讀編輯");
    results.virtualParameterHints = true;

    await page.getByRole("button", { name: "結構檢查", exact: true }).click();
    const diagnostics = page.getByRole("complementary", {
      name: "結構檢查",
      exact: true,
    });
    await diagnostics.waitFor();
    assert.equal(await diagnostics.locator("select").count(), 0);
    assert((await diagnostics.boundingBox()).height <= 112);
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    await shot("04-panel-depth");
    await win.evaluate((w) => w.setContentSize(800, 760));
    await page
      .getByRole("button", { name: "切換劇本側欄", exact: true })
      .click();
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    await shot("05-narrow");
    await win.evaluate((w) => w.setContentSize(1440, 960));
    results.panelLayout = true;
    await page.getByRole("button", { name: "關閉檢查", exact: true }).click();
    await mode("流程圖");
    // Graph node actions expose the direct editor without replacing the active tab.
    await page.locator(".story-canvas").waitFor();
    results.graphAvailable =
      (await page.locator(".react-flow__node").count()) > 0;
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    const sceneContent = page.getByRole("textbox", {
      name: "場景內容",
      exact: true,
    });
    await sceneContent.waitFor();
    await sceneContent.press("Control+Home");
    await page.keyboard.insertText("Narrator: node edit proof\n");
    await wait(
      async () => (await current()).text.includes("node edit proof"),
      "graph edit reaches shared source",
    );
    assert.equal(await activeId(), originalTab);
    await sceneContent.press("Control+z");
    await wait(
      async () => !(await current()).text.includes("node edit proof"),
      "graph undo",
    );
    await sceneContent.press("Control+Shift+Z");
    await wait(
      async () => (await current()).text.includes("node edit proof"),
      "graph redo",
    );
    await shot("06-graph-inline");
    await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
    await sceneContent.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "適應全部", exact: true }).click();
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Lighthouse$/ })
      .dblclick();
    await sceneContent.press("Control+Home");
    await page.keyboard.insertText("Narrator: cross-file graph edit\n");
    await wait(
      async () =>
        (await snapshot()).snapshot.projects[0].documents
          .find((d) => d.name === "Lighthouse.yarn")
          .text.includes("cross-file graph edit"),
      "cross-file graph edit",
    );
    assert.equal(await activeId(), originalTab);
    assert(
      (await page.locator(".document-heading").innerText()).includes(
        first.name,
      ),
    );
    results.graphInlineSharedSource = true;
    await page
      .getByRole("button", { name: "結束節點編輯", exact: true })
      .click();
    assert.equal(errors.length, 0, errors.join("\n"));
    results.passed = true;
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
    console.log(JSON.stringify(results));
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
