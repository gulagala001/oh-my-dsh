import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm';
import { HubStore } from '../src/hub-store.mjs';
import { Hub } from '../src/hub.mjs';
import { createTodoStore } from '../src/todolist.mjs';
import { registerTasks, currentTasks, restoreTaskProjection } from '../src/tasks.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-ledger-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('ledger', undefined, { id: 'ledger', version: 3, createdAt: 1, cwd: dir, isSeeded: false });
  session.append('turn/start', { turn: 1 });
  const tools = new Map(); let projection;
  const store = registerTasks({ tools: { register(t) { tools.set(t.name, t); } }, sessionProjections: { register(p) { projection = p; } } });
  const tool = tools.get('todo_write'), verification = tools.get('verify_link');
  const call = (args, signal = new AbortController().signal) => tool.execute(args, { agent: { session }, signal });
  const verify = (args, signal = new AbortController().signal) => verification.execute(args, { agent: { session }, signal });
  const user = text => session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  return { dir, session, store, tool, verification, projection, call, verify, user };
}
const task = (title, from, to = from) => ({ title, anchor: { from, to } });
const quote = '登录必须支持邮箱验证码，还要有注册功能。';
const excerpt = { op: 'excerpt', from: '登录必须支持', to: '注册功能', tasks: [task('邮箱验证码登录', '登录必须支持', '邮箱验证码'), task('注册', '注册功能')] };

test('task tool preserves real excerpts and mandatory anchors, with atomic failures and stable IDs', async t => {
  const { session, tool, verification, call, verify, user } = setup(t); user(quote);
  assert.equal(Object.hasOwn(tool.parameters.properties, 'remove'), false);
  assert.equal(Object.hasOwn(tool.parameters.properties, 'links'), false);
  assert.equal(tool.parameters.properties.tasks.items.properties.anchor.properties.from.type, 'string');
  assert.equal(verification.parameters.properties.links.items.properties.task.type, 'string');
  assert.deepEqual(verification.parameters.properties.tasks.items, { type: 'string' });
  await assert.rejects(call({ op: 'link', links: [] }), /unknown op/);
  await assert.rejects(verify({ op: 'check', updates: [] }), /unknown op/);
  await assert.rejects(call({ ...excerpt, tasks: [{ title: 'missing anchor' }] }), /needs anchor/);
  assert.equal(session.snapshotEvents().filter(e => e.type === 'todo/write').length, 0);
  await call(excerpt);
  const snap = session.snapshotEvents().at(-1).data;
  assert.equal(snap.excerpts[0].text, '登录必须支持邮箱验证码，还要有注册功能');
  assert.deepEqual(snap.tasks.map(t => t.id), ['T1', 'T2']);
  assert.equal(currentTasks(session)[0].source, '登录必须支持邮箱验证码');
  await assert.rejects(call({ op: 'check', remove: ['T2'] }), /op:check requires updates/);
  assert.equal(currentTasks(session).length, 2);
  await call({ op: 'check', updates: [{ id: 'T1', done: true }] });
  await assert.rejects(call({ op: 'remove', ids: ['T2', 'missing'] }), /unknown task/);
  assert.equal(currentTasks(session).length, 2);
  await call({ op: 'remove', ids: ['T2'] });
  assert.deepEqual(currentTasks(session).map(t => [t.id, t.status]), [['T1', 'completed']]);
  await call({ op: 'add', tasks: [task('注册恢复', '注册功能')] });
  assert.deepEqual(currentTasks(session).map(t => t.id), ['T1', 'T3']);
});

