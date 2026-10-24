import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';
import { DreamSources } from '../src/dream/sources.mjs';
import { readDream, dreamRecallContent } from '../src/dream/recall.mjs';
import { nodeKey } from '../src/dream/core.mjs';

const route = { provider: 'fixture', model: 'fixture' };

for (const eventState of ['detached', 'shared-frozen', undefined, 'unknown']) test(`source reads respect native ${eventState ?? 'legacy'} event ownership`, async () => {
  const header = { id: 'source', version: 4, createdAt: 1, cwd: '/project' };
  const events = [{ seq: 0, type: 'user/message', data: { id: 'message', role: 'user', content: [
    { type: 'text', text: '完整原文 😀 9007199254740993' },
    { type: 'image', offloaded: true, attachment: { attachmentId: 'image', mediaType: 'image/png', bytes: 10, width: 1, height: 1 } },
  ] } }];
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  if (eventState === 'shared-frozen') freeze(events);
  const expected = structuredClone(events);
  let opened = 0, closed = 0, lastRead;
  const hub = { ctx: { sessionPersistence: { async open(id, mode) {
    assert.equal(id, header.id); assert.equal(mode, 'read'); opened++;
    return { header, inheritedEventCount: 1, async read() {
      // A declared detached producer transfers its own graph, never aliases a
      // previous call. The shared-frozen producer transfers only a fresh slice.
      lastRead = eventState === 'detached' ? structuredClone(events) : events.slice();
      return { events: lastRead, eventState };
    }, async close() { closed++; } };
  } } }, dream: { store: {} } };
  const sources = hub.dream.sources = new DreamSources(hub, {});
  try {
    const snapshot = await sources.read('source');
    assert.deepEqual(snapshot.events, expected);
    assert.equal(snapshot.inherited, 1);
    assert.notEqual(snapshot.header, header);
    if (eventState === 'detached' || eventState === 'shared-frozen') assert.equal(snapshot.events, lastRead);
    else { assert.notEqual(snapshot.events[0], lastRead[0]); snapshot.events[0].data.content[0].text = 'caller edit'; }
    snapshot.header.cwd = '/changed'; snapshot.events.pop();
    assert.deepEqual((await sources.read('source')).events, expected);
    assert.equal(header.cwd, '/project');
    assert.equal((await sources.original('source', 0, 0))[0].text.includes('完整原文 😀 9007199254740993'), true);
    const content = await dreamRecallContent(hub, { sessionId: 'source', from: 0, to: 0, asset: 1 }, {});
    assert.equal(content[1].offloaded, undefined);
    content[1].attachment.width = 9;
    assert.deepEqual(events, expected, 'attachment delivery must not mutate the native graph');
  } finally { await sources.close(); }
  assert.equal(closed, opened);
  assert.equal(sources.pending.size, 0);
});

test('source snapshot cancellation and failed reads close their handles and can retry', async () => {
  let closed = 0, fail = true, cancel;
  const sources = new DreamSources({ ctx: { sessionPersistence: { async open() {
    return { header: { id: 'source' }, async read() {
      if (fail) throw Error('read failed');
      cancel?.abort(Error('read cancelled'));
      return { eventState: 'shared-frozen', events: [] };
    }, async close() { closed++; } };
  } } } }, {});
  try {
    await assert.rejects(sources.read('source'), /read failed/);
    assert.equal(closed, 1);
    fail = false; cancel = new AbortController();
    await assert.rejects(sources.read('source', cancel.signal), /read cancelled/);
    assert.equal(closed, 2);
    cancel = null;
    assert.deepEqual((await sources.read('source')).events, []);
    assert.equal(closed, 3);
    assert.equal(sources.pending.size, 0);
  } finally { await sources.close(); }
  await assert.rejects(sources.read('source'), /退出/);
  assert.equal(closed, 3);
});

async function fixture(t) {
  const directory = await mkdtemp(join(resolve('.local'), 'dream-source-'));
  let store = new DreamStore(directory), service;
  t.after(async () => { if (service) await service.close(); else if (!store.closed) store.close(); await rm(directory, { recursive: true, force: true }); });
  return {
    get store() { return store; },
    async reopen() { await service.close(); service = null; store = new DreamStore(directory); },
    service({ generate, sources = {} } = {}) {
      service = new DreamService({ config: () => ({ backgroundMaxRetries: 0, dreamDailyTokens: 10000000, dreamProvider: route.provider, dreamModel: route.model }),
        context: { adapter: { message: text => ({ role: 'user', content: text }) } }, ctx: {} }, {
        store, sources: { sync: async () => {}, projectTitle: id => id, close() {}, ...sources }, generate,
      });
      return service;
    },
  };
}

