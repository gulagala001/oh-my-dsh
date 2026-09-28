import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const settingsDialog = page => page.getByRole('dialog', { name: '设置', exact: true });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('omd.skins.v1') || '{}'));
async function appearance(page) {
  if (!await settingsDialog(page).isVisible()) await page.getByRole('button', { name: '设置', exact: true }).click();
  await settingsDialog(page).getByRole('button', { name: '外观', exact: true }).click();
}

test('appearance keeps failed drafts through layout changes and controls that hide their fields', { timeout: 120000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await advanced(page);
  const theme = page.getByLabel('主题', { exact: true });
  const name = page.getByLabel('显示名称', { exact: true });
  await page.getByLabel('Logo 与名称', { exact: true }).selectOption('custom');
  const failDraft = async (field, value) => {
    await field.fill(value); await blockStorage(page, true); await theme.focus();
    await visibleError(page); assert.equal(await field.inputValue(), value);
  };
  for (const id of ['codex-desktop', 'google-material-expressive', 'default']) {
    const current = await theme.inputValue(), value = `切换到 ${id} 前的名称`;
    await failDraft(name, value);
    await theme.selectOption(id);
    assert.equal(await theme.inputValue(), current, 'failed draft blocks a layout switch');
    await blockStorage(page, false); await theme.selectOption(id); await advanced(page);
    assert.equal(await theme.inputValue(), id);
    assert.equal(await name.inputValue(), value);
    assert.equal((await stored(page)).advanced.brand.name, value);
  }

  const logoMode = page.getByLabel('Logo 与名称', { exact: true });
  await failDraft(name, '隐藏后仍保留的名称');
  await logoMode.selectOption('native'); assert.equal(await logoMode.inputValue(), 'custom');
  await blockStorage(page, false); await logoMode.selectOption('native');
  assert.equal(await name.count(), 0);
  await logoMode.selectOption('custom'); assert.equal(await name.inputValue(), '隐藏后仍保留的名称');

  const titleMode = page.getByLabel('浏览器标题', { exact: true });
  await titleMode.selectOption('custom');
  const title = page.getByLabel('标题名称', { exact: true });
  await failDraft(title, '隐藏后仍保留的标题');
  await titleMode.selectOption('native'); assert.equal(await titleMode.inputValue(), 'custom');
  await blockStorage(page, false); await titleMode.selectOption('native');
  await titleMode.selectOption('custom'); assert.equal(await title.inputValue(), '隐藏后仍保留的标题');

  const enabled = page.getByLabel('启用高级外观定制', { exact: true });
  await enabled.check();
  const number = page.getByLabel('对话字号', { exact: true });
  await failDraft(number, '19');
  await enabled.click(); assert.equal(await enabled.isChecked(), true);
  await blockStorage(page, false); await enabled.uncheck();
  await enabled.check(); assert.equal(await number.inputValue(), '19');

  const imported = await readFile(new URL('./fixtures/skin.json', import.meta.url));
  await failDraft(name, '导入前的名称'); await blockStorage(page, false);
  await page.getByLabel('导入主题', { exact: true }).setInputFiles({ name: 'test.omd-skin.json', mimeType: 'application/json', buffer: imported });
  await until(async () => await theme.inputValue() === JSON.parse(imported).id);
  await advanced(page); assert.equal(await name.inputValue(), '导入前的名称');
  await failDraft(name, '移除主题前的名称'); await blockStorage(page, false);
  await page.getByRole('button', { name: '移除当前主题', exact: true }).click();
  await advanced(page); assert.equal(await name.inputValue(), '移除主题前的名称');
  await theme.selectOption('codex-desktop'); await advanced(page);
  await failDraft(name, '恢复主题前的名称');
  await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  assert.equal(await theme.inputValue(), 'codex-desktop');
  await blockStorage(page, false); await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  await advanced(page); assert.equal(await theme.inputValue(), 'default');
  assert.equal(await name.inputValue(), '恢复主题前的名称');
  assert.deepEqual(errors, []);
});
async function advanced(page) {
  await appearance(page);
  if (!await page.locator('.omd-advanced').evaluate(el => el.open)) await page.locator('.omd-advanced > summary').click();
}
async function blockStorage(page, blocked) {
  await page.evaluate(blocked => {
    if (blocked) {
      window.appearanceOriginalSetItem ??= Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'omd.skins.v1') throw new DOMException('isolated quota failure', 'QuotaExceededError');
        return window.appearanceOriginalSetItem.call(this, key, value);
      };
    } else Storage.prototype.setItem = window.appearanceOriginalSetItem;
  }, blocked);
}
async function visibleError(page, message = '浏览器存储不可用') {
  const notice = page.locator('.omd-appearance-error').filter({ hasText: message });
  await notice.waitFor({ state: 'visible' });
  await until(() => notice.evaluate(el => {
    const rect = el.getBoundingClientRect(), viewport = el.closest('.VOzbGW_options').getBoundingClientRect();
    return rect.bottom > Math.max(0, viewport.top) && rect.top < Math.min(innerHeight, viewport.bottom)
      && rect.right > Math.max(0, viewport.left) && rect.left < Math.min(innerWidth, viewport.right);
  }));
  assert.equal(await notice.evaluate(el => getComputedStyle(el).position), 'sticky');
  return notice;
}

