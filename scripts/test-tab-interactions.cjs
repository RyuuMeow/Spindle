const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { buildSync } = require("esbuild");
const { chromium } = require("playwright");

const out = path.resolve("outputs/tab-interactions");
const root = path.resolve("dist-desktop/renderer");
fs.mkdirSync(out, { recursive: true });
buildSync({
  entryPoints: ["app/workspace/types.ts"],
  outfile: path.join(out, "types.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { makeProject, defaultSession } = require(path.join(out, "types.cjs"));
const project = makeProject(
  "Tab regression",
  ["A", "B", "C"].map((name) => ({
    name: name + ".yarn",
    text: `title: ${name}\n---\n我: 中文，標點。\n===\n`,
  })),
);
for (const document of project.documents) document.saved = document.text;
const session = {
  ...defaultSession("browser", project.id),
  activeId: "a",
  tabs: project.documents.map((d, i) => ({
    id: "abc"[i],
    documentId: d.id,
    mode: "source",
    line: 1,
    column: 1,
  })),
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." +
      new URL(req.url, "http://localhost").pathname.replace(
        /\/$/,
        "/index.html",
      ),
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
let browser;
const failures = [];
async function run(name, test, language = "zh-TW") {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ project, session, language }) => {
      if (localStorage.getItem("yarn-workbench.workspace.v2")) return;
      localStorage.setItem(
        "yarn-workbench.workspace.v2",
        JSON.stringify([project]),
      );
      localStorage.setItem(
        "yarn-workbench.session.v2",
        JSON.stringify(session),
      );
      localStorage.setItem(
        "spindle.preferences.v1",
        JSON.stringify({ language }),
      );
    },
    { project, session, language },
  );
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.tab-shell[data-tab-id="c"]').waitFor();
    await test(page);
    assert.deepEqual(errors, []);
    console.log("PASS", name);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error("FAIL", name, error.message);
    fs.writeFileSync(
      path.join(out, "failure.txt"),
      await page.locator("body").innerText(),
    );
    await page.screenshot({ path: path.join(out, "failure.png") });
  } finally {
    await page.close();
  }
}
const order = (page) =>
  page
    .locator(".tab-shell")
    .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.tabId));
const box = (page, id) => page.locator(`[data-tab-id="${id}"]`).boundingBox();
async function dragEvent(page, type, x, y, id = "c") {
  await page.evaluate(
    ({ type, x, y, id }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("application/x-yarn-tab", id);
      document
        .elementFromPoint(x, y)
        .dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer,
          }),
        );
    },
    { type, x, y, id },
  );
}
async function saved(page) {
  await page.waitForTimeout(350);
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("yarn-workbench.session.v2")),
  );
}
async function remove(page, name) {
  await page
    .getByRole("button", { name: name + ".yarn", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "移到垃圾桶", exact: true }).click();
  await page
    .getByRole("button", { name: name + ".yarn", exact: true })
    .waitFor({ state: "detached" });
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  await run(
    "leading insertion marker is inside the scroll viewport",
    async (page) => {
      const a = await box(page, "a");
      await dragEvent(page, "dragover", a.x + 2, a.y + 15);
      await page.locator('[data-tab-id="a"].tab-drop-before').waitFor();
      const visible = await page
        .locator('[data-tab-id="a"]')
        .evaluate((tab) => {
          const style = getComputedStyle(tab, "::before");
          const left =
            tab.getBoundingClientRect().left +
            tab.clientLeft +
            parseFloat(style.left);
          return (
            left >=
            document.querySelector(".file-tabs").getBoundingClientRect().left
          );
        });
      await page.screenshot({ path: path.join(out, "leading-marker.png") });
      assert.equal(
        visible,
        true,
        "the first insertion marker must not be clipped",
      );
    },
  );
  await run("dropping in a tab gap inserts at that gap", async (page) => {
    const a = await box(page, "a"),
      b = await box(page, "b");
    const x = (a.x + a.width + b.x) / 2,
      y = a.y + 15;
    await dragEvent(page, "dragover", x, y);
    assert.equal(
      await page.locator('[data-tab-id="b"].tab-drop-before').count(),
      1,
    );
    await dragEvent(page, "drop", x, y);
    assert.deepEqual(await order(page), ["a", "c", "b"]);
  });
  await run(
    "drop without a preview and Escape do not reorder",
    async (page) => {
      const a = await box(page, "a");
      await dragEvent(page, "drop", a.x + 2, a.y + 15);
      assert.deepEqual(await order(page), ["a", "b", "c"]);
      await dragEvent(page, "dragover", a.x + 2, a.y + 15);
      await page.locator('[data-tab-id="a"] [role=tab]').focus();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".tab-drop-before,.tab-drop-after").count(),
        0,
      );
      await dragEvent(page, "drop", a.x + 2, a.y + 15);
      assert.deepEqual(await order(page), ["a", "b", "c"]);
    },
  );
  await run(
    "native drag can move to the first and last positions",
    async (page) => {
      let a = await box(page, "a"),
        c = await box(page, "c");
      await page.mouse.move(c.x + 25, c.y + 15);
      await page.mouse.down();
      await page.mouse.move(c.x + 35, c.y + 15, { steps: 5 });
      await page.mouse.move(a.x + 2, a.y + 15, { steps: 15 });
      await page.mouse.up();
      assert.deepEqual(await order(page), ["c", "a", "b"]);
      c = await box(page, "c");
      const b = await box(page, "b");
      await page.mouse.move(c.x + 25, c.y + 15);
      await page.mouse.down();
      await page.mouse.move(c.x + 35, c.y + 15, { steps: 5 });
      await page.mouse.move(b.x + b.width - 2, b.y + 15, { steps: 15 });
      await page.mouse.up();
      assert.deepEqual(await order(page), ["a", "b", "c"]);
    },
  );
  await run(
    "delete returns to tab history; duplicate without history becomes blank",
    async (page) => {
      await page.getByRole("button", { name: "B.yarn", exact: true }).click();
      await remove(page, "B");
      assert.deepEqual(await order(page), ["a", "b", "c"]);
      let s = await saved(page);
      assert.equal(s.activeId, "a");
      assert.equal(s.tabs[0].documentId, project.documents[0].id);
      assert.equal(s.tabs[1].documentId, "");
      await page.locator('[data-tab-id="b"] [role=tab]').click();
      await page.locator(".empty-editor").waitFor();
      await page.getByRole("button", { name: "C.yarn", exact: true }).click();
      s = await saved(page);
      assert.equal(s.tabs[1].documentId, project.documents[2].id);
      assert.equal(
        s.tabs[1].past.some((location) => !location.documentId),
        false,
      );
      await page.reload();
      await page.locator('[data-tab-id="c"]').waitFor();
      assert.deepEqual(await order(page), ["a", "b", "c"]);
    },
  );
  await run(
    "Chinese punctuation does not trigger Unicode warnings",
    async (page) => {
      await page.locator(".monaco-editor .view-lines").waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.locator(".unicode-highlight").count(), 0);
    },
    "en",
  );
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify({ failures }, null, 2),
  );
  if (failures.length) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
