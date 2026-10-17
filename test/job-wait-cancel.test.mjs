import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createModule as createJobs } from '../lib/host/jobs-local.factory.mjs';
import { createModule as createControls } from '../lib/host/tool-jobs.factory.mjs';

async function component(factory, names) {
  const modules = new Map(await Promise.all(names.map(async name => [name, await import(name)])));
  return factory(name => name === '@deepseek-ai/schemastery' ? modules.get(name).default : { ...modules.get(name), __esModule: true });
}
async function fixture(t) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin((await component(createJobs, ['node:crypto', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-timeout', '@deepseek-ai/dsh-jobs'])).default);
  await ctx.plugin(await component(createControls, ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-output-retention', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-jobs']));
  const done = Promise.withResolvers();
  let cancelled = 0;
  const id = ctx.jobs.start({ kind: 'check', label: 'isolated wait cancellation', run(handle) {
    handle.append('unread output');
    return { done: done.promise, cancel() { cancelled++; done.resolve({ status: 'killed' }); } };
  } });
  return { ctx, id, done, cancelled: () => cancelled };
}

test('finite registry waits retain the exact abort reason without cancelling or consuming the job', async t => {
  const f = await fixture(t);
  for (const reason of [{ kind: 'user' }, Error('specific cancellation')]) {
    const controller = new AbortController();
    const wait = f.ctx.jobs.wait(f.id, 30000, undefined, controller.signal);
    controller.abort(reason);
    await assert.rejects(wait, error => error === reason);
    await assert.rejects(f.ctx.jobs.wait(f.id, 30000, undefined, controller.signal), error => error === reason);
  }
  assert.equal(f.cancelled(), 0);
  assert.equal(f.ctx.jobs.get(f.id).status, 'running');
  f.done.resolve({ status: 'completed', result: 'final value' });
  await f.ctx.jobs.wait(f.id, 1000);
  const read = f.ctx.jobs.read(f.id);
  assert.equal(read.chunks.map(chunk => chunk.text).join(''), 'unread output');
  assert.equal(read.result, 'final value');
  assert.equal(f.ctx.jobs.read(f.id).result, undefined);
});

test('finite job_output cancellation is ABORTED with the caller reason, while timeout remains a live result', async t => {
  const f = await fixture(t), controller = new AbortController();
  f.ctx.on('tools/execute', (exec, next) => {
    const result = next();
    if (exec.callId === 'cancel-wait') controller.abort({ kind: 'user' });
    return result;
  }, { global: true });
  const cancelled = await f.ctx.tools.execute({ callId: 'cancel-wait', name: 'job_output', arguments: { job_id: f.id, wait: true, timeout_ms: 30000 }, signal: controller.signal });
  assert.equal(cancelled.error?.info?.code, 'ABORTED');
  assert.equal(cancelled.error?.message, 'tool call cancelled by user');
  assert.equal(f.cancelled(), 0);
  assert.equal(f.ctx.jobs.get(f.id).status, 'running');
  const timeout = await f.ctx.tools.execute({ callId: 'timeout-wait', name: 'job_output', arguments: { job_id: f.id, wait: true, timeout_ms: 1 }, signal: new AbortController().signal });
  assert.equal(timeout.isError, false);
  assert.equal(timeout.value.job.status, 'running');
  assert.match(timeout.value.text, /unread output/);
  const stop = await f.ctx.tools.execute({ callId: 'stop-job', name: 'job_kill', arguments: { job_id: f.id, reason: 'explicit stop' }, signal: new AbortController().signal });
  assert.equal(stop.isError, false);
  await f.ctx.jobs.wait(f.id, 1000);
  assert.equal(f.cancelled(), 1);
  assert.equal(f.ctx.jobs.get(f.id).status, 'killed');
  assert.match(f.ctx.jobs.get(f.id).detail, /explicit stop/);
});
