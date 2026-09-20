import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('iOS Liquid Glass real shell, sidebar, settings, workbench and recovery', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const screenshots = new URL('../data/ios-liquid-glass-qa/', import.meta.url);
  const capture = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await mkdir(screenshots, { recursive: true });
    const path = join(f.root, name + '.png');
    // Sidebar content unmounts on a JS timer after the native resize transition.
    await page.waitForTimeout(250);
    await page.screenshot({ path, animations: 'disabled' }); await copyFile(path, new URL(name + '.png', screenshots));
  };
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  };
  const dialog = page.getByRole('dialog');
  const style = (locator, property) => locator.evaluate((el, p) => getComputedStyle(el)[p], property);
  const visibleHit = async locator => locator.evaluate(el => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width > 0 && r.height > 0 && el.contains(hit);
  });
  await openSettings();
  await page.getByLabel('皮肤', { exact: true }).selectOption('ios-liquid-glass');
  await until(async () => await page.locator('html').getAttribute('data-omd-layout') === 'ios-liquid');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await capture('settings-' + mode);
    assert.equal(await visibleHit(page.getByLabel('皮肤', { exact: true })), true, 'settings escape sidebar backdrop containing block');
    await page.keyboard.press('Escape');
    await capture('chat-' + mode);
    assert.equal(await style(page.locator('.hHd-Xa_root'), 'borderRadius'), '30px');
    assert.notEqual(await style(page.locator('[data-composer-card]'), 'backdropFilter'), 'none');
    assert.equal(await visibleHit(page.locator('.hHd-Xa_newSession')), true);
    await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
    await page.getByRole('menu').waitFor(); await capture('menu-' + mode);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await until(async () => {
      const r = await page.locator('.tx-workbench').boundingBox();
      return r && r.width > 300 && r.x + r.width <= 1441;
    });
    await capture('workbench-' + mode);
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await openSettings();
  }
  const pages = ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设', '已归档会话'];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const name of pages) {
      const nav = page.locator('.VOzbGW_nav').getByRole('button', { name, exact: true });
      await nav.click();
      await until(async () => await nav.getAttribute('aria-current') === 'true');
      const dimensions = await dialog.evaluate(el => {
        const r = el.getBoundingClientRect(), c = el.querySelector('.VOzbGW_options');
        return { x: r.x, right: r.right, width: c.clientWidth, scroll: c.scrollWidth, viewport: innerWidth };
      });
      assert.ok(dimensions.x >= 0 && dimensions.right <= width + 1, name + ' dialog fits');
      assert.ok(dimensions.width >= 270, name + ' content readable: ' + JSON.stringify(dimensions));
      await capture(`settings-${width}-${name}`);
    }
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('降低透明与动态效果').check();
    assert.equal(await style(dialog, 'backdropFilter'), 'none');
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.keyboard.press('Escape');
    await capture('chat-' + width);
    await until(async () => await visibleHit(page.locator('.hHd-Xa_toggle')));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const input = page.locator('[data-composer-input]');
    await input.fill('检查液态玻璃皮肤的输入区');
    assert.equal(await visibleHit(input), true);
    assert.equal(await visibleHit(page.locator('.uV2eYG_primary')), true);
    await input.fill('');
    if (width === 390) {
      await page.locator('.hHd-Xa_toggle').click();
      await until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading')));
      await capture('mobile-sidebar');
      assert.equal(await visibleHit(page.locator('.hHd-Xa_newSession')), true);
      assert.equal(await page.locator('.wSkVaW_root').isVisible(), false, 'navigation sheet does not crush the conversation');
      await page.locator('.YDXeBa_sessionRow').first().click();
      await page.locator('[data-sidebar-collapsed="true"]').waitFor();
      await until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading')));
      const release = f.holdNextReply();
      try {
        await input.fill('检查发送与停止'); await page.locator('.uV2eYG_primary').click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor();
        const stop = page.locator('.uV2eYG_primary');
        assert.equal(await visibleHit(stop), true);
        await capture('mobile-running');
        await stop.click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor({ state: 'hidden' });
      } finally { release(); }
      await page.locator('.hHd-Xa_newSession').click();
      await page.locator('.pXSMma_headline').waitFor();
      await capture('mobile-new-conversation');
    }
    await openSettings();
  }
  await page.getByLabel('明暗模式', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'light');
  assert.equal(await style(page.getByLabel('降低透明与动态效果'), 'transitionDuration'), '0s');
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), 'ios-liquid');
  await openSettings(); await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  assert.deepEqual(f.errors, []);
});
