// Real locked rc.2 SDK lifecycle integration with synthetic package-manager I/O.
// No real install, download, archive extraction, desktop, or user profile is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { RecommendedPluginManager } from '../../src/recommended-plugins.mjs';
import { writeAddon } from './recommended-native-package-manager.mjs';

// Resolve through the direct, locked DSH development dependency, including with pnpm isolation.
// Missing/wrong SDK fails the test; there is deliberately no skip or fake-manager fallback.
const require = createRequire(import.meta.url);
const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
assert.equal(host('./package.json').version, '0.2.1-rc.2');
for (const name of ['dsh-plugin-manager', 'dsh-app-boot', 'dsh-hmr']) {
  assert.equal(host(`@deepseek-ai/${name}/package.json`).version, '0.2.1-rc.2');
}
assert.equal(host('@deepseek-ai/cordis/package.json').version, '4.0.5');
const sdk = spec => import(pathToFileURL(host.resolve(spec)).href);
// Cordis 4.0.5 declares a const enum, erased from its published JavaScript.
// Fixed SDK 687f282e/vendor/cordis/src/fiber.ts: PENDING=0, LOADING=1, ACTIVE=2.
const ACTIVE = 2;
const { boot, createRuntimeResolution, initProfile, loadProfileDirectory, PluginPackages, readProfileManifest, readProfilePatches } = await sdk('@deepseek-ai/dsh-app-boot');
const { default: PluginManager } = await sdk('@deepseek-ai/dsh-plugin-manager');
const { default: Hmr } = await sdk('@deepseek-ai/dsh-hmr');
const { default: Timer } = await sdk('@deepseek-ai/cordis-plugin-timer');
const executable = fileURLToPath(new URL('./recommended-native-package-manager.mjs', import.meta.url));
const catalog = [{ id: 'addon', packageName: 'addon', review: { version: '2.0.0', sha256: 'a'.repeat(64) } }];
const options = { timeout: 15000 };

async function fixture(t, { enabled = true, live = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-update-')));
  const dir = join(root, 'profiles', 'test');
  const installAnchor = join(root, 'package.json');
  const token = randomUUID();
  let owner;
  const services = [];
  // Register cleanup before boot, so a failed bootstrap cannot leak a watcher/profile.
  t.after(async () => {
    for (const service of services) service.close();
    await Promise.allSettled(services.map(service => service.job).filter(Boolean));
    await owner?.fiber.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(installAnchor, '{"name":"isolated-test-installation","dependencies":{}}');
  writeFileSync(join(root, 'fixture-token'), token);
  const control = mode => writeFileSync(join(root, 'control.json'), JSON.stringify({ mode }));
  control('success');
  writeFileSync(join(root, 'addon-2.tgz'), 'synthetic fixture, never extracted');
  initProfile(dir, enabled ? ['core', 'addon'] : ['core']);
  writeFileSync(join(dir, 'cordis.yml'), '[]\n');
  const core = join(dir, 'node_modules', 'core');
  mkdirSync(core, { recursive: true });
  writeFileSync(join(core, 'package.json'), JSON.stringify({ name: 'core', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
  writeFileSync(join(core, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'manager', name: 'cordis:manager' }, { id: 'sibling', name: './sibling.mjs' }] }]));
  writeFileSync(join(core, 'sibling.mjs'), `export function apply(ctx) { ctx.provide('nativeSibling', {}); ctx.get('nativeTrace').push('start:sibling'); ctx.effect(() => () => ctx.get('nativeTrace').push('stop:sibling')); }`);
  writeAddon(dir, 1);
  const manifest = readProfileManifest('test', dir);
  manifest.dependencies = { addon: '1.0.0' };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  const loaded = loadProfileDirectory('test', dir, installAnchor);
  const profile = {
    name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor, cwd: root, home: root,
    startedBundles: loaded.layers.map(layer => layer.packageName), overlays: [], telemetryDisabledEnv: undefined,
    packageManager: { command: process.execPath, args: [executable, root, token], env: { HOME: root, USERPROFILE: root } },
  };
  const resolution = await createRuntimeResolution({ installAnchor, profile: loaded, home: root });
  const trace = [];
  const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), async context => {
    owner = context;
    context.provide('profileContext', profile);
    context.provide('appReady', { onReady(listener) { listener(); return () => {}; } });
    context.provide('nativeTrace', trace);
    context.loader.builtins.manager = PluginManager;
    await context.plugin(PluginPackages, { resolution });
  });
  if (live) {
    await ctx.plugin(Timer);
    await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 });
    await ctx.hmr.runExclusive(async () => {});
  }
  const manager = ctx.pluginManager;
  assert.ok(manager instanceof PluginManager);
  const createService = () => {
    const service = new RecommendedPluginManager({
      manager, catalog, hostVersion: '0.2.1-rc.2',
      getConfig: () => ({ recommendedPluginsAutoUpdate: false }), saveConfig: async () => {},
      packageDirectory: join(root, 'reviewed'),
      preparePackage: async () => 'file:' + join(root, 'addon-2.tgz'),
      latest: async () => { throw Error('Unexpected external version lookup'); },
    });
    services.push(service);
    return service;
  };
  const service = createService();
  const entry = () => [...ctx.loader.entries()].find(row => row.id === 'include:addon');
  const packageVersion = () => ctx.pluginPackages.packageOf('addon-plugin', pathToFileURL(join(dir, 'node_modules', 'addon', 'package.json')).href)?.version;
  const callerPackageVersion = () => ctx.pluginPackages.packageOf('addon-plugin', pathToFileURL(join(dir, 'caller.mjs')).href)?.version;
  const commands = () => existsSync(join(root, 'package-trace.log')) ? readFileSync(join(root, 'package-trace.log'), 'utf8').trim().split('\n') : [];
  const view = async (current = service) => (await current.status()).plugins[0];
  return { root, dir, ctx, manager, service, createService, control, trace, entry, packageVersion, callerPackageVersion, commands, view, sibling: ctx.get('nativeSibling') };
}

