import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { desktopInputs, desktopIdentity, assertDesktopPaths, assertExternalBackends, digest, inside, repoRoot } from './fixtures/desktop-host-boot/inputs.mjs';
import { desktopEnvironment } from '../scripts/desktop-test-environment.mjs';
import { assertModelTakeover, modelPriority } from './fixtures/desktop-host-boot/model-panel.mjs';
import { assertClientIdentity, assertHostUiIdentity, uiReplacements, clientComponents } from './fixtures/desktop-host-boot/client-identity.mjs';

// These are dependency-free contract checks. No Electron, browser, installer,
// package manager, real account, provider or user-home operation is performed.
const source = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

test('real external backend gate rejects any missing, enabled or non-boolean setting', () => {
  const disabled = { browserEnabled: false, nativeEnabled: false, extensionEnabled: false };
  assertExternalBackends(disabled);
  assert.throws(() => assertExternalBackends(undefined), /explicitly false/);
  for (const key of Object.keys(disabled)) {
    const missing = { ...disabled }; delete missing[key];
    assert.throws(() => assertExternalBackends(missing), /explicitly false/);
    for (const value of [true, undefined, null, 0])
      assert.throws(() => assertExternalBackends({ ...disabled, [key]: value }), /explicitly false/);
  }
});

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

test('serialized main identity reads installed resources without an import callback and still rejects mismatches/escapes', async t => {
  const env = await fixture(t), root = env.OMD_DESKTOP_TEST_ROOT;
  // Directory-shaped stand-ins exercise real fs and createRequire resolution;
  // actual ASAR handling remains an Electron CI check, never a Linux GUI run.
  const appRoot = join(root, 'identity-app.asar'), anchor = join(appRoot, 'dsh', 'package.json');
  await mkdir(join(appRoot, 'dsh'), { recursive: true });
  await writeFile(anchor, JSON.stringify({ name: 'isolated-runtime-anchor', private: true }));
  const expected = { appRoot, hostVersion: '0.2.1-rc.2', cordisVersion: '4.0.5',
    sdkNames: ['@deepseek-ai/dsh'],
    clientComponents: clientComponents(['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-renderer']) };
  const packages = [...expected.sdkNames, ...expected.clientComponents.dynamic, '@deepseek-ai/cordis'];
  for (const name of packages) {
    const directory = join(appRoot, 'dsh', 'node_modules', name); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name,
      version: name === '@deepseek-ai/cordis' ? expected.cordisVersion : expected.hostVersion,
      exports: { './package.json': './package.json' } }));
  }
  const builtins = [];
  const isolated = desktopEnvironment(root, {});
  let nodeHome = isolated.HOME;
  const sandbox = { process: { execPath: env.OMD_DESKTOP_EXECUTABLE, env: isolated, versions: { electron: 'contract-fixture' },
    getBuiltinModule: name => { builtins.push(name); return name === 'os' ? { homedir: () => nodeHome } : process.getBuiltinModule(name); } } };
  assert.equal(runInNewContext('typeof require', sandbox), 'undefined');
  // Deliberately omit importModuleDynamically: the original await import()
  // implementation fails here with the same missing-callback error as CI.
  const evaluate = runInNewContext('(' + desktopIdentity.toString() + ')', sandbox);
  // Native OS paths deliberately differ from the isolated process HOME. They
  // are path metadata only: no directory is read, copied, created or redirected.
  const nativeHome = resolve(root, '..', 'synthetic-native-home');
  const paths = { home: nativeHome, logs: join(nativeHome, 'Library', 'Logs', 'DeepSeek Harness'), userData: join(root, 'electron-data') };
  const app = { isPackaged: true, getAppPath: () => appRoot, getVersion: () => expected.hostVersion,
    getPath: key => { assert(Object.hasOwn(paths, key)); return paths[key]; } };
  const result = await evaluate({ app }, expected);
  assert.deepEqual(builtins, ['fs', 'path', 'module', 'os']);
  const isolatedPaths = { root, home: isolated.HOME, dshHome: isolated.DSH_HOME, userData: paths.userData };
  assert.equal(result.nativeHome, nativeHome); assert.equal(result.nativeLogs, paths.logs);
  assert.deepEqual(assertDesktopPaths(result, isolatedPaths), { homeWithinFixture: false, logsWithinFixture: false });
  nodeHome = nativeHome;
  const escapedNodeHome = await evaluate({ app }, expected);
  assert.throws(() => assertDesktopPaths(escapedNodeHome, isolatedPaths), /temporary fixture: nodeHome/);
  nodeHome = isolatedPaths.home;
  isolated.HOME = nativeHome;
  const escapedEnvironmentHome = await evaluate({ app }, expected);
  assert.throws(() => assertDesktopPaths(escapedEnvironmentHome, isolatedPaths), /temporary fixture: environmentHome/);
  isolated.HOME = isolatedPaths.home;
  for (const field of ['dshHome', 'userData'])
    assert.throws(() => assertDesktopPaths({ ...result, [field]: nativeHome }, isolatedPaths), /temporary fixture/);
  for (const name of packages) {
    assert.equal(result.manifests[name].file, await realpath(join(appRoot, 'dsh', 'node_modules', name, 'package.json')));
    assert.equal(result.manifests[name].version, name === '@deepseek-ai/cordis' ? expected.cordisVersion : expected.hostVersion);
  }
  assert.equal(result.appRoot, appRoot);
  // The shell seed intentionally has no standalone package.json here. A
  // non-seed client component is still mandatory in the actual resources.
  assert.equal(result.manifests['@deepseek-ai/dsh-client-ui-slots'], undefined);
  await assert.rejects(evaluate({ app }, { ...expected, clientComponents: clientComponents(['@deepseek-ai/dsh-client-missing']) }), /Cannot find module/);
  const sdkDirectory = join(appRoot, 'dsh', 'node_modules', '@deepseek-ai/dsh');
  await writeFile(join(sdkDirectory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.1' }));
  await assert.rejects(evaluate({ app }, expected), /Actual SDK identity mismatch/);
  const foreign = join(root, 'outside-resources'); await mkdir(foreign);
  await writeFile(join(foreign, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: expected.hostVersion }));
  await rm(sdkDirectory, { recursive: true }); await symlink(foreign, sdkDirectory, 'junction');
  await assert.rejects(evaluate({ app }, expected), /SDK outside official resources/);
});

