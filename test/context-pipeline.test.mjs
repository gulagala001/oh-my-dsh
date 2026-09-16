import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextStore } from '../src/context/store.mjs';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { validatePrepared, newRecord, normalizeChoices, userRevision, userMessages, prepareCandidate, coordinatorInput, exposedTrace, candidateInput } from '../src/context/core.mjs';
import { createTransaction, applyTransaction } from '../src/context/transactions.mjs';
import { FixtureSession, user, plugin, system, exchange, adapter, pairing } from './context-fixture.mjs';
function setup(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'context-tests-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const s = new FixtureSession(); system(s); user(s, 'Preserve ID 9007199254740993 exactly.');
  const cfg = contextConfig({ keepTailEvents: 0, digestEvery: 2, digestWindow: 2, flushIdleMs: 0, coordinatorMinGapMs: 0, ...config });
  const hub = { store: { dir }, config: () => cfg, scope: session => ({ mode: session.header.memoryScope || 'session', project: '/project' }), ctx: { logger: { warn() {} } }, action() {}, async call() { throw Error('unexpected model call'); } };
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const state = pipeline.state(s), agent = { session: s, options: {} };
  return { s, cfg, state, pipeline, hub, dir, agent, store: pipeline.store };
}
const prepared = (name = 'One') => ({ summary: name + ' executed.', documents: [{ title: 'Layout', text: 'asset_id is TEXT; exact value 9007199254740993.' }] });
function add(f, name, reasoning) { const events = exchange(f.s, undefined, reasoning); const r = newRecord(f.s, events, prepared(name), f.state.binding); f.state.records.push(r); f.store.save(f.state); return r; }
const choices = (f, rows) => normalizeChoices({ choices: rows.map(([action, ids, body]) => ({ action, ids: Array.isArray(ids) ? ids : [ids.id], summary: body?.summary || '', documents: body?.documents || [] })) }, f.state, f.s);
const plan = (f, rows) => ({ id: 'plan', source: 'test', userRevision: userRevision(f.s), choices: choices(f, rows) });
async function apply(f, rows) { const tx = createTransaction(f.s, f.state, plan(f, rows), f.cfg, pairing); return applyTransaction(f.s, f.state, tx, f.store, adapter); }

