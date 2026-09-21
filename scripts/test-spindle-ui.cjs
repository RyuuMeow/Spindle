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
  process.env.DESKTOP_TEST_OUTPUT || "outputs/spindle-ui",
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
initialCommands[0].displayName = "淡入";
initialCommands[0].params[0].displayName = "秒數";
initialCommands[0].params[0].description = "淡入所需秒數";
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
    scope: "Isolated Electron profile; real product UI; 1440 CSS pixels",
  },
  errors = [];
let app, page;
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
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: first.name, exact: true }).click();

    assert((await page.title()).includes("Spindle"));
    const brand = await app.evaluate(({ app }) => ({
      name: app.getName(),
      profile: app.getPath("userData"),
    }));
    assert.equal(brand.name, "Spindle");
    assert.equal(path.resolve(brand.profile), path.resolve(profile));
    results.brandAndProfile = true;
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".monaco-editor").click();
    await page.keyboard.press("Control+Home");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const hintPoint = await page
      .locator(".view-line")
      .filter({ hasText: "fade_in" })
      .first()
      .evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const i = n.textContent.indexOf("fade_in");
          if (i < 0) continue;
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + 7);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
        throw Error("command source range missing");
      });
    await page.mouse.move(hintPoint.x, hintPoint.y);
    await page
      .locator(".source-command-popup:not([hidden]) .command-tip-parameters")
      .waitFor();
    await shot("00-source-tooltip");
    results.sourceStructuredTooltip = true;
    const sourcePoint = await page
      .locator(".view-line")
      .filter({ hasText: "<<jump AskAboutLighthouse>>" })
      .first()
      .evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const index = n.textContent.indexOf("AskAboutLighthouse");
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(n, index);
          range.setEnd(n, index + "AskAboutLighthouse".length);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
        throw Error("target source range missing");
      });
    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    assert.equal(await page.locator(".spindle-source-link").count(), 0);
    await page.keyboard.down("Control");
    await page.locator(".monaco-editor .spindle-source-link").waitFor();
    await shot("01-source-link");
    await page.keyboard.up("Control");
    await page.locator(".spindle-source-link").waitFor({ state: "detached" });
    await page.keyboard.down("Control");
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up("Control");
    assert.equal(await page.locator("[role=tab]").count(), 1);
    results.sourceCtrlLink = true;
    await mode("閱讀編輯");
    const target = page
      .locator(".reading-target")
      .filter({ hasText: /^Village$/ })
      .first();
    await target.hover();
    await page.keyboard.down("Control");
    await page.locator(".reading-editor .spindle-source-link").waitFor();
    await shot("02-reading-link");
    await page.keyboard.up("Control");
    await page.locator(".spindle-source-link").waitFor({ state: "detached" });
    results.readingCtrlLink = true;
    const command = page
      .locator(".reading-function")
      .filter({ hasText: "淡入" })
      .first();
    await command.hover();
    await page.locator(".command-tip-heading").waitFor();
    assert.equal(await page.locator(".command-tip-parameter").count(), 1);
    assert(
      (await page.locator(".command-tip-body").innerText()).includes(
        "淡入所需秒數",
      ),
    );
    await shot("03-command-tooltip");
    results.structuredTooltip = true;
    await command.hover();
    await page.keyboard.down("Control");
    assert.equal(await page.locator(".spindle-source-link").count(), 0);
    await page.keyboard.up("Control");
    await page
      .getByRole("button", { name: "Lighthouse.yarn", exact: true })
      .click();
    const external = page
      .locator(".reading-target")
      .filter({ hasText: /^Village$/ })
      .first();
    // Lighthouse transfers to Village across files.
    {
      await external.waitFor();
      await external.click({ modifiers: ["Control"] });
      assert.equal(await page.locator("[role=tab]").count(), 1);
      assert(
        (
          await page.locator(".tab-shell.active .tab-name").innerText()
        ).includes("Chapter_01"),
      );
      results.crossFileCurrentTab = true;
    }
    await page.getByRole("button", { name: first.name, exact: true }).click();
    await mode("流程圖");
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    const graphTarget = page
      .locator(".flow-scene-editor .reading-target")
      .filter({ hasText: /^Village$/ })
      .first();
    await graphTarget.scrollIntoViewIfNeeded();
    let stable = 0,
      previous = null;
    for (let attempt = 0; attempt < 30 && stable < 4; attempt++) {
      const box = await graphTarget.boundingBox();
      stable =
        previous &&
        box &&
        Math.abs(previous.x - box.x) < 0.5 &&
        Math.abs(previous.y - box.y) < 0.5
          ? stable + 1
          : 0;
      previous = box;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    assert(stable >= 4, "node editor geometry did not settle");
    await graphTarget.hover();
    await page.keyboard.down("Control");
    await page.locator(".flow-scene-editor .spindle-source-link").waitFor();
    assert.equal(
      await page.locator(".flow-scene-editor .spindle-source-link").innerText(),
      "Village",
    );
    await shot("04-node-link");
    await page.keyboard.up("Control");
    await graphTarget.click({ modifiers: ["Control"] });
    await page.locator(".monaco-editor .view-lines").waitFor();
    assert.equal(await page.locator("[role=tab]").count(), 1);
    results.nodeCtrlLink = true;
    assert.equal(errors.length, 0, errors.join("\n"));
    results.passed = true;
  } catch (e) {
    results.error = e.stack;
    process.exitCode = 1;
    console.error(e);
    if (page) await shot("failure").catch(() => {});
  } finally {
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(results);
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
