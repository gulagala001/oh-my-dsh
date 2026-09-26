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

test('version refusals remain visible after restart and automatic updates never grant exemptions', async () => {
  const f = fixture(), error = { code: 'incompatible-version', incompatible: [
    { name: 'sample-plugin', version: '1.0.0', runtimeVersion: '0.1.7-rc.1', peers: { '@deepseek-ai/dsh': '0.1.7-alpha.2' } },
  ] };
  f.failure = { application: 'failed', error };
  await f.service.start('sample', 'install');
  assert.match((await f.service.status()).plugins[0].error, /sample-plugin 1\.0\.0 不兼容 DSH 0\.1\.7-rc\.1/);
  assert.equal((await f.service.status()).plugins[0].installed, false);
  f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0', error }];
  f.service.records.clear();
  assert.match((await f.service.status()).plugins[0].error, /宿主“插件”页面/);
  f.service.catalog[0].review = { version: '1.0.0' };
  await f.service.settings(true); await f.service.tick();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(Object.keys(f.calls[1].options).sort(), ['enabled', 'requestId']);
  assert.match((await f.service.status()).plugins[0].error, /不兼容/);
});

test('automatic updates require review, opt-in, idle and enabled installation at six-hour intervals', async () => {
  const f = fixture();
  f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0' }];
  await f.service.tick(); assert.equal(f.calls.length, 0);
  await f.service.settings(true); await f.service.tick(); assert.equal(f.calls.length, 0, 'unreviewed entries are manual-only');
  f.service.catalog[0].review = { version: '1.0.0' }; f.time += AUTO_UPDATE_INTERVAL;
  f.running = true; await f.service.tick(); assert.equal(f.calls.length, 0);
  f.running = false; await f.service.tick(); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].spec, 'sample-plugin@1.0.0'); assert.equal(f.lookups, 0, 'reviewed versions never query latest');
  await f.service.tick(); assert.equal(f.calls.length, 1);
  f.time += AUTO_UPDATE_INTERVAL; f.bundles[0].enabled = false;
  await f.service.tick(); assert.equal(f.calls.length, 1);
  await f.service.settings(false); f.time += AUTO_UPDATE_INTERVAL; await f.service.tick(); assert.equal(f.calls.length, 1);
  await assert.rejects(f.service.settings('yes'), /必须/);
});

test('concurrent manual operations are rejected and closing cancels installation', async () => {
  const f = fixture(); let resolve;
  f.lookup = () => new Promise(r => { resolve = r; });
  const job = f.service.start('sample', 'install');
  assert.throws(() => f.service.start('sample', 'install'), /正在进行/);
  await new Promise(r => setImmediate(r)); resolve('1.0.0'); await job;
  const pending = f.service.start('sample', 'update');
  await new Promise(r => setImmediate(r)); f.service.close(); resolve('2.0.0'); await pending;
  assert.equal(f.calls.filter(c => c.spec).length, 1);
  assert.ok(f.calls.some(c => c.cancel));
  assert.throws(() => f.service.start('sample', 'update'), /已停止/);
});

test('reviewed installation pins its tested version and never downgrades a newer installation', async () => {
  const f = fixture(); f.service.catalog[0].review = { version: '1.0.0' };
  f.version = '9.0.0'; await f.service.start('sample', 'install');
  assert.equal(f.calls[0].spec, 'sample-plugin@1.0.0'); assert.equal(f.lookups, 0);
  await f.service.start('sample', 'update'); assert.equal(f.calls.length, 1);
  assert.match((await f.service.status()).plugins[0].message, /未降级/);
  f.bundles[0].version = '1.0.0'; await f.service.start('sample', 'update');
  assert.equal((await f.service.status()).plugins[0].message, '已是核验版本');
});

test('disabling automatic updates during inventory lookup prevents a reviewed installation', async () => {
  const f = fixture(); f.service.catalog[0].review = { version: '1.0.0' };
  f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0' }];
  await f.service.settings(true);
  const list = f.service.manager.listBundles; let resume, reads = 0;
  f.service.manager.listBundles = async () => { if (++reads === 3) await new Promise(r => { resume = r; }); return list(); };
  const job = f.service.tick(); await new Promise(r => setImmediate(r));
  assert.equal(typeof resume, 'function'); await f.service.settings(false); resume(); await job;
  assert.equal(f.calls.length, 0);
});

test('manual-only recommendations are never sent to the native installer', async () => {
  const f = fixture(); f.service.catalog.push({ id: 'manual', packageName: 'manual-plugin', manualInstall: '请按项目说明配置' });
  assert.throws(() => f.service.start('manual', 'install'), /项目说明/);
  await f.service.settings(true);
  f.bundles = [{ name: 'manual-plugin', installed: true, enabled: true, version: '1.0.0' }];
  await f.service.tick(); assert.equal(f.lookups, 0); assert.equal(f.calls.length, 0);
});

test('closing during inventory lookup prevents a pending uninstall', async () => {
  const f = fixture();
  f.bundles = [{ name: 'sample-plugin', installed: true, removable: true, enabled: true, version: '1.0.0' }];
  const list = f.service.manager.listBundles; let resume;
  f.service.manager.listBundles = async () => { await new Promise(resolve => { resume = resolve; }); return list(); };
  const job = f.service.start('sample', 'uninstall');
  f.service.close(); resume(); await job;
  assert.equal(f.calls.length, 0, 'unloaded plugin must not remove a bundle later');
});

test('installation rechecks concurrent installs and management restrictions after version lookup', async () => {
  for (const action of ['install', 'update']) {
    const f = fixture(); let resume;
    if (action === 'update') f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0' }];
    f.lookup = () => new Promise(resolve => { resume = resolve; });
    const job = f.service.start('sample', action);
    await new Promise(resolve => setImmediate(resolve));
    f.bundles = [{ name: 'sample-plugin', installed: true, enabled: false, version: '0.9.0', ...(action === 'update' ? { readOnlyReason: 'managed' } : {}) }];
    resume('1.0.0'); await job;
    assert.equal(f.calls.length, 0, action + ': changed inventory must not be overwritten');
    assert.match((await f.service.status()).plugins[0].error, action === 'install' ? /已经安装/ : /宿主管理/);
  }
});

test('unrecognized host outcomes do not claim an installation succeeded', async () => {
  const f = fixture(); f.failure = { application: 'unknown' };
  await f.service.start('sample', 'install');
  const plugin = (await f.service.status()).plugins[0];
  assert.equal(plugin.message, ''); assert.match(plugin.error, /未能确认/);
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

test('in-flight inventory warnings never masquerade as a completed uninstall failure', async () => {
  const f = fixture(); await f.service.start('sample', 'install');
  let finish;
  f.service.manager.removeBundle = () => new Promise(resolve => { finish = resolve; });
  const job = f.service.start('sample', 'uninstall'); await Promise.resolve();
  f.bundles = [{ name: 'sample-plugin', installed: true, removable: true,
    error: { diagnostic: 'bundle temporarily unavailable' } }];
  const busy = await f.service.status();
  assert.equal(busy.busy.action, 'uninstall');
  assert.equal(busy.plugins[0].error, '');
  assert.equal(busy.plugins[0].inventoryWarning, 'bundle temporarily unavailable');
  f.bundles = []; finish({ application: 'applied' }); await job;
  const done = await f.service.status(); assert.equal(done.busy, null);
  assert.equal(done.plugins[0].installed, false); assert.equal(done.plugins[0].error, '');
  assert.equal(done.plugins[0].inventoryWarning, undefined);
});
