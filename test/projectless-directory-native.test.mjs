import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installProjectlessDirectory } from '../src/projectless-directory.mjs';
import { createProjectlessWorkspaceService } from '../src/projectless-workspaces.mjs';
import { protectedEvent } from '../src/context/core.mjs';
import { protectBcContext } from '../src/context/bc.mjs';

const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const native = name => import(host.resolve('@deepseek-ai/' + name));
const { Context } = await native('cordis');
const { LlmAdapter, createUserMessage } = await native('dsh-llm');
const { Session } = await native('dsh-session');

async function fixture(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'omd-directory-native-'));
  const ctx = new Context(), requests = [], errors = [];
  t.after(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); });
  for (const name of ['dsh-session', 'dsh-session-projection', 'dsh-agent', 'dsh-llm',
    'dsh-system-prompt', 'dsh-tools', 'dsh-fs-local', 'dsh-working-directory', 'dsh-agent-loop']) {
    await ctx.plugin((await native(name)).default);
  }
  class Adapter extends LlmAdapter {
    async *stream(options) {
      requests.push(structuredClone(options));
      yield { type: 'text-delta', index: 0, text: 'Done.' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.on('agent/error', ({ error }) => errors.push(error), { global: true });
  const workspaces = createProjectlessWorkspaceService({ root: join(root, 'chats'), storeDir: join(root, 'metadata') });
  await ctx.plugin({ apply(scope) { installProjectlessDirectory(scope, workspaces); } });
  const send = async (agent, text) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));
    await agent.activityDone;
    assert.deepEqual(errors, []);
    assert.equal(agent.inbox.hasPending, false);
  };
  const create = async id => {
    const draft = await workspaces.prepare({ requestId: id });
    const agent = await ctx.agentLoop.create(id, { provider: 'fixture', model: 'fixture' }, { cwd: draft.cwd });
    return { agent, cwd: draft.cwd };
  };
  return { ctx, root, requests, create, send, workspaces };
}

function assertModelDirectory(request, expected) {
  const snapshot = request.messages.findLast(message => message.source?.kind === 'runtime-context');
  assert.ok(snapshot, 'the model receives a native runtime-context snapshot');
  const directories = snapshot.source.sections.filter(section => section.name === 'working-directory:current');
  assert.deepEqual(directories.map(section => section.text), [`Current working directory: ${JSON.stringify(expected)}.`]);
  assert.ok(snapshot.content.some(block => block.type === 'text' && block.text.includes(directories[0].text)));
}

test('first-message naming uses one native model request and persists the directory', { timeout: 5000 }, async t => {
  const f = await fixture(t), { agent, cwd } = await f.create('first-chat');
  await f.send(agent, 'Build railway');
  assert.equal(f.requests.length, 1, 'directory initialization must not enqueue another model step');
  const named = join(cwd, 'Build railway');
  assert.equal(f.ctx.workingDirectory.get(agent.session), named);
  assert.equal(agent.session.header.cwd, cwd, 'immutable permission root is preserved');
  assertModelDirectory(f.requests[0], named);
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'working-directory/change').length, 1);
  const notices = f.requests[0].messages.filter(message => message.source?.kind === 'working-directory');
  assert.equal(notices.length, 0, 'initialization is silent; the current-directory snapshot is sufficient');
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source?.kind === 'working-directory').length, 0);
  const restored = Session.create(agent.session.id, agent.session.snapshotEvents(), agent.session.header);
  assert.equal(f.ctx.workingDirectory.get(restored), named, 'cold projection uses the durable native event');
  await f.send(agent, 'Continue');
  assert.equal(f.requests.length, 2);
  assertModelDirectory(f.requests[1], named);
  assert.equal(f.ctx.workingDirectory.get(agent.session), named);
});

