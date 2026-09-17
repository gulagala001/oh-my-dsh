import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { newRecord, normalizeChoices, userRevision, preparationWorkload } from '../src/context/core.mjs';
import { FixtureSession, user, system, plugin, exchange, adapter } from './context-fixture.mjs';
const prepared = { summary: 'Read the file successfully.', documents: [] };
const reply = (name, arguments_) => ({ blocks: [{ type: 'tool-call', name, arguments: arguments_ }] });
function setup(t, config = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  const dir = mkdtempSync(join(tmpdir(), 'cadence-stale-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = new FixtureSession(); system(session); user(session, 'Test task.');
  const cfg = contextConfig({ keepTailEvents: 0, traceEnabled: true, coordinatorMinGapMs: 30000, coordinatorEvery: 2, ...config });
  const calls = [], actions = [], hub = { store: { dir }, config: () => cfg, scope: () => ({ mode: 'session', project: 'test' }), ctx: {},
    action(_s, name, _n, detail) { actions.push({ name, detail }); },
    async call(_a, kind, request) { calls.push({ kind, request }); return kind === 'prepare' ? reply('prepare_segment', prepared) : reply('submit_context_choices', { choices: [] }); } };
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const state = pipeline.state(session), agent = { session, status: 'running' }; pipeline.agents.set(session.id, agent);
  const add = () => { const r = newRecord(session, exchange(session), prepared, state.binding); state.records.push(r); pipeline.store.save(state); return r; };
  return { session, state, pipeline, agent, cfg, hub, calls, actions, add };
}
const choice = (action, ids, extra = {}) => ({ action, ids, summary: '', documents: [], ...extra });
const plan = (f, choices) => ({ id: 'earlier-plan', userRevision: userRevision(f.session), choices: normalizeChoices({ choices }, f.state, f.session) });
async function finish(f) { do { await Promise.all([...f.pipeline.jobs.values()]); } while (f.pipeline.jobs.size); }

test('32 events then 4 small events use one call; the small tail remains pending', async t => {
  const f = setup(t, { coordinatorEvery: 999 });
  for (let i = 0; i < 18; i++) exchange(f.session, 'ok');
  f.state.eventsSincePrepare = 32;
  await f.pipeline.prepare(f.agent);
  assert.equal(f.calls.length, 1); assert.equal(f.state.records[0].sourceSeqs.length, 32);
  assert.equal(f.state.prepareDeferred.events, 4); assert.equal(f.pipeline.view(f.session).backlog.events, 4);
  assert.equal(f.state.eventsSincePrepare, 0);
  t.mock.timers.tick(3600000); await finish(f); assert.equal(f.calls.length, 1);
  await f.pipeline.prepare(f.agent, true); assert.equal(f.calls.length, 2, 'explicit preparation can process a small remainder');
});

test('a full second window and a short but large second window may continue', async t => {
  const f = setup(t, { coordinatorEvery: 999 });
  for (let i = 0; i < 32; i++) exchange(f.session, 'ok');
  f.state.eventsSincePrepare = 32; await f.pipeline.prepare(f.agent);
  assert.equal(f.calls.length, 2); assert.equal(f.state.records.length, 2);
  for (let i = 0; i < 16; i++) exchange(f.session, 'ok');
  exchange(f.session, 'large result '.repeat(3000));
  f.state.eventsSincePrepare = 32; await f.pipeline.prepare(f.agent);
  assert.equal(f.calls.length, 4); assert.equal(f.state.records.at(-1).sourceSeqs.length, 2);
});

test('old records, reminders and attachment bytes cannot inflate continuation work', t => {
  const f = setup(t); const old = f.add(), fresh = exchange(f.session, 'ok');
  const reminder = plugin(f.session, 'Old status. '.repeat(5000), 'tasks');
  fresh[1].data.message.content[0].content.push({ type: 'image', data: 'x'.repeat(100000) });
  const workload = preparationWorkload(f.session, f.state, [...old.sourceSeqs.map(seq => f.session.eventAt(seq)), ...fresh, reminder]);
  assert.equal(workload.events, 2); assert.ok(workload.estimatedTokens < 100);
});

test('a failed second window retries only that window, not another entire batch', async t => {
  const f = setup(t, { coordinatorEvery: 999 });
  for (let i = 0; i < 48; i++) exchange(f.session, 'ok');
  f.state.eventsSincePrepare = 32; let calls = 0;
  f.hub.call = async () => { calls++; if (calls === 2) throw Error('transient'); return reply('prepare_segment', prepared); };
  await f.pipeline.prepare(f.agent); assert.equal(calls, 2); assert.equal(f.state.records.length, 1);
  t.mock.timers.tick(2000); await finish(f);
  assert.equal(calls, 3); assert.equal(f.state.records.length, 2);
  assert.equal(f.pipeline.view(f.session).backlog.events, 32);
  t.mock.timers.tick(3600000); await finish(f); assert.equal(calls, 3);
});

test('an earlier representation change applied during generation discards obsolete snapshots without error or forced retry', async t => {
  const f = setup(t), a = f.add(), b = f.add(); let release;
  f.state.pending = plan(f, [choice('brief', [a.id]), choice('brief', [b.id])]);
  f.hub.call = () => new Promise(resolve => { release = resolve; });
  const job = f.pipeline.coordinate(f.agent, true);
  await f.pipeline.applyReady(f.agent);
  const survivor = f.state.records.find(r => !r.mergedInto), before = [...f.session.surface.nodes];
  release(reply('submit_context_choices', { choices: [choice('brief', [a.id])] })); await job;
  assert.equal(f.state.review.lastDiscard.reason, 'records-changed');
  assert.equal(f.state.failures.coordinate, undefined); assert.equal(f.state.review.replanAttempts, 0);
  assert.equal(f.state.pending, null); assert.deepEqual(f.session.surface.nodes, before);
  assert.equal(f.state.records.find(r => r.id === survivor.id).mergedInto, undefined);
  assert.equal(f.pipeline.timers.has(f.session.id + ':coordinate'), false);
  assert.ok(!f.actions.some(a => a.name === 'contextcoordinateErrors'));
});

test('same ID with a changed representation is stale and cannot overwrite a newer pending plan', async t => {
  const f = setup(t), a = f.add(); let release;
  f.hub.call = () => new Promise(resolve => { release = resolve; });
  const job = f.pipeline.coordinate(f.agent, true);
  await f.pipeline.applyReady(f.agent, { manual: true, ids: [a.id], mode: 'brief' });
  const newer = plan(f, [choice('keep', [a.id])]); f.state.pending = newer;
  release(reply('submit_context_choices', { choices: [choice('detail', [a.id])] })); await job;
  assert.equal(f.state.pending, newer); assert.equal(f.state.records[0].mode, 'brief');
  assert.equal(f.state.failures.coordinate, undefined); assert.deepEqual(f.state.review.lastDiscard.ids, [a.id]);
});

test('stale results with enough new work schedule one fresh review at the normal cadence', async t => {
  const f = setup(t), a = f.add(), b = f.add(); let release, count = 0;
  f.state.pending = plan(f, [choice('brief', [a.id]), choice('brief', [b.id])]); f.state.review.newRecords = 2;
  f.hub.call = async (_a, _kind, request) => {
    count++; if (count === 1) return new Promise(resolve => { release = resolve; });
    const input = JSON.parse(request.messages[0].content[0].text);
    assert.ok(input.records.filter(r => r.id === a.id || r.id === b.id).every(r => r.representation === 'brief'));
    return reply('submit_context_choices', { choices: [] });
  };
  const job = f.pipeline.coordinate(f.agent); await f.pipeline.applyReady(f.agent);
  release(reply('submit_context_choices', { choices: [choice('brief', [a.id])] })); await job;
  t.mock.timers.tick(29999); await finish(f); assert.equal(count, 1);
  t.mock.timers.tick(1); await finish(f); assert.equal(count, 2);
  t.mock.timers.tick(3600000); await finish(f); assert.equal(count, 2);
  assert.equal(f.state.failures.coordinate, undefined);
});

test('unrelated new events do not invalidate a valid decision or force a below-threshold review', async t => {
  const f = setup(t), a = f.add(); f.state.review.newRecords = 1; let release;
  f.hub.call = () => new Promise(resolve => { release = resolve; });
  const job = f.pipeline.coordinate(f.agent, true);
  f.add(); f.state.review.newRecords++; f.state.review.needed = true;
  release(reply('submit_context_choices', { choices: [choice('brief', [a.id])] })); await job;
  assert.ok(f.state.pending); assert.equal(f.state.review.newRecords, 1);
  assert.equal(f.state.review.lastDiscard, undefined);
  assert.equal(f.pipeline.timers.has(f.session.id + ':coordinate'), false);
});

test('fabricated IDs on unchanged input remain genuine validation failures with bounded retry', async t => {
  const f = setup(t); f.add(); let calls = 0;
  f.hub.call = async () => { calls++; return reply('submit_context_choices', { choices: [choice('brief', ['invented'])] }); };
  await f.pipeline.coordinate(f.agent, true); assert.equal(f.state.failures.coordinate.count, 1);
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(30000); await finish(f); }
  assert.equal(calls, 3); assert.equal(f.state.review.lastDiscard, undefined);
});

test('a stale already-queued plan is discarded without spending the failure/replan budget', async t => {
  const f = setup(t), a = f.add(); const old = plan(f, [choice('detail', [a.id])]);
  await f.pipeline.applyReady(f.agent, { manual: true, ids: [a.id], mode: 'brief' });
  f.state.pending = old;
  await f.pipeline.applyReady(f.agent, { ignoreCooldown: true });
  assert.equal(f.state.pending, null); assert.equal(f.state.review.lastDiscard.reason, 'pending-plan-stale');
  assert.equal(f.state.review.lastRejection, undefined); assert.equal(f.state.review.replanAttempts, undefined);
});

test('new user instructions still get one fresh review after cooldown, without failure accounting', async t => {
  const f = setup(t); f.add(); let release, calls = 0;
  f.hub.call = async () => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve; }) : reply('submit_context_choices', { choices: [] }); };
  const work = f.pipeline.coordinate(f.agent, true);
  f.pipeline.observe(f.session, user(f.session, 'A real changed instruction.'));
  release(reply('submit_context_choices', { choices: [] })); await work;
  assert.equal(f.state.review.lastDiscard.reason, 'user-changed'); assert.equal(f.state.failures.coordinate, undefined);
  t.mock.timers.tick(29999); await finish(f); assert.equal(calls, 1);
  t.mock.timers.tick(1); await finish(f); assert.equal(calls, 2);
  t.mock.timers.tick(30000); await finish(f); assert.equal(calls, 2);
});

