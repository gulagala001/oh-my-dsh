import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextStore } from '../src/context/store.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { catalogPage } from '../src/context/catalog.mjs';
import { createSurfaceIndex, liveSpan, splitGroups } from '../src/context/core.mjs';
import { FixtureSession, system, user, adapter } from './context-fixture.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-capacity-'));
  const hub = { store: new HubStore(dir), config: () => contextConfig({}),
    scope: () => ({ mode: 'project', project: '/test-project' }), action() {} };
  const pipeline = new ContextPipeline(hub, adapter);
  t.after(async () => { await pipeline.dispose(); rmSync(dir, { recursive: true, force: true }); });
  const session = new FixtureSession(); system(session); user(session, 'Keep the task.');
  return { pipeline, session, state: pipeline.state(session), store: pipeline.store, hub, dir };
}
const record = i => ({ id: `record-${String(i).padStart(5, '0')}`, version: 1, sessionId: 'history',
  summary: '准确的项目记录。'.repeat(55), documents: [{ title: 'Detail', text: '原始资料' }],
  parents: [], timeStart: i, timeEnd: i, createdAt: i });

test('project publication stays within its budget and only marks actually delivered records', t => {
  const f = setup(t), history = f.store.state('history', f.state.binding);
  history.records = Array.from({ length: 125 }, (_, i) => record(i)); f.store.save(history);
  const published = []; let fail = false;
  f.pipeline.adapter = { ...adapter, catalogBudget: () => 4200, catalogCost: text => Buffer.byteLength(text),
    publish(_session, text) { if (fail) throw Error('append failed'); published.push(text); } };
  f.pipeline.publishMemory(f.session);
  assert.equal(published.length, 1); assert.ok(Buffer.byteLength(published[0]) <= 4200);
  const delivered = Object.keys(f.state.publications.catalog);
  assert.ok(delivered.length > 0 && delivered.length < 125);
  assert.equal(f.state.publications.deferred, 125 - delivered.length);
  assert.equal(f.store.visible(f.session.id).length, 125);
  for (const id of delivered) assert.ok(published[0].includes(id));
  const before = structuredClone(f.state.publications.catalog); fail = true;
  assert.throws(() => f.pipeline.publishMemory(f.session), /append failed/);
  assert.deepEqual(f.state.publications.catalog, before);
});

test('catalog pages cover all records and surface stale cursors and oversized summaries', () => {
  const records = Array.from({ length: 125 }, (_, i) => record(i));
  const ids = []; let cursor;
  do { const page = catalogPage(records, { cursor }); ids.push(...page.entries.map(r => r.id)); cursor = page.nextCursor; } while (cursor);
  assert.deepEqual(ids, records.map(r => r.id));
  assert.throws(() => catalogPage(records, { cursor: 'removed' }), e => e.statusCode === 409);
  const long = { ...record(999), summary: '原始资料'.repeat(30000) };
  const page = catalogPage([long]); assert.equal(page.entries[0].summaryTruncated, true);
  assert.equal(long.summary.length, 120000); assert.equal(page.nextCursor, null);
});

test('an unrelated damaged archive is reported without blocking healthy project records', t => {
  const f = setup(t), healthy = f.store.state('history', f.state.binding);
  healthy.records = [record(1)]; f.store.save(healthy);
  const broken = f.store.state('unrelated', { scope: 'project', project: '/another' }); f.store.save(broken);
  const bytes = '{invalid'; writeFileSync(f.store.path(broken.id), bytes);
  assert.equal(f.store.visible(f.session.id).length, 1); assert.equal(f.store.readErrors.size, 1);
  assert.equal(readFileSync(f.store.path(broken.id), 'utf8'), bytes);
  assert.throws(() => f.store.all());
  f.store.save(broken); assert.equal(f.store.visible(f.session.id).length, 1); assert.equal(f.store.readErrors.size, 0);
  writeFileSync(f.store.path(f.session.id), bytes);
  assert.throws(() => f.store.visible(f.session.id), /无法读取/);
});

test('state release drains its jobs, preserves archives, and leaves unrelated active states alone', async t => {
  const f = setup(t), other = f.store.state('other', f.state.binding);
  const agent = { session: f.session, status: 'idle' }; f.pipeline.agents.set(f.session.id, agent);
  f.hub.store.save(f.hub.store.state(f.session.id));
  let finish;
  const key = f.session.id + ':prepare';
  const job = new Promise(resolve => { finish = resolve; }).finally(() => f.pipeline.jobs.delete(key));
  f.pipeline.jobs.set(key, job);
  const disposed = f.pipeline.dispose(f.session.id);
  assert.ok(f.store.cache.has(f.session.id));
  finish(); await disposed;
  assert.equal(f.store.cache.has(f.session.id), false); assert.equal(f.hub.store.states.has(f.session.id), false);
  assert.equal(f.store.cache.get('other'), other);
  assert.deepEqual(f.store.state(f.session.id), f.state);
});

test('unchanged saves avoid replacement but external edits are never hidden by the write cache', t => {
  const f = setup(t), path = f.store.path(f.session.id);
  const before = statSync(path, { bigint: true });
  f.store.save(f.state); f.store.save(f.state);
  const after = statSync(path, { bigint: true });
  assert.equal(after.ino, before.ino); assert.equal(after.mtimeNs, before.mtimeNs);
  writeFileSync(path, '{broken'); f.store.save(f.state);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), f.state);
  f.state.steps++; f.store.save(f.state);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).steps, f.state.steps);
});

test('read-only lookup allocates nothing and monitoring explicitly counts unreadable archives', t => {
  const f = setup(t), store = f.hub.store;
  for (let i = 0; i < 100; i++) assert.equal(store.peek('missing-' + i), undefined);
  assert.equal(store.states.size, 0);
  const good = store.state('good'); good.metrics.main = { calls: 3 }; store.save(good);
  writeFileSync(join(f.dir, 'sessions', 'bad.json'), '{bad');
  const reader = new HubStore(f.dir), states = reader.monitorStates();
  assert.equal(states.length, 1); assert.equal(states[0].metrics.main.calls, 3);
  assert.equal(reader.monitorErrors.size, 1); assert.equal(reader.states.size, 0);
});

test('one surface index serves a bulk record check and preserves split-group ordering', () => {
  const nodes = Array.from({ length: 8000 }, (_, i) => i);
  let surfaceReads = 0;
  const session = { surface: { get nodes() { surfaceReads++; return nodes; } } };
  const index = createSurfaceIndex(session);
  for (let i = 0; i < 500; i++) {
    const span = liveSpan(session, { kind: 'full', mode: 'brief', carrierSeq: i * 16 }, index);
    assert.deepEqual(span, { seqs: [i * 16], groups: [[i * 16]], start: i * 16, end: i * 16 });
  }
  assert.equal(surfaceReads, 1);
  assert.deepEqual(splitGroups(nodes, [7, 3, 4, 4, 0, 9000], index), [[0], [3, 4], [7]]);
});
