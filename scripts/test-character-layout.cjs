const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/character-layout/" + Date.now());
const root = path.join(out, "Story"),
  profile = path.join(out, "profile");
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(root, "Story.yarn"),
  "title: Start\n---\nMira: Hello, world.\nNia: Another line.\nMira: A final line.\n===\n",
);
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [],
    preferences: { language: "en", autoCheckUpdates: false },
  }),
);
const results = { checks: [], errors: [], zoom: [] };
let app, page;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(50);
  }
  throw Error(message);
}
async function check(name, run) {
  try {
    await run();
    results.checks.push({ name, passed: true });
  } catch (error) {
    results.checks.push({
      name,
      passed: false,
      error: String(error.stack || error),
    });
    await page
      .screenshot({ path: path.join(out, name + "-failed.png") })
      .catch(() => {});
  }
}
const storyTab = () =>
  page
    .locator(".tab-shell")
    .filter({ hasText: "Story" })
    .first()
    .getByRole("tab");
async function menu(name) {
  await page.locator(".project-switch").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function create(name) {
  await page.keyboard.press("Control+p");
  await page.locator(".search-overlay-input input").fill(name);
  await page
    .getByRole("option")
    .filter({ hasText: "Create “" + name + "” as a script" })
    .click();
  await page.locator(".inline-name-editor input").waitFor();
  await page.locator(".inline-name-editor input").fill(name);
}
(async () => {
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: ["dist-desktop/app/desktop/main.cjs", "--user-data-dir=" + profile],
      timeout: 30000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => results.errors.push(e.message));
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1280, 800);
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
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    await page.getByRole("button", { name: "Story.yarn", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    await check("new-tab-blur", async () => {
      await create("BlurCreated");
      await page.locator(".document-heading").click();
      await until(
        () => fs.existsSync(path.join(root, "BlurCreated.yarn")),
        "Blur did not create document",
      );
      await until(
        async () => !(await page.locator(".inline-name-editor").count()),
        "Draft did not finish",
      );
      assert.match(
        await page.locator(".tab-shell.active").innerText(),
        /BlurCreated/,
      );
    });
    await check("new-tab-cancel", async () => {
      await create("Cancelled");
      const close = page.locator(".tab-shell.active .tab-close");
      const box = await close.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await sleep(150);
      await page.mouse.up();
      await sleep(250);
      assert.equal(fs.existsSync(path.join(root, "Cancelled.yarn")), false);
      assert.equal(await page.locator(".inline-name-editor").count(), 0);
    });
    await check("new-tab-background-completion", async () => {
      await create("BackgroundCreated");
      await storyTab().click();
      await until(
        () => fs.existsSync(path.join(root, "BackgroundCreated.yarn")),
        "Background create did not finish",
      );
      await sleep(300);
      assert.match(
        await page.locator(".tab-shell.active").innerText(),
        /Story/,
      );
    });
    await check("new-tab-ime", async () => {
      await create("CompositionCreated");
      const input = page.locator(".inline-name-editor input");
      await input.dispatchEvent("compositionstart");
      await input.fill("CompositionCreated");
      await page.locator(".document-heading").click();
      await sleep(250);
      assert.equal(
        fs.existsSync(path.join(root, "CompositionCreated.yarn")),
        false,
      );
      await input.dispatchEvent("compositionend");
      await until(
        () => fs.existsSync(path.join(root, "CompositionCreated.yarn")),
        "Composition end did not commit blurred draft",
      );
    });
    await check("characters-autosave-switch", async () => {
      await menu("Characters & preview");
      await page
        .locator(".characters-list button")
        .filter({ hasText: "Mira" })
        .click();
      await page.getByLabel("Display name", { exact: true }).fill("Mira Saved");
      await page
        .locator(".characters-list button")
        .filter({ hasText: "Nia" })
        .click();
      await until(() => {
        const p = path.join(root, ".spindle", "preview.json");
        return (
          fs.existsSync(p) &&
          JSON.parse(fs.readFileSync(p)).characters.some(
            (c) => c.name === "Mira" && c.displayName === "Mira Saved",
          )
        );
      }, "Character not saved on switch");
      await page
        .locator(".characters-list button")
        .filter({ hasText: "Mira" })
        .click();
      assert.equal(
        await page.getByLabel("Display name", { exact: true }).inputValue(),
        "Mira Saved",
      );
      await page.screenshot({ path: path.join(out, "characters.png") });
    });
    await check("characters-narrow-overlay", async () => {
      await win.evaluate((w) => w.setContentSize(800, 650));
      await page.evaluate(() => window.yarnDesktop.zoom(1.5));
      await page.locator(".characters-narrow").waitFor();
      const toggle = page
        .locator(".characters-view header")
        .getByRole("button", { name: "Characters & preview", exact: true });
      assert.equal(
        await page.locator(".characters-layout nav").isVisible(),
        false,
      );
      await toggle.click();
      await page
        .getByRole("dialog", { name: "Characters & preview" })
        .waitFor();
      assert.equal(
        await page.locator(".characters-content").evaluate((e) => e.inert),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".characters-layout nav").isVisible(),
        false,
      );
      assert.equal(
        await toggle.evaluate((e) => e === document.activeElement),
        true,
      );
      await toggle.click();
      await page
        .locator(".characters-list button")
        .filter({ hasText: "Nia" })
        .click();
      await until(
        async () => !(await page.locator(".characters-layout nav").isVisible()),
        "Character switch did not close drawer",
      );
      fs.writeFileSync(
        path.join(out, "characters-narrow.png"),
        Buffer.from(
          await win.evaluate(async (w) =>
            (await w.webContents.capturePage()).toPNG().toString("base64"),
          ),
          "base64",
        ),
      );
      await page.evaluate(() => window.yarnDesktop.zoom(1));
      await win.evaluate((w) => w.setContentSize(1280, 800));
      await until(
        async () => await page.locator(".characters-layout nav").isVisible(),
        "Wide sidebar not restored",
      );
    });
    await check("appearance-mode-scroll", async () => {
      await menu("Settings…");
      await page
        .getByRole("button", { name: "Editor appearance", exact: true })
        .click();
      const switcher = page.locator(
        ".appearance-settings > .segmented-control",
      );
      await switcher.scrollIntoViewIfNeeded();
      const scroll = page.locator(".settings-scroll:visible");
      const before = await scroll.evaluate((e) => e.scrollTop);
      assert(before > 0);
      await switcher
        .getByRole("radio", { name: "Reading editor", exact: true })
        .click();
      await sleep(150);
      assert(
        Math.abs((await scroll.evaluate((e) => e.scrollTop)) - before) < 3,
        "Mode switch reset scroll",
      );
      assert.equal(
        await page
          .locator(".appearance-mode:visible")
          .evaluate((e) => getComputedStyle(e).borderTopWidth),
        "0px",
      );
      await page.screenshot({ path: path.join(out, "appearance.png") });
    });
    await check("zoom-responsive-workspace", async () => {
      await storyTab().click();
      await win.evaluate((w) => w.setContentSize(800, 650));
      for (const zoom of [1, 1.25, 1.5, 2]) {
        await page.evaluate((zoom) => window.yarnDesktop.zoom(zoom), zoom);
        await sleep(250);
        const dimensions = await page.evaluate(() => {
          const box = document
              .querySelector(".workbench")
              .getBoundingClientRect(),
            center = document
              .querySelector(".workspace-center")
              .getBoundingClientRect(),
            toolbar = document.querySelector(".document-toolbar"),
            label = document
              .querySelector(".tab-shell.active .tab-name")
              .getBoundingClientRect(),
            tabs = document.querySelector(".file-tabs").getBoundingClientRect();
          return {
            viewport: innerWidth,
            rootWidth: box.width,
            right: box.right,
            center: center.width,
            toolbarScroll: toolbar.scrollWidth,
            toolbarClient: toolbar.clientWidth,
            visibleTabLabel: Math.max(
              0,
              Math.min(label.right, tabs.right) -
                Math.max(label.left, tabs.left),
            ),
          };
        });
        assert(
          dimensions.right <= dimensions.viewport + 1,
          JSON.stringify(dimensions),
        );
        assert(
          dimensions.toolbarScroll <= dimensions.toolbarClient + 1,
          JSON.stringify(dimensions),
        );
        assert(
          dimensions.center >= Math.min(320, dimensions.viewport - 12) - 1,
          JSON.stringify(dimensions),
        );
        assert(
          dimensions.visibleTabLabel >= 24,
          "Active tab label clipped: " + JSON.stringify(dimensions),
        );
        if (zoom === 2) {
          await page.locator(".workspace-identity > button").click();
          await sleep(100);
        }
        const native = await win.evaluate(async (w) => ({
          bounds: w.getContentBounds(),
          zoom: w.webContents.getZoomFactor(),
          image: (await w.webContents.capturePage()).toPNG().toString("base64"),
        }));
        results.zoom.push({
          zoom,
          ...dimensions,
          bounds: native.bounds,
          actualZoom: native.zoom,
        });
        fs.writeFileSync(
          path.join(out, "workspace-" + zoom + ".png"),
          Buffer.from(native.image, "base64"),
        );
      }
      await page.evaluate(() => window.yarnDesktop.zoom(1));
      await win.evaluate((w) => w.setContentSize(1280, 800));
    });
    await check("play-compile-keyboard", async () => {
      await storyTab().click();
      const opened = app.waitForEvent("window");
      await page.evaluate(() => window.yarnDesktop.play.open());
      const play = await opened;
      play.setDefaultTimeout(10000);
      play.on("pageerror", (e) => results.errors.push(e.message));
      await play.locator(".play-app").waitFor();
      await play.evaluate(async () => {
        const s = await window.yarnDesktop.play.action({ action: "state" });
        await window.yarnDesktop.play.action(
          { action: "start", scene: "Start" },
          s.state.revision,
        );
      });
      const toggle = play.getByRole("button", {
        name: "Compile results",
        exact: true,
      });
      await toggle.click();
      const grip = play.getByRole("separator", {
        name: "Resize compile panel",
      });
      await grip.focus();
      const before = await play.evaluate(() =>
        window.yarnDesktop.play.action({ action: "state" }),
      );
      const initial = Number(await grip.getAttribute("aria-valuenow"));
      await grip.press("ArrowUp");
      assert(Number(await grip.getAttribute("aria-valuenow")) >= initial);
      await grip.press("Space");
      await grip.press("ArrowRight");
      await sleep(200);
      const after = await play.evaluate(() =>
        window.yarnDesktop.play.action({ action: "state" }),
      );
      assert.equal(
        after.state.revision,
        before.state.revision,
        "Resize keyboard advanced story",
      );
      await play.screenshot({ path: path.join(out, "play-compile.png") });
      await play.locator(".play-compile-panel header button").click();
      assert.equal(
        await toggle.evaluate((e) => e === document.activeElement),
        true,
        "Close did not restore focus",
      );
    });
    assert.deepEqual(results.errors, []);
  } finally {
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(out, JSON.stringify(results, null, 2));
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
  if (results.checks.some((c) => !c.passed)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
