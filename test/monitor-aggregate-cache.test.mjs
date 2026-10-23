import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MonitorLedger, monitorQuery } from '../src/monitor-ledger.mjs';

test('aggregate reuse follows SQLite snapshots, time bounds and caller ownership', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-aggregate-cache-')), now = 1792190400000;
  const ledger = new MonitorLedger(directory, { now: () => now });
  const writer = new DatabaseSync(join(directory, 'monitor-v1/usage.sqlite'));
  t.after(() => { writer.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  const append = (id, at = now - 1, extra = {}) => ledger.append({ id, at, sessionId: 'fixture', kind: 'main', source: 'native',
    provider: 'fixture', model: 'fixture', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, ...extra });
  let groups = 0, externalWrite;
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => {
    if (sql.includes('WITH measured')) groups++;
    const statement = prepare(sql);
    if (!sql.includes('pragma_data_version')) return statement;
    return new Proxy(statement, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'get') return typeof value === 'function' ? value.bind(target) : value;
      return (...args) => { const row = value.apply(target, args), write = externalWrite; externalWrite = undefined; write?.(); return row; };
    } });
  };
  const query = (at = now, params = {}, states = []) => ledger.query(states, new Set(['fixture']), monitorQuery({ session: 'fixture', ...params }, at));
  append('first');
  const first = query(); assert.equal(groups, 1);
  assert.equal(Object.getPrototypeOf(first.totals), null);
  first.totals.calls = 900; first.groups.models[0].calls = 900; first.groups.models.push({ key: 'poison' });
  const warm = query(now + 3000);
  assert.equal(groups, 1); assert.equal(warm.totals.calls, 1); assert.equal(warm.groups.models.length, 1);
  assert.equal(warm.groups.models[0].calls, 1);
  append('second'); assert.equal(query().totals.calls, 2); assert.equal(groups, 2);
  append('second', now - 1, { firstTokenMs: 5 });
  assert.equal(query().performance.firstTokenCalls, 1); assert.equal(groups, 3);
  writer.prepare('UPDATE calls SET outputTokens=25,totalTokens=35 WHERE id=?').run('first');
  assert.equal(query().totals.outputTokens, 30); assert.equal(groups, 4);
  externalWrite = () => writer.prepare('UPDATE calls SET outputTokens=45,totalTokens=55 WHERE id=?').run('first');
  assert.equal(query().totals.outputTokens, 30); assert.equal(groups, 4);
  assert.equal(query().totals.outputTokens, 50); assert.equal(groups, 5);
  append('future', now + 6000);
  assert.equal(query().totals.calls, 2);
  assert.equal(query(now + 3000).totals.calls, 2);
  assert.equal(query(now + 6000).totals.calls, 3);
  assert.equal(query(now + 9000).totals.calls, 3);
  const beforeFilter = groups; query(now + 9000); assert.equal(groups, beforeFilter);
  assert.equal(query(now + 9000, { kind: 'prepare' }).totals.calls, 0);
  assert.equal(query(now + 9000).totals.calls, 3);
  const states = [{ id: 'fixture', metrics: { main: { calls: 5, inputTokens: 100 } } }];
  assert.equal(query(now + 9000, {}, states).totals.calls, 5);
  assert.equal(query(now + 9000).totals.calls, 3);
  const cache = ledger.groupCache; assert.ok(cache);
  ledger.close(); assert.equal(ledger.groupCache, null);
});

test('aggregate reuse does not retain oversized or failed query results', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-aggregate-bound-')), now = 1792190400000;
  const ledger = new MonitorLedger(directory, { now: () => now });
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  ledger.db.exec('BEGIN');
  for (let i = 0; i < 600; i++) assert.equal(ledger.append({ id: 'call-' + i, sessionId: 's' + i, kind: 'main', provider: 'p' + i, model: 'm' + i,
    source: 'native', at: now - i, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }), true);
  ledger.db.exec('COMMIT');
  const query = monitorQuery({ range: 'all' }, now);
  const output = ledger.query([], new Set(), query); assert.equal(output.totals.calls, 600);
  assert.equal(ledger.groupCache, null);
  const prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => { if (sql.includes('WITH measured')) throw Error('isolated query failure'); return prepare(sql); };
  assert.throws(() => ledger.query([], new Set(), query), /isolated query failure/);
  assert.equal(ledger.groupCache, null);
  ledger.db.prepare = prepare; assert.equal(ledger.query([], new Set(), query).totals.calls, 600);
});

