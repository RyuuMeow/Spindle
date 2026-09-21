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
  process.env.DESKTOP_TEST_OUTPUT || "outputs/ui-redesign",
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
      w.setContentSize(1440, 900);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: first.name, exact: true }).click();
    await mode("閱讀編輯");
    await page.locator(".reading-title").first().waitFor();
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    assert(
      await page.getByRole("complementary", { name: "場景大綱" }).isVisible(),
    );
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    assert.equal(await page.locator(".writing-footer").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "儲存", exact: true }).count(),
      0,
    );
    assert(
      await page
        .getByRole("button", { name: "存成檔案…", exact: true })
        .isVisible(),
    );
    assert.equal(await page.locator(".tab-shell .dirty-dot").count(), 0);
    results.shellAndDraftState = true;
    await shot("01-reading");
    await page
      .locator('.reading-fold-marker[title="收合場景"]')
      .first()
      .click();
    await page.locator(".reading-folded").first().waitFor();
    await mode("純文字");
    await mode("閱讀編輯");
    await page.locator(".reading-folded").first().waitFor();
    await page.locator(".reading-folded").first().click();
    assert((await page.locator(".reading-editor svg").count()) > 0);
    results.foldPersistenceAndSvg = true;
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n// draft persistence check");
    await wait(
      async () => (await current()).text.includes("draft persistence check"),
      "draft not persisted",
    );
    await wait(
      async () => !(await page.locator(".tab-shell .dirty-dot").count()),
      "draft still marked unsaved",
    );
    assert(
      fs
        .readFileSync(path.join(profile, "workspace-v2.json"), "utf8")
        .includes("draft persistence check"),
    );
    await page.keyboard.press("Control+z");
    await wait(
      async () => !(await current()).text.includes("draft persistence check"),
      "draft undo failed",
    );
    results.draftPersistence = true;
    await page.keyboard.press("Control+Shift+F");
    const search = page.getByRole("combobox", {
      name: "搜尋全專案文字",
      exact: true,
    });
    await search.fill("Mira");
    await search.press("ArrowDown");
    await search.press("Enter");
    assert.equal(
      await page
        .getByRole("radio", { name: "閱讀編輯", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    await search.waitFor({ state: "detached" });
    await page.keyboard.press("Control+Shift+F");
    assert.equal(await search.inputValue(), "Mira");
    await shot("02-search");
    await page.locator(".search-overlay-results [role=option]").first().click();
    await search.waitFor({ state: "detached" });
    results.searchPaletteAndModes = true;
    const beforeHistory = await current();
    await page.getByRole("button", { name: "版本歷史", exact: true }).click();
    await page.locator(".history-entries > button").first().click();
    await page.getByRole("region", { name: "唯讀版本預覽" }).waitFor();
    await page.getByRole("radio", { name: "比較", exact: true }).click();
    await page.locator(".monaco-diff-editor").waitFor();
    assert.equal((await current()).version, beforeHistory.version);
    assert.equal((await current()).text, beforeHistory.text);
    await shot("03-history");
    // A peer transaction while previewing must disable stale restoration.
    await page.evaluate(
      async (doc) =>
        window.yarnDesktop.request({
          type: "transaction",
          projectId: "design-test",
          label: "peer",
          documents: [
            {
              id: doc.id,
              version: doc.version,
              edits: [
                {
                  from: doc.text.length,
                  to: doc.text.length,
                  insert: "\n// peer changed",
                },
              ],
            },
          ],
        }),
      beforeHistory,
    );
    await wait(
      async () =>
        await page
          .getByRole("button", { name: "還原此版本", exact: true })
          .isDisabled(),
      "stale restore remained enabled",
    );
    await page.getByRole("button", { name: "返回編輯", exact: true }).click();
    await page.locator(".history-entries > button").first().click();
    await page.getByRole("button", { name: "還原此版本", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "還原此版本", exact: true })
      .click();
    await wait(
      async () => (await current()).text === historical,
      "restore failed",
    );
    assert(
      (await snapshot()).snapshot.projects[0].recovery.some((e) =>
        e.text.includes("peer changed"),
      ),
    );
    results.historyReadonlyComparisonAndStaleGuard = true;
    await menu("設定…");
    await page.getByRole("region", { name: "設定", exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".workspace-sidebar:visible, .document-side:visible")
        .count(),
      0,
    );
    const size = page.getByRole("spinbutton", {
      name: "閱讀字級",
      exact: true,
    });
    await size.fill("");
    await size.press("2");
    assert.equal(await size.inputValue(), "2");
    await size.press("0");
    await size.press("Enter");
    assert.equal(await size.inputValue(), "20");
    await page.getByRole("radio", { name: "寬版", exact: true }).click();
    await shot("04-settings");
    results.settingsSurfaceAndNumberEditing = true;
    await page
      .getByRole("tab", { name: new RegExp(first.name.replace(".yarn", "")) })
      .first()
      .click();
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    for (const width of [1440, 1100, 800]) {
      await win.evaluate((w, width) => w.setContentSize(width, 800), width);
      await page.waitForTimeout(100);
      assert(
        await page.getByRole("complementary", { name: "場景大綱" }).isVisible(),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (width < 1280)
        assert.equal(
          await page.locator(".workspace-sidebar").isVisible(),
          false,
        );
      const outlineBounds = await page
        .getByRole("complementary", { name: "場景大綱" })
        .boundingBox();
      assert(
        outlineBounds.y + outlineBounds.height <= 795,
        "outline respects the bottom application gutter",
      );
      await shot("outline-" + width);
    }
    await page.getByRole("button", { name: "場景大綱", exact: true }).click();
    await win.evaluate((w) => w.setContentSize(1440, 900));
    await mode("流程圖");
    await page.locator(".flow-card").first().waitFor();
    await shot("05-graph");
    assert.equal(
      await page.locator(".flow-card-meta,.flow-readonly-note").count(),
      0,
    );
    await page.getByRole("button", { name: "找場景", exact: true }).click();
    const graphSearch = page.getByRole("textbox", {
      name: "圖內搜尋場景",
      exact: true,
    });
    await graphSearch.fill("NoSuchScene");
    await shot("06-graph-search");
    results.graphSimplification = true;
    await menu("自訂指令");
    await page
      .getByRole("textbox", { name: "變數名稱", exact: true })
      .waitFor();
    assert(await page.locator(".command-workspace").isVisible());
    await shot("07-commands");
    await page.keyboard.press("Control+w");
    await menu("最近刪除與指令復原");
    await page.getByRole("button", { name: /Deleted.yarn/ }).click();
    await page.getByRole("region", { name: "唯讀版本預覽" }).waitFor();
    await shot("08-deleted-preview");
    results.commandAndRecoverySurfaces = true;
    assert.equal(errors.length, 0, errors.join("\n"));
    results.passed = true;
  } catch (e) {
    results.error = e.stack;
    process.exitCode = 1;
    if (page) await shot("failure").catch(() => {});
    console.error(e);
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
