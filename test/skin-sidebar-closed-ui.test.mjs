import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('skin right panels paint only while open, including accessibility modes and restored width', { timeout: 120000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  const panel = page.locator('[data-sidebar-right-panel]');
  const settings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  };
  const paint = () => panel.evaluate(el => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, image: s.backgroundImage, shadow: s.boxShadow,
      filter: s.backdropFilter, webkitFilter: s.webkitBackdropFilter || 'none',
      borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth] };
  });
  const closed = async label => {
    await until(async () => !await panel.getAttribute('data-sidebar-right-open'));
    // Codex's layout integration can reset its width after collapse; iOS retains it.
    if (label.startsWith('ios-liquid-glass/')) assert.ok((await panel.boundingBox()).width > 300, label + ': historical width remains');
    assert.deepEqual(await paint(), { background: 'rgba(0, 0, 0, 0)', image: 'none', shadow: 'none',
      filter: 'none', webkitFilter: 'none', borders: ['0px', '0px', '0px', '0px'] }, label);
  };
  const cdp = await page.context().newCDPSession(page);
  for (const skin of ['ios-liquid-glass', 'codex-desktop', 'claude-cli-terminal']) {
    for (const mode of ['light', 'dark']) {
      for (const effect of ['normal', 'reduce-effects', 'contrast', 'transparency']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [
          { name: 'prefers-contrast', value: effect === 'contrast' ? 'more' : 'no-preference' },
          { name: 'prefers-reduced-transparency', value: effect === 'transparency' ? 'reduce' : 'no-preference' },
        ] });
        await settings();
        await page.getByLabel('皮肤', { exact: true }).selectOption(skin);
        await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
        await page.getByLabel('降低透明与动态效果').setChecked(effect === 'reduce-effects');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '打开工作台', exact: true }).click();
        await until(async () => await panel.getAttribute('data-sidebar-right-open'));
        await until(async () => (await panel.boundingBox())?.width > 300);
        assert.notEqual((await paint()).background, 'rgba(0, 0, 0, 0)', skin + ': open panel retains its surface');
        await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
        await closed(`${skin}/${mode}/${effect}`);
      }
    }
    await page.reload();
    await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
    await closed(skin + '/reload');
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    await page.locator('[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]').waitFor();
    assert.notEqual((await paint()).background, 'rgba(0, 0, 0, 0)', skin + ': fullscreen retains its surface');
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await closed(skin + '/fullscreen');
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await page.locator('[data-sidebar-right-panel="push"][data-sidebar-right-open]').waitFor();
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  }
  assert.deepEqual(errors, []);
});
