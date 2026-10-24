import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context, Service, symbols } from '@deepseek-ai/cordis';
import { RecommendedPluginManager } from '../src/recommended-plugins.mjs';
import { VersionUpdater } from '../src/version-update.mjs';
import { PluginPreflight, withPluginPreflight } from '../src/plugin-preflight/service.mjs';

// Exercise the real preflight continuation and decision path. Package-manager
// I/O and the isolated probe are controlled boundaries, never real installs.
async function fixture(t, kind = 'feature') {
  const root = await mkdtemp(join(tmpdir(), 'omd-update-admission-'));
  await writeFile(join(root, 'package.json'), '{"dependencies":{}}');
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), calls = [];
  const state = { automatic: true, running: false, host: '0.2.1-rc.2', probes: 0,
    bundle: { name: kind === 'feature' ? 'addon' : 'oh-my-dsh', installed: true, enabled: true, removable: true, version: '1.0.0' } };
  const manager = {
    async listBundles() { return state.bundle ? [{ ...state.bundle }] : []; },
    async removeBundle() { calls.push('remove'); state.bundle = null; return { application: 'applied' }; },
    async installBundle(_spec, options) {
      calls.push('install');
      state.bundle = { name: kind === 'feature' ? 'addon' : 'oh-my-dsh', installed: true, enabled: options.enabled, removable: true, version: '2.0.0' };
      return { application: 'restart-required', bundle: state.bundle.name };
    },
    async cancelInstall() { return { status: 'not-running' }; },
    async waitForInstall() { return null; },
    async runPnpm() { throw Error('Unexpected package-manager execution'); },
  };
  const preflight = new PluginPreflight({ manager, profile: { dir: root }, directory: join(root, 'runs'),
    getEnabled: () => true, hostVersion: state.host, cli: '/unused',
    async probe() { state.probes++; entered.resolve(); await release.promise; return { ok: true }; },
  }).bind();
  const published = { currentVersion: '1.0.0', latestVersion: '2.0.0', status: 'update', releases: [{ version: '2.0.0', unpublished: false }] };
  const service = kind === 'feature' ? new RecommendedPluginManager({ manager,
    catalog: [{ id: 'addon', packageName: 'addon', review: { version: '2.0.0', sha256: 'a'.repeat(64) } }],
    getConfig: () => ({ recommendedPluginsAutoUpdate: state.automatic }), saveConfig() {},
    getHostVersion: async () => state.host, isRunning: () => state.running,
    preparePackage: async () => 'file:/reviewed/addon.tgz',
  }) : new VersionUpdater({ getManager: () => manager, isRunning: () => state.running,
    versions: { check: async () => published, snapshot: () => published } });
  t.after(async () => { release.resolve(); service.close(); await service.job; await preflight.close(); await rm(root, { recursive: true, force: true }); });
  return { state, published, calls, manager, service, preflight, root, entered, release,
    start: (automatic = false) => kind === 'feature' ? service.start('addon', 'update', automatic) : service.start('2.0.0'),
  };
}

for (const change of ['opt-out', 'running', 'disabled']) test(`automatic update rechecks ${change} after preflight`, async t => {
  const f = await fixture(t), pending = f.start(true);
  await f.entered.promise;
  const receipt = f.manager.waitForInstall(f.service.current.requestId);
  if (change === 'opt-out') f.state.automatic = false;
  if (change === 'running') f.state.running = true;
  if (change === 'disabled') f.state.bundle.enabled = false;
  f.release.resolve(); await pending;
  assert.deepEqual(f.calls, [], 'a withdrawn automatic operation must leave the existing package alone');
  assert.equal(f.state.bundle.version, '1.0.0');
  assert.equal(f.service.records.get('addon').error, '');
  assert.equal((await receipt).application, 'cancelled', 'native observers receive a normal terminal outcome');
});

