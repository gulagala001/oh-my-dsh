import test from 'node:test';
import assert from 'node:assert/strict';
import { contextConfig as Config } from '../src/config.mjs';
import { Hub } from '../src/hub.mjs';

test('background timeout defaults to ten minutes; explicit values keep their meaning', () => {
  assert.equal(Config({}).jobTimeoutMs, 600000);
  assert.equal(Config({ jobTimeoutMs: 0 }).jobTimeoutMs, 0);
  assert.equal(Config({ jobTimeoutMs: 180000 }).jobTimeoutMs, 180000);
});

test('default background deadline does not abort at two minutes and aborts at ten', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  const records = []; let returned = false;
  const hub = Object.assign(Object.create(Hub.prototype), {
    config: () => Config({}), route: () => ({ provider: 'test', model: 'test', effort: 'off' }),
    efforts: new Map([['off', { resolve: async () => undefined }]]), live: new Map(),
    record(_session, kind, entry) { records.push({ kind, ...entry }); },
    ctx: { llm: { stream() { return { [Symbol.asyncIterator]() { return this; }, next: () => new Promise(() => {}), return: async () => { returned = true; return { done: true }; } }; } } },
  });
  const work = hub.call({ session: { id: 'timeout-test' } }, 'coordinate', {});
  const rejected = assert.rejects(work, /后台作业超时/);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(120000); await Promise.resolve(); assert.equal(records.length, 0);
  t.mock.timers.tick(479999); await Promise.resolve(); assert.equal(records.length, 0);
  t.mock.timers.tick(1); await rejected;
  assert.equal(records.length, 1); assert.equal(records[0].durationMs, 600000); assert.equal(hub.live.size, 0); assert.equal(returned, true);
});
