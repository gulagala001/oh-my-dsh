import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { HubStore } from '../src/hub-store.mjs';
import { ContextStore } from '../src/context/store.mjs';
import { TemporaryChats } from '../src/temporary-chat.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const native = name => import(pathToFileURL(host.resolve('@deepseek-ai/dsh-' + name)));
const { Context } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis')));
const { createUserMessage, LlmAdapter } = await native('llm');
async function fixture(t, options = {}) {
  await mkdir(resolve('../.local/temporary-native-tests'), { recursive: true });
  const directory = await mkdtemp(resolve('../.local/temporary-native-tests/test-')), ctx = new Context(), requests = [], started = Promise.withResolvers();
  let service;
  t.after(async () => { await service?.dispose(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  ctx.provide('profileContext', { home: directory, dir: directory });
  for (const name of ['session', 'session-projection', 'agent', 'llm', 'system-prompt', 'tools', 'tool-executor-native', 'fs-local', 'working-directory', 'agent-loop']) {
    const module = await native(name); await ctx.plugin(module.default ?? module);
  }
  await ctx.plugin(await native('session-persistence-jsonl'), { root: join(directory, 'ordinary'), compression: 'none' });
  class Adapter extends LlmAdapter {
    async *stream(request, options) {
      requests.push(request);
      if (request.model === 'wait') {
        started.resolve();
        const signal = options?.signal ?? request.signal;
        if (signal) await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
      }
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'native reply' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'native reply' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.tools.register({ name: 'native_fixture', description: 'Synthetic tool', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: () => [] }, execute: () => 'ok' });
  const parent = await ctx.agents.create({ sessionId: 'ordinary-parent', agentOptions: { provider: 'fixture', model: 'local' }, meta: { cwd: directory } });
  service = new TemporaryChats(ctx, { directory: join(directory, 'temporary'), ...options });
  return { ctx, parent, service, directory, requests, started };
}
const send = (agent, text) => agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));

test('sidebar inherits the current working directory without changing the original permission root', { timeout: 15000 }, async t => {
  const f = await fixture(t), selected = join(f.directory, 'selected');
  await mkdir(selected);
  await f.ctx.workingDirectory.set(f.parent.agent, selected);
  const opened = await f.service.open(f.parent.agent.id), child = f.ctx.agents.get(opened.id);
  assert.equal(child.session.header.cwd, f.directory);
  assert.equal(f.ctx.workingDirectory.get(child.session), selected);
  assert.equal(f.requests.length, 0, 'opening must not start a model request');
  await f.ctx.workingDirectory.set(f.parent.agent, f.directory);
  assert.equal(f.ctx.workingDirectory.get(child.session), selected, 'later parent changes do not move the sidebar');
});

test('native sidebar sessions use native messages and tools, start blank, and erase only their own records', { timeout: 15000 }, async t => {
  const f = await fixture(t), ordinaryCreate = f.ctx.sessionPersistence.create;
  send(f.parent.agent, 'parent only'); await f.parent.agent.whenIdle();
  const created = await f.service.open(f.parent.agent.id), child = f.ctx.agents.get(created.id);
  assert.equal(f.requests.length, 1, 'opening does not dispatch a model call');
  assert.equal(child.session.header.cwd, f.directory);
  assert.equal(child.session.header.origin, undefined, 'user-operated session accepts normal native prompt routing');
  send(child, 'sidebar only'); await child.whenIdle();
  assert.ok(f.requests[1].tools.some(tool => tool.name === 'native_fixture'));
  assert.ok(!JSON.stringify(f.requests[1].messages).includes('parent only'));
  await f.ctx.sessionPersistence.flush();
  const saved = await f.ctx.sessionPersistence.open(created.id, 'read');
  assert.ok((await saved.read()).events.some(event => event.type === 'user/message'));
  await saved.close();
  const ownedPath = f.service.get(created.id).owner.path;
  await f.service.close(created.id);
  assert.equal(f.ctx.agents.get(created.id), undefined);
  assert.equal(f.ctx.sessions.get(created.id), undefined);
  assert.equal(await f.ctx.sessionPersistence.stat(created.id), undefined);
  await assert.rejects(readdir(ownedPath), { code: 'ENOENT' });
  assert.ok(await f.ctx.sessionPersistence.stat(f.parent.agent.id));
  assert.equal((await f.ctx.sessionPersistence.list()).length, 1);
  await f.service.dispose();
  assert.notEqual(f.ctx.sessionPersistence.create, ordinaryCreate, 'storage adapter uninstalls');
});

test('closing drains native descendant agents and refuses late descendants without touching the parent', { timeout: 15000 }, async t => {
  const f = await fixture(t), opened = await f.service.open(f.parent.agent.id);
  const child = await f.ctx.agents.create({ sessionId: 'native-descendant', meta: { parentSession: opened.id }, agentOptions: { provider: 'fixture', model: 'local' } });
  send(child.agent, 'child work'); await child.agent.whenIdle();
  await child.dispose();
  const resumed = await f.ctx.agents.resume({ resumeSessionId: child.agent.id, agentOptions: { provider: 'fixture', model: 'local' } });
  assert.ok(f.ctx.agents.get(resumed.agent.id));
  await f.service.close(opened.id);
  assert.equal(f.ctx.agents.get(child.agent.id), undefined);
  assert.equal(await f.ctx.sessionPersistence.stat(child.agent.id), undefined);
  await assert.rejects(f.ctx.agents.create({ sessionId: 'late-descendant', meta: { parentSession: opened.id } }), /已关闭/);
  assert.equal(f.ctx.agents.get(f.parent.agent.id), f.parent.agent);
});

test('unload during native creation waits for rollback and clears the temporary backend', { timeout: 15000 }, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.ctx.on('agent/created', async ({ agent }) => { if (agent.id.startsWith('omd-sidebar-')) { entered.resolve(); await release.promise; } }, { global: true });
  const opening = f.service.open(f.parent.agent.id), rejected = assert.rejects(opening, /已关闭/);
  await entered.promise;
  let finished = false;
  const disposing = f.service.dispose().then(() => { finished = true; });
  await new Promise(setImmediate); assert.equal(finished, false);
  release.resolve(); await rejected; await disposing;
  assert.deepEqual(await readdir(join(f.directory, 'temporary')), []);
  assert.deepEqual(f.ctx.agents.list().map(agent => agent.id), [f.parent.agent.id]);
});


test('closing an active native reply waits for its model cancellation and clears the session', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  f.parent.agent.session.append('model/selection', { provider: 'fixture', model: 'wait' });
  const opened = await f.service.open(f.parent.agent.id), child = f.ctx.agents.get(opened.id);
  // Set the pending native route on the side session, just as the model menu does.
  child.session.append('model/selection', { provider: 'fixture', model: 'wait' });
  send(child, 'waiting reply'); await f.started.promise;
  await f.service.close(opened.id);
  assert.equal(f.ctx.agents.get(opened.id), undefined);
  assert.equal(await f.ctx.sessionPersistence.stat(opened.id), undefined);
});


