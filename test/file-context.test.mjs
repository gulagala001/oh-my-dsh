import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useContext, useSyncExternalStore } from 'react';
import { absolutePath, directoryAt, resolveFilePath, fileImageUrl } from '../src/file-paths.mjs';
import { foldOverview, installOverviewProjection } from '../src/session-overview-projection.mjs';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [new URL('../src/client/file-context.jsx', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const store = value => {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of listeners) fn(); } };
};
const changed = (seq, cwd) => ({ type: 'working-directory/change', seq, data: { cwd } });

test('full-log directory checkpoints and outputs retain their original locations across switches and forks', () => {
  let definition;
  installOverviewProjection({ sessionProjections: { register: value => { definition = value; } } });
  let state = definition.init({ cwd: '/chat' }, 10);
  state = definition.apply(state, changed(3, '/chat/first'));
  assert.equal(directoryAt(state.directories, 2), '/chat');
  assert.equal(directoryAt(state.directories, 10), '/chat/first', 'inherited directory events are retained');
  state = definition.apply(state, { type: 'tool/call', seq: 11, data: { callId: 'write', name: 'write', arguments: '{"file_path":"same.txt","content":"one"}' } });
  state = definition.apply(state, changed(12, '/chat/second'));
  state = definition.apply(state, { type: 'tool/result', seq: 13, surfaceOp: 'append', data: { message: { source: { callId: 'write' } } } });
  state = definition.apply(state, { type: 'deliverables/presented', seq: 14, data: { files: [{ path: 'same.txt' }] } });
  assert.deepEqual(state.outputs.map(file => file.path), ['/chat/first/same.txt', '/chat/second/same.txt']);
  state = definition.apply(state, changed(15, '/chat/first')); // native rewind/restoration
  assert.equal(directoryAt(state.directories, 11), '/chat/first');
  assert.equal(directoryAt(state.directories, 14), '/chat/second');
  assert.equal(directoryAt(state.directories), '/chat/first');
  assert.deepEqual(definition.stateSchema.parse(state), state);
  assert.deepEqual(definition.wire.viewSchema.parse(definition.wire.view(state)).directories, state.directories);
});

test('paths preserve absolute targets, platform spelling, encoding and native media transport restrictions', () => {
  assert.equal(resolveFilePath('/chat/中文', 'image #1%.png'), '/chat/中文/image #1%.png');
  assert.equal(resolveFilePath('C:\\chat', 'sub\\image.png'), 'C:\\chat\\sub\\image.png');
  assert.equal(resolveFilePath('/chat', 'D:\\other\\file.png'), 'D:\\other\\file.png');
  assert.equal(resolveFilePath('/chat', '/elsewhere/file.png'), '/elsewhere/file.png');
  assert.ok(absolutePath('\\\\server\\share\\file.png'));
  const path = '/chat/中文/image #1%.png';
  for (const base of ['http://localhost/prefix/', 'dsh-app://app/']) {
    const url = new URL(fileImageUrl(base, path));
    assert.equal(url.searchParams.get('path'), path);
    assert.equal(url.pathname, base.includes('prefix') ? '/prefix/api/file' : '/api/file');
  }
  assert.equal(fileImageUrl('file:///app/', path), undefined);
  assert.equal(fileImageUrl('http://localhost/', 'relative.png'), undefined);
  assert.equal(fileImageUrl('http://localhost/', '//server/share.png'), undefined);
  assert.equal(fileImageUrl('http://localhost/', '/bad\0.png'), undefined);
});

