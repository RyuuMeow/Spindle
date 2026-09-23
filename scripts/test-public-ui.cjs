const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const pw = require("playwright");
const base = path.resolve("outputs/public-ui-" + Date.now());
fs.mkdirSync(base, { recursive: true });
(async () => {
  for (const language of ["en", "zh-TW", "zh-CN"]) {
    const profile = path.join(base, language),
      root = path.join(base, "Demo");
    fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(root, "Harbour.yarn"),
      'title: Arrival\n---\n\nMira: The lantern is still burning.\n<<play_sound "harbour_rain" 0.6>>\nNarrator: A quiet harbour waits beyond the rain.\n-> Follow the light\n    <<jump Lighthouse>>\n-> Stay by the shore\n    <<jump Shore>>\n===\ntitle: Lighthouse\n---\nMira: Someone has been here before us.\n===\ntitle: Shore\n---\nNarrator: The tide carries a letter to your feet.\n===\n',
    );
    fs.writeFileSync(
      path.join(root, ".spindle/project.json"),
      JSON.stringify({
        id: "public-demo",
        name: "The Quiet Harbour",
        commands: [
          {
            name: "play_sound",
            description: "Play a sound cue; set its volume for this scene.",
            params: [
              {
                name: "clip",
                type: "string",
                required: true,
                defaultValue: "",
                description: "Sound asset to play",
              },
              {
                name: "volume",
                type: "number",
                required: false,
                defaultValue: "1",
                description: "Playback volume",
              },
            ],
            example: '<<play_sound "harbour_rain" 0.6>>',
          },
        ],
        files: [{ id: "harbour", name: "Harbour.yarn" }],
        excluded: [],
      }),
    );
    fs.writeFileSync(
      path.join(profile, "project-catalog-v1.json"),
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: "public-demo",
            name: "The Quiet Harbour",
            root,
            lastOpenedAt: 1,
            recent: true,
          },
        ],
        preferences: {
          language,
          reopenLastProject: false,
          autoCheckUpdates: false,
        },
      }),
    );
    fs.mkdirSync(path.join(root, ".spindle/history"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".spindle/history/index.json"),
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: "showcase-history",
            documentId: "harbour",
            name: "Harbour.yarn",
            text: fs
              .readFileSync(path.join(root, "Harbour.yarn"), "utf8")
              .replace(
                "A quiet harbour waits beyond the rain.",
                "Rain drifts across the harbour.",
              ),
            at: Date.now() - 60000,
            reason: "Earlier draft",
            deleted: false,
          },
        ],
      }),
    );
    let app;
    try {
      app = await require("./portable-test-driver.cjs").launch(pw, {
        executablePath: process.env.SPINDLE_PORTABLE
          ? path.resolve(
              process.env.SPINDLE_PORTABLE === "1"
                ? `release/Spindle-${require("../version.json").version}-Portable-x64.exe`
                : process.env.SPINDLE_PORTABLE,
            )
          : require("electron"),
        args: [
          ...(process.env.SPINDLE_PORTABLE
            ? []
            : ["dist-desktop/app/desktop/main.cjs"]),
          "--user-data-dir=" + profile,
        ],
        env: process.env,
        logPath: path.join(profile, "startup.log"),
        timeout: 60000,
      });
      const page = await app.firstWindow();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.getByText("The Quiet Harbour", { exact: true }).click();
      await page.getByText("Harbour.yarn", { exact: true }).first().click();
      await page.waitForSelector(".monaco-editor");
      await page.screenshot({
        path: path.join(base, language + "-editor.png"),
      });
      await page.keyboard.press("Control+Shift+f");
      await page.waitForSelector('[role="dialog"]');
      await page.screenshot({
        path: path.join(base, language + "-search.png"),
      });
      await page.keyboard.press("Escape");
      if (language === "en") {
        const shots = path.resolve("docs/images");
        fs.mkdirSync(shots, { recursive: true });
        const sourceText = await page.evaluate(() =>
          window.monaco.editor
            .getEditors()
            .find((editor) => editor.getDomNode()?.isConnected)
            .getModel()
            .getValue(),
        );
        const commandPoint = await page
          .locator(".view-line")
          .filter({ hasText: "play_sound" })
          .first()
          .evaluate((line) => {
            const walker = document.createTreeWalker(
              line,
              NodeFilter.SHOW_TEXT,
            );
            let textNode;
            while ((textNode = walker.nextNode())) {
              const index = textNode.textContent.indexOf("play_sound");
              if (index < 0) continue;
              const range = document.createRange();
              range.setStart(textNode, index);
              range.setEnd(textNode, index + "play_sound".length);
              const rect = range.getBoundingClientRect();
              return {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
              };
            }
            throw Error("Custom command is not visible");
          });
        await page.mouse.move(commandPoint.x, commandPoint.y);
        await page
          .locator(
            ".source-command-popup:not([hidden]) .command-tip-parameters",
          )
          .waitFor();
        assert.match(
          await page.locator(".source-command-popup:not([hidden])").innerText(),
          /Play a sound cue/,
        );
        await page.screenshot({
          path: path.join(shots, "assistance.png"),
          clip: { x: 0, y: 0, width: 1080, height: 590 },
        });
        await page.mouse.move(1450, 130);
        await page.evaluate(() => {
          const editor = window.monaco.editor
            .getEditors()
            .find((item) => item.getDomNode()?.isConnected);
          editor.focus();
          editor.setPosition({ lineNumber: 3, column: 1 });
        });
        await page.keyboard.type("<<play", { delay: 85 });
        await page.locator(".suggest-widget.visible").waitFor();
        await page.locator(".source-completion-info:not([hidden])").waitFor();
        assert.match(
          await page
            .locator(".source-completion-info:not([hidden])")
            .innerText(),
          /Play a sound cue/,
        );
        await page.screenshot({
          path: path.join(shots, "source.png"),
          clip: { x: 0, y: 0, width: 1080, height: 500 },
        });
        await page.keyboard.press("Escape");
        await page.evaluate((text) => {
          const editor = window.monaco.editor
            .getEditors()
            .find((item) => item.getDomNode()?.isConnected);
          editor.getModel().setValue(text);
        }, sourceText);
        await page
          .getByRole("radio", { name: "Reading editor", exact: true })
          .click();
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(shots, "reading.png") });
        await page
          .getByRole("radio", { name: "Flowchart", exact: true })
          .click();
        await page.waitForSelector(".react-flow__node");
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(shots, "graph.png") });
        await page.keyboard.press("Control+Shift+f");
        await page.waitForSelector('[role="dialog"]');
        await page.screenshot({ path: path.join(shots, "search.png") });
        await page
          .getByText("Editor appearance", { exact: true })
          .first()
          .click();
        await page.waitForSelector(".settings-workspace");
        await page.screenshot({ path: path.join(shots, "appearance.png") });
        for (const field of [
          "source.tabSize",
          "source.whitespace",
          "reader.width",
          "reopenLastProject",
          "mcp.port",
          "zoom",
        ]) {
          await page.keyboard.press("Control+Shift+f");
          await page
            .locator(".search-overlay input[role=combobox]")
            .fill(field);
          await page.getByRole("option").first().click();
          const target = page.locator(`[data-setting="${field}"]`).first();
          await target.waitFor({ state: "visible" });
          console.log("Checking deep link " + field);

          await page.waitForFunction(
            (field) =>
              document
                .querySelector(`[data-setting="${field}"]`)
                ?.contains(document.activeElement),
            field,
          );
        }

        await page
          .getByRole("button", { name: "MCP / Agent integration", exact: true })
          .click();
        await page.waitForTimeout(150);
        const viewport = await page.evaluate(() => ({
          width: innerWidth,
          height: Math.round(innerHeight * 0.6),
        }));
        await page.screenshot({
          path: path.join(shots, "agent.png"),
          clip: { x: 0, y: 0, ...viewport },
        });
        // Creating from a utility tab must allocate a new provisional editor tab.
        const tabsBefore = await page.locator('[role="tab"]').count();
        await page.keyboard.press("Control+p");
        await page.getByText("New script", { exact: true }).click();
        await page.waitForSelector(".inline-name-editor input");
        assert.equal(
          await page.locator('[role="tab"]').count(),
          tabsBefore + 1,
        );
        await page.keyboard.press("Escape");
        assert.equal(await page.locator('[role="tab"]').count(), tabsBefore);
        await page.getByRole("tab", { name: /Harbour/ }).click();
        await page.getByRole("radio", { name: "Source", exact: true }).click();
        await page.locator(".monaco-editor .view-lines").click();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");
        await page.keyboard.type('<<give_item "letter">>');
        await page.keyboard.press("Enter");
        await page.keyboard.press("Control+s");
        await page.waitForTimeout(950);
        await page
          .locator(".view-line")
          .filter({ hasText: "give_item" })
          .first()
          .hover();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(base, "unknown-command.png") });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Version history", exact: true })
          .click();
        await page.locator(".history-entries button").first().click();
        await page
          .getByRole("radio", {
            name: require("../app/i18n/en.json").m2ddd4be2e164,
            exact: true,
          })
          .click();
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(shots, "history.png") });
      }
      assert.deepEqual(errors, []);
      console.log("PASS " + language);
      fs.writeFileSync(
        path.join(base, language + ".txt"),
        await page.locator("body").innerText(),
      );
    } finally {
      if (app) await app.close();
    }
  }
  console.log(base);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