test('actual client probe verifies shell seeds, boot release, dynamic module sources and real service instances', async () => {
  const slotsName = '@deepseek-ai/dsh-client-ui-slots', primitivesName = '@deepseek-ai/dsh-client-ui-primitives';
  const rendererName = '@deepseek-ai/dsh-client-ui-renderer', connectionName = '@deepseek-ai/dsh-client-connection';
  const conversationName = '@deepseek-ai/dsh-client-ui-conversation', chatName = '@deepseek-ai/dsh-client-ui-chat';
  const expected = { stage: 'stock', appVersion: '0.2.1-rc.2', hostVersion: '0.2.1-rc.2',
    publicComponents: [slotsName, primitivesName, rendererName, connectionName] };
  assert.deepEqual(clientComponents(expected.publicComponents), { static: [slotsName, primitivesName], dynamic: [rendererName, connectionName] });
  class Context {}
  class Service {}
  class SlotRegistry extends Service { snapshot() { return []; } }
  const exports = new Map([
    ['@deepseek-ai/cordis', { Context, Service, symbols: { original: Symbol.for('cordis.original') } }],
    [slotsName, { SlotCore: class {}, standardHookPropName() {} }], [primitivesName, { Menu() {} }],
    [rendererName, { SlotRegistry }], [connectionName, {}], [conversationName, { apply() {} }], [chatName, { apply() {} }],
  ]);
  const release = { version: expected.hostVersion, commit: 'fixture-official-commit' }, rev = 'fixture-boot-rev';
  const rows = [rendererName, connectionName, conversationName, chatName].map(id => ({ id, rev: 'fixture-module-rev', url: `plugins/??${id}/client.js&rev=fixture-module-rev` }));
  const modules = { version: 'client', manifest: { release, rev, modules: rows },
    import: async name => exports.get(name), loadCache: new Map(rows.map(row => [row.id, { id: row.id, exports: exports.get(row.id) }])) };
  const rootContext = new Context();
  rootContext.fiber = { state: 2, runtime: null, parent: rootContext };
  const scope = { root: rootContext, slots: new SlotRegistry(), modules,
    loader: { internal: modules, entries: () => [] }, uiConversation: {
      ctx: { fiber: { state: 2, runtime: { callback: exports.get(conversationName).apply }, parent: rootContext } },
      events: { entries: () => [] }, views: { entries: () => [] } }, effect: fn => fn() };
  let registration;
  const window = { dshDesktop: { protocolVersion: 1 }, __DSH_BOOT__: { release, rev },
    __ModuleLoader__: { load: value => { registration = value; } } };
  runInNewContext(await readFile(new URL('./fixtures/desktop-host-boot/client.js', import.meta.url), 'utf8'), { window });
  const plugin = registration.factory(name => { assert(exports.has(name), 'No ignored seed require'); return exports.get(name); });
  plugin.apply({ inject: (_services, apply) => apply(scope) });
  const identity = JSON.parse(JSON.stringify((await window.__OMD_DESKTOP_HOST_BOOT__()).identity));
  assertClientIdentity(identity, expected);
  for (const [mutate, message] of [
    [value => { value.release.version = '0.2.1-rc.1'; }, /boot module release/],
    [value => { delete value.seeds[slotsName]; }, /Required shell seed/],
    [value => { value.seeds[slotsName].sameAsFactory = false; }, /shell factory export/],
    [value => { value.dynamic = value.dynamic.filter(row => row.id !== connectionName); }, /Required dynamic client module/],
    [value => { value.dynamic = value.dynamic.filter(row => row.id !== conversationName); }, /Required dynamic client module/],
    [value => { value.dynamic[0].url = 'https://external.invalid/client.js'; }, /revisioned module source/],
    [value => { value.dynamic[0].materialized = false; }, /really loaded/],
  ]) {
    const invalid = structuredClone(identity); mutate(invalid); assert.throws(() => assertClientIdentity(invalid, expected), message);
  }
  scope.slots = { snapshot: () => [] };
  const invalidService = JSON.parse(JSON.stringify((await window.__OMD_DESKTOP_HOST_BOOT__()).identity));
  assert.throws(() => assertClientIdentity(invalidService, expected), /Real service instance/);
  scope.slots = new SlotRegistry();
  const omd = { apply() {} };
  modules.manifest.modules = [...rows.filter(row => ![conversationName, chatName].includes(row.id)),
    { id: 'trisoul_x', rev: 'omd-rev', url: 'plugins/??trisoul_x/client.js&rev=omd-rev' }];
  for (const name of [conversationName, chatName]) modules.loadCache.delete(name);
  modules.loadCache.set('trisoul_x', { id: 'trisoul_x', exports: omd });
  // The service is owned by an inline factory below the root bundle callback,
  // not by a fabricated slash-named renderer row or matching display name.
  scope.uiConversation.ctx.fiber = { state: 2, runtime: { callback() {} },
    parent: { fiber: { state: 2, runtime: { callback: omd.apply }, parent: rootContext } } };
  const installed = JSON.parse(JSON.stringify((await window.__OMD_DESKTOP_HOST_BOOT__()).identity));
  const installedExpected = { ...expected, stage: 'installed' };
  assertClientIdentity(installed, installedExpected);
  assert.throws(() => assertClientIdentity(installed, { ...installedExpected,
    publicComponents: [...installedExpected.publicComponents, '@deepseek-ai/dsh-client-unknown'] }), /Required dynamic client module/);
  for (const [mutate, message] of [
    [value => { value.dynamic = value.dynamic.filter(row => row.id !== 'trisoul_x'); }, /Required dynamic client module/],
    [value => { value.dynamic.find(row => row.id === 'trisoul_x').url = 'plugins/??other/client.js&rev=omd-rev'; }, /revisioned module source/],
    [value => { value.conversationOwners.trisoul_x = false; }, /loaded provider callback/],
    [value => { value.dynamic.push(rows.find(row => row.id === conversationName)); }, /Bundle-disabled official client row/],
  ]) {
    const invalid = structuredClone(installed); mutate(invalid);
    assert.throws(() => assertClientIdentity(invalid, installedExpected), message);
  }
});

