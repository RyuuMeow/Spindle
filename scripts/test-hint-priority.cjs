const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const playwright = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const out = path.resolve(
  process.env.DESKTOP_TEST_OUTPUT || "outputs/hint-priority-ui",
);
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/sample.ts"],
  outfile: path.join(out, "sample.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { initialCommands } = require(path.join(out, "sample.cjs"));
const profile = fs.mkdtempSync(path.join(out, "profile-"));
const source =
  'title: Help\n---\n<<fade_in 1>>\n<<play_sound "wind" 0.5>>\n<<wait >>\n===';
fs.writeFileSync(
  path.join(profile, "workspace-v2.json"),
  JSON.stringify({
    projects: [
      {
        id: "hint-test",
        name: "Hint rules",
        commands: initialCommands,
        documents: [
          {
            id: "hints",
            name: "Hints.yarn",
            text: source,
            saved: source,
            version: 0,
            status: "draft",
          },
        ],
        excluded: [],
        recovery: [],
      },
    ],
    currentProjectId: "hint-test",
    notices: [],
  }),
);
const result = { errors: [] };
let app, page;
async function settle() {
  await page.waitForTimeout(500);
}
async function caret(lineText, offset, keepPointer = false) {
  if (!keepPointer) await page.mouse.move(1400, 900);
  await page.evaluate(
    ({ lineText, offset }) => {
      const cm = document.querySelector(".cm-content")?.cmTile?.root?.view;
      if (cm) {
        const from = cm.state.doc.toString().indexOf(lineText);
        if (from < 0) throw Error("CM missing line " + lineText);
        cm.focus();
        cm.dispatch({
          selection: { anchor: from + offset },
          scrollIntoView: true,
        });
      } else {
        const ed = window.monaco.editor
          .getEditors()
          .find((e) => e.getDomNode()?.isConnected);
        const model = ed.getModel(),
          at = model.getValue().indexOf(lineText);
        if (at < 0) throw Error("Monaco missing line " + lineText);
        const pos = model.getPositionAt(at + offset);
        ed.focus();
        ed.setPosition(pos);
        ed.revealPositionInCenterIfOutsideViewport(pos);
      }
    },
    { lineText, offset },
  );
  await settle();
}
async function hover(lineText, offset) {
  const point = await page.evaluate(
    ({ lineText, offset }) => {
      const cm = document.querySelector(".cm-content")?.cmTile?.root?.view;
      if (cm) {
        const at = cm.state.doc.toString().indexOf(lineText);
        const p = cm.coordsAtPos(at + offset);
        return { x: p.left + 2, y: (p.top + p.bottom) / 2 };
      }
      const ed = window.monaco.editor
          .getEditors()
          .find((e) => e.getDomNode()?.isConnected),
        model = ed.getModel();
      const pos = model.getPositionAt(
          model.getValue().indexOf(lineText) + offset,
        ),
        p = ed.getScrolledVisiblePosition(pos),
        rect = ed.getDomNode().getBoundingClientRect();
      return { x: rect.left + p.left + 2, y: rect.top + p.top + p.height / 2 };
    },
    { lineText, offset },
  );
  await page.mouse.move(point.x, point.y);
  await settle();
}
const tips = () => page.locator(".reading-command-tooltip:visible");
(async () => {
  try {
    const launch =
      process.env.DESKTOP_PORTABLE_TEST === "1"
        ? (options) =>
            require("./portable-test-driver.cjs").launch(playwright, options)
        : (options) => playwright._electron.launch(options);
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
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setContentSize(1440, 960);
      w.show();
      w.focus();
    });
    await page.getByRole("button", { name: "Hints.yarn", exact: true }).click();
    for (const mode of ["閱讀編輯", "純文字", "流程圖"]) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      if (mode === "流程圖")
        await page
          .locator(".flow-card-title")
          .filter({ hasText: /^Help$/ })
          .dblclick();
      await caret("<<fade_in 1>>", "<<fade_in 1".length);
      assert.equal(
        await tips().count(),
        0,
        mode + ": filled value does not trigger an automatic popup",
      );
      await hover('<<play_sound "wind" 0.5>>', 16);
      assert.equal(
        await tips().count(),
        1,
        mode + ": hover explains filled argument",
      );
      assert.equal(
        await page.locator(".command-parameter-popup:visible").count(),
        0,
      );
      await caret("<<wait >>", 7, true);
      assert.equal(
        await page.locator(".command-parameter-popup:visible").count(),
        1,
        mode + ": empty argument prompts",
      );
      await hover('<<play_sound "wind" 0.5>>', 16);
      assert.equal(
        await tips().count(),
        1,
        mode + ": parameter wins over hover",
      );
      assert.match(await tips().innerText(), /wait/);
      await page.screenshot({ path: path.join(out, mode + "-priority.png") });
      await page.keyboard.type("0.5", { delay: 80 });
      await settle();
      assert.equal(
        await tips().count(),
        0,
        mode + ": typing a value dismisses popup",
      );
      await caret("<<wait 0.5>>", 7);
      assert.equal(
        await tips().count(),
        0,
        mode + ": existing value after caret suppresses popup",
      );
      await page.keyboard.press("Delete");
      await page.keyboard.press("Delete");
      await page.keyboard.press("Delete");
      await settle();
      assert.equal(
        await tips().count(),
        1,
        mode + ": clearing value restores prompt",
      );
      await page.keyboard.press("Escape");
      await settle();
      assert.equal(await tips().count(), 0, mode + ": Escape dismisses");
      await caret("<<wait >>", 6);
      await page.keyboard.press("ArrowRight");
      await settle();
      await page
        .getByRole("button", { name: "全專案搜尋", exact: true })
        .click();
      await settle();
      assert.equal(await tips().count(), 0, mode + ": blur dismisses");
      await page.keyboard.press("Escape");
      await caret("<<fade_in 1>>", 6);
      await page.keyboard.press("Control+Space");
      await settle();
      const list = page.locator(
        mode === "純文字" ? ".suggest-widget.visible" : ".spindle-completions",
      );
      assert.equal(await list.count(), 1, mode + ": explicit completion");
      await hover('<<play_sound "wind" 0.5>>', 16);
      assert.equal(
        await tips().count(),
        0,
        mode + ": completion suppresses hover",
      );
      await page.keyboard.press("Escape");
      result[mode] = true;
      if (mode === "流程圖")
        await page
          .getByRole("button", { name: "結束節點編輯", exact: true })
          .click();
    }
    assert.deepEqual(result.errors, []);
    result.passed = true;
  } catch (e) {
    result.error = e.stack;
    process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, "failure.png") });
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(result);
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})();
