import test from 'node:test';
import assert from 'node:assert/strict';
import { apiSessionTarget } from '../src/api-session.mjs';
import { handleContextApi } from '../src/context/api.mjs';

class NativeNotFound extends Error {}
function fixture({ live, stored, inspection, failure } = {}) {
  const calls = [];
  const controller = { async inspect(id, signal) { calls.push({ id, signal }); if (failure) throw failure; return inspection; } };
  const ctx = { agents: { get: () => undefined }, sessions: { get: () => live }, get: () => controller,
    loader: { entries: () => [{ options: { name: '@deepseek-ai/dsh-api-session-controller' },
      parent: { tree: { async import(name) { assert.equal(name, '@deepseek-ai/dsh-api-session-controller'); return { ApiSessionNotFound: NativeNotFound }; } } } }] } };
  const store = { peek: () => stored, state() { throw Error('Read must not create state'); } };
  return { ctx, store, calls };
}

test('cold native inspection preserves metadata, caller cancellation and store independence', async () => {
  const inspection = { meta: { id: 'cold', cwd: '/original-project', agentPreset: 'standard' }, events: [] };
  const f = fixture({ inspection }), owner = new AbortController();
  const result = await apiSessionTarget(f.ctx, f.store, 'cold', owner.signal);
  assert.equal(result.found, true); assert.equal(result.session, undefined); assert.equal(result.agent, undefined);
  assert.equal(result.stored, undefined); assert.equal(result.inspection, inspection);
  assert.deepEqual(f.calls, [{ id: 'cold', signal: owner.signal }]);
});

test('attached sessions retain native objects and require no second inspection', async () => {
  const live = { id: 'live', header: { cwd: '/original' } }, f = fixture({ live });
  assert.equal((await apiSessionTarget(f.ctx, f.store, 'live')).session, live);
  assert.deepEqual(f.calls, []);
});

test('only the actual public native not-found class permits a missing response', async () => {
  const f = fixture({ failure: new NativeNotFound('missing') });
  assert.equal((await apiSessionTarget(f.ctx, f.store, 'missing')).found, false);
  const archived = fixture({ stored: { id: 'missing' }, failure: new NativeNotFound('missing') });
  assert.equal((await apiSessionTarget(archived.ctx, archived.store, 'missing')).archivedOnly, true);
  for (const error of [Object.assign(Error('cannot read'), { code: 'EACCES' }), Error('corrupted prefix'), Error('session missing')]) {
    const other = fixture({ failure: error });
    await assert.rejects(apiSessionTarget(other.ctx, other.store, 'cold'), actual => actual === error);
  }
});

test('mismatched metadata and cancelled reads cannot become successful cold sessions', async () => {
  const f = fixture({ inspection: { meta: { id: 'other' }, events: [] } });
  await assert.rejects(apiSessionTarget(f.ctx, f.store, 'cold'), /身份/);
  const aborted = new AbortController(); aborted.abort(Error('caller stopped'));
  await assert.rejects(apiSessionTarget(f.ctx, f.store, 'cold', aborted.signal), /caller stopped/);
  assert.equal(f.calls.length, 1);
});

test('scope reads do not create either ledger, and cold human input fences widening', async () => {
  let state, created = 0, saves = 0;
  const store = { peek: () => state, state(id) { created++; return state = { id }; }, save() { saves++; } };
  const hub = { config: () => ({ memoryScope: 'global' }), store,
    context: { store: { peek: () => undefined, state() { throw Error('No new ContextPipeline state during a scope read'); } } } };
  const call = async (method, events = [], archivedOnly = false) => {
    let result;
    await handleContextApi({ hub, ctx: {}, req: { method }, res: {}, id: 'cold',
      inspection: { meta: { id: 'cold' }, events }, archivedOnly,
      url: new URL('http://localhost/trisoul-x/api/scope'),
      send(_res, status, data) { result = { status, data }; }, readBody: async () => ({ scope: 'project' }) });
    return result;
  };
  assert.deepEqual((await call('GET')).data, { scope: 'global', locked: false, default: 'global' });
  assert.equal(created, 0); assert.equal(saves, 0);
  const human = [{ type: 'user/message', data: { source: { kind: 'user' }, content: [] } }];
  assert.equal((await call('POST', human)).status, 409);
  assert.equal((await call('POST', [], true)).status, 409);
  assert.equal(created, 0); assert.equal(saves, 0);
  assert.equal((await call('POST')).status, 200);
  assert.equal(created, 1); assert.equal(saves, 1); assert.equal(state.memoryScope, 'project');
});

test('a first human input admitted while the scope body is read prevents the later write', async () => {
  const events = [], writes = [];
  const session = { id: 'live', snapshotEvents: () => events };
  const hub = { config: () => ({ memoryScope: 'session' }),
    store: { peek: () => undefined, state() { throw Error('Started session must not gain a new scope state'); }, save: value => writes.push(value) },
    context: { store: { peek: () => undefined } } };
  let response;
  await handleContextApi({ hub, ctx: {}, req: { method: 'POST' }, res: {}, session, id: session.id,
    url: new URL('http://localhost/trisoul-x/api/scope'),
    async readBody() { events.push({ type: 'user/message', data: { source: { kind: 'user' } } }); return { scope: 'global' }; },
    send(_res, status, data) { response = { status, data }; } });
  assert.equal(response.status, 409); assert.deepEqual(writes, []);
});
