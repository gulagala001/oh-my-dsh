import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';
import { DreamSources } from '../src/dream/sources.mjs';
import { readDream } from '../src/dream/recall.mjs';
import { nodeKey } from '../src/dream/core.mjs';

const route = { provider: 'fixture', model: 'fixture' };
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
