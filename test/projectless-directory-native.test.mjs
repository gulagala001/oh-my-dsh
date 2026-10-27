import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installProjectlessDirectory } from '../src/projectless-directory.mjs';
import { createProjectlessWorkspaceService } from '../src/projectless-workspaces.mjs';

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

test('first-message naming uses one native model request and persists the directory', { timeout: 5000 }, async t => {
  const f = await fixture(t), { agent, cwd } = await f.create('first-chat');
  await f.send(agent, 'Build railway');
  assert.equal(f.requests.length, 1, 'directory initialization must not enqueue another model step');
  const named = join(cwd, 'Build railway');
  assert.equal(f.ctx.workingDirectory.get(agent.session), named);
  assert.equal(agent.session.header.cwd, cwd, 'immutable permission root is preserved');
  assert.ok(JSON.stringify(f.requests[0].messages).includes(named), 'the first request already contains its effective cwd');
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'working-directory/change').length, 1);
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source?.kind === 'working-directory').length, 0);
  const restored = Session.create(agent.session.id, agent.session.snapshotEvents(), agent.session.header);
  assert.equal(f.ctx.workingDirectory.get(restored), named, 'cold projection uses the durable native event');
  await f.send(agent, 'Continue');
  assert.equal(f.requests.length, 2);
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
