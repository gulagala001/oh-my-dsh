import test from 'node:test';
import assert from 'node:assert/strict';
import { taskInjection, taskInjectionDefinition, compactionGroups, supersededTaskInjections } from '../src/client/conversation-records.mjs';

test('injection reads exact delivered text, including embedded refreshes and runtime-only snapshots', () => {
  const text = '[todo list]\n[x] T1 完成\n[ ] T2 待办\n\n[runtime state · as of yesterday · event 9]\nJobs: 2.';
  const message = { source: { kind: 'plugin', plugin: 'trisoul-x:tasks' }, content: [{ type: 'text', text }] };
  assert.deepEqual(taskInjection(message), { text, todo: true, runtime: true, title: 'Todo 与运行状态', total: 2, done: 1 });
  const embedded = { ...message, source: { kind: 'plugin', plugin: 'compact' }, content: [{ type: 'text', text: 'trace' }, ...message.content, { type: 'text', text: 'user original' }], omdTodo: { index: 1 } };
  assert.equal(taskInjection(embedded).text, text);
  const event = { type: 'user/message', seq: 21, surfaceOp: { op: 'replace', startSeq: 3, endSeq: 3 }, data: embedded };
  assert.ok(taskInjectionDefinition.match(event));
  assert.equal(taskInjectionDefinition.start({}, { event }).seq, 21);
  assert.equal(taskInjection({ ...message, source: { kind: 'user' } }), null, 'quoted markers in user text are not injections');
  assert.equal(taskInjection({ ...message, content: [{ type: 'text', text: '[runtime state · as of now]\nJobs: 0.' }] }).title, '运行状态');
});

function segment(events, id, batch, command) {
  const data = { compactionId: id, ...(batch ? { omdBatchId: batch } : {}), ...(command ? { sourceCommandId: command } : {}) };
  const add = (type, data) => { const event = { seq: events.length, type, data }; events.push(event); return event; };
  add('compaction/start', data);
  add('compaction/summary', { ...data, summary: [{ type: 'text', text: id + ' summary' }], shadowedSeqs: [100 + events.length], shadowedTokenCount: 40 });
  const checkpoint = add('user/message', { ...data, source: { kind: 'plugin', plugin: 'compact', compactionId: id, ...(command ? { sourceCommandId: command } : {}) } });
  add('compaction/end', data);
  return checkpoint;
}

test('compaction displays a carried task snapshot once, preserving used history and partial windows', () => {
  const text = '[todo list]\n[ ] T1 待办';
  const injection = seq => ({ seq, type: 'user/message', data: { source: { kind: 'plugin', plugin: 'trisoul-x:trace' }, content: [{ type: 'text', text }], omdTodo: { index: 0 } } });
  const events = [injection(0), { seq: 1, type: 'assistant/message', data: {} }, injection(2)];
  segment(events, 'a', 'batch'); segment(events, 'b', 'batch');
  const fresh = { ...injection(events.length), sourceEventSeqs: [2] }; events.push(fresh);
  const hidden = supersededTaskInjections(events.map(event => ({ type: 'event', event })));
  assert.deepEqual([...hidden], [2], 'only the intermediate carrier that the refresh replaces is hidden');
  assert.deepEqual([...supersededTaskInjections(events.slice(3))], [], 'missing earlier material is not guessed');
  assert.deepEqual([...supersededTaskInjections([...events.slice(0, -1), { ...fresh, sourceEventSeqs: [0] }])], [], 'unrelated history is retained');
  assert.deepEqual([...supersededTaskInjections([...events.slice(0, -1), { type: 'tool/result', data: {} }, fresh])], [], 'intervening work makes both records meaningful');
  assert.deepEqual([...supersededTaskInjections(events.slice(0, -1))], [], 'an unfinished compaction retains its existing injection');
});

test('same transaction folds; distinct adjacent transactions stay separate; refreshes do not duplicate segments', () => {
  const events = [], a = segment(events, 'a', 'one'), b = segment(events, 'b', 'one'), c = segment(events, 'c', 'two');
  const refreshed = { ...a, seq: events.length, data: { ...a.data, omdTodo: { index: 0 } } }; events.push(refreshed);
  const groups = compactionGroups(events.map(event => ({ type: 'event', event })));
  assert.equal(groups.get(a.seq), groups.get(b.seq));
  assert.notEqual(groups.get(a.seq), groups.get(c.seq));
  assert.equal(groups.get(a.seq).parts.length, 2);
  assert.equal(groups.get(a.seq).firstSeq, refreshed.seq);
  assert.equal(groups.get(a.seq).tokens, 80);
  assert.deepEqual(groups.get(a.seq).parts.map(p => p.summary), ['a summary', 'b summary']);
});

test('legacy lifecycle runs stop at genuine activity and refresh boundaries; commands correlate all parts', () => {
  const events = [], a = segment(events, 'a'), b = segment(events, 'b');
  events.push({ seq: events.length, type: 'user/message', data: { source: { kind: 'plugin', plugin: 'trisoul-x:tasks' } } });
  const c = segment(events, 'c');
  events.push({ seq: events.length, type: 'assistant/message', data: {} });
  const d = segment(events, 'd', 'cmd-batch', 'cmd'), e = segment(events, 'e', 'cmd-batch', 'cmd');
  const groups = compactionGroups(events);
  assert.equal(groups.get(a.seq), groups.get(b.seq));
  assert.notEqual(groups.get(b.seq), groups.get(c.seq));
  assert.equal(groups.get('command:cmd'), groups.get(d.seq));
  assert.equal(groups.get(d.seq), groups.get(e.seq));
  const partial = compactionGroups([e]);
  assert.equal(partial.get(e.seq).parts[0].summary, null, 'missing summaries remain visibly unavailable');
});
