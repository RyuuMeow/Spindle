/* Actual desktop presentation regression. Uses only a disposable public fixture. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const playwright = require("playwright");

const out = path.resolve("outputs/play-presentation/" + Date.now());
const root = path.join(out, "Presentation Fixture");
const profile = path.join(out, "profile");
const first =
  "First passage 世界 👨‍👩‍👧‍👦. " +
  "The station lights shimmer across the water. A quiet voice asks us to wait. "
    .repeat(24)
    .trimEnd();
const second =
  "Second passage. " +
  "The next morning brings another question, and a different path through the city. "
    .repeat(24)
    .trimEnd();
const cjk =
  "這是明亮背景、三個站位與長篇中文台詞的可讀性驗收。鏡頭前的角色仍應清楚，名字框、選項與文字不能互相遮擋。".repeat(
    12,
  );
const novelLines = Array.from(
  { length: 24 },
  (_, i) =>
    `Mira: Passage ${i + 1}. ${"This is public demonstration text for reading-position verification. ".repeat(3)}`,
);
const options = Array.from(
  { length: 14 },
  (_, i) =>
    `-> Choice ${i + 1}: ${"Follow the riverside path and inspect the old observatory before returning to the station. ".repeat(3)}\n    Mira: Chosen route ${i + 1}.`,
);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "Presentation.yarn"),
  [
    "title: Start",
    "---",
    `Mira: ${first}`,
    `Mira: ${second}`,
    ...options,
    "===",
    "title: AutoChoice",
    "---",
    "Mira: Choose a route.",
    "-> Left",
    "    Mira: Left route.",
    "-> Right",
    "    Mira: Right route.",
    "===",
    "title: Short",
    "---",
    "Mira: The ferry is here. Shall we go?",
    "Rowan: 我們一起走吧。",
    "===",
    "title: Novel",
    "---",
    ...novelLines,
    "===",
    "title: Art",
    "---",
    "<<test_background bright>>",
    "<<test_left Mira>>",
    "<<test_center Rowan>>",
    "<<test_right Tao>>",
    `Mira: ${cjk}`,
    ...options,
    "===",
  ].join("\n"),
);

let app;
let play;
const checks = [];
const errors = [];
async function launch() {
  if (process.env.SPINDLE_PLAY_PORTABLE) {
    return require("./portable-test-driver.cjs").launch(playwright, {
      executablePath: path.resolve(process.env.SPINDLE_PLAY_PORTABLE),
      args: [`--user-data-dir=${profile}`],
      timeout: 60000,
    });
  }
  return playwright._electron.launch({
    executablePath: require("electron"),
    args: ["dist-desktop/app/desktop/main.cjs", `--user-data-dir=${profile}`],
    timeout: 30000,
  });
}
async function frames() {
  await play.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function state() {
  return play.evaluate(() =>
    window.yarnDesktop.play.action({ action: "state" }),
  );
}
async function act(input) {
  const result = await play.evaluate(async (value) => {
    const current = await window.yarnDesktop.play.action({ action: "state" });
    return window.yarnDesktop.play.action(value, current.state.revision);
  }, input);
  await frames();
  return result;
}
async function mode(value) {
  await play
    .locator(".play-mode-switch button")
    .nth(value === "vn" ? 1 : 0)
    .click();
  await frames();
}
async function resize(width, height) {
  await app.evaluate(
    async ({ BrowserWindow }, size) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (
          await win.webContents.executeJavaScript(
            "window.yarnDesktop?.play.isWindow",
          )
        ) {
          win.setSize(size.width, size.height);
          return;
        }
      }
      throw new Error("Play window missing");
    },
    { width, height },
  );
  await frames();
}
async function screenshot(name) {
  await play.screenshot({ path: path.join(out, name + ".png") });
}

(async () => {
  app = await launch();
  const editor = await app.firstWindow();
  editor.on("pageerror", (e) => errors.push(e.message));
  await editor
    .getByRole("button", {
      name: /^(開啟專案資料夾|Open project folder|打开项目文件夹)$/,
    })
    .waitFor();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [root],
    });
  }, root);
  await editor
    .getByRole("button", {
      name: /^(開啟專案資料夾|Open project folder|打开项目文件夹)$/,
    })
    .click();
  await editor
    .getByRole("button", { name: "Presentation.yarn", exact: true })
    .click();
  await editor.locator(".monaco-editor .view-lines").first().waitFor();
  // Pure generated raster fixtures: these are contrast probes, not production artwork.
  const brightPath = path.join(out, "contrast-background.png");
  async function rasterFixture(filename, fill, actor) {
    const base64 = await editor.evaluate(
      ({ fill, actor }) => {
        const canvas = document.createElement("canvas");
        canvas.width = actor ? 320 : 1280;
        canvas.height = actor ? 700 : 720;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Canvas 2D unavailable for raster fixture");
        context.fillStyle = fill;
        if (actor) {
          context.beginPath();
          context.arc(160, 112, 75, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.moveTo(90, 196);
          context.quadraticCurveTo(160, 170, 230, 196);
          context.lineTo(280, 680);
          context.lineTo(40, 680);
          context.closePath();
          context.fill();
          context.strokeStyle = "#ffffff";
          context.lineWidth = 4;
          context.stroke();
        } else context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { fill, actor },
    );
    fs.writeFileSync(filename, Buffer.from(base64, "base64"));
  }
  await rasterFixture(brightPath, "#fff8d8", false);
  const actorPaths = [];
  for (const [i, fill] of ["#59839d", "#9d6f8e", "#6e967b"].entries()) {
    const filename = path.join(out, `contrast-actor-${i}.png`);
    await rasterFixture(filename, fill, true);
    actorPaths.push(filename);
  }
  async function importFixture(filename) {
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [filename],
      });
    }, filename);
    return editor.evaluate(() => window.yarnDesktop.play.importImage());
  }
  const background = await importFixture(brightPath);
  const actors = [];
  for (const filename of actorPaths) actors.push(await importFixture(filename));
  await editor.evaluate(
    async ({ background, actors }) => {
      const resources = await window.yarnDesktop.play.resources();
      resources.config.backgrounds.bright = background.id;
      for (const [i, name] of ["Mira", "Rowan", "Tao"].entries()) {
        resources.config.characters.push({
          name,
          displayName: name,
          color: "#a8cde0",
          portraits: {},
          sprites: { default: actors[i].id },
        });
      }
      resources.config.bindings = [
        {
          command: "test_background",
          effect: "background",
          assetArgument: 0,
          characterArgument: 0,
          position: "center",
          fade: false,
        },
        ...["left", "center", "right"].map((position) => ({
          command: "test_" + position,
          effect: "show",
          position,
          characterArgument: 0,
          assetArgument: 1,
          fade: false,
        })),
      ];
      await window.yarnDesktop.play.save(resources.config);
    },
    { background, actors },
  );
  // Play and editor share the profile origin. Set initial preferences before mounting Play.
  await editor.evaluate(() => {
    localStorage.setItem("spindle.play.mode", JSON.stringify("vn"));
    localStorage.setItem("spindle.play.typewriter", "true");
    localStorage.setItem("spindle.play.speed", "5");
    localStorage.setItem("spindle.play.panel", "true");
  });
  const opened = app.waitForEvent("window");
  await editor.evaluate(() => window.yarnDesktop.play.open());
  play = await opened;
  play.on("pageerror", (e) => errors.push(e.message));
  await play.locator(".play-app").waitFor();
  await play.emulateMedia({ reducedMotion: "no-preference" });
  await resize(1200, 800);
  let s = await act({ action: "start", scene: "Start" });
  await mode("vn");
  const text = play.locator(".play-vn-text");
  assert(
    (await text.textContent()).length < first.length,
    "Typewriter starts incomplete",
  );

  // A splitter arrow must resize, never invoke the global story shortcut.
  const splitter = play.locator(".play-resize");
  await splitter.waitFor();
  const widthBefore = Number(await splitter.getAttribute("aria-valuenow"));
  const revisionBeforeResize = s.state.revision;
  await splitter.focus();
  await play.keyboard.press("ArrowLeft");
  assert.equal((await state()).state.revision, revisionBeforeResize);
  assert(Number(await splitter.getAttribute("aria-valuenow")) > widthBefore);
  await play.keyboard.press("ArrowRight");
  assert.equal((await state()).state.revision, revisionBeforeResize);
  checks.push(
    "Splitter arrows resize without advancing or rewinding the runtime",
  );

  const dialogue = play.locator(".play-vn-dialogue");
  const advance = play.locator(".play-vn-advance");
  async function assertAdvanceCue(visible) {
    assert.equal(
      await play.locator(".play-vn-page-indicator").count(),
      0,
      "Local pagination has no visible page counter",
    );
    assert.equal(
      (await advance.textContent()).trim(),
      "",
      "Advance has no visible Continue/page label",
    );
    assert(
      (await advance.getAttribute("aria-label"))?.length > 0,
      "Icon-only advance retains an accessible name",
    );
    const cue = await advance.evaluate((el) => {
      const glyph = el.querySelector("svg");
      const rect = el.getBoundingClientRect();
      return {
        visibility: glyph && getComputedStyle(glyph).visibility,
        width: rect.width,
        height: rect.height,
      };
    });
    assert.equal(cue.visibility, visible ? "visible" : "hidden");
    assert(
      cue.width >= 35.5 && cue.height >= 35.5,
      "Small glyph keeps a 36 CSS px hit target",
    );
  }
  async function pageInfo() {
    return dialogue.evaluate((el) => ({
      page: Number(el.dataset.page),
      count: Number(el.dataset.pageCount),
    }));
  }
  async function assertTwoLinePage() {
    const geometry = await text.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
      overflow: getComputedStyle(el).overflowY,
    }));
    assert(geometry.client <= geometry.line * 2 + 2, JSON.stringify(geometry));
    assert(
      geometry.scroll <= geometry.client + 2,
      "No hidden third line: " + JSON.stringify(geometry),
    );
    assert(
      !["auto", "scroll"].includes(geometry.overflow),
      "VN dialogue is paginated, not scrollable",
    );
  }
  const initialPage = await pageInfo();
  assert.equal(initialPage.page, 1);
  assert(initialPage.count > 2);
  await assertAdvanceCue(false);
  await text.click({ position: { x: 12, y: 12 } });
  await frames();
  const firstPageText = await text.textContent();
  assert(firstPageText.length > 0 && firstPageText.length < first.length);
  assert(first.startsWith(firstPageText));
  assert.equal((await pageInfo()).page, 1);
  assert.equal((await state()).state.revision, s.state.revision);
  await assertAdvanceCue(true);
  await assertTwoLinePage();
  await screenshot("vn-long-dialogue-page-1");
  await text.click({ position: { x: 12, y: 12 } });
  await frames();
  assert.equal((await pageInfo()).page, 2);
  assert.equal((await state()).state.revision, s.state.revision);
  await assertAdvanceCue(false);
  checks.push(
    "VN pointer click reveals one page then advances locally without runtime mutation",
  );

  const previousRun = s.runId;
  s = await act({ action: "start", scene: "Start" });
  assert(s.runId && s.runId !== previousRun);
  assert.equal((await pageInfo()).page, 1);
  assert((await text.textContent()).length < firstPageText.length);
  checks.push("Restart resets run identity, local page and typewriter");
  await play.emulateMedia({ reducedMotion: "reduce" });
  await frames();
  assert.equal(
    await text.textContent(),
    firstPageText,
    "Reduced motion reveals only the current page",
  );
  assert.equal((await state()).state.revision, s.state.revision);
  checks.push(
    "Reduced motion reveals the current page without exceeding two lines",
  );

  // Resizing preserves the source anchor rather than resetting to the first page.
  await advance.click();
  await frames();
  const beforeResize = await pageInfo();
  const resizeText = await text.textContent();
  const sourceAnchor = firstPageText.length;
  assert.equal(
    first.slice(sourceAnchor, sourceAnchor + resizeText.length),
    resizeText,
  );
  await resize(760, 540);
  await frames();
  const narrowPage = await pageInfo();
  const narrowText = await text.textContent();
  assert(narrowPage.count >= beforeResize.count);
  assert(narrowPage.page >= beforeResize.page);
  assert(
    narrowText.includes(resizeText.slice(0, 10)),
    "Narrow page contains the previous source anchor",
  );
  await assertTwoLinePage();
  assert.equal((await state()).state.revision, s.state.revision);
  await resize(1200, 800);
  await frames();
  assert.deepEqual(await pageInfo(), beforeResize);
  assert.equal(await text.textContent(), resizeText);
  checks.push(
    "Narrow/wide reflow retains the source anchor without runtime mutation",
  );
  s = await act({ action: "start", scene: "Start" });
  const pageCount = (await pageInfo()).count;
  const rendered = [];
  for (let page = 1; page <= pageCount; page++) {
    assert.equal((await pageInfo()).page, page);
    assert.equal((await state()).state.revision, s.state.revision);
    rendered.push(await text.textContent());
    await assertTwoLinePage();
    if (page < pageCount) {
      await advance.click();
      await frames();
    }
  }
  assert.equal(rendered.join(""), first, "All content survives pagination");
  assert(
    rendered.some((value) => value.includes("👨‍👩‍👧‍👦")),
    "Family emoji stays on one page",
  );
  await screenshot("vn-long-dialogue-final-page");
  await advance.click();
  await play.waitForFunction(
    async (revision) =>
      (await window.yarnDesktop.play.action({ action: "state" })).state
        .revision > revision,
    s.state.revision,
  );
  await frames();
  s = await state();
  assert(
    s.state.events
      .filter((event) => event.kind === "line")
      .at(-1)
      .text.includes("Second passage."),
  );
  assert.equal((await pageInfo()).page, 1);
  assert(second.startsWith(await text.textContent()));
  await assertTwoLinePage();
  checks.push(
    "Every local page preserves text; only leaving the final page advances runtime",
  );
  const wheelPage = await pageInfo();
  await text.hover();
  await play.mouse.wheel(0, -200);
  await frames();
  assert.deepEqual(await pageInfo(), wheelPage);
  assert.equal((await state()).state.revision, s.state.revision);
  checks.push("Wheel does not navigate fixed message pages or runtime");

  const autoButton = play.locator(".play-vn-quick button").nth(0);
  await autoButton.click();
  await play.waitForFunction(
    () =>
      Number(
        document.querySelector(".play-vn-dialogue")?.getAttribute("data-page"),
      ) > 1,
    null,
    { timeout: 8000 },
  );
  assert.equal(
    (await state()).state.revision,
    s.state.revision,
    "Auto consumes local pages first",
  );
  await play.locator(".play-vn-quick button").nth(1).click();
  await play.locator(".play-backlog").waitFor();
  const backlogRevision = (await state()).state.revision;
  const backlogPage = await pageInfo();
  assert.equal(await autoButton.getAttribute("aria-pressed"), "false");
  await play.waitForTimeout(5300);
  assert.equal((await state()).state.revision, backlogRevision);
  assert.deepEqual(await pageInfo(), backlogPage);
  await screenshot("vn-backlog");
  await play.keyboard.press("Escape");
  await play.locator(".play-backlog").waitFor({ state: "hidden" });
  checks.push(
    "Auto traverses pages; backlog stops local and runtime progression past the deadline",
  );

  await act({ action: "start", scene: "Novel" });
  for (let i = 0; i < 20; i++) await act({ action: "next" });
  await mode("novel");
  const transcript = play.locator(".play-transcript");
  const savedScroll = await transcript.evaluate((el) => {
    if (el.scrollHeight <= el.clientHeight * 2)
      throw new Error("Novel fixture too short");
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 3);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
    return el.scrollTop;
  });
  await frames();
  const novelRevision = (await state()).state.revision;
  await screenshot("novel-backread");
  await mode("vn");
  await mode("novel");
  assert(
    Math.abs((await transcript.evaluate((el) => el.scrollTop)) - savedScroll) <=
      2,
    "Switching presentation preserves the novel's backreading position",
  );
  assert.equal((await state()).state.revision, novelRevision);
  checks.push(
    "Novel backreading position and runtime remain stable across presentation switches",
  );

  await act({ action: "start", scene: "Start" });
  await act({ action: "next" });
  s = await act({ action: "next" });
  assert.equal(s.state.status, "options");
  assert.equal(s.state.options.length, 14);
  await mode("vn");
  await resize(760, 540);
  await play.waitForTimeout(100); // Native resize delivery is asynchronous.
  const geometry = await play.evaluate(() => {
    const choices = document.querySelector(".play-vn-choices");
    const dialogue = document.querySelector(".play-vn-dialogue");
    const cr = choices.getBoundingClientRect(),
      dr = dialogue.getBoundingClientRect();
    return {
      overlap: cr.bottom > dr.top + 1,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      choicesOverflow: choices.scrollHeight > choices.clientHeight,
      choicesHeight: choices.clientHeight,
      dialogueBottom: dr.bottom,
      viewport: innerHeight,
    };
  });
  assert.equal(geometry.overlap, false);
  assert.equal(geometry.pageOverflow, false);
  assert(
    geometry.choicesOverflow && geometry.choicesHeight > 40,
    "Long choices need a usable independent scroll area",
  );
  assert(
    geometry.dialogueBottom <= geometry.viewport + 1,
    JSON.stringify(geometry),
  );
  const choiceButtons = play.locator(
    ".play-stage .play-options > div > button",
  );
  await choiceButtons.last().scrollIntoViewIfNeeded();
  const lastRect = await choiceButtons.last().boundingBox();
  const areaRect = await play.locator(".play-vn-choices").boundingBox();
  assert(
    lastRect.y < areaRect.y + areaRect.height &&
      lastRect.y + lastRect.height > areaRect.y,
  );
  assert.equal((await state()).state.revision, s.state.revision);
  await screenshot("vn-narrow-long-options");
  checks.push(
    "Fourteen long choices scroll independently at 760×540 without obscuring dialogue",
  );

  // Entering VN at a pending choice can have unread local pages from the previous line.
  // Local page controls must remain usable without selecting an option or running the VM.
  const waitingPages = await pageInfo();
  if (waitingPages.page < waitingPages.count) {
    assert(
      await advance.isEnabled(),
      "Pending options cannot strand unread dialogue pages",
    );
    await advance.click();
    await frames();
    assert.equal((await pageInfo()).page, waitingPages.page + 1);
    assert.equal((await state()).state.revision, s.state.revision);
    assert.equal((await state()).state.status, "options");
    if ((await pageInfo()).page < waitingPages.count) {
      await play.evaluate(() => document.activeElement?.blur());
      const beforeArrow = (await pageInfo()).page;
      await play.keyboard.press("ArrowRight");
      await frames();
      assert.equal(
        (await pageInfo()).page,
        beforeArrow + 1,
        "Keyboard matches local-page click behavior",
      );
      assert.equal((await state()).state.revision, s.state.revision);
    }
    while ((await pageInfo()).page < waitingPages.count) {
      await advance.click();
      await frames();
      assert.equal((await state()).state.revision, s.state.revision);
    }
    assert.equal(
      await advance.isEnabled(),
      false,
      "Final waiting page prompts a choice instead of advancing VM",
    );
    assert.equal((await state()).state.status, "options");
    await assertAdvanceCue(false);
  }
  checks.push(
    "Pending choices preserve usable local paging without runtime advancement",
  );
  checks.push(
    "VN uses only a named triangle cue: hidden while typing or waiting for choices, visible when ready; no page counter or Continue label",
  );

  const enter = play.getByRole("button", {
    name: /^(Enter game view|進入遊戲畫面|进入游戏画面)$/,
  });
  await enter.click();
  await play.locator(".play-app.immersive").waitFor();
  assert.equal(await play.locator(".play-debug").count(), 0);
  assert.equal(
    await play.locator(".play-stage .lucide-external-link").count(),
    0,
  );
  assert(
    await play
      .locator(".play-exit-immersive")
      .evaluate((el) => el === document.activeElement),
  );
  await screenshot("vn-immersive-long-options");
  await play.keyboard.press("Escape");
  await play.locator(".play-app.immersive").waitFor({ state: "hidden" });
  await frames();
  assert(
    await enter.evaluate((el) => el === document.activeElement),
    "Escape returns focus to entry control",
  );
  assert.equal((await state()).state.revision, s.state.revision);
  checks.push(
    "Immersive Escape restores focus and leaves runtime and choices unchanged",
  );

  await resize(1200, 800);
  await act({ action: "start", scene: "Art" });
  await frames();
  assert.equal(await play.locator(".play-stage .play-actor img").count(), 3);
  assert(cjk.startsWith(await text.textContent()));
  assert((await pageInfo()).count > 1);
  await assertTwoLinePage();
  assert.equal(
    await play
      .locator(".play-actor-center")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
    "Center actor must not inherit editor center-panel background",
  );
  assert(
    await play
      .locator(".play-background")
      .evaluate((el) => el.complete && el.naturalWidth === 1280),
  );
  await screenshot("vn-bright-three-actors-cjk");
  await enter.click();
  await frames();
  await screenshot("vn-game-bright-three-actors-cjk");
  await play.keyboard.press("Escape");
  await act({ action: "next" });
  await resize(760, 540);
  await frames();
  await screenshot("vn-bright-narrow-long-options");
  checks.push(
    "Generated bright-background / three-actor / long-CJK contrast fixtures rendered for visual review",
  );

  await resize(1200, 800);
  await act({ action: "start", scene: "Short" });
  assert.equal((await pageInfo()).count, 1);
  assert.equal(await text.textContent(), "The ferry is here. Shall we go?");
  await assertTwoLinePage();
  await screenshot("vn-short-dialogue");
  await enter.click();
  await frames();
  await screenshot("vn-game-short-dialogue");
  await play.keyboard.press("Escape");
  await advance.click();
  await frames();
  await play.waitForFunction(
    () =>
      document.querySelector(".play-vn-text")?.textContent === "我們一起走吧。",
  );
  assert.equal(await text.textContent(), "我們一起走吧。");
  await screenshot("vn-short-cjk");
  checks.push(
    "Short English and CJK dialogue remain one page in normal and immersive VN",
  );
  await act({ action: "start", scene: "AutoChoice" });
  await autoButton.click();
  await play.waitForFunction(
    async () =>
      (await window.yarnDesktop.play.action({ action: "state" })).state
        .status === "options",
    null,
    { timeout: 8000 },
  );
  // The host can answer state before the renderer receives and commits its event.
  // Wait for the actual UI contract, with a short bound that still fails a stuck Auto.
  await play.waitForFunction(
    () =>
      document
        .querySelector(".play-vn-quick button")
        ?.getAttribute("aria-pressed") === "false",
    null,
    { timeout: 2000 },
  );
  assert.equal(await autoButton.getAttribute("aria-pressed"), "false");
  const autoStopped = await state();
  assert.equal(
    autoStopped.state.events.some((event) => event.kind === "choice"),
    false,
  );
  await play.waitForTimeout(1200);
  assert.equal((await state()).state.revision, autoStopped.state.revision);
  checks.push(
    "Normal Auto reaches a choice then stops without selecting or changing the waiting revision",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify({ status: "passed", checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ output: out, checks }, null, 2));
})()
  .catch(async (error) => {
    try {
      if (play) await screenshot("failure");
    } catch {}
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          status: "failed",
          checks,
          errors,
          error: String(error.stack || error),
        },
        null,
        2,
      ),
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
  });
