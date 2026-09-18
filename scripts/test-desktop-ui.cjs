// Uses an installed Playwright or PLAYWRIGHT_MODULE; Codex's bundled runtime is a fallback.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch {
  const bundled = path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  if (!fs.existsSync(bundled)) throw Error('Install Playwright or set PLAYWRIGHT_MODULE to its module path.');
  playwright = require(bundled);
}
const out = path.resolve('outputs/ui-optimization');
fs.mkdirSync(out, {recursive:true});
const profile = path.join(out, 'test-profile-' + Date.now());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = {};

(async () => {
  const app = await playwright._electron.launch({
    executablePath:path.resolve(process.env.DESKTOP_EXECUTABLE || 'release/win-unpacked/Yarn Workbench.exe'),
    args:[...(process.env.DESKTOP_APP_ENTRY?[path.resolve(process.env.DESKTOP_APP_ENTRY)]:[]),`--user-data-dir=${profile}`, '--force-device-scale-factor=1'], timeout:60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror',error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    const size = async (width,height) => { await app.evaluate(({BrowserWindow},size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),{width,height});await wait(150); };
    const shot = async name => {await wait(160);await page.screenshot({path:path.join(out,name+'.png'),scale:'css'});};
    await page.locator('.monaco-editor .view-lines').waitFor({timeout:60000});
    console.log('CHECK: editor loaded; testing titlebar, tabs and menus');
    await size(1440,900);
    assert.match(await page.title(),/Chapter_01.yarn.*Yarn Workbench/);
    assert.equal(await page.evaluate(() => typeof window.process),'undefined');
    assert.equal(await page.evaluate(() => window.yarnDesktop?.titleBarOverlay),true);
    const firstTab = await page.locator('.tab-shell').first().boundingBox();
    const plus = await page.getByRole('button',{name:'新增分頁',exact:true}).boundingBox();
    results.plusGap = plus.x - firstTab.x - firstTab.width;
    assert(results.plusGap >= 0 && results.plusGap <= 12);
    results.titlebar = await page.evaluate(() => ({header:document.querySelector('.workspace-header').getBoundingClientRect().toJSON(),overlay:navigator.windowControlsOverlay?.getTitlebarAreaRect().toJSON()}));
    assert(results.titlebar.header.width <= 1440 - 130);
    await shot('01-writing');
    await page.getByRole('button',{name:'The Last Light',exact:true}).click();
    results.menu = await page.getByRole('menu').evaluate(element => {const css=getComputedStyle(element);return {border:css.borderColor,outline:css.outlineStyle};});
    assert.equal(results.menu.border,'rgb(59, 59, 59)');
    await shot('02-menu');await page.keyboard.press('Escape');
    for(let i=0;i<9;i++)await page.getByRole('button',{name:'新增分頁',exact:true}).click();
    const checkTab = async () => {
      const bounds=await page.locator('.file-tabs').boundingBox(),active=await page.locator('.tab-shell.active').boundingBox();
      assert(active.x >= bounds.x - 1 && active.x+active.width <= bounds.x+bounds.width+1, 'Active tab and Close must be fully visible');
    };
    await checkTab();await size(800,600);await checkTab();
    await page.getByRole('button',{name:'所有開啟的分頁',exact:true}).click();
    assert.equal(await page.getByRole('menuitem').count(),10);
    await page.getByRole('menuitem').first().click();
    const second=page.locator('.tab-shell').nth(1);await second.scrollIntoViewIfNeeded();const box=await second.boundingBox();
    await page.mouse.click(box.x+2,box.y+box.height/2);
    assert.equal(await page.getByRole('tab',{name:'分頁 2：Chapter_01.yarn',exact:true}).getAttribute('data-state'),'active');
    await shot('03-narrow-tabs');results.tabs='10 tabs, overflow chooser, full active shell, padding hit target';
    await size(1440,900);
    await page.getByRole('button',{name:'The Last Light',exact:true}).click();
    console.log('CHECK: tabs passed; testing command form');
    await page.getByRole('menuitem',{name:'自訂指令',exact:true}).click();
    await page.getByRole('button',{name:/play_sound/}).click();
    const checkbox=page.getByRole('checkbox').first();
    await checkbox.uncheck();
    await page.waitForFunction(()=>document.querySelector('[role=checkbox]')?.getAttribute('data-state')==='unchecked');
    await page.mouse.move(1100,750);
    await wait(200);
    results.checkbox=await checkbox.evaluate(element=>{const css=getComputedStyle(element);return {border:css.borderWidth,color:css.borderColor,bg:css.backgroundColor};});
    assert.equal(results.checkbox.border,'1px');
    assert.notEqual(results.checkbox.color,'rgba(0, 0, 0, 0)');
    assert((await page.locator('.command-detail').boundingBox()).width>600,'Wide command form must use the available content width');
    await shot('04-command-form');
    await size(800,600);
    assert((await page.locator('.command-detail').boundingBox()).width>300,'Narrow command form must not shrink to min-content');
    await shot('04b-command-narrow');await size(1440,900);
    await page.getByRole('button',{name:'刪除指令',exact:true}).click();
    await shot('05-delete-dialog');
    const modalButtons=await page.getByRole('alertdialog').getByRole('button').evaluateAll(elements=>elements.map(e=>({label:e.textContent,bg:getComputedStyle(e).backgroundColor})));
    assert.notEqual(modalButtons[0].bg,modalButtons.at(-1).bg);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('textbox',{name:'指令名稱',exact:true}).fill('123 invalid');
    await page.locator('.tab-shell.active .tab-close').click();
    await page.getByRole('alertdialog').getByRole('button',{name:'儲存',exact:true}).click();
    await page.getByRole('alertdialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='指令名稱');
    assert.equal(await page.getByRole('textbox',{name:'指令名稱',exact:true}).inputValue(),'123 invalid');
    await shot('05b-command-validation');results.commandValidation='Failed close-save reveals and focuses invalid field, preserving draft';
    // Discard isolated draft through the existing UI before loading the graph fixture.
    await page.locator('.tab-shell.active .tab-close').click();
    if(await page.getByRole('alertdialog').isVisible())await page.getByRole('button',{name:'捨棄',exact:true}).click();
    const long='LongSceneName_That_Should_Remain_Identifiable_With_An_Ellipsis';
    const text=`title: Start\n---\n主角：長摘要測試，這段內容必須按完整行截斷，不能在半行消失。\n-> 第一條很長很長的選項標籤，用來檢查分支閱讀\n    <<jump ${long}>>\n-> 第二條同目標選項\n    <<jump ${long}>>\n<<jump Start>>\n<<jump MissingTarget>>\n<<jump {$next}>>\n<<jump ExternalScene>>\n===\n\ntitle: ${long}\ntags: extremely_long_metadata_tag another\n---\n另一個場景\n<<jump Start>>\n===\n`;
    await page.locator('input[type=file]').setInputFiles({name:'UI-review.yarn-workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'yarn-workbench',version:1,name:'UI 回歸測試',commands:[],files:[{name:'Main.yarn',text},{name:'External.yarn',text:'title: ExternalScene\n---\n跨檔場景\n===\n'},{name:'Empty.yarn',text:''}]}))});
    await page.getByRole('button',{name:'取代並開啟',exact:true}).click();
    await page.locator('.monaco-editor .view-lines').waitFor();
    console.log('CHECK: controls passed; testing graph fixture');
    await page.getByRole('tab',{name:'故事流程',exact:true}).click();
    await page.locator('.flow-card').first().waitFor();await wait(400);
    assert.equal(await page.locator('.flow-card').count(),5);
    for(const kind of ['external','missing','dynamic'])assert.equal(await page.locator('.flow-card--'+kind).count(),1);
    await page.getByRole('button',{name:'適應全部',exact:true}).click();await wait(300);
    await shot('06-graph-overview');
    const branches=page.getByRole('button',{name:/2 個分支/});assert.equal(await branches.count(),1);await branches.click();
    assert.equal(await page.getByRole('complementary',{name:'連結詳情'}).getByRole('listitem').count(),2);
    await shot('07-graph-branches');await page.getByRole('button',{name:'關閉連結詳情',exact:true}).click();
    await page.locator('.flow-card--scene').first().click();
    assert.equal(await page.locator('.flow-selection-action').count(),1);
    await page.locator('.react-flow__pane').click({position:{x:5,y:5}});
    assert.equal(await page.locator('.flow-selection-action').count(),0);
    const positions=()=>page.locator('.react-flow__node').evaluateAll(elements=>elements.map(e=>({id:e.dataset.id,transform:e.style.transform})));
    const previous=await positions();await page.getByRole('button',{name:'自動整理',exact:true}).click();
    await page.getByRole('button',{name:'復原布局',exact:true}).click();assert.deepEqual(await positions(),previous);
    await size(800,600);await page.getByRole('button',{name:'適應全部',exact:true}).click();await wait(300);await shot('08-graph-narrow');
    assert.match(await page.locator('.flow-zoom-value').innerText(),/\d+%/);
    results.graph='Kinds, bundled branches, cleared selection, layout undo, zoom, wide/narrow';
    await page.locator('.file-row[title="Empty.yarn"]').click();
    await page.getByRole('tab',{name:'故事流程',exact:true}).click();
    await page.locator('.flow-empty').waitFor();assert.equal(await page.locator('.flow-navigation').count(),0);
    await shot('09-empty-graph');await page.locator('.flow-empty').getByRole('button',{name:'建立場景',exact:true}).click();
    const sceneName=page.getByRole('textbox',{name:'場景名稱',exact:true});await sceneName.fill('bad name');
    await page.getByRole('dialog').getByRole('button',{name:'建立場景',exact:true}).click();assert.equal(await sceneName.getAttribute('aria-invalid'),'true');
    await shot('10-field-error');await page.getByRole('button',{name:'取消',exact:true}).click();
    await size(1440,900);await page.locator('.file-row[title="Main.yarn"]').click();
    await page.getByRole('tab',{name:'撰寫',exact:true}).click();
    await page.locator('.monaco-editor .view-lines').click({button:'right',position:{x:180,y:70}});
    await page.locator('.monaco-menu-container').waitFor();await shot('11-editor-menu');
    results.editorMenu=await page.locator('.monaco-menu-container').innerText();assert(!results.editorMenu.includes('Command Palette'));
    await page.keyboard.press('Escape');
    await page.locator('.monaco-editor textarea').first().focus();
    const currentText=()=>page.evaluate(()=>window.monaco.editor.getModels().find(m=>m.uri.path.endsWith('/Main.yarn')).getValue());
    const beforeUndo=await currentText();
    await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// undo-probe\n');
    await page.waitForFunction(()=>window.monaco.editor.getModels().some(m=>m.getValue().includes('undo-probe')));
    const typed=await currentText();
    // Monaco groups typing by words/edit boundaries, not by automation call.
    for(let i=0;i<30&&(await currentText())!==beforeUndo;i++){await page.keyboard.press('Control+z');await wait(25);}
    assert.equal(await currentText(),beforeUndo);
    for(let i=0;i<30&&(await currentText())!==typed;i++){await page.keyboard.press('Control+y');await wait(25);}
    assert.equal(await currentText(),typed);
    for(let i=0;i<30&&(await currentText())!==beforeUndo;i++){await page.keyboard.press('Control+z');await wait(25);}
    assert.equal(await currentText(),beforeUndo);
    results.undo='Ctrl+Z / Ctrl+Y preserve the complete text across grouped undo/redo';
    await page.locator('.monaco-editor textarea').first().focus();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// UI regression persistence\n');await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('yarn-workbench.documents.v1')).some(d=>d.saved.includes('UI regression persistence')));
    await page.reload();await page.locator('.monaco-editor .view-lines').waitFor();
    assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('yarn-workbench.documents.v1')).some(d=>d.saved.includes('UI regression persistence'))));
    assert.deepEqual(errors,[]);results.errors=errors;results.persistence='saved content survives reload';results.passed=true;
    fs.writeFileSync(path.join(out,'desktop-ui-results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
    if(process.env.NATIVE_AUDIT==='1'){
      const done=path.join(out,'native-done');
      if(fs.existsSync(done))fs.unlinkSync(done);
      console.log('READY: native titlebar verification');
      const until=Date.now()+600000;
      while(!fs.existsSync(done)&&Date.now()<until)await wait(300);
      results.nativeWindow=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {bounds:w.getBounds(),maximized:w.isMaximized(),title:w.getTitle()};});
      fs.writeFileSync(path.join(out,'desktop-ui-results.json'),JSON.stringify(results,null,2));
    }
  } catch(error) {
    fs.writeFileSync(path.join(out,'desktop-ui-results.json'),JSON.stringify({...results,passed:false,error:error.message,errors},null,2));
    try{await (await app.firstWindow()).screenshot({path:path.join(out,'failure.png')});}catch{}
    throw error;
  } finally { await app.evaluate(({app})=>app.exit(0)).catch(()=>{}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