function assertActive(f, version) {
  assert.equal(f.ctx.get('nativeVersion'), version);
  assert.equal(f.entry()?.fiber?.state, ACTIVE);
  assert.notEqual(f.entry()?.fiber?.uid, null);
  assert.notEqual(f.entry()?.fiber?.uid, undefined);
  assert.equal(f.packageVersion(), `${version}.0.0`);
  assert.equal(f.ctx.get('nativeSibling'), f.sibling);
}

test('native feature switch installs once, then disables and re-enables without package removal', options, async t => {
  const f = await fixture(t, { enabled: false });
  await f.manager.removeBundle('addon');
  await f.service.start('addon', 'enable');
  assertActive(f, 2);
  assert.equal((await f.view()).enabled, true);
  const commands = f.commands();
  await f.service.start('addon', 'disable');
  assert.equal((await f.view()).enabled, false);
  assert.equal((await f.view()).installed, true);
  assert.equal(f.ctx.get('nativeVersion'), undefined);
  assert.ok(readProfileManifest('test', f.dir).dependencies.addon);
  await f.service.start('addon', 'enable');
  assertActive(f, 2);
  assert.deepEqual(f.commands(), commands);
});

test('native bundled feature switch persists only its own entry and preserves sibling plugins', options, async t => {
  const f = await fixture(t);
  f.service.catalog = [{ id: 'built-in', bundled: true, moduleName: pathToFileURL(join(f.dir, 'node_modules/core/sibling.mjs')).href }];
  const view = async () => (await f.service.status()).plugins[0];
  assert.equal((await view()).enabled, true, JSON.stringify(await f.manager.listPlugins()));
  assert.equal((await view()).active, true);
  assert.equal((await view()).readOnly, false);
  await f.service.start('built-in', 'disable');
  assert.equal((await view()).error, '');
  assert.equal((await view()).enabled, false);
  assert.equal((await view()).active, false);
  assert.equal(f.ctx.get('nativeSibling'), undefined);
  assert.equal(f.ctx.get('nativeVersion'), 1);
  await f.service.start('built-in', 'enable');
  assert.equal((await view()).enabled, true);
  assert.equal((await view()).active, true);
  assert.ok(f.ctx.get('nativeSibling'));
  assert.equal(f.ctx.get('nativeVersion'), 1);
  assert.deepEqual(f.commands(), []);
});

async function assertAbsent(f) {
  assert.equal((await f.view()).installed, false);
  assert.equal(readProfileManifest('test', f.dir).dependencies.addon, undefined);
  assert.equal(f.ctx.get('nativeVersion'), undefined);
  assert.equal(f.entry()?.fiber, undefined);
  assert.equal(f.packageVersion(), undefined);
}

async function waitForFile(path) {
  const signal = AbortSignal.timeout(6000);
  while (!existsSync(path)) await delay(10, undefined, { signal });
}

test('native baseline refuses named archive replacement before package I/O', options, async t => {
  const f = await fixture(t);
  assertActive(f, 1);
  const result = await f.manager.installBundle(`addon@file:${join(f.root, 'addon-2.tgz')}`, { enabled: true });
  assert.equal(result.application, 'failed');
  assert.equal(result.error.code, 'already-installed');
  assert.deepEqual(f.commands(), []);
  assertActive(f, 1);
  assert.deepEqual(f.trace, ['start:sibling', 'start:addon:1']);
});