test('excerpt failures identify the task outside its selection and preserve an atomic retry', async t => {
  const { session, call, verify, user } = setup(t);
  const text = '打开网页。填写姓名青禾。获取截图，保留标签页。下一步基于截图描述结果。'; user(text);
  const request = { op: 'excerpt', from: '打开网页', to: '保留标签页', tasks: [task('打开网页', '打开网页'), task('填写姓名', '填写姓名青禾'), task('描述截图', '下一步基于截图描述结果')] };
  await assert.rejects(call(request), error => {
    assert.match(error.message, /tasks\[2\]/);
    assert.match(error.message, /outside the selected excerpt/);
    assert.match(error.message, /下一步基于截图描述结果/);
    assert.match(error.message, /Selected excerpt from message \[1\]/);
    return true;
  });
  assert.equal(session.snapshotEvents().filter(e => e.type === 'todo/write').length, 0);
  await assert.rejects(verify({ op: 'link', links: [{ kind: 'text', note: 'observed screenshot', reason: 'interactive check' }] }), /links\[0\].task is required.*No tasks have been recorded/s);
  await call({ ...request, to: '下一步基于截图描述结果' });
  assert.deepEqual(currentTasks(session).map(t => t.id), ['T1', 'T2', 'T3']);
  assert.equal(currentTasks(session)[2].source, '下一步基于截图描述结果');
  await call({ op: 'edit', tasks: [{ id: 'T1', title: '打开测试网页', anchor: null }] });
  assert.equal(currentTasks(session)[0].source, '打开网页');
  await assert.rejects(verify({ op: 'link', links: [{ kind: 'text', note: 'observed', reason: 'interactive check' }] }), /Use an existing task ID: T1, T2, T3/);
});

test('ambiguous quotes require message/excerpt selection; punctuation changes preserve the actual quoted text', async t => {
  const { session, call, user } = setup(t); user(quote); user(quote);
  await assert.rejects(call(excerpt), /Add "msg"/);
  await call({ ...excerpt, msg: 2, from: '登录 必须：支持', tasks: [task('登录', '登录，必须支持', '邮箱验证码')] });
  assert.equal(session.snapshotEvents().at(-1).data.excerpts[0].msg, 2);
  assert.equal(currentTasks(session)[0].source, '登录必须支持邮箱验证码');
  await call({ ...excerpt, msg: 1, tasks: [] });
  await assert.rejects(call({ op: 'add', tasks: [task('另一任务', '注册功能')] }), /Add "excerpt"/);
  await call({ op: 'add', tasks: [{ title: '另一任务', anchor: { excerpt: 'E2', from: '注册功能', to: '注册功能' } }] });
  assert.match(await call({ op: 'transcript' }), /\[2\].*邮箱验证码/);
  assert.match(await call({ op: 'view' }), /E2 \[msg 1\]/);
});

test('linked tests really run; edits clear completion and evidence; replay preserves the full ledger', async t => {
  const { dir, session, call, verify, user, projection } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'check.mjs'), 'console.log("REAL_LEDGER_TEST_OK")');
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'test', path: 'check.mjs', cmd: 'node check.mjs' }] });
  assert.equal(currentTasks(session)[0].links[0].lastRun, null);
  const pendingView = await call({ op: 'view' });
  assert.equal(pendingView.match(/^  T1 /gm)?.length, 1);
  assert.equal(pendingView.match(/^  T2 /gm)?.length, 1);
  assert.match(pendingView, /E1 \[msg 1\].*登录必须支持邮箱验证码/);
  assert.ok(!pendingView.includes('L1'));
  const evidenceView = await verify({ op: 'view' });
  assert.match(evidenceView, /T1 .*邮箱验证码登录[^\n]*\n  L1 test check\.mjs \(node check\.mjs\) — not run yet/);
  assert.match(evidenceView, /T2 .*注册 — no links/);
  assert.match(await verify({ op: 'run', tasks: ['T1'] }), /PASS.*REAL_LEDGER_TEST_OK/);
  await call({ op: 'check', updates: [{ id: 'T1', done: true }] });
  assert.match(await verify({ op: 'view' }), /T1 \[done\][^\n]*\n  L1 [^\n]* — PASS/);
  const data = session.snapshotEvents().at(-1).data;
  assert.equal(data.tasks[0].links[0].lastRun.pass, true);
  assert.equal(projection.apply(data.todos, { type: 'turn/start' }), null, 'shared todos projection follows the stock turn reset');
  session.append('turn/start', { turn: 2 });
  const context = session.deriveMessages(), revision = session.seq;
  const projectionCtx = { sessionProjections: { stateOf: () => session.snapshotEvents().reduce(projection.apply, null) } };
  restoreTaskProjection(projectionCtx, session);
  assert.deepEqual(projectionCtx.sessionProjections.stateOf(), data.todos, 'X restores its persistent task dock');
  assert.deepEqual(session.deriveMessages(), context, 'restoring the dock adds no model-visible content');
  assert.equal(session.seq, revision + 1);
  restoreTaskProjection(projectionCtx, session);
  assert.equal(session.seq, revision + 1, 'the same turn does not keep republishing the dock');
  const replay = Session.create(session.id, JSON.parse(JSON.stringify(session.snapshotEvents())), session.header);
  assert.deepEqual(currentTasks(replay), currentTasks(session));
  await call({ op: 'edit', tasks: [{ id: 'T1', title: '更新登录要求' }] });
  const changed = currentTasks(session)[0];
  assert.equal(changed.status, 'pending'); assert.deepEqual(changed.links, []);
  assert.ok(existsSync(join(dir, 'check.mjs')));
});

