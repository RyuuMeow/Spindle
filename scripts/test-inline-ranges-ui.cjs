const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/inline-ranges-ui");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const root = path.join(profile, "Project");
fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
fs.writeFileSync(
  path.join(profile, "preferences.json"),
  JSON.stringify({ language: "zh-TW" }),
);
const text =
  'title: Start\n---\nMira: [wave power=2]one[tint color="blue"]two[/wave]three[/tint] [wave power=1]four[/wave][pause=500 /]\n// hidden comment\n[pause=100 /]\n<<pause 100>>\n\nMira: tail // hidden inline comment\n===';
const commands = [
  ["wave", "power", "number"],
  ["tint", "color", "string"],
].map(([name, param, type]) => ({
  name,
  inline: true,
  markupMode: "paired",
  params: [{ name: param, type, required: true, defaultValue: "" }],
  description: "",
  example: "",
}));
fs.writeFileSync(path.join(root, "test.yarn"), text);
fs.writeFileSync(
  path.join(root, ".spindle", "project.json"),
  JSON.stringify({ version: 2, name: "Inline ranges", commands }),
);
let app, page;
const checks = [],
  errors = [];
async function snapshot() {
  return (
    await page.evaluate(() => window.yarnDesktop.request({ type: "snapshot" }))
  ).snapshot;
}
async function patch(value) {
  return page.evaluate(
    (patch) => window.yarnDesktop.request({ type: "appearance", patch }),
    value,
  );
}
(async () => {
  try {
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
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await (
      await app.browserWindow(page)
    ).evaluate((w) => {
      w.setContentSize(1350, 940);
      w.show();
      w.focus();
    });
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, root);
    await page
      .getByRole("button", { name: "開啟專案資料夾", exact: true })
      .click();
    await page.getByRole("button", { name: "test.yarn", exact: true }).click();
    for (const mode of ["閱讀編輯", "流程圖"]) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      if (mode === "流程圖") {
        await page
          .locator(".flow-card-summary .reading-inline-name")
          .filter({ hasText: "wave" })
          .first()
          .click();
        await page
          .locator(".graph-scene-editor .reading-inline-source")
          .filter({ hasText: "[wave power=2]" })
          .waitFor();
        checks.push(
          "Graph summary badge opens the matching head and tail in its scene editor",
        );
      }
      const editor = page.locator(
        mode === "流程圖"
          ? ".graph-scene-editor .cm-content"
          : ".reading-editor .cm-content",
      );
      await editor.focus();
      await page.keyboard.press("Control+End");
      const wave = page
        .locator(".reading-inline-name")
        .filter({ hasText: "wave" });
      await wave.first().waitFor();
      assert.equal(await wave.count(), 2);
      assert.equal(await page.locator(".reading-inline-close").count(), 0);
      const styles = await page
        .locator(".reading-inline-marker")
        .evaluateAll((items) =>
          items.map((e) =>
            getComputedStyle(e).getPropertyValue("--inline-color").trim(),
          ),
        );
      assert.notEqual(styles[0], styles[1]);
      const overlap = await page
        .locator(".reading-inline-scope")
        .evaluateAll((items) =>
          items.some(
            (e) =>
              (
                getComputedStyle(e).backgroundImage.match(/linear-gradient/g) ||
                []
              ).length === 2,
          ),
        );
      assert(overlap, "overlapping ranges have two independent solid lines");
      await page.mouse.move(20, 20);
      // Graph opening animates its viewport; follow the moving badge until settled.
      for (let attempt = 0; attempt < 20; attempt++) {
        await wave.first().hover();
        if (await page.locator('.reading-inline-scope.reading-inline-active').count()) break;
        await page.waitForTimeout(100);
      }
      assert(
        (await page
          .locator(".reading-inline-scope.reading-inline-active")
          .count()) > 0,
      );
      await wave.first().click();
      await page
        .locator(".reading-inline-source")
        .filter({ hasText: "[wave power=2]" })
        .waitFor();
      await page
        .locator(".reading-inline-source")
        .filter({ hasText: "[/wave]" })
        .waitFor();
      assert.equal(await wave.count(), 1, "only the chosen pair expands");
      await page
        .locator(".reading-inline-name")
        .filter({ hasText: "tint" })
        .waitFor();
      await page.screenshot({
        path: path.join(
          out,
          mode === "流程圖" ? "graph-expanded.png" : "reading-expanded.png",
        ),
      });
      await page.keyboard.press("Control+End");
      await wave.first().waitFor();
      assert.equal(await wave.count(), 2);
      await page.screenshot({
        path: path.join(
          out,
          mode === "流程圖" ? "graph-ranges.png" : "reading-ranges.png",
        ),
      });
      assert.equal(
        (await snapshot()).projects.find((p) => p.root === root).documents[0]
          .text,
        text,
      );
      checks.push(
        mode +
          ": stable palette, stacked solid lines, hover, pair-only expansion and unchanged source",
      );
    }
    await patch({
      inlinePalette: ["#ffbb66", "#66ccee", "#cc88dd"],
      syntax: {
        "markup.name": "#ed9876",
        "markup.parameter": "#78bcde",
        "markup.delimiter": "#abcdef",
      },
    });
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector(".graph-scene-editor .reading-inline-marker"),
        )
          .getPropertyValue("--inline-color")
          .trim() === "#ffbb66",
    );
    await page
      .locator(".reading-inline-name")
      .filter({ hasText: "wave" })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector(
            ".graph-scene-editor .yarn-source-markup-name",
          ),
        ).color === "rgb(237, 152, 118)",
    );
    checks.push(
      "Palette and semantic syntax changes update existing editors live",
    );
    await page.getByRole("button", { name: "純閱讀", exact: true }).click();
    const reader = page.locator(".dialogue-reader");
    await reader.waitFor();
    assert.equal(await reader.locator("p").count(), 2);
    assert.equal(await reader.locator(".reader-blank").count(), 1);
    const read = await reader.innerText();
    assert(read.includes("Mira: onetwothree four"));
    assert(!/\[wave|\[pause|hidden comment|hidden inline/.test(read));
    const runs = await reader
      .locator("[data-source-from]")
      .evaluateAll((items) =>
        items.map((e) => ({
          from: Number(e.dataset.sourceFrom),
          to: Number(e.dataset.sourceTo),
          text: e.textContent,
        })),
      );
    for (const run of runs)
      assert.equal(text.slice(run.from, run.to), run.text);
    await page.screenshot({ path: path.join(out, "reader.png") });
    checks.push(
      "Read-only removes inline syntax and empty hidden-content rows, preserves an authored blank and exact source offsets",
    );
    await page.getByRole("button", { name: "純閱讀", exact: true }).click();
    await page.getByRole("radio", { name: "純文字", exact: true }).click();
    await page.locator(".monaco-editor textarea").waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".monaco-editor .view-lines span")].some(
        (e) =>
          e.textContent === "wave" &&
          getComputedStyle(e).color === "rgb(237, 152, 118)",
      ),
    );
    const colors = await page
      .locator(".monaco-editor .view-lines")
      .evaluate((el) =>
        [...el.querySelectorAll("span")]
          .filter((e) => e.childElementCount === 0)
          .map((e) => ({
            text: e.textContent,
            color: getComputedStyle(e).color,
          })),
      );
    assert(
      colors.some(
        (token) =>
          token.text.includes("wave") && token.color === "rgb(237, 152, 118)",
      ),
      "source marker names use semantic color",
    );
    assert(
      colors.some(
        (token) =>
          token.text.includes("power") && token.color === "rgb(120, 188, 222)",
      ),
      "source property names use semantic color",
    );
    checks.push(
      "Source Monaco highlights inline names and named parameters separately",
    );
    await page
      .getByRole("button", { name: "Inline ranges", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "設定…", exact: true }).click();
    await page.getByRole("radio", { name: "閱讀編輯", exact: true }).click();
    const settings = page.locator(".appearance-mode:visible");
    await settings.locator('[data-setting="inlinePalette"] summary').click();
    const color = settings.getByRole("textbox", {
      name: "範圍顏色 1",
      exact: true,
    });
    await color.fill("#aabbcc");
    await color.press("Tab");
    await page.waitForFunction(
      async () =>
        (await window.yarnDesktop.request({ type: "snapshot" })).snapshot
          .preferences.editorAppearance.inlinePalette[0] === "#aabbcc",
    );
    assert.equal(
      (await snapshot()).preferences.editorAppearance.inlinePalette[0],
      "#aabbcc",
    );
    await page.screenshot({ path: path.join(out, "palette-settings.png") });
    checks.push("Inline color table is editable in Settings and persisted");
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
