import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { hash, newRecord } from '../src/context/core.mjs';
import { withoutMovedReasoning } from '../src/context/trace.mjs';
import { FixtureSession, system, user, exchange, adapter } from './context-fixture.mjs';

const body = value => ({ blocks: [{ type: 'text', text: JSON.stringify(value) }], usage: { cacheReadTokens: 123 } });
const compression = () => body({ action: 'compress', choices: [{ id: 'new-window', action: 'brief' }], prepared: { summary: '读取完成。', documents: [] } });
const input = request => JSON.parse(request.messages.at(-1).content[0].text.split('\n\n').at(-1));
const routeHash = request => hash(['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop'].map(key => request[key]));

function fixture(t, patch = {}, pressure = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-adaptive-independent-'));
  const config = contextConfig({ prepareContinueTokens: 1, keepTailEvents: 0, digestEvery: 1, digestWindow: 2,
    traceEnabled: true, flushIdleMs: 0, coordinatorMinGapMs: 0, surgeryCooldownSteps: 0, ...patch });
  const calls = [], session = new FixtureSession(); system(session);
  const initial = user(session, '保留当前请求和原始资料。');
  const hub = { store: { dir }, config: () => config, scope: () => ({ mode: 'session', project: '/project' }),
    ctx: { logger: { warn() {} } }, action() {}, async call(agent, kind, request) { calls.push({ kind, request }); return body({ action: 'skip' }); } };
  const pipeline = new ContextPipeline(hub, { ...adapter, pressure: () => pressure });
  const agent = { session, status: 'running' }, state = pipeline.state(session);
  pipeline.agents.set(session.id, agent); state.initialized = true; pipeline.setMode(session, 'adaptive'); state.eventsSincePrepare = 48;
  t.after(async () => { await pipeline.dispose(); rmSync(dir, { recursive: true, force: true }); });
  return { config, calls, session, initial, hub, pipeline, agent, state };
}
function capture(f, patch = {}, confirmed = true, messages = f.session.deriveMessages()) {
  const request = markAgentLoopRequest({ provider: 'provider-a', model: 'model-a', reasoningEffort: 'high', temperature: 0.4,
    maxTokens: 8192, stop: ['END'], sessionId: f.session.id, messages, tools: [], ...patch });
  f.pipeline.adaptive.capture(f.session, request);
  const snapshot = f.pipeline.adaptive.requests.get(f.session.id); if (snapshot) snapshot.confirmed = confirmed;
  return request;
}
async function settle(f) { for (let i = 0; i < 12; i++) await turn(); const jobs = [...f.pipeline.jobs.values()]; if (jobs.length) await Promise.all(jobs); }

for (const change of ['off/on', 'provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop']) {
  test('independent review: late reply cannot cross ' + change, async t => {
    const f = fixture(t); exchange(f.session); exchange(f.session); capture(f);
    let release; f.hub.call = () => new Promise(resolve => { release = resolve; });
    const job = f.pipeline.adaptive.check(f.agent, { force: true }); await turn();
    const signal = f.pipeline.controllers.get(f.session.id + ':adaptive').signal;
    if (change === 'off/on') {
      f.config.contextEnabled = false; f.pipeline.reconfigure(); assert.equal(f.pipeline.adaptive.requests.has(f.session.id), false);
      f.config.contextEnabled = true; f.pipeline.reconfigure(); capture(f, {}, false);
    } else {
      const values = { provider: 'provider-b', model: 'model-b', reasoningEffort: 'low', temperature: 0.2, maxTokens: 4096, stop: ['DIFFERENT'] };
      capture(f, { [change]: values[change] }, false);
    }
    assert.equal(signal.aborted, true); release(compression()); await job;
    assert.equal(f.state.pending, null); assert.equal(f.state.records.length, 0);
    assert.equal(f.pipeline.adaptive.requests.get(f.session.id).confirmed, false);
  });
}

