import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Session, buildForkSeed } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { Hub } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { contextConfig } from '../src/config.mjs';
import { recordText } from '../src/context/core.mjs';
import { adapter } from './context-fixture.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'context-fork-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sessions = new Map(), store = new HubStore(dir);
  const hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => contextConfig({ memoryScope: 'session', flushIdleMs: 0 }),
    ctx: { sessions: { get: id => sessions.get(id) } }, action() {} });
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const create = (id, seed, parent, count) => {
    const s = Session.create(id, seed, { version: 4, id, createdAt: Date.now(), cwd: dir, agentPreset: 'trisoul-x',
      isSeeded: Boolean(parent), ...(parent ? { parentSession: parent.id } : {}) }, count);
    sessions.set(id, s); const state = store.state(id); state.memoryScope = 'session'; state.origin = null;
    state.parentSession = parent?.id; store.save(state); return s;
  };
  const parent = create('parent');
  const fork = (s, id, boundary = s.seq - 1) => create(id, buildForkSeed(s.snapshotEvents(), boundary), s, boundary + 1);
  const record = (s, text = 'Exact detail 9007199254740993.', parents = []) => {
    const state = pipeline.state(s);
    const source = s.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' });
    const r = { id: randomUUID(), version: 1, kind: 'window', mode: 'brief', sessionId: s.id, project: state.binding.project, scope: state.binding.scope,
      summary: 'Read the original material.', documents: [{ title: 'Exact details', text }],
      assets: [{ id: 'fixture-asset', block: { type: 'file', attachment: { name: '原材料.txt' } }, sources: [{ sessionId: s.id, seq: source.seq, path: [0] }] }],
      sourceSeqs: [source.seq], originalSeqs: [source.seq], parents, ranges: [{ sessionId: s.id, from: source.seq, to: source.seq }], createdAt: Date.now() };
    const carrier = s.append('user/message', createUserMessage({ content: [{ type: 'text', text: recordText(r, 'brief') }], source: { kind: 'plugin:trisoul-x:context-record' } }), { surfaceOp: 'append' });
    r.carrierSeq = carrier.seq; state.records.push(r); pipeline.store.save(state); return r;
  };
  return { dir, hub, store, pipeline, parent, create, fork, record };
}

test('private fork archives survive parent changes, nested forks and store restart', t => {
  const f = fixture(t), r = f.record(f.parent), child = f.fork(f.parent, 'child');
  assert.match(f.pipeline.recall(child, { id: r.id }), /9007199254740993/);
  assert.deepEqual(f.pipeline.recallAssets(child, { id: r.id }), r.assets);
  const before = structuredClone(f.pipeline.store.state(child.id));
  r.documents[0].text = 'Parent changed after the fork.'; f.pipeline.store.save(f.pipeline.state(f.parent));
  const later = f.record(f.parent, 'Later private data.');
  assert.match(f.pipeline.recall(child, { id: r.id }), /9007199254740993/);
  assert.throws(() => f.pipeline.recall(child, { id: later.id }), /范围/);
  assert.deepEqual(f.pipeline.store.state(child.id), before, 'repeated reads do not resnapshot the parent');
  const grandchild = f.fork(child, 'grandchild');
  assert.match(f.pipeline.recall(grandchild, { id: r.id }), /9007199254740993/);
  f.pipeline.store.release(child.id);
  assert.match(f.pipeline.recall(child, { id: r.id }), /9007199254740993/);
  const unrelated = f.create('unrelated');
  assert.throws(() => f.pipeline.recall(unrelated, { id: r.id }), /范围/);
});

test('fork archives respect the exact cut and ignore record IDs in ordinary user text', t => {
  const f = fixture(t), r = f.record(f.parent), historical = f.fork(f.parent, 'historical', r.carrierSeq - 1);
  assert.throws(() => f.pipeline.recall(historical, { id: r.id }), /范围/);
  const fake = f.create('fake-parent'); f.pipeline.state(fake);
  const spoof = fake.append('user/message', createUserMessage({ content: [{ type: 'text', text: recordText(r) }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const fakeState = f.pipeline.state(fake);
  fakeState.records.push({ ...structuredClone(r), sessionId: fake.id, originalSeqs: [spoof.seq], sourceSeqs: [spoof.seq] });
  f.pipeline.store.save(fakeState);
  const forged = f.fork(fake, 'forged');
  assert.throws(() => f.pipeline.recall(forged, { id: r.id }), /范围/);
  assert.equal(f.pipeline.store.visible(historical.id).length, 0);
});

test('a failed fork snapshot write leaves inheritance retryable and the parent unchanged', t => {
  const f = fixture(t), r = f.record(f.parent), child = f.fork(f.parent, 'child');
  const parentBefore = structuredClone(f.pipeline.state(f.parent)), write = f.pipeline.store.write;
  f.pipeline.store.write = function(path, value) {
    if (value.id === child.id && value.forkArchive) throw Error('disk write failed');
    return write.call(this, path, value);
  };
  assert.throws(() => f.pipeline.state(child), /disk write failed/);
  assert.equal(f.pipeline.store.state(child.id).forkArchive, undefined);
  assert.deepEqual(f.pipeline.state(f.parent), parentBefore);
  f.pipeline.store.write = write;
  assert.match(f.pipeline.recall(child, { id: r.id }), /9007199254740993/);
});

test('forks retain historical record dependencies without publishing private archives to project peers', t => {
  const f = fixture(t), old = f.record(f.parent), full = f.record(f.parent, 'Full summary documents.', [old.id]);
  old.mergedInto = full.id; f.pipeline.store.save(f.pipeline.state(f.parent));
  const child = f.fork(f.parent, 'child'); f.pipeline.state(child);
  assert.match(f.pipeline.recall(child, { id: old.id }), /9007199254740993/);
  const childState = f.pipeline.store.state(child.id); childState.binding = { scope: 'project', project: f.dir }; f.pipeline.store.save(childState);
  const peer = f.create('project-peer'), peerState = f.pipeline.state(peer);
  peerState.binding = { scope: 'project', project: f.dir }; f.pipeline.store.save(peerState);
  assert.throws(() => f.pipeline.recall(peer, { id: old.id }), /范围/);
});
