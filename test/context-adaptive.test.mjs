import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { AdaptiveCompaction, installAdaptiveCapture } from '../src/context/adaptive.mjs';
import { Hub } from '../src/hub.mjs';
import { FixtureSession, system, user, exchange, adapter } from './context-fixture.mjs';
import { originalRecallContent, registerContextRecall } from '../src/context/recall.mjs';

function fixture(t, patch = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-adaptive-'));
  const config = contextConfig({ digestEvery: 1000, digestWindow: 4, keepTailEvents: 1, prepareContinueTokens: 1,
    traceEnabled: false, coordinatorMinGapMs: 0, surgeryCooldownSteps: 0, flushIdleMs: 0, ...patch });
  const session = new FixtureSession(); system(session); user(session, '保留中文和端口 9123。');
  exchange(session); exchange(session);
  const hub = { store: { dir }, config: () => config, scope: () => ({ mode: 'session', project: '/project' }),
    ctx: { logger: { warn() {} } }, action() {}, async call() { throw Error('unexpected background call'); } };
  const pipeline = new ContextPipeline(hub, adapter), agent = { session, options: {}, status: 'running' };
  t.after(async () => { await pipeline.dispose(); rmSync(dir, { recursive: true, force: true }); });
  const state = pipeline.state(session);
  pipeline.agents.set(session.id, agent);
  pipeline.setMode(session, 'adaptive');
  const snapshot = markAgentLoopRequest({ provider: 'main-provider', model: 'main-model', temperature: 0.4,
    reasoningEffort: 'high', maxTokens: 8192, stop: ['STOP'], sessionId: session.id,
    messages: session.deriveMessages(), tools: [{ name: 'write', parameters: { type: 'object' } }],
    toolHistory: [{ name: 'write', version: 1 }], signal: new AbortController().signal });
  pipeline.adaptive.capture(session, snapshot);
  pipeline.adaptive.requests.get(session.id).confirmed = true;
  session.append('assistant/message', { message: { id: 'new-answer', role: 'assistant', source: { kind: 'model', model: 'main-model' }, content: [{ type: 'text', text: '继续工作。' }] } }, { surfaceOp: 'append' });
  return { hub, pipeline, agent, session, state, snapshot, config };
}
const body = value => ({ blocks: [{ type: 'text', text: JSON.stringify(value) }], usage: { cacheReadTokens: 321 } });
function decision(request, patch = {}) {
  const input = JSON.parse(request.messages.at(-1).content[0].text.split('\n\n').at(-1));
  const candidate = input.candidates.find(c => c.id === 'new-window');
  assert(candidate);
  return { action: 'compress', choices: [{ id: 'new-window', action: 'brief' }], prepared: { summary: '读取了两份资料。', documents: [],
    decisions: [{ seq: candidate.decision_sources[0].seq, text: '保留中文和端口 9123。', quote: '保留中文和端口 9123' }] }, ...patch };
}

test('adaptive request retains main prefix and knobs, stays independent, and skip leaves surface intact', async t => {
  const f = fixture(t), before = JSON.stringify(f.session.snapshotEvents()); let called = 0;
  f.hub.call = async (_agent, kind, request) => {
    called++; assert.equal(kind, 'adaptive'); assert.equal(request.purpose, 'compaction'); assert.equal(isAgentLoopRequest(request), false);
    for (const key of ['provider','model','temperature','reasoningEffort','maxTokens','stop','tools','toolHistory']) assert.deepEqual(request[key], f.snapshot[key]);
    assert.deepEqual(request.messages.slice(0, -1), f.snapshot.messages); assert.equal(request.signal, undefined);
    return body({ action: 'skip', reason: '本段仍有用。' });
  };
  await f.pipeline.adaptive.check(f.agent, { force: true });
  assert.equal(called, 1); assert.equal(JSON.stringify(f.session.snapshotEvents()), before);
  assert.equal(f.state.records.length, 0); assert.equal(f.state.pending, null);
  assert.equal(f.pipeline.view(f.session).adaptive.cacheReadTokens, 321);
  await f.pipeline.adaptive.check(f.agent); assert.equal(called, 1);
});

test('valid preparation uses OMD provenance and only replaces at the next safe boundary', async t => {
  const f = fixture(t), before = JSON.stringify(f.session.deriveMessages());
  f.hub.call = async (_a, _k, request) => body(decision(request));
  await f.pipeline.adaptive.check(f.agent, { force: true });
  assert.equal(JSON.stringify(f.session.deriveMessages()), before);
  assert.equal(f.state.pending.source, 'adaptive'); assert.equal(f.state.records.length, 1);
  assert.equal(f.state.records[0].decisions[0].quote, '保留中文和端口 9123');
  assert.equal(f.state.records[0].userOriginals[0].content[0].text, '保留中文和端口 9123。');
  await f.pipeline.applyReady(f.agent);
  assert.equal(f.state.records[0].mode, 'brief');
  assert.equal(f.state.pending, null); assert.match(f.pipeline.recall(f.session, { id: f.state.records[0].id }), /9123/);
});

test('background does not await the next main step and late completion cannot cross a mode switch', async t => {
  const f = fixture(t); let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  f.hub.call = async (_a, _k, request) => { started(); await new Promise(resolve => { release = resolve; }); return body(decision(request)); };
  const job = f.pipeline.adaptive.check(f.agent, { force: true }); await entered;
  await f.pipeline.preStep(f.agent, new AbortController().signal);
  assert.equal(f.pipeline.view(f.session).adaptive.running, true);
  f.pipeline.setMode(f.session, 'pipeline'); release(); await job;
  assert.equal(f.state.pending, null); assert.equal(f.state.records.length, 0);
  assert.equal(f.pipeline.view(f.session).compressionMode, 'pipeline');
});