function seed(store) {
  store.saveSession({ id: 'session', project: '/project', shared: true, generation: 'old' });
  const epoch = store.acquire();
  const source = { id: 'original-old', kind: 'raw', sessionId: 'session', generation: 'old' };
  const session = store.publish({ kind: 'session', target: 'session', summary: 'obsolete-fact', sources: [source],
    consumed: [{ key: 'old-input', fingerprint: 'old' }], epoch });
  const child = memory => ({ id: memory.ref, kind: 'memory', key: memory.key, revision: memory.revision });
  const project = store.publish({ kind: 'project', target: '/project', summary: session.summary, sources: [child(session)],
    consumed: [{ key: session.key, fingerprint: String(session.revision) }], epoch });
  const global = store.publish({ kind: 'global', target: 'global', summary: project.summary, sources: [child(project)],
    consumed: [{ key: project.key, fingerprint: String(project.revision) }], epoch });
  store.release(epoch);
  return { session, project, global };
}

test('a replaced session rebuilds from its own generation and resumes only rebuilt coverage', async t => {
  const f = await fixture(t), old = seed(f.store), calls = [];
  f.store.setMeta('scan:session', 'unchanged');
  let closed = 0;
  const sources = new DreamSources({ config: () => ({ memoryScope: 'project' }), store: { peek: () => null },
    context: { store: { peek: () => null } }, ctx: { sessionPersistence: { open: async () => ({
      header: { id: 'session', version: 3, createdAt: 2, cwd: '/project' }, read: async () => ({ events: [] }), close: async () => { closed++; },
    }) } } }, f.store);
  const { metadata } = await sources.inspect('session'); await sources.close();
  assert.equal(closed, 1);
  assert.equal(f.store.meta('scan:session'), null);
  for (const memory of Object.values(old)) assert.equal(f.store.memory(memory.key).invalid, true);
  assert.equal((await readDream({ dream: { store: f.store } }, { memory: 'session', sessionId: 'session' }, {})).kind, 'awaiting_refresh');
  assert.equal((await readDream({ dream: { store: f.store } }, { reference: old.session.ref }, {})).text, 'obsolete-fact');
  const items = Array.from({ length: 26 }, (_, i) => ({ key: 'new-' + i, fingerprint: 'new',
    source: { id: 'original-new-' + i, kind: 'raw', sessionId: 'session', generation: metadata.generation }, text: 'fresh-' + i }));
  let interrupted = true;
  const create = () => f.service({
    sources: { stamp: () => 'unchanged', manifest: async () => ({ through: 25, metadata, items, completeCut: true }), validateBatch: async () => {} },
    generate: async input => {
      calls.push(input);
      if (interrupted && calls.length === 2) throw Error('second batch interrupted');
      return { summary: [input.previous?.text, ...input.sources.map(source => source.text)].filter(Boolean).join(' '),
        references: input.sources.map(source => source.id) };
    },
  });
  let service = create();
  const job = f.store.enqueue('session', 'session', false, { route });
  await service.drain();
  assert.equal(f.store.job(job.id).state, 'failed');
  assert.equal(calls[0].previous, null, 'a previous generation is historical evidence, not the new memory base');
  assert.equal(f.store.consumed(old.session.key, 'old-input'), undefined);
  await f.reopen(); interrupted = false; service = create();
  service.resume(job.id); await service.drain();
  const memory = f.store.memory(old.session.key);
  assert.equal(f.store.job(job.id).state, 'complete');
  assert.equal(calls.length, 3, 'the completed first batch survives SQLite reopen');
  assert.equal(calls[2].sources.length, 2);
  assert.doesNotMatch(memory.summary, /obsolete/);
  for (const item of items) assert.ok(memory.summary.includes(item.text));
  assert.equal(f.store.memory(old.session.key, old.session.revision).summary, 'obsolete-fact');
  f.store.saveSession({ ...f.store.session('session'), activity: 123, eventCount: 27, eventDigest: 'appended' });
  assert.equal(f.store.memory(old.session.key).invalid, undefined, 'ordinary activity must retain the same generation');
});

