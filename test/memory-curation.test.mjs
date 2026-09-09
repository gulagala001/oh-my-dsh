import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Hub, MEMORY_CURATE } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { MemoryContext } from '../src/memory-context.mjs';
import { StateZone } from '../src/state-zone.mjs';
import { Config } from '../src/config.mjs';

const reply = (name, args) => ({ blocks: [{ type: 'tool-call', name, arguments: JSON.stringify(args) }] });
const batch = (signals, ops = []) => reply('save_context', { digest: 'Recorded facts.', workdoc: '', phaseClosed: false, compactable: true, nowCompactable: [], ops, signals });
function setup(t, mode = 'full') {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-curation-')), store = new HubStore(dir), config = Config({ curateMinGapMs: 0, injectMaxPerSession: 0 });
  const session = Session.create('curation', undefined, { version: 3, id: 'curation', createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  const state = store.state(session.id); state.memoryScope = mode; store.save(state);
  const hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => config, curations: new Map(), curationTail: Promise.resolve(), curationClosed: false, ctx: { logger: { warn() {} } } });
  hub.memoryContext = new MemoryContext(hub); hub.stateZone = new StateZone(hub);
  const agent = { session, options: {} };
  const fresh = () => [session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Remember these facts.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })];
  t.after(() => { hub.disposeCuration(); rmSync(dir, { recursive: true, force: true }); });
  const project = hub.scope(session).project;
  store.memoryOps(project, [
    { op: 'add', scope: 'project', key: 'format.one', text: 'Use tabs.' },
    { op: 'add', scope: 'project', key: 'format.two', text: 'Indent with tabs.' },
  ], 'scribe', mode);
  return { dir, store, config, session, hub, agent, fresh, project, signal: new AbortController().signal };
}

test('overlap triggers real memory merging and retirement with versions and usage retained', async t => {
  const { hub, store, session, agent, fresh, project, signal } = setup(t);
  const [kept, duplicate] = hub.memories(session); store.touch([kept.id], 'injected', session.id);
  const calls = [];
  hub.call = async (_agent, kind, request) => {
    calls.push(kind);
    if (kind === 'background') return batch({ overlap: true, conflict: false });
    assert.equal(request.tools[0].name, MEMORY_CURATE.name);
    assert.ok(JSON.stringify(request.tools).includes('(the curation job cleans it up)'));
    assert.match(JSON.stringify(request.messages), /injected=1/);
    return reply('memory_curate', { ops: [
      { op: 'update', scope: 'project', key: kept.key, target: kept.id, text: 'Use tabs for indentation.' },
      { op: 'retire', scope: 'project', target: duplicate.id, text: 'Merged into format.one.' },
    ] });
  };
  await hub.digest(agent, fresh(), signal); await hub.curationTail;
  assert.deepEqual(calls, ['background', 'curation']);
  const active = store.memories(project);
  assert.equal(active.length, 1); assert.equal(active[0].previous, kept.id);
  assert.equal(active[0].source, 'curate'); assert.equal(active[0].usage.injected, 1);
  assert.equal(active[0].text, 'Use tabs for indentation.');
  const archived = store.allMemories().find(m => m.id === duplicate.id);
  assert.equal(archived.retiredReason, 'Merged into format.one.');
  assert.equal(store.state(session.id).curationPending, false);
  assert.equal(new HubStore(store.dir).memories(project)[0].id, active[0].id);
});

test('uncertain signals stay quiet; conflict and actual existing-memory changes trigger curation', async t => {
  const { hub, session, agent, fresh, signal } = setup(t);
  let response = batch({ overlap: false, conflict: false }), curates = 0;
  hub.call = async (_a, kind) => kind === 'background' ? response : (curates++, reply('memory_curate', { ops: [] }));
  await hub.digest(agent, fresh(), signal); assert.equal(curates, 0);
  response = batch({ overlap: false, conflict: true });
  await hub.digest(agent, fresh(), signal); await hub.curationTail; assert.equal(curates, 1);
  const old = hub.memories(session)[0];
  response = batch({ overlap: false, conflict: false }, [{ op: 'update', scope: old.scope, key: old.key, target: old.id, text: 'Use two tabs.' }]);
  await hub.digest(agent, fresh(), signal); await hub.curationTail; assert.equal(curates, 2);
  response = batch({ overlap: false, conflict: false }, [{ op: 'add', scope: old.scope, key: old.key, text: 'Use two tabs.' }]);
  await hub.digest(agent, fresh(), signal); await hub.curationTail; assert.equal(curates, 2);
});

