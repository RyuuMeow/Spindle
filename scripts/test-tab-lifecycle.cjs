const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const { _electron } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const base = path.resolve("outputs/tab-lifecycle/run-" + Date.now()),
  root = path.join(base, "Project");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "sample.yarn"),
  "title: Start\n---\nHello\n===\n",
);
(async () => {
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [
        "dist-desktop/app/desktop/main.cjs",
        "--user-data-dir=" + path.join(base, "profile"),
      ],
    });
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
    const menu = async (name) => {
      await page.getByRole("button", { name: "Project", exact: true }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    const tab = (name) =>
      page.getByRole("tab", { name: new RegExp("：" + name + "$") });
    const native = await app.browserWindow(page);
    await native.evaluate((w) => w.setContentSize(1100, 650));
    await menu("設定…");
    await page.getByRole("button", { name: "快捷鍵", exact: true }).click();
    await page.locator(".settings-scroll").evaluate((e) => {
      e.scrollTop = 80;
      e.dataset.retained = "yes";
    });
    const scroll = await page
      .locator(".settings-scroll")
      .evaluate((e) => e.scrollTop);
    await tab("sample.yarn").click();
    await tab("設定").click();
    assert.equal(
      await page
        .locator('.settings-navigation [aria-current="page"]')
        .innerText(),
      "快捷鍵",
    );
    assert.equal(
      await page.locator(".settings-scroll").getAttribute("data-retained"),
      "yes",
    );
    assert.equal(
      await page.locator(".settings-scroll").evaluate((e) => e.scrollTop),
      scroll,
    );
    await menu("自訂指令");
    const name = page.getByRole("textbox", { name: "變數名稱", exact: true });
    await name.fill("temporary");
    await tab("設定").click();
    await tab("自訂指令").click();
    assert.equal(await name.inputValue(), "temporary");
    const snapshot = await page.evaluate(() =>
      window.yarnDesktop.request({ type: "snapshot" }),
    );
    assert(snapshot.snapshot.projects.every((p) => !("commandDraft" in p)));
    await page.keyboard.press("Control+w");
    await tab("自訂指令").waitFor({ state: "detached" });
    await menu("自訂指令");
    assert.equal(await name.inputValue(), "");
    await name.fill("applied");
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page.getByText("已套用", { exact: true }).waitFor();
    await name.fill("not_saved");
    await page.keyboard.press("Control+w");
    await tab("自訂指令").waitFor({ state: "detached" });
    await menu("自訂指令");
    assert.equal(await name.inputValue(), "applied");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(base, "verified.png") });
    fs.writeFileSync(
      path.join(base, "results.json"),
      JSON.stringify({ passed: true, settingsScroll: scroll, errors }, null, 2),
    );
    console.log(
      "PASS retained settings/command state; close discards draft; applied definitions remain",
    );
  } finally {
    await app?.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
