import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { nativeGuide, nativeTabs, nativeTab, openNativeGuide, openWorkbench, workbenchPage, workbenchSections, workbenchProvider } from './fixtures/workbench.mjs';

// One actual-host flow owns the workbench structure. Other UI suites retain
// their business regressions and use this same native entry path.
test('native right tabs preserve independent pages, reading state, legacy links and plugin guides', { timeout: 180000 }, async t => {
  const plugin = await workbenchProvider(t);
  // The UI branch already launches headless Chromium. The fixture's
  // headless:true option instead skips browser creation and is for API tests.
  const { page, sessionId, errors } = await frontendFixture(t, { plugins: [plugin] });
  const capture = async name => {
    if (!process.env.OMD_WORKBENCH_ARTIFACTS) return;
    await mkdir(process.env.OMD_WORKBENCH_ARTIFACTS, { recursive: true });
    await page.screenshot({ path: join(process.env.OMD_WORKBENCH_ARTIFACTS, name + '.png'), animations: 'disabled' });
  };
  await page.setViewportSize({ width: 1100, height: 800 });
  const summary = '界面以对话为中心，右侧查看任务、上下文与记忆。重要信息保留来源。'.repeat(20) + '完整记忆的结尾。';
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, globalMemory: { ref: 'visual-memory', revision: 1, updatedAt: Date.now(), summary } } });
  });
  await page.locator('[data-composer-input]').fill('保留对话草稿');
  await page.evaluate(() => {
    window.__workbenchOriginalDom = ['.hHd-Xa_root', '.wSkVaW_header', '[data-composer-card]', '[data-composer-input]'].map(selector => ({ selector, node: document.querySelector(selector) }));
  });
  const assertConversation = async () => {
    assert.equal(await page.evaluate(() => window.__workbenchOriginalDom.every(({ selector, node }) => node?.isConnected && document.querySelector(selector) === node)), true, 'right tabs do not replace the left navigation or conversation DOM');
    assert.equal(await page.locator('[data-composer-input]').innerText(), '保留对话草稿');
  };
  const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('dsh.sidebar-right.v1.' + id)).bySession[id].layout, sessionId);
  const countKind = async kind => Object.values((await stored()).tabs).filter(tab => tab.kind === kind).length;
  const pickGuide = async kind => {
    const guide = await openNativeGuide(page), before = await nativeTabs(page).count();
    await guide.locator(`[data-sidebar-right-guide-entry="${kind}"]`).click();
    await guide.waitFor({ state: 'hidden' });
    assert.equal(await nativeTabs(page).count(), before, 'picking a guide replaces its tab');
  };

  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await nativeGuide(page).waitFor();
  assert.equal(await page.locator('.tx-workbench').count(), 0, 'the initial new tab has no mounted workbench pages');
  assert.equal(await page.locator('.tx-cu-pane').count(), 0, 'the initial guide has no Computer Use setup or session state');
  const kinds = await nativeGuide(page).locator('[data-sidebar-right-guide-entry]').evaluateAll(elements => elements.map(el => el.dataset.sidebarRightGuideEntry));
  for (const kind of ['files', 'terminal', ...Object.values(workbenchSections).map(section => section.kind), 'fixture-provider']) assert.ok(kinds.includes(kind), 'native guide retains ' + kind);
  const omdKinds = Object.values(workbenchSections).filter(section => section.section !== 'computer').map(section => section.kind);
  assert.deepEqual(kinds.filter(kind => omdKinds.includes(kind)), omdKinds, 'OMD guide entries keep their declared order');
  assert.equal(await page.locator('.cx-navigation').count(), 0, 'there is no second fixed navigation strip');
  const taskEntry = nativeGuide(page).locator('[data-sidebar-right-guide-entry="trisoul-x-context"]');
  assert.ok(Math.abs((await taskEntry.boundingBox()).height - 44) <= 1, 'the real host uses compact guide rows');
  const strip = page.locator('[data-sidebar-right-panel][data-sidebar-right-open] [data-dockkit-strip]').first();
  assert.equal((await strip.boundingBox()).height, 44, 'native tab controls use the compact strip');
  assert.ok((await taskEntry.evaluate(el => getComputedStyle(el.closest('[data-sidebar-right-guide] > div'), '::before').content)).includes('OMD 专属'));
  await assertConversation();
  await capture('initial-guide');

  await pickGuide('trisoul-x-memory');
  const memory = workbenchPage(page, '记忆'), text = memory.locator('.cx-dream-memory > .cx-prose');
  await memory.waitFor();
  const expand = memory.getByRole('button', { name: '展开完整记忆', exact: true });
  await expand.waitFor();
  assert.ok(!(await text.innerText()).includes('完整记忆的结尾。'));
  await expand.click();
  const collapse = memory.getByRole('button', { name: '收起记忆', exact: true });
  assert.equal(await text.innerText(), summary);
  assert.equal(await text.evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'expanded memory uses the page scroll area');
  const scrollTop = await memory.locator('.cx-body').evaluate(el => {
    window.__workbenchMemoryBody = el; el.scrollTop = 120; return el.scrollTop;
  });

  await pickGuide('trisoul-x-pipeline');
  const context = workbenchPage(page, '上下文');
  await context.waitFor();
  assert.equal(await nativeTabs(page).count(), 2, 'two independent kinds produce two native tabs');
  await capture('independent-content-tabs');
  assert.equal(await memory.count(), 1, 'an inactive native page remains mounted');
  assert.equal(await memory.isVisible(), false);
  await (await nativeTab(page, '记忆')).click();
  assert.equal(await collapse.getAttribute('aria-expanded'), 'true', 'native tab switching preserves reading state');
  assert.equal(await memory.locator('.cx-body').evaluate(el => el === window.__workbenchMemoryBody), true, 'the host retains the visited page instance');
  assert.equal(await memory.locator('.cx-body').evaluate(el => el.scrollTop), scrollTop, 'native tab switching preserves reading position');
  await pickGuide('trisoul-x-context');
  await workbenchPage(page, '任务').waitFor();
  await (await nativeTab(page, '任务')).getByRole('button', { name: /^关闭/ }).click();
  await until(async () => await countKind('trisoul-x-context') === 0);
  await (await nativeTab(page, '记忆')).click();
  assert.equal(await text.innerText(), summary, 'closing another tab leaves expanded memory intact');
  const tabsBeforeDuplicate = await nativeTabs(page).count();
  await openNativeGuide(page);
  await nativeGuide(page).locator('[data-sidebar-right-guide-entry="trisoul-x-memory"]').click();
  await memory.waitFor();
  assert.equal(await countKind('trisoul-x-memory'), 1, 'reopening the same kind reveals its existing tab');
  assert.equal(await nativeTabs(page).count(), tabsBeforeDuplicate, 'the duplicate destination also consumes the guide');
  assert.equal(await collapse.getAttribute('aria-expanded'), 'true');

  await pickGuide('fixture-provider');
  const provider = page.locator('[data-fixture-provider]');
  await provider.waitFor();
  for (const [name, section] of Object.entries(workbenchSections)) {
    await (await nativeTab(page, '第三方原生页')).click();
    await provider.getByRole('button', { name: '旧工作台 ' + section.section, exact: true }).click();
    await until(async () => await countKind('trisoul-x-workbench') === 0);
    await workbenchPage(page, name).waitFor({ state: 'visible' });
    assert.equal(await countKind(section.kind), 1, 'legacy params restore ' + section.section + ' into its own type');
  }
  await (await nativeTab(page, '第三方原生页')).click();
  await provider.getByRole('button', { name: '旧任务链接', exact: true }).click();
  await workbenchPage(page, '任务').waitFor({ state: 'visible' });
  assert.equal(await countKind('trisoul-x-context'), 1, 'old task links keep their original kind');
  await assertConversation();

  // Exercise the compact native guide and all OMD pages in both themes.
  const handle = page.locator('[data-side="rightbar"]'), bounds = await handle.boundingBox();
  assert.ok(bounds, 'the native resize handle remains available');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(1100 - 320, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await until(async () => Math.abs((await workbenchPage(page, '任务').boundingBox()).width - 320) < 3);
  const lightColor = await workbenchPage(page, '任务').evaluate(el => getComputedStyle(el).backgroundColor);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    if (colorScheme === 'dark') await until(async () => await workbenchPage(page, '任务').evaluate(el => getComputedStyle(el).backgroundColor) !== lightColor);
    const guide = await openNativeGuide(page), pane = await guide.boundingBox();
    assert.equal(await guide.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'native guide fits the narrow pane in ' + colorScheme);
    await capture('guide-' + colorScheme);
    for (const entry of await guide.locator('[data-sidebar-right-guide-entry]').all()) {
      const box = await entry.boundingBox();
      assert.ok(box.x >= pane.x - 1 && box.x + box.width <= pane.x + pane.width + 1 && box.height >= 28, 'guide destinations stay readable and clickable');
    }
    await guide.locator('[data-sidebar-right-guide-entry="fixture-provider"]').click();
    await provider.waitFor({ state: 'visible' });
    for (const name of Object.keys(workbenchSections)) {
      const body = await openWorkbench(page, name);
      if (name === '电脑') assert.equal(await body.count(), 1, 'Computer Use owns one native preview pane');
      else assert.equal(await body.locator(':scope > .tx-workbench-page').count(), 1, 'each OMD kind owns one page');
      assert.equal(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, name + ': no horizontal spill');
    }
    await openWorkbench(page, '记忆');
    assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
    await assertConversation();
  }

  // Host persistence retains kind/address, but does not serialize navigation
  // params. Restore a historical workbench record with the default task section.
  await openWorkbench(page, '任务');
  await page.evaluate(id => {
    const key = 'dsh.sidebar-right.v1.' + id, saved = JSON.parse(localStorage.getItem(key));
    const task = Object.values(saved.bySession[id].layout.tabs).find(tab => tab.kind === 'trisoul-x-context');
    task.kind = 'trisoul-x-workbench'; task.contentId = 'sidebar://trisoul-x-workbench'; task.title = '工作台';
    localStorage.setItem(key, JSON.stringify(saved));
  }, sessionId);
  await page.reload();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await workbenchPage(page, '任务').waitFor({ state: 'visible' });
  await until(async () => await countKind('trisoul-x-workbench') === 0);
  assert.equal(await countKind('trisoul-x-context'), 1, 'persisted legacy workbench migrates to the task type');
  await openNativeGuide(page);
  await nativeGuide(page).locator('[data-sidebar-right-guide-entry="fixture-provider"]').click();
  await provider.getByText('第三方页面保留', { exact: true }).waitFor();

  // A hidden historical page must not reveal the sidebar or replace the user's
  // active page during restore. Only selecting that legacy tab migrates it.
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  await until(async () => !(await stored()).expanded);
  const expectedRestore = await page.evaluate(id => {
    const key = 'dsh.sidebar-right.v1.' + id, saved = JSON.parse(localStorage.getItem(key));
    const layout = saved.bySession[id].layout;
    const task = Object.values(layout.tabs).find(tab => tab.kind === 'trisoul-x-context');
    task.kind = 'trisoul-x-workbench'; task.contentId = 'sidebar://trisoul-x-workbench'; task.title = '工作台';
    localStorage.setItem(key, JSON.stringify(saved));
    return { paneId: layout.activePaneId, tabId: layout.nodes[layout.activePaneId].activeTabId };
  }, sessionId);
  await page.reload();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  // A collapsed reload need not mount any tab body; its native strip and
  // persisted selection are the restoration contract until the user expands.
  await (await nativeTab(page, '第三方原生页')).waitFor({ state: 'attached' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const collapsedRestore = await stored();
  assert.equal(collapsedRestore.expanded, false, 'restoring an inactive legacy tab keeps the sidebar collapsed');
  assert.equal(collapsedRestore.activePaneId, expectedRestore.paneId);
  assert.equal(collapsedRestore.nodes[expectedRestore.paneId].activeTabId, expectedRestore.tabId, 'restoring an inactive legacy tab preserves the selected native tab');
  assert.equal(await countKind('trisoul-x-workbench'), 1, 'an inactive historical tab stays deferred');
  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
  await provider.waitFor({ state: 'visible' });
  assert.equal(await countKind('trisoul-x-workbench'), 1, 'expanding the active third-party page does not migrate its inactive neighbor');
  assert.equal((await stored()).nodes[expectedRestore.paneId].activeTabId, expectedRestore.tabId);
  await (await nativeTab(page, '工作台')).click();
  await until(async () => await countKind('trisoul-x-workbench') === 0);
  await workbenchPage(page, '任务').waitFor({ state: 'visible' });
  assert.equal(await countKind('trisoul-x-context'), 1, 'explicit legacy tab selection migrates exactly one task page');
  assert.equal((await stored()).expanded, true);
  assert.deepEqual(errors, []);
});
