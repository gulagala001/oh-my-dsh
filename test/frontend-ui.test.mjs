import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('DSH frontend: one workbench, preserved edits, compact composer and both themes', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page, root, errors } = f;
  assert.equal(await page.locator('.tx-wordmark').innerText(), 'Oh My DSH');
  await until(async () => (await page.title()).endsWith(' — Oh My DSH'));
  assert.match(await page.title(), /整理工作台和对话界面/);
  assert.equal(await page.getByText('trisoul_x', { exact: true }).count(), 0);
  const screenshot = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await page.mouse.move(1, 1);
    // Wait for the live transition state rather than holding finished promises
    // from animations that a disclosure or tooltip may replace mid-transition.
    await page.waitForFunction(() => document.getAnimations().every(a =>
      a.effect?.getTiming().iterations === Infinity || !a.pending && a.playState !== 'running'), undefined, { timeout: 5000 });
    await page.screenshot({ path: join(root, name + '.png'), timeout: 5000 });
  };
  t.after(async () => { if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Frontend UI artifacts:', root); });
  assert.equal(await page.locator('.tx-composer-dock').count(), 1);
  assert.equal(await page.locator('.tx-cu-chip').count(), 1);
  assert.equal(await page.getByRole('button', { name: '分享窗口', exact: true }).count(), 1);
  const composer = page.locator('[data-composer-card]');
  const headerBox=await page.locator('.wSkVaW_header').boundingBox(),tabsBox=await page.locator('.wSkVaW_tabs').boundingBox();
  assert.ok(tabsBox.x-headerBox.x<=24,'conversation and trace controls stay on the left side of the header');
  assert.ok((await composer.boundingBox()).height < 160, 'empty composer stays compact');
  const usageToggle = page.getByRole('button', { name: '用量详情', exact: true });
  const hostStats = page.locator('[data-composer-stats]');
  assert.equal(await hostStats.isVisible(), false, 'usage details do not crowd the default composer');
  await usageToggle.click();
  assert.equal(await usageToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await hostStats.isVisible(), true);
  const originalUsage = hostStats.getByRole('button').first();
  await originalUsage.click();
  assert.equal(await originalUsage.getAttribute('aria-expanded'), 'true', 'original host usage popup remains interactive');
  await page.keyboard.press('Escape');
  await usageToggle.click();
  assert.equal(await hostStats.isVisible(), false);
  const contextRow = page.locator('[data-chat-flow-kind=context] [data-disclosure-row]').first();
  const processToggle = page.getByRole('button', { name: /^已思考/ }).first();
  await processToggle.click();
  const source = contextRow.locator('[data-context-source]');
  assert.equal(await source.count(), 1);
  assert.equal(await source.isVisible(), false, 'technical provenance is deferred until expanded');
  await contextRow.click();
  assert.equal(await source.isVisible(), true, 'original context provenance stays accessible');
  await contextRow.click();
  await processToggle.click();
  // A hidden right pane can extend the frame beyond its visible grid. Focus
  // scrolling must not move that outer shell and crop the conversation.
  const shellScroll = await page.locator('.pI_x6G_frame').evaluate(el => {
    el.scrollLeft = 180;
    return el.scrollLeft;
  });
  assert.equal(shellScroll, 0, 'overflowing offscreen panes cannot pan the app frame');
  await screenshot('conversation-light');
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const workbench = page.locator('.tx-workbench'), nav = workbench.getByRole('navigation', { name: '工作台导航' });
  await until(async () => (await workbench.boundingBox())?.width > 300);
  await page.getByRole('heading', { name: '工作上下文', exact: true }).waitFor();
  const tabCount = await page.getByRole('tab').count();
  for (const name of ['记忆', '电脑', '监控', '任务']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await until(async () => (await nav.getByRole('button', { name, exact: true }).getAttribute('aria-current')) === 'page');
    assert.equal(await page.locator('.tx-workbench').count(), 1, 'navigation reuses the same workbench');
    assert.equal(await page.getByRole('tab').count(), name === '任务' || name === '监控' ? tabCount : tabCount - 3, 'no new dock tab is created');
    await screenshot('workbench-' + name);
  }
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const editor = page.locator('.tx-editor');
  await editor.locator('textarea').fill('界面改版使用浅色和深色主题，保留原有能力。');
  await nav.getByRole('button', { name: '电脑', exact: true }).click();
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  assert.equal(await editor.locator('textarea').inputValue(), '界面改版使用浅色和深色主题，保留原有能力。', 'switching views keeps unsaved memory edits');
  await editor.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.locator('.tx-memory-text').getByText('界面改版使用浅色和深色主题，保留原有能力。', { exact: true }).waitFor();
  await screenshot('memory-populated');
  await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
  await page.getByText('待办完成提醒', { exact: true }).waitFor();
  await screenshot('todo-menu');
  await page.getByRole('menuitem', { name: /^验证完成提醒/ }).click();
  const btNotice = page.getByRole('dialog', { name: '验证完成提醒', exact: true });
  await btNotice.waitFor();
  assert.equal(await btNotice.locator('p').textContent(), '此选项将会带来更高的任务完成率，同时也会消耗更多时间和 token。');
  const btValue = await page.evaluate(async session => (await fetch('/trisoul-x/api/better-todo?session='+encodeURIComponent(session))).json(), f.sessionId);
  assert.equal(btValue.verification, true, 'the notice informs after enabling; dismissing is not an approval gate');
  await screenshot('bt-verification-notice');
  await btNotice.getByRole('button', { name: '知道了', exact: true }).click();
  await btNotice.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
  const disabled = page.waitForResponse(response => response.url().includes('/better-todo?') && response.request().method() === 'POST');
  await page.getByRole('menuitem', { name: /^验证完成提醒/ }).click();
  assert.equal((await (await disabled).json()).verification, false);
  assert.equal(await btNotice.isVisible(), false, 'turning verification off does not show the notice');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  await page.getByRole('heading', { name: '让助手操作应用和网页', exact: true }).waitFor();
  assert.equal(await page.locator('.tx-workbench').count(), 1);
  await screenshot('computer-empty');
  await page.getByRole('button', { name: '运行环境与权限', exact: true }).click();
  await page.getByText('Chrome 扩展', { exact: true }).waitFor();
  await screenshot('computer-setup');
  const setupState = await page.evaluate(async session => (await fetch('/trisoul-x/computer-use/setup?session='+encodeURIComponent(session))).json(), f.sessionId);
  let windowsInstalled = false, repairRequired = false;
  const windowsSetup = async route => {
    if (route.request().method() === 'POST') { assert.equal(route.request().postDataJSON().action, 'install-native'); windowsInstalled = true; repairRequired = false; }
    await route.fulfill({ json: { ...setupState, native: { platform: 'win32', supported: true, installed: windowsInstalled, interactive: windowsInstalled, captureSupported: windowsInstalled, repairRequired, version: '0.1.1' } } });
  };
  await page.route('**/trisoul-x/computer-use/setup?*', windowsSetup);
  try {
    await until(async () => (await page.locator('.tx-cu-setup').innerText()).includes('.NET 10 SDK'));
    assert.doesNotMatch(await page.locator('.tx-cu-setup').innerText(), /Apple Command Line Tools|操作 Mac 应用/);
    await page.getByRole('button', { name: '安装桌面控制', exact: true }).click();
    await page.locator('.tx-cu-setup-row').filter({ hasText: 'Windows 桌面' }).getByText('可用', { exact: true }).waitFor();
    assert.equal(await page.locator('.tx-cu-setup-row').filter({ hasText: '辅助功能' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '打开权限设置', exact: true }).count(), 0);
    repairRequired = true;
    await page.getByRole('button', { name: '修复桌面控制', exact: true }).click();
    await page.getByRole('button', { name: '修复桌面控制', exact: true }).waitFor({ state: 'hidden' });
    await screenshot('windows-setup');
  } finally { await page.unroute('**/trisoul-x/computer-use/setup?*', windowsSetup); }
  const light = await workbench.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await until(async () => await workbench.evaluate(el => getComputedStyle(el).backgroundColor) !== light);
  await screenshot('computer-dark');
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  await screenshot('memory-dark');
  await page.setViewportSize({ width: 1060, height: 900 });
  await until(async () => (await composer.boundingBox())?.width >= 220);
  const panelOverflow = await workbench.evaluate(el => el.scrollWidth > el.clientWidth || [...el.querySelectorAll('.tx-app, .tx-body, .tx-cu-pane')].filter(e => e.getBoundingClientRect().width).some(e => e.scrollWidth > e.clientWidth + 1));
  assert.equal(panelOverflow, false, 'all visible panel controls fit a narrow pane');
  await screenshot('narrow-workbench');
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  await workbench.waitFor({state:'hidden'});
  await page.setViewportSize({ width: 760, height: 900 });
  await page.locator('[data-sidebar-collapsed=true]').waitFor();
  await page.mouse.move(700, 400);
  await until(async () => (await composer.boundingBox())?.width > 450);
  const tools = await page.locator('[data-slot="conversation.composer.dock"]').boundingBox();
  assert.ok(tools.x >= 0 && tools.x + tools.width <= 760, 'composer tools remain on screen');
  for (const width of [994, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(width - 10, 400);
    await until(async () => { const box = await composer.boundingBox(); return box?.x >= 0 && box.x + box.width <= width; });
    await usageToggle.click();
    await until(async () => { const box = await page.locator('[data-slot="conversation.composer.dock"]').boundingBox(); return box?.x >= 0 && box.x + box.width <= width; });
    assert.equal(await hostStats.isVisible(), true, 'expanded usage stays available at ' + width + 'px');
    await screenshot('conversation-' + width + '-usage');
    await usageToggle.click();
  }
  await page.setViewportSize({ width: 760, height: 900 });
  await screenshot('conversation-narrow-dark');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settingsDialog = page.getByRole('dialog');
  await settingsDialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  const settings = page.locator('.tx-settings');
  await settings.getByRole('button', { name: '保存设置', exact: true }).waitFor();
  await screenshot('settings-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await screenshot('settings-light');
  await settings.getByRole('button', { name: /会话级/ }).click();
  assert.equal(await settings.getByRole('button', { name: '保存设置', exact: true }).isEnabled(), true);
  await settings.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await settings.getByRole('button', { name: '保存设置', exact: true }).isEnabled(), false);
  await settings.getByRole('button', { name: /会话级/ }).click();
  await settings.getByRole('button', { name: '保存设置', exact: true }).click();
  await until(async () => !(await settings.getByRole('button', { name: '保存设置', exact: true }).isEnabled()));
  await settings.getByRole('tab', { name: '高级', exact: true }).click();
  await screenshot('settings-advanced');
  await page.keyboard.press('Escape');
  const release = f.holdNextReply();
  try {
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查运行图标' }] });
    await page.locator('html[data-omd-running]').waitFor();
    const rotor = page.locator('.tx-brand-mark .omd-whale-rotor').first();
    const transform = await rotor.evaluate(el => getComputedStyle(el).transform);
    await until(async () => await rotor.evaluate(el => getComputedStyle(el).transform) !== transform);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await until(async () => await rotor.evaluate(el => getComputedStyle(el).animationName) === 'none');
  } finally { release(); }
  await until(async () => !(await page.locator('html').getAttribute('data-omd-running')) && !(await page.locator('html').evaluate(el => el.hasAttribute('data-omd-running'))));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (process.env.TRISOUL_UI_ARTIFACTS) await writeFile(join(root, 'visible-elements.json'), JSON.stringify(await page.locator('[data-chat-flow-key]').evaluateAll(els => els.map(el => ({ attrs: [...el.attributes].map(a => [a.name, a.value]), html: el.innerHTML.slice(-14000) }))), null, 2));
  assert.deepEqual(errors, []);
});