test('private records remain local; project records are grouped and isolated from other projects', t => {
  const f = setup(t); const r = add(f, 'Private');
  const p = new FixtureSession('project-a', [], [], { memoryScope: 'project' }); const ps = f.pipeline.state(p);
  assert.equal(f.store.visible(p.id).length, 0); assert.throws(() => f.store.get(p.id, r.id), /范围/);
  const q = new FixtureSession('project-b', [], [], { memoryScope: 'project' }); const qs = f.pipeline.state(q);
  const pr = newRecord(p, exchange(p), prepared(), ps.binding); ps.records.push(pr); f.store.save(ps);
  assert.equal(f.store.get(q.id, pr.id).summary, pr.summary);
  qs.binding.project = '/another'; f.store.save(qs); assert.throws(() => f.store.get(q.id, pr.id));
});
test('manual global text uses optimistic concurrency; private sessions never inject it', t => {
  const f = setup(t); f.store.setGlobal('Manually supplied', 0); assert.throws(() => f.store.setGlobal('Stale', 0), /刷新/);
  const before = f.s.deriveMessages(); f.pipeline.publishMemory(f.s); assert.deepEqual(f.s.deriveMessages(), before);
});
test('all actual user messages survive replacement; plugin messages never become requirements', async t => {
  const f = setup(t); plugin(f.s, 'Fake instruction'); const r = add(f, 'Read', 'Prior reasoning exposed by provider');
  const prior = userMessages(f.s); await apply(f, [['detail', r]]);
  assert.deepEqual(userMessages(f.s), prior); assert.equal(prior.length, 1);
  assert.match(JSON.stringify(f.s.deriveMessages()), /Prior reasoning exposed/);
  const first = f.s.deriveMessages()[1]; assert.match(first.content[0].text, /Previous analysis/); assert.match(first.content[1].text, /9007199254740993/);
});
test('keep leaves surface byte-for-byte unchanged and performs no host writes', t => {
  const f = setup(t); const r = add(f); const before = JSON.stringify(f.s.snapshotEvents());
  assert.equal(createTransaction(f.s, f.state, plan(f, [['keep', r]]), f.cfg, pairing), null);
  assert.equal(JSON.stringify(f.s.snapshotEvents()), before);
});
test('detail then brief replaces carriers but recall retains full exact documents', async t => {
  const f = setup(t); const r = add(f); await apply(f, [['detail', r]]);
  let current = f.state.records[0]; assert.equal(current.mode, 'detail'); assert.match(JSON.stringify(f.s.deriveMessages()), /asset_id is TEXT/);
  await apply(f, [['brief', current]]); current = f.state.records[0]; assert.equal(current.mode, 'brief');
  assert.doesNotMatch(JSON.stringify(f.s.deriveMessages()), /asset_id is TEXT/); assert.match(f.pipeline.recall(f.s, { id: current.id }), /asset_id is TEXT/);
});
test('noncontiguous merge replaces earliest selected surface position, not an entire span', async t => {
  const f = setup(t); const a = add(f, 'A'); const middle = plugin(f.s, 'DO NOT MOVE OR REMOVE'); const b = add(f, 'B'); const c = add(f, 'C');
  await apply(f, [['detail', a]]); const A = f.state.records.find(r => r.id === a.id);
  const before = f.s.surface.nodes.indexOf(A.carrierSeq); assert.ok(A.carrierSeq > c.sourceSeqs[0]);
  await apply(f, [['merge', [c.id, A.id], prepared('Merged A C')]]);
  const merged = f.state.records.find(r => r.parents.length === 2);
  assert.equal(f.s.surface.nodes.indexOf(merged.carrierSeq), before);
  assert.ok(f.s.surface.nodes.includes(middle.seq)); assert.ok(f.s.surface.nodes.includes(b.sourceSeqs[0]));
  assert.match(f.pipeline.recall(f.s, { id: A.id }), /Historical record/); assert.match(f.pipeline.recall(f.s, { id: c.id }), /C executed/);
});
test('new user instruction invalidates completed plans without removing any original', t => {
  const f = setup(t); const r = add(f); const p = plan(f, [['brief', r]]); user(f.s, 'Change the requirement');
  assert.throws(() => createTransaction(f.s, f.state, p, f.cfg, pairing), /用户消息已变化/);
  assert.ok(f.s.surface.nodes.includes(r.sourceSeqs[0]));
});
test('stale or unknown IDs, duplicate selections, and fabricated output on non-merge are rejected', t => {
  const f = setup(t); const r = add(f);
  assert.throws(() => choices(f, [['brief', ['unknown']]]));
  assert.throws(() => choices(f, [['brief', r], ['detail', r]]));
  assert.throws(() => choices(f, [['brief', r, prepared('Forbidden')]]));
  assert.throws(() => normalizeChoices({ choices: [{ action: 'brief', ids: [r.id], summary: '', documents: [] }] }, f.state, f.s, new Set()));
});
test('window and tail keep complete tool pairs; preparation reference is not covered source', t => {
  const f = setup(t, { digestWindow: 1 }); exchange(f.s); exchange(f.s);
  const events = prepareCandidate(f.s, f.state, f.cfg, pairing); assert.equal(events.length, 2);
  const input = candidateInput(f.s, events, 1); assert.equal(input.reference[0].type, 'user/message'); assert.equal(input.segment.length, 2);
  assert.equal(prepareCandidate(f.s, f.state, { ...f.cfg, keepTailEvents: 4 }, pairing), null);
});
test('opaque image/tool material is kept, not silently discarded by text-only preparation', t => {
  const f = setup(t); const events = exchange(f.s); events[1].data.message.content[0].content.push({ type: 'image', data: 'opaque' });
  assert.equal(prepareCandidate(f.s, f.state, f.cfg, pairing), null);
});
test('no fabricated trace when provider exposes no reasoning; configurable exact trace provenance', t => {
  const f = setup(t); add(f); assert.equal(exposedTrace(f.s), null); const r = add(f, 'B', 'abcdefgh');
  assert.deepEqual(exposedTrace(f.s, { maxChars: 3 }).text, 'fgh');
  const tx = createTransaction(f.s, f.state, plan(f, [['brief', r]]), { ...f.cfg, traceEnabled: false }, pairing);
  assert.ok(tx.operations.every(o => o.kind !== 'trace'));
});
test('partial transaction recovery is idempotent and preserves originals', async t => {
  const f = setup(t); const a = add(f, 'A'), b = add(f, 'B');
  const tx = createTransaction(f.s, f.state, plan(f, [['merge', [a.id, b.id], prepared('Both')]]), f.cfg, pairing);
  let count = 0; const broken = { ...adapter, append(...args) { if (++count === 2) throw Error('crash'); return adapter.append(...args); } };
  await assert.rejects(applyTransaction(f.s, f.state, tx, f.store, broken), /crash/);
  assert.ok(f.state.transaction); const reloaded = new ContextStore(f.dir); const state = reloaded.state(f.s.id);
  await applyTransaction(f.s, state, state.transaction, reloaded, adapter);
  assert.equal(f.s.snapshotEvents().filter(e => e.data?.id === tx.operations[0].id).length, 1);
  assert.equal(state.transaction, null); assert.match(f.s.eventAt(a.sourceSeqs[1]).data.message.content[0].content[0].text, /Original/);
});
test('failed disk flush is recovered without duplicate replacement records', async t => {
  const f = setup(t); const a = add(f); const tx = createTransaction(f.s, f.state, plan(f, [['detail', a]]), f.cfg, pairing);
  await assert.rejects(applyTransaction(f.s, f.state, tx, f.store, { ...adapter, flush() { throw Error('disk'); } }));
  await applyTransaction(f.s, f.state, tx, f.store, adapter);
  assert.equal(f.s.snapshotEvents().filter(e => e.data?.id === tx.operations[0].id).length, 1);
});
test('manual apply consumes ready documents without an AI call', async t => {
  const f = setup(t); add(f); let calls = 0; f.hub.call = async () => { calls++; throw Error('not allowed'); };
  const result = await f.pipeline.applyReady(f.agent, { manual: true }); assert.ok(result); assert.equal(calls, 0);
});
test('manual action with no prepared data preserves the context and returns no change', async t => {
  const f = setup(t); exchange(f.s); const before = [...f.s.surface.nodes];
  assert.equal(await f.pipeline.applyReady(f.agent, { manual: true }), null); assert.deepEqual(f.s.surface.nodes, before);
});
test('main pre-step does not await a slow preparation call', async t => {
  const f = setup(t); exchange(f.s); let release; f.hub.call = () => new Promise(resolve => { release = resolve; });
  const run = f.pipeline.preStep(f.agent); const result = await Promise.race([run.then(() => 'returned'), new Promise(r => setTimeout(() => r('blocked'), 80))]);
  assert.equal(result, 'returned'); release?.({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] });
  await Promise.all([...f.pipeline.jobs.values()]);
});
test('coordinator sees full factual docs, genuine user originals and no recent events when configured zero', t => {
  const f = setup(t, { coordinatorRecentEvents: 0 }); const r = add(f); plugin(f.s, 'Not user text');
  const input = coordinatorInput(f.s, f.state, f.cfg); assert.deepEqual(input.records[0].documents, r.documents); assert.equal(input.user_messages.length, 1); assert.deepEqual(input.recent_events, []);
});
test('corrupt persistent state fails explicitly without erasing its file', t => {
  const f = setup(t); writeFileSync(f.store.path('bad'), '{BROKEN'); const store = new ContextStore(f.dir);
  assert.throws(() => store.state('bad'), /原文件未更改/);
});
test('background preparation validates output and keeps full raw source on failure', async t => {
  const f = setup(t); exchange(f.s); f.hub.call = async () => ({ blocks: [] });
  const before = [...f.s.surface.nodes]; await f.pipeline.prepare(f.agent, true);
  assert.deepEqual(f.s.surface.nodes, before); assert.equal(f.state.records.length, 0); assert.ok(f.state.failures.prepare);
});
test('configuration rejects invalid frequency, windows and timing', () => {
  for (const patch of [{ digestEvery: 0 }, { digestWindow: 1.5 }, { coordinatorEvery: -1 }, { traceMaxChars: -1 }]) assert.throws(() => contextConfig(patch));
  assert.throws(() => validatePrepared({ summary: 'ok', documents: [{ title: 'x', text: '' }] }));
});

