import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function openMemory(page) {
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '记忆', exact: true }).click();
  return page.locator('.cx-dream');
}

async function screenshot(panel, name) {
  if (!process.env.TRISOUL_UI_ARTIFACTS) return;
  await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
  await panel.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, name + '.png') });
}

test('Dream status polling clears its outage error after the connection recovers', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  let fail = true, successfulReads = 0;
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    if (fail) return route.fulfill({ status: 503, json: { error: 'Dream 状态暂时无法读取' } });
    const response = await route.fetch(); successfulReads++;
    await route.fulfill({ response });
  });
  const panel = await openMemory(page);
  const outage = panel.getByRole('alert').filter({ hasText: 'Dream 状态暂时无法读取' });
  await outage.waitFor(); await screenshot(panel, 'dream-poll-outage');
  fail = false;
  await until(() => successfulReads >= 2);
  await panel.locator('.cx-dream-usage').waitFor();
  await screenshot(panel, 'dream-poll-recovered');
  assert.equal(await outage.count(), 0, 'successful status polling must clear its earlier transport error');
  assert.deepEqual(errors, []);
});

test('Dream action and manual reader failures survive successful status and catalog polling', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  let reads = 0, fail = true, revision = 0, readFailed = true;
  page.on('response', response => { if (/\/trisoul-x\/api\/dream\?/.test(response.url()) && response.ok()) reads++; });
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, catalogRevision: ++revision,
      globalMemory: { ref: 'fixture-manual-read', revision: 1, updatedAt: Date.now(), summary: '手动读取失败保护' } } });
  });
  await page.route('**/trisoul-x/api/dream/refresh?*', route => route.fulfill(fail
    ? { status: 500, json: { error: '本次 Dream 刷新失败，请重试' } }
    : { json: { refreshed: true } }));
  await page.route('**/trisoul-x/api/dream/read?*', route => route.fulfill(readFailed
    ? { status: 500, json: { error: '本次 Dream 来源读取失败，请重试' } }
    : { json: { kind: 'memory', key: 'global', text: '手动读取已完成', recordId: 'fixture-record', sessionId: 'fixture-session', sources: [] } }));
  await page.route('**/trisoul-x/api/dream/document?*', route => route.fulfill({ status: 500, json: { error: '本次 Dream 详细资料读取失败，请重试' } }));
  const panel = await openMemory(page);
  await panel.locator('.cx-dream-usage').waitFor();
  const refresh = panel.getByRole('button', { name: '刷新', exact: true });
  await refresh.click();
  const failure = panel.getByRole('alert').filter({ hasText: '本次 Dream 刷新失败' });
  await failure.waitFor();
  const before = reads; await until(() => reads >= before + 2);
  assert.equal(await failure.isVisible(), true, 'background polling must preserve a real mutation failure');
  await screenshot(panel, 'dream-action-error-preserved');
  fail = false; await refresh.click();
  await panel.getByText('目录已刷新。', { exact: true }).waitFor();
  assert.equal(await failure.count(), 0);
  await panel.getByRole('button', { name: '查看来源', exact: true }).click();
  const readFailure = panel.getByRole('alert').filter({ hasText: '本次 Dream 来源读取失败' });
  await readFailure.waitFor();
  const afterRead = reads; await until(() => reads >= afterRead + 2);
  assert.equal(await readFailure.isVisible(), true, 'background directory successes must not hide a manual read failure');
  readFailed = false; await panel.getByRole('button', { name: '查看来源', exact: true }).click();
  await panel.getByText('手动读取已完成', { exact: true }).waitFor();
  assert.equal(await readFailure.count(), 0);
  await panel.getByRole('button', { name: '查看详细资料与附件', exact: true }).click();
  const documentFailure = panel.getByRole('alert').filter({ hasText: '本次 Dream 详细资料读取失败' });
  await documentFailure.waitFor();
  const afterDocument = reads; await until(() => reads >= afterDocument + 2);
  assert.equal(await documentFailure.isVisible(), true, 'background polling must not hide a manual document failure');
  await screenshot(panel, 'dream-manual-document-error-preserved');
  assert.deepEqual(errors, []);
});

test('Dream status and catalog outages recover independently without hiding a still-failed directory', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  let failStatus = true, failCatalog = true, reads = 0, catalogReads = 0, catalogSuccesses = 0;
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    if (failStatus) return route.fulfill({ status: 503, json: { error: 'Dream 状态断网提示' } });
    const response = await route.fetch(), data = await response.json(); reads++;
    await route.fulfill({ json: { ...data, catalogRevision: 0, jobs: [] } });
  });
  await page.route('**/trisoul-x/api/dream/catalog?*', async route => {
    catalogReads++;
    if (failCatalog) return route.fulfill({ status: 503, json: { error: 'Dream 目录断网提示' } });
    catalogSuccesses++; await route.fulfill({ json: { entries: [] } });
  });
  const panel = await openMemory(page);
  await panel.getByRole('alert').filter({ hasText: /Dream (状态|目录)断网提示/ }).waitFor();
  await until(() => catalogReads > 0); await screenshot(panel, 'dream-double-outage');
  failStatus = false;
  await until(() => reads >= 2); await panel.locator('.cx-dream-usage').waitFor();
  const directoryError = panel.getByRole('alert').filter({ hasText: 'Dream 目录断网提示' });
  assert.equal(await directoryError.isVisible(), true, 'a status success must not pretend the directory recovered');
  await screenshot(panel, 'dream-status-recovered-catalog-failed');
  failCatalog = false;
  const before = reads; await until(() => reads >= before + 2);
  assert.ok(catalogSuccesses > 0, 'a failed background directory read must retry even when revision and job timestamps do not change');
  assert.equal(await panel.getByRole('alert').count(), 0);
  await screenshot(panel, 'dream-double-outage-recovered');
  assert.deepEqual(errors, []);
});

