import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bindLiveLoaderEntries, entryIsRegistered, installLoaderLifecycleCompatibility } from '../src/loader-lifecycle-compat.mjs';

function fixture() {
  const tree = { store: {}, ctx: { fiber: {} } };
  const entry = id => { const value = { options: { id }, parent: { tree }, get disabled() { return this.options.group ? false : Boolean(this.options.disabled); } }; tree.store[id] = value; return value; };
  const loader = { *entries() { yield* Object.values(tree.store); } };
  return { tree, entry, loader };
}

test('a suspended loader scan never diagnoses a removed entry as an import failure', () => {
  const f = fixture(), a = f.entry('a'), b = f.entry('b');
  const baseline = f.loader.entries(); baseline.next(); delete f.tree.store.b;
  assert.equal(baseline.next().value, b, 'reproduce the original stale snapshot');
  f.tree.store.b = b; const dispose = bindLiveLoaderEntries(f.loader);
  const live = f.loader.entries(); assert.equal(live.next().value, a); delete f.tree.store.b;
  assert.equal(live.next().done, true); dispose();
});

test('registered failed imports are retained and replaced identities are not resurrected', () => {
  const f = fixture(), a = f.entry('a'), old = f.entry('same'); bindLiveLoaderEntries(f.loader);
  const scan = f.loader.entries(); assert.equal(scan.next().value, a);
  const next = f.entry('same'); assert.equal(entryIsRegistered(old), false);
  assert.equal(scan.next().done, true);
  assert.deepEqual([...f.loader.entries()], [a, next]); assert.equal(next.fiber, undefined);
});

test('entries whose owning include was removed are no longer runtime entries', () => {
  const outer = fixture(), owner = outer.entry('include'), nested = fixture();
  nested.tree.ctx.fiber.entry = owner;
  const child = nested.entry('child'); assert.equal(entryIsRegistered(child), true);
  delete outer.tree.store.include; assert.equal(entryIsRegistered(child), false);
});

test('host-lifetime installation is idempotent and releases the original method', () => {
  const f = fixture(), original = f.loader.entries, effects = [];
  const root = { effect(run) { effects.push(run()); } }, ctx = { root, loader: f.loader };
  installLoaderLifecycleCompatibility(ctx); const wrapped = f.loader.entries;
  installLoaderLifecycleCompatibility(ctx); assert.equal(f.loader.entries, wrapped);
  assert.equal(effects.length, 1); effects[0](); assert.equal(f.loader.entries, original);
});


test('an explicitly removing row is not reported as a failed import while its disposer is pending', async () => {
  const f = fixture(), value = f.entry('plugin'); let finish;
  value.parent.remove = async function (id) { value.fiber = undefined; await new Promise(resolve => { finish = resolve; }); delete this.tree.store[id]; };
  value.fiber = { state: 2 };
  const dispose = bindLiveLoaderEntries(f.loader), removing = value.parent.remove('plugin');
  assert.equal(f.tree.store.plugin, value, 'reproduce the host retaining the row during disposal');
  assert.deepEqual([...f.loader.entries()], []);
  finish(); await removing; assert.deepEqual([...f.loader.entries()], []); dispose();
});

test('failed removal rejects with its original error and keeps the retained row diagnosable', async () => {
  const f = fixture(), value = f.entry('plugin'), failure = new Error('cleanup failed');
  value.parent.remove = async () => { throw failure; };
  const original = value.parent.remove, dispose = bindLiveLoaderEntries(f.loader);
  await assert.rejects(value.parent.remove('plugin'), error => error === failure);
  assert.deepEqual([...f.loader.entries()], [value]); dispose();
  assert.equal(value.parent.remove, original);
});


test('loader settlement waits for removal completion rather than only the disposed fiber', async () => {
  const f = fixture(), value = f.entry('plugin'); let finish, settled = false;
  f.loader.await = async () => 'settled';
  value.parent.remove = async function (id) {
    value.fiber = undefined; await new Promise(resolve => { finish = resolve; });
    delete this.tree.store[id];
  };
  const originalAwait = f.loader.await, dispose = bindLiveLoaderEntries(f.loader);
  const removal = value.parent.remove('plugin');
  const waiting = f.loader.await().then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(settled, false);
  finish(); await removal; assert.equal(await waiting, 'settled');
  dispose(); assert.equal(f.loader.await, originalAwait);
});

