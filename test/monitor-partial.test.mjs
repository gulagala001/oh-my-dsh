import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MonitorLedger, monitorQuery, monitorUsage, reportedMonitorUsage, addMonitorMetric, emptyMonitorMetric } from '../src/monitor-ledger.mjs';
import * as format from '../src/client/monitor-format.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-monitor-partial-')), now = Date.now();
  const ledger = new MonitorLedger(dir, { now: () => now });
  t.after(() => { ledger.close(); rmSync(dir, { recursive: true, force: true }); });
  const append = (id, usage, extra = {}) => ledger.append({ id, sessionId: 'synthetic', kind: 'main', at: now - 1,
    provider: 'fixture', model: 'partial', source: 'native', hasOutput: true, usage, ...extra });
  const query = (params = {}, states = []) => ledger.query(states, new Set(['synthetic']), monitorQuery(params, now));
  return { ledger, append, query, now };
}

const partial = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900 };
const complete = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0 };

test('an omitted optional cache write keeps the receipt and yields a labelled lower bound, never an exact total', t => {
  const f = fixture(t);
  assert.deepEqual(reportedMonitorUsage(partial, true), partial);
  assert.equal(monitorUsage(partial).totalTokens, null);
  f.append('partial', partial);
  const data = f.query(), metric = data.totals;
  assert.equal(metric.totalTokens, null);
  assert.equal(metric.inputTotalTokens, null);
  assert.equal(metric.cacheWriteTokens, null);
  assert.equal(metric.knownInputTokens, 1000);
  assert.equal(metric.knownTotalTokens, 1020);
  assert.equal(metric.unmetered, 1);
  assert.equal(metric.usageUnreported, 0, 'incomplete consumption is not an absent receipt');
  assert.equal(metric.cacheWriteUnreported, 1);
  assert.equal(format.input(metric), 1000);
  assert.equal(format.tokens(metric), 1020);
  assert.equal(format.tokenPartial(metric), true);
  assert.equal(format.tokenAmount(metric), '≥1k');
  assert.equal(format.cacheRatio(metric), '—', 'the missing denominator is not fabricated');
  assert.match(format.usageNote(metric), /缓存写入/);
  assert.doesNotMatch(data.coverage.message, /1 次调用未返回用量/);
});

test('cache hit rate pairs complete receipts and survives absent, partial and historical usage', t => {
  const f = fixture(t);
  f.append('complete', complete);
  f.append('partial', partial);
  f.append('absent', null, { status: 'error' });
  // The total establishes exact input even though cache writes are omitted.
  f.append('total', { ...partial, totalTokens: 1020 }, { kind: 'prepare' });
  f.append('missing-cache', { inputTokens: 100, outputTokens: 20, totalTokens: 120 });
  // Both impossible sums and reads larger than total must be excluded.
  f.append('contradiction', { inputTokens: 50, cacheReadTokens: 90, cacheWriteTokens: 0, outputTokens: 20, totalTokens: 120 });
  f.append('too-large', { inputTokens: 0, cacheReadTokens: 101, outputTokens: 20, totalTokens: 120 });
  f.append('zero', { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, totalTokens: 0 }, { hasOutput: false });
  const data = f.query(), m = data.totals;
  assert.equal(m.cacheMeasuredCalls, 2);
  assert.equal(m.cacheMeasuredInputTokens, 1030);
  assert.equal(m.cacheMeasuredReadTokens, 920);
  assert.equal(format.cacheRatio(m), '89.3%');
  assert.match(format.cacheTitle(m), /2 \/ 8 次调用/);
  assert.equal(format.cacheRatio(data.metrics.main), '66.7%');
  assert.equal(format.cacheRatio(data.metrics.prepare), '90.0%');
  assert.equal(format.cacheRatio(data.groups.models[0]), '89.3%');
  assert.equal(format.cacheRatio(data.series[0]), '89.3%');
  const merged = Object.values(data.metrics).reduce((a, b) => addMonitorMetric(a, b), emptyMonitorMetric());
  assert.equal(format.cacheRatio(merged), '89.3%');
  const states = [{ id: 'synthetic', metrics: { main: { calls: 20, inputTokens: 5000, cacheReadTokens: 8000, outputTokens: 1000 } } }];
  const historical = f.query({}, states).totals;
  assert.ok(historical.calls > m.calls);
  assert.equal(historical.cacheMeasuredCalls, 2);
  assert.equal(format.cacheRatio(historical), '89.3%');
  assert.equal(format.cacheRatio(f.query({ kind: 'prepare' }).totals), '90.0%');
  assert.equal(format.cacheRatio(f.query({ status: 'error' }).totals), '—');
});

test('cache formatter keeps genuine zero hits, rejects unknown or contradictory denominators', () => {
  for (const metric of [complete, { ...partial, totalTokens: 1020 }, { inputTotalTokens: 1000, cacheReadTokens: 900 }]) {
    assert.notEqual(format.cacheRatio(metric), '—');
    assert.equal(format.cacheReason(metric), '');
  }
  assert.equal(format.cacheRatio({ inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }), '0.0%');
  for (const metric of [partial, {}, { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    { inputTokens: 10, cacheReadTokens: 90, cacheWriteTokens: 0, outputTokens: 20, totalTokens: 21 },
    { inputTokens: 50, cacheReadTokens: 90, outputTokens: 20, totalTokens: 120 }]) {
    assert.equal(format.cacheRatio(metric), '—');
    assert.ok(format.cacheReason(metric));
  }
});

test('conditional metrics preserve empty, unknown and measured-zero readings across read families', t => {
  const { ledger, append, now } = fixture(t);
  const ids = new Set(['synthetic']), params = monitorQuery({ range: 'all' }, now);
  const read = options => ledger.query([], ids, params, undefined, options);
  assert.deepEqual({ ...read().totals }, emptyMonitorMetric());
  append('unknown', null, { status: 'error' });
  append('zero', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    reasoningTokens: 0, totalTokens: 0 }, { hasOutput: false, status: 'cancelled', durationMs: 0 });
  append('partial', { inputTokens: 0.25, outputTokens: 1.25, cacheReadTokens: 0.5 });
  append('measured', { inputTokens: 0.25, outputTokens: 0.5, cacheReadTokens: 0.5, cacheWriteTokens: 0.25 });
  append('missing-cache', { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  append('contradiction', { inputTokens: 5, outputTokens: 2, cacheReadTokens: 10, cacheWriteTokens: 0, totalTokens: 7 });
  const expected = { calls: 6, errors: 1, cancelled: 1, unmetered: 2, usageUnreported: 1,
    totalUnreported: 2, outputUnreported: 1, inputBucketUnreported: 1, cacheUnreported: 2,
    cacheWriteUnreported: 3, durationUnreported: 5, inputUnreported: 2,
    cacheMeasuredCalls: 1, cacheMeasuredInputTokens: 1, cacheMeasuredReadTokens: 0.5,
    durationMs: 0, knownTotalTokens: 15.5 };
  const full = read(), usage = read({ usageOnly: true }), calls = read({ callsOnly: true });
  const rows = [full.totals, full.metrics.main, ...Object.values(full.groups).flat(), ...full.series,
    usage.metrics.main, calls.totals];
  for (const row of rows) for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, key);
  const missing = ledger.query([], ids, { ...params, status: 'error' }).totals;
  assert.equal(missing.cacheMeasuredCalls, 0);
  assert.equal(missing.cacheMeasuredInputTokens, null);
  assert.equal(missing.cacheMeasuredReadTokens, null);
  assert.equal(missing.durationMs, null);
});
