import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { promptText } from '../src/cc-adaptation/texts.mjs';

test('CFR settings UI saves and changes the next request in the same live session', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page, sessionId } = f;
  const origin = new URL(page.url()).origin, requests = [];
  const extra = promptText('tools/todo-constraints.md');
  f.replyWith(payload => {
    if (payload.tools?.some(t => t.function.name === 'todo_write')) requests.push(payload);
    return { delta: { role: 'assistant', content: 'CFR fixture complete.' }, finish_reason: 'stop' };
  });
  const state = async () => (await page.request.get(origin + '/trisoul-x/api/state?session=' + sessionId)).json();
  const request = async enabled => {
    await until(async () => (await state()).running === 'idle');
    const count = requests.length;
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '回复收到即可。' }] });
    await until(async () => requests.length > count && (await state()).running === 'idle').catch(error => {
      throw new Error(error.message + '\n' + f.log());
    });
    const description = requests.at(-1).tools.find(t => t.function.name === 'todo_write').function.description;
    assert.equal(description.includes(extra), enabled);
    const system = requests.at(-1).messages.filter(m => m.role === 'system').at(-1);
    assert.ok(system, 'the request includes a system prompt');
    assert.equal(JSON.stringify(system.content).includes(extra), enabled, 'system and todo guidance follow the same switch');
  };
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Oh My DSH', exact: true }).click();
    await page.getByRole('button', { name: '实验性功能', exact: true }).click();
    await page.getByRole('switch', { name: '任务约束前置（CFR）', exact: true }).waitFor();
  };
  await request(false);
  await openSettings();
  const toggle = page.getByRole('switch', { name: '任务约束前置（CFR）', exact: true });
  const trace = page.getByRole('switch', { name: '启用 CoT 前置', exact: true });
  assert.equal(await trace.isChecked(), true);
  assert.equal(await toggle.isChecked(), false);
  for (const enabled of [true, false]) {
    await toggle.setChecked(enabled);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await until(async () => !(await page.getByRole('button', { name: '保存设置', exact: true }).isEnabled()));
    assert.equal((await state()).config.todoConstraintFirst, enabled);
    await request(enabled);
    await page.keyboard.press('Escape');
    await openSettings();
    assert.equal(await toggle.isChecked(), enabled);
    assert.equal(await trace.isChecked(), true);
  }
  await toggle.scrollIntoViewIfNeeded();
  assert.deepEqual(f.errors, []);
});
