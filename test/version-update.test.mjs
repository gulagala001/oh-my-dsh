import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { VersionUpdater, versionInstallSpec, handleVersionUpdateApi } from '../src/version-update.mjs';

const currentVersion = '0.1.7-rc.2.4', latestVersion = '0.1.7-rc.2.5';
function fixture(options = {}) {
  const bundle = { name: 'trisoul_x', installed: true, enabled: true, version: currentVersion };
  const release = { currentVersion, latestVersion, status: 'update', error: null, stale: false };
  const calls = [];
  const manager = {
    listBundles: async () => [bundle],
    installBundle: async (spec, opts) => { calls.push({ spec, opts }); bundle.version = latestVersion; return { application: 'restart-required', bundle: 'trisoul_x' }; },
    cancelInstall: async id => calls.push({ cancel: id }),
  };
  const service = new VersionUpdater({ versions: { check: async () => release, snapshot: () => release }, getManager: () => manager, ...options });
  return { service, bundle, release, calls, manager };
}

test('updates only the checked official release and preserves enablement and the running version', async () => {
  const f = fixture(); f.bundle.enabled = false;
  await f.service.start(latestVersion);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].spec, 'github:gulagala001/oh-my-dsh#v' + latestVersion);
  assert.equal(f.calls[0].opts.enabled, false);
  assert.ok(f.calls[0].opts.requestId);
  assert.equal((await f.service.status()).phase, 'restart-required');
  assert.equal(f.release.currentVersion, currentVersion);
  const remounted = new VersionUpdater({ versions: f.service.versions, getManager: () => f.manager });
  assert.equal((await remounted.status()).targetVersion, latestVersion, 'pending installation survives a controller remount');
  await remounted.start(latestVersion);
  assert.equal(f.calls.length, 1, 'already-installed package cannot be installed again before restart');
  f.release.currentVersion = latestVersion;
  const restarted = new VersionUpdater({ versions: f.service.versions, getManager: () => f.manager });
  assert.equal((await restarted.status()).phase, 'idle');
});

test('concurrent clicks reserve one installation; progress belongs to its request', async () => {
  const f = fixture(); let finish;
  f.manager.installBundle = (_spec, options) => {
    f.calls.push(options);
    f.service.progress({ requestId: 'unrelated', phase: 'applying' });
    assert.equal(f.service.snapshot().phase, 'installing');
    f.service.progress({ requestId: options.requestId, phase: 'applying' });
    return new Promise(resolve => { finish = () => { f.bundle.version = latestVersion; resolve({ application: 'restart-required', bundle: 'trisoul_x' }); }; });
  };
  const job = f.service.start(latestVersion);
  assert.throws(() => f.service.start(latestVersion), /正在进行/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.service.status()).phase, 'applying');
  assert.equal((await f.service.status()).available, false);
  finish(); await job;
  assert.equal(f.calls.length, 1);
});

test('stale, changed, absent and arbitrary versions never reach the installer', async () => {
  for (const patch of [{ stale: true }, { error: 'offline' }, { latestVersion: '0.1.8-rc.1.1' }, { status: 'current' }]) {
    const f = fixture(); Object.assign(f.release, patch);
    await f.service.start(latestVersion);
    assert.equal(f.service.snapshot().phase, 'failed'); assert.equal(f.calls.length, 0);
  }
  for (const version of [null, undefined, '', 'github:someone/repo', '1.0.0;touch /tmp/x', '../evil', '--config']) {
    assert.throws(() => versionInstallSpec(version));
    assert.throws(() => fixture().service.start(version));
  }
  assert.equal(versionInstallSpec('v1.2.3'), 'github:gulagala001/oh-my-dsh#v1.2.3');
});

test('running tasks, missing manager and managed installations block writes', async () => {
  const fixtures = [fixture({ isRunning: () => true }), fixture({ getManager: () => undefined }), fixture(), fixture()];
  fixtures[2].bundle.readOnlyReason = 'management-required'; fixtures[3].bundle.installed = false;
  for (const f of fixtures) {
    assert.equal((await f.service.status()).available, false);
    await f.service.start(latestVersion);
    assert.equal(f.service.snapshot().phase, 'failed'); assert.equal(f.calls.length, 0);
  }
});

test('installation failures remain visible and can be retried; compatibility and approval errors retain their meaning', async () => {
  const cases = [
    [{ application: 'failed', error: { code: 'incompatible-version', incompatible: [{ name: 'trisoul_x', version: latestVersion, runtimeVersion: '0.1.7-rc.1' }] } }, /不兼容 DSH/],
    [{ application: 'failed', pendingBuilds: ['native-package'] }, /需要授权.*native-package/],
    [{ application: 'cancelled' }, /已取消/],
    [{ application: 'overridden' }, /覆盖/],
    [{ application: 'failed', error: { diagnostic: '下载失败' } }, /下载失败/],
    [{ application: 'restart-required', bundle: 'unexpected' }, /未能确认/],
    [{ application: 'restart-required', bundle: 'trisoul_x' }, /不一致/],
  ];
  for (const [result, message] of cases) {
    const f = fixture(), install = f.manager.installBundle;
    f.manager.installBundle = async () => result;
    await f.service.start(latestVersion);
    assert.equal((await f.service.status()).phase, 'failed');
    assert.match(f.service.snapshot().error, message);
    f.manager.installBundle = install;
    await f.service.start(latestVersion);
    assert.equal(f.service.snapshot().phase, 'restart-required');
  }
});

test('shutdown cancels its own host request and prevents later installation', async () => {
  const f = fixture(); let release;
  f.service.versions.check = () => new Promise(resolve => { release = () => resolve(f.release); });
  const job = f.service.start(latestVersion); f.service.close(); release(); await job;
  assert.equal(f.calls.length, 1); assert.ok(f.calls[0].cancel);
  assert.throws(() => f.service.start(latestVersion), /已停止/);
});

test('update API responds before the installation finishes and rejects unsupported methods and oversized bodies', async () => {
  const f = fixture(), sent = []; let finish;
  f.manager.installBundle = () => new Promise(resolve => { finish = () => { f.bundle.version = latestVersion; resolve({ application: 'restart-required', bundle: 'trisoul_x' }); }; });
  const common = { res: {}, url: new URL('http://localhost/trisoul-x/api/version-update'), service: f.service, send: (_res, code, data) => sent.push({ code, data }) };
  const req = Readable.from([Buffer.from(JSON.stringify({ version: latestVersion }))]); req.method = 'POST';
  await handleVersionUpdateApi({ ...common, req });
  assert.equal(sent.at(-1).code, 202); assert.ok(f.service.job);
  await new Promise(resolve => setImmediate(resolve)); finish(); await f.service.job;
  await handleVersionUpdateApi({ ...common, req: { method: 'GET' } });
  assert.equal(sent.at(-1).data.phase, 'restart-required');
  await handleVersionUpdateApi({ ...common, req: { method: 'DELETE' } });
  assert.equal(sent.at(-1).code, 405);
  const huge = Readable.from([Buffer.from('x'.repeat(5000))]); huge.method = 'POST';
  await assert.rejects(handleVersionUpdateApi({ ...common, req: huge }), error => error.statusCode === 413);
});
