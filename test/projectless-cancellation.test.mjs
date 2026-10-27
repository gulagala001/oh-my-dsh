import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts } from '../src/client/projectless-state.mjs';

for (const stage of ['allocation', 'readiness']) test('cancel during ' + stage + ' preserves the reserved native identity for retry', async t => {
  let navigation = new AbortController(), allocations = [], creates = [], opens = [], released = [];
  const entered = Promise.withResolvers(), gate = Promise.withResolvers(), data = new Map();
  let cancelled = false;
  const ctx = { get: () => undefined, sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {} }) },
    async create(options) { creates.push(options); return options.sessionId; },
    retain(id, { signal }) {
      let abort;
      const ready = stage === 'readiness' && !cancelled ? new Promise((resolve, reject) => {
        abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true });
        entered.resolve(); gate.promise.then(resolve);
      }) : Promise.resolve();
      return { ready, binding: {}, release() { signal.removeEventListener('abort', abort); released.push(id); } };
    },
  }, layout: { beginNavigation: () => navigation.signal }, uiWorkspace: { openSession: id => opens.push(id) } };
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) },
    request: async (_path, body) => { allocations.push(body); if (stage === 'allocation' && !cancelled) { entered.resolve(); await gate.promise; } return { cwd: '/isolated/' + body.requestId }; } });
  drafts.applyModelPreference = async () => {};
  t.after(() => drafts.dispose());
  const opening = drafts.startDraft(); await entered.promise;
  navigation.abort(Error('left chat')); cancelled = true; gate.resolve(); await opening;
  const reserved = drafts.preferences().global.pendingDraft;
  assert.ok(reserved); assert.deepEqual(opens, []); assert.equal(drafts.newDraft, null);
  assert.equal(creates.length, stage === 'allocation' ? 0 : 1);
  navigation = new AbortController(); await drafts.startDraft();
  assert.deepEqual(opens, [reserved]); assert.equal(allocations.length, 2);
  assert.equal(allocations[0].requestId, allocations[1].requestId);
  assert.ok(creates.every(request => request.sessionId === reserved));
  assert.equal(drafts.preferences().global.pendingDraft, undefined);
  assert.equal(released.length, stage === 'allocation' ? 1 : 2);
});
