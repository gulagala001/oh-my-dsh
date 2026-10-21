import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createTodoStore } from '../src/todolist.mjs';
import { currentTaskSnapshot, currentTasks, registerTasks, restoreTaskProjection } from '../src/tasks.mjs';
import { latestTodo } from '../src/task-context.mjs';
import { Hub } from '../src/hub.mjs';

const writeNative = (session, title) => session.append('todo/write', { todos: title ? [{ content: title, status: 'pending' }] : [] });
const ledger = () => ({ excerpts: [{ id: 'E1', msg: 1, text: 'alpha omega', from: 'alpha', to: 'omega' }],
  tasks: [{ id: 'T1', title: 'First', done: false, anchor: null, links: [{ id: 'L1', kind: 'text', note: 'Observed', reason: 'No runnable test' }] },
    { id: 'T3', title: 'Third', done: true, anchor: { excerpt: 'E1', start: 0, end: 11 }, links: [{ id: 'L8', kind: 'test', path: 'check.mjs', lastRun: { pass: true } }] }],
  todos: [{ content: 'stale projection', status: 'pending' }] });

test('native task updates and clears are immediately authoritative to tools, context and UI', () => {
  const s = Session.create('authority'), store = createTodoStore();
  store.snapshot(s); writeNative(s, 'Native change');
  assert.equal(store.snapshot(s).tasks[0]?.title, 'Native change');
  assert.equal(currentTasks(s)[0].content, 'Native change'); assert.match(latestTodo(s).text, /Native change/);
  writeNative(s, null); assert.deepEqual(store.snapshot(s).tasks, []); assert.equal(store.gateState(s).total, 0);
});

test('a reloaded or rewound session with the same id cannot inherit a previous object cache', () => {
  const a = Session.create('same-id'), store = createTodoStore(); writeNative(a, 'Old task'); store.snapshot(a);
  const b = Session.create('same-id'); writeNative(b, 'Restored task');
  assert.equal(store.snapshot(b).tasks[0].title, 'Restored task');
  assert.equal(store.snapshot(a).tasks[0].title, 'Old task');
});

test('a failed task read stays visible and can recover instead of becoming an empty adopted ledger', () => {
  const store = createTodoStore(), events = [{ seq: 0, type: 'todo/write', data: { todos: [{ content: 'Preserved', status: 'pending' }] } }];
  let failed = true;
  const session = { id: 'read-failure', snapshotEvents() { if (failed) throw Error('archive unreadable'); return events; } };
  assert.throws(() => store.snapshot(session), /archive unreadable/);
  failed = false; assert.equal(store.snapshot(session).tasks[0].title, 'Preserved');
});

test('live and cold native histories take precedence; only legacy-only archives use the sidecar', () => {
  const s = Session.create('cold'), cached = ledger();
  assert.deepEqual(currentTasks(s, cached), []);
  writeNative(s, 'Native archive');
  assert.equal(currentTasks(undefined, cached, s.snapshotEvents())[0].content, 'Native archive');
  assert.equal(currentTasks(undefined, cached)[0].content, 'First');
});

test('historical task snapshots retain evidence and allocate identifiers after the highest existing id', async () => {
  const s = Session.create('legacy'), store = createTodoStore(); s.append('todo/write', ledger());
  const result = store.execTaskMap(s, { op: 'add', tasks: [{ title: 'Fourth', anchor: { excerpt: 'E1', from: 'alpha', to: 'omega' } }] });
  assert.equal(result.isError, undefined);
  assert.equal(store.snapshot(s).tasks.at(-1).id, 'T4');
  await store.execVerifyLink(s, { op: 'link', links: [{ task: 'T4', kind: 'text', note: 'Observed fourth', reason: 'Manual result' }] }, '/');
  const snapshot = store.snapshot(s);
  assert.equal(snapshot.tasks.at(-1).links[0].id, 'L9');
  assert.equal(snapshot.tasks[1].links[0].lastRun.execution, null);
  assert.equal(snapshot.tasks[1].links[0].lastRun.pass, true);
});

