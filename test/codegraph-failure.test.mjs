import test from 'node:test';
import assert from 'node:assert/strict';
import { CodegraphRuntime } from '../src/codegraph.mjs';

const cwd = new URL('../', import.meta.url).pathname;

test('index preparation retains a readable plain-object failure', async () => {
  const runtime = new CodegraphRuntime();
  const reason = { code: 'INDEX_TIMEOUT', message: 'Index preparation timed out' };
  runtime.prepare = async () => { throw reason; };
  await assert.rejects(runtime.ensureProject(cwd), error => {
    assert.equal(error.message, reason.message);
    assert.equal(error.cause, reason);
    return true;
  });
  assert.equal(runtime.status().projects[0].error, reason.message);
  await runtime.dispose();
});

test('cancelled callers see the structured reason without cancelling shared preparation', async () => {
  const runtime = new CodegraphRuntime();
  let finish;
  runtime.ensureProject = () => new Promise(resolve => { finish = resolve; });
  const controller = new AbortController();
  const call = runtime.call('codegraph_explore', {}, { cwd, signal: controller.signal });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  controller.abort({ code: 'TURN_CANCELLED' });
  await assert.rejects(call, error => {
    assert.equal(error.message, '{"code":"TURN_CANCELLED"}');
    assert.equal(error.cause.code, 'TURN_CANCELLED');
    return true;
  });
  assert.equal(runtime.controller.signal.aborted, false);
  finish(cwd);
  await runtime.dispose();
});

test('an already aborted index request never returns object Object', async () => {
  const runtime = new CodegraphRuntime();
  const signal = AbortSignal.abort({ code: 'CANCELLED', message: 'User cancelled indexing' });
  await assert.rejects(runtime.index({}, { cwd, signal }), { message: 'User cancelled indexing' });
  await runtime.dispose();
});
