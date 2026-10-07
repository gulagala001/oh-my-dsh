import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { Hub } from '../src/hub.mjs';
import { QUOTA_EXCEEDED_CODE, ACCOUNT_QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { FixtureSession, system, user, plugin, exchange, adapter } from './context-fixture.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-context-recovery-'));
  const session = new FixtureSession();system(session);user(session, '准确保留用户原话。');exchange(session);exchange(session);
  const cfg = contextConfig({ digestEvery: 4, digestWindow: 4, prepareContinueTokens: 1, keepTailEvents: 0, flushIdleMs: 0, coordinatorEvery: 999, traceEnabled: false });
  const route = { provider: 'fixture', model: 'fixture' }, calls = [];
  let invalid = true, providerError;
  const hub = { store: { dir }, config: () => cfg, scope: () => ({ mode: 'session', project: '/fixture' }), ctx: {}, action() {}, route: () => route,
    async call(_agent, kind) {
      calls.push(kind);if(providerError)throw Error(providerError);
      if(kind==='coordinate')return {blocks:[{type:'tool-call',name:'submit_context_choices',arguments:{choices:[]}}]};
      return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: '已读取资料。', documents: [], ...(invalid ? { decisions: [{ seq: 1, text: '虚构的决定', quote: '原文不存在的引用' }] } : {}) } }] };
    } };
  const pipeline = new ContextPipeline(hub, adapter), agent = { session, status: 'running' }, state = pipeline.state(session);
  pipeline.agents.set(session.id, agent);state.eventsSincePrepare = 4;
  t.after(async () => { await pipeline.dispose();rmSync(dir, { recursive: true, force: true }); });
  return { pipeline, agent, session, state, hub, cfg, route, calls, valid: () => { invalid = false;providerError = undefined; }, provider: message => { providerError = message; } };
}
async function settle(pipeline) { do { await Promise.all([...pipeline.jobs.values()]); } while(pipeline.jobs.size); }
async function exhaust(f) {
  await f.pipeline.prepare(f.agent, true);
  for(let i=0;i<2;i++){f.state.prepareRetryAt=0;await f.pipeline.prepare(f.agent, true, { retry: true });}
  f.state.prepareRetryAt=0;assert.equal(f.calls.length,3);assert.equal(f.state.failures.prepare.count,3);
}
async function arrive(f, count) { for(let i=0;i<count;i++)f.pipeline.observe(f.session,user(f.session,'继续处理 ' + i));await settle(f.pipeline); }

test('saved legacy coordinator quota failure resumes only after a matching main success',async t=>{
  const f=setup(t);f.valid();await f.pipeline.prepare(f.agent,true);
  assert.equal(f.calls.length,1);f.cfg.coordinatorMinGapMs=0;f.state.initialized=true;
  f.state.failures.coordinate={count:3,at:Date.now()-1000,message:'fixture API error (400): insufficient credits',recoverable:false};
  f.pipeline.store.save(f.state);await f.pipeline.dispose();
  const restored=new ContextPipeline(f.hub,adapter);t.after(()=>restored.dispose());restored.start(f.agent);await settle(restored);
  assert.equal(restored.view(f.session).retry.coordinate,'waiting-main');assert.equal(f.calls.length,1);
  restored.mainSucceeded(f.session,{provider:'other',model:'fixture'});await settle(restored);assert.equal(f.calls.length,1);
  restored.mainSucceeded(f.session,f.route);await settle(restored);
  assert.deepEqual(f.calls,['prepare','coordinate']);assert.equal(restored.state(f.session).failures.coordinate,undefined);assert(restored.state(f.session).pending);
});

test('rejected summary output gets one fresh probe after the normal new-event interval and can recover', async t => {
  const f=setup(t), original=structuredClone(f.session.snapshotEvents());await exhaust(f);
  assert.deepEqual(f.session.snapshotEvents(),original);assert.equal(f.state.records.length,0);
  assert.equal(f.pipeline.view(f.session).retry.prepare,'waiting-events');
  f.valid();await arrive(f,3);assert.equal(f.calls.length,3);
  await arrive(f,1);assert.equal(f.calls.length,5,'successful recovery can finish the configured two-window catch-up batch');assert(f.state.records.length>0);
  assert.equal(f.state.failures.prepare,undefined);
  assert.deepEqual(f.session.snapshotEvents().slice(0,original.length),original);
  assert(!JSON.stringify(f.state.records).includes('原文不存在的引用'));
});

