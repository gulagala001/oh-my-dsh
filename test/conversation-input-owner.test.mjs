import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const { Context } = require('@deepseek-ai/cordis');
const source = await readFile(new URL('../vendor/dsh/ui-conversation/src/client/input/hub.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
const module = { exports: {} };
// The editor is synthetic; the production hub and pinned Cordis own every
// listener, dependency injection, draft handoff and teardown in this check.
class Shell {
  draft = ''; attachmentIds = []; disposed = 0; refreshed = 0;
  setDraft(value) { this.draft = value; }
  restoreDraft(value) { this.draft = value.draft; this.attachmentIds = [...value.attachmentIds]; }
  captureDraft() { return { draft: this.draft, attachmentIds: [...this.attachmentIds] }; }
  refreshLexiconSubscription() { this.refreshed++; }
  consumeToken() { if (!this.draft) return; this.draft = ''; return true; }
  dispose() { this.disposed++; return this.attachmentIds; }
}
runInNewContext(code, { module, exports: module.exports, require: name => {
  if (name === './facade.ts') return { SessionInputShell: Shell };
  if (name === '../stores.ts') return { readConversationDraft: () => '' };
  if (name === './submission-analytics.ts') return { reportMessageSubmission() {} };
  throw Error(name);
} });
const { InputHub } = module.exports;

async function fixture(t) {
  const root = new Context(), released = [], bindings = new Map();
  root.provide('sessions', { binding: id => bindings.get(id), subagentAddress: () => undefined,
    list: { getSnapshot: () => ({ byId: {} }) } });
  root.provide('conversation', { releaseDraftAttachment: id => released.push(id) });
  const unprovideTriggers = root.provide('inputTriggers', {});
  t.after(() => root.fiber.dispose());
  const session = { sessionId: 'one', getSnapshot: () => ({ removed: false }),
    projections: { faceOf: () => ({ getSnapshot: () => undefined }) } };
  const mountSession = async () => {
    const fiber = root.plugin(() => {}); await fiber;
    const binding = { sessionId: 'one', session, ctx: fiber.ctx };
    bindings.set('one', binding);
    return { binding, fiber };
  };
  const mountOwner = async () => {
    let hub;
    const fiber = root.plugin(ctx => { hub = new InputHub(ctx, () => ''); }); await fiber;
    return { hub, fiber };
  };
  return { root, released, mountSession, mountOwner, unprovideTriggers };
}

test('Conversation unload releases a retained session shell and cannot consume the next owner draft', async t => {
  const f = await fixture(t), s = await f.mountSession(), old = await f.mountOwner();
  const shell = old.hub.shellFor(s.binding); shell.draft = '/model'; shell.attachmentIds = ['old'];
  await old.fiber.dispose();
  assert.equal(shell.disposed, 1); assert.deepEqual(f.released, ['old']);
  assert.notEqual(s.fiber.uid, null, 'native session stays retained');
  assert.throws(() => old.hub.shellFor(s.binding), /owner disposed/);
  const next = await f.mountOwner(), visible = next.hub.shellFor(s.binding); visible.draft = '/model';
  assert.equal(s.binding.ctx.bail(s.binding.ctx, 'slash/input-consume-token', {}), true);
  assert.equal(visible.draft, ''); assert.equal(shell.draft, '/model');
  const refreshed = shell.refreshed;
  f.unprovideTriggers(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(shell.refreshed, refreshed, 'old catalog injection is already gone');
  await s.fiber.dispose(); await next.fiber.dispose(); await old.fiber.dispose();
  assert.equal(shell.disposed, 1); assert.equal(visible.disposed, 1);
  assert.deepEqual(f.released, ['old']);
});

test('session navigation transfers unsent drafts and attachment ownership until Conversation teardown', async t => {
  const f = await fixture(t), owner = await f.mountOwner(), first = await f.mountSession();
  const shell = owner.hub.shellFor(first.binding); shell.draft = 'unsent'; shell.attachmentIds = ['kept'];
  await first.fiber.dispose();
  assert.deepEqual(f.released, []); assert.equal(shell.disposed, 1);
  const next = await f.mountSession(), restored = owner.hub.shellFor(next.binding);
  assert.equal(restored.draft, 'unsent'); assert.deepEqual(restored.attachmentIds, ['kept']);
  await next.fiber.dispose(); await owner.fiber.dispose();
  assert.deepEqual(f.released, ['kept']); assert.equal(restored.disposed, 1);
});
