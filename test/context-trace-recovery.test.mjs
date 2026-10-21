import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter, ReplacementCanvas } from '../src/context/host.mjs';
import { createTransaction, applyTransaction } from '../src/context/transactions.mjs';
import { newRecord, normalizeChoices, resolveTraceSlot, carrierBarrier, hash, userRevision } from '../src/context/core.mjs';
import { withoutMovedReasoning } from '../src/context/trace.mjs';
import { sourceName } from '../src/message-source.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-trace-recovery-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const hub = { store: { dir }, scope: () => ({ mode: 'session', project: 'trace-test' }),
    config: () => ({ contextEnabled: false, traceEnabled: true }), action() {},
    ctx: { sessions: { async flush() {} } } };
  const adapter = createHostAdapter(hub), pipeline = hub.context = new ContextPipeline(hub, adapter);
  const session = Session.create('trace-recovery');
  const original = session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '保留这条用户原话及附件。' }] }), { surfaceOp: 'append' });
  const traceSource = session.append('assistant/message', { turn: 1, step: 1,
    message: { id: 'trace-source', role: 'assistant', source: { kind: 'model', model: 'fixture' },
      content: [{ type: 'reasoning', text: 'Earlier exposed reasoning' }, { type: 'text', text: 'Recorded findings. '.repeat(400) }] } }, { surfaceOp: 'append' });
  const trace = session.append('user/message', createUserMessage({ source: { kind: 'plugin:oh-my-dsh:trace' },
    content: [{ type: 'text', text: '[Previous analysis]\nEarlier exposed reasoning\n[End previous analysis]\n' }, ...original.data.content] }),
  { surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq }, sourceEventSeqs: [original.seq] });
  const state = pipeline.state(session);
  state.traceSlot = { original: structuredClone(original.data), traceHash: 'old-hash', sourceSeq: traceSource.seq, movedSourceSeqs: [traceSource.seq], carrierSeq: trace.seq };
  const record = newRecord(session, [traceSource], { summary: '已记录的事实。', documents: [] }, state.binding, { state });
  state.records.push(record); pipeline.store.save(state);
  const agent = { session, status: 'idle', async runMaintenance(run) { return run(new AbortController().signal); } };
  return { session, state, trace, traceSource, record, pipeline, adapter, agent, hub };
}

for (const stale of ['log-only', 'unrelated-surface', 'old-carrier']) test(`compact recovers a ${stale} Trace position using the live original request`, async t => {
  const f = await fixture(t), { session, state, trace, pipeline, record, adapter, agent } = f;
  if (stale === 'log-only') state.traceSlot.carrierSeq = session.append('step/end', { turn: 1, step: 1 }).seq;
  if (stale === 'unrelated-surface') state.traceSlot.carrierSeq = f.traceSource.seq;
  if (stale === 'old-carrier') {
    session.append('user/message', { ...trace.data, id: 'replacement-trace' },
      { surfaceOp: { op: 'replace', startSeq: trace.seq, endSeq: trace.seq }, sourceEventSeqs: [trace.seq] });
  }
  const before = structuredClone(session.snapshotEvents()), recovered = resolveTraceSlot(session, state.traceSlot);
  assert.equal(sourceName(session.eventAt(recovered.carrierSeq).data.source), 'oh-my-dsh:trace');
  assert.equal(carrierBarrier(session, state, { traceEnabled: true }), 0);
  const projected = withoutMovedReasoning(session.deriveMessages(), session, state.traceSlot);
  assert.equal(projected.find(m => m.id === 'trace-source').content.some(b => b.type === 'reasoning'), false);
  const result = await ReplacementCanvas.prototype.compactNow.call({ hub: f.hub }, agent, new AbortController().signal, 'compact-command');
  assert.ok(result);
  assert.equal(state.traceSlot.carrierSeq, session.surface.nodes.find(seq => sourceName(session.deriveEventMessage(session.eventAt(seq))?.source) === 'oh-my-dsh:trace'));
  assert.equal(state.records.find(r => r.id === record.id).mode, 'detail');
  assert.deepEqual(state.traceSlot.original.content, trace.data.content.slice(1));
  assert.deepEqual(session.snapshotEvents().slice(0, before.length), before);
  const after = session.snapshotEvents().length;
  assert.equal(await pipeline.applyReady(agent, { manual: true }), null);
  assert.equal(session.snapshotEvents().length, after);
  assert.equal(pipeline.store.peek(session.id).traceSlot.carrierSeq, state.traceSlot.carrierSeq);
  assert.ok(adapter.pairing.after(session, session.surface.nodes.at(-1)));
});

