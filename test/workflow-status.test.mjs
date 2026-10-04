import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowJobs, liveWorkflowData } from '../src/client/workflow-status.mjs';

function records(runId = 'run-a', jobId = 'workflow-a', offset = 0) {
  const callId = 'call-' + runId;
  return [
    { type: 'tool/call', seq: offset + 1, data: { name: 'workflow', callId } },
    { type: 'tool-workflow/run-start', seq: offset + 2, data: { runId, name: 'same-name' } },
    { type: 'tool/result', seq: offset + 3, sourceEventSeqs: [offset + 1], data: { message: {
      role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, isError: false,
      content: [{ type: 'text', text: `workflow "same-name" started in the background as job ${jobId}. Its return value arrives with the completion notice.\nRun ID: ${runId}\nScript: /fixture/script.js` }],
    } } },
  ];
}
const node = () => ({ id: 'run-a', data: { name: 'same-name', status: 'interrupted', phases: [{ key: 'Build', phase: 'Build', members: [
  { seq: 1, label: 'finished', childId: 'child-1', status: 'completed' },
  { seq: 2, label: 'working', childId: 'child-2', status: 'interrupted' },
] }] } });
const job = (status = 'running') => ({ id: 'workflow-a', kind: 'workflow', owner: 'parent', status });

test('an exact live background job keeps unfinished members running without rewriting real outcomes', () => {
  const original = node(), before = structuredClone(original);
  const runs = workflowJobs(records().map(event => ({ type: 'event', event })));
  for (const status of ['running', 'stopping']) {
    const data = liveWorkflowData(original, runs, [job(status)], 'parent');
    assert.equal(data.status, 'running');
    assert.deepEqual(data.phases[0].members.map(member => member.status), ['completed', 'running']);
  }
  assert.deepEqual(original, before, 'the native projection remains immutable');
});

test('missing, foreign, and terminal jobs cannot revive an interrupted workflow', () => {
  const original = node(), runs = workflowJobs(records());
  for (const rows of [undefined, [], [job('completed')], [job('failed')], [job('killed')], [{ ...job(), owner: 'another-session' }], [{ ...job(), id: 'another-job' }], [{ ...job(), kind: 'bash' }]]) {
    assert.equal(liveWorkflowData(original, runs, rows, 'parent'), original.data);
  }
});

test('durable run and member endings take precedence over a stale live-job snapshot', () => {
  const original = node(), events = records();
  events.push({ type: 'tool-workflow/run-end', seq: 4, data: { runId: 'run-a', stopReason: 'cancelled' } });
  assert.equal(liveWorkflowData(original, workflowJobs(events), [job()], 'parent'), original.data);
  for (const status of ['completed', 'failed', 'cancelled']) {
    const ended = { ...original, data: { ...original.data, status } };
    assert.equal(liveWorkflowData(ended, workflowJobs(records()), [job()], 'parent'), ended.data);
  }
});

test('labels are never used to correlate simultaneous workflows', () => {
  const runs = workflowJobs([...records(), ...records('run-b', 'workflow-b', 10)]);
  assert.equal(runs.get('run-a').jobId, 'workflow-a');
  assert.equal(runs.get('run-b').jobId, 'workflow-b');
  const original = node();
  assert.equal(liveWorkflowData(original, runs, [{ ...job(), id: 'workflow-b' }], 'parent'), original.data);
});

test('user text, failed results and unpaired or unrelated tools cannot claim a live workflow', () => {
  const mutations = [
    events => { events[2].type = 'user/message'; },
    events => { events[0].data.name = 'bash'; },
    events => { events[2].data.message.isError = true; },
    events => { events[2].data.message.source.kind = 'model'; },
    events => { events[2].data.message.toolCallId = 'unrelated-call'; },
    events => { events[2].sourceEventSeqs = [99]; },
    events => { events.splice(0, 1); },
  ];
  for (const mutate of mutations) {
    const events = records(); mutate(events);
    assert.equal(workflowJobs(events).get('run-a')?.jobId, undefined);
  }
});

 test('durable partial failures override script completion without inferring from free text', () => {
  const events = records();
  const failures = [{seq:1, childId:'child-1', stopReason:'error', cause:'failed', reason:'quota'}];
  events.push({type:'tool-workflow/run-end', seq:4, data:{runId:'run-a', stopReason:'completed', failures}});
  const original = node(); original.data.status = 'completed';
  const data = liveWorkflowData(original, workflowJobs(events), [], 'parent');
  assert.equal(data.status, 'failed'); assert.deepEqual(data.failures, failures);
  assert.equal(original.data.status, 'completed');
});
