import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts, initializeDraft } from '../src/client/projectless-state.mjs';

const defaultModel = { provider: 'native', model: 'default', reasoningEffort: 'high' };
const otherModel = { provider: 'native', model: 'other', reasoningEffort: 'max' };
function fixture(t, { blocked = false } = {}) {
  const opened = [], created = [], initialized = [], notices = [], selections = [];
  const data = new Map();
  const workspaces = { items: [{ workspaceId: 'A', path: '/A', sessionIds: ['a', 'draft-a'] },
    { workspaceId: 'B', path: '/B', sessionIds: ['b'] }], archivedSessionIds: [] };
  const rows = { a: { cwd: '/A', blank: false }, b: { cwd: '/B', blank: false },
    current: { cwd: '/chat', blank: false }, saved: { cwd: '/old-carrier', blank: true }, 'draft-a': { cwd: '/A', blank: true } };
  for (const row of Object.values(rows)) row.projectionValues = { agentPreset: 'oh-my-dsh' };
  const draftsById = { saved: { draft: 'keep unsent text', attachmentIds: ['attachment'], occurrences: [] } };
  const binding = id => ({ ctx: { id }, session: { projections: { faceOf: key => ({ getSnapshot: () =>
    key === 'agentPreset' ? rows[id]?.projectionValues.agentPreset : key === 'modelSelection' ? { next: rows[id]?.selected ?? null } : undefined }) } } });
  const conversation = { input: { for: context => ({ captureDraft: () => draftsById[context.id], notify: (...args) => notices.push(args) }),
    requestDraftInitialization: (target, options) => { initialized.push([target.ctx.id, options]); return blocked ? 'blocked' : 'preserved'; } } };
  let mint = 0, catalogGate;
  const ctx = { get: name => name === 'workspaces' ? { list: { getSnapshot: () => workspaces } } : conversation,
    remote: { session: {
      modelCatalog: async () => { await catalogGate; return { ok: true, value: { default: defaultModel, groups: [{ id: 'native', models: [{ id: 'default' }, { id: 'other' }] }], failures: [] } }; },
      selectModel: async input => { const { sessionId, ...selected } = input; selections.push(input); rows[sessionId].selected = selected; return { ok: true, value: { selected } }; },
    } }, sessions: {
      list: { getSnapshot: () => ({ ids: Object.keys(rows), byId: rows }) }, binding,
      retain: id => ({ ready: Promise.resolve(), binding: binding(id), release() {} }),
      create: async options => {
        created.push(options); const id = options.sessionId ?? `fresh-${++mint}`;
        rows[id] ??= { cwd: options.cwd ?? workspaces.items.find(w => w.workspaceId === options.workspaceId)?.path ?? '/default', blank: true, projectionValues: { agentPreset: 'oh-my-dsh' } };
        if (options.agentPreset) rows[id].projectionValues.agentPreset = options.agentPreset;
        const workspace = workspaces.items.find(w => w.workspaceId === options.workspaceId);
        if (workspace && !workspace.sessionIds.includes(id)) workspace.sessionIds.push(id);
        return id;
      },
    }, layout: { beginNavigation: () => new AbortController().signal }, uiWorkspace: { openSession: id => opened.push(id) } };
  const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
  drafts.drafts.saved = { requestId: 'keep-request', sessionId: 'unsent-target' };
  t.after(() => drafts.dispose());
  return { drafts, opened, created, initialized, notices, selections, rows, draftsById, workspaces, get minted() { return mint; }, gate: value => { catalogGate = value; } };
}

test('one global draft is reused across presets and after an admitted projectless send', async t => {
  const f = fixture(t), original = structuredClone(f.draftsById.saved);
  await f.drafts.startDraft('current');
  f.drafts.clear('saved'); // First-message transfer clears its receipt, not its seat.
  await f.drafts.startDraft('current', { agentPreset: 'cordis', prompt: 'Create a plugin', whenDraftExists: 'append' });
  assert.deepEqual(f.opened, ['saved', 'saved']); assert.equal(f.minted, 0);
  assert.equal(f.rows.saved.projectionValues.agentPreset, 'cordis');
  assert.deepEqual(f.draftsById.saved, original);
  assert.equal(f.initialized[0][0], 'saved');
});

test('each workspace owns one draft and manual preferences without copying the viewed chat', async t => {
  const f = fixture(t);
  f.drafts.rememberModel('a', otherModel);
  f.rows.a.selected = { provider: 'retired', model: 'old' };
  await f.drafts.startDraft('a', undefined, 'A');
  await f.drafts.startDraft('b', undefined, 'B');
  await f.drafts.startDraft('a', undefined, 'A');
  assert.deepEqual(f.opened, ['draft-a', 'fresh-1', 'draft-a']); assert.equal(f.minted, 1);
  assert.deepEqual(f.rows['draft-a'].selected, otherModel);
  assert.deepEqual(f.rows['fresh-1'].selected, defaultModel, 'B pins its default so later host-wide changes cannot move the draft');
  assert.deepEqual(f.drafts.preferences()['workspace:A'].model, otherModel);
  assert.deepEqual(f.drafts.preferences()['workspace:B'].model, defaultModel);
});

test('invalid remembered routes preserve the draft and preference for explicit reselection', async t => {
  const f = fixture(t), missing = { provider: 'retired', model: 'gpt-6.1-sol', reasoningEffort: 'medium' };
  f.drafts.rememberModel('current', missing);
  await f.drafts.startDraft('current');
  assert.deepEqual(f.opened, ['saved']); assert.equal(f.selections.length, 0);
  assert.match(f.notices[0][1], /retired.*gpt-6.1-sol/);
  assert.deepEqual(f.drafts.preferences().global.model, missing);
  assert.equal(f.draftsById.saved.draft, 'keep unsent text');
});

test('an in-flight catalog read cannot change a draft that started a turn', async t => {
  const f = fixture(t), pending = Promise.withResolvers();
  f.drafts.rememberModel('current', otherModel); f.gate(pending.promise);
  const opening = f.drafts.startDraft('current');
  await new Promise(setImmediate); f.rows.saved.blank = false;
  pending.resolve(); await opening;
  assert.equal(f.selections.length, 0);
});

test('a submitting draft keeps its content when initialization is blocked', async t => {
  const f = fixture(t, { blocked: true });
  await f.drafts.startDraft('current', { prompt: 'Append', whenDraftExists: 'append' });
  assert.deepEqual(f.opened, []); assert.equal(f.notices.length, 1); assert.equal(f.minted, 0);
});

test('new global chat cannot allocate another carrier while the one draft is sending', async t => {
  const f = fixture(t); f.drafts.pending.set('saved', {});
  await f.drafts.startDraft('current');
  assert.equal(f.created.length, 0); assert.equal(f.opened.length, 0);
  assert.equal(f.draftsById.saved.draft, 'keep unsent text');
  assert.match(f.notices[0][1], /正在发送/);
});

test('draft initialization delegates append, references and attachments to the native owner', () => {
  const binding = {}, options = { prompt: 'new text', whenDraftExists: 'append' };
  const conversation = { input: { requestDraftInitialization: (target, request) => {
    assert.equal(target, binding); assert.equal(request, options); return 'preserved';
  } } };
  assert.equal(initializeDraft(conversation, binding, options), 'preserved');
});