test('task edits wait for running verification and then invalidate its evidence', async t => {
  const { dir, session, call, verify, user } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'held.mjs'), 'import {writeFileSync,existsSync} from "node:fs";writeFileSync("started","yes");while(!existsSync("release")) await new Promise(r=>setTimeout(r,10));console.log("REAL_PASS")');
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'test', path: 'held.mjs' }] });
  const ac = new AbortController(); t.after(() => ac.abort());
  const running = verify({ op: 'run', tasks: ['T1'] }, ac.signal);
  const end = Date.now() + 5000;
  while (!existsSync(join(dir, 'started')) && Date.now() < end) await new Promise(r => setTimeout(r, 10));
  assert.ok(existsSync(join(dir, 'started')));
  const editing = call({ op: 'edit', tasks: [{ id: 'T1', title: '新登录要求' }] });
  await new Promise(r => setImmediate(r));
  writeFileSync(join(dir, 'release'), 'yes');
  const [result] = await Promise.all([running, editing]); assert.match(result, /PASS.*REAL_PASS/);
  const item = currentTasks(session)[0];
  assert.equal(item.title, '新登录要求'); assert.equal(item.done, false); assert.deepEqual(item.links, []);
  assert.match(await verify({ op: 'view' }), /T1 .*新登录要求 — no links/);
});

test('text evidence retains its source and reason, and can be unlinked without affecting other tasks', async t => {
  const { session, call, verify, user } = setup(t); user(quote); await call(excerpt);
  await assert.rejects(verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'looked good' }] }), /requires reason/);
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Inspected app.ts:12', reason: 'No runnable environment in this fixture.' }] });
  const item = currentTasks(session)[0]; assert.equal(item.links[0].reason, 'No runnable environment in this fixture.');
  assert.match(await verify({ op: 'view' }), /T1 [^\n]*\n  L1 text — "Inspected app.ts:12" ⚠ text evidence — reason: "No runnable environment in this fixture\."/);
  await verify({ op: 'unlink', ids: ['L1'] }); assert.deepEqual(currentTasks(session)[0].links, []);
  assert.equal(currentTasks(session).length, 2);
});