test('upgrade retires old memory injections without deleting logs or touching genuine requirements', async t => {
  const f = setup(t); const old = plugin(f.s, 'Old automatic global knowledge', 'memory');
  const before = userMessages(f.s); await f.pipeline.retireLegacyInjections(f.s);
  assert.doesNotMatch(JSON.stringify(f.s.deriveMessages()), /Old automatic global/);
  assert.match(f.pipeline.recall(f.s, { from: old.seq, to: old.seq }), /Old automatic global/);
  assert.deepEqual(userMessages(f.s), before); const seq = f.s.seq; await f.pipeline.retireLegacyInjections(f.s); assert.equal(f.s.seq, seq);
});
test('no preparation is forced on every pre-step below configured event frequency', async t => {
  const f = setup(t, { digestEvery: 99 }); exchange(f.s); let n = 0; f.hub.call = async () => { n++; return { blocks: [] }; };
  await f.pipeline.preStep(f.agent); await Promise.all([...f.pipeline.jobs.values()]); assert.equal(n, 0);
});
test('project opening uses saved basic summaries and keeps detailed documents out of default catalog', t => {
  const f = setup(t); const p = new FixtureSession('p1', [], [], { memoryScope: 'project' }); const ps = f.pipeline.state(p);
  const r = newRecord(p, exchange(p), prepared('Shared'), ps.binding); ps.records.push(r); f.store.save(ps);
  const q = new FixtureSession('p2', [], [], { memoryScope: 'project' }); f.pipeline.state(q);
  f.pipeline.publishMemory(q); const out = JSON.stringify(q.deriveMessages()); assert.match(out, /Shared executed/); assert.doesNotMatch(out, /asset_id is TEXT/);
  const seq = q.seq; f.pipeline.publishMemory(q); assert.equal(q.seq, seq);
  assert.match(f.pipeline.recall(q, { id: r.id }), /asset_id is TEXT/);
});
test('coordinator four-choice output prepares a plan; main boundary applies it without a second model', async t => {
  const f = setup(t, { coordinatorEvery: 1 }); const r = add(f, 'Ready'); const calls = [];
  f.hub.call = async (_agent, kind, req) => { calls.push(kind); assert.match(req.messages[0].content[0].text, /9007199254740993/); return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [{ action: 'brief', ids: [r.id], summary: '', documents: [] }] } }] }; };
  await f.pipeline.coordinate(f.agent, true); assert.ok(f.state.pending);
  await f.pipeline.applyReady(f.agent); assert.deepEqual(calls, ['coordinate']); assert.equal(f.state.records[0].mode, 'brief');
});
test('invalid or stale coordinator responses leave original surface unchanged', async t => {
  const f = setup(t); add(f); let resolve; f.hub.call = () => new Promise(r => { resolve = r; });
  const job = f.pipeline.coordinate(f.agent, true); user(f.s, 'new instruction');
  resolve({ blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] });
  await job; assert.equal(f.state.pending, null); assert.equal(f.state.records[0].mode, 'raw');
});
test('blank session can change to private before any publication; started session cannot widen', t => {
  const f = setup(t); const blank = new FixtureSession('blank', [], [], { memoryScope: 'project' });
  const a = f.pipeline.state(blank); assert.equal(a.binding.scope, 'project');
  blank.header.memoryScope = 'session'; assert.equal(f.pipeline.state(blank).binding.scope, 'session');
  user(blank, 'Private request'); blank.header.memoryScope = 'project'; assert.equal(f.pipeline.state(blank).binding.scope, 'session');
});

