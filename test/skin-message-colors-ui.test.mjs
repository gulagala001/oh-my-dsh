import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Codex user messages keep contrasting colors for plain text and computer references', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page, rpc, sessionId } = f;
  const reference = value => '<computer-use-target>' + JSON.stringify(value) + '</computer-use-target>';
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '请检查窗口和网页 ' + reference({ kind: 'app', id: 'fixture-editor', label: '测试编辑器' }) + reference({ kind: 'browser', id: 'fixture-browser', label: '测试浏览器' }) }] });
  await page.locator('.tx-cu-user-bubble').waitFor();
  const settings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  };
  const checkColors = async mode => {
    const foreground = mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
    const background = mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const colors = await page.locator('.Sixlwa_bubble, .tx-cu-user-bubble').evaluateAll(nodes => nodes.map(el => ({ cls: el.className, foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, descendants: [...el.querySelectorAll('*')].filter(el => el.textContent).map(el => ({ cls: el.className, color: getComputedStyle(el).color, fill: getComputedStyle(el).webkitTextFillColor })) })));
    assert.equal(colors.length, 2, 'both native and reference messages are present');
    for (const color of colors) {
      assert.equal(color.background, background, color.cls);
      assert.equal(color.foreground, foreground, color.cls);
      for (const child of color.descendants) {
        assert.equal(child.color, foreground, 'readable message text/reference label: ' + child.cls);
        assert.equal(child.fill, foreground, 'text fill follows the message palette: ' + child.cls);
      }
    }
  };
  await settings(); await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await page.keyboard.press('Escape');
    await checkColors(mode);
    await settings();
  }
  await page.keyboard.press('Escape');
  await page.reload(); await page.locator('.tx-cu-user-bubble').waitFor();
  await checkColors('dark');
  await settings(); await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  await page.keyboard.press('Escape');
  const restored = await page.locator('.tx-cu-user-bubble').evaluate(el => ({ foreground: getComputedStyle(el).color, primary: getComputedStyle(el).getPropertyValue('--dsw-alias-label-primary').trim() }));
  assert.equal(await page.locator('html').getAttribute('data-omd-skin'), null);
  assert.notEqual(restored.foreground, 'rgb(0, 0, 0)', 'leaving the skin restores the host palette');
  assert.deepEqual(f.errors, []);
});
