import { assertNaturalShutdown, classifyShutdownErrors } from './shutdown-errors.mjs';
export { assertNaturalShutdown } from './shutdown-errors.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pins } from './inputs.mjs';

export const stages = ['stock', 'installed'];
export const enabledStage = stage => stage === 'installed';
const originals = [['ui-conversation', '@deepseek-ai/dsh-client-ui-conversation'], ['ui-chat', '@deepseek-ai/dsh-client-ui-chat']];
const replacements = [['trisoul-x', 'trisoul_x'], ['omd-ui-conversation', 'trisoul_x/host/ui-conversation'], ['omd-ui-chat', 'trisoul_x/host/ui-chat']];
const flatten = rows => rows.flatMap(row => [row, ...flatten(row.children ?? [])]);

export function stockBaseline(ui) {
  const rows = flatten(ui.slots), model = rows.filter(row => row.name === 'conversation.input.model');
  assert.equal(model.length, 1, 'Unique model declaration');
  assert.equal(model[0].kind, 'single'); assert.equal(model[0].occupants.length, 1, 'One stock occupant');
  assert.equal(model[0].occupants[0].active, true); assert(Number.isFinite(model[0].occupants[0].priority));
  const label = rows.filter(row => row.name === 'conversation.input.model.label');
  assert.equal(label.length, 1, 'Unique label declaration'); assert(label[0].declaredBy, 'Actual label owner');
  assert.equal(label[0].kind, 'single');
  assert.equal(model[0].children.filter(row => row.name === label[0].name).length, 1, 'Label is a direct model child');
  return { priority: model[0].occupants[0].priority, labelOwner: label[0].declaredBy };
}

