import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts } from '../src/client/projectless-state.mjs';

test('retained composer hooks do not resolve services from a disposed plugin', async () => {
  const ctx = new Proxy({}, { get() { throw Error('inactive context'); } });
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: () => JSON.stringify({ draft: { requestId: 'request', sessionId: 'target' } }) } });
  drafts.managed.set('managed', true);
  drafts.pending.set('draft', {});
  drafts.dispose();
  assert.equal(drafts.current(), undefined);
  assert.equal(drafts.isDraft('draft'), false);
  assert.equal(drafts.isManaged('managed'), false);
  assert.equal(drafts.isBusy('draft'), false);
  assert.equal(drafts.installSubmit('draft'), undefined);
  assert.equal(await drafts.inspect('draft'), false);
});

test('a late discovery reply cannot revive a disposed draft owner', async () => {
  let resolve;
  const ctx = { sessions: { list: { getSnapshot: () => ({ byId: { draft: { cwd: '/synthetic' } } }) } } };
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: () => null }, request: () => new Promise(done => { resolve = done; }) });
  const pending = drafts.inspect('draft');
  drafts.dispose();
  resolve({ managed: true });
  assert.equal(await pending, false);
  assert.equal(drafts.managed.size, 0);
  assert.equal(drafts.getSnapshot(), 0);
});

test('live input hooks still delegate native submission and clean up', () => {
  let submissions = 0;
  const original = function () { assert.equal(this, shell); submissions++; };
  const shell = { submit: original };
  const ctx = { get: () => ({ input: { for: () => shell } }), sessions: { binding: () => ({ ctx: {} }) } };
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: () => null } });
  const cleanup = drafts.installSubmit('ordinary');
  shell.submit();
  drafts.dispose();
  shell.submit();
  cleanup();
  assert.equal(submissions, 2);
  assert.equal(shell.submit, original);
});
