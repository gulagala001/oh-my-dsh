import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('headless DSH host removes and reinstates the plugin bundle without a browser', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { headless: true, lifecycleTrace: true });
  await until(async () => (await f.api('/state?session=' + f.sessionId)).running === 'idle');
  for (const enabled of [false, true, false, true]) {
    const response = await f.call('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled });
    if (response.result?.value?.application !== 'applied') {
      const inventory = await f.call('pluginManager/listPlugins', {});
      const bundles = await f.call('pluginManager/listBundles', {});
      console.error('Lifecycle trace', await f.lifecycle());
      console.error('Host lifecycle diagnostic', JSON.stringify({ response, plugins: inventory.result?.value?.filter(row => row.moduleName?.includes('trisoul')), bundles: bundles.result?.value?.filter(row => row.name === 'trisoul_x') }), f.log());
      const profile = join(f.home, 'profiles', 'trisoul-x');
      console.error('Profile entries', await readdir(profile));
      console.error('Profile manifest', await readFile(join(profile, 'package.json'), 'utf8'));
      console.error('Profile patch', await readFile(join(profile, 'cordis.patch.yml'), 'utf8'));
    }
    assert.equal(response.result?.ok, true, JSON.stringify(response));
    assert.equal(response.result.value.application, 'applied', JSON.stringify(response));
    const list = await f.call('pluginManager/listBundles', {});
    assert.equal(list.result.value.find(row => row.name === 'trisoul_x').enabled, enabled);
  }
});
