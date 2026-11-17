import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useSyncExternalStore } from 'react';
import { readOverviewWidth, overviewWidthLimits } from '../src/client/overview-panel-resize.mjs';
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [new URL('../src/client/session-overview-panel.jsx', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);

test('overview closes on workspace expansion, reopens resident and floating, and returns to push layout', async t => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = new Map(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const entries = new Map(), subscriptions = new Map(), cleanups = [], e = React.createElement;
  const slots = { entries: name => entries.get(name) ?? [], entriesOfSlot: name => (entries.get(name) ?? []).filter(row => !row.options.priority),
    subscribe(name, fn) { const set = subscriptions.get(name) ?? new Set(); subscriptions.set(name, set); set.add(fn); return () => set.delete(fn); },
    inject(name, fn) { cleanups.push(fn()); },
    register(options, component) { const rows = entries.get(options.name) ?? []; entries.set(options.name, rows); const entry = { options, component }; rows.push(entry);
      subscriptions.get(options.name)?.forEach(fn => fn());
      return () => { rows.splice(rows.indexOf(entry), 1); subscriptions.get(options.name)?.forEach(fn => fn()); }; },
  };
  slots.register({ name: 'main.conversation' }, props => props.renderFactorySlot('conversation.content', { variant: 'main' }));
  slots.register({ name: 'conversation.session.header.corner' }, () => null);
  const ctx = { slots, effect(fn) { cleanups.push(fn()); } }, usePanel = module.exports.installOverviewPanel(ctx);
  let sidebar = { bySession: { root: { layout: { expanded: false } } } };
  const listeners = new Set(), subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const Main = slots.entries('main.conversation')[0].component, Corner = slots.entries('conversation.session.header.corner')[0].component;
  let mounts = 0;
  function Chat() { React.useEffect(() => { mounts++; }, []); return e('textarea', { defaultValue: 'retained draft' }); }
  function Toggle() { const panel = usePanel('root'); return e('button', { onClick: panel.toggle }, 'toggle'); }
  const { createRoot } = await import('react-dom/client'), root = createRoot(document.querySelector('main'));
  t.after(async () => { await act(() => root.unmount()); for (const off of cleanups.reverse()) off?.(); dom.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await act(() => root.render(e(React.Fragment, null, e(Toggle), e(Corner, { sessionId: 'root', actions: { setExpanded() {} }, useStore: select => select(useSyncExternalStore(subscribe, () => sidebar)) }), e(Main, { sessionId: 'root', renderFactorySlot: () => e(Chat) }))));
  const layout = document.querySelector('.omd-overview-layout'), toggle = document.querySelector('button');
  const measured = [];
  Object.defineProperty(layout, 'clientWidth', { configurable: true, get() { measured.push(layout.getAttribute('data-overview-animating')); return 1000; } });
  const expand = async expanded => act(() => { sidebar = { bySession: { root: { layout: { expanded } } } }; listeners.forEach(fn => fn()); });
  await act(() => toggle.click()); assert.ok(layout.hasAttribute('data-overview-open'));
  assert.ok(measured.length && measured.every(Boolean), 'motion must be present before resize measurements flush the new width');
  await expand(true); assert.ok(!layout.hasAttribute('data-overview-open'));
  await act(() => toggle.click()); assert.ok(layout.hasAttribute('data-overview-floating')); assert.ok(layout.hasAttribute('data-overview-open'));
  await act(() => document.body.click()); assert.ok(layout.hasAttribute('data-overview-open'));
  await expand(false); assert.ok(!layout.hasAttribute('data-overview-floating')); assert.ok(layout.hasAttribute('data-overview-open'));
  assert.equal(mounts, 1); assert.equal(document.querySelector('textarea').value, 'retained draft');
  Object.defineProperty(layout, 'clientWidth', { value: 1000 });
  const separator = document.querySelector('[role=separator]'); let capture;
  separator.setPointerCapture = id => { capture = id; }; separator.hasPointerCapture = id => capture === id; separator.releasePointerCapture = () => { capture = null; };
  const pointer = (type, x, id = 1) => { const event = new dom.window.MouseEvent(type, { clientX: x, bubbles: true, button: 0 }); Object.defineProperty(event, 'pointerId', { value: id }); separator.dispatchEvent(event); };
  await act(() => { pointer('pointerdown', 700); pointer('pointermove', 640); pointer('pointerup', 640); });
  assert.equal(readOverviewWidth(), 340);
  await act(() => { pointer('pointerdown', 700); pointer('pointermove', 600); pointer('pointercancel', 600); });
  assert.equal(readOverviewWidth(), 340, 'cancel preserves the committed width');
  await act(() => separator.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
  assert.equal(readOverviewWidth(), 280);
  await act(() => toggle.click()); assert.ok(!layout.hasAttribute('data-overview-open'));
});

test('width preferences tolerate denied storage and clamp to the available layout', () => {
  assert.equal(readOverviewWidth({ getItem() { throw Error('denied'); } }), 280);
  assert.equal(readOverviewWidth({ getItem: () => '9999' }), 280);
  assert.deepEqual(overviewWidthLimits(400), { min: 180, max: 180 });
  assert.deepEqual(overviewWidthLimits(400, true), { min: 200, max: 384 });
});
