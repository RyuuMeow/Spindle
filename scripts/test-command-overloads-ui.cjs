const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/command-overloads-ui");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const root = path.join(profile, "Project");
fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
fs.writeFileSync(
  path.join(profile, "preferences.json"),
  JSON.stringify({ language: "zh-TW" }),
);
fs.writeFileSync(
  path.join(root, "test.yarn"),
  "title: Start\n---\nMira: Hello\n===",
);
const pause = {
  name: "pause",
  inline: true,
  markupMode: "selfClosing",
  description: "Pause preset",
  example: "",
  params: [
    {
      name: "pause",
      type: "string",
      required: true,
      defaultValue: "",
      allowList: ["short", "normal", "long"],
    },
  ],
};
const count = {
  name: "count",
  description: "Count",
  example: "",
  params: [
    {
      name: "value",
      type: "number",
      required: true,
      defaultValue: "",
      min: 1,
      max: 10,
      integer: true,
    },
  ],
};
fs.writeFileSync(
  path.join(root, ".spindle", "project.json"),
  JSON.stringify({ version: 2, name: "Overload UI", commands: [pause, count] }),
);
const errors = [],
  checks = [];
let app, page;
async function until(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  throw Error(message);
}
async function launch(openDocument = true) {
  app = await _electron.launch({
    executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [
      path.resolve("dist-desktop/app/desktop/main.cjs"),
      "--user-data-dir=" + profile,
    ],
    env: { ...process.env, SPINDLE_LOCALE: "zh-TW" },
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  const win = await app.browserWindow(page);
  await win.evaluate((w) => {
    w.setContentSize(1280, 900);
    w.show();
    w.focus();
  });
  const open = page.getByRole("button", {
    name: /^(開啟專案資料夾|Open project folder)$/,
  });
  await open
    .or(page.getByRole("button", { name: "Overload UI", exact: true }))
    .first()
    .waitFor();
  if (await open.isVisible()) {
    await app.evaluate(({ dialog }, projectRoot) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [projectRoot],
      });
    }, root);
    await open.click();
  }
  if (openDocument)
    await page.getByRole("button", { name: "test.yarn", exact: true }).click();
}
async function project() {
  return page.evaluate(
    async (projectRoot) =>
      (
        await window.yarnDesktop.request({ type: "snapshot" })
      ).snapshot.projects.find((p) => p.root === projectRoot),
    root,
  );
}
(async () => {
  try {
    await launch();
    for (const [mode, selector, list] of [
      ["純文字", ".monaco-editor textarea", ".suggest-widget.visible"],
      ["閱讀編輯", ".reading-editor .cm-content", ".spindle-completions"],
      ["流程圖", ".graph-scene-editor .cm-content", ".spindle-completions"],
    ]) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      if (mode === "流程圖")
        await page
          .locator(".flow-card-title")
          .filter({ hasText: /^Start$/ })
          .dblclick();
      const input = page.locator(selector).first();
      await input.focus();
      const reset = async (body) => {
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("Control+a");
        await page.keyboard.insertText(
          mode === "流程圖" ? body + "\n" : `title: Start\n---\n${body}\n===`,
        );
        await page.keyboard.press("Control+Home");
        if (mode !== "流程圖") {
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowDown");
        }
        await page.keyboard.press("End");
      };
      await reset("Mira: [pause=n]");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Control+Space");
      await page.locator(list).waitFor();
      await page
        .locator(list)
        .getByText("normal", { exact: true })
        .first()
        .click();
      await until(
        async () =>
          (await project()).documents[0].text.includes('[pause="normal"]'),
        mode + " allow list completion",
      );
      if (mode !== "流程圖") await page.keyboard.press("Escape");
      await input.focus();
      await reset("Mira: [pause=500/] [pause=normal/]");
      await page.keyboard.press("Control+Home");
      await page.waitForTimeout(1000);
      assert.equal(
        await page
          .locator(
            mode === "純文字" ? ".squiggly-error" : ".cm-undeclared-variable",
          )
          .count(),
        0,
      );
      await input.focus();
      await reset("Mira: [puase=normal/]");
      await page.keyboard.press("Control+Home");
      await page
        .locator(
          mode === "純文字" ? ".squiggly-warning" : ".reading-markup-warning",
        )
        .first()
        .waitFor();
      await page.screenshot({ path: path.join(out, mode + "-warning.png") });
      await input.focus();
      await reset("<<count 1.5>>");
      await page.keyboard.press("Control+Home");
      await page
        .locator(
          mode === "純文字" ? ".squiggly-error" : ".cm-undeclared-variable",
        )
        .first()
        .waitFor();
      checks.push(
        mode +
          ": allowed value completion, builtin/custom overload acceptance, unknown warning, integer error",
      );
      if (mode === "流程圖") await page.keyboard.press("Escape");
    }
    await page
      .getByRole("button", { name: "Overload UI", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "自訂指令", exact: true }).click();
    await page
      .locator(".command-list .command-row")
      .filter({ hasText: /^count/ })
      .click();
    await page.getByText("參數限制", { exact: true }).click();
    assert.equal(
      await page.getByLabel("最小值（含）", { exact: true }).inputValue(),
      "1",
    );
    assert.equal(
      await page.getByLabel("最大值（含）", { exact: true }).inputValue(),
      "10",
    );
    assert(
      await page
        .getByRole("checkbox", { name: "僅限整數", exact: true })
        .isChecked(),
    );
    await page.getByLabel("最大值（含）", { exact: true }).fill("0");
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "參數限制無效" }).waitFor();
    await page.getByLabel("最大值（含）", { exact: true }).fill("8");
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await until(
      async () =>
        (await project()).commands.find((c) => c.name === "count").params[0]
          .max === 8,
      "numeric limits saved",
    );
    await page
      .getByRole("button", { name: "指令更多操作", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "新增重載", exact: true }).click();
    await page
      .getByRole("combobox", { name: "參數 1 型別", exact: true })
      .click();
    await page.getByRole("option", { name: "文字", exact: true }).click();
    const allow = page.getByLabel("允許值（每行一個）", { exact: true });
    if (!(await allow.isVisible()))
      await page.getByText("參數限制", { exact: true }).click();
    await allow.fill("few\nmany");
    await page.getByRole("button", { name: "套用定義", exact: true }).click();
    await until(
      async () =>
        (await project()).commands.filter((c) => c.name === "count").length ===
        2,
      "new overload saved",
    );
    const added = (await project()).commands.find(
      (c) => c.name === "count" && c.params[0].type === "string",
    );
    assert.deepEqual(added.params[0].allowList, ["few", "many"]);
    assert.equal(added.params[0].min, undefined);
    await page.screenshot({ path: path.join(out, "constraints.png") });
    checks.push(
      "Manager: limits validation, persistence, overload creation and type change clears incompatible limits",
    );
    await app.evaluate(({ app }) => app.exit(0));
    app = null;
    await launch(false);
    const reopened = await project();
    assert.equal(reopened.commands.filter((c) => c.name === "count").length, 2);
    assert.equal(
      reopened.commands.find(
        (c) => c.name === "count" && c.params[0].type === "number",
      ).params[0].max,
      8,
    );
    checks.push("Restart: overloads and constraints survive disk reload");
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (page)
      await page
        .screenshot({ path: path.join(out, "failure.png") })
        .catch(() => {});
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(checks);
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
