import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('native preset slots survive OMD mounting, selection and reload', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const header = page.locator('[data-slot="conversation.session.header.actions"]');
  const hero = page.locator('[data-slot="conversation.hero.agentPreset"]');
  const label = header.getByText('Oh My DSH', { exact: true });
  await label.waitFor();
  assert.equal(await label.evaluate(el => el.tagName), 'SPAN', 'a started session shows the native read-only label');
  assert.equal(await header.getByRole('button').count(), 0, 'started sessions cannot switch presets');

  const codingTools = async enabled => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('button', { name: '通用设置', exact: true }).click();
    const toggle = settings.getByRole('switch', { name: '代码工作工具', exact: true });
    if (await toggle.isChecked() !== enabled) await toggle.click();
    await until(async () => await toggle.isEnabled() && await toggle.isChecked() === enabled);
    await page.keyboard.press('Escape');
  };
  await codingTools(false);
  await label.waitFor();
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click();
  await hero.waitFor({ state: 'attached' });
  const picker = hero.getByRole('button');
  assert.equal(await picker.count(), 0, 'the native Coding Tools preference still hides selection');
  await codingTools(true);
  await picker.waitFor();
  assert.equal(await picker.count(), 1, 'one native picker, with no shim');
  assert.equal(await picker.innerText(), 'Oh My DSH');
  await picker.click();
  await page.getByRole('menuitem', { name: /^标准模式/ }).click();
  await until(async () => (await picker.innerText()) === '标准模式');
  await page.reload();
  await picker.waitFor();
  await until(async () => (await picker.innerText()) === '标准模式');

  const submitted = page.waitForRequest(request => request.url().includes('/api/session/prompt') && request.method() === 'POST');
  await page.getByRole('textbox', { name: /描述你想要构建的内容/ }).fill('预设槽位回归检查');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await submitted;
  await header.getByText('标准模式', { exact: true }).waitFor();
  assert.equal(await hero.count(), 0, 'first prompt replaces the picker with a read-only label');

  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await label.waitFor();
  await page.reload();
  await label.waitFor();
  assert.deepEqual(f.errors, []);
});


test('installed native preset slots recover after bundle disable and re-enable', { timeout: 120000 }, async t => {
  const { page, errors } = await frontendFixture(t, { installedPackage: true });
  const header = page.locator('[data-slot="conversation.session.header.actions"]');
  await header.getByText('Oh My DSH', { exact: true }).waitFor();
  for (const enabled of [false, true]) {
    const toggle = async () => {
      const method = 'pluginManager/setBundleEnabled';
      const response = await page.request.post(new URL('/api/' + method, page.url()).href, {
        data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { name: 'trisoul_x', enabled } } },
      });
      const value = await response.json();
      assert.equal(value.result?.ok, true, JSON.stringify(value));
      assert.equal(value.result.value.application, 'applied');
    };
    await Promise.all([page.waitForEvent('load'), toggle()]);
    const label = header.getByText(enabled ? 'Oh My DSH' : 'trisoul-x', { exact: true });
    await label.waitFor();
    assert.equal(await label.count(), 1, 'the native label is restored once, without duplicate occupants');
  }
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click();
  const picker = page.locator('[data-slot="conversation.hero.agentPreset"]').getByRole('button');
  await picker.waitFor();
  assert.equal(await picker.count(), 1);
  assert.equal(await picker.innerText(), 'Oh My DSH');
  assert.deepEqual(errors, []);
});