test('one event threshold prepares one short segment instead of draining the backlog', async t => {
  const f = setup(t, { digestEvery: 32, coordinatorEvery: 999 });
  for (let i = 0; i < 20; i++) { exchange(f.s); system(f.s); }
  f.state.eventsSincePrepare = 40;
  let calls = 0;
  f.hub.call = async () => { calls++; return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] }; };
  await f.pipeline.prepare(f.agent);
  assert.equal(calls, 1);
  assert.equal(f.state.eventsSincePrepare, 0);
  await f.pipeline.prepare(f.agent);
  assert.equal(calls, 1, 'remaining raw segments do not count as new events');
});

test('events arriving during preparation remain counted for the next threshold', async t => {
  const f = setup(t, { digestEvery: 8, coordinatorEvery: 999 });
  for (let i = 0; i < 6; i++) { exchange(f.s); system(f.s); }
  f.state.eventsSincePrepare = 8; f.pipeline.agents.set(f.s.id, f.agent);
  let release, calls = 0;
  f.hub.call = () => { calls++; return calls === 1 ? new Promise(r => { release = r; }) : Promise.resolve({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] }); };
  const work = f.pipeline.prepare(f.agent);
  for (const e of exchange(f.s)) f.pipeline.observe(f.s, e);
  release({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] });
  await work;
  assert.equal(calls, 1); assert.equal(f.state.eventsSincePrepare, 2);
});

