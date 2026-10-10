import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function realMonitor(page, sessionId) {
  const url = new URL('trisoul-x/api/monitor', page.url());
  url.search = new URLSearchParams({ session: sessionId, range: 'session', period: 'all', status: 'all' });
  const response = await page.request.get(url.href);
  assert.equal(response.status(), 200, 'the actual host exposes the monitor route before any controlled response');
  const snapshot = await response.json();
  assert.equal(snapshot.range, 'session');
  assert.ok(Number.isFinite(snapshot.generatedAt), 'the real route returns a timestamped snapshot');
  assert.ok(snapshot.totals && snapshot.metrics && Array.isArray(snapshot.activity));
  assert.ok(Array.isArray(snapshot.series) && snapshot.groups && snapshot.filters);
  assert.ok(snapshot.activity.some(call => call.kind === 'main' && call.usage === null), 'a real output without provider usage must not acquire zero consumption');
  assert.equal(snapshot.contextHistory.at(-1)?.inputTokens, null, 'the same missing receipt stays unknown in context history');
  return snapshot;
}
async function openMonitor(page) {
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const workbench = page.locator('.tx-workbench');
  await until(async () => (await workbench.boundingBox())?.width > 300);
  await workbench.getByRole('navigation', { name: '工作台导航' }).getByRole('button', { name: '监控', exact: true }).click();
  const monitor = page.locator('.omd-monitor');
  await monitor.getByRole('tab', { name: '概览', exact: true }).waitFor();
  await monitor.locator('.mon-metrics').first().waitFor();
  await until(() => page.locator('.pI_x6G_frame').evaluate(el => el.getAnimations().every(animation => animation.playState === 'finished')));
  return monitor;
}
const outerScroll = page => page.evaluate(() => ({
  documentTop: document.scrollingElement.scrollTop, documentLeft: document.scrollingElement.scrollLeft,
  frameTop: document.querySelector('.pI_x6G_frame')?.scrollTop, frameLeft: document.querySelector('.pI_x6G_frame')?.scrollLeft,
}));