test('native enabled update disposes v1 and activates v2 without disturbing sibling', options, async t => {
  const f = await fixture(t);
  assertActive(f, 1);
  await f.service.start('addon', 'update');
  const view = await f.view();
  assert.equal(view.error, '');
  assert.equal(view.enabled, true);
  assert.equal(view.version, '2.0.0');
  assert.deepEqual(f.commands(), ['remove', 'add']);
  assert.deepEqual(f.trace, ['start:sibling', 'start:addon:1', 'stop:addon:1', 'start:addon:2']);
  assertActive(f, 2);
});

test('native disabled update publishes v2 without evaluating or activating addon', options, async t => {
  const f = await fixture(t, { enabled: false });
  await f.service.start('addon', 'update');
  const view = await f.view();
  assert.equal(view.error, '');
  assert.equal(view.version, '2.0.0');
  assert.equal(view.enabled, false);
  assert.equal(f.packageVersion(), '2.0.0');
  assert.equal(f.entry(), undefined);
  assert.equal(f.ctx.get('nativeVersion'), undefined);
  assert.equal(existsSync(join(f.dir, 'evaluations.log')), false);
  assert.deepEqual(f.trace, ['start:sibling']);
  assert.deepEqual(f.commands(), ['remove', 'add']);
});

test('native removal failure stops the update without pretending the old bundle stayed enabled', options, async t => {
  const f = await fixture(t);
  f.control('remove-fail');
  await f.service.start('addon', 'update');
  const view = await f.view();
  assert.match(view.error, /fixture removal failed/);
  assert.equal(view.installed, true);
  assert.equal(view.enabled, false);
  assert.equal(view.version, '1.0.0');
  assert.equal(f.ctx.get('nativeVersion'), undefined);
  // Removal failed before deleting files: the disabled bundle retains its own private dependency.
  assert.equal(f.packageVersion(), '1.0.0');
  assert.equal(f.callerPackageVersion(), undefined);
  assert.equal(f.entry()?.fiber, undefined);
  const manifest = readProfileManifest('test', f.dir);
  assert.equal(manifest.dependencies.addon, '1.0.0');
  assert.equal(manifest.dsh.profile.bundles.includes('addon'), false);
  assert.deepEqual(f.commands(), ['remove']);
  assert.deepEqual(f.trace, ['start:sibling', 'start:addon:1', 'stop:addon:1']);
});

test('native installation failure leaves the removed package absent and explicit install retries', options, async t => {
  const f = await fixture(t);
  f.control('add-fail');
  await f.service.start('addon', 'update');
  assert.match((await f.view()).error, /fixture installation failed/);
  await assertAbsent(f);
  f.control('success');
  await f.service.start('addon', 'install');
  assert.equal((await f.view()).error, '');
  assertActive(f, 2);
  assert.deepEqual(f.commands(), ['remove', 'add', 'add']);
});

test('native close cancels the package operation before a fresh service retries installation', options, async t => {
  const f = await fixture(t);
  f.control('add-wait');
  const updating = f.service.start('addon', 'update');
  void updating.catch(() => {}); // Observe an unexpected rejection during the handshake wait.
  await waitForFile(join(f.root, 'add-started'));
  f.service.close();
  await updating;
  assert.ok((await f.view()).error);
  await assertAbsent(f);
  assert.deepEqual(f.trace, ['start:sibling', 'start:addon:1', 'stop:addon:1']);
  const pid = Number(readFileSync(join(f.root, 'add-started'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  f.control('success');
  const retry = f.createService();
  await retry.start('addon', 'install');
  assert.equal((await f.view(retry)).error, '');
  assertActive(f, 2);
  assert.deepEqual(f.commands(), ['remove', 'add', 'add']);
});

test('native no-HMR update requires restart and preserves the running v1 fiber', options, async t => {
  const f = await fixture(t, { live: false });
  assertActive(f, 1);
  const previous = f.entry().fiber;
  // Establish that this exact native state, not a fabricated removal result, is stop-profile.
  const removed = await f.manager.removeBundle('addon');
  assert.equal(removed.error.code, 'stop-profile');
  assert.deepEqual(f.commands(), []);
  await f.service.start('addon', 'update');
  const view = await f.view();
  assert.equal(view.error, '');
  assert.equal(view.restartRequired, true);
  assert.equal(view.version, '2.0.0');
  assert.equal(view.enabled, true);
  assert.deepEqual(f.commands(), ['add']);
  assert.equal(f.entry().fiber, previous);
  assertActive(f, 1);
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'node_modules', 'addon', 'package.json'), 'utf8')).version, '2.0.0');
  assert.deepEqual(f.trace, ['start:sibling', 'start:addon:1']);
});
