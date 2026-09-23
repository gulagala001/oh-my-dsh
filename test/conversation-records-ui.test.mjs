import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('delivered todo/state and grouped compaction remain expandable across replay and themes', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { omdConfig: { stateHintsEnabled: true } }), { page, sessionId } = f;
  const openRecordGroups=async()=>{
    for(let pass=0;pass<6;pass++){
      const toggles=page.locator(':is([data-turn-process], .tx-cu-group-toggle)[aria-expanded=false]:visible');
      if(!await toggles.count())break;
      for(const toggle of await toggles.all())if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
    }
  };
  const base = new URL(page.url()).origin, q = '?session=' + sessionId;
  const api = async (path, body) => {
    const r = body === undefined ? await page.request.get(base + '/trisoul-x/api' + path) : await page.request.post(base + '/trisoul-x/api' + path, { data: body });
    assert.ok(r.ok(), await r.text()); return r.json();
  };
  await api('/better-todo' + q, { todo: false, verification: false });
  await api('/settings', { stateHintsEnabled: true, automaticReplace: false, coordinatorEvery: 999, digestEvery: 9999, preprocessBoundaries: true, prepareBatchWindows: 1, keepTailEvents: 2, traceEnabled: true });
  let wroteTodo = false, prepared = 0, calls = 0; const mainRequests = [];
  const tool = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'record-fixture-' + ++calls, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
  f.replyWith(payload => {
    const has = name => payload.tools.some(t => t.function.name === name);
    if (has('prepare_segment')) return tool('prepare_segment', { summary: `第 ${++prepared} 段真实摘要`, documents: [{ title: '资料', text: '详细工作资料'.repeat(20) }] });
    if (has('submit_context_choices')) return tool('submit_context_choices', { choices: [] });
    if (has('compact_conversation')) return tool('compact_conversation', { summary: '全量摘要：继续完善对话区。' });
    mainRequests.push(payload);
    if (!wroteTodo) {
      wroteTodo = true;
      return tool('todo_write', { op: 'excerpt', from: '整理工作台和对话界面', to: '整理工作台和对话界面', tasks: [{ title: '展示实际注入内容', anchor: { from: '整理工作台和对话界面', to: '整理工作台和对话界面' } }] });
    }
    return { delta: { role: 'assistant', reasoning_content: `第 ${mainRequests.length} 次检查记录展示。`, content: '记录完整实现细节。'.repeat(170) }, finish_reason: 'stop' };
  });
  const prompt = async text => {
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] });
    await until(async () => (await api('/state' + q)).running === 'idle');
  };
  await prompt('记录第一段工作。');
  await prompt('记录第二段工作。');
  assert.equal(await page.locator('[data-omd-record=injection]:visible').count(),0,'task context starts inside a collapsed drawer');
  await openRecordGroups();
  const injection = page.locator('[data-omd-record=injection]').last();
  await injection.getByRole('button', { name: /Todo 与运行状态/ }).waitFor();
  assert.equal(await injection.getByRole('button').getAttribute('aria-expanded'), 'false');
  await openRecordGroups();
  await injection.getByRole('button').click();
  const delivered = await injection.locator('pre').textContent();
  assert.match(delivered, /\[todo list\]/); assert.match(delivered, /展示实际注入内容/); assert.match(delivered, /\[runtime state · as of /);
  assert.ok(mainRequests.some(p => p.messages.some(m => (typeof m.content === 'string' ? m.content : (m.content || []).map(b => b.text || '').join('\n')).includes(delivered))), 'the row body is actually delivered model input');
  for (let count = 1; count <= 2; count++) {
    await api('/context/prepare' + q, {});
    await until(async () => { const s = await api('/context' + q); return s.records.length >= count && !s.preparing; });
  }
  const before = (await api('/context' + q)).records.filter(r => r.live && r.mode !== 'brief').length;
  assert.ok(before >= 2, 'fixture must exercise multiple segments');
  const compact = await api('/compact' + q, { mode: 'detail' }); assert.equal(compact.changed, true);
  const records = page.locator('[data-omd-record=compaction]');
  await until(async () => await records.count() === 1);
  const record = records.first();
  assert.equal(await record.locator('xpath=ancestor::*[@data-cu-process-node]').count(),0,'compression remains outside operation drawers');
  assert.match(await record.getByRole('button').textContent(), new RegExp(before + ' 段'));
  assert.equal(await record.getByRole('button').getAttribute('aria-expanded'), 'false');
  const box = await record.boundingBox(); assert.ok(box.height <= 32, 'folded batch is one compact row');
  await record.getByRole('button').click();
  assert.equal(await record.locator('details').count(), before);
  await record.locator('summary').first().click();
  assert.match(await record.locator('pre').first().textContent(), /真实摘要/);
  await openRecordGroups();
  await injection.getByRole('button').click();
  assert.match(await injection.locator('pre').textContent(), /展示实际注入内容/, 'replacement-carried todo is still visible');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 760, height: 900 });
    assert.equal(await record.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await record.scrollIntoViewIfNeeded();
    if (process.env.TRISOUL_UI_ARTIFACTS) await record.screenshot({ path: join(f.root, `conversation-records-${colorScheme}.png`) });
  }
  await page.reload(); await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await until(async () => await records.count() === 1);
  assert.equal(await record.getByRole('button').getAttribute('aria-expanded'), 'false');
  await record.getByRole('button').click(); assert.equal(await record.locator('details').count(), before);
  await openRecordGroups();
  await injection.getByRole('button').click(); assert.match(await injection.locator('pre').textContent(), /展示实际注入内容/);
  await prompt('继续检查带 Todo 的前置推理替换。');
  await openRecordGroups();
  const injectionCount = await page.locator('[data-omd-record=injection]').count();
  const ids = (await api('/context' + q)).records.filter(r => r.live && r.mode !== 'brief').map(r => r.id);
  const secondCompact = await api('/compact' + q, { mode: 'brief', ids });
  assert.equal(secondCompact.changed, true, JSON.stringify(secondCompact));
  await until(async () => await records.count() === 2);
  await openRecordGroups();
  assert.equal(await page.locator('[data-omd-record=injection]').count(), injectionCount + 1, 'compaction adds one refreshed injection, not both intermediate and final carriers');
  await openRecordGroups();
  await injection.getByRole('button').click(); assert.match(await injection.locator('pre').textContent(), /展示实际注入内容/);
  await page.reload(); await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await until(async () => await records.count() === 2);
  await openRecordGroups();
  assert.equal(await page.locator('[data-omd-record=injection]').count(), injectionCount + 1, 'replay keeps the same deduplicated records');
  // A later full compaction is a new record, even without an intervening user message.
  await api('/compact-f' + q, {});
  await until(async () => await records.count() === 3);
  await prompt('补充第三次压缩的原始内容。');
  const response = await page.request.post(base + '/api/commands/execute', { data: { type: 'client-request', rpcId: crypto.randomUUID(), method: 'commands/execute', payload: { args: { agentId: sessionId, line: '/compact-f', submittedAttachments: [] } } } });
  const commandResponse = await response.json();
  assert.equal(commandResponse.result?.ok, true, JSON.stringify(commandResponse));
  assert.equal(commandResponse.result.value.result.kind, 'success', JSON.stringify(commandResponse));
  await until(async () => await records.count() === 4).catch(async error => { throw Error(error.message + '\n' + JSON.stringify({ errors: f.errors, records: await records.allTextContents(), commands: await page.locator('[data-chat-flow-kind=command]').allTextContents(), response: commandResponse })); });
  await records.last().getByRole('button').click();
  await records.last().locator('summary').click();
  assert.match(await records.last().locator('pre').textContent(), /全量摘要/);
  assert.deepEqual(f.errors, []);
});
