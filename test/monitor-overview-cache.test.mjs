import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MonitorLedger, monitorQuery } from '../src/monitor-ledger.mjs';
import { monitorCallCost } from '../src/monitor-call.mjs';
import { monitorCostCacheKey } from '../src/monitor-pricing.mjs';

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

test('receipt costs reuse exact sums with live custom rates and caller-owned outputs', t => {
  const { ledger, append, read, now } = fixture(t);
  append('one'); append('partial', now - 2, { usage: { outputTokens: 2 } });
  append('unknown', now - 3, { model: 'unpriced' });
  const custom = [{ provider: 'fixture', model: 'fixture', currency: 'CNY', inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 }];
  let prices = 0;
  const cost = call => { prices++; return monitorCallCost(call, custom); };
  const cached = (at = now, params = {}) => read(at, params, cost, { costCacheKey: monitorCostCacheKey(custom) });
  const cold = cached(); assert.equal(prices, 3); assert.ok(ledger.costCache);
  const expected = read(now, {}, cost); assert.deepEqual(cold, expected); assert.equal(prices, 6);
  cached(); const cache = ledger.costCache; assert.equal(prices, 9);
  const warm = cached(now + 3000); assert.equal(prices, 9); assert.equal(ledger.costCache, cache);
  cold.costSummary.totals[0].amount = -1; cold.costSummary.unpricedCalls = -1;
  cold.seriesSplit[0].costs.CNY = -1;
  warm.costSummary.totals[0].amount = -1; warm.seriesSplit[0].costs.CNY = -1;
  assert.deepEqual(cached(now + 3000), read(now + 3000, {}, cost));
  custom[0].inputTokens = 7;
  assert.equal(cached().costSummary.totals[0].amount, 10 * 7 / 1e6 + 5 * 3 / 1e6);
  custom[0].currency = 'USD'; assert.equal(cached().costSummary.totals[0].currency, 'USD');
  custom[0].outputTokens = undefined; assert.equal(cached().costSummary.unpricedCalls, 3);
  custom.length = 0; assert.equal(cached().costSummary.unpricedCalls, 3);
  ledger.close(); assert.equal(ledger.costCache, null);
});

test('receipt cost snapshots follow writers, filters, future receipts and pagination', t => {
  const { ledger, writer, append, read, now } = fixture(t);
  const custom = [{ provider: 'fixture', model: 'fixture', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }];
  const cost = call => monitorCallCost(call, custom);
  const cached = (at = now, params = {}) => read(at, params, cost, { costCacheKey: monitorCostCacheKey(custom) });
  const calls = result => result.costSummary.totals.reduce((n, row) => n + row.calls, 0);
  append('one'); assert.equal(calls(cached()), 1); const initial = ledger.costCache;
  append('two', now - 86400000); assert.equal(calls(cached()), 2); assert.notEqual(ledger.costCache, initial);
  writer.prepare('UPDATE calls SET inputTokens=20,totalTokens=25 WHERE id=?').run('one');
  assert.equal(cached().costSummary.totals[0].amount, 0.00004);
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
  pending = () => writer.prepare('UPDATE calls SET inputTokens=30,totalTokens=35 WHERE id=?').run('one');
  assert.equal(cached().costSummary.totals[0].amount, 0.00004);
  assert.equal(cached().costSummary.totals[0].amount, 30 / 1e6 + 5 / 1e6 + (10 / 1e6 + 5 / 1e6));
  ledger.db.prepare = prepare;
  append('future', now + 6000);
  assert.equal(calls(cached(now + 3000)), 2); assert.equal(calls(cached(now + 6000)), 3);
  const page = cached(now + 9000, { limit: 1 }), cache = ledger.costCache;
  const next = cached(now + 10000, { limit: 1, cursor: page.nextCursor });
  assert.equal(ledger.costCache, cache); assert.deepEqual(next.costSummary, page.costSummary);
  for (const params of [{ kind: 'prepare' }, { provider: 'other' }, { model: 'other' }, { status: 'error' }, { query: 'missing' }]) {
    assert.equal(calls(cached(now + 9000, params)), 0);
  }
  assert.equal(calls(cached(now + 9000, { period: 'today' })), 2);
  assert.equal(calls(cached(now + 86400000, { period: 'today' })), 0);
  const other = ledger.query([], new Set(['other']), monitorQuery({}, now + 9000), cost, { costCacheKey: monitorCostCacheKey(custom) });
  assert.equal(calls(other), 0);
});

