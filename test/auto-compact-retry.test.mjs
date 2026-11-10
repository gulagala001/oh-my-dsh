import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';

for (const failure of ['provider', 'cancel']) test(`Auto Compact retries unchanged material after ${failure} failure`, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-auto-retry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('auto-compact-retry');
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '保留用户要求。' }] }), { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'source', role: 'assistant', source: { kind: 'model', model: 'fixture' }, content: [{ type: 'text', text: 'Recorded observations. '.repeat(600) }] } }, { surfaceOp: 'append' });
  const original = structuredClone(session.snapshotEvents()), abort = new AbortController();
  let calls = 0;
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'auto-retry' }),
    config: () => ({ memoryCacheEnabled: false, contextEnabled: false, traceEnabled: false, autoCompactEnabled: true, autoCompactThreshold: 1000 }),
    action() {}, event() {},
    ctx: { sessions: { async flush() { return true; } }, tokenMeter: { measure(value) { return { totalTokens: 2000 + Math.ceil(JSON.stringify(value.deriveMessages()).length / 4), nodes: [] }; } } },
    async call(_agent, _kind, _request, signal) {
      calls++;
      if (calls === 1) {
        if (failure === 'cancel') { abort.abort(Error('cancelled request')); signal.throwIfAborted(); }
        throw Error('temporarily unavailable');
      }
      return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Recorded observations retained.', documents: [] } }] };
    },
  };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const agent = { session, status: 'idle', async runMaintenance(run) { return run(new AbortController().signal); } };
  pipeline.agents.set(session.id, agent);
  t.after(() => pipeline.dispose());
  const first = pipeline.autoCompact.check(agent, abort.signal);
  if (failure === 'cancel') await assert.rejects(first, /cancelled request/); else assert.equal(await first, null);
  assert.equal(calls, 1);
  assert.deepEqual(session.snapshotEvents(), original, 'A failed preparation must leave the entire conversation unchanged');
  await pipeline.autoCompact.check(agent, new AbortController().signal);
  assert.equal(calls, 2, 'Failure or cancellation must not be recorded as a completed no-progress fingerprint');
  assert.ok(pipeline.state(session).records.some(record => record.mode === 'detail'));
  assert.equal(pipeline.state(session).failures.autoCompact, undefined, 'Successful recovery clears the active failure');
  assert.equal(pipeline.state(session).autoCompact.error, null);
  assert.deepEqual(session.snapshotEvents().slice(0, original.length), original);
  const before = session.snapshotEvents().length;
  await pipeline.autoCompact.check(agent, new AbortController().signal);
  assert.equal(calls, 2, 'A completed unchanged pass must not request another summary');
  assert.equal(session.snapshotEvents().length, before);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-auto-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('auto-recovery');
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep my request.' }] }), { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'source', role: 'assistant', source: { kind: 'model', model: 'fixture' }, content: [{ type: 'text', text: 'Observations. '.repeat(600) }] } }, { surfaceOp: 'append' });
  const control = { calls: 0, tokens: 5000, error: null, route: { provider: 'fixture', model: 'one' }, config: { memoryCacheEnabled: false, contextEnabled: false, traceEnabled: false, autoCompactEnabled: true, autoCompactThreshold: 1000, backgroundMaxRetries: 2 } };
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'recovery' }), config: () => control.config,
    route: () => control.route, action() {}, event() {},
    ctx: { sessions: { async flush() { return true; } }, tokenMeter: { measure() { return { totalTokens: control.tokens, nodes: [] }; } } },
    async call() { control.calls++; if (control.error) throw control.error; return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Observations retained.', documents: [] } }] }; } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const agent = { session, status: 'idle', async runMaintenance(run) { return run(new AbortController().signal); } };
  pipeline.agents.set(session.id, agent);
  t.after(() => pipeline.dispose());
  return { pipeline, agent, session, control, state: pipeline.state(session) };
}

