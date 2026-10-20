import { shutdownFixture } from './fixtures/conversation-hot-install/shutdown-errors-contract.mjs';
import { classifyShutdownErrors } from './fixtures/conversation-hot-install/shutdown-errors.mjs';
import './fixtures/conversation-hot-install/resources-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { archiveFiles, pins } from './fixtures/conversation-hot-install/inputs.mjs';
import { assertReport, stages } from './fixtures/conversation-hot-install/contract.mjs';
const sessionId = 'synthetic-blank', bundleRoot = '/synthetic/profile/node_modules/trisoul_x';
const baseline = { priority: 0, labelOwner: 'official-ModelSelect' };
const originals = [['ui-conversation', '@deepseek-ai/dsh-client-ui-conversation'], ['ui-chat', '@deepseek-ai/dsh-client-ui-chat']];
const replacements = [['trisoul-x', 'trisoul_x'], ['omd-ui-conversation', 'trisoul_x/host/ui-conversation'], ['omd-ui-chat', 'trisoul_x/host/ui-chat']];
const release = { version: pins.desktop.version, commit: pins.desktop.sourceCommit };
const expected = { sha256: 'a'.repeat(64) };
const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';
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
        children: [{ name: 'conversation.input.model.label', kind: 'single', declaredBy: baseline.labelOwner, occupants: [{ priority: 1017, active: true }], children: [] }] }] } };
}

function reportFixture(kinds = []) {
  const values = stages.map(stage => stageValue(stage, 0)), installed = values[1];
  const shutdown = shutdownFixture(kinds);
  return { ...shutdown, shutdownErrorClassification: classifyShutdownErrors(shutdown), status: 'passed', executed: 1, skipped: 0, platform: 'darwin', arch: 'arm64',
    archive: { sha256: expected.sha256, version: pins.plugin.version }, errors: shutdown.errors, providerRequests: [], cleanup: { removed: true },
    baseline, sessionId, bundleRoot, stages: values, launches: [{ pid: 200, hostPid: 100 }],
    shutdowns: [{ pid: 200, hostPid: 100, exitCode: 0, signalCode: null, naturalExit: true }],
    receipts: [{ operation: 'install', coldStage: 'installed', before: { pid: 200, hostPid: 100 }, changedEvents: 1,
      persisted: installed.persisted, bundle: installed.bundles[0], hot: installed,
      receipt: { application: 'applied', changed: true, stage: 'enable', target: 'trisoul_x', enabled: true,
        bundle: 'trisoul_x', version: pins.plugin.version } }],
    lifecycle: ['ready', 'disposed', 'before-exit', 'exit'].map(event => ({ event, bootId: 'one-activation', pid: 100,
      code: 0, rootDisposed: true, modelCalls: 0 })),
    readiness: { crashes: [], uiConversation: { owner: [{ uid: 91, state: 2 }], conversation: { activePresent: true, provider: [{ uid: 92, state: 2 }, { uid: 91, state: 2 }] } } } };
}
test('synthetic hot evidence requires one applied receipt, retained selection and one natural exit', () => assertReport(reportFixture(), tap, expected));
test('full report preserves and accepts only proven shutdown errors', () => assertReport(reportFixture(['module', 'opencu']), tap, expected));
test('full report recomputes classification rather than trusting a saved success', () => { const r = reportFixture(['module']); r.errorEvents[0].source = 'pageerror'; assert.throws(() => assertReport(r, tap, expected)); });
for (const [name, change] of [
  ['restart-required receipt', r => { r.receipts[0].receipt.application = 'restart-required'; r.receipts[0].receipt.restartReason = 'no-hmr'; }],
  ['renderer error', r => r.errors.push('first renderer failure')],
  ['slot abdication', r => r.readiness.crashes.push({ abdicated: true })],
  ['loading provider', r => { r.readiness.uiConversation.conversation.provider[0].state = 1; }],
  ['lost selected session', r => { r.stages[1].ui.session.currentSessionId = 'other'; }],
  ['no mainView retain', r => { r.stages[1].ui.session.retainedMainView = 0; }],
  ['prompt attempted', r => { r.stages[1].ui.session.promptAttempted = true; }],
  ['replacement process', r => { r.stages[1].pid++; }],
  ['model request', r => r.providerRequests.push({ attempted: true })],
  ['forced exit', r => { r.shutdowns[0].signalCode = 'SIGTERM'; }],
  ['missing before-exit', r => { r.lifecycle = r.lifecycle.filter(row => row.event !== 'before-exit'); }],
  ['cleanup failure', r => { r.cleanup.removed = false; }],
  ['different archive', r => { r.archive.sha256 = 'b'.repeat(64); }],
  ['duplicate model declaration', r => { r.stages[1].ui.slots.push(structuredClone(r.stages[1].ui.slots[0])); }],
  ['missing native label', r => { r.stages[1].ui.slots[0].children[0].occupants = []; }],
]) test('hot gate rejects ' + name, () => { const r = reportFixture(); change(r); assert.throws(() => assertReport(r, tap, expected)); });
test('zero execution or skips cannot turn acceptance green', () => {
  for (const text of [tap.replace('# tests 1', '# tests 0'), tap.replace('# skipped 0', '# skipped 1'), tap.replace('# pass 1', '# pass 0')])
    assert.throws(() => assertReport(reportFixture(), text, expected));
});
test('hot input archive integration reads strict tar entries as actual byte members', () => {
  const body = Buffer.from('synthetic-client'), header = Buffer.alloc(512);
  header.write('package/lib/client.js'); header.write('0000644\0', 100);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header[156] = 48; header.write('ustar\0', 257); header.write('00', 263); header.fill(32, 148, 156);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  const archive = gzipSync(Buffer.concat([header, body, Buffer.alloc(512 - body.length), Buffer.alloc(1024)]));
  assert.equal(archiveFiles(archive).get('package/lib/client.js').toString(), 'synthetic-client');
});
