import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function openMonitor(page) {
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const workbench = page.locator('.tx-workbench');
  await until(async () => (await workbench.boundingBox())?.width > 300);
  await workbench.locator('.cx-navigation').getByRole('button', { name: '监控', exact: true }).click();
  const monitor = workbench.locator('.tx-app').filter({ has: page.getByRole('heading', { name: '执行监控', exact: true }) });
  await monitor.getByRole('tab', { name: '概览', exact: true }).waitFor();
  return monitor;
}

test('monitor tabs link their panels and support a single keyboard entry with wrapping navigation', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  const monitor = await openMonitor(page), tabs = monitor.getByRole('tablist', { name: '监控分类', exact: true }).getByRole('tab');
  const states = await tabs.evaluateAll(elements => elements.map(el => ({
    id: el.id, selected: el.getAttribute('aria-selected'), tabIndex: el.tabIndex,
    controls: el.getAttribute('aria-controls'),
  })));
  assert.deepEqual(states.map(tab => tab.tabIndex), [0, -1, -1], 'only the selected tab participates in the Tab order');
  assert.equal(await monitor.locator('[role="tabpanel"]').count(), 3, 'every tab has a persistent associated panel');
  for (const tab of states) {
    assert.ok(tab.id && tab.controls, 'tabs expose stable IDs and controls');
    const panel = await page.evaluate(id => {
      const el = document.getElementById(id);
      return el && { role: el.getAttribute('role'), labelledBy: el.getAttribute('aria-labelledby'), hidden: el.hidden };
    }, tab.controls);
    assert.deepEqual(panel, { role: 'tabpanel', labelledBy: tab.id, hidden: tab.selected !== 'true' });
  }

  const overview = monitor.getByRole('tab', { name: '概览', exact: true });
  await overview.focus();
  for (const [key, name] of [['ArrowRight', '调用记录'], ['End', '上下文'], ['ArrowRight', '概览'], ['ArrowLeft', '上下文'], ['Home', '概览']]) {
    await page.keyboard.press(key);
    const active = monitor.getByRole('tab', { name, exact: true });
    await until(async () => await active.getAttribute('aria-selected') === 'true');
    assert.equal(await active.evaluate(el => document.activeElement === el), true, `${key} moves focus with selection`);
    assert.deepEqual(await tabs.evaluateAll(elements => elements.map(el => el.tabIndex)), await tabs.evaluateAll(elements => elements.map(el => el.getAttribute('aria-selected') === 'true' ? 0 : -1)));
    assert.equal(await monitor.getByRole('tabpanel').count(), 1, 'only the selected panel is exposed');
  }
  await page.keyboard.press('Tab');
  assert.equal(await monitor.getByRole('tabpanel', { name: '概览', exact: true }).evaluate(el => document.activeElement === el), true, 'Tab exits the tab strip into its visible panel');
  assert.deepEqual(errors, []);
});

test('monitor timeline opens, focuses and reveals an early call in the body for pointer and keyboard selection', { timeout: 60000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  const snapshot = await (await page.request.get(new URL('/trisoul-x/api/state?session=' + sessionId, page.url()).href)).json();
  const now = Date.now(), activity = Array.from({ length: 70 }, (_, index) => ({
    sessionId, kind: index % 2 ? 'prepare' : 'main', at: now - index * 1000,
    provider: 'fixture', model: 'call-' + (70 - index), durationMs: 1000, turn: 1, step: 70 - index,
    usage: { inputTokens: 10, outputTokens: 5 }, ...(index === 40 ? { error: 'fixture call failure' } : {}),
  }));
  let fullReads = 0;
  await page.route('**/trisoul-x/api/state?*', route => {
    if (new URL(route.request().url()).searchParams.get('view') === 'full') fullReads++;
    return route.fulfill({ json: { ...snapshot, activity } });
  });
  const monitor = await openMonitor(page);
  await until(async () => await monitor.locator('.tx-timeline-row button').count() === 70);
  const outerScroll = () => page.evaluate(() => ({
    documentTop: document.scrollingElement.scrollTop, documentLeft: document.scrollingElement.scrollLeft,
    frameTop: document.querySelector('.pI_x6G_frame')?.scrollTop, frameLeft: document.querySelector('.pI_x6G_frame')?.scrollLeft,
  }));

  for (const [width, colorScheme, keyboard] of [[1440, 'light', false], [390, 'dark', true]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await monitor.getByRole('tab', { name: '调用记录', exact: true }).click();
    await monitor.getByRole('combobox', { name: '调用组件', exact: true }).selectOption('main');
    await monitor.getByRole('checkbox', { name: '仅失败', exact: true }).check();
    await monitor.getByRole('tab', { name: '概览', exact: true }).click();
    const firstCall = monitor.locator('.tx-timeline-row').filter({ hasText: '上下文预处理' }).locator('button').first();
    const hit = await firstCall.boundingBox();
    const before = await outerScroll();
    if (keyboard) { await firstCall.focus(); await firstCall.press('Enter'); }
    else await firstCall.click();
    await until(async () => await monitor.getByRole('tab', { name: '调用记录', exact: true }).getAttribute('aria-selected') === 'true');
    assert.equal(await monitor.getByRole('combobox', { name: '调用组件', exact: true }).inputValue(), 'all', 'a timeline selection clears a component filter that would conceal the call');
    assert.equal(await monitor.getByRole('checkbox', { name: '仅失败', exact: true }).isChecked(), false);
    const target = monitor.locator('.tx-call-row').last();
    assert.notEqual(await target.getAttribute('open'), null, 'the earliest call expands');
    assert.ok((await target.textContent()).includes('fixture / call-1'), 'the opened row is the selected call');
    const position = await target.locator('summary').evaluate(el => {
      const body = el.closest('.tx-body'), rect = el.getBoundingClientRect(), viewport = body.getBoundingClientRect();
      return { focused: document.activeElement === el, scrollTop: body.scrollTop, top: rect.top, bottom: rect.bottom, viewportTop: viewport.top + body.clientTop, viewportBottom: viewport.top + body.clientTop + body.clientHeight };
    });
    assert.equal(position.focused, true, 'the hidden timeline button transfers focus to the selected summary');
    assert.ok(position.scrollTop > 0, 'selection navigates through the long call list');
    assert.ok(position.top >= position.viewportTop - 1 && position.bottom <= position.viewportBottom + 1, JSON.stringify(position));
    assert.ok(hit.width >= 24 && hit.height >= 24, 'timeline targets remain usable even when the visible bars are compact');
    assert.deepEqual(await outerScroll(), before, 'the workbench body scrolls without panning the application frame');
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
      await monitor.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, `monitor-early-call-${width}-${colorScheme}.png`) });
    }
    const filter = monitor.getByRole('combobox', { name: '调用组件', exact: true });
    await filter.focus();
    await monitor.locator('.tx-body').evaluate(el => { el.scrollTop = 0; });
    const beforeReads = fullReads;
    await until(() => fullReads > beforeReads);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await filter.evaluate(el => document.activeElement === el), true, 'status polling does not reclaim focus from the next action');
    assert.equal(await monitor.locator('.tx-body').evaluate(el => el.scrollTop), 0, 'status polling does not repeat the timeline jump');
  }
  assert.deepEqual(errors, []);
});