test('profile handoff retires OMD services before originals activate and keeps rollback data', async () => {
  const f = fixture(), old = { id: 'omd-tools', name: 'trisoul_x/host/tools' };
  const events = [], group = { tree: f.tree, data: [old],
    async remove(id, keep) { events.push(['remove', id, keep]); delete this.tree.store[id]; },
    async update(config) {
      assert.equal(this.tree.store['omd-tools'], undefined, 'exclusive provider is released before the replacement starts');
      assert.deepEqual(this.data, [old], 'host rollback still sees the old configuration');
      events.push(['apply', config]); this.data = config;
    },
  };
  f.tree.root = group; f.tree.filename = '/fixture/cordis.yml';
  f.tree.store[old.id] = { options: old, parent: group };
  f.loader.await = async () => {};
  const original = group.update, dispose = bindLiveLoaderEntries(f.loader);
  const config = [{ id: 'tools', name: '@deepseek-ai/dsh-tools' }];
  const update = group.update(config); await f.loader.await(); await update;
  assert.deepEqual(events, [['remove', old.id, true], ['apply', config]]);
  dispose(); assert.equal(group.update, original);
});

test('failed provider retirement restores the prior configuration and rejects', async () => {
  const f = fixture(), old = { id: 'omd-tools', name: 'trisoul_x/host/tools' }, failure = new Error('release failed');
  let restored;
  const group = { tree: f.tree, data: [old], remove() { throw failure; }, update(config) { restored = config; } };
  f.tree.root = group; f.tree.filename = '/fixture/cordis.yml';
  f.tree.store[old.id] = { options: old, parent: group };
  const dispose = bindLiveLoaderEntries(f.loader);
  await assert.rejects(group.update([]), error => error === failure);
  assert.deepEqual(restored, [old]); dispose();
});

test('client graph changes publish only after affected OMD provider rows finish updating', async () => {
  const f = fixture(), row = { id: 'omd-ui-chat', name: 'trisoul_x/host/ui-chat' }, published = [];
  const modules = { flush(value) { published.push(value); } };
  f.loader.ctx = { get: name => name === 'clientModules' ? modules : undefined };
  const originalFlush = modules.flush;
  const group = { tree: f.tree, data: [row], remove() {}, async update() {
    modules.flush('intermediate'); await Promise.resolve(); modules.flush('complete');
    assert.deepEqual(published, []);
  } };
  f.tree.root = group; f.tree.filename = '/fixture/cordis.yml';
  f.tree.store[row.id] = { options: row, parent: group };
  const dispose = bindLiveLoaderEntries(f.loader); await group.update([{ ...row, config: { display: 'updated' } }]);
  assert.deepEqual(published, ['complete']); assert.equal(modules.flush, originalFlush); dispose();
});

test('ordinary third-party configuration updates keep their native client publication while OMD stays installed', async () => {
  const f = fixture(), row = { id: 'omd-ui-chat', name: 'trisoul_x/host/ui-chat' }, published = [];
  const modules = { flush(value) { published.push(value); } };
  f.loader.ctx = { get: name => name === 'clientModules' ? modules : undefined };
  const group = { tree: f.tree, data: [row], remove() {}, async update() {
    modules.flush('third-party-client');
    assert.deepEqual(published, ['third-party-client'], 'a separate plugin retains native client graph publication');
  } };
  f.tree.root = group; f.tree.filename = '/fixture/cordis.yml';
  f.tree.store[row.id] = { options: row, parent: group };
  const dispose = bindLiveLoaderEntries(f.loader);
  try { await group.update([row, { id: 'other', name: 'third-party/plugin' }]); }
  finally { dispose(); }
});

