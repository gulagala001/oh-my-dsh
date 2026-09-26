import { configSnapshot } from '../src/config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_FREQUENCY_PRESETS, contextFrequencyOf, contextFrequencyPatch, contextSettingsPatch, contextRouteMode, createContextUI } from '../src/client/context-client.mjs';
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
test('host and pipeline defaults both use the calibrated medium cadence without overwriting saved values', async () => {
  const { Config } = await import('../src/config.mjs');
  const expected = { digestEvery: 48, digestWindow: 48, coordinatorEvery: 3, coordinatorMinGapMs: 60000, surgeryCooldownSteps: 30 };
  for (const config of [configSnapshot(Config({})), contextConfig(), contextConfig(configSnapshot(Config({})))]) {
    assert.equal(contextFrequencyOf(config), 'medium');
    for (const [key, value] of Object.entries(expected)) assert.equal(config[key], value);
  }
  const saved = { digestEvery: 16, digestWindow: 16, coordinatorEvery: 1, coordinatorMinGapMs: 15000, surgeryCooldownSteps: 10 };
  for (const config of [configSnapshot(Config(saved)), contextConfig(saved)]) {
    for (const [key, value] of Object.entries(saved)) assert.equal(config[key], value);
    assert.equal(contextFrequencyOf(config), 'custom');
  }
  const names = ['always', 'medium', 'slow'];
  for (const key of Object.keys(expected)) {
    assert.ok(CONTEXT_FREQUENCY_PRESETS[names[0]][key] < CONTEXT_FREQUENCY_PRESETS[names[1]][key]);
    assert.ok(CONTEXT_FREQUENCY_PRESETS[names[1]][key] < CONTEXT_FREQUENCY_PRESETS[names[2]][key]);
  }
});
test('preset selection changes cadence without changing scope, model, Trace or idle settings', () => {
  const config = contextConfig({ memoryScope: 'session', traceEnabled: false, flushIdleMs: 45000, unifiedBackground: { model: 'custom' } });
  const next = { ...config, ...contextFrequencyPatch('always') };
  for (const key of ['memoryScope', 'traceEnabled', 'flushIdleMs', 'unifiedBackground']) assert.deepEqual(next[key], config[key]);
  assert.equal(next.digestEvery, 32); assert.equal(next.surgeryCooldownSteps, 20);
});
test('custom values survive detection without normalization; presets can be restored', () => {
  const cfg = contextConfig({ digestEvery: 37, digestWindow: 64 }); const before = JSON.stringify(cfg);
  assert.equal(contextFrequencyOf(cfg), 'custom'); assert.equal(JSON.stringify(cfg), before);
  assert.equal(contextFrequencyOf({ ...cfg, ...contextFrequencyPatch('slow') }), 'slow');
  assert.throws(() => contextFrequencyPatch('missing'), /未知/);
});
test('settings save emits only changed fields, preserves unchanged fields and excludes dataDir', () => {
  const saved = contextConfig({ dataDir: '/private', stateHintsEnabled: true });
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
test('idle settings are visible by default, off, preserve their delay and do not affect Trace', async () => {
  const React = await import('react'); const { renderToStaticMarkup } = await import('react-dom/server');
  const { Config } = await import('../src/config.mjs');
  const config = configSnapshot(Config({})); assert.equal(config.idlePreprocessEnabled, false); assert.equal(config.flushIdleMs, 90000);
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
  const { Config } = await import('../src/config.mjs'); const config = configSnapshot(Config({}));
  assert.equal(config.preprocessBoundaries, false); assert.equal(config.prepareBatchWindows, 2);
  assert.equal(config.backgroundConcurrency, 2); assert.equal(config.backgroundMaxRetries, 2);
  const { ContextSettings } = createContextUI(React), panel = new ContextSettings({}); panel.state = { ...panel.state, config };
  const basic = renderToStaticMarkup(panel.renderBasic());
  assert.match(basic, /按消息边界分段/); assert.doesNotMatch(basic, /aria-label="按消息边界分段"[^>]*checked/);
  const advanced = renderToStaticMarkup(panel.renderAdvanced());
  for (const label of ['每次触发最多处理窗口数', '续跑最低文本量', '单窗输入预算', '基础摘要目标', '后台最大并发调用', '自动重试次数']) assert.ok(advanced.includes(label));
});

test('experimental settings group CFR and CoT without changing their defaults or coupling saves', async () => {
  const React = await import('react'), { renderToStaticMarkup } = await import('react-dom/server');
  const { Config } = await import('../src/config.mjs');
  const config = configSnapshot(Config({})); assert.equal(config.todoConstraintFirst, false);
  const { ContextSettings } = createContextUI(React), panel = new ContextSettings({});
  panel.state = { ...panel.state, config };
  const html = renderToStaticMarkup(panel.renderExperimental());
  assert.match(html, /启用 CoT 前置/); assert.match(html, /推理文本字符上限/);
  assert.equal(config.traceEnabled, true); assert.equal(config.traceMaxChars, 0);
  assert.doesNotMatch(renderToStaticMarkup(panel.renderBasic()), /role="switch"[^>]*aria-label="(?:启用 CoT 前置|任务约束前置（CFR）)"/);
  assert.doesNotMatch(renderToStaticMarkup(panel.renderAdvanced()), /推理文本字符上限/);
  assert.match(html, /任务约束前置（CFR）/); assert.match(html, /下一次模型请求生效/);
  assert.doesNotMatch(html, /aria-label="任务约束前置（CFR）"[^>]*checked/);
  const enabled = { ...config, todoConstraintFirst: true };
  assert.deepEqual(contextSettingsPatch(config, enabled), { todoConstraintFirst: true });
  assert.deepEqual(contextSettingsPatch(enabled, config), { todoConstraintFirst: false });
});

test('returning to a session cannot let an older context action finish the current one', async t => {
  const React = await import('react');
  const { PipelinePanel } = createContextUI(React);
  const Inner = PipelinePanel({ useTabInfo: () => ({ tab: { visible: false } }) }).type;
  const panel = new Inner({ sessionId: 'a', visible: false });
  panel.alive = true;
  panel.setState = (update, callback) => { panel.state = { ...panel.state, ...(typeof update === 'function' ? update(panel.state) : update) }; callback?.(); };
  const fetch = globalThis.fetch, responses = [];
  t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = () => new Promise(resolve => responses.push(value => resolve(Response.json(value))));
  const first = panel.run('/compact', {}, () => 'old response');
  for (const sessionId of ['b', 'a']) {
    const previous = panel.props; panel.props = { ...previous, sessionId }; panel.componentDidUpdate(previous);
  }
  const current = panel.run('/compact', {}, () => 'current response');
  responses[0]({}); await first;
  assert.equal(panel.state.busy, true); assert.equal(panel.state.notice, '');
  responses[1]({}); await current;
  assert.equal(panel.state.busy, false); assert.equal(panel.state.notice, 'current response');
});

test('an older failed review read cannot replace the latest successful review', async t => {
  const React = await import('react');
  const { PipelinePanel } = createContextUI(React);
  const Inner = PipelinePanel({ useTabInfo: () => ({ tab: { visible: false } }) }).type;
  const panel = new Inner({ sessionId: 'a' }); panel.alive = true;
  panel.setState = update => { panel.state = { ...panel.state, ...update }; };
  const fetch = globalThis.fetch, pending = [];
  t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const old = panel.readReview(), current = panel.readReview();
  pending[1].resolve(Response.json({ input: 'latest review' })); await current;
  pending[0].reject(Error('older request failed')); await old;
  assert.deepEqual(panel.state.review, { input: 'latest review' }); assert.equal(panel.state.error, '');
});
