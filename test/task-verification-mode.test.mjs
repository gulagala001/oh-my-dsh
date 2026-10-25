import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Hub, message } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { contextConfig } from '../src/config.mjs';
import { registerTasks, currentTasks } from '../src/tasks.mjs';
import { installPromptAdapter } from '../src/cc-adaptation/adapter.mjs';
import { PROMPT_STYLES } from '../src/prompt-styles/options.mjs';
import { isTaskVerificationReminder } from '../src/task-context.mjs';

const native = createRequire(realpathSync(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const { Context } = await import(native.resolve('@deepseek-ai/cordis'));
const { ToolRuntime } = await import(native.resolve('@deepseek-ai/dsh-tools'));
const { SystemPrompt } = await import(native.resolve('@deepseek-ai/dsh-system-prompt'));
const { createScope } = await import(native.resolve('@deepseek-ai/dsh-scope'));

async function fixture(t, mode = 'native') {
  const directory = await mkdtemp(join(tmpdir(), 'omd-task-mode-')), root = new Context();
  let ctx = root;
  t.after(async () => { await root.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const config = contextConfig({ identityPrompt: 'Task mode fixture' });
  const hub = Object.assign(Object.create(Hub.prototype), { ctx, store: new HubStore(directory), config: () => config,
    taskReviews: new Map(), agents: new Map() });
  ctx.provide('omd', hub);
  ctx.provide('workingDirectory', { get: () => directory, ensure: async () => directory });
  ctx.provide('sessionProjections', { register() {}, stateOf: session => session.snapshotEvents().findLast(e => e.type === 'todo/write')?.data.todos ?? null });
  const runtime = { language: 'typescript', programFormat: 'repl', resolve: spec => spec, release() {},
    async run(spec) { return { logs: [], value: await spec.bindings[0].functions.verify_link({ op: 'view' }) }; } };
  ctx.provide('ptcRuntime', runtime);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime, { mode });
  await root.inject(['omd', 'systemPrompt', 'tools', 'sessionProjections', 'ptcRuntime'], scope => { ctx = scope; });
  const key = {}, owner = createScope(ctx, key).ctx;
  owner.systemPrompt.section({ name: 'oh-my-dsh:persona', text: 'placeholder', order: 0 });
  installPromptAdapter(owner);
  hub.todoStore = registerTasks(owner);
  const agent = (id, preference, parent) => {
    const session = Session.create(id, [], { ...Session.create(id).header, cwd: directory,
      ...(parent ? { origin: 'subagent', parentSession: parent.session.id } : {}) });
    if (preference) hub.store.update(hub.store.state(id), { betterTodo: preference });
    const notices = [], value = { session, steer: notice => notices.push(notice), notices };
    value.ctx = createScope(parent?.ctx ?? owner, value, { parent: parent ?? key }).ctx;
    hub.agents.set(id, value);
    return value;
  };
  let sequence = 0;
  const call = (agent, name, args) => ctx.tools.execute({ agent, name, arguments: args,
    callId: `call-${++sequence}`, signal: new AbortController().signal });
  const assemble = agent => ctx.systemPrompt.assemble({ agent, scope: agent });
  return { ctx, hub, config, directory, agent, assemble, call, runtime };
}

test('default and legacy BT preferences persist independently of the global default', async t => {
  const f = await fixture(t), a = f.agent('default'), oldOff = f.agent('old-off', { verification: false }), oldOn = f.agent('old-on', { verification: true });
  assert.equal(f.config.taskVerificationMode, 'default');
  assert.equal(f.hub.taskReminders(a.session).verificationMode, 'default');
  assert.equal(f.hub.taskReminders(oldOff.session).verificationMode, 'default');
  assert.equal(f.hub.taskReminders(oldOn.session).verificationMode, 'on');
  f.hub.setTaskReminders(a.session, { todo: false });
  f.config.taskVerificationMode = 'off';
  assert.equal(f.hub.taskReminders(a.session).verificationMode, 'off', 'Todo edits must not pin a verification preference');
  f.hub.setTaskReminders(a.session, { verificationMode: 'default' });
  f.hub.store = new HubStore(f.directory);
  assert.equal(f.hub.taskReminders(a.session).verificationMode, 'default');
  assert.equal(f.hub.taskReminders(a.session).todo, false);
  assert.equal(f.hub.taskReminders(oldOn.session).verificationMode, 'on');
  assert.throws(() => f.hub.setTaskReminders(a.session, { verificationMode: 'invalid' }), /档位/);
  for (const taskVerificationMode of [null, false, '', 'invalid']) assert.throws(() => contextConfig({ taskVerificationMode }));
});

test('first native and PTC assemblies in every prompt style omit disabled verification', async t => {
  for (const mode of ['native', 'ptc']) {
    const f = await fixture(t, mode);
    for (const { value: style } of PROMPT_STYLES) {
      f.config.promptStyle = style;
      const a = f.agent(`${mode}-${style}`, { verificationMode: 'off' });
      const assembly = await f.assemble(a);
      assert.equal(f.ctx.tools.get('verify_link', a), undefined, `${mode}/${style} lookup`);
      assert.ok(f.ctx.tools.get('todo_write', a));
      assert.ok(!assembly.tools.some(tool => tool.name === 'verify_link'));
      assert.doesNotMatch(JSON.stringify(assembly), /verify_link|Link evidence as each task|strongest available evidence|and verification links|Todo and verification continuation/);
      const result = await f.call(a, 'verify_link', { op: 'view' });
      assert.equal(result.isError, true, `${mode}/${style} execution`);
    }
  }
});

test('live switching updates discovery, SDKs and stale execution without changing another conversation', async t => {
  for (const mode of ['native', 'ptc']) {
    const f = await fixture(t, mode), a = f.agent(`${mode}-switch`), b = f.agent(`${mode}-other`);
    await f.assemble(a); await f.assemble(b);
    const old = f.ctx.tools.get('verify_link', a);
    const run = agent => f.call(agent, mode === 'ptc' ? 'run_code' : 'verify_link', mode === 'ptc' ? { code: 'verify', description: 'Read verification' } : { op: 'view' });
    const initial = await run(a);
    assert.equal(initial.isError, false, mode + ': ' + JSON.stringify(initial));
    for (const value of ['off', 'on', 'off', 'default']) {
      f.hub.setTaskReminders(a.session, { verificationMode: value });
      const assembly = await f.assemble(a);
      assert.equal(Boolean(f.ctx.tools.get('verify_link', a)), value !== 'off');
      assert.equal(JSON.stringify(assembly).includes('verify_link'), value !== 'off');
      assert.ok(f.ctx.tools.get('verify_link', b), 'Other conversation retains its tool');
      if (value === 'off') await assert.rejects(old.execute({ op: 'view' }, { agent: a }), /disabled/);
      else assert.equal((await run(a)).isError, false);
    }
    const child = f.agent(`${mode}-child`, undefined, a);
    await f.assemble(child);
    f.hub.setTaskReminders(a.session, { verificationMode: 'off' });
    assert.equal(f.ctx.tools.get('verify_link', child), undefined, 'Inherited child capability follows the parent');
    assert.equal((await run(child)).isError, true);
  }
});

test('default does not enforce evidence; on enforces it; off retires old reminders and keeps the ledger', async t => {
  const f = await fixture(t), a = f.agent('reminders'), s = a.session;
  await f.assemble(a);
  s.append('turn/start', { turn: 1 });
  s.append('todo/write', { tasks: [{ id: 'T1', title: 'Delivered', done: true, anchor: null, links: [] }] });
  const finish = () => f.hub.finishTasks(a, 1, new AbortController().signal);
  finish(); assert.equal(a.notices.length, 0);
  f.hub.setTaskReminders(s, { verificationMode: 'on' });
  finish(); assert.match(a.notices.at(-1).content[0].text, /lack qualifying evidence/);
  s.append('user/message', a.notices.at(-1), { surfaceOp: 'append' });
  s.append('user/message', message('[todo list] Every task is checked off, but these lack qualifying evidence:\nT1', 'task-reminder'), { surfaceOp: 'append' });
  const user = createUserMessage({ content: [{ type: 'text', text: 'Keep my phrase: lack qualifying evidence:' }], source: { kind: 'user' } });
  s.append('user/message', user, { surfaceOp: 'append' });
  await f.hub.todoStore.execVerifyLink(s, { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Observed output', reason: 'Manual check' }] }, f.directory);
  finish(); assert.match(a.notices.at(-1).content[0].text, /only evidence is a text record/);
  s.append('user/message', a.notices.at(-1), { surfaceOp: 'append' });
  const before = currentTasks(s), count = a.notices.length;
  f.hub.setTaskReminders(s, { verificationMode: 'off' });
  finish(); assert.equal(a.notices.length, count);
  assert.deepEqual(currentTasks(s), before);
  assert.equal(f.ctx.sessionProjections.stateOf(s)[0].content, 'Delivered');
  assert.ok(s.deriveMessages().some(m => m.id === user.id));
  assert.ok(!s.deriveMessages().some(isTaskVerificationReminder));
  assert.ok(s.snapshotEvents().some(e => e.type === 'user/message' && isTaskVerificationReminder(e.data)), 'History retains retired notices');
  f.hub.todoStore.execCheck(s, [{ id: 'T1', done: false }]); finish();
  assert.match(a.notices.at(-1).content[0].text, /Unresolved tasks/);
  assert.doesNotMatch(a.notices.at(-1).content[0].text, /evidence|L1/);
  f.hub.setTaskReminders(s, { verificationMode: 'on' });
  assert.match(f.ctx.sessionProjections.stateOf(s)[0].content, /text-only/);
});

test('disabling during a batch saves the running result and never starts the remaining checks', async t => {
  const f = await fixture(t), a = f.agent('batch'); await f.assemble(a);
  await writeFile(join(f.directory, 'check.mjs'), '');
  a.session.append('todo/write', { tasks: [1, 2].map(id => ({ id: `T${id}`, title: `Task ${id}`, done: true, anchor: null,
    links: [{ id: `L${id}`, kind: 'test', path: 'check.mjs', lastRun: null }] })) });
  let calls = 0;
  await assert.rejects(f.hub.todoStore.execVerifyLink(a.session, { op: 'run' }, f.directory, undefined, async () => {
    calls++; f.hub.setTaskReminders(a.session, { verificationMode: 'off' }); return { ok: true, out: 'Finished current command' };
  }), /disabled/);
  assert.equal(calls, 1);
  const tasks = currentTasks(a.session);
  assert.equal(tasks[0].links[0].lastRun.pass, true);
  assert.equal(tasks[1].links[0].lastRun, null);
});

test('global changes update live and cold conversations without overwriting explicit choices', async t => {
  const f = await fixture(t), a = f.agent('global'), b = f.agent('explicit', { verificationMode: 'on' });
  await f.assemble(a); await f.assemble(b);
  for (const mode of ['off', 'on', 'default']) {
    f.config.taskVerificationMode = mode;
    await f.ctx.parallel('app-boot/config-reload');
    assert.equal(Boolean(f.ctx.tools.get('verify_link', a)), mode !== 'off');
    assert.ok(f.ctx.tools.get('verify_link', b));
    assert.equal(f.hub.taskReminders(b.session).verificationMode, 'on');
  }
  f.hub.setTaskReminders(a.session, { verificationMode: 'off' });
  f.hub.store = new HubStore(f.directory);
  const reopened = f.agent('global');
  assert.doesNotMatch(JSON.stringify(await f.assemble(reopened)), /verify_link/);
});

test('an SDK function captured before closing cannot dispatch verification afterward', async t => {
  const f = await fixture(t, 'ptc'), a = f.agent('retained-sdk'); await f.assemble(a);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.runtime.run = async spec => {
    const old = spec.bindings[0].functions.verify_link;
    entered.resolve(); await release.promise;
    return { logs: [], value: await old({ op: 'link', links: [{ task: 'T1', kind: 'text', note: 'stale', reason: 'stale' }] }) };
  };
  a.session.append('todo/write', { tasks: [{ id: 'T1', title: 'Work', done: true, anchor: null, links: [] }] });
  const pending = f.call(a, 'run_code', { code: 'captured verification', description: 'Retained SDK regression' });
  try { await entered.promise; f.hub.setTaskReminders(a.session, { verificationMode: 'off' }); }
  finally { release.resolve(); }
  assert.equal((await pending).isError, true);
  assert.deepEqual(currentTasks(a.session)[0].links, []);
});