test('FAIL, TIMEOUT and cancellation keep distinct real execution results', async t => {
  const { dir, session, user } = setup(t); user(quote);
  const store = createTodoStore({ runTimeoutMs: 1000 }); store.execTaskMap(session, excerpt);
  writeFileSync(join(dir, 'fail.mjs'), 'console.error("EXPECTED_FAILURE");process.exit(1)');
  await store.execVerifyLink(session, { op: 'link', links: [{ task: 'T1', kind: 'test', path: 'fail.mjs' }] }, dir);
  assert.match((await store.execVerifyLink(session, { op: 'run', tasks: ['T1'] }, dir)).text, /FAIL.*EXPECTED_FAILURE/);
  writeFileSync(join(dir, 'wait.mjs'), 'setTimeout(()=>{},10000)');
  await store.execVerifyLink(session, { op: 'link', links: [{ task: 'T2', kind: 'test', path: 'wait.mjs' }] }, dir);
  assert.match((await store.execVerifyLink(session, { op: 'run', tasks: ['T2'] }, dir)).text, /TIMEOUT/);
  const prior = store.snapshot(session).tasks[1].links[0].lastRun;
  const ac = new AbortController(); ac.abort();
  assert.match((await store.execVerifyLink(session, { op: 'run', tasks: ['T2'] }, dir, ac.signal)).text, /Run aborted/);
  assert.deepEqual(store.snapshot(session).tasks[1].links[0].lastRun, prior);
});

test('legacy X records remain visible without fabricating anchors or passed tests', async t => {
  const { session, call, user } = setup(t); user(quote);
  session.append('todo/write', { todos: [{ content: '旧任务', status: 'completed', source: '用户原话备注', verification: { method: 'read', result: '旧文字结果' } }] });
  assert.match(await call({ op: 'view' }), /legacy task/);
  let item = currentTasks(session)[0]; assert.equal(item.anchor, null); assert.equal(item.links.length, 0); assert.equal(item.verification.result, '旧文字结果');
  await call({ ...excerpt, tasks: [] });
  await call({ op: 'edit', tasks: [{ id: 'T1', anchor: { from: '注册功能', to: '注册功能' } }] });
  item = currentTasks(session)[0]; assert.equal(item.source, '注册功能'); assert.equal(item.status, 'pending'); assert.equal(item.verification, undefined);
});

test('failed V3 snapshot writes do not advance the task ledger', t => {
  const { session, user } = setup(t); user(quote);
  const store = createTodoStore();
  const failing = { id: session.id, snapshotEvents: () => session.snapshotEvents(), append() { throw Error('write failed'); } };
  assert.throws(() => store.execTaskMap(failing, excerpt), /write failed/);
  assert.equal(store.snapshot(session).tasks.length, 0); assert.equal(store.snapshot(session).excerpts.length, 0);
});

test('cancelling a running linked test stops its process and retains earlier evidence', async t => {
  const { dir, session, user } = setup(t); user(quote);
  const store = createTodoStore(); store.execTaskMap(session, excerpt);
  writeFileSync(join(dir, 'cancel.mjs'), 'console.log("PRIOR_PASS")');
  await store.execVerifyLink(session, { op: 'link', links: [{ task: 'T1', kind: 'test', path: 'cancel.mjs' }] }, dir);
  await store.execVerifyLink(session, { op: 'run', tasks: ['T1'] }, dir);
  const prior = store.snapshot(session).tasks[0].links[0].lastRun;
  writeFileSync(join(dir, 'cancel.mjs'), 'import {writeFileSync} from "node:fs";writeFileSync("started", "yes");setTimeout(()=>writeFileSync("should-not-exist", "no"), 10000)');
  const ac = new AbortController(), run = store.execVerifyLink(session, { op: 'run', tasks: ['T1'] }, dir, ac.signal);
  const end = Date.now() + 5000;
  while (!existsSync(join(dir, 'started')) && Date.now() < end) await new Promise(r => setTimeout(r, 10));
  assert.ok(existsSync(join(dir, 'started'))); ac.abort();
  assert.match((await run).text, /Run aborted/);
  assert.deepEqual(store.snapshot(session).tasks[0].links[0].lastRun, prior);
  assert.equal(existsSync(join(dir, 'should-not-exist')), false);
});

test('custom verification commands preserve a native program failure', async t => {
  const { dir, call, verify, user } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'failure check.mjs'), 'console.error("NATIVE_FAILURE");process.exit(7)');
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'test', path: 'failure check.mjs', cmd: 'node "failure check.mjs"' }] });
  assert.match(await verify({ op: 'run', tasks: ['T1'] }), /FAIL.*NATIVE_FAILURE/);
});

