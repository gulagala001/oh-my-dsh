import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { ProjectlessDrafts } from '../src/client/projectless-state.mjs';
import { mountOptionalClient } from '../src/client/optional-client.mjs';

const require = createRequire(import.meta.url), host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const sdk = name => import(pathToFileURL(host.resolve('@deepseek-ai/' + name)).href);
const gateway = await sdk('dsh-api-gateway/client'), { default: TypertRegistry } = await sdk('dsh-typert-registry');
const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'jsx', format: 'cjs' });
const nativeInject = async name => JSON.parse((await readFile(new URL(`../vendor/dsh/${name}/lib/client.js`, import.meta.url), 'utf8')).match(/const inject = (\[[\s\S]*?\]);/)[1]);
const conversationInject = await nativeInject('ui-conversation'), chatInject = await nativeInject('ui-chat');
const selectedModel = { provider: 'fixture', model: 'fixture-model', reasoningEffort: 'high' };
const empty = () => ({ draft: '', occurrences: [], attachmentIds: [] });
const store = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
const descriptor = (namespace, method, names) => ({
  id: `@fixture/${namespace}#${namespace}/${method}`, service: namespace, namespace, method, invocation: { kind: 'direct' },
  parameters: names.map(name => ({ name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: '@fixture#Value', create: () => z.unknown() } })),
  result: { mode: 'strict', typeSymbol: '@fixture#Result', create: () => z.unknown() },
});

async function fixture(t, { presetMounted = true } = {}) {
  const root = new Context(), capture = {}, calls = [], notices = [], rows = {}, shells = new Map();
  let current = 'source', serial = 0, references = 0, refusal = false;
  t.after(() => root.fiber.dispose());
  t.mock.method(globalThis, 'fetch', async path => Response.json(String(path).startsWith('omaa/')
    ? { handledWorkMode: false } : { selected: {}, mode: 'off', savedSubmode: 'free', revision: 1 }));
  const conversation = { input: { for: ctx => shells.get(ctx.id) }, rebindDraftFiles() {} };
  function session(id) {
    const listeners = new Set();
    const shell = { value: empty(), state: store({ phase: 'plain', draft: '', attachmentIds: [] }), notices: store(null),
      captureDraft() { return structuredClone(this.value); }, restoreDraft(value) { this.value = structuredClone(value); },
      onSubmission(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      submit() { calls.push(['submit', id, this.value.draft]); rows[id].blank = false; this.value = empty(); for (const fn of [...listeners]) fn({ kind: 'success' }); },
      notify(level, text) { notices.push([level, text]); }, focus() {},
    };
    shells.set(id, shell); rows[id] = { cwd: '/synthetic/' + id, blank: true };
    return { ctx: { id }, session: { projections: { faceOf: key => store(key === 'permissions' ? { currentValue: 'full-access' }
      : key === 'agentPreset' ? 'oh-my-dsh' : { next: selectedModel }) } } };
  }
  const bindings = new Map([['source', session('source')]]);
  const services = {
    sessions: { list: { getSnapshot: () => ({ ids: [...bindings.keys()], byId: rows }) }, binding: id => bindings.get(id),
      retainInfo: id => store({ retainedBy: { mainView: id === current ? 1 : 0 } }),
      async create({ sessionId = `new-${++serial}` }) { if (!bindings.has(sessionId)) bindings.set(sessionId, session(sessionId)); return sessionId; },
      retain(id) { references++; return { binding: bindings.get(id), ready: Promise.resolve(), release() { references--; } }; },
    },
    layout: { beginNavigation: () => new AbortController().signal },
    uiWorkspace: { openSession(id) { current = id; calls.push(['open', id]); } },
  };
  // Keep the actual entry's provider/child boundary and native dependency
  // manifests. Visual installers are stubs; Context and Gateway are real.
  const noop = () => {};
  const overrides = {
    createConversation: () => ({ inject: conversationInject, apply(ctx) { ctx.provide('conversation', conversation); ctx.provide('uiConversation', {}); } }),
    createChat: () => ({ inject: chatInject, apply: noop }),
    installConversationLifecycle: noop, applyStartupNotice: () => noop,
    createChatSettings: () => ({ dispose: noop }),
    applyProjectlessWorkspaces(ctx) {
      const saved = new Map();
      const drafts = new ProjectlessDrafts(ctx, { storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }, request: async () => ({ cwd: '/synthetic/independent' }) });
      ctx.effect(() => () => drafts.dispose()); capture.drafts = drafts; return drafts;
    },
    mountOptionalClient: (ctx, name, load, report) => mountOptionalClient(ctx, name, async () => ({
      ...await load(), apply(scope) { capture.enhancements = scope; },
    }), report),
  };
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: () => new Proxy({ __esModule: true, ...overrides }, { get: (target, key) => target[key] ?? noop }) });
  const plugin = module.exports;
  await root.plugin(TypertRegistry);
  root.provide('connection', { interactions: 'none', rpc: { open: async function* () {}, call: async (_path, endpoint, payload) => {
    if (endpoint === 'session/modelCatalog') return { ok: true, value: { default: selectedModel,
      groups: [{ id: selectedModel.provider, models: [{ id: selectedModel.model }] }], failures: [] } };
    calls.push([endpoint, payload.args]); return refusal ? { ok: false, error: { message: '选择预设失败' } } : { ok: true };
  } } });
  await root.plugin(gateway);
  await root.remote.$mount({ package: '@fixture/session', descriptors: [descriptor('session', 'selectModel', ['request']), descriptor('session', 'modelCatalog', []), descriptor('subagents', 'noop', [])] });
  let withdraw;
  const mountPreset = async () => { withdraw = await root.remote.$mount({ package: '@fixture/presets', descriptors: [descriptor('agentPresets', 'select', ['sessionId', 'preset'])] }); };
  if (presetMounted) await mountPreset();
  for (const key of new Set([...plugin.inject, 'sidebarRightTabs', 'theme', 'modules', 'remote.subagents'])) {
    if (!key.startsWith('remote') && root.get(key) === undefined) root.provide(key, services[key] ?? {});
  }
  const fiber = root.plugin(plugin); await fiber;
  return { root, capture, fiber, calls, notices, shells, get current() { return current; }, get references() { return references; },
    mountPreset, withdraw: () => withdraw(), refuse: value => { refusal = value; } };
}

