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
  // This suite also covers the explicitly selectable compatibility-boundary mode.
  const cfg = contextConfig({ preprocessBoundaries: true, prepareBatchWindows: 1, keepTailEvents: 0, digestEvery: 2, digestWindow: 2, flushIdleMs: 0, coordinatorMinGapMs: 0, ...config });
  const hub = { store: { dir }, config: () => cfg, scope: session => ({ mode: session.header.memoryScope || 'session', project: '/project' }), ctx: { logger: { warn() {} } }, action() {}, async call() { throw Error('unexpected model call'); } };
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const state = pipeline.state(s), agent = { session: s, options: {}, status: 'idle' };
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
test('merge is rejected by normalization and by direct transaction creation without writes', t => {
  const f = setup(t), a = add(f, 'A'), b = add(f, 'B');
  const before = JSON.stringify(f.s.snapshotEvents()), records = JSON.stringify(f.state.records);
  assert.throws(() => choices(f, [['merge', [a.id, b.id], prepared('Both')]]), /合并已关闭/);
  assert.throws(() => createTransaction(f.s, f.state, { userRevision: userRevision(f.s), choices: [{ action: 'merge', ids: [a.id, b.id] }] }, f.cfg, pairing), /合并已关闭/);
  assert.equal(JSON.stringify(f.s.snapshotEvents()), before); assert.equal(JSON.stringify(f.state.records), records);
});
test('new user messages do not invalidate a prepared replacement', async t => {
  const f = setup(t); const r = add(f); const p = plan(f, [['brief', r]]);
  const latest = user(f.s, 'Continue');
  const tx = createTransaction(f.s, f.state, p, f.cfg, pairing);
  await applyTransaction(f.s, f.state, tx, f.store, adapter);
  assert.equal(f.state.records[0].mode, 'brief'); assert.ok(f.s.surface.nodes.includes(latest.seq));
  assert.ok(f.s.eventAt(r.sourceSeqs[0]));
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
  const tx = createTransaction(f.s, f.state, plan(f, [['brief', a], ['brief', b]]), f.cfg, pairing);
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
test('record changes during coordination leave original surface unchanged', async t => {
  const f = setup(t); add(f); let resolve; f.hub.call = () => new Promise(r => { resolve = r; });
  const job = f.pipeline.coordinate(f.agent, true); f.state.records[0].version++;
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
  const f = setup(t, { coordinatorEvery: 2, coordinatorMinGapMs: 20, flushIdleMs: 10000 });
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

test('host reminder before the first user message never becomes a preparation segment', t => {
  const f = setup(t); const reminder = plugin(f.s, 'New user instructions may change the remaining work.', 'task-review');
  f.s.surface.nodes.splice(f.s.surface.nodes.indexOf(reminder.seq), 1);
  f.s.surface.nodes.splice(1, 0, reminder.seq);
  const events = exchange(f.s, undefined, 'Provider reasoning.');
  assert.deepEqual(prepareCandidate(f.s, f.state, f.cfg, pairing).map(e => e.seq), events.map(e => e.seq));
});

test('legacy reminder summary does not block trace and valid replacements in a new session', async t => {
  const f = setup(t); const reminder = plugin(f.s, 'New user instructions may change the remaining work.', 'task-review');
  f.s.surface.nodes.splice(f.s.surface.nodes.indexOf(reminder.seq), 1);
  f.s.surface.nodes.splice(1, 0, reminder.seq);
  const bad = newRecord(f.s, [reminder], prepared('Legacy reminder'), f.state.binding);
  f.state.records.push(bad);
  const good = add(f, 'Actual tool result', 'Provider reasoning.');
  const users = userMessages(f.s);
  // Replay a coordinator decision saved by the previous version.
  f.state.pending = plan(f, [['brief', good]]);
  f.state.pending.choices.unshift({ action: 'keep', ids: [bad.id], observed: [] });
  const result = await f.pipeline.applyReady(f.agent, { manual: true, mode: 'brief' });
  assert.ok(result); assert.equal(f.state.records.find(r => r.id === good.id).mode, 'brief');
  assert.equal(f.state.records.find(r => r.id === bad.id).mode, 'raw');
  assert.ok(f.s.surface.nodes.includes(reminder.seq), 'host reminder stays verbatim');
  assert.deepEqual(userMessages(f.s), users);
  assert.match(JSON.stringify(f.s.deriveMessages()), /Provider reasoning/);
  assert.deepEqual(coordinatorInput(f.s, f.state, f.cfg).records.map(r => r.id), [good.id]);
  assert.equal(f.pipeline.view(f.s).records.find(r => r.id === bad.id).live, false);
  const replay = new FixtureSession(f.s.id, f.s.snapshotEvents(), f.s.surface.nodes, f.s.header);
  assert.deepEqual(replay.deriveMessages(), f.s.deriveMessages());
});


// Virtual time reproduces long model/tool execution without waiting or calling a provider.
function idleFixture(t, config = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  const f = setup(t, { digestEvery: 32, coordinatorEvery: 999, idlePreprocessEnabled: true, flushIdleMs: 90000, ...config });
  exchange(f.s);
  f.calls = [];
  f.hub.call = async (_agent, kind) => {
    f.calls.push(kind);
    return { blocks: [{ type: 'tool-call', name: kind === 'prepare' ? 'prepare_segment' : 'submit_context_choices',
      arguments: kind === 'prepare' ? prepared() : { choices: [] } }] };
  };
  return f;
}
async function finishJobs(f) {
  // A preparation can enqueue coordination before its own promise settles.
  do { await Promise.all([...f.pipeline.jobs.values()]); } while (f.pipeline.jobs.size);
}

test('long running steps never count as idle, including reconfiguration', async t => {
  const f = idleFixture(t); f.agent.status = 'running';
  f.pipeline.start(f.agent);
  t.mock.timers.tick(180000); await finishJobs(f);
  f.pipeline.reconfigure();
  t.mock.timers.tick(180000); await finishJobs(f);
  assert.deepEqual(f.calls, []);
  assert.equal(f.pipeline.timers.has(f.s.id + ':idle'), false);
});

test('idle flush waits a full interval after running ends, not after the last message', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent);
  t.mock.timers.tick(60000);
  f.agent.status = 'running'; f.pipeline.arm(f.agent);
  t.mock.timers.tick(180000); await finishJobs(f);
  assert.deepEqual(f.calls, []);
  f.agent.status = 'idle'; f.pipeline.arm(f.agent);
  t.mock.timers.tick(89999); await finishJobs(f);
  assert.deepEqual(f.calls, []);
  t.mock.timers.tick(1); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate']);
});

test('idle timer rechecks live status even when the status notification was missed', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent);
  f.agent.status = 'running'; // Deliberately do not notify arm().
  t.mock.timers.tick(90000); await finishJobs(f);
  assert.deepEqual(f.calls, []);
});

