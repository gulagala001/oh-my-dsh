import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const modulePath = process.env.SEARCH_COMPAT_MODULE ?? '../src/search-compat.mjs';
const { bindSearchSubprocess, copyNonExecutableSearchBinary, installSearchCompatibility } = await import(modulePath);
const native = createRequire(realpathSync(process.env.SEARCH_TEST_HOST ?? createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const { Context } = await import(native.resolve('@deepseek-ai/cordis'));
const { ToolRuntime } = await import(native.resolve('@deepseek-ai/dsh-tools'));
const { createScope } = await import(native.resolve('@deepseek-ai/dsh-scope'));
const search = await import(native.resolve('@deepseek-ai/dsh-tool-fs-search'));
const posix = { skip: process.platform === 'win32' };
const copy = { source: '/packaged/rg', executable: '/private/rg' };

async function directory(t) {
  const root = await mkdtemp(join(process.env.SEARCH_TEST_TMPDIR ?? tmpdir(), 'search-compat-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'packaged-rg');
  await writeFile(source, '#!/bin/sh\nprintf synthetic-search', { mode: 0o600 });
  await chmod(source, 0o600);
  return { root, source };
}

test('native scoped and inherited grep/glob use the repaired executable without global registrations', async t => {
  const ctx = new Context(), spawns = [], source = await search.resolveRgPath();
  t.after(() => ctx.fiber.dispose());
  ctx.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.provide('workingDirectory', { ensure: async () => process.cwd() });
  const service = { spawn(spec) {
    spawns.push(spec);
    const text = spec.argv.includes('--files') ? './sample.txt\n' : JSON.stringify({ type: 'match', data: {
      path: { text: 'sample.txt' }, lines: { text: 'needle\n' }, line_number: 1, submatches: [], absolute_offset: 0,
    } }) + '\n';
    return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: {
      stdout: { readFrom: () => ({ text, lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) },
    } };
  } };
  ctx.provide('subprocess', service);
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  const parent = { session: { id: 'parent' } };
  parent.ctx = createScope(ctx, parent).ctx;
  await parent.ctx.inject(['tools', 'subprocess', 'systemPrompt', 'workingDirectory'], scope => {
    const caps = { maxMatches: 50, maxResults: 50, maxLineBytes: 1000, maxMetaBytes: 65536, rawOutputMaxBytes: 2000000,
      graceMs: 100, stderrMaxBytes: 65536, timeoutMs: 5000 };
    search.applyGrepTool(scope, caps); search.applyGlobTool(scope, caps);
  });
  const child = { session: { id: 'child' } };
  child.ctx = createScope(parent.ctx, child, { parent }).ctx;
  const dispose = bindSearchSubprocess(ctx, service, { source, executable: copy.executable }); t.after(dispose);
  assert.equal(ctx.tools.get('grep'), undefined);
  assert.ok(ctx.tools.get('grep', parent)); assert.ok(ctx.tools.get('grep', child));
  for (const agent of [parent, child]) for (const [name, args] of [['grep', { pattern: 'needle' }], ['glob', { pattern: '*.txt' }]]) {
    const result = await ctx.tools.execute({ agent, name, arguments: args, callId: name + agent.session.id, signal: new AbortController().signal });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(spawns.at(-1).argv[0], copy.executable);
    assert.equal(spawns.at(-1).argv[1], '--no-config');
  }
  // A scoped third-party replacement retains its definition and result.
  await child.ctx.inject(['tools'], scope => scope.tools.register({ name: 'grep', description: 'custom',
    parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: () => 'custom' }));
  const result = await ctx.tools.execute({ agent: child, name: 'grep', arguments: {}, callId: 'custom', signal: new AbortController().signal });
  assert.equal(result.value, 'custom'); assert.equal(spawns.length, 4);
});

test('only the packaged executable is remapped; native handles, cancellation and failures pass through', async () => {
  const seen = [], controller = new AbortController(), failure = Error('native failure'), handle = { done: Promise.resolve() };
  const service = {
    spawn(spec) { seen.push({ receiver: this, spec }); if (spec.fail) throw failure; return handle; },
    resolveExecutable(...args) { seen.push({ receiver: this, args }); return Promise.resolve(args[0]); },
  };
  const original = service.spawn, resolve = service.resolveExecutable;
  const dispose = bindSearchSubprocess({ on() {} }, service, copy);
  const spec = { argv: [copy.source, '--no-config', '--files', '.'], cwd: '/work', signal: controller.signal,
    env: { MARKER: 'preserve' }, stdio: { stdout: 'pipe' } };
  assert.equal(service.spawn(spec), handle);
  assert.equal(seen[0].receiver, service);
  assert.deepEqual(seen[0].spec, { ...spec, argv: [copy.executable, ...spec.argv.slice(1)] });
  assert.equal(seen[0].spec.signal, controller.signal); assert.equal(seen[0].spec.env, spec.env);
  assert.equal(await service.resolveExecutable(copy.source, spec.env, controller.signal), copy.executable);
  assert.deepEqual(seen.at(-1).args, [copy.executable, spec.env, controller.signal]);
  const other = { ...spec, argv: ['/other/rg', copy.source] };
  service.spawn(other); assert.equal(seen.at(-1).spec, other);
  await service.resolveExecutable('rg'); assert.deepEqual(seen.at(-1).args, ['rg']);
  assert.throws(() => service.spawn({ ...spec, fail: true }), error => error === failure);
  dispose(); dispose(); assert.equal(service.spawn, original); assert.equal(service.resolveExecutable, resolve);
});

test('independent module owners share wrappers and do not remove a later provider wrapper', async () => {
  const other = await import(modulePath + '?other-owner');
  const service = { spawn: spec => spec, resolveExecutable: command => command }, original = service.spawn;
  const first = bindSearchSubprocess({ on() {} }, service, copy), wrapper = service.spawn;
  const second = other.bindSearchSubprocess({ on() {} }, service, { ...copy, executable: '/private/second-rg' });
  assert.equal(service.spawn, wrapper);
  first(); assert.equal(service.spawn({ argv: [copy.source] }).argv[0], '/private/second-rg');
  const later = spec => wrapper(spec); service.spawn = later;
  second(); assert.equal(service.spawn, later);
  const spec = { argv: [copy.source] }; assert.equal(service.spawn(spec), spec);
  assert.notEqual(service.spawn, original);
});

test('a partially rejected binding restores the exact previous service descriptors', () => {
  const service = { spawn: spec => spec };
  Object.defineProperty(service, 'resolveExecutable', { value: command => command });
  const before = Object.getOwnPropertyDescriptors(service);
  assert.throws(() => bindSearchSubprocess({}, service, copy), TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptors(service), before);
});

test('private executable copies keep installed bytes and mode unchanged, including wrong-user execute bits', posix, async t => {
  const { root, source } = await directory(t), before = await readFile(source);
  const first = await copyNonExecutableSearchBinary(source, root);
  assert.deepEqual(await readFile(first.executable), before);
  assert.equal((await lstat(source)).mode & 0o777, 0o600);
  assert.equal((await lstat(first.executable)).mode & 0o777, 0o500);
  assert.equal(execFileSync(first.executable, { encoding: 'utf8' }), 'synthetic-search');
  await first.dispose();
  if (process.getuid() !== 0) {
    await chmod(source, 0o601);
    const repaired = await copyNonExecutableSearchBinary(source, root);
    assert.ok(repaired, 'an other-user execute bit does not make this owner able to execute'); await repaired.dispose();
  }
  await chmod(source, 0o700);
  assert.equal(await copyNonExecutableSearchBinary(source, root), null);
  assert.equal(await copyNonExecutableSearchBinary('rg', root), null);
});

test('an unsafe cache or missing binary fails explicitly without modifying the source', posix, async t => {
  const { root, source } = await directory(t), target = join(root, 'components', 'fs-search');
  await mkdir(join(root, 'components')); await symlink(root, target);
  await assert.rejects(copyNonExecutableSearchBinary(source, root), /owner-controlled/);
  await rm(target); await mkdir(target); await chmod(target, 0o777);
  await assert.rejects(copyNonExecutableSearchBinary(source, root), /owner-controlled/);
  await assert.rejects(copyNonExecutableSearchBinary(join(root, 'missing'), root), { code: 'ENOENT' });
  assert.equal((await lstat(source)).mode & 0o777, 0o600);
});

async function installed(t, { foreign = false } = {}) {
  const { root, source } = await directory(t), nativeEffects = [], warnings = [], spawned = [], gate = Promise.withResolvers();
  class Local {
    constructor() { this.ctx = { effect: fn => nativeEffects.push(fn()) }; }
    spawn(spec) { spawned.push(spec); return { done: gate.promise }; }
    async resolveExecutable(command, _env, signal) { signal?.throwIfAborted(); return command; }
  }
  class Remote extends Local {}
  const service = new (foreign ? Remote : Local)();
  const load = async name => name === '@deepseek-ai/dsh-subprocess-local' ? { LocalSubprocessRuntime: Local }
    : { resolveRgPath: async () => source };
  const loader = { *entries() { yield { options: { name: '@deepseek-ai/dsh-subprocess-local' }, parent: { tree: { import: load } } }; } };
  const install = async () => {
    const effects = [], scope = { subprocess: service, loader, fiber: { uid: 1, state: 1 },
      effect: fn => effects.push(fn()), logger: { warn: (...args) => warnings.push(args) }, on() {} };
    await installSearchCompatibility({ inject: (_deps, fn) => fn(scope) }, root);
    return () => Promise.all(effects.map(dispose => dispose()));
  };
  t.after(() => gate.resolve());
  return { root, source, service, install, nativeEffects, gate, spawned, warnings };
}

test('cold startup without a search entry repairs later consumers and reuses one provider-owned copy across reload', posix, async t => {
  const f = await installed(t), original = f.service.spawn;
  const release = await f.install(); assert.deepEqual(f.warnings, []);
  const executable = await f.service.resolveExecutable(f.source);
  assert.notEqual(executable, f.source);
  f.service.spawn({ argv: [f.source, '--no-config'] });
  assert.equal(f.spawned[0].argv[0], executable);
  await release(); assert.equal(f.service.spawn, original);
  assert.equal(execFileSync(executable, { encoding: 'utf8' }), 'synthetic-search', 'a resolved path survives plugin reload');
  const releaseAgain = await f.install();
  assert.equal(await f.service.resolveExecutable(f.source), executable);
  assert.equal((await readdir(join(f.root, 'components', 'fs-search'))).length, 1);
  await releaseAgain();
  let closed = false; const closing = Promise.all(f.nativeEffects.map(dispose => dispose())).then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
  assert.equal(execFileSync(executable, { encoding: 'utf8' }), 'synthetic-search');
  f.gate.resolve(); await closing;
  await assert.rejects(readFile(executable), { code: 'ENOENT' });
});

test('custom or remote subprocess providers keep their execution world and receive no local copy', posix, async t => {
  const f = await installed(t, { foreign: true }), original = f.service.spawn;
  await f.install();
  assert.equal(f.service.spawn, original); assert.equal(await f.service.resolveExecutable(f.source), f.source);
  assert.equal(f.nativeEffects.length, 0); assert.deepEqual(f.warnings, []);
  await assert.rejects(readdir(join(f.root, 'components')), { code: 'ENOENT' });
});
