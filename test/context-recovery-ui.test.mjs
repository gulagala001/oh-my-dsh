import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const longRecords = () => Array.from({ length: 18 }, (_, i) => ({ id: 'recovery-record-' + i, live: true, mode: 'raw', summary: ('工作上下文资料 ' + i + '：验证长摘要列表中的失败恢复与详细资料阅读。').repeat(7), ranges: [{ from: i + 1, to: i + 3 }], timeStart: Date.now(), timeEnd: Date.now(), documentCount: 1, assetCount: 0 }));

async function assertInScrollport(locator) {
  const bounds = await locator.evaluate(el => {
    const box = el.getBoundingClientRect(), viewport = el.closest('.cx-body').getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, viewport: { top: Math.max(0, viewport.top), bottom: Math.min(innerHeight, viewport.bottom), left: Math.max(0, viewport.left), right: Math.min(innerWidth, viewport.right) } };
  });
  assert.ok(bounds.top >= bounds.viewport.top - 1 && bounds.bottom <= bounds.viewport.bottom + 1 && bounds.left >= bounds.viewport.left && bounds.right <= bounds.viewport.right, 'the error must intersect and fit the actual scroll viewport: ' + JSON.stringify(bounds));
}

test('context delay editing preserves decimal text and saves integer milliseconds', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await dialog.getByRole('switch', { name: '空闲时自动预处理', exact: true }).check();
  const delay = dialog.getByRole('spinbutton', { name: '空闲等待时间 · 秒', exact: true });
  await delay.fill('');
  assert.equal(await delay.inputValue(), '');
  await delay.pressSequentially('1.001');
  assert.equal(await delay.inputValue(), '1.001', 'typing milliseconds must not remove the decimal point');
  assert.equal(await delay.evaluate(input => input.checkValidity()), true);
  const saved = page.waitForResponse(response => response.url().endsWith('/trisoul-x/api/settings') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '保存设置', exact: true }).click();
  const response = await saved;
  assert.equal(response.ok(), true, await response.text());
  assert.equal(response.request().postDataJSON().flushIdleMs, 1001);
  await dialog.getByText('设置已保存', { exact: true }).waitFor();
  const config = await (await page.request.get(new URL('/trisoul-x/api/settings', page.url()).href)).json();
  assert.equal(config.flushIdleMs, 1001);
  assert.equal(await delay.inputValue(), '1.001');
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
    await dialog.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'context-millisecond-save.png') });
  }
  await delay.fill('1.0001');
  assert.equal(await delay.inputValue(), '1.0001', 'sub-millisecond input is not silently rounded into a different value');
  assert.equal(await delay.evaluate(input => input.checkValidity()), false);
  await delay.fill('1.001e0');
  assert.equal(await delay.inputValue(), '1.001e0', 'equivalent exponent notation retains its numeric meaning');
  assert.equal(await delay.evaluate(input => input.checkValidity()), true);
  assert.equal(await dialog.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true, 'equivalent numeric text is not an unsaved setting');
  assert.deepEqual(errors, []);
});

