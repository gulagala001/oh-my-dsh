import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const { Context, Service, symbols } = require('@deepseek-ai/cordis');
const schema = require('@deepseek-ai/schemastery');
const noop = () => {};
function store(value) { return { getSnapshot: () => value, set: next => { value = next; }, subscribe: () => noop }; }
async function loadProduction(file, imports) {
  const source = await readFile(new URL('../vendor/dsh/ui-conversation/src/client/' + file, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: imports, console, setTimeout, clearTimeout,
    AbortController, URL, crypto: globalThis.crypto });
  return module.exports;
}

// UI/network collaborators are synthetic; apply.ts and service.ts are compiled
// unchanged. The real pinned Cordis owns startup, strict service visibility,
// failure propagation and teardown. No model or browser is started.
async function fixture() {
  const root = new Context(), entries = new Set(), factories = new Map(), waits = new Set();
  const slots = new class extends Service {
    constructor() { super(root, 'slots'); }
    entries() { return []; }
    subscribe() { return noop; }
    registerFactory(options) { return this.ctx.effect(() => { factories.set(options.name, options); return () => factories.delete(options.name); }); }
    register(options, component) {
      const ctx = this.ctx;
      return ctx.effect(() => {
        const row = { options, component, ctx }; entries.add(row);
        for (const wait of waits) wait.reconcile();
        return () => { entries.delete(row); };
      });
    }
    inject(name, callback) {
      const ctx = this.ctx;
      return ctx.effect(() => {
        let dispose;
        const wait = { reconcile() {
          const declared = name === 'main' || name === 'settings.general.item'
            || [...entries].some(row => row.options.children?.[name])
            || [...factories.values()].some(options => options.children?.[name])
            || (name === 'conversation.user.text.node' && factories.has('conversation.user.text'));
          if (declared && !dispose) { dispose = noop; dispose = ctx.effect(callback); }
        } };
        waits.add(wait); wait.reconcile();
        return () => { waits.delete(wait); dispose?.(); };
      });
    }
  }();
  const actual = await loadProduction('service.ts', name => {
    if (name === '@deepseek-ai/cordis') return { Service };
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: store };
    if (name === '@deepseek-ai/dsh-util-crypto') return { randomUUID: () => 'synthetic' };
    throw Error('Unexpected controller runtime dependency: ' + name);
  });
  let resolve, reject, entered = false;
  const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
  const controller = { name: 'delayed-real-conversation-controller', async apply(ctx, config) {
    entered = true; await gate; new actual.ConversationController(ctx, config);
  } };
  let hooksInstalled = false;
  const uiConversation = class extends Service {
    constructor(ctx) { super(ctx, 'uiConversation'); this.userText = { register: noop }; this.views = { entries: () => [] }; }
  };
  const dependencies = {
    UiConversation: uiConversation, InputHub: class {}, ComposerBlockRegistry: class {},
    ComposerSubmissionPolicy: class { busyEnter = store('queue'); dispose() {} },
    createSnapshotStore: store, createConversationStore: () => ({}), resolveActiveView: noop,
    createElement: (type, props) => ({ type, props }), useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    resolveSlotLabel: value => value, NS: 'conversation', zh: {}, en: {},
    CONVERSATION_SETTINGS_NAMESPACE: 'conversation', todoDockEntry: { apply: noop }, queueDockEntry: { apply: noop },
  };
  const queue = await loadProduction('queue/QueueDock.tsx', () => new Proxy({ NS: 'conversation' }, { get: (target, key) => key in target ? target[key] : noop }));
  const production = await loadProduction('apply.ts', name => {
    if (name === '@deepseek-ai/schemastery') return schema;
    if (name === './service.ts') return { ...actual, ConversationController: controller };
    return new Proxy(dependencies, { get: (target, key) => key in target ? target[key] : noop });
  });
  const observable = { ...store(false), subscribe: () => noop };
  for (const [name, value] of Object.entries({ sessions: { list: store({ byId: {} }) }, remote: {}, fileUpload: {},
    uiSession: { provide: () => { hooksInstalled = true; } }, uiWorkspace: {},
    locale: { register: () => noop, bind: () => () => '', subscribe: () => noop },
    configForms: { get: () => observable, developerTools: { enabled: observable } } })) root.provide(name, value);
  const owner = root.plugin({ ...production, name: 'production-conversation-assembly' });
  for (let count = 0; !entered && count < 30; count++) await new Promise(resolve => setImmediate(resolve));
  if (!entered) await owner;
  assert(entered, 'Real production apply must reach controller startup: ' + owner.state + ' services=' + production.inject.map(name => name + ':' + Boolean(root.get(name))).join(','));
  assert(hooksInstalled, 'Session hook roster is installed before controller startup');
  return { root, owner, entries, factories, waits, resolve, reject, slots, queue: queue.queueDockEntry };
}

