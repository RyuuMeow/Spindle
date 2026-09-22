import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
const output = 'outputs/tests/search.cjs';
fs.mkdirSync('outputs/tests', {recursive:true});
buildSync({entryPoints:['app/workspace/search.ts'],outfile:output,bundle:true,platform:'node',format:'cjs'});
const require = createRequire(import.meta.url);
const {projectSearch} = require('../'+output);
const doc = (id,name,text) => ({id,name,text,version:0,status:'draft'});
test('search preserves source line and column through CRLF and BOM', () => {
  const input = doc('one','a.yarn','\uFEFFtitle: Harbor\r\n---\r\nMira: welcome home\r\n===');
  const {hits,total} = projectSearch([input], 'welcome', 'content');
  assert.equal(total,1);
  assert.deepEqual(hits[0],{documentId:'one',file:'a.yarn',line:3,column:7,text:'Mira: welcome home',scene:'Harbor',kind:'content'});
});
test('same filenames in different folders retain document identity and paths', () => {
  const items=[doc('one','north/Shop.yarn','Merchant: Hello'),doc('two','south/Shop.yarn','Merchant: Hello')];
  assert.deepEqual(projectSearch(items,'shop','files').hits.map(h=>[h.documentId,h.file]),[['one','north/Shop.yarn'],['two','south/Shop.yarn']]);
  assert.equal(projectSearch(items,'Merchant','files').total,0);
  assert.equal(projectSearch(items,'Merchant','content').total,2);
});
test('file scope and empty content search support lightweight document picking', () => {
  const items=[doc('one','Chapter.yarn','hello'),doc('two','Shop.yarn','goodbye')];
  assert.equal(projectSearch(items,'   ','content').hits.length,2);
  assert.equal(projectSearch(items,' CHAPTER ','files').hits[0].documentId,'one');
});
test('result cap limits rendering without losing the total or source identity', () => {
  const item=doc('long','story.yarn',Array.from({length:180},(_,i)=>`Mira: hello ${i}`).join('\n'));
  const result=projectSearch([item],'hello','content');
  assert.equal(result.total,180); assert.equal(result.hits.length,150);
  assert.equal(result.hits[149].line,150);
});
test('snippets follow the current scene and match case-insensitively', () => {
  const item=doc('one','story.yarn','title: One\n---\nMira: HELLO\n===\ntitle: Two\n---\nMira: hello\n===');
  assert.deepEqual(projectSearch([item],'hello','content').hits.map(hit=>[hit.scene,hit.line]),[['One',3],['Two',7]]);
});

const {paletteSearch,validDocumentName} = require('../'+output);
test('palette mixes destinations without losing document locations',()=>{
 const base={documents:[doc('one','a.yarn','Mira: font')],commands:[{name:'font_size'}],settings:[{id:'fontSize',section:'reading',field:'fontSize',label:'Font size',keywords:'font'}],query:'font',scope:'all',canCreate:true};
 const hits=paletteSearch(base).hits;
 assert.deepEqual(hits.map(h=>h.kind),['setting','command','document']);
 assert.equal(hits[2].hit.column,7);
 assert.equal(paletteSearch({...base,query:'new'}).hits[0].kind,'create');
 assert.equal(paletteSearch({...base,query:'Chapter 2'}).hits[0].name,'Chapter 2');
 assert.equal(paletteSearch({...base,query:'../escape'}).invalidName,true);
 assert.equal(paletteSearch({...base,query:'new',canCreate:false}).hits.length,0);
});
test('palette rejects reserved Windows names and keeps recent files first',()=>{
 for(const name of ['CON','aux.yarn','bad/child','name.']) assert.equal(validDocumentName(name),false);
 const hits=paletteSearch({documents:[doc('one','a',''),doc('two','b','')],commands:[],settings:[],query:'',scope:'files',canCreate:true,recent:['two']}).hits;
 assert.equal(hits[0].kind,'create');assert.equal(hits[1].hit.documentId,'two');
});
