import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_FREQUENCY_PRESETS, contextFrequencyOf, contextFrequencyPatch, contextSettingsPatch, contextRouteMode, CONTEXT_CSS } from '../src/client/context-client.mjs';
import { contextConfig } from '../src/context/pipeline.mjs';
import { updateContextClientBundle } from '../scripts/context-client-bundle.mjs';

test('three presets have only live settings and each passes runtime configuration validation', () => {
  const keys = ['digestEvery', 'digestWindow', 'coordinatorEvery', 'coordinatorMinGapMs', 'surgeryCooldownSteps'];
  for (const [name, value] of Object.entries(CONTEXT_FREQUENCY_PRESETS)) {
    assert.deepEqual(Object.keys(value), keys);
    assert.equal(contextFrequencyOf(contextConfig(value)), name);
    assert.equal(Object.isFrozen(value), true);
  }
  assert.equal(contextFrequencyOf(contextConfig()), 'medium');
});
test('preset selection leaves scope, model, Trace, idle, retirement and old state settings untouched', () => {
  const config = contextConfig({ memoryScope: 'session', traceEnabled: false, flushIdleMs: 45000, stateEnabled: true, unifiedBackground: { model: 'custom' } });
  const next = { ...config, ...contextFrequencyPatch('always') };
  for (const key of ['memoryScope', 'traceEnabled', 'flushIdleMs', 'stateEnabled', 'unifiedBackground']) assert.deepEqual(next[key], config[key]);
  assert.equal(next.digestEvery, 16); assert.equal(next.surgeryCooldownSteps, 10);
});
test('custom values survive detection without normalization; presets can be restored', () => {
  const cfg = contextConfig({ digestEvery: 37, digestWindow: 64 }); const before = JSON.stringify(cfg);
  assert.equal(contextFrequencyOf(cfg), 'custom'); assert.equal(JSON.stringify(cfg), before);
  assert.equal(contextFrequencyOf({ ...cfg, ...contextFrequencyPatch('slow') }), 'slow');
  assert.throws(() => contextFrequencyPatch('missing'), /未知/);
});
test('settings save emits only changed fields, never resubmits retired fields or dataDir', () => {
  const saved = contextConfig({ dataDir: '/private', probeEnabled: true, curateEvery: 0 });
  assert.deepEqual(contextSettingsPatch(saved, saved), {});
  const edited = { ...saved, ...contextFrequencyPatch('always') };
  assert.deepEqual(Object.keys(contextSettingsPatch(saved, edited)).sort(), Object.keys(CONTEXT_FREQUENCY_PRESETS.always).sort());
  assert.deepEqual(contextSettingsPatch(saved, { ...saved, dataDir: '/another' }), {});
});
test('route detection keeps customized efforts and providers rather than displaying Follow', () => {
  assert.equal(contextRouteMode({ backgroundMode: 'separate' }), 'separate');
  assert.equal(contextRouteMode({ backgroundMode: 'unified', unifiedBackground: { model: 'custom', effort: 'xhigh' } }), 'unified');
  assert.equal(contextRouteMode({ backgroundMode: 'unified', unifiedBackground: { effort: 'high' } }), 'unified');
  assert.equal(contextRouteMode({ backgroundMode: 'unified', unifiedBackground: { effort: 'off', temperature: .7 } }), 'follow');
});
test('bundle update replaces one old adapter and is byte-idempotent', () => {
  const original = 'window.__ModuleLoader__.load({factory:(require)=>{var module={exports:{}};return module.exports;}});';
  const first = updateContextClientBundle(original, 'export const VALUE=1;\nexport function wrapContextClient(x){return x;}');
  const source = 'export const VALUE=2;\nexport function wrapContextClient(x){return x;}';
  const next = updateContextClientBundle(first, source);
  assert.match(next, /const VALUE=2/); assert.doesNotMatch(next, /const VALUE=1/);
  assert.equal(next.split('/* context-v1 client adapter */').length, 2);
  assert.equal(updateContextClientBundle(next, source), next);
  assert.ok(next.startsWith(original.slice(0, original.indexOf('return module.exports;'))));
});
test('bundle refresh rejects unknown wrappers and duplicate markers', () => {
  assert.throws(() => updateContextClientBundle('unknown bundle', ''), /未知/);
  assert.throws(() => updateContextClientBundle('/* context-v1 client adapter *//* context-v1 client adapter */return wrapContextClient(module.exports,require);}});', ''), /边界/);
});
test('new panels inherit host themes and use container width instead of browser width', () => {
  assert.match(CONTEXT_CSS, /--dsw-alias-bg-base/); assert.match(CONTEXT_CSS, /--dsw-alias-label-primary/);
  assert.match(CONTEXT_CSS, /@container cx \(max-width:400px\)/);
  assert.match(CONTEXT_CSS, /prefers-reduced-motion/); assert.match(CONTEXT_CSS, /\[hidden\].*display:none!important/);
});
