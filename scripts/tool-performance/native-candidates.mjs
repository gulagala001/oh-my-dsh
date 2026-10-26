import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHook } from 'node:async_hooks';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

// An independent targeted runner: deliberately not imported by the main suite.
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const moduleNames = ['tool-fs', 'fs-local', 'fs-observation-policy', 'tool-bash-persistent', 'terminal', 'terminal-bash', 'subprocess-local', 'tools'];
function resolver(root) {
  const require = createRequire(join(root, 'package.json'));
  return createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
}
async function inspect(root) {
  const host = resolver(root), sources = {};
  for (const name of moduleNames) {
    const path = host.resolve('@deepseek-ai/dsh-' + name), text = await readFile(path, 'utf8');
    sources[name] = { path, sha256: digest(text) };
  }
  return { hostVersion: JSON.parse(await readFile(host.resolve('@deepseek-ai/dsh/package.json'), 'utf8')).version, sources };
}
async function measured(run) {
  const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
  await delay(20); loop.reset(); await delay(1);
  const began = performance.now(), cpu = process.cpuUsage();
  try {
    const value = await run(), totalMs = performance.now() - began, used = process.cpuUsage(cpu);
    await delay(20);
    return { value, totalMs, processCpuMs: (used.user + used.system) / 1000, eventLoopMaxDelayMs: loop.count ? loop.max / 1e6 : null };
  } finally { loop.disable(); }
}
async function fixture(root, directory, terminal = false) {
  const host = resolver(root), load = name => import(pathToFileURL(host.resolve('@deepseek-ai/dsh-' + name)).href);
  const { Context } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis')).href);
  const { ToolRuntime } = await load('tools'), ctx = new Context(), events = [];
  const session = { id: 'native-candidate', header: { id: 'native-candidate' }, append(type, data) { events.push({ seq: events.length, type, data }); }, snapshotEvents: () => [...events] };
  const agent = { id: session.id, ctx, session };
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('workingDirectory', { ensure: async () => directory });
  ctx.reflect.provide('agents', { get: id => id === agent.id ? agent : undefined });
  ctx.reflect.provide('sandbox', { confine() { throw Error('Unexpected confinement route'); } });
  ctx.reflect.provide('sandboxPolicy', { defaultMode: 'danger-full-access', resolve: () => ({ mode: 'danger-full-access', workspaceRoot: directory, sessionId: session.id }) });
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  const identity = [], fs = await load('tool-fs');
  const register = ctx.tools.register;
  ctx.tools.register = function (definition) {
    const owner = this.ctx.fiber;
    identity.push({ tool: definition.name, fiberUid: owner.uid, fiberState: owner.state, fiberKeys: Object.keys(owner),
      entryName: owner.entry?.options?.name ?? null, runtimeKeys: Object.keys(owner.runtime ?? {}),
      runtimeName: owner.runtime?.name ?? null, callbackName: owner.runtime?.callback?.name ?? null,
      exactNativeFsApply: owner.runtime?.callback === fs.apply });
    return register.call(this, definition);
  };
  if (terminal) {
    const [{ LocalSubprocessRuntime }, { TerminalSessionService }, { SessionProjectionRegistry }, backend, persistent] = await Promise.all([
      load('subprocess-local'), load('terminal'), load('session-projection'), load('terminal-bash'), load('tool-bash-persistent'),
    ]);
    await ctx.plugin(LocalSubprocessRuntime); await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(TerminalSessionService);
    await ctx.plugin(backend, { shellArgs: ['--noprofile', '--norc'] });
    await ctx.plugin(persistent, { timeoutMs: 20000 });
  } else {
    const { LocalFileSystem } = await load('fs-local');
    await ctx.plugin(LocalFileSystem, { cwd: directory });
    await ctx.plugin(await load('fs-observation-policy'));
    await ctx.plugin(fs, { readImage: false });
  }
  await new Promise(resolve => setImmediate(resolve));
  let serial = 0;
  const call = (name, args, signal = new AbortController().signal) => {
    const callId = 'candidate-' + ++serial;
    return ctx.tools.execute({ name, arguments: args, callId, rootCallId: callId, agent, signal });
  };
  return { ctx, agent, identity, call, close: () => ctx.fiber.dispose() };
}

