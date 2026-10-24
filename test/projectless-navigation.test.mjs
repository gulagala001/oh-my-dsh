import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts, initializeDraft } from '../src/client/projectless-state.mjs';

function fixture(t, { existing = true, requested = 'oh-my-dsh', blocked = false } = {}) {
  const opened = [], created = [], initialized = [], copied = [], notices = [];
  const rows = { current: { cwd: '/synthetic/current', blank: false, projectionValues: { agentPreset: 'oh-my-dsh' } },
    saved: { cwd: '/synthetic/carrier', blank: true, projectionValues: { agentPreset: requested } } };
  const binding = id => ({ ctx: { id }, session: { projections: { faceOf: () => ({ getSnapshot: () => rows[id]?.projectionValues.agentPreset }) } } });
  const conversation = { input: { for: () => ({ notify: (...args) => notices.push(args) }),
    requestDraftInitialization: (target, options) => { initialized.push([target.ctx.id, options]); return blocked ? 'blocked' : 'applied'; } } };
  const ctx = { get: () => conversation, sessions: {
    list: { getSnapshot: () => ({ ids: Object.keys(rows), byId: rows }) }, binding,
    retain: id => ({ ready: Promise.resolve(), binding: binding(id), release() {} }),
    create: async options => { created.push(options); rows.fresh = { cwd: options.cwd, blank: true, projectionValues: { agentPreset: options.agentPreset } }; return 'fresh'; },
  }, layout: { beginNavigation: () => new AbortController().signal }, uiWorkspace: { openSession: id => opened.push(id) } };
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: () => null, setItem() {} } });
  if (existing) drafts.drafts.saved = { requestId: 'keep-request', sessionId: 'unsent-target' };
  drafts.copySettings = async (...args) => copied.push(args);
  t.after(() => drafts.dispose());
  return { drafts, opened, created, initialized, copied, notices };
}

test('New Session returns to the saved projectless draft without replacing its settings', async t => {
  const f = fixture(t);
  await f.drafts.startDraft('current');
  assert.deepEqual(f.opened, ['saved']); assert.equal(f.created.length, 0); assert.equal(f.copied.length, 0);
  assert.equal(f.drafts.drafts.saved.requestId, 'keep-request');
});

test('the native Creator action appends to its own preset draft', async t => {
  const f = fixture(t, { requested: 'cordis' });
  const options = { agentPreset: 'cordis', prompt: 'Create a plugin', whenDraftExists: 'append' };
  await f.drafts.startDraft('current', options);
  assert.deepEqual(f.opened, ['saved']); assert.deepEqual(f.initialized, [['saved', options]]);
  assert.equal(f.created.length, 0); assert.equal(f.copied.length, 0);
});

test('a new projectless Creator draft uses the explicitly requested preset', async t => {
  const f = fixture(t, { existing: false });
  await f.drafts.startDraft('current', { agentPreset: 'cordis', prompt: 'Create a plugin', whenDraftExists: 'append' });
  assert.equal(f.created[0].agentPreset, 'cordis'); assert.equal(f.copied[0][3], 'cordis');
  assert.deepEqual(f.opened, ['fresh']);
});

test('a submitting draft keeps its navigation and content when initialization is blocked', async t => {
  const f = fixture(t, { blocked: true });
  await f.drafts.startDraft('current', { prompt: 'Append', whenDraftExists: 'append' });
  assert.deepEqual(f.opened, []); assert.equal(f.notices.length, 1); assert.equal(f.created.length, 0);
});

test('draft initialization delegates append, references and attachments to the native owner', () => {
  const binding = {}, options = { prompt: 'new text', whenDraftExists: 'append' };
  const conversation = { input: { requestDraftInitialization: (target, request) => {
    assert.equal(target, binding); assert.equal(request, options); return 'preserved';
  } } };
  assert.equal(initializeDraft(conversation, binding, options), 'preserved');
});
