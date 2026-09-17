import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializePreparationInput } from '../src/context/input-budget.mjs';
import { ContextStore } from '../src/context/store.mjs';
import { HubStore, validateSessionId } from '../src/hub-store.mjs';
import { monitorSelection, compactMonitorSnapshot } from '../src/monitoring.mjs';
import { createPoller } from '../src/client/polling.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const temporary = t => { const path = mkdtempSync(join(tmpdir(), 'omd-opt-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };

test('linear input budgeting exactly matches the previous JSON and lookback selection', () => {
  for (let count = 0; count < 35; count++) {
    const input = { reference: Array.from({ length: count }, (_, i) => ({ text: '中文😀\\\"\n'.repeat(i + 1), seq: i })), segment: [{ text: 'Never truncate source', attachment: { id: 'original' } }], target_characters: 1200 };
    for (const budget of [0, 120, 180, 400, 900, 4000, 12000, 100000]) {
      const old = structuredClone(input), next = structuredClone(input);
      while (JSON.stringify(old).length > budget && old.reference.length) old.reference.shift();
      if (JSON.stringify(old).length > budget) assert.throws(() => serializePreparationInput(next, budget), /原文保留/);
      else { assert.equal(serializePreparationInput(next, budget), JSON.stringify(old)); assert.deepEqual(next, old); }
      assert.deepEqual(next.segment, input.segment);
    }
  }
});

test('archive cache avoids repeated parsing and observes external replacements, additions and deletions', t => {
  const root = temporary(t), writer = new ContextStore(root), reader = new ContextStore(root);
  for (let i = 0; i < 12; i++) writer.save(writer.state('s' + i, { scope: 'project', project: '/one', title: 's' + i }));
  let reads = 0; const read = reader.read.bind(reader); reader.read = (...args) => { reads++; return read(...args); };
  assert.equal(reader.all().length, 12); assert.equal(reads, 12);
  assert.equal(reader.all().length, 12); assert.equal(reads, 12);
  const changed = writer.state('s0'); changed.steps = 17; writer.save(changed);
  assert.equal(reader.all().find(s => s.id === 's0').steps, 17); assert.equal(reads, 13);
  writer.save(writer.state('new', { scope: 'session' })); assert.equal(reader.all().length, 13); assert.equal(reads, 14);
  unlinkSync(writer.path('new')); assert.equal(reader.all().length, 12); assert.equal(reader.diskCache.size, 12);
  writeFileSync(writer.path('s0'), '{broken'); assert.throws(() => reader.all());
  writer.save(changed); assert.equal(reader.all().find(s => s.id === 's0').steps, 17);
  const wrong = { ...JSON.parse(readFileSync(writer.path('s0'), 'utf8')), id: 'another' };
  writeFileSync(writer.path('s0'), JSON.stringify(wrong)); assert.throws(() => reader.all(), /身份/);
});

test('archive caching keeps a live transaction object authoritative and preserves private scope', t => {
  const store = new ContextStore(temporary(t));
  const own = store.state('own', { scope: 'project', project: '/one' }); store.save(own);
  const privateState = store.state('private', { scope: 'session' }); store.save(privateState);
  own.steps = 19; own.transaction = { id: 'unflushed-view' };
  assert.equal(store.all().find(s => s.id === 'own'), own);
  assert.equal(store.all().find(s => s.id === 'own').transaction.id, 'unflushed-view');
  assert.deepEqual(store.visible('private'), []);
});

test('session IDs cannot escape the historical state directory', t => {
  const store = new HubStore(temporary(t));
  for (const id of ['../settings', '..\\settings', 'a/b', 'a\\b', '..', '.', '', '\0', undefined]) {
    assert.throws(() => store.state(id), /编号/); assert.throws(() => store.save({ id }), /编号/);
  }
  for (const id of ['session-a-b', 'draft-ui', '会话 1']) assert.equal(validateSessionId(id), id);
  assert.equal(store.states.size, 0);
});

