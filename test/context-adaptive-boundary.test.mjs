import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { FixtureSession, system, user, exchange, adapter } from './context-fixture.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-adaptive-boundary-'));
  const config = contextConfig({ digestEvery: 1000, digestWindow: 4, keepTailEvents: 1,
    prepareContinueTokens: 1, traceEnabled: false, coordinatorMinGapMs: 0,
    surgeryCooldownSteps: 0, flushIdleMs: 0 });
  const session = new FixtureSession(); system(session); user(session, '保留原文端口 9123。');
  exchange(session); exchange(session);
  let calls = 0;
  const hub = { store: { dir }, config: () => config, scope: () => ({ mode: 'session', project: '/project' }),
    ctx: { logger: { warn() {} } }, action() {}, async call() {
      calls++;
      return { blocks: [{ type: 'text', text: JSON.stringify({ action: 'compress',
        choices: [{ id: 'new-window', action: 'brief' }],
        prepared: { summary: '读取了工具返回的原始资料。', documents: [] } }) }] };
    } };
  const pipelines = [], create = () => {
    const pipeline = new ContextPipeline(hub, adapter); pipelines.push(pipeline); return pipeline;
  };
  const pipeline = create(), agent = { session, status: 'running' };
  const route = { provider: 'main-provider', model: 'main-model', reasoningEffort: 'high',
    temperature: 0.4, maxTokens: 8192, stop: ['END'] };
  pipeline.agents.set(session.id, agent); pipeline.setMode(session, 'adaptive');
  pipeline.adaptive.capture(session, markAgentLoopRequest({ ...route,
    sessionId: session.id, messages: session.deriveMessages(), tools: [] }));
  pipeline.adaptive.requests.get(session.id).confirmed = true;
  t.after(async () => { await Promise.all(pipelines.map(p => p.dispose())); rmSync(dir, { recursive: true, force: true }); });
  return { session, agent, pipeline, hub, create, route, calls: () => calls };
}

async function prepared(f) {
  await f.pipeline.adaptive.check(f.agent, { force: true });
  const state = f.pipeline.state(f.session);
  assert.equal(state.pending?.source, 'adaptive');
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].mode, 'raw');
  return state;
}

test('automatic adaptive plan is discarded when the user changes requirements before application', async t => {
  const f = fixture(t), state = await prepared(f), record = structuredClone(state.records[0]);
  const correction = user(f.session, '先不要压缩；接下来逐项检查前面的完整工具输出。');
  f.pipeline.observe(f.session, correction);
  const before = structuredClone(f.session.snapshotEvents()), nodes = [...f.session.surface.nodes];
  const result = await f.pipeline.applyReady(f.agent);
  assert.equal(result, null, 'the old decision must not be applied to a new user request');
  assert.equal(state.pending, null, 'the stale plan must release the next independent check');
  assert.deepEqual(state.records[0], record, 'validated preparation remains in the existing archive');
  assert.deepEqual(f.session.snapshotEvents(), before);
  assert.deepEqual(f.session.surface.nodes, nodes);
  assert.equal(f.calls(), 1, 'the boundary does not synchronously ask another model');
});

test('a restored adaptive plan cannot bypass a new user requirement on its first request', async t => {
  const f = fixture(t), original = await prepared(f), record = structuredClone(original.records[0]);
  await f.pipeline.dispose(f.session.id);
  const restored = f.create(); restored.agents.set(f.session.id, f.agent);
  assert.equal(restored.mode(f.session), 'adaptive');
  assert.equal(restored.adaptive.requests.size, 0);
  user(f.session, '修正：完整资料要留在当前上下文，再核对一次。');
  const before = structuredClone(f.session.snapshotEvents()), nodes = [...f.session.surface.nodes];
  const result = await restored.applyReady(f.agent);
  assert.equal(result, null);
  assert.equal(restored.state(f.session).pending, null);
  assert.deepEqual(restored.state(f.session).records[0], record);
  assert.deepEqual(f.session.snapshotEvents(), before);
  assert.deepEqual(f.session.surface.nodes, nodes);
  assert.equal(f.calls(), 1);
});

test('an unchanged adaptive plan still applies once at its safe boundary', async t => {
  const f = fixture(t), state = await prepared(f);
  const result = await f.pipeline.applyReady(f.agent);
  assert.equal(result.source, 'adaptive');
  assert.equal(state.pending, null); assert.equal(state.transaction, null);
  assert.equal(state.records[0].mode, 'brief');
  const count = f.session.snapshotEvents().length;
  assert.equal(await f.pipeline.applyReady(f.agent), null);
  assert.equal(f.session.snapshotEvents().length, count);
  assert.equal(f.calls(), 1);
});

