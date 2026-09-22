const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { spawn, execFileSync } = require("node:child_process");
const pw = require("playwright"),
  base = path.resolve("outputs/portable-update-" + Date.now()),
  profile = path.join(base, "profile"),
  root = path.join(base, "Story"),
  target = path.join(base, "My Spindle.exe");
fs.mkdirSync(path.join(root, ".spindle"), { recursive: true });
fs.mkdirSync(path.join(profile, "updates"), { recursive: true });
fs.copyFileSync("release/Spindle-0.9.2-Portable-x64.exe", target);
fs.writeFileSync(
  path.join(root, "Story.yarn"),
  "title: Start\n---\nNarrator: Before update\n===\n",
);
fs.writeFileSync(
  path.join(root, ".spindle/project.json"),
  JSON.stringify({
    id: "update-story",
    name: "Update story",
    commands: [],
    files: [{ id: "story", name: "Story.yarn" }],
    excluded: [],
  }),
);
fs.writeFileSync(
  path.join(profile, "project-catalog-v1.json"),
  JSON.stringify({
    version: 1,
    entries: [
      {
        id: "update-story",
        name: "Update story",
        root,
        lastOpenedAt: 1,
        recent: true,
      },
    ],
    preferences: {
      language: "en",
      reopenLastProject: true,
      lastProjectId: "update-story",
      autoCheckUpdates: false,
    },
  }),
);
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
(async () => {
  let app;
  try {
    app = await require("./portable-test-driver.cjs").launch(pw, {
      executablePath: target,
      args: ["--user-data-dir=" + profile],
      env: process.env,
      logPath: path.join(base, "before.log"),
      timeout: 60000,
    });
    const page = await app.firstWindow();
    await page.waitForSelector(".monaco-editor");
    await page.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.insertText(" - saved before updating.");
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(2000);
    const pid = await app.evaluate(() => process.pid);
    await app.close();
    app = null;
    assert.match(
      fs.readFileSync(path.join(root, "Story.yarn"), "utf8"),
      /saved before updating/,
    );
    const oldHash = hash(target),
      source = path.resolve("release/Spindle-0.10.0-Portable-x64.exe"),
      token = crypto.randomUUID(),
      job = path.join(profile, "updates", token + ".json");
    fs.writeFileSync(
      job,
      JSON.stringify({
        target,
        source,
        sha256: hash(source),
        pid,
        profile,
        token,
        version: "0.10.0",
      }),
    );
    console.log("Starting actual Portable replacement");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve("desktop/portable-update.ps1"),
        "-JobFile",
        job,
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    let output = "";
    child.stderr.on("data", (c) => (output += c));
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(
      code,
      0,
      output +
        (fs.existsSync(job + ".error")
          ? fs.readFileSync(job + ".error", "utf8")
          : ""),
    );
    assert.equal(hash(target), hash(source));
    assert.equal(hash(target + ".previous-" + token), oldHash);
    assert.ok(fs.existsSync(path.join(profile, "updates", token + ".ready")));
    assert.match(
      fs.readFileSync(path.join(root, "Story.yarn"), "utf8"),
      /saved before updating/,
    );
    fs.writeFileSync(
      path.join(base, "results.json"),
      JSON.stringify(
        {
          replacement: true,
          backup: true,
          startupHandshake: true,
          editsPreserved: true,
          targetHash: hash(target),
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS replacement, backup, new renderer readiness and saved content",
    );
    // Close only the isolated application's window, through its normal close/save path.
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class CloseTestWindow { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l); }'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${profile.replaceAll("'", "''")}') } | ForEach-Object { $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if($p.MainWindowHandle -ne 0) { [CloseTestWindow]::PostMessage($p.MainWindowHandle,0x10,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null } }`,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    console.log(base);
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
