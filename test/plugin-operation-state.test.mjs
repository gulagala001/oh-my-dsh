import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionUpdater } from '../src/version-update.mjs';
import { RecommendedPluginManager } from '../src/recommended-plugins.mjs';

function fixture() {
  const bundle = { name: 'oh-my-dsh', installed: true, enabled: true, version: '1.0.0' };
  const release = { currentVersion: '1.0.0', latestVersion: '2.0.0', status: 'update', releases: [{ version: '2.0.0', unpublished: false }] };
  const manager = { listBundles: async () => [{ ...bundle }], cancelInstall: async () => {},
    async installBundle() { bundle.version = '2.0.0'; return { application: 'restart-required', bundle: bundle.name }; } };
  const versions = { snapshot: () => release, check: async () => release };
  return { bundle, release, manager, versions, service: new VersionUpdater({ versions, getManager: () => manager }) };
}

test('a native rollback clears obsolete restart-required state from an earlier update', async () => {
  const f = fixture(); await f.service.start('2.0.0');
  assert.equal((await f.service.status()).phase, 'restart-required');
  f.bundle.version = '1.0.0';
  const state = await f.service.status();
  assert.equal(state.phase, 'idle'); assert.equal(state.targetVersion, null); assert.equal(state.available, true);
});

test('an inventory read started before a new update cannot supersede its current progress', async () => {
  const f = fixture(), inventory = Promise.withResolvers(), checking = Promise.withResolvers();
  f.manager.listBundles = () => inventory.promise;
  const stale = f.service.status();
  f.versions.check = () => checking.promise;
  const job = f.service.start('2.0.0');
  inventory.resolve([{ ...f.bundle, version: '2.0.0' }]);
  const state = await stale;
  // Finish owned asynchronous work even when the following assertion fails.
  f.service.close(); checking.resolve(f.release); await job;
  assert.equal(state.phase, 'checking'); assert.equal(state.available, false);
});

test('an actionable native package diagnostic is shared by self-update and feature installation', async () => {
  const result = { application: 'failed', error: { code: 'operation-error' }, packageResult: { output: 'Package download checksum was rejected' } };
  const f = fixture(); f.manager.installBundle = async () => result;
  await f.service.start('2.0.0');
  const feature = new RecommendedPluginManager({ manager: { listBundles: async () => [], installBundle: async () => result },
    catalog: [{ id: 'addon', packageName: 'addon' }], latest: async () => '1.0.0',
    getConfig: () => ({}), saveConfig() {} });
  await feature.start('addon', 'install');
  assert.equal(f.service.snapshot().error, 'Package download checksum was rejected');
  assert.equal(feature.records.get('addon').error, f.service.snapshot().error);
  feature.close(); f.service.close();
});

test('a missing native install acknowledgement is not treated as a skipped update', async t => {
  const feature = new RecommendedPluginManager({ manager: { listBundles: async () => [], installBundle: async () => null },
    catalog: [{ id: 'addon', packageName: 'addon' }], latest: async () => '1.0.0',
    getConfig: () => ({}), saveConfig() {} });
  t.after(() => feature.close());
  await feature.start('addon', 'install');
  assert.match(feature.records.get('addon').error, /未能确认插件操作结果/);
});
