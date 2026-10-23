import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAgents, childAddress, whaleColor, projection } from '../src/client/session-overview.mjs';
import { foldOverview } from '../src/session-overview-projection.mjs';
import { useMainConversation } from '../src/client/main-conversation.mjs';

test('main-only controls stay off for addressed, reopened and unresolved children', () => {
  const check = (session, sessions = {}) => useMainConversation({ sessionId: 'child', useSession: select => select(session), useSessions: select => select(sessions) });
  assert.equal(check({ subagent: null }), true);
  assert.equal(check({}), false);
  assert.equal(check({ subagent: { address: { mode: 'continuable' } } }), false);
  assert.equal(check({ subagent: null }, { byId: { child: { origin: 'subagent' } } }), false);
  assert.equal(check({ subagent: null }, { projectionsBySession: { child: { values: { subagent: { parentSessionId: 'parent' } } } } }), false);
});

test('Team and nested Workflow preserve ownership without duplicate agents or counting the Lead', () => {
  const workflow = { id: 'run', data: { name: '验证', status: 'running', phases: [{ key: 'a', phase: '分析', members: [{ childId: 'nested', label: '研究', status: 'running' }] }] } };
  const state = { byId: {}, projectionsBySession: {
    root: { values: { subagentCatalog: [{ id: 'teammate', mode: 'continuable', label: '成员' }], agentTeam: { members: [{ id: 'root', role: 'lead' }, { id: 'teammate', name: '实现者', role: 'teammate', phase: 'active' }], tasks: [] } } },
    teammate: { values: { subagentCatalog: [{ id: 'nested', mode: 'continuable', label: '研究' }], omdOverview: { workflows: [workflow] }, subagentTiming: { settledMs: 50, lastTurnCompleted: true } } },
    nested: { values: { subagentCatalog: [{ id: 'root', mode: 'continuable' }] } },
  } };
  const result = collectAgents('root', state, new Map([['nested', { running: true }]]));
  assert.deepEqual(result.rows.map(row => [row.id, row.parentId, row.group.kind]), [['teammate', 'root', 'team'], ['nested', 'teammate', 'workflow']]);
  assert.equal(result.active.length, 1); assert.equal(result.completed, 1);
  assert.equal(result.workflows[0].ownerId, 'teammate');
  assert.match(childAddress(result.rows[1]), /parent=teammate/);
  assert.equal(childAddress({ mode: 'external' }), null);
  assert.equal(whaleColor('nested'), whaleColor('nested'));
});