test('context errors remain in the long-list viewport and offer keyboard retries after polling', { timeout: 60000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  const data = await (await page.request.get(new URL('/trisoul-x/api/context?session=' + sessionId, page.url()).href)).json();
  const records = longRecords(), attempts = [];
  let reads = 0, fail = true, reviewFail = true, documentFail = true, reviewReads = 0;
  await page.route('**/trisoul-x/api/context?*', route => route.fulfill({ json: { ...data, records } }));
  page.on('response', response => { if (/\/trisoul-x\/api\/context\?/.test(response.url())) reads++; });
  await page.route('**/trisoul-x/api/compact?*', route => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill(fail ? { status: 503, json: { error: '本次应用失败，请重试' } } : { json: { changed: false, queued: false } });
  });
  await page.route('**/trisoul-x/api/context/review?*', route => {
    reviewReads++;
    return route.fulfill(reviewFail ? { status: 503, json: { error: '本次中枢输入读取失败，请重试' } } : { json: { input: { recovered: '中枢输入已恢复' } } });
  });
  await page.route('**/trisoul-x/api/context/document?*', route => route.fulfill(documentFail
    ? { status: 503, json: { error: '本次详细资料读取失败，请重试' } }
    : { json: { ...records.at(-1), documents: [{ title: '重试后的资料', text: '资料读取已恢复' }] } }));
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '上下文', exact: true }).click();
  const panel = page.locator('.cx-context'), body = panel.locator(':scope > .cx-body');
  await panel.getByRole('checkbox', { name: '选择 recovery-record-17', exact: true }).check();
  assert.ok(await body.evaluate(el => el.scrollTop) > 1000, 'the failure starts far below the first list item');
  await panel.locator('.cx-selection').getByRole('button', { name: '仅摘要', exact: true }).press('Enter');
  const failure = panel.getByRole('alert').filter({ hasText: '本次应用失败' });
  await failure.waitFor();
  const before = reads; await until(() => reads >= before + 2);
  await assertInScrollport(failure);
  assert.equal(await failure.evaluate(el => document.activeElement === el), true, 'failure restores keyboard focus after the action button was disabled');
  await page.keyboard.press('Tab');
  assert.equal(await failure.getByRole('button', { name: '重试', exact: true }).evaluate(el => document.activeElement === el), true);
  fail = false; await page.keyboard.press('Enter');
  await panel.getByText('已保存', { exact: true }).waitFor();
  assert.deepEqual(attempts, [{ ids: ['recovery-record-17'], mode: 'brief' }, { ids: ['recovery-record-17'], mode: 'brief' }], 'retry repeats the selected operation');
  assert.equal(await panel.getByRole('alert').count(), 0);

  await panel.locator('summary').filter({ hasText: '中枢最近的选择' }).click();
  await panel.getByRole('button', { name: '查看中枢完整输入', exact: true }).press('Enter');
  const reviewFailure = panel.getByRole('alert').filter({ hasText: '本次中枢输入读取失败' });
  await reviewFailure.waitFor();
  const afterRead = reads; await until(() => reads >= afterRead + 2);
  await assertInScrollport(reviewFailure);
  assert.equal(await reviewFailure.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Tab');
  assert.equal(await reviewFailure.getByRole('button', { name: '重试', exact: true }).evaluate(el => document.activeElement === el), true);
  reviewFail = false; await page.keyboard.press('Enter');
  await panel.getByText(/"中枢输入已恢复"/).waitFor();
  assert.equal(reviewReads, 2);
  assert.equal(await panel.getByRole('alert').count(), 0);

  const openDocument = panel.getByRole('button', { name: '1 文档 · 0 附件', exact: true }).last();
  await openDocument.press('Enter');
  const documentFailure = panel.getByRole('alert').filter({ hasText: '本次详细资料读取失败' });
  await documentFailure.waitFor();
  await assertInScrollport(documentFailure);
  await page.keyboard.press('Tab');
  assert.equal(await documentFailure.getByRole('button', { name: '重试', exact: true }).evaluate(el => document.activeElement === el), true);
  documentFail = false; await page.keyboard.press('Enter');
  await panel.getByRole('region', { name: '详细资料', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await openDocument.evaluate(el => document.activeElement === el), true, 'a document retry still returns to the original record trigger');
  assert.deepEqual(errors, []);
});

