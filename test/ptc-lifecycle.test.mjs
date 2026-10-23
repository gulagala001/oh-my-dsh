import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { installPtcLifecycle } from '../src/ptc-lifecycle.mjs';

const anchor = createRequire(realpathSync(process.env.OMD_PTC_TEST_HOST
  ?? createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const { Context } = await import(anchor.resolve('@deepseek-ai/cordis'));
const { ToolRuntime } = await import(anchor.resolve('@deepseek-ai/dsh-tools'));
const { createScope } = await import(anchor.resolve('@deepseek-ai/dsh-scope'));
const baseline = process.env.OMD_PTC_BASELINE === '1';
const deadline = promise => Promise.race([promise, delay(350).then(() => 'hung')]);

async function fixture(t, { runtime, cleanupMs = 15 } = {}) {
  const ctx = new Context(), releases = [], events = [];
  const gate = () => { const value = Promise.withResolvers(); releases.push(() => value.resolve('late')); return value; };
  const defaultRuntime = {
    language: 'typescript', timeout: { defaultMs: 35, maxMs: 500 },
    resolve: spec => spec, release: async () => {},
    async run(spec) {
      // The real transport, including its ordered nested dispatch and drain,
      // consumes this provider. Only the program evaluator is controlled.
      const tool = spec.bindings[0].functions[spec.program];
      let abort;
      const stopped = new Promise(resolve => {
        abort = () => resolve({ logs: [], error: { kind: 'abort', message: 'provider stopped' } });
        spec.signal.addEventListener('abort', abort, { once: true });
        if (spec.signal.aborted) abort();
      });
      const timer = setTimeout(abort, 35);
      try {
        return await Promise.race([Promise.resolve().then(() => tool({})).then(value => ({ logs: [], value }),
          error => ({ logs: [], error: { kind: 'exception', message: error.message } })), stopped]);
      } finally { clearTimeout(timer); spec.signal.removeEventListener('abort', abort); }
    },
    ...runtime,
  };
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('workingDirectory', { ensure: async () => process.cwd() });
  ctx.reflect.provide('ptcRuntime', defaultRuntime);
  await ctx.plugin(ToolRuntime, { mode: 'ptc' });
  const install = () => ctx.plugin({ inject: ['tools'], apply(scope) { installPtcLifecycle(scope, { cleanupMs }); } });
  const owner = baseline ? undefined : install();
  await owner;
  await new Promise(resolve => setImmediate(resolve));
  const agent = { ctx, session: { id: 'ptc-lifecycle', append: (type, data) => events.push({ type, data }) } };
  const register = (name, execute) => ctx.tools.register({ name, description: name,
    parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute });
  register('ok', () => 'OK');
  let sequence = 0;
  const call = (code, signal = new AbortController().signal) => ctx.tools.execute({
    name: 'run_code', callId: `ptc-${++sequence}`, arguments: { code, description: 'PTC regression' }, agent, signal,
  });
  t.after(async () => { for (const release of releases) release(); await delay(25); await ctx.fiber.dispose(); });
  return { ctx, agent, events, call, gate, register, runtime: defaultRuntime, owner, install };
}

test('nested cancellation cannot hang the native run_code drain; unknown effects remain quarantined', async t => {
  const f = await fixture(t), gate = f.gate(); let calls = 0;
  f.register('slow', () => { calls++; return gate.promise; });
  const result = await deadline(f.call('slow'));
  assert.notEqual(result, 'hung', 'native transport hung after its evaluator had already stopped');
  assert.equal(result.isError, true);
  assert.equal(result.error.info.code, 'OMD_PTC_TIMEOUT');
  assert.equal(result.error.info.cleanupPending, true);
  assert.equal(f.events.filter(event => event.type === 'tool/ptc-dispatch').length, 1);
  const refused = await deadline(f.call('slow'));
  assert.equal(refused.error.info.code, 'OMD_PTC_CLEANUP_PENDING');
  assert.equal(calls, 1);
  const other = await f.ctx.tools.execute({ name: 'run_code', callId: 'other-session',
    arguments: { code: 'ok', description: 'Independent session' },
    agent: { ctx: f.ctx, session: { ...f.agent.session, id: 'other' } }, signal: new AbortController().signal });
  assert.equal(other.isError, false, 'quarantine belongs only to the affected session');
  gate.resolve('late result'); await delay(25);
  assert.equal(f.events.filter(event => event.type === 'tool/ptc-dispatch' && event.data.name === 'slow').length, 1, 'late completion must not log a duplicate result');
  const recovered = await deadline(f.call('ok'));
  assert.equal(recovered.isError, false); assert.equal(recovered.value.result, 'OK');
});

test('a stalled process cleanup returns an error even after the program deadline', async t => {
  const gate = Promise.withResolvers();
  const f = await fixture(t, { runtime: { run: () => gate.promise } });
  t.after(() => gate.resolve({ logs: [], value: 'late worker completion' }));
  // Release before fixture disposal (which follows registration order).
  const result = await deadline(f.call('ok'));
  gate.resolve({ logs: [], value: 'late worker completion' });
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  assert.equal(result.error.info.code, 'OMD_PTC_TIMEOUT');
});

test('cancel wakes a stalled nested prepare and prevents its late allow from running the body', async t => {
  const f = await fixture(t), gate = f.gate(), entered = Promise.withResolvers(), stop = new AbortController();
  let calls = 0;
  f.register('pre', () => { calls++; return 'wrong'; });
  f.ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'pre') { entered.resolve(); await gate.promise; }
    return next();
  }, { global: true });
  const pending = f.call('pre', stop.signal);
  await entered.promise; stop.abort({ kind: 'user' });
  const result = await deadline(pending);
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  assert.match(result.error.message, /cancelled by user/);
  gate.resolve(); await delay(25); assert.equal(calls, 0);
});

