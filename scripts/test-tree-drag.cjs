const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/tree-drag-ui",
);
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const source = "title: Start\n---\nMira: Test\n===";
fs.writeFileSync(
  path.join(profile, "workspace-v2.json"),
  JSON.stringify({
    projects: [
      {
        id: "drag-test",
        name: "Drag rules",
        commands: [],
        documents: [
          ["chapter", "A/B/Chapter_01.yarn"],
          ["untitled", "A/Untitled 2.yarn"],
          ["shop", "A/Shop.yarn"],
          ["light", "Lighthouse.yarn"],
        ].map(([id, name]) => ({
          id,
          name,
          text: source.replace("Start", id),
          saved: source.replace("Start", id),
          version: 0,
          status: "draft",
        })),
        folders: ["C", "A", "A/B"],
        excluded: [],
        recovery: [],
      },
    ],
    currentProjectId: "drag-test",
    notices: [],
  }),
);
const result = { errors: [], events: [] };
let app, page;
const settle = () => page.waitForTimeout(350);
const request = (a) => page.evaluate((a) => window.yarnDesktop.request(a), a);
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
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => result.errors.push(e.message));
    await (
      await app.browserWindow(page)
    ).evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page
      .getByRole("button", { name: "A/Shop.yarn", exact: true })
      .count();
    await page.locator('[data-entry="file:shop"] .file-row').waitFor();

    await page.evaluate(() => {
      window.dragEvents = [];
      for (const type of ["dragstart", "dragend", "drop"])
        document.addEventListener(
          type,
          (e) =>
            window.dragEvents.push({
              type,
              target: e.target.closest("[data-entry]")?.dataset.entry,
              defaultPrevented: e.defaultPrevented,
            }),
          true,
        );
    });
    for (const id of ["shop", "untitled", "chapter"]) {
      const item = page.locator('[data-entry="file:' + id + '"] .file-row');
      await item.click();
      await settle();
      const a = await item.boundingBox(),
        b = await page.locator('[data-folder-end=""]').boundingBox();
      await page.mouse.move(a.x + 30, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + 30, b.y + 18, { steps: 16 });
      await settle();
      assert.equal(
        await page.getByText("移到專案最外層", { exact: true }).count(),
        0,
      );
      assert.equal(
        await page.locator('[data-folder-end=""].tree-drop-before').count(),
        1,
      );
      await page.mouse.up();
      await settle();
      const doc = (
        await request({ type: "snapshot" })
      ).snapshot.projects[0].documents.find((d) => d.id === id);
      result[id] = {
        name: doc.name,
        events: await page.evaluate(() => window.dragEvents.slice()),
      };
      assert.ok(!doc.name.includes("/"), id + " should move to root");
    }

    const shop = page.locator('[data-entry="file:shop"] .file-row'),
      folder = page.locator('[data-entry="folder:C"] .file-row');
    const a = await shop.boundingBox(),
      b = await folder.boundingBox();
    await page.mouse.move(a.x + 25, a.y + 16);
    await page.mouse.down();
    await page.mouse.move(a.x + 27, a.y + 17);
    await settle();
    assert.equal(await page.locator(".file-tree.is-dragging").count(), 0);
    await page.mouse.up();
    await page.mouse.move(a.x + 25, a.y + 16);
    await page.mouse.down();
    await page.mouse.move(b.x + 25, b.y + 16, { steps: 12 });
    await settle();
    assert.equal(await page.locator(".tree-drop-inside").count(), 1);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await settle();
    assert.equal(
      (await request({ type: "snapshot" })).snapshot.projects[0].documents.find(
        (d) => d.id === "shop",
      ).name,
      "Shop.yarn",
    );
    result.cancelAndThreshold = true;
    const nested = page.locator('[data-entry="folder:A/B"] .file-row'),
      n = await nested.boundingBox();
    await page.mouse.move(n.x + 25, n.y + 16);
    await page.mouse.down();
    await page.mouse.move(b.x + 25, b.y + 16, { steps: 12 });
    await page.mouse.up();
    await settle();
    assert.ok(
      (
        await request({ type: "snapshot" })
      ).snapshot.projects[0].folders.includes("C/B"),
    );
    result.folderMove = true;
    await shop.dblclick();
    await page
      .getByRole("textbox", { name: "劇本名稱", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".check-button svg.lucide-check").count(),
      1,
    );
    await request({
      type: "createDocument",
      projectId: "drag-test",
      name: "Broken.yarn",
      text: "title: Broken\n---\n<<unknown>>\n<<if true>>\n===",
    });
    await settle();
    const counts = await page.locator(".check-button").evaluate((e) => {
      const a = e.querySelector(".diagnostic-count.error"),
        b = e.querySelector(".diagnostic-count.warning");
      return {
        error: a?.textContent,
        warning: b?.textContent,
        gap:
          a && b
            ? b.getBoundingClientRect().left - a.getBoundingClientRect().right
            : 0,
      };
    });
    assert.equal(counts.error, "1");
    assert.equal(counts.warning, "1");
    assert.ok(counts.gap >= 12);
    result.diagnostics = counts;

    await request({
      type: "createDocument",
      projectId: "drag-test",
      name: "Graph.yarn",
      text: "title: Start\n---\nHello\n<<jump End>>\n===\ntitle: End\n---\nWorld\n<<jump Start>>\n===\ntitle: Orphan\n---\nUnrelated\n===",
    });
    await settle();
    await page.getByRole("button", { name: "Graph.yarn", exact: true }).click();
    await page.getByRole("radio", { name: "流程圖", exact: true }).click();
    await settle();
    await page.getByRole("button", { name: "自動整理", exact: true }).click();
    await settle();
    const paths = () =>
      page
        .locator(".react-flow__edge-path")
        .evaluateAll((es) => es.map((e) => e.getAttribute("d")));
    const before = await paths(),
      orphan = page.locator(".react-flow__node").filter({ hasText: "Orphan" }),
      o = await orphan.boundingBox();
    await page.mouse.move(o.x + 30, o.y + 20);
    await page.mouse.down();
    await page.mouse.move(o.x + 105, o.y - 15, { steps: 14 });
    await page.mouse.up();
    await settle();
    assert.equal(before.length, 2, "forward and feedback edges are present");
    const after = await paths(),
      next = await orphan.boundingBox();
    assert.ok(Math.abs(next.x - o.x) > 30);
    assert.deepEqual(after, before);
    result.graphDragStable = true;
    result.passed = true;
  } catch (e) {
    result.passed = false;
    result.failure = e.stack;
    process.exitCode = 1;
  } finally {
    if (page) {
      result.events = await page
        .evaluate(() => window.dragEvents || [])
        .catch(() => []);
      await page
        .screenshot({ path: path.join(out, "result.png") })
        .catch(() => {});
    }
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(result);
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
