import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('steering and in-turn compaction keep subsequent operations visible', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { chatConfig: { transcriptView: 'standard' }, omdConfig: { stateHintsEnabled: true } });
  const { page, rpc, sessionId } = f;
  const base = new URL(page.url()).origin, q = '?session=' + sessionId;
  const api = async (path, body) => {
    const response = body === undefined ? await page.request.get(base + '/trisoul-x/api' + path)
      : await page.request.post(base + '/trisoul-x/api' + path, { data: body });
    assert.ok(response.ok(), await response.text());
    return response.json();
  };
  await api('/settings', { automaticReplace: false, coordinatorEvery: 999, digestEvery: 9999,
    preprocessBoundaries: true, prepareBatchWindows: 1, keepTailEvents: 2 });
  const shell = process.platform === 'win32' ? 'pwsh' : 'bash';
  let step = 0, prepared = 0, resume, compact, finish;
  const beforeSteering = new Promise(resolve => { resume = resolve; });
  const beforeCompaction = new Promise(resolve => { compact = resolve; });
  const completion = new Promise(resolve => { finish = resolve; });
  t.after(() => { resume(); compact(); finish(); });
  f.replyWith(async payload => {
    if (payload.tools.some(tool => tool.function.name === 'prepare_segment')) return {
      delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'prepare-steering-' + ++prepared,
        type: 'function', function: { name: 'prepare_segment', arguments: JSON.stringify({
          summary: '插话前后操作的事实摘要 ' + prepared, documents: [{ title: '操作资料', text: '保留已执行的检查和用户原话。' }],
        }) } }] }, finish_reason: 'tool_calls',
    };
    step++;
    if (step === 2) await beforeSteering;
    if (step === 5) await beforeCompaction;
    if (step >= 7) {
      await completion;
      return { delta: { role: 'assistant', content: '插话后的检查已完成。' }, finish_reason: 'stop' };
    }
    if (step === 3) assert.ok(JSON.stringify(payload.messages).includes('请继续检查最新操作'), 'the model receives steering');
    return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'steering-operation-' + step,
      type: 'function', function: { name: shell, arguments: JSON.stringify({
        command: process.platform === 'win32'
          ? ([3, 6].includes(step) ? "Start-Sleep -Seconds 3; [Console]::Out.Write('after-steering')" : "[Console]::Out.Write('steering-check')")
          : ([3, 6].includes(step) ? 'sleep 3; printf after-steering' : 'printf steering-check'),
        description: step === 6 ? '上下文整理后的最新操作' : step === 3 ? '插话后的最新操作' : '检查操作记录',
      }) } }] }, finish_reason: 'tool_calls' };
  });
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '检查插话操作展示' }] });
  await until(() => step === 2);
  const input = page.locator('[contenteditable="true"]').first();
  await input.fill('请继续检查最新操作');
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/session/prompt'));
  await input.press('Control+Enter');
  const response = await submitted;
  assert.equal(response.request().postDataJSON().payload.args.request.mode, 'steer');
  resume();
  const steering = page.getByText('请继续检查最新操作', { exact: true });
  await steering.waitFor();
  const latest = page.locator('[data-cu-group] .tx-cu-group-toggle').filter({ hasText: '插话后的最新操作' });
  await latest.waitFor();
  assert.ok((await latest.boundingBox()).y > (await steering.boundingBox()).y, 'latest operation follows the steering message');
  await latest.click();
  await page.locator('[data-chat-call-id="steering-operation-3"]:visible').waitFor();
  await until(() => step === 5);
  for (let count = 1; count <= 2; count++) {
    await api('/context/prepare' + q, {});
    await until(async () => { const state = await api('/context' + q); return state.records.length >= count && !state.preparing; });
  }
  const result = await api('/compact' + q, { mode: 'detail' });
  assert.equal(result.queued, true, 'compaction is applied at the next step, while the turn remains active');
  compact();
  const newest = page.locator('[data-chat-call-id="steering-operation-6"]');
  await newest.waitFor({ state: 'attached' });
  const after = page.locator('[data-cu-group]').filter({ has: page.locator('[data-chat-call-id="steering-operation-3"]') });
  assert.ok(await after.locator('[data-omd-record-hidden]').count() > 0, 'the operation group contains duplicate compaction placeholders');
  assert.equal(await after.isVisible(), true, 'hiding duplicate records must not hide the operation group after steering');
  // RC exposes the row while arguments are still preparing. Its dispatched
  // description follows, with the same call identity and process group.
  await until(async () => /上下文整理后的最新操作/.test(await after.locator('.tx-cu-group-toggle').textContent()));
  assert.match(await after.locator('.tx-cu-group-toggle').textContent(), /上下文整理后的最新操作/);
  assert.equal(await newest.isVisible(), true);
  assert.equal(await after.locator('[data-chat-node-key]:has([data-omd-record-hidden]):visible').count(), 0, 'duplicate record rows remain hidden');
  await until(() => step >= 7);
  assert.match(await after.locator('.tx-cu-group-toggle').textContent(), /4 次操作/);
  finish();
  await page.getByText('插话后的检查已完成。', { exact: true }).waitFor();
  await page.reload();
  await after.locator('.tx-cu-group-toggle').waitFor();
  await after.locator('.tx-cu-group-toggle').click();
  assert.equal(await after.locator('[data-chat-call-id]:visible').count(), 4, 'all post-steering operations remain accessible after reload');
  assert.deepEqual(f.errors, []);
});
