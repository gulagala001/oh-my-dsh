import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';

test('bundled skins cover every settings page in both modes and keep narrow content usable', { timeout: 120000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const nav = page.locator('.VOzbGW_nav');
  const selectPage = async name => {
    const entry = nav.getByRole('button', { name, exact: true, includeHidden: true });
    const visibleEntry = nav.getByRole('button', { name, exact: true });
    const categories = dialog.getByRole('button', { name: '设置分类', exact: true });
    await visibleEntry.or(categories).first().waitFor();
    if (!await entry.isVisible()) await categories.click();
    await entry.click();
  };
  const pages = ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设'];
  for (const skin of bundledSkins) {
    await selectPage('外观');
    await page.getByLabel('主题', { exact: true }).selectOption(skin.id);
    for (const mode of ['light', 'dark']) {
      await selectPage('外观');
      await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
      await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const name of pages) {
          await selectPage(name);
          await until(async () => await nav.getByRole('button', { name, exact: true, includeHidden: true }).getAttribute('aria-current') === 'true');
          await until(async () => await dialog.evaluate(el => getComputedStyle(el).getPropertyValue('--omd-bg').trim()) === skin.tokens[mode].bg);
          const metrics = await dialog.evaluate(el => {
            const content = el.querySelector('.VOzbGW_options');
            const s = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return { width: content.clientWidth, left: rect.left, right: rect.right, viewport: innerWidth, bg: s.backgroundColor, foreground: s.color, tokens: s.getPropertyValue('--omd-bg').trim() };
          });
          assert.equal(metrics.tokens, skin.tokens[mode].bg, skin.id + '/' + name + ' inherits the current palette');
          assert.ok(metrics.left >= 0 && metrics.right <= metrics.viewport + 1, skin.id + '/' + name + ' dialog fits viewport');
          if (width === 390) assert.ok(metrics.width >= 270, skin.id + '/' + name + ' narrow content width: ' + metrics.width);
          if (name === 'Oh My DSH') {
            for (const subpage of ['常用', '基础组件', '模型与身份', '实验性功能', '高级', '全局背景']) {
              const tab = page.locator('.cx-tabs').getByRole('button', { name: subpage, exact: true });
              await tab.click();
              await until(async () => await tab.getAttribute('aria-current') === 'page');
              assert.ok(await page.locator('.cx-panel').isVisible(), skin.id + '/' + subpage);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(errors, []);
});
