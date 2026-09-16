import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContextApi } from '../src/context/api.mjs';
import { contextConfig } from '../src/context/pipeline.mjs';

function setup() {
  const cfg = contextConfig({ memoryScope: 'project' });
  const legacy = { started: false, memoryScope: 'session' };
  const state = { binding: { scope: 'session', project: '/p' }, review: {} };
  const calls = [];
  const session = { id: 's', snapshotEvents: () => [] };
  const hub = { config: () => cfg, store: { state: () => legacy, save() {}, memories() { calls.push('legacy-read'); return []; } }, context: {
    state: () => state, view: () => ({ ok: true }), store: { visible: () => [], get(sid, id) { if (id !== 'allowed') throw Error('范围'); return { id }; }, global: () => ({ text: 'manual', revision: 1 }), setGlobal(text, revision) { calls.push('user-save'); if (revision !== 1) throw Error('已被其他窗口更新'); return { text, revision: 2 }; } },
    queueManual: () => ({ queued: true, changed: false }), applyReady: async () => { calls.push('apply-only'); return null; },
    prepare: async () => { calls.push('prepare'); }, coordinate: async () => { calls.push('coordinate'); }, reconfigure() {},
  } };
  const ctx = { settings: { async update(_ns, patch) { Object.assign(cfg, patch); } } };
  async function call(path, method = 'GET', body = {}, agent) {
    let response;
    const handled = await handleContextApi({ hub, ctx, req: { method }, res: {}, url: new URL('http://localhost/trisoul-x/api' + path), session, id: session.id, agent,
      send(_res, status, data) { response = { status, data }; }, readBody: async () => body });
    return { handled, ...response };
  }
  return { cfg, calls, state, legacy, call };
}
test('private scope does not enumerate historical automatic memories', async () => {
  const f = setup(); const r = await f.call('/memories'); assert.deepEqual(r.data.items, []); assert.equal(f.calls.length, 0);
});
test('retired automatic memory writes and curation return explicit 410', async () => {
  const f = setup(); assert.equal((await f.call('/memories', 'POST', {})).status, 410); assert.equal((await f.call('/curate', 'POST')).status, 410); assert.equal(f.calls.length, 0);
});
test('manual apply while running queues a boundary operation without starting AI', async () => {
  const f = setup(); const r = await f.call('/compact', 'POST', {}, { status: 'running' }); assert.equal(r.status, 202); assert.equal(r.data.queued, true); assert.equal(f.calls.length, 0);
});
test('manual apply when idle uses maintenance and no generation', async () => {
  const f = setup(); let maintenance = false;
  const r = await f.call('/compact', 'POST', {}, { status: 'idle', runMaintenance: async fn => { maintenance = true; return fn(); } });
  assert.ok(maintenance); assert.equal(r.data.changed, false); assert.deepEqual(f.calls, ['apply-only']);
});
test('user scope cannot be widened after session starts', async () => {
  const f = setup(); f.legacy.started = true; assert.equal((await f.call('/scope', 'POST', { scope: 'project' })).status, 409);
  assert.equal(f.legacy.memoryScope, 'session');
});
test('manual global editor detects concurrent writes', async () => {
  const f = setup(); assert.equal((await f.call('/context/global', 'POST', { text: 'mine', revision: 0 })).status, 409);
  assert.equal((await f.call('/context/global', 'POST', { text: 'mine', revision: 1 })).data.revision, 2);
});
test('new settings validate values and reject obsolete probe switches', async () => {
  const f = setup(); await assert.rejects(f.call('/settings', 'POST', { probeEnabled: true }), /退出现行/);
  await assert.rejects(f.call('/settings', 'POST', { digestWindow: 0 }));
  const r = await f.call('/settings', 'POST', { digestWindow: 64, traceEnabled: false }); assert.equal(r.data.digestWindow, 64); assert.equal(r.data.traceEnabled, false);
});
test('document endpoint uses record ACL rather than trusting the requested ID', async () => {
  const f = setup(); await assert.rejects(f.call('/context/document?id=forbidden'), /范围/); assert.equal((await f.call('/context/document?id=allowed')).data.id, 'allowed');
});
