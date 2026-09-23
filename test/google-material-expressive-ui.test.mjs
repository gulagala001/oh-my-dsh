import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const id = 'google-material-expressive';
const settingsPages = ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设'];
const subpages = ['常用', '基础组件', '模型与身份', '实验性功能', '高级', '全局背景'];
test('Google Material: real layout, all settings, fonts, mobile navigation, workbench and recovery', { timeout: 240000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true, reply: () => ({ delta: { role: 'assistant', content: '界面与字体已经准备好了。\n\n这套工作台使用清晰的分组、熟悉的导航和协调的浅深主题。\n\n```javascript\nconst message = "Hello, 世界";\nconsole.log(message);\n```\n\n| 项目 | 状态 |\n| --- | --- |\n| 对话与侧栏 | 就绪 |\n| 设置与工作台 | 就绪 |' }, finish_reason: 'stop' }) });
  const { page } = f, html = page.locator('html'), dialog = page.locator('.VOzbGW_panel');
  const artifacts = new URL('../data/google-material-expressive-qa/', import.meta.url);
  const capture = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await mkdir(artifacts, { recursive: true });
    const path = join(f.root, name + '.png');
    // The host settles sidebar content after its resize/fade transition.
    await page.waitForTimeout(250);
    await page.screenshot({ path, animations: 'disabled' }); await copyFile(path, new URL(name + '.png', artifacts));
  };
  const hit = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width > 0 && r.height > 0 && (el === target || el.contains(target)); });
  const selectPage = async name => {
    const nav = page.locator('.VOzbGW_nav').getByRole('button', { name, exact: true, includeHidden: true });
    if (!await nav.isVisible()) await page.getByRole('button', { name: '设置分类', exact: true }).click();
    await nav.click();
    await until(async () => await nav.getAttribute('aria-current') === 'true');
  };
  const settleSidebar = async () => until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading') && el.classList.contains('hHd-Xa_collapsed') === (el.closest('.pI_x6G_frame').dataset.sidebarCollapsed === 'true')));
  const openSettings = async () => {
    if (page.viewportSize().width < 840 && await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') === 'true') {
      await page.locator('.hHd-Xa_toggle').click();
      await until(async () => await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') !== 'true');
      await settleSidebar();
    }
    await page.getByRole('button', { name: '设置', exact: true }).click(); await selectPage('外观');
  };
  const closeSettings = async () => {
    await page.locator('.VOzbGW_close').click();
    if (page.viewportSize().width < 840 && await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') !== 'true') { await page.locator('.hHd-Xa_toggle').click(); await settleSidebar(); }
  };
  await openSettings(); await page.getByLabel('皮肤', { exact: true }).selectOption(id);
  await until(async () => await html.getAttribute('data-omd-layout') === id);
  // Exercise actual embedded font decoders, all advertised families and weights.
  const fontResults = await page.evaluate(async () => {
    const samples = [['OMD Google Sans Flex', '500', 'Google'], ['OMD Google Sans Code', '400', 'const'], ['OMD Noto Sans SC', '400', '设置字体'], ['OMD Noto Sans SC', '600', '设置字体'], ['OMD Material Symbols', '400', 'menu']];
    return Promise.all(samples.map(async ([family, weight, text]) => ({ family, weight, loaded: (await document.fonts.load(`${weight} 16px "${family}"`, text)).length > 0 })));
  });
  assert.ok(fontResults.every(f => f.loaded), JSON.stringify(fontResults));
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await html.getAttribute('data-appearance') === mode);
    for (const name of settingsPages) {
      await selectPage(name); await capture(mode + '-settings-' + name);
      const metrics = await dialog.evaluate(el => { const c = el.querySelector('.VOzbGW_options'), r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: c.clientWidth, scroll: c.scrollWidth }; });
      assert.ok(metrics.x >= 0 && metrics.right <= 1441 && metrics.scroll <= metrics.width + 1, name + ' fits: ' + JSON.stringify(metrics));
      if (name === 'Oh My DSH') for (const subpage of subpages) {
        await page.locator('.cx-tabs').getByRole('button', { name: subpage, exact: true }).click();
        await capture(mode + '-omd-' + subpage);
      }
    }
    await closeSettings(); await capture(mode + '-conversation');
    assert.match(await page.locator('pre').first().evaluate(el => getComputedStyle(el).fontFamily), /OMD Google Sans Code/);
    assert.equal(await hit(page.locator('[data-composer-input]')), true);
    await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
    await page.getByRole('menu').waitFor(); await capture(mode + '-menu'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await page.locator('.tx-workbench').waitFor();
    for (const section of ['任务', '上下文', '摘要', '电脑', '监控']) {
      await page.locator('.cx-navigation').getByRole('button', { name: section, exact: true }).click();
      await capture(mode + '-workbench-' + section);
    }
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await openSettings();
  }
  for (const width of [1200, 840, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const name of settingsPages) {
      await selectPage(name);
      const metrics = await dialog.evaluate(el => { const c = el.querySelector('.VOzbGW_options'), r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: c.clientWidth, scroll: c.scrollWidth }; });
      assert.ok(metrics.x >= 0 && metrics.right <= width + 1 && metrics.width >= 270 && metrics.scroll <= metrics.width + 1, width + '/' + name + ': ' + JSON.stringify(metrics));
      if (width === 390) await capture('mobile-settings-' + name);
    }
    if (width < 840) {
      await page.getByRole('button', { name: '设置分类', exact: true }).click(); await capture('settings-categories-' + width);
      assert.equal(await page.locator('.VOzbGW_navList').evaluate(el => getComputedStyle(el).flexDirection), 'column');
      assert.equal(await hit(page.locator('.VOzbGW_navCell').first()), true);
      assert.equal(await hit(page.locator('.VOzbGW_navCell').last()), true);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), true, 'Escape returns from categories before closing settings');
      assert.equal(await page.getByRole('button', { name: '设置分类', exact: true }).getAttribute('aria-expanded'), 'false');
    }
    await closeSettings(); await capture('conversation-' + width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await hit(page.locator('[data-composer-input]')), true, 'composer reachable at ' + width);
    assert.equal(await hit(page.locator('.hHd-Xa_toggle')), true, 'navigation reachable at ' + width);
    if (width < 840) {
      await page.locator('.hHd-Xa_toggle').click(); await settleSidebar();
      await page.getByRole('button', { name: '收起导航', exact: true }).waitFor();
      assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), true);
      await capture('navigation-' + width);
      await page.locator('.YDXeBa_sessionRow').first().click();
      await until(async () => await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') === 'true');
      await settleSidebar();
      assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), false);
      assert.equal(await hit(page.locator('[data-composer-input]')), true);
      await page.getByRole('button', { name: '打开工作台', exact: true }).click();
      await until(async () => await hit(page.locator('.cx-navigation button').first()));
      await capture('workbench-' + width);
      await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    }
    await openSettings();
  }
  await selectPage('外观'); await page.getByLabel('明暗模式', { exact: true }).selectOption('light');
  await capture('mobile-light-appearance');
  await page.getByLabel('降低透明与动态效果').check();
  assert.equal(await page.locator('input[role=switch]').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.getByLabel('降低透明与动态效果').uncheck(); await closeSettings();
  const release = f.holdNextReply();
  try {
    await page.locator('[data-composer-input]').fill('验证安卓皮肤发送和停止'); await page.locator('.uV2eYG_primary').click();
    await page.locator('.tx-composer-dock[data-omd-running]').waitFor();
    assert.equal(await hit(page.locator('.uV2eYG_primary')), true);
    await capture('mobile-running'); await page.locator('.uV2eYG_primary').click();
    await page.locator('.tx-composer-dock[data-omd-running]').waitFor({ state: 'hidden' });
  } finally { release(); }
  await openSettings(); await page.getByLabel('明暗模式', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await until(async () => await html.getAttribute('data-appearance') === 'dark');
  await page.reload(); await page.locator('.gm-shell').waitFor({ state: 'attached' });
  assert.equal(await html.getAttribute('data-omd-layout'), id, 'refresh retains the selected skin');
  await openSettings();
  await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await html.getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('.gm-shell,.gm-settings-toggle').count(), 0);
  assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), false);
  assert.equal(await page.locator('.pI_x6G_frame').evaluate(el => el.style.getPropertyValue('--gm-host-right-width')), '');
  const pack = await readFile(new URL('../src/client/skins/bundled/google-material-expressive.json', import.meta.url));
  assert.ok(pack.length < 1024 * 1024, 'self-contained pack fits the import limit');
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) await writeFile(new URL('verification.json', artifacts), JSON.stringify({ skin: id, fonts: fontResults, settingsPages, subpages, widths: [1440,1200,840,768,390], packageBytes: pack.length, errors: f.errors }, null, 2));
});

