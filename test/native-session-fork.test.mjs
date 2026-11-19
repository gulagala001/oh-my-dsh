import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { HubStore } from '../src/hub-store.mjs';
import { forkParentOf, installForkProvenance } from '../src/host/session-fork.mjs';
import { forkArchiveSnapshot } from '../src/context/fork.mjs';
import { acquirePersona } from '../plugins/persona/src/index.mjs';
import { personalityPatch } from '../plugins/persona/src/shared/personality.mjs';
import { capturePromptStyle, completePromptStyle, inheritForkPromptStyle, sessionPromptStyle } from '../src/prompt-styles/session.mjs';
import { installPromptAdapter } from '../src/cc-adaptation/adapter.mjs';
import { PERSONALITY_SCOPE } from '../plugins/persona/src/shared/prompt.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { Context } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis')));
const { SessionStore } = await import(pathToFileURL(host.resolve('@deepseek-ai/dsh-session')));
const { SessionQueryEngine } = await import(pathToFileURL(host.resolve('@deepseek-ai/dsh-session-query')));

test('native independent forks retain only verified OMD archive lineage across concurrent calls and restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-fork-'));
  const ctx = new Context(), store = new HubStore(directory);
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  await ctx.plugin(SessionStore);
  const a = ctx.sessions.create('parent-a', { meta: { cwd: directory } });
  const b = ctx.sessions.create('parent-b', { meta: { cwd: directory } });
  for (const session of [a, b]) session.append('user/message', {
    id: 'message-' + session.id, role: 'user', source: { kind: 'plugin:oh-my-dsh:context-record' },
    content: [{ type: 'text', text: `[Context record archive-${session.id} · earlier text]` }],
  }, { surfaceOp: 'append' });
  ctx.provide('sessionPersistence', {});
  new SessionQueryEngine(ctx);
  let serial = 0;
  const nativeFork = async ({ sessionId }) => {
    await new Promise(resolve => setImmediate(resolve));
    // Native creation and announcement are real; only the public controller's
    // request routing is supplied by this fixture.
    const child = ctx.sessions.fork(sessionId, undefined, 'child-' + ++serial);
    return { sessionId: child.id };
  };
  const controller = { fork: nativeFork };
  ctx.provide('sessionController', controller);
  const scope = ctx.plugin({ apply: child => installForkProvenance(child, store) });
  await scope;
  const results = await Promise.all([ctx.sessionController.fork({ sessionId: a.id }), ctx.sessionController.fork({ sessionId: b.id })]);
  for (let i = 0; i < results.length; i++) {
    const child = ctx.sessions.get(results[i].sessionId), parent = [a, b][i];
    assert.equal(child.header.parentSession, undefined, 'native independence remains unchanged');
    const reopened = new HubStore(directory);
    assert.equal(forkParentOf(child.header, reopened), parent.id);
    const archive = { id: 'archive-' + parent.id, originalSeqs: [0], text: 'saved original' };
    const snapshot = forkArchiveSnapshot(child, {}, { peek: id => id === parent.id ? { records: [archive] } : undefined }, () => undefined, forkParentOf(child.header, reopened));
    assert.equal(snapshot.inheritedRecords[0].id, archive.id);
    assert.equal(snapshot.forkArchive.inheritedEventCount, child.inheritedEventCount);
  }
  const unrelated = ctx.sessions.fork(a.id, undefined, 'unrelated');
  assert.equal(forkParentOf(unrelated.header, store), undefined, 'do not infer ancestry outside a confirmed controller call');
  assert.equal(forkParentOf({ id: results[0].sessionId, isSeeded: true, origin: 'subagent' }, store), undefined);
  await scope.dispose();
  assert.equal(controller.fork, nativeFork);
});

