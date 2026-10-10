import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { recommendedPlugins, resolveRecommendedPlugin } from '../src/recommended-plugin-catalog.mjs';
import { RecommendedPluginManager, latestPluginVersion, pluginInstallSpec, actualHostVersion } from '../src/recommended-plugins.mjs';

const hostVersions = ['0.2.0-rc.2', '0.2.1-alpha.1', '0.2.1-alpha.2'];
const migrationPairs = hostVersions.flatMap(from => hostVersions.filter(to => to !== from).map(to => [from, to]));
const entry = recommendedPlugins.find(plugin => plugin.id === 'dsh-intelligent-ui');
function fixture(hostVersion, { installedVersion, enabled = true, catalogEntry = entry } = {}) {
  // Mechanism tests simulate a published fixed build independently of the
  // actual catalog's unpublished delivery state. Fixture hashes are synthetic.
  const plugin = structuredClone(catalogEntry);
  delete plugin.unavailable; delete plugin.unavailableHosts;
  for (const [host, build] of Object.entries(plugin.hostBuilds ?? {})) build.sha256 = createHash('sha256').update('synthetic fixture ' + host).digest('hex');
  let actualHost = hostVersion, config = {}, bundles = installedVersion ? [{ name: plugin.packageName, version: installedVersion, enabled, installed: true, removable: true }] : [];
  const calls = [], prepared = []; let lookups = 0;
  const service = new RecommendedPluginManager({ hostVersion: '0.2.1-alpha.1', getHostVersion: async () => actualHost,
    catalog: [plugin], getConfig: () => config, saveConfig: async patch => { config = { ...config, ...patch }; },
    latest: async () => { lookups++; throw Error('Host-pinned entries must never query latest'); },
    preparePackage: async (url, sha256) => { prepared.push({ url, sha256 }); return 'file:/fixture/' + sha256 + '.tgz'; },
    manager: { listBundles: async () => structuredClone(bundles), cancelInstall: async () => {},
      installBundle: async (spec, options) => { calls.push({ spec, options }); const build = plugin.hostBuilds?.[actualHost] ?? plugin.review; bundles = [{ name: plugin.packageName, version: build.version, enabled: options.enabled, installed: true, removable: true }]; return { application: 'restart-required' }; },
      removeBundle: async name => { calls.push({ remove: name }); bundles = []; return { application: 'applied' }; },
    },
  });
  return { service, plugin, calls, prepared, get lookups() { return lookups; }, set host(value) { actualHost = value; } };
}

test('IUI local delivery metadata pins the final 1.0.2 archive for each accepted SDK and OMD 0.13 host', () => {
  const hashes = {
    '0.2.0-rc.2': 'd45fcd994d9ceadec4c62a952b0e8471c5078f2912ce29c587bdcd9574c58459',
    '0.2.1-alpha.1': 'f43842d424cb6a4eee84e6bd22bc1b055e2ad261826cec73b2e9a814f2e3813b',
    '0.2.1-alpha.2': '12b350261a5c9b865603b52e4ab105c30e6f569af7b9ec5ba8fa170e9b4bdfa3',
  };
  assert.deepEqual(Object.keys(entry.hostBuilds), hostVersions);
  for (const host of hostVersions) {
    const build = entry.hostBuilds[host], version = host + '.iui.1.0.2';
    assert.deepEqual({ version: build.version, releaseTag: build.releaseTag, asset: build.asset, sha256: build.sha256, dsh: build.dsh, omd: build.omd }, {
      version, releaseTag: 'v' + version, asset: entry.packageName + '-' + version + '.tgz', sha256: hashes[host], dsh: host, omd: host + '.omd.0.13.0',
    });
    assert.equal(resolveRecommendedPlugin(entry, host).unavailable, entry.unavailable);
  }
});

test('the real unpublished IUI recommendation never downloads or installs a package', async () => {
  for (const host of hostVersions) {
    const f = fixture(host);
    f.service.catalog = [structuredClone(entry)];
    const state = (await f.service.status()).plugins[0];
    assert.match(state.unavailable, /未正式发布|尚未准备完成/);
    assert.equal(state.installed, false);
    assert.equal(state.review.version, host + '.iui.1.0.2');
    for (const action of ['install', 'update']) assert.throws(() => f.service.start(entry.id, action), /未正式发布|尚未准备完成/);
    assert.throws(() => pluginInstallSpec(resolveRecommendedPlugin(entry, host), host + '.iui.1.0.2'), /尚未就绪/);
    await f.service.settings(true); await f.service.tick();
    assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []); assert.equal(f.lookups, 0);
  }
});

