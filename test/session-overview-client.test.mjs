import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useSyncExternalStore } from 'react';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/client/session-overview.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const emptyOverview = () => ({ sources: [], outputs: [], workflows: [] });
const store = initial => {
  let value = initial; const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; listeners.forEach(fn => fn()); } };
};

async function fixture(t, state, chat = { nodes: { values: () => [] } }, events = [], withComputer = true) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const globals = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const hostRequire = name => name === '@deepseek-ai/dsh-client-ui-primitives'
    ? { Menu: ({ open, anchor, items, onSelect }) => React.createElement(React.Fragment, null, anchor, open && items.map(item => React.createElement('button', { key: item.id, onClick: () => onSelect(item.id) }, item.label))), Button: ({ children, size, variant, ...props }) => React.createElement('button', props, children), StateDot: () => null, IconUsersOutlineRegular: () => null, IconChevronDownOutlineRegular: () => null }
    : name === '@deepseek-ai/dsh-client-store' ? {} : require(name);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(hostRequire, module, module.exports);
  const sessions = store(state), statuses = new Map(), cleanups = [], ledgers = new Map(), subscriptions = new Map();
  let latest, eventReads = 0, chatReads = 0;
  const slots = {
    entries: name => ledgers.get(name) ?? [], entriesOfSlot: name => (ledgers.get(name) ?? []).filter(entry => !entry.options.priority),
    subscribe(name, fn) { const set = subscriptions.get(name) ?? new Set(); subscriptions.set(name, set); set.add(fn); return () => set.delete(fn); },
    register(options, component) {
      const rows = ledgers.get(options.name) ?? []; ledgers.set(options.name, rows);
      const entry = { options, component }; rows.push(entry);
      subscriptions.get(options.name)?.forEach(fn => fn());
      return () => { rows.splice(rows.indexOf(entry), 1); subscriptions.get(options.name)?.forEach(fn => fn()); };
    },
    inject(_name, setup) { const dispose = setup(); if (typeof dispose === 'function') cleanups.push(dispose); },
  };
  slots.register({ name: 'conversation.session.header.actions', id: 'subagent-catalog', key: 'catalog' }, () => React.createElement('span', null, 'Native catalog'));
  const refreshCalls = [], deferred = new Map();
  const replace = (id, snapshot) => sessions.set({ ...sessions.getSnapshot(), projectionsBySession: { ...sessions.getSnapshot().projectionsBySession, [id]: snapshot } });
  const opened = [];
  const ctx = { slots, sidebarRight: { openTabIn(...args) { opened.push(args); } },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanups.push(dispose); }, inject(_keys, fn) { fn(ctx); },
    locale: { register: () => () => {}, bind: () => key => key },
    jobs: { state: store({ rows: {} }), watchRows: () => () => {} },
    sessions: { binding: () => ({ eventSource: { subscribe: () => () => {}, getSnapshot: () => { eventReads++; return eventSnapshot; } } }),
      refreshProjections(id) {
        refreshCalls.push(id); const operation = Promise.withResolvers(); deferred.set(id, operation);
        replace(id, { ...sessions.getSnapshot().projectionsBySession[id], state: 'loading', error: null });
        return operation.promise;
      } },
    sidebarRightTabs: { get: () => null, register: () => () => {} },
  };
  const eventSnapshot = { entries: events };
  const provide = module.exports.applySessionOverview(ctx);
  const ComputerOverview = props => {
    latest = props.overview;
    return React.createElement('div', { 'data-overview': props.variant });
  };
  if (withComputer) provide(ComputerOverview);
  const props = { sessionId: 'root', useSessions: select => select(useSyncExternalStore(sessions.subscribe, sessions.getSnapshot)),
    useSessionStatus: select => select(statuses), useChat: select => { chatReads++; return select(chat); } };
  const Header = slots.entries('conversation.session.header.utilities').find(entry => entry.options.id === 'omd-session-overview').component;
  const Native = slots.entries('conversation.session.header.actions')[0].component;
  const pages = (withComputer ? ['agents'] : ['agents', 'sources', 'outputs']).map(variant =>
    slots.entries('sidebar.right.pane.tab').find(entry => entry.options.key === 'oh-my-dsh/omd-' + variant).component);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    for (const dispose of cleanups.reverse()) dispose();
    dom.window.close();
    for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(() => root.render(React.createElement(React.Fragment, null, React.createElement(Header, props), React.createElement(Native, props), ...pages.map((Page, index) => React.createElement(Page, { ...props, key: index })))));
  return { opened, provideComputer: () => provide(ComputerOverview), get latest() { return latest; }, get scans() { return { events: eventReads, chat: chatReads }; }, refreshCalls, replace, dom,
    async resolve(id, values) { await act(async () => { replace(id, { state: 'ready', error: null, values }); deferred.get(id)?.resolve(); }); } };
}

