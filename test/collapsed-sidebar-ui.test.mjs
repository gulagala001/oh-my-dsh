import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';

test('collapsed theme rails align every navigation control and retain clickable centers', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page } = f, measurements = [];
  for (const skin of bundledSkins) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (await page.locator('.hHd-Xa_collapsed').count()) await page.locator('.hHd-Xa_toggle').click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('皮肤', { exact: true }).selectOption(skin.id);
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await page.keyboard.press('Escape');
    await page.locator('.hHd-Xa_toggle').click();
    await page.locator('.hHd-Xa_collapsed').waitFor();
    await until(async () => !await page.locator('.hHd-Xa_root').evaluate(el => el.classList.contains('hHd-Xa_fading')));
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 1000 });
      const measure = () => page.locator('.hHd-Xa_root').evaluate(rail => {
        const box = rail.getBoundingClientRect(), center = box.x + box.width / 2;
        const items = [...rail.querySelectorAll('button')].filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(button).visibility !== 'hidden';
        }).map(button => {
          const rect = button.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          return { label: button.getAttribute('aria-label') || button.textContent, offset: x - center,
            contained: rect.left >= box.left - 1 && rect.right <= box.right + 1,
            clickable: button.contains(document.elementFromPoint(x, y)) };
        });
        return { center, items };
      });
      await until(async () => (await measure()).items.every(item => Math.abs(item.offset) <= 1.5)).catch(async error => {
        await page.screenshot({ path: join(f.root, 'rail-failure.png') });
        throw Error(`${skin.id}/${mode}/${width}: ${JSON.stringify(await measure())}; ${error.message}; ${f.root}`);
      });
      const data = await measure();
      assert.ok(data.items.length >= 6, 'all navigation actions remain present');
      for (const item of data.items) {
        assert.ok(item.contained && item.clickable, `${skin.id}/${mode}/${width}: ${JSON.stringify(item)}`);
      }
      measurements.push({ skin: skin.id, mode, width, ...data });
      if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(f.root, `rail-${skin.id}-${mode}-${width}.png`) });
    }
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await writeFile(join(f.root, 'collapsed-sidebar.json'), JSON.stringify(measurements, null, 2));
    console.log('Collapsed sidebar evidence:', f.root);
  }
});
