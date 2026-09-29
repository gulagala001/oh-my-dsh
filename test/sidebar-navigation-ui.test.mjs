import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('sidebar search and native project/session actions work with keyboard and touch across themes', { timeout: 150000 }, async t => {
  const f = await frontendFixture(t, { setupWorkspace: ({ workspace }) => mkdir(join(workspace, 'nested-sidebar')) }), { page } = f;
  const browser = page.locator('[data-omd-sidebar-browser]');
  const row = browser.locator(`[data-row-key="session:${f.sessionId}"]`);
  const workspace = browser.locator('[data-row-key^="workspace:"]').first();
  for (const skin of ['default', 'codex-desktop', 'ios-liquid-glass', 'claude-cli-terminal', 'google-material-expressive']) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('主题', { exact: true }).selectOption(skin);
    await page.getByLabel('明暗模式', { exact: true }).selectOption(skin === 'claude-cli-terminal' ? 'dark' : 'light');
    await page.keyboard.press('Escape');
    await page.mouse.move(1200, 650);
    await page.getByRole('button', { name: '添加工作区', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await row.evaluate(el => el === document.activeElement), true, skin + ': Tab enters the selected session');
    assert.equal(await browser.locator('[role="treeitem"][tabindex="0"]').count(), 1);
    const menu = row.locator('button').first();
    assert.equal(await menu.isVisible(), true, skin + ': commands are visible for keyboard focus');
    await page.keyboard.press('ArrowUp');
    assert.equal(await workspace.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowLeft');
    await until(async () => await workspace.getAttribute('aria-expanded') === 'false');
    await page.keyboard.press('ArrowRight');
    await until(async () => await workspace.getAttribute('aria-expanded') === 'true');
    await page.keyboard.press('ArrowDown');
    assert.equal(await row.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menu').waitFor({ state: 'visible' });
    await until(async () => await page.getByRole('menu').evaluate(el => el.contains(document.activeElement)));
    const firstMenuItem = await page.evaluate(() => document.activeElement.textContent);
    await page.keyboard.press('ArrowDown');
    await until(async () => await page.getByRole('menu').evaluate((el, previous) => el.contains(document.activeElement) && document.activeElement.textContent !== previous, firstMenuItem));
    await page.keyboard.press('Escape');
    await until(async () => await page.getByRole('menu').count() === 0);
    await page.getByRole('button', { name: '搜索会话', exact: true }).click();
    const search = browser.locator('input[type="text"]').first();
    await search.fill('整理工作台');
    await browser.getByText('整理工作台和对话界面', { exact: true }).waitFor();
    await search.press('Escape');
    await until(async () => await search.inputValue() === '');
    if (skin === 'default') {
      const searchBox = await page.getByRole('button', { name: '搜索会话', exact: true }).boundingBox();
      assert.ok(searchBox.width >= 180 && searchBox.height >= 30, 'default search has a readable full-width entry');
      await browser.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      if (process.env.TRISOUL_UI_ARTIFACTS) { await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true }); await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'sidebar-default.png') }); }
    }
  }
  // A parent Session appears after its nested Workspace in DOM order. Left
  // must follow the actual group owner, not the preceding Workspace row.
  await f.rpc('workspace/create', { path: join(f.workspace, 'nested-sidebar') });
  await page.getByRole('button', { name: '视图选项', exact: true }).click();
  await page.getByRole('menuitem', { name: '按工作区树', exact: true }).click();
  const child = browser.locator('[data-row-key^="workspace:"]').filter({ hasText: 'nested-sidebar' });
  await child.waitFor();
  assert.equal(await child.evaluate(el => Boolean(el.closest('[class*="_groupSection"]').parentElement.closest('[class*="_groupSection"]'))), true);
  await row.press('ArrowLeft');
  assert.equal(await workspace.evaluate(el => el === document.activeElement), true);
  await child.press('ArrowRight');
  assert.equal(await child.evaluate(el => el === document.activeElement), true, 'empty child does not jump to a sibling');
  await child.press('ArrowLeft');
  await child.press('ArrowLeft');
  assert.equal(await workspace.evaluate(el => el === document.activeElement), true);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  const tap = async locator => {
    let previous;
    await until(async () => {
      const value = await locator.evaluate(el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }; });
      const stable = value.hit && previous && ['x','y','width','height'].every(key => Math.abs(value[key]-previous[key]) < .1);
      previous = value; return stable;
    });
    const r = await locator.boundingBox(); assert.ok(r && r.width && r.height);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor();
  await tap(page.getByRole('button', { name: '打开侧边栏', exact: true }));
  await until(async () => await browser.getAttribute('data-wide') === 'true');
  await row.scrollIntoViewIfNeeded();
  const nativeMenu = row.locator('button').first();
  assert.equal(await nativeMenu.isVisible(), true, 'touch has a menu without hovering or selecting the row');
  await tap(nativeMenu);
  const pin = page.getByRole('menuitem', { name: '置顶会话', exact: true }); await pin.waitFor(); await tap(pin);
  await until(async () => await page.getByRole('menu').count() === 0);
  await tap(nativeMenu);
  await page.getByRole('menuitem', { name: '取消置顶', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  assert.deepEqual(f.errors, []);
});
