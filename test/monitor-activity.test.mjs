import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { HubStore } from '../src/hub-store.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { monitorActivityFingerprint } from '../src/monitor-activity.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-monitor-activity-')), store = new HubStore(directory);
  const ledger = new MonitorLedger(directory, { now: () => 1000 });
  assert.ok(ledger.db, ledger.error);
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, store, ledger };
}
const state = () => ({ id: 'archive', metrics: {}, actions: {},
  activity: [{ at: 100, kind: 'main', usage: { inputTokens: 12, outputTokens: 3 } }] });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('archive receipt fingerprints follow atomic replacement, corruption recovery and deletion without rewriting files', t => {
  const { directory, store, ledger } = fixture(t), initial = state(); store.save(initial);
  const path = join(directory, 'sessions', 'archive.json'), raw = readFileSync(path, 'utf8');
  const first = store.monitorStates()[0], signature = hash(first.activity);
  assert.equal(monitorActivityFingerprint(first.activity), signature);
  assert.throws(() => { first.activity[0].usage.inputTokens = 99; }, TypeError);
  assert.throws(() => first.activity.push({ at: 200 }), TypeError);
  assert.equal(Object.isFrozen(initial.activity), false);
  ledger.import([first]); ledger.import(store.monitorStates());
  assert.equal(ledger.imported.get('archive'), signature);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 1);
  assert.equal(readFileSync(path, 'utf8'), raw);
  const next = state(); next.activity[0].usage.inputTokens = 13;
  writeFileSync(path + '.replacement', JSON.stringify(next)); renameSync(path + '.replacement', path);
  const second = store.monitorStates()[0]; assert.notEqual(second.activity, first.activity);
  assert.equal(monitorActivityFingerprint(second.activity), hash(second.activity));
  assert.notEqual(monitorActivityFingerprint(second.activity), signature);
  ledger.import([second]); assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
  writeFileSync(path, '{broken'); assert.deepEqual(store.monitorStates(), []); assert.equal(store.monitorErrors.size, 1);
  store.save(next); assert.equal(store.monitorStates().length, 1); assert.equal(store.monitorErrors.size, 0);
  unlinkSync(path); assert.deepEqual(store.monitorStates(), []); assert.equal(store.monitorCache.size, 0);
});

test('live mutable receipts and frozen outer arrays never receive trusted archive fingerprints', t => {
  const { store, ledger } = fixture(t), live = store.state('archive');
  live.activity.push(...state().activity); store.save(live);
  const first = store.monitorStates()[0]; assert.equal(first.activity, live.activity);
  const old = monitorActivityFingerprint(first.activity); live.activity[0].usage.inputTokens = 18;
  assert.notEqual(monitorActivityFingerprint(live.activity), old);
  ledger.import([first]); const signature = ledger.imported.get('archive');
  live.activity[0].usage.outputTokens = 9; ledger.import(store.monitorStates());
  assert.notEqual(ledger.imported.get('archive'), signature);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
  const shallow = Object.freeze([{ usage: { outputTokens: 1 } }]), before = monitorActivityFingerprint(shallow);
  shallow[0].usage.outputTokens = 2; assert.notEqual(monitorActivityFingerprint(shallow), before);
  store.save(live); store.release(live.id);
  const archived = store.monitorStates()[0]; assert.notEqual(archived.activity, live.activity);
  assert.equal(Object.isFrozen(archived.activity), true); assert.equal(Object.isFrozen(live.activity), false);
});

test('a failed import commit cannot make immutable archive references skip their retry', t => {
  const { store, ledger } = fixture(t); store.save(state());
  const states = store.monitorStates(), exec = ledger.db.exec.bind(ledger.db);
  ledger.db.exec = sql => { if (sql === 'RELEASE monitor_import') throw Error('isolated archive commit failure'); return exec(sql); };
  ledger.import(states); assert.equal(ledger.imported.size, 0);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 0);
  ledger.db.exec = exec; ledger.import(states);
  assert.equal(ledger.imported.get('archive'), hash(states[0].activity));
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 1);
});
