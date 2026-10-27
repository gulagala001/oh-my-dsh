import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectlessDrafts, initializeDraft } from '../src/client/projectless-state.mjs';

const defaultModel = { provider: 'native', model: 'default', reasoningEffort: 'high' };
const otherModel = { provider: 'native', model: 'other', reasoningEffort: 'max' };
function fixture(t, { blocked = false } = {}) {
  const opened = [], created = [], initialized = [], notices = [], selections = [], allocations = [], modeSelections = [];
  const models = [{ id: 'default' }, { id: 'other' }].map(model => ({ ...model, reasoning: { efforts: ['low', 'high', 'xhigh', 'max'].map(id => ({ id })) } }));
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
    remote: { agentPresets: { select: async (id, preset) => { rows[id].projectionValues.agentPreset = preset; return { ok: true }; } }, session: {
      modelCatalog: async () => { await catalogGate; return { ok: true, value: { default: defaultModel, groups: [{ id: 'native', models }], failures: [] } }; },
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
  const drafts = new ProjectlessDrafts(ctx, { request: async (path, body) => {
    if (body) { allocations.push(body); return { cwd: '/isolated/' + body.requestId }; }
    return { managed: decodeURIComponent(path).includes('/isolated/') };
  }, modeRequest: async (id, input) => {
    if (input) {
      modeSelections.push(input);
      await ctx.remote.session.selectModel({ sessionId: id, provider: input.provider, model: input.model, reasoningEffort: input.reasoningEffort });
      rows[id].mode = input.mode; rows[id].submode = input.submode;
    }
    return { mode: rows[id].mode ?? 'off', submode: rows[id].submode ?? 'free', eligible: true, teamAvailable: false, selected: rows[id].selected, revision: selections.length };
  }, storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
  drafts.managed.set('saved', true);
  t.after(() => drafts.dispose());
  return { drafts, opened, created, initialized, notices, selections, modeSelections, models, rows, draftsById, workspaces, allocations, get minted() { return mint; }, gate: value => { catalogGate = value; } };
}

test('Ultra effort is remembered with model and workspace, survives reload and ordinary choices', async t => {
  const f = fixture(t), ultra = { mode: 'ultra', submode: 'workflow' };
  f.drafts.rememberModel('a', otherModel, ultra);
  f.drafts.rememberModel('a', { ...defaultModel, reasoningEffort: 'low' }, ultra);
  f.drafts.rememberModel('b', { ...otherModel, reasoningEffort: 'high' }, ultra);
  f.drafts.rememberModel('a', { ...otherModel, reasoningEffort: 'low' });
  const reloaded = new ProjectlessDrafts(f.drafts.ctx, { storage: f.drafts.storage });
  t.after(() => reloaded.dispose());
  assert.equal(reloaded.preferredUltraEffort('a', otherModel, f.models[1]), 'max');
  assert.equal(reloaded.preferredUltraEffort('a', defaultModel, f.models[0]), 'low');
  assert.equal(reloaded.preferredUltraEffort('b', otherModel, f.models[1]), 'high');
  assert.equal(reloaded.preferredUltraEffort('current', otherModel, f.models[1]), undefined);
  assert.equal(reloaded.preferredUltraEffort('a', otherModel, { reasoning: { efforts: [{ id: 'high' }] } }), undefined);
});

test('new drafts restore Ultra with the model and effort, while another workspace keeps its own mode', async t => {
  const f = fixture(t);
  f.drafts.rememberModel('current', otherModel, { mode: 'ultra', submode: 'workflow' });
  f.drafts.rememberModel('b', defaultModel);
  await f.drafts.startDraft('current');
  assert.equal(f.rows.saved.mode, 'ultra'); assert.equal(f.rows.saved.submode, 'workflow');
  assert.deepEqual(f.rows.saved.selected, otherModel);
  const count = f.modeSelections.length;
  await f.drafts.startDraft('current');
  assert.equal(f.modeSelections.length, count, 'reopening unchanged draft does not rewrite model/mode');
  f.rows.saved.blank = false;
  await f.drafts.startDraft('saved');
  assert.equal(f.rows[f.opened.at(-1)].mode, 'ultra');
  assert.deepEqual(f.rows[f.opened.at(-1)].selected, otherModel);
  await f.drafts.startDraft('b', undefined, 'B');
  assert.equal(f.rows[f.opened.at(-1)].mode, 'off');
  f.drafts.rememberModel('current', otherModel);
  await f.drafts.startDraft('current');
  assert.equal(f.rows[f.opened.at(-1)].mode, 'off', 'ordinary preference clears Ultra even if raw effort matches');
});

test('one global native draft is reused across presets and a started chat gets a new independent draft', async t => {
  const f = fixture(t), original = structuredClone(f.draftsById.saved);
  await f.drafts.startDraft('current');
  await f.drafts.startDraft('current', { agentPreset: 'cordis', prompt: 'Create a plugin', whenDraftExists: 'append' });
  assert.deepEqual(f.opened, ['saved', 'saved']); assert.equal(f.minted, 0);
  assert.equal(f.rows.saved.projectionValues.agentPreset, 'cordis');
  assert.deepEqual(f.draftsById.saved, original);
  assert.equal(f.initialized[0][0], 'saved');
  f.rows.saved.blank = false;
  await f.drafts.startDraft('saved');
  assert.notEqual(f.opened.at(-1), 'saved');
  assert.equal(f.allocations.length, 1);
  assert.equal(f.created.at(-1).sessionId, f.opened.at(-1));
  assert.equal(f.created.at(-1).cwd, '/isolated/' + f.opened.at(-1));
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

test('old unmanaged drafts remain intact instead of being repurposed or copied', async t => {
  const f = fixture(t), original = structuredClone(f.draftsById.saved);
  f.drafts.managed.set('saved', false);
  await f.drafts.startDraft('saved');
  assert.notEqual(f.opened.at(-1), 'saved');
  assert.deepEqual(f.draftsById.saved, original);
  assert.equal(f.allocations.length, 1);
});

test('workspace drafts keep their separate text and attachment owners when switching directories', async t => {
  const f = fixture(t);
  f.draftsById['draft-a'] = { draft: 'Directory A', attachmentIds: ['A-file'], occurrences: [] };
  await f.drafts.startDraft('a', undefined, 'A');
  await f.drafts.startDraft('draft-a', undefined, 'B');
  const b = f.opened.at(-1);
  f.draftsById[b] = { draft: 'Directory B', attachmentIds: ['B-file'], occurrences: [] };
  await f.drafts.startDraft(b, undefined, 'A');
  assert.equal(f.opened.at(-1), 'draft-a');
  await f.drafts.startDraft('draft-a', undefined, 'B');
  assert.equal(f.opened.at(-1), b);
  assert.deepEqual(f.draftsById['draft-a'], { draft: 'Directory A', attachmentIds: ['A-file'], occurrences: [] });
  assert.deepEqual(f.draftsById[b], { draft: 'Directory B', attachmentIds: ['B-file'], occurrences: [] });
});

test('adding a projectless directory to a workspace changes draft ownership without moving content', async t => {
  const f = fixture(t), original = structuredClone(f.draftsById.saved);
  f.drafts.remember('global', { draft: 'saved' });
  f.workspaces.items.push({ workspaceId: 'C', path: '/old-carrier', sessionIds: ['saved'] });
  assert.equal(f.drafts.scopeFor('saved'), 'workspace:C');
  assert.equal(f.drafts.isManaged('saved'), false);
  await f.drafts.startDraft('saved');
  assert.notEqual(f.opened.at(-1), 'saved');
  await f.drafts.startDraft(f.opened.at(-1), undefined, 'C');
  assert.equal(f.opened.at(-1), 'saved');
  assert.deepEqual(f.draftsById.saved, original);
});

test('directory inspection carries the exact Session identity and rejects another chat\'s blank carrier', async t => {
  const f = fixture(t), requests = [];
  f.drafts.managed.clear();
  f.drafts.remember('global', { draft: 'saved' });
  f.drafts.request = async (path, body) => {
    if (body) return { cwd: '/isolated/' + body.requestId };
    const query = new URLSearchParams(path.slice(1)); requests.push(query);
    assert.ok(query.get('session'));
    return { managed: query.get('session') === 'actual-directory-owner' };
  };
  await f.drafts.startDraft('saved');
  assert.notEqual(f.opened.at(-1), 'saved');
  assert.ok(requests.some(query => query.get('session') === 'saved' && query.get('cwd') === '/old-carrier'));
  assert.equal(f.draftsById.saved.draft, 'keep unsent text');
});

test('a stale workspace membership cannot reuse a blank bound to a different directory', async t => {
  const f = fixture(t);
  f.rows['draft-a'].cwd = '/B';
  await f.drafts.startDraft('a', undefined, 'A');
  assert.notEqual(f.opened.at(-1), 'draft-a');
  assert.equal(f.rows[f.opened.at(-1)].cwd, '/A');
  assert.equal(f.rows['draft-a'].cwd, '/B');
});

test('draft initialization delegates append, references and attachments to the native owner', () => {
  const binding = {}, options = { prompt: 'new text', whenDraftExists: 'append' };
  const conversation = { input: { requestDraftInitialization: (target, request) => {
    assert.equal(target, binding); assert.equal(request, options); return 'preserved';
  } } };
  assert.equal(initializeDraft(conversation, binding, options), 'preserved');
});
