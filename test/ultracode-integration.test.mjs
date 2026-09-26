import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';
import { ULTRACODE_ON, ULTRACODE_OFF, ULTRACODE_SPARSE, ULTRACODE_KEYWORD } from '../src/ultracode.mjs';

const textOf = request => request.messages.filter(m => ['system','developer'].includes(m.role)).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
async function request(fx, captured, text) {
  const before = captured.length;
  await fx.rpc('session/prompt', {requestId:crypto.randomUUID(),sessionId:fx.sessionId,mode:'queue',content:[{type:'text',text}]});
  await until(async () => captured.length > before && (await fx.api('/state?session='+fx.sessionId)).running === 'idle');
  return captured.at(-1);
}

test('native mode selection sends actual effort, injects the full reference, and returns to regular highest effort', { timeout: 180000 }, async t => {
  const captured = []; let held;
  const fx = await frontendFixture(t, { headless: true, modelProfile: { reasoningEfforts: {off:null,low:'low',xhigh:'xhigh'}, compat: {supportsReasoningEffort:true} },
    async modelReply(payload) { if (payload.tools?.length) { captured.push(payload); const wait=held; held=null; await wait; } },
  });
  const path = '/model-mode?session='+fx.sessionId, initial = await fx.api(path);
  assert.equal(initial.eligible, true); assert.equal(initial.enabled, false);
  const on = await fx.api(path, {provider:'fixture',model:'fixture',ultracode:true,expectedRevision:initial.revision});
  assert.equal(on.enabled, true); assert.equal(on.selected.reasoningEffort, 'xhigh');
  let value = await request(fx, captured, 'Inspect the implementation thoroughly.');
  assert.equal(value.reasoning_effort, 'xhigh'); assert.ok(textOf(value).includes(ULTRACODE_ON));
  for (const pattern of ['Completeness critic', 'Adversarial verify', 'Judge panel', 'Loop-until-dry']) assert.ok(textOf(value).includes(pattern), pattern);
  for (let i=0;i<10;i++) { value = await request(fx,captured,'Continue check '+i); assert.ok(textOf(value).includes(ULTRACODE_ON), String(i)); }
  value = await request(fx,captured,'Eleventh ordinary continuation'); assert.ok(textOf(value).includes(ULTRACODE_SPARSE), 'Missing sparse reminder; fixture: '+fx.root);
  const off = await fx.api(path, {provider:'fixture',model:'fixture',reasoningEffort:'xhigh',ultracode:false});
  assert.equal(off.enabled, false);
  value = await request(fx,captured,'Now continue normally');
  assert.equal(value.reasoning_effort, 'xhigh'); assert.ok(textOf(value).includes(ULTRACODE_OFF)); assert.ok(!textOf(value).includes('Workflow authoring reference'));
  await fx.api(path,{provider:'fixture',model:'fixture',ultracode:true});
  let release; held=new Promise(resolve=>{release=resolve;});
  const before=captured.length, pending=request(fx,captured,'Switch settings while this request is in flight');
  try {
    await until(()=>captured.length>before);
    assert.equal(captured.at(-1).reasoning_effort,'xhigh'); assert.ok(textOf(captured.at(-1)).includes(ULTRACODE_ON));
    await fx.api(path,{provider:'fixture',model:'fixture',reasoningEffort:'low',ultracode:false});
  } finally { release(); }
  await pending;
  value=await request(fx,captured,'Continue with the updated selection');
  assert.equal(value.reasoning_effort,'low'); assert.ok(textOf(value).includes(ULTRACODE_OFF));
  assert.ok(!textOf(value).includes('Workflow authoring reference'));
});

