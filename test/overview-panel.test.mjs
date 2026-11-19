import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useSyncExternalStore } from 'react';
import { readOverviewWidth, overviewWidthLimits, overviewDefaultWidth } from '../src/client/overview-panel-resize.mjs';
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/client/session-overview-panel.jsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
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
  let other, muted;
  function Toggle() { const panel = usePanel('root'); other = usePanel('new'); muted = usePanel('muted'); return e('button', { onClick: panel.toggle }, 'toggle'); }
  const { createRoot } = await import('react-dom/client'), root = createRoot(document.querySelector('main'));
  t.after(async () => { await act(() => root.unmount()); for (const off of cleanups.reverse()) off?.(); dom.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await act(() => root.render(e(React.Fragment, null, e(Toggle), e(Corner, { sessionId: 'root', actions: { setExpanded() {} }, useStore: select => select(useSyncExternalStore(subscribe, () => sidebar)) }), e(Main, { sessionId: 'root', renderFactorySlot: () => e(Chat) }))));
  await act(() => other.observeContent(true, true, false));
  assert.equal(other.open, false);
  await act(() => other.observeContent(false, true, true));
  assert.equal(other.open, true);
  await act(() => other.observeContent(false, true, false));
  assert.equal(other.open, true);
  await act(() => other.toggle());
  await act(() => other.observeContent(false, true, true));
  assert.equal(other.open, false);
  assert.equal(localStorage.getItem('omd.overview.session.v1.new'), 'closed');
  localStorage.setItem('omd.overview.autoOpen.v1', 'off');
  await act(() => muted.observeContent(true, true, false));
  await act(() => muted.observeContent(false, true, true));
  assert.equal(muted.open, false);
  await act(() => muted.toggle());
  assert.equal(muted.open, true);
  const layout = document.querySelector('.omd-overview-layout'), toggle = document.querySelector('button');
  const measured = [];
  Object.defineProperty(layout, 'clientWidth', { configurable: true, get() { measured.push(layout.getAttribute('data-overview-animating')); return 1000; } });
  const expand = async expanded => act(() => { sidebar = { bySession: { root: { layout: { expanded } } } }; listeners.forEach(fn => fn()); });
  // This session has content but automatic opening is disabled. Manual controls still work.
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
  const rail = document.querySelector('.omd-overview-rail');
  const measuredWidth = rail.getBoundingClientRect;
  rail.getBoundingClientRect = () => ({ width: 240 });
  await act(() => pointer('pointerdown', 700));
  assert.equal(layout.style.getPropertyValue('--omd-overview-preferred-width'), '240px', 'drag takes over the visible animation frame');
  await act(() => pointer('pointercancel', 700));
  rail.getBoundingClientRect = measuredWidth;
  await act(() => { pointer('pointerdown', 700); pointer('pointermove', 640); pointer('pointerup', 640); });
  assert.equal(readOverviewWidth(), 335);
  await act(() => { pointer('pointerdown', 700); pointer('pointermove', 600); pointer('pointercancel', 600); });
  assert.equal(readOverviewWidth(), 335, 'cancel preserves the committed width');
  await act(() => separator.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
  assert.equal(readOverviewWidth(), null);
  assert.equal(layout.style.getPropertyValue('--omd-overview-preferred-width'), '', 'reset restores responsive CSS sizing');
  await act(() => { pointer('pointerdown', 700); pointer('pointermove', 600); pointer('pointercancel', 600); });
  assert.equal(layout.style.getPropertyValue('--omd-overview-preferred-width'), '', 'cancelled drag keeps automatic sizing');
  await act(() => toggle.click()); assert.ok(!layout.hasAttribute('data-overview-open'));
});

test('width preferences tolerate denied storage and clamp to the available layout', () => {
  assert.equal(readOverviewWidth({ getItem() { throw Error('denied'); } }), null);
  assert.equal(readOverviewWidth({ getItem: () => '9999' }), null);
  assert.equal(readOverviewWidth({ getItem: () => '280' }), 280, 'existing manual widths remain intact');
  assert.equal(overviewDefaultWidth(1262), 347.05);
  assert.equal(overviewDefaultWidth(800), 240);
  assert.equal(overviewDefaultWidth(1800), 360);
  assert.deepEqual(overviewWidthLimits(400), { min: 180, max: 180 });
  assert.deepEqual(overviewWidthLimits(400, true), { min: 200, max: 384 });
});

test('cross-window choice changes preserve the local sidebar and ignore invalid stored values', async () => {
  const {overviewTransition:step}=await import('../src/client/overview-panel-state.mjs');
  let view=step({choice:'auto',sidebarExpanded:false},{type:'sidebar',expanded:true});
  assert.deepEqual(view,{choice:'auto',sidebarExpanded:true,open:true});
  view=step(view,{type:'storage',value:'closed'});assert.equal(view.open,false);assert.equal(view.sidebarExpanded,true);
  view=step(view,{type:'content',hasContent:true,enabled:true,recent:true});assert.equal(view.open,false);
  assert.equal(step(view,{type:'storage',value:'invalid'}).choice,null);
});
