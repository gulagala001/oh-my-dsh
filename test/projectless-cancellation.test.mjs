import test from 'node:test';
import assert from 'node:assert/strict';
import { copyPermissions, ProjectlessDrafts } from '../src/client/projectless-state.mjs';

const turn = () => new Promise(setImmediate);
const storage = () => ({ getItem: () => null, setItem() {} });
const face = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
const accepted = { ok: true, value: { matched: true } };

test('cancelled permission copying never submits a native command', async () => {
  let commands = 0;
  const source = { projections: { faceOf: () => face({ currentValue: 'full' }) } };
  const target = { projections: { faceOf: () => face({ currentValue: 'readonly' }) }, command: async () => { commands++; return accepted; } };
  const abort = new AbortController(); abort.abort(Error('navigation cancelled'));
  await assert.rejects(copyPermissions(source, target, abort.signal));
  assert.equal(commands, 0);
});

test('cancelled settings handoff stops after the accepted permission write settles', async t => {
  const entered = Promise.withResolvers(), committed = Promise.withResolvers(), abort = new AbortController();
  let policy = 'readonly', presetWrites = 0, modelWrites = 0, reads = 0;
  const source = { projections: { faceOf: name => face(name === 'permissions' ? { currentValue: 'full' }
    : name === 'agentPreset' ? 'oh-my-dsh' : { next: { provider: 'synthetic', model: 'local' } }) } };
  const target = { projections: { faceOf: () => ({ getSnapshot: () => ({ currentValue: policy }), subscribe: () => () => {} }) },
    async command() { entered.resolve(); await committed.promise; policy = 'full'; return accepted; } };
  const drafts = new ProjectlessDrafts({ sessions: { binding: id => ({ session: id === 'from' ? source : target }) },
    remote: { agentPresets: { select: async () => { presetWrites++; return accepted; } },
      session: { selectModel: async () => { modelWrites++; return accepted; } } } }, { storage: storage() });
  t.after(() => drafts.dispose());
  t.mock.method(globalThis, 'fetch', async () => { reads++; return { ok: true, json: async () => ({ mode: 'off', selected: {}, revision: 0 }) }; });
  const copying = drafts.copySettings('from', 'to', abort.signal);
  const result = copying.then(() => null, error => error);
  await entered.promise; abort.abort(Error('navigation cancelled')); committed.resolve();
  assert.equal((await result)?.message, 'navigation cancelled');
  assert.deepEqual([presetWrites, modelWrites, reads], [0, 0, 0]);
});

function fixture(t, { sourceReady = Promise.resolve(), targetReady = Promise.resolve(), request } = {}) {
  const navigation = new AbortController(), created = Promise.withResolvers();
  const released = [], original = { draft: 'unsent', occurrences: [], attachmentIds: [] }, notices = [];
  const source = { captureDraft: () => structuredClone(original), notify: (...args) => notices.push(args), restoreDraft() {} };
  let creates = 0;
  const ctx = { sessions: {
    list: { getSnapshot: () => ({ ids: ['source'], byId: { source: { cwd: '/synthetic' } } }) },
    retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: 1 } }) }),
    retain(id, { signal }) {
      // Native SessionReference.ready cancels its acquisition waiter only;
      // ownership is still released explicitly by the operation's finally.
      const ready = id === 'source' ? sourceReady : targetReady;
      let abort;
      const cancelled = signal && new Promise((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      return { ready: cancelled ? Promise.race([ready, cancelled]) : ready,
        release() { signal?.removeEventListener('abort', abort); released.push(id); } };
    },
    create: async () => { creates++; created.resolve(); return 'target'; },
  }, layout: { beginNavigation: () => navigation.signal } };
  const drafts = new ProjectlessDrafts(ctx, { storage: storage(), request: request ?? (async () => ({ cwd: '/synthetic/work' })) });
  drafts.drafts.source = { requestId: 'stable-request', sessionId: 'target' };
  t.after(() => drafts.dispose());
  return { drafts, navigation, created, released, source, notices, creates: () => creates };
}

test('leaving a draft cancels its workspace read and preserves retry identity', async t => {
  const reply = Promise.withResolvers(); let signal;
  const f = fixture(t, { request: (_path, _body, current) => { signal = current; return reply.promise; } });
  const sending = f.drafts.send('source', f.source, 'queue', []);
  f.navigation.abort(Error('navigation cancelled'));
  const cancelled = signal.aborted;
  reply.resolve({ cwd: '/synthetic/work' }); await sending;
  assert.equal(cancelled, true);
  assert.equal(f.creates(), 0); assert.deepEqual(f.released, ['source']);
  assert.equal(f.drafts.drafts.source.requestId, 'stable-request');
  assert.equal(f.drafts.isBusy('source'), false); assert.deepEqual(f.notices, []);
});

