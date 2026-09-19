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
  process.env.DESKTOP_TEST_OUTPUT || "outputs/assistance-ui",
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
    scope:
      "Isolated Electron profile; real product UI; 1440px and 800px (sidebar collapsed for narrow editor input)",
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
    page.on("requestfailed", (request) =>
      errors.push(request.url() + ": " + request.failure()?.errorText),
    );
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

    await app.evaluate(({ clipboard }) => {
      global.__clipboardFormats = clipboard
        .availableFormats()
        .map((format) => [format, clipboard.readBuffer(format)]);
    });
    const snapshot = async () =>
      (
        await page.evaluate(() =>
          window.yarnDesktop.request({ type: "snapshot" }),
        )
      ).snapshot;
    const text = async () => {
      await page.waitForTimeout(120);
      return (await snapshot()).projects[0].documents[0].text;
    };
    const currentLine = async () => (await text()).split(/\r?\n/).at(-1);
    async function newLine() {
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Enter");
    }
    results.completionMetrics = {};
    for (const [name, editor, list, info] of [
      [
        "純文字",
        ".monaco-editor",
        ".suggest-widget.visible",
        ".source-completion-info:not([hidden])",
      ],
      [
        "閱讀編輯",
        ".reading-editor .cm-content",
        ".spindle-completions",
        ".cm-completionInfo",
      ],
    ]) {
      await mode(name);
      await page.locator(editor).click();
      await newLine();
      await page.keyboard.type("<<", { delay: 90 });
      await page.locator(list).waitFor();
      assert.equal(await currentLine(), "<<>>", name + " pairing");
      await page.keyboard.type("fade", { delay: 80 });
      await page.locator(info).waitFor();
      assert.match(await page.locator(info).innerText(), /指定秒數/);
      const row = page.locator(
        name === "純文字"
          ? ".suggest-widget.visible .monaco-list-row.focused"
          : ".spindle-completions li[aria-selected]",
      );
      const metrics = () =>
        row.evaluate((el) => {
          const label = el.querySelector(".label-name,.cm-completionLabel"),
            detail = el.querySelector(".details-label,.cm-completionDetail"),
            r = detail.getBoundingClientRect();
          return {
            font: getComputedStyle(label).fontFamily,
            lineHeight: getComputedStyle(label).lineHeight,
            rowHeight: el.getBoundingClientRect().height,
            detailX: r.x,
            detailWidth: r.width,
            clipped: detail.scrollWidth > detail.clientWidth + 1,
          };
        });
      await page.mouse.move(1420, 100);
      const beforeHover = await metrics();
      await row.hover();
      const afterHover = await metrics();
      assert.match(afterHover.font, /Consolas/);
      assert(
        Math.abs(afterHover.rowHeight - 29) < 1,
        JSON.stringify(afterHover),
      );
      assert(
        Math.abs(afterHover.detailWidth - beforeHover.detailWidth) < 1,
        "hover must not shorten parameter text: " +
          JSON.stringify({ beforeHover, afterHover }),
      );
      assert(!afterHover.clipped, "short parameter summary must fit");
      results.completionMetrics[name] = afterHover;
      await shot(
        name === "純文字" ? "01-source-completion" : "03-reading-completion",
      );
      await page.keyboard.press("Enter");
      await page.keyboard.type(" ");
      await page.locator(".command-parameter-popup").waitFor();
      assert.match(
        await page.locator(".command-tip-slot.is-active").innerText(),
        /秒數/,
      );
      assert.equal(await page.locator(list).count(), 0);
      if (name === "純文字") {
        const geometry = await page.evaluate(() => {
          const cursor = document
            .querySelector(".monaco-editor .cursor")
            .getBoundingClientRect();
          const tip = document
            .querySelector(".source-command-popup")
            .getBoundingClientRect();
          return {
            gap: Math.min(
              Math.abs(cursor.top - tip.bottom),
              Math.abs(tip.top - cursor.bottom),
            ),
            aligned:
              cursor.left >= tip.left - 2 && cursor.left <= tip.right + 2,
          };
        });
        assert(geometry.aligned && geometry.gap < 12, JSON.stringify(geometry));
        results.sourceAnchor = geometry;
      }
      await shot(
        name === "純文字" ? "02-source-parameter" : "04-reading-parameter",
      );
      await page.keyboard.type("1.5>>", { delay: 60 });
      assert.equal(await currentLine(), "<<fade_in 1.5>>", name + " closing");
      await page.keyboard.press("Escape");
      if (name === "閱讀編輯") {
        const active = page
          .locator(".reading-source")
          .filter({ hasText: "<<fade_in 1.5>>" });
        assert.equal(
          await active.locator(".reading-function,.reading-variable").count(),
          0,
        );
        assert.equal(await active.locator(".yarn-source-function").count(), 2);
      }
      await newLine();
      await page.keyboard.type("<<", { delay: 70 });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
      assert.equal(await currentLine(), "", name + " empty pair deletion");
      await app.evaluate(({ clipboard }) => clipboard.writeText("<<"));
      await page.keyboard.press("Control+v");
      assert.equal(await currentLine(), "<<", name + " paste unchanged");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(150);
      assert.equal(await currentLine(), "", name + " undo");
      results[name] = true;
    }
    // Two-argument hints ignore quoted spaces; Escape dismisses until next edit.
    await page.keyboard.type('<<play_sound "wind ', { delay: 55 });
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".command-parameter-popup:visible").count(), 0, "occupied string stays quiet");
    await page.keyboard.type('sea" ', { delay: 55 });
    assert.match(
      await page.locator(".command-tip-slot.is-active").innerText(),
      /volume/,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".command-parameter-popup").count(), 0);
    await page.keyboard.type("0.6>>", { delay: 50 });
    const before = await text();
    await mode("純文字");
    await mode("閱讀編輯");
    assert.equal(await text(), before);
    results.parameterAndModes = true;
    await page.locator(".reading-editor .cm-content").click();
    await newLine();
    await page.keyboard.type("<<fade_in ", { delay: 55 });
    await page.locator(".command-parameter-popup").waitFor();
    await page.getByRole("button", { name: "結構檢查", exact: true }).click();
    const backgroundDoc = (await snapshot()).projects[0].documents[0];
    await page.evaluate(
      (d) =>
        window.yarnDesktop.request({
          type: "transaction",
          projectId: "design-test",
          label: "background sync",
          documents: [
            {
              id: d.id,
              version: d.version,
              edits: [
                {
                  from: d.text.length,
                  to: d.text.length,
                  insert: "\n// background",
                },
              ],
            },
          ],
        }),
      backgroundDoc,
    );
    await page.waitForTimeout(180);
    assert.equal(await page.locator(".command-parameter-popup").count(), 0);
    await page.getByRole("button", { name: "結構檢查", exact: true }).click();
    results.blurSync = true;

    await mode("流程圖");
    await page
      .locator(".flow-card-title")
      .filter({ hasText: /^Start$/ })
      .dblclick();
    await page.locator(".graph-scene-editor .cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("<<", { delay: 80 });
    await page.locator(".spindle-completions").waitFor();
    await page.keyboard.type("fade", { delay: 65 });
    await page.locator(".cm-completionInfo").waitFor();
    // CodeMirror guards newly opened completion lists for 75 ms.
    // Visibility alone is not proof that the list accepts keyboard input yet.
    await page.waitForTimeout(100);
    await page.keyboard.press("Tab");
    await page.keyboard.type(" ");
    await page.locator(".command-parameter-popup").waitFor();
    assert.match(
      await page.locator(".command-tip-slot.is-active").innerText(),
      /秒數/,
    );
    await shot("05-graph-parameter");
    await page.keyboard.type("2>>", { delay: 60 });
    await page
      .getByRole("button", { name: "結束節點編輯", exact: true })
      .click();
    assert((await text()).includes("<<fade_in 2>>"));
    results.graph = true;
    await mode("純文字");
    // Geometry uses real diagnostic data, including 3-digit counts.
    results.badgeCounts = [];
    for (const count of [1, 12, 123]) {
      const snap = await snapshot(),
        d = snap.projects[0].documents[0];
      const value =
        "title: Start\n---\n" +
        Array.from(
          { length: count },
          (_, i) => "<<jump Missing" + i + ">>",
        ).join("\n") +
        "\n===";
      await page.evaluate(
        ({ id, version, value, length }) =>
          window.yarnDesktop.request({
            type: "transaction",
            projectId: "design-test",
            label: "test diagnostics",
            documents: [
              { id, version, edits: [{ from: 0, to: length, insert: value }] },
            ],
          }),
        { id: d.id, version: d.version, value, length: d.text.length },
      );
      await page.waitForTimeout(180);
      const button = page.getByRole("button", {
        name: "結構檢查",
        exact: true,
      });
      const bounds = await button.evaluate((el) => {
        const p = el.getBoundingClientRect();
        return [...el.children].every((c) => {
          const r = c.getBoundingClientRect();
          return r.left >= p.left && r.right <= p.right;
        });
      });
      assert(bounds, "badge stays inside for " + count);
      results.badgeCounts.push(Number(await button.locator("b").innerText()));
    }

    await win.evaluate((w) => w.setContentSize(800, 960));
    await page.waitForTimeout(150);
    const narrow = await page
      .getByRole("button", { name: "結構檢查", exact: true })
      .evaluate((el) => {
        const p = el.getBoundingClientRect();
        return [...el.children].every(
          (c) => c.getBoundingClientRect().right <= p.right,
        );
      });
    assert(narrow);

    results.narrow = true;
    await page
      .getByRole("button", { name: "切換劇本側欄", exact: true })
      .click();
    await page.locator(".monaco-editor").click();
    await newLine();
    await page.keyboard.type("<<fade", { delay: 65 });
    await page.locator(".source-completion-info:not([hidden])").waitFor();
    const panel = await page.locator(".source-completion-info").boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= 800);
    assert(panel.y >= 0 && panel.y + panel.height <= 960);
    await shot("06-narrow-completion");
    await mode("閱讀編輯");
    await page.locator(".reading-editor .cm-content").click();
    await newLine();
    await page.keyboard.type("<<fade", { delay: 65 });
    await page.locator(".cm-completionInfo").waitFor();
    const cmPanel = await page.locator(".cm-completionInfo").boundingBox();
    assert(
      cmPanel.x >= 0 &&
        cmPanel.x + cmPanel.width <= 800 &&
        cmPanel.y >= 0 &&
        cmPanel.y + cmPanel.height <= 960,
      JSON.stringify(cmPanel),
    );
    results.narrowGeometry = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".reading-editor .cm-content,.reading-editor .cm-scroller,.reading-source,.spindle-completions",
        ),
      ].map((el) => ({
        class: el.className,
        text: el.textContent.slice(-50),
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        scroll: el.scrollLeft,
        scrollY: el.scrollTop,
      })),
    );
    await shot("07-narrow-reading-completion");
    // Source blanks retain their exact rows and bytes, including whitespace-only lines.
    await page.keyboard.press("Escape");
    await win.evaluate((w) => w.setContentSize(1440, 960));
    const blankSource =
      "\ufefftitle: Blanks\r\n---\r\nMira: before\r\n\r\n \t\r\nMira: after\r\n===\r\n";
    const prior = (await snapshot()).projects[0].documents[0];
    await page.evaluate(
      ({ prior, value }) =>
        window.yarnDesktop.request({
          type: "transaction",
          projectId: "design-test",
          label: "blank rows",
          documents: [
            {
              id: prior.id,
              version: prior.version,
              edits: [{ from: 0, to: prior.text.length, insert: value }],
            },
          ],
        }),
      { prior, value: blankSource },
    );
    await page.waitForTimeout(160);
    await page.locator(".reading-editor .cm-content").click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page
      .locator(".reading-editor")
      .evaluate((el) => el.style.setProperty("--reading-height", "37px"));
    const blankHeights = () =>
      page
        .locator(".reading-blank,.reading-blank-active")
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height),
        );
    const resting = await blankHeights();
    assert(
      resting.length >= 2 &&
        resting.every((height) => Math.abs(height - 37) < 1),
      JSON.stringify(resting),
    );
    await page.keyboard.press("ArrowDown");
    const editing = await blankHeights();
    assert(
      editing.every((height) => Math.abs(height - 37) < 1),
      JSON.stringify(editing),
    );
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    assert.equal(await text(), blankSource);
    await page
      .locator(".reading-editor")
      .evaluate((el) => el.style.removeProperty("--reading-height"));
    results.blankRows = { resting, editing, bytesPreserved: true };

    // Creating from a sorted list keeps the item at its input location, then uses manual order.
    await page
      .getByRole("button", { name: "切換劇本側欄", exact: true })
      .click();
    await page.getByRole("button", { name: "手動排序", exact: true }).click();
    const beforeFiles = await page.locator(".file-row").allTextContents();
    const tabsBefore = await page.locator("[role=tab]").count();
    await page.getByRole("button", { name: "新增劇本", exact: true }).click();
    const filename = page.getByRole("textbox", {
      name: "劇本名稱",
      exact: true,
    });
    await filename.fill("ZebraNew");
    const inputY = (await filename.boundingBox()).y;
    await filename.press("Enter");
    const file = page.getByRole("button", {
      name: "ZebraNew.yarn",
      exact: true,
    });
    await file.waitFor();
    const afterFiles = await page.locator(".file-row").allTextContents();
    assert.deepEqual(afterFiles, ["ZebraNew.yarn", ...beforeFiles]);
    assert(Math.abs((await file.boundingBox()).y - inputY) < 12);
    assert(
      await page
        .getByRole("button", { name: "手動排序", exact: true })
        .isVisible(),
    );
    await file.dblclick();
    await filename.waitFor();
    assert(
      await filename.evaluate(
        (el) =>
          el.selectionStart === 0 && el.selectionEnd === el.value.length - 5,
      ),
    );
    await filename.fill("Renamed");
    await filename.press("Enter");
    await page
      .getByRole("button", { name: "Renamed.yarn", exact: true })
      .waitFor();
    assert.equal(await page.locator("[role=tab]").count(), tabsBefore);
    results.sidebarCreateRename = true;

    // Repeated layouts and app zoom must still anchor the current parameter to the caret.
    await mode("純文字");
    results.layoutAnchors = [];
    for (const zoom of [1, 1.25, 1.5]) {
      await page.evaluate((zoom) => window.yarnDesktop.zoom(zoom), zoom);
      await page.waitForTimeout(160);
      await page.locator(".monaco-editor").click();
      await newLine();
      await page.keyboard.type("<<fade_in ", { delay: 20 });
      await page.locator(".source-command-popup:not([hidden])").waitFor();
      const geometry = await page.evaluate(() => {
        const c = document
            .querySelector(".monaco-editor .cursor")
            .getBoundingClientRect(),
          t = document
            .querySelector(".source-command-popup")
            .getBoundingClientRect();
        return {
          gap: Math.min(Math.abs(c.top - t.bottom), Math.abs(t.top - c.bottom)),
          x: c.x,
          tipX: t.x,
          tipRight: t.right,
        };
      });
      assert(
        geometry.gap < 12 &&
          geometry.x >= geometry.tipX - 2 &&
          geometry.x <= geometry.tipRight + 2,
        JSON.stringify({ zoom, ...geometry }),
      );
      results.layoutAnchors.push({ zoom, ...geometry });
      await page.keyboard.type("1>>");
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => window.yarnDesktop.zoom(1));
    results.passed = true;
    assert.equal(errors.length, 0, errors.join("\n"));
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
    await app
      ?.evaluate(({ app, clipboard }) => {
        if (global.__clipboardFormats) {
          clipboard.clear();
          for (const [format, buffer] of global.__clipboardFormats)
            clipboard.writeBuffer(format, buffer);
        }
        app.exit(0);
      })
      .catch(() => {});
  }
})();