test('complete projections own workflow outcomes and resources despite stale or truncated chat windows', async t => {
  const durableRun = { id: 'run', anchorSeq: 4, data: { name: 'failure', status: 'failed', failures: ['cleanup failed'], phases: [] } };
  const staleRun = { ...durableRun, kind: 'workflow-run', data: { ...durableRun.data, status: 'completed', failures: undefined } };
  const output = { id: '/result.txt', path: '/result.txt', label: 'Confirmed output' };
  const source = { id: 'file:attachment', kind: 'file', label: 'Confirmed source', file: { attachmentId: 'attachment', name: 'Confirmed source' } };
  const durable = { workflows: [durableRun], outputs: [output], sources: [source] };
  const oldOutput = { path: '/result.txt', title: 'Old window output' };
  const chat = { nodes: { values: () => [staleRun, { location: { turn: { turn: 1, data: new Map([['deliverables', { produced: [oldOutput] }]]) } } }] } };
  const events = [{ type: 'user/message', surfaceOp: 'append', data: { content: [{ type: 'file', attachment: { attachmentId: 'attachment', name: 'Old window source' } }] } }];
  const f = await fixture(t, { byId: {}, projectionsBySession: { root: { state: 'ready', values: { omdOverview: durable } } } }, chat, events);
  assert.equal(f.latest.workflows[0].data.status, 'failed');
  assert.deepEqual(f.latest.outputs, [output]); assert.deepEqual(f.latest.sources, [source]);
  assert.deepEqual(f.scans, { events: 0, chat: 0 }, 'the summary does not rebuild facts from the loaded transcript');
  assert.deepEqual(f.refreshCalls, [], 'ready native snapshots do not need a second revision tracker');
});

test('projection failures stay visible without automatic retries and recover through the native reader', async t => {
  const f = await fixture(t, { byId: {}, projectionsBySession: {
    root: { state: 'ready', values: { omdOverview: emptyOverview(), subagentCatalog: [{ id: 'child', mode: 'continuable', label: 'Child' }] } },
    child: { state: 'error', error: { message: 'Synthetic read failure' }, values: {} },
  } });
  assert.deepEqual(f.refreshCalls, []);
  assert.match(f.dom.window.document.body.textContent, /Synthetic read failure/);
  assert.match(f.dom.window.document.body.textContent, /Native catalog/);
  const retry = [...f.dom.window.document.querySelectorAll('button')].find(button => /重试/.test(button.textContent));
  assert.ok(retry);
  await act(() => retry.click());
  assert.deepEqual(f.refreshCalls, ['child']);
  await f.resolve('child', { omdOverview: emptyOverview(), subagentCatalog: [{ id: 'nested', mode: 'continuable' }] });
  assert.deepEqual(f.refreshCalls, ['child', 'nested']);
  await f.resolve('nested', { omdOverview: { ...emptyOverview(), outcome: 'aborted' } });
  assert.equal(f.latest.rows.find(row => row.id === 'nested').status, 'cancelled');
  assert.doesNotMatch(f.dom.window.document.body.textContent, /Synthetic read failure|Native catalog/);
  assert.deepEqual(f.refreshCalls, ['child', 'nested']);
});

test('without a computer presenter the same overview opens jobs and keeps its resources across provider reloads', async t => {
  const resources = { ...emptyOverview(), sources: [{ id: 'attachment', kind: 'file', label: 'notes.md' }],
    outputs: [{ id: 'report', path: '/report.md', label: 'report.md' }] };
  const f = await fixture(t, { byId: {}, projectionsBySession: {
    root: { state: 'ready', values: { omdOverview: resources, subagentCatalog: [{ id: 'child', label: 'Reviewer', mode: 'continuable' }] } },
    child: { state: 'ready', values: { omdOverview: emptyOverview() } },
  } }, undefined, [], false);
  const document = f.dom.window.document;
  const header = () => document.querySelectorAll('[aria-label="会话总览"]');
  assert.equal(header().length, 1);
  assert.match(document.body.textContent, /Reviewer/);
  assert.match(document.body.textContent, /notes.md/);
  assert.match(document.body.textContent, /report.md/);
  await act(() => header()[0].click());
  await act(() => [...document.querySelectorAll('button')].find(button => button.textContent === '后台进程').click());
  assert.deepEqual(f.opened[0].slice(0, 2), ['root', 'omd-jobs']);
  let remove;
  await act(() => { remove = f.provideComputer(); });
  assert.equal(header().length, 1); assert.ok(document.querySelector('[data-overview="sources"]'));
  await act(() => remove());
  assert.equal(header().length, 1); assert.match(document.body.textContent, /notes.md/);
  assert.deepEqual(f.refreshCalls, []);
});
