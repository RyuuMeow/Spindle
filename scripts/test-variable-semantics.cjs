const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/variable-semantics-ui/run-" + Date.now()),
  root = path.join(base, "Project");
fs.mkdirSync(root, { recursive: true });
const source =
  "title: Start\n---\n<<set $shared = true>>\n<<set $reader_count = 4>>\n<<set $graph_count = 5>>\n<<set $shared = 2>>\n===\n";
fs.writeFileSync(
  path.join(root, "definitions.yarn"),
  'title: Definitions\n---\n<<declare $shared = 0>>\n<<declare $label = "" >>\n===\n',
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

    const activeSource = async () =>
      page.evaluate(async () => {
        const m = await new Promise((resolve) =>
          window.require(["vs/editor/editor.main"], resolve),
        );
        const e = m.editor
          .getEditors()
          .find((e) => e.getDomNode()?.offsetParent);
        return {
          text: e.getModel().getValue(),
          line: e.getPosition().lineNumber,
          errors: m.editor
            .getModelMarkers({ resource: e.getModel().uri })
            .filter((x) => x.severity === 8)
            .map((x) => x.message),
        };
      });
    const sourcePoint = async () =>
      page
        .locator(".monaco-editor .view-line")
        .filter({ hasText: "set $shared = 2" })
        .evaluate((el) => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const start = node.textContent.indexOf("$shared");
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(node, start + 2);
            range.setEnd(node, start + 3);
            const r = range.getBoundingClientRect();
            return { x: r.left + 1, y: r.top + r.height / 2 };
          }
          throw Error("missing source variable");
        });
    const verifyDestination = async () => {
      for (let i = 0; i < 50; i++) {
        const state = await activeSource();
        if (state.text.includes("title: Definitions") && state.line === 3) {
          assert.equal(state.line, 3);
          return;
        }
        await page.waitForTimeout(100);
      }
      throw Error("declaration navigation failed");
    };

    await page.evaluate(async () => {
      const m = await new Promise((resolve) =>
        window.require(["vs/editor/editor.main"], resolve),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
      e.setSelection(new m.Range(3, 7, 3, 14));
      e.focus();
    });
    await page.keyboard.press("Control+Shift+f");
    await page.getByLabel("搜尋全專案文字", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("搜尋全專案文字", { exact: true }).inputValue(),
      "$shared",
    );
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      const m = await new Promise((resolve) =>
        window.require(["vs/editor/editor.main"], resolve),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
      e.executeEdits("test", [
        { range: new m.Range(3, 1, 3, 23), text: "<<set $label = hello>>" },
      ]);
      e.setPosition({ lineNumber: 3, column: 20 });
      e.focus();
    });
    // Let the normal typing history group close before invoking the fix.
    await page.waitForTimeout(600);
    await page.keyboard.press("Alt+Enter");
    assert((await activeSource()).text.includes('<<set $label = "hello">>'));
    await page.keyboard.press("Control+z");
    for (
      let i = 0;
      i < 30 && !(await activeSource()).text.includes("<<set $label = hello>>");
      i++
    )
      await page.waitForTimeout(100);
    assert((await activeSource()).text.includes("<<set $label = hello>>"));
    await page.keyboard.press("Control+z");
    for (
      let i = 0;
      i < 30 && !(await activeSource()).text.includes("<<set $shared = true>>");
      i++
    )
      await page.waitForTimeout(100);
    const caret = await page.evaluate(async () => {
      const m = await new Promise((resolve) =>
        window.require(["vs/editor/editor.main"], resolve),
      );
      const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
      return {
        height: e.getOption(m.editor.EditorOption.cursorHeight),
        font: e.getOption(m.editor.EditorOption.fontSize),
      };
    });
    assert.equal(caret.height, caret.font + 2);
    for (const mode of ["source", "reading", "graph"]) {
      await page
        .getByRole("button", { name: "sample.yarn", exact: true })
        .click();
      if (mode === "reading")
        await page
          .getByRole("radio", { name: "閱讀編輯", exact: true })
          .click();
      if (mode === "graph") {
        await page.getByRole("radio", { name: "流程圖", exact: true }).click();
        await page
          .locator(".flow-card-title")
          .filter({ hasText: /^Start$/ })
          .dblclick();
      }
      console.log("Testing", mode);
      let point;
      if (mode === "source") {
        for (let i = 0; i < 30; i++) {
          if ((await activeSource()).errors.some((m) => m.includes("指派")))
            break;
          await page.waitForTimeout(100);
        }
        assert(
          (await activeSource()).errors.some((m) => m.includes("指派")),
          "type error has red marker",
        );
        point = await sourcePoint();
      } else {
        const host =
          mode === "reading" ? ".reading-editor" : ".graph-scene-editor";
        const badge = page
          .locator(host + " .cm-line")
          .filter({ hasText: /shared.*2/ })
          .locator(".reading-variable")
          .last();
        if (await badge.count()) {
          await badge.hover();
          const r = await badge.boundingBox();
          await page.mouse.move(r.x + r.width - 2, r.y + r.height / 2);
          await page.locator(".variable-tooltip:visible").waitFor();
          assert.equal(
            await page.locator(".reading-command-tooltip:visible").count(),
            1,
            "badge hover has no overlapping command help",
          );
        }
        const line = page
          .locator(host + " .cm-line")
          .filter({ hasText: /shared.*2/ })
          .last();
        await line.click();
        // Editing exposes source text even in reading mode.
        point = await line.evaluate((el) => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const start = node.textContent.lastIndexOf("$shared");
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(node, start + 2);
            range.setEnd(node, start + 3);
            const rect = range.getBoundingClientRect();
            return { x: rect.left + 1, y: rect.top + rect.height / 2 };
          }
          throw Error("missing variable text");
        });
      }
      await page.mouse.move(point.x, point.y);
      await page.locator(".variable-tooltip:visible").waitFor();
      const tooltip = await page
        .locator(".variable-tooltip:visible")
        .innerText();
      assert(
        tooltip.includes("number") &&
          tooltip.includes("初始值：0") &&
          tooltip.includes("definitions.yarn"),
        tooltip,
      );
      await page.keyboard.down("Control");
      await page.mouse.move(point.x + 1, point.y);
      await page.locator(".spindle-source-link").first().waitFor();
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up("Control");
      await verifyDestination();
    }
    assert.deepEqual(pageErrors, []);
    console.log(
      "PASS variable types, metadata and cross-file Ctrl navigation in source, reading and graph",
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
