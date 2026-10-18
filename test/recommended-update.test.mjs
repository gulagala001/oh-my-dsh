import test from 'node:test';
import assert from 'node:assert/strict';
import { RecommendedPluginManager } from '../src/recommended-plugins.mjs';

const plugin = { id: 'addon', packageName: 'addon', review: { version: '2.0.0', sha256: 'a'.repeat(64) } };

// A controlled host boundary: HMR refuses installation over an existing bundle.
// The separate native fixture exercises this contract against installed DSH.
function fixture(t, { enabled = true, hmr = true, removal, installation, afterRemove, prepareError } = {}) {
  const trace = [], controls = { removal, installation, afterRemove };
  let bundle = { name: 'addon', version: '1.0.0', installed: true, enabled, removable: true };
  const manager = {
    async listBundles() { return bundle ? [{ ...bundle }] : []; },
    async removeBundle(name) {
      assert.equal(name, plugin.packageName);
      trace.push('remove');
      if (controls.removal) return controls.removal;
      if (!hmr && bundle.enabled) return { application: 'failed', error: { code: 'stop-profile' } };
      bundle = undefined;
      await controls.afterRemove?.();
      return { application: hmr ? 'applied' : 'restart-required' };
    },
    async installBundle(spec, options) {
      trace.push({ install: spec, enabled: options.enabled });
      if (hmr && bundle?.installed) return { application: 'failed', error: { code: 'already-installed' } };
      if (controls.installation) return controls.installation;
      bundle = { name: 'addon', version: plugin.review.version, installed: true, enabled: options.enabled, removable: true };
      return { application: hmr ? 'applied' : 'restart-required', bundle: 'addon', version: bundle.version };
    },
    async cancelInstall() {},
  };
  const service = new RecommendedPluginManager({
    manager, catalog: [plugin], hostVersion: '0.2.1-rc.2',
    getConfig: () => ({ recommendedPluginsAutoUpdate: true }), saveConfig: async () => {},
    async preparePackage() {
      trace.push('prepare');
      if (prepareError) throw prepareError;
      return 'file:/isolated-review/addon-2.0.0.tgz';
    },
  });
  t.after(() => service.close());
  return { service, trace, controls, view: async () => (await service.status()).plugins[0] };
}

test('reviewed updates retire the old bundle after package preparation and preserve enabled state', async t => {
  for (const enabled of [true, false]) {
    await t.test(`enabled=${enabled}`, async t => {
      const f = fixture(t, { enabled });
      await f.service.start('addon', 'update');
      assert.deepEqual(f.trace, ['prepare', 'remove', { install: 'addon@file:/isolated-review/addon-2.0.0.tgz', enabled }]);
      const view = await f.view();
      assert.equal(view.error, '');
      assert.equal(view.installed, true);
      assert.equal(view.version, '2.0.0');
      assert.equal(view.enabled, enabled);
    });
  }
});

test('preparation failure leaves the installed bundle untouched', async t => {
  const f = fixture(t, { prepareError: Error('archive checksum mismatch') });
  await f.service.start('addon', 'update');
  assert.deepEqual(f.trace, ['prepare']);
  const view = await f.view();
  assert.equal(view.version, '1.0.0');
  assert.equal(view.installed, true);
  assert.match(view.error, /checksum mismatch/);
});

test('only stop-profile permits installation after a refused removal', async t => {
  for (const application of ['failed', 'cancelled', 'overridden']) {
    await t.test(application, async t => {
      const f = fixture(t, { removal: { application, error: { code: 'operation-error', diagnostic: 'cannot retire bundle' } } });
      await f.service.start('addon', 'update');
      assert.deepEqual(f.trace, ['prepare', 'remove']);
      const view = await f.view();
      assert.equal(view.version, '1.0.0');
      assert.equal(view.installed, true);
      assert.ok(view.error);
      assert.equal(view.message, '');
    });
  }
  await t.test('running bundle without HMR', async t => {
    const f = fixture(t, { hmr: false });
    await f.service.start('addon', 'update');
    const view = await f.view();
    assert.equal(view.version, '2.0.0');
    assert.equal(view.enabled, true);
    assert.equal(view.restartRequired, true);
    assert.equal(view.error, '');
  });
});

test('failure or cancellation after removal reports the absent package and permits an explicit install retry', async t => {
  for (const application of ['failed', 'cancelled']) {
    await t.test(application, async t => {
      const f = fixture(t, { installation: { application, stage: 'install', error: { code: 'operation-error', diagnostic: 'fixture install failed' } } });
      await f.service.start('addon', 'update');
      const failed = await f.view();
      assert.equal(failed.installed, false);
      assert.equal(failed.enabled, false);
      assert.ok(failed.error);
      assert.equal(failed.message, '');
      f.controls.installation = undefined;
      await f.service.start('addon', 'install');
      const retried = await f.view();
      assert.equal(retried.installed, true);
      assert.equal(retried.version, '2.0.0');
      assert.equal(retried.error, '');
      assert.equal(f.trace.filter(item => item === 'remove').length, 1);
    });
  }
});

test('closing during removal does not start a new installation', async t => {
  const f = fixture(t);
  f.controls.afterRemove = () => f.service.close();
  await f.service.start('addon', 'update');
  assert.deepEqual(f.trace, ['prepare', 'remove']);
  const view = await f.view();
  assert.equal(view.installed, false);
  assert.ok(view.error);
  assert.equal(view.message, '');
});

test('opted-in automatic updates use the same host lifecycle', async t => {
  const f = fixture(t);
  await f.service.tick();
  assert.deepEqual(f.trace, ['prepare', 'remove', { install: 'addon@file:/isolated-review/addon-2.0.0.tgz', enabled: true }]);
  assert.equal((await f.view()).version, '2.0.0');
});
