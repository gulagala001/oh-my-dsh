import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('native slash commands and sidebar execute both compression modes without losing the live system prompt', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page, sessionId } = f;
  const base = new URL(page.url()).origin, q = '?session=' + sessionId, calls = [];
  const api = async (path, body) => {
    const response = body === undefined ? await page.request.get(base + '/trisoul-x/api' + path) : await page.request.post(base + '/trisoul-x/api' + path, { data: body });
    const result = await response.json(); assert.ok(response.ok(), JSON.stringify(result)); return result;
  };
  const command = async line => {
    const method = 'commands/execute';
    const response = await page.request.post(base + '/api/' + method, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { agentId: sessionId, line, submittedAttachments: [] } } } });
    const result = await response.json(); assert.equal(result.result?.ok, true, JSON.stringify(result)); return result.result.value;
  };
  let queuedReadPending = false;
  const tool = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'compact-fixture-' + calls.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
  f.replyWith(payload => {
    calls.push(payload);
    if (payload.tools.some(t => t.function.name === 'prepare_segment')) return tool('prepare_segment', { summary: '已整理工作台。', documents: [{ title: '实现细节', text: 'ARCHIVED_DETAIL_ONLY_123' }] });
    if (payload.tools.some(t => t.function.name === 'submit_context_choices')) return tool('submit_context_choices', { choices: [] });
    if (payload.tools.some(t => t.function.name === 'compact_conversation')) return tool('compact_conversation', { summary: '用户要求整理工作台和对话界面；已梳理任务与侧栏，后续完善电脑操控预览。' });
    if (queuedReadPending) { queuedReadPending = false; return tool('read', { file_path: 'missing-compact-fixture.txt' }); }
    return { delta: { role: 'assistant', content: 'NEXT_MAIN_AFTER_COMPACTION\n' + '新的工作记录。'.repeat(150) }, finish_reason: 'stop' };
  });
  await api('/settings', { preprocessBoundaries: true, prepareBatchWindows: 1, keepTailEvents: 2, automaticReplace: false, digestEvery: 9999, traceEnabled: false });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '继续记录进展，保留上下文测试材料。' }] });
  await until(async () => (await api('/state' + q)).running === 'idle');
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '再记录一轮详细进展用于压缩。' }] });
  await until(async () => (await api('/state' + q)).running === 'idle');
  await api('/context/prepare' + q, {});
  await until(async () => (await api('/context' + q)).records.length > 0 && !(await api('/context' + q)).preparing);
  await api('/context/prepare' + q, {});
  // Let the automatic review finish before measuring the command's own calls.
  await until(async () => { const s = await api('/context' + q); return s.records.length > 1 && !s.preparing && !s.coordinating && Boolean(s.review.lastAt) && !s.failures.coordinate; });
  const before = calls.length;
  const p = await command('/compact-p');
  assert.match(JSON.stringify(p), /success/); assert.match(JSON.stringify(p), /仅摘要/);
  assert.equal(calls.length, before, '/compact-p is handled by the host, not sent to the model');
  assert.ok((await api('/context' + q)).records.every(r => r.mode === 'brief'));
  const invalid = await command('/compact-f unexpected'); assert.match(JSON.stringify(invalid), /不接受参数/);
  assert.equal(calls.length, before);
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '上下文', exact: true }).click();
  await page.locator('.cx-context').getByRole('heading', { name: '工作上下文', exact: true }).waitFor();
  const panel = page.locator('.cx-context');
  await panel.getByRole('button', { name: '已处理片段仅摘要', exact: true }).waitFor();
  await panel.getByText('/compact-p', { exact: true }).waitFor();
  await panel.getByText('/compact-f', { exact: true }).waitFor();
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '补充新的工作记录，继续保持中文。' }] });
  await until(async () => (await api('/state' + q)).running === 'idle');
  await panel.getByRole('button', { name: '全量压缩', exact: true }).click();
  await panel.getByText(/已全量压缩为一份摘要/).waitFor();
  const state = await api('/context' + q), active = state.records.filter(r => !r.mergedInto);
  assert.equal(active.length, 1); assert.equal(active[0].kind, 'full'); assert.ok(active[0].documentCount > 0, 'verbatim user text is archived, not injected');
  assert.equal(state.trace, null); assert.equal(state.manualOperation, null);
  const count = calls.length;
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '压缩后继续执行。' }] });
  await until(() => calls.length > count);
  const next = calls.at(-1);
  assert.ok(next.messages.some(m => m.role === 'system'));
  assert.match(JSON.stringify(next.messages), /后续完善电脑操控预览/);
  assert.doesNotMatch(JSON.stringify(next.messages), /ARCHIVED_DETAIL_ONLY_123|新的工作记录。新的工作记录。/);
  await until(async () => (await api('/state' + q)).running === 'idle');
  const full = await command('/compact-f'); assert.match(JSON.stringify(full), /已全量压缩/);
  queuedReadPending = true;
  const release = f.holdNextReply();
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '读取测试目录中的缺失文件，再继续。' }] });
  await until(async () => (await api('/state' + q)).running === 'running');
  const queued = await command('/compact-f'); assert.match(JSON.stringify(queued), /已排队/);
  release();
  await until(async () => (await api('/state' + q)).running === 'idle' && !(await api('/context' + q)).manualQueued);
  const afterQueue = await api('/context' + q);
  assert.equal(afterQueue.lastReplacement.source, 'compact-f');
  assert.equal(afterQueue.transactionPending, false); assert.ok(!afterQueue.failures.compactFull);
  const animationsFinished = () => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || !a.pending && a.playState !== 'running');
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.screenshot({ path: join(f.root, 'compact-sidebar-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(animationsFinished, undefined, { timeout: 5000 });
    await page.screenshot({ path: join(f.root, 'compact-sidebar-dark.png') });
    console.log('Compact UI artifacts:', f.root);
  }
  assert.deepEqual(f.errors, []);
});
