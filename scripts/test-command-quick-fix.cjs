const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/command-quick-fix-ui/run-" + Date.now()),
  root = path.join(base, "Project");
fs.mkdirSync(root, { recursive: true });
const source =
  'title: Start\n---\n<<show_item apple>>\n<<play_effect 2 true>>\n<<reading_item "apple pie">>\n<<reading_key 3>>\n<<graph_item apple>>\n===\n';
fs.writeFileSync(path.join(root, "sample.yarn"), source);
(async () => {
  let app;
  try {
    app = await pw._electron.launch({
      executablePath: require("electron"),
      args: [
        "dist-desktop/app/desktop/main.cjs",
        "--user-data-dir=" + path.join(base, "profile"),
      ],
    });
    const page = await app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .waitFor();
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, root);
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .click();
    await page
      .getByRole("button", { name: "sample.yarn", exact: true })
      .click();
    await page.locator(".monaco-editor .view-lines").waitFor();
    assert(fs.existsSync(path.join(root, ".spindle", "project.json")));
    assert(!fs.existsSync(path.join(root, ".yarn-workbench")));
    const registered = async (name) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const r = await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        );
        if (
          r.snapshot.projects.some((p) =>
            p.commands.some((c) => c.name === name),
          )
        )
          return;
        await page.waitForTimeout(100);
      }
      throw Error("Command not registered: " + name);
    };
    await page
      .locator(".monaco-editor .view-line")
      .filter({ hasText: "<<show_item apple>>" })
      .hover({ position: { x: 65, y: 20 } });
    await page.waitForTimeout(1200);
    await page.getByRole("link", { name: "新增指令", exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".monaco-hover")
        .last()
        .evaluate((e) => getComputedStyle(e).borderRadius),
      "6px",
    );
    await page.screenshot({ path: path.join(base, "diagnostic.png") });
    await page.getByRole("link", { name: "新增指令", exact: true }).click();
    await registered("show_item");
    await page
      .locator(".monaco-editor .view-line")
      .filter({ hasText: "<<play_effect 2 true>>" })
      .click({ position: { x: 65, y: 20 } });
    await page.keyboard.press("Alt+Enter");

    const fix = page.getByText("新增指令「play_effect」", { exact: true });
    if (await fix.isVisible()) await fix.click();
    await registered("play_effect");
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    await page.locator(".reading-editor .cm-content").waitFor();
    await page
      .getByText('<<reading_item "apple pie">>', { exact: true })
      .hover({ position: { x: 65, y: 20 } });
    await page.getByRole("button", { name: "新增指令", exact: true }).click();
    await registered("reading_item");
    await page
      .getByText("<<reading_key 3>>", { exact: true })
      .click({ position: { x: 65, y: 20 } });
    await page.keyboard.press("Alt+Enter");
    await registered("reading_key");
    await page.keyboard.press("Control+f");
    await page.locator(".cm-search").waitFor();
    assert.equal(
      await page
        .locator(".cm-panels:has(.cm-search)")
        .evaluate((e) => getComputedStyle(e).borderRadius),
      "6px",
    );
    await page.screenshot({ path: path.join(base, "reading-find.png") });
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+f");
    await page.locator(".find-widget.visible").waitFor();
    assert.equal(
      await page
        .locator(".find-widget.visible")
        .evaluate((e) => getComputedStyle(e).borderRadius),
      "6px",
    );
    await page.waitForTimeout(300);
    const findInside = await page
      .locator(".find-widget.visible")
      .evaluate((e) => {
        const r = e.getBoundingClientRect(),
          parent = e.closest(".monaco-editor").getBoundingClientRect();
        return r.top >= parent.top && r.bottom <= parent.bottom;
      });
    assert(findInside, "Find stays inside editor after entrance animation");
    await page.screenshot({ path: path.join(base, "plain-find.png") });
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    await page
      .locator(".graph-scene-editor .cm-line")
      .filter({ hasText: "<<graph_item apple>>" })
      .click({ position: { x: 60, y: 12 } });
    await page.keyboard.press("Alt+Enter");
    await registered("graph_item");
    const snapshot = (
      await page.evaluate(() =>
        window.yarnDesktop.request({ type: "snapshot" }),
      )
    ).snapshot;
    const project = snapshot.projects.find((p) => p.root === root);
    assert.equal(
      project.commands.filter((c) => c.name === "show_item").length,
      1,
    );
    assert.deepEqual(pageErrors, []);
    assert.equal(project.documents[0].text, source);
    assert.equal(
      fs.readFileSync(path.join(root, "sample.yarn"), "utf8"),
      source,
    );
    await page.screenshot({ path: path.join(base, "registered.png") });
    fs.writeFileSync(
      path.join(base, "results.json"),
      JSON.stringify(
        { passed: true, commands: project.commands, base },
        null,
        2,
      ),
    );
    console.log(
      "PASS .spindle, diagnostic styling, plain hover/Alt+Enter, reading hover/Alt+Enter, graph Alt+Enter, Find geometry, unchanged source",
    );
  } finally {
    if (app)
      await (
        await app.firstWindow()
      )
        .screenshot({ path: path.join(base, "final.png") })
        .catch(() => {});
    await app?.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
