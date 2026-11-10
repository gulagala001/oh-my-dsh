import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { Session, SessionStore } from '@deepseek-ai/dsh-session';
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { mountRuntimeLifecycle } from '../src/runtime-lifecycle.mjs';

await mkdir(resolve('.local'), { recursive: true });

const load = file => import(process.env.OMD_RUNTIME_TEST_ROOT
  ? pathToFileURL(resolve(process.env.OMD_RUNTIME_TEST_ROOT, file)) : new URL('../' + file, import.meta.url));
const [{ ContextPipeline }, { createHostAdapter }, { ContextStore }, { Hub }, { taskContextMeta, setRuntimeContext, latestTaskContext }] = await Promise.all([
  'src/context/pipeline.mjs', 'src/context/host.mjs', 'src/context/store.mjs', 'src/hub.mjs', 'src/task-context.mjs',
].map(load));
const user = (session, text, extra = {}) => session.append('user/message', {
  ...createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), ...extra,
}, { surfaceOp: 'append' });
function seed(session) {
  const original = user(session, 'Keep the user request, evidence and task list.');
  user(session, '[todo list]\n[ ] T1 Finish\n\nRuntime: sampled state', {
    source: { kind: 'plugin:oh-my-dsh:tasks' },
    omdTaskContext: { todoText: '[todo list]\n[ ] T1 Finish', runtime: { text: 'Runtime: sampled state' } },
  });
  user(session, 'Runtime: sampled budget', { source: { kind: 'plugin:oh-my-dsh:tasks' },
    omdTaskContext: { todoText: null, runtime: { text: 'Runtime: sampled budget' } } });
  return original;
}
async function fixture(t, { native = false, hubInstance = false } = {}) {
  const dir = await mkdtemp(resolve('.local/runtime-retirement-'));
  const ctx = native || hubInstance ? new Context() : null;
  let handle, detach;
  if (native) { await ctx.plugin(SessionStore); await ctx.plugin(Persistence, { root: join(dir, 'sessions'), compression: 'none' }); }
  const session = native ? ctx.sessions.prepare('retirement', { meta: { cwd: dir } }) : Session.create('retirement');
  if (native) { handle = await ctx.sessionPersistence.create(session.header); detach = ctx.sessions.enter(session); ctx.sessions.announce(session); }
  const owner = { session, status: 'idle' };
  const hub = hubInstance ? new Hub(ctx, { dataDir: join(dir, 'omd'), memoryCacheEnabled: false }) : {
    store: { dir: join(dir, 'omd') }, ctx: ctx ?? { sessions: { async flush() { return true; } } },
    config: () => ({ memoryCacheEnabled: false, contextEnabled: false }), action() {}, event() {},
  };
  hub.scope = () => ({ mode: 'session', project: session.id });
  const pipeline = hub.context ??= new ContextPipeline(hub, createHostAdapter(hub));
  pipeline.agents.set(session.id, owner); hub.agents?.set(session.id, owner);
  const original = seed(session), before = structuredClone(session.snapshotEvents());
  if (native) assert.equal(await ctx.sessions.flush(session), true);
  const state = pipeline.state(session); pipeline.store.save(state);
  t.after(async () => {
    try { if (hubInstance) await hub.close(); else await pipeline.dispose(); }
    finally { await handle?.close(); detach?.(); await ctx?.fiber.dispose(); await rm(dir, { recursive: true, force: true }); }
  });
  return { ctx, hub, pipeline, session, state, original, before, handle, detach, dir,
    saved: () => new ContextStore(hub.store.dir).peek(session.id) };
}

