import { installTools, executeTool } from './fixtures/alpha-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { createModule as createJobs } from '../lib/host/jobs-local.factory.mjs';
import { createModule as createControls } from '../lib/host/tool-jobs.factory.mjs';
import { createModule as createPwsh } from '../lib/host/tool-pwsh.factory.mjs';
import { createModule as createBash } from '../lib/host/tool-bash.factory.mjs';
import { RewindEngine } from '../vendor/rewind/src/engine.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
async function component(factory, names) {
  const modules = new Map(await Promise.all(names.map(async name => [name, await import(name.startsWith('node:') ? name : host.resolve(name))])));
  return factory(name => name === '@deepseek-ai/schemastery' ? modules.get(name).default : { ...modules.get(name), __esModule: true });
}
async function fixture(t) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  await installTools(ctx);
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
  const cancelled = await executeTool(f.ctx, { callId: 'cancel-wait', name: 'job_output', arguments: { job_id: f.id, wait: true, timeout_ms: 30000 }, signal: controller.signal });
  assert.equal(cancelled.error?.info?.code, 'ABORTED');
  assert.equal(cancelled.error?.message, 'tool call cancelled by user');
  assert.equal(f.cancelled(), 0);
  assert.equal(f.ctx.jobs.get(f.id).status, 'running');
  const timeout = await executeTool(f.ctx, { callId: 'timeout-wait', name: 'job_output', arguments: { job_id: f.id, wait: true, timeout_ms: 1 }, signal: new AbortController().signal });
  assert.equal(timeout.isError, false);
  assert.equal(timeout.value.job.status, 'running');
  assert.match(timeout.value.text, /unread output/);
  const stop = await executeTool(f.ctx, { callId: 'stop-job', name: 'job_kill', arguments: { job_id: f.id, reason: 'explicit stop' }, signal: new AbortController().signal });
  assert.equal(stop.isError, false);
  await f.ctx.jobs.wait(f.id, 1000);
  assert.equal(f.cancelled(), 1);
  assert.equal(f.ctx.jobs.get(f.id).status, 'killed');
  assert.match(f.ctx.jobs.get(f.id).detail, /explicit stop/);
});

test('actual job controls bypass Rewind admission by definition identity', async t => {
  const f = await fixture(t), agent = { ctx: f.ctx, session: { id: 'controls' } };
  const engine = new RewindEngine(f.ctx, 'unused');
  for (const name of ['job_list', 'job_output', 'job_kill']) {
    assert.ok(f.ctx.tools.get(name, agent));
    assert.equal(engine.tracksTool({ agent, name }), false);
  }
  const replacement = { name: 'job_list' };
  assert.equal(engine.tracksTool({ agent, name: 'job_list', toolSet: { view: () => new Map([['job_list', replacement]]) } }), true);
});

for (const [name, factory] of [['pwsh', createPwsh], ['bash', createBash]]) test(`cancelled ${name} call returns before a slow job settles, preserving job ownership`, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), pending = Promise.withResolvers();
  const controller = new AbortController();
  let jobSignal;
  f.ctx.reflect.provide('workingDirectory', { ensure: async () => process.cwd() });
  f.ctx.reflect.provide('shellEnv', { collect: () => ({}) });
  f.ctx.reflect.provide('shell', {
    resolve: request => ({ ...request, workdir: process.cwd() }),
    execute(spec) { jobSignal = spec.signal; entered.resolve(); return pending.promise; },
  });
  t.after(() => pending.reject(Error('test teardown')));
  await f.ctx.plugin(await component(factory, ['node:path', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-sandbox', '@deepseek-ai/dsh-shell']));
  const result = executeTool(f.ctx, { callId: name, name, arguments: { command: 'blocked', description: 'Stop this test call', timeoutMs: 30000 }, signal: controller.signal });
  const deadline = new AbortController();
  const ready = AbortSignal.timeout(2000);
  try {
    await Promise.race([entered.promise, result.then(value => assert.fail(JSON.stringify(value))),
      new Promise((_, reject) => ready.addEventListener('abort', () => reject(Error('Shell did not start')), { once: true }))]);
    controller.abort({ kind: 'user' });
    const cancelled = await Promise.race([result, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(Error('Turn still waiting on the shell')), 2500);
      deadline.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    })]);
    assert.equal(cancelled.error?.info?.code, 'ABORTED');
    assert.equal(jobSignal.aborted, true);
    const stopping = f.ctx.jobs.list().find(job => job.kind === name);
    assert.equal(stopping?.status, 'stopping');
    pending.reject(Error('process settled'));
    assert.equal((await f.ctx.jobs.wait(stopping.id, 1000)).status, 'killed');
  } finally {
    deadline.abort();
    pending.reject(Error('test finished'));
  }
});
