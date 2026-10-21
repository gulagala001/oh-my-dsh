import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { newRecord } from '../src/context/core.mjs';
import { DreamService } from '../src/dream/service.mjs';

for (const lifecycle of ['released', 'replaced', 'retained']) test('a coordinator waiting for preparation respects the ' + lifecycle + ' agent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-coordinate-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('coordinate-release');
  const user = text => session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' });
  const add = id => session.append('assistant/message', { turn: 1, step: 1,
    message: { id, role: 'assistant', source: { kind: 'model', model: 'isolated' }, content: [{ type: 'text', text: 'Recorded findings. '.repeat(300) }] } }, { surfaceOp: 'append' });
  user('Keep the original user request.');
  const original = add('existing'), ready = Promise.withResolvers(), late = Promise.withResolvers(), calls = [];
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'release-test' }),
    config: () => ({ contextEnabled: true, traceEnabled: false, keepTailEvents: 0, prepareContinueTokens: 1, coordinatorMinGapMs: 0, coordinatorEvery: 1 }),
    action() {}, event() {}, ctx: { sessions: { async flush() {} } },
    async call(_agent, kind) {
      calls.push(kind);
      if (kind === 'prepare') { ready.resolve(); return late.promise; }
      return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] };
    } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle' };
  pipeline.agents.set(session.id, agent);
  const state = pipeline.state(session), record = newRecord(session, [original], { summary: 'Earlier findings.', documents: [] }, state.binding, { state });
  state.records.push(record); state.review.newRecords = 1;
  add('fresh');
  const preparing = pipeline.prepare(agent, true);
  await ready.promise;
  const reviewing = pipeline.coordinate(agent, true);
  user('Keep this new input arriving while preparation is running.');
  const before = structuredClone(session.snapshotEvents());
  let disposed;
  if (lifecycle !== 'retained') {
    disposed = pipeline.dispose(session.id);
    if (lifecycle === 'replaced') pipeline.agents.set(session.id, { session, status: 'idle' });
  }
  late.resolve({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Late summary.', documents: [] } }] });
  await Promise.all([preparing, reviewing, disposed]);
  assert.deepEqual(session.snapshotEvents(), before, 'Background preparation never overwrites user input or original events');
  if (lifecycle === 'retained') {
    assert.deepEqual(calls, ['prepare', 'coordinate']);
    assert.ok(state.pending);
  } else {
    assert.deepEqual(calls, ['prepare'], 'A released or superseded agent must not launch a new call after its wait');
    assert.equal(state.records.length, 1, 'A cancelled late preparation must not publish a record');
    assert.equal(state.pending, null);
  }
  assert.deepEqual(state.failures, {});
});

async function fixture(t, settings = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-context-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { contextEnabled: true, traceEnabled: false, keepTailEvents: 0, prepareContinueTokens: 1, coordinatorMinGapMs: 0, backgroundConcurrency: 1, ...settings };
  const session = Session.create('lifecycle');
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep the original request.' }] }), { surfaceOp: 'append' });
  const original = session.append('assistant/message', { turn: 1, step: 1, message: { id: 'original', role: 'assistant',
    source: { kind: 'model', model: 'fixture' }, content: [{ type: 'text', text: 'Original observations. '.repeat(500) }] } }, { surfaceOp: 'append' });
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: session.id }), config: () => config,
    action() {}, event() {}, ctx: { tokenMeter: { measure: () => ({ totalTokens: 0 }) } } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub)), agent = { session, status: 'idle' };
  pipeline.agents.set(session.id, agent);
  t.after(() => pipeline.dispose());
  return { hub, pipeline, agent, session, original, config };
}

for (const kind of ['prepare', 'coordinate']) test('disabling automatic context cancels ' + kind + ' without publishing its late reply', async t => {
  const { hub, pipeline, agent, session, original, config } = await fixture(t);
  const entered = Promise.withResolvers(), reply = Promise.withResolvers();
  let signal;
  hub.call = async (_agent, _kind, _request, own) => { signal = own; entered.resolve(); return reply.promise; };
  const state = pipeline.state(session), before = structuredClone(session.snapshotEvents());
  if (kind === 'coordinate') state.records.push(newRecord(session, [original], { summary: 'Existing archive.', documents: [] }, state.binding, { state }));
  const job = pipeline[kind](agent, true);
  await entered.promise;
  config.contextEnabled = false; pipeline.reconfigure();
  reply.resolve({ blocks: [{ type: 'tool-call', name: kind === 'prepare' ? 'prepare_segment' : 'submit_context_choices',
    arguments: kind === 'prepare' ? { summary: 'Late summary.', documents: [] } : { choices: [{ action: 'brief', ids: [state.records[0].id] }] } }] });
  await job;
  assert.equal(signal.aborted, true);
  assert.equal(state.records.length, kind === 'prepare' ? 0 : 1);
  assert.equal(state.pending, null); assert.deepEqual(state.failures, {});
  assert.equal(pipeline.timers.size, 0);
  assert.deepEqual(session.snapshotEvents(), before);
});