test('a replacement already written before a flush failure completes recovery after a user append', async t => {
  const f = fixture(t), state = await prepared(f);
  f.pipeline.adapter = { ...adapter, async flush() { throw Error('simulated flush failure'); } };
  await assert.rejects(f.pipeline.applyReady(f.agent), /simulated flush failure/);
  const transactionId = state.transaction.id, count = f.session.snapshotEvents().length;
  user(f.session, '保留刚追加的纠正，并继续恢复。');
  await f.pipeline.dispose(f.session.id);
  const restored = f.create(); restored.agents.set(f.session.id, f.agent);
  const result = await restored.applyReady(f.agent);
  assert.equal(result.id, transactionId);
  assert.equal(restored.state(f.session).transaction, null);
  assert.equal(restored.state(f.session).pending, null);
  assert.equal(restored.state(f.session).records[0].mode, 'brief');
  assert.equal(f.session.snapshotEvents().length, count + 1, 'recovery never duplicates an already written checkpoint');
  assert.match(f.session.deriveMessages().at(-1).content[0].text, /刚追加的纠正/);
  assert.equal(f.calls(), 1);
});

const changed = { provider: 'changed-provider', model: 'changed-model', reasoningEffort: 'low',
  temperature: 0.1, maxTokens: 4096, stop: ['DIFFERENT'] };
for (const restart of [false, true]) for (const key of Object.keys(changed)) {
  test(`pending adaptive plan cannot cross a changed ${key} at application, restart=${restart}`, async t => {
    const f = fixture(t), state = await prepared(f), record = structuredClone(state.records[0]);
    let pipeline = f.pipeline;
    if (restart) {
      await pipeline.dispose(f.session.id);
      pipeline = f.create(); pipeline.agents.set(f.session.id, f.agent);
      assert.equal(pipeline.adaptive.requests.size, 0);
    }
    const before = structuredClone(f.session.snapshotEvents()), nodes = [...f.session.surface.nodes];
    assert.equal(await pipeline.applyReady(f.agent, { route: { ...f.route, [key]: changed[key] } }), null);
    assert.equal(pipeline.state(f.session).pending, null);
    assert.deepEqual(pipeline.state(f.session).records[0], record);
    assert.deepEqual(f.session.snapshotEvents(), before);
    assert.deepEqual(f.session.surface.nodes, nodes);
    assert.equal(f.calls(), 1);
  });
}

test('the effective adapter defaults keep an unchanged proposal eligible at preStep', async t => {
  const f = fixture(t), state = await prepared(f), signal = new AbortController().signal;
  const proposal = { provider: f.route.provider, model: f.route.model, temperature: f.route.temperature, stop: f.route.stop };
  let lookups = 0;
  f.hub.ctx.llm = { async prepareCall(route, actualSignal) {
    lookups++; assert.deepEqual(route, proposal); assert.equal(actualSignal, signal);
    return { config: { ...f.route }, stream() { throw Error('normalization never generates a response'); } };
  } };
  const result = await f.pipeline.preStep(f.agent, signal, proposal);
  assert.equal(lookups, 1);
  assert.equal(result.source, 'adaptive');
  assert.equal(state.records[0].mode, 'brief'); assert.equal(state.pending, null);
  assert.equal(f.calls(), 1);
});

test('an effective adapter default change discards the pending plan before the next request', async t => {
  const f = fixture(t), state = await prepared(f), record = structuredClone(state.records[0]);
  const proposal = { provider: f.route.provider, model: f.route.model, temperature: f.route.temperature, stop: f.route.stop };
  let lookups = 0;
  f.hub.ctx.llm = { async prepareCall() { lookups++; return { config: { ...f.route, maxTokens: 4096 } }; } };
  const before = structuredClone(f.session.deriveMessages());
  assert.equal(await f.pipeline.preStep(f.agent, new AbortController().signal, proposal), null);
  assert.equal(lookups, 1); assert.equal(state.pending, null);
  assert.deepEqual(state.records[0], record);
  assert.deepEqual(f.session.deriveMessages(), before);
  assert.equal(f.calls(), 1);
});

test('an explicit manual override can apply saved preparation despite changed requirements and route', async t => {
  const f = fixture(t), state = await prepared(f);
  user(f.session, '现在明确使用保存的简版资料。');
  const result = await f.pipeline.applyReady(f.agent, { manual: true, ids: [state.records[0].id], mode: 'brief',
    route: { ...f.route, model: 'changed-model' } });
  assert.equal(result.source, 'manual'); assert.equal(state.records[0].mode, 'brief');
  assert.equal(state.pending, null); assert.equal(f.calls(), 1);
});