for (const [id, version, releaseTag, sha256] of [
  ['dsh-plugin-subscriptions', '0.9.8-omd.1', 'v0.9.8-omd.1', 'a80b5fec117acc65f23f7f7d991050797621c621f76fbc577252b3389b2533cd'],
  ['omd-intent-assistant', '0.3.0', 'v0.3.0', '8b9eb882ddd57c4098b874628663615858c4a987f49fd6927235d7bd1afdeadf'],
]) test(`${id} preserves its public release identity and refuses unpublished a2 delivery while allowing uninstall`, async () => {
  const plugin = recommendedPlugins.find(item => item.id === id);
  assert.deepEqual({ version: plugin.review.version, releaseTag: plugin.review.releaseTag, sha256: plugin.review.sha256 }, { version, releaseTag, sha256 });
  assert.deepEqual(plugin.unavailableHosts, ['0.2.1-alpha.2']);
  assert.doesNotMatch(plugin.unavailable, /正在验收/);
  assert.match(plugin.unavailable, /尚未公开发布/);
  const f = fixture('0.2.1-alpha.2', { catalogEntry: plugin, installedVersion: version });
  f.service.catalog = [structuredClone(plugin)];
  const state = (await f.service.status()).plugins[0];
  assert.equal(state.unavailable, plugin.unavailable); assert.equal(state.installed, true); assert.equal(state.version, version);
  for (const action of ['install', 'update']) assert.throws(() => f.service.start(id, action), /尚未公开发布/);
  await f.service.settings(true); await f.service.tick();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []); assert.equal(f.lookups, 0);
  await f.service.start(id, 'uninstall'); assert.deepEqual(f.calls, [{ remove: plugin.packageName }]);
  assert.equal((await f.service.status()).plugins[0].installed, false);
});

for (const host of hostVersions) test(`Intelligent UI selects only the exact ${host} release archive and hash`, async () => {
  const f = fixture(host); const build = f.plugin.hostBuilds[host];
  const state = (await f.service.status()).plugins[0];
  assert.equal(state.unavailable, null); assert.equal(state.hostVersion, host); assert.equal(state.review.version, host + '.iui.1.0.2');
  await f.service.settings(true); await f.service.tick(); assert.equal(f.calls.length, 0, 'automatic update never installs an absent plugin');
  await f.service.start(entry.id, 'install');
  assert.deepEqual(f.prepared, [{ url: `https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v${build.version}/dsh-intelligent-ui-${build.version}.tgz`, sha256: build.sha256 }]);
  assert.equal(f.calls[0].spec, `dsh-intelligent-ui@file:/fixture/${build.sha256}.tgz`);
  assert.deepEqual(Object.keys(f.calls[0].options).sort(), ['enabled', 'requestId']); assert.equal(f.lookups, 0);
  await f.service.start(entry.id, 'update'); assert.equal(f.calls.length, 1, 'correct current build is a no-op');
});

test('unknown full host versions and incomplete hashes reject install/update but preserve uninstall', async () => {
  for (const host of [null, '0.2.0-rc.1', '0.2.1-alpha.3', '0.2.1', '0.2.1-alpha.1+unverified']) {
    const f = fixture(host, { installedVersion: hostVersions[0] + '.iui.1.0.2' });
    assert.match((await f.service.status()).plugins[0].unavailable, /完整版本|没有已核验/);
    assert.throws(() => f.service.start(entry.id, 'update'), /完整版本|没有已核验/);
    await f.service.settings(true); await f.service.tick(); assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []);
    await f.service.start(entry.id, 'uninstall'); assert.deepEqual(f.calls, [{ remove: entry.packageName }]);
  }
  for (const host of hostVersions) {
    const f = fixture(host); f.plugin.hostBuilds[host].sha256 = null; await f.service.status();
    assert.throws(() => f.service.start(entry.id, 'install'), /尚未准备完成/); assert.deepEqual(f.calls, []);
    assert.throws(() => pluginInstallSpec(resolveRecommendedPlugin(f.plugin, host), host + '.iui.1.0.2'), /尚未就绪/);
  }
});

test('an install before initial status resolves the actual host instead of rejecting or choosing the OMD build host', async () => {
  const f = fixture(hostVersions[0]); f.plugin.hostBuilds[hostVersions[1]].sha256 = null;
  await f.service.start(entry.id, 'install');
  assert.equal(f.calls.length, 1); assert.ok(f.prepared[0].url.includes('/v0.2.0-rc.2.iui.1.0.2/'));
  const unknown = fixture('0.3.0'); await unknown.service.start(entry.id, 'install');
  assert.deepEqual(unknown.calls, []); assert.deepEqual(unknown.prepared, []);
  assert.match((await unknown.service.status()).plugins[0].error, /没有已核验/);
});

for (const [from, to] of migrationPairs) test(`host migration ${from} → ${to} requires an explicit build switch and preserves disabled state`, async () => {
  const f = fixture(to, { installedVersion: from + '.iui.1.0.2', enabled: false });
  const status = (await f.service.status()).plugins[0]; assert.equal(status.needsBuildSwitch, true); assert.equal(status.expectedVersion, to + '.iui.1.0.2'); assert.match(status.message, /对应.*状态数据将保留/);
  await f.service.settings(true); await f.service.tick(); assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []);
  await f.service.start(entry.id, 'update'); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.enabled, false);
  assert.equal((await f.service.status()).plugins[0].needsBuildSwitch, false);
  assert.equal(f.lookups, 0); assert.ok(!f.calls.some(call => call.remove), 'switch replaces only the package and never uninstalls or deletes state');
});