test('publication rejects a retired generation even across consecutive invalidations', async t => {
  const f = await fixture(t), old = seed(f.store);
  f.store.saveSession({ ...f.store.session('session'), generation: 'new' });
  f.store.saveSession({ ...f.store.session('session'), generation: 'newest' });
  const epoch = f.store.acquire();
  assert.throws(() => f.store.publish({ kind: 'session', target: 'session', baseRevision: old.session.revision,
    baseInvalid: Boolean(f.store.memory(old.session.key).invalid), summary: 'late-output', sources: [{ id: 'late-source', kind: 'raw', sessionId: 'session', generation: 'new' }],
    consumed: [{ key: 'late-input', fingerprint: 'new' }], epoch }), /来源|日志/);
  assert.equal(f.store.memory(old.session.key).revision, old.session.revision);
  assert.equal(f.store.source('late-source'), null);
  assert.equal(f.store.consumed(old.session.key, 'late-input'), undefined);
  assert.throws(() => f.store.publish({ kind: 'session', target: 'session', baseRevision: old.session.revision,
    baseInvalid: true, summary: 'wrong-session', sources: [{ id: 'foreign-source', kind: 'raw', sessionId: 'another-session', generation: 'newest' }], epoch }), /来源|日志/);
  assert.equal(f.store.source('foreign-source'), null);
  f.store.release(epoch);
});

for (const kind of ['project', 'global']) test(`withdrawing the last ${kind} source completes without retaining stale facts`, async t => {
  const f = await fixture(t), old = seed(f.store), calls = [];
  f.store.saveSession({ ...f.store.session('session'), shared: false });
  const service = f.service({ generate: async input => {
    calls.push(input);
    assert.equal(input.previous, null);
    assert.ok(input.sources.every(source => source.id.startsWith('withdrawn:')));
    return { summary: '当前没有可共享的资料。', references: input.sources.map(source => source.id) };
  } });
  const target = kind === 'project' ? '/project' : 'global';
  const job = await service.enqueue(kind, target, { session: {} });
  await service.drain();
  const memory = f.store.memory(nodeKey(kind, target));
  assert.equal(f.store.job(job.id).state, 'complete');
  assert.equal(Boolean(memory.invalid), false, 'a completed cleanup must not remain awaiting refresh');
  assert.equal(memory.summary, '当前没有可共享的资料。');
  assert.equal(calls.length, 1);
  assert.equal(f.store.memory(memory.key, old[kind].revision).summary, 'obsolete-fact');
  await service.enqueue(kind, target, { session: {} }); await service.drain();
  assert.equal(calls.length, 1, 'the withdrawal receipt prevents repeated model calls');
  // A new shared session can leave before contributing any memory. An already
  // withdrawn input must still be handled when that scope invalidates again.
  f.store.saveSession({ id: 'unprocessed', project: '/project', shared: true, generation: 'unprocessed' });
  f.store.saveSession({ ...f.store.session('unprocessed'), shared: false });
  await service.enqueue(kind, target, { session: {} }); await service.drain();
  assert.equal(Boolean(f.store.memory(memory.key).invalid), false);
  await service.enqueue(kind, target, { session: {} }); await service.drain();
  assert.equal(calls.length, 2, 'another invalidation is rebuilt once, never retried on every run');
});

function digestFixture(events, eventState = 'shared-frozen') {
  let values = events, saves = 0, saved, memoryScope = 'project';
  const store = { session: () => saved, saveSession(value) { saves++; saved = value; } };
  const hub = { config: () => ({ memoryScope }), store: { peek() {} }, context: { store: { peek() {} } },
    ctx: { sessionPersistence: { async open() { return {
      header: { id: 'digest', version: 4, createdAt: 1, cwd: '/project' }, inheritedEventCount: 0,
      async read() { return { events: values.slice(), eventState }; }, async close() {},
    }; } } } };
  return { sources: new DreamSources(hub, store), get saves() { return saves; }, get saved() { return saved; },
    replace(next) { values = next; }, scope(value) { memoryScope = value; } };
}
const digestEvent = (seq, text) => Object.freeze({ seq, type: 'user/message', timestamp: seq + 10,
  data: Object.freeze({ role: 'user', content: Object.freeze([Object.freeze({ type: 'text', text })]) }) });