test('context reader restores focus across workbench sections and excludes covered controls from Tab', { timeout: 60000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  const data = await (await page.request.get(new URL('/trisoul-x/api/context?session=' + sessionId, page.url()).href)).json();
  const records = longRecords();
  await page.route('**/trisoul-x/api/context?*', route => route.fulfill({ json: { ...data, records } }));
  await page.route('**/trisoul-x/api/context/document?*', route => route.fulfill({ json: { ...records[0], documents: [{ title: '回归资料', text: '保留本分区阅读状态与键盘返回能力。' }] } }));
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const nav = page.locator('.cx-navigation'), panel = page.locator('.cx-context');
  await nav.getByRole('button', { name: '上下文', exact: true }).click();
  const open = panel.getByRole('button', { name: '1 文档 · 0 附件', exact: true }).first();
  await open.click();
  const reader = panel.getByRole('region', { name: '详细资料', exact: true });
  await reader.waitFor();
  assert.equal(await reader.getAttribute('aria-modal'), null, 'a workbench reading view does not announce an application modal');
  assert.equal(await reader.evaluate(el => document.activeElement === el), true);
  for (let visit = 0; visit < 2; visit++) {
    await nav.getByRole('button', { name: '记忆', exact: true }).click();
    await nav.getByRole('button', { name: '上下文', exact: true }).click();
    assert.equal(await reader.evaluate(el => document.activeElement === el), true, 're-entering the section restores reader focus');
    assert.equal(await panel.locator(':scope > :not(.cx-reader)').evaluateAll(elements => elements.every(el => el.inert)), true);
    for (let key = 0; key < 12; key++) {
      await page.keyboard.press(key < 6 ? 'Tab' : 'Shift+Tab');
      const focus = await panel.evaluate(el => {
        const active = document.activeElement;
        return { covered: el.contains(active) && !active.closest('.cx-reader'), inert: Boolean(active.closest('[inert]')), hidden: Boolean(active.closest('[hidden]')) };
      });
      assert.deepEqual(focus, { covered: false, inert: false, hidden: false }, 'Tab must never reach the covered context actions');
    }
  }
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  await nav.getByRole('button', { name: '上下文', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await reader.count(), 0);
  assert.equal(await open.evaluate(el => document.activeElement === el), true, 'Escape returns focus to the document trigger');
  assert.equal(await panel.locator(':scope > *').evaluateAll(elements => elements.every(el => !el.inert)), true);
  assert.deepEqual(errors, []);
});

test('background model segments fit 320px settings and remain keyboard operable', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await dialog.getByRole('button', { name: '模型与身份', exact: true }).click();
  const segments = dialog.getByRole('group', { name: '后台模型配置方式', exact: true });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const bounds = await segments.evaluate(el => {
      const group = el.getBoundingClientRect(), body = el.closest('.cx-body'), viewport = body.getBoundingClientRect(), padding = parseFloat(getComputedStyle(body).paddingRight);
      return { right: viewport.right - padding, groupRight: group.right, buttons: [...el.querySelectorAll('button')].map(button => { const box = button.getBoundingClientRect(); return { left: box.left, right: box.right, width: button.clientWidth, textWidth: button.scrollWidth }; }) };
    });
    assert.ok(bounds.groupRight <= bounds.right + 1, JSON.stringify(bounds));
    assert.ok(bounds.buttons.every(button => button.left >= 0 && button.right + 3 <= bounds.right + 1 && button.textWidth <= button.width), 'buttons and focus outlines fit the settings content: ' + JSON.stringify(bounds));
  }
  await segments.getByRole('button', { name: '跟随主模型', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await segments.getByRole('button', { name: '统一配置', exact: true }).evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const separate = segments.getByRole('button', { name: '分别配置', exact: true });
  assert.equal(await separate.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Enter');
  assert.equal(await separate.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});

test('global background conflicts can be resolved without losing either window content', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  const url = new URL('/trisoul-x/api/context/global', page.url()).href;
  const read = async () => (await page.request.get(url)).json();
  const remote = async text => {
    const previous = await read();
    const response = await page.request.post(url, { data: { text, revision: previous.revision } });
    assert.equal(response.ok(), true); return response.json();
  };
  await remote('original');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await dialog.getByRole('button', { name: '全局背景', exact: true }).click();
  const draft = dialog.getByRole('textbox', { name: '全局固定背景', exact: true });
  await until(() => draft.isEnabled()); await draft.fill('local draft');
  await remote('remote draft');
  const save = dialog.getByRole('button', { name: '保存全局背景', exact: true });
  await save.click(); await dialog.getByRole('alert').filter({ hasText: '其他窗口' }).waitFor();
  assert.equal(await draft.inputValue(), 'local draft');
  const reload = dialog.getByRole('button', { name: '读取最新版本', exact: true });
  assert.equal(await reload.count(), 1, 'a conflict must have a recovery path without closing the editor');
  await page.route('**/trisoul-x/api/context/global', route => route.fulfill({ status: 503, json: { error: '最新版本暂时无法读取' } }));
  await reload.click(); await dialog.getByRole('alert').filter({ hasText: '最新版本暂时无法读取' }).waitFor();
  assert.equal(await draft.inputValue(), 'local draft');
  await page.unroute('**/trisoul-x/api/context/global');
  await reload.click();
  const latest = dialog.getByRole('textbox', { name: '其他窗口保存的内容', exact: true });
  await until(async () => await latest.inputValue() === 'remote draft');
  assert.equal(await draft.inputValue(), 'local draft');
  assert.equal(await save.isDisabled(), true, 'reading a remote version must not silently authorize overwriting it');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 900 });
    await latest.scrollIntoViewIfNeeded();
    const box = await latest.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390);
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
      await dialog.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'global-conflict-' + colorScheme + '.png') });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: '保留草稿，继续编辑', exact: true }).click();
  await draft.fill('remote draft\nlocal draft'); await save.click();
  await dialog.getByText('全局背景已保存', { exact: true }).waitFor();
  assert.equal((await read()).text, 'remote draft\nlocal draft');

  await draft.fill('second local draft'); await remote('second remote draft'); await save.click();
  await reload.click(); await until(async () => await latest.inputValue() === 'second remote draft');
  await remote('third remote draft');
  await dialog.getByRole('button', { name: '保留草稿，继续编辑', exact: true }).click();
  await save.click(); await dialog.getByRole('alert').filter({ hasText: '其他窗口' }).waitFor();
  assert.equal((await read()).text, 'third remote draft', 'a second conflict still protects the newest revision');
  assert.equal(await draft.inputValue(), 'second local draft');
  await reload.click(); await until(async () => await latest.inputValue() === 'third remote draft');
  await dialog.getByRole('button', { name: '使用最新内容', exact: true }).click();
  assert.equal(await draft.inputValue(), 'third remote draft');
  assert.equal(await save.isDisabled(), true);
  assert.deepEqual(errors, []);
});