test('continued invalid summaries remain bounded and a successful main request does not bypass validation cadence', async t => {
  const f=setup(t);await exhaust(f);
  f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);assert.equal(f.calls.length,3);
  await arrive(f,4);assert.equal(f.calls.length,4);assert.equal(f.state.failures.prepare.count,3);
  assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),false);
  for(let i=0;i<4;i++)await f.pipeline.prepare(f.agent);assert.equal(f.calls.length,4);
  await arrive(f,3);assert.equal(f.calls.length,4);await arrive(f,1);assert.equal(f.calls.length,4,'the previous rejection backoff still applies');
  f.state.prepareRetryAt=0;await f.pipeline.prepare(f.agent);assert.equal(f.calls.length,5);
  assert.equal(f.state.records.length,0);
});

test('exhausted saved quote-validation failures recover after reload when enough genuine events arrived later', async t => {
  const f=setup(t);f.valid();
  const at=Date.now()-1000;
  for(const event of f.session.events)event.timestamp=at+100;
  f.state.failures.prepare={count:3,at,message:'用户决定摘要缺少本批真实用户原话依据或超过长度限制',recoverable:false};
  f.state.initialized=true;f.state.eventsSincePrepare=100;f.pipeline.store.save(f.state);
  const restored=new ContextPipeline(f.hub,adapter);t.after(()=>restored.dispose());
  restored.start(f.agent);await settle(restored);
  assert.equal(f.calls.length,1);assert(restored.state(f.session).records.length>0);
  assert.equal(restored.state(f.session).failures.prepare,undefined);
});

test('a previously failing following provider gets one bounded probe after a matching successful main request', async t => {
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);
  assert.equal(f.state.failures.prepare.recoverable,false);
  f.valid();f.pipeline.mainSucceeded(f.session,{provider:'other',model:'fixture'});await settle(f.pipeline);assert.equal(f.calls.length,3);
  f.pipeline.mainSucceeded(f.session,f.route);f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);
  assert.equal(f.calls.length,4);assert.equal(f.state.failures.prepare,undefined);assert(f.state.records.length>0);
});

test('an exhausted independent provider is not revived by unrelated main successes or new conversation events', async t => {
  const f=setup(t);f.cfg.backgroundMode='separate';f.cfg.background.provider='independent';f.cfg.background.model='separate';
  f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.pipeline.mainSucceeded(f.session,f.route);await arrive(f,8);
  assert.equal(f.calls.length,3);assert.equal(f.state.records.length,0);
});

test('a main success does not repeatedly probe a provider configuration failure', async t => {
  const f=setup(t);f.provider('fixture API error (400): temperature parameter is not supported');await exhaust(f);f.valid();
  f.pipeline.mainSucceeded(f.session,f.route);await arrive(f,8);
  assert.equal(f.calls.length,3);assert.equal(f.pipeline.view(f.session).retry.prepare,'manual');
});

test('eligible new work before the rejection backoff deadline schedules one delayed recovery probe', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);await exhaust(f);f.valid();f.state.prepareRetryAt=Date.now()+2000;
  await arrive(f,4);assert.equal(f.calls.length,3);assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),true);
  t.mock.timers.tick(1999);await settle(f.pipeline);assert.equal(f.calls.length,3);
  t.mock.timers.tick(1);await settle(f.pipeline);assert.equal(f.calls.length,5);assert.equal(f.state.failures.prepare,undefined);
  t.mock.timers.tick(3600000);await settle(f.pipeline);assert.equal(f.calls.length,5);
});

for (const message of [
  "Expected ',' or '}' after property value in JSON at position 15 (line 1 column 16)",
  'Unexpected end of JSON input',
  'Unexpected non-whitespace character after JSON at position 16 (line 1 column 17)',
  '"undefined" is not valid JSON',
]) test('saved legacy JSON rejection recovers only after genuine new events: ' + message, async t => {
  const f=setup(t);f.valid();
  const original=structuredClone(f.session.snapshotEvents());
  f.state.initialized=true;f.state.eventsSincePrepare=0;
  f.state.failures.prepare={count:3,at:Date.now(),message,recoverable:false};
  f.pipeline.store.save(f.state);
  const restored=new ContextPipeline(f.hub,adapter);t.after(()=>restored.dispose());
  restored.start(f.agent);await settle(restored);
  assert.equal(f.calls.length,0,'loading a malformed previous reply must not immediately start another retry burst');
  assert.equal(restored.view(f.session).retry.prepare,'waiting-events');
  for(let i=0;i<4;i++)restored.observe(f.session,plugin(f.session,'旧插件补注 ' + i));
  const active={...f,pipeline:restored,state:restored.state(f.session)};
  await arrive(active,3);assert.equal(f.calls.length,0,'plugin output and fewer than digestEvery genuine events cannot revive the reply');
  await arrive(active,1);
  assert(f.calls.length>0&&f.calls.length<=f.cfg.prepareBatchWindows,'one recovery may finish a bounded catch-up batch');
  assert(active.state.records.length>0);assert.equal(active.state.failures.prepare,undefined);
  assert.deepEqual(f.session.snapshotEvents().slice(0,original.length),original);
});