test('Dream inspection reuses the exact digest of an unchanged immutable native snapshot', async t => {
  const { digest } = await import('../src/dream/core.mjs');
  const events = Array.from({ length: 120 }, (_, i) => digestEvent(i, `原文 ${i} 😀\ud800\u0000 " \\`));
  const f = digestFixture(events); t.after(() => f.sources.close());
  assert.equal((await f.sources.inspect('digest')).metadata.eventDigest, digest(events));
  const stringify = JSON.stringify;
  let sourceSerializations = 0;
  t.mock.method(JSON, 'stringify', function (value, ...args) {
    if (events.includes(value) || Array.isArray(value) && value.some(event => events.includes(event))) sourceSerializations++;
    return stringify(value, ...args);
  });
  const result = await f.sources.inspect('digest');
  assert.equal(sourceSerializations, 0, 'unchanged native event graphs must not be serialized again');
  assert.equal(result.metadata.eventDigest, f.saved.eventDigest);
  assert.equal(f.saves, 2, 'scope and source metadata still refresh on every inspection');
});

test('Dream digest detects middle replacement, reordering, append, new identities and detached mutation', async t => {
  const { digest } = await import('../src/dream/core.mjs');
  const first = [digestEvent(0, '头'), digestEvent(1, '中'), digestEvent(2, '尾')];
  const f = digestFixture(first); t.after(() => f.sources.close());
  for (const events of [first, [first[0], digestEvent(1, '改变'), first[2]], [first[2], first[1], first[0]],
    [...first, digestEvent(3, '追加')], first.map(event => structuredClone(event)), [], first]) {
    f.replace(events);
    assert.equal((await f.sources.inspect('digest')).metadata.eventDigest, digest(events));
  }
  for (const eventState of ['detached', 'unknown', null]) {
    const mutable = structuredClone(first), detached = digestFixture(mutable, eventState);
    t.after(() => detached.sources.close());
    assert.equal((await detached.sources.inspect('digest')).metadata.eventDigest, digest(mutable));
    mutable[1].data.content[0].text = '同一对象的新内容';
    assert.equal((await detached.sources.inspect('digest')).metadata.eventDigest, digest(mutable));
  }
});

test('Dream digest cancellation publishes no partial metadata and can retry', async t => {
  const { digest } = await import('../src/dream/core.mjs');
  const events = [digestEvent(0, 'a'), digestEvent(1, 'b'), digestEvent(2, 'c')], f = digestFixture(events);
  t.after(() => f.sources.close());
  let now = 0; t.mock.method(performance, 'now', () => now += 10);
  const controller = new AbortController();
  setImmediate(() => controller.abort(Error('cancel digest')));
  await assert.rejects(f.sources.inspect('digest', controller.signal), /cancel digest/);
  assert.equal(f.saves, 0); assert.equal(f.sources.pending.size, 0);
  assert.equal((await f.sources.inspect('digest')).metadata.eventDigest, digest(events));
  assert.equal(f.saves, 1);
  setImmediate(() => f.sources.close());
  f.replace([...events, digestEvent(3, 'new')]);
  await assert.rejects(f.sources.inspect('digest'), /退出/);
  await f.sources.close(); assert.equal(f.sources.pending.size, 0); assert.equal(f.saves, 1);
});

test('Dream scope is refreshed after digest yields and failed serialization can recover', async t => {
  const events = [digestEvent(0, 'a'), digestEvent(1, 'b')], f = digestFixture(events);
  t.after(() => f.sources.close());
  let now = 0; t.mock.method(performance, 'now', () => now += 10);
  setImmediate(() => f.scope('session'));
  assert.equal((await f.sources.inspect('digest')).metadata.shared, false);
  const bad = { seq: 0, type: 'user/message', data: {} }; bad.data.self = bad;
  f.replace([bad]); await assert.rejects(f.sources.inspect('digest'), /circular/i);
  assert.equal(f.saves, 1); assert.equal(f.sources.pending.size, 0);
  f.replace(events); assert.equal((await f.sources.inspect('digest')).metadata.eventCount, 2);
});
