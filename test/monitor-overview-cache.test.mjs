import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MonitorLedger, monitorQuery } from '../src/monitor-ledger.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-overview-cache-')), now = Date.UTC(2026, 9, 22, 12);
  let clock = now;
  const ledger = new MonitorLedger(directory, { now: () => clock });
  const writer = new DatabaseSync(join(directory, 'monitor-v1/usage.sqlite'));
  t.after(() => { writer.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  const append = (id, at = now - 1, extra = {}) => assert.equal(ledger.append({ id, at, sessionId: 'fixture', kind: 'main',
    provider: 'fixture', model: 'fixture', source: 'native', startedAt: at - 100, durationMs: 100, firstTokenMs: 20,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, ...extra }), true);
  const read = (at = now, params = {}, costOf, options) => {
    clock = at;
    return ledger.query([], new Set(['fixture']), monitorQuery({ session: 'fixture', ...params }, at), costOf, options);
  };
  return { directory, now, ledger, writer, append, read };
}

test('overview reuse preserves values, caller ownership and live per-call prices', t => {
  const { ledger, append, read, now } = fixture(t);
  append('one'); append('two', now - 2, { kind: 'prepare', firstTokenMs: 0, usage: { outputTokens: 2 } });
  let reads = 0, prices = 0, amount = 1;
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => { if (sql.includes('AVG(t.firstTokenMs)')) reads++; return prepare(sql); };
  const price = () => { prices++; return { currency: 'CNY', amount }; };
  const cold = read(now, {}, price);
  assert.equal(reads, 1); assert.equal(cold.performance.avgFirstTokenMs, 10);
  assert.equal(cold.performance.firstTokenCalls, 2); assert.equal(cold.performance.decodeTokens, 7);
  assert.equal(cold.performance.decodeMs, 180); assert.equal(cold.series[0].calls, 2);
  assert.equal(cold.series[0].knownTotalTokens, 17);
  assert.equal(Object.getPrototypeOf(cold.performance), null);
  cold.performance.avgFirstTokenMs = -1; cold.performance.sessionSpans[0].calls = -1;
  cold.performance.sessionSpans.push({ sessionId: 'poison' }); cold.series[0].calls = -1;
  cold.seriesSplit[0].models.poison = -1; cold.seriesSplit[0].costs.CNY = -1;
  amount = 3;
  const warm = read(now + 3000, {}, price);
  assert.equal(reads, 1); assert.equal(prices, 4);
  assert.equal(warm.performance.avgFirstTokenMs, 10); assert.equal(warm.performance.sessionSpans.length, 1);
  assert.equal(warm.performance.sessionSpans[0].calls, 2); assert.equal(warm.series[0].calls, 2);
  assert.equal(warm.seriesSplit[0].models.poison, undefined); assert.equal(warm.costSummary.totals[0].amount, 6);
  assert.equal(warm.seriesSplit[0].costs.CNY, 6);
  ledger.overviewCache = null;
  const fresh = read(now + 3000, {}, price); assert.deepEqual(warm, fresh);
  const cache = ledger.overviewCache; assert.ok(cache);
  read(now + 3000, {}, undefined, { usageOnly: true });
  read(now + 3000, {}, undefined, { callsOnly: true });
  assert.equal(ledger.overviewCache, cache);
  ledger.close(); assert.equal(ledger.overviewCache, null);
});

test('overview follows local and external receipts, timings, filters and snapshot boundaries', t => {
  const { ledger, writer, append, read, now } = fixture(t);
  append('one'); read(); const initial = ledger.overviewCache;
  append('old', now - 86400000, { firstTokenMs: 40 });
  assert.equal(read().performance.firstTokenCalls, 2); assert.notEqual(ledger.overviewCache, initial);
  writer.prepare('UPDATE call_timings SET firstTokenMs=60 WHERE id=?').run('one');
  assert.equal(read().performance.avgFirstTokenMs, 50);
  writer.prepare('UPDATE calls SET outputTokens=20,totalTokens=30 WHERE id=?').run('one');
  assert.equal(read().series[1].outputTokens, 20);
  const prepare = ledger.db.prepare.bind(ledger.db); let pending;
  ledger.db.prepare = sql => {
    const stmt = prepare(sql);
    if (!sql.includes('pragma_data_version')) return stmt;
    return new Proxy(stmt, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'get') return typeof value === 'function' ? value.bind(target) : value;
      return (...args) => { const result = value.apply(target, args), write = pending; pending = undefined; write?.(); return result; };
    } });
  };
  pending = () => writer.prepare('UPDATE call_timings SET firstTokenMs=80 WHERE id=?').run('one');
  assert.equal(read().performance.avgFirstTokenMs, 50);
  assert.equal(read().performance.avgFirstTokenMs, 60);
  ledger.db.prepare = prepare;
  append('future', now + 6000, { firstTokenMs: 0 });
  assert.equal(read().performance.firstTokenCalls, 2);
  assert.equal(read(now + 3000).performance.firstTokenCalls, 2);
  assert.equal(read(now + 6000).performance.firstTokenCalls, 3);
  assert.equal(read(now + 9000).performance.firstTokenCalls, 3);
  const page = read(now + 9000, { limit: 1 }), pageCache = ledger.overviewCache;
  const next = read(now + 10000, { limit: 1, cursor: page.nextCursor });
  assert.equal(ledger.overviewCache, pageCache);
  assert.deepEqual(next.series, page.series); assert.deepEqual(next.performance, page.performance);
  assert.notEqual(next.activity[0].id, page.activity[0].id);
  assert.equal(next.selection.to, page.selection.to);
  for (const params of [{ kind: 'prepare' }, { provider: 'other' }, { model: 'other' }, { status: 'error' }, { query: 'missing' }]) {
    const result = read(now + 9000, params); assert.equal(result.series.length, 0);
    assert.equal(result.performance.firstTokenCalls, 0);
  }
  assert.equal(read(now + 9000).performance.firstTokenCalls, 3);
  const today = read(now + 9000, { period: 'today' }); assert.equal(today.performance.firstTokenCalls, 2);
  assert.equal(read(now + 86400000, { period: 'today' }).performance.firstTokenCalls, 0);
  const otherSession = ledger.query([], new Set(['other']), monitorQuery({}, now + 9000));
  assert.equal(otherSession.performance.firstTokenCalls, 0);
});