for (const message of [
  'fixture API error (402): out of credits',
  'fixture API error (402): credit balance depleted',
]) test('matching successful main request probes an exhausted quota failure: ' + message, async t => {
  const f=setup(t);f.provider(message);await exhaust(f);
  assert.equal(f.pipeline.view(f.session).retry.prepare,'waiting-main');
  f.valid();f.pipeline.mainSucceeded(f.session,{provider:'other',model:'fixture'});await settle(f.pipeline);
  assert.equal(f.calls.length,3,'another provider success is not evidence that this account recovered');
  f.pipeline.mainSucceeded(f.session,f.route);f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);
  assert.equal(f.calls.length,4);assert(f.state.records.length>0);assert.equal(f.state.failures.prepare,undefined);
});

test('main success before provider backoff expires keeps one fixed delayed probe and a failed probe starts no new burst', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);
  const deadline=Date.now()+2000;f.state.prepareRetryAt=deadline;
  f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);
  assert.equal(f.calls.length,3);assert.equal(f.state.failures.prepare.count,3,'a pending probe does not consume retry allowance');
  assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),true,'a matching main success is retained until the provider backoff ends');
  t.mock.timers.tick(1000);
  f.pipeline.mainSucceeded(f.session,f.route);f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);
  assert.equal(f.state.prepareRetryAt,deadline,'repeated main successes cannot postpone the probe');
  assert.equal(f.state.failures.prepare.count,3);
  t.mock.timers.tick(999);await settle(f.pipeline);assert.equal(f.calls.length,3);
  t.mock.timers.tick(1);await settle(f.pipeline);assert.equal(f.calls.length,4,'the original deadline grants exactly one failing call');
  assert.equal(f.state.failures.prepare.count,3);assert.equal(f.state.records.length,0);
  assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),false,'a failed recovery probe cannot launch an automatic retry burst');
  t.mock.timers.tick(3600000);await settle(f.pipeline);assert.equal(f.calls.length,4);
});

test('a retained successful main request resumes preparation at the original provider backoff deadline', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.state.prepareRetryAt=Date.now()+2000;f.pipeline.mainSucceeded(f.session,f.route);
  t.mock.timers.tick(1999);await settle(f.pipeline);assert.equal(f.calls.length,3);
  t.mock.timers.tick(1);await settle(f.pipeline);
  assert.equal(f.calls.length,4);assert(f.state.records.length>0);assert.equal(f.state.failures.prepare,undefined);
  t.mock.timers.tick(3600000);await settle(f.pipeline);assert.equal(f.calls.length,4);
});

for (const [name,change] of [
  ['a different current provider route',async f=>{f.route.provider='changed-provider';}],
  ['a different current model route',async f=>{f.route.model='changed-model';}],
  ['disabled context processing',async f=>{f.cfg.contextEnabled=false;}],
  ['an independently configured background model',async f=>{f.cfg.backgroundMode='separate';f.cfg.background.provider='independent';f.cfg.background.model='separate';}],
  ['a closed session',async f=>{await f.pipeline.dispose(f.session.id);}],
  ['a disposed pipeline',async f=>{await f.pipeline.dispose();}],
  ['manual compression already in progress',async f=>{f.pipeline.manualSessions.set(f.session.id,'processed');}],
  ['a completed manual compression',async f=>{await f.pipeline.runManual(f.agent,{operation:'processed'});}],
]) test('a pending main-success probe respects ' + name + ' at its deadline', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.state.prepareRetryAt=Date.now()+2000;f.pipeline.mainSucceeded(f.session,f.route);
  assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),true,'the control starts from a retained, pending recovery probe');
  await change(f);
  t.mock.timers.tick(2000);await settle(f.pipeline);
  assert.equal(f.calls.length,3,'a previous main success must not bypass the current session or model configuration');
  assert.equal(f.state.failures.prepare.count,3,'cancellation must not unlock another automatic retry allowance');
  assert.equal(f.state.records.length,0);
  t.mock.timers.tick(3600000);await settle(f.pipeline);assert.equal(f.calls.length,3,'a cancelled probe cannot wake up later');
});