test('the native dock derives from the same full ledger and restores a normalized quiet snapshot', () => {
  let projection;
  registerTasks({ tools: { register() {} }, sessionProjections: { register(value) { projection = value; } } });
  const s = Session.create('dock'), data = ledger(); s.append('todo/write', data);
  const expected = [{ content: 'First ⚠ text-only', status: 'pending' }, { content: 'Third', status: 'completed' }];
  // Keep the native todos@2 fold; repair its serialized input at the request
  // boundary, including a historical projection that is non-null but stale.
  restoreTaskProjection({ sessionProjections: { stateOf: () => projection.apply(null, s.snapshotEvents().at(-1)) } }, s);
  assert.equal(s.snapshotEvents().at(-1).data.quiet, true);
  assert.deepEqual(s.snapshotEvents().at(-1).data.todos, expected);
  assert.deepEqual(currentTaskSnapshot(s).tasks[1].links[0].lastRun, { pass: true, execution: null });
  const length = s.snapshotEvents().length;
  restoreTaskProjection({ sessionProjections: { stateOf: () => expected } }, s);
  assert.equal(s.snapshotEvents().length, length, 'An already correct native projection needs no new event');
  s.append('todo/write', { tasks: [], todos: expected });
  restoreTaskProjection({ sessionProjections: { stateOf: () => expected } }, s);
  assert.deepEqual(s.snapshotEvents().at(-1).data.todos, []);
});

test('decoded snapshots are immutable, malformed history is visible, and quiet copies preserve verification ownership', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'task-quiet-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'check.mjs'), '');
  const s = Session.create('quiet'), store = createTodoStore(); s.append('todo/write', ledger());
  assert.throws(() => { currentTaskSnapshot(s).tasks[0].title = 'corrupt cache'; }, TypeError);
  const result = await store.execVerifyLink(s, { op: 'run', tasks: ['T3'] }, directory, undefined, async () => {
    restoreTaskProjection({ sessionProjections: { stateOf: () => null } }, s);
    return { ok: true, out: 'new passing evidence' };
  });
  assert.equal(result.isError, undefined); assert.match(result.text, /new passing evidence/);
  assert.equal(store.snapshot(s).tasks[1].links[0].lastRun.tail, 'new passing evidence');
  s.append('todo/write', { tasks: 'malformed', todos: [] });
  const before = s.seq;
  assert.throws(() => store.execCheck(s, [{ id: 'T3', done: false }]), /任务清单格式无效/);
  assert.equal(s.seq, before);
  assert.equal(store.execTaskMap(s, { op: 'transcript' }).isError, undefined);
  s.append('turn/start', { turn: 1 });
  assert.equal(store.execTaskMap(s, { op: 'pause_turn', reason: 'Pause while the archive is repaired' }).isError, undefined);
  assert.equal(store.turnControl(s, 1).paused, true);
});

test('verification cannot overwrite tasks replaced while a native command is running', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'task-authority-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'check.mjs'), '');
  const s = Session.create('verification'), store = createTodoStore(); s.append('todo/write', ledger());
  const result = store.execVerifyLink(s, { op: 'run', tasks: ['T3'] }, directory, undefined, async () => {
    writeNative(s, 'New requirement'); return { ok: true, out: 'passed' };
  });
  await assert.rejects(result, /任务清单已更新/);
  assert.equal(currentTasks(s)[0].content, 'New requirement');
});

test('new task writes do not create a second persistent ledger in the OMD sidecar', () => {
  let writes = 0;
  const s = Session.create('no-copy'), event = writeNative(s, 'Native task');
  Hub.prototype.observe.call({ store: { state: () => ({}), save: () => writes++ } }, s, event);
  assert.equal(writes, 0);
});
