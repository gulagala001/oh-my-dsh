import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createMessage } from '@deepseek-ai/dsh-llm';
import TokenMeter from '../src/metering/service.mjs';
import { usageReceipt } from '../src/metering/usage.mjs';
import { measureRequest, estimateMessage, inputBudget } from '../src/metering/estimate.mjs';
import { receiptStream } from '../src/metering/stream.mjs';
import { RequestSnapshots } from '../src/context/request-snapshots.mjs';
import { TaskBudgets } from '../src/task-budget.mjs';
import { DreamStore } from '../src/dream/store.mjs';
import { serializePreparationInput } from '../src/context/input-budget.mjs';
const nativeRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const { default: Projections } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-session-projection')));

const user = text => createUserMessage({ source:{kind:'user'},content:[{type:'text',text}] });
const route = {provider:'fixture',model:'fixture',maxTokens:128};

test('one receipt distinguishes exact total, missing buckets, partial output and invalid counters', () => {
  const receipt=usageReceipt({inputTokens:100,outputTokens:20,totalTokens:150});
  assert.equal(receipt.totalTokens,150);assert.equal(receipt.inputTotalTokens,130);assert.equal(receipt.cacheReadTokens,null);
  assert.equal(usageReceipt({inputTokens:100}).precision,'lower-bound');
  assert.equal(usageReceipt({inputTokens:100,outputTokens:0,totalTokens:100},{hasOutput:true}).totalTokens,null);
  assert.equal(usageReceipt({inputTokens:100}).totalTokens,null);
  assert.equal(usageReceipt({inputTokens:100,outputTokens:20,totalTokens:99}).inconsistent,true);
  assert.equal(usageReceipt({inputTokens:1,outputTokens:2,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:1}).totalTokens,3);
  assert.equal(usageReceipt({inputTokens:0,outputTokens:0,totalTokens:0},{hasOutput:true}).precision,'unknown');
  assert.equal(usageReceipt({inputTokens:0,outputTokens:0,totalTokens:0,measurement:'reported'},{hasOutput:true}).totalTokens,0);
});

test('task and Dream settlement consume the same total, keeping partial reservations', () => {
  const state={budget:{configured:true,visible:true,tokens:0,rounds:0,unmetered:0}},session={id:'one',header:{}};
  const hub={store:{state:()=>state,update:(_state,patch)=>Object.assign(state,patch)}};
  const budget=new TaskBudgets(hub);
  budget.record(session,'main',{usage:{inputTokens:100,outputTokens:20,totalTokens:150}});
  assert.equal(state.budget.tokens,150);assert.equal(state.budget.unmetered,0);
  budget.record(session,'main',{usage:{inputTokens:100}});
  assert.equal(state.budget.tokens,250);assert.equal(state.budget.unmetered,1);
  let settled;
  const store={db:{prepare:sql=>sql.startsWith('SELECT')?{get:()=>({reserved:200,data:'{}'})}:{run:(...args)=>{settled=args;}}}};
  DreamStore.prototype.settle.call(store,'a',{inputTokens:100,outputTokens:20,totalTokens:150});
  assert.equal(settled[0],150);
  DreamStore.prototype.settle.call(store,'a',{inputTokens:100});assert.equal(settled[0],200);
});

test('full requests price content once and keep transport metadata outside token budgets', () => {
  const request={...route,system:'系统指令',tools:[{name:'read',parameters:{type:'object'}}],messages:[user('中文'.repeat(100))]};
  const a=measureRequest(request),b=measureRequest({...request,messages:request.messages.map(m=>({...m,metadata:{replay:'x'.repeat(1000000)}}))});
  assert.deepEqual(a,b);assert.equal(a.tokens,a.systemTokens+a.toolsTokens+a.messageTokens);
  assert.equal(a.precision,'estimated');assert.ok(a.messageTokens>=200);
  assert.equal(inputBudget({inputLimit:300000,contextWindow:64000,maxTokens:4000,headroom:6000}),54000);
  assert.throws(()=>inputBudget({inputLimit:-1}));
  const input={segment:[{text:'完整材料'}],reference:[{text:'x'.repeat(2000)}]};
  const build=text=>({...route,system:'规则'.repeat(80),messages:[user(text)]});
  assert.throws(()=>serializePreparationInput(input,20,{build}),{code:'INPUT_BUDGET_EXCEEDED'});
  const encoded=serializePreparationInput(input,300,{build});
  assert.equal(JSON.parse(encoded).reference.length,0);assert.equal(input.reference.length,1);
});