for (const rebuild of [false,true]) test('saved main success resumes at its original deadline after ' + (rebuild?'pipeline reconstruction':'session remount'), async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.state.initialized=true;
  const deadline=Date.now()+2000;f.state.prepareRetryAt=deadline;
  f.pipeline.mainSucceeded(f.session,f.route);
  const saved=JSON.parse(readFileSync(f.pipeline.store.path(f.session.id),'utf8'));
  assert.deepEqual(saved.failures.prepare.mainSuccess,{...f.route,at:Date.now()});
  assert.equal(saved.prepareRetryAt,deadline);assert.equal(saved.failures.prepare.count,3);
  t.mock.timers.tick(750);await f.pipeline.dispose(rebuild?undefined:f.session.id);
  t.mock.timers.tick(250);
  const active=rebuild?new ContextPipeline(f.hub,adapter):f.pipeline;
  if(rebuild)t.after(()=>active.dispose());
  active.start(f.agent);await settle(active);
  assert.equal(f.calls.length,3,'reloading durable success evidence cannot run before the old deadline');
  assert.equal(active.state(f.session).prepareRetryAt,deadline,'mount time cannot restart the provider backoff');
  assert.deepEqual(active.state(f.session).failures.prepare.mainSuccess,saved.failures.prepare.mainSuccess);
  t.mock.timers.tick(999);await settle(active);assert.equal(f.calls.length,3);
  t.mock.timers.tick(1);await settle(active);
  assert.equal(f.calls.length,4);assert(active.state(f.session).records.length>0);
  assert.equal(active.state(f.session).failures.prepare,undefined);
  assert.equal(JSON.parse(readFileSync(active.store.path(f.session.id),'utf8')).failures.prepare,undefined,'completed work consumes the persisted success evidence');
  t.mock.timers.tick(3600000);await settle(active);assert.equal(f.calls.length,4);
});

test('saved main success whose backoff expired while unmounted resumes immediately after reconstruction', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.state.initialized=true;f.state.prepareRetryAt=Date.now()+2000;f.pipeline.mainSucceeded(f.session,f.route);
  await f.pipeline.dispose();t.mock.timers.tick(2500);
  assert.equal(f.calls.length,3,'an unmounted pipeline cannot send the scheduled probe');
  const restored=new ContextPipeline(f.hub,adapter);t.after(()=>restored.dispose());
  restored.start(f.agent);await settle(restored);
  assert.equal(f.calls.length,4,'an already passed deadline does not require another main success or backoff');
  assert(restored.state(f.session).records.length>0);assert.equal(restored.state(f.session).failures.prepare,undefined);
  t.mock.timers.tick(3600000);await settle(restored);assert.equal(f.calls.length,4);
});

test('a failed delayed probe consumes saved main success even after another pipeline reconstruction', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);
  f.state.initialized=true;f.state.prepareRetryAt=Date.now()+2000;f.pipeline.mainSucceeded(f.session,f.route);
  await f.pipeline.dispose();
  const active=new ContextPipeline(f.hub,adapter);t.after(()=>active.dispose());
  active.start(f.agent);await settle(active);
  t.mock.timers.tick(2000);await settle(active);assert.equal(f.calls.length,4);
  const saved=JSON.parse(readFileSync(active.store.path(f.session.id),'utf8'));
  assert.equal(saved.failures.prepare.count,3);assert.equal(saved.failures.prepare.mainSuccess,undefined);
  await active.dispose();
  const again=new ContextPipeline(f.hub,adapter);t.after(()=>again.dispose());
  again.start(f.agent);await settle(again);
  assert.equal(again.view(f.session).retry.prepare,'waiting-main');
  t.mock.timers.tick(3600000);await settle(again);assert.equal(f.calls.length,4,'reloading cannot reuse a consumed main success for another probe');
});

