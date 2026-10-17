import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hub } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { TaskBudgets } from '../src/task-budget.mjs';

const budget = () => ({ configured: true, visible: true, tokens: 0, rounds: 0, elapsedMs: 0, unmetered: 0,
  limits: { tokens: null, rounds: null, timeMs: null } });
const entry = (extra = {}) => ({ id: 'call-1', at: 10000, durationMs: 10,
  usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 5 }, ...extra });
const session = (id = 'own', parentSession, origin) => ({ id, header: { cwd: '/synthetic/project', parentSession, origin },
  requestHeader: () => ({ config: { provider: 'offline', model: 'fixture' } }),
  snapshotEvents: () => [{ type: 'step/end', data: { turn: 1, step: 2 } }] });
function fixture(t, ownBudget = budget()) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-budget-persistence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new HubStore(dir), calls = [], hub = { store, monitor: { append: call => calls.push(call) } };
  hub.budgets = new TaskBudgets(hub);
  const state = store.state('own'); if (ownBudget !== null) state.budget = ownBudget;
  const writes = [], original = store.write.bind(store);
  store.write = (name, value) => { original(name, value); writes.push({ name, bytes: readFileSync(join(dir, name)) }); };
  return { store, hub, state, writes, calls, recover: id => new HubStore(dir).state(id),
    record: (kind = 'main', value = entry(), owner = session()) => Hub.prototype.record.call(hub, owner, kind, value) };
}

test('enabled budget saves the complete accounted call once and cold-recovers', t => {
  const f = fixture(t);
  f.state.contextHistory = Array.from({ length: 80 }, (_, n) => ({ at: n, nodes: [{ seq: n, tokens: 7 }] }));
  f.state.pendingFrame = { at: 99, turn: 1, step: 2, totalTokens: 125, nodes: [{ seq: 100, tokens: 125 }] };
  f.state.activity = Array.from({ length: 60 }, (_, n) => ({ id: `prior-${n}` }));
  f.record();
  assert.equal(f.writes.length, 1);
  const restored = f.recover('own');
  assert.deepEqual(restored, JSON.parse(JSON.stringify(f.state)));
  assert.equal(restored.budget.tokens, 135); assert.equal(restored.budget.rounds, 1);
  assert.equal(restored.metrics.main.calls, 1); assert.equal(restored.activity.length, 60);
  assert.equal(restored.contextHistory.length, 80); assert.equal(restored.contextHistory.at(-1).callId, 'call-1');
  assert.equal('pendingFrame' in restored, false); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].id, restored.activity.at(-1).id);
});

for (const mode of ['unconfigured', 'hidden', 'absent', 'service-absent', 'legacy-result']) {
  test(`call persistence is not skipped when budget is ${mode}`, t => {
    const own = mode === 'absent' ? null : { ...budget(), ...(mode === 'unconfigured' ? { configured: false } : {}), ...(mode === 'hidden' ? { visible: false } : {}) };
    const f = fixture(t, own);
    if (mode === 'service-absent') delete f.hub.budgets;
    if (mode === 'legacy-result') f.hub.budgets = { record: () => ({ saved: true }) };
    f.record();
    assert.equal(f.writes.length, 1); assert.equal(f.recover('own').metrics.main.calls, 1);
    assert.equal(f.calls.length, 1); assert.equal(f.recover('own').budget?.tokens ?? 0, 0);
  });
}

test('delegated chain persists origin then ancestors once without consuming ancestor rounds', t => {
  const f = fixture(t);
  Object.assign(f.store.state('parent'), { budget: budget(), origin: 'subagent', parentSession: 'grandparent' });
  Object.assign(f.store.state('grandparent'), { budget: budget(), origin: null });
  f.record('subagent', entry(), session('own', 'parent', 'subagent'));
  assert.deepEqual(f.writes.map(w => w.name), ['sessions/own.json', 'sessions/parent.json', 'sessions/grandparent.json']);
  for (const id of ['own', 'parent', 'grandparent']) {
    const restored = f.recover(id); assert.equal(restored.budget.tokens, 135); assert.equal(restored.budget.rounds, 0);
  }
  assert.equal(f.recover('own').metrics.subagent.calls, 1);
});

test('ancestor-only budget cannot acknowledge an unsaved origin', t => {
  const f = fixture(t, null); f.store.state('parent').budget = budget();
  f.record('subagent', entry(), session('own', 'parent', 'subagent'));
  assert.deepEqual(f.writes.map(w => w.name), ['sessions/parent.json', 'sessions/own.json']);
  assert.equal(f.recover('own').metrics.subagent.calls, 1); assert.equal(f.recover('parent').budget.tokens, 135);
});

test('ancestor write failure leaves already saved origin recoverable and propagates the same error', t => {
  const f = fixture(t), parent = f.store.state('parent'); parent.budget = budget();
  f.store.save(f.state); f.store.save(parent); f.writes.length = 0;
  const write = f.store.write.bind(f.store), error = Error('synthetic ancestor disk failure');
  f.store.write = (name, value) => { if (name === 'sessions/parent.json') throw error; return write(name, value); };
  assert.throws(() => f.record('subagent', entry(), session('own', 'parent', 'subagent')), e => e === error);
  assert.deepEqual(f.writes.map(w => w.name), ['sessions/own.json']);
  assert.equal(f.recover('own').budget.tokens, 135); assert.equal(f.recover('own').metrics.subagent.calls, 1);
  assert.equal(f.recover('parent').budget.tokens, 0); assert.equal(parent.budget.tokens, 0);
  assert.equal(f.calls.length, 0);
});

test('own write failure does not publish a budget, touch ancestors or append telemetry', t => {
  const f = fixture(t); f.store.state('parent').budget = budget(); f.store.save(f.state); f.writes.length = 0;
  const previousBudget = f.state.budget, error = Error('synthetic origin disk failure');
  f.store.write = () => { throw error; };
  assert.throws(() => f.record('subagent', entry(), session('own', 'parent', 'subagent')), e => e === error);
  assert.equal(f.state.budget, previousBudget); assert.equal(previousBudget.tokens, 0);
  assert.equal(f.recover('own').budget.tokens, 0); assert.equal(f.store.state('parent').budget.tokens, 0);
  assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});

test('budget accounting preserves unmetered and background calls; telemetry failure stays optional', t => {
  const f = fixture(t); f.hub.monitor.append = () => { throw Error('synthetic telemetry failure'); };
  f.record('dream', entry({ usage: null }));
  f.record('main', entry({ id: 'call-2', hasOutput: true, usage: { inputTokens: 0, outputTokens: 0 } }));
  assert.equal(f.writes.length, 2);
  const restored = f.recover('own'); assert.equal(restored.budget.unmetered, 2);
  assert.equal(restored.budget.rounds, 1); assert.equal(restored.budget.tokens, 0);
  assert.equal(restored.metrics.dream.calls, 1); assert.equal(restored.metrics.main.calls, 1);
});

test('cyclic ancestor metadata terminates and direct budget callers still persist', t => {
  const f = fixture(t); f.state.parentSession = 'parent';
  Object.assign(f.store.state('parent'), { budget: budget(), origin: 'subagent', parentSession: 'own' });
  assert.equal(f.hub.budgets.record(session('own', 'parent', 'subagent'), 'subagent', entry()), true);
  assert.deepEqual(f.writes.map(w => w.name), ['sessions/own.json', 'sessions/parent.json']);
  assert.equal(f.recover('own').budget.tokens, 135); assert.equal(f.recover('parent').budget.tokens, 135);
});
