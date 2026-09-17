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