test('native meter, pressure and breakdown share replay; replacement drops the old usage anchor', async t => {
  const ctx=new Context();t.after(()=>ctx.fiber.dispose());await ctx.plugin(Projections);await ctx.plugin(TokenMeter);
  const session=Session.create('meter-contract');
  session.append('request/header',{reason:'initial',header:{config:route}});
  session.append('request/context',{...route,contextWindow:64000});
  const original=session.append('user/message',user('Large retained input. '.repeat(1000)),{surfaceOp:'append'});
  const message=createMessage({role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text:'reply'}]});
  session.append('assistant/message',{turn:1,step:1,message,stream:[],usage:{inputTokens:40000,outputTokens:10,totalTokens:40010}},{surfaceOp:'append'});
  const before=ctx.tokenMeter.measure(session);assert.equal(before.baseline.kind,'usage');assert.ok(before.totalTokens>40000);
  assert.equal(Object.values(before.breakdown).reduce((a,b)=>a+b,0)+before.unallocatedTokens,before.totalTokens);
  session.append('user/message',user('Short retained summary'),{surfaceOp:{op:'replace',startSeq:original.seq,endSeq:original.seq},sourceEventSeqs:[original.seq]});
  const after=ctx.tokenMeter.measure(session);assert.equal(after.baseline.kind,'estimated');assert.ok(after.totalTokens<100);
  const projected=ctx.sessionProjections.snapshot(session).values;
  assert.equal(projected.contextPressure.projectedTokens,after.totalTokens);
  assert.equal(Object.values(projected.contextBreakdown).reduce((a,b)=>a+b,0),after.totalTokens);
  const replay=Session.create(session.id,structuredClone(session.snapshotEvents()),session.header);
  assert.deepEqual(ctx.tokenMeter.measure(replay),after);
  assert.deepEqual(ctx.sessionProjections.snapshot(replay).values,projected);
});

test('snapshot candidates include intermediate prefixes; byte size cannot reject a token-fit prefix', () => {
  const s=Session.create('cache-contract');s.append('user/message',user('task'),{surfaceOp:'append'});
  const snapshots=new RequestSnapshots();
  for(let i=1;i<=4;i++) { const request={...route,messages:[user('word '.repeat(i*100))],metadata:'x'.repeat(100000)};snapshots.capture(s,request,2000);snapshots.confirm(s,route); }
  assert.equal(snapshots.candidates(s).length,4);
  assert.ok(snapshots.candidates(s).every(v=>v.request&&v.bytes>2000&&v.tokens<2000));
  assert.equal(snapshots.candidates(s)[1].tokens,estimateMessage(snapshots.candidates(s)[1].request.messages[0]));
});

test('all public stream consumers see missing usage as missing, including cancelled attempts', async () => {
  async function* source(){yield {type:'usage',usage:{inputTokens:0,outputTokens:0,totalTokens:0}};yield {type:'text-delta',text:'a'};yield {type:'usage',usage:{inputTokens:100,outputTokens:20,totalTokens:150}};yield {type:'finish',reason:{kind:'stop'}};}
  const chunks=await Array.fromAsync(receiptStream(source()));
  assert.equal(chunks.filter(c=>c.type==='usage').length,1);assert.equal(chunks.find(c=>c.type==='usage').usage.totalTokens,150);
});

