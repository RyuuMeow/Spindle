import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

function helper(t) {
  const child = spawn(path.resolve('outputs/dotnet/dotnet.exe'), [path.resolve('desktop/play-runtime/bin/Release/net10.0/Spindle.Play.dll')], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  t.after(() => child.kill());
  const pending = new Map(); let next = 0;
  createInterface({input: child.stdout}).on('line', line => {
    const message = JSON.parse(line), item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(Error(message.error)) : item.resolve(message.result);
  });
  return (action, data = {}) => new Promise((resolve,reject) => {
    const id = ++next, timer = setTimeout(() => reject(Error('helper timeout')),10000);
    pending.set(id,{resolve,reject,timer}); child.stdin.write(JSON.stringify({id,action,...data})+'\n');
  });
}
const docs = text => [{id:'doc',name:'Story.yarn',version:2,text}];
test('official compiler, choices, variable override, detour and rewind', async t => {
  const call = helper(t);
  let state = await call('compile',{documents:docs('title: Start\n---\n<<declare $key = false>>\nMira: Hello\n-> Door <<if $key>>\n    <<detour Room>>\n-> Stay\n    Mira: Wait\nMira: End\n===\ntitle: Room\n---\nMira: Inside\n<<return>>\n===')});
  assert.deepEqual(state.diagnostics,[]);
  state = await call('start',{scene:'Start'}); assert.equal(state.status,'line');
  assert.equal(state.events.find(e=>e.kind==='line').source.line,4);
  state = await call('next'); assert.equal(state.status,'options'); assert.equal(state.options[0].available,false);
  state = await call('setVariable',{name:'$key',value:true}); assert.ok(state.options.length,JSON.stringify(state)); assert.equal(state.options[0].available,true);
  state = await call('choose',{optionId:state.options[0].id}); assert.equal(state.events.filter(e=>e.kind==='line').at(-1).text,'Mira: Inside');
  state = await call('next'); assert.equal(state.events.filter(e=>e.kind==='line').at(-1).text,'Mira: End');
  state = await call('back'); assert.equal(state.scene,'Room');
  state = await call('next'); assert.equal(state.events.filter(e=>e.kind==='line').at(-1).text,'Mira: End');
});
test('random results replay exactly and commands are events, not external effects', async t => {
  const call=helper(t);
  await call('compile',{documents:docs('title: Start\n---\nA\n<<give_item key 1>>\nValue {random()}\n===')});
  await call('start',{scene:'Start'});
  const first=await call('next'); await call('back'); const second=await call('next');
  assert.deepEqual(first.events,second.events);
  assert.equal(first.events.filter(e=>e.kind==='command').length,1);
});
test('invalid Yarn blocks running and infinite loops stop within budget', async t => {
  const call=helper(t);
  const invalid=await call('compile',{documents:docs('title: Start\n---\n<<if unknown_function()>>\nA\n<<endif>>\n===')});
  assert.equal(invalid.status,'ready'); const failed=await call('start',{scene:'Start'}); assert.equal(failed.status,'error');
  await call('compile',{documents:docs('title: Start\n---\n<<jump Start>>\n===')});
  const looping=await call('start',{scene:'Start'}); assert.equal(looping.status,'error');
  assert.equal(looping.events.at(-1).text,'INSTRUCTION_BUDGET_EXCEEDED');
});
