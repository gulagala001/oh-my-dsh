import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { installAdaptiveCapture } from '../src/context/adaptive.mjs';
import { Hub } from '../src/hub.mjs';
import { user, system, exchange } from './context-fixture.mjs';

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-memory-cache-'));
  const cfg = contextConfig({ memoryCacheEnabled: true, traceEnabled: false, keepTailEvents: 0,
    prepareContinueTokens: 1, digestWindow: 48, coordinatorEvery: 99, jobTimeoutMs: 0,
    unifiedBackground: { provider: 'background', model: 'small', temperature: 0.1, effort: 'off' }, ...overrides });
  const session = Session.create('memory-cache');
  system(session); const requestUser = user(session, 'Preserve the original records.');
  const work = exchange(session, 'Observed command result. '.repeat(220), 'Earlier analysis.');
  const calls = [], records = [], ready = Promise.withResolvers();
  let reply = async request => request.tools?.[0]?.name === 'prepare_segment'
    ? [{ type: 'tool-call', id: 'prepared', name: 'prepare_segment', arguments: { summary: 'Observed command result.', documents: [] } }]
    : [{ type: 'text', text: JSON.stringify({ summary: 'Observed command result.', documents: [],
      decisions: [{ text: 'Preserve originals.', seq: requestUser.seq, quote: 'Preserve the original records.' }] }) }];
  const hub = { store: { dir }, config: () => cfg, scope: () => ({ mode: 'session', project: 'cache-probe' }),
    action() {}, event() {}, record(_session, kind, value) { records.push({ kind, ...value }); }, live: new Map(), calls: new Map(),
    ctx: { sessions: { async flush() {} }, llm: { async prepareCall(config, signal, select) {
      const finalConfig = select(config, { reasoning: { efforts: [{ id: 'high' }, { id: 'off' }] } });
      return { config: finalConfig, async *stream(request) {
        calls.push(request); ready.resolve(request);
        const blocks = await reply(request);
        for (const [index, block] of blocks.entries()) yield { type: 'block-end', index, block };
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 1000 } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } };
    } } } };
  hub.route = Hub.prototype.route.bind(hub); hub.call = Hub.prototype.call.bind(hub);
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const agent = { session, status: 'idle', options: { provider: 'main', model: 'large' } };
  pipeline.agents.set(session.id, agent);
  const state = pipeline.state(session); state.initialized = true; state.eventsSincePrepare = 48;
  let capture;
  installAdaptiveCapture({ sessions: { get: () => session }, on(_name, handler) { capture = handler; } }, () => true, pipeline);
  const main = extra => markAgentLoopRequest({ provider: 'main', model: 'large', temperature: 0.8, reasoningEffort: 'high', maxTokens: 2048,
    sessionId: session.id, messages: session.deriveMessages(), tools: [{ name: 'read', description: 'Real main tool', parameters: { type: 'object' } }],
    signal: new AbortController().signal, ...extra });
  const take = (request = main(), confirmed = true) => {
    capture(request, () => {});
    if (confirmed) pipeline.mainSucceeded(session, { provider: request.provider, model: request.model });
    return request;
  };
  t.after(async () => { await pipeline.dispose(); await rm(dir, { recursive: true, force: true }); });
  return { cfg, session, work, state, hub, pipeline, agent, calls, records, ready, main, take,
    reply(fn) { reply = fn; } };
}

test('cached preparation preserves the real main request, original cadence and coordinator contract', async t => {
  const f = await fixture(t), main = f.take(), before = structuredClone(main.messages);
  f.state.eventsSincePrepare = 0;
  await f.pipeline.prepare(f.agent);
  assert.equal(f.calls.length, 0, 'Cache mode does not bypass the event cadence');
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.calls.length, 1);
  const sent = f.calls[0];
  for (const key of ['provider', 'model', 'temperature', 'reasoningEffort', 'maxTokens', 'tools', 'system', 'toolHistory', 'sessionId'])
    assert.deepEqual(sent[key], main[key], key);
  assert.deepEqual(sent.messages.slice(0, -1), before);
  assert.deepEqual(main.messages, before);
  assert.notEqual(sent.signal, main.signal);
  assert.equal(isAgentLoopRequest(sent), false);
  assert.equal(sent.purpose, 'compaction');
  const tail = sent.messages.at(-1).content[0].text;
  assert.ok(tail.includes('content_paths') && !tail.includes('Observed command result. '.repeat(10)), 'New suffix references old output without copying it');
  assert.equal(f.state.records.length, 1);
  assert.equal(f.state.records[0].decisions[0].seq, 1);
  assert.equal(f.state.review.needed, true);
  assert.equal(f.state.memoryCache.cacheReadTokens, 1000);
  assert.equal(f.records[0].kind, 'prepare');
  assert.equal(f.hub.route(f.agent, 'coordinate').provider, 'background');
});

test('disabled cache keeps the independent preparation request and tool response', async t => {
  const f = await fixture(t, { memoryCacheEnabled: false });
  f.take();
  assert.equal(f.pipeline.cachedPreparation.requests.size, 0);
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.calls[0].provider, 'background');
  assert.equal(f.calls[0].model, 'small');
  assert.equal(f.calls[0].messages.length, 1);
  assert.equal(f.calls[0].tools[0].name, 'prepare_segment');
  assert.equal(f.state.records.length, 1);
});