test('resuming during an idle preparation does not force idle coordination', async t => {
  const f = idleFixture(t); let release;
  f.hub.call = async (_agent, kind) => {
    f.calls.push(kind);
    if (kind === 'prepare') return new Promise(resolve => { release = resolve; });
    return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] };
  };
  f.pipeline.start(f.agent); t.mock.timers.tick(90000);
  assert.deepEqual(f.calls, ['prepare']);
  f.agent.status = 'running'; f.pipeline.arm(f.agent);
  release({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] });
  await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare']);
  assert.equal(f.state.records.length, 1, 'already started preparation still finishes normally');
});

test('event-threshold preparation still runs in parallel with a running main model', async t => {
  const f = idleFixture(t); f.cfg.digestEvery = 4; f.agent.status = 'running';
  f.pipeline.start(f.agent); await finishJobs(f);
  assert.deepEqual(f.calls, []);
  for (const e of exchange(f.s)) f.pipeline.observe(f.s, e);
  await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare']);
  assert.equal(f.state.records.length, 1);
  assert.equal(f.pipeline.timers.has(f.s.id + ':idle'), false);
});

test('preparation failure retry still runs while the main model is running', async t => {
  const f = idleFixture(t); f.agent.status = 'running'; f.pipeline.start(f.agent);
  const success = f.hub.call; let attempts = 0;
  f.hub.call = async (...args) => { if (++attempts === 1) throw Error('transient'); return success(...args); };
  await f.pipeline.prepare(f.agent, true);
  assert.equal(attempts, 1); assert.ok(f.state.failures.prepare);
  t.mock.timers.tick(1999); await finishJobs(f); assert.equal(attempts, 1);
  t.mock.timers.tick(1); await finishJobs(f);
  assert.equal(attempts, 2); assert.equal(f.state.failures.prepare, undefined);
  assert.equal(f.state.records.length, 1);
});

