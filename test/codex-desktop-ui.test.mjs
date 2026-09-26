import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Codex desktop layout: native navigation, every settings page, workbench and recovery', { timeout: 180000 }, async t => {
  // Freeze the shipped plugin: other skin sessions may rebuild the workspace.
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  const directory = new URL('../data/codex-desktop-qa/', import.meta.url);
  const capture = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await mkdir(directory, { recursive: true });
    await page.waitForTimeout(250);
    await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), animations: 'disabled' });
  };
  const hit = async locator => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  const style = (locator, property) => locator.evaluate((el, key) => getComputedStyle(el)[key], property);
  const nav = page.locator('.VOzbGW_nav');
  const appearance = async () => nav.getByRole('button', { name: '外观', exact: true }).click();
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click(); await appearance();
  };
  await openSettings();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  await page.locator('html[data-omd-layout="codex-desktop"]').waitFor();
  assert.equal(await hit(page.getByLabel('主题', { exact: true })), true, 'settings is not clipped by sidebar');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await capture('appearance-' + mode);
    await page.keyboard.press('Escape');
    await capture('chat-' + mode);
    await page.locator('.bhn1Oq_searchButton').click();
    await page.locator('.bhn1Oq_searchInput').fill('整理工作台');
    await page.locator('.YDXeBa_searchResultRow').first().waitFor();
    assert.equal(await hit(page.locator('.bhn1Oq_searchInput')), true);
    await capture('search-' + mode);
    await page.locator('.bhn1Oq_searchInput').fill('');
    await page.keyboard.press('Escape');
    assert.equal(await style(page.locator('[data-composer-card]'), 'backgroundColor'), mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(38, 38, 38)');
    assert.equal(await hit(page.locator('[data-composer-input]')), true);
    assert.equal(await hit(page.locator('.hHd-Xa_newSession')), true);
    await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
    await page.getByRole('menu').waitFor();
    const enabledToggle = page.locator('.tx-bt-toggle.tx-on').first();
    assert.equal(await enabledToggle.evaluate(el => getComputedStyle(el, '::before').backgroundColor), mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)', 'enabled switch thumb contrasts with monochrome track');
    await capture('menu-' + mode); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await until(async () => {
      const r = await page.locator('.tx-workbench').boundingBox(); return r?.width > 300 && r.width < 390 && r.x + r.width <= 1441;
    });
    await until(async () => {
      const header = await page.locator('.wSkVaW_header').boundingBox();
      return Math.abs(header.x + header.width - 1440) <= 1;
    });
    const toggle = await page.locator('.codex-panel-toggle').boundingBox();
    assert.ok(1440 - toggle.x - toggle.width <= 16, 'panel toggle stays at the window right edge');
    for (const tab of ['任务', '上下文', '摘要', '电脑', '监控']) {
      await page.locator('.cx-navigation').getByRole('button', { name: tab, exact: true }).click();
      await capture('workbench-' + mode + '-' + tab);
    }
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await openSettings();
    for (const name of ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await capture('settings-' + mode + '-' + name);
      assert.equal(await hit(page.locator('.VOzbGW_close')), true, name + ' close accessible');
      if (name === 'Oh My DSH') {
        for (const tab of ['常用', '基础组件', '模型与身份', '实验性功能', '高级', '全局背景']) {
          await page.locator('.cx-tabs').getByRole('button', { name: tab, exact: true }).click();
          await capture('settings-' + mode + '-omd-' + tab);
        }
      }
    }
    await appearance();
  }
  // Capture the initial geometry: no manual narrowing to improve the preview.
  await page.setViewportSize({ width: 1584, height: 876 });
  await page.getByLabel('明暗模式', { exact: true }).selectOption('light');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await until(async () => (await page.locator('.tx-workbench').boundingBox())?.width < 380);
  await page.locator('.cx-navigation').getByRole('button', { name: '任务', exact: true }).click();
  await capture('reference-layout-light');
  assert.equal(await hit(page.locator('[data-composer-input]')), true);
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  await openSettings();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const name of ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设']) {
      await nav.getByRole('button', { name, exact: true }).click();
      const box = await page.getByRole('dialog').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, name + ' dialog fits');
      const content = await page.locator('.VOzbGW_options').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(content.width >= 270, name + ' readable content');
      assert.ok(content.scroll <= content.width + 1, name + ' no horizontal overflow: ' + JSON.stringify(content));
      await capture(`settings-${width}-${name}`);
    }
    await appearance();
    await page.getByLabel('降低透明与动态效果').check();
    assert.equal(await style(page.locator('.hHd-Xa_root'), 'backdropFilter'), 'none');
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.keyboard.press('Escape');
    if (await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') !== 'true') await page.locator('.hHd-Xa_toggle').click();
    await until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading')));
    await until(async () => await hit(page.locator('[data-composer-input]')));
    await page.locator('[data-composer-input]').fill('检查输入与工具栏');
    await until(async () => await hit(page.locator('.uV2eYG_primary')));
    await capture('chat-' + width);
    await page.locator('[data-composer-input]').fill('');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await until(async () => await hit(page.locator('.cx-navigation button').first()));
    await capture('workbench-' + width);
    if (!await page.locator('[data-sidebar-right-panel="fullscreen"]').count()) await page.getByRole('button', { name: '全屏', exact: true }).click();
    await page.locator('[data-sidebar-right-panel="fullscreen"]').waitFor();
    await capture('workbench-fullscreen-' + width);
    assert.equal(await page.getByRole('button', { name: '收起右侧边栏', exact: true }).count(), 1, 'fullscreen exposes one collapse control');
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await page.locator('.hHd-Xa_toggle').click();
    await until(async () => await hit(page.locator('.hHd-Xa_newSession')));
    await capture('sidebar-' + width);
    if (width === 390) {
      await page.locator('.YDXeBa_sessionRow').first().click();
      await page.locator('.pI_x6G_frame[data-sidebar-collapsed="true"]').waitFor();
      const release = f.holdNextReply();
      try {
        await page.locator('[data-composer-input]').fill('检查发送与停止'); await page.locator('.uV2eYG_primary').click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor();
        assert.equal(await hit(page.locator('.uV2eYG_primary')), true, 'running stop button reachable');
        await capture('mobile-running'); await page.locator('.uV2eYG_primary').click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor({ state: 'hidden' });
      } finally { release(); }
      await page.locator('.hHd-Xa_newSession').click();
      await page.locator('.pXSMma_headline').waitFor(); await capture('mobile-new-chat');
    }
    await openSettings();
  }
  await page.getByLabel('明暗模式', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'light');
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), 'codex-desktop');
  // The restored empty-Hero onboarding can close a panel during startup.
  if (await page.locator('.pI_x6G_frame').getAttribute('data-sidebar-collapsed') === 'true') await page.locator('.hHd-Xa_toggle').click();
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await openSettings(); await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  if (process.env.TRISOUL_UI_ARTIFACTS) await writeFile(new URL('errors.json', directory), JSON.stringify(f.errors, null, 2));
  assert.deepEqual(f.errors, []);
});

