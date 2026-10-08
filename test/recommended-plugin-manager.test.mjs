import test from 'node:test';
import assert from 'node:assert/strict';
import { RecommendedPluginManager, AUTO_UPDATE_INTERVAL } from '../src/recommended-plugins.mjs';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';

const catalog = [{ id: 'sample', packageName: 'sample-plugin' }, { id: 'absent', packageName: 'absent-plugin' }];
function fixture(options = {}) {
  const packageName = options.catalog?.[0]?.packageName ?? 'sample-plugin';
  let config = {}, bundles = [], time = 1, running = false, version = '1.0.0', failure;
  const calls = [], writes = [], packages = [];
  const manager = {
    listBundles: async () => structuredClone(bundles),
    installBundle: async (spec, options) => {
      calls.push({ spec, options }); if (failure) return failure;
      const existing = bundles.find(bundle => bundle.name === packageName);
      bundles = [{ name: packageName, version, enabled: options.enabled, installed: true, removable: true }];
      return { application: existing ? 'restart-required' : 'applied' };
    },
    removeBundle: async name => { calls.push({ remove: name }); bundles = []; return { application: 'applied' }; },
    cancelInstall: async id => { calls.push({ cancel: id }); },
  };
  let lookups = 0, lookup;
  const service = new RecommendedPluginManager({ manager, catalog: structuredClone(catalog), getConfig: () => config, saveConfig: async patch => { writes.push(patch); config = { ...config, ...patch }; },
    preparePackage: async (url, sha256) => { packages.push({ url, sha256 }); return 'file:/verified/package.tgz'; },
    latest: async () => { lookups++; return lookup ? lookup() : version; }, now: () => time, isRunning: () => running, ...options });
  return { service, calls, writes, packages, get lookups() { return lookups; }, get config() { return config; }, set version(v) { version = v; }, set time(v) { time = v; }, set running(v) { running = v; }, set failure(v) { failure = v; }, set lookup(v) { lookup = v; },
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

test('removed recommendations are absent and rejected before native plugin operations', async () => {
  const f = fixture({ catalog: recommendedPlugins });
  assert.equal(recommendedPlugins.length, 9);
  assert.equal((await f.service.status()).plugins.some(plugin => plugin.id === 'jevify'), false);
  for (const action of ['install', 'update', 'uninstall']) assert.throws(() => f.service.start('jevify', action), /未知/);
  assert.equal(f.lookups, 0); assert.deepEqual(f.packages, []); assert.deepEqual(f.calls, []);
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

test('current or newer reviewed installations do not need an archive to check updates', async () => {
  for (const version of ['1.0.0', '2.0.0']) {
    for (const automatic of [false, true]) {
      const f = fixture();
      f.service.catalog[0].review = { version: '1.0.0', sha256: 'a'.repeat(64) };
      f.bundles = [{ name: 'sample-plugin', version, installed: true, enabled: true }];
      let downloads = 0;
      f.service.preparePackage = async () => { downloads++; throw Error('offline: no archive cache'); };
      if (automatic) { await f.service.settings(true); await f.service.tick(); }
      else await f.service.start('sample', 'update');
      const state = (await f.service.status()).plugins[0];
      assert.equal(state.error, '', `${version}, automatic=${automatic}: a no-op is independent of package delivery`);
      assert.equal(downloads, 0);
      assert.equal(f.calls.length, 0);
      assert.match(state.message, version === '1.0.0' ? /已是核验版本/ : /未降级/);
    }
  }
});

test('package preparation still rechecks version and enablement changes before installation', async () => {
  for (const change of ['same', 'newer', 'disabled', 'running']) {
    const f = fixture();
    f.service.catalog[0].review = { version: '1.0.0', sha256: 'a'.repeat(64) };
    f.bundles = [{ name: 'sample-plugin', version: '0.9.0', installed: true, enabled: true }];
    f.service.preparePackage = async () => {
      if (change === 'same') f.bundles[0].version = '1.0.0';
      if (change === 'newer') f.bundles[0].version = '2.0.0';
      if (change === 'disabled') f.bundles[0].enabled = false;
      if (change === 'running') f.running = true;
      return 'file:/verified/package.tgz';
    };
    await f.service.settings(true); await f.service.tick();
    assert.equal(f.calls.length, 0, change + ': state changed while preparing the package');
    assert.equal((await f.service.status()).plugins[0].error, '');
  }
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

test('incompatible recommendations block installation and updates while retaining uninstall', async () => {
  const f = fixture();
  Object.assign(f.service.catalog[0], { unavailable: '尚不兼容当前 DSH', review: { version: '1.0.0' } });
  assert.throws(() => f.service.start('sample', 'install'), /尚不兼容/);
  f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, removable: true, version: '1.0.0' }];
  assert.throws(() => f.service.start('sample', 'update'), /尚不兼容/);
  await f.service.settings(true); await f.service.tick();
  assert.equal(f.calls.length, 0); assert.equal(f.lookups, 0);
  await f.service.start('sample', 'uninstall');
  assert.deepEqual(f.calls, [{ remove: 'sample-plugin' }]);
});

test('Subscriptions reports alpha incompatibility, blocks all installation work and retains uninstall', async () => {
  const subscription = recommendedPlugins.find(plugin => plugin.id === 'dsh-plugin-subscriptions');
  assert.equal(subscription.review, undefined, 'a compatibility restriction does not certify the community recommendation');
  for (const hostVersion of [undefined, '0.2.1-alpha.1']) {
    const f = fixture({ catalog: [structuredClone(subscription)], ...(hostVersion ? { hostVersion } : {}) });
    const state = (await f.service.status()).plugins[0];
    assert.match(state.unavailable, /0\.9\.8.*0\.2\.1-alpha\.1/);
    assert.throws(() => f.service.start(subscription.id, 'install'), /不兼容/);
    f.bundles = [{ name: subscription.packageName, installed: true, enabled: true, removable: true, version: '0.9.7' }];
    assert.throws(() => f.service.start(subscription.id, 'update'), /不兼容/);
    await f.service.settings(true); await f.service.tick();
    assert.equal(f.lookups, 0); assert.deepEqual(f.packages, []); assert.deepEqual(f.calls, []);
    assert.equal((await f.service.status()).plugins[0].removable, true);
    await f.service.start(subscription.id, 'uninstall');
    assert.deepEqual(f.calls, [{ remove: subscription.packageName }]);
    assert.equal((await f.service.status()).plugins[0].installed, false);
  }
});

test('Subscriptions on rc reports explicit availability, allows manual installation and remains unreviewed', async () => {
  const subscription = recommendedPlugins.find(plugin => plugin.id === 'dsh-plugin-subscriptions');
  const f = fixture({ catalog: [structuredClone(subscription)], hostVersion: '0.2.0-rc.2' });
  f.version = '0.9.8';
  assert.equal((await f.service.status()).plugins[0].unavailable, null, 'explicit null overrides the browser catalog alpha fallback');
  await f.service.start(subscription.id, 'install');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].spec, 'dsh-plugin-subscriptions@0.9.8');
  assert.equal((await f.service.status()).plugins[0].installed, true);
  assert.equal((await f.service.status()).plugins[0].unavailable, null);
  assert.deepEqual(Object.keys(f.calls[0].options).sort(), ['enabled', 'requestId'], 'no compatibility exemption or script approval');
  assert.equal(f.service.catalog[0].review, undefined);
  f.bundles = [{ name: subscription.packageName, installed: true, enabled: true, removable: true, version: '0.9.7' }];
  await f.service.settings(true); await f.service.tick();
  assert.equal(f.calls.length, 1, 'the unreviewed community plugin never auto-updates');
  assert.equal(f.lookups, 1); assert.deepEqual(f.packages, []);
});

test('host incompatibility prevents even a reviewed Subscriptions automatic update from downloading', async () => {
  const subscription = structuredClone(recommendedPlugins.find(plugin => plugin.id === 'dsh-plugin-subscriptions'));
  // Review is a separate gate: satisfying it must not bypass host compatibility.
  subscription.review = { version: '0.9.8', sha256: 'a'.repeat(64) };
  const f = fixture({ catalog: [subscription], hostVersion: '0.2.1-alpha.1' });
  f.bundles = [{ name: subscription.packageName, installed: true, enabled: true, removable: true, version: '0.9.7' }];
  await f.service.settings(true); await f.service.tick();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.packages, []); assert.equal(f.lookups, 0);
  assert.match((await f.service.status()).plugins[0].unavailable, /不兼容/);
});

test('Turn Rewind keeps alpha blocked and rc explicitly available through the fixed source SHA', async () => {
  const plugin = recommendedPlugins.find(item => item.id === 'dsh-turn-rewind');
  const alpha = fixture({ catalog: [structuredClone(plugin)], hostVersion: '0.2.1-alpha.1' });
  assert.match((await alpha.service.status()).plugins[0].unavailable, /0\.3\.9.*0\.2\.1-alpha\.1/);
  assert.throws(() => alpha.service.start(plugin.id, 'install'), /不兼容/);
  alpha.bundles = [{ name: plugin.packageName, installed: true, enabled: true, removable: true, version: '0.3.9' }];
  assert.throws(() => alpha.service.start(plugin.id, 'update'), /不兼容/);
  await alpha.service.settings(true); await alpha.service.tick();
  assert.equal(alpha.lookups, 0); assert.deepEqual(alpha.packages, []); assert.deepEqual(alpha.calls, []);
  await alpha.service.start(plugin.id, 'uninstall');
  assert.deepEqual(alpha.calls, [{ remove: plugin.packageName }]);

  const rc = fixture({ catalog: [structuredClone(plugin)], hostVersion: '0.2.0-rc.2' }); rc.version = '0.3.9';
  assert.equal((await rc.service.status()).plugins[0].unavailable, null);
  await rc.service.start(plugin.id, 'install');
  assert.deepEqual(rc.packages, [{
    url: 'https://codeload.github.com/Anionex/dsh-turn-rewind/tar.gz/9610ab93c87e2405e7512d53a099b8fb2caf6936',
    sha256: 'f4ca526ccf81d499546276cebeceb8e2cf0b9f3393bae68751c7440848ab16f2',
  }]);
  assert.equal(rc.calls[0].spec, plugin.packageName + '@file:/verified/package.tgz');
  assert.deepEqual(Object.keys(rc.calls[0].options).sort(), ['enabled', 'requestId']);
  assert.equal(rc.lookups, 0);
  assert.equal((await rc.service.status()).plugins[0].installed, true);
  await rc.service.settings(true); await rc.service.tick();
  assert.equal(rc.calls.length, 1, 'the source snapshot remains manual-only');
});

for (const { id, version, hosts } of [
  { id: 'omd-intent-assistant', version: '0.2.0', hosts: ['0.2.1-alpha.1'] },
]) test(`${id} rejects incompatible hosts before lookup or download and retains managed uninstall`, async () => {
  const plugin = recommendedPlugins.find(item => item.id === id);
  const review = structuredClone(plugin.review);
  assert.equal(plugin.review?.version, '0.2.0');
  for (const hostVersion of hosts) {
    const f = fixture({ catalog: [structuredClone(plugin)], hostVersion });
    assert.match((await f.service.status()).plugins[0].unavailable, new RegExp(version.replaceAll('.', '\\.')));
    assert.throws(() => f.service.start(id, 'install'), /不兼容/);
    f.bundles = [{ name: plugin.packageName, installed: true, enabled: true, removable: true, version }];
    assert.throws(() => f.service.start(id, 'update'), /不兼容/);
    await f.service.settings(true); await f.service.tick();
    assert.equal(f.lookups, 0); assert.deepEqual(f.packages, []); assert.deepEqual(f.calls, []);
    assert.deepEqual(f.service.catalog[0].review, review, 'host restrictions leave historical review or community status intact');
    assert.equal((await f.service.status()).plugins[0].removable, true);
    await f.service.start(id, 'uninstall');
    assert.deepEqual(f.calls, [{ remove: plugin.packageName }]);
  }
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
  const { pluginInstallSpec, latestPluginVersion } = await import('../src/recommended-plugins.mjs');
  const plugin = { id: 'github-fixture', packageName: 'synthetic-plugin', githubRelease: 'test-fixtures/synthetic-plugin' };
  const spec = 'https://github.com/test-fixtures/synthetic-plugin/releases/download/v0.1.5/synthetic-plugin-0.1.5.tgz';
  assert.equal(pluginInstallSpec(plugin, '0.1.5'), spec);
  const f = fixture({ catalog: [plugin], hostVersion: '0.1.6-alpha.2' }); f.version = '0.1.5';
  await f.service.tick(); assert.equal(f.calls.length, 0);
  await f.service.start(plugin.id, 'install'); assert.equal(f.calls[0].spec, spec);
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async url => { assert.equal(url, 'https://api.github.com/repos/test-fixtures/synthetic-plugin/releases/latest'); return Response.json({tag_name:'v0.1.5',assets:[{browser_download_url:spec}]}); };
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

test('intent assistant on rc is explicitly available, release-pinned and never installed by opt-in auto updates', async () => {
  const { recommendedPlugins } = await import('../src/recommended-plugin-catalog.mjs');
  const { pluginInstallSpec } = await import('../src/recommended-plugins.mjs');
  const { readFile } = await import('node:fs/promises');
  const plugin = recommendedPlugins.find(p => p.id === 'omd-intent-assistant');
  assert.equal(plugin.review.version, '0.2.0');
  assert.equal(pluginInstallSpec(plugin, plugin.review.version), 'https://github.com/gulagala001/omd-prompt-optimizer/releases/download/v0.2.0/omd-prompt-optimizer-0.2.0.tgz');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) assert.equal(pkg[field]?.[plugin.packageName], undefined);
  const f = fixture({ catalog: [plugin], hostVersion: '0.2.0-rc.2' }); f.version = '0.2.0'; await f.service.settings(true);
  assert.equal((await f.service.status()).plugins[0].unavailable, null);
  await f.service.tick(); assert.equal(f.calls.length, 0); assert.equal(f.lookups, 0);
  await f.service.start(plugin.id, 'install'); assert.equal(f.calls.length, 1);
  assert.equal((await f.service.status()).plugins[0].installed, true);
  assert.deepEqual(Object.keys(f.calls[0].options).sort(), ['enabled', 'requestId']);
  assert.equal(f.calls[0].spec, plugin.packageName + '@file:/verified/package.tgz');
  assert.deepEqual(f.packages, [{ url: pluginInstallSpec(plugin, plugin.review.version), sha256: plugin.review.sha256 }]);
});

test('source-only recommendations pin a checked commit and never follow tags or latest', async () => {
  const { recommendedPlugins } = await import('../src/recommended-plugin-catalog.mjs');
  const { pluginInstallSpec } = await import('../src/recommended-plugins.mjs');
  const { readFile } = await import('node:fs/promises');
  const plugin = recommendedPlugins.find(p => p.id === 'dsh-infinite-gen-4');
  assert.equal(plugin.review.version, '0.4.0');
  assert.equal(plugin.review.source.commit, '5e377394fe9d6aeab6380e2a5a5f959bc1384426');
  const spec = 'https://codeload.github.com/Minglink/dsh-infinite-gen-4/tar.gz/' + plugin.review.source.commit;
  assert.equal(pluginInstallSpec(plugin, '0.4.0'), spec);
  assert.throws(() => pluginInstallSpec(plugin, '1.0.0'), /源码快照/);
  assert.throws(() => pluginInstallSpec({ ...plugin, review: { ...plugin.review, source: { ...plugin.review.source, commit: 'master' } } }, '0.4.0'), /源码快照/);
  assert.throws(() => pluginInstallSpec({ ...plugin, review: { ...plugin.review, sha256: undefined } }, '0.4.0'), /源码快照/);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) assert.equal(pkg[field]?.[plugin.packageName], undefined);
  const f = fixture(); f.service.catalog = [plugin]; await f.service.settings(true);
  await f.service.tick(); assert.equal(f.calls.length, 0); assert.equal(f.lookups, 0);
  await f.service.start(plugin.id, 'install');
  assert.equal(f.calls[0].spec, plugin.packageName + '@file:/verified/package.tgz');
  assert.deepEqual(f.packages, [{ url: spec, sha256: plugin.review.sha256 }]);
  f.bundles = [{ name: plugin.packageName, version: plugin.review.version, enabled: true, installed: true, removable: true }];
  f.time = AUTO_UPDATE_INTERVAL + 2;
  await f.service.tick(); assert.equal(f.calls.length, 1, 'installed source snapshots never auto-update'); assert.equal(f.packages.length, 1);
  await f.service.start(plugin.id, 'update');
  assert.equal(f.calls.length, 2, 'a manual update reapplies the checked archive even if upstream kept its version'); assert.equal(f.lookups, 0);
  f.bundles = [{ name: plugin.packageName, version: plugin.review.version, enabled: false, installed: true, removable: true }];
  await f.service.start(plugin.id, 'update'); assert.equal(f.calls.length, 3); assert.equal(f.calls[2].options.enabled, false);
  f.bundles = [{ name: plugin.packageName, version: '0.5.0', enabled: false, installed: true, removable: true }];
  await f.service.start(plugin.id, 'update'); assert.equal(f.calls.length, 3, 'a newer user installation is not downgraded');
});

test('verified package preparation failures and late cancellation never reach the installer', async () => {
  for (const scenario of ['checksum', 'closed', 'installed', 'disabled-auto']) {
    const f = fixture(); f.service.catalog[0].review = { version: '1.0.0', sha256: 'a'.repeat(64) };
    if (scenario === 'disabled-auto') {
      f.bundles = [{ name: 'sample-plugin', installed: true, enabled: true, version: '0.9.0' }];
      await f.service.settings(true);
    }
    f.service.preparePackage = async () => {
      if (scenario === 'checksum') throw Error('SHA-256 不一致');
      if (scenario === 'closed') f.service.close();
      if (scenario === 'installed') f.bundles = [{ name: 'sample-plugin', installed: true }];
      if (scenario === 'disabled-auto') await f.service.settings(false);
      return 'file:/verified/package.tgz';
    };
    await f.service.start('sample', scenario === 'disabled-auto' ? 'update' : 'install', scenario === 'disabled-auto');
    assert.equal(f.calls.filter(c => c.spec).length, 0, scenario);
  }
});

test('an activation failure can retry the installed version without claiming it is already current', async () => {
  const f = fixture();
  f.service.catalog[0].review = { version: '1.0.0', sha256: 'a'.repeat(64) };
  f.service.manager.installBundle = async (spec, options) => {
    f.calls.push({ spec, options });
    // The native host can finish pnpm before the enable step fails. The
    // dependency then exists at the target version, without a usable result.
    f.bundles = [{ name: 'sample-plugin', version: '1.0.0', installed: true, enabled: false, removable: true }];
    return f.calls.length === 1
      ? { application: 'failed', stage: 'enable', bundle: 'sample-plugin', changed: true, error: { diagnostic: 'activation failed once' } }
      : { application: 'restart-required', stage: 'enable', bundle: 'sample-plugin' };
  };
  await f.service.start('sample', 'install');
  assert.match((await f.service.status()).plugins[0].error, /activation failed once/);
  await f.service.start('sample', 'update');
  assert.equal(f.calls.length, 2, 'the failed enable step must not make update a no-op');
  assert.equal(f.calls[1].options.enabled, false, 'retry preserves the current native enablement');
  assert.equal(f.calls[1].spec, 'sample-plugin@file:/verified/package.tgz', 'the host can identify an unchanged local dependency');
  const state = (await f.service.status()).plugins[0];
  assert.equal(state.error, '');
  assert.equal(state.restartRequired, true);
  assert.match(state.message, /更新已完成/);
  await f.service.start('sample', 'update');
  assert.equal(f.calls.length, 2, 'a successful retry restores the normal same-version no-op');
});

test('inventory read failures release the operation and preserve a retryable installation', async () => {
  const f = fixture();
  const list = f.service.manager.listBundles;
  f.service.manager.listBundles = async () => { throw Error('inventory unavailable'); };
  await f.service.start('sample', 'install');
  assert.equal(f.service.job, null); assert.equal(f.service.current, null);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.service.status(), /inventory unavailable/);
  f.service.manager.listBundles = list;
  assert.match((await f.service.status()).plugins[0].error, /inventory unavailable/);
  await f.service.start('sample', 'install');
  assert.equal(f.calls.length, 1);
  assert.equal((await f.service.status()).plugins[0].error, '');
});