test('curation respects selected memory scope and skips session-only memory', async t => {
  const { hub, store, session, agent, fresh, project, signal } = setup(t, 'project');
  store.memoryOps('/other-project', [{ op: 'add', scope: 'project', key: 'other.secret', text: 'Other project.' }, { op: 'add', scope: 'global', key: 'global.secret', text: 'Global fact.' }]);
  hub.call = async (_a, kind, request) => {
    if (kind === 'background') return batch({ overlap: true, conflict: true });
    assert.ok(!JSON.stringify(request.messages).includes('secret'));
    return reply('memory_curate', { ops: [] });
  };
  await hub.digest(agent, fresh(), signal); await hub.curationTail;
  assert.equal(store.state(session.id).actions.curations, 1);
  store.state(session.id).memoryScope = 'session';
  hub.call = async (_a, kind) => { assert.equal(kind, 'background'); return batch({ overlap: true, conflict: true }); };
  await hub.digest(agent, fresh(), signal);
  assert.equal(store.state(session.id).curationPending, false);
  assert.equal(store.memories(project, 'project').length, 2);
});

test('rapid signals coalesce until the configured curation gap has elapsed', async t => {
  const { hub, config, agent } = setup(t); let calls = 0;
  config.curateMinGapMs = 40;
  hub.call = async () => { calls++; return reply('memory_curate', { ops: [] }); };
  await hub.requestCuration(agent); assert.equal(calls, 1);
  for (let i = 0; i < 5; i++) hub.requestCuration(agent);
  assert.equal(calls, 1);
  await new Promise(r => setTimeout(r, 65)); await hub.curationTail;
  assert.equal(calls, 2);
});

test('an in-flight curation cannot overwrite a newer user edit and can retry from fresh memory', async t => {
  const { hub, store, session, agent } = setup(t);
  const old = hub.memories(session)[0]; let release, started;
  const ready = new Promise(r => { started = r; }), held = new Promise(r => { release = r; });
  hub.call = async () => { started(); await held; return reply('memory_curate', { ops: [{ op: 'update', scope: old.scope, target: old.id, key: old.key, text: 'Outdated model result.' }] }); };
  const running = hub.requestCuration(agent); await ready;
  store.edit(old.id, { text: 'New user decision.' }); release(); await running;
  assert.equal(hub.memories(session).find(m => m.key === old.key).text, 'New user decision.');
  assert.equal(store.state(session.id).curationPending, true);
  assert.equal(store.state(session.id).actions.curationErrors, 1);
  hub.call = async () => reply('memory_curate', { ops: [] });
  await hub.requestCuration(agent); assert.equal(store.state(session.id).curationPending, false);
});

test('curation preserves user-owned/global entries and moves scoped facts through a version chain', async t => {
  const { store, project } = setup(t);
  store.memoryOps(project, [{ op: 'add', scope: 'project', key: 'manual', text: 'Generated rule.' }], 'scribe');
  const generated = store.memories(project).find(m => m.key === 'manual');
  store.edit(generated.id, { text: 'User rule.' });
  store.memoryOps(project, [{ op: 'add', scope: 'global', key: 'base', text: 'Base fact.' }]);
  const active = () => store.memories(project);
  const ids = () => new Set(active().map(m => m.id));
  const user = active().find(m => m.key === 'manual'), global = active().find(m => m.key === 'base');
  store.memoryOps(project, [{ op: 'update', scope: 'project', key: user.key, target: user.id, text: 'Merged user rule.' }], 'curate', 'full', ids());
  const merged = active().find(m => m.key === 'manual'); assert.equal(merged.origin, 'user');
  // Older X versions recorded the version chain without carrying an origin field.
  const legacy = store.allMemories(); delete legacy.find(m => m.id === merged.id).origin; store.write('memory.json', legacy);
  store.memoryOps(project, [{ op: 'retire', scope: 'project', target: merged.id, text: 'Drop.' }, { op: 'retire', scope: 'global', target: global.id, text: 'Drop.' }], 'curate', 'full', ids());
  assert.ok(active().some(m => m.id === merged.id)); assert.ok(active().some(m => m.id === global.id));
  const old = active().find(m => m.key === 'format.one');
  store.memoryOps(project, [{ op: 'update', scope: 'cross', key: old.key, target: old.id, text: 'Tool behavior across projects.' }], 'curate', 'full', ids());
  const moved = active().find(m => m.key === old.key);
  assert.equal(moved.scope, 'cross'); assert.equal(moved.previous, old.id);
  assert.equal(store.memories('/another-project').find(m => m.id === moved.id).text, moved.text);
});

test('cancelled or incomplete curation leaves memories and pending work intact', async t => {
  const { hub, store, session, agent } = setup(t), before = store.allMemories();
  hub.call = async () => ({ blocks: [{ type: 'text', text: 'No submitted operations.' }] });
  await hub.requestCuration(agent);
  assert.deepEqual(store.allMemories(), before); assert.equal(store.state(session.id).curationPending, true);
  let release, started;
  const ready = new Promise(r => { started = r; }), held = new Promise(r => { release = r; });
  hub.call = async () => { started(); await held; return reply('memory_curate', { ops: [] }); };
  const running = hub.requestCuration(agent); await ready; hub.disposeCuration(); release(); await running;
  assert.deepEqual(store.allMemories(), before); assert.equal(store.state(session.id).curationPending, true);
});