test('manual directory changes and concurrent chat input retain native notifications', { timeout: 5000 }, async t => {
  const f = await fixture(t), first = await f.create('first'), second = await f.create('second');
  await Promise.all([f.send(first.agent, 'Same name'), f.send(second.agent, 'Same name')]);
  assert.equal(f.requests.length, 2);
  assert.notEqual(f.ctx.workingDirectory.get(first.agent.session), f.ctx.workingDirectory.get(second.agent.session));
  const manual = join(first.cwd, 'manual'); await mkdir(manual);
  await f.ctx.workingDirectory.set(first.agent, manual);
  assert.equal(first.agent.inbox.nextStep.length, 1);
  assert.equal(first.agent.inbox.nextStep[0].source.kind, 'working-directory');
  await f.send(first.agent, 'Continue after manual cd');
  assert.equal(f.requests.length, 3, 'pending native notice joins the next user request');
  assertModelDirectory(f.requests[2], manual);
  assert.equal(f.ctx.workingDirectory.get(first.agent.session), manual);
  assert.equal(second.agent.inbox.hasPending, false);
  await rm(manual, { recursive: true });
  assert.equal(await f.ctx.workingDirectory.ensure(first.agent), first.cwd);
  assert.equal(first.agent.inbox.nextStep[0].source.kind, 'working-directory', 'native missing-directory recovery still notifies');
});

test('cancelled initialization retries without suppressing unrelated live input', { timeout: 5000 }, async t => {
  const f = await fixture(t), { agent, cwd } = await f.create('cancelled');
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const nameDraft = f.workspaces.nameDraft;
  const mocked = t.mock.method(f.workspaces, 'nameDraft', async input => {
    const named = await nameDraft(input);
    entered.resolve(); await release.promise;
    return named;
  });
  t.after(() => release.resolve());
  const inject = agent.inject;
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Original name' }] }));
  await entered.promise;
  agent.cancel({ kind: 'user' }); release.resolve();
  await agent.activityDone;
  mocked.mock.restore();
  assert.equal(f.requests.length, 0);
  assert.equal(f.ctx.workingDirectory.get(agent.session), cwd);
  assert.equal(agent.inject, inject);
  agent.inject(createUserMessage({ source: { kind: 'plugin:fixture' }, content: [{ type: 'text', text: 'Retain this plugin input' }] }));
  await f.send(agent, 'Retry');
  assert.equal(f.requests.length, 1);
  assert.equal(f.ctx.workingDirectory.get(agent.session), join(cwd, 'Original name'));
  assert.ok(JSON.stringify(f.requests[0].messages).includes('Retain this plugin input'));
});

test('silent initialization preserves the native schedule of other queued input', { timeout: 5000 }, async t => {
  const f = await fixture(t), { agent } = await f.create('queued-input');
  const inserted = [], claimed = [], discarded = [];
  for (const [name, rows] of [['inserted', inserted], ['claimed', claimed], ['discarded', discarded]]) {
    f.ctx.on('agent/inbox/' + name, ({ message }) => { if (message.source.kind === 'working-directory') rows.push(message); }, { global: true });
  }
  let injected = false;
  f.ctx.on('agent/pre-step', (_event, next) => {
    if (!injected) {
      injected = true;
      agent.inject(createUserMessage({ source: { kind: 'plugin:fixture' }, content: [{ type: 'text', text: 'Separate next-step input' }] }));
    }
    return next();
  }, { global: true, prepend: true });
  await f.send(agent, 'First input');
  assert.equal(f.requests.length, 2, 'the extra step belongs to the separate plugin input');
  assert.equal(f.requests[0].messages.some(message => message.source.kind === 'plugin:fixture'), false);
  assert.equal(f.requests[1].messages.filter(message => message.source.kind === 'plugin:fixture').length, 1);
  assert.equal(f.requests[0].messages.filter(message => message.source.kind === 'working-directory').length, 0);
  assert.equal(f.requests[1].messages.filter(message => message.source.kind === 'working-directory').length, 0);
  assert.deepEqual(inserted, [], 'no initialization notice enters the inbox');
  assert.deepEqual(claimed, []);
  assert.deepEqual(discarded, [], 'initialization does not remove or cancel inbox messages');
});

