import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MonitorLedger, monitorQuery, monitorUsage, monitorInput, reportedMonitorUsage } from '../src/monitor-ledger.mjs';
import { monitorSelection } from '../src/monitoring.mjs';
import { monitorSnapshot } from '../src/monitor-api.mjs';
import { Hub } from '../src/hub.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-monitor-'));
  let now = new Date(2026, 9, 10, 12).getTime();
  const ledger = new MonitorLedger(dir, { now: () => now });
  t.after(() => { ledger.close(); rmSync(dir, { recursive: true, force: true }); });
  const call = (id, extra = {}) => ({ id, sessionId: 'parent', kind: 'main', at: now - 1000,
    provider: 'alpha', model: 'model-a', source: 'native', status: 'success',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0 }, ...extra });
  return { dir, ledger, call, advance: ms => { now += ms; }, now: () => now,
    query: (params = {}, states = []) => ledger.query(states, new Set(['parent', 'child']), monitorQuery(params, now)) };
}

test('persisted metadata deduplicates event identity while retaining retries with the same step', t => {
  const f = fixture(t), first = f.call('native:parent:4', { eventSeq: 4, turn: 1, step: 1, prompt: 'private-body', credentials: 'private-secret' });
  f.ledger.append(first); f.ledger.append(first);
  f.ledger.append(f.call('native:parent:5', { eventSeq: 5, turn: 1, step: 1 }));
  const reopened = new MonitorLedger(f.dir); t.after(() => reopened.close());
  const result = reopened.query([], new Set(['parent']), monitorQuery({}, f.now()));
  assert.equal(result.totals.calls, 2); assert.equal(result.totals.totalTokens, 70);
  assert.deepEqual(result.activity.map(row => row.eventSeq), [5, 4]);
  assert.equal(JSON.stringify(result).includes('private-'), false);
  for (const file of ['usage.sqlite', 'usage.sqlite-wal']) assert.equal(readFileSync(join(f.dir, 'monitor-v1', file)).includes('private-'), false);
});

test('native total is authoritative, reasoning is not added, and missing usage stays unknown', t => {
  const f = fixture(t);
  const usage = { inputTokens: 10, outputTokens: 5, reasoningTokens: 4, totalTokens: 99 };
  assert.equal(monitorUsage(usage).totalTokens, 99);
  assert.equal(monitorUsage(usage).cacheReadTokens, null);
  assert.equal(monitorUsage({ inputTokens: 10, outputTokens: 5 }).totalTokens, null);
  assert.equal(monitorInput({ inputTokens: 10, outputTokens: 5 }), null);
  assert.equal(monitorInput(usage), 94);
  f.ledger.append(f.call('reported', { usage }));
  let result = f.query();
  assert.equal(result.totals.totalTokens, 99); assert.equal(result.totals.cacheReadTokens, null);
  assert.equal(result.totals.inputTotalTokens, 94); assert.equal(result.totals.peakContext, 94);
  assert.equal(result.totals.cacheUnreported, 1);
  f.ledger.append(f.call('unknown', { usage: null, model: 'unknown', status: 'cancelled' }));
  result = f.query({ model: 'unknown' });
  assert.equal(result.totals.totalTokens, null); assert.equal(result.totals.reasoningTokens, null);
  assert.equal(result.totals.cancelled, 1); assert.equal(result.totals.errors, 0);
  assert.equal(result.activity[0].usage, null); assert.equal(result.totals.unmetered, 1);
  const zeros = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  assert.equal(reportedMonitorUsage(zeros, true), null, 'a host zero initializer accompanying real output is not a usage receipt');
  assert.deepEqual(reportedMonitorUsage(zeros, false), zeros, 'an actual empty reading remains zero');
  assert.equal(reportedMonitorUsage({ inputTokens: 3, outputTokens: 0, totalTokens: 3 }, true).outputTokens, 0);
});

test('one filter applies to all aggregates, while cursor pages freeze concurrent inserts', t => {
  const f = fixture(t);
  for (let i = 0; i < 6; i++) f.ledger.append(f.call(`a${i}`, { at: f.now() - 600 + i, status: i === 0 ? 'error' : 'success' }));
  f.ledger.append(f.call('excluded', { provider: 'beta', usage: { totalTokens: 10000 } }));
  const params = { provider: 'alpha', limit: 2 }, first = f.query(params);
  assert.equal(first.totals.calls, 6); assert.equal(first.activity.length, 2); assert.equal(first.totals.totalTokens, 210);
  for (const rows of [first.series, ...Object.values(first.groups)]) assert.equal(rows.reduce((n, row) => n + row.calls, 0), 6);
  f.advance(2000); f.ledger.append(f.call('late', { at: f.now() }));
  const second = f.query({ ...params, cursor: first.nextCursor }), third = f.query({ ...params, cursor: second.nextCursor });
  assert.equal(second.totals.calls, 6); assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.activity, ...second.activity, ...third.activity].map(row => row.id)).size, 6);
  assert.throws(() => f.query({ ...params, provider: 'beta', cursor: first.nextCursor }), /筛选已变化/);
  assert.equal(f.query({ status: 'error' }).activityTotal, 1);
  assert.equal(f.query({ query: 'model-a', provider: 'beta' }).totals.totalTokens, 10000);
  const all = f.query({ range: 'all', limit: 2 });
  assert.doesNotThrow(() => f.ledger.query([], new Set(['new-session']), monitorQuery({ range: 'all', limit: 2, cursor: all.nextCursor }, f.now())), 'new sessions cannot invalidate an all-scope cursor');
  const family = f.query({ session: 'parent', limit: 2 });
  assert.doesNotThrow(() => f.ledger.query([], new Set(['parent', 'child', 'new-child']), monitorQuery({ session: 'parent', limit: 2, cursor: family.nextCursor }, f.now())), 'a newly active subagent cannot invalidate the parent cursor');
});

