import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PluginPreflight, withPluginPreflight } from '../src/plugin-preflight/service.mjs';
import { packageDigest, LIMITS } from '../src/plugin-preflight/shared.mjs';
import { runProbe, sweep } from '../src/plugin-preflight/process.mjs';

async function fixture(t, probe = async () => ({ ok: true })) {
  const root = await mkdtemp(join(tmpdir(), 'omd-preflight-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
  const calls = []; let enabled = true;
  const manager = {
    async installBundle(...args) { calls.push(['install', ...args]); return { application: 'applied', changed: true, stage: 'install', target: args[0] }; },
    async setBundleEnabled(...args) { calls.push(['enable', ...args]); return { application: 'applied' }; },
    async setPluginEnabled(...args) { calls.push(['entry', ...args]); return { application: 'applied' }; },
    async removeBundle(...args) { calls.push(['remove', ...args]); return { application: 'applied' }; },
    async waitForInstall() { return null; }, async cancelInstall() { return { status: 'not-running' }; },
    async runPnpm() { return { exitCode: 0, output: '' }; },
    async listPlugins() { return [{ entryId: 'include:one', patchId: 'one' }]; },
    async listBundles() { return [{ name: 'fixture', rows: [{ entryId: 'include:one', rowId: 'one' }] }]; },
  };
  const original = manager.installBundle;
  const service = new PluginPreflight({ manager, profile: { dir: root }, directory: join(root, 'runs'),
    getEnabled: () => enabled, probe, hostVersion: '0.2.1-rc.2', cli: '/unused' }).bind();
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  return { root, manager, service, calls, original, disable: () => { enabled = false; } };
}
async function until(fn) {
  for (let i = 0; i < 300; i++) { const value = fn(); if (value) return value; await delay(10); }
  throw Error('condition timed out');
}
const failure = Object.assign(Error('synthetic startup failure'), { code: 'host-failed', details: 'Authorization: Bearer private-value\nhttps://x.test/?token=private-value' });

test('successful probe preserves the original installation and disabled mode bypasses it', async t => {
  let probes = 0;
  const f = await fixture(t, async () => { probes++; return { ok: true }; });
  const options = { requestId: 'one', enabled: false };
  assert.equal((await f.manager.installBundle('fixture@1.0.0', options)).application, 'applied');
  assert.deepEqual(f.calls[0], ['install', 'fixture@1.0.0', options]);
  f.disable(); await f.manager.installBundle('fixture@2.0.0'); assert.equal(probes, 1);
  assert.equal(f.service.snapshot().active, false);
});
test('failed checks never call the installer until this exact request is explicitly continued', async t => {
  const f = await fixture(t, async () => { throw failure; });
  const pending = f.manager.installBundle('https://name:private-value@x.test/p.tgz?token=private-value');
  await until(() => f.service.snapshot().phase === 'decision');
  const state = f.service.snapshot();
  assert.deepEqual(f.calls, []); assert.equal(state.failure.kind, 'failed');
  assert.doesNotMatch(JSON.stringify(state), /private-value/);
  assert.throws(() => f.service.decide('old-id', 'continue'), /已经结束/);
  f.service.decide(state.id, 'continue'); assert.equal((await pending).application, 'applied');
  assert.equal(f.calls.length, 1); assert.throws(() => f.service.decide(state.id, 'continue'));
});
test('cancellation awaits probe cleanup, and native request recovery observes the same operation', async t => {
  let cleaned = false, started = false;
  const f = await fixture(t, async (_, { signal }) => {
    started = true;
    try { await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }
    finally { await delay(20); cleaned = true; }
  });
  const pending = f.manager.installBundle('fixture', { requestId: 'cancel-me' });
  await until(() => started); const recovered = f.manager.waitForInstall('cancel-me');
  assert.equal((await f.manager.cancelInstall('cancel-me')).status, 'cancelled');
  assert.equal(cleaned, true); assert.equal((await pending).application, 'cancelled');
  assert.equal((await recovered).application, 'cancelled'); assert.deepEqual(f.calls, []);
});
test('update preparation retains the old bundle and probes only once around the entire update', async t => {
  let probes = 0;
  const f = await fixture(t, async () => { probes++; throw failure; });
  const pending = withPluginPreflight(f.manager, 'fixture@2', {}, async () => {
    await f.manager.removeBundle('fixture'); return f.manager.installBundle('fixture@2');
  });
  await until(() => f.service.snapshot().phase === 'decision'); assert.deepEqual(f.calls, []);
  f.service.decide(f.service.snapshot().id, 'continue'); await pending;
  assert.equal(probes, 1); assert.deepEqual(f.calls.map(x => x[0]), ['remove', 'install']);
});
test('changed profile and unavailable browser are reported as incomplete, not compatible', async t => {
  const f = await fixture(t, async () => { await writeFile(join(f.root, 'cordis.patch.yml'), '[]'); return { ok: true }; });
  const pending = f.manager.installBundle('fixture'); await until(() => f.service.snapshot().phase === 'decision');
  assert.equal(f.service.snapshot().failure.kind, 'unavailable');
  f.service.decide(f.service.snapshot().id, 'cancel'); assert.equal((await pending).application, 'cancelled');
});
test('only one preflight runs, shutdown cancels its decision and restores native descriptors', async t => {
  const f = await fixture(t, async () => { throw failure; });
  const pending = f.manager.installBundle('fixture'); await until(() => f.service.snapshot().phase === 'decision');
  const queued = f.manager.installBundle('other');
  await f.service.close(); assert.equal((await pending).application, 'cancelled'); assert.equal((await queued).application, 'cancelled');
  assert.equal(f.manager.installBundle, f.original);
});
test('an HMR disposal during the native installation cannot deadlock its own operation', async t => {
  const f = await fixture(t); let close;
  const pending = withPluginPreflight(f.manager, 'fixture', {}, async () => { close = f.service.close(); await close; return { application: 'applied' }; });
  assert.equal((await pending).application, 'applied'); await close;
});
test('entry enablement resolves its owning bundle; disabling does not start a worker', async t => {
  const probes = []; const f = await fixture(t, async input => { probes.push(input); return { ok: true }; });
  await f.manager.setPluginEnabled('include:one', false); assert.equal(probes.length, 0);
  await f.manager.setPluginEnabled('include:one', true);
  assert.equal(probes[0].bundle, 'fixture'); assert.equal(probes[0].entryId, 'one');
});
test('mutable installed content is refused before the native activation can continue', async t => {
  const f = await fixture(t, async () => ({ ok: true, identity: { name: 'fixture', digest: 'old' } }));
  await mkdir(join(f.root, 'node_modules/fixture'), { recursive: true }); await writeFile(join(f.root, 'node_modules/fixture/index.js'), 'changed');
  const result = await withPluginPreflight(f.manager, 'fixture', {}, () => f.manager.runPnpm(['add', 'fixture']));
  assert.equal(result.exitCode, 1); assert.match(result.output, /发生变化/);
});
test('package checks exclude unrelated dependency trees and detect changed source bytes', async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'index.js'), 'one');
  const a = await packageDigest(f.root);
  await mkdir(join(f.root, 'node_modules')); await writeFile(join(f.root, 'node_modules/ignored'), 'ignore');
  assert.equal((await packageDigest(f.root)).digest, a.digest);
  await writeFile(join(f.root, 'index.js'), 'two'); assert.notEqual((await packageDigest(f.root)).digest, a.digest);
});

