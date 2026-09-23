import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskBudgets, parseBudgetInput, renderBudget } from '../src/task-budget.mjs';
import { runtimeContext } from '../src/runtime-state.mjs';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createTodoStore } from '../src/todolist.mjs';
import { setRuntimeContext, taskContextMeta, summaryMessageReader } from '../src/task-context.mjs';

function fixture() {
  let now = 0; const states = new Map(), config = { budgetHintsEnabled: true };
  const hub = { config: () => config, store: { state(id) { if (!states.has(id)) states.set(id, { id }); return states.get(id); }, save() {} },
    context: { state: () => ({ records: [] }) }, ctx: { get: () => null, tokenMeter: { measure: () => ({ totalTokens: 0 }) } } };
  const session = Session.create('main', undefined, { version: 4, id: 'main', createdAt: 0, cwd: '/tmp', isSeeded: false, agentPreset: 'trisoul-x' });
  const agent = { session, status: 'running' };
  hub.budgets = new TaskBudgets(hub, () => now);
  return { hub, agent, session, config, states, clock: value => { now = value; }, budgets: hub.budgets };
}

test('budget input supports independent limits and rejects ambiguous or invalid input', () => {
  assert.deepEqual(parseBudgetInput('token=100k 轮次=30 时间=20m').limits, { tokens: 100000, rounds: 30, timeMs: 1200000 });
  assert.deepEqual(parseBudgetInput('时间=1.5h token=无限制').limits, { timeMs: 5400000, tokens: null });
  for (const input of ['abc', 'token=0', 'token=-1', '轮次=1.5', '时间=20', 'token=1 token=2', 'token=1e99']) assert.throws(() => parseBudgetInput(input), /用法/);
});

test('budget accounting includes cache and child/background tokens, never doubles reasoning or resets on edits', () => {
  const f = fixture(), b = f.budgets;
  assert.equal(b.command(f.agent, ''), '预算：无限制');
  b.command(f.agent, 'token=100 轮次=1 时间=1m');
  b.record(f.session, 'main', { usage: { inputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 20, outputTokens: 40, reasoningTokens: 15 } });
  f.hub.store.state('child').parentSession = 'main';
  b.record({ id: 'child' }, 'subagent', { usage: { inputTokens: 20, outputTokens: 10 } });
  b.record(f.session, 'prepare', {});
  assert.equal(b.snapshot(f.session).tokens, 130);
  assert.equal(b.snapshot(f.session).rounds, 1);
  assert.equal(b.snapshot(f.session).unmetered, 1);
  assert.match(renderBudget(b.snapshot(f.session)), /130%/);
  assert.doesNotMatch(renderBudget(b.snapshot(f.session)), /软限制|停止/);
  b.command(f.agent, 'token=200'); assert.equal(b.snapshot(f.session).tokens, 130);
  b.command(f.agent, '重置'); assert.equal(b.snapshot(f.session).tokens, 0);
  assert.equal(b.snapshot(f.session).limits.tokens, 200);
  b.command(f.agent, '关闭'); assert.equal(renderBudget(b.snapshot(f.session)), '');
  b.command(f.agent, 'token=无限制'); assert.equal(renderBudget(b.snapshot(f.session)), '预算：无限制');
});

test('time excludes user waits, idle time and downtime after restart', async () => {
  const f = fixture(), b = f.budgets;
  b.command(f.agent, '时间=1m'); f.clock(1000);
  await b.waitForUser(f.agent, async () => { f.clock(21000); assert.equal(b.snapshot(f.session).elapsedMs, 1000); });
  f.clock(22000); b.tick(f.session, false);
  f.clock(90000); assert.equal(b.snapshot(f.session).elapsedMs, 2000);
  const restarted = new TaskBudgets(f.hub, () => 90000);
  assert.equal(restarted.snapshot(f.session).elapsedMs, 2000);
});

test('default cadence ignores consumption and steps but notices explicit budget resets', () => {
  const f = fixture();
  assert.equal(runtimeContext(f.agent, f.hub).text, '预算：无限制');
  f.budgets.command(f.agent, '轮次=3');
  const first = runtimeContext(f.agent, f.hub, { turn: 1, step: 1, now: 0 });
  const next = runtimeContext(f.agent, f.hub, { turn: 1, step: 2, now: 1000 });
  assert.equal(first.key, next.key);
  f.budgets.record(f.session, 'main', { usage: { inputTokens: 50, outputTokens: 20 } });
  assert.equal(first.key, runtimeContext(f.agent, f.hub, { turn: 2, step: 9, now: 2000 }).key);
  f.budgets.command(f.agent, '重置');
  assert.notEqual(first.key, runtimeContext(f.agent, f.hub, { turn: 1, step: 1, now: 2000 }).key);
  f.config.budgetHintsEnabled = false;
  assert.equal(runtimeContext(f.agent, f.hub), null);
});

test('optional cadence emits only budget; normal nodes reset its interval and replay never reposts', () => {
  const f = fixture(), store = createTodoStore();
  f.config.stateHintsEnabled = true; f.config.budgetInjectionEvery = 3;
  f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Implement the widget.' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  assert.ok(!store.execTaskMap(f.session, { op: 'excerpt', from: 'Implement', to: 'widget.', tasks: [{ title: 'Implement widget', anchor: { from: 'Implement', to: 'widget.' } }] }).isError);
  f.budgets.command(f.agent, '轮次=20');
  setRuntimeContext(f.session, () => runtimeContext(f.agent, f.hub, { now: 0 }));
  const first = store.maintainInjection(f.session);
  assert.match(first.data.content[0].text, /todo list/); assert.match(first.data.content[0].text, /runtime state/);
  const call = () => f.budgets.record(f.session, 'main', { usage: { inputTokens: 10, outputTokens: 5 } });
  for (let i = 0; i < 5; i++) { call(); assert.equal(store.maintainInjection(f.session), undefined, 'stored frequency is ignored while the switch is off'); }
  f.config.budgetEveryStep = true;
  const periodic = store.maintainInjection(f.session);
  assert.equal(taskContextMeta(periodic.data).budgetOnly, true);
  assert.match(periodic.data.content[0].text, /^预算\n/);
  assert.doesNotMatch(periodic.data.content[0].text, /todo list|runtime state|Jobs:|Retained context/);
  assert.equal(summaryMessageReader(f.session)(periodic), null);
  for (let i = 0; i < 2; i++) { call(); assert.equal(store.maintainInjection(f.session), undefined); }
  call(); assert.ok(store.maintainInjection(f.session));
  assert.equal(store.maintainInjection(f.session), undefined);
  const replay = Session.create(f.session.id, structuredClone(f.session.snapshotEvents()), f.session.header);
  setRuntimeContext(replay, () => runtimeContext({ session: replay }, f.hub, { now: 0 }));
  assert.equal(createTodoStore().maintainInjection(replay), undefined);
  store.execTaskMap(f.session, { op: 'edit', tasks: [{ id: 'T1', title: 'Updated widget' }] });
  const normal = store.maintainInjection(f.session);
  assert.match(normal.data.content[0].text, /Updated widget/);
  assert.equal(taskContextMeta(normal.data).budgetOnly, undefined);
  for (let i = 0; i < 2; i++) { call(); assert.equal(store.maintainInjection(f.session), undefined); }
  call(); assert.ok(store.maintainInjection(f.session));
  f.config.budgetEveryStep = false;
  for (let i = 0; i < 5; i++) { call(); assert.equal(store.maintainInjection(f.session), undefined); }
  f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Continue.' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  assert.ok(store.maintainInjection(f.session), 'new user input still delivers the current full block');
});
