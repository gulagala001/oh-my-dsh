import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('context action errors survive status polling and clear after a successful retry', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  let reads = 0, fail = true;
  page.on('response', response => { if (/\/trisoul-x\/api\/context\?/.test(response.url())) reads++; });
  await page.route('**/trisoul-x/api/compact?*', route => route.fulfill(fail
    ? { status: 500, json: { error: '本次应用失败，请重试' } }
    : { json: { changed: false, queued: false } }));
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '上下文', exact: true }).click();
  const panel = page.locator('.cx-context'), apply = panel.getByRole('button', { name: '应用已准备结果', exact: true });
  await apply.click();
  await panel.getByRole('alert').filter({ hasText: '本次应用失败' }).waitFor();
  const before = reads; await until(() => reads >= before + 2);
  assert.equal(await panel.getByRole('alert').filter({ hasText: '本次应用失败' }).isVisible(), true);
  fail = false; await apply.click();
  await panel.getByText('没有可应用的结果，原文保持不变。', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('alert').count(), 0);
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
