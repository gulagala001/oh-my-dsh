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