test('Codex geometry defaults, far-right toggle, resizing, reload and skin exit use native state', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  await page.setViewportSize({ width: 1597, height: 905 });
  const settings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  };
  await settings(); await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const frame = page.locator('.pI_x6G_frame'), right = page.locator('.pI_x6G_rightbarCol'), corner = page.locator('.codex-panel-toggle');
  await until(async () => Math.abs((await right.boundingBox()).width - 360) < 1);
  assert.ok((await page.locator('.pI_x6G_centerCol').boundingBox()).width > 950);
  assert.equal(await corner.getAttribute('aria-expanded'), 'true');
  await corner.click(); await until(async () => (await right.boundingBox()).width < 1);
  await corner.click(); await until(async () => Math.abs((await right.boundingBox()).width - 360) < 1);
  const r = await page.locator('.pI_x6G_handle[data-side="rightbar"]').boundingBox();
  await page.mouse.move(r.x + r.width / 2, 250); await page.mouse.down();
  await page.mouse.move(1097, 250, { steps: 6 }); await page.mouse.up();
  await until(async () => Math.abs((await right.boundingBox()).width - 500) < 1);
  await page.reload(); await corner.waitFor();
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await until(async () => Math.abs((await right.boundingBox()).width - 500) < 1);
  await settings(); await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  await page.keyboard.press('Escape');
  await until(async () => !await frame.evaluate(el => el.style.getPropertyValue('--codex-right-width')));
  await until(async () => Math.abs((await right.boundingBox()).width - Math.round(1597 * .45)) < 1);
  assert.equal(await corner.count(), 0);
  assert.deepEqual(f.errors, []);
});

