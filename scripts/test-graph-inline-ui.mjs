import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { transformSync } from "esbuild";
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  );
}
const root = process.cwd(),
  out = path.join(root, "outputs/graph-inline-edit");
fs.mkdirSync(out, { recursive: true });
const fixture = `
import React,{useState,useRef} from 'react';import{ChangeSet}from'@codemirror/state';import{createRoot}from'react-dom/client';import Graph from '@/app/Graph';import{parse}from'@/app/parser';import{DocumentEngine}from'@/app/workspace/engine';import{renamedScene}from'@/app/workspace/authoring';import '@/app/globals.css';
document.addEventListener('keydown',e=>{window.keyEvents=window.keyEvents||[];window.keyEvents.push({key:e.key,shift:e.shiftKey,ctrl:e.ctrlKey})},true);
const initial='\\ufefftitle: Start\\r\\n---\\r\\nMira: Hello\\r\\n<<play_sound "wind" 0.6>>\\r\\n<<jump External>>\\r\\n===\\r\\n\\r\\ntitle: End\\r\\n---\\r\\nMira: Untouched\\r\\n===\\r\\n';
const docs=[{id:'main',name:'main.yarn',text:initial,saved:initial,version:0,status:'draft'},{id:'other',name:'folder/other.yarn',text:'title: External\\n---\\nNarrator: Away\\n===\\n',saved:'',version:0,status:'draft'}];
const engine=new DocumentEngine([{id:'p',name:'Test',documents:docs,commands:[],excluded:[],recovery:[]}]);
function App(){const[tick,update]=useState(0),[selected,setSelected]=useState(''),[graphState,setGraphState]=useState({});const p=engine.project('p');const documents=p.documents.map(d=>({...d}));const analysis=parse(documents,[]);window.texts=Object.fromEntries(documents.map(d=>[d.id,d.text]));window.tick=tick;window.remote=(id,text)=>{engine.replace('p',id,text,'External');update(x=>x+1)};
return <div style={{display:'flex',height:'100vh',width:'100vw'}}><Graph file='main.yarn' allNodes={analysis.nodes} links={analysis.links} issues={analysis.issues} selected={selected} onSelect={n=>setSelected(n?.id||'')} onOpen={()=>window.navigated=true} onCreate={()=>{}} focus={0} graphState={graphState} onGraphState={next=>{window.graphState=next;setGraphState(next)}} documents={documents} commands={[{name:'play_sound',description:'Sound',params:[],example:''}]} onDocumentEdit={(id,edits,expected)=>{const d=engine.document('p',id);if(window.rejectNext||d.text!==expected){window.rejectNext=false;return false}engine.edit('p',id,d.version,[{clientID:'ui-test',changes:ChangeSet.of(edits,d.text.length,'\\n').toJSON()}]);update(x=>x+1);return true}} onDocumentUndo={(id,redo)=>{window.undoEvents=window.undoEvents||[];window.undoEvents.push({redo,before:engine.document('p',id).text});engine.undo('p',id,redo);window.undoEvents.at(-1).after=engine.document('p',id).text;update(x=>x+1)}} onDocumentComposition={(id,active)=>{window.composing=active}} onRenameScene={async(node,name,expected)=>{const d=p.documents.find(d=>d.name===node.file);if(d.text!==expected)return false;const change=renamedScene(p,node,name);engine.transaction('p','rename',change.documents);update(x=>x+1);return true}} /></div>}
createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({
  configFile: false,
  cacheDir: path.join(out, "vite-cache"),
  root: path.join(root, "desktop"),
  optimizeDeps: {
    entries: [],
    include: [
      "react",
      "react-dom/client",
      "@xyflow/react",
      "lucide-react",
      "radix-ui",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/collab",
      "clsx",
      "tailwind-merge",
    ],
  },
  resolve: { alias: { "@": root } },
  plugins: [
    react(),
    {
      name: "graph-inline-fixture",
      resolveId(id) {
        if (id === "/inline.tsx") return "\0inline.tsx";
      },
      load(id) {
        if (id === "\0inline.tsx")
          return transformSync(fixture, { loader: "tsx", jsx: "automatic" })
            .code;
      },
      configureServer(instance) {
        instance.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/") return next();
          try {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await instance.transformIndexHtml(
                "/",
                '<html class="dark"><body><div id="root"></div><script type="module" src="/inline.tsx"></script></body></html>',
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
try {
  await server.listen();
  browser = await playwright.chromium.launch({
    headless: true,
    channel: "msedge",
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0], {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByText("Start", { exact: true }).waitFor();
  await page.waitForTimeout(400);
  const original = await page.evaluate(() => window.texts.main);
  const positions = await page
    .locator(".react-flow__node")
    .evaluateAll((nodes) =>
      Object.fromEntries(nodes.map((n) => [n.dataset.id, n.style.transform])),
    );
  await page
    .locator(".flow-card-title")
    .filter({ hasText: /^Start$/ })
    .dblclick();
  await page.getByRole("textbox", { name: "場景內容", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.navigated), undefined);
  assert.ok(
    (await page.evaluate(() => window.graphState.viewport.zoom)) >= 0.9,
  );
  results.inlineEntryAndReadableZoom = true;
  const content = page.getByRole("textbox", { name: "場景內容", exact: true });
  await content.evaluate((el) => (window.originalEditor = el));
  await content.fill(
    'Mira: Changed\n<<play_sound "rain" 0.8>>\n<<jump External>>\n',
  );
  await page.waitForFunction(() => window.texts.main.includes("Changed"));
  assert.ok(
    (await page.evaluate(() => window.texts.main)).includes(
      "Mira: Changed\r\n",
    ),
  );
  assert.ok(
    (await page.evaluate(() => window.texts.main)).includes("Mira: Untouched"),
  );
  assert.ok(
    (await page.evaluate(() => window.texts.main)).startsWith("\ufeff"),
  );
  await content.press("Control+z");
  await page.waitForFunction(
    (expected) => window.texts.main === expected,
    original,
  );
  await content.press("Control+Shift+Z");
  await page.waitForFunction(() => window.texts.main.includes("Changed"));
  results.continuousEditAndSharedUndo = true;
  await content.fill(
    'Mira: Incomplete\n<<jump External>>\n<<play_sound "rain"',
  );
  await page.waitForFunction(() => window.texts.main.includes("Incomplete"));
  assert.equal(
    await content.evaluate((el) => window.originalEditor === el),
    true,
  );
  const now = await page
    .locator(".react-flow__node")
    .evaluateAll((nodes) =>
      Object.fromEntries(nodes.map((n) => [n.dataset.id, n.style.transform])),
    );
  assert.deepEqual(now, positions);
  results.invalidSyntaxAndStableLayout = true;
  await page.evaluate(() =>
    window.remote("main", "// external prefix\r\n" + window.texts.main),
  );
  await page.waitForTimeout(100);
  await content.press("Control+End");
  await page.keyboard.insertText(" 1>>");
  await page.waitForFunction(() => window.texts.main.includes('"rain" 1>>'));
  assert.ok(
    (await page.evaluate(() => window.texts.main)).startsWith(
      "// external prefix\r\n\ufeff",
    ),
  );
  results.remoteOffsetMapping = true;
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("textbox", { name: "場景名稱", exact: true })
    .fill("Opening");
  await page
    .getByRole("textbox", { name: "場景名稱", exact: true })
    .press("Enter");
  await page.waitForFunction(() =>
    window.texts.main.includes("title: Opening"),
  );
  assert.equal(
    await content.evaluate((el) => window.originalEditor === el),
    true,
  );
  results.renameKeepsEditor = true;
  await page.screenshot({ path: path.join(out, "inline-1440.png") });
  await content.press("Escape");
  await page
    .getByRole("textbox", { name: "場景內容", exact: true })
    .waitFor({ state: "detached" });
  await page.getByRole("button", { name: "適應全部", exact: true }).click();
  await page.waitForTimeout(250);
  await page
    .locator(".flow-card-title")
    .filter({ hasText: /^External$/ })
    .dblclick();
  await page
    .getByRole("textbox", { name: "場景內容", exact: true })
    .fill("Narrator: Changed in other file\n");
  await page.waitForFunction(() =>
    window.texts.other.includes("Changed in other file"),
  );
  assert.equal(await page.evaluate(() => window.navigated), undefined);
  results.crossFileWithoutNavigation = true;
  await page.evaluate(() => (window.rejectNext = true));
  await page
    .getByRole("textbox", { name: "場景內容", exact: true })
    .press("Control+End");
  await page.keyboard.insertText("UNSENT");
  await page
    .getByRole("alert")
    .filter({ hasText: "此次輸入尚未提交" })
    .waitFor();
  assert.match(await content.innerText(), /UNSENT/);
  assert.equal(
    (await page.evaluate(() => window.texts.other)).includes("UNSENT"),
    false,
  );
  results.rejectedEditPreserved = true;
  assert.ok(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        key.startsWith("yarn-workbench.graph-pending.v1:"),
      ),
    ),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(".flow-card-title")
    .filter({ hasText: /^External$/ })
    .dblclick();
  await page
    .getByRole("alert")
    .filter({ hasText: "已找回上次未提交" })
    .waitFor();
  assert.match(
    await page
      .getByRole("textbox", { name: "場景內容", exact: true })
      .innerText(),
    /UNSENT/,
  );
  await page
    .getByRole("button", { name: "捨棄未提交內容並結束", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        key.startsWith("yarn-workbench.graph-pending.v1:"),
      ),
    ),
    false,
  );
  results.pendingDraftSurvivesReload = true;
  assert.deepEqual(errors, []);
  results.errors = errors;
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, "failure.png") });
  results.failure = String(error);
  results.errors = errors;
  results.debug = await page.evaluate(() => ({
    texts: window.texts,
    undo: window.undoEvents,
    keys: window.keyEvents,
    focus: document.activeElement?.outerHTML,
    body: document.querySelector(".flow-scene-editor")?.textContent,
  }));
  throw error;
} finally {
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  await browser?.close();
  await server.close();
}