test('intentional removal does not save expanded bundle patches and restores rollback options', async () => {
  const make = () => {
    const f = fixture(), value = f.entry('third-party');
    let writes = 0;
    value.parent.remove = function (id) {
      // Native Loader's internal/plugin observer runs before the row is unlinked.
      value.fiber.dispose(); delete this.tree.store[id];
    };
    value.fiber = { dispose() { if (!value.disabled) { value.options.disabled = true; writes++; } } };
    return { ...f, value, writes: () => writes };
  };
  const baseline = make(); baseline.value.parent.remove('third-party');
  assert.equal(baseline.writes(), 1, 'reproduce native disposal materializing the effective config');
  const f = make(), original = { ...f.value.options }, dispose = bindLiveLoaderEntries(f.loader);
  await f.value.parent.remove('third-party');
  assert.equal(f.writes(), 0); assert.deepEqual(f.value.options, original);
  assert.equal(Object.hasOwn(f.value.options, 'disabled'), false); dispose();
});

test('retirement restores the exact disabled descriptor after synchronous and asynchronous failure', async () => {
  for (const synchronous of [true, false]) {
    const f = fixture(), value = f.entry('plugin'), failure = new Error('cleanup failed');
    Object.defineProperty(value, 'disabled', { value: false, writable: true, configurable: true, enumerable: false });
    const before = Object.getOwnPropertyDescriptor(value, 'disabled');
    value.parent.remove = () => { assert.equal(value.disabled, true); if (synchronous) throw failure; return Promise.reject(failure); };
    const dispose = bindLiveLoaderEntries(f.loader);
    if (synchronous) assert.throws(() => value.parent.remove('plugin'), error => error === failure);
    else await assert.rejects(value.parent.remove('plugin'), error => error === failure);
    assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'disabled'), before);
    assert.deepEqual([...f.loader.entries()], [value]); dispose();
  }
});

test('overlapping removals retain the retirement guard until both settle', async () => {
  const f = fixture(), value = f.entry('plugin'), finish = [];
  value.parent.remove = () => new Promise(resolve => finish.push(resolve));
  const dispose = bindLiveLoaderEntries(f.loader);
  const first = value.parent.remove('plugin'), second = value.parent.remove('plugin');
  assert.equal(value.disabled, true); finish[0](); await first;
  assert.equal(value.disabled, true); finish[1](); await second;
  assert.equal(Object.getOwnPropertyDescriptor(value, 'disabled').get instanceof Function, true); dispose();
});

test('retirement leaves a concurrent foreign disabled update intact', async () => {
  const f = fixture(), value = f.entry('plugin'); let finish;
  value.parent.remove = () => new Promise(resolve => { finish = resolve; });
  const dispose = bindLiveLoaderEntries(f.loader), removal = value.parent.remove('plugin');
  Object.defineProperty(value, 'disabled', { value: false, writable: true, configurable: true, enumerable: false });
  const foreign = Object.getOwnPropertyDescriptor(value, 'disabled'); finish(); await removal;
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'disabled'), foreign); dispose();
});

test('group retirement preserves frozen raw config and the native partial-dispose metadata', async () => {
  const f = fixture(), value = f.entry('group');
  Object.defineProperty(value.options, 'disabled', { value: false, writable: false, configurable: false, enumerable: true });
  value.options.group = true; Object.freeze(value.options);
  let observed;
  value.parent.remove = () => { assert.equal(value.disabled, true); observed = value.options; };
  const dispose = bindLiveLoaderEntries(f.loader); await value.parent.remove('group');
  assert.equal(observed, value.options); assert.equal(observed.disabled, false); assert.equal(observed.group, true);
  assert.equal(value.disabled, false); assert.equal(Object.isFrozen(value.options), true); dispose();
});

test('nonextensible foreign entries keep native removal behavior', async () => {
  const f = fixture(), value = f.entry('foreign'); Object.preventExtensions(value); let removed = false;
  value.parent.remove = () => { removed = true; };
  const dispose = bindLiveLoaderEntries(f.loader); await value.parent.remove('foreign');
  assert.equal(removed, true); dispose();
});

