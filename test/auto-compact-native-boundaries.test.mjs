import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createMessage, createUserMessage, createSystemMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { newRecord } from '../src/context/core.mjs';
import { PREPARE_TOOL } from '../src/context/prompts.mjs';

// Native SDK session, pairing, replacement and transaction code. Only the model
// response, persistence flush and heuristic meter are local deterministic seams.
// This tests SDK replay and a controlled flush, not disk/crash durability.
// Missing SDK dependencies must fail this suite, not silently skip it.
const prepared = () => ({ blocks: [{ type: 'tool-call', name: PREPARE_TOOL.name,
  arguments: { summary: 'The completed read returned its observations.', documents: [] } }] });

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-auto-native-boundary-'));
  const session = Session.create('auto-native-boundary');
  const system = session.append('system/message', { turn: 1, step: 1,
    message: createSystemMessage('Protected host instructions.') }, { surfaceOp: 'append' });
  const user = text => session.append('user/message', createUserMessage({ source: { kind: 'user' },
    content: [{ type: 'text', text }] }), { surfaceOp: 'append' });
  const assistant = content => session.append('assistant/message', { turn: 1, step: 1, stream: [],
    message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content }) }, { surfaceOp: 'append' });
  const receipt = (callId, text) => session.append('tool/result', { turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: [{ type: 'text', text }], isError: false }) }, { surfaceOp: 'append' });
  const request = user('Keep this request.');
  const call = assistant([{ type: 'tool-call', id: 'completed-read', name: 'read', arguments: '{}' }]);
  const result = receipt('completed-read', 'Completed observations. '.repeat(600));
  const controls = { calls: [], releases: [], pending: [], async flush() {}, async reply() { throw Error('Unexpected model seam call'); } };
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'auto-native-boundary' }),
    config: () => ({ contextEnabled: false, traceEnabled: false, autoCompactEnabled: true,
      autoCompactMode: 'brief', autoCompactThreshold: 1000, coordinatorEvery: 999,
      digestLookback: 0, keepTailEvents: 0, flushIdleMs: 0 }),
    action() {}, event() {},
    ctx: { sessions: { flush: value => controls.flush(value) }, tokenMeter: { measure(value) {
      return { totalTokens: Math.ceil(JSON.stringify(value.deriveMessages()).length / 4), nodes: [] };
    } } },
    async call(agent, kind, input, signal) {
      controls.calls.push({ kind, input });
      assert.equal(kind, 'prepare', 'No unrelated background request is allowed');
      return controls.reply(agent, input, signal);
    } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const agent = { session, status: 'idle' };
  pipeline.agents.set(session.id, agent);
  t.after(async () => {
    // Release gates before disposing: disposal waits for in-flight jobs.
    for (const release of controls.releases) release();
    await Promise.allSettled(controls.pending);
    await pipeline.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return { session, pipeline, agent, controls, system, request, call, result, user, assistant, receipt };
}

function track(f, promise) {
  f.controls.pending.push(promise);
  // Observe early failures even while the test is waiting for a gate.
  void promise.catch(() => {});
  return promise;
}

function assertReleased(f) {
  const key = f.session.id + ':autoCompact';
  assert.equal(f.pipeline.jobs.has(key), false);
  assert.equal(f.pipeline.controllers.has(key), false);
  assert.equal(f.pipeline.manualSessions.has(f.session.id), false);
}
function assertReplay(f) {
  const replay = Session.create(f.session.id, structuredClone(f.session.snapshotEvents()), f.session.header);
  assert.deepEqual(replay.deriveMessages(), f.session.deriveMessages());
  assert.deepEqual(replay.surface.nodes, f.session.surface.nodes);
}
function assertVisibleUnchanged(f, event) {
  assert.ok(f.session.surface.nodes.includes(event.seq));
  assert.deepEqual(f.session.deriveMessages().find(message => message.id === f.session.deriveEventMessage(event).id),
    f.session.deriveEventMessage(event));
}

test('native Auto Compact keeps active tools and input arriving during preparation', { timeout: 10000 }, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.controls.releases.push(() => release.resolve(prepared()));
  const active = f.assistant([
    { type: 'tool-call', id: 'pending-one', name: 'read', arguments: '{"path":"active-one"}' },
    { type: 'tool-call', id: 'pending-two', name: 'read', arguments: '{"path":"active-two"}' },
  ]);
  const before = structuredClone(f.session.snapshotEvents());
  f.controls.reply = async (_agent, input) => { entered.resolve(input); return release.promise; };
  const running = track(f, f.pipeline.autoCompact.check(f.agent));
  const input = await entered.promise;
  assert.match(JSON.stringify(input.messages), /Completed observations/);
  assert.doesNotMatch(JSON.stringify(input.messages), /pending-one|pending-two|active-one|active-two/,
    'Native pairing excludes the incomplete tool tail from preparation');
  const arrival = f.user('NEW INPUT DURING PREPARATION');
  const partialReceipt = f.receipt('pending-one', 'NEW PARTIAL RECEIPT');
  const atRelease = structuredClone(f.session.snapshotEvents());
  release.resolve(prepared());
  assert.ok(await running, 'The completed historical span was genuinely replaced');
  assert.equal(f.controls.calls.length, 1);
  assert.deepEqual(f.session.snapshotEvents().slice(0, before.length), before);
  assert.deepEqual(f.session.snapshotEvents().slice(0, atRelease.length), atRelease);
  for (const event of [f.system, active, arrival, partialReceipt]) assertVisibleUnchanged(f, event);
  const state = f.pipeline.state(f.session);
  assert.ok(state.records.some(record => record.mode === 'brief'
    && record.sourceSeqs.includes(f.call.seq) && record.sourceSeqs.includes(f.result.seq)),
  'The complete historical tool pair was actually summarized and replaced');
  for (const record of state.records) for (const event of [active, arrival, partialReceipt]) {
    assert.ok(!record.sourceSeqs.includes(event.seq), 'New/active messages are not included in the replacement');
  }
  assertReleased(f);
  assertReplay(f);
});

