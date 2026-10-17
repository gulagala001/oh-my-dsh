import assert from 'node:assert/strict';
import test from 'node:test';
import { bundleSidebar, launchFixtureBrowser, openSidebarReplay } from './fixtures/sidebar-replay.mjs';

// Synthetic host-shaped DOM exercises the actual adapter in isolated Chromium.
// Native MutationObservers, focus, media queries and inert are kept intact.
test('sidebar updates, root replacement, navigation and cleanup survive unrelated DOM changes', async () => {
  const browser = await launchFixtureBrowser();
  try {
    const fixture = await openSidebarReplay(browser, await bundleSidebar(), { rows: 4, history: 20 });
    const { page } = fixture;
    const settle = () => page.evaluate(() => __sidebarFixture.settle());
    const result = await fixture.run({ operations: 12, kind: 'structural' });
    assert.equal(result.sidebarScanCalls, 0);
    assert.equal(result.produced, 12);
    assert.equal((await fixture.run({ operations: 12, kind: 'characterData' })).sidebarScanCalls, 0);
    assert.equal(await page.locator('[data-omd-nav-part="title"]').count(), 4);
    const rows = page.locator('[role="treeitem"]');
    await rows.first().focus();
    await page.keyboard.press('End');
    assert.equal(await rows.last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await rows.nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => __sidebarFixture.clicks), 1);
    await page.evaluate(() => { document.querySelector('.Tree_title').className = 'Unrelated_title'; });
    await settle();
    assert.equal(await page.locator('.Unrelated_title').getAttribute('data-omd-nav-part'), null);
    await page.evaluate(() => { document.querySelector('.Unrelated_title').className = 'Tree_title'; });
    await settle();
    assert.equal(await page.locator('.Tree_title').first().getAttribute('data-omd-nav-part'), 'title');
    await page.evaluate(() => { const row = __sidebarFixture.makeRow(99); window.removedRow = row; document.querySelector('#fixture-rows').append(row); });
    await settle();
    assert.equal(await page.locator('[data-row-key="session:99"] .Tree_title').getAttribute('data-omd-nav-part'), 'title');
    await page.evaluate(() => removedRow.remove()); await settle();
    assert.equal(await page.evaluate(() => removedRow.hasAttribute('tabindex') || removedRow.querySelector('.Tree_title').hasAttribute('data-omd-nav-part')), false);
    await page.evaluate(() => {
      window.foreignTitle = document.querySelector('.Tree_title'); foreignTitle.setAttribute('data-omd-nav-part', 'foreign-owner');
      document.querySelector('#fixture-output').append(document.createElement('div'));
    });
    await settle();
    assert.equal(await page.evaluate(() => foreignTitle.getAttribute('data-omd-nav-part')), 'foreign-owner');
    await page.evaluate(() => foreignTitle.classList.add('selected')); await settle();
    assert.equal(await page.evaluate(() => foreignTitle.getAttribute('data-omd-nav-part')), 'foreign-owner');
    await page.evaluate(() => {
      window.oldSidebar = document.querySelector('#fixture-sidebar'); oldSidebar.replaceWith(__sidebarFixture.makeSidebar());
    });
    await settle();
    assert.equal(await page.locator('[data-omd-nav-part="title"]').count(), 4);
    assert.equal(await page.evaluate(() => oldSidebar.querySelector('#fixture-browser').hasAttribute('data-omd-sidebar-browser') || oldSidebar.querySelector('[role="treeitem"]').hasAttribute('tabindex')), false);
    assert.equal(await page.evaluate(() => foreignTitle.getAttribute('data-omd-nav-part')), 'foreign-owner');
    await page.evaluate(() => { window.detachedSidebar = document.querySelector('#fixture-sidebar'); detachedSidebar.remove(); }); await settle();
    assert.equal(await page.evaluate(() => detachedSidebar.querySelector('.Tree_title').hasAttribute('data-omd-nav-part')), false);
    await page.evaluate(() => document.querySelector('#fixture-sidebar-column').append(detachedSidebar)); await settle();
    assert.equal(await page.locator('[data-omd-nav-part="title"]').count(), 4);
    await page.setViewportSize({ width: 650, height: 900 });
    await page.waitForFunction(() => document.querySelector('#fixture-frame').hasAttribute('data-omd-sidebar-overlay'));
    assert.equal(await page.locator('#fixture-sidebar-column').getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#fixture-conversation').evaluate(el => el.inert), true);
    await page.locator('[data-omd-nav-part="toggle"]').focus(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#fixture-frame').dataset.sidebarCollapsed === 'true' && !document.querySelector('#fixture-conversation').inert);
    await page.evaluate(() => {
      const oldFrame = document.querySelector('#fixture-frame'), frame = oldFrame.cloneNode(false);
      frame.append(...oldFrame.childNodes); oldFrame.replaceWith(frame);
      const oldColumn = document.querySelector('#fixture-sidebar-column'), column = oldColumn.cloneNode(false);
      column.append(document.querySelector('#fixture-sidebar')); oldColumn.replaceWith(column); frame.dataset.sidebarCollapsed = 'false';
    });
    await page.waitForFunction(() => document.querySelector('#fixture-sidebar-column').getAttribute('role') === 'dialog');
    assert.equal(await page.locator('.omd-sidebar-scrim').count(), 1);
    assert.equal(await page.locator('#fixture-conversation').evaluate(el => el.inert), true);
    await page.evaluate(() => __sidebarFixture.stop()); await settle();
    assert.equal(await page.locator('[data-omd-sidebar-style],.omd-sidebar-scrim,[data-omd-sidebar-browser],[data-omd-nav-part="title"]').count(), 0);
    assert.equal(await page.locator('#fixture-conversation').evaluate(el => el.inert), false);
    assert.equal(await page.locator('#fixture-sidebar-column').getAttribute('role'), null);
    assert.equal(await page.locator('[role="treeitem"][tabindex]').count(), 0);
    assert.equal(await page.evaluate(() => foreignTitle.getAttribute('data-omd-nav-part')), 'foreign-owner');
    const after = await page.evaluate(async () => { __sidebarFixture.resetCounters(); document.querySelector('#fixture-output').append(document.createElement('div')); document.querySelector('#fixture-sidebar').classList.add('updated'); await __sidebarFixture.settle(); return __sidebarFixture.snapshot(); });
    assert.equal(after.observerCalls, 0); assert.equal(after.sidebarScanCalls, 0);
    await fixture.close();
  } finally { await browser.close(); }
});