for (const themeId of ['default', 'codex-desktop']) {
  test(`advanced appearance saves drafts on one Escape and recovers storage failure in ${themeId}`, { timeout: 120000 }, async t => {
    const { page, errors, root } = await frontendFixture(t);
    await appearance(page);
    if (themeId !== 'default') await page.getByLabel('主题', { exact: true }).selectOption(themeId);
    await advanced(page);
    await page.getByLabel('Logo 与名称', { exact: true }).selectOption('custom');
    await page.getByLabel('浏览器标题', { exact: true }).selectOption('custom');
    await page.getByLabel('启用高级外观定制', { exact: true }).check();
    const name = page.getByLabel('显示名称', { exact: true });
    const title = page.getByLabel('标题名称', { exact: true });
    const number = page.getByLabel('对话字号', { exact: true });
    const theme = page.getByLabel('主题', { exact: true });
    const otherTheme = themeId === 'default' ? 'codex-desktop' : 'default';

    await name.fill('');
    await page.keyboard.type('逐字输入 名称 ');
    assert.equal(await name.inputValue(), '逐字输入 名称 ', 'editing retains spaces before commit');
    assert.equal((await stored(page)).advanced.brand.name, '');
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    assert.equal((await stored(page)).advanced.brand.name, '逐字输入 名称');
    await advanced(page);
    assert.equal(await name.inputValue(), '逐字输入 名称');
    await title.fill('关闭保存的标题');
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await advanced(page);
    assert.equal(await title.inputValue(), '关闭保存的标题');

    await number.fill('');
    await page.keyboard.type('2');
    assert.equal(await number.inputValue(), '2', 'first digit is not clamped while editing');
    await page.keyboard.type('0');
    assert.equal(await number.inputValue(), '20');
    assert.equal((await stored(page)).advanced.common['body-size'], undefined);
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await advanced(page);
    assert.equal(await number.inputValue(), '20');
    assert.equal((await stored(page)).advanced.common['body-size'], 20);

    await name.fill('存储恢复后保存的名称 ');
    const beforeFailure = await page.evaluate(() => localStorage.getItem('omd.skins.v1'));
    await blockStorage(page, true);
    await page.keyboard.press('Escape');
    assert.equal(await settingsDialog(page).isVisible(), true);
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ', 'failed save preserves the raw draft');
    assert.equal(await name.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('omd.skins.v1')), beforeFailure);
    await visibleError(page);
    // An unrelated runtime refresh must not replace the draft or steal its focus.
    await page.evaluate(() => dispatchEvent(new StorageEvent('storage', { key: 'omd.skins.v1' })));
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ');
    assert.equal(await name.evaluate(el => el === document.activeElement), true);

    // A failed blur must remain pending even after focus has moved out of advanced settings.
    await theme.focus();
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ');
    await theme.selectOption(otherTheme);
    assert.equal(await theme.inputValue(), themeId, 'theme selection rolls back on storage failure');
    await page.keyboard.press('Escape');
    assert.equal(await settingsDialog(page).isVisible(), true);
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ');
    assert.equal(await theme.evaluate(el => el === document.activeElement), true);
    await visibleError(page);
    // Mouse and keyboard navigation must not unmount a draft after failed blur.
    await settingsDialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await settingsDialog(page).isVisible(), true);
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ');
    const general = settingsDialog(page).getByRole('button', { name: '通用设置', exact: true });
    await general.focus(); await page.keyboard.press('Enter');
    assert.equal(await name.inputValue(), '存储恢复后保存的名称 ');
    await page.locator('[role="presentation"] > [class*="_mask"][aria-hidden="true"]').click({ position: { x: 5, y: 5 } });
    assert.equal(await settingsDialog(page).isVisible(), true);
    assert.equal(await settingsDialog(page).evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await settingsDialog(page).isVisible(), true);
    if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, `${themeId}-appearance-storage-failure.png`) });
    await blockStorage(page, false);
    await settingsDialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await advanced(page);
    assert.equal(await name.inputValue(), '存储恢复后保存的名称');
    assert.equal(await page.locator('.omd-appearance-error').count(), 0);

    await number.fill('2');
    await blockStorage(page, true);
    await page.keyboard.press('Escape');
    assert.equal(await settingsDialog(page).isVisible(), true);
    assert.equal(await number.inputValue(), '2', 'failed numeric save retains the unclamped draft');
    assert.equal((await stored(page)).advanced.common['body-size'], 20);
    assert.equal(await number.evaluate(el => el === document.activeElement), true);
    await visibleError(page);
    await blockStorage(page, false);
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await advanced(page);
    assert.equal(await number.inputValue(), '12');
    assert.equal((await stored(page)).advanced.common['body-size'], 12);
    await number.fill('');
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await advanced(page);
    assert.equal(await number.inputValue(), '');
    assert.equal((await stored(page)).advanced.common['body-size'], undefined);

    // Reverting the draft needs no write and allows exit while storage is unavailable.
    await name.fill('暂不保存的修改');
    await blockStorage(page, true);
    await page.keyboard.press('Escape');
    assert.equal(await settingsDialog(page).isVisible(), true);
    await name.fill('存储恢复后保存的名称');
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await blockStorage(page, false);
    await advanced(page);

    // An error without pending drafts does not trap the user in settings.
    await theme.focus();
    await blockStorage(page, true);
    await theme.selectOption(otherTheme);
    await visibleError(page);
    await page.keyboard.press('Escape');
    await settingsDialog(page).waitFor({ state: 'hidden' });
    await blockStorage(page, false);
    await advanced(page);

    // Both Promise rejection and ordinary actions still work through shared act.
    await page.getByLabel('Logo 图片', { exact: true }).setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid png') });
    await visibleError(page, '图片无法解码');
    await until(() => page.getByLabel('Logo 图片', { exact: true }).isEnabled());
    await theme.focus();
    await theme.selectOption(otherTheme);
    await advanced(page);
    assert.equal(await name.inputValue(), '存储恢复后保存的名称', 'theme layout switch retains saved branding');
    await theme.focus();
    await theme.selectOption(themeId);
    await advanced(page);
    await page.getByRole('button', { name: '恢复全部高级设置', exact: true }).click();
    assert.equal(await theme.inputValue(), themeId);
    assert.equal(await page.getByLabel('启用高级外观定制', { exact: true }).isChecked(), false);
    assert.equal(await page.locator('.omd-appearance-error').count(), 0);
    assert.deepEqual(errors, []);
  });
}
