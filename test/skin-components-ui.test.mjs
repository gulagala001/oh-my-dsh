import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import sample from './fixtures/skin.json' with { type: 'json' };

test('native skins reach real settings controls, selected states and button roles', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  const skin = structuredClone(sample);
  skin.tokens.common['button-bg'] = '#283858';
  skin.tokens.common['button-fg'] = '#ffffff';
  skin.tokens.common['button-hover'] = '#354b70';
  skin.tokens.common['switch-on'] = '#a02592';
  skin.css = `
    .omd [data-omd-part="button"] { border-radius: 21px; }
    .omd [data-omd-part="button-primary"] { border-radius: 17px; }
    .omd [data-omd-part="icon-button"] { border-radius: 50%; }
    .omd [data-omd-part="select"] { border-radius: 9px; border-color: rgb(91, 82, 121); }
    .omd [data-omd-part="settings-nav-item"][data-omd-state="selected"] { background: rgb(99, 55, 88); color: white; }
    .omd [data-omd-part="tab"][data-omd-state="selected"] { background: rgb(88, 55, 99); color: white; }
    .omd [data-omd-part="switch"][data-omd-state="checked"] { background: rgb(160, 37, 146); }
    .omd [data-omd-part="segment"][data-omd-state="selected"] { border-color: rgb(91, 82, 121); }
    .omd [data-omd-part="field-input"]:disabled { border-color: rgb(133, 88, 111); }
  `;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: 'roles.omd-skin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(skin)) });
  await until(async () => await page.locator('html').getAttribute('data-omd-skin') === skin.id);
  const style = (locator, property, pseudo) => locator.evaluate((el, { property, pseudo }) => getComputedStyle(el, pseudo)[property], { property, pseudo });
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    assert.equal(await style(page.getByLabel('皮肤', { exact: true }), 'borderRadius'), '9px', 'skin role overrides the host shared control radius');
    await until(async () => await style(dialog.getByRole('button', { name: '外观', exact: true }), 'backgroundColor') === 'rgb(99, 55, 88)');
    assert.notEqual(await style(dialog.getByRole('button', { name: '通用设置', exact: true }), 'backgroundColor'), 'rgb(99, 55, 88)');
    await until(async () => await style(page.getByLabel('降低透明与动态效果'), 'accentColor') === 'rgb(160, 37, 146)');
    const file = page.getByLabel('导入皮肤', { exact: true });
    const expected = mode === 'dark' ? 'rgb(32, 35, 41)' : 'rgb(255, 255, 255)';
    await until(async () => await style(file, 'backgroundColor', '::file-selector-button') === expected);
    assert.equal(await style(dialog.getByRole('button', { name: '恢复默认皮肤', exact: true }), 'borderRadius'), '21px');
    await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
    const basic = page.locator('.cx-tabs').getByRole('button', { name: '常用', exact: true });
    await basic.waitFor();
    await until(async () => await style(basic, 'backgroundColor') === 'rgb(88, 55, 99)');
    const idle = page.getByRole('switch', { name: '空闲时自动预处理', exact: true });
    await idle.waitFor();
    const number = page.locator('.cx-panel input[type=number]:disabled').first();
    await until(async () => await style(number, 'borderTopColor') === 'rgb(133, 88, 111)');
    await idle.check();
    await until(async () => await style(idle, 'backgroundColor') === 'rgb(160, 37, 146)');
    await idle.uncheck();
    await dialog.getByRole('button', { name: '外观', exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-composer-input]').fill('只检查样式，不发送');
  const send = page.locator('.uV2eYG_primary');
  await until(async () => await send.isEnabled());
  assert.equal(await style(send, 'borderRadius'), '17px');
  await until(async () => await style(send, 'backgroundColor') === 'rgb(40, 56, 88)');
  await send.hover();
  await until(async () => await style(send, 'backgroundColor') === 'rgb(53, 75, 112)');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await dialog.getByRole('button', { name: '外观', exact: true }).click();
  for (const css of [
    '.omd [data-omd-state="selected"] { color: red; }',
    '.omd [data-omd-part="button"][aria-hidden="true"] { color: red; }',
    '.omd [data-omd-part="settings-content"] { display: none; }',
  ]) {
    await page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: 'invalid.omd-skin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...skin, css })) });
    await page.getByRole('alert').waitFor();
    assert.equal(await style(page.getByLabel('皮肤', { exact: true }), 'borderRadius'), '9px', 'rejected selectors cannot replace the current skin');
  }
  assert.deepEqual(errors, []);
});
