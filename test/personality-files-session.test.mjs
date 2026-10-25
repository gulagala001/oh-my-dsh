import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HubStore } from '../src/hub-store.mjs';
import { contextConfig } from '../src/config.mjs';
import { importPersonalityFile, exportPersonalityFile, personalityProfile, personalityPatch, normalizePersonalityPatch, deletePersonalityPreset } from '../src/cc-adaptation/personality.mjs';
import { sessionPersonality, handlePersonalityApi } from '../src/personality-session.mjs';
import { buildMainPrompt } from '../src/cc-adaptation/texts.mjs';
import { omaaIdentityPrompt } from '../src/omaa-enhancement.mjs';

const file = { format: 'omd.personality', version: 1, name: '测试搭子', description: '完整人格',
  modules: { identity: 'IDENTITY_LITERAL_$&', style: 'STYLE_MARKER', communication: 'COMMUNICATION_MARKER', presentation: '' } };
const apply = (config, patch) => contextConfig({ ...config, ...normalizePersonalityPatch(config, patch) });

test('personality files round-trip all modules; imports create copies and reject runtime fields', () => {
  let config = apply({}, importPersonalityFile({}, JSON.stringify(file)));
  const first = config.identityPreset, copy = JSON.parse(exportPersonalityFile(config));
  assert.deepEqual(copy, { ...file, format: 'dsh.persona' });
  config = apply(config, importPersonalityFile(config, JSON.stringify(file)));
  assert.notEqual(config.identityPreset, first);
  assert.equal(config.identitySavedPresets.length, 2);
  assert.equal(personalityProfile(config).name, '测试搭子（2）');
  for (const invalid of [{ ...file, tools: [] }, { ...file, version: 2 }, { ...file, modules: { ...file.modules, environment: 'fake' } },
    { ...file, modules: { identity: {} } }, { ...file, modules: null }]) assert.throws(() => importPersonalityFile(config, JSON.stringify(invalid)));
  assert.throws(() => importPersonalityFile(config, '{broken'));
  assert.throws(() => importPersonalityFile(config, '中'.repeat(400000)), /1 MiB/);
  const deleted = apply(config, deletePersonalityPreset(config, config.identityPreset));
  assert.equal(deleted.identityPreset, 'custom');
  assert.deepEqual(personalityProfile(deleted).modules, file.modules);
});

test('session selection persists independently; disable, deletion and failed writes preserve boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-personality-'));
  try {
    let config = apply({}, importPersonalityFile({}, JSON.stringify(file)));
    const saved = config.identityPreset;
    config = apply(config, { ...personalityPatch(config, 'economical'), sessionPersonalityEnabled: true });
    const hub = { store: new HubStore(root), config: () => config };
    const a = { id: 'personality-a', header: { agentPreset: 'oh-my-dsh', origin: 'user' } };
    const b = { id: 'personality-b', header: { agentPreset: 'oh-my-dsh', origin: 'user' } };
    const request = async (session, body, extra = {}) => {
      let response;
      await handlePersonalityApi({ hub, ctx: {}, req: { method: body ? 'POST' : 'GET' }, res: { setHeader() {} },
        session, id: session.id, readBody: async () => body, send: (_res, status, data) => { response = { status, data }; }, ...extra });
      return response;
    };
    assert.equal((await request(a, { preset: saved })).status, 200);
    assert.equal(sessionPersonality(hub, a).effectivePreset, saved);
    assert.equal(sessionPersonality(hub, b).effectivePreset, 'economical');
    hub.store = new HubStore(root);
    const effective = sessionPersonality(hub, a);
    assert.deepEqual(effective.modules, file.modules);
    const text = buildMainPrompt(effective.modules.identity, { personalityModules: effective.modules });
    assert.ok(text.includes('STYLE_MARKER') && text.includes('COMMUNICATION_MARKER'));
    assert.ok(text.includes('Follow the session\'s actual permission mode.'));
    assert.ok(text.includes('Before ending your turn'));
    assert.ok(!text.includes('## Answer presentation'));
    assert.ok(omaaIdentityPrompt(hub, a).includes('STYLE_MARKER'));
    config = { ...config, sessionPersonalityEnabled: false };
    assert.equal(sessionPersonality(hub, a).effectivePreset, 'economical');
    assert.equal((await request(a, { preset: 'off' })).status, 409);
    config = { ...config, sessionPersonalityEnabled: true };
    assert.equal(sessionPersonality(hub, a).effectivePreset, saved);
    const save = hub.store.save.bind(hub.store);
    hub.store.save = () => { throw Error('disk full'); };
    await assert.rejects(request(a, { preset: 'off' }), /disk full/);
    assert.equal(sessionPersonality(hub, a).effectivePreset, saved);
    hub.store.save = save;
    config = apply(config, deletePersonalityPreset(config, saved));
    assert.equal(sessionPersonality(hub, a).missing, true);
    assert.equal(sessionPersonality(hub, a).effectivePreset, 'economical');
    assert.equal((await request(a, { preset: 'inherit' })).data.missing, false);
    await assert.rejects(request(a, { preset: 'unknown' }), /未知/);
    assert.equal((await request({ ...b, header: { agentPreset: 'oh-my-dsh', origin: 'subagent' } }, { preset: 'off' })).status, 409);
    assert.equal((await request(b, undefined, { archivedOnly: true })).data.locked, true);
    assert.equal((await request({ ...b, header: { agentPreset: 'default' } })).data.enabled, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
