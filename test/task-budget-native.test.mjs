import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('native host budget cadence defaults to original nodes and adds budget-only updates when enabled', { timeout: 60000 }, async t => {
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
  await f.api('/settings', { stateHintsEnabled: true });
  f.replyWith(payload => {
    requests.push(payload);
    if (step++ < 3) return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'budget-' + requests.length, type: 'function', function: { name: 'runtime_status', arguments: '{}' } }] }, finish_reason: 'tool_calls' };
    return { delta: { role: 'assistant', content: 'Done.' }, finish_reason: 'stop' };
  });
  const automatic = payload => payload.messages.filter(m => m.role === 'user' && typeof m.content === 'string' && /^(?:预算|\[runtime state)/m.test(m.content)).map(m => m.content);
  const run = async () => {
    step = 0; const start = requests.length;
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Read the status three times.' }] });
    await until(async () => step === 4 && (await f.api('/state' + q)).running === 'idle');
    return requests.slice(start);
  };
  const ordinary = await run();
  assert.deepEqual(automatic(ordinary.at(-1)), automatic(ordinary[0]));
  for (const interval of [1, 3]) {
    await f.api('/settings', { budgetEveryStep: true, budgetInjectionEvery: interval });
    const sampled = await run(), added = automatic(sampled.at(-1)).slice(automatic(sampled[0]).length);
    assert.equal(added.length, interval === 1 ? 3 : 1);
    for (const text of added) { assert.match(text, /^预算\n/); assert.doesNotMatch(text, /runtime state|todo list|Jobs:|Retained context/); }
  }
  await f.api('/settings', { budgetEveryStep: false });
  const disabled = await run();
  assert.deepEqual(automatic(disabled.at(-1)), automatic(disabled[0]));
  assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /软限制|\/预算/);
  const command = await f.call('commands/execute', { agentId: f.sessionId, line: '/budget 重置', submittedAttachments: [] });
  assert.equal(command.result.ok, true, JSON.stringify(command));
  assert.equal((await saved()).budget.rounds, 0);
  await f.api('/settings', { budgetHintsEnabled: false });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Finish.' }] });
  await until(async () => step === 5 && (await f.api('/state' + q)).running === 'idle');
  // Prior runtime_status tool results remain historical evidence; automatic
  // budget carriers disappear when the setting is switched off.
  assert.ok(!requests.at(-1).messages.some(m => m.role === 'user' && typeof m.content === 'string' && /^预算/m.test(m.content)));
});