for (const change of ['removed', 'newer-version', 'intermediate-version', 'read-only', 'disabled', 'host']) test(`feature update preserves a ${change} change made during preflight`, async t => {
  const f = await fixture(t);
  if (change === 'host') f.service.catalog[0].hostBuilds = Object.fromEntries(['0.2.1-rc.2', '0.2.1-rc.1'].map(host => {
    const version = host + '.iui.2.0.0';
    return [host, { version, sha256: 'a'.repeat(64), dsh: host, releaseTag: 'v' + version, asset: `addon-${version}.tgz` }];
  }));
  if (change === 'host') f.state.bundle.version = '0.2.1-rc.2.iui.1.0.0';
  const pending = f.start(); await f.entered.promise;
  if (change === 'removed') f.state.bundle = null;
  if (change === 'newer-version') f.state.bundle.version = '3.0.0';
  if (change === 'intermediate-version') f.state.bundle.version = '1.5.0';
  if (change === 'read-only') f.state.bundle.readOnlyReason = 'managed';
  if (change === 'disabled') f.state.bundle.enabled = false;
  if (change === 'host') f.state.host = '0.2.1-rc.1';
  f.release.resolve(); await pending;
  assert.deepEqual(f.calls, [], 'the retained continuation must not overwrite a later native choice');
  assert.ok(f.service.records.get('addon').error || f.service.records.get('addon').message);
});

test('closing at the applying boundary cannot remove the old feature package', async t => {
  const f = await fixture(t);
  f.preflight.subscribe(value => { if (value.phase === 'applying') f.service.close(); });
  const pending = f.start(); await f.entered.promise; f.release.resolve(); await pending;
  assert.deepEqual(f.calls, []);
  assert.equal(f.state.bundle.version, '1.0.0');
});

for (const change of ['running', 'withdrawn', 'installed-version', 'disabled', 'manager']) test(`self-update rechecks ${change} after preflight`, async t => {
  const f = await fixture(t, 'self'), pending = f.start(); await f.entered.promise;
  if (change === 'running') f.state.running = true;
  if (change === 'withdrawn') f.published.releases[0].unpublished = true;
  if (change === 'installed-version') f.state.bundle.version = '3.0.0';
  if (change === 'disabled') f.state.bundle.enabled = false;
  if (change === 'manager') f.service.getManager = () => ({ ...f.manager });
  f.release.resolve(); await pending;
  assert.deepEqual(f.calls, []);
  assert.equal(f.service.snapshot().phase, 'failed');
  assert.ok(f.service.snapshot().error);
});

test('a queued update checks state changed before its own probe even began', async t => {
  const f = await fixture(t);
  const blocker = withPluginPreflight(f.manager, 'unrelated', {}, async () => ({ application: 'applied' }));
  await f.entered.promise;
  const pending = f.start();
  while (!f.preflight.queue.length) await new Promise(setImmediate);
  f.state.bundle.enabled = false;
  f.release.resolve(); await blocker; await pending;
  assert.deepEqual(f.calls, []);
  assert.equal(f.state.probes, 2);
});

test('continuing an environment warning cannot bypass the current automatic opt-out', async t => {
  const f = await fixture(t), decision = Promise.withResolvers();
  f.preflight.subscribe(value => { if (value.phase === 'decision') decision.resolve(value); });
  const pending = f.start(true); await f.entered.promise;
  f.state.automatic = false;
  await writeFile(join(f.root, 'cordis.patch.yml'), '[]');
  f.release.resolve(); const view = await decision.promise;
  f.preflight.decide(view.id, 'continue'); await pending;
  assert.deepEqual(f.calls, []);
});

test('unchanged operations keep one probe and a rejected update can be explicitly retried', async t => {
  for (const kind of ['feature', 'self']) await t.test(kind, async t => {
    const f = await fixture(t, kind), pending = f.start(); await f.entered.promise;
    f.state.bundle.enabled = false; f.release.resolve(); await pending;
    assert.deepEqual(f.calls, []);
    await f.start();
    assert.deepEqual(f.calls, kind === 'feature' ? ['remove', 'install'] : ['install']);
    assert.equal(f.state.bundle.version, '2.0.0');
    assert.equal(f.state.bundle.enabled, false);
    assert.equal(f.state.probes, 2, 'one probe per explicit attempt, no nested preflight');
  });
});

test('self-update accepts fresh Cordis traces of the same native manager', async t => {
  const f = await fixture(t, 'self'), ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  class Manager extends Service {
    constructor(ctx) { super(ctx, 'pluginManager'); Object.defineProperties(this, Object.getOwnPropertyDescriptors(f.manager)); }
  }
  await ctx.plugin(Manager);
  f.service.getManager = () => ctx.get('pluginManager');
  const first = f.service.getManager(), second = f.service.getManager();
  assert.notEqual(first, second);
  assert.equal(first[symbols.original], second[symbols.original]);
  const pending = f.start(); await f.entered.promise; f.release.resolve(); await pending;
  assert.deepEqual(f.calls, ['install']);
  assert.equal(f.state.probes, 1);
  assert.equal(f.service.snapshot().phase, 'restart-required');
});