test('official Loader recomposition keeps bundle overlays out of persistence, including group rows', async () => {
  const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const load = name => import(pathToFileURL(host.resolve('@deepseek-ai/' + name)));
  const { Context, Service } = await load('cordis');
  const { Loader, EntryTree, EntryGroup, Group } = await load('cordis-plugin-loader');
  const { applyEntryPatches } = await load('cordis-plugin-include');
  for (const guarded of [false, true]) for (const group of [false, true, 'nested']) for (const failureAfterStart of [false, true]) {
    if (failureAfterStart && group !== 'nested') continue;
    const writes = [], observations = [];
    class MemoryInclude extends EntryTree {
      static [EntryGroup.key] = true;
      constructor(ctx, config) { super(ctx); this.config = config; this.base = structuredClone(config.base); }
      async *[Service.init]() {
        yield () => this.root.stop();
        await this.root.update(applyEntryPatches(this.base, this.config.patches, () => {}));
      }
      write() { writes.push(structuredClone(this.root.data)); }
    }
    const ctx = new Context(); let restore;
    try {
      await ctx.plugin(Loader); ctx.loader.builtins.memory = MemoryInclude;
      ctx.loader.builtins.registry = () => {}; ctx.loader.builtins.iui = () => {}; ctx.loader.builtins.group = Group;
      const native = [{ insert: [{ id: 'registry', name: 'cordis:registry', config: { default: 'standard' } }] }];
      const omd = [{ id: 'registry', config: { default: 'trisoul-x' } }];
      const iui = [{ insert: [{ id: 'iui', name: group === 'nested' ? 'cordis:group' : 'cordis:iui', group: Boolean(group), disabled: false,
        ...(group === 'nested' ? { config: [{ id: 'child', name: 'cordis:iui', disabled: false }] } : {}) }] }];
      const config = patches => structuredClone({ base: [], patches });
      const id = await ctx.loader.create({ id: 'memory', name: 'cordis:memory', config: config([...native, ...omd, ...iui]) });
      await ctx.loader.await(); const tree = ctx.loader.resolve(id).subtree;
      const retired = tree.store.iui, options = retired.options, descriptor = Object.getOwnPropertyDescriptor(retired, 'disabled');
      const child = tree.store.child, childOptions = child?.options, childDescriptor = child && Object.getOwnPropertyDescriptor(child, 'disabled');
      ctx.on('loader/partial-dispose', (entry, raw) => { if (entry === retired) observations.push({ raw, disabled: raw.disabled, group: raw.group }); }, { global: true });
      const failure = new Error('foreign partial-dispose failed');
      if (failureAfterStart) ctx.on('loader/partial-dispose', entry => { if (entry === retired) throw failure; }, { global: true });
      if (guarded) restore = bindLiveLoaderEntries(ctx.loader);
      const update = tree.root.update(applyEntryPatches(tree.base, config([...native, ...omd]).patches, () => {}));
      if (failureAfterStart) await assert.rejects(update, error => error === failure);
      else await update;
      await ctx.loader.await();
      if (guarded) assert.equal(writes.length, 0);
      else assert(writes.length > 0, 'control independently reproduces native effective-tree write');
      if (guarded) {
        assert.equal(options.disabled, false); assert.equal(options.group, Boolean(group));
        assert.deepEqual(Object.getOwnPropertyDescriptor(retired, 'disabled'), descriptor);
        if (child) { assert.equal(childOptions.disabled, false); assert.deepEqual(Object.getOwnPropertyDescriptor(child, 'disabled'), childDescriptor); }
        assert.equal(observations.length, 1); assert.equal(observations[0].raw, options); assert.equal(observations[0].disabled, false);
        await tree.root.update(applyEntryPatches(tree.base, config(native).patches, () => {}));
        await ctx.loader.await(); assert.equal(writes.length, 0); assert.equal(tree.root.data[0].config.default, 'standard');
        tree.remove('registry'); await ctx.loader.await();
        assert.equal(writes.length, 1, 'explicit native removal retains its intended write'); assert.deepEqual(writes[0], []);
      }
    } finally { restore?.(); await ctx.fiber.dispose(); }
  }
});
