import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskBudgets, parseBudgetInput, renderBudget } from '../src/task-budget.mjs';
import { runtimeContext } from '../src/runtime-state.mjs';

function fixture() {
  let now = 0; const states = new Map(), config = { budgetHintsEnabled: true };
  const hub = { config: () => config, store: { state(id) { if (!states.has(id)) states.set(id, { id }); return states.get(id); }, save() {} },
    context: { state: () => ({ records: [] }) }, ctx: { get: () => null, tokenMeter: { measure: () => ({ totalTokens: 0 }) } } };
  const session = { id: 'main', snapshotEvents: () => [], header: {} }, agent = { session, status: 'running' };
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

test('budget switch works without general state, refreshes each step and removes its own carrier on disable', () => {
  const f = fixture();
  assert.equal(runtimeContext(f.agent, f.hub).text, '预算：无限制');
  f.budgets.command(f.agent, '轮次=3');
  const first = runtimeContext(f.agent, f.hub, { turn: 1, step: 1, now: 0 });
  const next = runtimeContext(f.agent, f.hub, { turn: 1, step: 2, now: 1000 });
  assert.notEqual(first.key, next.key);
  assert.equal(first.key, runtimeContext(f.agent, f.hub, { turn: 1, step: 1, now: 3000 }).key);
  f.config.budgetHintsEnabled = false;
  assert.equal(runtimeContext(f.agent, f.hub), null);
});