test('monitor tabs connect their three panels, preserve native layout and support wrapping keyboard navigation', { timeout: 60000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  await realMonitor(page, sessionId);
  const monitor = await openMonitor(page), tabs = monitor.getByRole('tablist', { name: '监控分类', exact: true }).getByRole('tab');
  const states = await tabs.evaluateAll(elements => elements.map(el => ({
    id: el.id, selected: el.getAttribute('aria-selected'), tabIndex: el.tabIndex, controls: el.getAttribute('aria-controls'),
  })));
  assert.deepEqual(await tabs.allTextContents(), ['概览', '用量', '上下文']);
  assert.deepEqual(states.map(tab => tab.tabIndex), [0, -1, -1], 'only the selected tab participates in the Tab order');
  assert.equal(await monitor.locator('[role="tabpanel"]').count(), 3, 'every tab has a persistent associated panel');
  for (const tab of states) {
    assert.ok(tab.id && tab.controls);
    const panel = await page.evaluate(id => {
      const el = document.getElementById(id);
      return el && { role: el.getAttribute('role'), labelledBy: el.getAttribute('aria-labelledby'), hidden: el.hidden };
    }, tab.controls);
    assert.deepEqual(panel, { role: 'tabpanel', labelledBy: tab.id, hidden: tab.selected !== 'true' });
  }
  // A foreign scoped style is a coexistence marker, not an installed-plugin qualification.
  const foreign = await page.addStyleTag({ content: '.pI_x6G_centerCol { --monitor-foreign-layout: retained; }' });
  const nativeLayout = () => page.locator('.pI_x6G_frame').evaluate(el => ({
    grid: getComputedStyle(el).gridTemplateColumns,
    foreign: getComputedStyle(el.querySelector('.pI_x6G_centerCol')).getPropertyValue('--monitor-foreign-layout').trim(),
    composerCount: el.querySelectorAll('[data-composer-input]').length,
  }));
  const beforeLayout = await nativeLayout();
  await monitor.getByRole('tab', { name: '概览', exact: true }).focus();
  for (const [key, name] of [['ArrowRight', '用量'], ['End', '上下文'], ['ArrowRight', '概览'], ['ArrowLeft', '上下文'], ['Home', '概览']]) {
    await page.keyboard.press(key);
    const active = monitor.getByRole('tab', { name, exact: true });
    await until(async () => await active.getAttribute('aria-selected') === 'true');
    assert.equal(await active.evaluate(el => document.activeElement === el), true, `${key} moves focus with selection`);
    assert.deepEqual(await tabs.evaluateAll(elements => elements.map(el => el.tabIndex)), await tabs.evaluateAll(elements => elements.map(el => el.getAttribute('aria-selected') === 'true' ? 0 : -1)));
    assert.equal(await monitor.getByRole('tabpanel').count(), 1, 'only the selected panel is exposed');
    assert.deepEqual(await nativeLayout(), beforeLayout, 'content tabs preserve the native grid, composer and foreign scoped styles');
  }
  await page.keyboard.press('Tab');
  assert.equal(await monitor.getByRole('combobox', { name: '监控统计范围', exact: true }).evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Tab');
  assert.equal(await monitor.getByRole('combobox', { name: '统计时间范围', exact: true }).evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Tab');
  assert.equal(await monitor.getByRole('tabpanel', { name: '概览', exact: true }).evaluate(el => document.activeElement === el), true, 'Tab reaches the visible panel after its shared scope controls');
  await foreign.evaluate(el => el.remove());
  assert.deepEqual(errors, []);
});

test('monitor timeline clears filters, reveals long-list calls, keeps polling focus and displays unknown and cancelled records', { timeout: 90000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  const snapshot = await realMonitor(page, sessionId), now = Date.now();
  const activity = Array.from({ length: 70 }, (_, index) => ({
    id: 'monitor-call-' + index, sessionId, source: 'fixture', kind: index % 2 ? 'prepare' : 'main', at: now - index * 1000,
    provider: 'fixture', model: 'call-' + (70 - index), durationMs: 1000, turn: 1, step: 70 - index, eventSeq: 100 + index,
    status: index === 1 ? 'cancelled' : index === 40 ? 'error' : 'success',
    usage: index === 0 ? { inputTokens: 10, outputTokens: 5, totalTokens: 77 } : { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0, totalTokens: 35 },
    ...(index === 40 ? { error: 'fixture call failure' } : {}),
  }));
  let reads = 0;
  await page.route('**/trisoul-x/api/monitor?*', route => {
    reads++;
    const params = new URL(route.request().url()).searchParams;
    const matching = activity.filter(call => (!params.get('kind') || params.get('kind') === call.kind)
      && (!params.get('provider') || params.get('provider') === call.provider)
      && (!params.get('model') || params.get('model') === call.model)
      && (params.get('status') !== 'error' || call.status === 'error')
      && (params.get('status') !== 'cancelled' || call.status === 'cancelled')
      && (!params.get('query') || `${call.model} ${call.error || ''}`.includes(params.get('query'))));
    const metric = { calls: matching.length, errors: matching.filter(call => call.status === 'error').length,
      cancelled: matching.filter(call => call.status === 'cancelled').length, durationMs: matching.length * 1000,
      inputTokens: matching.length * 10, outputTokens: matching.length * 5, cacheReadTokens: matching.filter(call => call.id !== 'monitor-call-0').length * 20,
      cacheWriteTokens: 0, totalTokens: matching.reduce((sum, call) => sum + call.usage.totalTokens, 0), unmetered: 0,
      cacheUnreported: matching.some(call => call.id === 'monitor-call-0') ? 1 : 0, peakContext: 30 };
    const second = params.get('cursor') === 'fixture-page-2';
    return route.fulfill({ json: { ...snapshot, generatedAt: now, range: params.get('range'), period: params.get('period'),
      totals: metric, metrics: { main: metric }, liveCalls: [], running: 'idle', activity: matching.slice(second ? 50 : 0, second ? 100 : 50),
      activityTotal: matching.length, nextCursor: !second && matching.length > 50 ? 'fixture-page-2' : null,
      series: [{ at: now, label: '10/10', ...metric }], groups: { components: [{ key: 'main', ...metric }], models: [], providers: [], sessions: [] },
      filters: { providers: ['fixture'], models: activity.map(call => ({ provider: call.provider, model: call.model })), kinds: ['main', 'prepare'] },
      contextCapacity: null, coverage: { partial: false, legacyCalls: 0, unmetered: 0, cacheUnreported: metric.cacheUnreported,
        message: metric.cacheUnreported ? '1 次调用未单独披露缓存读取。' : '', scope: '受控页面回归' },
    } });
  });
  const monitor = await openMonitor(page);
  await until(async () => await monitor.locator('.mon-timeline-row button').count() === 16);
  for (const [width, colorScheme, keyboard] of [[1440, 'light', false], [390, 'dark', true]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    if (width === 1440) await page.getByRole('button', { name: '全屏', exact: true }).click();
    await until(async () => { const box = await monitor.boundingBox(); return width === 1440 ? box?.width > 600 : box?.width <= 390; });
    const usage = monitor.getByRole('tab', { name: '用量', exact: true });
    await usage.click();
    await monitor.getByRole('combobox', { name: '调用组件', exact: true }).selectOption('main');
    await monitor.getByRole('combobox', { name: '调用状态', exact: true }).selectOption('error');
    await until(async () => await monitor.locator('.mon-call-row').count() === 1);
    await monitor.getByRole('tab', { name: '概览', exact: true }).click();
    await until(async () => await monitor.locator('.mon-timeline-row button').count() === 16);
    const firstCall = monitor.locator('.mon-timeline-row').filter({ hasText: '上下文预处理' }).locator('button').first();
    const hit = await firstCall.boundingBox(), before = await outerScroll(page);
    if (keyboard) { await firstCall.focus(); await firstCall.press('Enter'); } else await firstCall.click();
    await until(async () => await usage.getAttribute('aria-selected') === 'true');
    assert.equal(await monitor.getByRole('combobox', { name: '调用组件', exact: true }).inputValue(), '');
    assert.equal(await monitor.getByRole('combobox', { name: '调用状态', exact: true }).inputValue(), 'all');
    await until(async () => await monitor.locator('.mon-calls > .mon-call-row').count() === 50);
    const target = monitor.locator('.mon-call-row').filter({ has: page.locator('summary').filter({ hasText: 'call-55' }) });
    assert.equal(await target.count(), 1);
    assert.notEqual(await target.getAttribute('open'), null, 'the oldest displayed timeline call expands');
    const position = await target.locator('summary').evaluate(el => {
      const body = el.closest('.mon-body'), rect = el.getBoundingClientRect(), viewport = body.getBoundingClientRect();
      return { focused: document.activeElement === el, scrollTop: body.scrollTop, top: rect.top, bottom: rect.bottom,
        viewportTop: viewport.top + body.clientTop, viewportBottom: viewport.top + body.clientTop + body.clientHeight };
    });
    assert.equal(position.focused, true, 'the hidden timeline button transfers focus to the selected summary');
    assert.ok(position.scrollTop > 0, 'selection scrolls inside the long call list');
    assert.ok(position.top >= position.viewportTop - 1 && position.bottom <= position.viewportBottom + 1, JSON.stringify(position));
    assert.ok(hit.width >= 24 && hit.height >= 24, 'compact visual dots retain usable pointer and touch targets');
    assert.deepEqual(await outerScroll(page), before, 'only the monitor body scrolls');
    assert.equal(await monitor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'monitor content fits its native pane');
    const filter = monitor.getByRole('combobox', { name: '调用组件', exact: true });
    await filter.focus();
    await monitor.locator('.mon-body').evaluate(el => { el.scrollTop = 0; });
    const beforeReads = reads;
    await until(() => reads > beforeReads);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await filter.evaluate(el => document.activeElement === el), true, 'polling leaves the next action focused');
    assert.equal(await monitor.locator('.mon-body').evaluate(el => el.scrollTop), 0, 'polling does not repeat the timeline jump');
    assert.notEqual(await target.getAttribute('open'), null, 'polling retains an expanded call');
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
      await monitor.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, `monitor-navigation-${width}-${colorScheme}.png`) });
      for (const [name, key] of [['概览', 'overview'], ['上下文', 'context']]) {
        await monitor.getByRole('tab', { name, exact: true }).click();
        await until(async () => await monitor.locator('.mon-loading').count() === 0);
        await monitor.locator('.mon-body').evaluate(el => { el.scrollTop = 0; });
        await monitor.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, `monitor-${key}-${width}-${colorScheme}.png`) });
      }
      await monitor.getByRole('tab', { name: '用量', exact: true }).click();
      await until(async () => await monitor.locator('.mon-calls > .mon-call-row').count() === 50);
    }
  }
  await monitor.getByRole('button', { name: '下一页', exact: true }).click();
  await until(async () => await monitor.locator('.mon-calls > .mon-call-row').count() === 20);
  assert.equal(await monitor.getByText('共 70 次', { exact: true }).isVisible(), true, 'pagination does not replace the complete filtered count');
  await monitor.getByRole('button', { name: '上一页', exact: true }).click();
  await until(async () => await monitor.locator('.mon-calls > .mon-call-row').count() === 50);
  const unknown = monitor.locator('.mon-call-row').filter({ has: page.locator('summary').filter({ hasText: 'call-70' }) });
  await unknown.locator('summary').click();
  assert.match(await unknown.locator('summary').innerText(), /77/, 'reported total takes precedence over an incomplete sum of token buckets');
  for (const label of ['缓存读取', '缓存写入']) {
    assert.equal(await unknown.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }).locator('xpath=following-sibling::dd[1]').innerText(), '—', 'an unreported bucket is not a cache miss');
  }
  assert.equal(await unknown.getByText('未返回', { exact: true }).isVisible(), true, 'unreported reasoning remains unknown');
  assert.equal(await monitor.locator('.mon-metrics-usage > div').nth(1).locator('strong').innerText(), '—', 'missing cache reports do not create a precise cache ratio');
  assert.equal(await monitor.locator('.mon-coverage').isVisible(), true, 'cache coverage is visible even without legacy partial data');
  await monitor.getByRole('combobox', { name: '调用状态', exact: true }).selectOption('cancelled');
  await until(async () => await monitor.locator('.mon-calls > .mon-call-row').count() === 1);
  const cancelled = monitor.locator('.mon-calls > .mon-call-row');
  assert.match(await cancelled.locator('summary').innerText(), /已取消/);
  assert.match(await cancelled.getAttribute('class'), /mon-cancelled/);
  assert.doesNotMatch(await cancelled.getAttribute('class'), /mon-failed/);
  assert.equal(await monitor.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true, 'changing filters resets pagination');
  await monitor.getByRole('tab', { name: '上下文', exact: true }).click();
  await monitor.getByText('容量未知', { exact: true }).waitFor();
  assert.equal(await monitor.locator('.mon-context-capacity').innerText().then(text => text.includes('0%')), false, 'unknown capacity is not displayed as an empty window');
  assert.deepEqual(errors, []);
});
