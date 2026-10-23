import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubStore } from '../src/hub-store.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { handleMonitorApi } from '../src/monitor-api.mjs';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { EventEmitter } from 'node:events';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-monitor-metadata-')), store = new HubStore(directory), monitor = new MonitorLedger(directory);
  t.after(() => { monitor.close(); rmSync(directory, { recursive: true, force: true }); });
  const value = { id: 'archive', activity: [], metrics: {}, budget: { configured: true, spent: 3 }, contextHistory: ['body'] };
  store.save(value);
  return { directory, store, monitor, value };
}

test('single and full metadata reads follow archive replacement, corruption, deletion and live ownership', t => {
  const { directory, store, value } = fixture(t), path = join(directory, 'sessions/archive.json');
  const first = store.monitorState('archive');
  assert.deepEqual(first.budget, value.budget); assert.equal(Object.hasOwn(first, 'contextHistory'), false);
  assert.equal(store.states.size, 0); assert.equal(store.monitorStates()[0], first);
  value.budget.spent = 4;
  writeFileSync(path + '.replacement', JSON.stringify(value)); renameSync(path + '.replacement', path);
  assert.equal(store.monitorState('archive').budget.spent, 4);
  assert.equal(store.monitorStates()[0].budget.spent, 4);
  writeFileSync(path, '{broken');
  assert.throws(() => store.monitorState('archive')); assert.equal(store.monitorCache.size, 0);
  assert.deepEqual(store.monitorStates(), []); assert.equal(store.monitorErrors.size, 1);
  store.save({ ...value, id: 'other' });
  writeFileSync(path, JSON.stringify({ ...value, id: 'other' }));
  assert.throws(() => store.monitorState('archive'), /身份/);
  store.save(value); assert.equal(store.monitorState('archive').budget.spent, 4);
  const live = store.state('archive'); live.budget.spent = 5;
  assert.equal(store.monitorState('archive').budget.spent, 5);
  live.budget.spent = 6; assert.equal(store.monitorState('archive').budget.spent, 6);
  store.release('archive'); assert.equal(store.monitorState('archive').budget.spent, 4);
  unlinkSync(path); assert.equal(store.monitorState('archive'), undefined);
  assert.equal(store.monitorCache.has('archive.json'), false);
  assert.throws(() => store.monitorState('../archive'), /编号/);
});

test('monitor routes retain cold budgets and missing-session behavior without reading whole archived state', async t => {
  const { store, monitor, value } = fixture(t);
  store.peek = () => { throw Error('Full state is unnecessary for monitoring'); };
  const hub = { store, monitor, config: () => ({}), live: new Map(),
    dream: { store: { usage: () => ({}), jobActivity: () => ({}) } } };
  const ctx = { agents: new Map(), sessions: new Map(), get: () => ({ listSessions: async () => [] }) };
  async function read(view, id = 'archive') {
    let result;
    await handleMonitorApi({ hub, ctx, req: { method: 'GET' }, res: { setHeader() {} },
      url: new URL('http://isolated.invalid/oh-my-dsh/api/monitor?session=' + id + (view ? '&view=' + view : '')),
      send(_res, status, data) { result = { status, data }; } });
    return result;
  }
  assert.deepEqual((await read()).data.budget, value.budget);
  for (const view of ['context', 'usage', 'calls']) assert.equal((await read(view)).status, 200);
  assert.equal(store.states.size, 0);
  ctx.sessions.set('archive', {});
  const metadata = store.monitorState; store.monitorState = () => { throw Error('Live context must not read archives'); };
  assert.equal((await read('context')).status, 200);
  store.monitorState = metadata;
  assert.equal((await read('usage', 'missing')).status, 404);
});

test('cooperative archive reads retain synchronous data, corruption, replacement and deletion semantics', async t => {
  const { store, directory, value } = fixture(t), path = join(directory, 'sessions/archive.json');
  const check = async () => {
    store.monitorCache.clear();
    const actual = await store.readMonitorSnapshot();
    store.monitorCache.clear();
    assert.deepEqual(actual.states, store.monitorStates());
    assert.deepEqual(actual.errors, store.monitorErrors);
    assert.equal(store.states.size, 0);
  };
  await check();
  store.save({ ...value, budget: { spent: 9 }, contextHistory: ['original remains intact'] }); await check();
  writeFileSync(path, '{broken'); await check();
  writeFileSync(path, JSON.stringify({ ...value, id: 'other' })); await check();
  store.save(value); await check();
  unlinkSync(path); await check();
});

