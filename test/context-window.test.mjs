import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { prepareCandidate, candidateInput, newRecord, normalizeChoices, userRevision, liveSpan, recordBlocks } from '../src/context/core.mjs';
import { createTransaction, applyTransaction } from '../src/context/transactions.mjs';
import { messageTokens } from '../src/context/materials.mjs';
import { registerContextRecall } from '../src/context/recall.mjs';
import { FixtureSession, user, plugin, system, exchange, adapter, pairing } from './context-fixture.mjs';

function setup(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'context-window-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = new FixtureSession(); system(session); if (config.preface) plugin(session, 'Keep task status current.', 'task-reminder'); user(session, 'Preserve exact requirement 9007199254740993.');
  const cfg = contextConfig({ keepTailEvents: 0, digestEvery: 32, digestWindow: 64, flushIdleMs: 0, coordinatorEvery: 999, traceEnabled: false, ...config });
  const calls = [], hub = { store: { dir }, config: () => cfg, scope: () => ({ mode: 'session', project: '/p' }), ctx: {}, action() {},
    async call(_agent, kind, request) { calls.push({ kind, request }); return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Requirement 9007199254740993 retained. Work completed.', documents: [{ title: 'Facts', text: 'Detailed observed facts.' }] } }] }; } };
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const state = pipeline.state(session), agent = { session, status: 'idle' };
  return { session, state, pipeline, agent, hub, calls, cfg };
}
function plan(f, rows) { return { id: 'test-plan', userRevision: userRevision(f.session), choices: normalizeChoices({ choices: rows.map(([action, ids, body = {}]) => ({ action, ids, summary: '', documents: [], ...body })) }, f.state, f.session) }; }
async function apply(f, rows) { const tx = createTransaction(f.session, f.state, plan(f, rows), f.cfg, pairing); return applyTransaction(f.session, f.state, tx, f.pipeline.store, adapter); }
const image = { type: 'image', attachment: { attachmentId: 'fixture-image', name: 'screenshot.png', width: 100, height: 100 } };

test('default whole window crosses users, reminders, images and protected system holes', async t => {
  const f = setup(t); exchange(f.session); const reminder = plugin(f.session, 'Task status', 'tasks');
  const correction = user(f.session, '  修正：ID 必须是字符串。\n保留空格  '); const fixed = system(f.session);
  const roundtrip = exchange(f.session); roundtrip[1].data.message.content[0].content.push(structuredClone(image));
  exchange(f.session); const before = f.session.snapshotEvents();
  const candidate = prepareCandidate(f.session, f.state, f.cfg, pairing);
  assert.ok(candidate.some(e => e.seq === correction.seq)); assert.ok(candidate.some(e => e.seq === reminder.seq));
  assert.ok(candidate.retainedSeqs.includes(fixed.seq)); assert.ok(candidate.some(e => e.seq === roundtrip[1].seq));
  const input = candidateInput(f.session, candidate, 0); assert.ok(input.segment.some(e => e.seq === fixed.seq && e.protected));
  await f.pipeline.prepare(f.agent, true); assert.equal(f.state.records.length, 1);
  const r = f.state.records[0]; assert.equal(r.kind, 'window'); assert.equal(r.assets.length, 1);
  assert.deepEqual(r.userOriginals.find(u => u.seq === correction.seq).content, correction.data.content);
  assert.match(r.documents.find(d => d.kind === 'user-original').text, /  修正：ID 必须是字符串。\n保留空格  /);
  const result = await apply(f, [['brief', [r.id]]]); assert.ok(f.session.surface.nodes.includes(fixed.seq));
  assert.equal(result.stats.currentMessages, r.sourceSeqs.filter(seq => f.session.eventAt(seq).data?.source?.plugin !== 'trisoul-x:tasks').length); assert.equal(result.stats.resultRecords, 1);
  assert.ok(before.every(e => f.session.eventAt(e.seq)), 'original events survive');
});

test('documents and native image/file blocks move together; brief recall reopens originals', async t => {
  const f = setup(t); const pair = exchange(f.session);
  pair[1].data.message.content[0].content.push({ ...structuredClone(image), offloaded: true }, { type: 'file', attachment: { attachmentId: 'fixture-file', name: 'source.txt', bytes: 8 } });
  await f.pipeline.prepare(f.agent, true); const id = f.state.records[0].id;
  await apply(f, [['detail', [id]]]); assert.equal(f.session.deriveMessages().flatMap(m => m.content).filter(b => ['image', 'file'].includes(b.type)).length, 2);
  await apply(f, [['brief', [id]]]); assert.equal(f.session.deriveMessages().flatMap(m => m.content).filter(b => ['image', 'file'].includes(b.type)).length, 0);
  assert.equal(f.pipeline.recallContent(f.session, { id, asset: 1 })[1].type, 'image');
  assert.equal(f.pipeline.recallContent(f.session, { id, asset: 1 })[1].offloaded, undefined);
  assert.equal(f.pipeline.recallContent(f.session, { id, asset: 2 })[1].type, 'file');
  assert.throws(() => f.pipeline.recallContent(f.session, { id, asset: 3 }), /附件编号/);
});

test('one trigger processes a bounded batch and exposes remaining backlog separately', async t => {
  const f = setup(t, { digestWindow: 4, prepareBatchWindows: 2 });
  for (let i = 0; i < 12; i++) { exchange(f.session); plugin(f.session, 'Routine reminder', 'tasks'); }
  f.state.eventsSincePrepare = 32;
  await f.pipeline.prepare(f.agent); assert.equal(f.calls.length, 2); assert.equal(f.state.eventsSincePrepare, 0);
  assert.ok(f.pipeline.view(f.session).backlog.events > 0); assert.ok(f.state.records.reduce((n,r) => n+r.sourceSeqs.length,0) > 4);
  await f.pipeline.prepare(f.agent); assert.equal(f.calls.length, 2, 'backlog does not independently wake an idle session');
});

test('long reasoning participates in the shrink check rather than counting as ten characters', t => {
  const f = setup(t); const events = exchange(f.session, 'ok', 'Earlier thought. '.repeat(6000));
  const r = newRecord(f.session, events, { summary: 'Read completed; result was ok.', documents: [] }, f.state.binding);
  f.state.records.push(r);
  const tx = createTransaction(f.session, f.state, plan(f, [['brief', [r.id]]]), f.cfg, pairing);
  assert.ok(tx.inputTokens > 20000); assert.ok(tx.outputTokens < 1000); assert.ok(tx.stats.estimatedSavedTokens > 19000);
});

test('separate brief records preserve archival assets and exact user originals', async t => {
  const f = setup(t, { digestWindow: 4, prepareBatchWindows: 2 });
  const first = exchange(f.session); first[1].data.message.content[0].content.push(structuredClone(image));
  user(f.session, 'Correction: preserve UTF-8 用户原话'); exchange(f.session); exchange(f.session);
  await f.pipeline.prepare(f.agent, true); assert.equal(f.state.records.length, 2);
  const ids = f.state.records.map(r => r.id);
  await apply(f, ids.map(id => ['brief', [id]]));
  assert.equal(f.state.records.length, 2); assert.ok(f.state.records.every(r => !r.mergedInto));
  const merged = f.state.records.find(r => !r.mergedInto); assert.equal(merged.mode, 'brief'); assert.ok(merged.assets.length);
  assert.ok(merged.userOriginals.some(u => u.content.some(b => b.text?.includes('用户原话'))));
  assert.equal(recordBlocks(merged, 'brief').some(b => b.type === 'image'), false);
  assert.equal(f.pipeline.recallContent(f.session, { id: merged.id, asset: 1 })[1].type, 'image');
});

test('protected Trace anchor and system messages survive while interior user messages are archived', async t => {
  const f = setup(t, { traceEnabled: true }); exchange(f.session, undefined, 'A previous exposed analysis.');
  const change = user(f.session, 'New user correction'); const fixed = system(f.session); exchange(f.session);
  await f.pipeline.prepare(f.agent, true); const r = f.state.records[0];
  assert.ok(r.userOriginals.some(u => u.seq === change.seq));
  await apply(f, [['brief', [r.id]]]);
  assert.ok(f.session.surface.nodes.includes(fixed.seq)); assert.ok(f.state.traceSlot);
  const trace = f.state.traceSlot.carrierSeq; exchange(f.session);
  const candidate = prepareCandidate(f.session, f.state, f.cfg, pairing);
  assert.ok(!candidate || !candidate.some(e => e.seq === trace));
});

test('automatic preparation retry is finite and manual action can restart it', async t => {
  const f = setup(t, { backgroundMaxRetries: 2 }); exchange(f.session); let calls = 0;
  f.hub.call = async () => { calls++; throw Error('Provider unavailable'); };
  await f.pipeline.prepare(f.agent, true);
  for (let i = 0; i < 5; i++) { f.state.prepareRetryAt = 0; await f.pipeline.prepare(f.agent, true, { retry: true }); }
  assert.equal(calls, 3); assert.equal(f.state.records.length, 0);
  await f.pipeline.prepare(f.agent, true); assert.equal(calls, 4);
});

test('global concurrency is bounded and a cancelled queued call never reaches the provider', async t => {
  const f = setup(t, { backgroundConcurrency: 2 }); const releases = [];
  f.hub.call = () => new Promise(resolve => releases.push(resolve));
  const a = f.pipeline.call(f.agent, 'prepare', {}), b = f.pipeline.call(f.agent, 'coordinate', {});
  const abort = new AbortController(), queued = f.pipeline.call(f.agent, 'prepare', {}, abort.signal);
  assert.equal(releases.length, 2); abort.abort(); await assert.rejects(queued);
  releases.forEach(resolve => resolve({})); await Promise.all([a,b]); assert.equal(f.pipeline.activeCalls, 0);
});

test('a tool call whose result is in the recent tail is retained, not reported as eligible backlog', t => {
  const f = setup(t, { keepTailEvents: 1, traceEnabled: true }); exchange(f.session);
  assert.equal(f.pipeline.view(f.session).backlog.events, 0);
  assert.equal(f.pipeline.view(f.session).backlog.recentEvents, 2);
  assert.equal(prepareCandidate(f.session, f.state, f.cfg, pairing), null);
});

test('an existing detailed checkpoint inside a whole window is combined without losing its archive', async t => {
  const f = setup(t); exchange(f.session); const middle = exchange(f.session);
  const old = newRecord(f.session, middle, { summary: 'Earlier facts.', documents: [{ title: 'Original', text: 'Exact archived details.' }] }, f.state.binding);
  f.state.records.push(old); await apply(f, [['detail', [old.id]]]); exchange(f.session);
  await f.pipeline.prepare(f.agent, true); const current = f.state.records.find(r => !r.mergedInto);
  assert.ok(current.parents.includes(old.id)); assert.ok(liveSpan(f.session, current));
  assert.match(f.pipeline.recall(f.session, { id: old.id }), /Exact archived details/);
});

test('image/file request prices are applied on both sides and offload remains route-owned', () => {
  const pricing = { imagePricing: { priceImages: blocks => blocks.map(b => ({ visualTokens: b.offloaded ? 0 : 3000, text: 'image descriptor' })) }, fileText: () => 'saved file descriptor' };
  const visible = messageTokens({ role: 'user', content: [image] }, pricing);
  const offloaded = messageTokens({ role: 'user', content: [{ ...image, offloaded: true }] }, pricing);
  assert.equal(visible - offloaded, 3000);
});

test('recall tool renders native media and cannot cross private session archives', async t => {
  const f = setup(t); const pair = exchange(f.session); pair[1].data.message.content[0].content.push(image);
  await f.pipeline.prepare(f.agent, true); let tool; registerContextRecall({ tools: { register(value) { tool = value; } } }, { context: f.pipeline });
  const args = { id: f.state.records[0].id, asset: 1 }, output = tool.execute(args, { agent: f.agent });
  assert.equal(tool.output.render(args, output)[1].type, 'image');
  const other = new FixtureSession('private-other'); f.pipeline.state(other);
  assert.throws(() => f.pipeline.recallContent(other, args), /记录不存在|范围/);
});

test('whole-window multi-range transactions resume once without deleting protected holes', async t => {
  const f = setup(t); exchange(f.session); const fixed = system(f.session); exchange(f.session);
  await f.pipeline.prepare(f.agent, true); const id = f.state.records[0].id;
  const tx = createTransaction(f.session, f.state, plan(f, [['brief', [id]]]), f.cfg, pairing);
  let n = 0; const broken = { ...adapter, append(...args) { if (++n === 2) throw Error('simulated interruption'); return adapter.append(...args); } };
  await assert.rejects(applyTransaction(f.session, f.state, tx, f.pipeline.store, broken), /interruption/);
  await applyTransaction(f.session, f.state, f.state.transaction, f.pipeline.store, adapter);
  assert.ok(f.session.surface.nodes.includes(fixed.seq)); assert.equal(f.state.transaction, null);
  for (const op of tx.operations) assert.equal(f.session.snapshotEvents().filter(e => (e.data.id || e.data.message?.id) === op.id).length, 1);
});

test('explicit full compaction keeps the existing protected Trace while archiving user text', async t => {
  const f = setup(t, { traceEnabled: true }); exchange(f.session, undefined, 'A real earlier analysis.');
  await f.pipeline.prepare(f.agent, true); await apply(f, [['brief', [f.state.records[0].id]]]);
  const trace = structuredClone(f.state.traceSlot); exchange(f.session); user(f.session, 'Latest exact correction.');
  f.hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'Keep requirement 9007199254740993 and the latest correction. Source read completed.' } }] });
  await f.pipeline.requestCompaction(f.session, f.agent, 'full');
  assert.equal(f.state.traceSlot.carrierSeq, trace.carrierSeq); assert.ok(f.session.surface.nodes.includes(trace.carrierSeq));
  assert.ok(f.state.records.find(r => !r.mergedInto).userOriginals.some(u => u.content.some(b => b.text === 'Latest exact correction.')));
});