export function assertStage(value, baseline, expected) {
  const { stage, sessionId, bundleRoot } = expected, enabled = enabledStage(stage);
  assert(stages.includes(stage)); assert.equal(value.stage, stage);
  const { host, ui } = value;
  assert.equal(host.shellVersion, pins.desktop.version); assert.equal(ui.identity.release.version, pins.desktop.version);
  assert.equal(host.clientGraph.release.version, pins.desktop.version);
  // The official WebBootRelease contract makes commit optional. Compare the
  // actual two faces exactly; the verified official archive and frozen candidate bind inputs.
  assert.deepEqual(ui.identity.release, host.clientGraph.release, 'Current Host/renderer release identity');
  assert.equal(typeof host.clientGraph.rev, 'string'); assert(host.clientGraph.rev.length);
  assert.equal(ui.identity.rev, host.clientGraph.rev, 'Renderer converges to current Host graph, never old boot rev');
  assert.equal(ui.identity.shellProtocol, 1); assert.equal(ui.identity.moduleSystem, 'client');
  for (const name of ['moduleTableIsLoader', 'rootUsesShellCordis', 'slotsUsesShellCordis', 'slotsUsesDynamicRenderer'])
    assert.equal(ui.identity.services[name], true, 'Real renderer service: ' + name);
  assert.deepEqual(host.modelCalls, []); assert.deepEqual(value.errors, []);
  assert.equal(host.entries.some(row => row.state === 3), false, 'No failed Host fiber');
  for (const row of ui.entries) assert.equal(row.state, 2, 'No failed/pending renderer fiber: ' + row.name);
  for (const [id, name] of originals) {
    const rows = host.entries.filter(row => row.id === id); assert.equal(rows.length, 1, 'Unique official Host row: ' + id);
    assert.equal(rows[0].name, name); assert.equal(rows[0].disabled, enabled); assert.equal(rows[0].active, !enabled);
  }
  const modules = ui.identity.dynamic;
  for (const name of new Set(modules.map(row => row.id))) assert.equal(modules.filter(row => row.id === name).length, 1, 'No duplicate renderer row: ' + name);
  const rootRows = modules.filter(row => row.id === 'trisoul_x');
  assert.equal(rootRows.length, enabled ? 1 : 0, 'OMD renderer row follows selection');
  if (enabled) {
    assert.equal(rootRows[0].materialized, true); assert.equal(rootRows[0].cachedId, 'trisoul_x');
    assert.equal(rootRows[0].url, `plugins/??trisoul_x/client.js&rev=${rootRows[0].rev}`);
    for (const [id, name] of replacements) {
      const rows = host.entries.filter(row => row.id === id); assert.equal(rows.length, 1, 'Unique OMD Host row: ' + id);
      assert.equal(rows[0].name, name); assert.equal(rows[0].active, true); assert.equal(rows[0].disabled, false);
      assert.deepEqual(rows[0].source, { name: 'trisoul_x', dir: bundleRoot, version: pins.plugin.version });
      assert.equal(rows[0].moduleCallbackMatches, true, 'Actual installed callback: ' + id);
    }
    assert.deepEqual(host.opencu, { browserEnabled: false, nativeEnabled: false, extensionEnabled: false });
  } else {
    assert.equal(host.entries.some(row => row.name === 'trisoul_x' || row.name?.startsWith('trisoul_x/')), false, 'No residual OMD Host rows');
    assert.equal(ui.entries.some(row => row.name === 'trisoul_x'), false, 'No residual OMD renderer entry');
    for (const [, name] of originals) {
      const rows = modules.filter(row => row.id === name); assert.equal(rows.length, 1, 'Official client restored: ' + name);
      assert.equal(rows[0].materialized, true);
    }
  }
  const owner = enabled ? 'trisoul_x' : originals[0][1];
  assert.equal(ui.identity.conversationOwners[owner], true, 'Actual conversation provider callback ancestry');
  const rows = flatten(ui.slots), models = rows.filter(row => row.name === 'conversation.input.model');
  const labels = rows.filter(row => row.name === 'conversation.input.model.label');
  assert.equal(models.length, 1, 'Unique model declaration'); assert.equal(labels.length, 1, 'Unique label declaration');
  const model = models[0]; assert.equal(model.kind, 'single');
  assert.equal(model.children.filter(row => row.name === labels[0].name).length, 1, 'Direct label child');
  assert.equal(labels[0].declaredBy, baseline.labelOwner, 'Original label declaration owner retained');
  assert.equal(labels[0].kind, 'single');
  assert.equal(labels[0].occupants.filter(row => row.active).length, 1, 'Actual rc2 native label occupant remains active');
  assert.equal(model.occupants.length, enabled ? 2 : 1, 'Exact model occupant count');
  const active = model.occupants.filter(row => row.active); assert.equal(active.length, 1, 'Unique elected model occupant');
  assert.equal(active[0].priority, baseline.priority - (enabled ? 0.5 : 0));
  const stock = model.occupants.filter(row => row.priority === baseline.priority); assert.equal(stock.length, 1);
  assert.equal(stock[0].active, !enabled, 'Retained stock occupant activation');
  for (const kind of ['omd-task-injection', 'omd-btw']) assert.equal(ui.events.some(row => row.kind === kind), enabled, 'OMD contribution follows selection: ' + kind);
  assert(ui.views.includes('chat'), 'Real chat view present');
  assert.equal(value.modelButtonVisible, enabled, 'Exact visible 模型与思考强度 button follows OMD');
  assert.equal(value.modelButtonCount, enabled ? 1 : 0, 'OMD model button disappears completely when disabled');
  assert.equal(value.additiveButtonCount, 0, 'No additive fallback button');
  assert.equal(ui.session.id, sessionId); assert.equal(ui.session.currentSessionId, sessionId);
  assert(ui.session.retainedMainView > 0, 'Real mainView retain'); assert.equal(ui.session.blank, true); assert.equal(ui.session.promptAttempted, false);
  assert.equal(value.composerVisible, true, 'Actual session composer visible');
  assert.equal(value.persisted.installed, stage !== 'stock'); assert.equal(value.persisted.enabled, enabled);
  const bundles = value.bundles.filter(row => row.name === 'trisoul_x');
  assert.equal(bundles.length, stage === 'stock' ? 0 : 1, 'Exact listBundles row');
  if (stage !== 'stock') {
    assert.equal(bundles[0].installed, true); assert.equal(bundles[0].enabled, enabled);
    assert.equal(bundles[0].version, pins.plugin.version); assert.equal(bundles[0].error, undefined);
  }
}

