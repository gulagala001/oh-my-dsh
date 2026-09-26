import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';
import { paletteCatalog } from '../src/client/skins/palette.mjs';
import { BACKGROUND_DB } from '../src/client/skins/background.mjs';

async function openSettings(page) {
  const dialog = page.getByRole('dialog');
  if (!await dialog.count()) {
    if (!await page.getByRole('button', { name: '设置', exact: true }).isVisible()) await page.locator('.hHd-Xa_toggle').click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
  }
  const appearance = dialog.getByRole('button', { name: '外观', exact: true });
  const categories = dialog.getByRole('button', { name: '设置分类', exact: true });
  await appearance.or(categories).first().waitFor();
  if (!await appearance.isVisible()) await categories.click();
  await appearance.click();
}
async function mode(page, value) {
  await page.getByLabel('明暗模式', { exact: true }).selectOption(value);
  await until(async () => await page.locator('html').getAttribute('data-appearance') === value);
}
const geometry = page => page.locator('[data-composer-card]').evaluate(el => ({ radius: getComputedStyle(el).borderRadius, font: getComputedStyle(document.querySelector('[data-composer-input]')).fontFamily }));

test('all built-in palettes compose with every layout without changing geometry', { timeout: 180000 }, async t => {
  const { page, errors, root } = await frontendFixture(t);
  await openSettings(page);
  const catalog = paletteCatalog(bundledSkins);
  assert.equal(await page.getByLabel('配色', { exact: true }).locator('option').count(), catalog.length + 1);
  assert.equal(await page.getByLabel('主题', { exact: true }).locator('option').count(), bundledSkins.length + 1);
  assert.equal(await page.getByLabel('配色', { exact: true }).locator('optgroup').count(), 6);
  for (const theme of ['default', ...bundledSkins.map(s => s.id)]) {
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByLabel('配色', { exact: true }).selectOption('theme');
    const baseline = await geometry(page);
    await page.getByLabel('配色', { exact: true }).selectOption(catalog[0].id);
    for (const appearance of ['light', 'dark']) {
      await mode(page, appearance);
      for (const palette of catalog) {
        await page.getByLabel('配色', { exact: true }).selectOption(palette.id);
        assert.deepEqual(await geometry(page), baseline, `${theme}/${palette.id}/${appearance} geometry`);
        const color = await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--omd-bg').trim());
        assert.equal(color, palette.tokens[appearance].bg, `${theme}/${palette.id}/${appearance} background`);
        const accent = await page.getByRole('dialog').evaluate(el => getComputedStyle(el).getPropertyValue('--omd-accent').trim());
        assert.equal(accent, palette.tokens[appearance].accent);
        assert.equal(await page.locator('html').getAttribute('data-omd-skin'), theme === 'default' ? null : theme);
        assert.equal(await page.locator('style[data-omd-skin-style]').count(), 1);
        if (process.env.TRISOUL_UI_ARTIFACTS && theme === 'codex-desktop' && ['palette:mint', 'palette:lavender', 'palette:sakura', 'palette:amber'].includes(palette.id)) {
          await page.keyboard.press('Escape');
          await page.screenshot({ path: join(root, palette.id.replace(':', '-') + '-' + appearance + '.png'), animations: 'disabled' });
          await openSettings(page);
        }
      }
    }
  }
  await page.getByLabel('主题', { exact: true }).selectOption('ios-liquid-glass');
  assert.equal(await page.getByLabel('配色', { exact: true }).inputValue(), catalog.at(-1).id);
  await page.reload(); await openSettings(page);
  assert.equal(await page.getByLabel('主题', { exact: true }).inputValue(), 'ios-liquid-glass');
  assert.equal(await page.getByLabel('配色', { exact: true }).inputValue(), catalog.at(-1).id);
  await page.getByLabel('配色', { exact: true }).selectOption('theme');
  await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-colors'), null);
  assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  assert.deepEqual(errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Palette matrix artifacts:', root);
});

test('background stays local, persists, synchronizes and preserves readable controls', { timeout: 120000 }, async t => {
  const { page, context, root, errors } = await frontendFixture(t);
  await openSettings(page);
  const buffer = await sharp({ create: { width: 3200, height: 1800, channels: 3, background: '#cd682b' } }).png().toBuffer();
  const upload = value => page.getByLabel('背景图片', { exact: true }).setInputFiles(value);
  await upload({ name: 'wallpaper.png', mimeType: 'image/png', buffer });
  await page.locator('html[data-omd-background]').waitFor();
  await until(() => page.locator('[data-omd-background-layer] img').evaluate(img => img.complete && img.naturalWidth === 2560));
  assert.equal(await page.locator('[data-composer-input]').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).opacity), '1');
  for (const [label, value] of [['背景模糊', '12'], ['背景明暗', '-25'], ['面板不透明度', '65']]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await until(async () => await page.getByLabel(label, { exact: true }).inputValue() === value);
  }
  await page.getByLabel('图片显示', { exact: true }).selectOption('contain');
  await until(() => page.locator('[data-omd-background-layer] img').evaluate(img => img.style.objectFit === 'contain'));
  for (const theme of bundledSkins) {
    await page.getByLabel('主题', { exact: true }).selectOption(theme.id);
    await page.getByLabel('配色', { exact: true }).selectOption('palette:mint');
    assert.equal(await page.locator('[data-omd-background-layer]').count(), 1);
    assert.equal(await page.getByLabel('背景模糊', { exact: true }).inputValue(), '12');
    await page.getByLabel('降低透明与动态效果').check();
    assert.equal(await page.locator('html').getAttribute('data-omd-background'), null);
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.locator('html[data-omd-background]').waitFor();
  }
  await page.reload(); await openSettings(page);
  await page.locator('html[data-omd-background]').waitFor();
  assert.equal(await page.getByLabel('背景明暗', { exact: true }).inputValue(), '-25');
  assert.equal(await page.getByLabel('面板不透明度', { exact: true }).inputValue(), '65');
  assert.equal(await page.getByLabel('配色', { exact: true }).inputValue(), 'palette:mint');
  const saved = await page.evaluate(async name => {
    const request = indexedDB.open(name, 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise((resolve, reject) => { const read = db.transaction('background').objectStore('background').get('current'); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    db.close();
    return { type: record.blob.type, name: record.name, local: localStorage.getItem('omd.skins.v1') };
  }, BACKGROUND_DB);
  assert.equal(saved.type, 'image/webp'); assert.equal(saved.name, 'wallpaper.png');
  assert.doesNotMatch(saved.local, /data:image|blob:|wallpaper\.png/);
  const before = await page.locator('[data-omd-background-layer] img').getAttribute('src');
  await upload({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await until(async () => (await page.getByRole('alert').textContent())?.includes('解码'));
  assert.equal(await page.locator('[data-omd-background-layer] img').getAttribute('src'), before);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.omd-appearance').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'appearance-background-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape');
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'appearance-background-chat.png') });
  const other = await context.newPage(); await other.goto(page.url()); await openSettings(other);
  await other.locator('html[data-omd-background]').waitFor();
  await other.getByRole('button', { name: '恢复默认背景', exact: true }).click();
  await until(async () => await page.locator('html').getAttribute('data-omd-background') === null);
  await other.close();
  assert.equal(await page.locator('html').getAttribute('data-omd-palette'), 'palette:mint');
  assert.deepEqual(errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Appearance artifacts:', root);
});
