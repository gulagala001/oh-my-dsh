import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import sample from './fixtures/skin.json' with { type: 'json' };
import { STORAGE_KEY } from '../src/client/skins/runtime.mjs';

async function chooseAppearance(page, value) {
  const select = page.getByLabel('明暗模式', { exact: true });
  if (await select.inputValue() === value) return;
  const saved = page.waitForResponse(response => response.url().includes('/api/settings/mutate'));
  await select.selectOption(value);
  const result = await (await saved).json();
  assert.equal(result.result?.ok, true, JSON.stringify(result));
}

test('appearance commits through the native form without reverting an optimistic palette', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('皮肤', { exact: true }).selectOption('codex-desktop');
  await chooseAppearance(page, 'light');
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'light');
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), pending = new Promise(resolve => { entered = resolve; });
  await page.route('**/api/settings/mutate', async route => {
    const args = route.request().postDataJSON().payload.args;
    if (args.ns === 'ui-theme' && args.ops.some(op => op.value === 'dark')) { entered(); await gate; }
    await route.continue();
  });
  await page.evaluate(() => {
    window.appearanceChanges = [];
    new MutationObserver(records => window.appearanceChanges.push(...records.map(record => record.oldValue), document.documentElement.dataset.appearance))
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'], attributeOldValue: true });
  });
  try {
    const saved = page.waitForResponse(response => response.url().endsWith('/api/settings/mutate') && response.request().postData().includes('"dark"'));
    await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
    await pending;
    assert.equal(await page.evaluate(() => window.appearanceChanges.includes('dark')), false, 'a pending write cannot flash dark and then revert to the older mirror');
    release();
    const result = await (await saved).json(); assert.equal(result.result?.ok, true, JSON.stringify(result));
    await until(async () => await page.locator('html').getAttribute('data-appearance') === 'dark');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
    await page.getByRole('menu').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'dark');
    await page.reload();
    await until(async () => await page.locator('html').getAttribute('data-appearance') === 'dark');
    assert.deepEqual(errors, []);
  } finally { release(); }
});

test('native variable shorthands preserve appearance, overrides and offline validation', { timeout: 90000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  const skin = structuredClone(sample);
  skin.tokens.common['radius-panel'] = '19px';
  skin.css = '.omd [data-omd-part="composer"] { background: var(--omd-surface-solid); border: 3px solid var(--omd-danger); border-left-width: 7px; border-radius: var(--omd-radius-panel); border-bottom-right-radius: 5px; outline: 2px solid var(--omd-focus); }';
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  const upload = value => page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: 'shorthand.omd-skin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await upload(skin);
  await until(async () => await page.locator('html').getAttribute('data-omd-skin') === skin.id);
  for (const appearance of ['light', 'dark']) {
    await chooseAppearance(page, appearance);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === appearance);
    const actual = await page.locator('[data-composer-card]').evaluate(el => {
      const s = getComputedStyle(el);
      return { top: s.borderTopWidth, left: s.borderLeftWidth, radius: s.borderTopLeftRadius, corner: s.borderBottomRightRadius, outline: s.outlineWidth, outlineStyle: s.outlineStyle, bg: s.backgroundColor, border: s.borderTopColor };
    });
    assert.equal(actual.top, '3px'); assert.equal(actual.left, '7px');
    assert.equal(actual.radius, '19px'); assert.equal(actual.corner, '5px');
    assert.equal(actual.outline, '2px'); assert.equal(actual.outlineStyle, 'solid');
    const expected = await page.evaluate(palette => {
      const probe = document.createElement('span'); document.body.append(probe);
      probe.style.color = palette['surface-solid']; const bg = getComputedStyle(probe).color;
      probe.style.color = palette.danger; const border = getComputedStyle(probe).color;
      probe.remove(); return { bg, border };
    }, skin.tokens[appearance]);
    assert.equal(actual.bg, expected.bg); assert.equal(actual.border, expected.border);
  }
  for (const css of ['.omd { background: var(--omd-bg, url(https://example.com/pixel.png)); }', '.omd { border: var(--omd-border) !important; }', '.omd { margin: var(--omd-gap); }']) {
    await upload({ ...skin, css });
    await until(async () => await page.getByRole('alert').count() > 0);
    assert.equal(await page.locator('[data-composer-card]').evaluate(el => getComputedStyle(el).borderTopWidth), '3px', 'invalid CSS must preserve the existing skin');
  }
  assert.deepEqual(errors, []);
});