test('missing, unconfirmed, incomplete and oversized snapshots wait without uncached fallback', async t => {
  const f = await fixture(t);
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.calls.length, 0);
  const main = f.take(f.main(), false);
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.calls.length, 0);
  f.cfg.prepareInputTokens = Math.ceil(JSON.stringify(main).length / 4);
  f.pipeline.mainSucceeded(f.session, main);
  await f.pipeline.jobs.get(f.session.id + ':prepare');
  assert.equal(f.calls.length, 0);
  assert.match(f.state.memoryCache.waitingReason, /预算/);
  f.cfg.prepareInputTokens = 300000;
  f.take(f.main({ messages: main.messages.slice(0, 2) }));
  await f.pipeline.jobs.get(f.session.id + ':prepare');
  assert.equal(f.calls.length, 0);
  assert.match(f.state.memoryCache.waitingReason, /处理范围/);
  f.take();
  await f.pipeline.jobs.get(f.session.id + ':prepare');
  assert.equal(f.calls.length, 1, 'A successful containing snapshot resumes the deferred manual request');
  assert.equal(f.state.records.length, 1);
  assert.deepEqual(f.state.failures, {});
});

test('source paths exclude recall/task payloads, and generated tool calls never execute or publish', async t => {
  const f = await fixture(t);
  f.session.append('assistant/message', { turn: 1, step: 2, message: { id: 'mixed', role: 'assistant', source: { kind: 'model', model: 'large' },
    content: [{ type: 'text', text: 'New observed fact.' }, { type: 'tool-call', id: 'recall-call', name: 'recall', arguments: '{}' }] } }, { surfaceOp: 'append' });
  f.session.append('tool/result', { turn: 1, step: 2, message: { id: 'recall-result', role: 'tool', toolCallId: 'recall-call',
    content: [{ type: 'text', text: 'Historical memory, not new work.' }] } }, { surfaceOp: 'append' });
  f.take();
  f.reply(async () => [{ type: 'tool-call', id: 'bad', name: 'read', arguments: '{}' }]);
  await f.pipeline.prepare(f.agent, true);
  const text = f.calls[0].messages.at(-1).content[0].text;
  const payload = JSON.parse(text.slice(text.lastIndexOf('\n\n') + 2));
  assert.deepEqual(payload.segment.find(e => e.seq === 4).content_paths, [[0]]);
  assert.ok(!payload.summary_scope.event_seqs.includes(5));
  assert.equal(f.state.records.length, 0);
  assert.equal(f.state.failures.prepare.validation, true);
});

test('disabled, released, changed-route and replaced-source requests cannot publish late replies', async t => {
  for (const change of ['disabled', 'released', 'route', 'source']) {
    const f = await fixture(t), late = Promise.withResolvers();
    f.take(); f.reply(async () => late.promise);
    const job = f.pipeline.prepare(f.agent, true);
    await f.ready.promise;
    let disposed;
    if (change === 'disabled') { f.cfg.memoryCacheEnabled = false; f.pipeline.cachedPreparation.configure(); }
    else if (change === 'released') disposed = f.pipeline.dispose(f.session.id);
    else if (change === 'route') f.take(f.main({ model: 'other' }), false);
    else {
      const a = f.work[0].seq, b = f.work[1].seq;
      f.session.append('user/message', { id: 'replacement', role: 'user', source: { kind: 'plugin:synthetic' }, content: [{ type: 'text', text: 'Already compressed.' }] },
        { surfaceOp: { op: 'replace', startSeq: a, endSeq: b }, sourceEventSeqs: [a, b] });
    }
    late.resolve([{ type: 'text', text: '{"summary":"Late result.","documents":[]}' }]);
    await Promise.all([job, disposed]);
    assert.equal(f.state.records.length, 0, change);
    assert.deepEqual(f.state.failures, {}, change);
  }
});

test('Auto Compact waits for a snapshot and then uses the same cached preparation without enabling normal background work', async t => {
  const f = await fixture(t, { contextEnabled: false, autoCompactEnabled: true, autoCompactThreshold: 100, autoCompactMode: 'brief' });
  f.hub.ctx.tokenMeter = { measure: () => ({ totalTokens: f.session.surface.nodes.includes(f.work[0].seq) ? 500 : 50, nodes: [] }) };
  await f.pipeline.autoCompact.check(f.agent);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.failures.autoCompact, undefined);
  const main = f.take(f.main(), false);
  const newest = f.session.append('assistant/message', { turn: 1, step: 2, message: { id: 'latest-reply', role: 'assistant',
    source: { kind: 'model', model: 'large' }, content: [{ type: 'text', text: 'The latest execution completed.' }] } }, { surfaceOp: 'append' });
  f.pipeline.mainSucceeded(f.session, main);
  await f.pipeline.jobs.get(f.session.id + ':autoCompact');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].messages.slice(0, -1), main.messages);
  assert.ok(f.calls[0].messages.at(-1).content[0].text.includes('The latest execution completed.'));
  assert.ok(f.state.records[0].originalSeqs.includes(newest.seq));
  assert.equal(f.state.records[0].mode, 'brief');
  assert.ok(!f.session.surface.nodes.includes(f.work[0].seq));
  assert.equal(f.state.failures.autoCompact, undefined);
});
