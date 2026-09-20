import test from 'node:test';
import assert from 'node:assert/strict';
import { RecommendedPluginManager, AUTO_UPDATE_INTERVAL } from '../src/recommended-plugins.mjs';

const catalog = [{ id: 'sample', packageName: 'sample-plugin' }, { id: 'absent', packageName: 'absent-plugin' }];
function fixture() {
  let config = {}, bundles = [], time = 1, running = false, version = '1.0.0', failure;
  const calls = [], writes = [];
  const manager = {
    listBundles: async () => structuredClone(bundles),
    installBundle: async (spec, options) => {
      calls.push({ spec, options }); if (failure) return failure;
      const existing = bundles.find(bundle => bundle.name === 'sample-plugin');
      bundles = [{ name: 'sample-plugin', version, enabled: options.enabled, installed: true, removable: true }];
      return { application: existing ? 'restart-required' : 'applied' };
    },
    removeBundle: async name => { calls.push({ remove: name }); bundles = []; return { application: 'applied' }; },
    cancelInstall: async id => { calls.push({ cancel: id }); },
  };
  let lookups = 0, lookup;
  const service = new RecommendedPluginManager({ manager, catalog: structuredClone(catalog), getConfig: () => config, saveConfig: async patch => { writes.push(patch); config = { ...config, ...patch }; },
    latest: async () => { lookups++; return lookup ? lookup() : version; }, now: () => time, isRunning: () => running });
  return { service, calls, writes, get lookups() { return lookups; }, get config() { return config; }, set version(v) { version = v; }, set time(v) { time = v; }, set running(v) { running = v; }, set failure(v) { failure = v; }, set lookup(v) { lookup = v; },
    set bundles(v) { bundles = v; }, get bundles() { return bundles; } };
}

test('manual install, pinned update and uninstall use the native manager and report restart truthfully', async () => {
  const f = fixture(); assert.equal((await f.service.status()).autoUpdate, false);
  await f.service.start('sample', 'install');
  assert.equal(f.calls[0].spec, 'sample-plugin@1.0.0'); assert.equal(f.calls[0].options.enabled, true);
  assert.ok((await f.service.status()).plugins[0].installed);
  f.version = '1.1.0'; f.bundles[0].enabled = false;
  await f.service.start('sample', 'update');
  assert.equal(f.calls[1].options.enabled, false, 'updating never re-enables a disabled plugin');
  assert.equal((await f.service.status()).plugins[0].restartRequired, true);
  await f.service.start('sample', 'update'); assert.equal(f.calls.length, 2, 'same version is not reinstalled');
  f.version = '1.0.0'; await f.service.start('sample', 'update'); assert.equal(f.calls.length, 2, 'no downgrade');
  await f.service.start('sample', 'uninstall'); assert.deepEqual(f.calls[2], { remove: 'sample-plugin' });
  assert.equal((await f.service.status()).plugins[0].installed, false);
  assert.throws(() => f.service.start('shell-command', 'install'), /未知/);
});

test('operation failures are visible without fake success or implicit script approval', async () => {
  const f = fixture();
  f.failure = { application: 'failed', pendingBuilds: ['native-build'], error: { code: 'operation-error' } };
  await f.service.start('sample', 'install');
  const state = await f.service.status(); assert.equal(state.plugins[0].installed, false);
  assert.match(state.plugins[0].error, /安装脚本需要授权/); assert.equal(f.calls[0].options.approvedBuilds, undefined);
  assert.equal(state.busy, null);
  f.bundles = [{ name: 'sample-plugin', installed: true, removable: false, enabled: true, version: '1.0.0' }];
  await f.service.start('sample', 'uninstall'); assert.match((await f.service.status()).plugins[0].error, /无法卸载/);
});

test('automatic updates are opt-in, idle-only and limited to installed enabled recommendations at six-hour intervals', async () => {
  const f = fixture(); await f.service.tick(); assert.equal(f.lookups, 0);
  await f.service.settings(true); assert.deepEqual(f.writes, [{ recommendedPluginsAutoUpdate: true }]);
  f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0' }, { name: 'unrelated-plugin', installed: true, enabled: true, version: '0.1.0' }];
  f.running = true; await f.service.tick(); assert.equal(f.lookups, 0);
  f.running = false; await f.service.tick(); assert.equal(f.lookups, 1); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].spec, 'sample-plugin@1.0.0'); await f.service.tick(); assert.equal(f.lookups, 1);
  f.time = 1 + AUTO_UPDATE_INTERVAL; f.bundles[0].enabled = false;
  await f.service.tick(); assert.equal(f.lookups, 1, 'disabled plugins are not automatically updated');
  await f.service.settings(false); f.time += AUTO_UPDATE_INTERVAL; await f.service.tick(); assert.equal(f.lookups, 1);
  await assert.rejects(f.service.settings('yes'), /必须/);
});

test('concurrent operations and disabling auto-update during lookup cannot launch a second installation', async () => {
  const f = fixture(); let resolve;
  f.lookup = () => new Promise(r => { resolve = r; });
  const job = f.service.start('sample', 'install');
  assert.throws(() => f.service.start('sample', 'install'), /正在进行/);
  await new Promise(r => setImmediate(r)); resolve('1.0.0'); await job;
  await f.service.settings(true); f.version = '2.0.0';
  const automatic = f.service.tick(); await new Promise(r => setImmediate(r));
  await f.service.settings(false); resolve('2.0.0'); await automatic;
  assert.equal(f.calls.length, 1);
  f.service.close(); assert.throws(() => f.service.start('sample', 'update'), /已停止/);
});

test('manual-only recommendations are never sent to the native installer', async () => {
  const f = fixture(); f.service.catalog.push({ id: 'manual', packageName: 'manual-plugin', manualInstall: '请按项目说明配置' });
  assert.throws(() => f.service.start('manual', 'install'), /项目说明/);
  await f.service.settings(true);
  f.bundles = [{ name: 'manual-plugin', installed: true, enabled: true, version: '1.0.0' }];
  await f.service.tick(); assert.equal(f.lookups, 0); assert.equal(f.calls.length, 0);
});

test('GitHub recommendations install the versioned release asset and remain optional', async () => {
  const { recommendedPlugins } = await import('../src/recommended-plugin-catalog.mjs');
  const { pluginInstallSpec, latestPluginVersion } = await import('../src/recommended-plugins.mjs');
  const plugin = recommendedPlugins.find(p => p.id === 'jevify');
  const spec = 'https://github.com/gulagala001/jevify/releases/download/v0.1.5/dsh-plugin-jevify-0.1.5.tgz';
  assert.equal(pluginInstallSpec(plugin, '0.1.5'), spec);
  const f = fixture(); f.service.catalog = [plugin]; f.version = '0.1.5';
  await f.service.tick(); assert.equal(f.calls.length, 0);
  await f.service.start('jevify', 'install'); assert.equal(f.calls[0].spec, spec);
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async url => { assert.equal(url, 'https://api.github.com/repos/gulagala001/jevify/releases/latest'); return Response.json({tag_name:'v0.1.5',assets:[{browser_download_url:spec}]}); };
    assert.equal(await latestPluginVersion(plugin, new AbortController().signal), '0.1.5');
    globalThis.fetch = async () => Response.json({tag_name:'v0.1.5',assets:[{browser_download_url:'https://example.invalid/package.tgz'}]});
    await assert.rejects(latestPluginVersion(plugin, new AbortController().signal), /缺少预期/);
  } finally { globalThis.fetch = fetchOriginal; }
});
