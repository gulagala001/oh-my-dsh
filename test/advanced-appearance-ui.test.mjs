import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';

async function settings(page) {
  if (!await page.getByRole('dialog').count()) await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  if (!await page.locator('.omd-advanced').evaluate(el => el.open)) await page.locator('.omd-advanced > summary').click();
}
const style = (page, selector, key) => page.locator(selector).first().evaluate((el, key) => getComputedStyle(el)[key], key);

test('advanced customization composes across themes, modes and wallpaper; restores without losing theme', { timeout: 120000 }, async t => {
  const { page, errors, root } = await frontendFixture(t);
  await settings(page);
  await page.getByLabel('启用高级外观定制', { exact: true }).check();
  await page.getByLabel('浅色会话区底色', { exact: true }).fill('#ffeedd');
  await page.getByLabel('浅色左侧栏底色', { exact: true }).fill('#ddecff');
  await page.getByLabel('浅色输入框底色', { exact: true }).fill('#fefefe');
  await page.getByLabel('浅色正文颜色', { exact: true }).fill('#221122');
  await page.getByLabel('浅色选中底色', { exact: true }).fill('#cceedd');
  await page.getByLabel('对话字号', { exact: true }).fill('18');
  await page.getByLabel('正文字体', { exact: true }).selectOption('serif');
  await page.locator('.omd-custom-group > summary').filter({ hasText: '圆角、边框与材质' }).click();
  await page.getByLabel('输入框圆角', { exact: true }).fill('12');
  await page.getByLabel('编辑配色模式', { exact: true }).selectOption('dark');
  await page.getByLabel('深色会话区底色', { exact: true }).fill('#161c28');
  await page.getByLabel('深色左侧栏底色', { exact: true }).fill('#203040');
  await page.getByLabel('深色输入框底色', { exact: true }).fill('#242b38');
  await page.getByLabel('深色正文颜色', { exact: true }).fill('#eeeeee');
  await page.getByLabel('深色选中底色', { exact: true }).fill('#345644');
  for (const theme of ['default', ...bundledSkins.map(s => s.id)]) {
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
      await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
      assert.equal(await style(page, '.wSkVaW_root', 'backgroundColor'), mode === 'light' ? 'rgb(255, 238, 221)' : 'rgb(22, 28, 40)', `${theme}/${mode} conversation`);
      assert.equal(await style(page, '.hHd-Xa_root', 'backgroundColor'), mode === 'light' ? 'rgb(221, 236, 255)' : 'rgb(32, 48, 64)', `${theme}/${mode} sidebar`);
      assert.equal(await style(page, '[data-composer-card]', 'backgroundColor'), mode === 'light' ? 'rgb(254, 254, 254)' : 'rgb(36, 43, 56)', `${theme}/${mode} input`);
      assert.equal(await style(page, '.YDXeBa_sessionRow.YDXeBa_selected', 'backgroundColor'), mode === 'light' ? 'rgb(204, 238, 221)' : 'rgb(52, 86, 68)', `${theme}/${mode} selection`);
      assert.equal(await style(page, '[data-composer-card]', 'borderTopLeftRadius'), '12px');
      assert.equal(await style(page, '[data-composer-input]', 'fontSize'), '18px');
      assert.match(await style(page, '[data-composer-input]', 'fontFamily'), /Georgia/);
    }
  }
  await page.getByLabel('主题', { exact: true }).selectOption('default');
  // No light-only override is allowed to leak into dark mode with the default theme.
  await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
  if (!await page.locator('.omd-advanced').evaluate(el => el.open)) await page.locator('.omd-advanced > summary').click();
  await page.getByLabel('编辑配色模式', { exact: true }).selectOption('light');
  await page.getByLabel('浅色强调色', { exact: true }).fill('#aabbcc');
  await page.locator('.omd-custom-group').first().scrollIntoViewIfNeeded();
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'advanced-colors.png') });
  assert.notEqual(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--dsw-alias-brand-primary').trim()), '#aabbcc');
  await page.getByLabel('启用高级外观定制', { exact: true }).uncheck();
  assert.equal(await page.locator('html').getAttribute('data-omd-custom'), null);
  await page.getByLabel('启用高级外观定制', { exact: true }).check();
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dd9933' } }).png().toBuffer() });
  await page.locator('html[data-omd-background]').waitFor();
  await page.getByLabel('背景显示区域', { exact: true }).selectOption('conversation');
  assert.equal(await style(page, '.wSkVaW_root', 'backgroundColor'), 'rgba(0, 0, 0, 0)');
  assert.equal(await style(page, '.hHd-Xa_root', 'backgroundColor'), 'rgb(32, 48, 64)');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.omd-appearance').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.locator('.omd-advanced > summary').scrollIntoViewIfNeeded();
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'advanced-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '恢复全部高级设置', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-custom'), null);
  assert.equal(await page.locator('html').getAttribute('data-omd-background'), 'conversation');
  assert.deepEqual(errors, []);
  console.log('Advanced artifacts:', root);
});

