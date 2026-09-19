import test from 'node:test';
import assert from 'node:assert/strict';
import { bindLiveLoaderEntries, entryIsRegistered, installLoaderLifecycleCompatibility } from '../src/loader-lifecycle-compat.mjs';

function fixture() {
  const tree = { store: {}, ctx: { fiber: {} } };
  const entry = id => { const value = { options: { id }, parent: { tree } }; tree.store[id] = value; return value; };
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

test('client graph changes publish only after all provider rows finish updating', async () => {
  const f = fixture(), row = { id: 'existing', name: 'fixture' }, published = [];
  const modules = { flush(value) { published.push(value); } };
  f.loader.ctx = { get: name => name === 'clientModules' ? modules : undefined };
  const originalFlush = modules.flush;
  const group = { tree: f.tree, data: [row], remove() {}, async update() {
    modules.flush('intermediate'); await Promise.resolve(); modules.flush('complete');
    assert.deepEqual(published, []);
  } };
  f.tree.root = group; f.tree.filename = '/fixture/cordis.yml';
  f.tree.store[row.id] = { options: row, parent: group };
  const dispose = bindLiveLoaderEntries(f.loader); await group.update([row]);
  assert.deepEqual(published, ['complete']); assert.equal(modules.flush, originalFlush); dispose();
});