export function assertReceipt(value, targetStage) {
  const receipt = value.receipt;
  assert(['applied', 'restart-required'].includes(receipt.application), 'Successful real application receipt');
  assert.equal(receipt.changed, true); assert.equal(receipt.stage, 'enable'); assert.equal(receipt.target, 'trisoul_x');
  assert.equal(receipt.enabled, enabledStage(targetStage)); assert.equal(receipt.error, undefined);
  assert(value.changedEvents > 0, 'Actual plugin-manager/changed event observed');
  assert.equal(value.persisted.installed, true); assert.equal(value.persisted.enabled, enabledStage(targetStage));
  assert.equal(value.bundle.installed, true); assert.equal(value.bundle.enabled, enabledStage(targetStage));
  assert.equal(value.bundle.version, pins.plugin.version); assert.equal(value.bundle.error, undefined);
  if (receipt.application === 'applied') {
    assert(value.hot, 'Applied receipt requires converged actual UI in the same processes');
    assert.equal(value.hot.pid, value.before.pid); assert.equal(value.hot.host.pid, value.before.hostPid);
  } else { assert.equal(typeof receipt.restartReason, 'string'); assert(receipt.restartReason.length); }
  if (targetStage === 'installed') {
    assert.equal(receipt.bundle, pins.plugin.name); assert.equal(receipt.version, pins.plugin.version);
  }
  assert.equal(value.coldStage, targetStage, 'Receipt target is the selected-session hot stage');
  assert.equal(receipt.application, 'applied', 'This regression requires actual hot application; restart-required is insufficient');
}


export function assertReport(report, tap, expected) {
  for (const [name, count] of [['tests', 1], ['pass', 1], ['fail', 0], ['cancelled', 0], ['skipped', 0]])
    assert.equal(Number(tap.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]), count, 'Executed acceptance count: ' + name);
  assert.equal(report.status, 'passed'); assert.equal(report.executed, 1); assert.equal(report.skipped, 0);
  assert.equal(report.platform, 'darwin'); assert.equal(report.arch, 'arm64');
  assert.match(expected.sha256, /^[a-f0-9]{64}$/); assert.equal(report.archive.sha256, expected.sha256);
  assert.equal(report.archive.version, pins.plugin.version); assert.equal(report.cleanup.removed, true);
  assert.deepEqual(report.providerRequests, []);
  const classification = classifyShutdownErrors(report);
  assert.equal(classification.ok, true, classification.reasons.join(', '));
  assert.deepEqual(report.shutdownErrorClassification, classification);
  assert.deepEqual(report.stages.map(row => row.stage), stages);
  assert.equal(report.launches.length, 1); assert.equal(report.shutdowns.length, 1); assert.equal(report.receipts.length, 1);
  assert.equal(report.launches[0].pid, report.stages[0].pid);
  assert.equal(report.launches[0].hostPid, report.stages[0].host.pid);
  assert.equal(report.shutdowns[0].pid, report.stages[0].pid);
  assert.equal(report.shutdowns[0].hostPid, report.stages[0].host.pid);
  assert.equal(new Set(report.stages.map(row => row.pid)).size, 1, 'Same Electron throughout selected-session hot installation');
  assert.equal(new Set(report.stages.map(row => row.host.pid)).size, 1, 'Same Host throughout hot installation');
  for (const row of report.stages) assertStage(row, report.baseline, { stage: row.stage, sessionId: report.sessionId, bundleRoot: report.bundleRoot });
  assertReceipt(report.receipts[0], 'installed');
  assert.equal(report.shutdowns[0].exitCode, 0); assert.equal(report.shutdowns[0].signalCode, null);
  assert.equal(report.shutdowns[0].naturalExit, true); assertNaturalShutdown(report.lifecycle, report.shutdowns[0].hostPid);
  assert(report.readiness); assert.deepEqual(report.readiness.crashes, []);
  assert.equal(report.readiness.uiConversation.conversation.activePresent, true);
  assert.equal(report.readiness.uiConversation.conversation.provider[0].state, 2);
  assert.equal(report.readiness.uiConversation.conversation.provider[1].uid, report.readiness.uiConversation.owner[0].uid, 'Actual controller belongs to current conversation owner');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4);
  assertReport(JSON.parse(await readFile(process.argv[2])), await readFile(process.argv[3], 'utf8'), { sha256: process.env.OMD_PLUGIN_ARCHIVE_SHA256 });
  console.log('rc2 selected-session hot install: 1 pass/0 skips, real applied receipt, same processes and natural exit verified');
}