for (const hook of ['tools/post-execute', 'tools/ptc-dispatch-log']) test(`a stalled ${hook} cannot hold the PTC turn open`, async t => {
  const f = await fixture(t), gate = f.gate();
  f.ctx.on(hook, async (...args) => {
    const next = args.at(-1), exec = hook === 'tools/post-execute' ? args[0] : args[0].exec;
    if (hook !== 'tools/post-execute' || exec.name === 'ok') await gate.promise;
    return next();
  }, { global: true });
  const result = await deadline(f.call('ok'));
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  gate.resolve(); await delay(25);
  assert.equal(f.events.filter(event => event.type === 'tool/ptc-dispatch').length, 1);
});

for (const stage of ['pre', 'cwd', 'post']) test(`root ${stage} wait is bounded without starting late work or approving an unfinished policy`, async t => {
  const f = await fixture(t), gate = f.gate(); let calls = 0;
  f.register('count', () => { calls++; return 'counted'; });
  if (stage === 'cwd') f.ctx.workingDirectory.ensure = () => gate.promise;
  else f.ctx.on(`tools/${stage === 'pre' ? 'pre-execute' : 'post-execute'}`, async (...args) => {
    if (args[0].name === 'run_code') await gate.promise;
    return args.at(-1)();
  }, { global: true });
  const result = await deadline(f.call('count'));
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  assert.match(result.error.message, /timed out/);
  gate.resolve(); await delay(25);
  assert.equal(calls, stage === 'post' ? 1 : 0);
});

test('human approval retains its native wait and the program budget starts again after approval', async t => {
  const f = await fixture(t), approval = f.gate();
  f.ctx.reflect.provide('approval', { request: () => approval.promise });
  f.ctx.on('tools/pre-execute', (exec, next) => exec.name === 'run_code' ? { kind: 'ask', reason: 'review this program' } : next(), { global: true });
  const pending = f.call('ok');
  await delay(80); approval.resolve('allowed-once');
  assert.equal((await deadline(pending)).isError, false);
});

test('an unawaited nested call cannot bypass cleanup or start more work after program completion', async t => {
  const f = await fixture(t, { runtime: { async run(spec) {
    void spec.bindings[0].functions.slow({}).catch(() => {});
    await delay(5);
    return { logs: [], value: 'program returned early' };
  } } }), gate = f.gate();
  f.register('slow', () => gate.promise);
  const result = await deadline(f.call('slow'));
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  assert.equal(result.error.info.cleanupPending, true);
});

test('successful and failing tools keep native values, errors and exactly one nested result', async t => {
  const f = await fixture(t);
  f.register('bad', () => { throw Error('specific native failure'); });
  const success = await f.call('ok'); assert.equal(success.value.result, 'OK');
  const failed = await f.call('bad'); assert.equal(failed.isError, true); assert.match(failed.error.message, /specific native failure/);
  assert.equal(f.events.filter(event => event.type === 'tool/ptc-dispatch').length, 2);
});

test('reloading the adapter cannot forget unresolved work and admit a duplicate operation', async t => {
  const f = await fixture(t), gate = f.gate(); let calls = 0;
  f.register('slow', () => { calls++; return gate.promise; });
  assert.notEqual(await deadline(f.call('slow')), 'hung');
  await f.owner.dispose();
  await f.install();
  const result = await f.call('slow');
  assert.equal(result.error.info.code, 'OMD_PTC_CLEANUP_PENDING'); assert.equal(calls, 1);
  gate.resolve(); await delay(25);
  assert.equal((await f.call('ok')).isError, false);
});

test('late execution middleware cannot dispatch a nested side effect after timeout', async t => {
  const f = await fixture(t), gate = f.gate(); let calls = 0;
  f.register('late', () => { calls++; return 'must not run'; });
  f.ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'late') await gate.promise;
    return next();
  }, { global: true });
  const result = await deadline(f.call('late'));
  assert.notEqual(result, 'hung'); assert.equal(result.isError, true);
  gate.resolve(); await delay(25); assert.equal(calls, 0);
});

test('quarantine preserves existing direct job controls but does not admit replaced or business tools', async t => {
  const f = await fixture(t), gate = f.gate();
  const scope = createScope(f.ctx, f.agent); f.agent.ctx = scope.ctx;
  f.register('slow', () => gate.promise);
  const remove = f.register('job_kill', () => 'cancel requested');
  assert.equal((await deadline(f.call('slow'))).isError, true);
  const restore = scope.ctx.get('tools').presentAs('native');
  const direct = name => f.ctx.tools.execute({ name, arguments: {}, callId: 'control-' + name, agent: f.agent, signal: new AbortController().signal });
  assert.equal((await direct('job_kill')).value, 'cancel requested');
  assert.equal((await direct('ok')).error.info.code, 'OMD_PTC_CLEANUP_PENDING');
  remove(); f.register('job_kill', () => 'replacement must not run');
  assert.equal((await direct('job_kill')).error.info.code, 'OMD_PTC_CLEANUP_PENDING');
  restore();
});
