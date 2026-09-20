import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';

test('bundled skins work in real chat, both modes, portals, narrow settings and persistence', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let sent = false;
  f.replyWith(() => {
    if (sent) return { delta: { role: 'assistant', content: '皮肤验收完成。\n\n```js\nconst theme = "ready";\nconsole.log(theme);\n```\n\n保留清晰的正文、代码、失败状态与独立折叠记录。' }, finish_reason: 'stop' };
    sent = true;
    return { delta: { role: 'assistant', content: '检查命令与文件记录。', tool_calls: [
      { index: 0, id: 'skin-bash', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'printf skin-ready', description: '检查皮肤记录' }) } },
      { index: 1, id: 'skin-read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: join(f.root, 'missing-skin-file.txt') }) } },
    ] }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '验证内置主题的真实对话与操作记录' }] });
  await page.getByText('皮肤验收完成。', { exact: true }).waitFor();
  const processToggle = page.locator('[data-turn-process-tool-calls="2"]'); await processToggle.click();
  const group = page.locator('[data-cu-group] > button').filter({ hasText: '2 次操作' }); await group.click();
  await page.getByText('读取失败', { exact: true }).waitFor();
  const openSettings = async () => {
    if (!await page.getByRole('button', { name: '设置', exact: true }).isVisible()) await page.locator('.hHd-Xa_toggle').click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const appearance = dialog.getByRole('button', { name: '外观', exact: true });
    const categories = dialog.getByRole('button', { name: '设置分类', exact: true });
    // The portal mounts asynchronously. Wait for its actual navigation before
    // deciding whether this skin uses the narrow-screen category menu.
    await appearance.or(categories).first().waitFor();
    if (!await appearance.isVisible()) await categories.click();
    await appearance.click();
  };
  const capture = async name => { if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(f.root, name + '.png') }); };
  const available = [];
  for (const skin of bundledSkins) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openSettings();
    const select = page.getByLabel('皮肤', { exact: true });
    assert.equal(await select.locator(`option[value="${skin.id}"]`).count(), 1);
    await select.selectOption(skin.id); available.push(skin.id);
    assert.equal(await page.getByRole('button', { name: '移除当前皮肤', exact: true }).count(), 0, 'bundled skins cannot be accidentally removed');
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
      await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
      const inherited = await page.getByRole('dialog').evaluate(el => getComputedStyle(el).getPropertyValue('--omd-bg').trim());
      assert.equal(inherited, skin.tokens[mode].bg, skin.id + '/' + mode + ' portal palette');
      await page.keyboard.press('Escape');
      await until(async () => await page.locator('html').getAttribute('data-omd-skin') === skin.id);
      await page.getByText('皮肤验收完成。', { exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await group.getAttribute('aria-expanded'), 'true', 'skin switch keeps disclosure state');
      assert.equal(await page.getByText('读取失败', { exact: true }).isVisible(), true);
      const fontErrors = await page.evaluate(async () => {
        for (const face of document.fonts) await face.load();
        return [...document.fonts].filter(face => face.status === 'error').map(face => face.family);
      });
      assert.deepEqual(fontErrors, []);
      await capture(skin.id + '-' + mode);
      await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
      const menu = page.getByRole('menu'); await menu.waitFor();
      assert.equal(await menu.evaluate(el => getComputedStyle(el).getPropertyValue('--omd-bg').trim()), skin.tokens[mode].bg);
      await page.keyboard.press('Escape');
      await openSettings();
    }
    await page.getByLabel('降低透明与动态效果').check();
    assert.equal(await page.locator('[data-composer-card]').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-sidebar-collapsed=true]').waitFor();
    await until(async () => await page.locator('.omd-appearance').evaluate(el => el.clientWidth) > 270);
    const dialog = page.getByRole('dialog');
    await until(async () => await dialog.evaluate(el => {const r=el.getBoundingClientRect();return [r.left+12, r.right-12].every(x => el.contains(document.elementFromPoint(x, r.top+r.height/2)));})).catch(async e => {throw Error(skin.id + ' covered dialog: ' + await dialog.evaluate(el => {let a=el,out=[];while(a&&out.length<7){const s=getComputedStyle(a),r=a.getBoundingClientRect();out.push({cls:a.className,filter:s.backdropFilter,z:s.zIndex,pos:s.position,width:r.width});a=a.parentElement;}return JSON.stringify(out); }));});
    assert.equal(await page.locator('.omd-appearance').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, skin.id + ' narrow settings');
    await capture(skin.id + '-narrow');
    await page.reload(); await page.locator('.hHd-Xa_toggle').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-omd-skin'), skin.id);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === 'dark');
    // Reload defaults the nested groups to folded; explicitly reveal for the next skin.
    await processToggle.click(); await group.click();
  }
  assert.equal(available.length, bundledSkins.length);
  await openSettings(); await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-skin'), null);
  assert.equal(await page.getByLabel('皮肤', { exact: true }).locator('option').count(), bundledSkins.length + 1);
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Bundled skin UI artifacts:', f.root);
});