test('Codex desktop keeps real tool failures, readable code, monochrome controls and native font sizing', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  let sent = false;
  f.replyWith(() => {
    if (sent) return { delta: { role: 'assistant', content: 'Codex Desktop 字体与操作记录检查完成。\n\n```js\nconst theme = "Codex Desktop";\nconsole.log(theme);\n```\n\n文件不存在时仍保留失败信息，正文与代码使用各自的字体。' }, finish_reason: 'stop' };
    sent = true;
    return { delta: { role: 'assistant', content: '检查本地命令与文件记录。', tool_calls: [
      { index: 0, id: 'codex-bash', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'printf skin-ready', description: '检查皮肤记录' }) } },
      { index: 1, id: 'codex-read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: join(f.root, 'missing-skin-file.txt') }) } },
    ] }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查 Codex Desktop 字体与代码' }] });
  await page.getByText('Codex Desktop 字体与操作记录检查完成。', { exact: true }).waitFor();
  await page.locator('[data-turn-process-tool-calls="2"]').click();
  const group = page.locator('[data-cu-group] .tx-cu-group-toggle').filter({ hasText: '2 次操作' }); await group.click();
  await page.getByText('读取失败', { exact: true }).waitFor();
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  };
  const directory = new URL('../data/codex-desktop-qa/', import.meta.url);
  await openSettings(); await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await page.getByLabel('降低透明与动态效果').check();
    await until(async () => await page.locator('.codex-switch').evaluate(el => getComputedStyle(el).backgroundColor) === (mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'));
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.keyboard.press('Escape');
    assert.equal(await group.getAttribute('aria-expanded'), 'true');
    await page.getByText('读取失败', { exact: true }).scrollIntoViewIfNeeded();
    await page.locator('[data-composer-input]').fill('Font preview 字体检查');
    await until(async () => await page.locator('.uV2eYG_primary').evaluate(el => getComputedStyle(el).backgroundColor) === (mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'));
    await page.locator('pre').last().evaluate(el => el.scrollIntoView({ block: 'center' }));
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: fileURLToPath(new URL('records-' + mode + '.png', directory)), animations: 'disabled' });
    }
    await page.locator('[data-composer-input]').fill('');
    await openSettings();
  }
  await page.locator('.VOzbGW_nav').getByRole('button', { name: '通用设置', exact: true }).click();
  await page.getByRole('button', { name: '增大字号', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-composer-input]').evaluate(el => getComputedStyle(el).fontSize), '15px', 'skin respects native font setting');
  const fonts = await page.locator('.hWmORq_body, [data-composer-input], pre code, .hHd-Xa_newSession').evaluateAll(elements => elements.map(el => ({
    selector: el.className || el.tagName, family: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize,
  })));
  assert.ok(fonts.every(item => /system-ui|ui-monospace/.test(item.family)), JSON.stringify(fonts));
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.locator('[data-composer-input]').fill('Codex Desktop 字体检查');
    await page.locator('pre').last().evaluate(el => el.scrollIntoView({ block: 'center' }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const actual = {};
    for (const selector of ['.hWmORq_body p', '[data-composer-input] p', 'pre code span', '.hHd-Xa_newSession']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (nodeId) actual[selector] = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    }
    await writeFile(new URL('fonts.json', directory), JSON.stringify({ computed: fonts, rendered: actual }, null, 2));
    await cdp.detach();
  }
  assert.deepEqual(f.errors, []);
});
