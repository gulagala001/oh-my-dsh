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
  return { directory, ledger, writer, append, query, now };
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
  ledger.db.prepare = sql => { if (sql.includes('GROUP BY sessionId,kind') && sql.includes('durationMs')) scans++; return prepare(sql); };
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 3); assert.equal(scans, 0);
  state.metrics.main.calls = 5; state.metrics.main.inputTokens = 200;
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 5); assert.equal(scans, 0);
  assert.equal(query().metrics.main.calls, 1);
  writer.prepare('UPDATE calls SET source=? WHERE id=?').run('dream', 'one');
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 6); assert.equal(scans, 1);
  assert.equal(state.metrics.main.calls, 5);
  ledger.close(); assert.equal(ledger.legacyCache, null); assert.equal(ledger.legacyCountCache, null);
});

test('row caches discard oversized results and failures, then allow recovery', t => {
  const { ledger, query } = fixture(t);
  ledger.db.exec('BEGIN');
  for (let i = 0; i < 1200; i++) ledger.append({ id: 'c' + i, at: 100, sessionId: 's' + i, kind: 'kind' + i,
    usage: { inputTokens: 1, outputTokens: 1 } });
  ledger.db.exec('COMMIT');
  const states = Array.from({ length: 1200 }, (_, i) => ({ id: 's' + i, metrics: { ['kind' + i]: { calls: 2 } } }));
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

test('covered legacy counters skip full aggregation and newly missing groups are reconciled', t => {
  const { ledger, writer, append, query } = fixture(t);
  append('one');
  const state = { id: 'fixture', metrics: { main: { calls: 1, inputTokens: 100, outputTokens: 40 } } };
  const prepare = ledger.db.prepare.bind(ledger.db);
  let sums = 0;
  ledger.db.prepare = sql => {
    if (sql.includes('GROUP BY sessionId,kind') && sql.includes('durationMs')) sums++;
    return prepare(sql);
  };
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 1);
  assert.equal(sums, 0);
  // Same database, but live counters may move in either direction.
  state.metrics.main.calls = 3;
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 3);
  assert.equal(sums, 1);
  state.metrics.main.calls = 1;
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 1);
  assert.equal(sums, 1);
  writer.prepare('DELETE FROM calls WHERE id=?').run('one');
  const missing = query(undefined, {}, [state]).metrics.main;
  assert.equal(missing.calls, 1); assert.equal(missing.inputTokens, 100);
  assert.equal(sums, 2);
  append('one');
  assert.equal(query(undefined, {}, [state]).metrics.main.calls, 1);
  assert.equal(sums, 2);
});

test('legacy candidates use exact session and kind pairs within one database snapshot', t => {
  const { ledger, writer, now } = fixture(t);
  const states = [{ id: 'fixture', metrics: { main: { calls: 2, inputTokens: 40 }, prepare: { calls: 1, inputTokens: 20 } } },
    { id: 'other', metrics: { main: { calls: 1, inputTokens: 10 }, prepare: { calls: 3, inputTokens: 60 } } }];
  for (const [sessionId, kind] of [['fixture', 'main'], ['fixture', 'prepare'], ['other', 'main'], ['other', 'prepare']]) {
    ledger.append({ id: sessionId + kind, sessionId, kind, source: 'native', at: now - 1,
      usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  }
  const read = () => ledger.query(states, new Set(['fixture', 'other']), monitorQuery({ range: 'all' }, now), undefined, { usageOnly: true });
  const prepare = ledger.db.prepare.bind(ledger.db);
  let changed = false;
  ledger.db.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.startsWith('SELECT sessionId,kind,COUNT(*)')) return statement;
    return new Proxy(statement, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'all') return typeof value === 'function' ? value.bind(target) : value;
      return (...args) => {
        const result = value.apply(target, args);
        if (!changed) { changed = true; writer.prepare('DELETE FROM calls WHERE id=?').run('fixtureprepare'); }
        return result;
      };
    } });
  };
  const first = read();
  assert.equal(first.metrics.main.calls, 3); assert.equal(first.metrics.prepare.calls, 4);
  assert.equal(first.metrics.main.inputTokens, 50); assert.equal(first.metrics.prepare.inputTokens, 70);
  const next = read();
  assert.equal(next.metrics.prepare.calls, 4); assert.equal(next.metrics.prepare.inputTokens, 80);
  assert.deepEqual(ledger.legacyCache.value.map(row => [row.sessionId, row.kind]).sort(), [['fixture', 'main'], ['other', 'prepare']]);
});

