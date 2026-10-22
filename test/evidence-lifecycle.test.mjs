import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Session } from '@deepseek-ai/dsh-session';
import { createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { EvidenceStore } from '../src/result-reduction/evidence.mjs';
import { ResultReduction } from '../src/result-reduction/service.mjs';
import { handleContextApi } from '../src/context/api.mjs';
import { readJsonBody, sendJson } from '../src/http.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EvidenceStore(directory), session = Session.create('evidence-owner');
  const text = '原始工具结果，恢复后必须仍可完整读取。\n'.repeat(40);
  const saved = await store.save({ sessionId: session.id, callId: 'read-source', tool: 'read', args: {}, text, rule: 'read-baseline' });
  const content = [{ type: 'text', text }];
  const prepared = await store.prepare(saved.ref, content);
  session.append('tool/call', { callId: saved.callId, name: saved.tool, arguments: '{}' });
  const event = session.append('tool/result', { message: createToolResultMessage({ callId: saved.callId, content, isError: false }) }, { surfaceOp: 'append' });
  await store.commit(saved.ref, event);
  const bundle = await store.export(session);
  const restored = id => ({ id, snapshotEvents: () => session.snapshotEvents() });
  return { directory, store, session, text, saved, prepared, bundle, restored, event };
}

test('parallel archives publish one complete shared object, including after reopening', async t => {
  const f = await fixture(t), text = 'content-addressed shared original\n'.repeat(130000);
  const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => f.store.save({ sessionId: 'parallel-' + i,
    callId: 'same-read', tool: 'read', args: {}, text })));
  assert.equal(results.every(result => result.status === 'fulfilled'), true, 'all concurrent originals must be saved');
  const records = results.map(result => result.value);
  assert.equal(new Set(records.map(record => record.ref)).size, 4);
  assert.equal(new Set(records.map(record => record.sourceHash)).size, 1);
  const reopened = new EvidenceStore(f.directory);
  for (const record of records) assert.equal(await reopened.text(await reopened.meta(record.ref)), text);
});

test('concurrent restoration preserves every verified owner in memory and after reopening', async t => {
  const f = await fixture(t), owners = [f.restored('restored-a'), f.restored('restored-b')];
  assert.deepEqual(await Promise.all([...owners.map(owner => f.store.import(f.bundle, owner)), f.store.commit(f.saved.ref, f.event)]), [{ imported: 1 }, { imported: 1 }, true]);
  for (const store of [f.store, new EvidenceStore(f.directory)]) for (const owner of owners) {
    assert.equal((await store.read(owner, { rawRef: f.saved.ref })).text, f.text);
    assert.equal((await store.list(owner)).length, 1);
  }
  await assert.rejects(f.store.read({ id: 'unrelated', snapshotEvents: () => [] }, { rawRef: f.saved.ref }), /无权/);
});

test('an interrupted removal leaves a harmless owner index entry, while corrupt records still fail', async t => {
  const f = await fixture(t);
  const abandoned = await f.store.save({ sessionId: f.session.id, callId: 'cancelled-read', tool: 'read', args: {}, text: 'cancelled source' });
  // The process ended after removing metadata but before removing its owner marker.
  const path = join(f.store.dir, f.store.id(abandoned.ref) + '.json');
  await unlink(path);
  const reopened = new EvidenceStore(f.directory);
  assert.deepEqual((await reopened.list(f.session)).map(record => record.ref), [f.saved.ref]);
  assert.equal((await reopened.search(f.session, { query: '恢复' })).matchedRecords, 1);
  assert.equal((await reopened.export(f.session)).records.length, 1);
  await writeFile(path, '{broken JSON');
  await assert.rejects(reopened.list(f.session), SyntaxError);
});