test('installed UI identity requires the exact disabled originals and active replacements from the installed candidate', () => {
  const expected = { stage: 'installed', bundleRoot: '/fixture/profile/installed-omd', omdVersion: source.version };
  const stock = { entries: uiReplacements.map(row => ({ id: row.officialId, name: row.officialClient, disabled: false, active: true })) };
  assertHostUiIdentity(stock, { stage: 'stock' });
  const installed = { entries: [...stock.entries.map(row => ({ ...row, disabled: true, active: false })),
    ...[['trisoul-x', 'trisoul_x'], ...uiReplacements.map(row => [row.replacementId, row.replacementHost])].map(([id, name]) => ({
      id, name, disabled: false, active: true, moduleCallbackMatches: true,
      source: { name: 'trisoul_x', dir: expected.bundleRoot, version: expected.omdVersion },
    }))] };
  assertHostUiIdentity(installed, expected);
  for (const [mutate, message] of [
    [value => { value.entries = value.entries.filter(row => row.id !== 'omd-ui-chat'); }, /Required OMD Host replacement/],
    [value => { value.entries.find(row => row.id === 'omd-ui-conversation').source.dir = '/checkout/fallback'; }, /installed tgz/],
    [value => { value.entries.find(row => row.id === 'omd-ui-conversation').source.version = 'wrong-candidate'; }, /package version/],
    [value => { value.entries.find(row => row.id === 'ui-conversation').disabled = false; }, /bundle-patch disabled state/],
    [value => { value.entries.find(row => row.id === 'omd-ui-chat').moduleCallbackMatches = false; }, /imported callback/],
  ]) {
    const invalid = structuredClone(installed); mutate(invalid);
    assert.throws(() => assertHostUiIdentity(invalid, expected), message);
  }
});

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
  const hostEnvironment = desktopEnvironment(root, {});
  let hostNodeHome = hostEnvironment.HOME;
  const text = await readFile(new URL('./fixtures/desktop-host-boot/observer.mjs', import.meta.url), 'utf8');
  const apply = runInNewContext(text.replace(/^import .*\n/gm, '').replace('export const inject', 'const inject')
    .replace('export function apply', 'function apply') + '\napply', {
    appendFileSync: (_file, text) => records.push(JSON.parse(text)), randomUUID, resolve, sep, pathToFileURL,
    homedir: () => hostNodeHome,
    process: { pid: 3141, env: hostEnvironment, once: (name, fn) => handlers.set(name, fn) },
  });
  const rootFiber = Object.freeze({ uid: 0 });
  let loader = {};
  const ctx = { fiber: { state: 2 }, root: { fiber: rootFiber }, profileContext: { dir: join(root, 'home/profiles/desktop') },
    get: name => name === 'loader' ? loader : undefined,
    on: (name, fn, options) => { callbacks.set(name, fn); registration[name] = options; },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose; },
    webServer: { register: route => { callbacks.set('http', route.handler); } },
    connection: { requestRejection: () => 403 } };
  hostNodeHome = resolve(root, '..', 'foreign-home');
  assert.throws(() => apply(ctx, { root, trace: join(root, 'trace'), sdkNames: [] }), /Host Node home escaped/);
  hostNodeHome = hostEnvironment.HOME;
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