test('compact monitoring preserves totals and excludes histories, documents and raw prompts', () => {
  const states = [
    { id: 'grandchild', parentSession: 'child', metrics: { main: { calls: 2, peakContext: 50, inputTokens: 10 } }, actions: { contextReplacements: 1 } },
    { id: 'unrelated', metrics: { main: { calls: 100 } }, actions: {} },
    { id: 'root', metrics: { main: { calls: 3, peakContext: 100, inputTokens: 20 } }, actions: { contextReplacements: 2 } },
    { id: 'child', parentSession: 'root', metrics: { subagent: { calls: 1 } }, actions: {} },
  ];
  const selected = monitorSelection(states, 'root');
  assert.deepEqual(selected.metrics.main, { calls: 5, peakContext: 100, inputTokens: 30 });
  assert.deepEqual([...selected.ids], ['root', 'child', 'grandchild']);
  const compact = compactMonitorSnapshot({ ...selected, meter: { totalTokens: 200, nodes: [{ text: 'PRIVATE' }] }, liveCalls: [{ sessionId: 'root', kind: 'prepare', startedAt: 4, request: 'PRIVATE' }], sessionCount: 3, running: 'idle' });
  assert.deepEqual(compact.metrics.main, selected.metrics.main);
  assert.equal(compact.actions.contextReplacements, 3); assert.equal(compact.meter.totalTokens, 200);
  assert.doesNotMatch(JSON.stringify(compact), /PRIVATE|nodes|request|documents|contextHistory/);
  assert.equal(monitorSelection(states, 'root', 'all').metrics.main.calls, 105);
  assert.equal(monitorSelection([{ id: 'a', parentSession: 'b' }, { id: 'b', parentSession: 'a' }], 'a').ids.size, 2);
});

test('polling shares no stale deliveries across refresh, visibility or disposal', async () => {
  const visibility = new EventTarget(); visibility.visibilityState = 'visible';
  const pending = [], delivered = [], errors = [];
  const poller = createPoller({ visibility, interval: 10000, read: signal => new Promise(resolve => pending.push({ signal, resolve })), onData: value => delivered.push(value), onError: error => errors.push(error) });
  poller.start(); assert.equal(pending.length, 1);
  const second = poller.refresh(); assert.equal(pending.length, 2); assert.ok(pending[0].signal.aborted);
  pending[1].resolve('new'); await second; pending[0].resolve('old'); await delay(1);
  assert.deepEqual(delivered, ['new']);
  visibility.visibilityState = 'hidden'; visibility.dispatchEvent(new Event('visibilitychange'));
  await poller.refresh(); assert.equal(pending.length, 2);
  visibility.visibilityState = 'visible'; visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pending.length, 3); poller.stop(); assert.ok(pending[2].signal.aborted);
  pending[2].resolve('after disposal'); await delay(1);
  assert.deepEqual(delivered, ['new']); assert.deepEqual(errors, []);
  visibility.dispatchEvent(new Event('visibilitychange')); assert.equal(pending.length, 3);
});

test('polling reads time out and recover without overlapping requests', async () => {
  const errors = []; let calls = 0, active = 0, peak = 0;
  const poller = createPoller({ interval: 8, timeout: 5, visibility: null,
    read: signal => { calls++; active++; peak = Math.max(peak, active); return new Promise((_, reject) => signal.addEventListener('abort', () => { active--; reject(signal.reason); }, { once: true })); },
    onData() { assert.fail('no successful reads'); }, onError: error => errors.push(error.message),
  });
  poller.start(); await delay(38); poller.stop(); await delay(1);
  assert.ok(calls >= 2); assert.ok(errors.length >= 1); assert.equal(peak, 1); assert.equal(active, 0);
});


test('monitoring archived sessions does not populate the full-state cache', t => {
  const root = temporary(t), writer = new HubStore(root), reader = new HubStore(root);
  const state = writer.state('archive'); state.metrics.main = { calls: 4 }; state.contextHistory = [{ raw: 'BIG_PRIVATE'.repeat(4000) }]; writer.save(state);
  assert.deepEqual(reader.monitorStates(), [{ id: 'archive', parentSession: undefined, metrics: { main: { calls: 4 } }, actions: {}, activity: [] }]);
  assert.equal(reader.states.size, 0); assert.doesNotMatch(JSON.stringify([...reader.monitorCache.values()]), /BIG_PRIVATE|contextHistory/);
  state.metrics.main.calls = 5; writer.save(state); assert.equal(reader.monitorStates()[0].metrics.main.calls, 5);
  reader.state('archive').metrics.main.calls = 6; assert.equal(reader.monitorStates()[0].metrics.main.calls, 6);
  unlinkSync(join(root, 'sessions', 'archive.json')); assert.deepEqual(reader.monitorStates(), []);
});

test('archive read caching is bounded and never discards the persisted documents', t => {
  const root = temporary(t), writer = new ContextStore(root);
  for (let i = 0; i < 6; i++) { const state = writer.state('s' + i, { scope: 'project', project: '/one' }); state.records = [{ id: 'r' + i, documents: [{ text: 'original'.repeat(1000) }] }]; writer.save(state); }
  const reader = new ContextStore(root, { maxDiskCacheBytes: 16000 });
  for (let run = 0; run < 3; run++) {
    const states = reader.all(); assert.equal(states.length, 6); assert.equal(states[0].records[0].documents[0].text.length, 8000);
    assert.ok(reader.diskCacheBytes <= 16000); assert.ok(reader.diskCache.size < 6);
  }
});
