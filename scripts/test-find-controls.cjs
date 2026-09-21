const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const pw = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/find-controls/run-" + Date.now()),
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

    await page.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+f");
    await page.locator(".find-widget.visible").waitFor();
    await page.waitForTimeout(350);
    const close = page.locator(".find-widget > .codicon-widget-close");
    const next = page.locator(".find-widget .button.codicon-find-next-match");
    const c = await close.boundingBox(),
      n = await next.boundingBox();
    assert(
      Math.abs(c.y + c.height / 2 - n.y - n.height / 2) <= 1,
      JSON.stringify({ c, n }),
    );
    await page.locator(".find-widget .toggle.left").click();
    const controls = page.locator(
      '.find-widget [role="button"]:visible, .find-widget [role="checkbox"]:visible',
    );
    const checked = [];
    for (const control of await controls.all()) {
      const label = await control.getAttribute("aria-label");
      const box = await control.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const disabled = (await control.getAttribute("aria-disabled")) === "true";
      for (let sample = 0; sample < 8; sample++) {
        await page.waitForTimeout(250);
        assert.equal(
          await page.locator(".workbench-hover.with-pointer:visible").count(),
          0,
          label,
        );
        if (!disabled)
          assert(
            await control.evaluate((e) => {
              const r = e.getBoundingClientRect();
              return e.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              );
            }),
            label,
          );
      }
      checked.push(label);
    }
    assert(checked.length >= 9, JSON.stringify(checked));
    console.log("Checked controls:", checked);
    await close.hover();
    await page.screenshot({ path: path.join(base, "find-hover.png") });
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await page.locator(".find-widget.visible").waitFor({ state: "hidden" });
    assert.deepEqual(pageErrors, []);
    console.log(
      "PASS Find/Replace controls: alignment, no obstructing hover and working close",
    );
  } finally {
    await app?.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