test('coordinator failure keeps the existing 30-second retry while main runs', async t => {
  const f = idleFixture(t); f.agent.status = 'running'; f.cfg.coordinatorMinGapMs = 30000;
  add(f); f.pipeline.agents.set(f.s.id, f.agent);
  const success = f.hub.call; let attempts = 0;
  f.hub.call = async (...args) => { if (++attempts === 1) throw Error('invalid record ID'); return success(...args); };
  await f.pipeline.coordinate(f.agent, true);
  t.mock.timers.tick(29999); await finishJobs(f); assert.equal(attempts, 1);
  t.mock.timers.tick(1); await finishJobs(f);
  assert.equal(attempts, 2); assert.equal(f.state.failures.coordinate, undefined);
  assert.deepEqual(f.calls, ['coordinate']);
});

test('disposing the session cancels the pending idle flush', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent); f.pipeline.dispose(f.s.id);
  t.mock.timers.tick(180000); await finishJobs(f);
  assert.deepEqual(f.calls, []); assert.equal(f.pipeline.timers.size, 0);
});


test('settings and reattachment never restart completed idle work on historical backlog', async t => {
  const f = idleFixture(t); exchange(f.s); system(f.s); exchange(f.s);
  f.pipeline.start(f.agent); t.mock.timers.tick(90000); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate']);
  assert.ok(prepareCandidate(f.s, f.state, f.cfg, pairing), 'unprocessed history remains');
  for (let i = 0; i < 3; i++) {
    f.cfg.jobTimeoutMs = 600000 + i;
    f.pipeline.reconfigure(); f.pipeline.start(f.agent);
    t.mock.timers.tick(90000); await finishJobs(f);
  }
  assert.deepEqual(f.calls, ['prepare', 'coordinate'], 'settings and reattachment are not new conversation activity');
});

test('unrelated settings and duplicate callbacks preserve the existing idle deadline', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent);
  t.mock.timers.tick(60000); f.cfg.jobTimeoutMs = 600000;
  f.pipeline.reconfigure(); f.pipeline.reconfigure();
  t.mock.timers.tick(29999); await finishJobs(f); assert.deepEqual(f.calls, []);
  t.mock.timers.tick(1); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate']);
});

test('changing the idle delay adjusts pending work from the original idle start', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent);
  t.mock.timers.tick(60000); f.cfg.flushIdleMs = 120000; f.pipeline.reconfigure();
  t.mock.timers.tick(59999); await finishJobs(f); assert.deepEqual(f.calls, []);
  t.mock.timers.tick(1); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate']);
});

test('disabling idle flush cancels work; re-enabling alone does not wake history', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent);
  f.cfg.flushIdleMs = 0; f.pipeline.reconfigure();
  t.mock.timers.tick(90000); await finishJobs(f); assert.deepEqual(f.calls, []);
  f.cfg.flushIdleMs = 90000; f.pipeline.reconfigure();
  t.mock.timers.tick(90000); await finishJobs(f); assert.deepEqual(f.calls, []);
  for (const e of exchange(f.s)) f.pipeline.observe(f.s, e);
  t.mock.timers.tick(90000); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate'], 'genuine new events still arm idle work');
});

test('settings do not wake multiple loaded idle sessions with no new activity', async t => {
  const f = idleFixture(t);
  for (const id of ['old-a', 'old-b', 'old-c']) {
    const session = new FixtureSession(id); system(session); user(session, 'Historical task'); exchange(session);
    const state = f.pipeline.state(session); state.initialized = true; state.eventsSincePrepare = 0;
    const agent = { session, status: 'idle', options: {} };
    f.pipeline.start(agent);
  }
  f.cfg.jobTimeoutMs = 600000; f.pipeline.reconfigure();
  t.mock.timers.tick(180000); await finishJobs(f);
  assert.deepEqual(f.calls, []); assert.equal(f.pipeline.timers.size, 0);
});

test('idle review of a prepared record does not prepare additional historical backlog', async t => {
  const f = idleFixture(t); add(f); exchange(f.s);
  f.state.initialized = true; f.state.eventsSincePrepare = 0; f.state.review.newRecords = 1;
  f.pipeline.start(f.agent); t.mock.timers.tick(90000); await finishJobs(f);
  assert.deepEqual(f.calls, ['coordinate']);
});