for (const persisted of [false, true]) test(`runtime removal recovers the same operation ids after ${persisted ? 'durable' : 'unpersisted'} append`, async t => {
  const f = await fixture(t), { pipeline, session, before } = f;
  let flushes = 0;
  pipeline.adapter.flush = async () => { if (++flushes === 2) throw Error('final flush failed'); return true; };
  await assert.rejects(pipeline.stripRuntime(session), /final flush failed/);
  const saved = f.saved(), ids = saved.transaction.operations.map(op => op.id);
  assert.ok(Object.keys(saved.transaction.applied).length);
  assert.equal(session.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
  const events = persisted ? structuredClone(session.snapshotEvents()) : before;
  const replay = Session.create(session.id, events, session.header);
  const recovered = new ContextPipeline(f.hub, createHostAdapter(f.hub));
  t.after(() => recovered.dispose());
  const result = await recovered.stripRuntime(replay);
  assert.equal(result.id, saved.transaction.id);
  assert.equal(f.saved().transaction, null);
  const current = replay.snapshotEvents();
  assert.deepEqual(current.slice(0, before.length), before);
  for (const id of ids) assert.equal(current.filter(e => (e.type === 'user/message' ? e.data : e.data?.message)?.id === id).length, 1);
  assert.equal(replay.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
  assert.ok(replay.deriveMessages().some(m => m.content.some(b => b.text === '[todo list]\n[ ] T1 Finish')));
  const count = current.length;
  assert.equal(await recovered.stripRuntime(replay), null);
  assert.equal(replay.snapshotEvents().length, count);
});

test('native flush and a failed WAL commit recover after exclusive cold reopen', async t => {
  const f = await fixture(t, { native: true }), { pipeline, session, ctx } = f;
  const save = pipeline.store.save.bind(pipeline.store); let failed = false;
  pipeline.store.save = state => {
    if (!state.transaction && !failed) { failed = true; throw Error('WAL commit failed'); }
    return save(state);
  };
  await assert.rejects(pipeline.stripRuntime(session), /WAL commit failed/);
  pipeline.store.save = save;
  const tx = f.saved().transaction, ids = tx.operations.map(op => op.id);
  await assert.rejects(ctx.sessionPersistence.open(session.id, 'write'), error => /own/i.test(error.message));
  await f.handle.close(); f.detach();
  assert.equal(ctx.sessions.get(session.id), undefined);
  const cold = await ctx.sessionPersistence.open(session.id, 'write');
  try {
    const { events, eventState } = await cold.read();
    assert.ok(ids.every(id => events.some(e => (e.type === 'user/message' ? e.data : e.data?.message)?.id === id)));
    const replay = Session.fromRestore(session.id, events, cold.header, cold.inheritedEventCount, eventState);
    const resumedCount = replay.snapshotEvents().length;
    let cursor = events.length;
    const recovered = new ContextPipeline(f.hub, { ...pipeline.adapter, async flush(value) {
      const tail = value.snapshotEvents().slice(cursor);
      await cold.append(tail); cursor += tail.length; await cold.flush(); return true;
    } });
    try {
      await recovered.stripRuntime(replay);
      assert.equal(f.saved().transaction, null);
      assert.equal(replay.snapshotEvents().length, resumedCount, 'already durable operations are never duplicated');
      assert.equal((await cold.read()).events.length, resumedCount, 'the native resume marker and recovered checkpoint are durable');
    } finally { await recovered.dispose(); }
  } finally { await cold.close(); }
});

for (const result of [false, undefined]) test(`missing native flush receipt (${result}) retains the write-ahead transaction`, async t => {
  const f = await fixture(t);
  f.hub.ctx.sessions.flush = async () => result;
  await assert.rejects(f.pipeline.stripRuntime(f.session), /持久化未确认/);
  assert.ok(f.saved().transaction);
  assert.deepEqual(f.session.snapshotEvents(), f.before, 'the runtime phase must not append without its initial checkpoint');
});

test('hub shutdown does not mutate a still-registered session whose native writer has closed', async t => {
  const f = await fixture(t, { native: true, hubInstance: true });
  setRuntimeContext(f.session, () => ({ text: 'live provider' }));
  await f.handle.close();
  assert.equal(f.ctx.sessions.get(f.session.id), f.session, 'the native registry is not a write lease');
  await f.hub.close();
  assert.deepEqual(f.session.snapshotEvents(), f.before);
  assert.equal(f.saved().transaction, null);
  assert.equal(latestTaskContext(f.session).meta.runtime, null);
});

test('shutdown waits for an entered runtime retirement and preserves its actual failure', async t => {
  const f = await fixture(t, { hubInstance: true }), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const error = Error('native flush failed');
  f.pipeline.adapter.flush = async () => { entered.resolve(); await release.promise; throw error; };
  const work = f.pipeline.stripRuntime(f.session), rejected = assert.rejects(work, e => e === error);
  await entered.promise;
  let closed = false;
  const closing = f.hub.close().finally(() => { closed = true; });
  const shutdown = assert.rejects(closing, e => e instanceof AggregateError && e.errors.includes(error));
  await new Promise(setImmediate); assert.equal(closed, false);
  release.resolve(); await rejected; await shutdown;
  assert.ok(f.saved().transaction);
  assert.deepEqual(f.session.snapshotEvents(), f.before);
  // The explicit failure is already asserted; the fixture should not rethrow it.
  f.hub.close = async () => {};
});

test('retirement queued before shutdown but not entered cannot create or recover a transaction', async t => {
  const f = await fixture(t, { hubInstance: true });
  const prior = { id: 'retained-wal', source: 'runtime-disable', operations: [], applied: {}, records: [], traceSlot: null };
  f.state.transaction = prior; f.pipeline.store.save(f.state);
  const work = f.pipeline.stripRuntime(f.session);
  await f.hub.close(); await work;
  assert.deepEqual(f.saved().transaction, prior);
  assert.deepEqual(f.session.snapshotEvents(), f.before);
  assert.equal(await f.pipeline.stripRuntime(f.session), null);
});

test('shutdown during recovery cannot admit a new runtime-removal transaction afterwards', async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.state.transaction = { id: 'prior-wal', source: 'runtime-disable', operations: [], applied: {}, records: [], traceSlot: null };
  f.pipeline.store.save(f.state);
  f.pipeline.adapter.flush = async () => { entered.resolve(); await release.promise; return true; };
  const work = f.pipeline.stripRuntime(f.session); await entered.promise;
  const disposing = f.pipeline.dispose(); release.resolve(); await disposing; await work;
  assert.equal(f.saved().transaction, null, 'only the entered recovery completes');
  assert.deepEqual(f.session.snapshotEvents(), f.before, 'no new removal transaction starts after closing');
});

async function nativeOwnerFixture(t, controls = {}) {
  const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const native = name => import(host.resolve('@deepseek-ai/' + name));
  const dir = await mkdtemp(resolve('.local/runtime-owner-')), ctx = new Context(), requests = [], errors = [];
  for (const name of ['dsh-session', 'dsh-session-projection', 'dsh-agent', 'dsh-llm',
    'dsh-system-prompt', 'dsh-tools', 'dsh-tool-executor-native', 'dsh-agent-loop']) {
    const module = await native(name); await ctx.plugin(module.default ?? module);
  }
  await ctx.plugin(Persistence, { root: join(dir, 'sessions'), compression: 'none' });
  const { LlmAdapter } = await native('dsh-llm');
  class Adapter extends LlmAdapter {
    async *stream(options) {
      requests.push(options.messages);
      await controls.stream?.(options);
      yield { type: 'text-delta', index: 0, text: 'Done.' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.on('agent/error', ({ error }) => errors.push(error), { global: true });
  let hub, resourcesReleased = false;
  const runtime = ctx.plugin({ name: 'runtime-retirement-fixture', inject: ['sessions', 'sessionPersistence', 'agents'], apply(parent) { return mountRuntimeLifecycle(parent, scope => {
    hub = new Hub(scope, { dataDir: join(dir, 'omd'), contextEnabled: false, memoryCacheEnabled: false });
    hub.scope = () => ({ mode: 'session', project: 'owner' });
    scope.effect(() => () => { resourcesReleased = true; });
    if (controls.preStep) scope.on('agent/request', async ({ agent, signal }, next) => {
      const route = await next();
      hub.runtimeRetirement.track(agent);
      await hub.context.preStep(agent, signal, route);
      return route;
    }, { global: true });
  }); } });
  await runtime;
  const handle = await ctx.agents.create({ sessionId: 'owner', meta: { cwd: dir }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  const agent = handle.agent, session = agent.session;
  hub.runtimeRetirement.track(agent); hub.agents.set(session.id, agent); hub.context.agents.set(session.id, agent);
  seed(session); await ctx.sessions.flush(session); hub.context.state(session);
  const before = structuredClone(session.snapshotEvents()), releases = [];
  t.after(async () => {
    for (const release of releases) release();
    await Promise.allSettled([hub.close(), handle.dispose(), runtime.dispose()]);
    await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true });
  });
  return { dir, ctx, hub, runtime, agent, session, handle, before, requests, errors, releases, resourcesReleased: () => resourcesReleased };
}

test('ordered native runtime unload retires hints before the next stock native request without OMD hooks', async t => {
  const f = await nativeOwnerFixture(t);
  await f.runtime.dispose();
  assert.equal(f.ctx.get('omd'), undefined);
  assert.equal(f.session.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue in stock mode.' }] }));
  await f.agent.whenIdle();
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].some(m => taskContextMeta(m)?.runtime), false);
  assert.ok(f.requests[0].some(m => m.content?.some(b => b.text === '[todo list]\n[ ] T1 Finish')));
});

for (const order of ['hub-first', 'scope-first']) test(`native ${order} retirement owns the writer through scope disposal`, async t => {
  const f = await nativeOwnerFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.releases.push(() => release.resolve());
  const flush = f.hub.context.adapter.flush;
  let gated = false;
  f.hub.context.adapter.flush = async session => {
    if (!gated) { gated = true; entered.resolve(); await release.promise; }
    return flush(session);
  };
  const first = order === 'hub-first' ? f.hub.close() : f.handle.dispose();
  await entered.promise;
  const second = order === 'hub-first' ? f.handle.dispose() : f.hub.close();
  let finished = false;
  const both = Promise.all([first, second]).then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  await assert.rejects(f.ctx.sessionPersistence.open(f.session.id, 'write'), error => /own/i.test(error.message));
  release.resolve(); await both;
  const cold = await f.ctx.sessionPersistence.open(f.session.id, 'write');
  try {
    const read = await cold.read(), restored = Session.fromRestore(f.session.id, read.events, cold.header, cold.inheritedEventCount, read.eventState);
    assert.equal(restored.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
    assert.deepEqual(restored.snapshotEvents().slice(0, f.before.length), f.before);
    assert.equal(new ContextStore(f.hub.store.dir).peek(f.session.id).transaction, null);
  } finally { await cold.close(); }
});

test('whole native host shutdown starts no new runtime transaction even for a tracked owner', async t => {
  const f = await nativeOwnerFixture(t);
  await f.ctx.fiber.dispose();
  assert.deepEqual(f.session.snapshotEvents(), f.before);
  assert.equal(new ContextStore(f.hub.store.dir).peek(f.session.id).transaction, null);
});

test('hot unload waits for occupied native ownership without cancelling it', async t => {
  const f = await nativeOwnerFixture(t), release = Promise.withResolvers();
  f.releases.push(() => release.resolve());
  let signal;
  const active = f.agent.runMaintenance(async value => { signal = value; await release.promise; });
  let disposed = false;
  const unloading = f.runtime.dispose().then(() => { disposed = true; });
  await new Promise(setImmediate);
  assert.equal(disposed, false); assert.equal(signal.aborted, false);
  assert.deepEqual(f.session.snapshotEvents(), f.before);
  release.resolve(); await active; await unloading;
  assert.equal(f.ctx.get('omd'), undefined);
  assert.equal(f.session.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
});

for (const phase of ['model', 'preStep', 'autoCompact']) test(`runtime unload preserves an admitted native ${phase} request and its dependencies`, async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  let signal;
  const gate = async value => { signal = value; entered.resolve(); await release.promise; };
  const f = await nativeOwnerFixture(t, { preStep: phase !== 'model',
    stream: phase === 'model' ? options => gate(options.signal) : undefined });
  f.releases.push(() => release.resolve());
  if (phase === 'preStep') f.hub.bc.applyChoice = async (_session, value) => gate(value);
  if (phase === 'autoCompact') f.hub.context.autoCompact.check = async (_agent, value) => gate(value);
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Finish naturally.' }] }));
  await entered.promise;
  let disposed = false;
  const unloading = f.runtime.dispose().then(() => { disposed = true; });
  await new Promise(setImmediate);
  assert.equal(disposed, false); assert.equal(f.resourcesReleased(), false);
  assert.equal(f.hub.closed, false); assert.equal(f.hub.context.closed, false);
  if (signal) assert.equal(signal.aborted, false);
  assert.doesNotThrow(() => f.hub.runtimeRetirement.track(f.agent), 'the admitted multi-step owner can continue until idle');
  release.resolve(); await unloading; await f.agent.whenIdle();
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1);
  assert.equal(f.resourcesReleased(), true);
  assert.equal(f.session.deriveMessages().some(m => taskContextMeta(m)?.runtime), false);
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue without OMD.' }] }));
  await f.agent.whenIdle();
  assert.equal(f.requests.length, 2); assert.deepEqual(f.errors, []);
  assert.equal(f.requests[1].some(m => taskContextMeta(m)?.runtime), false);
});

test('root teardown joins an entered retirement and retains a real flush failure', async t => {
  const f = await nativeOwnerFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.releases.push(() => release.resolve());
  const failure = Error('native flush failed during root shutdown');
  f.hub.context.adapter.flush = async () => { entered.resolve(); await release.promise; throw failure; };
  const closing = f.hub.close();
  const failed = assert.rejects(closing, error => error instanceof AggregateError && error.errors.includes(failure));
  await entered.promise;
  let finished = false;
  const root = f.ctx.fiber.dispose().then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  release.resolve(); await failed; await root;
  assert.ok(new ContextStore(f.hub.store.dir).peek(f.session.id).transaction);
  assert.deepEqual(f.session.snapshotEvents(), f.before);
});

test('failed ordered runtime setup still disposes its child registration', async () => {
  const ctx = new Context(); let child, releases = 0;
  const setup = scope => { child = scope.fiber; scope.effect(() => () => { releases++; }); throw Error('setup failed'); };
  const runtime = ctx.plugin({ name: 'failed-runtime-fixture', apply(scope) { return mountRuntimeLifecycle(scope, setup); } });
  try {
    await assert.rejects(Promise.resolve(runtime), /setup failed/);
    await runtime.dispose();
    assert.equal(releases, 1);
    assert.equal(child.uid, null);
    assert.equal(ctx.registry.has(setup), false);
  } finally { await ctx.fiber.dispose(); }
});

test('followup queued during hot retirement runs after all OMD hooks leave', async t => {
  const f = await nativeOwnerFixture(t, { preStep: true }), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.releases.push(() => release.resolve());
  const flush = f.hub.context.adapter.flush; let gated = false;
  f.hub.context.adapter.flush = async session => {
    if (!gated) { gated = true; entered.resolve(); await release.promise; }
    return flush(session);
  };
  const unloading = f.runtime.dispose(); await entered.promise;
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Queued during disable.' }] }));
  await new Promise(setImmediate); assert.equal(f.requests.length, 0);
  release.resolve(); await unloading; await f.agent.whenIdle();
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1);
  assert.equal(f.resourcesReleased(), true);
  assert.equal(f.requests[0].some(m => taskContextMeta(m)?.runtime), false);
  assert.ok(f.requests[0].some(m => m.content?.some(b => b.text === 'Queued during disable.')));
});