test('new user corrections while background runs discard the result without changing archives', async t => {
  const f = fixture(t); let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  f.hub.call = async (_a, _k, request) => { started(); await new Promise(resolve => { release = resolve; }); return body(decision(request)); };
  const job = f.pipeline.adaptive.check(f.agent, { force: true }); await entered;
  user(f.session, '修正：端口改成 9124。'); release(); await job;
  assert.equal(f.state.pending, null); assert.equal(f.state.records.length, 0);
  assert.equal(f.state.adaptive.lastDecision, 'stale');
});

test('tool calls, invented quotes, unknown IDs and duplicate selections never publish', async t => {
  for (const kind of ['tool', 'quote', 'unknown', 'duplicate', 'fields']) {
    const f = fixture(t);
    f.hub.call = async (_a, _k, request) => {
      if (kind === 'tool') return { blocks: [{ type: 'tool-call', name: 'write', arguments: '{"file":"bad"}' }] };
      const d = decision(request);
      if (kind === 'quote') d.prepared.decisions[0].quote = '用户从未说过';
      if (kind === 'unknown') d.choices[0].id = 'unknown';
      if (kind === 'duplicate') d.choices.push(d.choices[0]);
      if (kind === 'fields') d.prepared.future_plan = 'not a record';
      return body(d);
    };
    const before = JSON.stringify(f.session.snapshotEvents());
    await f.pipeline.adaptive.check(f.agent, { force: true });
    assert.equal(f.state.pending, null, kind); assert.equal(f.state.records.length, 0, kind);
    assert.equal(JSON.stringify(f.session.snapshotEvents()), before); assert.ok(f.state.adaptive.error, kind);
  }
});

test('mode is persistent, restart waits for a new main request, and default remains pipeline', t => {
  const f = fixture(t);
  assert.equal(f.pipeline.mode(new FixtureSession('new')), 'pipeline');
  f.pipeline.store.release(f.session.id);
  assert.equal(f.pipeline.mode(f.session), 'adaptive');
  const restored = new AdaptiveCompaction(f.pipeline);
  assert.equal(restored.requests.size, 0);
  assert.throws(() => f.pipeline.setMode(f.session, 'invalid'), /模式/);
  const restoredState = f.pipeline.state(f.session);
  restoredState.transaction = { id: 'in-progress' };
  assert.throws(() => f.pipeline.setMode(f.session, 'pipeline'), /尚未完成/);
  restoredState.transaction = null;
});

test('capture ignores background/unmanaged envelopes and disposal releases snapshot ownership', async t => {
  const f = fixture(t), listeners = [];
  const ctx = { sessions: { get: () => f.session }, on: (_name, listener) => listeners.push(listener) };
  installAdaptiveCapture(ctx, () => true, f.pipeline);
  const old = f.pipeline.adaptive.requests.get(f.session.id);
  listeners[0]({ ...f.snapshot, purpose: 'compaction' }, () => 'stream');
  assert.equal(f.pipeline.adaptive.requests.get(f.session.id), old);
  await f.pipeline.dispose(f.session.id);
  assert.equal(f.pipeline.adaptive.requests.size, 0);
});

test('Hub adaptive dispatch bypasses configured background model while preserving native usage and cancellation', async () => {
  let sent, resolved = 0, metric;
  const f = { route: () => ({ provider: 'wrong-provider', model: 'wrong-model' }), config: () => ({ jobTimeoutMs: 1000 }), live: new Map(),
    efforts: { resolve: () => { resolved++; throw Error('must not resolve background effort'); } },
    ctx: { llm: { async *stream(options) { sent = options; yield { type: 'text-delta', index: 0, text: 'ok' }; yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 2 } }; yield { type: 'finish', finish: { kind: 'stop' } }; } } },
    record(_session, _kind, entry) { metric = entry; } };
  await Hub.prototype.call.call(f, { session: { id: 's' } }, 'adaptive', { provider: 'actual', model: 'actual-model', reasoningEffort: 'high', messages: [], tools: [], purpose: 'compaction' }, new AbortController().signal);
  assert.equal(resolved, 0); assert.equal(sent.provider, 'actual'); assert.equal(sent.model, 'actual-model');
  assert.equal(sent.reasoningEffort, 'high'); assert.equal(sent.purpose, 'compaction'); assert.equal(metric.provider, 'actual'); assert.equal(f.live.size, 0);
});

test('recall validates search before cross-session reads and old directory routes remain unchanged', async t => {
  const f = fixture(t); let reads = 0, definition;
  f.hub.dream = { sources: { async read(id) { reads++; return { header: { id }, inherited: 0, events: f.session.snapshotEvents() }; } } };
  await assert.rejects(originalRecallContent(f.hub, { search: 'original', query: '', sessionId: 'other' }, f.session), /query/);
  assert.equal(reads, 0);
  const content = await originalRecallContent(f.hub, { search: 'original', query: '9123' }, f.session);
  assert.match(content[0].text, /9123/); assert.equal(reads, 0);
  f.hub.context = f.pipeline;
  registerContextRecall({ tools: { register(tool) { definition = tool; } } }, f.hub);
  const result = definition.execute({ query: 'no-summary' }, { agent: f.agent });
  assert.equal(typeof result, 'string'); assert.match(result, /No matching saved summaries/);
  assert.throws(() => definition.execute({ limit: 5 }, { agent: f.agent }), /仅用于/);
});
