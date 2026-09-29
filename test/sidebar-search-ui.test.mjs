import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('sidebar search results support keyboard entry, movement and opening a session', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const { workspace } = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspaceId, agentPreset: 'trisoul-x' });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '第二份侧栏搜索验收清单' }] });
  await until(async () => (await page.request.get(new URL('/trisoul-x/api/state?session=' + sessionId, page.url()).href).then(r => r.json())).running === 'idle');
  await f.rpc('session/rename', { sessionId: f.sessionId, title: 'Alpha 验收清单' });
  await f.rpc('session/rename', { sessionId, title: 'Beta 验收清单' });
  const browser = page.locator('[data-omd-sidebar-browser]');
  await page.getByRole('button', { name: '搜索会话', exact: true }).click();
  const search = browser.locator('input[type="text"]').first();
  await search.fill('验收清单');
  const results = browser.getByRole('treeitem');
  await until(async () => await results.count() === 2);
  assert.equal(await results.locator('xpath=self::*[@tabindex="0"]').count(), 1, 'one search result must be keyboard reachable');
  await page.keyboard.press('Shift+ArrowDown');
  assert.equal(await search.evaluate(el => el === document.activeElement), true, 'modified arrows keep native input selection');
  await page.keyboard.press('ArrowDown');
  assert.equal(await results.first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('End');
  assert.equal(await results.last().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Home');
  assert.equal(await results.first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  assert.equal(await search.inputValue(), '验收清单');
  await page.keyboard.press('ArrowDown');
  const beta = results.filter({ hasText: 'Beta 验收清单' });
  if (!await beta.evaluate(el => el === document.activeElement)) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const opened = browser.locator(`[data-row-key="session:${sessionId}"]`);
  await until(async () => await opened.getAttribute('aria-selected') === 'true');
  assert.deepEqual(f.errors, []);
});

test('sidebar keyboard context menu returns to its row so navigation can continue', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const browser = page.locator('[data-omd-sidebar-browser]');
  const row = browser.locator(`[data-row-key="session:${f.sessionId}"]`);
  await row.focus(); await page.keyboard.press('Shift+F10');
  await until(async () => await page.getByRole('menu').evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await until(async () => await page.getByRole('menu').count() === 0);
  await until(async () => await row.evaluate(el => el === document.activeElement));
  await page.keyboard.press('ArrowUp');
  assert.equal(await browser.locator('[data-row-key^="workspace:"]').first().evaluate(el => el === document.activeElement), true);
  await row.focus(); await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: '重命名', exact: true }).press('Enter');
  const rename = page.getByRole('dialog', { name: '重命名会话', exact: true });
  await rename.waitFor();
  await until(async () => await rename.getByRole('textbox').evaluate(el => el === document.activeElement));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await rename.getByRole('textbox').evaluate(el => el === document.activeElement), true, 'menu cleanup must not steal modal focus');
  await page.keyboard.press('Escape'); await rename.waitFor({ state: 'hidden' });
  await row.focus(); await page.keyboard.press('Shift+F10');
  await until(async () => await page.getByRole('menu').evaluate(el => el.contains(document.activeElement)));
  const editor = page.locator('[data-composer-input]');
  await editor.click();
  await until(async () => await page.getByRole('menu').count() === 0);
  assert.equal(await editor.evaluate(el => el === document.activeElement), true, 'outside clicks retain their new focus');
  // A keyboard/assistive client can focus a visible menu before the adapter's
  // deferred auto-focus runs. Closing must still restore the originating row.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.trim() === '置顶会话');
      if (!item?.getClientRects().length || getComputedStyle(item).visibility !== 'visible') return;
      observer.disconnect(); item.focus();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  });
  await row.focus(); await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: '置顶会话', exact: true }).press('Enter');
  await until(async () => await page.getByRole('menu').count() === 0);
  await until(async () => await row.evaluate(el => el === document.activeElement));
  assert.deepEqual(f.errors, []);
});