test('event-only writes preserve receipt caches while events and live counters stay current', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-event-cache-')), now = 1792190400000;
  const ledger = new MonitorLedger(directory, { now: () => now });
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  ledger.append({ id: 'receipt', sessionId: 'fixture', kind: 'main', at: now - 1, source: 'native',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  const states = [{ id: 'fixture', metrics: { main: { calls: 2, inputTokens: 30 } } }];
  const query = monitorQuery({ range: 'all' }, now), ids = new Set(['fixture']);
  const pricing = { catalog: {}, custom: '[]' }, price = () => ({ currency: 'USD', amount: 1 });
  const read = () => ledger.query(states, ids, query, price, { costCacheKey: pricing });
  const usage = () => ledger.query(states, ids, query, undefined, { usageOnly: true });
  const initial = read(), initialUsage = usage();
  const names = ['groupCache', 'usageCache', 'legacyCache', 'legacyCountCache', 'overviewCache', 'costCache'];
  const caches = names.map(name => { assert.ok(ledger[name], name); return ledger[name]; });
  const event = { id: 'event', sessionId: 'fixture', kind: 'autoCompact', status: 'skip', at: now - 1 };
  assert.equal(ledger.appendEvent(event), true);
  assert.equal(ledger.appendEvent(event), true, 'duplicate event inserts remain harmless');
  assert.deepEqual(read(), initial); assert.deepEqual(usage(), initialUsage);
  for (const [i, name] of names.entries()) assert.equal(ledger[name], caches[i], name);
  assert.equal(ledger.events(ids, { ...query, offset: 0 }).total, 1);
  states[0].metrics.main.calls = 3;
  assert.equal(read().totals.calls, 3, 'live legacy counters are not hidden by reuse');
  ledger.append({ id: 'receipt', firstTokenMs: 0 });
  assert.equal(read().performance.firstTokenCalls, 1, 'late timing still invalidates derived reads');
  assert.notEqual(ledger.groupCache, caches[0]);
});

test('event cache accounting remains conservative for rollbacks, triggers and external writers', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-event-cache-writers-')), now = 1792190400000;
  const ledger = new MonitorLedger(directory, { now: () => now });
  const writer = new DatabaseSync(join(directory, 'monitor-v1/usage.sqlite'));
  t.after(() => { writer.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  ledger.append({ id: 'receipt', sessionId: 'fixture', kind: 'main', at: now - 1, source: 'native', usage: { outputTokens: 5 } });
  const query = monitorQuery({ range: 'all' }, now), read = () => ledger.query([], new Set(), query);
  read(); const initial = ledger.groupCache;
  ledger.db.exec('BEGIN'); ledger.appendEvent({ id: 'rolled-back', kind: 'prepare', at: now - 1 }); ledger.db.exec('ROLLBACK');
  assert.equal(read().totals.outputTokens, 5); assert.equal(ledger.groupCache, initial);
  ledger.db.exec("CREATE TRIGGER event_receipt AFTER INSERT ON events BEGIN UPDATE calls SET outputTokens=outputTokens+1 WHERE id='receipt'; END");
  ledger.appendEvent({ id: 'triggered', kind: 'prepare', at: now - 1 });
  assert.equal(read().totals.outputTokens, 6, 'only the direct event write is excluded');
  ledger.db.exec('DROP TRIGGER event_receipt');
  ledger.db.exec("CREATE TRIGGER event_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'event failure'); END");
  assert.equal(ledger.appendEvent({ id: 'failed', kind: 'prepare' }), false);
  ledger.db.exec('DROP TRIGGER event_failure');
  ledger.appendEvent({ id: 'after-failure', kind: 'prepare', at: now - 1 });
  ledger.db.prepare('UPDATE calls SET outputTokens=7 WHERE id=?').run('receipt');
  assert.equal(read().totals.outputTokens, 7);
  writer.prepare('UPDATE calls SET outputTokens=8 WHERE id=?').run('receipt');
  assert.equal(read().totals.outputTokens, 8, 'external receipt updates still invalidate caches');
  writer.prepare('INSERT INTO call_timings VALUES(?,?)').run('receipt', 0);
  assert.equal(read().performance.firstTokenCalls, 1);
});