test('native skin import, host mode sync, portals, persistence, replacement and recovery', { timeout: 90000 }, async t => {
  const { page, context, root, errors } = await frontendFixture(t);
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.locator('.omd-appearance').waitFor();
  };
  const upload = async value => page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: 'test.omd-skin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  const active = () => page.locator('html').getAttribute('data-omd-skin');
  const bg = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  const originalBg = await bg();
  await open();
  if (process.env.OMD_SKIN_PACK_TEST) {
    for (const file of await readdir(process.env.OMD_SKIN_PACK_TEST)) {
      if (!file.endsWith('.json')) continue;
      const candidate = JSON.parse(await readFile(join(process.env.OMD_SKIN_PACK_TEST, file), 'utf8'));
      await upload(candidate);
      await until(async () => { const alert = page.getByRole('alert'); if (await alert.count()) throw new Error(file + ': ' + await alert.textContent()); return await active() === candidate.id; });
      const fonts = await page.evaluate(async () => {
        const families = [...document.fonts].map(face => face.family);
        for (const family of families) await document.fonts.load(`14px "${family.replaceAll('"', '')}"`);
        await document.fonts.ready;
        return [...document.fonts].filter(face => face.status === 'error').map(face => face.family);
      });
      assert.deepEqual(fonts, [], file + ' embedded fonts load');
      await page.getByRole('button', { name: '移除当前皮肤', exact: true }).click();
    }
  }
  await upload(sample);
  await until(async () => { const alert = page.getByRole('alert'); if (await alert.count()) throw new Error(await alert.textContent()); return await active() === sample.id; });
  assert.equal(await bg(), 'rgb(255, 244, 232)');
  assert.equal(await page.locator('[data-composer-card]').evaluate(el => getComputedStyle(el).borderRadius), '25px');
  assert.equal(await page.locator('[data-composer-card]').evaluate(el => getComputedStyle(el).borderTopWidth), '2px');
  assert.equal(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).getPropertyValue('--dsw-alias-bg-base').trim()), '#fff4e8', 'portal inherits host alias');
  await chooseAppearance(page, 'dark');
  await until(async () => await bg() === 'rgb(33, 23, 32)');
  await until(async () => await page.locator('body').getAttribute('data-ds-dark-theme') !== null);
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  await until(async () => await active() === sample.id && await bg() === 'rgb(33, 23, 32)');
  await open();
  assert.equal(await page.getByLabel('明暗模式', { exact: true }).inputValue(), 'dark');
  await chooseAppearance(page, 'system');
  await page.emulateMedia({ colorScheme: 'light' }); await until(async () => await bg() === 'rgb(255, 244, 232)');
  await page.emulateMedia({ colorScheme: 'dark' }); await until(async () => await bg() === 'rgb(33, 23, 32)');
  await page.getByLabel('降低透明与动态效果').check();
  assert.notEqual(await page.locator('html').getAttribute('data-omd-reduce-effects'), null);
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'skin-settings-dark.png') });
  const invalid = structuredClone(sample); invalid.tokens.dark.bg = 'not-a-color';
  await upload(invalid); await until(async () => await page.getByRole('alert').count() > 0);
  assert.equal(await active(), sample.id); assert.equal(await bg(), 'rgb(33, 23, 32)');
  for (const css of ['body { color: red; }', '.omd { display: none; }', '.omd { background-image: url(https://example.com/pixel.png); }', '@font-face{font-family:test;src:url(https://example.com/font.woff2)}']) {
    await upload({ ...sample, css }); await until(async () => await page.getByRole('alert').count() > 0);
    assert.equal(await active(), sample.id);
    assert.equal(await page.locator('style[data-omd-skin-style]').count(), 1);
  }
  const replacement = structuredClone(sample); replacement.tokens.dark.bg = '#203040';
  await upload(replacement); await until(async () => await bg() === 'rgb(32, 48, 64)');
  assert.equal(await page.getByLabel('皮肤', { exact: true }).locator('option[value="test-skin"]').count(), 1, 'same-id updates do not duplicate entries');
  await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await active(), null); assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  await chooseAppearance(page, 'light');
  await until(async () => await bg() === originalBg);
  await page.getByLabel('皮肤', { exact: true }).selectOption(sample.id);
  await page.getByRole('button', { name: '移除当前皮肤', exact: true }).click();
  assert.equal(await active(), null);
  await upload(sample); await until(async () => await active() === sample.id);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
  await page.getByRole('menuitem', { name: /^验证完成提醒/ }).click();
  await page.getByRole('dialog', { name: '验证完成提醒', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: '验证完成提醒', exact: true }).evaluate(el => getComputedStyle(el).getPropertyValue('--tx-blue').trim()), sample.tokens.light.accent);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 }); await open();
  assert.ok((await page.locator('.omd-appearance').boundingBox()).width > 270, 'narrow appearance page retains usable content width');
  assert.ok(await page.locator('.omd-appearance').evaluate(el => el.scrollWidth <= el.clientWidth), 'appearance controls fit a narrow window');
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'skin-settings-mobile.png') });
  // Storage quota failure must not change the active skin or its saved package.
  await page.evaluate(() => { window.originalSkinSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await upload(replacement);
  await until(async () => (await page.getByRole('alert').textContent())?.includes('存储'));
  assert.equal(await bg(), 'rgb(255, 244, 232)');
  await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await active(), null, 'recovery still works when storage is unavailable');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSkinSetItem; delete window.originalSkinSetItem; });
  await upload(sample); await until(async () => await active() === sample.id);
  // Another tab's preference changes propagate through the browser storage event.
  const other = await context.newPage(); await other.goto(page.url());
  await other.getByRole('button', { name: '设置', exact: true }).waitFor();
  await other.evaluate(key => { const saved = JSON.parse(localStorage.getItem(key)); saved.selected = 'default'; localStorage.setItem(key, JSON.stringify(saved)); }, STORAGE_KEY);
  await until(async () => await active() === null); await other.close();
  await upload(sample); await until(async () => await active() === sample.id);
  const recoveryUrl = new URL(page.url()); recoveryUrl.searchParams.set('omd-skin', 'default');
  await page.goto(recoveryUrl.href); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await active(), null, 'recovery URL bypasses the saved skin');
  recoveryUrl.searchParams.delete('omd-skin'); await page.goto(recoveryUrl.href);
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  await until(async () => await active() === sample.id);
  await page.evaluate(key => localStorage.setItem(key, '{invalid'), STORAGE_KEY);
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await active(), null); await open();
  assert.match(await page.getByRole('alert').textContent(), /默认/);
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ skins: [], selected: 'codex' })), STORAGE_KEY);
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await active(), null, 'a removed built-in theme safely falls back to the host appearance');
  await open();
  const options = await page.getByLabel('皮肤', { exact: true }).locator('option').evaluateAll(items => items.map(item => item.value));
  assert.deepEqual(new Set(options), new Set(['default', 'codex-desktop', 'ios-liquid-glass', 'claude-cli-terminal', 'google-material-expressive']));
  assert.deepEqual(errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Skin UI artifacts:', root);
});