test('native 64K fallback and over-window summaries use bounded requests and native transactions', async t => {
  const {LlmRuntime,LlmAdapter}=await import('@deepseek-ai/dsh-llm');
  const {createModule}=await import('../lib/host/compaction.factory.mjs');
  const Compaction=createModule(specifier=>{const value=nativeRequire(specifier);return specifier==='@deepseek-ai/schemastery'?value.default:{...value,__esModule:true};}).default;
  const ctx=new Context(),calls=[];t.after(()=>ctx.fiber.dispose());
  ctx.provide('sessions',{flush:async()=>{}});
  await ctx.plugin(Projections);await ctx.plugin(LlmRuntime);await ctx.plugin(TokenMeter);
  class Adapter extends LlmAdapter {
    async resolveModel(provider,model){return {id:model,provider,name:model,context:{contextWindow:64000},defaultMaxTokens:4000};}
    async *stream(request){
      const size=measureRequest(request).tokens;
      assert.ok(size+(request.maxTokens??0)<=64000);calls.push(request);
      yield {type:'text-delta',index:0,text:'Checkpoint: original observations and constraints retained.'};
      yield {type:'usage',usage:{inputTokens:size,outputTokens:20,totalTokens:size+20}};
      yield {type:'finish',reason:{kind:'stop'}};
    }
  }
  ctx.llm.registerAdapter(['fixture'],new Adapter());
  await ctx.plugin(Compaction,{auto:false});
  const session=Session.create('native-64k');
  session.append('request/header',{reason:'initial',header:{config:{...route,maxTokens:4000}}});
  session.append('request/context',{...route,contextWindow:64000});
  session.append('user/message',user('Retain original evidence.'),{surfaceOp:'append'});
  for(let i=0;i<10;i++)session.append('assistant/message',{turn:1,step:i+1,stream:[],message:createMessage({role:'assistant',source:{kind:'model',...route},content:[{type:'text',text:'中'.repeat(6000)}]})},{surfaceOp:'append'});
  session.append('turn/start',{turn:2});
  const agent={session,options:route,ctx,status:'running'};
  const before=session.snapshotEvents();
  const result=await ctx.compaction.compactIfNeeded(agent,'pressure',new AbortController().signal);
  assert.ok(result);assert.ok(ctx.tokenMeter.measure(session).totalTokens<50000);
  assert.deepEqual(session.snapshotEvents().slice(0,before.length),before);
  const initialCalls=calls.length;
  const summary=await ctx.compaction.summarize({messages:[user('大'.repeat(140000))]},agent,new AbortController().signal);
  assert.ok(summary.summary.length);assert.ok(calls.length>initialCalls+1);
});

test('usage projections replace cumulative samples and count a retry as a new attempt', async t => {
  const {usageProjection}=await import('../src/metering/service.mjs');
  let state=usageProjection.init();
  const event=(seq,total)=>({seq,type:'assistant/attempt',data:{turn:1,step:1,stream:[{type:'chunk',time:1,chunk:{type:'usage',usage:{inputTokens:10,outputTokens:total-10,totalTokens:total}}}]}});
  state=usageProjection.apply(state,event(1,20));state=usageProjection.apply(state,event(2,30));
  assert.equal(state.totals.knownTotalTokens,30);assert.equal(state.totals.calls,1);
  state=usageProjection.apply(state,{type:'llm/retry-started',data:{turn:1,step:1}});
  state=usageProjection.apply(state,event(4,50));assert.equal(state.totals.knownTotalTokens,80);assert.equal(state.totals.calls,2);
});

