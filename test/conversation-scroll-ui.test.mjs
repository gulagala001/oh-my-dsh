import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('operation details stay inside the drawer without extending the conversation scroll range', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page, rpc, sessionId } = f;
  await page.setViewportSize({ width: 1440, height: 900 });
  let step = 0, finish;
  const pending = new Promise(resolve => { finish = resolve; }); t.after(finish);
  f.replyWith(async () => {
    if (++step <= 24) return { delta: { role: 'assistant', reasoning_content: `第 ${step} 项布局检查。`, ...(step === 1 ? { content: '正在检查操作记录的布局。' } : {}), tool_calls: [{ index: 0, id: 'scroll-command-' + step, type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: step === 1 ? Array.from({ length: 60 }, () => '# 多行命令详情').join('\n') + '\nprintf layout' : 'printf layout', description: `检查布局 ${step}` }) } }] }, finish_reason: 'tool_calls' };
    await pending;
    return { delta: { role: 'assistant', content: '检查完成。' }, finish_reason: 'stop' };
  });
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '检查操作详情的空白' }] });
  await until(() => step === 25);
  const scroll = page.locator('[data-conversation-scroll]');
  const group = page.locator('[data-cu-group] > button').filter({ hasText: '24 次操作' });
  await group.click();
  const list = page.locator('.tx-cu-group-list:visible').filter({ has: page.locator('[data-cu-operation="scroll-command-1"]') });
  const detail = list.locator('.CY-8Ka_root').first();
  const rangeBefore = await scroll.evaluate(el => el.scrollHeight);
  await detail.click();
  assert.equal(await detail.getAttribute('aria-expanded'), 'true');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rangeAfter = await scroll.evaluate(el => el.scrollHeight);
  assert.ok(rangeAfter <= rangeBefore + 1, `opening a detail must only grow the drawer's internal range: ${rangeBefore} -> ${rangeAfter}`);
  await scroll.evaluate(el => { el.scrollTop = 0; });
  await page.getByRole('button', { name: '回到底部', exact: true }).click();
  const metrics = await scroll.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, scroll: el.scrollHeight, flowBottom: el.querySelector('[data-chat-flow]').getBoundingClientRect().bottom, seatTop: el.querySelector('[data-composer-seat]').getBoundingClientRect().top }));
  assert.ok(metrics.top < 1 || metrics.flowBottom >= metrics.seatTop - 32, 'back to bottom lands on content: ' + JSON.stringify(metrics));
  await group.click(); await group.click();
  assert.equal(await detail.getAttribute('aria-expanded'), 'true', 'the inspected detail survives folding its drawer');
  assert.deepEqual(f.errors, []);
});