test('independent review: an archived preceding user cannot block new factual work', async t => {
  const f = fixture(t), correction = user(f.session, '修正：编号仍须是字符串。'), events = [correction, ...exchange(f.session)];
  Object.assign(events, { wholeWindow: true, windowSeqs: events.map(e => e.seq), retainedSeqs: [], parents: [] });
  const record = newRecord(f.session, events, { summary: '读取完成。', documents: [] }, f.state.binding);
  f.state.records.push(record); await f.pipeline.applyReady(f.agent, { manual: true, ids: [record.id], mode: 'brief' });
  assert.equal(f.session.surface.nodes.includes(correction.seq), false);
  exchange(f.session); exchange(f.session); capture(f);
  let offered; f.hub.call = async (_agent, _kind, request) => { offered = input(request); return compression(); };
  await f.pipeline.adaptive.check(f.agent, { force: true });
  const fresh = offered.candidates.find(c => c.id === 'new-window'); assert(fresh);
  assert.equal(fresh.decision_sources.some(s => s.seq === correction.seq), false);
  assert.equal(f.state.pending.source, 'adaptive'); assert.equal(f.state.records.at(-1).summary, '读取完成。');
});

test('independent review: the 33rd unoffered prepared ID is rejected', async t => {
  const f = fixture(t);
  for (let i = 0; i < 33; i++) f.state.records.push(newRecord(f.session, exchange(f.session), { summary: '第 ' + i + ' 次读取完成。', documents: [] }, f.state.binding));
  const omitted = f.state.records.at(-1).id; capture(f);
  let offered; f.hub.call = async (_agent, _kind, request) => { offered = input(request); return body({ action: 'compress', choices: [{ id: omitted, action: 'brief' }] }); };
  await f.pipeline.adaptive.check(f.agent, { force: true });
  assert.equal(offered.candidates.length, 32); assert.equal(offered.candidates.some(c => c.id === omitted), false);
  assert.equal(f.state.pending, null); assert.equal(f.state.records.length, 33); assert.match(f.state.adaptive.error, /未提供/);
});

test('independent review: switching to pipeline reviews shared preparation once', async t => {
  const f = fixture(t, { coordinatorEvery: 3 }); exchange(f.session); exchange(f.session); capture(f);
  f.hub.call = async (_agent, kind, request) => {
    f.calls.push({ kind, request }); if (kind === 'adaptive') return compression();
    return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: f.state.records.map(r => ({ action: 'brief', ids: [r.id] })) } }] };
  };
  await f.pipeline.adaptive.check(f.agent, { force: true }); assert.equal(f.state.review.newRecords, 1);
  f.pipeline.setMode(f.session, 'pipeline'); await settle(f);
  assert.deepEqual(f.calls.map(c => c.kind), ['adaptive', 'coordinate']); assert.equal(f.state.pending.source, 'coordinator'); assert.equal(f.state.records.length, 1);
});

function traceFixture(f, legacy, reasoning = '之前的思考。'.repeat(500), output = undefined) {
  const thought = f.session.append('assistant/message', { message: { id: 'reasoning-only', role: 'assistant', source: { kind: 'model', model: 'model-a' }, content: [{ type: 'reasoning', text: reasoning }] } }, { surfaceOp: 'append' });
  const trace = adapter.append(f.session, { kind: 'trace', id: 'trace-main', text: 'Previous analysis', original: f.initial.data }, { op: 'replace', startSeq: f.initial.seq, endSeq: f.initial.seq }, [f.initial.seq]);
  f.state.traceSlot = { carrierSeq: trace.seq, sourceSeq: thought.seq, original: f.initial.data, ...(!legacy ? { movedSourceSeqs: [thought.seq] } : {}) };
  exchange(f.session, output); exchange(f.session, output);
  const messages = withoutMovedReasoning(f.session.deriveMessages(), f.session, f.state.traceSlot);
  assert.equal(messages.some(m => m.id === 'reasoning-only'), false); capture(f, {}, true, messages); return thought;
}
for (const legacy of [false, true]) {
  test('independent review: native Trace projection keeps factual work moving, legacy=' + legacy, async t => {
    const f = fixture(t), thought = traceFixture(f, legacy); let offered;
    f.hub.call = async (_agent, _kind, request) => { offered = input(request); return compression(); };
    await f.pipeline.adaptive.check(f.agent, { force: true });
    const fresh = offered.candidates.find(c => c.id === 'new-window'); assert(fresh);
    assert.equal(fresh.summary_scope.includes(thought.seq), false); assert.equal(fresh.messages.some(m => m.seq === thought.seq), false);
    assert.equal(f.state.pending.source, 'adaptive'); assert.equal(f.session.surface.nodes.includes(f.state.traceSlot.carrierSeq), true);
  });
}
test('independent review: hidden long reasoning cannot satisfy minimum factual workload', async t => {
  const f = fixture(t, { prepareContinueTokens: 1000 }); traceFixture(f, true, '隐藏长思考。'.repeat(10000), 'ok');
  const before = JSON.stringify(f.session.snapshotEvents()); await f.pipeline.adaptive.check(f.agent, { force: true });
  assert.equal(f.calls.length, 0); assert.equal(f.state.pending, null); assert.equal(JSON.stringify(f.session.snapshotEvents()), before);
});

