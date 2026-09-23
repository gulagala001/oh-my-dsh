import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('installed package history honors 200/50/500, reload and plugin removal', { timeout: 150000 }, async t => {
  const { page, errors } = await frontendFixture(t, { installedPackage: true, historyMessages: 550, omdConfig: { automaticReplace: false, digestEvery: 99999 } });
  const messages = page.getByText(/^历史(?:样本|回答) \d+$/), count = () => messages.count();
  await until(async () => await count() > 100).catch(async error => { throw Error(error.message + ' errors=' + JSON.stringify(errors) + ' loaded=' + await count() + ' text=' + (await page.locator('[data-chat-flow]').innerText()).slice(0, 300)); });
  const initial = await count(); assert.ok(initial >= 190 && initial <= 200, 'default history includes 200 messages, got ' + initial);
  const settings = async value => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    const select = page.getByLabel('每次加载历史', { exact: true });
    assert.deepEqual(await select.locator('option').evaluateAll(els => els.map(el => el.value)), ['50', '200', '500']);
    if (value) await select.selectOption(value);
    const selected = await select.inputValue(); await page.keyboard.press('Escape'); return selected;
  };
  assert.equal(await settings(), '200');
  for (const size of [200, 50, 500]) {
    await settings(String(size));
    const before = await count();
    const load = page.getByRole('button', { name: '加载更早', exact: true });
    await load.click(); await until(async () => await count() === before + size);
    assert.equal(await count(), before + size, 'one click loads exactly ' + size + ' earlier messages');
  }
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  await until(async () => await count() >= 490).catch(async e => { throw Error(e.message + ' reload count=' + await count() + ' size=' + await page.evaluate(() => localStorage.getItem('omd.historyPageSize.v1'))); });
  assert.ok(await count() <= 500); assert.equal(await settings(), '500');
  // Invalid saved values recover to the bounded default.
  await page.evaluate(() => localStorage.setItem('omd.historyPageSize.v1', '999999'));
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  await until(async () => await count() >= 190);
  assert.ok(await count() <= 200); assert.equal(await settings(), '200');
  const setPlugin = async enabled => {
    const method = 'pluginManager/setBundleEnabled';
    const response = await page.request.post(new URL('/api/' + method, page.url()).href, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { name: 'trisoul_x', enabled } } } });
    const value = await response.json(); assert.equal(value.result?.ok, true, JSON.stringify(value));
    assert.equal(value.result.value.application, 'applied');
  };
  await Promise.all([page.waitForEvent('load'), setPlugin(false)]);
  await until(async () => await count() >= 40).catch(async error => { throw Error(error.message + ' after removal: ' + (await page.locator('body').innerText()).slice(0, 2000) + ' errors=' + JSON.stringify(errors)); });
  assert.ok(await count() <= 50, 'unloaded plugin restores the original host page size');
  await Promise.all([page.waitForEvent('load'), setPlugin(true)]);
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await until(async () => await count() >= 190);
  assert.ok(await count() <= 200);
  assert.deepEqual(errors, []);
});
