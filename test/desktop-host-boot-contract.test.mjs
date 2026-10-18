import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { desktopInputs, digest, inside, repoRoot } from './fixtures/desktop-host-boot/inputs.mjs';
import { desktopEnvironment } from '../scripts/desktop-test-environment.mjs';
import { assertModelTakeover, modelPriority } from './fixtures/desktop-host-boot/model-panel.mjs';

// These are dependency-free contract checks. No Electron, browser, installer,
// package manager, real account, provider or user-home operation is performed.
const source = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

test('model takeover evidence rejects unchanged stock UI, missing stock and multiple active occupants', () => {
  const stock = { kind: 'single', occupants: [{ priority: 3, active: true }] };
  const priority = modelPriority(stock);
  // Registrant display names are deliberately identical: takeover evidence
  // comes from the public numeric priority/active contract, never owner names.
  const installed = { kind: 'single', occupants: [
    { priority: 3, active: false, registrant: 'apply' }, { priority: 2.5, active: true, registrant: 'apply' },
  ] };
  assertModelTakeover(installed, priority);
  assert.throws(() => assertModelTakeover(stock, priority), /priority minus 0.5/);
  assert.throws(() => assertModelTakeover({ ...installed, occupants: [installed.occupants[1]] }, priority), /stock-priority occupant/);
  assert.throws(() => assertModelTakeover({ ...installed, occupants: installed.occupants.map(row => ({ ...row, active: true })) }, priority), /Exactly one elected/);
});

