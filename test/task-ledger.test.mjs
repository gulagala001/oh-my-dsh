import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createTodoStore } from '../src/todolist.mjs';
import { registerTasks, currentTasks } from '../src/tasks.mjs';

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
  assert.deepEqual(tool.parameters.properties.tasks.items, { type: 'object' });
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
  assert.equal(projection.apply(data.todos, { type: 'turn/start' }), data.todos);
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
  const store = createTodoStore({ runTimeoutMs: 250 }); store.execTaskMap(session, excerpt);
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

test('failed evidence snapshot writes leave links and counters unchanged', async t => {
  const { dir, session, user } = setup(t); user(quote);
  const store = createTodoStore(); store.execTaskMap(session, excerpt);
  const failing = { id: session.id, snapshotEvents: () => session.snapshotEvents(), append() { throw Error('write failed'); } };
  await assert.rejects(store.execVerifyLink(failing, { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'read file', reason: 'fixture only' }] }, dir), /write failed/);
  assert.equal(store.snapshot(session).tasks[0].links.length, 0); assert.equal(store.snapshot(session).nextL, 1);
});