async function diffCases(options, evidence) {
  const f = await fixture(options.root, options.directory), rows = [], stages = [];
  const path = join(options.directory, 'diff.txt'), nativePath = evidence.sources['tool-fs'].path;
  const nativeSource = await readFile(nativePath, 'utf8'), start = nativeSource.indexOf('function computeHunkDiffs('), end = nativeSource.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start);
  const functionSource = nativeSource.slice(start, end), diffModule = createRequire(nativePath).resolve('diff');
  let worker, workerId = 0;
  try {
    for (const name of ['write', 'edit']) {
      const definition = f.ctx.tools.get(name, f.agent), original = definition.output.presentationMeta;
      definition.output.presentationMeta = (args, value) => { const began = performance.now(); try { return original(args, value); } finally { stages.push({ tool: name, metadataMs: performance.now() - began }); } };
    }
    const before = Array.from({ length: options.lines }, (_, i) => `before-${String(i).padStart(6, '0')} ${'source '.repeat(6)}`).join('\n');
    for (const change of ['localized', 'dense']) {
      const after = change === 'localized' ? before.replace(`before-${String(Math.floor(options.lines / 2)).padStart(6, '0')}`, 'localized-change')
        : Array.from({ length: options.lines }, (_, i) => `after-${String(i).padStart(6, '0')} ${'different '.repeat(5)}`).join('\n');
      for (const name of ['write', 'edit']) {
        let expected;
        for (let index = 0; index <= options.repeats; index++) {
          await writeFile(path, before); const read = await f.call('read', { file_path: path, limit: 1 }); assert.equal(read.isError, false);
          stages.length = 0;
          const args = name === 'write' ? { file_path: path, content: after } : { file_path: path, old_string: before, new_string: after };
          const sample = await measured(() => f.call(name, args));
          assert.equal(sample.value.isError, false, JSON.stringify(sample.value.content));
          assert.equal(sample.value.value.before, before); assert.equal(sample.value.value.after, after);
          assert.equal(await readFile(path, 'utf8'), after);
          expected ??= sample.value.meta;
          assert.deepEqual(sample.value.meta, expected);
          rows.push({ path: 'native-tool', tool: name, change, mode: index ? 'warm' : 'first', ...sample, value: undefined,
            metadataMs: stages.reduce((sum, row) => sum + row.metadataMs, 0), resultHash: digest(sample.value), diffHunks: sample.value.meta.diffs.length });
        }
        if (!worker) {
          const began = performance.now();
          worker = new Worker(new URL(import.meta.url), { workerData: { kind: 'pure-diff', functionSource, diffModule }, execArgv: [] });
          await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
          evidence.workerStartupMs = performance.now() - began;
        }
        for (let index = 0; index <= options.repeats; index++) {
          const sample = await measured(() => new Promise((resolve, reject) => {
            const id = ++workerId;
            const onMessage = reply => { if (reply.id !== id) return; worker.off('message', onMessage); if (reply.error) reject(Error(reply.error)); else resolve(reply); };
            worker.on('message', onMessage); worker.postMessage({ id, path, before, after });
          }));
          assert.deepEqual(sample.value.diffs, expected.diffs);
          rows.push({ path: 'pure-worker-kernel', tool: name, change, mode: index ? 'warm' : 'first', ...sample, value: undefined,
            kernelMs: sample.value.kernelMs, diffHash: digest(sample.value.diffs), matchesNativeMetadata: true });
        }
      }
    }
    // The original version guard must still reject a stale write without altering the file.
    await writeFile(path, 'observed'); await f.call('read', { file_path: path }); await writeFile(path, 'external-change');
    const stale = await f.call('write', { file_path: path, content: 'must-not-commit' });
    assert.equal(stale.isError, true); assert.equal(await readFile(path, 'utf8'), 'external-change');
    return { sourceFunctionHash: digest(functionSource), registrationIdentity: f.identity, rows, staleVersionRejected: true,
      integrationBoundary: 'Worker comparison is a pure kernel only. Native presentationMeta is synchronous and receives a cloned/deep-frozen value. Awaiting a worker after filesystem commit introduces a cancellation/unload window; this runner does not claim that unsafe adapter preserves transaction receipts.' };
  } finally { await worker?.terminate(); await f.close(); }
}

