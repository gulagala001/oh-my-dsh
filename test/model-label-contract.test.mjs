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
const projectlessCode = transformSync(await readFile(new URL('../src/client/projectless-state.mjs', import.meta.url), 'utf8'), { format: 'cjs', target: 'es2022' }).code;
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
    if (name === './projectless-state.mjs') {
      const dependency = { exports: {} };
      runInNewContext(projectlessCode, { module: dependency, exports: dependency.exports, ...runtime.globals });
      return dependency.exports;
    }
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

test('only successful latest native UI choices update preferences and hooks release their session', async () => {
  const remembered = [], lifetime = [], sessionCleanup = [], pending = [];
  const select = () => { const reply = Promise.withResolvers(); pending.push(reply); return reply.promise; };
  let current;
  const directory = { select, store: { getSnapshot: () => ({ current }) } }, original = () => directory, models = { directoryFor: original };
  const ctx = { effect() {}, slots: { inject() {} }, sessions: { scope: () => ({ effect: run => sessionCleanup.push(run()) }) },
    inject(_deps, run) { run({ modelDirectories: models, effect: callback => lifetime.push(callback()) }); } };
  load('model').applyModelPanel(ctx, { rememberModel: (...args) => remembered.push(args) });
  const first = models.directoryFor('draft').select({ provider: 'native', model: 'first' });
  const second = models.directoryFor('draft').select({ provider: 'native', model: 'second' });
  pending[1].resolve({ ok: true }); await second;
  pending[0].resolve({ ok: true }); await first;
  assert.deepEqual(remembered, [['draft', { provider: 'native', model: 'second' }]]);
  const failed = directory.select({ provider: 'native', model: 'missing' });
  pending[2].resolve({ ok: false }); await failed;
  assert.equal(remembered.length, 1);
  const stale = directory.select({ provider: 'native', model: 'late' });
  current = { provider: 'native', model: 'newer-omd-choice' };
  pending[3].resolve({ ok: true }); await stale;
  assert.equal(remembered.length, 1, 'another control owns the newer native choice');
  sessionCleanup.forEach(cleanup => cleanup()); assert.equal(directory.select, select);
  lifetime.forEach(cleanup => cleanup()); assert.equal(models.directoryFor, original);
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
    const remembered = [];
    const props = { ctx: { sessions: { binding: () => ({ session: { projections: { faceOf: key => key === 'omdUltracode' ? projection : undefined } } }) } },
      sessionId: 'one', available: true, load() {}, rememberModel: (...args) => remembered.push(args),
      directory: { getSnapshot: () => directory, subscribe: () => () => {} } };
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => root.render(React.createElement(ModelPanel, props)));
    const click = async selector => act(async () => dom.window.document.querySelector(selector).click());
    await click('[aria-haspopup="dialog"]');
    const before = reads;
    await click('[aria-label="恢复默认思考强度"]');
    await act(async () => { server = newer; directory.current = newer.selected; revision++; for (const listener of listeners) listener(); });
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
    await act(async () => { server = { ...initial, revision: 3 }; directory.current = initial.selected; revision++; for (const listener of listeners) listener(); });
    await act(async () => answer.resolve({ ok: true, json: async () => accepted }));
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.match(dom.window.document.querySelector('[aria-haspopup="dialog"]').textContent, /Old model/,
      'a successful but older receipt cannot hide the newer native selection');
    assert.equal(posts.length, 2);
    assert.equal(remembered.length, 0, 'an outdated successful receipt must not replace the newer model preference');
    answer = Promise.withResolvers();
    await click('[aria-label="恢复默认思考强度"]');
    const currentChoice = { ...server, revision: 4 };
    await act(async () => { server = currentChoice; answer.resolve({ ok: true, json: async () => currentChoice }); });
    assert.equal(remembered.length, 1);
    assert.equal(remembered[0][1].model, currentChoice.selected.model, 'the current successful choice is still remembered');
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]); else delete globalThis[key]; });
  }
});

test('native model changes and unavailable routes cannot leave a stale model/effort panel', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  // React was imported before the DOM and selects its legacy input listener.
  dom.window.HTMLElement.prototype.attachEvent = function (name, listener) { this.addEventListener(name.slice(2), listener); };
  dom.window.HTMLElement.prototype.detachEvent = function (name, listener) { this.removeEventListener(name.slice(2), listener); };
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const stale = { provider: 'retired', model: 'gpt-6.1-sol', reasoningEffort: 'medium' };
    const current = { provider: 'configured', model: 'default-model', reasoningEffort: 'high' };
    const listeners = new Set();
    let directory = { current: stale, routable: false, status: 'ready', groups: [{ id: current.provider, name: 'Configured',
      models: [{ id: current.model, name: 'Current default', reasoning: { defaultEffort: 'high' } }] }], pending: null, failures: [] };
    let response = { selected: stale, mode: 'off', revision: 0 };
    const reads = [], posts = [];
    const fetch = async (_url, options = {}) => {
      if (options.method === 'POST') { posts.push(JSON.parse(options.body)); return { ok: true, json: async () => response }; }
      reads.push(response); return { ok: true, json: async () => response };
    };
    const { ModelPanel } = load('effort', { react: React, reactDom: require('react-dom'), globals: {
      fetch, window: dom.window, document: dom.window.document, innerWidth: 1000, innerHeight: 800,
      queueMicrotask, setTimeout, clearTimeout, ResizeObserver: class { observe() {} disconnect() {} },
    } });
    const props = { ctx: { sessions: { binding: () => undefined } }, sessionId: 'draft', available: true,
      load() {}, directory: { getSnapshot: () => directory, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } };
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => root.render(React.createElement(ModelPanel, props)));
    await act(async () => dom.window.document.querySelector('[aria-haspopup="dialog"]').click());
    assert.ok(dom.window.document.querySelector('[role="listbox"]'), 'an unavailable saved route opens the actionable model picker');
    assert.equal(dom.window.document.querySelector('input[type="range"]'), null, 'no dead effort slider for a missing model');
    await act(async () => {
      directory = { ...directory, current, routable: true };
      for (const listener of listeners) listener();
    });
    assert.match(dom.window.document.querySelector('[aria-haspopup="dialog"]').textContent, /Current default/,
      'the native selection wins even when an older mode response names a different route');
    assert.doesNotMatch(dom.window.document.querySelector('[aria-haspopup="dialog"]').textContent, /medium/);
    assert.equal(posts.length, 0, 'view reconciliation never silently changes a saved selection');
    assert.ok(reads.length >= 2, 'a changed native selection refreshes mode metadata');
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    keys.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]); else delete globalThis[key]; });
  }
});
