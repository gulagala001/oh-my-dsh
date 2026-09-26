import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('recommended page defaults on, hides only after a successful save and persists', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const readConfig = () => page.evaluate(async () => (await fetch('trisoul-x/api/settings')).json());
  const dialog = page.getByRole('dialog', { name: '设置' });
  const entry = dialog.getByRole('button', { name: '推荐插件', exact: true });
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
    await dialog.getByRole('switch', { name: '显示推荐插件页面' }).waitFor();
  };
  await open();
  const toggle = dialog.getByRole('switch', { name: '显示推荐插件页面' });
  const save = dialog.getByRole('button', { name: '保存设置', exact: true });
  assert.equal(await toggle.isChecked(), true);
  assert.equal(await entry.count(), 1);
  const before = await readConfig();
  await toggle.uncheck();
  assert.equal(await entry.count(), 1, 'unsaved edits do not hide the page');
  await page.route('**/trisoul-x/api/settings', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { error: 'save failed fixture' } }) : route.continue());
  await save.click();
  await dialog.getByRole('alert').filter({ hasText: 'save failed fixture' }).waitFor();
  assert.equal(await entry.count(), 1, 'failed save leaves the page available');
  await page.unroute('**/trisoul-x/api/settings');
  await save.click();
  await until(async () => await entry.count() === 0);
  assert.equal((await readConfig()).recommendedPluginsAutoUpdate, before.recommendedPluginsAutoUpdate);
  await page.reload();
  await open();
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await entry.count(), 0, 'hidden preference survives a fresh client load');
  await toggle.check(); await save.click();
  await until(async () => await entry.count() === 1);
  await entry.click();
  await dialog.getByRole('heading', { name: '推荐插件', exact: true }).waitFor();
  assert.equal(await dialog.locator('.tx-recommended-card').count() > 0, true);
  assert.equal((await readConfig()).recommendedPluginsPageEnabled, true);
  assert.deepEqual(f.errors, []);
});

test('failed recommendation settings stay visible across polling and can be retried', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let fail = true, reads = 0;
  await page.route('**/trisoul-x/recommended-plugins', route => {
    if (route.request().method() === 'POST' && fail) return route.fulfill({ status: 500, json: { error: '无法保存自动更新设置，请重试' } });
    if (route.request().method() === 'GET') reads++;
    return route.continue();
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: '推荐插件', exact: true }).click();
  const toggle = dialog.getByRole('switch', { name: '自动更新推荐插件' });
  await until(() => toggle.isEnabled());
  await toggle.click();
  const error = dialog.getByRole('alert').filter({ hasText: '无法保存自动更新设置' });
  const previousReads = reads;
  await until(() => reads >= previousReads + 2);
  assert.equal(await error.isVisible(), true, 'successful status reads do not erase a failed write');
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await toggle.isEnabled(), true, 'a failed write must allow retry');
  fail = false;
  await toggle.click();
  await until(() => toggle.isChecked());
  assert.equal(await error.count(), 0);
  assert.deepEqual(f.errors, []);
});
