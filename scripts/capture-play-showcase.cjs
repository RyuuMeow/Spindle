/* Capture real Play UI from a disposable, public-safe story. No user profile. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron } = require("playwright");
const out = path.resolve("outputs/play-showcase/" + Date.now());
const project = path.join(out, "The Quiet Harbour");
const profile = path.join(out, "profile");
fs.mkdirSync(project, { recursive: true });
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
  path.join(project, "Harbour.yarn"),
  `title: Start
---
<<declare $has_key = false>>
<<declare $trust = 2>>
Rain settles over the harbour. One lantern still burns above the tide.
Mira: The lighthouse keeper left this for you.
You: A key? I thought the tower was sealed.
Mira: Then let's find out who has been keeping the light alive.
-> Take the key
    <<set $has_key = true>>
    Mira: Stay close. The path is narrow after dark.
-> Ask about the keeper
    Mira: I haven't seen him since the storm.
===
`,
);
(async () => {
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: ["dist-desktop/app/desktop/main.cjs", "--user-data-dir=" + profile],
    });
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, project);
    await page
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Harbour.yarn", exact: true })
      .click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    const opened = app.waitForEvent("window");
    await page.evaluate(() => window.yarnDesktop.play.open());
    const play = await opened;
    await play.locator(".play-app").waitFor();
    await app.evaluate(async ({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (
          await window.webContents.executeJavaScript(
            "window.yarnDesktop?.play.isWindow",
          )
        ) {
          window.setSize(1440, 900);
          window.webContents.setZoomFactor(1);
        }
      }
    });
    const act = (input) =>
      play.evaluate(async (input) => {
        const current = await window.yarnDesktop.play.action({
          action: "state",
        });
        return window.yarnDesktop.play.action(input, current.state.revision);
      }, input);
    await act({ action: "start", scene: "Start" });
    for (let i = 0; i < 3; i++) await act({ action: "next" });
    await play.getByLabel("Typewriter", { exact: true }).uncheck();
    await play.waitForTimeout(400);
    assert.equal(await play.locator(".play-line").count(), 4);
    fs.mkdirSync("docs/images", { recursive: true });
    await play.mouse.move(20, 400);
    await play.screenshot({ path: "docs/images/play-novel.png" });
    await play.getByRole("button", { name: "VN", exact: true }).click();
    await play.waitForTimeout(300);
    await play.mouse.move(20, 400);
    await play.screenshot({ path: "docs/images/play-vn.png" });
    console.log(
      JSON.stringify({ out, screenshots: ["play-novel.png", "play-vn.png"] }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
