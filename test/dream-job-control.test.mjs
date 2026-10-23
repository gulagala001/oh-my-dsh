import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';

const route = { provider: 'fixture', model: 'fixture' };
const reply = input => ({ summary: 'Verified source retained', references: input.sources.map(source => source.id) });

async function fixture(t, { stream, now, close } = {}) {
  const directory = await mkdtemp(join(resolve('.local'), 'dream-control-'));
  const ctx = new Context(), store = new DreamStore(directory, { now });
  const config = { dreamAutoEnabled: true, backgroundMaxRetries: 0, dreamDailyTokens: 10000000,
    dreamProvider: route.provider, dreamModel: route.model };
  const events = [], calls = [], receipts = [];
  let syncing = 0, active = 0, peak = 0;
  await ctx.plugin(LlmRuntime);
  class Adapter extends LlmAdapter {
    async *stream(options) {
      const input = JSON.parse(options.messages.at(-1).content[0].text);
      calls.push(input); peak = Math.max(peak, ++active);
      try {
        let finished = false;
        if (stream) for await (const chunk of stream(options, input, calls.length)) { finished ||= chunk.type === 'finish'; yield chunk; }
        else yield { type: 'tool-call-delta', index: 0, id: 'save', name: 'save_memory', argumentsDelta: JSON.stringify(reply(input)) };
        if (!finished) {
          yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 7 } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        }
      } finally { active--; }
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  const metadata = { id: 'session', shared: true, project: '/fixture', generation: 'fixture' };
  store.saveSession(metadata);
  const context = { adapter: { message: text => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }) } };
  const service = new DreamService({ ctx, config: () => config, context, live: new Map(),
    event: (_session, event) => events.push(event), monitor: { append: value => receipts.push(value) } }, {
    store, sources: {
      async sync() { syncing++; }, close,
      stamp: () => null, projectTitle: id => id,
      async manifest() { return { metadata, through: 1, items: [{ key: 'source', fingerprint: 'one',
        source: { id: 'original', kind: 'raw', sessionId: 'session', generation: 'fixture' }, text: 'Verified source' }] }; },
      async validateBatch() {},
    },
  });
  t.after(async () => { try { await service.close(); } finally { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); } });
  return { directory, service, store, config, context, events, calls, receipts,
    get scans() { return syncing; }, get active() { return active; }, get peak() { return peak; },
    enqueue: (automatic = false) => store.enqueue('session', 'session', automatic, { route }),
  };
}

test('stop then immediate resume waits for the native stream and emits only the committed outcome', { timeout: 5000 }, async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  const f = await fixture(t, { stream: async function* (_options, input, count) {
    if (count === 1) { entered.resolve(); await release.promise; }
    yield { type: 'tool-call-delta', index: 0, id: 'save', name: 'save_memory', argumentsDelta: JSON.stringify(reply(input)) };
  } });
  const job = f.enqueue(), draining = f.service.drain();
  await entered.promise;
  assert.equal(f.service.pause(job.id).state, 'paused');
  assert.equal(f.service.resume(job.id).state, 'queued');
  assert.equal(f.active, 1); assert.equal(f.calls.length, 1);
  release.resolve(); await draining;
  assert.equal(f.peak, 1); assert.equal(f.calls.length, 2);
  assert.equal(f.store.job(job.id).state, 'complete');
  assert.equal(f.store.memory('session:session').revision, 1, 'late cancelled output must not publish');
  assert.deepEqual(f.events.map(event => event.status), ['success']);
});

test('disabled automatic work pauses before reading sources and can be explicitly resumed', async t => {
  const f = await fixture(t), job = f.enqueue(true);
  f.config.dreamAutoEnabled = false;
  await f.service.drain();
  assert.equal(f.store.job(job.id).state, 'paused');
  assert.equal(f.calls.length, 0); assert.equal(f.scans, 0);
  assert.equal(f.store.usage().used, 0);
  f.service.resume(job.id); await f.service.drain();
  assert.equal(f.store.job(job.id).state, 'complete'); assert.equal(f.calls.length, 1);
  assert.equal(f.store.job(job.id).automatic, false);
  assert.equal(f.store.db.prepare('SELECT automatic FROM jobs WHERE id=?').get(job.id).automatic, 0);
  assert.deepEqual(f.events.map(event => [event.status, event.data.auto]), [['success', false]]);
});