test('input budget defers unchanged work without failures or repeated notices, and retries changed budgets and routes', async t => {
  const { pipeline: p, agent, session, control, state: s } = await fixture(t);
  control.error = Object.assign(Error('request exceeds input budget'), { code: 'INPUT_BUDGET_EXCEEDED' });
  const original = session.snapshotEvents();
  await p.autoCompact.check(agent);
  assert.equal(s.failures.autoCompact, undefined);
  assert.equal(s.autoCompact.deferred.reason, 'input-budget');
  assert.equal(s.notices.length, 0);
  await p.autoCompact.check(agent);
  assert.equal(control.calls, 1);
  p.store.release(session.id);
  await p.autoCompact.check(agent);
  assert.equal(control.calls, 1, 'deferral survives state reload');
  control.config.prepareInputTokens = 400000;
  await p.autoCompact.check(agent);
  assert.equal(control.calls, 2, 'a new input budget permits another attempt');
  control.route.model = 'two';
  await p.autoCompact.check(agent);
  assert.equal(control.calls, 3, 'a new model route permits another attempt');
  assert.deepEqual(session.snapshotEvents(), original);
  control.tokens = 500;
  const view = p.view(session);
  assert.equal(view.autoCompact.deferred, null);
  assert.equal(view.failures.autoCompact, undefined);
});

test('persistent ordinary errors exhaust a bounded retry allowance without hiding the error', async t => {
  const { pipeline: p, agent, session, control } = await fixture(t);
  control.error = Error('temporarily unavailable');
  for (let i = 0; i < 8; i++) await p.autoCompact.check(agent);
  assert.equal(control.calls, 3);
  assert.equal(p.view(session).failures.autoCompact.count, 3);
  assert.equal(p.state(session).notices.length, 3);
  control.route.model = 'recovered'; control.error = null;
  await p.autoCompact.check(agent);
  assert.equal(control.calls, 4);
  assert.equal(p.view(session).failures.autoCompact, undefined);
});

test('old persisted budget flags become waiting, and successful manual relief clears old errors', async t => {
  const { pipeline: p, session, control, state: s } = await fixture(t);
  s.failures.autoCompact = { code: 'INPUT_BUDGET_EXCEEDED', count: 14, message: 'too large' };
  s.autoCompact = { error: 'too large' }; p.store.save(s); p.store.release(session.id);
  assert.equal(p.view(session).failures.autoCompact, undefined);
  assert.equal(p.view(session).autoCompact.deferred.reason, 'input-budget');
  const loaded = p.state(session);
  loaded.failures.autoCompact = { count: 2, message: 'provider unavailable' };
  loaded.failures.coordinate = { count: 1, message: 'independent failure' };
  loaded.autoCompact.error = 'provider unavailable'; p.store.save(loaded); p.store.release(session.id);
  control.tokens = 500;
  const view = p.view(session);
  assert.equal(view.failures.autoCompact, undefined);
  assert.equal(view.autoCompact.error, null);
  assert.ok(view.failures.coordinate, 'unrelated failures are retained');
  assert.equal(p.store.peek(session.id).failures.autoCompact, undefined);
});

test('manual full compression clears an earlier Auto Compact failure while preserving original events', async t => {
  const { pipeline: p, agent, session, control, state: s } = await fixture(t);
  control.error = Error('temporarily unavailable');
  await p.autoCompact.check(agent);
  const original = structuredClone(session.snapshotEvents());
  p.hub.call = async (_agent, kind) => {
    assert.equal(kind, 'compactFull');
    return { blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'Keep the user request and recorded observations.' } }] };
  };
  const flush = p.adapter.flush;
  p.adapter.flush = async value => { await flush(value); control.tokens = 500; };
  const result = await p.requestCompaction(session, agent, 'full');
  assert.equal(result.changed, true);
  assert.equal(s.failures.autoCompact, undefined);
  assert.equal(s.autoCompact.error, null);
  assert.deepEqual(session.snapshotEvents().slice(0, original.length), original);
});

test('maintenance cancellation does not create a failure or consume a retry', async t => {
  const { pipeline: p, agent, control, state: s } = await fixture(t);
  const abort = new AbortController();
  agent.runMaintenance = run => run(abort.signal);
  p.hub.call = async () => { control.calls++; abort.abort(Error('maintenance stopped')); throw abort.signal.reason; };
  await p.autoCompact.check(agent);
  assert.equal(s.failures.autoCompact, undefined);
  assert.equal(s.notices.length, 0);
});
