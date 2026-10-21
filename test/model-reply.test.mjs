import test from 'node:test';
import assert from 'node:assert/strict';
import { TemporaryChats } from '../src/temporary-chat.mjs';
import { createPromptOptimizer } from '../src/prompt-optimizer.mjs';

const route = { provider: 'synthetic', model: 'local' };
const frames = function* (finish = 'stop') {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text: 'Complete reply' };
  yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Complete reply' } };
  if (finish) yield { type: 'finish', reason: { kind: finish } };
};
function consumer(t, kind, prepareCall) {
  const session = { id: 'reply-test', requestHeader: () => ({ config: route }) }, emitted = [], records = [];
  const ctx = { sessions: { get: () => session }, sessionProjections: { stateOf() {} }, llm: { prepareCall } };
  const hub = { live: new Map(), context: { releaseState() {} }, record(_session, _kind, record) { records.push(record); } };
  const service = kind === 'chat' ? new TemporaryChats(ctx) : createPromptOptimizer(ctx, hub);
  const id = kind === 'chat' ? service.open(session.id).id : null;
  let requestId = 0;
  const run = signal => kind === 'chat' ? service.send(id, ++requestId, 'Original draft', event => emitted.push(event), signal)
    : service.optimize(session, { text: 'Original draft' }, signal);
  t.after(() => service.dispose());
  return { service, run, emitted, records, hub, id };
}

for (const kind of ['chat', 'optimizer']) {
  test(kind + ' keeps its slot until a cancelled producer and yielding finalizer actually retire', async t => {
    const entered = Promise.withResolvers(), output = Promise.withResolvers(), cleaning = Promise.withResolvers(), retire = Promise.withResolvers();
    let calls = 0, retired = false;
    const f = consumer(t, kind, async () => ({ config: route, async *stream() {
      if (++calls > 1) { yield* frames(); return; }
      try { entered.resolve(); await output.promise; yield* frames(); }
      finally { cleaning.resolve(); await retire.promise; yield { type: 'finish', reason: { kind: 'stop' } }; retired = true; }
    } }));
    const abort = new AbortController(), running = f.run(abort.signal), rejected = assert.rejects(running, /human stop/);
    await entered.promise; abort.abort(Error('human stop'));
    await assert.rejects(f.run(), /正在/);
    output.resolve(); await cleaning.promise;
    assert.equal(retired, false); assert.equal(f.records.length, 0);
    assert.ok(!f.emitted.some(event => event.type === 'text-delta' || event.type === 'done'));
    retire.resolve(); await rejected;
    assert.equal(retired, true);
    if (kind === 'chat') assert.equal(f.service.get(f.id).turns.length, 0);
    else { assert.equal(f.records[0].status, 'cancelled'); assert.equal(f.hub.live.size, 0); }
    await f.run(); assert.equal(calls, 2, 'The cancelled operation must release its slot exactly once');
  });

  test(kind + ' rejects incomplete replies and preserves the previous conversation or draft', async t => {
    let calls = 0;
    const f = consumer(t, kind, async () => ({ config: route, async *stream() {
      const variant = calls++;
      if (variant === 2) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call', id: 'unexpected', name: 'write' };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'unexpected', name: 'write', arguments: '{}' } };
        yield { type: 'finish', reason: { kind: 'tool-calls' } };
      } else yield* frames(variant === 0 ? null : 'max-tokens');
    } }));
    for (const expected of [/未报告完成/, /max-tokens/, /工具调用/]) await assert.rejects(f.run(), expected);
    if (kind === 'chat') {
      assert.equal(f.service.get(f.id).turns.length, 0);
      assert.equal(f.emitted.some(event => event.type === 'done'), false);
    } else assert.ok(f.records.length === 3 && f.records.every(record => record.status === 'error'));
  });

  for (const outcome of ['ready', 'failed']) test(kind + ' disposal waits for cancelled preparation: ' + outcome, async t => {
    const entered = Promise.withResolvers(), prepared = Promise.withResolvers(), late = Error('late preparation failure');
    let dispatched = false;
    const f = consumer(t, kind, async () => {
      entered.resolve(); await prepared.promise;
      if (outcome === 'failed') throw late;
      return { config: route, async *stream() { dispatched = true; yield* frames(); } };
    });
    const running = f.run(), rejected = assert.rejects(running, outcome === 'failed'
      ? error => error.cleanup === true && error.errors.includes(late) : /已关闭|已停止/);
    await entered.promise;
    let disposed = false;
    const closing = f.service.dispose().finally(() => { disposed = true; });
    const closed = outcome === 'failed' ? assert.rejects(closing, AggregateError) : closing;
    await new Promise(setImmediate); assert.equal(disposed, false);
    prepared.resolve(); await rejected; await closed;
    assert.equal(dispatched, false); assert.equal(f.records.length, 0);
    if (kind === 'chat') assert.throws(() => f.service.open(), /已停止/);
    else await assert.rejects(f.run(), /已停止/);
  });

  test(kind + ' reports the original pre-dispatch failure without inventing a model call', async t => {
    const failure = Error('route unavailable'), f = consumer(t, kind, async () => { throw failure; });
    await assert.rejects(f.run(), error => error === failure);
    assert.equal(f.records.length, 0);
  });

  test(kind + ' reports a late finalizer failure after cancellation', async t => {
    const entered = Promise.withResolvers(), release = Promise.withResolvers(), failure = Error('producer cleanup failed');
    const f = consumer(t, kind, async () => ({ config: route, async *stream() {
      try { entered.resolve(); await release.promise; yield* frames(); }
      finally { throw failure; }
    } }));
    const abort = new AbortController(), running = f.run(abort.signal);
    const rejected = assert.rejects(running, error => error.cleanup === true && error.errors.includes(failure));
    await entered.promise; abort.abort(Error('human stop')); release.resolve(); await rejected;
    if (kind === 'chat') assert.equal(f.service.get(f.id).turns.length, 0);
    else assert.equal(f.records[0].status, 'error');
  });
}