test('idle and batch coordination of the same input do not schedule a duplicate review', async t => {
  const f = idleFixture(t); f.cfg.coordinatorEvery = 2; f.cfg.coordinatorMinGapMs = 30000;
  f.state.review.newRecords = 1; add(f); let release;
  const original = f.hub.call;
  f.hub.call = async (...args) => args[1] === 'coordinate'
    ? (f.calls.push('coordinate'), new Promise(resolve => { release = resolve; })) : original(...args);
  f.pipeline.start(f.agent); t.mock.timers.tick(90000);
  await f.pipeline.jobs.get(f.s.id + ':prepare');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.state.review.needed, false, 'joining the same review is not new work');
  release({ blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] });
  await finishJobs(f); t.mock.timers.tick(90000); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare', 'coordinate']);
});


test('new records reaching the configured cadence during coordination schedule one follow-up', async t => {
  const f = idleFixture(t, { coordinatorEvery: 1 }); f.agent.status = 'running'; f.cfg.flushIdleMs = 0; f.cfg.coordinatorMinGapMs = 30000;
  add(f); f.state.review.newRecords = 1; f.pipeline.agents.set(f.s.id, f.agent);
  let release, reviews = 0; const original = f.hub.call;
  f.hub.call = async (...args) => args[1] === 'coordinate' && ++reviews === 1
    ? (f.calls.push('coordinate'), new Promise(resolve => { release = resolve; })) : original(...args);
  const review = f.pipeline.coordinate(f.agent, true);
  await f.pipeline.prepare(f.agent, true);
  assert.equal(f.state.review.needed, true);
  release({ blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] });
  await review; t.mock.timers.tick(30000); await finishJobs(f);
  assert.deepEqual(f.calls, ['coordinate', 'prepare', 'coordinate']);
  assert.equal(f.state.review.newRecords, 0);
});

test('disposing during idle preparation never launches a coordinator afterwards', async t => {
  const f = idleFixture(t); add(f); f.state.review.newRecords = 1; let release;
  const original = f.hub.call;
  f.hub.call = async (...args) => args[1] === 'prepare'
    ? (f.calls.push('prepare'), new Promise(resolve => { release = resolve; })) : original(...args);
  f.pipeline.start(f.agent); t.mock.timers.tick(90000);
  assert.deepEqual(f.calls, ['prepare']);
  f.pipeline.dispose(f.s.id);
  release({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] });
  await finishJobs(f); await Promise.resolve();
  assert.deepEqual(f.calls, ['prepare']); assert.equal(f.pipeline.timers.size, 0);
});


test('idle preprocessing is off by default, including old configurations with a wait time', async t => {
  assert.equal(contextConfig().idlePreprocessEnabled, false);
  assert.equal(contextConfig({ flushIdleMs: 90000 }).idlePreprocessEnabled, false);
  assert.throws(() => contextConfig({ idlePreprocessEnabled: 'false' }), /布尔/);
  const f = idleFixture(t, { idlePreprocessEnabled: false }); f.pipeline.start(f.agent);
  t.mock.timers.tick(900000); await finishJobs(f);
  await f.pipeline.flushIdle(f.agent);
  assert.deepEqual(f.calls, []); assert.equal(f.pipeline.timers.has(f.s.id + ':idle'), false);
});

test('idle switch cancels a pending timer and is independent from event/manual preparation', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent); t.mock.timers.tick(60000);
  f.cfg.idlePreprocessEnabled = false; f.pipeline.reconfigure();
  assert.equal(f.cfg.flushIdleMs, 90000, 'retain the configured wait for later use');
  t.mock.timers.tick(900000); await finishJobs(f); assert.deepEqual(f.calls, []);
  await f.pipeline.prepare(f.agent, true); await finishJobs(f);
  assert.deepEqual(f.calls, ['prepare'], 'manual preparation remains available while idle is disabled');
  f.cfg.digestEvery = 4; f.agent.status = 'running';
  for (const event of exchange(f.s)) f.pipeline.observe(f.s, event);
  for (const event of exchange(f.s)) f.pipeline.observe(f.s, event);
  await finishJobs(f); assert.ok(f.calls.length > 1, 'normal event threshold is not gated by the idle switch');
});