test('Google Material keeps real font glyphs, native resize, focus and plugin reload behavior', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true, reply: () => ({ delta: { role: 'assistant', content: 'Google 字体检查，清晰地阅读。\n\n```js\nconst value = 123;\n```' }, finish_reason: 'stop' }) });
  const { page } = f;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('皮肤', { exact: true }).selectOption(id);
  await page.locator('.VOzbGW_nav').getByRole('button', { name: '通用设置', exact: true }).click();
  await page.getByRole('button', { name: '增大字号', exact: true }).click();
  await page.locator('.VOzbGW_close').click();
  await page.locator('[data-composer-input]').fill('Google 字体检查');
  assert.equal(await page.locator('[data-composer-input]').evaluate(el => getComputedStyle(el).fontSize), '15px', 'host reading size remains effective');
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const renderedFonts = {};
  for (const selector of ['.hWmORq_body p', '[data-composer-input] p', 'pre code span']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId, selector);
    renderedFonts[selector] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
  }
  await cdp.detach();
  assert.ok(renderedFonts['[data-composer-input] p'].some(f => f.isCustomFont && /Google Sans Flex/.test(f.familyName)), JSON.stringify(renderedFonts));
  assert.ok(renderedFonts['[data-composer-input] p'].some(f => f.isCustomFont && /Noto Sans SC/.test(f.familyName)), JSON.stringify(renderedFonts));
  assert.ok(renderedFonts['pre code span'].some(f => f.isCustomFont && /Google Sans Code/.test(f.familyName)), JSON.stringify(renderedFonts));
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await mkdir(new URL('../data/google-material-expressive-qa/', import.meta.url), { recursive: true });
    await writeFile(new URL('../data/google-material-expressive-qa/rendered-fonts.json', import.meta.url), JSON.stringify(renderedFonts, null, 2));
  }
  await page.locator('[data-composer-input]').fill('');
  await page.locator('.hHd-Xa_toggle').click();
  await page.locator('.hHd-Xa_collapsed').waitFor();
  await until(async () => Math.round((await page.locator('.pI_x6G_sidebarCol').boundingBox()).width) === 80);
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.tx-workbench').waitFor();
  const handle = page.locator('.pI_x6G_handle[data-side="rightbar"]');
  const rect = await handle.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, 300); await page.mouse.down();
  await page.mouse.move(980, 300, { steps: 8 }); await page.mouse.up();
  await until(async () => Math.abs((await page.locator('.tx-workbench').boundingBox()).width - 460) < 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await until(async () => await page.locator('[data-composer-input]').evaluate(el => { const r = el.getBoundingClientRect(); return r.y >= 0 && r.bottom < innerHeight; }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.hHd-Xa_toggle').click();
  await page.getByRole('button', { name: '收起导航', exact: true }).waitFor();
  assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '收起导航', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), false);
  await page.locator('.hHd-Xa_toggle').click();
  await page.getByRole('button', { name: '收起导航', exact: true }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const close = page.locator('.VOzbGW_close');
  await close.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.locator('.VOzbGW_panel').evaluate(el => el.contains(document.activeElement)), true, 'focus stays in the modal');
  const setPlugin = async enabled => {
    const method = 'pluginManager/setBundleEnabled';
    const response = await page.request.post(new URL('/api/' + method, page.url()).href, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { name: 'trisoul_x', enabled } } } });
    const value = await response.json(); assert.equal(value.result?.ok, true, JSON.stringify(value));
  };
  await Promise.all([page.waitForEvent('load'), setPlugin(false)]);
  await page.locator('.pI_x6G_frame').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('.gm-shell,style[data-omd-skin-style]').count(), 0);
  assert.equal(await page.locator('.pI_x6G_centerCol').evaluate(el => el.inert), false);
  await Promise.all([page.waitForEvent('load'), setPlugin(true)]);
  await page.locator('html[data-omd-layout="google-material-expressive"]').waitFor();
  await page.locator('.gm-shell').waitFor({ state: 'attached' });
  assert.deepEqual(f.errors, []);
});

