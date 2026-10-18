import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { assertRunner, digest, pins, verifyPublishedPackage } from './fixtures/desktop-rc1-slots/inputs.mjs';
import { assertReport, assertStage, stages } from './fixtures/desktop-rc1-slots/contract.mjs';
import { publishedTar } from './fixtures/desktop-rc1-slots/published-tar.mjs';

// Dependency-free synthetic contracts only: no downloads, GUI or model calls.
const sessionId = 'synthetic-empty-session', bundleRoot = '/synthetic/profile/node_modules/trisoul_x';
const baseline = { priority: 0, labelOwner: 'official-ModelSelect' };
const originals = [['ui-conversation', '@deepseek-ai/dsh-client-ui-conversation'], ['ui-chat', '@deepseek-ai/dsh-client-ui-chat']];
const replacements = [['trisoul-x', 'trisoul_x'], ['omd-ui-conversation', 'trisoul_x/host/ui-conversation'], ['omd-ui-chat', 'trisoul_x/host/ui-chat']];
const release = { version: pins.desktop.version, commit: pins.desktop.sourceCommit };
function stageValue(stage, index) {
  const enabled = ['installed', 'reenabled'].includes(stage), rev = 'current-graph-' + stage;
  const row = { name: 'trisoul_x', installed: true, enabled, version: pins.plugin.version };
  return { stage, pid: 200 + index, errors: [], persisted: { installed: stage !== 'stock', enabled }, bundles: stage === 'stock' ? [] : [row],
    composerVisible: true, modelButtonCount: enabled ? 1 : 0, modelButtonVisible: enabled, additiveButtonCount: 0,
    host: { pid: 100 + index, shellVersion: pins.desktop.version, modelCalls: [], clientGraph: { rev, release: structuredClone(release) },
      opencu: { browserEnabled: false, nativeEnabled: false, extensionEnabled: false },
      entries: [...originals.map(([id, name]) => ({ id, name, disabled: enabled, active: !enabled, state: enabled ? undefined : 2 })),
        ...enabled ? replacements.map(([id, name]) => ({ id, name, disabled: false, active: true, state: 2, moduleCallbackMatches: true,
          source: { name: 'trisoul_x', dir: bundleRoot, version: pins.plugin.version } })) : []] },
    ui: { identity: { rev, release: structuredClone(release), shellProtocol: 1, moduleSystem: 'client', bootRev: 'deliberately-stale-boot-rev',
      services: { moduleTableIsLoader: true, rootUsesShellCordis: true, slotsUsesShellCordis: true, slotsUsesDynamicRenderer: true },
      conversationOwners: { [enabled ? 'trisoul_x' : originals[0][1]]: true },
      dynamic: (enabled ? ['trisoul_x'] : originals.map(([, name]) => name)).map(id => ({ id, rev: 'artifact',
        url: `plugins/??${id}/client.js&rev=artifact`, cachedId: id, materialized: true })) },
      entries: [{ name: enabled ? 'trisoul_x' : originals[0][1], state: 2 }],
      session: { id: sessionId, currentSessionId: sessionId, retainedMainView: 1, blank: true, promptAttempted: false },
      events: enabled ? [{ kind: 'omd-task-injection' }, { kind: 'omd-btw' }] : [], views: ['chat'],
      slots: [{ name: 'conversation.input.model', kind: 'single', occupants: [
        { priority: 0, active: !enabled }, ...enabled ? [{ priority: -0.5, active: true }] : []],
        children: [{ name: 'conversation.input.model.label', kind: 'single', declaredBy: baseline.labelOwner, occupants: [], children: [] }] }] } };
}
function reportFixture() {
  const values = stages.map(stageValue);
  return { status: 'passed', executed: 1, skipped: 0, platform: 'darwin', arch: 'x64',
    archive: { sha256: pins.plugin.sha256, version: pins.plugin.version, helperModes: [{ file: 'synthetic', mode: '0755' }] },
    errors: [], providerRequests: [], cleanup: { removed: true }, baseline, sessionId, bundleRoot,
    stages: values, launches: values.map(row => ({ stage: row.stage, pid: row.pid, hostPid: row.host.pid })),
    receipts: values.slice(1).map((row, index) => ({ operation: ['install', 'disable', 'reenable'][index], coldStage: row.stage,
      before: { pid: values[index].pid, hostPid: values[index].host.pid }, changedEvents: 1, persisted: row.persisted, bundle: row.bundles[0],
      receipt: { application: 'restart-required', restartReason: 'no-hmr', changed: true, stage: 'enable', target: 'trisoul_x',
        enabled: row.persisted.enabled, ...index === 0 ? { bundle: 'trisoul_x', version: pins.plugin.version } : {} } })),
    shutdowns: values.map(row => ({ stage: row.stage, pid: row.pid, hostPid: row.host.pid, exitCode: 0, signalCode: null, naturalExit: true })),
    lifecycle: values.flatMap((row, index) => ['ready', 'disposed', 'before-exit', 'exit'].map(event => ({
      event, bootId: 'activation-' + index, pid: row.host.pid, code: 0, rootDisposed: true, modelCalls: 0 }))) };
}
const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';

