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

  // Real pointer clicks on dialogue, not direct calls to next(), exercise gesture guards.
  await text.click({ position: { x: 12, y: 12 } });
  assert.equal((await state()).state.revision, s.state.revision);
  assert.equal(
    await text.textContent(),
    first,
    "First click completes the same sentence",
  );
  const overflow = await text.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    top: el.scrollTop,
  }));
  assert(
    overflow.scroll > overflow.client,
    "Fixture must really overflow the VN dialogue",
  );
  assert(
    overflow.top >= overflow.scroll - overflow.client - 3,
    "Revealed text follows to its end",
  );
  await screenshot("vn-long-dialogue");
  await text.click({ position: { x: 12, y: 12 } });
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
      .filter((e) => e.kind === "line")
      .at(-1)
      .text.includes("Second passage."),
  );
  assert.equal(
    await text.evaluate((el) => el.scrollTop),
    0,
    "Next line starts at its top",
  );
  checks.push(
    "VN click first reveals, then advances; overflowing dialogue follows and resets",
  );

  // Restart while the first sentence is already fully revealed must get a new run key.
  s = await act({ action: "start", scene: "Start" });
  await text.click({ position: { x: 12, y: 12 } });
  assert.equal(await text.textContent(), first);
  const previousRun = s.runId;
  s = await act({ action: "start", scene: "Start" });
  assert(s.runId && s.runId !== previousRun, "Restart changes run identity");
  assert(
    (await text.textContent()).length < first.length,
    "Restart begins a fresh typewriter pass",
  );
  checks.push(
    "Restart changes runId and replays typewriter even for identical first dialogue",
  );

  await play.emulateMedia({ reducedMotion: "reduce" });
  await frames();
  assert.equal(
    await text.textContent(),
    first,
    "Reduced motion exposes the complete line",
  );
  assert.equal((await state()).state.revision, s.state.revision);
  const animation = await play
    .locator(".play-stage-shade")
    .evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(animation, "none");
  checks.push("Reduced motion shows full dialogue without runtime mutation");

  // The VN paragraph must retain keyboard scrollability; wheel scrolling isn't an advance.
  await text.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const currentRevision = s.state.revision;
  await text.hover();
  await play.mouse.wheel(0, -200);
  await frames();
  assert.equal((await state()).state.revision, currentRevision);
  await act({ action: "next" });
  assert.equal(await text.textContent(), second);
  assert.equal(await text.evaluate((el) => el.scrollTop), 0);
  checks.push(
    "Wheel reading does not advance; a complete following long line resets to its top",
  );

  // Backreading a long VN paragraph must pause Auto before its next deadline.
  const autoButton = play.locator(".play-vn-quick button").nth(0);
  await text.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await frames();
  await autoButton.click();
  const scrollRevision = (await state()).state.revision;
  await text.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 100);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await frames();
  assert.equal(
    await autoButton.getAttribute("aria-pressed"),
    "false",
    "VN backreading pauses Auto",
  );
  await play.waitForTimeout(5300);
  assert.equal((await state()).state.revision, scrollRevision);
  checks.push("Scrolling back within a long VN paragraph pauses Auto");

  // Auto must stop while reviewing backlog, including beyond the auto-advance deadline.
  await autoButton.click();
  assert.equal(await autoButton.getAttribute("aria-pressed"), "true");
  await play.locator(".play-vn-quick button").nth(1).click();
  await play.locator(".play-backlog").waitFor();
  const backlogRevision = (await state()).state.revision;
  assert.equal(await autoButton.getAttribute("aria-pressed"), "false");
  await play.waitForTimeout(5300); // Deliberately exceeds the production 5s maximum Auto delay.
  assert.equal((await state()).state.revision, backlogRevision);
  await screenshot("vn-backlog");
  await play.keyboard.press("Escape");
  await play.locator(".play-backlog").waitFor({ state: "hidden" });
  checks.push("Opening backlog turns Auto off and prevents hidden progression");

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
  assert.equal(await text.textContent(), cjk);
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