test('worker completion, rejection, timeout and cancellation remove their entire temporary directories', { timeout: 20000 }, async t => {
  const f = await fixture(t), worker = new URL('./fixtures/preflight-worker.mjs', import.meta.url);
  const input = { cli: '/unused', scenario: 'pass' };
  assert.equal((await runProbe(input, { directory: join(f.root, 'runs'), worker })).ok, true);
  for (const scenario of ['fail', 'exit']) await assert.rejects(runProbe({ ...input, scenario }, { directory: join(f.root, 'runs'), worker }));
  await assert.rejects(runProbe({ ...input, scenario: 'wait' }, { directory: join(f.root, 'runs'), worker,
    limits: { ...LIMITS, runtimeMs: 100 } }), /超时/);
  const abort = new AbortController();
  const pending = runProbe({ ...input, scenario: 'wait' }, { directory: join(f.root, 'runs'), worker, signal: abort.signal,
    progress: () => abort.abort(Error('fixture cancelled')) });
  await assert.rejects(pending, /fixture cancelled/);
  assert.deepEqual(await readdir(join(f.root, 'runs')), []);
});
test('stale cleanup removes only owned dead runs and preserves foreign/live directories', async t => {
  const f = await fixture(t), dir = join(f.root, 'runs'); await mkdir(dir);
  for (const name of ['run-dead', 'run-live', 'foreign']) await mkdir(join(dir, name));
  await writeFile(join(dir, 'run-dead/owner.json'), JSON.stringify({ format: 'omd-plugin-preflight/v1', pid: 2147483000 }));
  await writeFile(join(dir, 'run-live/owner.json'), JSON.stringify({ format: 'omd-plugin-preflight/v1', pid: process.pid }));
  await sweep(dir); assert.deepEqual((await readdir(dir)).sort(), ['foreign', 'run-live']);
});
test('a crashed worker cannot strand an observed detached subprocess', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const f = await fixture(t); let pid;
  await assert.rejects(runProbe({ cli: '/unused', scenario: 'orphan' }, { directory: join(f.root, 'runs'),
    worker: new URL('./fixtures/preflight-worker.mjs', import.meta.url), progress: value => { pid = Number(value.split(':')[1]); } }));
  assert.ok(pid); assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
  assert.deepEqual(await readdir(join(f.root, 'runs')), []);
});
test('cleanup failures cannot be bypassed while resources remain unaccounted for', async t => {
  const f = await fixture(t, async () => { throw Object.assign(Error('cleanup is incomplete'), { code: 'cleanup-failed' }); });
  const pending = f.manager.installBundle('fixture'); await until(() => f.service.snapshot().phase === 'decision');
  assert.equal(f.service.snapshot().canContinue, false);
  assert.throws(() => f.service.decide(f.service.snapshot().id, 'continue'));
  f.service.decide(f.service.snapshot().id, 'cancel'); assert.equal((await pending).application, 'cancelled'); assert.deepEqual(f.calls, []);
});
test('a later wrapper remains functional when it retained the disposed preflight callback', async t => {
  let checks = 0; const f = await fixture(t, async () => { checks++; return { ok: true }; });
  const retained = f.manager.installBundle;
  const later = function (...args) { return retained.apply(this, args); };
  f.manager.installBundle = later; await f.service.close();
  assert.equal(f.manager.installBundle, later);
  assert.equal((await f.manager.installBundle('fixture')).application, 'applied'); assert.equal(checks, 0);
});
test('independent installs queue without overlapping workers, and queued requests remain cancellable', async t => {
  let running = 0, peak = 0; const f = await fixture(t, async () => {
    running++; peak = Math.max(peak, running); await delay(30); running--; return { ok: true };
  });
  const first = f.manager.installBundle('first', { requestId: 'first' });
  const cancelled = f.manager.installBundle('cancelled', { requestId: 'cancelled' });
  const second = f.manager.installBundle('second', { requestId: 'second' });
  assert.equal((await f.manager.cancelInstall('cancelled')).status, 'cancelled');
  assert.equal((await cancelled).application, 'cancelled');
  assert.equal((await f.manager.waitForInstall('second')).application, 'applied');
  await Promise.all([first, second]); assert.equal(peak, 1);
  assert.deepEqual(f.calls.map(call => call[1]), ['first', 'second']);
});
test('cancelling a stuck inventory read returns without starting a worker', async t => {
  let started = false, probes = 0; const f = await fixture(t, async () => { probes++; return { ok: true }; });
  f.service.getEntryStates = () => { started = true; return new Promise(() => {}); };
  const pending = f.manager.installBundle('fixture', { requestId: 'inventory' }); await until(() => started);
  assert.equal((await f.manager.cancelInstall('inventory')).status, 'cancelled');
  assert.equal((await pending).application, 'cancelled'); assert.equal(probes, 0);
});