test('a delayed normal-cadence call rechecks the threshold rather than becoming forced', async t => {
  const f = setup(t); f.add(); f.state.review.lastAt = Date.now(); f.state.review.newRecords = 2;
  await f.pipeline.coordinate(f.agent); assert.equal(f.calls.length, 0);
  f.state.review.newRecords = 0; f.state.review.needed = false;
  t.mock.timers.tick(30000); await finish(f); assert.equal(f.calls.length, 0);
});

test('an accepted newer pending decision cannot be overwritten even when records are unchanged', async t => {
  const f = setup(t), a = f.add(); let release;
  f.hub.call = () => new Promise(resolve => { release = resolve; });
  const job = f.pipeline.coordinate(f.agent, true);
  const newer = { ...plan(f, [choice('keep', [a.id])]), id: 'newer-plan' }; f.state.pending = newer;
  release(reply('submit_context_choices', { choices: [choice('brief', [a.id])] })); await job;
  assert.equal(f.state.pending, newer); assert.equal(f.state.review.lastDiscard.reason, 'newer-plan');
  assert.equal(f.state.failures.coordinate, undefined); assert.equal(f.pipeline.timers.size, 0);
});

test('a rejected duplicate is consumed, not scheduled again on the same old record count', async t => {
  const f = setup(t), a = f.add(), b = f.add(); f.state.review.newRecords = 2;
  const selection = [choice('brief', [a.id]), choice('brief', [b.id])];
  const normalized = normalizeChoices({ choices: selection }, f.state, f.session);
  const { hash } = await import('../src/context/core.mjs');
  f.state.review.rejectedPlans = [hash(normalized.map(({ observed, ...c }) => c))];
  await f.pipeline.coordinate(f.agent); // default reply is empty; replace it below
  f.state.review.newRecords = 2; f.state.review.needed = true;
  f.hub.call = async () => { f.calls.push({ kind: 'coordinate' }); return reply('submit_context_choices', { choices: selection }); };
  t.mock.timers.tick(30000); await f.pipeline.coordinate(f.agent);
  const calls = f.calls.length; assert.equal(f.state.review.newRecords, 0);
  t.mock.timers.tick(3600000); await finish(f); assert.equal(f.calls.length, calls);
});

