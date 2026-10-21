import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { ContextStore } from '../src/context/store.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { BillionContext } from '../src/context/bc.mjs';
import { user, exchange } from './context-fixture.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'context-controls-'));
  const session = Session.create('controls'), agent = { session, status: 'running' };
  const hub = { store: { dir: directory }, agents: new Map([[session.id, agent]]),
    scope: () => ({ mode: 'session', project: session.id }),
    config: () => ({ contextEnabled: false, stateHintsEnabled: true }),
    ctx: { sessions: { async flush() {} } }, action() {}, event() {} };
  const p = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const state = p.state(session);
  state.migrationVersion = 1; p.store.save(state);
  p.start = () => {}; p.publishMemory = () => {};
  t.after(async () => { await p.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { p, state, session, agent, hub, recover: () => new ContextStore(directory).peek(session.id) };
}

test('a rejected mode change leaves the running work and saved mode intact', async t => {
  const { p, session, state, recover } = await fixture(t);
  const controller = new AbortController(); p.controllers.set(session.id + ':prepare', controller);
  const before = structuredClone(state), write = p.store.write.bind(p.store), failure = Error('disk unavailable');
  p.store.write = () => { throw failure; };
  assert.throws(() => p.setMode(session, 'adaptive'), error => error === failure);
  p.store.write = write;
  assert.equal(controller.signal.aborted, false);
  assert.deepEqual(state, before); assert.deepEqual(recover(), JSON.parse(JSON.stringify(before)));
});

test('a rejected enqueue cannot execute later from unsaved memory', async t => {
  const { p, session, state, recover } = await fixture(t);
  const write = p.store.write.bind(p.store); p.store.write = () => { throw Error('disk unavailable'); };
  assert.throws(() => p.queueManual(session, { operation: 'full' }), /disk unavailable/);
  p.store.write = write;
  assert.deepEqual(state.manualQueue, []); assert.deepEqual(recover().manualQueue, []);
});

test('failed queue acknowledgement neither consumes the next request nor reports success', async t => {
  const { p, session, agent, state, recover } = await fixture(t);
  p.queueManual(session, { operation: 'full' }); p.queueManual(session, { operation: 'processed' });
  const before = structuredClone(state.manualQueue), write = p.store.write.bind(p.store);
  p.runManual = async () => ({ source: 'compact-f' });
  let failed = false;
  p.store.write = (path, next) => {
    if (!failed && next.manualQueue.length === 1) { failed = true; throw Error('acknowledgement failed'); }
    return write(path, next);
  };
  await assert.rejects(p.preStep(agent), /acknowledgement failed/);
  assert.deepEqual(state.manualQueue, before); assert.deepEqual(recover().manualQueue, before);
});

test('cancelling the request boundary retains queued work for the next request', async t => {
  const { p, session, agent, state, recover } = await fixture(t), abort = new AbortController();
  p.queueManual(session, { operation: 'full' });
  p.runManual = async () => { abort.abort(Error('user stopped')); throw abort.signal.reason; };
  await assert.rejects(p.preStep(agent, abort.signal), /user stopped/);
  assert.equal(state.manualQueue.length, 1); assert.equal(recover().manualQueue.length, 1);
});

test('failed backend persistence cannot activate BC in memory', async t => {
  const { p, session, hub, recover } = await fixture(t);
  hub.bc = new BillionContext(hub); hub.bc.connect = async () => 'http://localhost:1';
  const write = p.store.write.bind(p.store);
  p.store.write = (path, next) => { if (next.contextBackend === 'bc') throw Error('backend save failed'); return write(path, next); };
  await assert.rejects(hub.bc.choose(session, 'bc'), /backend save failed/);
  p.store.write = write;
  assert.equal(hub.bc.backend(session), 'omd');
  assert.notEqual(recover().contextBackend, 'bc');
});

test('cold transaction recovery completes the matching request once and retains work queued during the call', async t => {
  const { p, session, agent, hub, recover } = await fixture(t);
  user(session, 'Keep my original requirement.'); exchange(session, 'Measured source material. '.repeat(500));
  const originalEvents = structuredClone(session.snapshotEvents());
  p.queueManual(session, { operation: 'full' });
  let calls = 0, failed = false;
  hub.call = async () => {
    calls++; p.queueManual(session, { operation: 'processed' });
    return { blocks: [{ type: 'tool-call', id: 'summary', name: 'compact_conversation', arguments: { summary: 'Source material was measured; originals remain available.' } }] };
  };
  const write = p.store.write.bind(p.store);
  p.store.write = (path, next) => {
    if (!failed && next.lastReplacement?.source === 'compact-f' && !next.transaction) {
      failed = true; throw Error('final commit failed');
    }
    return write(path, next);
  };
  await assert.rejects(p.preStep(agent), /final commit failed/);
  assert.equal(calls, 1); assert.equal(recover().manualQueue.length, 2); assert.ok(recover().transaction);
  const eventCount = session.snapshotEvents().length;
  p.store = new ContextStore(hub.store.dir);
  await p.preStep(agent);
  const restored = recover();
  assert.equal(calls, 1, 'Recovery must not request another model summary');
  assert.equal(session.snapshotEvents().length, eventCount, 'Recovery must not append a duplicate replacement');
  assert.deepEqual(session.snapshotEvents().slice(0, originalEvents.length), originalEvents);
  assert.deepEqual(restored.manualQueue, [{ operation: 'processed' }]);
  assert.equal(restored.transaction, null); assert.equal(restored.failures.compactFull, undefined);
});

test('a disposed request owner cannot acknowledge queued work or resurrect its state', async t => {
  const { p, session, agent, recover } = await fixture(t);
  p.queueManual(session, { operation: 'full' });
  const started = Promise.withResolvers(), finish = Promise.withResolvers();
  p.runManual = async () => { started.resolve(); await finish.promise; throw Error('owner stopped'); };
  const running = p.preStep(agent); await started.promise;
  await p.dispose(session.id); finish.resolve();
  await assert.rejects(running, /owner stopped/);
  assert.equal(recover().manualQueue.length, 1); assert.equal(p.agents.has(session.id), false); assert.equal(p.store.cache.has(session.id), false);
});

test('disposal during backend handoff cannot recreate the released session cache', async t => {
  const { p, session, agent, hub } = await fixture(t);
  const started = Promise.withResolvers(), finish = Promise.withResolvers();
  hub.bc = { active: () => false, async applyChoice() { started.resolve(); await finish.promise; } };
  const running = p.preStep(agent); await started.promise;
  await p.dispose(session.id); finish.resolve();
  await assert.rejects(running, /上下文已释放/);
  assert.equal(p.agents.has(session.id), false); assert.equal(p.store.cache.has(session.id), false);
});
