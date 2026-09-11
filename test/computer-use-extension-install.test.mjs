import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionInstaller } from '../src/computer-use/extension-install.mjs';

async function installerFor(t) {
  const root = await mkdtemp(join(tmpdir(), "trisoul-cu-install-中文-'"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'); await cp(new URL('../browser-extension', import.meta.url), source, { recursive: true });
  const installer = new ExtensionInstaller(join(root, 'runtime'), join(root, 'bridge.sock'), { source, chromeUserDataDir: join(root, 'chrome') });
  return { installer, root, source };
}

test('Chrome setup prepares an owned, versioned bridge and detects repaired or updated files', { skip: process.platform === 'win32' }, async t => {
  const { installer, source } = await installerFor(t);
  assert.equal((await installer.status()).prepared, false);
  const results = await Promise.all([installer.prepare(), installer.prepare()]);
  assert.ok(results.every(result => result.prepared && !result.preparing));
  const initial = await installer.status(), before = await stat(installer.launcher);
  const registration = JSON.parse(await readFile(installer.registration, 'utf8'));
  assert.deepEqual(registration.allowed_origins, ['chrome-extension://' + initial.extensionId + '/']);
  assert.equal(registration.path, installer.launcher);
  assert.equal((await stat(installer.launcher)).mode & 0o777, 0o700);
  await installer.prepare(); assert.equal((await stat(installer.launcher)).mtimeMs, before.mtimeMs);
  assert.equal((await installer.status([{ build: initial.build }])).reloadRequired, false);
  await writeFile(join(installer.extensionPath, 'popup.js'), 'damaged fixture');
  assert.equal((await installer.status()).prepared, false);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
  await writeFile(join(source, 'popup.js'), (await readFile(join(source, 'popup.js'), 'utf8')) + '\n// fixture update\n');
  assert.equal((await installer.status()).updateAvailable, true);
  await installer.prepare();
  const updated = await installer.status([{ build: initial.build }]);
  assert.notEqual(updated.build, initial.build); assert.equal(updated.reloadRequired, true);
  assert.match(await readFile(join(installer.extensionPath, 'worker.js'), 'utf8'), new RegExp(updated.build));
});

test('Chrome setup preserves another instance registration', { skip: process.platform === 'win32' }, async t => {
  const { installer } = await installerFor(t);
  await mkdir(join(installer.profile, 'NativeMessagingHosts'), { recursive: true });
  const other = JSON.stringify({ name: 'ai.trisoul.computer_use', path: '/another/trisoul/native-host' });
  await writeFile(installer.registration, other);
  await assert.rejects(installer.prepare(), /其他实例/);
  assert.equal(await readFile(installer.registration, 'utf8'), other);
  assert.equal((await installer.status()).prepared, false);
});

test('a failed first Chrome registration can be retried without claiming unrelated files', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const { installer } = await installerFor(t), registrationDir = join(installer.profile, 'NativeMessagingHosts');
  await mkdir(registrationDir, { recursive: true }); await chmod(registrationDir, 0o500);
  try { await assert.rejects(installer.prepare(), error => error.code === 'EACCES'); }
  finally { await chmod(registrationDir, 0o700); }
  assert.equal((await installer.status()).prepared, false);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
});

test('the installed bridge really connects Chrome and reports the build loaded after update', { skip: process.platform === 'win32', timeout: 30000 }, async t => {
  const { extensionFixture } = await import('./fixtures/computer-use/extension.mjs');
  const env = await extensionFixture(t, { install: true, prefix: "trisoul-ext-中文-'-" });
  const before = await env.installer.status(env.hub.list());
  assert.equal(before.prepared, true); assert.equal(before.reloadRequired, false);
  assert.equal(env.browser.build, before.build);
  const page = await env.context.newPage(); await page.goto(env.fixture.url);
  await page.evaluate(() => localStorage.setItem('installer-session', 'preserve'));
  assert.ok((await env.hub.call(env.browser.id, 'tabs.list')).some(tab => tab.url === env.fixture.url + '/'));
  const extensionSettings = await env.context.newPage(); await extensionSettings.goto('chrome://extensions');
  const developerMode = extensionSettings.getByRole('button', { name: /^(开发者模式|Developer mode)$/ });
  if (await developerMode.getAttribute('aria-pressed') !== 'true') await developerMode.click();
  const popupScript = join(env.installer.source, 'popup.js');
  await writeFile(popupScript, (await readFile(popupScript, 'utf8')) + '\n// next installed fixture build\n');
  await env.installer.prepare();
  assert.equal((await env.installer.status(env.hub.list())).reloadRequired, true, 'copying files cannot claim the browser has loaded them');
  await extensionSettings.getByRole('button', { name: /^(重新加载|Reload)$/ }).click();
  for (let i = 0; i < 200 && env.hub.list()[0]?.build !== (await env.installer.bundle()).build; i++) await new Promise(resolve => setTimeout(resolve, 25));
  const after = await env.installer.status(env.hub.list());
  assert.equal(after.reloadRequired, false); assert.equal(env.hub.list()[0]?.build, after.build);
  assert.notEqual(after.build, before.build);
  assert.equal(page.isClosed(), false); assert.equal(await page.evaluate(() => localStorage.getItem('installer-session')), 'preserve');
});
