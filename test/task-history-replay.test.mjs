import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createTodoStore, transcriptText } from '../src/todolist.mjs';
import { appendPrepared, prepareReplay } from '../vendor/rewind/src/conversation.mjs';
import { currentTasks, restoreTaskProjection } from '../src/tasks.mjs';
import { latestTodo } from '../src/task-context.mjs';

const user = (s, text, sourceEventSeqs) => s.append('user/message', createUserMessage({
  source: { kind: 'user' }, content: [{ type: 'text', text }],
}), { surfaceOp: 'append', ...(sourceEventSeqs ? { sourceEventSeqs } : {}) });
const excerpt = { op: 'excerpt', from: 'alpha', to: 'omega', tasks: [
  { title: 'Do alpha', anchor: { from: 'alpha', to: 'omega' } },
] };

test('replayed messages are not new task quotations, while existing message numbers stay stable', () => {
  const s = Session.create('quotations'), store = createTodoStore();
  const original = user(s, 'alpha omega'); user(s, 'alpha omega', [original.seq]);
  user(s, 'later requirement');
  assert.equal(transcriptText(s), 'Verbatim user messages in this session (newest last):\n[1] alpha omega\n[3] later requirement');
  assert.equal(store.execTaskMap(s, excerpt).isError, undefined);
  assert.equal(store.snapshot(s).excerpts[0].msg, 1);
  assert.equal(store.execTaskMap(s, { op: 'excerpt', msg: 3, from: 'later', to: 'requirement', tasks: [] }).isError, undefined);
  const cold = Session.create(s.id, s.snapshotEvents(), s.header);
  assert.equal(transcriptText(cold), transcriptText(s));
  assert.equal(store.snapshot(cold).excerpts[1].msg, 3);
});

test('two genuine equal user inputs still require a message number', () => {
  const s = Session.create('repeated-input'), store = createTodoStore();
  user(s, 'alpha omega'); user(s, 'alpha omega');
  assert.match(store.execTaskMap(s, excerpt).text, /both \[1\] and \[2\]/);
  assert.equal(store.execTaskMap(s, { ...excerpt, msg: 2 }).isError, undefined);
});

test('a positional replay cannot resume paused task reminders; a real input can', () => {
  const s = Session.create('pause'), store = createTodoStore(); s.append('turn/start', { turn: 1 });
  const original = user(s, 'alpha omega');
  store.execTaskMap(s, { op: 'pause_turn', reason: 'human requested stop' });
  user(s, 'alpha omega', [original.seq]);
  assert.equal(store.turnControl(s, 1).paused, true);
  user(s, 'continue'); assert.equal(store.turnControl(s, 1).paused, false);
});

test('native replay restores one ledger for tools, stopping checks, context and the task dock', () => {
  const s = Session.create('rewind-ledger'), store = createTodoStore();
  const original = user(s, 'alpha omega'); store.execTaskMap(s, excerpt);
  const cutoff = s.seq; user(s, 'finish now'); store.execCheck(s, [{ id: 'T1', done: true }]);
  const undoAt = s.seq;
  appendPrepared(s, prepareReplay(s, { atSeq: cutoff }));
  assert.equal(store.gateState(s).undone, 1);
  assert.equal(currentTasks(s)[0].status, 'pending'); assert.match(latestTodo(s).text, /\[ \] T1/);
  restoreTaskProjection({ sessionProjections: { stateOf: () => null } }, s);
  assert.equal(s.snapshotEvents().at(-1).data.todos[0].status, 'pending');
  appendPrepared(s, prepareReplay(s, { atSeq: undoAt }));
  assert.equal(store.gateState(s).undone, 0);
  assert.equal(transcriptText(s).match(/alpha omega/g).length, 1);
  appendPrepared(s, prepareReplay(s, { atSeq: original.seq }));
  assert.equal(store.gateState(s).total, 0);
  assert.deepEqual(currentTasks(Session.create(s.id, s.snapshotEvents(), s.header)), []);
});