test('unrelated settings keep Auto Compact running and concurrency increases admit queued work in priority order', async t => {
  const { pipeline, agent, config } = await fixture(t, { autoCompactEnabled: true });
  const key = agent.session.id + ':autoCompact', controller = new AbortController(), maintenance = Promise.withResolvers();
  pipeline.controllers.set(key, controller); pipeline.jobs.set(key, maintenance.promise);
  const state = pipeline.state(agent.session); state.autoCompact = { lastKey: 'unchanged-material' };
  const busy = Promise.withResolvers(), order = [];
  const first = pipeline.withCallSlot(() => busy.promise);
  const dream = pipeline.withCallSlot(() => { order.push('dream'); }, undefined, true);
  const foreground = pipeline.withCallSlot(() => { order.push('foreground'); });
  try {
    config.identityPrompt = 'Changed presentation only'; config.backgroundConcurrency = 2;
    pipeline.reconfigure();
    await new Promise(setImmediate);
    assert.deepEqual(order, ['foreground', 'dream']);
    assert.equal(controller.signal.aborted, false);
    assert.equal(state.autoCompact.lastKey, 'unchanged-material');
  } finally {
    busy.resolve(); maintenance.resolve();
    pipeline.jobs.delete(key); pipeline.controllers.delete(key);
    await Promise.all([first, dream, foreground]);
  }
});

test('shutdown cancels queued calls, releases read-only states and preserves failed saves for a retry', async t => {
  const { pipeline } = await fixture(t);
  const good = pipeline.store.state('read-only'), dirty = pipeline.store.state('needs-save');
  good.steps = 1; pipeline.store.touch(good); dirty.steps = 2; pipeline.store.touch(dirty);
  const busy = Promise.withResolvers(), first = pipeline.withCallSlot(() => busy.promise);
  let started = false;
  const queued = pipeline.withCallSlot(() => { started = true; });
  const cancelled = assert.rejects(queued, /上下文组件已关闭/);
  const write = pipeline.store.write.bind(pipeline.store), failure = Error('disk unavailable');
  pipeline.store.write = (path, value) => { if (value.id === dirty.id) throw failure; return write(path, value); };
  try {
    await assert.rejects(pipeline.dispose(), error => error instanceof AggregateError && error.errors.includes(failure));
    await cancelled;
    assert.equal(started, false); assert.equal(pipeline.callWaiters.length, 0);
    assert.equal(pipeline.store.cache.has(good.id), false);
    assert.equal(pipeline.store.cache.get(dirty.id), dirty); assert.ok(pipeline.store.dirty.has(dirty.id));
  } finally { pipeline.store.write = write; busy.resolve(); await first; }
  await pipeline.dispose();
  assert.equal(pipeline.store.cache.size, 0);
  assert.equal(pipeline.store.peek(dirty.id).steps, 2);
  await assert.rejects(pipeline.withCallSlot(() => { started = true; }), /上下文组件已关闭/);
});

test('a granted queue slot still checks shutdown before dispatch', async t => {
  const { pipeline, config } = await fixture(t), busy = Promise.withResolvers();
  const first = pipeline.withCallSlot(() => busy.promise);
  let started = false;
  const queued = pipeline.withCallSlot(() => { started = true; });
  const rejected = assert.rejects(queued, /上下文组件已关闭/);
  config.backgroundConcurrency = 2; pipeline.drainCalls();
  try { await pipeline.dispose(); await rejected; assert.equal(started, false); }
  finally { busy.resolve(); await first; }
  assert.equal(pipeline.activeCalls, 0);
});

test('a detached session releases its state after its remaining Dream consumer retires', async t => {
  const { pipeline, hub, agent } = await fixture(t), entered = Promise.withResolvers(), reply = Promise.withResolvers();
  hub.live = new Map();
  const dream = new DreamService(hub, { store: { reserve: () => 'held', settle() {} }, sources: {},
    generate: async () => { entered.resolve(); return reply.promise; } });
  const state = pipeline.state(agent.session); state.steps = 8; pipeline.store.touch(state);
  const running = dream.generate({ kind: 'session', target: agent.session.id, sources: [] }, { id: 'job', route: { provider: 'fixture', model: 'fixture' } }, new AbortController().signal);
  await entered.promise;
  await pipeline.dispose(agent.session.id);
  assert.equal(pipeline.store.cache.get(agent.session.id), state, 'The still-running consumer keeps its current state');
  reply.resolve({ value: 'complete', usage: { inputTokens: 1, outputTokens: 1 } });
  assert.equal(await running, 'complete');
  assert.equal(pipeline.store.cache.has(agent.session.id), false);
  assert.equal(pipeline.releasing.has(agent.session.id), false);
  assert.equal(pipeline.store.peek(agent.session.id).steps, 8);
});
