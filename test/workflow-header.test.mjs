import assert from 'node:assert/strict';
import test from 'node:test';
import { headerWorkflows, workflowPhaseLabel, workflowChildLabels, withWorkflowLabels, subagentTabTitle } from '../src/client/workflow-header.mjs';

test('historical workflow labels correct the native catalog without changing child membership or mode', () => {
  const labels = workflowChildLabels([{ event: { type: 'tool-workflow/agent-start', data: { childId: 'child', label: '分析接口' } } },
    { type: 'user/message', data: { childId: 'other', label: 'not a workflow' } }]);
  const catalog = [{ id: 'child', mode: 'continuable', label: 'workflow child 1' }, { id: 'other', mode: 'external', label: '外部代理' }];
  const state = { byId: {}, projectionsBySession: { parent: { values: { subagentCatalog: catalog } } } };
  const next = withWorkflowLabels(state, 'parent', labels);
  assert.deepEqual(next.projectionsBySession.parent.values.subagentCatalog, [{ id: 'child', mode: 'continuable', label: '分析接口' }, catalog[1]]);
  assert.equal(catalog[0].label, 'workflow child 1');
  assert.equal(withWorkflowLabels(state, 'another-parent', labels), state);
});

test('a retained child title resolves even when it is absent from the root session list', () => {
  const address = 'dsh-resource://subagentchat/session/child?parent=parent&mode=continuable';
  const state = { byId: {}, projectionsBySession: {} };
  assert.equal(subagentTabTitle(address, state, undefined, new Map(), 'child'), 'child');
  assert.equal(subagentTabTitle(address, state, { label: '实现修复' }, new Map(), 'child'), '实现修复');
  assert.equal(subagentTabTitle(address, state, { label: 'workflow child 1' }, new Map([['child', '分析接口']]), 'child'), '分析接口');
  assert.equal(subagentTabTitle('https://example.test', state, { label: 'foreign' }, new Map(), '保留原标题'), '保留原标题');
});

test('header orders real workflow nodes and reports the active phase', () => {
  const phases = [{ phase: '分析', members: [{ status: 'completed' }] }, { phase: '实现', members: [{ status: 'running' }] }];
  const older = { kind: 'workflow-run', anchorSeq: 2 }, newer = { kind: 'workflow-run', anchorSeq: 20 };
  assert.deepEqual(headerWorkflows({ nodes: { values: () => [older, { kind: 'assistant', anchorSeq: 30 }, newer] } }), [newer, older]);
  assert.equal(workflowPhaseLabel({ name: '修复', phases }), '实现');
  assert.equal(workflowPhaseLabel({ name: '修复', phases: [] }), '修复');
});