test('automatic updates leave an enabled build from another host unchanged', async () => {
  for (const [from, to] of migrationPairs) {
    const f = fixture(to, { installedVersion: from + '.iui.1.0.2', enabled: true });
    await f.service.status(); await f.service.settings(true); await f.service.tick();
    assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []); assert.equal(f.lookups, 0);
    assert.equal((await f.service.status()).plugins[0].needsBuildSwitch, true);
  }
});

test('host changes while downloading never install the archive selected for the previous host', async () => {
  const f = fixture(hostVersions[0]); await f.service.status();
  f.service.preparePackage = async () => { f.host = hostVersions[1]; return 'file:/fixture/wrong-sdk.tgz'; };
  await f.service.start(entry.id, 'install'); assert.deepEqual(f.calls, []);
  assert.match((await f.service.status()).plugins[0].error, /宿主版本.*改变/);
  assert.equal((await f.service.status()).plugins[0].review.version, hostVersions[1] + '.iui.1.0.2');
});

test('a later compatibility restriction remains authoritative over an otherwise hash-pinned host build', async () => {
  const f = fixture(hostVersions[1], { installedVersion: hostVersions[0] + '.iui.1.0.2' });
  f.plugin.unavailable = '新报告的宿主能力问题，暂停安装与更新'; f.plugin.unavailableHosts = [hostVersions[1]];
  assert.equal((await f.service.status()).plugins[0].unavailable, f.plugin.unavailable);
  assert.throws(() => f.service.start(entry.id, 'update'), /宿主能力问题/);
  await f.service.settings(true); await f.service.tick(); assert.deepEqual(f.calls, []); assert.deepEqual(f.prepared, []);
  await f.service.start(entry.id, 'uninstall'); assert.deepEqual(f.calls, [{ remove: entry.packageName }]);
});

test('exact SHA-pinned fixed tags may accept their prerelease asset, while latest/draft/wrong-tag/wrong-asset remain refused', async t => {
  const f = fixture(hostVersions[1]); const plugin = resolveRecommendedPlugin(f.plugin, hostVersions[1]); const version = plugin.review.version;
  const asset = pluginInstallSpec(plugin, version); const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async url => {
    assert.equal(url, `https://api.github.com/repos/gulagala001/dsh-intelligent-ui/releases/tags/${plugin.review.releaseTag}`);
    return Response.json({ tag_name: plugin.review.releaseTag, prerelease: true, assets: [{ browser_download_url: asset }] });
  };
  assert.equal(await latestPluginVersion(plugin, new AbortController().signal), version);
  for (const patch of [{ draft: true }, { tag_name: 'v99.0.0' }, { assets: [{ browser_download_url: 'https://example.invalid/wrong.tgz' }] }]) {
    globalThis.fetch = async () => Response.json({ tag_name: plugin.review.releaseTag, prerelease: true, assets: [{ browser_download_url: asset }], ...patch });
    await assert.rejects(latestPluginVersion(plugin, new AbortController().signal), /固定桥接版本|缺少预期/);
  }
  for (const review of [{ ...plugin.review, allowPrerelease: false }, { ...plugin.review, sha256: null }]) {
    globalThis.fetch = async () => Response.json({ tag_name: plugin.review.releaseTag, prerelease: true, assets: [{ browser_download_url: asset }] });
    await assert.rejects(latestPluginVersion({ ...plugin, review }, new AbortController().signal), /缺少预期/);
  }
  const unpinned = { packageName: entry.packageName, githubRelease: entry.githubRelease, review: { allowPrerelease: true } };
  globalThis.fetch = async url => { assert.ok(url.endsWith('/latest')); return Response.json({ tag_name: 'v1.0.0', prerelease: true, assets: [{ browser_download_url: `https://github.com/${entry.githubRelease}/releases/download/v1.0.0/${entry.packageName}-1.0.0.tgz` }] }); };
  await assert.rejects(latestPluginVersion(unpinned, new AbortController().signal), /缺少预期/);
});

test('actual host resolution reads the native Loader manifest rather than the OMD build prefix', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-host-review-')); t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = join(root, 'host.json'); await writeFile(manifest, JSON.stringify({ name: '@deepseek-ai/dsh', version: hostVersions[0] }));
  for (const version of ['v1', 'v2']) {
    const internal = { version, resolveSync(...args) {
      assert.deepEqual(args, version === 'v2' ? ['file:///fixture/profile/', { specifier: '@deepseek-ai/dsh/package.json', attributes: {} }] : ['@deepseek-ai/dsh/package.json', 'file:///fixture/profile/', {}]);
      return { url: pathToFileURL(manifest).href };
    } };
    assert.equal(await actualHostVersion({ get: () => ({ internal }), baseUrl: 'file:///fixture/profile/' }), hostVersions[0]);
  }
  assert.equal(await actualHostVersion({ get: () => undefined }), null);
  await writeFile(manifest, JSON.stringify({ name: 'another-package', version: hostVersions[0] }));
  assert.equal(await actualHostVersion({ get: () => ({ internal: { version: 'v2', resolveSync: () => ({ url: pathToFileURL(manifest).href }) } }), baseUrl: 'file:///fixture/profile/' }), null);
});