test('component path save preserves edits typed while the request is pending and sends only edited fields', { timeout: 60000 }, async t => {
  let release, submitted;
  t.after(() => release?.());
  const { page, errors } = await frontendFixture(t);
  await page.route('**/trisoul-x/components', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted = route.request().postDataJSON();
    const response = await route.fetch();
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await dialog.getByRole('button', { name: '基础组件', exact: true }).click();
  await dialog.getByText('高级配置', { exact: true }).click();
  const path = dialog.getByRole('textbox', { name: '浏览器程序路径', exact: true });
  const save = dialog.getByRole('button', { name: '保存自定义路径', exact: true });
  await path.fill('/fixture/first'); await save.click(); await until(() => release);
  await path.fill('/fixture/second'); release();
  await dialog.getByText(/路径已保存/).waitFor();
  assert.equal(await path.inputValue(), '/fixture/second', 'the response must not replace newer edits');
  assert.equal(await save.isEnabled(), true);
  assert.deepEqual(submitted.patch, { computerUseBrowserExecutable: '/fixture/first' });
  await page.unroute('**/trisoul-x/components');
  await save.click(); await until(() => save.isDisabled());
  await dialog.getByText('路径已保存，重启服务后生效。', { exact: true }).waitFor();
  const data = await (await page.request.get(new URL('/trisoul-x/components', page.url()).href)).json();
  assert.equal(data.computerUse.paths.computerUseBrowserExecutable, '/fixture/second');
  assert.deepEqual(errors, []);
});
