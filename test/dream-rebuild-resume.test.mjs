import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';
import { nodeKey } from '../src/dream/core.mjs';

for (const kind of ['project', 'global']) for (const recovery of ['resume', 'new job'])
test(`${kind} rebuild restores every source after SQLite reopen and ${recovery}`, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dream-rebuild-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let store = new DreamStore(directory), service;
  t.after(() => { if (!store.closed) store.close(); });
  const route = { provider: 'fixture', model: 'fixture' };
  const epoch = store.acquire(), children = [];
  const target = kind === 'project' ? '/fixture' : 'global', key = nodeKey(kind, target);
  for (let index = 1; index <= 26; index++) {
    const id = String(index).padStart(2, '0'), sessionId = 'session-' + id;
    const project = kind === 'project' ? target : '/project-' + id;
    store.saveSession({ id: sessionId, project, shared: true, title: sessionId });
    store.setMeta('scan:' + sessionId, 'unchanged');
    const memory = store.publish({ kind: 'session', target: sessionId, summary: 'keep-' + id, epoch });
    const child = kind === 'project' ? memory : store.publish({ kind: 'project', target: project,
      summary: memory.summary, sources: [{ id: memory.ref, kind: 'memory', key: memory.key, revision: memory.revision }],
      consumed: [{ key: memory.key, fingerprint: String(memory.revision) }], epoch });
    children.push(child);
  }
  store.publish({ kind, target, summary: children.map(child => child.summary).join(' '),
    sources: children.map(child => ({ id: child.ref, kind: 'memory', key: child.key, revision: child.revision })),
    consumed: children.map(child => ({ key: child.key, fingerprint: String(child.revision) })), epoch });
  store.release(epoch);
  store.saveSession({ ...store.session('session-26'), shared: false });
  assert.equal(store.memory(key).invalid, true);
  const calls = [];
  let fail = true;
  const create = () => new DreamService({ config: () => ({ backgroundMaxRetries: 0, dreamDailyTokens: 10000000 }),
    context: { adapter: { message: text => ({ role: 'user', content: text }) } }, ctx: {} }, {
    store, sources: { sync: async () => {}, stamp: () => 'unchanged', projectTitle: id => id, close() {} },
    generate: async input => {
      calls.push(input);
      if (fail && calls.length === 2) throw new Error('second batch interrupted');
      const material = [input.previous?.text ?? '', ...input.sources.map(source => source.text)].join('\n');
      return { summary: [...new Set(material.match(/\bkeep-\d+\b/g) ?? [])].join(' '), references: input.sources.map(source => source.id) };
    },
  });
  service = create();
  const job = store.enqueue(kind, target, false, { route });
  await service.drain();
  assert.equal(store.job(job.id).state, 'failed');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(store.memory(key).summary, /keep-25/);
  assert.equal(store.consumed(key, children[24].key), undefined, 'old coverage cannot survive replacement of its body');
  await service.close();
  store = new DreamStore(directory); service = create(); fail = false;
  if (recovery === 'resume') service.resume(job.id);
  else store.enqueue(kind, target, false, { route });
  await service.drain();
  const memory = store.memory(key);
  assert.equal(Boolean(memory.invalid), false);
  for (let index = 1; index <= 25; index++) assert.match(memory.summary, new RegExp('keep-' + String(index).padStart(2, '0') + '\\b'));
  assert.doesNotMatch(memory.summary, /keep-26/);
  const completed = store.jobs().find(value => value.state === 'complete');
  assert.ok(completed);
  const before = calls.length;
  store.enqueue(kind, target, false, { route }); await service.drain();
  assert.equal(calls.length, before, 'a new job skips only the rebuilt sources');
  await service.close();
});
