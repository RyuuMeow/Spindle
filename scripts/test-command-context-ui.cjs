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
  process.env.DESKTOP_TEST_OUTPUT || "outputs/context-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
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

    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("<<fade_in", { delay: 65 });
    await page.keyboard.press("Escape");
    await page.keyboard.type(" ");
    await page
      .locator(".source-command-popup:not([hidden]) .command-parameter-popup")
      .waitFor();
    assert.match(
      await page
        .locator(".source-command-popup:not([hidden]) .command-parameter-popup")
        .innerText(),
      /秒數/,
    );
    assert.equal(await page.locator(".suggest-widget.visible").count(), 0);
    await shot("01-parameter-help");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.type('<<play_sound "wind ', { delay: 50 });
    await page
      .locator(".source-command-popup:not([hidden]) .command-parameter-popup")
      .waitFor();
    assert.match(
      await page
        .locator(
          ".source-command-popup:not([hidden]) .command-tip-slot.is-active",
        )
        .innerText(),
      /clip/,
    );
    await page.keyboard.type('sea" ', { delay: 50 });
    await page.waitForTimeout(200);
    assert.match(
      await page
        .locator(
          ".source-command-popup:not([hidden]) .command-tip-slot.is-active",
        )
        .innerText(),
      /volume/,
    );
    assert.equal(await page.locator(".suggest-widget.visible").count(), 0);
    results.parameterPosition = true;
    await page.keyboard.press("Escape");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await mode("閱讀編輯");
    await page.locator(".reading-editor .cm-content").click();
    await page.keyboard.press("Control+Home");
    await page.waitForTimeout(350);
    async function alignment() {
      return page.evaluate(() => {
        const title = document.querySelector(".reading-title");
        const marker = [
          ...document.querySelectorAll(".reading-fold-marker"),
        ].find((el) => getComputedStyle(el).visibility !== "hidden");
        const t = title.getBoundingClientRect(),
          m = marker.getBoundingClientRect();
        const style = getComputedStyle(title);
        const center =
          t.top +
          parseFloat(style.paddingTop) +
          parseFloat(style.lineHeight) / 2;
        return {
          difference: Math.abs(center - (m.top + m.height / 2)),
          titleTop: t.top,
          markerTop: m.top,
        };
      });
    }
    results.expanded = await alignment();
    assert(results.expanded.difference < 2, JSON.stringify(results.expanded));
    await shot("02-heading-alignment");
    await page.locator(".reading-fold-marker:visible").first().click();
    await page.waitForTimeout(150);
    results.collapsed = await alignment();
    assert(results.collapsed.difference < 2, JSON.stringify(results.collapsed));
    await page.locator(".reading-fold-marker:visible").first().click();
    await win.evaluate((w) => w.setContentSize(800, 960));
    await page.waitForTimeout(250);
    results.narrow = await alignment();
    assert(results.narrow.difference < 2, JSON.stringify(results.narrow));
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
