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
    manualSessions: new Map(), async requestCompaction(_session, agent, operation) { calls.push(operation); return { queued: !agent || agent.status !== 'idle', changed: false }; },
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
test('CFR settings save and reject non-boolean values without starting model work', async () => {
  const f = setup();
  for (const enabled of [true, false]) {
    const r = await f.call('/settings', 'POST', { todoConstraintFirst: enabled });
    assert.equal(r.status, 200); assert.equal(r.data.todoConstraintFirst, enabled);
  }
  for (const value of ['true', 'false', 1, null]) await assert.rejects(f.call('/settings', 'POST', { todoConstraintFirst: value }), /布尔/);
  assert.equal(f.cfg.todoConstraintFirst, false); assert.deepEqual(f.calls, []);
});
test('document endpoint uses record ACL rather than trusting the requested ID', async () => {
  const f = setup(); await assert.rejects(f.call('/context/document?id=forbidden'), /范围/); assert.equal((await f.call('/context/document?id=allowed')).data.id, 'allowed');
});


test('idle switch and wait time persist through settings without starting a background job', async () => {
  const f = setup(); assert.equal(f.cfg.idlePreprocessEnabled, false);
  const on = await f.call('/settings', 'POST', { idlePreprocessEnabled: true, flushIdleMs: 45000 });
  assert.equal(on.status, 200); assert.equal(on.data.idlePreprocessEnabled, true); assert.equal(f.cfg.flushIdleMs, 45000);
  await f.call('/settings', 'POST', { idlePreprocessEnabled: false });
  assert.equal(f.cfg.idlePreprocessEnabled, false); assert.equal(f.cfg.flushIdleMs, 45000); assert.deepEqual(f.calls, []);
  await assert.rejects(f.call('/settings', 'POST', { idlePreprocessEnabled: 'false' }), /布尔/);
  await assert.rejects(f.call('/settings', 'POST', { flushIdleMs: -1 }), /非负/);
});

for (const [path, operation] of [['/compact-p', 'processed'], ['/compact-f', 'full']]) {
  test(path + ' shares its command operation and rejects unsupported arguments/methods', async () => {
    const f = setup(); assert.equal((await f.call(path)).status, 405);
    await assert.rejects(f.call(path, 'POST', { ids: ['x'] }), /不接受参数/);
    assert.equal((await f.call(path, 'POST', {}, { status: 'idle' })).status, 200);
    const queued = await f.call(path, 'POST', {}, { status: 'running' });
    assert.equal(queued.status, 202); assert.match(queued.data.message, /已排队/);
    assert.deepEqual(f.calls, [operation, operation]);
  });
}

test('whole-window and cost controls persist without waking sessions', async () => {
  const f = setup(); const patch = { preprocessBoundaries: false, prepareBatchWindows: 3, prepareContinueTokens: 10000, prepareInputTokens: 64000, summaryTargetChars: 900, backgroundConcurrency: 2, backgroundMaxRetries: 1 };
  const result = await f.call('/settings', 'POST', patch);
  for (const [key,value] of Object.entries(patch)) assert.equal(result.data[key], value);
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.call('/settings', 'POST', { preprocessBoundaries: 'false' }), /布尔/);
});

test('attachment endpoint checks the record scope before serving verified image or file bytes', async () => {
  const { Writable } = await import('node:stream'); const session = { id: 'private-session' }; let opened = 0;
  const items = [{ block: { type: 'image', attachment: { mediaType: 'image/png' } } }, { block: { type: 'file', attachment: { name: '原始资料.txt' } } }];
  const hub = { context: { recallAssets(s, args) { assert.equal(s, session); if (args.id !== 'allowed') throw Error('记录不属于本会话'); return items; } } };
  const store = { async readImage() { opened++; return { data: Buffer.from('image-fixture') }; }, async *readFileStream() { opened++; yield Buffer.from('exact file bytes'); } };
  const run = async (id, asset) => {
    const chunks = [], headers = {}; const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    res.setHeader = (key,value) => { headers[key] = value; };
    try { await handleContextApi({ hub, ctx: { get: () => store }, req: { method: 'GET' }, res, session, id: session.id,
      url: new URL(`http://localhost/trisoul-x/api/context/asset?id=${id}&asset=${asset}`), send() { throw Error('unexpected JSON response'); } });
      return { headers, bytes: Buffer.concat(chunks).toString() };
    } finally { res.destroy(); }
  };
  await assert.rejects(run('forbidden', 1), /不属于/); assert.equal(opened, 0);
  const image = await run('allowed', 1); assert.equal(image.bytes, 'image-fixture'); assert.equal(image.headers['Content-Type'], 'image/png');
  const file = await run('allowed', 2); assert.equal(file.bytes, 'exact file bytes'); assert.match(file.headers['Content-Disposition'], /attachment;/);
  assert.equal(file.headers['X-Content-Type-Options'], 'nosniff');
});
