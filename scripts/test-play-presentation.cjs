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
    '<<declare $qa_text = "initial">>',
    `Mira: ${first}`,
    `Mira: ${second}`,
    ...options,
    "===",
    "title: AutoChoice",
    "---",
    "Mira: Choose a route.",
    "-> Left",
    "    Mira: Left route.",
    "    Mira: Left route continues.",
    "-> Right",
    "    Mira: Right route.",
    "    Mira: Right route continues.",
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
async function waitForState(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let current;
  do {
    current = await state();
    if (predicate(current.state)) return current;
    await play.waitForTimeout(50);
  } while (Date.now() < deadline);
  assert.fail("Runtime state wait timed out: " + current.state.status);
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
  assert.equal(
    await play.locator(".play-stage .play-avatar").count(),
    0,
    "VN does not render portraits",
  );
  assert.equal(
    await play.locator(".play-scene-caption").count(),
    0,
    "The VN stage has no scene caption",
  );
  assert.equal(
    await play.locator(".play-footer").count(),
    0,
    "Scene/debug location is not a stage footer",
  );
  const vnTextStyle = await text.evaluate((el) => ({
    cursor: getComputedStyle(el).cursor,
    select: getComputedStyle(el).userSelect,
  }));
  assert.notEqual(vnTextStyle.cursor, "text");
  assert.equal(vnTextStyle.select, "none");
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
  async function clickCue() {
    const rect = await advance.boundingBox();
    await play.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
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
    assert.equal(await advance.getAttribute("aria-hidden"), "true");
    assert.equal(await advance.evaluate((el) => el.tagName), "SPAN");
    assert(
      (await play.locator(".play-vn-advance-area").getAttribute("aria-label"))
        ?.length > 0,
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
      cue.width <= 16 && cue.height <= 12,
      "Decorative glyph has no standalone button hit target",
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

  const rapidStart = await act({ action: "start", scene: "Short" });
  const rapidRect = await text.boundingBox();
  const rapidPoint = { x: rapidRect.x + 18, y: rapidRect.y + 12 };
  await play.mouse.click(rapidPoint.x, rapidPoint.y, { clickCount: 1 });
  assert.equal(await text.textContent(), "The ferry is here. Shall we go?");
  assert.equal((await state()).state.revision, rapidStart.state.revision);
  await play.mouse.click(rapidPoint.x, rapidPoint.y, { clickCount: 2 });
  await waitForState((value) => value.revision > rapidStart.state.revision);
  assert(
    (await state()).state.events.some(
      (event) => event.kind === "line" && event.text.includes("我們一起走吧。"),
    ),
  );
  checks.push(
    "A real double-click sequence reveals VN text on the first click and advances on the second",
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
  await clickCue();
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
      await clickCue();
      await frames();
    }
  }
  assert.equal(rendered.join(""), first, "All content survives pagination");
  assert(
    rendered.some((value) => value.includes("👨‍👩‍👧‍👦")),
    "Family emoji stays on one page",
  );
  await screenshot("vn-long-dialogue-final-page");
  await clickCue();
  await waitForState((value) => value.revision > s.state.revision);
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

  const novelAdvance = play.locator(".play-novel-advance");
  const novelCue = play.locator(".play-novel-advance-cue");
  assert.equal(
    await novelAdvance.getAttribute("aria-disabled"),
    "true",
    "Backreading disables the novel advance surface",
  );
  const backreadRect = await transcript.boundingBox();
  await play.mouse.click(backreadRect.x + 8, backreadRect.y + 25);
  assert.equal(
    (await state()).state.revision,
    novelRevision,
    "Clicking backread whitespace does not advance",
  );

  await play.locator(".play-return-latest").click();
  const novelStart = await act({ action: "start", scene: "Short" });
  await frames();
  await novelAdvance.waitFor({ state: "visible" });
  assert.equal(await novelAdvance.getAttribute("aria-disabled"), "false");
  const tailStyle = await novelAdvance.evaluate((el) => ({
    color: getComputedStyle(el).backgroundColor,
    height: el.getBoundingClientRect().height,
  }));
  assert.equal(
    tailStyle.color,
    "rgba(0, 0, 0, 0)",
    "Novel advance space has no button surface",
  );
  assert(
    tailStyle.height >= 90,
    "Novel has a usable trailing blank advance surface",
  );
  const tailRect = await novelAdvance.boundingBox();
  const cueRect = await novelCue.boundingBox();
  assert(cueRect, "Novel ready cue is visible");
  assert(
    cueRect.y - tailRect.y <= 36,
    "Novel cue stays near the top of the transparent advance surface",
  );
  assert(
    Math.abs(cueRect.x + cueRect.width / 2 - tailRect.x - tailRect.width / 2) < 2,
    "Novel cue remains horizontally centered",
  );
  await play.mouse.move(tailRect.x + 25, tailRect.y + 25);
  await play.mouse.down();
  await play.mouse.move(tailRect.x + 100, tailRect.y + 40, { steps: 8 });
  await play.mouse.up();
  assert.equal(
    (await state()).state.revision,
    novelStart.state.revision,
    "Dragging across the tail is not a story advance",
  );
  await novelAdvance.click({ position: { x: 25, y: 25 } });
  await waitForState((value) => value.revision > novelStart.state.revision);
  assert(
    (await state()).state.events.some(
      (event) => event.kind === "line" && event.text.includes("我們一起走吧。"),
    ),
  );
  await screenshot("novel-transparent-advance-ready");
  const cueMotion = await novelCue.evaluate(
    (el) => getComputedStyle(el).animationName,
  );
  assert.equal(
    cueMotion,
    "none",
    "Reduced motion suppresses the novel cue blink",
  );
  await play.emulateMedia({ reducedMotion: "no-preference" });
  await frames();
  assert.notEqual(
    await novelCue.evaluate((el) => getComputedStyle(el).animationName),
    "none",
    "The ready novel cue has a blink affordance",
  );
  await novelAdvance.focus();
  await play.keyboard.press("Space");
  // With typewriter enabled the first key completes the line; the next leaves it.
  if ((await state()).state.status === "line")
    await play.keyboard.press("Enter");
  await waitForState((value) => value.status === "completed");
  await play.emulateMedia({ reducedMotion: "reduce" });
  await act({ action: "start", scene: "AutoChoice" });
  const novelChoices = await act({ action: "next" });
  assert.equal(novelChoices.state.status, "options");
  assert.equal(await novelAdvance.getAttribute("aria-disabled"), "true");
  await novelAdvance.click({ position: { x: 20, y: 20 }, force: true });
  await novelAdvance.focus();
  await play.keyboard.press("Enter");
  assert.equal((await state()).state.revision, novelChoices.state.revision);
  checks.push(
    "Novel transparent tail supports click and keyboard with an accessible motion-aware cue; drag, backreading and waiting choices never advance",
  );
  const novelSelectionStart = await act({ action: "start", scene: "Short" });
  await novelAdvance.focus();
  const selectedStory = await play
    .locator(".play-transcript-content .play-line p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return (
        !selection.isCollapsed && selection.getRangeAt(0).intersectsNode(el)
      );
    });
  assert(
    selectedStory,
    "A real DOM range intersects the story content without modifying CSS",
  );
  await play.keyboard.press("Enter");
  assert.equal(
    (await state()).state.revision,
    novelSelectionStart.state.revision,
    "A story selection protects against keyboard advance",
  );
  await play.evaluate(() => window.getSelection().removeAllRanges());
  const novelDebugSearch = play.locator(".play-debug input[placeholder]");
  await novelDebugSearch.fill("qa");
  assert.equal(
    await novelDebugSearch.evaluate((el) => {
      el.select();
      return el.value.slice(el.selectionStart, el.selectionEnd);
    }),
    "qa",
  );
  await novelAdvance.focus();
  const debugSelectionScope = await play.evaluate(() => {
    const selection = window.getSelection();
    // Native focus may collapse the input selection. In that case exercise the
    // range ownership rule explicitly, without changing user-select styles.
    if (selection.isCollapsed || !selection.rangeCount) {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(".play-debug-current p"));
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const content = document.querySelector(".play-transcript-content");
    return {
      active: !selection.isCollapsed && selection.rangeCount > 0,
      intersectsStory: Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).intersectsNode(content),
      ).some(Boolean),
    };
  });
  assert.deepEqual(debugSelectionScope, {
    active: true,
    intersectsStory: false,
  });
  await play.keyboard.press("Enter");
  await waitForState(
    (value) => value.revision > novelSelectionStart.state.revision,
  );
  assert(
    (await state()).state.events.some(
      (event) => event.kind === "line" && event.text.includes("我們一起走吧。"),
    ),
  );
  await play.evaluate(() => window.getSelection().removeAllRanges());
  await novelDebugSearch.fill("");
  checks.push(
    "Novel protects a story selection range while a retained debug selection range does not block keyboard advance",
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
      (await play
        .locator(".play-vn-advance-area")
        .getAttribute("aria-disabled")) !== "true",
      "Pending options cannot strand unread dialogue pages",
    );
    await clickCue();
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
      await clickCue();
      await frames();
      assert.equal((await state()).state.revision, s.state.revision);
    }
    assert.equal(
      (await play
        .locator(".play-vn-advance-area")
        .getAttribute("aria-disabled")) !== "true",
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
  await play.locator(".play-exit-immersive").evaluate((el) => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        isComposing: true,
      }),
    );
  });
  await frames();
  assert.equal(
    await play.locator(".play-app.immersive").count(),
    1,
    "IME Escape must not leave the game view",
  );
  await play.locator(".play-exit-immersive").evaluate((el) => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    el.dispatchEvent(event);
  });
  await frames();
  assert.equal(
    await play.locator(".play-app.immersive").count(),
    1,
    "A control-consumed Escape must not leave the game view",
  );
  assert.equal((await state()).state.revision, s.state.revision);
  checks.push(
    "IME and control-consumed Escape preserve immersive mode and runtime",
  );
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
  const panelToggle = play.getByRole("button", {
    name: /^(Toggle debug panel|切換除錯面板|切换调试面板)$/,
  });
  if (!(await play.locator(".play-debug-current p").isVisible()))
    await panelToggle.click();
  const debugSearch = play.locator(".play-debug input[placeholder]");
  await debugSearch.fill("qa");
  const selectedDebug = await debugSearch.evaluate((el) => {
    el.select();
    return el.value.slice(el.selectionStart, el.selectionEnd);
  });
  assert(
    selectedDebug.length > 0,
    "Debug search input is actually selected before clicking VN",
  );
  await clickCue();
  await frames();
  assert.equal(
    await text.textContent(),
    "我們一起走吧。",
    "A selection in the debug panel must not block VN advance",
  );
  await debugSearch.fill("");
  await act({ action: "start", scene: "Short" });
  checks.push(
    "Selecting a debug search input does not block a subsequent VN click",
  );
  const preferenceRevision = (await state()).state.revision;
  const patchPreferences = (patch) =>
    editor.evaluate(
      (value) => window.yarnDesktop.request({ type: "preferences", ...value }),
      patch,
    );
  const nameplate = play.locator(".play-nameplate strong");
  assert.equal(
    await play.locator("select").count(),
    0,
    "Play uses app selectors instead of native select controls",
  );
  await patchPreferences({
    playPresentation: { showPortraits: false, useNameColors: false },
  });
  await play.waitForFunction(
    () =>
      !document.querySelector(".play-nameplate .play-avatar") &&
      document.querySelector(".play-nameplate strong")?.style.color === "",
  );
  assert.equal(await nameplate.textContent(), "Mira");
  assert.equal((await state()).state.revision, preferenceRevision);
  await patchPreferences({
    editorCharacters: {
      showPortraits: true,
      useNameColors: true,
      sourceNameColors: true,
    },
  });
  await frames();
  assert.equal(
    await play.locator(".play-nameplate .play-avatar").count(),
    0,
    "Editor portrait settings do not change Play settings",
  );
  assert.equal(await nameplate.evaluate((el) => el.style.color), "");
  await patchPreferences({
    playPresentation: { showPortraits: true, useNameColors: true },
  });
  await play.waitForFunction(
    () =>
      !document.querySelector(".play-nameplate .play-avatar") &&
      !!document.querySelector(".play-nameplate strong")?.style.color,
  );
  await mode("novel");
  assert.equal(
    await play.locator(".play-footer,.play-scene-caption").count(),
    0,
  );
  assert.equal(await play.locator(".play-transcript .play-avatar").count(), 1);
  await patchPreferences({ playPresentation: { showPortraits: false } });
  await play.waitForFunction(
    () => !document.querySelector(".play-transcript .play-avatar"),
  );
  await patchPreferences({ playPresentation: { showPortraits: true } });
  await play.waitForFunction(
    () => !!document.querySelector(".play-transcript .play-avatar"),
  );
  await mode("vn");
  assert.equal(await play.locator(".play-stage .play-avatar").count(), 0);
  assert.equal((await state()).state.revision, preferenceRevision);
  await patchPreferences({
    editorCharacters: {
      showPortraits: false,
      useNameColors: true,
      sourceNameColors: false,
    },
  });
  checks.push(
    "VN omits portraits; Novel portrait and live name-color settings are independent of editor preferences and preserve runtime",
  );
  await play.evaluate(() => window.getSelection()?.removeAllRanges());
  const proseBounds = await text.boundingBox();
  await play.mouse.move(proseBounds.x + 8, proseBounds.y + 12);
  await play.mouse.down();
  await play.mouse.move(
    proseBounds.x + Math.min(200, proseBounds.width - 8),
    proseBounds.y + 12,
    { steps: 8 },
  );
  await play.mouse.up();
  assert.equal(
    await play.evaluate(() => window.getSelection()?.toString() || ""),
    "",
  );
  assert.equal((await state()).state.revision, preferenceRevision);
  checks.push(
    "VN prose is not selectable and never uses an I-beam; both stages omit scene labels",
  );
  const quickButtons = play.locator(".play-vn-quick button");
  async function assertQuickChrome() {
    for (const button of await quickButtons.all()) {
      const chrome = await button.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          border: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ],
          shadow: style.boxShadow,
          background: style.backgroundColor,
        };
      });
      assert.deepEqual(chrome.border, ["0px", "0px", "0px", "0px"]);
      assert.equal(chrome.shadow, "none");
      assert.equal(chrome.background, "rgba(0, 0, 0, 0)");
    }
  }
  await assertQuickChrome();
  for (const button of await quickButtons.all()) {
    await button.hover();
    await assertQuickChrome();
  }
  await quickButtons.first().click();
  assert.equal(await quickButtons.first().getAttribute("aria-pressed"), "true");
  assert.equal(await play.locator(".play-vn-auto-state").textContent(), "ON");
  const onColor = await quickButtons
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  await assertQuickChrome();
  await quickButtons.first().click();
  assert.equal(await play.locator(".play-vn-auto-state").textContent(), "OFF");
  assert.notEqual(
    await quickButtons.first().evaluate((el) => getComputedStyle(el).color),
    onColor,
  );
  assert.equal(await advance.evaluate((el) => el.tagName), "SPAN");
  assert.equal((await state()).state.revision, preferenceRevision);
  checks.push(
    "VN quick actions retain transparent borderless chrome in normal, hover and active states; cue is decorative",
  );
  const variableInput = play.locator('.play-variable input[type="text"]');
  await variableInput.fill("測試");
  await variableInput.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  await frames();
  assert(
    await variableInput.evaluate((el) => el === document.activeElement),
    "IME confirmation must not blur the variable input",
  );
  assert.equal(
    (await state()).state.revision,
    preferenceRevision,
    "IME confirmation must not commit a runtime override",
  );
  // Return to the original value before leaving; this test isolates composition handling.
  await variableInput.fill("initial");
  await variableInput.press("Escape");
  checks.push(
    "IME Enter in a string variable retains focus without submitting an override",
  );
  await enter.click();
  await frames();
  await screenshot("vn-game-short-dialogue");
  await play.keyboard.press("Escape");
  await clickCue();
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
  await waitForState((value) => value.status === "options");
  // Auto stays armed at options but never chooses them itself.
  await play.waitForFunction(
    () =>
      document
        .querySelector(".play-vn-quick button")
        ?.getAttribute("aria-pressed") === "true",
    null,
    { timeout: 2000 },
  );
  assert.equal(await autoButton.getAttribute("aria-pressed"), "true");
  assert.equal(await play.locator(".play-vn-auto-state").textContent(), "ON");
  const autoStopped = await state();
  assert.equal(autoStopped.state.status, "options");
  await screenshot("vn-auto-on-waiting-choice");
  assert.equal(
    autoStopped.state.events.some((event) => event.kind === "choice"),
    false,
  );
  await play.waitForTimeout(5300);
  const autoAfterWait = await state();
  fs.writeFileSync(
    path.join(out, "auto-choice-states.json"),
    JSON.stringify(
      { before: autoStopped.state, after: autoAfterWait.state },
      null,
      2,
    ),
  );
  assert.equal(autoAfterWait.state.revision, autoStopped.state.revision);
  await autoButton.click();
  assert.equal(await autoButton.getAttribute("aria-pressed"), "false");
  assert.equal(await play.locator(".play-vn-auto-state").textContent(), "OFF");
  await screenshot("vn-auto-off-waiting-choice");
  await autoButton.click();
  assert.equal(await autoButton.getAttribute("aria-pressed"), "true");
  await play.locator(".play-stage .play-options button").first().click();
  await waitForState((value) =>
    value.events.some(
      (event) =>
        event.kind === "line" && event.text.includes("Left route continues."),
    ),
  );
  checks.push(
    "Auto stays visibly armed at options without choosing, can toggle while waiting, and resumes after a user choice",
  );
  const beforeStop = await state();
  await play.getByRole("button", { name: /^(Stop|停止)$/ }).click();
  await waitForState((value) => value.status === "stopped");
  assert.equal(play.isClosed(), false);
  assert.deepEqual((await state()).state.events, beforeStop.state.events);
  checks.push(
    "Stop ends execution while preserving the Play window and event history",
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