test('overlong generated summaries fail safely instead of being cut mid-fact', async t => {
  const f = setup(t, { summaryTargetChars: 100 }); exchange(f.session); const before = [...f.session.surface.nodes];
  f.hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'x'.repeat(201), documents: [] } }] });
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.state.records.length, 0); assert.deepEqual(f.session.surface.nodes, before);
  assert.match(f.state.failures.prepare.message, /目标长度两倍/);
});

test('a pre-user reminder is absorbed without moving the checkpoint before front Trace', async t => {
  const f = setup(t, { traceEnabled: true, preface: true }); exchange(f.session, undefined, 'Earlier analysis.');
  const users = userRevision(f.session); await f.pipeline.prepare(f.agent, true);
  const record = f.state.records[0]; assert.ok(record.sourceSeqs.includes(1), 'prefix reminder is part of the same window');
  await apply(f, [['brief', [record.id]]]);
  const traceIndex = f.session.surface.nodes.indexOf(f.state.traceSlot.carrierSeq);
  assert.ok(f.session.surface.nodes.indexOf(record.carrierSeq || f.state.records[0].carrierSeq) > traceIndex);
  assert.equal(userRevision(f.session), users);
  plugin(f.session, 'A later reminder', 'tasks'); exchange(f.session);
  f.hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'Keep exact requirement 9007199254740993. Source work completed.' } }] });
  await f.pipeline.requestCompaction(f.session, f.agent, 'full');
  const current = f.state.records.find(r => !r.mergedInto);
  assert.ok(f.session.surface.nodes.indexOf(current.carrierSeq) > f.session.surface.nodes.indexOf(f.state.traceSlot.carrierSeq));
});