test('production declares the slot tree first and waits for controller readiness before rendering a Session', async () => {
  const f = await fixture();
  const main = [...f.entries].find(row => row.options.name === 'main');
  assert(main, 'Native consumers need the complete slot tree before the controller becomes available');
  assert.equal(main.component({}), null, 'The selected Session must stay unmounted while its controller is loading');
  assert.equal(f.root.get('conversation'), undefined);
  f.resolve(); await f.owner;
  assert.notEqual(main.component({}), null, 'The ready gate admits the selected Session after controller startup');
  for (const name of ['main', 'main.conversation', 'conversation.session', 'conversation.header',
    'conversation.session.header', 'conversation.composer.bar']) assert([...f.entries].some(row => row.options.name === name), name);
  const composer = [...f.entries].find(row => row.options.name === 'conversation.composer.bar');
  // Strict visibility through the real publishing context is the crash boundary.
  assert(composer.ctx.get('conversation') instanceof Service);
  const provider = composer.ctx.get('conversation')[symbols.original];
  assert(provider, 'Read the original service, not the caller-rebound tracker ctx');
  assert.equal(provider.ctx.fiber.state, 2);
  assert.notEqual(provider.ctx.fiber.uid, f.owner.uid);
  assert.equal(provider.ctx.fiber.parent.fiber.uid, f.owner.uid);
  await f.owner.dispose();
  assert.equal(f.entries.size, 0); assert.equal(f.factories.size, 0); assert.equal(f.waits.size, 0);
});

test('production controller startup failure leaves no slot contributions', async () => {
  const f = await fixture();
  f.reject(Error('synthetic controller startup failure'));
  await assert.rejects(async () => await f.owner, /synthetic controller startup failure/);
  assert.equal(f.entries.size, 0); assert.equal(f.factories.size, 0); assert.equal(f.waits.size, 0);
});

test('unloading the production owner while controller waits prevents late registrations', async () => {
  const f = await fixture();
  const disposal = f.owner.dispose();
  f.resolve(); await disposal;
  assert.equal(f.entries.size, 0); assert.equal(f.factories.size, 0); assert.equal(f.waits.size, 0);
  assert.equal(f.root.get('conversation'), undefined);
});

test('real adjacent QueueDock consumer waits for services/declaration and unloads cleanly', async () => {
  const f = await fixture();
  const consumer = f.root.plugin(f.queue);
  assert.equal([...f.entries].some(row => row.options.id === 'queue'), false);
  f.resolve(); await f.owner; await consumer;
  const queue = [...f.entries].find(row => row.options.id === 'queue');
  assert(queue, 'Actual QueueDock module registers after the tree is published');
  const provider = queue.ctx.get('conversation')[symbols.original];
  assert(provider); assert.equal(provider.ctx.fiber.state, 2);
  assert.equal(provider.ctx.fiber.parent.fiber.uid, f.owner.uid);
  assert.notEqual(provider.ctx.fiber.uid, consumer.uid);
  await consumer.dispose(); await f.owner.dispose();
  assert.equal(f.entries.size, 0); assert.equal(f.waits.size, 0);
});