const initial = () => ({ inheritedEventCount: 0, sources: [], outputs: [], workflows: [], calls: {} });
test('durable source and output facts survive history windows; failed/read tools produce no output', () => {
  const image = { attachmentId: 'image-one', name: '来源.png', mediaType: 'image/png', bytes: 10, width: 1, height: 1 };
  let state = foldOverview(initial(), { seq: 0, type: 'user/message', surfaceOp: 'append', data: { content: [{ type: 'image', attachment: image }] } });
  state = foldOverview(state, { seq: 1, type: 'tool/call', data: { callId: 'one', name: 'write', arguments: JSON.stringify({ file_path: 'out.txt', content: 'text' }) } });
  state = foldOverview(state, { seq: 2, type: 'tool/result', surfaceOp: 'append', data: { message: { source: { callId: 'one' }, isError: true } } });
  assert.equal(state.outputs.length, 0);
  state = foldOverview(state, { seq: 3, type: 'tool/call', data: { callId: 'two', name: 'write', arguments: JSON.stringify({ file_path: 'out.txt', content: 'text' }) } });
  state = foldOverview(state, { seq: 4, type: 'tool/result', surfaceOp: 'append', data: { message: { source: { callId: 'two' } }, meta: { path: '/owned/out.txt' } } });
  state = foldOverview(state, { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(state.sources[0].attachment.attachmentId, 'image-one');
  assert.deepEqual(state.outputs.map(item => item.path), ['/owned/out.txt']);
  assert.deepEqual(state.calls, {});
});

test('background Workflow survives normal turn end; interrupted owner marks an unfinished run interrupted', () => {
  let state = foldOverview(initial(), { seq: 0, type: 'turn/start', data: { turn: 1 } });
  state = foldOverview(state, { seq: 1, type: 'tool-workflow/run-start', data: { runId: 'run', name: '流程' } });
  state = foldOverview(state, { seq: 2, type: 'tool-workflow/agent-start', data: { runId: 'run', seq: 0, phase: '实现', label: '执行', childId: 'child' } });
  state = foldOverview(state, { seq: 3, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(state.workflows[0].data.status, 'running');
  state = foldOverview(state, { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'interrupted' } } });
  assert.equal(state.workflows[0].data.status, 'interrupted');
  assert.equal(state.workflows[0].data.phases[0].members[0].status, 'interrupted');
});

test('a cleared native projection does not resurrect values from an older list summary', () => {
  const old = { subagentCatalog: [{ id: 'removed', mode: 'continuable' }], omdOverview: { outcome: 'error' } };
  const state = { byId: { root: { projectionValues: old } }, projectionsBySession: { root: { values: {} } } };
  assert.deepEqual(projection(state, 'root'), {});
  assert.deepEqual(collectAgents('root', state, new Map()).rows, []);
  delete state.projectionsBySession.root;
  assert.deepEqual(projection(state, 'root'), old, 'a list hint remains usable before a native projection store exists');
});

function childState(outcome, workflowStatus = 'completed') {
  return { byId: {}, projectionsBySession: {
    root: { values: { subagentCatalog: [{ id: 'child', mode: 'continuable', label: 'generated child' }],
      omdOverview: { workflows: [{ id: 'run', data: { name: 'Workflow', phases: [{ key: 'missing', phase: null,
        members: [{ childId: 'child', label: 'Review the implementation', status: workflowStatus }] }] } }] } } },
    child: { values: { omdOverview: { outcome }, subagentTiming: { settledMs: 10, lastTurnCompleted: outcome === 'completed' } } },
  } };
}

test('native aborted turns are cancelled, while a running continuation remains running', () => {
  const state = childState('aborted');
  assert.equal(collectAgents('root', state, new Map()).rows[0].status, 'cancelled');
  assert.equal(collectAgents('root', state, new Map([['child', { running: true }]])).rows[0].status, 'running');
});

test('a completed continuation supersedes the previous workflow failure only in the current agent row', () => {
  const result = collectAgents('root', childState('completed', 'failed'), new Map());
  assert.equal(result.rows[0].status, 'completed');
  assert.equal(result.completed, 1);
  assert.equal(result.workflows[0].data.phases[0].members[0].status, 'failed', 'historical run outcomes remain intact');
});

test('nested workflow labels come from durable membership even without loaded event history', () => {
  const state = childState('completed');
  state.projectionsBySession.parent = state.projectionsBySession.root;
  state.projectionsBySession.root = { values: { subagentCatalog: [{ id: 'parent', mode: 'continuable' }] } };
  const child = collectAgents('root', state, new Map()).rows.find(row => row.id === 'child');
  assert.equal(child.label, 'Review the implementation');
  assert.equal(child.parentId, 'parent');
});

test('durable workflows distinguish omitted, empty and named phases like the native panel', () => {
  let state = foldOverview(initial(), { seq: 0, type: 'tool-workflow/run-start', data: { runId: 'run', name: 'phases' } });
  for (const [seq, phase] of [undefined, '', 'missing', '分析', '', null].entries()) {
    state = foldOverview(state, { seq: seq + 1, type: 'tool-workflow/agent-start',
      data: { runId: 'run', seq, childId: `child-${seq}`, label: `Member ${seq}`, ...(phase === undefined ? {} : { phase }) } });
  }
  const phases = state.workflows[0].data.phases;
  assert.deepEqual(phases.map(phase => [phase.phase, phase.members.map(member => member.seq)]), [[null, [0, 5]], ['', [1, 4]], ['missing', [2]], ['分析', [3]]]);
  assert.equal(new Set(phases.map(phase => phase.key)).size, 4);
});