test('native seeded activation and a later turn keep the completed parent settings without adding tools or messages', { timeout: 8000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-seeded-'));
  const ctx = new Context(), hub = { config: () => config, store: new HubStore(directory) };
  let config = { promptStyle: 'codex' };
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  ctx.provide('profileContext', { home: directory, dir: directory });
  const native = name => import(pathToFileURL(host.resolve('@deepseek-ai/dsh-' + name)));
  for (const name of ['session', 'session-projection', 'agent', 'llm', 'system-prompt', 'tools', 'tool-executor-native',
    'fs-local', 'working-directory', 'agent-loop', 'subagent', 'subagent-fork-in-process']) {
    const module = await native(name); await ctx.plugin(module.default ?? module, name === 'subagent-fork-in-process' ? { providerName: 'fork' } : undefined);
  }
  await ctx.plugin(await native('session-persistence-jsonl'), { root: join(directory, 'sessions-native') });
  await ctx.plugin((await native('session-query-sqlite')).default, { path: join(directory, 'sessions.sqlite') });
  const persona = await acquirePersona(ctx);
  persona.update(personalityPatch(persona.config(), 'economical'));
  const original = persona.config().identityPrompt;
  const { LlmAdapter, createUserMessage } = await native('llm');
  const requests = [];
  class Adapter extends LlmAdapter {
    async *stream(request) { requests.push(request); yield { type: 'finish', reason: { kind: 'stop' } }; }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.on('agent/created', ({ agent, source }) => inheritForkPromptStyle(hub, ctx.agents, agent, source), { global: true });
  ctx.on('session/event', (session, event) => {
    const agent = ctx.agents.get(session.id);
    if (agent && event.type === 'turn/start') capturePromptStyle(hub, agent, event.data.turn);
    if (agent && event.type === 'turn/end') completePromptStyle(agent, event);
  }, { global: true });
  const observed = [];
  ctx.systemPrompt.section({ name: 'oh-my-dsh:persona', order: 0, text: 'Unadapted fixture prompt' });
  ctx.provide('omd', { ...hub, persona });
  installPromptAdapter(ctx);
  const parentOnly = ['held_back', 'list_agents', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update', 'wait_agent'];
  for (const name of ['send_message', ...parentOnly]) {
    const properties = name === 'send_message' ? { agent: { type: 'string' }, message: { type: 'string' } } : {};
    ctx.tools.register({ name, description: name, parameters: { type: 'object', properties },
      output: { schema: { type: 'string' }, render: () => [] }, execute: () => '',
    }, { when: ({ agent }) => name === 'send_message' || agent.session.header.origin !== 'subagent' });
  }
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next();
    if (context.agent) observed.push({ id: context.agent.id, sections: assembly.sections });
    return assembly;
  }, { global: true, prepend: true });
  const parent = await ctx.agentLoop.create('parent', { provider: 'fixture', model: 'fixture' }, { cwd: directory });
  const send = (agent, text) => agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));
  send(parent, 'parent turn'); await parent.whenIdle();
  const lastEnd = parent.session.snapshotEvents().findLast(event => event.type === 'turn/end');
  assert.ok(lastEnd);
  config = { promptStyle: 'pi' };
  persona.update(personalityPatch(persona.config(), 'off'));
  const signal = new AbortController().signal, childId = 'seeded-child';
  const ended = () => new Promise(resolve => {
    const off = ctx.on('subagent/end', info => { if (info.id === childId) { off(); resolve(info); } }, { global: true });
  });
  const first = ended();
  const activation = await ctx.subagents.startActivation({ provider: 'fork', label: 'fixture', parent, childId,
    delivery: 'caller', prompt: [{ type: 'text', text: 'first child turn' }], signal });
  assert.equal((await activation.result).stopReason, 'completed');
  assert.equal((await first).stopReason, 'completed');
  assert.equal(ctx.agents.get(childId), undefined);
  const second = ended();
  const messageId = await ctx.subagents.sendMessage(parent, childId, [{ type: 'text', text: 'second child turn' }], { signal });
  assert.equal((await second).stopReason, 'completed');
  const saved = await ctx.sessionPersistence.open(childId, 'read');
  try {
    assert.equal(saved.header.isSeeded, true);
    assert.equal(saved.inheritedEventCount, lastEnd.seq + 1);
    const snapshot = (await saved.read()).events;
    const events = snapshot.slice(saved.inheritedEventCount);
    assert.equal(sessionPromptStyle(hub, { id: childId, header: saved.header, snapshotEvents: () => snapshot }), 'codex');
    const claimed = events.filter(event => event.type === 'user/message');
    assert.deepEqual(claimed.filter(event => ['user', 'agent-message'].includes(event.data.source.kind)).map(event => event.data.id), [activation.messageId, messageId]);
    assert.equal(events.filter(event => event.type === 'turn/end').length, 2);
  } finally { await saved.close(); }
  assert.equal(observed.filter(entry => entry.id === childId).length, 2);
  for (const { sections } of observed.filter(entry => entry.id === childId)) {
    const prompt = sections.map(section => section.text).join('\n');
    assert.match(prompt, /using the Codex system prompt style/);
    assert.ok(prompt.includes(original));
    assert.equal(prompt.split(PERSONALITY_SCOPE).length, 2);
    assert.ok(!prompt.includes('Unadapted fixture prompt'));
    assert.ok(sections.some(section => section.name === 'omd:execution-contract'));
  }
  assert.deepEqual(requests[0].tools.map(tool => tool.name), [...parentOnly, 'send_message'].sort());
  assert.deepEqual(requests.filter(request => request.sessionId === childId).map(request => request.tools.map(tool => tool.name)), [['send_message'], ['send_message']]);
});
