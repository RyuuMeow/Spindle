const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/workspace-navigation-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialDocs } = require(path.join(out, "sample.cjs"));
const root = fs.mkdtempSync(path.join(out, "project-")),
  profile = fs.mkdtempSync(path.join(out, "profile-"));
fs.mkdirSync(path.join(root, "Chapter"));
fs.mkdirSync(path.join(root, "Empty"));
for (const d of initialDocs) fs.writeFileSync(path.join(root, d.name), d.text);
fs.writeFileSync(
  path.join(root, "Chapter", "Inside.yarn"),
  "title: Inside\n---\nMira: Inside.\n===",
);
const result = { errors: [] };
let app, page;
const settle = () => page.waitForTimeout(450);
const request = (a) => page.evaluate((a) => window.yarnDesktop.request(a), a);
const project = async () =>
  (await request({ type: "snapshot" })).snapshot.projects.find(
    (p) => p.root === root,
  );
async function openMenu(name) {
  await page.getByRole("button", { name, exact: true }).click();
  await settle();
}
async function dragEntry(from, to, ratio = 0.1) {
  const source = page.locator('[data-entry="' + from + '"]'),
    target = to.startsWith("end:")
      ? page.locator('[data-folder-end="' + to.slice(4) + '"]')
      : page.locator('[data-entry="' + to + '"]');
  const origin = await source.locator(".file-row").boundingBox();
  const box = await target.boundingBox();
  await page.mouse.move(origin.x + 25, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + box.height * ratio, { steps: 12 });
  await settle();
  assert.ok(
    await page
      .locator(".tree-drop-before,.tree-drop-after,.tree-drop-inside")
      .count(),
    "drop indicator",
  );
  const indicator = page.locator(".tree-drop-before").first();
  if (await indicator.count()) {
    const css = await indicator.evaluate((e) => {
      const s = getComputedStyle(e, "::before");
      return {
        color: s.backgroundColor,
        height: s.height,
        radius: s.borderRadius,
      };
    });
    assert.deepEqual(css, {
      color: "rgb(238, 238, 238)",
      height: "2px",
      radius: "0px",
    });
  }
  await page.mouse.up();
  await settle();
}
(async () => {
  try {
    const launch =
      process.env.DESKTOP_PORTABLE_TEST === "1"
        ? (o) => require("./portable-test-driver.cjs").launch(playwright, o)
        : (o) => playwright._electron.launch(o);
    app = await launch({
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
    result.version = await app.evaluate(({ app }) => app.getVersion());
    if (process.env.DESKTOP_PORTABLE_TEST === "1")
      assert.equal(
        result.version,
        JSON.parse(fs.readFileSync("package.json", "utf8")).version,
      );
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => result.errors.push(e.message));
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, root);
    await openMenu("The Last Light");
    await page
      .getByRole("menuitem", { name: "開啟專案資料夾…", exact: true })
      .click();
    await settle();
    await page
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .click();
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    await openMenu("場景大綱");
    await page.locator(".node-row").filter({ hasText: "Departure" }).click();
    await settle();
    const reading = await page.evaluate(() => {
      const v = document.querySelector(".cm-content").cmTile.root.view;
      const sel = v.state.selection.main.head;
      return {
        line: v.state.doc.lineAt(sel).text,
        scroll: v.scrollDOM.scrollTop,
      };
    });
    assert.match(reading.line, /Mira|if/);
    assert.ok(reading.scroll > 0);
    result.outline = reading;
    await page
      .locator(".node-row")
      .filter({ hasText: /^Start$/ })
      .click();
    await settle();
    await page
      .locator('.reading-fold-marker[aria-label="收合場景"]')
      .first()
      .click();
    await settle();
    assert.ok(await page.locator(".reading-folded").count());
    await page
      .locator(".node-row")
      .filter({ hasText: /^Start$/ })
      .click();
    await settle();
    assert.equal(await page.locator(".reading-folded").count(), 0);
    result.foldedNavigation = true;
    await openMenu("純閱讀");
    assert.ok(await page.locator(".dialogue-reader").isVisible());
    const plain = await page.locator(".dialogue-reader").innerText();
    assert.ok(plain.includes("Mira:"));
    assert.ok(!plain.includes("has_key"));
    assert.ok(!plain.includes("opening"));
    assert.ok(!plain.includes("fade_in"));
    await page.locator(".node-row").filter({ hasText: "Start" }).click();
    await settle();
    assert.ok(
      await page
        .locator(".dialogue-reader h2")
        .filter({ hasText: /^Start$/ })
        .isVisible(),
    );
    await openMenu("純閱讀");
    await openMenu("作者統計");
    assert.ok(await page.locator(".statistics-panel").isVisible());
    assert.ok(!(await page.locator(".workspace-scenes").count()));
    await page
      .locator("button.statistics-bar")
      .filter({ hasText: "Village" })
      .click();
    await settle();
    assert.ok(await page.locator(".statistics-panel").isVisible());
    result.readerAndAnalysis = true;
    await openMenu("作者統計");
    // Folder single click selects without toggling, arrow alone toggles, double click renames.
    const f = page.getByRole("button", { name: "資料夾 Chapter", exact: true });
    await f.click();
    assert.ok(
      await page
        .getByRole("button", { name: "Inside.yarn", exact: true })
        .isVisible(),
    );
    await f.click();
    assert.ok(
      await page
        .getByRole("button", { name: "Inside.yarn", exact: true })
        .isVisible(),
    );
    await openMenu("收合 Chapter");
    assert.equal(
      await page
        .getByRole("button", { name: "Inside.yarn", exact: true })
        .count(),
      0,
    );
    await openMenu("展開 Chapter");
    await f.dblclick();
    await page
      .getByRole("textbox", { name: "資料夾名稱", exact: true })
      .fill("Scenes");
    await page.keyboard.press("Enter");
    await settle();
    assert.ok(fs.existsSync(path.join(root, "Scenes", "Inside.yarn")));
    let p = await project(),
      inside = p.documents.find((d) => d.name === "Scenes/Inside.yarn"),
      chapter = p.documents.find((d) => d.name === "Chapter_01.yarn");
    await dragEntry("file:" + inside.id, "file:" + chapter.id);
    p = await project();
    assert.ok(
      p.documents.some((d) => d.id === inside.id && d.name === "Inside.yarn"),
    );
    assert.ok(fs.existsSync(path.join(root, "Inside.yarn")));
    await dragEntry("file:" + inside.id, "folder:Scenes", 0.5);
    assert.ok(fs.existsSync(path.join(root, "Scenes", "Inside.yarn")));
    await dragEntry("file:" + inside.id, "end:");
    assert.ok(fs.existsSync(path.join(root, "Inside.yarn")));
    await dragEntry("folder:Scenes", "file:" + chapter.id);
    p = await project();
    assert.ok(
      p.treeOrder.indexOf("folder:Scenes") <
        p.treeOrder.indexOf("file:" + chapter.id),
    );
    await openMenu("新增資料夾");
    const newFolder = page.getByRole("textbox", {
      name: "資料夾名稱",
      exact: true,
    });
    assert.equal(
      await newFolder.evaluate((e) => e.selectionEnd - e.selectionStart),
      10,
    );
    await newFolder.fill("Fresh");
    await page.keyboard.press("Enter");
    await settle();
    assert.ok(fs.existsSync(path.join(root, "Fresh")));
    result.folders = true;
    // Duplicate directly then select basename for renaming; removal menu is gone.
    await openMenu("劇本選項 Chapter_01.yarn");
    assert.equal(
      await page
        .getByRole("menuitem", { name: "從專案移除", exact: true })
        .count(),
      0,
    );
    await page.getByRole("menuitem", { name: "複製劇本", exact: true }).click();
    const input = page.getByRole("textbox", { name: "劇本名稱", exact: true });
    await input.waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.ok(await input.evaluate((e) => e.selectionEnd > e.selectionStart));
    await input.fill("Copy");
    await page.keyboard.press("Enter");
    await settle();
    assert.ok(fs.existsSync(path.join(root, "Copy.yarn")));
    result.duplicate = true;
    await app.evaluate(
      async ({ shell }, target) => {
        const fs = process.getBuiltinModule("fs");
        shell.trashItem = async (file) => {
          fs.renameSync(file, target);
        };
      },
      path.join(out, "trashed-copy-" + Date.now() + ".yarn"),
    );
    await openMenu("劇本選項 Copy.yarn");
    await page
      .getByRole("menuitem", { name: "移到垃圾桶", exact: true })
      .click();
    await settle();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.ok(!fs.existsSync(path.join(root, "Copy.yarn")));

    await page
      .getByRole("button", { name: "Chapter_01.yarn", exact: true })
      .click();
    await page
      .locator(".node-row")
      .filter({ hasText: /^Village$/ })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "複製場景", exact: true }).click();
    const sceneName = page.getByRole("textbox", {
      name: "場景名稱",
      exact: true,
    });
    await sceneName.waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await sceneName.fill("VillageCopy");
    await page.keyboard.press("Enter");
    await settle();
    await page
      .locator(".node-row")
      .filter({ hasText: /^VillageCopy$/ })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "刪除場景", exact: true }).click();
    await settle();
    assert.equal(await page.getByRole("dialog").count(), 0);
    result.sceneDuplicate = true;
    await page.getByRole("button", { name: "結構檢查", exact: true }).hover();
    await page.waitForTimeout(600);
    const tips = page.locator('[role="tooltip"]');
    const tip = await tips.last().boundingBox();
    assert.ok(tip.y >= 44, "tooltip avoids native title bar");
    result.tooltip = tip;
    await page.mouse.move(1400, 900);
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await settle();
    await openMenu("自動整理");
    await settle();
    await page.screenshot({ path: path.join(out, "graph.png") });
    result.graphLabels = await page
      .locator(".flow-edge-label")
      .allTextContents();
    assert.equal(
      result.graphLabels.length,
      7,
      "all sample choice and condition labels remain visible",
    );
    const label = page.locator(".flow-edge-label").first();
    if (await label.count()) {
      await label.click();
      assert.equal(await page.locator(".flow-connection-detail").count(), 0);
    }
    result.graphSelection = true;
    await page
      .getByRole("button", { name: path.basename(root), exact: true })
      .click();
    const menu = page.locator(".project-menu");
    const metrics = await menu
      .locator('[role="menuitem"]')
      .evaluateAll((items) =>
        items.map((e) => ({
          text: e.textContent,
          padding: getComputedStyle(e).paddingLeft,
        })),
      );
    assert.ok(metrics.every((m) => m.padding === "34px"));
    result.projectMenu = true;
    await page.keyboard.press("Escape");
    await win.evaluate((w) => w.setContentSize(800, 800));
    await settle();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false);
    await page.screenshot({ path: path.join(out, "narrow.png") });
    result.narrow = true;
    assert.deepEqual(result.errors, []);
    result.passed = true;
  } catch (e) {
    result.error = e.stack;
    process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, "failure.png") });
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(result);
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
