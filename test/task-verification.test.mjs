import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createTodoStore } from '../src/todolist.mjs';
import { createVerificationRunner, registerTasks } from '../src/tasks.mjs';

async function fixture(t, { count = 2, runTimeoutMs = 300000 } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'task-verification-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const session = Session.create('verification', [], { ...Session.create('verification').header, cwd });
  const store = createTodoStore({ runTimeoutMs });
  for (let i = 1; i <= count; i++) await writeFile(join(cwd, `check-${i}.mjs`), '');
  session.append('todo/write', { tasks: Array.from({ length: count }, (_, i) => ({
    id: `T${i + 1}`, title: `Check ${i + 1}`, done: true, anchor: null,
    links: [{ id: `L${i + 1}`, kind: 'test', path: `check-${i + 1}.mjs`, lastRun: null }],
  })) });
  const recovered = () => store.snapshot(Session.create(session.id, session.snapshotEvents())).tasks;
  return { cwd, session, store, recovered, run: (execute, signal, tasks) => store.execVerifyLink(session, { op: 'run', tasks }, cwd, signal, execute) };
}

test('each completed command is in native history before the next command starts', async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), finish = Promise.withResolvers();
  let calls = 0;
  const running = f.run(async () => {
    if (++calls === 1) return { ok: true, out: 'first result' };
    entered.resolve(); return finish.promise;
  });
  try {
    await entered.promise;
    assert.equal(f.recovered()[0].links[0].lastRun?.tail, 'first result');
    assert.equal(f.recovered()[1].links[0].lastRun, null);
  } finally { finish.resolve({ ok: false, out: 'second failed' }); await running; }
  assert.equal(f.recovered()[1].links[0].lastRun.pass, false);
});

test('cancellation retains completed results and leaves unfinished and unstarted evidence alone', async t => {
  const f = await fixture(t, { count: 3 }), controller = new AbortController();
  let calls = 0;
  const result = await f.run(async () => {
    if (++calls === 1) return { ok: true, out: 'completed before cancel' };
    controller.abort(Error('human stop'));
    return { ok: false, aborted: true, out: 'unfinished output' };
  }, controller.signal);
  assert.equal(calls, 2); assert.match(result.text, /Run aborted: 2 not finished/);
  assert.equal(f.recovered()[0].links[0].lastRun.pass, true);
  assert.deepEqual(f.recovered().slice(1).map(task => task.links[0].lastRun), [null, null]);
});

test('a denied later execution preserves earlier evidence and the original error', async t => {
  const f = await fixture(t), failure = Error('native policy denied');
  let calls = 0;
  await assert.rejects(f.run(async () => {
    if (++calls === 1) return { ok: false, timedOut: true, out: 'deadline reached' };
    throw failure;
  }), error => error === failure);
  assert.equal(f.recovered()[0].links[0].lastRun.timedOut, true);
  assert.equal(f.recovered()[1].links[0].lastRun, null);
});

test('a native edit during a later command keeps both prior evidence history and the new ledger', async t => {
  const f = await fixture(t, { count: 3 }); let calls = 0;
  await assert.rejects(f.run(async () => {
    if (++calls === 1) return { ok: true, out: 'finished evidence' };
    f.session.append('todo/write', { todos: [{ content: 'New requirement', status: 'pending' }] });
    return { ok: true, out: 'stale result' };
  }), /任务清单已更新/);
  assert.equal(calls, 2); assert.equal(f.recovered()[0].title, 'New requirement');
  assert.ok(f.session.snapshotEvents().some(event => event.type === 'todo/write'
    && event.data.tasks?.[0].links[0].lastRun?.tail === 'finished evidence'));
});

test('an edit during result publication cannot be adopted as permission to overwrite new tasks', async t => {
  const f = await fixture(t); let calls = 0, edited = false;
  const append = f.session.append.bind(f.session);
  f.session.append = (type, data, ...args) => {
    const event = append(type, data, ...args);
    if (type === 'todo/write' && !edited && data.tasks?.[0].links[0].lastRun) {
      edited = true;
      append('todo/write', { todos: [{ content: 'Replacement during publication', status: 'pending' }] });
    }
    return event;
  };
  await assert.rejects(f.run(async () => ({ ok: true, out: `finished ${++calls}` })), /任务清单已更新/);
  assert.equal(calls, 1);
  assert.equal(f.recovered()[0].title, 'Replacement during publication');
});

