import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { frontendFixture } from './fixtures/frontend.mjs';
import { VersionUpdater, versionInstallSpec } from '../src/version-update.mjs';

test('OMD itself updates through the native manager while its running server retains the old version', { timeout: 180000 }, async t => {
  const f = await frontendFixture(t, { headless: true, installedPackage: true }), run = promisify(execFile);
  const pack = async cwd => {
    const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', f.root],
      { cwd, shell: process.platform === 'win32', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const result = JSON.parse(stdout); return join(f.root, (Array.isArray(result) ? result : Object.values(result))[0].filename);
  };
  const original = await pack(new URL('../', import.meta.url));
  const staging = join(f.root, 'release'); await mkdir(staging);
  await run('tar', ['-xzf', original, '-C', staging]);
  const pkgFile = join(staging, 'package', 'package.json'), pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
  const currentVersion = pkg.version, latestVersion = pkg.version.replace(/\d+$/, number => String(Number(number) + 1));
  pkg.version = latestVersion; await writeFile(pkgFile, JSON.stringify(pkg, null, 2));
  const artifact = await pack(join(staging, 'package'));
  const call = async (method, args) => {
    const reply = await f.call('pluginManager/' + method, args);
    assert.equal(reply.result?.ok, true, JSON.stringify(reply)); return reply.result.value;
  };
  const versions = { snapshot: () => ({ currentVersion }), check: async () => ({ currentVersion, latestVersion, status: 'update' }) };
  let installs = 0;
  const service = new VersionUpdater({ versions, getManager: () => ({
    listBundles: () => call('listBundles', {}),
    installBundle: (spec, options) => {
      assert.equal(spec, versionInstallSpec(latestVersion)); installs++;
      return call('installBundle', { spec: 'file:' + artifact, options });
    },
    cancelInstall: requestId => call('cancelInstall', { requestId }),
  }) });
  t.after(() => service.close());
  await service.start(latestVersion);
  assert.equal(service.snapshot().phase, 'restart-required', JSON.stringify(service.snapshot()));
  assert.equal(installs, 1);
  const pending = await f.api('/version-update');
  assert.equal(pending.phase, 'restart-required'); assert.equal(pending.targetVersion, latestVersion);
  const disk = JSON.parse(await readFile(join(f.home, 'profiles/trisoul-x/package.json'), 'utf8'));
  const installedSpec = disk.dependencies.trisoul_x;
  assert.match(installedSpec, /^file:/);
  assert.equal(await realpath(resolve(f.home, 'profiles/trisoul-x', installedSpec.slice(5))), await realpath(artifact), 'the installed file spec resolves to the exact update artifact, including Windows path separators');
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e',
    "import { INSTALLED_VERSION } from './node_modules/trisoul_x/src/version.mjs'; process.stdout.write(INSTALLED_VERSION);"],
    { cwd: join(f.home, 'profiles/trisoul-x') });
  assert.equal(stdout, latestVersion, 'a fresh process reads the installed version');
  const runtime = await f.api('/state?session=' + f.sessionId);
  assert.equal(runtime.running, 'idle', 'the current conversation remains usable until restart');
});