test('normal scheduling cannot downgrade an already queued user-triggered review', async t => {
  const f = setup(t); f.add(); f.state.review.lastAt = Date.now();
  await f.pipeline.coordinate(f.agent, true);
  t.mock.timers.tick(10000); f.state.review.newRecords = 2;
  await f.pipeline.coordinate(f.agent);
  f.state.review.newRecords = 0;
  t.mock.timers.tick(19999); await finish(f); assert.equal(f.calls.length, 0);
  t.mock.timers.tick(1); await finish(f); assert.equal(f.calls.length, 1);
});

test('pending decision validates the content snapshot even if ID and version did not change', async t => {
  const f = setup(t), a = f.add(); f.state.pending = plan(f, [choice('brief', [a.id])]);
  a.summary = 'A later revision of the prepared record.';
  const before = [...f.session.surface.nodes];
  await f.pipeline.applyReady(f.agent);
  assert.deepEqual(f.session.surface.nodes, before); assert.equal(f.state.pending, null);
  assert.equal(f.state.review.lastDiscard.reason, 'pending-plan-stale');
  assert.equal(f.state.review.lastRejection, undefined);
});

test('manual compaction clears queued forced review state before later ordinary scheduling', async t => {
  const f = setup(t); f.add(); f.state.review.lastAt = Date.now();
  await f.pipeline.coordinate(f.agent, true);
  assert.equal(f.pipeline.reviewTimers.get(f.session.id + ':coordinate').force, true);
  await f.pipeline.runManual(f.agent, { operation: 'processed' });
  assert.equal(f.pipeline.reviewTimers.has(f.session.id + ':coordinate'), false);
  f.state.review.newRecords = 2; await f.pipeline.coordinate(f.agent);
  f.state.review.newRecords = 0;
  t.mock.timers.tick(30000); await finish(f); assert.equal(f.calls.length, 0);
});

test('disabled merge replies never publish a plan or change existing records', async t => {
  const f = setup(t), a = f.add(), b = f.add();
  const records = JSON.stringify(f.state.records), nodes = [...f.session.surface.nodes];
  f.hub.call = async () => reply('submit_context_choices', { choices: [choice('merge', [a.id, b.id], prepared)] });
  await f.pipeline.coordinate(f.agent, true);
  assert.equal(f.state.pending, null); assert.equal(f.state.failures.coordinate.count, 1);
  assert.equal(JSON.stringify(f.state.records), records); assert.deepEqual(f.session.surface.nodes, nodes);
});