test('a missed settings callback still cannot run an idle flush after disabling', async t => {
  const f = idleFixture(t); f.pipeline.start(f.agent); f.cfg.idlePreprocessEnabled = false;
  t.mock.timers.tick(90000); await finishJobs(f); assert.deepEqual(f.calls, []);
});

test('enabling idle preprocessing alone does not wake historical sessions', async t => {
  const f = idleFixture(t, { idlePreprocessEnabled: false }); f.pipeline.start(f.agent);
  f.cfg.idlePreprocessEnabled = true; f.pipeline.reconfigure();
  t.mock.timers.tick(90000); await finishJobs(f); assert.deepEqual(f.calls, []);
  for (const event of exchange(f.s)) f.pipeline.observe(f.s, event);
  t.mock.timers.tick(89999); await finishJobs(f); assert.deepEqual(f.calls, []);
  t.mock.timers.tick(1); await finishJobs(f); assert.deepEqual(f.calls, ['prepare', 'coordinate']);
});

test('disabling while idle preparation runs keeps the result but skips the forced idle review', async t => {
  const f = idleFixture(t); let release;
  f.hub.call = async (_agent, kind) => { f.calls.push(kind); return new Promise(resolve => { release = resolve; }); };
  f.pipeline.start(f.agent); t.mock.timers.tick(90000); assert.deepEqual(f.calls, ['prepare']);
  f.cfg.idlePreprocessEnabled = false; f.pipeline.reconfigure();
  release({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: prepared() }] });
  await finishJobs(f); assert.equal(f.state.records.length, 1); assert.deepEqual(f.calls, ['prepare']);
});


test('an explicit manual selection overrides an earlier automatic keep decision', async t => {
  const f = setup(t, { automaticReplace: false }); const r = add(f);
  f.state.pending = plan(f, [['keep', r]]); f.store.save(f.state);
  const before = JSON.stringify(f.s.snapshotEvents());
  assert.equal(await f.pipeline.applyReady(f.agent), null);
  assert.equal(JSON.stringify(f.s.snapshotEvents()), before);
  const result = await f.pipeline.applyReady(f.agent, { manual: true, ids: [r.id], mode: 'detail' });
  assert.ok(result); assert.equal(f.state.records[0].mode, 'detail');
  assert.match(f.pipeline.recall(f.s, { id: r.id }), /9007199254740993/);
});

test('unchanged project publication causes no filesystem writes or context injection', t => {
  const f = setup(t); f.state.binding = { scope: 'project', project: '/project', title: f.s.id };
  f.s.header.memoryScope = 'project'; f.store.save(f.state);
  f.pipeline.publishMemory(f.s);
  const before = JSON.stringify(f.s.snapshotEvents());
  const original = f.store.save.bind(f.store); let writes = 0;
  f.store.save = (...args) => { writes++; return original(...args); };
  f.pipeline.publishMemory(f.s); f.pipeline.publishMemory(f.s);
  assert.equal(writes, 0); assert.equal(JSON.stringify(f.s.snapshotEvents()), before);
  f.store.setGlobal('A user update', 0); f.pipeline.publishMemory(f.s);
  assert.equal(writes, 1); assert.match(JSON.stringify(f.s.snapshotEvents()), /A user update/);
});


test('applying a prepared keep plan without an explicit selection leaves every source event unchanged', async t => {
  const f = setup(t), record = add(f);
  f.state.pending = plan(f, [['keep', record]]); f.store.save(f.state);
  const before = JSON.stringify(f.s.snapshotEvents());
  assert.equal(await f.pipeline.applyReady(f.agent, { manual: true }), null);
  assert.equal(JSON.stringify(f.s.snapshotEvents()), before);
  assert.equal(f.state.records[0].mode, 'raw');
});

test('one-click manual application keeps the prepared mix of brief and keep decisions', async t => {
  const f = setup(t), brief = add(f, 'First'), kept = add(f, 'Second');
  f.state.pending = plan(f, [['brief', brief], ['keep', kept]]); f.store.save(f.state);
  assert.ok(await f.pipeline.applyReady(f.agent, { manual: true }));
  assert.equal(f.state.records.find(r => r.id === brief.id).mode, 'brief');
  assert.equal(f.state.records.find(r => r.id === kept.id).mode, 'raw');
  assert.ok(kept.sourceSeqs.every(seq => f.s.surface.nodes.includes(seq)));
});