test('task budgets replace a receipt and resetting a budget starts a new accounting scope', () => {
  const state={budget:{configured:true,visible:true,tokens:0,rounds:0,unmetered:0}},session={id:'one',header:{}};
  const hub={store:{state:()=>state,update:(_state,patch)=>Object.assign(state,patch)}};
  const budgets=new TaskBudgets(hub);
  budgets.record(session,'main',{id:'call',usage:{inputTokens:10}});
  budgets.record(session,'main',{id:'call',usage:{inputTokens:10,outputTokens:9,totalTokens:19}});
  assert.equal(state.budget.tokens,19);assert.equal(state.budget.unmetered,0);assert.equal(state.budget.rounds,1);
  state.budget={configured:true,visible:true,tokens:0,rounds:0,unmetered:0};
  budgets.record(session,'main',{id:'call',usage:{inputTokens:10,outputTokens:9,totalTokens:19}});
  assert.equal(state.budget.tokens,19);assert.equal(state.budget.rounds,1);
});

test('provider configuration stamps survive reload and invalidate unchanged route names without persisting settings', async () => {
  const {createRouteStamps}=await import('../src/metering/route-stamp.mjs');
  const {appendPluginRecord}=await import('@deepseek-ai/dsh-session');
  const {REQUEST_METER_RECORD}=await import('../src/metering/context.mjs');
  let settings={api:'protocol-one',credential:'synthetic-secret',imagePixels:1024};
  const callbacks=new Map();
  const ctx={on:(name,fn)=>callbacks.set(name,[...(callbacks.get(name)??[]),fn]),get:name=>name==='llm'?{listConfigurableProviders:()=>[{provider:'fixture',settingsNs:'models',settingsPath:['providers','fixture']}]}
    :name==='settings'?{describe:()=>[{ns:'models',value:{providers:{fixture:settings}}}]}:undefined};
  const stamp=createRouteStamps(ctx),original=stamp(route);
  assert.equal(original,createRouteStamps(ctx)(route));
  const session=Session.create('source-stamp');
  appendPluginRecord(session,REQUEST_METER_RECORD,{stamp:original});
  assert.ok(!JSON.stringify(session.snapshotEvents()).includes('synthetic-secret'));
  settings={...settings,imagePixels:2048};for(const listener of callbacks.get('settings/document-updated'))listener('models');
  assert.notEqual(stamp(route),original);
});

test('native stream ownership preserves per-attempt identity and avoids double billing owned auxiliary calls', async t => {
  const {LlmRuntime,LlmAdapter,markAgentLoopRequest}=await import('@deepseek-ai/dsh-llm');
  const {ownedUsageRequest}=await import('../src/metering/stream.mjs');
  const session=Session.create('native-receipt'),ctx=new Context(),unowned=[];
  t.after(()=>ctx.fiber.dispose());ctx.provide('sessions',{get:()=>session});
  await ctx.plugin(Projections);await ctx.plugin(LlmRuntime);await ctx.plugin(TokenMeter);
  class Adapter extends LlmAdapter {async *stream(){yield {type:'usage',usage:{inputTokens:10,outputTokens:5,totalTokens:15}};yield {type:'finish',reason:{kind:'stop'}};}}
  ctx.llm.registerAdapter(['fixture'],new Adapter());
  ctx.on('token-meter/receipt',value=>unowned.push(value),{global:true});
  session.append('turn/start',{turn:1});session.append('step/start',{turn:1,step:1});
  await Array.fromAsync(ctx.llm.stream(markAgentLoopRequest({...route,sessionId:session.id,messages:[user('input')]})));
  const first=ctx.tokenMeter.receiptFor(session,{seq:5,data:{turn:1,step:1}});
  assert.ok(first.id);assert.equal(ctx.tokenMeter.receiptFor(session,{seq:6,data:{turn:1,step:1}}).eventSeq,5);
  await Array.fromAsync(ctx.llm.stream(ownedUsageRequest({...route,sessionId:session.id,purpose:'compaction',messages:[user('auxiliary')]},'prepare')));
  assert.equal(unowned.length,0);
  await Array.fromAsync(ctx.llm.stream({...route,sessionId:session.id,purpose:'compaction',messages:[user('native summary')]}));
  assert.equal(unowned.length,1);assert.equal(unowned[0].receipt.usage.totalTokens,15);
});