test('cleanup failure is retryable and OMD sidecar deletion preserves ordinary session data', { timeout: 15000 }, async t => {
  const f = await fixture(t), opened = await f.service.open(f.parent.agent.id);
  const hub = new HubStore(join(f.directory, 'sidecars')), context = new ContextStore(hub.dir);
  for (const id of [opened.id, f.parent.agent.id]) { hub.save(hub.state(id)); context.save(context.state(id)); }
  const ownedPath = f.service.get(opened.id).owner.path;
  let fail = true;
  f.service.storage.cleanup = async ids => {
    if (fail) throw Error('synthetic cleanup failure');
    for (const id of ids) { context.forget(id); hub.forget(id); }
  };
  await assert.rejects(f.service.close(opened.id), /synthetic cleanup failure/);
  assert.ok(await readdir(ownedPath)); assert.ok(hub.peek(opened.id));
  fail = false; await f.service.close(opened.id);
  assert.equal(hub.peek(opened.id), undefined); assert.equal(context.peek(opened.id), null);
  assert.ok(hub.peek(f.parent.agent.id)); assert.ok(context.peek(f.parent.agent.id));
});

test('expired renderer heartbeat retains a running sidebar but reclaims an abandoned idle one', { timeout: 10000 }, async t => {
  const f = await fixture(t, { idleMs: 100 });
  const { id } = await f.service.open(f.parent.agent.id), child = f.ctx.agents.get(id);
  child.session.append('model/selection', { provider: 'fixture', model: 'wait' });
  send(child, 'wait without a renderer'); await f.started.promise;
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(f.ctx.agents.get(id)?.status, 'running');
  await f.service.close(id);
  const idle = await f.service.open(f.parent.agent.id);
  const deadline = Date.now() + 3000;
  while (f.service.chats.has(idle.id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.service.chats.has(idle.id), false);
  await f.service.close(idle.id); // a lost close reply can be retried
});

test('restart reaps only proven orphan roots and fences late descendants', async t => {
  const f = await fixture(t), directory = join(f.directory, 'recovery');
  const id = 'omd-sidebar-1c8bb926-e2ff-4790-9537-d2da412b33b5';
  const module = new URL('../src/temporary-session-registry.mjs', import.meta.url);
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { TemporarySessionRegistry } from ${JSON.stringify(module.href)};
    import { mkdirSync } from 'node:fs';
    const [directory, id] = process.argv.slice(1);
    const registry = new TemporarySessionRegistry(directory, () => {});
    mkdirSync(registry.create(id)); registry.register(id, id); registry.register(id, 'old-child');
    process.exit(0);
  `, directory, id]);
  const live = await f.service.open(f.parent.agent.id), cleaned = [];
  const recovering = new TemporaryChats(f.ctx, { directory, cleanup: async ids => cleaned.push(...ids) });
  try {
    await recovering.close(id);
    assert.deepEqual(new Set(cleaned), new Set([id, 'old-child']));
    await assert.rejects(readdir(join(directory, id)), { code: 'ENOENT' });
    await assert.rejects(f.ctx.agents.create({sessionId:'late-grandchild',meta:{parentSession:'old-child'}}), /已关闭/);
    await assert.rejects(recovering.close('untracked-legacy-session'), e => e.statusCode === 409);
    assert.ok(f.ctx.agents.get(live.id));
  } finally { await recovering.dispose(); }
});