test('receipt costs keep arbitrary callbacks live, recover after failure and bound retained rates', t => {
  const { ledger, append, read, now } = fixture(t); append('one');
  let amount = 1, prices = 0;
  const cost = () => { prices++; return { currency: 'USD', amount }; };
  assert.equal(read(now, {}, cost).costSummary.totals[0].amount, 1);
  amount = 2; assert.equal(read(now, {}, cost).costSummary.totals[0].amount, 2); assert.equal(prices, 2);
  const key = monitorCostCacheKey();
  assert.throws(() => read(now, {}, () => { throw Error('isolated cost failure'); }, { costCacheKey: key }), /isolated cost failure/);
  assert.equal(ledger.costCache, null);
  assert.equal(read(now, {}, cost, { costCacheKey: key }).costSummary.totals[0].amount, 2);
  const large = monitorCostCacheKey(Array.from({ length: 4000 }, (_, i) => ({ provider: 'p'.repeat(200), model: String(i), inputTokens: 1 })));
  read(now, {}, cost, { costCacheKey: large }); assert.equal(ledger.costCache, null);
  read(now, {}, cost, { costCacheKey: key }); assert.ok(ledger.costCache);
});

test('receipt cost scans stream positional rows with independent complete callback values', t => {
  const { ledger, append, read, now } = fixture(t);
  const usage = { inputTokens: 1.25, outputTokens: 2.5, cacheReadTokens: 0, cacheWriteTokens: 3.75,
    reasoningTokens: 0.5, totalTokens: 7.5 };
  append('complete', now - 1, { provider: 'provider-中文', model: 'model-🙂', usage });
  append('missing', now - 2, { provider: null, model: null, usage: null });
  append('partial', now - 3, { usage: { outputTokens: 0, totalTokens: 2 ** 53 } });
  const prepare = ledger.db.prepare.bind(ledger.db);
  let arrayScans = 0, callbacks = [], allowArrays = true;
  ledger.db.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.includes(' label,provider,model,')) return statement;
    return new Proxy(statement, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'all') return () => assert.fail('cost scan must stay streaming');
      if (key === 'setReturnArrays') return allowArrays ? enabled => { assert.equal(enabled, true); arrayScans++; return value.call(target, enabled); } : undefined;
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  };
  const result = read(now, {}, call => { callbacks.push(call); return { currency: 'USD', amount: callbacks.length / 10 }; });
  assert.equal(arrayScans, 1);
  assert.deepEqual(callbacks, [
    { provider: 'provider-中文', model: 'model-🙂', usage },
    { provider: null, model: null, usage: {} },
    { provider: 'fixture', model: 'fixture', usage: { outputTokens: 0, totalTokens: 2 ** 53 } },
  ]);
  assert.equal(new Set(callbacks).size, 3); assert.equal(new Set(callbacks.map(call => call.usage)).size, 3);
  assert.equal(result.costSummary.totals[0].amount, 0.1 + 0.2 + 0.3);
  callbacks[2].usage.outputTokens = -1;
  callbacks = [];
  read(now, {}, call => { callbacks.push(call); return null; });
  assert.equal(callbacks[2].usage.outputTokens, 0);
  assert.equal(arrayScans, 2);
  allowArrays = false; callbacks = [];
  const fallback = read(now, {}, call => { callbacks.push(call); return { currency: 'USD', amount: callbacks.length / 10 }; });
  assert.deepEqual(fallback, result); assert.equal(arrayScans, 2);
  assert.deepEqual(callbacks[0], { provider: 'provider-中文', model: 'model-🙂', usage });
});

test('receipt costs rebuild empty calendar buckets and keep legacy counters live', t => {
  const { ledger, append, read, now } = fixture(t), beforeTZ = process.env.TZ;
  process.env.TZ = 'UTC'; t.after(() => { if (beforeTZ === undefined) delete process.env.TZ; else process.env.TZ = beforeTZ; });
  append('one'); const options = { costCacheKey: monitorCostCacheKey() };
  const cost = () => ({ currency: 'USD', amount: 1 });
  const first = read(now, {}, cost, options), cache = ledger.costCache;
  const later = read(now + 2 * 86400000, {}, cost, options);
  assert.equal(ledger.costCache, cache); assert.equal(later.seriesSplit.length, first.seriesSplit.length + 2);
  assert.deepEqual(later.seriesSplit.at(-1).costs, {}); assert.equal(later.seriesSplit.at(-1).unpricedCalls, 0);
  const month = read(now + 91 * 86400000, {}, cost, options);
  assert.equal(month.seriesSplit[0].label, '2026-10'); assert.equal(month.seriesSplit[0].costs.USD, 1);
  read(now, {}, cost, options); const zoneCache = ledger.costCache;
  process.env.TZ = 'Pacific/Kiritimati';
  const zoned = read(now, {}, cost, options); assert.notEqual(ledger.costCache, zoneCache);
  assert.equal(zoned.seriesSplit[0].label, '2026-10-23'); assert.equal(zoned.seriesSplit[0].costs.USD, 1);
  const state = { id: 'fixture', activity: [], metrics: { main: { calls: 5 } } };
  const legacy = () => ledger.query([state], new Set(['fixture']), monitorQuery({}, now), cost, options);
  assert.equal(legacy().costSummary.unpricedCalls, 4); const legacyCache = ledger.costCache;
  state.metrics.main.calls = 7;
  assert.equal(legacy().costSummary.unpricedCalls, 6); assert.equal(ledger.costCache, legacyCache);
});
