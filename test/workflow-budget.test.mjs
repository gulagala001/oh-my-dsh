import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubStore } from '../src/hub-store.mjs';
import { WorkflowBudget, workflowTokenTarget } from '../src/workflow-budget.mjs';
const human = (text, id = 'message') => ({ id, source: { kind: 'user' }, content: [{ type: 'text', text }] });
const session = (id, parentSession) => ({ id, header: { ...(parentSession ? { parentSession, origin: 'subagent' } : {}) } });
const response = (seq, count, type = 'assistant/message') => ({ seq, type, data: { message: { source: { kind: 'model' } }, usage: count === undefined ? undefined : { inputTokens: 100, outputTokens: count, reasoningTokens: Math.floor(count / 2) } } });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-output-budget-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new HubStore(dir), budget = new WorkflowBudget(store), root = session('root');
  budget.admit(root, { turn: 1, step: 1, messages: [human('Thoroughly inspect the code +1k', 'first')] });
  return { dir, store, budget, root };
}

test('output token target recognizes an explicit human suffix and leaves quoted/plugin material alone', () => {
  assert.equal(workflowTokenTarget([human('Build it +500k')]), 500000);
  assert.equal(workflowTokenTarget([human('+1.5m')]), 1500000);
  for (const text of ['+0', '+1.5', '2+500k', 'Explain "+500k"', '```\n+500k\n```', 'Budget +1e99', '+9007199254740992']) assert.equal(workflowTokenTarget([human(text)]), undefined, text);
  assert.equal(workflowTokenTarget([{ ...human('+500k'), source: { kind: 'plugin:attachment' } }]), undefined);
});

test('one turn shares reported output across descendants and remains idempotent after restart', async t => {
  const f = await fixture(t), child = session('child', 'root'), grandchild = session('grandchild', 'child');
  f.budget.attach(child); f.budget.attach(grandchild);
  f.budget.observe(f.root, response(2, 3)); f.budget.observe(child, response(3, 5)); f.budget.observe(grandchild, response(4, 7, 'assistant/attempt'));
  f.budget.observe(child, response(3, 5));
  assert.deepEqual(f.budget.snapshot(f.root), { total: 1000, spent: 15, unmetered: 0 });
  const restarted = new WorkflowBudget(new HubStore(f.dir));
  restarted.observe(child, response(3, 5)); assert.equal(restarted.snapshot(grandchild).spent, 15);
  restarted.observe(child, response(8, 4)); assert.equal(restarted.snapshot(f.root).spent, 19);
});

test('background captures and later children keep the originating pool across a new human turn', async t => {
  const f = await fixture(t), old = f.budget.capture(f.root), first = session('first-child', 'root');
  f.budget.attach(first, old.owner); f.budget.observe(first, response(1, 4));
  f.budget.admit(f.root, { turn: 2, step: 1, messages: [human('New task +20', 'second')] });
  const later = session('late-child', 'root');
  f.budget.attach(later, old.owner); f.budget.attach(later); f.budget.observe(later, response(1, 5));
  f.budget.observe(f.root, response(20, 3));
  assert.deepEqual(old.snapshot(), { total: 1000, spent: 9, unmetered: 0 });
  assert.deepEqual(f.budget.snapshot(f.root), { total: 20, spent: 3, unmetered: 0 });
  f.budget.admit(f.root, { turn: 2, step: 3, messages: [human('Continue +30', 'steering')] });
  assert.deepEqual(f.budget.snapshot(f.root), { total: 30, spent: 3, unmetered: 0 });
  f.budget.admit(f.root, { turn: 1, step: 1, messages: [human('After clear', 'after-clear')] });
  assert.deepEqual(f.budget.snapshot(f.root), { total: null, spent: 0, unmetered: 0 });
});

test('missing usage stays explicit and synthetic assistant messages do not consume a pool', async t => {
  const f = await fixture(t);
  f.budget.observe(f.root, response(2, undefined));
  f.budget.observe(f.root, { seq: 3, type: 'assistant/message', data: { message: { source: { kind: 'plugin:summary' } } } });
  f.budget.observe(f.root, { seq: 4, type: 'assistant/attempt', data: { stream: [{ type: 'usage', usage: { outputTokens: 6 } }] } });
  assert.deepEqual(f.budget.snapshot(f.root), { total: 1000, spent: 6, unmetered: 1 });
  const filled = response(5, 0); filled.data.message.content = [{ type: 'text', text: 'Unmetered output' }];
  f.budget.observe(f.root, filled); assert.equal(f.budget.snapshot(f.root).unmetered, 2);
  const unowned = session('stock-child', 'stock'); f.budget.attach(unowned); f.budget.observe(unowned, response(1, 100));
  assert.equal(f.store.peek(unowned.id), undefined);
});

test('switching out of OMD stops main accounting while existing background work keeps its pool', async t => {
  const f = await fixture(t), old = f.budget.capture(f.root);
  f.budget.admit(f.root, { turn: 2, step: 1, messages: [], enabled: false });
  f.budget.observe(f.root, response(20, 100));
  const ordinary = session('stock-child', 'root'); f.budget.attach(ordinary);
  assert.equal(f.store.peek(ordinary.id), undefined);
  const background = session('background-child', 'root'); f.budget.attach(background, old.owner); f.budget.observe(background, response(1, 5));
  assert.deepEqual(old.snapshot(), { total: 1000, spent: 5, unmetered: 0 });
  assert.deepEqual(f.budget.snapshot(f.root), { total: null, spent: 0, unmetered: 0 });
});