test('native Auto Compact cancellation at the native flush boundary preserves the committed replacement', { timeout: 10000 }, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.controls.releases.push(() => release.resolve());
  const state = f.pipeline.state(f.session);
  const record = newRecord(f.session, [f.call, f.result],
    { summary: 'Completed read observations retained.', documents: [] }, state.binding);
  state.records.push(record); f.pipeline.store.save(state);
  const original = structuredClone(f.session.snapshotEvents());
  let gated = false;
  f.controls.flush = async () => {
    if (!gated && f.session.snapshotEvents().some(event => event.type === 'compaction/end')) {
      gated = true; entered.resolve(); await release.promise;
    }
  };
  const controller = new AbortController(), reason = Error('Cancelled while native flush waits');
  const running = track(f, f.pipeline.autoCompact.check(f.agent, controller.signal));
  const rejected = track(f, assert.rejects(running, error => error === reason));
  await entered.promise;
  assert.ok(state.transaction, 'The real transaction is waiting for the controlled flush');
  const native = f.session.snapshotEvents().slice(original.length);
  assert.equal(native.filter(event => event.type === 'compaction/start').length, 1);
  assert.equal(native.filter(event => event.type === 'compaction/summary').length, 1);
  assert.equal(native.filter(event => event.type === 'compaction/end').length, 1);
  assert.equal(native.filter(event => event.type === 'user/message' && event.data.source?.kind === 'compact-checkpoint').length, 1);
  const compactionId = native.find(event => event.type === 'compaction/start').data.compactionId;
  assert.ok(native.filter(event => event.type.startsWith('compaction/')).every(event => event.data.compactionId === compactionId));
  controller.abort(reason); release.resolve();
  await rejected;
  const committed = f.pipeline.state(f.session);
  assert.equal(committed.transaction, null, 'Flush completion commits already-written native events');
  assert.equal(committed.autoCompact.lastKey, undefined, 'Cancellation cannot mark a successful pass');
  const replaced = committed.records.find(value => value.id === record.id);
  assert.equal(replaced.mode, 'brief');
  assert.ok(f.session.surface.nodes.includes(replaced.carrierSeq));
  const checkpoint = f.session.eventAt(replaced.carrierSeq);
  assert.equal(checkpoint.data.id, compactionId);
  assert.equal(checkpoint.data.source.compactionId, compactionId);
  assert.equal(f.controls.calls.length, 0, 'Cancellation stops subsequent preparation');
  assert.deepEqual(f.session.snapshotEvents().slice(0, original.length), original);
  assertVisibleUnchanged(f, f.system); assertVisibleUnchanged(f, f.request);
  assertReleased(f); assertReplay(f);
  const afterCancel = structuredClone(f.session.snapshotEvents());
  await f.pipeline.autoCompact.check(f.agent, new AbortController().signal);
  assert.deepEqual(f.session.snapshotEvents(), afterCancel, 'A retry must not duplicate the committed replacement');
  assert.equal(f.controls.calls.length, 0);
  assertReleased(f);
});
