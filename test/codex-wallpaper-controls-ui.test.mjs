import { openWorkbench, openNativeGuide } from './fixtures/workbench.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Codex wallpaper leaves the spanning titlebar and the right pane independently clickable', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  await page.getByLabel('配色', { exact: true }).selectOption('palette:lavender');
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8899aa' } }).png().toBuffer() });
  await page.getByLabel('背景显示区域', { exact: true }).selectOption('conversation');
  await page.keyboard.press('Escape');
  await openWorkbench(page, '任务');
  await until(async () => (await page.locator('.tx-workbench:visible').boundingBox())?.width >= 300);
  const pane = await page.locator('[data-sidebar-right-panel][data-sidebar-right-open]').boundingBox();
  assert.ok(pane.y + pane.height >= 800 && pane.y + pane.height <= 820, 'the workbench uses the available height below the titlebar');
  const toggle = page.locator('.codex-panel-toggle');
  const hit = locator => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  await until(async () => await toggle.getAttribute('aria-expanded') === 'true');
  if (process.env.TRISOUL_UI_ARTIFACTS) { await page.screenshot({ path: join(f.root, 'codex-wallpaper-controls.png') }); console.log('Codex wallpaper controls:', f.root); }
  assert.equal(await hit(toggle), true, 'the empty right-column area does not cover the titlebar control');
  const guide = await openNativeGuide(page);
  const navigation = guide.locator('[data-sidebar-right-guide-entry="trisoul-x-pipeline"]');
  assert.equal(await hit(navigation), true, 'the pane still receives input');
  await navigation.click();
  await toggle.click();
  await until(async () => await toggle.getAttribute('aria-expanded') === 'false');
  await openWorkbench(page, '任务');
  await until(async () => await toggle.getAttribute('aria-expanded') === 'true');
  assert.equal(await hit(toggle), true);
  assert.deepEqual(f.errors, []);
});