async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/base/' });
  const globals = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const MarkdownContext = React.createContext(null), module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => name === '@deepseek-ai/dsh-client-ui-primitives'
    ? { MarkdownDelegateProvider: ({ children, ...props }) => React.createElement(MarkdownContext.Provider, { value: props }, children) }
    : require(name), module, module.exports);
  const cleanups = [], ledgers = new Map(), subscriptions = new Map();
  const slots = {
    entries: name => ledgers.get(name) ?? [], entriesOfSlot: name => (ledgers.get(name) ?? []).filter(entry => !entry.options.priority),
    subscribe(name, fn) { const set = subscriptions.get(name) ?? new Set(); subscriptions.set(name, set); set.add(fn); return () => set.delete(fn); },
    register(options, component) {
      const rows = ledgers.get(options.name) ?? []; ledgers.set(options.name, rows);
      const entry = { options, component }; rows.push(entry); subscriptions.get(options.name)?.forEach(fn => fn());
      return () => { rows.splice(rows.indexOf(entry), 1); subscriptions.get(options.name)?.forEach(fn => fn()); };
    },
  };
  const identity = store({ byId: { one: { cwd: '/chat' }, two: { cwd: '/other' } } });
  const projections = store({ workingDirectory: '/chat/named', omdOverview: { directories: [{ seq: -1, cwd: '/chat' }, { seq: 3, cwd: '/chat/named' }] } });
  const calls = [], refs = [], errors = [], nativeOpen = (path, options) => { calls.push({ path, options }); return Promise.resolve(); };
  const originalReference = function(source, ref) { refs.push({ source, ...ref }); return true; };
  const controller = { openReference: originalReference };
  const ctx = { slots, effect(fn) { const off = fn(); if (typeof off === 'function') cleanups.push(off); },
    sessions: { binding: () => ({ ctx: {} }) }, get: name => name === 'inputTriggers' ? { sessionOf: () => controller } : undefined };
  const standard = { sessionId: 'one',
    useSessions: select => select(useSyncExternalStore(identity.subscribe, identity.getSnapshot)),
    useProjection: (key, select = value => value) => select(useSyncExternalStore(projections.subscribe, projections.getSnapshot)[key]),
    t: key => key, openExternalLink: url => calls.push({ external: url }) };
  let view, node, markdown;
  const refEntry = slots.register({ name: 'conversation.user.text.node', key: 'file' }, props => React.createElement('button', { id: 'ref', onClick: () => props.openFile('reference.txt') }, 'reference'));
  slots.register({ name: 'conversation.chat.node', key: 'assistant-step' }, props => {
    node = props; markdown = useContext(MarkdownContext);
    const Ref = slots.entries('conversation.user.text.node')[0].component;
    return React.createElement(React.Fragment, null,
      React.createElement('img', { id: 'image', src: markdown.fileImages.resolve('preview #1.png') }),
      React.createElement(Ref, { ...standard, openFile: () => { throw Error('wrong reference opener'); } }));
  });
  slots.register({ name: 'conversation.composer.bar' }, () => null);
  slots.register({ name: 'conversation.view', id: 'chat' }, props => {
    view = props;
    const Node = slots.entries('conversation.chat.node')[0].component;
    const Composer = slots.entries('conversation.composer.bar')[0].component;
    // The pinned native ChatView catches opener failures and owns its dialog.
    const openFile = (path, options) => Promise.resolve(props.openFile(path, options)).catch(error => errors.push(error.message));
    return React.createElement(React.Fragment, null,
      React.createElement(Node, { ...standard, openFile, node: { anchorSeq: 5 } }),
      React.createElement(Composer, standard));
  });
  module.exports.applyFileContext(ctx);
  const View = slots.entries('conversation.view')[0].component;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount()); for (const off of cleanups.reverse()) off();
    assert.equal(controller.openReference, originalReference);
    dom.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(() => root.render(React.createElement(View, { ...standard, openFile: nativeOpen })));
  return { calls, refs, errors, identity, projections, controller, get view() { return view; }, get node() { return node; }, get markdown() { return markdown; }, dom };
}

test('inline image, click, @file and composer use their owners without changing session identity', async t => {
  const f = await fixture(t);
  assert.equal(new URL(f.dom.window.document.querySelector('img').src).searchParams.get('path'), '/chat/named/preview #1.png');
  await act(() => f.markdown.openFile('game.js', { line: 12 }));
  assert.deepEqual(f.calls.pop(), { path: '/chat/named/game.js', options: { line: 12 } });
  await act(() => f.dom.window.document.getElementById('ref').click());
  assert.equal(f.calls.pop().path, '/chat/named/reference.txt');
  await act(() => f.projections.set({ workingDirectory: '/chat/second', omdOverview: { directories: [
    { seq: -1, cwd: '/chat' }, { seq: 3, cwd: '/chat/named' }, { seq: 8, cwd: '/chat/second' },
  ] } }));
  await act(() => f.markdown.openFile('game.js'));
  assert.equal(f.calls.pop().path, '/chat/named/game.js', 'historical message keeps its own directory');
  await act(() => f.view.openFile('new.js'));
  assert.equal(f.calls.pop().path, '/chat/second/new.js');
  f.controller.openReference('reference', { appearance: 'file', ref: '@"draft.txt"' });
  assert.equal(f.refs.pop().ref, '@"/chat/second/draft.txt"');
  f.controller.openReference('third-party', { appearance: 'file', ref: '@"draft.txt"' });
  assert.equal(f.refs.pop().ref, '@"draft.txt"');
  f.markdown.openExternalLink('https://example.com/');
  assert.equal(f.calls.pop().external, 'https://example.com/');
  assert.equal(f.identity.getSnapshot().byId.one.cwd, '/chat');
  assert.equal(f.identity.getSnapshot().byId.two.cwd, '/other');
});

test('missing historical directory metadata goes through the native error path instead of opening a wrong same-name file', async t => {
  const f = await fixture(t);
  await act(() => f.projections.set({ workingDirectory: '/chat/second' }));
  assert.equal(f.markdown.fileImages.resolve('preview.png'), undefined);
  await act(() => f.markdown.openFile('preview.png'));
  assert.equal(f.calls.length, 0);
  assert.match(f.errors[0], /目录信息/);
  await act(() => f.markdown.openFile('/fixed/preview.png'));
  assert.equal(f.calls.pop().path, '/fixed/preview.png');
});
