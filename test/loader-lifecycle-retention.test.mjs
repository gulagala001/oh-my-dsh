import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindLiveLoaderEntries, entryIsRegistered } from '../src/loader-lifecycle-compat.mjs';
import { nativeLoader } from './fixtures/loader-lifecycle-retention.mjs';

const group = id => ({ id, name: 'cordis:group', config: [{ id: id + '-leaf', name: 'cordis:probe' }] });

test('native groups can be collected after repeated complete unloads while the host stays alive', () => {
  const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(new URL('./fixtures/loader-lifecycle-retention.mjs', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { retained: 0, entries: 0 });
});

test('restoration keeps live native groups usable and retained old iterators cannot reinstall wrappers', async t => {
  const { ctx, loader } = await nativeLoader(); t.after(() => ctx.fiber.dispose());
  await loader.create(group('live')); await loader.await();
  const live = loader.resolve('live').subgroup, native = live.remove;
  const dispose = bindLiveLoaderEntries(loader), wrapped = live.remove, entries = loader.entries;
  assert.notEqual(wrapped, native);
  dispose(); dispose();
  assert.equal(live.remove, native);
  [...entries.call(loader)]; assert.equal(live.remove, native);
  await loader.create({ id: 'second', name: 'cordis:probe' }, 'live'); await loader.await();
  assert.ok(entryIsRegistered(loader.resolve('second')));
  live.remove('second'); await loader.await();
  assert.throws(() => loader.resolve('second'));
});

test('pending native teardown remains protected and a suspended iterator skips removed descendants', async t => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const { ctx, loader } = await nativeLoader({ name: 'retention-probe', apply(ctx) {
    ctx.effect(() => async () => { started.resolve(); await release.promise; });
  } });
  const dispose = bindLiveLoaderEntries(loader); t.after(async () => { release.resolve(); dispose(); await ctx.fiber.dispose(); });
  await loader.create(group('slow')); await loader.await();
  const parent = loader.resolve('slow'), leaf = loader.resolve('slow-leaf'), iterator = loader.entries();
  assert.equal(iterator.next().value, parent);
  const removing = loader.root.remove('slow'); await started.promise;
  assert.equal(leaf.disabled, true); assert.equal(leaf.options.disabled, undefined);
  assert.deepEqual([...iterator], []); assert.deepEqual([...loader.entries()], []);
  let complete = false; const waiting = loader.await().then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(complete, false);
  release.resolve(); await removing; await waiting;
  assert.equal(Object.hasOwn(leaf, 'disabled'), false); assert.equal(leaf.options.disabled, undefined);
});

test('a later wrapper retains its property ownership when the compatibility layer closes', async t => {
  const { ctx, loader } = await nativeLoader(); t.after(() => ctx.fiber.dispose());
  await loader.create(group('later')); await loader.await();
  const live = loader.resolve('later').subgroup, dispose = bindLiveLoaderEntries(loader), previous = live.remove;
  const replacement = function (...args) { return previous.apply(this, args); };
  live.remove = replacement; dispose();
  assert.equal(live.remove, replacement);
  await live.remove('later-leaf'); await loader.await();
  assert.throws(() => loader.resolve('later-leaf'));
});

test('failed removal releases guards and keeps the group available for a successful retry', async t => {
  const { ctx, loader } = await nativeLoader(); t.after(() => ctx.fiber.dispose());
  await loader.create(group('retry')); await loader.await();
  const live = loader.resolve('retry').subgroup, original = live.remove; let fail = true;
  live.remove = function (...args) { if (fail) return Promise.reject(Error('injected removal failure')); return original.apply(this, args); };
  const dispose = bindLiveLoaderEntries(loader); t.after(dispose);
  const leaf = loader.resolve('retry-leaf');
  await assert.rejects(live.remove('retry-leaf'), /injected removal failure/);
  await loader.await(); assert.equal(Object.hasOwn(leaf, 'disabled'), false);
  assert.ok([...loader.entries()].includes(leaf));
  fail = false; await live.remove('retry-leaf'); await loader.await();
  assert.throws(() => loader.resolve('retry-leaf'));
});