test('native and custom branding persist, sync and recover without losing other appearance preferences', { timeout: 90000 }, async t => {
  const { page, context, errors, root } = await frontendFixture(t);
  await settings(page);
  await page.getByLabel('Logo 与名称', { exact: true }).selectOption('native');
  await page.getByLabel('浏览器标题', { exact: true }).selectOption('native');
  assert.equal(await page.locator('.hHd-Xa_logoRow .tx-brand-mark').count(), 0);
  assert.equal(await page.locator('.hHd-Xa_logoRow svg').count() > 0, true);
  assert.equal(await page.locator('link[data-omd-favicon]').count(), 0);
  assert.match(await page.title(), /DeepSeek Harness$/);
  await page.getByLabel('主题', { exact: true }).selectOption('claude-cli-terminal');
  assert.equal(await page.locator('.hHd-Xa_logoRow .omd-cli-mark').count(), 0);
  if (!await page.locator('.omd-advanced').evaluate(el => el.open)) await page.locator('.omd-advanced > summary').click();
  await page.getByLabel('Logo 与名称', { exact: true }).selectOption('custom');
  await page.getByLabel('显示名称', { exact: true }).fill('我的工作台'); await page.getByLabel('显示名称', { exact: true }).press('Enter');
  await page.getByLabel('Logo 图片', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 16, height: 16, channels: 4, background: '#22aa66' } }).png().toBuffer() });
  await page.locator('.hHd-Xa_logoRow .omd-custom-brand-image').waitFor();
  assert.equal(await page.locator('.hHd-Xa_logoRow .tx-wordmark').textContent(), '我的工作台');
  await page.getByLabel('浏览器标题', { exact: true }).selectOption('custom');
  await page.getByLabel('标题名称', { exact: true }).fill('私人 $& 空间'); await page.getByLabel('标题名称', { exact: true }).press('Enter');
  assert.match(await page.title(), /私人 \$& 空间$/);
  await page.reload(); await settings(page);
  assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), '我的工作台');
  assert.match(await page.title(), /私人 \$& 空间$/);
  const other = await context.newPage(); await other.goto(page.url()); await settings(other);
  await other.getByLabel('Logo 与名称', { exact: true }).selectOption('native');
  await other.getByLabel('浏览器标题', { exact: true }).selectOption('native');
  await until(async () => await page.locator('.hHd-Xa_logoRow .omd-custom-brand-image').count() === 0);
  await until(async () => /DeepSeek Harness$/.test(await page.title()));
  await other.close();
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'advanced-brand-native.png') });
  const saved = await page.evaluate(() => localStorage.getItem('omd.skins.v1'));
  await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'omd.skins.v1') throw new DOMException('quota', 'QuotaExceededError'); return window.originalSetItem.call(this, key, value); }; });
  await page.getByLabel('浏览器标题', { exact: true }).selectOption('omd');
  await page.getByRole('alert').filter({ hasText: '浏览器存储不可用' }).waitFor();
  assert.match(await page.title(), /DeepSeek Harness$/);
  assert.equal(await page.getByLabel('浏览器标题', { exact: true }).inputValue(), 'native');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.goto(page.url() + (page.url().includes('?') ? '&' : '?') + 'omd-skin=default');
  assert.equal(await page.locator('html').getAttribute('data-omd-skin'), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('omd.skins.v1')), saved);
  assert.deepEqual(errors, []);
  console.log('Branding artifacts:', root);
});