test('Windows verification runs PowerShell commands and ps1 files', { skip: process.platform !== 'win32' }, async t => {
  const { dir, call, verify, user } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'space check.ps1'), 'Write-Output "POWERSHELL_FILE_OK"\n');
  await verify({ op: 'link', links: [
    { task: 'T1', kind: 'test', path: 'space check.ps1' },
    { task: 'T2', kind: 'test', path: 'space check.ps1', cmd: '$value = 7; if ($value -ne 7) { throw "bad value" }; Write-Output "POWERSHELL_COMMAND_OK"' },
  ] });
  const result = await verify({ op: 'run' });
  assert.match(result, /PASS.*POWERSHELL_FILE_OK/);
  assert.match(result, /PASS.*POWERSHELL_COMMAND_OK/);
});

test('Windows verification reports terminating PowerShell errors as failures', { skip: process.platform !== 'win32' }, async t => {
  const { dir, call, verify, user } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'check.ps1'), 'Write-Output "unused"');
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'test', path: 'check.ps1', cmd: 'Write-Error "POWERSHELL_FAILURE"' }] });
  assert.match(await verify({ op: 'run' }), /FAIL[\s\S]*POWERSHELL_FAILURE/);
});

test('cancelling a shell verification stops its descendant process', async t => {
  const { dir, call, verify, user } = setup(t); user(quote); await call(excerpt);
  writeFileSync(join(dir, 'descendant.mjs'), 'import {writeFileSync} from "node:fs";let ticks=0;setInterval(()=>writeFileSync("ticks",String(++ticks)),20);process.send("ready")');
  writeFileSync(join(dir, 'parent.mjs'), 'import {fork} from "node:child_process";import {writeFileSync} from "node:fs";const child=fork("descendant.mjs");child.on("message",()=>writeFileSync("descendant.pid",String(child.pid)));setInterval(()=>{},1000)');
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'test', path: 'parent.mjs', cmd: 'node parent.mjs' }] });
  const ac = new AbortController(); let pid, timer;
  const run = verify({ op: 'run', tasks: ['T1'] }, ac.signal);
  try {
    const end = Date.now() + 10000;
    while ((!existsSync(join(dir, 'descendant.pid')) || !existsSync(join(dir, 'ticks'))) && Date.now() < end) await new Promise(r => setTimeout(r, 20));
    assert.ok(existsSync(join(dir, 'descendant.pid')));
    pid = Number(readFileSync(join(dir, 'descendant.pid'), 'utf8'));
    ac.abort();
    const result = await Promise.race([run, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Descendant kept the verification alive')), 5000); })]);
    assert.match(result, /Run aborted/);
    const ticks = readFileSync(join(dir, 'ticks'), 'utf8');
    await new Promise(r => setTimeout(r, 200));
    assert.equal(readFileSync(join(dir, 'ticks'), 'utf8'), ticks);
  } finally {
    clearTimeout(timer); ac.abort();
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await run;
  }
});

test('failed evidence snapshot writes leave links and counters unchanged', async t => {
  const { dir, session, user } = setup(t); user(quote);
  const store = createTodoStore(); store.execTaskMap(session, excerpt);
  const failing = { id: session.id, snapshotEvents: () => session.snapshotEvents(), append() { throw Error('write failed'); } };
  await assert.rejects(store.execVerifyLink(failing, { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'read file', reason: 'fixture only' }] }, dir), /write failed/);
  assert.equal(store.snapshot(session).tasks[0].links.length, 0); assert.equal(store.snapshot(session).nextL, 1);
});