test('a transaction resolves the live Trace without relying on a previous state read', async t => {
  const f = await fixture(t), { session, state, pipeline, record } = f;
  state.traceSlot.carrierSeq = session.append('step/end', { turn: 1, step: 1 }).seq;
  const plan = { id: 'direct-plan', userRevision: userRevision(session), choices: normalizeChoices({ choices: [{ action: 'brief', ids: [record.id] }] }, state, session) };
  const tx = createTransaction(session, state, plan, pipeline.config(), f.adapter.pairing);
  assert.equal(tx.operations.find(o => o.kind === 'trace').seqs[0], f.trace.seq);
  await applyTransaction(session, state, tx, pipeline.store, f.adapter);
  assert.equal(state.records[0].mode, 'brief');
  assert.equal(sourceName(session.eventAt(state.traceSlot.carrierSeq).data.source), 'oh-my-dsh:trace');
});

test('full compaction retains the recovered Trace and its original request', async t => {
  const f = await fixture(t), { session, state, pipeline } = f;
  state.traceSlot.carrierSeq = session.append('step/end', { turn: 1, step: 1 }).seq;
  pipeline.call = async () => ({ blocks: [{ type: 'tool-call', id: 'full-summary', name: 'compact_conversation', arguments: { summary: '已记录事实，原始日志可回查。' } }] });
  const before = structuredClone(session.snapshotEvents());
  const result = await pipeline.requestCompaction(session, f.agent, 'full');
  assert.equal(result.changed, true);
  assert.equal(state.traceSlot.carrierSeq, f.trace.seq);
  assert.deepEqual(state.traceSlot.original.content, f.trace.data.content.slice(1));
  assert.equal(state.records.at(-1).kind, 'full');
  assert.deepEqual(session.snapshotEvents().slice(0, before.length), before);
});

test('Trace recovery refuses another original request and leaves the saved metadata untouched', async t => {
  const f = await fixture(t), { session, state } = f;
  state.traceSlot.carrierSeq = f.traceSource.seq;
  state.traceSlot.original.content = [{ type: 'text', text: '另一条用户消息' }];
  const saved = structuredClone(state.traceSlot);
  assert.equal(resolveTraceSlot(session, state.traceSlot), null);
  f.pipeline.state(session);
  assert.deepEqual(state.traceSlot, saved);
  assert.deepEqual(withoutMovedReasoning(session.deriveMessages(), session, state.traceSlot), session.deriveMessages());
});

test('Trace recovery removes the tagged todo before matching the original content', async t => {
  const f = await fixture(t), { session, state, trace } = f;
  const content = [...trace.data.content]; content.splice(1, 0, { type: 'text', text: '[todo list]\n[ ] T1 task' });
  const refreshed = session.append('user/message', { ...trace.data, id: 'todo-trace', content,
    omdTodo: { baseId: trace.data.id, baseSource: trace.data.source, index: 1, snapshotSeq: 0 } },
  { surfaceOp: { op: 'replace', startSeq: trace.seq, endSeq: trace.seq }, sourceEventSeqs: [trace.seq] });
  assert.equal(resolveTraceSlot(session, state.traceSlot).carrierSeq, refreshed.seq);
  assert.equal(hash(state.traceSlot.original.content), hash(trace.data.content.slice(1)));
});

test('compact still honors maintenance exclusion and caller cancellation before any write', async t => {
  const f = await fixture(t), before = structuredClone(f.session.snapshotEvents());
  f.agent.runMaintenance = () => { throw Error('already has active work'); };
  assert.throws(() => ReplacementCanvas.prototype.compactNow.call({ hub: f.hub }, f.agent), /active work/);
  f.agent.runMaintenance = run => run(new AbortController().signal);
  await assert.rejects(ReplacementCanvas.prototype.compactNow.call({ hub: f.hub }, f.agent, AbortSignal.abort(Error('cancelled'))), /cancelled/);
  assert.deepEqual(f.session.snapshotEvents(), before);
});
