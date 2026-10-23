import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installPtcLifecycle } from '../src/ptc-lifecycle.mjs';

const anchor = createRequire(realpathSync(process.env.OMD_PTC_TEST_HOST
  ?? createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const load = name => import(anchor.resolve('@deepseek-ai/dsh-' + name));
const { Context, symbols } = await import(anchor.resolve('@deepseek-ai/cordis'));
const [{ ToolRuntime }, { NodePtcRuntime }, { LocalSubprocessRuntime }] = await Promise.all([
  load('tools'), load('ptc-runtime-node'), load('subprocess-local'),
]);

async function fixture(t, executionMode = 'per-call') {
  const directory = await mkdtemp(join(tmpdir(), 'ptc-native-')), ctx = new Context(), gates = [];
  const session = { id: 'native-ptc', append() {} }, agent = { ctx, session };
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('fs', { processPathFromHostPath: path => path });
  ctx.reflect.provide('workingDirectory', { ensure: async () => directory });
  ctx.reflect.provide('sessions', { get: id => id === session.id ? session : undefined });
  ctx.reflect.provide('sandbox', { confine() { throw Error('Unexpected sandbox route'); } });
  ctx.reflect.provide('sandboxPolicy', { defaultMode: 'danger-full-access', resolve: () => ({ mode: 'danger-full-access', workspaceRoot: directory, sessionId: session.id }) });
  await ctx.plugin(LocalSubprocessRuntime);
  await ctx.plugin(NodePtcRuntime, { executionMode, timeoutMs: 500, maxTimeoutMs: 1500, graceMs: 25 });
  await ctx.plugin(ToolRuntime, { mode: 'ptc' });
  if (process.env.OMD_PTC_BASELINE !== '1') installPtcLifecycle(ctx, { cleanupMs: 50 });
  await new Promise(resolve => setImmediate(resolve));
  let sequence = 0, probes = 0;
  ctx.tools.register({ name: 'probe', description: 'Native PTC round trip', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'number' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: () => ++probes, isConcurrencySafe: () => true });
  const call = (code, extras = {}) => ctx.tools.execute({ name: 'run_code', arguments: { code, description: 'Native regression', ...extras.arguments },
    callId: `native-${++sequence}`, agent, signal: extras.signal ?? new AbortController().signal });
  t.after(async () => { for (const gate of gates) gate.resolve(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { ctx, directory, call, probes: () => probes, gates };
}

test('real Node PTC preserves results, failures, timeout, cancellation and recovery', async t => {
  const f = await fixture(t);
  const parallel = await f.call('return await Promise.all([tools.probe({}), tools.probe({})]);');
  assert.equal(parallel.isError, false); assert.deepEqual(parallel.value.result, [1, 2]);
  const failed = await f.call('console.log("kept output"); throw Error("real program failure");');
  assert.equal(failed.isError, true); assert.match(failed.error.message, /real program failure/); assert.match(failed.error.message, /kept output/);
  const timeout = await f.call('while (true) {}', { arguments: { timeoutMs: 150 } });
  assert.equal(timeout.isError, true); assert.match(timeout.error.message, /timed out|deadline/);
  const stop = new AbortController(), pending = f.call('await new Promise(() => {});', { signal: stop.signal });
  setTimeout(() => stop.abort({ kind: 'user' }), 100);
  const cancelled = await pending;
  assert.equal(cancelled.isError, true); assert.match(cancelled.error.message, /cancelled by user/);
  const recovered = await f.call('return await tools.probe({});');
  assert.equal(recovered.isError, false); assert.equal(recovered.value.result, 3);
  assert.equal((f.ctx.subprocess[symbols.original] ?? f.ctx.subprocess).live.size, 0);
});

test('a real exited process with a stalled exit receipt cannot silence the parent result', async t => {
  const f = await fixture(t), gate = Promise.withResolvers(); f.gates.push(gate);
  const subprocess = f.ctx.subprocess[symbols.original] ?? f.ctx.subprocess, spawn = subprocess.spawn;
  subprocess.spawn = function (spec) {
    const handle = spawn.call(this, spec), wait = handle.waitForExit;
    handle.waitForExit = async (...args) => { const result = await wait(...args); await gate.promise; return result; };
    return handle;
  };
  const pending = f.call('const fs = await import("node:fs/promises"); await fs.writeFile("pid.txt", String(process.pid)); return await tools.probe({});');
  const result = await Promise.race([pending, delay(1200).then(() => 'hung')]);
  // Restore/settle even in the negative control so teardown remains real.
  subprocess.spawn = spawn; gate.resolve();
  assert.notEqual(result, 'hung', 'the worker already exited, but its native cleanup suppressed the terminal result');
  assert.equal(result.isError, true); assert.equal(result.error.info.code, 'OMD_PTC_TIMEOUT');
  const pid = Number(await readFile(join(f.directory, 'pid.txt'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await delay(25);
  assert.equal((await f.call('return await tools.probe({});')).value.result, 2);
});

test('retained PTC variables survive ordinary calls and clear on timeout as in the native runtime', async t => {
  const f = await fixture(t, 'persistent-in-memory');
  assert.equal((await f.call('let kept = 40; console.log(kept);')).isError, false);
  assert.match((await f.call('console.log(kept + 2);')).content[0].text, /42/);
  assert.equal((await f.call('await new Promise(() => {});', { arguments: { timeoutMs: 100 } })).isError, true);
  await delay(25);
  assert.match((await f.call('console.log(typeof kept);')).content[0].text, /undefined/);
});