async function persistentCases(options, evidence) {
  const f = await fixture(options.root, options.directory, true), stages = [], pauses = [], rows = [];
  const nativePath = evidence.sources['tool-bash-persistent'].path;
  const originalSend = f.ctx.terminals.startSend, originalRead = f.ctx.terminals.read;
  f.ctx.terminals.startSend = function (...args) {
    const began = performance.now(), operation = originalSend.apply(this, args);
    operation.done.then(result => stages.push({ stage: 'send.done', elapsedMs: performance.now() - began, waitReason: result.waitReason, status: result.sessionStatus.kind }), () => {});
    return operation;
  };
  f.ctx.terminals.read = function (...args) { const began = performance.now(); try { return originalRead.apply(this, args); } finally { stages.push({ stage: 'scrollback.read', elapsedMs: performance.now() - began }); } };
  const hook = createHook({ init(id, type, _trigger, resource) {
    if (type === 'Timeout' && resource._idleTimeout === 25 && new Error().stack?.includes(nativePath)) pauses.push({ id, requestedMs: 25 });
  } });
  const run = async (label, command, signal) => {
    stages.length = 0; pauses.length = 0; hook.enable();
    let sample; try { sample = await measured(() => f.call('bash', { command }, signal)); } finally { hook.disable(); }
    rows.push({ label, ...sample, value: undefined, result: sample.value, stages: [...stages], poll25msCount: pauses.length, poll25msRequestedMs: pauses.length * 25 });
    return sample.value;
  };
  try {
    await writeFile(join(options.directory, 'fixture.txt'), Array.from({ length: options.lines }, (_, i) => `source-${i}\n`).join(''));
    const initialized = await run('cold-state-setup', "export PERF_STATE=preserved; printf 'ready\\n'"); assert.equal(initialized.isError, false);
    for (let index = 0; index < options.repeats; index++) {
      const result = await run('warm-short-file-command', "printf '%s\\n' \"$PERF_STATE\"; wc -l < fixture.txt");
      assert.equal(result.isError, false); assert.match(result.value, /preserved/); assert.ok(result.value.includes(String(options.lines)));
    }
    const long = await run('silent-3.2s-command', 'sleep 3.2; wc -l < fixture.txt'); assert.equal(long.isError, false); assert.ok(long.value.includes(String(options.lines)));
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 150);
    try { const result = await run('cancel-active-command', "printf 'before-cancel\\n'; sleep 10; printf 'must-not-run\\n'", abort.signal); assert.equal(result.isError, true); }
    finally { clearTimeout(timer); }
    const recovered = await run('state-after-cancel', 'printf "%s\\n" "${PERF_STATE-unset}"');
    assert.equal(recovered.isError, false); assert.match(recovered.value, /unset/);
    return { rows, registrationIdentity: f.identity, statePreservedAcrossNormalCalls: true, cancellationResetsState: true,
      integrationBoundary: '25ms pause occurs only after a native send.done that has neither completion marker, exit, stdin wait, timeout nor cancellation. TerminalSessionService exposes no public output subscription. Do not replace readiness, stream ownership, timeout/reset or marker parsing with a raw PTY data event.' };
  } finally { hook.disable(); await f.close(); }
}