function archive(manifest) {
  const members = {
    'package/package.json': JSON.stringify(manifest), 'package/lib/client.js': 'frozen client fixture',
    'package/cordis.patch.yml': '[]', 'package/presets/cordis.patch.yml': '[]',
    'package/release-manifest.json': JSON.stringify({ releases: [{ version: manifest.version }] }),
  };
  const parts = [];
  for (const [name, content] of Object.entries(members)) {
    const body = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
async function fixture(t, manifest = source) {
  await mkdir(join(repoRoot, '.cache'), { recursive: true });
  const root = await realpath(await mkdtemp(join(repoRoot, '.cache', 'desktop-contract-')));
  t.after(() => rm(root, { recursive: true, force: false }));
  const resources = join(root, 'windows-app', 'resources'); await mkdir(resources, { recursive: true });
  const executable = join(root, 'windows-app', 'DeepSeek Harness.exe'), appRoot = join(resources, 'app.asar'), tgz = join(root, 'omd.tgz');
  const bytes = archive(manifest);
  await writeFile(executable, 'non-executable input fixture'); await writeFile(appRoot, 'ASAR path fixture'); await writeFile(tgz, bytes);
  return { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    OMD_DESKTOP_TEST_ROOT: root, OMD_DESKTOP_EXECUTABLE: executable, OMD_DESKTOP_APP_ROOT: appRoot,
    OMD_PLUGIN_ARCHIVE: tgz, OMD_PLUGIN_ARCHIVE_SHA256: digest(bytes) };
}

test('rc.2 input accepts only the frozen current bundle and its exact isolated paths', async t => {
  const env = await fixture(t), value = await desktopInputs(env, 'win32', 'x64');
  assert.equal(value.hostVersion, '0.2.1-rc.2'); assert.equal(value.manifest.version, source.version);
  assert.equal(value.archive, env.OMD_PLUGIN_ARCHIVE);
  assert.equal(await realpath(repoRoot), await realpath(new URL('../', import.meta.url)));
});
test('missing inputs and unsupported platform/architecture fail without a skip result', async t => {
  const env = await fixture(t);
  for (const key of Object.keys(env).filter(key => key.startsWith('OMD_'))) {
    const invalid = { ...env }; delete invalid[key];
    await assert.rejects(desktopInputs(invalid, 'win32', 'x64'), /Missing required Desktop input/);
  }
  await assert.rejects(desktopInputs(env, 'linux', 'x64'), /Linux UI launch is unsupported/);
  await assert.rejects(desktopInputs(env, 'darwin', 'x64'), /Host boot requires/);
  await assert.rejects(desktopInputs({ ...env, RUNNER_ENVIRONMENT: 'self-hosted' }, 'win32', 'x64'), /restricted to disposable GitHub-hosted/);
});
test('wrong rc pairing, SDK peers, digest and parent-of-repo roots fail closed', async t => {
  const env = await fixture(t);
  await assert.rejects(desktopInputs({ ...env, OMD_PLUGIN_ARCHIVE_SHA256: '0'.repeat(64) }, 'win32', 'x64'), /Frozen tgz SHA-256/);
  await assert.rejects(desktopInputs({ ...env, OMD_DESKTOP_TEST_ROOT: join(repoRoot, '..') }, 'win32', 'x64'), /checkout\/\.cache/);
  const rc1 = await fixture(t, { ...source, engines: { ...source.engines, dsh: '0.2.1-rc.1' } });
  await assert.rejects(desktopInputs(rc1, 'win32', 'x64'), /0\.2\.1-rc\.1/);
  const peer = await fixture(t, { ...source, peerDependencies: { ...source.peerDependencies, '@deepseek-ai/dsh-tools': '0.2.1-alpha.2' } });
  await assert.rejects(desktopInputs(peer, 'win32', 'x64'), /@deepseek-ai\/dsh-tools/);
});
test('app and installer environment excludes tokens, provider keys and old HOME/config', () => {
  const root = join(repoRoot, 'exclusive-fixture');
  const env = desktopEnvironment(root, { PATH: '/safe/bin', HOME: '/real-home', DSH_HOME: '/active-dsh',
    APPDATA: '/real-appdata', GITHUB_TOKEN: 'must-not-forward', GH_TOKEN: 'must-not-forward', ACTIONS_RUNTIME_TOKEN: 'must-not-forward',
    OPENAI_API_KEY: 'must-not-forward', DEEPSEEK_API_KEY: 'must-not-forward', NODE_OPTIONS: 'must-not-forward', HTTP_PROXY: 'must-not-forward' });
  assert.equal(env.PATH, '/safe/bin');
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'NODE_OPTIONS', 'HTTP_PROXY'])
    assert.equal(env[key], undefined, key);
  for (const key of ['HOME', 'USERPROFILE', 'DSH_HOME', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TMPDIR', 'npm_config_cache', 'npm_config_userconfig'])
    assert(inside(root, env[key]) && env[key] !== root, key);
  assert.equal(env.DESKTOP_HOST_FIXTURE, 'local-test-only');
});

test('actual Host observer vetoes model streams before continuation and rejects unauthenticated reads', async () => {
  const root = resolve(repoRoot, '.cache', 'observer-contract'), records = [], handlers = new Map();
  const callbacks = new Map(), registration = {}, disposers = [];
  const text = await readFile(new URL('./fixtures/desktop-host-boot/observer.mjs', import.meta.url), 'utf8');
  const apply = runInNewContext(text.replace(/^import .*\n/gm, '').replace('export const inject', 'const inject')
    .replace('export function apply', 'function apply') + '\napply', {
    appendFileSync: (_file, text) => records.push(JSON.parse(text)), randomUUID, resolve, sep, pathToFileURL,
    process: { pid: 3141, env: desktopEnvironment(root, {}), once: (name, fn) => handlers.set(name, fn) },
  });
  const rootFiber = Object.freeze({ uid: 0 });
  let loader = {};
  const ctx = { fiber: { state: 2 }, root: { fiber: rootFiber }, profileContext: { dir: join(root, 'home/profiles/desktop') },
    get: name => name === 'loader' ? loader : undefined,
    on: (name, fn, options) => { callbacks.set(name, fn); registration[name] = options; },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose; },
    webServer: { register: route => { callbacks.set('http', route.handler); } },
    connection: { requestRejection: () => 403 } };
  apply(ctx, { root, trace: join(root, 'trace'), sdkNames: [] });
  let continued = false;
  assert.throws(() => callbacks.get('llm/stream')({ provider: 'unexpected', model: 'must-not-run' }, () => { continued = true; }), /forbids all model calls/);
  assert.equal(continued, false); assert.equal(registration['llm/stream'].global, true); assert.equal(registration['llm/stream'].prepend, true);
  assert.equal(records.filter(row => row.event === 'model-call').length, 1);
  let status;
  callbacks.get('http')({ method: 'GET' }, { writeHead: value => { status = value; }, end() {} });
  assert.equal(status, 403);
  // Exercise the actual beforeExit callback's predicate on both service
  // states. The real Cordis root uid remains 0 throughout, never null.
  handlers.get('beforeExit')(0);
  assert.equal(records.at(-1).rootDisposed, false, 'A still-mounted Loader is not root teardown evidence');
  for (const dispose of disposers.reverse()) dispose();
  assert.equal(records.at(-1).event, 'disposed');
  loader = undefined; handlers.get('beforeExit')(0);
  assert.equal(records.at(-1).rootDisposed, true, 'Loader removal attests root teardown with uid still 0');
  assert.equal(rootFiber.uid, 0); handlers.get('exit')(0);
  assert.equal(records.at(-1).modelCalls, 1, 'Model failure stays counted through process exit');
});

test('actual workflow acceptance gate rejects zero execution, skips and unsuccessful evidence', async t => {
  const env = await fixture(t), root = env.OMD_DESKTOP_TEST_ROOT;
  const workflow = await readFile(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8');
  const gate = [...workflow.matchAll(/node --input-type=module - <<'NODE'\n([\s\S]*?)\n          NODE/g)]
    .map(match => match[1]).find(text => text.includes("'host-boot.tap'"));
  assert(gate, 'Real workflow must verify test counts and evidence');
  const evidence = join(root, 'host-boot-evidence'); await mkdir(evidence);
  const report = { status: 'passed', executed: 1, skipped: 0, launches: [{}, {}], shutdowns: [{}, {}] };
  const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';
  const run = async (text = tap, data = report) => {
    await writeFile(join(root, 'host-boot.tap'), text); await writeFile(join(evidence, 'desktop-host-boot.json'), JSON.stringify(data));
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', gate], { encoding: 'utf8',
      env: { OMD_DESKTOP_TEST_ROOT: root, GITHUB_STEP_SUMMARY: join(root, 'summary') } });
    assert.ifError(result.error); return result;
  };
  assert.equal((await run()).status, 0);
  for (const text of ['', tap.replace('# tests 1', '# tests 0'), tap.replace('# pass 1', '# pass 0'),
    tap.replace('# skipped 0', '# skipped 1'), tap.replace('# cancelled 0', '# cancelled 1')])
    assert.notEqual((await run(text)).status, 0, 'Do not greenlight missing/zero/skipped/cancelled tests');
  assert.notEqual((await run(tap, { ...report, status: 'failed' })).status, 0, 'Cleanup failure cannot pass');
});