test('first independent send preserves settings and the next new chat reuses its carrier without copying the viewed chat', async t => {
  const f = await fixture(t), { drafts } = f.capture;
  assert.equal(f.fiber.state, 2);
  drafts.mark('source'); f.shells.get('source').restoreDraft({ ...empty(), draft: '你好' });
  await drafts.send('source', f.shells.get('source'), 'queue', []);
  assert.deepEqual(f.notices, []);
  assert.equal(f.calls.filter(call => call[0] === 'submit').length, 1);
  assert.equal(f.shells.get('source').captureDraft().draft, '');
  assert.notEqual(f.current, 'source');
  await drafts.startDraft(f.current);
  assert.deepEqual(f.notices, []);
  assert.equal(f.current, 'source');
  assert.equal(f.calls.filter(call => call[0] === 'agentPresets/select').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'session/selectModel').length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'session/selectModel').map(call => call[1].request),
    f.calls.filter(call => call[0] === 'agentPresets/select').map(call => ({ sessionId: call[1].sessionId, ...selectedModel })));
  assert.equal(drafts.isDraft(f.current), true);
  assert.equal(f.references, 0);
});

test('enhancement callbacks can resolve the sibling Conversation provider', async t => {
  const f = await fixture(t), scope = f.capture.enhancements;
  assert.equal(scope.conversation, f.root.get('conversation'));
  assert.ok(scope.remote.session);
  assert.ok(scope.remote.subagents);
});

test('preset availability gates the owning plugin and withdrawal recreates its dependent scopes', async t => {
  const f = await fixture(t, { presetMounted: false });
  assert.equal(f.fiber.state, 0); assert.equal(f.capture.drafts, undefined);
  await f.mountPreset(); await f.fiber.await();
  assert.equal(f.fiber.state, 2);
  const previous = f.capture.drafts;
  await f.withdraw(); await f.fiber.await();
  assert.equal(f.fiber.state, 0); assert.equal(previous.lifetime.signal.aborted, true);
  await f.mountPreset(); await f.fiber.await();
  assert.equal(f.fiber.state, 2); assert.notEqual(f.capture.drafts, previous);
  await f.capture.drafts.copySettings('source', 'source');
});

test('a refused preset preserves the source draft and retry identity without admitting a message', async t => {
  const f = await fixture(t), { drafts } = f.capture, source = f.shells.get('source');
  drafts.mark('source'); source.restoreDraft({ ...empty(), draft: '保留原稿' });
  const choice = drafts.drafts.source;
  f.refuse(true); await drafts.send('source', source, 'queue', []);
  assert.equal(source.captureDraft().draft, '保留原稿'); assert.equal(drafts.drafts.source, choice);
  assert.deepEqual(f.notices, [['error', '选择预设失败']]);
  assert.equal(f.calls.filter(call => call[0] === 'submit').length, 0); assert.equal(f.references, 0);
  f.refuse(false); await drafts.send('source', source, 'queue', []);
  assert.equal(f.calls.filter(call => call[0] === 'submit').length, 1); assert.equal(f.references, 0);
});