test('only the pinned rc1/mac-x64 disposable runner is accepted', () => {
  assertRunner({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }, 'darwin', 'x64');
  for (const [platform, arch] of [['linux', 'x64'], ['win32', 'x64'], ['darwin', 'arm64']])
    assert.throws(() => assertRunner({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }, platform, arch), /official macOS x64/);
  assert.throws(() => assertRunner({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' }, 'darwin', 'x64'), /Disposable/);
  assert.equal(pins.desktop.url, 'https://download.deepseek.com/dsh-desk/bin/mac-x64/deepseek-harness-0.2.1-rc.1-mac-x64.zip');
  assert.equal(pins.plugin.sha256, 'e5d1902d8e168337d1b47c63de028a65a42eea7ab5feecb8b29dcb72d993b4f7');
});

function tarRecords(records) {
  const parts = [];
  for (const { name, body: content = '', mode = 0o644, type = '0', prefix = '', link = '', magic = 'ustar\0', version = '00' } of records) {
    const body = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write(prefix, 345, 155); header[156] = type.charCodeAt(0);
    header.write(mode.toString(8).padStart(7, '0') + '\0', 100);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write(link, 157, 100); header.write(magic, 257, 6); header.write(version, 263, 2);
    header.fill(32, 148, 156);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
function paxRecord(path, key = 'path') {
  const record = `${key}=${path}\n`; let size = Buffer.byteLength(record) + 2;
  for (;;) {
    const encoded = Buffer.from(`${size} ${record}`);
    if (encoded.length === size) return encoded;
    size = encoded.length;
  }
}
function archive(manifest, helperMode = 0o755) {
  const helper = 'package/vendor/opencu/native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native';
  const files = { 'package/package.json': JSON.stringify(manifest), 'package/lib/client.js': 'synthetic released client',
    'package/vendor/dsh.json': JSON.stringify({ version: pins.desktop.version, commit: pins.desktop.sourceCommit }),
    'package/cordis.patch.yml': '[]', 'package/presets/cordis.patch.yml': '[]', [helper]: 'synthetic helper; never executed' };
  return tarRecords(Object.entries(files).map(([name, body]) => ({ name, body, mode: name === helper ? helperMode : 0o644 })));
}
const publishedManifest = { name: pins.plugin.name, version: pins.plugin.version, engines: { dsh: pins.desktop.version },
  devDependencies: { '@deepseek-ai/dsh': pins.desktop.version }, peerDependencies: { '@deepseek-ai/cordis': '4.0.5' },
  dsh: { bundle: { patch: ['./cordis.patch.yml', './presets/cordis.patch.yml'] } } };
test('published archive hash, exact rc1 version and SDK pairing fail closed', () => {
  const bytes = archive(publishedManifest), expected = { size: bytes.length, sha256: digest(bytes) };
  assert.equal(verifyPublishedPackage(bytes, expected).manifest.version, pins.plugin.version);
  assert.throws(() => verifyPublishedPackage(bytes, { ...expected, sha256: '0'.repeat(64) }), /SHA-256 mismatch/);
  assert.throws(() => verifyPublishedPackage(bytes, { ...expected, size: bytes.length + 1 }), /size mismatch/);
  for (const mutate of [m => { m.version = '0.2.1-rc.2.omd.0.17.4'; }, m => { m.engines.dsh = '0.2.1-rc.2'; },
    m => { m.devDependencies['@deepseek-ai/dsh'] = '0.2.1-rc.2'; }]) {
    const invalid = structuredClone(publishedManifest); mutate(invalid); const packed = archive(invalid);
    assert.throws(() => verifyPublishedPackage(packed, { size: packed.length, sha256: digest(packed) }));
  }
});

test('published helper mode is checked inside original tar bytes and is never repaired', () => {
  for (const mode of [0o644, 0o700]) {
    const bytes = archive(publishedManifest, mode), before = digest(bytes);
    assert.throws(() => verifyPublishedPackage(bytes, { size: bytes.length, sha256: before }), /Published helper mode/);
    assert.equal(digest(bytes), before);
  }
});

test('verified release local PAX path resolves CodeResources without treating its control header as a payload', () => {
  const path = 'package/vendor/opencu/native/bin/darwin-arm64/OpenCU Helper.app/Contents/_CodeSignature/CodeResources';
  const truncated = path.slice(0, -1), body = paxRecord(path);
  assert.equal(body.length, 111, 'Exact observed release record length');
  const bytes = tarRecords([{ name: '././@PaxHeader', type: 'x', mode: 0, body }, { name: truncated, body: 'synthetic signed resource' }]);
  const { entries, paxHeaders } = publishedTar(bytes);
  assert.equal(entries.size, 1); assert.equal(entries.get(path).bytes.toString(), 'synthetic signed resource');
  assert.equal(entries.has(truncated), false); assert.equal(entries.has('././@PaxHeader'), false);
  assert.equal(paxHeaders[0].path, path);
});

test('USTAR prefix names are read while checksum and bounded format remain mandatory', () => {
  assert(publishedTar(tarRecords([{ prefix: 'package/deep', name: 'leaf', body: 'data' }])).entries.has('package/deep/leaf'));
  const tar = gunzipSync(tarRecords([{ name: 'package/safe', body: 'data' }])); tar[0] ^= 1;
  assert.throws(() => publishedTar(gzipSync(tar)), /checksum mismatch/);
  for (const fields of [{ magic: 'ustar ' }, { version: '01' }])
    assert.throws(() => publishedTar(tarRecords([{ name: 'package/safe', ...fields }])), /Unsupported published tar format/);
});

test('tar and PAX traversal, absolute paths, aliases and links remain rejected', () => {
  for (const name of ['package/../escape', '/outside', './package/alias', 'package\\escape'])
    assert.throws(() => publishedTar(tarRecords([{ name }])), /Invalid published member/);
  for (const path of ['package/../escape', '/outside', './package/alias', 'package\\escape'])
    assert.throws(() => publishedTar(tarRecords([{ name: '././@PaxHeader', type: 'x', body: paxRecord(path) }, { name: 'package/safe' }])), /Invalid PAX path/);
  for (const type of ['1', '2', 'g'])
    assert.throws(() => publishedTar(tarRecords([{ name: 'package/link', type, link: 'package/target' }])), /regular files/);
  assert.throws(() => publishedTar(tarRecords([{ name: '././@PaxHeader', type: 'x', body: paxRecord('package/target', 'linkpath') }, { name: 'package/safe' }])), /Unsupported PAX key/);
});

test('duplicate effective names and ambiguous, malformed or dangling PAX are rejected', () => {
  const control = { name: '././@PaxHeader', type: 'x', body: paxRecord('package/a') };
  assert.throws(() => publishedTar(tarRecords([{ name: 'package/a' }, { name: 'package/a' }])), /Duplicate published member/);
  assert.throws(() => publishedTar(tarRecords([{ name: 'package/a' }, control, { name: 'package/truncated' }])), /Duplicate published member/);
  assert.throws(() => publishedTar(tarRecords([control])), /Dangling PAX/);
  assert.throws(() => publishedTar(tarRecords([control, control, { name: 'package/a' }])), /Unsupported local PAX envelope/);
  assert.throws(() => publishedTar(tarRecords([{ ...control, body: '999 path=package/a\n' }, { name: 'package/a' }])), /Truncated or multiple PAX/);
});

test('invalid header diagnostics retain offset, raw name, prefix, typeflag, magic and version', () => {
  assert.throws(() => publishedTar(tarRecords([{ name: 'invalid', prefix: 'other' }])), error => {
    const row = JSON.parse(error.message.split('; tarHeader=')[1]);
    assert.equal(row.offset, 0); assert.equal(row.rawName, 'invalid'); assert.equal(row.prefix, 'other');
    assert.equal(row.typeflag, '0'); assert.equal(row.magicHex, '757374617200'); assert.equal(row.version, '00'); return true;
  });
});

test('four cold phases accept an empty rc1 label and current graph despite an old boot rev', () => {
  assertReport(reportFixture(), tap);
  const withoutOptionalCommit = reportFixture();
  for (const row of withoutOptionalCommit.stages) { delete row.ui.identity.release.commit; delete row.host.clientGraph.release.commit; }
  assertReport(withoutOptionalCommit, tap);
  const report = reportFixture(), row = report.receipts[0]; row.receipt.application = 'applied'; delete row.receipt.restartReason;
  row.hot = structuredClone(report.stages[1]); row.hot.pid = row.before.pid; row.hot.host.pid = row.before.hostPid;
  assertReport(report, tap);
});

for (const [name, mutate] of [
  ['missing phase', r => { r.stages.splice(2, 1); }], ['missing exit', r => { r.shutdowns.pop(); }],
  ['missing receipt', r => { r.receipts.pop(); }], ['wrong SDK release', r => { r.stages[1].host.shellVersion = '0.2.1-rc.2'; }],
  ['Host/renderer release mismatch', r => { r.stages[1].ui.identity.release.commit = 'different'; }],
  ['wrong live graph', r => { r.stages[1].ui.identity.rev = 'stale-boot'; }],
  ['disabled residual Host row', r => { r.stages[2].host.entries.push(r.stages[1].host.entries.at(-1)); }],
  ['disabled residual model occupant', r => { r.stages[2].ui.slots[0].occupants.push({ priority: -0.5, active: true }); }],
  ['disabled residual contribution', r => { r.stages[2].ui.events.push({ kind: 'omd-btw' }); }],
  ['disabled residual button', r => { r.stages[2].modelButtonCount = 1; }],
  ['official chat not restored', r => { r.stages[2].host.entries[1].active = false; }],
  ['duplicate declaration', r => { r.stages[1].ui.slots.push(structuredClone(r.stages[1].ui.slots[0])); }],
  ['duplicate renderer registration', r => { r.stages[1].ui.identity.dynamic.push(structuredClone(r.stages[1].ui.identity.dynamic[0])); }],
  ['changed label owner', r => { r.stages[1].ui.slots[0].children[0].declaredBy = 'omd'; }],
  ['non-direct label', r => { r.stages[1].ui.slots.push(r.stages[1].ui.slots[0].children.pop()); }],
  ['missing mainView retention', r => { r.stages[1].ui.session.retainedMainView = 0; }],
  ['session no longer blank', r => { r.stages[1].ui.session.blank = false; }],
  ['prompt attempted', r => { r.stages[1].ui.session.promptAttempted = true; }],
  ['renderer error', r => { r.stages[1].errors.push('synthetic error'); }],
  ['failed Host fiber', r => { r.stages[1].host.entries[0].state = 3; }],
  ['model call', r => { r.stages[1].host.modelCalls.push({ model: 'forbidden' }); }],
  ['enabled external backend', r => { r.stages[1].host.opencu.nativeEnabled = true; }],
  ['missing actual changed event', r => { r.receipts[0].changedEvents = 0; }],
  ['unsuccessful receipt', r => { r.receipts[0].receipt.application = 'failed'; }],
  ['forced shutdown', r => { r.shutdowns[0].signalCode = 'SIGTERM'; }],
  ['missing beforeExit', r => { r.lifecycle = r.lifecycle.filter(row => row.event !== 'before-exit'); }],
  ['uncertain cleanup', r => { r.cleanup.removed = false; }],
]) test('report rejects ' + name, () => {
  const report = reportFixture(); mutate(report); assert.throws(() => assertReport(report, tap));
});

test('applied cannot pass with no hot verification or a replaced PID', () => {
  const report = reportFixture(), row = report.receipts[0]; row.receipt.application = 'applied';
  assert.throws(() => assertReport(report, tap), /converged actual UI/);
  row.hot = structuredClone(report.stages[1]); assert.throws(() => assertReport(report, tap));
});
test('report gate cannot turn zero tests, skipped acceptance or cleanup failure green', () => {
  for (const text of ['', tap.replace('# tests 1', '# tests 0'), tap.replace('# skipped 0', '# skipped 1'), tap.replace('# pass 1', '# pass 0')])
    assert.throws(() => assertReport(reportFixture(), text));
  assert.throws(() => assertReport({ ...reportFixture(), status: 'failed' }, tap));
});

test('actual rc1 client probe opens only through public UI APIs and observes real adapter/retain faces', async () => {
  const source = await readFile(new URL('./fixtures/desktop-rc1-slots/client.js', import.meta.url), 'utf8');
  class Context {} class Service {} class SlotRegistry extends Service { snapshot() { return []; } }
  const cordis = { Context, Service, symbols: { original: Symbol('original') } };
  const modules = { version: 'client', manifest: { release, rev: 'current-live-graph', modules: [] }, loadCache: new Map(),
    import: async () => ({ SlotRegistry }) };
  let current, registration, catalog = {}; const opened = [], disposers = [], order = [];
  const scope = { root: new Context(), modules, slots: new SlotRegistry(), loader: { internal: modules, entries: () => [] },
    uiConversation: { ctx: { fiber: null }, events: { entries: () => [] }, views: { entries: () => [] } },
    uiWorkspace: { openSession: id => { assert(catalog[id], 'Public catalog must know the target before opening'); order.push('open'); opened.push(id); current = id; } },
    uiSession: { adapter: { current: { getSnapshot: () => ({ props: { sessionId: current } }) } } },
    sessions: { refresh: async () => { order.push('refresh'); catalog = { [sessionId]: {} }; }, list: { getSnapshot: () => ({ byId: catalog }) },
      binding: () => ({ session: { getSnapshot: () => ({ blank: true, promptAttempted: false }) } }),
      retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: current ? 1 : 0 } }) }) },
    effect: fn => { disposers.push(fn()); } };
  const window = { dshDesktop: { protocolVersion: 1 }, __DSH_BOOT__: { rev: 'old-boot' }, __ModuleLoader__: { load: value => { registration = value; } } };
  runInNewContext(source, { window });
  const plugin = registration.factory(name => name === '@deepseek-ai/cordis' ? cordis : {});
  plugin.apply({ inject: (names, apply) => { assert(names.includes('uiWorkspace') && names.includes('uiSession') && names.includes('sessions')); apply(scope); } });
  const value = await window.__OMD_RC1_SLOTS__({ openSessionId: sessionId, sessionId });
  assert.deepEqual(opened, [sessionId]); assert.equal(value.session.currentSessionId, sessionId); assert.equal(value.session.retainedMainView, 1);
  assert.deepEqual(order, ['refresh', 'open']);
  assert.equal(value.session.blank, true); assert.equal(value.identity.rev, 'current-live-graph'); assert.equal(window.__DSH_BOOT__.rev, 'old-boot');
  scope.sessions.refresh = async () => { catalog = {}; };
  await assert.rejects(window.__OMD_RC1_SLOTS__({ openSessionId: sessionId, sessionId }), /refreshed public catalog/);
  assert.deepEqual(opened, [sessionId], 'An unknown public identity is never opened or privately fabricated');
  for (const dispose of disposers) dispose(); assert.equal(window.__OMD_RC1_SLOTS__, undefined);
});