test('full context compaction keeps the chosen mode, and a human keyword opts only that turn into orchestration', { timeout: 180000 }, async t => {
  const captured = [];
  const fx = await frontendFixture(t, { headless: true, modelReply(payload) {
    if (payload.tools?.some(tool => tool.function.name === 'compact_conversation')) return {delta:{role:'assistant',tool_calls:[{index:0,id:'compact-mode-test',type:'function',function:{name:'compact_conversation',arguments:JSON.stringify({summary:'Kept the completed workflow review and current task context.'})}}]},finish_reason:'tool_calls'};
    if(payload.tools?.length)captured.push(payload);
  } });
  const path = '/model-mode?session='+fx.sessionId;
  await fx.api(path,{provider:'fixture',model:'fixture',ultracode:true});
  await request(fx,captured,'Before compaction');
  const compacted = await fx.api('/compact-f?session='+fx.sessionId,{});
  assert.equal(compacted.changed,true,JSON.stringify(compacted));
  assert.equal((await fx.api(path)).enabled,true);
  let value = await request(fx,captured,'After compaction'); assert.ok(textOf(value).includes(ULTRACODE_ON));
  assert.ok(JSON.stringify(value.messages).includes('Kept the completed workflow review'), 'the real context replacement must reach the next request');
  assert.equal(value.reasoning_effort,undefined,'a model without advertised efforts keeps its default');
  await fx.api(path,{provider:'fixture',model:'fixture',ultracode:false});
  value = await request(fx,captured,'Use ultracode for this review'); assert.ok(textOf(value).includes(ULTRACODE_KEYWORD));
  assert.equal((await fx.api(path)).enabled,false,'keyword does not persist the mode');
  value = await request(fx,captured,'Next ordinary task'); assert.ok(!textOf(value).includes('Workflow authoring reference'));
});

test('installed PTC mode survives bundle reload and stock sessions after disable contain no stale directive', { timeout: 180000 }, async t => {
  const captured = [];
  const fx = await frontendFixture(t, {headless:true,installedPackage:true,agentPreset:'omd-ptc',modelReply(payload) { if(payload.tools?.length)captured.push(payload); }});
  const path='/model-mode?session='+fx.sessionId;
  await fx.api(path,{provider:'fixture',model:'fixture',ultracode:true});
  let value=await request(fx,captured,'PTC mode before reload');
  assert.ok(value.tools.some(tool=>tool.function.name==='run_code'));
  assert.ok(!value.tools.some(tool=>tool.function.name==='workflow'));
  assert.ok(textOf(value).includes(ULTRACODE_ON));
  const saved=await restoreFixtureLog(fx.home,fx.sessionId);
  assert.ok(saved.events.some(event=>event.type==='model/selection'));
  assert.ok(!saved.events.some(event=>event.type.startsWith('omd/')),'stock readers need no plugin event vocabulary');
  const ownState=JSON.parse(await readFile(join(fx.home,'trisoul-x','sessions',fx.sessionId+'.json'),'utf8'));
  assert.equal(ownState.ultracode.enabled,true); assert.equal(ownState.ultracode.delivery.kind,'on');
  const disable=await fx.call('pluginManager/setBundleEnabled',{name:'trisoul_x',enabled:false});
  assert.equal(disable.result?.value?.application,'applied',JSON.stringify(disable));
  // Unloaded OMD presets cannot be resumed until re-enabled. Stock sessions
  // remain usable and native persistence can still read the OMD history.
  assert.equal((await restoreFixtureLog(fx.home,fx.sessionId)).events.length>0,true);
  const stock=await fx.rpc('session/create',{cwd:fx.workspace,agentPreset:'standard'});
  const count=captured.length;
  await fx.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:stock.sessionId,mode:'queue',content:[{type:'text',text:'Continue after plugin disabled'}]});
  await until(()=>captured.length>count);
  assert.ok(!textOf(captured.at(-1)).includes('Workflow authoring reference'));
  assert.ok(!textOf(captured.at(-1)).includes(ULTRACODE_ON));
  const enable=await fx.call('pluginManager/setBundleEnabled',{name:'trisoul_x',enabled:true});
  assert.equal(enable.result?.value?.application,'applied',JSON.stringify(enable));
  await until(async()=> (await fx.api(path)).enabled);
  value=await request(fx,captured,'PTC mode after reload');
  assert.ok(textOf(value).includes(ULTRACODE_ON));
  assert.ok(value.tools.some(tool=>tool.function.name==='run_code'));
});
