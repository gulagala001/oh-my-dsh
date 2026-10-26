import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { HubStore } from '../src/hub-store.mjs';
import { PersonaStore } from '../plugins/persona/src/store.mjs';
import { sessionPersonality } from '../plugins/persona/src/session.mjs';
import { applyPersonality } from '../plugins/persona/src/shared/prompt.mjs';
import { transferDraftPreferences } from '../src/draft-preferences.mjs';
import { ProjectlessDrafts } from '../src/client/projectless-state.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'omd-draft-preferences-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = { store: new HubStore(join(root, 'omd')), persona: { store: new PersonaStore(join(root, 'persona')) } };
  hub.persona.config = () => hub.persona.store.config();
  hub.persona.forSession = session => sessionPersonality(hub.persona, session);
  hub.persona.store.update({ identityPreset: 'economical', sessionPersonalityEnabled: true,
    identityCustomPrompt: 'DRAFT_SELECTED_IDENTITY', identityCustomModules: { style: 'DRAFT_SELECTED_STYLE', communication: '', presentation: '' } });
  const source = Session.create('source'), target = Session.create('target');
  const ctx = { sessions: new Map([['source', source], ['target', target]]), agents: new Map() };
  const input = { sourceSessionId: source.id, targetSessionId: target.id, requestId: 'first-send' };
  return { root, hub, ctx, source, target, input, transfer: () => transferDraftPreferences(ctx, hub, input) };
}

for (const omaa of [false, true]) test('first-send handoff assembles selected persona and persists related choices, including ' + (omaa ? 'OMAA' : 'OMD'), async t => {
  const f = fixture(t), { hub, source, target } = f;
  hub.persona.store.save({ id: source.id, personalityPreset: 'custom' });
  hub.store.update(hub.store.state(source.id), { promptStyle: 'omd', betterTodo: { todo: false, verificationMode: 'off' },
    notes: ['source only'], taskList: ['source only'], memoryScope: 'global' });
  const sourceState = structuredClone(hub.store.peek(source.id)), global = hub.persona.config();
  assert.equal(hub.persona.forSession(target).effectivePreset, 'economical', 'regression: new native ID resolves the old global persona before handoff');
  const face = name => ({ getSnapshot: () => name === 'agentPreset' ? omaa ? 'omaa-codex' : 'oh-my-dsh' : undefined });
  const drafts = new ProjectlessDrafts({ sessions: { binding: () => ({ session: { projections: { faceOf: face } } }) },
    remote: { agentPresets: { select: async () => ({ ok: true }) } } }, { storage: { getItem: () => null, setItem() {} } });
  drafts.drafts.source = { requestId: f.input.requestId, sessionId: target.id };
  t.after(() => drafts.dispose());
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const value = url.endsWith('/draft-preferences') ? transferDraftPreferences(f.ctx, hub, JSON.parse(options.body))
      : url.startsWith('omaa/') ? { handledWorkMode: true } : { mode: 'off', revision: 0 };
    return { ok: true, json: async () => value };
  });
  await drafts.copySettings(source.id, target.id);
  target.append('user/message', { id: 'first', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Start' }] }, { surfaceOp: 'append' });
  const assembly = applyPersonality({ sections: [] }, { agent: { session: target } }, hub.persona);
  assert.ok(assembly.sections.some(section => section.text.includes('DRAFT_SELECTED_IDENTITY')));
  assert.ok(assembly.sections.some(section => section.text.includes('DRAFT_SELECTED_STYLE')));
  hub.store = new HubStore(join(f.root, 'omd')); hub.persona.store = new PersonaStore(join(f.root, 'persona'));
  assert.equal(hub.persona.forSession(target).effectivePreset, 'custom');
  assert.deepEqual(hub.store.peek(target.id).betterTodo, { todo: false, verificationMode: 'off' });
  assert.equal(hub.store.peek(target.id).promptStyle, 'omd');
  assert.deepEqual(hub.store.peek(target.id).notes, []);
  assert.equal(hub.store.peek(target.id).taskList, undefined);
  assert.equal(hub.store.peek(target.id).memoryScope, undefined);
  assert.deepEqual(hub.store.peek(source.id), sourceState); assert.deepEqual(hub.persona.config(), global);
});

test('retry refreshes the selection, keeps off and inherit distinct, and refuses unrelated target edits', t => {
  const f = fixture(t), store = f.hub.persona.store;
  store.save({ id: 'source', personalityPreset: 'off' }); f.transfer(); f.transfer();
  assert.equal(store.choice('target'), 'off');
  store.save({ id: 'source', personalityPreset: undefined }); f.transfer();
  assert.equal(store.choice('target'), undefined);
  assert.equal(f.hub.persona.forSession(f.target).effectivePreset, 'economical');
  store.save({ id: 'source', personalityPreset: 'custom' }); f.transfer();
  store.save({ id: 'target', personalityPreset: 'off' });
  assert.throws(f.transfer, /另一处更改/); assert.equal(store.choice('target'), 'off');
});

test('disabled and deleted session choices survive handoff without freezing the global default', t => {
  const f = fixture(t), store = f.hub.persona.store;
  store.save({ id: 'source', personalityPreset: 'custom' });
  store.update({ sessionPersonalityEnabled: false }); f.transfer();
  assert.equal(store.choice('target'), 'custom');
  assert.equal(f.hub.persona.forSession(f.target).effectivePreset, 'economical');
  store.update({ sessionPersonalityEnabled: true });
  assert.equal(f.hub.persona.forSession(f.target).effectivePreset, 'custom');
  store.save({ id: 'source', personalityPreset: 'saved-deleted' }); f.transfer();
  assert.equal(store.choice('target'), 'saved-deleted');
  assert.equal(f.hub.persona.forSession(f.target).missing, true);
});

test('failed persistence compensates the persona write and permits a retry', t => {
  const f = fixture(t), persona = f.hub.persona.store;
  persona.save({ id: 'source', personalityPreset: 'custom' });
  const save = f.hub.store.save;
  f.hub.store.save = () => { throw Error('disk full'); };
  assert.throws(f.transfer, /disk full/);
  assert.equal(persona.choice('target'), undefined);
  assert.equal(f.hub.store.peek('target').draftPreferenceTransfer, undefined);
  f.hub.store.save = save; f.transfer();
  assert.equal(persona.choice('target'), 'custom');
});

test('first-send preferences cannot overwrite existing chats, active agents, children or another transfer', t => {
  const f = fixture(t);
  f.transfer();
  assert.throws(() => transferDraftPreferences(f.ctx, f.hub, { ...f.input, requestId: 'other' }), /另一处更改/);
  f.ctx.agents.set('target', { session: f.target, status: 'running' });
  assert.throws(f.transfer, /尚未开始/); f.ctx.agents.clear();
  const child = Session.create('target', [], { ...f.target.header, origin: 'subagent', delegationDepth: 1 });
  f.ctx.sessions.set('target', child); assert.throws(f.transfer, /主会话/); f.ctx.sessions.set('target', f.target);
  f.target.append('user/message', { id: 'existing', role: 'user', content: [] }, { surfaceOp: 'append' });
  assert.throws(f.transfer, /尚未开始/);
});