test('independent review: cooldown deadline checks an unchanged fingerprint without a loop', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t, { coordinatorMinGapMs: 20 }, 0.8); exchange(f.session); exchange(f.session); capture(f);
  await f.pipeline.adaptive.check(f.agent, { force: true }); await f.pipeline.adaptive.check(f.agent);
  assert.equal(f.pipeline.timers.has(f.session.id + ':adaptive'), true); t.mock.timers.tick(20); await settle(f);
  assert.equal(f.calls.length, 1); assert.equal(f.pipeline.timers.has(f.session.id + ':adaptive'), false);
  t.mock.timers.tick(1000); await settle(f); assert.equal(f.calls.length, 1);
});
test('independent review: a confirmed snapshot during a job is checked once after its deadline', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t, { coordinatorMinGapMs: 20 }, 0.8); exchange(f.session); exchange(f.session); capture(f);
  let release; f.hub.call = async (_agent, kind, request) => { f.calls.push({ kind, request }); if (f.calls.length === 1) return new Promise(resolve => { release = resolve; }); return body({ action: 'skip' }); };
  const first = f.pipeline.adaptive.check(f.agent, { force: true }); await turn();
  f.session.append('assistant/message', { message: { id: 'new-progress', role: 'assistant', source: { kind: 'model', model: 'model-a' }, content: [{ type: 'text', text: '新的实际进展。' }] } }, { surfaceOp: 'append' });
  capture(f, {}, false); f.pipeline.mainSucceeded(f.session, { provider: 'provider-a', model: 'model-a' });
  release(body({ action: 'skip' })); await first; await settle(f);
  assert.equal(f.pipeline.timers.has(f.session.id + ':adaptive'), true); t.mock.timers.tick(20); await settle(f); assert.equal(f.calls.length, 2);
  await f.pipeline.adaptive.check(f.agent); t.mock.timers.tick(20); await settle(f); t.mock.timers.tick(1000); await settle(f);
  assert.equal(f.calls.length, 2); assert.equal(f.pipeline.timers.has(f.session.id + ':adaptive'), false);
});
test('independent review: a confirmed new route grants one probe and the same route never renews it', async t => {
  const f = fixture(t, {}, 0.8); exchange(f.session); exchange(f.session); const old = capture(f, {}, false);
  f.state.adaptive = { failures: f.config.backgroundMaxRetries + 1, failureRoute: routeHash(old) };
  capture(f, { reasoningEffort: 'low' }, false); await f.pipeline.adaptive.check(f.agent);
  assert.equal(f.calls.length, 0); assert.equal(f.state.adaptive.failures, f.config.backgroundMaxRetries + 1);
  f.hub.call = async (_agent, kind, request) => { f.calls.push({ kind, request }); throw Error('503 still unavailable'); };
  f.pipeline.mainSucceeded(f.session, { provider: 'wrong', model: 'model-a' }); await settle(f); assert.equal(f.calls.length, 0);
  f.pipeline.mainSucceeded(f.session, { provider: 'provider-a', model: 'model-a' }); await settle(f);
  assert.equal(f.calls.length, 1); assert.equal(f.state.adaptive.failures, f.config.backgroundMaxRetries + 1);
  f.pipeline.mainSucceeded(f.session, { provider: 'provider-a', model: 'model-a' }); await settle(f);
  assert.equal(f.calls.length, 1, 'the same successful request confirmation cannot grant another probe');
  capture(f, { reasoningEffort: 'low' }, false); f.pipeline.mainSucceeded(f.session, { provider: 'provider-a', model: 'model-a' }); await settle(f);
  assert.equal(f.calls.length, 1); assert.equal(f.state.adaptive.failures, f.config.backgroundMaxRetries + 1);
});
test('independent review: a changed main parameter invalidates the old skip fingerprint', async t => {
  const f = fixture(t, {}, 0.8); exchange(f.session); exchange(f.session); capture(f);
  await f.pipeline.adaptive.check(f.agent, { force: true }); assert.equal(f.calls.length, 1);
  capture(f, { reasoningEffort: 'low' }, false); f.pipeline.mainSucceeded(f.session, { provider: 'provider-a', model: 'model-a' }); await settle(f);
  assert.equal(f.calls.length, 2);
});
