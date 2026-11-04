import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { readNativeSession } = await import(process.env.NATIVE_SESSION_READ_MODULE ?? '../src/host/session-read.mjs');

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { Context } = await import(host.resolve('@deepseek-ai/cordis'));
const { Session } = await import(host.resolve('@deepseek-ai/dsh-session'));
const { SessionQueryEngine } = await import(host.resolve('@deepseek-ai/dsh-session-query'));

test('native cold observations retain their boundary without activating sessions and release every lease', async t => {
  const ctx = new Context(), persisted = Session.create('stored'), live = new Map();
  t.after(() => ctx.fiber.dispose());
  let opens = 0, closes = 0, leases = 0;
  ctx.provide('sessions', { get: id => live.get(id), prepare: (id, input) => Session.create(id, input.seed, input.meta, input.inheritedEventCount) });
  ctx.provide('sessionPersistence', { identity: Symbol('fixture'),
    stat: async id => id === 'stored' ? { header: persisted.header, revision: 'unchanged' } : undefined,
    open: async () => { opens++; return { header: persisted.header, inheritedEventCount: 0,
      read: async () => ({ events: persisted.snapshotEvents(), eventState: 'borrowed' }), close: async () => { closes++; } }; },
  });
  const native = new SessionQueryEngine(ctx), query = { async observeSession(...args) {
    const observed = await native.observeSession(...args); leases++;
    return { header: observed.header, events: observed.events, inheritedEventCount: observed.inheritedEventCount,
      [Symbol.dispose]() { leases--; observed[Symbol.dispose](); } };
  } };
  const target = { sessionQuery: query };
  const first = await readNativeSession(target, 'stored');
  assert.equal(first.meta.id, 'stored'); assert.deepEqual(first.events, []); assert.equal(first.inheritedEventCount, 0);
  assert.equal(live.size, 0); assert.equal(opens, 1); assert.equal(closes, 1); assert.equal(leases, 0);
  assert.deepEqual(await readNativeSession(target, 'stored'), first); assert.equal(opens, 1, 'native unchanged-revision cache remains authoritative');
  live.set('stored', persisted);
  assert.deepEqual(await readNativeSession(target, 'stored'), first); assert.equal(leases, 0);
  await assert.rejects(readNativeSession(target, 'missing'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' });
  const cancelled = AbortSignal.abort(Error('cancelled read'));
  await assert.rejects(readNativeSession(target, 'stored', cancelled), /cancelled read/);
  const controller = new AbortController();
  const late = { sessionQuery: { async observeSession(...args) { const value = await query.observeSession(...args); controller.abort(Error('cancel after acquisition')); return value; } } };
  await assert.rejects(readNativeSession(late, 'stored', controller.signal), /cancel after acquisition/);
  assert.equal(leases, 0); assert.equal(opens, closes); assert.equal(live.size, 1);
});
