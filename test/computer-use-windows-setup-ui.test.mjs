import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Windows setup exposes runtime removal, retains failures and offers reinstall after success', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let installed = true, fail = true;
  const actions = [];
  await page.route('**/trisoul-x/computer-use/setup?*', async route => {
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON().action; actions.push(action);
      if (action === 'remove-native') {
        if (fail) { await route.fulfill({ status: 500, json: { error: '测试：清理尚未确认，安装已保留' } }); return; }
        installed = false;
      } else { assert.equal(action, 'install-native'); installed = true; }
    }
    await route.fulfill({ json: { browser: { name: 'Fixture Chromium', installed: true, path: 'C:\\fixture\\chrome.exe' }, extension: { browsers: [] }, native: { platform: 'win32', supported: true, installed, removable: true, interactive: installed, captureSupported: installed, version: '0.1.1' } } });
  });
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  await page.getByRole('button', { name: '运行环境与权限', exact: true }).click();
  await page.getByText('桌面控制版本', { exact: true }).click();
  const remove = page.getByRole('button', { name: '移除桌面控制', exact: true });
  await remove.click();
  await page.getByRole('alert').filter({ hasText: '清理尚未确认' }).waitFor();
  assert.equal(await remove.isVisible(), true, 'failed removal keeps the installed runtime available for retry');
  assert.equal(await page.getByRole('button', { name: '安装桌面控制', exact: true }).count(), 0);
  fail = false; await remove.click();
  const install = page.getByRole('button', { name: '安装桌面控制', exact: true }); await install.waitFor();
  assert.equal(await remove.count(), 0);
  await install.click();
  await until(async () => (await page.locator('.tx-cu-setup').innerText()).includes('Windows 桌面'));
  await page.getByText('桌面控制版本', { exact: true }).click(); await remove.waitFor();
  assert.deepEqual(actions, ['remove-native', 'remove-native', 'install-native']);
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) { await page.locator('.tx-cu-setup').screenshot({ path: join(f.root, 'windows-runtime-removal.png') }); t.diagnostic('Windows removal UI: ' + f.root); }
});
