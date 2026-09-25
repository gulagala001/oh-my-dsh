import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('recommended plugin installs, checks updates and uninstalls through the host in an isolated profile', { timeout: 180000, skip: process.env.OMD_LIVE_PLUGIN_TESTS !== '1' ? 'Online third-party smoke; set OMD_LIVE_PLUGIN_TESTS=1' : false }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const status = () => page.evaluate(async () => {
    const response = await fetch('/trisoul-x/recommended-plugins');
    if (!response.ok) throw Error(`Plugin status ${response.status}`); return response.json();
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置' });
  await settings.getByRole('button', { name: '推荐插件', exact: true }).click();
  const card = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: 'dsh-status-rotator', exact: true }) });
  const blender = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: 'DSH × Blender', exact: true }) });
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  assert.equal(await blender.getByRole('button', { name: '安装', exact: true }).count(), 0);
  assert.match(await blender.innerText(), /尚未提供 DSH 标准插件包安装清单/);
  assert.equal((await status()).autoUpdate, false);
  const toggle = settings.getByRole('switch', { name: '自动更新推荐插件' });
  await toggle.click(); await until(async () => (await status()).autoUpdate); await until(() => toggle.isChecked());
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await settings.getByRole('button', { name: '推荐插件', exact: true }).click();
  await until(() => toggle.isChecked());
  await toggle.click(); await until(async () => !(await status()).autoUpdate); await until(async () => !(await toggle.isChecked()));
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.installed; }, 120000);
  await until(() => card.getByRole('button', { name: '更新', exact: true }).isEnabled());
  assert.match(await card.innerText(), /已安装 · v/);
  await card.getByRole('button', { name: '更新', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.message === '已是最新版本'; }, 30000);
  // Seed an older real release in this disposable profile, then exercise an
  // actual package upgrade, not only a "latest already installed" check.
  const cli = fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url));
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'trisoul-x', 'add', 'dsh-status-rotator@0.20.0'], { env: { ...process.env, DSH_HOME: f.home }, timeout: 60000 });
  await until(async () => (await status()).plugins.find(p => p.id === 'dsh-status-rotator').version === '0.20.0');
  await until(() => card.getByRole('button', { name: '更新', exact: true }).isEnabled());
  await card.getByRole('button', { name: '更新', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.version !== '0.20.0' && p.restartRequired; }, 60000);
  await card.getByText('待重启', { exact: true }).waitFor();
  await until(() => card.getByRole('button', { name: '卸载', exact: true }).isEnabled());
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && !p.installed; }, 60000);
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  assert.deepEqual(f.errors, []);
});