test('Dream retries a catalog-only outage once and waits for the pending request to finish', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  let reads = 0, failCatalog = false, holdRetry = false, pending, retries = 0;
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json(); reads++;
    await route.fulfill({ json: { ...data, catalogRevision: 0, jobs: [] } });
  });
  await page.route('**/trisoul-x/api/dream/catalog?*', route => {
    if (failCatalog) return route.fulfill({ status: 503, json: { error: 'Dream 目录单独故障' } });
    if (holdRetry) { retries++; pending = route; return; }
    return route.fulfill({ json: { entries: [] } });
  });
  const panel = await openMemory(page);
  await panel.locator('.cx-dream-usage').waitFor();
  failCatalog = true;
  await panel.getByRole('textbox', { name: '搜索记忆目录', exact: true }).fill('需要恢复的目录');
  const failure = panel.getByRole('alert').filter({ hasText: 'Dream 目录单独故障' });
  await failure.waitFor();
  failCatalog = false; holdRetry = true;
  const before = reads; await until(() => reads >= before + 2);
  assert.equal(retries, 1, 'unchanged successful status polling should start one background retry');
  assert.equal(await failure.isVisible(), true, 'a pending read has not yet recovered');
  const whilePending = reads; await until(() => reads >= whilePending + 2);
  assert.equal(retries, 1, 'later polls must not overlap the pending directory read');
  holdRetry = false;
  await pending.fulfill({ json: { entries: [{ id: '/fixture/catalog-restored', memory: { summary: '恢复后的目录内容' } }] } });
  await panel.getByText('catalog-restored', { exact: true }).waitFor();
  assert.equal(await failure.count(), 0);
  await screenshot(panel, 'dream-catalog-only-recovered');
  assert.deepEqual(errors, []);
});

test('Dream late status, source and catalog responses cannot replace the newly selected session', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page, rpc, sessionId, workspace, errors } = f;
  const registered = await rpc('workspace/create', { path: workspace });
  const next = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' });
  await rpc('session/prompt', { sessionId: next.sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Dream 切换会话迟到响应检查' }] });
  await until(async () => (await (await page.request.get(new URL('/trisoul-x/api/state?session=' + next.sessionId, page.url()).href)).json()).running === 'idle');
  await rpc('session/rename', { sessionId: next.sessionId, title: 'Dream 切换后的会话' });
  let holdOldStatus = false, oldStatus, oldSource, oldCatalog;
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const sid = new URL(route.request().url()).searchParams.get('session');
    const response = await route.fetch(), data = await response.json();
    const json = { ...data, globalMemory: { ref: 'fixture-old-source', revision: 1, updatedAt: Date.now(),
      summary: sid === sessionId ? '旧会话状态标记' : '新会话状态标记' } };
    if (sid === sessionId && holdOldStatus) { holdOldStatus = false; oldStatus = { route, json }; return; }
    await route.fulfill({ json });
  });
  await page.route('**/trisoul-x/api/dream/read?*', route => { oldSource = route; });
  await page.route('**/trisoul-x/api/dream/catalog?*', route => {
    if (new URL(route.request().url()).searchParams.get('query') === '旧会话目录请求') { oldCatalog = route; return; }
    return route.fulfill({ json: { entries: [] } });
  });
  const panel = await openMemory(page);
  await panel.getByText('旧会话状态标记', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '查看来源', exact: true }).click();
  await until(() => oldSource);
  await panel.getByRole('textbox', { name: '搜索记忆目录', exact: true }).fill('旧会话目录请求');
  await until(() => oldCatalog);
  holdOldStatus = true; await until(() => oldStatus);
  await page.getByText('Dream 切换后的会话', { exact: true }).first().click();
  await openMemory(page);
  await panel.getByText('新会话状态标记', { exact: true }).waitFor();
  const sourceResponse = page.waitForResponse(response => response.url() === oldSource.request().url());
  const catalogResponse = page.waitForResponse(response => response.url() === oldCatalog.request().url());
  await oldSource.fulfill({ json: { kind: 'memory', key: 'global', text: '旧会话迟到来源内容', sources: [] } });
  await oldCatalog.fulfill({ json: { entries: [{ id: '/fixture/旧会话迟到目录', memory: { summary: '旧会话迟到目录内容' } }] } });
  await Promise.all([sourceResponse.then(response => response.finished()), catalogResponse.then(response => response.finished())]);
  // The poll request may already have been aborted on switching. Delivering
  // the other non-cancellable reads still exercises their epoch checks.
  await oldStatus.route.fulfill({ json: oldStatus.json }).catch(() => {});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await panel.getByText('新会话状态标记', { exact: true }).waitFor();
  await screenshot(panel, 'dream-session-late-responses');
  assert.equal(await panel.locator('.cx-dream-reader').count(), 0);
  assert.doesNotMatch(await panel.innerText(), /旧会话状态标记|旧会话迟到来源内容|旧会话迟到目录/);
  assert.equal(await panel.getByRole('textbox', { name: '搜索记忆目录', exact: true }).inputValue(), '');
  assert.deepEqual(errors, []);
});