for (const code of [QUOTA_EXCEEDED_CODE,ACCOUNT_QUOTA_EXCEEDED_CODE,'INVALID_REQUEST']) test('native in-band failure code survives Hub streaming, failure persistence and reload: ' + code, async t => {
  const f=setup(t);f.valid();
  const originalCall=f.hub.call.bind(f.hub), nativeErrors=[];
  let inBand=true;
  const nativeHub={
    config:()=>({jobTimeoutMs:0}),route:()=>({...f.route,effort:'off'}),efforts:{resolve:async()=>undefined},live:new Map(),
    ctx:{llm:{async *stream(){yield {type:'finish',reason:{kind:'error',failure:{code,message:'The account service rejected this model request'}}};}}},
    record(_session,_kind,entry){nativeErrors.push(entry.error);},
  };
  f.hub.call=async (...args)=>{
    if(!inBand)return originalCall(...args);
    f.calls.push(args[1]);return Hub.prototype.call.call(nativeHub,...args);
  };
  await exhaust(f);
  assert.equal(f.state.failures.prepare.code,code,'an in-band finish failure retains its machine-routable code');
  assert.equal(f.state.failures.prepare.message,'The account service rejected this model request');
  assert.equal(nativeErrors.length,3);assert.equal(nativeHub.live.size,0,'all native stream calls retire their live state');
  f.state.initialized=true;f.pipeline.store.save(f.state);await f.pipeline.dispose();
  const restored=new ContextPipeline(f.hub,adapter);t.after(()=>restored.dispose());
  restored.start(f.agent);await settle(restored);
  assert.equal(restored.state(f.session).failures.prepare.code,code);
  const quota=code!== 'INVALID_REQUEST';
  assert.equal(restored.view(f.session).retry.prepare,quota?'waiting-main':'manual','quota recovery uses the code even when the human message has no quota wording');
  inBand=false;
  restored.mainSucceeded(f.session,{provider:'other',model:'fixture'});await settle(restored);assert.equal(f.calls.length,3);
  restored.mainSucceeded(f.session,f.route);await settle(restored);
  assert.equal(f.calls.length,quota?4:3,'only account quota codes receive a matching-main recovery probe');
  if(quota){assert(restored.state(f.session).records.length>0);assert.equal(restored.state(f.session).failures.prepare,undefined);}
  else assert.equal(restored.state(f.session).failures.prepare.count,3);
});

for (const [name,change] of [
  ['switching to an independent background route',f=>{f.cfg.backgroundMode='separate';f.cfg.background.provider='independent';f.cfg.background.model='separate';f.route.provider='independent';f.route.model='separate';}],
  ['disabling context processing',f=>{f.cfg.contextEnabled=false;}],
]) test('a main-success probe queued behind another model call is cancelled after ' + name, async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);f.valid();
  f.cfg.backgroundConcurrency=1;
  let release;
  const occupying=f.pipeline.withCallSlot(()=>new Promise(resolve=>{release=resolve;}));
  try {
    f.pipeline.mainSucceeded(f.session,f.route);
    await Promise.resolve();
    assert.equal(f.pipeline.callWaiters.length,1,'the recovery probe actually waits for the global call slot');
    assert.equal(f.calls.length,3,'queued work has not reached the provider');
    change(f);release();await occupying;await settle(f.pipeline);
    assert.equal(f.calls.length,3,'success on the earlier route cannot authorize a queued dispatch after its configuration changed');
    assert.equal(f.state.failures.prepare.count,3,'cancelling queued recovery cannot reopen the normal automatic retry allowance');
    assert.equal(f.state.records.length,0);assert.equal(f.pipeline.activeCalls,0);assert.equal(f.pipeline.callWaiters.length,0);
    assert.equal(f.pipeline.timers.has(f.session.id+':prepare'),false,'cancellation cannot schedule retries against the new configuration');
    t.mock.timers.tick(3600000);await settle(f.pipeline);assert.equal(f.calls.length,3);
  } finally { release?.();await occupying; }
});

test('simultaneous provider recovery preserves the ordinary coordinator review of newly prepared records', async t => {
  const f=setup(t);f.provider('fixture API error (400): insufficient credits');await exhaust(f);
  f.state.failures.coordinate=structuredClone(f.state.failures.prepare);f.pipeline.store.save(f.state);
  f.cfg.coordinatorEvery=1;f.cfg.coordinatorMinGapMs=0;f.cfg.prepareBatchWindows=1;f.valid();
  const original=structuredClone(f.session.snapshotEvents());
  f.pipeline.mainSucceeded(f.session,f.route);await settle(f.pipeline);
  assert.deepEqual(f.calls.slice(3),['prepare','coordinate'],'the old coordinator recovery waiter cannot swallow the normal review requested by a new summary');
  assert.equal(f.state.records.length,1);assert(f.state.pending,'the newly prepared summary receives a completed coordinator decision');
  assert.deepEqual(f.state.pending.choices,[]);assert.equal(f.state.review.newRecords,0);assert.equal(f.state.review.needed,false);
  assert.equal(f.state.failures.prepare,undefined);assert.equal(f.state.failures.coordinate,undefined);
  assert.equal(f.pipeline.jobs.size,0);assert.equal(f.pipeline.timers.has(f.session.id+':coordinate'),false);
  assert.deepEqual(f.session.snapshotEvents(),original,'background recovery leaves original source events intact');
});