test('filter index upgrades existing ledgers and preserves ordered live options for every scope', t => {
  const { directory, ledger, writer, now } = fixture(t);
  ledger.db.exec('DROP INDEX monitor_filter_options');
  const values = [
    ['one', 'z', 'm', 'main', 'fixture'], ['two', 'a', 'z', 'prepare', 'fixture'],
    ['three', null, null, 'main', 'other'], ['four', '', '', 'main', 'fixture'],
    ['five', 'a', 'z', 'main', 'fixture'], ['six', 'a', 'z', 'main', 'fixture'],
    ['seven', 'A', 'm', 'main', 'other'], ['eight', '提供方', '模型', 'dream', 'other'],
  ];
  for (const [id, provider, model, kind, sessionId] of values) {
    assert.equal(ledger.append({ id, at: now - 1, provider, model, kind, sessionId, source: 'native' }), true);
  }
  const before = ledger.db.prepare('SELECT * FROM calls ORDER BY id').all();
  const upgraded = new MonitorLedger(directory, { now: () => now });
  try { assert.equal(upgraded.error, null); } finally { upgraded.close(); }
  assert.deepEqual(ledger.db.prepare('SELECT * FROM calls ORDER BY id').all(), before);
  const read = (ids, params = {}) => ledger.query([], new Set(ids), monitorQuery({ ...params }, now), undefined, { callsOnly: true });
  const expected = ids => {
    const rows = writer.prepare(`SELECT DISTINCT provider,model,kind FROM calls WHERE ${ids ? 'sessionId IN (SELECT value FROM json_each(?))' : '1=1'} ORDER BY provider,model,kind`).all(...(ids ? [JSON.stringify(ids)] : []));
    return { providers: [...new Set(rows.map(r => r.provider).filter(Boolean))],
      models: [...new Map(rows.filter(r => r.model).map(r => [JSON.stringify([r.provider, r.model]), { provider: r.provider, model: r.model }])).values()],
      kinds: [...new Set(rows.map(r => r.kind))] };
  };
  for (const ids of [[], ['fixture'], ['other'], ['fixture', 'other']]) assert.deepEqual(read(ids).filters, expected(ids));
  const all = read([], { range: 'all' }); assert.deepEqual(all.filters, expected());
  // Available options span the scope, including routes outside the active page/time/filter.
  assert.deepEqual(read([], { range: 'all', provider: 'missing', period: 'today', status: 'error', limit: 1 }).filters, all.filters);
  writer.prepare('UPDATE calls SET provider=?,model=?,kind=? WHERE id=?').run('new', 'new', 'changed', 'one');
  assert.deepEqual(read(['fixture']).filters, expected(['fixture']));
  writer.prepare('DELETE FROM calls WHERE id=?').run('two');
  assert.deepEqual(read([], { range: 'all' }).filters, expected());
  assert.equal(ledger.append({ id: 'late', at: now + 5000, provider: 'future', model: 'future', kind: 'main', sessionId: 'fixture' }), true);
  assert.deepEqual(read(['fixture']).filters, expected(['fixture']));
});

test('filter index keeps receipt order and exact costs under provider and model filters', t => {
  const { ledger, now } = fixture(t);
  for (let i = 1; i <= 3; i++) assert.equal(ledger.append({ id: 'r' + i, at: now - 4 + i,
    sessionId: 'fixture', kind: 'main', provider: 'p', model: 'm', usage: { outputTokens: i } }), true);
  for (const filter of [{ provider: 'p' }, { provider: 'p', model: 'm' }, { model: 'm' }]) {
    const visited = [];
    const result = ledger.query([], new Set(), monitorQuery({ range: 'all', ...filter }, now), call => {
      visited.push(call.usage.outputTokens);
      return { currency: 'CNY', amount: call.usage.outputTokens / 10 };
    });
    assert.deepEqual(visited, [3, 2, 1]);
    assert.equal(result.costSummary.totals[0].amount, [3, 2, 1].reduce((n, v) => n + v / 10, 0));
  }
});