test('forced idle preparation does not drain every remaining segment', async t => {
  const f = setup(t, { digestEvery: 32, coordinatorEvery: 999 });
  for (let i = 0; i < 5; i++) { exchange(f.s); system(f.s); }
  f.state.eventsSincePrepare = 10; let calls = 0;
  f.hub.call = async () => { calls++; return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] }; };
  await f.pipeline.prepare(f.agent, true);
  assert.equal(calls, 1); assert.equal(f.state.eventsSincePrepare, 0);
});

test('coordinator cooldown never triggers preparation or replaces the idle timer', async t => {
  const f = setup(t, { coordinatorMinGapMs: 20, flushIdleMs: 10000 });
  add(f); exchange(f.s); f.pipeline.agents.set(f.s.id, f.agent);
  f.state.review.lastAt = Date.now(); f.state.review.newRecords = 2;
  const kinds = [];
  f.hub.call = async (_agent, kind) => { kinds.push(kind); return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] }; };
  f.pipeline.arm(f.agent);
  const idle = f.pipeline.timers.get(f.s.id + ':idle');
  await f.pipeline.coordinate(f.agent);
  await new Promise(r => setTimeout(r, 70));
  assert.deepEqual(kinds, ['coordinate']);
  assert.equal(f.pipeline.timers.get(f.s.id + ':idle'), idle);
});

test('failed preparation retains new-event count and incoming events respect retry backoff', async t => {
  const f = setup(t, { digestEvery: 4, coordinatorEvery: 999 });
  exchange(f.s); f.state.eventsSincePrepare = 4; f.pipeline.agents.set(f.s.id, f.agent);
  let calls = 0;
  f.hub.call = async () => { calls++; throw Error('transient'); };
  await f.pipeline.prepare(f.agent);
  assert.equal(f.state.eventsSincePrepare, 4);
  for (const e of exchange(f.s)) f.pipeline.observe(f.s, e);
  await f.pipeline.prepare(f.agent);
  assert.equal(calls, 1); assert.equal(f.state.eventsSincePrepare, 6);
  f.state.prepareRetryAt = 0;
  f.hub.call = async () => { calls++; return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] }; };
  await f.pipeline.prepare(f.agent);
  assert.equal(calls, 2); assert.equal(f.state.eventsSincePrepare, 0);
  assert.equal(f.state.failures.prepare, undefined);
  assert.equal(f.pipeline.timers.has(f.s.id + ':prepare'), false);
});

test('legacy backlog counter is rebased once and the corrected count survives reload', t => {
  const f = setup(t); exchange(f.s); f.state.initialized = true;
  delete f.state.prepareCadenceVersion; f.state.eventsSincePrepare = 39; f.store.save(f.state);
  const replacement = new ContextPipeline(f.hub, adapter); t.after(() => replacement.dispose());
  const s = replacement.state(f.s);
  assert.equal(s.eventsSincePrepare, 0);
  assert.equal(s.prepareCadenceVersion, 1);
  s.eventsSincePrepare = 7; replacement.store.save(s);
  const restarted = new ContextPipeline(f.hub, adapter); t.after(() => restarted.dispose());
  assert.equal(restarted.state(f.s).eventsSincePrepare, 7);
});
