const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/variable-quick-fix-ui/run-" + Date.now()),
  root = path.join(base, "Project");
fs.mkdirSync(root, { recursive: true });
const source =
  "title: Start\n---\n<<set $source_count = 3>>\n<<set $reader_count = 4>>\n<<set $graph_count = 5>>\n<<set $shared = 2>>\n===\n";
fs.writeFileSync(
  path.join(root, "definitions.yarn"),
  "title: Definitions\n---\n<<declare $shared = 0>>\n===\n",
);
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
    const current = async () =>
      (
        await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        )
      ).snapshot.projects
        .find((p) => p.root === root)
        .documents.find((d) => d.name === "sample.yarn").text;
    const waitDeclared = async (name) => {
      for (let i = 0; i < 60; i++) {
        if ((await current()).includes("<<declare $" + name)) return;
        await page.waitForTimeout(100);
      }
      throw Error("missing declaration " + name);
    };
    const selectSource = async (name) =>
      page.evaluate(async (name) => {
        const m = await new Promise((resolve) =>
          window.require(["vs/editor/editor.main"], resolve),
        );
        const editor = m.editor
            .getEditors()
            .find((e) => e.getDomNode()?.offsetParent),
          model = editor.getModel();
        const offset = model.getValue().indexOf("$" + name);
        editor.setPosition(model.getPositionAt(offset + 2));
        editor.focus();
      }, name);
    await page
      .locator(".monaco-editor .view-line")
      .filter({ hasText: "<<set $source_count = 3>>" })
      .hover({ position: { x: 65, y: 12 } });
    await page.getByRole("link", { name: "新增宣告", exact: true }).waitFor();
    assert.equal(
      await page.locator(".source-command-popup:visible").count(),
      0,
      "error hover suppresses command documentation",
    );
    await page.getByRole("link", { name: "新增宣告", exact: true }).click();

    await waitDeclared("source_count");
    await page.keyboard.press("Control+z");
    for (
      let i = 0;
      i < 30 && (await current()).includes("<<declare $source_count");
      i++
    )
      await page.waitForTimeout(100);
    assert(!(await current()).includes("<<declare $source_count"));
    await selectSource("source_count");
    await page.keyboard.press("Alt+Enter");
    await waitDeclared("source_count");
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    await page
      .locator(".reading-editor .cm-line")
      .filter({ hasText: "reader_count" })
      .first()
      .click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page
      .locator(".cm-undeclared-variable")
      .filter({ hasText: "$reader_count" })
      .first()
      .hover();
    await page.getByRole("button", { name: "新增宣告", exact: true }).waitFor();
    assert.equal(
      await page.locator(".reading-command-tooltip:visible").count(),
      1,
      "only diagnostic tooltip is shown",
    );
    await page.getByRole("button", { name: "新增宣告", exact: true }).click();
    await waitDeclared("reader_count");
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    await page
      .locator(".graph-scene-editor .cm-line")
      .filter({ hasText: "graph_count" })
      .first()
      .click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+Enter");
    await waitDeclared("graph_count");
    assert(
      !(await current()).includes("<<declare $shared"),
      "cross-file declaration must not be duplicated",
    );
    assert.deepEqual(pageErrors, []);
    console.log(
      "PASS declaration quick fixes in source, reading and graph; source undo and cross-file declarations",
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
