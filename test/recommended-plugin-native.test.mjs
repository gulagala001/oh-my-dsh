import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { frontendFixture } from './fixtures/frontend.mjs';
import { RecommendedPluginManager } from '../src/recommended-plugins.mjs';

test('fixed recommendation packages install, upgrade and remove through the native host manager', { timeout: 180000 }, async t => {
  const f = await frontendFixture(t, { headless: true });
  const name = 'omd-recommendation-fixture', packages = new Map();
  for (const version of ['1.0.0', '1.1.0']) {
    const directory = join(f.root, 'package-' + version); await mkdir(directory);
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, type: 'module',
      exports: { '.': './index.mjs' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    await writeFile(join(directory, 'index.mjs'), `export function apply(ctx) { ctx.logger.info('fixture ${version} active'); }`);
    await writeFile(join(directory, 'cordis.patch.yml'), `- insert:\n    - id: omd-recommendation-fixture\n      name: ${name}\n`);
    const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', f.root], { cwd: directory, shell: process.platform === 'win32', timeout: 30000 });
    const result = JSON.parse(stdout), packed = (Array.isArray(result) ? result : Object.values(result))[0];
    packages.set(`${name}@${version}`, 'file:' + join(f.root, packed.filename));
  }
  const call = async (method, args) => {
    const response = await f.call('pluginManager/' + method, args);
    assert.equal(response.result?.ok, true, JSON.stringify(response)); return response.result.value;
  };
  let latest = '1.0.0';
  const service = new RecommendedPluginManager({
    catalog: [{ id: 'fixture', packageName: name }], getConfig: () => ({}), saveConfig: async () => {}, latest: async () => latest,
    manager: {
      listBundles: () => call('listBundles', {}),
      installBundle: (spec, options) => { assert.ok(packages.has(spec)); return call('installBundle', { spec: packages.get(spec), options }); },
      removeBundle: name => call('removeBundle', { name }),
      cancelInstall: requestId => call('cancelInstall', { requestId }),
    },
  });
  t.after(() => service.close());
  const current = async () => (await service.status()).plugins[0];
  await service.start('fixture', 'install');
  assert.equal((await current()).error, ''); assert.equal((await current()).version, '1.0.0');
  assert.equal((await current()).enabled, true);
  latest = '1.1.0'; await service.start('fixture', 'update');
  assert.equal((await current()).error, ''); assert.equal((await current()).version, '1.1.0');
  assert.equal((await current()).restartRequired, true);
  await service.start('fixture', 'uninstall');
  assert.equal((await current()).error, ''); assert.equal((await current()).installed, false);
  const bundles = await call('listBundles', {});
  assert.equal(bundles.some(b => b.name === name), false);
});