test('a manual run adopts an already queued automatic job without creating another job', async t => {
  const f = await fixture(t), job = f.enqueue(true);
  f.config.dreamAutoEnabled = false;
  const manual = await f.service.enqueue('session', 'session');
  await f.service.drain();
  assert.equal(manual.id, job.id); assert.equal(f.store.jobs().length, 1);
  assert.equal(f.store.job(job.id).state, 'complete'); assert.equal(f.calls.length, 1);
  assert.equal(f.store.job(job.id).automatic, false);
  assert.equal(f.store.db.prepare('SELECT automatic FROM jobs WHERE id=?').get(job.id).automatic, 0);
});

test('disabling automatic work while it awaits a call slot prevents dispatch and quota reservation', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  const f = await fixture(t);
  f.context.withCallSlot = async run => { entered.resolve(); await release.promise; return run(); };
  const job = f.enqueue(true), draining = f.service.drain();
  await entered.promise; f.config.dreamAutoEnabled = false; release.resolve(); await draining;
  assert.equal(f.store.job(job.id).state, 'paused');
  assert.equal(f.calls.length, 0); assert.equal(f.store.usage().used, 0);
  assert.deepEqual(f.events, []);
});

test('disabling automatic work during generation retains usage but rejects late publication', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  const f = await fixture(t, { stream: async function* (_options, input) {
    entered.resolve(); await release.promise;
    yield { type: 'tool-call-delta', index: 0, id: 'save', name: 'save_memory', argumentsDelta: JSON.stringify(reply(input)) };
  } });
  const job = f.enqueue(true), draining = f.service.drain();
  await entered.promise; f.config.dreamAutoEnabled = false; release.resolve(); await draining;
  assert.equal(f.store.job(job.id).state, 'paused');
  assert.equal(f.store.memory('session:session'), null);
  assert.equal(f.store.usage().used, 18); assert.equal(f.receipts.length, 1);
  assert.deepEqual(f.events, []);
});

test('a retired lease cannot report a failure for the replacement executor', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  let peer;
  t.after(() => peer?.close());
  let now = Date.now();
  const f = await fixture(t, { now: () => now, stream: async function* (_options, input) {
    entered.resolve(); await release.promise;
    yield { type: 'tool-call-delta', index: 0, id: 'save', name: 'save_memory', argumentsDelta: JSON.stringify(reply(input)) };
  } });
  const job = f.enqueue(), draining = f.service.drain();
  await entered.promise;
  peer = new DreamStore(f.directory, { now: () => now });
  now += 60001;
  const epoch = peer.acquire(); peer.recover(epoch); peer.claimJob(epoch);
  release.resolve(); await draining;
  assert.equal(peer.job(job.id).state, 'running'); assert.equal(peer.holds(epoch), true);
  assert.equal(peer.memory('session:session'), null);
  assert.deepEqual(f.events, []);
});

test('a manual adoption committed by another process is not overwritten by automatic pausing', async t => {
  let peer;
  t.after(() => peer?.close());
  const f = await fixture(t), job = f.enqueue(true);
  peer = new DreamStore(f.directory);
  const requireJob = f.store.requireJob.bind(f.store);
  let adopted = false;
  f.store.requireJob = (id, epoch) => {
    const current = requireJob(id, epoch);
    if (!adopted) { adopted = true; assert.equal(peer.enqueue('session', 'session', false, { route }).id, job.id); }
    return current;
  };
  f.config.dreamAutoEnabled = false;
  await f.service.drain();
  assert.equal(f.store.job(job.id).state, 'complete');
  assert.equal(f.store.job(job.id).automatic, false); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.events.map(event => [event.status, event.data.auto]), [['success', false]]);
});

test('commands from a retiring service cannot change jobs before its database closes', async t => {
  const release = Promise.withResolvers();
  const f = await fixture(t, { close: () => release.promise }), job = f.enqueue();
  f.service.pause(job.id);
  const closing = f.service.close();
  try {
    assert.throws(() => f.service.resume(job.id), /退出/);
    assert.throws(() => f.service.pause(job.id), /退出/);
    assert.equal(f.store.job(job.id).state, 'paused');
  } finally { release.resolve(); await closing; }
});

test('real automatic failures remain visible with correct automatic attribution', async t => {
  const f = await fixture(t, { stream: async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'credentials rejected', status: 401 } } };
  } });
  const job = f.enqueue(true); await f.service.drain();
  assert.equal(f.store.job(job.id).state, 'failed');
  assert.match(f.store.job(job.id).error, /credentials rejected/);
  assert.equal(f.store.memory('session:session'), null);
  assert.deepEqual(f.events.map(event => [event.status, event.data.auto]), [['error', true]]);
});
