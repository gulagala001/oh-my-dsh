import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionInstaller } from '../src/computer-use/extension-install.mjs';

// Run the real installer transactions on every OS. The registry adapter is
// injected here; actual Windows registry/ACL and browser launches have separate
// platform tests, and these results never claim Windows runtime coverage.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "omd-win-install 中文 '-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'); await cp(new URL('../browser-extension', import.meta.url), source, { recursive: true });
  const runtime = {
    build: 'a'.repeat(64), present: false, locked: false,
    records: [32, 64].map(view => ({ view, keyExists: false, hasValue: false, value: null })),
    async location() { return { build: this.build, directory: join(root, 'runtime', this.build), binary: join(root, 'runtime', this.build, 'fixture.exe') }; },
    async ensure() { const value = await this.location(); await mkdir(value.directory, { recursive: true }); await writeFile(value.binary, 'test executable', { mode: 0o700 }); this.present = true; },
    async valid() { return this.present; },
    async lock() { assert.equal(this.locked, false); this.locked = true; return async () => { this.locked = false; }; },
    async read() { return structuredClone(this.records); },
    async set(host, path) {
      assert.equal(this.locked, true);
      if (this.failRegistration) throw new Error('Injected registry write failure');
      this.records = this.records.map(entry => ({ ...entry, keyExists: true, hasValue: true, value: path }));
      if (this.afterRegistration) await this.afterRegistration();
    },
    async restore(host, path, records) {
      assert.equal(this.locked, true);
      if (this.records.some((entry, i) => entry.hasValue && entry.value !== path && entry.value !== records[i].value)) throw new Error('Browser registration changed during recovery');
      this.records = structuredClone(records);
    },
  };
  const installer = new ExtensionInstaller(join(root, 'host'), '\\\\.\\pipe\\omd-isolated-test', { platform: 'win32', source, chromeUserDataDir: join(root, 'Chrome User Data'), windowsRuntime: runtime });
  return { root, runtime, installer, source };
}

test('Windows installation uses an executable and owned registry entries, repairs files and detects loaded versions', async t => {
  const { installer, runtime, source } = await fixture(t);
  assert.equal((await installer.status()).supported, true);
  assert.equal((await installer.status()).prepared, false);
  await Promise.all([installer.prepare(), installer.prepare()]);
  const first = await installer.status(); assert.equal(first.prepared, true); assert.equal(runtime.locked, false);
  const registration = JSON.parse(await readFile(installer.registration, 'utf8'));
  assert.equal(registration.path, (await runtime.location()).binary);
  assert.deepEqual(registration.allowed_origins, ['chrome-extension://' + first.extensionId + '/']);
  const config = JSON.parse(await readFile(join((await runtime.location()).directory, 'bridge.json'), 'utf8'));
  assert.equal(config.pipe, installer.socketPath); assert.equal(config.origin, registration.allowed_origins[0]);
  assert.ok(runtime.records.every(entry => entry.value === installer.registration));
  const before = await readFile(join(installer.extensionPath, 'popup.js'));
  await writeFile(join(installer.extensionPath, 'popup.js'), 'damage');
  assert.equal((await installer.status()).prepared, false); await installer.prepare();
  assert.deepEqual(await readFile(join(installer.extensionPath, 'popup.js')), before);
  await writeFile(join(source, 'popup.js'), Buffer.concat([before, Buffer.from('\n// new extension build\n')]));
  await installer.prepare();
  assert.equal((await installer.status([{ build: first.build }])).reloadRequired, true);
  runtime.build = 'b'.repeat(64); assert.equal((await installer.status()).prepared, false);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
  assert.equal(JSON.parse(await readFile(installer.registration, 'utf8')).path, (await runtime.location()).binary);
});

test('Windows installer never overwrites another instance in either registry view', async t => {
  const { installer, runtime } = await fixture(t);
  runtime.records[1] = { view: 64, keyExists: true, hasValue: true, value: 'C:\\other\\host.json' };
  const before = structuredClone(runtime.records);
  await assert.rejects(installer.prepare(), /其他实例/);
  assert.deepEqual(runtime.records, before); assert.equal(runtime.locked, false);
  await assert.rejects(readFile(installer.receipt), { code: 'ENOENT' });
});

test('Windows failed registration rolls back files and a partial first installation remains repairable', async t => {
  const { installer, runtime } = await fixture(t);
  const before = structuredClone(runtime.records); runtime.failRegistration = true;
  await assert.rejects(installer.prepare(), /Injected registry/);
  assert.deepEqual(runtime.records, before); assert.equal((await installer.status()).prepared, false);
  await assert.rejects(readFile(installer.registration), { code: 'ENOENT' });
  runtime.failRegistration = false; await installer.prepare(); assert.equal((await installer.status()).prepared, true);
  assert.deepEqual(JSON.parse(await readFile(installer.receipt, 'utf8')).registryBefore, before);
});

test('Windows status detects a moved registration and preserves its new owner on repair', async t => {
  const { installer, runtime } = await fixture(t); await installer.prepare();
  runtime.records[0].value = 'C:\\new-owner\\host.json';
  assert.equal((await installer.status()).prepared, false);
  await assert.rejects(installer.prepare(), /其他实例/);
  assert.equal(runtime.records[0].value, 'C:\\new-owner\\host.json');
  await assert.rejects(installer.unregister(), /changed during recovery/);
  assert.equal(runtime.records[0].value, 'C:\\new-owner\\host.json');
});

test('Windows removal restores the prior registration and allows preparation again', async t => {
  const { installer, runtime } = await fixture(t), before = structuredClone(runtime.records);
  await installer.prepare(); await installer.unregister();
  assert.deepEqual(runtime.records, before); assert.equal((await installer.status()).prepared, false);
  await installer.unregister(); assert.deepEqual(runtime.records, before);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
});