test('verified import finishes an interrupted preparation without replacing its provenance', async t => {
  const f = await fixture(t), directory = join(f.directory, 'restored'), store = new EvidenceStore(directory);
  const path = join(store.dir, store.id(f.saved.ref) + '.json');
  await store.atomic(path, { ...f.prepared, preparedHash: '0'.repeat(64) });
  await store.indexOwner(f.prepared);
  const owner = f.restored('restored-owner');
  await assert.rejects(store.import(f.bundle, owner), /冲突/);
  await store.atomic(path, f.prepared); store.cache.clear();
  await store.indexOwner(f.prepared);
  await store.import(f.bundle, owner);
  assert.equal((await new EvidenceStore(directory).read(owner, { rawRef: f.saved.ref })).text, f.text);
  const conflicting = structuredClone(f.bundle); conflicting.records[0].argumentsHash = '0'.repeat(64);
  await assert.rejects(store.import(conflicting, owner), /不匹配|冲突/);
});

test('a failed metadata write does not block later restoration or grant an uncommitted owner', async t => {
  const f = await fixture(t), store = f.store;
  const first = f.restored('restored-first'), second = f.restored('restored-second');
  const atomic = store.atomic.bind(store); let writes = 0;
  store.atomic = async (...args) => { if (++writes === 1) throw Object.assign(Error('injected write failure'), { code: 'ENOSPC' }); return atomic(...args); };
  const results = await Promise.allSettled([store.import(f.bundle, first), store.import(f.bundle, second)]);
  const failed = results.filter(result => result.status === 'rejected');
  assert.equal(failed.length, 1); assert.equal(failed[0].reason.code, 'ENOSPC');
  const owner = [first, second][results.findIndex(result => result.status === 'rejected')];
  await assert.rejects(store.read(owner, { rawRef: f.saved.ref }), /无权/);
  assert.equal((await store.list(owner)).length, 0, 'an early owner marker does not grant access');
  await store.import(f.bundle, owner);
  const reopened = new EvidenceStore(f.directory);
  for (const owner of [first, second]) assert.equal((await reopened.read(owner, { rawRef: f.saved.ref })).text, f.text);
});

test('accepted HTTP imports finish after disconnect and before disposal; cold reads retain their proof', async t => {
  const f = await fixture(t), started = Promise.withResolvers(), finish = Promise.withResolvers();
  const service = new ResultReduction({}, { store: { dir: f.directory } }, () => true);
  const owner = f.restored('restored-http'), atomic = service.evidence.atomic.bind(service.evidence);
  let writes = 0, disposed = false, accepted;
  service.evidence.atomic = async (...args) => { writes++; started.resolve(); await finish.promise; return atomic(...args); };
  const server = createServer((req, res) => {
    const operation = handleContextApi({ hub: { optimization: service }, req, res, id: owner.id,
      inspection: { meta: { ...f.session.header, id: owner.id }, events: f.session.snapshotEvents() },
      url: new URL(req.url, 'http://localhost'), readBody: readJsonBody, send: sendJson,
    }).catch(error => sendJson(res, 400, { error: error.message }));
    if (req.method === 'POST' && !accepted) accepted = operation;
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/oh-my-dsh/api/context/evidence`, controller = new AbortController();
  const importing = fetch(url + '/import', { method: 'POST', body: JSON.stringify(f.bundle), signal: controller.signal }).catch(error => error);
  try {
    await started.promise;
    controller.abort(); await importing;
    service.release();
    const disposing = service.settled().then(() => { disposed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(disposed, false, 'runtime teardown must retain ownership of accepted writes');
    finish.resolve(); await Promise.all([accepted, disposing]);
    assert.equal((await new EvidenceStore(f.directory).read(owner, { rawRef: f.saved.ref })).text, f.text);
    const read = await fetch(url + '?rawRef=' + f.saved.ref);
    assert.equal(read.status, 200); assert.equal((await read.json()).text, f.text);
    const late = await fetch(url + '/import', { method: 'POST', body: JSON.stringify(f.bundle) });
    assert.equal(late.status, 400); assert.match((await late.json()).error, /已停止/);
    assert.equal(writes, 1);
  } finally { finish.resolve(); controller.abort(); await importing; await accepted; }
});
