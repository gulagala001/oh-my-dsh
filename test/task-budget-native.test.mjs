import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('native host consumes Chinese budget command without a model call and refreshes beyond the limit', { timeout: 60000 }, async t => {
  const requests = [];
  const f = await frontendFixture(t, { headless: true, omdConfig: { budgetHintsEnabled: true, contextEnabled: false }, reply: payload => {
    requests.push(payload);
    return { delta: { role: 'assistant', content: 'Ready.' }, finish_reason: 'stop' };
  } });
  const q = '?session=' + f.sessionId;
  await until(async () => (await f.api('/state' + q)).running === 'idle');
  assert.match(JSON.stringify(requests[0].messages), /预算：无限制/);
  const before = requests.length;
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '/预算 轮次=1 时间=1m' }] });
  const saved = () => readFile(join(f.home, 'trisoul-x', 'sessions', f.sessionId + '.json'), 'utf8').then(JSON.parse);
  await until(async () => (await saved()).budget?.limits.rounds === 1);
  await until(async () => (await f.api('/state' + q)).running === 'idle');
  assert.equal(requests.length, before);
  let step = 0;
  f.replyWith(payload => {
    requests.push(payload);
    if (step++ < 2) return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'budget-' + step, type: 'function', function: { name: 'runtime_status', arguments: '{}' } }] }, finish_reason: 'tool_calls' };
    return { delta: { role: 'assistant', content: 'Done.' }, finish_reason: 'stop' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Read the status twice.' }] });
  await until(async () => step === 3 && (await f.api('/state' + q)).running === 'idle');
  assert.match(JSON.stringify(requests.at(-1).messages), /模型轮次：2 \/ 1（200%）/);
  assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /软限制|\/预算/);
  const command = await f.call('commands/execute', { agentId: f.sessionId, line: '/budget 重置', submittedAttachments: [] });
  assert.equal(command.result.ok, true, JSON.stringify(command));
  assert.equal((await saved()).budget.rounds, 0);
  await f.api('/settings', { budgetHintsEnabled: false });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Finish.' }] });
  await until(async () => step === 4 && (await f.api('/state' + q)).running === 'idle');
  // Prior runtime_status tool results remain historical evidence; automatic
  // budget carriers disappear when the setting is switched off.
  assert.ok(!requests.at(-1).messages.some(m => m.role === 'user' && typeof m.content === 'string' && /^预算/m.test(m.content)));
});
