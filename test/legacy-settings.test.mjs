import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { legacySettings } from '../src/legacy-settings.mjs';

const schema = z.object({ enabled: z.boolean(), limit: z.number(), text: z.string(), dataDir: z.string() });
async function fixture(t, legacy, override = {}, aliases = []) {
  const home = await mkdtemp(join(tmpdir(), 'omd-legacy-settings-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const profile = { home, dir: join(home, 'profile'), patchPath: join(home, 'profile', 'cordis.patch.yml') };
  await mkdir(profile.dir); await writeFile(join(home, 'settings.yaml'), JSON.stringify(legacy));
  const owner = { uid: 1, state: 2, store: {}, async await() {} }, listeners = new Map(), disposers = [];
  const entry = { options: { id: 'omd', name: 'oh-my-dsh', config: {} }, fiber: owner, disabled: false };
  const row = { entry, override }, rows = [row], errors = [], calls = { configuration: 0, describe: 0, edit: 0 };
  const serviceOwner = { fiber: { uid: 2, state: 2, store: {}, async await() {} } };
  const editor = { ownerContext: serviceOwner,
    configuration() { calls.configuration++; return rows; }, entries: () => rows.map(row => row.entry),
    async edit(target, change) {
      calls.edit++; await state.beforeEdit?.();
      const next = change(target.options.config); target.options.config = next; row.override = next;
      await writeFile(profile.patchPath, JSON.stringify(next));
    },
  };
  const settings = { ownerContext: serviceOwner, describe() {
    calls.describe++; return rows.map(row => ({ ns: row.entry.options.id, user: { ...row.override } }));
  } };
  const services = { profileContext: profile, configEditor: editor, settings,
    loader: { ownerContext: serviceOwner, async await() {}, entries: () => rows.map(row => row.entry) } };
  const ctx = { fiber: owner, logger: { error: (...args) => errors.push(args) }, get: name => services[name],
    effect: fn => disposers.push(fn()), on: (name, fn) => listeners.set(name, [...listeners.get(name) ?? [], fn]) };
  ctx.root = ctx;
  const state = { owner, entry, row, rows, calls, errors, profile, services,
    emit(name, ...args) { for (const fn of listeners.get(name) ?? []) fn(...args); } };
  t.after(() => disposers.forEach(fn => fn?.()));
  state.legacy = await legacySettings(ctx, 'omd', schema, aliases);
  return state;
}

test('explicit false, zero and empty settings keep ownership over retained values', async t => {
  const f = await fixture(t, { omd: { enabled: true, limit: 10, text: 'old' } }, { enabled: false, limit: 0, text: '' });
  assert.deepEqual(f.legacy.value, {});
  const reads = f.calls.configuration;
  assert.deepEqual(f.legacy.current(), {});
  assert.equal(f.calls.configuration, reads, 'an empty fallback needs no further profile I/O');
  assert.equal(f.calls.describe, 0, 'migration must not rebuild unrelated native settings forms');
});

test('fallback reads observe edits and resets immediately without a stale cache', async t => {
  const f = await fixture(t, { omd: { enabled: true, limit: 10, text: 'kept' } });
  assert.deepEqual(f.legacy.current(), { enabled: true, limit: 10, text: 'kept' });
  f.row.override = { enabled: false, limit: 0 };
  assert.deepEqual(f.legacy.current(), { text: 'kept' });
  f.row.override = {};
  assert.deepEqual(f.legacy.current(), { enabled: true, limit: 10, text: 'kept' });
});

test('alias activation removes its fallback and never imports its data directory', async t => {
  const f = await fixture(t, { old: { enabled: true, limit: 20, dataDir: '/other-plugin' }, omd: { limit: 10 } }, {}, ['old']);
  assert.deepEqual(f.legacy.current(), { enabled: true, limit: 10 });
  f.rows.push({ entry: { options: { id: 'old' }, disabled: false }, override: {} });
  assert.deepEqual(f.legacy.current(), { limit: 10 });
});

test('disabled, replaced and retired owners cannot supply old settings', async t => {
  const f = await fixture(t, { omd: { enabled: true } });
  f.entry.disabled = true; assert.deepEqual(f.legacy.current(), {});
  f.entry.disabled = false; assert.deepEqual(f.legacy.current(), { enabled: true });
  f.entry.fiber = { ...f.owner }; assert.deepEqual(f.legacy.current(), {});
  f.entry.fiber = f.owner; f.owner.state = 3; f.emit('internal/status', f.owner, 2);
  f.owner.state = 2; assert.deepEqual(f.legacy.current(), {});
});

test('a user save ahead of the migration wins when its queued edit runs', async t => {
  const f = await fixture(t, { omd: { enabled: true, limit: 10 } });
  f.beforeEdit = () => { f.row.override = { enabled: false }; f.entry.options.config = { enabled: false }; };
  let done = 0;
  assert.equal(await f.legacy.persist(() => done++), true);
  assert.deepEqual(JSON.parse(await readFile(f.profile.patchPath, 'utf8')), { enabled: false, limit: 10 });
  assert.deepEqual(JSON.parse(await readFile(join(f.profile.dir, '.omd-settings-v4.json'), 'utf8')), { imported: ['limit'] });
  assert.equal(done, 1); assert.equal(f.errors.length, 0);
});

test('native edit failure leaves the fallback available and writes no success receipt', async t => {
  const f = await fixture(t, { omd: { limit: 10 } });
  f.beforeEdit = () => { throw Object.assign(Error('disk unavailable'), { code: 'EIO' }); };
  let done = 0;
  assert.equal(await f.legacy.persist(() => done++), false);
  assert.equal(done, 0); assert.ok(f.errors.length);
  assert.deepEqual(f.legacy.current(), { limit: 10 });
  await assert.rejects(readFile(join(f.profile.dir, '.omd-settings-v4.json')), { code: 'ENOENT' });
});
