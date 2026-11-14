import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const require = createRequire(import.meta.url), host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const primitives = createRequire(host.resolve('@deepseek-ai/dsh-client-ui-primitives'));
const compiled = await build({ stdin: { contents: `export { applyDock } from './src/client/console/dock.jsx';
  export { BarChart } from './src/client/console/ui.jsx'; export { bindSidebar } from './src/client/console/nav.mjs';`, resolveDir: new URL('../', import.meta.url).pathname },
  bundle: true, write: false, format: 'cjs', platform: 'node', treeShaking: true,
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  plugins: [{ name: 'test-css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })); } }],
  alias: { '@deepseek-ai/dsh-client-ui-primitives': host.resolve('@deepseek-ai/dsh-client-ui-primitives') } });

test('real host controls render dock, console jumps and chart portals; resize and dismissal release observers', async t => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const observers = new Set();
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  }
  dom.window.ResizeObserver = ResizeObserver;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const values = { window: dom.window, document: dom.window.document, Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async path => Response.json(String(path).includes('/context?') ? { recordCount: 2, backlog: {} }
      : String(path).includes('/monitor/live?') ? { dream: { activeJobs: 1, job: { id: 'job', status: 'running', scope: 'session', done: 1, total: 2 } } }
      : { metrics: {} }) };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, values);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => {
    try { return require(name); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return primitives(name); }
  }, module, module.exports);
  const { applyDock, BarChart, bindSidebar } = module.exports;
  const entries = [], cleanups = [], jumps = [];
  const off = bindSidebar({ openTab: (...args) => jumps.push(args) });
  const ctx = { slots: {
    register(options, component) { entries.push({ options, component }); return () => {}; },
    inject(_name, setup) { cleanups.push(...setup()); },
  } };
  applyDock(ctx, [{ id: 'activity', order: 0 }, { id: 'usage', order: 1 }]);
  const props = { sessionId: 'synthetic', useSession: select => select({ subagent: null }),
    useSessions: select => select({ byId: { synthetic: { projectionValues: { agentPreset: 'oh-my-dsh' } } } }),
    useProjection: key => key === 'sessionStats' ? { turns: 1, steps: 2, decodeMs: 1000, decodeTokens: 10 }
      : { calls: 1, knownTotalTokens: 100, knownInputTokens: 90, uncachedInputTokens: 20, cacheReadTokens: 70, cacheWriteTokens: 0, outputTokens: 10 } };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount()); off(); cleanups.reverse().forEach(dispose => dispose());
    assert.equal(observers.size, 0);
    dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(async () => root.render(React.createElement(React.Fragment, null,
    ...entries.map(({ options, component }) => React.createElement(component, { ...props, key: options.id })),
    React.createElement(BarChart, { series: [{ label: '10:00', parts: { main: 100 } }], keys: [{ key: 'main', name: '主执行', color: 'blue' }] }))));
  for (const stat of ['activity', 'usage', 'omd-context', 'omd-dream']) assert.ok(document.querySelector(`[data-composer-stat="${stat}"]`), stat);
  const trigger = document.querySelector('[data-composer-stat="usage"] button');
  await act(() => trigger.click());
  let panel = document.querySelector('[role="dialog"]');
  assert.ok(panel); assert.match(panel.textContent, /用量概览/);
  const anchor = trigger.parentElement;
  anchor.getBoundingClientRect = () => ({ top: 5, bottom: 25, left: 290, right: 310, width: 20, height: 20 });
  panel.getBoundingClientRect = () => ({ width: 280, height: 250 });
  Object.defineProperties(dom.window, { innerWidth: { value: 320, configurable: true }, innerHeight: { value: 200, configurable: true } });
  await act(() => dom.window.dispatchEvent(new dom.window.Event('resize')));
  assert.equal(panel.style.left, '28px'); assert.equal(panel.style.top, '12px'); assert.equal(panel.style.maxHeight, '176px');
  await act(() => [...panel.querySelectorAll('button')].find(button => button.textContent.includes('用量概览')).click());
  assert.equal(jumps.length, 1); assert.equal(document.querySelector('[role="dialog"]'), null);
  await act(() => trigger.click());
  await act(() => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await act(() => trigger.click()); trigger.focus();
  await act(() => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(document.activeElement, trigger);
  await act(() => document.querySelector('.omc-bar').focus());
  assert.ok(document.querySelector('[role="tooltip"]')); assert.match(document.querySelector('[role="tooltip"]').textContent, /10:00/);
});