test('cold scans yield to I/O, stop on cancellation and resume without partial error snapshots', async t => {
  const { store, value } = fixture(t);
  for (let i = 0; i < 4; i++) store.save({ ...value, id: 's' + i });
  let time = 0, reads = 0;
  t.mock.method(performance, 'now', () => time += 9);
  const original = store.readMonitorState.bind(store);
  t.mock.method(store, 'readMonitorState', id => { reads++; return original(id); });
  const controller = new AbortController();
  const cancel = yieldToIO().then(() => controller.abort(Error('disconnected')));
  await assert.rejects(store.readMonitorSnapshot(controller.signal), /abort|disconnected/i);
  await cancel;
  assert.equal(reads, 1, 'no further archive read after the request disconnects');
  assert.equal(store.monitorErrors.size, 0);
  const snapshot = await store.readMonitorSnapshot();
  assert.equal(snapshot.states.length, 5); assert.equal(snapshot.errors.size, 0);
  assert.equal(store.monitorCache.size, 5);
  controller.abort(); reads = 0;
  await assert.rejects(store.readMonitorSnapshot(controller.signal)); assert.equal(reads, 0);
  assert.equal(store.monitorPending.size, 0);
});

test('concurrent cold readers share a file and revalidate replacement, deletion and live ownership after I/O', async t => {
  const { store, directory, value } = fixture(t), path = join(directory, 'sessions/archive.json');
  const one = store.readMonitorState('archive'), two = store.readMonitorState('archive');
  assert.equal(store.monitorPending.size, 1);
  assert.equal(await one, await two); assert.equal(store.monitorPending.size, 0);
  store.monitorCache.clear();
  const replaced = store.readMonitorState('archive');
  writeFileSync(path + '.replacement', JSON.stringify({ ...value, budget: { spent: 12 } }));
  renameSync(path + '.replacement', path);
  assert.equal((await replaced).budget.spent, 12);
  store.monitorCache.clear();
  const deleted = store.readMonitorState('archive'); unlinkSync(path);
  assert.equal(await deleted, undefined); assert.equal(store.monitorCache.size, 0);
  store.save(value);
  const activated = store.readMonitorState('archive');
  store.state('archive').budget.spent = 15;
  assert.equal((await activated).budget.spent, 15);
  assert.equal(store.monitorPending.size, 0);
});

test('cancelling one concurrent scan preserves the other reader and releases in-flight files', async t => {
  const { store } = fixture(t), controller = new AbortController();
  const one = store.readMonitorSnapshot(controller.signal), two = store.readMonitorSnapshot();
  assert.equal(store.monitorPending.size, 1); controller.abort(Error('first panel closed'));
  await assert.rejects(one, /first panel closed/);
  assert.equal((await two).states.length, 1);
  assert.equal(store.monitorPending.size, 0);
});

test('a live session acquired between slices owns the completed projection', async t => {
  const { store, value } = fixture(t);
  let time = 0; t.mock.method(performance, 'now', () => time += 9);
  const update = yieldToIO().then(() => { const live = store.state(value.id); live.budget = { configured: true, spent: 99 }; });
  const snapshot = await store.readMonitorSnapshot(); await update;
  assert.equal(snapshot.states[0].budget.spent, 99);
  assert.equal(Object.isFrozen(store.states.get(value.id).activity), false);
});

test('monitor HTTP cancellation releases listeners and never sends a completed partial snapshot', async t => {
  const { store, monitor } = fixture(t);
  const hub = { store, monitor, config: () => ({}), live: new Map() };
  const ctx = { agents: new Map(), sessions: new Map() };
  const req = Object.assign(new EventEmitter(), { method: 'GET' });
  const res = Object.assign(new EventEmitter(), { setHeader() {} });
  let time = 0, sent = 0; t.mock.method(performance, 'now', () => time += 9);
  const closed = yieldToIO().then(() => { res.destroyed = true; res.emit('close'); });
  await assert.rejects(handleMonitorApi({ hub, ctx, req, res,
    url: new URL('http://isolated.invalid/oh-my-dsh/api/monitor?view=usage'), send() { sent++; } }));
  await closed; assert.equal(sent, 0);
  assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
});