test('overview rebuilds calendar buckets and never retains oversized or failed results', t => {
  const { ledger, append, read, now } = fixture(t), beforeTZ = process.env.TZ;
  process.env.TZ = 'UTC'; t.after(() => { if (beforeTZ === undefined) delete process.env.TZ; else process.env.TZ = beforeTZ; });
  append('one'); const first = read(), cache = ledger.overviewCache;
  const later = read(now + 2 * 86400000); assert.equal(ledger.overviewCache, cache);
  assert.equal(later.seriesSplit.length, first.seriesSplit.length + 2);
  const month = read(now + 91 * 86400000); assert.equal(month.series[0].label, '2026-10');
  read(); const zoneCache = ledger.overviewCache;
  process.env.TZ = 'America/Los_Angeles'; read(); assert.notEqual(ledger.overviewCache, zoneCache);
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.overviewCache = null;
  ledger.db.prepare = sql => { if (sql.includes('GROUP BY label,NULLIF')) throw Error('isolated trend failure'); return prepare(sql); };
  assert.throws(() => read(), /isolated trend failure/); assert.equal(ledger.overviewCache, null);
  ledger.db.prepare = prepare; assert.equal(read().performance.firstTokenCalls, 1);
  ledger.db.exec('BEGIN');
  for (let i = 0; i < 3000; i++) append('large-' + i, now - 1, { sessionId: String(i).padEnd(200, 'x') });
  ledger.db.exec('COMMIT');
  const large = ledger.query([], new Set(), monitorQuery({ range: 'all' }, now));
  assert.equal(large.performance.sessionSpans.length, 3001); assert.equal(ledger.overviewCache, null);
});
