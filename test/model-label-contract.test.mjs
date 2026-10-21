import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { decorateSlotComponent } from '../src/client/slot-decoration.mjs';
import * as ultraSubmodePreference from '../src/client/ultra-submode-preference.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { transformSync } = require('esbuild');
const source = await readFile(new URL('../src/client/model-panel.jsx', import.meta.url), 'utf8');
const { code } = transformSync(source + '\nexport { ModelPanel };', { loader: 'jsx', format: 'cjs', target: 'es2022' });
function load(pane) {
  const hooks = { ...React, useCallback: fn => fn, useEffect() {}, useLayoutEffect() {}, useMemo: fn => fn(),
    useSyncExternalStore: (_subscribe, get) => get(), useRef: value => ({ current: value }), useId: () => 'test',
    useState: value => [value === false ? true : value === 'effort' ? pane : value, () => {}] };
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react-dom') return { createPortal: node => node };
    if (name === './native-controls.jsx') return { Button: 'button', Input: 'input' };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Menu: 'menu' };
    if (name === './native-icons.jsx') return { Icon: () => null };
    if (name.endsWith('.css')) return { default: '' };
    if (name.includes('model-efforts')) return { effortChoices: () => [] };
    if (name.includes('main-conversation')) return { useMainConversation: () => true };
    if (name.includes('slot-decoration')) return { decorateSlotComponent };
    if (name === './ultra-submode-preference.mjs') return ultraSubmodePreference;
    throw Error(name);
  }, document: { body: {} } });
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
