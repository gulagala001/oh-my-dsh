import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('native surfaces release scoped wallpaper and phone overlay after another owner takes over', { timeout: 120000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'owned-test.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#4477bb' } }).png().toBuffer() });
  await page.getByLabel('背景显示区域', { exact: true }).selectOption('sidebar');
  await page.keyboard.press('Escape');
  const layer = page.locator('[data-omd-background-layer]');
  await until(async () => await layer.isVisible());
  await page.locator('[data-omd-surface="sidebar-column"]').evaluate(el => el.setAttribute('data-omd-surface','foreign-sidebar'));
  await until(async () => await layer.getAttribute('hidden') !== null);
  assert.equal(await page.locator('html').getAttribute('data-omd-background'),null);
  assert.equal(await page.locator('[data-omd-surface="foreign-sidebar"]').count(),1);
  assert.equal(await layer.evaluate(el => el.parentElement === document.body),true);

  await page.reload();
  const frame = page.locator('[data-omd-surface="frame"]');
  await frame.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await until(async () => await frame.getAttribute('data-sidebar-collapsed') === 'true');
  await page.getByRole('button',{ name:'打开侧边栏',exact:true }).click();
  await page.getByRole('dialog',{ name:'侧栏导航',exact:true }).waitFor();
  await page.locator('[data-omd-surface="sidebar-column"]').evaluate(el => el.setAttribute('data-omd-surface','foreign-sidebar'));
  await until(async () => await page.locator('.omd-sidebar-scrim').count() === 0);
  assert.equal(await frame.getAttribute('data-omd-sidebar-overlay'),null);
  assert.equal(await page.locator('[data-omd-surface="foreign-sidebar"]').getAttribute('aria-modal'),null);
  assert.equal(await page.locator('[data-omd-surface="conversation"]').getAttribute('inert'),null);
  assert.equal(await page.locator('[data-composer-card]').isVisible(),true);
  assert.deepEqual(errors,[]);
});
