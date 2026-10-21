import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MonitorLedger, monitorQuery } from '../src/monitor-ledger.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-monitor-reads-')), now = 1792190400000;
  const ledger = new MonitorLedger(directory, { now: () => now });
  const writer = new DatabaseSync(join(directory, 'monitor-v1/usage.sqlite'));
  t.after(() => { writer.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  const append = (id, at = now - 1) => ledger.append({ id, at, sessionId: 'fixture', kind: 'main', source: 'native',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  const query = (at = now, params = {}, states = []) => ledger.query(states, new Set(['fixture']),
    monitorQuery({ session: 'fixture', ...params }, at), undefined, { usageOnly: true });
  return { ledger, writer, append, query, now };
}

test('usage reads follow snapshot versions, future cutoffs, filters and caller ownership', t => {
  const { ledger, writer, append, query, now } = fixture(t);
  let scans = 0, externalWrite;
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => {
    if (sql.startsWith('SELECT kind key,')) scans++;
    const statement = prepare(sql);
    if (!sql.includes('pragma_data_version')) return statement;
    return new Proxy(statement, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'get') return typeof value === 'function' ? value.bind(target) : value;
      return (...args) => { const row = value.apply(target, args), write = externalWrite; externalWrite = undefined; write?.(); return row; };
    } });
  };
  append('one');
  const first = query(); first.metrics.main.calls = 999;
  assert.equal(query(now + 1000).metrics.main.calls, 1); assert.equal(scans, 1);
  append('two'); assert.equal(query().metrics.main.calls, 2); assert.equal(scans, 2);
  writer.prepare('UPDATE calls SET outputTokens=25,totalTokens=35 WHERE id=?').run('one');
  assert.equal(query().metrics.main.outputTokens, 30); assert.equal(scans, 3);
  externalWrite = () => writer.prepare('UPDATE calls SET outputTokens=45,totalTokens=55 WHERE id=?').run('one');
  assert.equal(query().metrics.main.outputTokens, 30); assert.equal(scans, 3);
  assert.equal(query().metrics.main.outputTokens, 50); assert.equal(scans, 4);
  append('future', now + 6000);
  assert.equal(query().metrics.main.calls, 2);
  assert.equal(query(now + 6000).metrics.main.calls, 3);
  assert.deepEqual(query(now + 6000, { kind: 'prepare' }).metrics, {});
  assert.equal(query(now + 9000).metrics.main.calls, 3);
  ledger.close(); assert.equal(ledger.usageCache, null); assert.equal(ledger.legacyCache, null);
});

test('legacy reconciliation reuses database rows while reading live cumulative counters afresh', t => {
  const { ledger, writer, append, query } = fixture(t);
  append('one');
  const state = { id: 'fixture', metrics: { main: { calls: 3, inputTokens: 100, outputTokens: 40 } } };
  const before = query(undefined, {}, [state]); assert.equal(before.metrics.main.calls, 3);
  let scans = 0;
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => { if (sql.includes('GROUP BY sessionId,kind')) scans++; return prepare(sql); };
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 3); assert.equal(scans, 0);
  state.metrics.main.calls = 5; state.metrics.main.inputTokens = 200;
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 5); assert.equal(scans, 0);
  assert.equal(query().metrics.main.calls, 1);
  writer.prepare('UPDATE calls SET source=? WHERE id=?').run('dream', 'one');
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 6); assert.equal(scans, 1);
  assert.equal(state.metrics.main.calls, 5);
  ledger.close(); assert.equal(ledger.legacyCache, null);
});

test('row caches discard oversized results and failures, then allow recovery', t => {
  const { ledger, query } = fixture(t);
  ledger.db.exec('BEGIN');
  for (let i = 0; i < 1200; i++) ledger.append({ id: 'c' + i, at: 100, sessionId: 's' + i, kind: 'kind' + i,
    usage: { inputTokens: 1, outputTokens: 1 } });
  ledger.db.exec('COMMIT');
  const states = [{ id: 's0', metrics: { kind0: { calls: 2 } } }];
  assert.equal(Object.keys(query(undefined, { range: 'all' }, states).metrics).length, 1200);
  assert.equal(ledger.usageCache, null); assert.equal(ledger.legacyCache, null);
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => { if (sql.startsWith('SELECT kind key,')) throw Error('isolated usage failure'); return prepare(sql); };
  assert.throws(() => query(undefined, { range: 'all' }, states), /isolated usage failure/);
  assert.equal(ledger.usageCache, null);
  ledger.db.prepare = sql => { if (sql.includes('GROUP BY sessionId,kind')) throw Error('isolated legacy failure'); return prepare(sql); };
  assert.throws(() => query(undefined, { range: 'all' }, states), /isolated legacy failure/);
  assert.equal(ledger.legacyCache, null);
  ledger.db.prepare = prepare;
  assert.equal(Object.keys(query(undefined, { range: 'all' }, states).metrics).length, 1200);
});