test('duplicate task selection executes a task once and a later run still reruns it', async t => {
  const f = await fixture(t, { count: 1 }); let calls = 0;
  const execute = async () => ({ ok: true, out: `run ${++calls}` });
  await f.run(execute, undefined, ['T1', 'T1']);
  assert.equal(calls, 1); assert.equal(f.recovered()[0].links[0].lastRun.tail, 'run 1');
  await f.run(execute, undefined, ['T1']);
  assert.equal(calls, 2); assert.equal(f.recovered()[0].links[0].lastRun.tail, 'run 2');
});

test('registered verification binds file lookup and every command to one work directory', async t => {
  const f = await fixture(t), other = join(f.cwd, 'other'); await mkdir(other);
  let cwd = f.cwd; const calls = [], tools = new Map();
  const ctx = { get: key => key === 'workingDirectory' ? { get: () => cwd } : undefined,
    sessionProjections: { register() {} }, tools: {
      register: tool => tools.set(tool.name, tool),
      async execute(call) {
        calls.push(call);
        const text = await readFile(join(call.arguments.workdir, 'marker.txt'), 'utf8');
        cwd = other;
        return { isError: false, value: { kind: 'foreground', cwd: call.arguments.workdir, exitCode: 0, stdout: { text } } };
      },
    } };
  await writeFile(join(f.cwd, 'marker.txt'), 'original workspace');
  await writeFile(join(other, 'marker.txt'), 'different workspace');
  registerTasks(ctx, f.store);
  await tools.get('verify_link').execute({ op: 'run' }, { agent: { session: f.session }, callId: 'root-verification',
    token: {}, signal: new AbortController().signal });
  assert.deepEqual(calls.map(call => call.arguments.workdir), [f.cwd, f.cwd]);
  for (const task of f.recovered()) {
    assert.equal(task.links[0].lastRun.tail, 'original workspace');
    assert.equal(task.links[0].lastRun.execution.workdir, f.cwd);
    assert.equal(task.links[0].lastRun.execution.rootCallId, 'root-verification');
  }
});

test('Python uses one native execution deadline and never repeats a terminal result', async t => {
  const f = await fixture(t, { count: 1 }); await writeFile(join(f.cwd, 'check.py'), '');
  const record = f.store.snapshot(f.session); record.tasks[0].links[0].path = 'check.py'; f.session.append('todo/write', record);
  const timeouts = [];
  await f.run(async (_command, timeoutMs) => {
    timeouts.push(timeoutMs);
    return { ok: false, code: 5, out: 'script exit status 5' };
  });
  assert.deepEqual(timeouts, [300000]);
  assert.equal(f.recovered()[0].links[0].lastRun.pass, false);
});

test('execution provenance retains the actual native receipt directory', async t => {
  const f = await fixture(t, { count: 1 }), actual = join(f.cwd, 'resolved');
  const ctx = { tools: { execute: async () => ({ isError: false,
    value: { kind: 'foreground', cwd: actual, exitCode: 0, stdout: { text: 'passed' } } }) } };
  const result = await createVerificationRunner(ctx, { agent: { session: f.session }, signal: new AbortController().signal })('check', 300000);
  assert.equal(result.execution.workdir, actual);
});

test('a failing Python test cannot trigger a passing fallback by mentioning pytest in its output', async t => {
  const f = await fixture(t, { count: 1 }); await writeFile(join(f.cwd, 'check.py'), '');
  const record = f.store.snapshot(f.session); record.tasks[0].links[0].path = 'check.py'; f.session.append('todo/write', record);
  let calls = 0;
  await f.run(async () => ++calls === 1
    ? { ok: false, code: 1, out: 'FAILED test_dependency: AssertionError: No module named pytest' }
    : { ok: true, code: 0, out: 'bare script did not execute the test functions' });
  assert.equal(calls, 1);
  assert.equal(f.recovered()[0].links[0].lastRun.pass, false);
});