test('stopping reminders restore unfinished tasks, missing evidence and one-time text review', async t => {
  const { session, store, call, verify, user } = setup(t), notices = [];
  const hub = Object.assign(Object.create(Hub.prototype), { todoStore: store, taskReviews: new Map(), store: new HubStore(session.header.cwd) });
  hub.setTaskReminders(session, { todo: true, verification: true });
  const agent = { session, steer: notice => notices.push(notice) }, signal = new AbortController().signal;
  const stop = () => hub.finishTasks(agent, 1, signal);
  stop(); assert.equal(notices.length, 0);
  user(quote); await call(excerpt);
  stop(); assert.match(notices.at(-1).content[0].text, /^\[todo list\] Unresolved tasks remain:\nT1 \[    \].*\nT2/);
  await call({ op: 'check', updates: [{ id: 'T1', done: true }, { id: 'T2', done: true }] });
  stop(); assert.match(notices.at(-1).content[0].text, /^\[todo list\] Every task is checked off, but these lack qualifying evidence:/);
  assert.ok(notices.at(-1).content[0].text.endsWith('Link real evidence, or uncheck what is not actually done.'));
  await verify({ op: 'link', links: ['T1', 'T2'].map(task => ({ task, kind: 'text', note: 'Inspected fixture source.', reason: 'No runnable target in this fixture.' })) });
  stop();
  const review = notices.at(-1), text = review.content[0].text;
  assert.match(text, /^\[todo list\] Tasks whose only evidence is a text record:/);
  assert.ok(text.includes('your reason no higher rung was runnable: "No runnable target in this fixture."'));
  assert.ok(text.endsWith('Re-check each reason against what is actually available here. If a higher rung is runnable after all, build and link it; if not, they stay as they are.'));
  assert.equal(store.snapshot(session).tasks[0].links[0].asked, false);
  session.append('user/message', review, { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'Rechecked both reasons.' }], source: { provider: 'fixture', model: 'fixture' } }) }, { surfaceOp: 'append' });
  const before = notices.length, revision = store.revOf(session);
  stop(); assert.equal(notices.length, before); assert.equal(store.revOf(session), revision);
  assert.ok(store.snapshot(session).tasks.every(t => t.links[0].asked));
  assert.equal(session.snapshotEvents().at(-1).data.quiet, true);
  const restored = createTodoStore(); assert.equal(restored.textReviewText(session), undefined);
  await verify({ op: 'unlink', ids: ['L1'] });
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'New observation.', reason: 'Fixture still cannot run.' }] });
  stop(); assert.equal(notices.length, before + 1); assert.match(notices.at(-1).content[0].text, /L3 text/);
});

test('review acknowledgement only marks shown links and remains atomic on failed persistence', async t => {
  const { session, store, call, verify, user } = setup(t); user(quote); await call(excerpt);
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'First observation.', reason: 'Fixture only.' }] });
  const shown = store.textReviewLinkIds(session);
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Later observation.', reason: 'Fixture only.' }] });
  const failing = { id: session.id, snapshotEvents: () => session.snapshotEvents(), append() { throw Error('write failed'); } };
  assert.throws(() => store.markTextReviewed(failing, shown), /write failed/);
  assert.ok(store.snapshot(session).tasks[0].links.every(l => l.asked === false));
  store.markTextReviewed(session, shown);
  assert.deepEqual(store.snapshot(session).tasks[0].links.map(l => l.asked), [true, false]);
});

test('stopping reminders respect cancellation, planning and subagents; an unanswered review is retried', async t => {
  const { session, store, call, verify, user } = setup(t), notices = [];
  user(quote); await call({ ...excerpt, tasks: [excerpt.tasks[0]] });
  await call({ op: 'check', updates: [{ id: 'T1', done: true }] });
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Observed source.', reason: 'Fixture only.' }] });
  const hub = Object.assign(Object.create(Hub.prototype), { todoStore: store, taskReviews: new Map(), store: new HubStore(session.header.cwd) });
  hub.setTaskReminders(session, { todo: true, verification: true });
  const agent = { session, steer: m => notices.push(m) }, ac = new AbortController();
  hub.finishTasks(agent, 1, ac.signal); const review = notices.at(-1);
  session.append('user/message', review, { surfaceOp: 'append' });
  ac.abort(); hub.finishTasks(agent, 1, ac.signal);
  assert.equal(store.snapshot(session).tasks[0].links[0].asked, false);
  const signal = new AbortController().signal;
  hub.finishTasks(agent, 2, signal); assert.equal(notices.length, 2);
  const count = notices.length;
  session.append('plan/mode', { active: true });
  hub.finishTasks(agent, 2, signal); assert.equal(notices.length, count);
  session.append('plan/mode', { active: false });
  const child = { ...agent, session: { id: session.id, header: { ...session.header, origin: 'subagent' } } };
  hub.finishTasks(child, 2, signal); assert.equal(notices.length, count);
});

