import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import React, { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { decorateSlotComponent } from '../src/client/slot-decoration.mjs';

const require = createRequire(import.meta.url);
const host = createRequire(realpathSync(process.env.OMD_PTC_TEST_HOST ?? require.resolve('@deepseek-ai/dsh/package.json')));
const source = readFileSync(new URL('../src/client/preset-projection.jsx', import.meta.url), 'utf8');
const module = { exports: {} };
runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs', target: 'es2022' }).code, {
  module, exports: module.exports, require: name => name === 'react' ? React : { decorateSlotComponent },
});
const { applyPresetProjection } = module.exports;
const store = value => {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const listener of listeners) listener(); } };
};
const hook = source => selector => selector(useSyncExternalStore(source.subscribe, source.getSnapshot));

test('native preset label and picker follow live projection across stale summaries, switching and reconnect', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let native;
  // Execute the matching host's real preset renderers; only surrounding store
  // transport and Menu/Icon primitives are reduced for this DOM-level check.
  const client = readFileSync(host.resolve('@deepseek-ai/dsh-client-ui-agent-preset/client'), 'utf8')
    .replace('return module.exports;', 'return { AgentPresetLabel, AgentPresetSeat };');
  runInNewContext(client, { window: { __ModuleLoader__: { load: registration => {
    native = registration.factory(name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name)
      : name.includes('primitives') ? { IconAgentPresetOutlineRegular: () => null, IconChevronDownOutlineRegular: () => null,
        Menu: props => React.createElement('div', { 'data-selected': props.selectedId }, props.anchor),
        Button: props => React.createElement('button', { onClick: props.onClick }, props.children) } : {});
  } } }, document: dom.window.document });
  const list = store({ byId: { one: { projectionValues: { agentPreset: 'standard' } }, two: { projectionValues: { agentPreset: 'standard' } } } });
  const first = store('omd-ptc'), second = store('custom-agent'); let binding = first;
  const options = [{ id: 'standard' }, { id: 'omd-ptc', name: 'OMD PTC' }, { id: 'custom-agent', name: 'Custom Agent' }];
  const seat = store({ options, current: 'standard', error: null, busy: false, introduce: false });
  const entries = [
    { options: { name: 'conversation.session.header.actions', id: 'agent-preset' }, component: native.AgentPresetLabel },
    { options: { name: 'conversation.hero.agentPreset' }, component: native.AgentPresetSeat },
  ];
  const original = entries.map(entry => entry.component), subscribers = new Map(), cleanups = [];
  const slots = {
    entries: name => entries.filter(entry => entry.options.name === name),
    entriesOfSlot: name => entries.filter(entry => entry.options.name === name),
    subscribe(name, fn) { const rows = subscribers.get(name) ?? new Set(); subscribers.set(name, rows); rows.add(fn); return () => rows.delete(fn); },
    register(options, component) {
      const entry = { options, component }; entries.push(entry);
      for (const fn of subscribers.get(options.name) ?? []) fn();
      return () => { entries.splice(entries.indexOf(entry), 1); for (const fn of subscribers.get(options.name) ?? []) fn(); };
    },
  };
  const ctx = { slots, effect(fn) { cleanups.push(fn()); }, sessions: { list,
    binding: id => id === undefined ? undefined : { session: { projections: { faceOf: () => id === 'two' ? second : binding } } } } };
  if (process.env.OMD_PTC_BASELINE !== '1') applyPresetProjection(ctx);
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = sessionId => act(async () => root.render(React.createElement(React.Fragment, {}, ...entries.map(entry => React.createElement(entry.component, {
    key: entry.options.name, sessionId, useSessions: hook(list), useAgentPresets: selector => selector({ options }),
    useAgentPresetSeat: hook(seat), useDeveloperTools: selector => selector(true),
    useSessionRetainInfo: selector => selector({ retainedBy: { mainView: 1 } }),
    load() {}, select() {}, dismissRefusal() {}, introduced() {}, t: key => key,
  })))));
  try {
    await render('one');
    assert.match(dom.window.document.body.textContent, /OMD PTC/);
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'omd-ptc');
    await act(async () => first.set('custom-agent'));
    assert.match(dom.window.document.body.textContent, /Custom Agent/);
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'custom-agent');
    await act(async () => seat.set({ ...seat.getSnapshot(), busy: true, current: 'standard' }));
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'standard', 'keep a pending native selection visible');
    await act(async () => seat.set({ ...seat.getSnapshot(), busy: false }));
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'custom-agent');
    await render('two'); await act(async () => first.set('omd-ptc'));
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'custom-agent', 'old session cannot overwrite current view');
    binding = store('omd-ptc'); await render('one');
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'omd-ptc');
    await act(async () => binding.set(null));
    assert.equal(dom.window.document.querySelector('[data-selected]'), null, 'known empty projection must not fall back to Standard');
    await render(undefined);
    assert.equal(dom.window.document.querySelector('[data-selected]').dataset.selected, 'standard', 'unbound draft keeps native staged/default choice');
  } finally {
    await act(async () => root.unmount()); cleanups.reverse().forEach(fn => fn());
    assert.deepEqual(entries.map(entry => entry.component), original);
    dom.window.close();
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});