test('legacy cumulative remainder is preserved without inventing dated or model records', t => {
  const f = fixture(t), entry = f.call('retained');
  const states = [{ id: 'parent', metrics: { main: { calls: 10, inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, cacheWriteTokens: 0 } }, activity: [entry] }];
  const result = f.query({}, states);
  assert.equal(result.totals.calls, 10); assert.equal(result.totals.totalTokens, 350);
  assert.equal(result.activityTotal, 1); assert.equal(result.coverage.legacyCalls, 9);
  assert.equal(result.series[0].calls, 1); assert.equal(result.groups.models.at(-1).label, '历史累计（未归因）');
  assert.equal(f.query({}, states).totals.calls, 10, 'repeated reads do not import the ring again');
  assert.equal(f.query({ period: 'today' }, states).totals.calls, 1);
  assert.equal(f.query({ model: 'model-a' }, states).totals.calls, 1);
  f.ledger.append(f.call('cancelled', { status: 'cancelled', error: '已取消' }));
  states[0].metrics.main.calls++; states[0].metrics.main.errors = 1;
  assert.equal(f.query({}, states).totals.errors, 0, 'a known cancellation is not counted again as a legacy error');
});

test('scope includes real subagents, excludes forks, and keeps Dream parent scopes outside a session', t => {
  const f = fixture(t), states = [{ id: 'parent' }, { id: 'child', origin: 'subagent', parentSession: 'parent' }, { id: 'fork', origin: 'fork', parentSession: 'parent' }];
  const selection = monitorSelection(states, 'parent');
  assert.deepEqual([...selection.ids], ['parent', 'child']);
  for (const id of ['parent', 'child', 'fork']) f.ledger.append(f.call(id, { sessionId: id }));
  f.ledger.append(f.call('dream-global', { sessionId: null, source: 'dream', kind: 'dreamGlobal' }));
  assert.equal(f.query().totals.calls, 2);
  assert.equal(f.ledger.query(states, new Set(states.map(row => row.id)), monitorQuery({ range: 'all' }, f.now())).totals.calls, 4);
});

test('constructor and append failures remain optional telemetry, including at the Hub boundary', t => {
  const f = fixture(t), badPath = join(f.dir, 'file'); writeFileSync(badPath, 'not a directory');
  const broken = new MonitorLedger(badPath); assert.equal(broken.append(f.call('x')), false); broken.close();
  assert.throws(() => broken.query([], new Set(), monitorQuery({})), /ENOTDIR/);
  f.ledger.close(); assert.equal(f.ledger.append(f.call('closed')), false);
  const state = { metrics: {}, activity: [] }, hub = { store: { state: () => state, save() {} }, monitor: { append() { throw Error('disk offline'); } } };
  const session = { id: 'parent', header: { cwd: '/test' }, requestHeader: () => ({}), snapshotEvents: () => [] };
  assert.doesNotThrow(() => Hub.prototype.record.call(hub, session, 'main', f.call('success')));
  assert.equal(state.metrics.main.calls, 1); assert.equal(state.metrics.main.errors, 0);
});

test('read-only API retains optional telemetry failures and does not load prompts', t => {
  const f = fixture(t); f.ledger.append(f.call('real'));
  const hub = { monitor: f.ledger, store: { monitorStates: () => [{ id: 'parent' }], monitorErrors: new Map() },
    live: new Map(), context: { adapter: { contextCapacity: () => 128000 } }, config: () => ({}),
    dream: { store: { jobs: () => [], usage: () => ({ used: 40, resetsAt: f.now() }) } } };
  const data = monitorSnapshot({ hub, ctx: { tokenMeter: { measure() { throw Error('not ready'); } } }, params: new URLSearchParams(), id: 'parent', session: { id: 'parent' } });
  assert.equal(data.totals.calls, 1); assert.equal(data.contextCapacity, 128000); assert.equal(data.meter, null);
  assert.match(data.coverage.message, /上下文读数暂时不可用/); assert.equal(data.dream.usage.used, 40);
  assert.ok(data.resources.rssBytes > 0);
});

test('invalid filters and pagination are bounded and rejected', t => {
  const f = fixture(t);
  for (const params of [{ period: 'forever' }, { status: 'ready' }, { limit: 1000 }, { limit: -1 }, { model: 'a'.repeat(257) }]) assert.throws(() => monitorQuery(params));
  assert.throws(() => f.query({ cursor: 'not-json' }), /分页标记无效/);
});

test('undated legacy calls never acquire a date or a fabricated zero reading', t => {
  const f = fixture(t), states = [{ id: 'parent', activity: [f.call('undated', { at: undefined, usage: null })],
    metrics: { main: { calls: 40, unmetered: 40, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } }];
  const data = f.query({}, states);
  assert.equal(data.totals.totalTokens, null); assert.equal(data.totals.inputTotalTokens, null);
  assert.equal(data.totals.reasoningTokens, null); assert.equal(data.activityTotal, 0);
  assert.equal(data.coverage.legacyCalls, 40); assert.equal(f.query({ period: 'today' }, states).totals.calls, 0);
  f.ledger.append(f.call('old-archive', { sessionId: 'missing-archive' }));
  assert.equal(f.query({ range: 'all' }).totals.calls, 1, 'all retains real ledger records even when their old archive is gone');
});