for (const cancel of ['navigation', 'dispose']) test('leaving during source readiness releases the draft creation gate without waiting for readiness (' + cancel + ')', async t => {
  const ready = Promise.withResolvers(), f = fixture(t, { sourceReady: ready.promise });
  const starting = f.drafts.startDraft('source');
  if (cancel === 'dispose') f.drafts.dispose(); else f.navigation.abort(Error('navigation cancelled')); await turn();
  const before = { released: [...f.released], gate: f.drafts.newDraft };
  ready.resolve(); await starting;
  assert.deepEqual(before.released, ['source']); assert.equal(before.gate, null);
  assert.equal(f.creates(), 0); assert.deepEqual(f.notices, []);
});

for (const cancel of ['navigation', 'dispose']) test('leaving during target readiness releases both sessions and the first-send lock (' + cancel + ')', async t => {
  const ready = Promise.withResolvers(), f = fixture(t, { targetReady: ready.promise });
  const sending = f.drafts.send('source', f.source, 'queue', []);
  await f.created.promise; await turn();
  if (cancel === 'dispose') f.drafts.dispose(); else f.navigation.abort(Error('navigation cancelled')); await turn();
  const before = { released: [...f.released], busy: f.drafts.isBusy('source') };
  ready.resolve(); await sending;
  assert.deepEqual(before.released, ['target', 'source']); assert.equal(before.busy, false);
  assert.equal(f.drafts.drafts.source.requestId, 'stable-request'); assert.deepEqual(f.notices, []);
});

for (const stage of ['preset', 'model']) test('cancellation after the accepted ' + stage + ' write prevents later settings work', async t => {
  const entered = Promise.withResolvers(), committed = Promise.withResolvers(), abort = new AbortController(), calls = [];
  const source = { projections: { faceOf: name => face(name === 'permissions' ? undefined : name === 'agentPreset' ? 'oh-my-dsh'
    : { next: { provider: 'synthetic', model: 'local' } }) } };
  const write = async kind => { calls.push(kind); if (kind === stage) { entered.resolve(); await committed.promise; } return accepted; };
  const drafts = new ProjectlessDrafts({ sessions: { binding: () => ({ session: source }) }, remote: {
    agentPresets: { select: () => write('preset') }, session: { selectModel: () => write('model') },
  } }, { storage: storage() });
  t.after(() => drafts.dispose());
  t.mock.method(globalThis, 'fetch', async () => { throw Error('cancelled handoff reached HTTP settings'); });
  let settled = false;
  const result = drafts.copySettings('from', 'to', abort.signal).then(() => null, error => error).finally(() => { settled = true; });
  await entered.promise; abort.abort(Error('navigation cancelled')); await turn();
  assert.equal(settled, false, 'The accepted native write must settle before its owner releases it');
  committed.resolve(); assert.equal((await result)?.message, 'navigation cancelled');
  assert.deepEqual(calls, stage === 'preset' ? ['preset'] : ['preset', 'model']);
});

for (const omaa of [false, true]) test('successful handoff preserves native settings and ' + (omaa ? 'OMAA work mode' : 'remembered Ultra mode'), async t => {
  const calls = [], requests = [];
  const source = { projections: { faceOf: name => face(name === 'permissions' ? undefined : name === 'agentPreset' ? omaa ? 'omaa-test' : 'oh-my-dsh'
    : { next: { provider: 'synthetic', model: 'local', reasoningEffort: 'high' } }) } };
  const drafts = new ProjectlessDrafts({ sessions: { binding: () => ({ session: source }) }, remote: {
    agentPresets: { select: async (...args) => { calls.push(args); return accepted; } },
    session: { selectModel: async args => { calls.push(args); return accepted; } },
  } }, { storage: storage() });
  t.after(() => drafts.dispose());
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, ...options });
    const value = url.startsWith('omaa/') ? { handledWorkMode: true } : url.endsWith('=from')
      ? { selected: { provider: 'synthetic', model: 'local' }, mode: 'off', savedSubmode: 'team' } : { revision: 7 };
    return { ok: true, json: async () => value };
  });
  await drafts.copySettings('from', 'to');
  assert.deepEqual(calls, [['to', omaa ? 'omaa-test' : 'oh-my-dsh'], { sessionId: 'to', provider: 'synthetic', model: 'local', reasoningEffort: 'high' }]);
  assert.equal(requests.length, omaa ? 1 : 3);
  assert.ok(requests.every(request => request.signal === drafts.lifetime.signal));
  if (!omaa) assert.deepEqual(JSON.parse(requests[2].body), { provider: 'synthetic', model: 'local', mode: 'off', submode: 'team', expectedRevision: 7 });
});
