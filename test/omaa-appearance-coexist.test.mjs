import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('shared appearance ownership suspends OMD effects without changing its saved settings', { timeout: 90000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  const buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#abcd12' } }).png().toBuffer();
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'local.png', mimeType: 'image/png', buffer });
  await page.locator('html[data-omd-background]').waitFor();
  const saved = await page.evaluate(() => localStorage.getItem('omd.skins.v1'));
  await page.keyboard.press('Escape');
  const surfaceHooks = await page.locator('[data-omd-surface]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-omd-surface')).sort());
  await page.evaluate(() => {
    const broker = document[Symbol.for('omd.omaa.appearance.v1')];
    window.releaseOmaaAppearance = broker.register({ id: 'omaa-fixture', priority: 10, select: () => ({ key: 'native-fixture' }), mount: () => {
      const marker = document.createElement('style'); marker.dataset.omaaFixture = ''; document.head.append(marker);
      return () => marker.remove();
    } });
  });
  await until(() => page.evaluate(() => !document.documentElement.classList.contains('trisoul-shell') && !document.querySelector('[data-omd-skin-style]') && !document.querySelector('[data-omd-background-layer]')));
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('[data-omd-favicon]').count(), 0);
  assert.deepEqual(await page.locator('[data-omd-surface]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-omd-surface')).sort()), surfaceHooks,
    'neutral host surface hooks remain available while theme styles and wallpaper are suspended');
  assert.equal(await page.evaluate(() => localStorage.getItem('omd.skins.v1')), saved);
  // Browser mode changes while OMAA owns appearance must not revive OMD CSS.
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await page.locator('[data-omd-skin-style]').count(), 0);
  await page.evaluate(() => window.releaseOmaaAppearance());
  await page.locator('html[data-omd-skin="codex-desktop"][data-omd-background]').waitFor();
  await until(() => page.evaluate(() => document.documentElement.classList.contains('trisoul-shell')));
  assert.equal(await page.locator('[data-omd-background-layer]').count(), 1);
  assert.equal(await page.locator('[data-omd-skin-style]').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('omd.skins.v1')), saved);
  await page.evaluate(() => window.releaseOmaaAppearance());
  assert.equal(await page.locator('[data-omd-skin-style]').count(), 1, 'stale cleanup cannot clear restored OMD appearance');
  assert.deepEqual(errors, []);
});