test('BT switches control todo and verification reminders independently', async t => {
  const { session, store, call, verify, user } = setup(t), notices = [];
  const hub = Object.assign(Object.create(Hub.prototype), { todoStore: store, taskReviews: new Map(), store: new HubStore(session.header.cwd) });
  const agent = { session, steer: notice => notices.push(notice) }, signal = new AbortController().signal;
  const stop = () => hub.finishTasks(agent, 1, signal);
  assert.deepEqual(hub.taskReminders(session), { todo: true, verification: false });
  user(quote); await call(excerpt);
  await call({ op: 'check', updates: [{ id: 'T2', done: true }] });
  stop();
  assert.match(notices.at(-1).content[0].text, /Unresolved tasks remain:\nT1/);
  assert.doesNotMatch(notices.at(-1).content[0].text, /T2|evidence|no link/);
  hub.setTaskReminders(session, { todo: false });
  let count = notices.length; stop(); assert.equal(notices.length, count);
  assert.deepEqual(currentTasks(session).map(t => t.done), [false, true]);
  hub.setTaskReminders(session, { verification: true });
  stop();
  assert.match(notices.at(-1).content[0].text, /^\[todo list\] These tasks lack qualifying evidence:/);
  assert.doesNotMatch(notices.at(-1).content[0].text, /Every task is checked off/);
  await verify({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Observed the source.', reason: 'Fixture only.' }] });
  stop();
  assert.match(notices.at(-1).content[0].text, /T2/);
  assert.doesNotMatch(notices.at(-1).content[0].text, /T1/);
  await verify({ op: 'link', links: [{ task: 'T2', kind: 'text', note: 'Observed the result.', reason: 'Fixture only.' }] });
  stop(); assert.match(notices.at(-1).content[0].text, /Tasks whose only evidence is a text record/);
  assert.ok(hub.taskReviews.has(session.id));
  hub.setTaskReminders(session, { verification: false });
  assert.equal(hub.taskReviews.has(session.id), false);
  count = notices.length; stop(); assert.equal(notices.length, count);
  assert.ok(store.snapshot(session).tasks.every(t => !t.links[0].asked));
  hub.setTaskReminders(session, { verification: true });
  stop(); assert.match(notices.at(-1).content[0].text, /Tasks whose only evidence is a text record/);
  hub.setTaskReminders(session, { todo: true, verification: false });
  await call({ op: 'check', updates: [{ id: 'T1', done: true }] });
  count = notices.length; stop(); assert.equal(notices.length, count);
});

test('BT choices persist per session and a failed save keeps the previous choices', t => {
  const { session } = setup(t);
  const hub = Object.assign(Object.create(Hub.prototype), { taskReviews: new Map(), store: new HubStore(session.header.cwd) });
  hub.setTaskReminders(session, { todo: false, verification: true });
  const other = { id: 'other' };
  assert.deepEqual(hub.taskReminders(other), { todo: true, verification: false });
  hub.store = new HubStore(session.header.cwd);
  assert.deepEqual(hub.taskReminders(session), { todo: false, verification: true });
  const saved = hub.store.save;
  hub.store.save = () => { throw Error('save failed'); };
  assert.throws(() => hub.setTaskReminders(session, { todo: true, verification: false }), /save failed/);
  assert.deepEqual(hub.taskReminders(session), { todo: false, verification: true });
  hub.store.save = saved;
});
