import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { decorateSlotComponent } from '../src/client/slot-decoration.mjs';
import * as ultraSubmodePreference from '../src/client/ultra-submode-preference.mjs';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const require = createRequire(import.meta.url), React = require('react');
const { transformSync } = require('esbuild');
const source = await readFile(new URL('../src/client/model-panel.jsx', import.meta.url), 'utf8');
const { code } = transformSync(source + '\nexport { ModelPanel };', { loader: 'jsx', format: 'cjs', target: 'es2022' });
function load(pane, runtime = {}) {
  const hooks = { ...React, useCallback: fn => fn, useEffect() {}, useLayoutEffect() {}, useMemo: fn => fn(),
    useSyncExternalStore: (_subscribe, get) => get(), useRef: value => ({ current: value }), useId: () => 'test',
    useState: value => [value === false ? true : value === 'effort' ? pane : value, () => {}] };
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react') return runtime.react ?? hooks;
    if (name === 'react-dom') return runtime.reactDom ?? { createPortal: node => node };
    if (name === './native-controls.jsx') return { Button: 'button', Input: 'input' };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Menu: 'menu' };
    if (name === './native-icons.jsx') return { Icon: () => null };
    if (name.endsWith('.css')) return { default: '' };
    if (name.includes('model-efforts')) return { effortChoices: () => [] };
    if (name.includes('main-conversation')) return { useMainConversation: () => true };
    if (name.includes('slot-decoration')) return { decorateSlotComponent };
    if (name === './ultra-submode-preference.mjs') return ultraSubmodePreference;
    throw Error(name);
  }, document: { body: {} }, ...runtime.globals });
  return module.exports;
}

test('model trigger, current menu value and options preserve native inline label props and fallback', () => {
  const provider = { id: 'deepseek', name: 'DeepSeek' }, model = { id: 'model-a', name: 'Model A', extra: 'catalog metadata' };
  const group = { id: 'connection-a', name: 'Connection A', provider, models: [model] };
  const state = { current: { provider: group.id, model: model.id }, groups: [group], pending: null, failures: [] };
  const calls = [];
  const props = { ctx: { sessions: { binding: () => undefined } }, sessionId: 'one', available: true,
    directory: { getSnapshot: () => state }, renderSlot: (name, owner, opts) => { calls.push({ name, owner, opts }); return 'custom label'; } };
  load('model').ModelPanel(props); load('effort').ModelPanel(props);
  assert.deepEqual([...new Set(calls.map(call => call.owner.placement))].sort(), ['menu', 'option', 'trigger']);
  for (const { name, owner, opts } of calls) {
    assert.equal(name, 'conversation.input.model.label'); assert.equal(owner.provider, provider);
    assert.equal(owner.model, model); assert.equal(owner.selected, true); assert.equal(opts.fallback, model.name);
  }
});

test('native model decoration preserves entry identity and its child render authority across mount/unmount', () => {
  const { applyModelPanel } = load('model'), name = 'conversation.input.model';
  function ModelSelect() {}
  const native = { options: { name, children: { [name + '.label']: { kind: 'single', scope: 'session', inline: true } } },
    component: ModelSelect, locale: 'model', inject() {} };
  native.children = native.options.children;
  const listeners = new Set(), entries = [native], cleanups = [];
  const slots = {
    entries: key => key === name ? entries : [], entriesOfSlot: key => key === name ? entries : [],
    subscribe(_name, fn) { listeners.add(fn); return () => listeners.delete(fn); },
    register(options) {
      const entry = { options, component: () => null }; entries.push(entry);
      for (const listener of [...listeners]) listener();
      return () => { entries.splice(entries.indexOf(entry), 1); for (const listener of [...listeners]) listener(); };
    },
    inject(key, fn) { if (key === name) cleanups.push(fn()); },
  };
  const ctx = { slots, effect() {} };
  applyModelPanel(ctx);
  assert.equal(entries.length, 1); assert.equal(entries[0], native); assert.notEqual(native.component, ModelSelect);
  const renderSlot = (key, owner, opts) => { assert(native.children[key], 'declaring entry authorizes label rendering'); return opts.fallback; };
  const decorated = native.component({ sessionId: 'one', renderSlot });
  // The helper's transparent wrapper delegates through the original entry.
  const panel = decorated.type(decorated.props);
  assert.equal(panel.props.renderSlot, renderSlot);
  cleanups.reverse().forEach(fn => fn());
  assert.equal(native.component, ModelSelect); assert.equal(entries.length, 1); assert.equal(listeners.size, 0);
});

test('model saves reconcile native changes skipped during the write and let conflicts recover', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const listeners = new Set(); let revision = 0;
    const projection = { getSnapshot: () => revision, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const initial = { selected: { provider: 'local', model: 'old', reasoningEffort: 'low' }, mode: 'off', submode: 'free', revision: 0 };
    const newer = { ...initial, selected: { provider: 'local', model: 'new', reasoningEffort: 'high' }, revision: 1 };
    let server = initial, posts = [], reads = 0, answer = Promise.withResolvers();
    const fetch = async (_url, options = {}) => {
      if (options.method !== 'POST') { reads++; return { ok: true, json: async () => server }; }
      posts.push(JSON.parse(options.body));
      return answer.promise;
    };
    const reactDom = require('react-dom');
    const { ModelPanel } = load('effort', { react: React, reactDom, globals: { fetch, window: dom.window, document: dom.window.document,
      innerWidth: 1000, innerHeight: 800, queueMicrotask, setTimeout, clearTimeout,
      ResizeObserver: class { observe() {} disconnect() {} } } });
    const directory = { current: initial.selected, groups: [{ id: 'local', name: 'Local', models: [
      { id: 'old', name: 'Old model' }, { id: 'new', name: 'New model', reasoning: { defaultEffort: 'high' } },
    ] }], pending: null, failures: [] };
    const props = { ctx: { sessions: { binding: () => ({ session: { projections: { faceOf: key => key === 'omdUltracode' ? projection : undefined } } }) } },
      sessionId: 'one', available: true, load() {}, directory: { getSnapshot: () => directory, subscribe: () => () => {} } };
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => root.render(React.createElement(ModelPanel, props)));
    const click = async selector => act(async () => dom.window.document.querySelector(selector).click());
    await click('[aria-haspopup="dialog"]');
    const before = reads;
    await click('[aria-label="恢复默认思考强度"]');
    await act(async () => { server = newer; revision++; for (const listener of listeners) listener(); });
    assert.equal(reads, before, 'projection refresh waits for the accepted write');
    await act(async () => answer.resolve({ ok: false, json: async () => ({ error: '模型设置已在另一处更新，请重试' }) }));
    assert.match(dom.window.document.querySelector('[aria-haspopup="dialog"]').textContent, /New model/);
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /另一处更新/, 'reconciliation preserves the actionable save error');
    assert.equal(reads, before + 1, 'one reconciliation read, without replaying the write');
    assert.equal(posts.length, 1);
    answer = Promise.withResolvers();
    await click('[aria-label="恢复默认思考强度"]');
    assert.equal(posts[1].expectedRevision, newer.revision);
    assert.equal(posts[1].model, 'new');
    const accepted = { ...newer, revision: 2 };
    await act(async () => { server = { ...initial, revision: 3 }; revision++; for (const listener of listeners) listener(); });
    await act(async () => answer.resolve({ ok: true, json: async () => accepted }));
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.match(dom.window.document.querySelector('[aria-haspopup="dialog"]').textContent, /Old model/,
      'a successful but older receipt cannot hide the newer native selection');
    assert.equal(posts.length, 2);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]); else delete globalThis[key]; });
  }
});