test('Google Material welcome screen and portable skin import preserve native session creation', { timeout: 90000 }, async t => {
  const { page, errors } = await frontendFixture(t, { installedPackage: true });
  if (process.env.TRISOUL_UI_ARTIFACTS) await mkdir(new URL('../data/google-material-expressive-qa/', import.meta.url), { recursive: true });
  const pack = await readFile(new URL('../src/client/skins/bundled/google-material-expressive.json', import.meta.url));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: id + '.omd-skin.json', mimeType: 'application/json', buffer: pack });
  await page.locator('html[data-omd-layout="google-material-expressive"]').waitFor();
  assert.equal(await page.getByRole('button', { name: '移除当前皮肤', exact: true }).count(), 1);
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await page.locator('.VOzbGW_close').click();
    await page.locator('.hHd-Xa_newSession').click(); await page.locator('.pXSMma_headline').waitFor();
    for (const width of [1440,390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const input = await page.locator('[data-composer-input]').boundingBox();
      assert.ok(input.x >= 0 && input.x + input.width <= width + 1 && input.y >= 0 && input.y + input.height <= page.viewportSize().height);
      if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: new URL(`../data/google-material-expressive-qa/welcome-${mode}-${width}.png`, import.meta.url).pathname, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  }
  await page.getByRole('button', { name: '移除当前皮肤', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.getByLabel('皮肤', { exact: true }).locator(`option[value="${id}"]`).count(), 1, 'removing imported override retains the builtin');
  assert.deepEqual(errors, []);
});