test('failed version lookups cancel the unused response body before retry', async () => {
  const { latestPluginVersion } = await import('../src/recommended-plugins.mjs');
  const original = globalThis.fetch;
  let cancelled = false;
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('fixture unavailable')); },
      cancel() { cancelled = true; },
    }), { status: 503 });
    await assert.rejects(latestPluginVersion(catalog[0], new AbortController().signal), /HTTP 503/);
    assert.equal(cancelled, true, 'unused error bodies must not occupy a transfer until the lookup timeout');
    globalThis.fetch = async () => Response.json({ name: 'sample-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } });
    assert.equal(await latestPluginVersion(catalog[0], new AbortController().signal), '1.0.0');
  } finally { globalThis.fetch = original; }
});


test('OpenDesign uses its pinned bridge release instead of the unrelated OMD latest tag', async t => {
 const { recommendedPlugins }=await import('../src/recommended-plugin-catalog.mjs');
 const { pluginInstallSpec,latestPluginVersion }=await import('../src/recommended-plugins.mjs');
 const p=recommendedPlugins.find(x=>x.id==='dsh-open-design');
 const spec=pluginInstallSpec(p,p.review.version);
 assert.equal(spec,'https://github.com/gulagala001/oh-my-dsh/releases/download/opendesign-v0.1.0-omd.1.0.0/dsh-open-design-0.1.0-omd.1.0.0.tgz');
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>{assert.equal(url,'https://api.github.com/repos/gulagala001/oh-my-dsh/releases/tags/opendesign-v0.1.0-omd.1.0.0');return new Response(JSON.stringify({tag_name:p.review.releaseTag,assets:[{browser_download_url:spec}]}));};
 assert.equal(await latestPluginVersion(p,new AbortController().signal),p.review.version);
 globalThis.fetch=async()=>new Response(JSON.stringify({tag_name:'v0.2.0-rc.2.omd.0.4.0',assets:[{browser_download_url:spec}]}));
 await assert.rejects(latestPluginVersion(p,new AbortController().signal),/固定桥接版本/);
});
