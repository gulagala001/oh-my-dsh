import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubStore } from '../src/hub-store.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { handleMonitorApi } from '../src/monitor-api.mjs';

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
