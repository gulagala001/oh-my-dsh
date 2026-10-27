import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts } from '../src/client/projectless-state.mjs';

test('a disposed projectless owner does not resolve services', async () => {
  const ctx = new Proxy({}, { get() { throw Error('inactive context'); } });
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: () => JSON.stringify({ draft: { requestId: 'request', sessionId: 'target' } }) } });
  drafts.managed.set('managed', true);
  drafts.dispose();
  assert.equal(drafts.current(), undefined);
  assert.equal(drafts.isManaged('managed'), false);
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