if (!isMainThread && workerData?.kind === 'pure-diff') {
  const { structuredPatch } = await import(pathToFileURL(workerData.diffModule).href);
  const compute = new Function('structuredPatch', workerData.functionSource + '; return computeHunkDiffs;')(structuredPatch);
  parentPort.on('message', ({ id, path, before, after }) => {
    const began = performance.now();
    try { parentPort.postMessage({ id, diffs: compute(path, before, after), kernelMs: performance.now() - began }); }
    catch (error) { parentPort.postMessage({ id, error: error.stack }); }
  });
  parentPort.postMessage({ ready: true });
} else if (process.argv[2] === '--child') {
  const options = JSON.parse(process.argv[3]), report = { kind: 'native-tool-candidates', options, ...(await inspect(options.root)),
    measurement: 'Wall/CPU exclude 20ms pre/post event-loop probe waits and 1ms activation yield; histogram resolution 10ms. CPU is this Node process, not PTY children. Worker kernel comparison is not an installed optimization.' };
  try {
    if (options.cases.includes('diff')) report.diff = await diffCases(options, report);
    if (options.cases.includes('persistent-bash')) report.persistentBash = await persistentCases(options, report);
    report.processPeakRssBytes = process.resourceUsage().maxRSS * 1024;
  } catch (error) { report.error = error.stack; process.exitCode = 1; }
  process.send(report); process.disconnect();
} else {
  const args = process.argv.slice(2), options = { root: resolve(fileURLToPath(new URL('../..', import.meta.url))), lines: 1500, repeats: 3, cases: ['diff', 'persistent-bash'] };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') { console.log('node scripts/tool-performance/native-candidates.mjs --root SOURCE --out /path/.local/report.json [--cases diff,persistent-bash] [--lines 1500] [--repeats 3] [--inspect]'); process.exit(0); }
    if (key === '--inspect') { options.inspect = true; continue; }
    const value = args[++i]; if (!value) throw Error('Missing value: ' + key);
    if (['--root', '--out'].includes(key)) options[key.slice(2)] = resolve(value);
    else if (key === '--cases') options.cases = value.split(',');
    else if (['--lines', '--repeats'].includes(key)) options[key.slice(2)] = Number(value);
    else throw Error('Unknown option: ' + key);
  }
  if (options.inspect) { console.log(JSON.stringify(await inspect(options.root), null, 2)); process.exit(0); }
  if (!options.out?.split(/[\\/]/).includes('.local') || !Number.isSafeInteger(options.lines) || options.lines < 20 || options.lines > 8000
    || !Number.isSafeInteger(options.repeats) || options.repeats < 1 || options.repeats > 20 || options.cases.some(name => !['diff', 'persistent-bash'].includes(name))) throw Error('Invalid benchmark options');
  await mkdir(dirname(options.out), { recursive: true });
  options.directory = await mkdtemp(join(dirname(options.out), 'native-candidates-')); await mkdir(join(options.directory, 'home'));
  const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { HOME: join(options.directory, 'home'), USERPROFILE: join(options.directory, 'home'), TMPDIR: options.directory, DSH_HOME: options.directory });
  let report, error;
  const child = fork(fileURLToPath(import.meta.url), ['--child', JSON.stringify(options)], { env, cwd: options.directory, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.on('message', value => { report = value; }); child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
  try {
    const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    if (!report || exit.code !== 0) error = report?.error ?? JSON.stringify(exit);
  } catch (failure) { error = failure.stack; }
  finally { await writeFile(options.out, JSON.stringify(report ?? { error }, null, 2) + '\n'); await rm(options.directory, { recursive: true, force: true }); }
  if (error) { console.error(error); process.exitCode = 1; } else console.log(JSON.stringify({ report: options.out, diffRows: report.diff?.rows.length, persistentRows: report.persistentBash?.rows.length }));
}
