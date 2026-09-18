import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), out=path.resolve('outputs/navigation-tests');
fs.mkdirSync(out,{recursive:true});
function load(entry){ const target=path.join(out,path.basename(entry)+'.cjs');buildSync({entryPoints:[entry],outfile:target,bundle:true,platform:'node',format:'cjs'});return require(target); }
const {navigateSession,navigateHistory}=load('app/workspace/navigation.ts');
const {orderedDocuments,uniqueDocumentName,reorderWithinFolder}=load('app/workspace/file-order.ts');
const {defaultSession,makeDocument}=load('app/workspace/types.ts');
const {restoreSession}=load('app/workspace/storage.ts');
const {WorkspaceService}=load('desktop/workspace-service.ts');
const {parse}=load('app/parser.ts');
const tab=(id,documentId,extra={})=>({id,documentId,mode:'rendered',line:1,column:1,...extra});
const session=(tabs,activeId=tabs[0]?.id)=>({...defaultSession('window','project'),tabs,activeId});
test('ordinary navigation keeps pinned active TabId even when destination exists in another tab',()=>{
 const a=tab('one','a',{pinned:true,line:12}), b=tab('two','b',{mode:'graph',line:20});
 const next=navigateSession(session([a,b]),'b',{},'unused');
 assert.equal(next.activeId,'one');assert.equal(next.tabs.length,2);assert.deepEqual(next.tabs[1],b);assert.equal(next.tabs[0].documentId,'b');assert.equal(next.tabs[0].pinned,true);assert.equal(next.tabs[0].mode,'rendered');
});
test('same-document outline and explicit new view never select an existing duplicate',()=>{
 const s=session([tab('first','a',{line:4}),tab('second','a',{line:25})],'second');
 const next=navigateSession(s,'a',{line:40},'unused');
 assert.equal(next.activeId,'second');assert.equal(next.tabs[0].line,4);assert.equal(next.tabs[1].line,40);
 const explicit=navigateSession(next,'a',{newTab:true},'third');assert.equal(explicit.tabs.length,3);assert.equal(explicit.activeId,'third');
});
test('each tab has independent back/forward and per-document reading/graph positions',()=>{
 const a=tab('one','a',{line:10,scrollTop:120,folded:[{from:2,to:8}],graph:{positions:{a:{x:2,y:3}}}});
 let s=session([a,tab('two','b',{line:90})]);
 s=navigateSession(s,'b',{line:8},'unused');
 assert.deepEqual(s.tabs[0].views.a.folded,a.folded);
 s={...s,activeId:'two'};assert.equal(navigateHistory(s,true,new Set(['a','b'])),s);
 s=navigateSession(s,'c',{line:33},'unused');
 s={...s,activeId:'one'};s=navigateHistory(s,true,new Set(['a','b','c']));
 assert.equal(s.activeId,'one');assert.equal(s.tabs[0].documentId,'a');assert.equal(s.tabs[0].scrollTop,120);assert.deepEqual(s.tabs[0].folded,a.folded);assert.equal(s.tabs[1].documentId,'c');
 s=navigateHistory(s,false,new Set(['a','b','c']));assert.equal(s.tabs[0].documentId,'b');assert.equal(s.tabs[0].line,8);
 s=navigateSession(s,'a',{},'unused');assert.equal(s.tabs[0].line,10);assert.deepEqual(s.tabs[0].graph,a.graph);
});
test('navigation history skips deleted files and a normal same-file click does not reset to line one',()=>{
 let s=session([tab('one','a',{line:50,past:[{documentId:'gone',mode:'source',line:1,column:1}]})]);
 let n=navigateSession(s,'a',{},'unused');assert.equal(n.tabs[0].line,50);assert.equal(n.tabs[0].past.length,1);
 n=navigateHistory(n,true,new Set(['a']));assert.equal(n.tabs[0].documentId,'a');assert.equal(n.tabs[0].past.length,0);
});
test('sorting is reversible, natural, and does not overwrite manual order; drag only reorders one folder',()=>{
 const ds=['part/Chapter10.yarn','B.yarn','part/Chapter2.yarn','A.yarn'].map(name=>makeDocument(name,''));
 const original=ds.map(d=>d.id);assert.deepEqual(orderedDocuments(ds,'name-asc').map(d=>d.name),['A.yarn','B.yarn','part/Chapter2.yarn','part/Chapter10.yarn']);
 assert.deepEqual(orderedDocuments(ds,'name-desc').map(d=>d.name),['part/Chapter10.yarn','part/Chapter2.yarn','B.yarn','A.yarn']);assert.deepEqual(ds.map(d=>d.id),original);
 assert.deepEqual(reorderWithinFolder(ds,ds[2].id,ds[0].id),[ds[2].id,ds[1].id,ds[0].id,ds[3].id]);
 assert.deepEqual(reorderWithinFolder(ds,ds[1].id,ds[0].id),original);
 assert.equal(uniqueDocumentName([makeDocument('part/untitled.yarn','')],'part'),'Untitled 2.yarn');
});
test('layout restores sort, bounded panel sizes and per-tab history/view state',()=>{
 const s={...session([tab('one','a',{views:{b:{mode:'source',line:20,column:2}},past:[{documentId:'b',mode:'source',line:20,column:2}]})]),fileSortByProject:{project:'name-desc',bad:'no'},rightPanelWidth:999,problemsHeight:20};
 const r=restoreSession(s,'window','project');assert.deepEqual(r.fileSortByProject,{project:'name-desc'});assert.equal(r.rightPanelWidth,420);assert.equal(r.problemsHeight,90);assert.equal(r.tabs[0].views.b.line,20);assert.equal(r.tabs[0].past[0].documentId,'b');
});
function fixture(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'yarn-navigation-')),root=path.join(base,'project');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'A.yarn'),'\ufefftitle: Start\r\n---\r\nHello\r\n===\r\n');fs.writeFileSync(path.join(root,'B.yarn'),'title: Other\n---\n<<jump Start>>\n===\n');const services={chooseFolder:async()=>root,chooseFiles:async()=>[],saveDialog:async()=>null,reveal(){},changed(){}};return {base,root,services,service:new WorkspaceService(path.join(base,'profile'),services)};}
test('scene create validates current project/version, preserves CRLF/BOM, shares Undo and rename references',async()=>{
 const {base,service}=fixture();try{const p=(await service.request({type:'openFolder'})).snapshot.projects[0],d=p.documents.find(d=>d.name==='A.yarn'),before=d.text;
 await assert.rejects(service.request({type:'createScene',projectId:p.id,documentId:d.id,version:999,name:'NewScene'}),/變更/);
 await assert.rejects(service.request({type:'createScene',projectId:p.id,documentId:d.id,version:d.version,name:'Other'}),/同名/);
 await service.request({type:'createScene',projectId:p.id,documentId:d.id,version:d.version,name:'NewScene'});
 const current=service.engine.document(p.id,d.id);assert.equal(current.text.startsWith('\ufeff'),true);assert.equal(/(?<!\r)\n/.test(current.text),false);assert.equal(parse(service.engine.project(p.id).documents,[]).nodes.some(n=>n.name==='NewScene'),true);
 await service.request({type:'undo',projectId:p.id,documentId:d.id});assert.equal(service.engine.document(p.id,d.id).text,before);
 await service.request({type:'renameScene',projectId:p.id,documentId:d.id,version:service.engine.document(p.id,d.id).version,fromName:'Start',name:'Opening'});
 assert.match(service.engine.project(p.id).documents.find(d=>d.name==='B.yarn').text,/jump Opening/);
 await service.request({type:'undo',projectId:p.id,documentId:d.id});assert.match(service.engine.project(p.id).documents.find(d=>d.name==='B.yarn').text,/jump Start/);
 }finally{service.dispose();fs.rmSync(base,{recursive:true,force:true});}
});
test('failed exclusive disk create leaves no phantom draft or overwritten file',async()=>{
 const {base,root,service}=fixture();try{const p=(await service.request({type:'openFolder'})).snapshot.projects[0];fs.writeFileSync(path.join(root,'occupied.yarn'),'external');
 await assert.rejects(service.request({type:'createDocument',projectId:p.id,name:'occupied.yarn',text:'new'}));
 assert.equal(service.engine.project(p.id).documents.some(d=>d.name==='occupied.yarn'),false);assert.equal(fs.readFileSync(path.join(root,'occupied.yarn'),'utf8'),'external');
 }finally{service.dispose();fs.rmSync(base,{recursive:true,force:true});}
});
test('manual project order survives opening from a separate fresh profile',async()=>{
 const {base,service,services}=fixture();let second;try{const p=(await service.request({type:'openFolder'})).snapshot.projects[0];await service.request({type:'sortDocuments',projectId:p.id,documentIds:[...p.documents].reverse().map(d=>d.id)});second=new WorkspaceService(path.join(base,'profile2'),services);const loaded=(await second.request({type:'openFolder'})).snapshot.projects[0];assert.deepEqual(loaded.documents.map(d=>d.name),['B.yarn','A.yarn']);}
 finally{service.dispose();second?.dispose();fs.rmSync(base,{recursive:true,force:true});}
});
