import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function setup(t) {
  const f = await frontendFixture(t), { page } = f;
  await page.setViewportSize({ width: 1100, height: 700 });
  const summary = '阅读回归资料，检查完整记忆、来源与返回位置。'.repeat(40);
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, globalMemory: { ref: 'reader-memory', revision: 1, updatedAt: Date.now(), summary } } });
  });
  const source = { kind: 'memory', key: 'global', text: '来源阅读正文。'.repeat(200), sources: Array.from({ length: 24 }, (_, i) => ({ kind: 'summary', reference: 'reader-source-' + i })) };
  await page.route('**/trisoul-x/api/dream/read?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('reference') === 'reader-memory' ? source : { kind: 'summary', text: '摘要来源内容。'.repeat(50), recordId: 'reader-record', sessionId: f.sessionId, sources: [] } }));
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const nav = page.locator('.cx-navigation'), panel = page.locator('.cx-dream');
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  const open = panel.getByRole('button', { name: '查看来源', exact: true });
  await open.waitFor();
  return { ...f, nav, panel, open, summary };
}

async function capture(page, name) {
  if (!process.env.TRISOUL_UI_ARTIFACTS) return;
  await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
  await page.locator('.tx-workbench').screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, name + '.png') });
}

test('memory source reading starts at the top and returns to the same expanded memory and nested source position', { timeout: 60000 }, async t => {
  const { page, panel, nav, open, errors, summary } = await setup(t);
  await panel.getByRole('button', { name: '展开完整记忆', exact: true }).click();
  await open.scrollIntoViewIfNeeded();
  const main = panel.locator(':scope > .cx-body');
  const memoryScroll = await main.evaluate(el => el.scrollTop);
  assert.ok(memoryScroll > 100);
  await open.click();
  const reader = panel.locator('.cx-dream-reader');
  await reader.waitFor();
  await capture(page, 'source-open');
  assert.equal(await reader.evaluate(el => el.contains(document.activeElement)), true, 'opening a source moves keyboard focus into its reading view');
  const body = reader.locator(':scope > .cx-body');
  assert.equal(await body.evaluate(el => el.scrollTop), 0, 'each new source starts at its beginning');
  assert.equal(await reader.locator('pre').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'source text uses the main reader scrollport');
  const source = reader.locator('button[title="reader-source-20"]');
  await source.scrollIntoViewIfNeeded();
  await source.focus();
  const sourceScroll = await body.evaluate(el => el.scrollTop);
  await source.click();
  await reader.getByRole('button', { name: '查看详细资料与附件', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await source.waitFor();
  assert.equal(await source.evaluate(el => document.activeElement === el), true, 'nested return restores the selected source');
  assert.ok(Math.abs(await body.evaluate(el => el.scrollTop) - sourceScroll) < 2, 'nested return restores the reading position');
  await nav.getByRole('button', { name: '任务', exact: true }).click();
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  assert.equal(await reader.evaluate(el => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await reader.count(), 0);
  assert.equal(await open.evaluate(el => document.activeElement === el), true);
  assert.equal(await panel.locator('.cx-dream-memory > .cx-prose').innerText(), summary, 'reading sources does not collapse the original memory');
  assert.ok(Math.abs(await main.evaluate(el => el.scrollTop) - memoryScroll) < 2, 'return preserves the memory scroll position');
  await capture(page, 'memory-return');
  assert.deepEqual(errors, []);
});

test('memory document reader preserves its requesting control across delayed results and section switches', { timeout: 60000 }, async t => {
  const { page, panel, nav, open, sessionId, errors } = await setup(t);
  await open.click();
  await panel.locator('button[title="reader-source-0"]').click();
  const original = panel.getByRole('button', { name: '查看详细资料与附件', exact: true });
  let pending;
  await page.route('**/trisoul-x/api/dream/document?*', route => { pending = route; });
  await original.click();
  await until(() => pending);
  const tasks = nav.getByRole('button', { name: '任务', exact: true });
  await tasks.click();
  await pending.fulfill({ json: { id: 'reader-record', sessionId, summary: '详细资料摘要', documents: [{ title: '阅读回归', text: '正文与附件入口使用独立阅读区域。' }], assets: [] } });
  await until(async () => await panel.locator('.cx-reader:not(.cx-dream-reader)').count() === 1);
  assert.equal(await tasks.evaluate(el => document.activeElement === el), true, 'a late result in a hidden section does not steal focus');
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  const detail = panel.getByRole('region', { name: '详细资料', exact: true });
  assert.equal(await detail.evaluate(el => el.contains(document.activeElement)), true);
  await page.keyboard.press('Tab');
  assert.equal(await detail.evaluate(el => el.contains(document.activeElement)), true, 'the detail return control is reachable, not inert');
  await page.keyboard.press('Escape');
  assert.equal(await detail.count(), 0);
  assert.equal(await original.evaluate(el => document.activeElement === el), true, 'return focuses the original requester instead of the navigation clicked during loading');
  assert.equal(await original.evaluate(el => Boolean(el.closest('[inert]'))), false);
  await capture(page, 'detail-return');
  assert.deepEqual(errors, []);
});

test('narrow memory readers keep failures visible and late source results do not interrupt the composer', { timeout: 60000 }, async t => {
  const { page, panel, open, errors } = await setup(t);
  const handle = await page.locator('[data-side="rightbar"]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, 220);
  await page.mouse.down(); await page.mouse.move(780, 220, { steps: 8 }); await page.mouse.up();
  await until(async () => Math.abs((await panel.boundingBox()).width - 320) < 2);
  let fail = true, pending;
  await page.route('**/trisoul-x/api/dream/read?*', route => {
    if (fail) return route.fulfill({ status: 503, json: { error: '来源暂时无法读取，请重试。' } });
    if (new URL(route.request().url()).searchParams.get('reference') === 'reader-source-0') { pending = route; return; }
    return route.fallback();
  });
  const inViewport = async locator => {
    const outer = await panel.boundingBox(), box = await locator.boundingBox();
    return box.y >= outer.y && box.y + box.height <= outer.y + outer.height;
  };
  await panel.getByRole('button', { name: '展开完整记忆', exact: true }).click();
  await open.click();
  const error = panel.getByRole('alert').filter({ hasText: '来源暂时无法读取' });
  await error.waitFor();
  assert.equal(await inViewport(error), true, 'first source-read failure remains visible after scrolling a long memory');
  fail = false; await open.click();
  const reader = panel.getByRole('region', { name: '记忆来源', exact: true });
  const source = reader.locator('button[title="reader-source-0"]');
  await source.click(); await until(() => pending);
  const composer = page.locator('[data-composer-input]');
  await composer.fill('继续输入我的新要求');
  await pending.fulfill({ json: { kind: 'summary', text: '迟到但有效的来源内容', sources: [] } });
  await reader.getByText('迟到但有效的来源内容', { exact: true }).waitFor();
  assert.equal(await composer.evaluate(el => el.contains(document.activeElement)), true, 'a nested source arriving late leaves composer focus alone');
  assert.equal(await composer.innerText(), '继续输入我的新要求');
  await reader.focus(); await page.keyboard.press('Escape');
  await source.waitFor();
  fail = true; await source.click(); await error.waitFor();
  assert.equal(await inViewport(error), true, 'a nested failure remains visible above the source scroll area');
  assert.equal(await reader.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await capture(page, 'source-error-narrow-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'source-error-narrow-dark');
  await reader.getByRole('button', { name: '返回记忆', exact: true }).click();
  assert.equal(await reader.count(), 0);
  assert.equal(await open.evaluate(el => document.activeElement === el), true);
  assert.deepEqual(errors, []);
});

test('switching sessions closes both memory reading layers without leaving background controls inert', { timeout: 60000 }, async t => {
  const { page, panel, open, rpc, workspace, sessionId, errors } = await setup(t);
  const registered = await rpc('workspace/create', { path: workspace });
  const next = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' });
  await rpc('session/prompt', { sessionId: next.sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: '阅读视图关闭后的新会话' }] });
  await until(async () => (await (await page.request.get(new URL('/trisoul-x/api/state?session=' + next.sessionId, page.url()).href)).json()).running === 'idle');
  await rpc('session/rename', { sessionId: next.sessionId, title: '阅读层叠退出检查' });
  await page.route('**/trisoul-x/api/dream/document?*', route => route.fulfill({ json: { id: 'reader-record', sessionId, summary: '详细资料摘要', documents: [], assets: [] } }));
  await open.click();
  await panel.locator('button[title="reader-source-0"]').click();
  await panel.getByRole('button', { name: '查看详细资料与附件', exact: true }).click();
  await panel.getByRole('region', { name: '详细资料', exact: true }).waitFor();
  assert.equal(await panel.locator('.cx-reader').count(), 2);
  await page.getByText('阅读层叠退出检查', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '记忆', exact: true }).click();
  await panel.locator('.cx-dream-usage').waitFor();
  await until(async () => await panel.locator('.cx-reader').count() === 0);
  assert.equal(await panel.locator(':scope > *').evaluateAll(els => els.every(el => !el.inert)), true, 'closing both layers releases every background control');
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  await panel.getByRole('spinbutton', { name: '检查间隔 · 分钟', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
