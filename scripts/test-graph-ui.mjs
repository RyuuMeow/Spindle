import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  );
}
const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "outputs/graph-redesign");
fs.mkdirSync(out, { recursive: true });
const fixture = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Graph from '@/app/Graph';
import {parse} from '@/app/parser';
import {initialDocs,initialCommands} from '@/scripts/fixtures/sample';
import '@/app/globals.css';
const analysis=parse(initialDocs,initialCommands);
function App(){const [selected,setSelected]=useState('');const [graphState,setGraphState]=useState(()=>location.search.includes('saved')?{viewport:{x:73,y:49,zoom:.85}}:{});return React.createElement('div',{style:{display:'flex',height:'100vh',width:'100vw'}},React.createElement(Graph,{file:'Chapter_01.yarn',allNodes:analysis.nodes,links:analysis.links,issues:analysis.issues,selected,onSelect:n=>setSelected(n?.id||''),onOpen:n=>window.lastSource={file:n.file,line:n.body},onCreate:()=>{},onGoTo:(file,line)=>window.lastSource={file,line},focus:0,graphState,onGraphState:next=>{setGraphState(next);window.graphState=next}}))}
createRoot(document.getElementById('root')).render(React.createElement(App));`;
const server = await createServer({
  configFile: false,
  root: path.join(root, "desktop"),
  optimizeDeps: {
    entries: [],
    include: [
      "react",
      "react-dom/client",
      "@xyflow/react",
      "lucide-react",
      "radix-ui",
    ],
  },
  resolve: { alias: { "@": root } },
  plugins: [
    react(),
    {
      name: "graph-review-fixture",
      resolveId(id) {
        if (id === "/graph-fixture.tsx") return "\0graph-fixture.tsx";
      },
      load(id) {
        if (id === "\0graph-fixture.tsx") return fixture;
      },
      configureServer(instance) {
        instance.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/") return next();
          try {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await instance.transformIndexHtml(
                "/",
                '<html class="dark"><body><div id="root"></div><script type="module" src="/graph-fixture.tsx"></script></body></html>',
              ),
            );
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser, page;
const results = {},
  errors = [];
async function waitForBounds() {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".flow-card").length === 6 &&
      [
        ...document.querySelectorAll(
          ".flow-card,.flow-edge-label,.react-flow__edge-path",
        ),
      ].every((element) => {
        const r = element.getBoundingClientRect();
        return (
          r.left >= 24 &&
          r.right <= innerWidth - 24 &&
          r.top >= 24 &&
          r.bottom <= innerHeight - 24
        );
      }),
  );
}
try {
  await server.listen();
  browser = await playwright.chromium.launch({
    headless: true,
    channel: "msedge",
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".flow-card").first().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".flow-card").length === 6 &&
      [...document.querySelectorAll(".flow-card,.flow-edge-label")].every(
        (element) => {
          const r = element.getBoundingClientRect();
          return (
            r.left >= 24 &&
            r.right <= innerWidth - 24 &&
            r.top >= 24 &&
            r.bottom <= innerHeight - 24
          );
        },
      ),
  );
  results.initialFitIncludesReturnRoutes = true;
  await page.getByTitle("回到 100%", { exact: true }).click();
  const heights = await page.locator(".flow-card").evaluateAll((cards) =>
    cards.map((card) => ({
      kind: card.className,
      height: card.getBoundingClientRect().height,
    })),
  );
  assert.ok(heights.every((card) => card.height < 145));
  assert.ok(
    heights
      .filter((card) => card.kind.includes("--external"))
      .every((card) => card.height < 85),
  );
  assert.equal(
    await page
      .locator(".flow-card-meta,.flow-toolbar,.flow-readonly-note")
      .count(),
    0,
  );
  await page.getByRole("button", { name: "適應全部", exact: true }).click();
  await waitForBounds();
  await page.screenshot({ path: path.join(out, "overview-1440.png") });
  results.compactGeometry = heights;
  await page.getByRole("button", { name: "找場景", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "圖內搜尋場景",
    exact: true,
  });
  await search.fill("art");
  assert.equal(await page.locator(".flow-find-results>button").count(), 2);
  await search.press("ArrowUp");
  assert.match(
    await page.locator(".flow-find-results>button.is-active").innerText(),
    /Departure/,
  );
  await search.press("Enter");
  assert.match(
    await page.locator(".flow-find-results>button.is-active").innerText(),
    /Start/,
  );
  await search.fill("no-such-scene");
  assert.match(
    await page.locator(".flow-find-results").innerText(),
    /沒有符合/,
  );
  await search.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "找場景", exact: true })
      .evaluate((button) => button === document.activeElement),
    true,
  );
  results.sceneSearch = true;
  await page.getByRole("button", { name: "適應全部", exact: true }).click();
  await page.locator(".flow-card--scene").first().click();
  assert.equal(
    await page.getByRole("complementary", { name: "圖表詳情" }).count(),
    0,
  );
  await page.getByRole("button", { name: "圖表詳情", exact: true }).click();
  assert.match(
    await page.locator(".flow-connection-detail").innerText(),
    /opening/,
  );
  await page.getByRole("button", { name: "關閉圖表詳情", exact: true }).click();
  const conditional = page
    .locator(".flow-edge-focus")
    .filter({ has: page.locator("path") });
  const conditionalEdge = page
    .getByRole("button", { name: /轉場，若.*has_key/ })
    .first();
  await conditionalEdge.focus();
  await conditionalEdge.press("Enter");
  assert.match(
    await page.locator(".flow-connection-detail").innerText(),
    /若 has_key/,
  );
  await page.screenshot({ path: path.join(out, "condition-detail-1440.png") });
  assert.ok((await conditional.count()) > 0);
  results.explicitDetailsAndKeyboardEdges = true;
  await page.getByRole("button", { name: "關閉圖表詳情", exact: true }).click();
  await page.setViewportSize({ width: 800, height: 650 });
  await page.getByRole("button", { name: "適應全部", exact: true }).click();
  await waitForBounds();
  await page.screenshot({ path: path.join(out, "overview-800.png") });
  const controls = await page.locator(".flow-navigation").boundingBox();
  assert.ok(controls.x >= 0 && controls.x + controls.width <= 800);
  results.narrowControls = true;
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".flow-card").length === 6 &&
      [...document.querySelectorAll(".flow-card,.flow-edge-label")].every(
        (element) => {
          const r = element.getBoundingClientRect();
          return (
            r.left >= 24 &&
            r.right <= innerWidth - 24 &&
            r.top >= 24 &&
            r.bottom <= innerHeight - 24
          );
        },
      ),
  );
  results.narrowInitialFit = true;
  await page.goto(server.resolvedUrls.local[0] + "?saved=1");
  await page.waitForFunction(
    () => document.querySelector(".flow-zoom-value")?.textContent === "85%",
  );
  const restored = await page
    .locator(".react-flow__viewport")
    .evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    });
  assert.deepEqual(restored, { x: 73, y: 49, zoom: 0.85 });
  results.savedViewportPreserved = true;
  assert.deepEqual(errors, []);
  results.passed = true;
} catch (error) {
  results.error = String(error.stack || error);
  if (page)
    await page
      .screenshot({ path: path.join(out, "failure.png"), timeout: 3000 })
      .catch((error) => {
        results.screenshotError = String(error);
      });
  process.exitCode = 1;
} finally {
  results.errors = errors;
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  await browser?.close();
  await server.close();
}
