import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('published intent assistant installs only on request, stays off and uninstalls cleanly', {
  timeout: 180000, skip: process.env.OMD_INTENT_RELEASE_TEST !== '1' ? 'Opt-in release network verification' : false,
}, async t => {
  const f = await frontendFixture(t), { page } = f;
  const status = async () => (await page.request.get(new URL('trisoul-x/recommended-plugins', page.url()).href)).json();
  assert.equal((await status()).plugins.find(p => p.id === 'omd-intent-assistant').installed, false);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '推荐插件', exact: true }).click();
  const card = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: '需求理解 · OMD UI 增强版', exact: true }) });
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  await card.getByRole('button', { name: '安装', exact: true }).click();
  const installed = await until(async () => {
    const state = await status(), plugin = state.plugins.find(p => p.id === 'omd-intent-assistant');
    if (plugin.error) throw Error(plugin.error);
    return !state.busy && plugin.installed && plugin.version && plugin;
  }, 120000);
  assert.equal(installed.version, '0.1.0');
  const config = await (await page.request.get(new URL('omd-intent/api/config', page.url()).href)).json();
  assert.equal(config.config.enabled, false); assert.equal(config.runtime.hooks, 0);
  assert.equal(await page.getByRole('button', { name: '需求理解选项', exact: true }).count(), 0);
  if (!await card.isVisible()) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '推荐插件', exact: true }).click();
  }
  await until(() => card.getByRole('button', { name: '卸载', exact: true }).isEnabled());
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await until(async () => {
    const state = await status(), plugin = state.plugins.find(p => p.id === 'omd-intent-assistant');
    if (plugin.error) throw Error(plugin.error);
    return !state.busy && !plugin.installed;
  }, 60000);
  assert.equal((await page.request.get(new URL('omd-intent/api/config', page.url()).href)).status(), 404);
  assert.deepEqual(f.errors, []);
});
