import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_FREQUENCY_PRESETS, contextFrequencyOf, contextFrequencyPatch, contextSettingsPatch, contextRouteMode, CONTEXT_CSS, createContextUI } from '../src/client/context-client.mjs';
import { contextConfig } from '../src/context/pipeline.mjs';

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
test('active context components are ordinary module exports, not injected source', () => {
  const ui = createContextUI({ Component: class {}, createElement() {} });
  assert.deepEqual(Object.keys(ui).sort(), ['ContextSettings', 'ScopeChip', 'applyStyle', 'wrapWorkbench'].sort());
  for (const value of Object.values(ui)) assert.equal(typeof value, 'function');
});
test('new panels inherit host themes and use container width instead of browser width', () => {
  assert.match(CONTEXT_CSS, /--dsw-alias-bg-base/); assert.match(CONTEXT_CSS, /--dsw-alias-label-primary/);
  assert.match(CONTEXT_CSS, /@container cx \(max-width:400px\)/);
  assert.match(CONTEXT_CSS, /prefers-reduced-motion/); assert.match(CONTEXT_CSS, /\[hidden\].*display:none!important/);
});


test('idle settings are visible by default, off, preserve their delay and do not affect Trace', async () => {
  const React = await import('react'); const { renderToStaticMarkup } = await import('react-dom/server');
  const { Config } = await import('../src/config.mjs');
  const config = Config({}); assert.equal(config.idlePreprocessEnabled, false); assert.equal(config.flushIdleMs, 90000);
  const { ContextSettings } = createContextUI(React); const panel = new ContextSettings({});
  panel.state = { ...panel.state, config };
  const html = renderToStaticMarkup(panel.renderBasic());
  assert.match(html, /空闲时自动预处理/); assert.match(html, /空闲等待时间 · 秒/);
  assert.match(html, /disabled=""[^>]*value="90"/);
  assert.doesNotMatch(html, /aria-label="空闲时自动预处理"[^>]*checked/);
  const changed = { ...config, idlePreprocessEnabled: true, flushIdleMs: 45000 };
  assert.deepEqual(contextSettingsPatch(config, changed), { idlePreprocessEnabled: true, flushIdleMs: 45000 });
  assert.equal(changed.traceEnabled, config.traceEnabled);
  for (const preset of Object.keys(CONTEXT_FREQUENCY_PRESETS)) {
    const next = { ...changed, ...contextFrequencyPatch(preset) };
    assert.equal(next.idlePreprocessEnabled, true); assert.equal(next.flushIdleMs, 45000);
  }
});

test('whole-window mode defaults on and all material/batch budget settings are exposed', async () => {
  const React = await import('react'), { renderToStaticMarkup } = await import('react-dom/server');
  const { Config } = await import('../src/config.mjs'); const config = Config({});
  assert.equal(config.preprocessBoundaries, false); assert.equal(config.prepareBatchWindows, 2);
  assert.equal(config.backgroundConcurrency, 2); assert.equal(config.backgroundMaxRetries, 2);
  const { ContextSettings } = createContextUI(React), panel = new ContextSettings({}); panel.state = { ...panel.state, config };
  const basic = renderToStaticMarkup(panel.renderBasic());
  assert.match(basic, /按消息边界分段/); assert.doesNotMatch(basic, /aria-label="按消息边界分段"[^>]*checked/);
  const advanced = renderToStaticMarkup(panel.renderAdvanced());
  for (const label of ['每次触发最多处理窗口数', '续跑最低文本量', '单窗输入预算', '基础摘要目标', '后台最大并发调用', '自动重试次数']) assert.ok(advanced.includes(label));
});
