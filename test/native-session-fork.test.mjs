import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { HubStore } from '../src/hub-store.mjs';
import { forkParentOf, installForkProvenance } from '../src/host/session-fork.mjs';
import { forkArchiveSnapshot } from '../src/context/fork.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { Context } = await import(host.resolve('@deepseek-ai/cordis'));
const { SessionStore } = await import(host.resolve('@deepseek-ai/dsh-session'));
const { SessionQueryEngine } = await import(host.resolve('@deepseek-ai/dsh-session-query'));

test('native independent forks retain only verified OMD archive lineage across concurrent calls and restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-fork-'));
  const ctx = new Context(), store = new HubStore(directory);
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  await ctx.plugin(SessionStore);
  const a = ctx.sessions.create('parent-a', { meta: { cwd: directory } });
  const b = ctx.sessions.create('parent-b', { meta: { cwd: directory } });
  for (const session of [a, b]) session.append('user/message', {
    id: 'message-' + session.id, role: 'user', source: { kind: 'plugin:oh-my-dsh:context-record' },
    content: [{ type: 'text', text: `[Context record archive-${session.id} · earlier text]` }],
  }, { surfaceOp: 'append' });
  ctx.provide('sessionPersistence', {});
  new SessionQueryEngine(ctx);
  let serial = 0;
  const nativeFork = async ({ sessionId }) => {
    await new Promise(resolve => setImmediate(resolve));
    // Native creation and announcement are real; only the public controller's
    // request routing is supplied by this fixture.
    const child = ctx.sessions.fork(sessionId, undefined, 'child-' + ++serial);
    return { sessionId: child.id };
  };
  const controller = { fork: nativeFork };
  ctx.provide('sessionController', controller);
  const scope = ctx.plugin({ apply: child => installForkProvenance(child, store) });
  await scope;
  const results = await Promise.all([ctx.sessionController.fork({ sessionId: a.id }), ctx.sessionController.fork({ sessionId: b.id })]);
  for (let i = 0; i < results.length; i++) {
    const child = ctx.sessions.get(results[i].sessionId), parent = [a, b][i];
    assert.equal(child.header.parentSession, undefined, 'native independence remains unchanged');
    const reopened = new HubStore(directory);
    assert.equal(forkParentOf(child.header, reopened), parent.id);
    const archive = { id: 'archive-' + parent.id, originalSeqs: [0], text: 'saved original' };
    const snapshot = forkArchiveSnapshot(child, {}, { peek: id => id === parent.id ? { records: [archive] } : undefined }, () => undefined, forkParentOf(child.header, reopened));
    assert.equal(snapshot.inheritedRecords[0].id, archive.id);
    assert.equal(snapshot.forkArchive.inheritedEventCount, child.inheritedEventCount);
  }
  const unrelated = ctx.sessions.fork(a.id, undefined, 'unrelated');
  assert.equal(forkParentOf(unrelated.header, store), undefined, 'do not infer ancestry outside a confirmed controller call');
  assert.equal(forkParentOf({ id: results[0].sessionId, isSeeded: true, origin: 'subagent' }, store), undefined);
  await scope.dispose();
  assert.equal(controller.fork, nativeFork);
});
