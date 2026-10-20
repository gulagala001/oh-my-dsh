import test from 'node:test';
import assert from 'node:assert/strict';
import { contextConfig } from '../src/config.mjs';
import { DEFAULT_IDENTITY } from '../src/cc-adaptation/identity.mjs';
import { PERSONALITY_PRESETS, customPersonality, personalityText, personalityPatch, savedPersonalityPresets,
  savePersonalityPreset, deletePersonalityPreset, normalizePersonalityPatch } from '../src/cc-adaptation/personality.mjs';

const first = 'user:11111111-1111-4111-8111-111111111111';
const second = 'user:22222222-2222-4222-8222-222222222222';
const initial = { identityPreset: 'custom', identityCustomPrompt: '旧草稿', identityPrompt: '旧草稿' };
const apply = (config, patch) => ({ ...config, ...normalizePersonalityPatch(config, patch) });

test('named presets survive settings schema roundtrip, selection and explicit updates', () => {
  let config = apply(initial, savePersonalityPreset(initial, { id: first, name: '  我的搭子  ', text: '正文一' }));
  config = contextConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(savedPersonalityPresets(config), [{ id: first, name: '我的搭子', text: '正文一' }]);
  assert.equal(config.identityPreset, first);
  assert.equal(personalityText(config), '正文一');
  assert.equal(customPersonality(config), '旧草稿');
  config = apply(config, personalityPatch(config, 'softie'));
  assert.equal(personalityText(config), PERSONALITY_PRESETS.softie.text);
  config = apply(config, personalityPatch(config, first));
  assert.equal(config.identityPrompt, '正文一');
  config = apply(config, savePersonalityPreset(config, { id: first, name: '重命名', text: '正文二' }));
  assert.equal(savedPersonalityPresets(config).length, 1);
  assert.equal(personalityText(config), '正文二');
  const copies = savedPersonalityPresets(config);
  copies[0].text = '本地未保存草稿';
  assert.equal(personalityText(config), '正文二');
  const generated = savePersonalityPreset(config, { name: '自动 ID', text: '自动生成' });
  assert.match(generated.identityPreset, /^user:[0-9a-f-]{36}$/);
});

test('deleting selected presets preserves effective text; builtins cannot be deleted', () => {
  let config = apply(initial, savePersonalityPreset(initial, { id: first, name: '一', text: '当前正文' }));
  config = apply(config, savePersonalityPreset(config, { id: second, name: '二', text: '' }));
  config = contextConfig(config);
  assert.equal(personalityText(config), '');
  config = apply(config, personalityPatch(config, first));
  const unrelated = deletePersonalityPreset(config, second);
  assert.deepEqual(Object.keys(unrelated), ['identitySavedPresets']);
  config = apply(config, unrelated);
  config = apply(config, deletePersonalityPreset(config, first));
  assert.equal(config.identityPreset, 'custom');
  assert.equal(config.identityPrompt, '当前正文');
  assert.equal(config.identityCustomPrompt, '当前正文');
  assert.deepEqual(config.identitySavedPresets, []);
  for (const id of ['default', 'hardcore', 'softie', 'custom', 'off']) assert.throws(() => deletePersonalityPreset(config, id), /不可删除/);
});

test('legacy and blank custom edits retain existing compatibility semantics', () => {
  assert.equal(personalityText({}), DEFAULT_IDENTITY);
  assert.equal(customPersonality({ identityPrompt: '旧配置正文' }), '旧配置正文');
  let config = apply(initial, savePersonalityPreset(initial, { id: first, name: '一', text: '已保存' }));
  config = apply(config, { identityPrompt: '' });
  assert.equal(config.identityPreset, 'custom');
  assert.equal(personalityText(config), '');
  assert.equal(config.identityCustomPrompt, '');
  config = apply(config, personalityPatch(config, 'off'));
  assert.equal(personalityText(config), '');
  config = apply(config, personalityPatch(config, 'custom'));
  assert.equal(personalityText(config), '');
  assert.equal(savedPersonalityPresets(config)[0].text, '已保存');
});

test('both server validation paths reject malformed and ambiguous presets', () => {
  const valid = { id: first, name: '有效', text: '正文' };
  const invalid = [
    { identitySavedPresets: null },
    { identitySavedPresets: [{ ...valid, id: 'default' }] },
    { identitySavedPresets: [{ ...valid, id: 'user:bad' }] },
    { identitySavedPresets: [valid, { ...valid, name: '另一个' }] },
    { identitySavedPresets: [valid, { ...valid, id: second }] },
    { identitySavedPresets: [valid, { ...valid, id: second, name: '有效 ' }] },
    { identitySavedPresets: [{ ...valid, name: '默认' }] },
    { identitySavedPresets: [{ ...valid, name: '自定义' }] },
    { identitySavedPresets: [{ ...valid, name: '关闭人格' }] },
    { identitySavedPresets: [{ ...valid, name: ' ' }] },
    { identitySavedPresets: [{ ...valid, name: 'a'.repeat(81) }] },
    { identitySavedPresets: [{ ...valid, name: 'a\nb' }] },
    { identitySavedPresets: [{ ...valid, text: 123 }] },
    { identitySavedPresets: [{ ...valid, text: 'a'.repeat(65537) }] },
    { identityPreset: first }, { identityPreset: 'unknown' }, { identityPreset: '__proto__' }, { identityPreset: null },
  ];
  for (const patch of invalid) {
    assert.throws(() => contextConfig({ ...initial, ...patch }));
    assert.throws(() => normalizePersonalityPatch(initial, patch));
  }
  assert.throws(() => savePersonalityPreset(initial, { id: first, name: '软乎乎', text: '正文' }), /重名/);
  const config = apply(initial, savePersonalityPreset(initial, { id: first, name: 'My Persona', text: '正文' }));
  assert.throws(() => savePersonalityPreset(config, { id: second, name: 'my persona', text: '正文' }), /重名/);
  assert.throws(() => normalizePersonalityPatch(config, { identitySavedPresets: [] }), /未知/);
});

test('saved-list updates refresh the selected effective prompt without touching other settings', () => {
  let config = apply(initial, savePersonalityPreset(initial, { id: first, name: '一', text: '正文一' }));
  const patch = normalizePersonalityPatch(config, { identitySavedPresets: [{ id: first, name: '二', text: '正文二' }], traceEnabled: false });
  assert.equal(patch.identityPreset, first);
  assert.equal(patch.identityPrompt, '正文二');
  assert.equal(patch.identityCustomPrompt, '旧草稿');
  assert.equal(patch.traceEnabled, false);
});
