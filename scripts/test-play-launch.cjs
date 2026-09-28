/* Actual Electron launch workflow; all data lives in a disposable profile. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/play-launch/" + Date.now());
const root = path.join(out, "Launch Fixture");
const profile = path.join(out, "profile");
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [],
    preferences: { language: "en", autoCheckUpdates: false },
  }),
);
fs.writeFileSync(
  path.join(root, "Main.yarn"),
  "title: Start\n---\nMira: Default launch.\nMira: Default second line.\n===\ntitle: 故事開始\n---\nMira: Configured default.\n===\n",
);
fs.writeFileSync(
  path.join(root, "Other.yarn"),
  "title: Other\n---\n<<declare $counter = 0>>\n<<set $counter = 5>>\nMira: First other line.\nMira: Exact target line.\nMira: Last other line.\n===\ntitle: Later\n---\nMira: Later scene must not win document mode.\n===\n",
);
const result = { checks: [], errors: [] };
let app, editor, play;
async function until(fn, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(message);
}
async function launch() {
  app = await _electron.launch({
    executablePath: require("electron"),
    args: ["dist-desktop/app/desktop/main.cjs", "--user-data-dir=" + profile],
    timeout: 30000,
  });
  editor = await app.firstWindow();
  editor.setDefaultTimeout(10000);
  editor.on("pageerror", (e) => result.errors.push(e.message));
  const win = await app.browserWindow(editor);
  await win.evaluate((w) => {
    w.setContentSize(1280, 800);
    w.show();
    w.focus();
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, root);
}
const toggle = () => editor.locator("[data-play-launch]:visible");
async function document(name, line = 1) {
  if (
    !(await editor
      .getByRole("button", { name: name + ".yarn", exact: true })
      .isVisible())
  ) {
    await editor
      .locator(".tab-shell")
      .filter({ has: editor.locator("svg.lucide-file-text") })
      .first()
      .getByRole("tab")
      .click();
  }
  await editor
    .getByRole("button", { name: name + ".yarn", exact: true })
    .click();
  await editor.locator(".monaco-editor .view-lines").first().waitFor();
  await editor.evaluate(async (line) => {
    const m = await new Promise((resolve) =>
      window.require(["vs/editor/editor.main"], resolve),
    );
    const e = m.editor.getEditors().find((e) => e.getDomNode()?.offsetParent);
    e.setPosition({ lineNumber: line, column: 1 });
    e.focus();
  }, line);
}
async function chooseMode(name) {
  await toggle().click({ button: "right" });
  await editor.getByRole("menuitemradio", { name, exact: true }).click();
  assert.equal(
    (await toggle().innerText()).trim(),
    name,
    "Mode stays visible on editor Play button",
  );
}
async function open() {
  const pending = app.waitForEvent("window");
  await toggle().click();
  assert.equal(
    await toggle().getAttribute("aria-pressed"),
    "true",
    "Toolbar immediately acknowledges launch",
  );
  play = await pending;
  play.on("pageerror", (e) => result.errors.push(e.message));
  await play.locator(".play-toolbar").waitFor();
  await until(
    async () => (await state()).state.status === "line",
    "Play did not reach a line",
  );
}
async function state() {
  return play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
}
async function close() {
  const closed = play.waitForEvent("close");
  await toggle().click();
  await closed;
  await until(
    async () => (await toggle().getAttribute("aria-pressed")) === "false",
    "Close feedback not reset",
  );
}
async function record(name, fn) {
  await fn();
  result.checks.push(name);
}
(async () => {
  try {
    await launch();
    await editor
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    await document("Other", 6);
    await record(
      "Radio menu has exactly one selected launch mode",
      async () => {
        await toggle().click({ button: "right" });
        assert.equal(await editor.getByRole("menuitemradio").count(), 3);
        assert.equal(
          await editor.getByRole("menuitemradio", { checked: true }).count(),
          1,
        );
        assert.equal(
          await editor
            .getByRole("menuitemradio", { name: "Default", exact: true })
            .getAttribute("aria-checked"),
          "true",
        );
        await editor.screenshot({ path: path.join(out, "play-mode-menu.png") });
        await editor.keyboard.press("Escape");
      },
    );
    await record(
      "Default mode uses Start rather than cursor document",
      async () => {
        await open();
        assert.equal((await state()).state.scene, "Start");
        await play
          .getByRole("button", { name: "Start scene", exact: true })
          .click();
        const picker = play.getByRole("combobox");
        await picker.fill("故事");
        assert.equal(
          await play.getByRole("option").count(),
          1,
          "Play scene picker shares keyboard filtering",
        );
        await picker.press("Escape");
        assert.equal(
          (await state()).state.scene,
          "Start",
          "Cancelling Play filter does not restart playback",
        );
        await editor.screenshot({
          path: path.join(out, "play-open-feedback.png"),
        });
        await close();
      },
    );
    await record(
      "Rapid second click cancels launch and permits reopening",
      async () => {
        await toggle().evaluate((button) => {
          button.click();
        });
        await until(
          async () => (await toggle().getAttribute("aria-pressed")) === "true",
          "Launch feedback absent",
        );
        await toggle().evaluate((button) => {
          button.click();
        });
        await until(
          async () =>
            !(await editor.evaluate(() => window.yarnDesktop.play.status())),
          "Cancelled launch remains active",
        );
        await until(
          async () => (await toggle().getAttribute("aria-pressed")) === "false",
          "Cancelled feedback remains active",
        );
        await open();
        assert.equal((await state()).state.scene, "Start");
        await close();
      },
    );
    await record(
      "Current document starts its first scene; reopen uses a fresh run",
      async () => {
        await document("Other", 11);
        await chooseMode("Current document");
        await open();
        assert.equal((await state()).state.scene, "Other");
        assert(
          (await state()).state.events.some(
            (e) => e.kind === "line" && e.text.includes("First other"),
          ),
        );
        await close();
      },
    );
    await record(
      "Native Play window close resets editor feedback",
      async () => {
        await open();
        const native = await app.browserWindow(play);
        const closed = play.waitForEvent("close");
        await native.evaluate((win) => win.close());
        await closed;
        await until(
          async () => (await toggle().getAttribute("aria-pressed")) === "false",
          "Native close left stale Pause icon",
        );
      },
    );
    await record(
      "Current line starts at exact line without preceding assignment",
      async () => {
        await document("Other", 6);
        await chooseMode("Current line");
        await open();
        const current = await state();
        assert.equal(
          await play
            .getByText("Play from current line; preceding content is skipped", {
              exact: true,
            })
            .count(),
          0,
          "Direct-entry banner must not occupy the story viewport",
        );
        assert(
          current.state.events.some(
            (e) => e.kind === "line" && e.text.includes("Exact target"),
          ),
        );
        assert(
          !current.state.events.some(
            (e) => e.kind === "line" && e.text.includes("First other"),
          ),
        );
        assert.equal(
          current.state.variables.find((v) => v.name === "$counter")?.value,
          0,
        );
        await play.screenshot({
          path: path.join(out, "current-line-play.png"),
        });
        await close();
      },
    );
    await record(
      "Narrow toolbar keeps the mode label readable in overflow",
      async () => {
        const win = await app.browserWindow(editor);
        await win.evaluate((w) => w.setContentSize(800, 800));
        await editor.locator(".document-tools-overflow").click();
        const geometry = await toggle().evaluate((button) => {
          const label = button.querySelector("span");
          const rect = button.getBoundingClientRect();
          const text = label.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            textRight: text.right,
            textLeft: text.left,
            width: window.innerWidth,
          };
        });
        assert(geometry.left >= 0 && geometry.right <= geometry.width);
        assert(
          geometry.textLeft >= geometry.left &&
            geometry.textRight <= geometry.right,
          "Mode label must fit its button",
        );
        assert.equal((await toggle().innerText()).trim(), "Current line");
        await editor.screenshot({
          path: path.join(out, "play-mode-narrow.png"),
        });
        await editor.locator(".document-tools-overflow").click();
        await editor
          .locator(".document-tools-popover")
          .waitFor({ state: "hidden" });
        await win.evaluate((w) => w.setContentSize(1280, 800));
      },
    );
    await record(
      "Default scene setting persists and controls default launch",
      async () => {
        await editor.locator(".project-switch").click();
        await editor
          .getByRole("menuitem", { name: "Settings…", exact: true })
          .click();
        await editor
          .locator(".settings-navigation")
          .getByRole("button", { name: "Play", exact: true })
          .click();
        const field = editor.locator("#play-default-scene");
        const pickerWidth = await field.evaluate(
          (button) => button.getBoundingClientRect().width,
        );
        assert(
          pickerWidth >= 200 && pickerWidth <= 260,
          `Settings scene control should retain its field width, got ${pickerWidth}px`,
        );
        await field.click();
        const search = editor.getByRole("combobox");
        await search.waitFor();
        assert.equal(
          await editor.getByRole("option").count(),
          4,
          "All scenes from both documents are listed",
        );
        await search.fill("latER");
        assert.equal(await editor.getByRole("option").count(), 1);
        assert.match(await editor.getByRole("option").innerText(), /Later/);
        await search.press("Escape");
        assert.equal(
          (await field.innerText()).trim(),
          "Start",
          "Dismissed filter must not change the setting",
        );
        await field.click();
        await search.fill("does-not-exist");
        assert.equal(
          await editor.getByRole("option").count(),
          0,
          "No match must not synthesize a scene",
        );
        await search.fill("故事");
        assert.equal(
          await editor.getByRole("option").count(),
          1,
          "Chinese scene names filter correctly",
        );
        await search.dispatchEvent("compositionstart");
        await search.press("Enter");
        assert(
          await search.isVisible(),
          "IME confirmation must not commit a scene",
        );
        assert.equal((await field.innerText()).trim(), "Start");
        await search.dispatchEvent("compositionend");
        await editor.screenshot({
          path: path.join(out, "play-scene-filter.png"),
        });
        await search.press("ArrowDown");
        await search.press("Enter");
        assert.equal((await field.innerText()).trim(), "故事開始");
        await until(async () => {
          const saved = JSON.parse(
            fs.readFileSync(
              path.join(profile, "project-catalog-v1.json"),
              "utf8",
            ),
          );
          return saved.preferences.playLaunch.defaultScene === "故事開始";
        }, "Selected scene was not persisted");
        await editor.screenshot({ path: path.join(out, "play-settings.png") });
        await document("Main");
        await chooseMode("Default");
        await open();
        assert.equal((await state()).state.scene, "故事開始");
        await close();
        await chooseMode("Current document");
        await app.close();
        app = null;
        await launch();
        await editor
          .getByRole("button", { name: "Open project folder", exact: true })
          .click();
        await document("Main");
        await toggle().click({ button: "right" });
        assert.equal(
          await editor
            .getByRole("menuitemradio", {
              name: "Current document",
              exact: true,
            })
            .getAttribute("aria-checked"),
          "true",
        );
        await editor.keyboard.press("Escape");
        await chooseMode("Default");
        await open();
        assert.equal((await state()).state.scene, "故事開始");
        await close();
      },
    );
    await record(
      "Unsupported current line reports a readable error without falling back",
      async () => {
        await document("Other", 4);
        await chooseMode("Current line");
        await toggle().click();
        await editor
          .locator(".toast")
          .filter({ hasText: "This line is not a supported direct entry." })
          .waitFor();
        await until(
          async () =>
            !(await editor.evaluate(() => window.yarnDesktop.play.status())),
          "Unsupported line left an active Play session",
        );
        assert.equal(
          app.windows().length,
          1,
          "Unsupported line must not create a fallback Play window",
        );
        assert.equal(await toggle().getAttribute("aria-pressed"), "false");
        await editor.screenshot({
          path: path.join(out, "unsupported-line.png"),
        });
      },
    );
    await record(
      "Missing default scene reports a readable error without an orphan window",
      async () => {
        await editor.locator(".project-switch").click();
        await editor
          .getByRole("menuitem", { name: "Settings…", exact: true })
          .click();
        await editor
          .locator(".settings-navigation")
          .getByRole("button", { name: "Play", exact: true })
          .click();
        await editor.evaluate(() =>
          window.yarnDesktop.request({
            type: "preferences",
            playLaunch: { defaultScene: "MissingScene" },
          }),
        );
        const missing = editor.locator("#play-default-scene");
        await until(
          async () => (await missing.innerText()).includes("MissingScene"),
          "Unavailable saved scene must remain visible",
        );
        await missing.click();
        assert.equal(
          await editor.getByRole("option").count(),
          4,
          "Missing saved scene is not a selectable workspace scene",
        );
        await editor.keyboard.press("Escape");
        await document("Other");
        await chooseMode("Default");
        await toggle().click();
        await editor
          .locator(".toast")
          .filter({
            hasText: "The configured start scene is not in this workspace.",
          })
          .waitFor();
        await until(
          async () =>
            !(await editor.evaluate(() => window.yarnDesktop.play.status())),
          "Missing scene left an active Play session",
        );
        assert.equal(
          app.windows().length,
          1,
          "Missing scene must not create an orphan Play window",
        );
        assert.equal(await toggle().getAttribute("aria-pressed"), "false");
        await editor.screenshot({
          path: path.join(out, "missing-default.png"),
        });
      },
    );
  } catch (e) {
    result.errors.push(String(e.stack || e));
    if (play && !play.isClosed()) {
      fs.writeFileSync(
        path.join(out, "play-failure.html"),
        await play.content(),
      );
      await play
        .screenshot({ path: path.join(out, "play-failure.png") })
        .catch(() => {});
    }
    await editor
      ?.screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify({ out, ...result }, null, 2));
  }
})();