test('a rejected first step retains the directory across cold restoration without a notice', { timeout: 5000 }, async t => {
  const f = await fixture(t), { agent, cwd } = await f.create('rejected-input');
  f.ctx.on('agent/pre-step', () => ({ kind: 'reject' }), { global: true });
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Retained name' }] }));
  await agent.activityDone;
  assert.equal(f.requests.length, 0);
  assert.equal(agent.inbox.nextStep.length, 0);
  const cold = await fixture(t);
  const handle = await cold.ctx.agentLoop.createAgent(cold.ctx, {
    sessionId: agent.session.id, seed: structuredClone(agent.session.snapshotEvents()), meta: agent.session.header,
    agentOptions: { provider: 'fixture', model: 'fixture' },
  });
  assert.equal(handle.agent.inbox.nextStep.length, 0);
  await cold.send(handle.agent, 'Retry the first input');
  assert.equal(cold.requests.length, 1);
  assert.deepEqual(cold.requests[0].messages.filter(message => message.source.kind === 'working-directory'), []);
  assertModelDirectory(cold.requests[0], join(cwd, 'Retained name'));
});

test('required cwd survives context suppression, tool execution and cold loop restoration', { timeout: 10000 }, async t => {
  const f = await fixture(t), { agent, cwd } = await f.create('execution-cwd');
  // The host's current mechanism refreshes required facts at request admission,
  // even if an assembly adapter removed them or optional context is disabled.
  f.ctx.systemPrompt.suppressRuntimeContext();
  f.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => ({ ...await next(), contexts: [] }), { global: true, prepend: true });
  for (const name of ['dsh-subprocess-local', 'dsh-bash-local', 'dsh-shell-env', 'dsh-tool-fs', 'dsh-tool-bash']) {
    const module = await native(name);
    await f.ctx.plugin(module.default ?? module);
  }
  await f.send(agent, 'Named workspace');
  const named = join(cwd, 'Named workspace');
  assert.equal(f.requests.length, 1);
  assertModelDirectory(f.requests[0], named);
  const execute = (name, args) => f.ctx.tools.execute({ agent, name, arguments: args, callId: 'probe-' + name, signal: new AbortController().signal });
  const written = await execute('write', { file_path: 'location.txt', content: 'written in the effective cwd' });
  assert.equal(written.isError, false, JSON.stringify(written));
  assert.equal(await readFile(join(named, 'location.txt'), 'utf8'), 'written in the effective cwd');
  await assert.rejects(readFile(join(cwd, 'location.txt')), { code: 'ENOENT' });
  const shell = await execute('bash', { command: 'pwd -P', description: 'Check the effective working directory' });
  assert.equal(shell.isError, false, JSON.stringify(shell));
  assert.equal(shell.value.cwd, named);
  assert.equal(shell.value.stdout.text.trim(), named);
  const event = agent.session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data.source?.kind === 'runtime-context');
  assert.equal(protectedEvent(agent.session, event), true, 'OMD compression protects the runtime snapshot');
  const bc = protectBcContext(f.requests[0], agent.session);
  assert.ok(bc.messages.at(-1).content[0].text.includes(`Current working directory: ${JSON.stringify(named)}.`));
  const cold = await fixture(t);
  const handle = await cold.ctx.agentLoop.createAgent(cold.ctx, {
    sessionId: agent.session.id, seed: structuredClone(agent.session.snapshotEvents()), meta: agent.session.header,
    agentOptions: { provider: 'fixture', model: 'fixture' },
  });
  await cold.send(handle.agent, 'Continue after restore');
  assert.equal(cold.requests.length, 1);
  assertModelDirectory(cold.requests[0], named);
  assert.equal(cold.ctx.workingDirectory.get(handle.agent.session), named);
});
