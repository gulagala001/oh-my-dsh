#!/usr/bin/env node
// Run against explicit host/package artifacts; never the user's DSH profile.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { join, resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ecosystemFixture } from '../test/fixtures/plugin-ecosystem.mjs';

const usage = `Usage: node scripts/check-plugin-coexist.mjs --host-cli /absolute/bin.js --packages /absolute/frozen-packages.json --out /absolute/evidence-dir [--omd-package /absolute/current.tgz] [--control-report /absolute/original/report.json] [--order plugins-first|omd-first] [--presets standard,trisoul-x,omd-ptc] [--store-dir /absolute/this-repo/work/public-store] [--install-timeout-ms 600000] [--isolation native|process]

Without --omd-package this runs the same-host original DSH control. Run both
loading orders with each host's matching OMD artifact. Package JSON:
{ "version": 1, "plugins": [{ "name": "real-package", "version": "1.2.3",
  "file": "/absolute/real.tgz", "sha256": "64 hex chars", "source": "https://...",
  "tools": ["real_tool"], "skills": ["real-skill"], "settingsText": "Settings label",
  "apiPath": "/real-plugin/config" }] }
Use one version of a package per run. Omitted capability expectations are not
claimed as tested. No peer exemptions, ignored builds or fake product tools.
`;
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  if (!['--host-cli', '--packages', '--out', '--omd-package', '--control-report', '--order', '--presets', '--store-dir', '--install-timeout-ms', '--isolation'].includes(flag) || !process.argv[i + 1] || options[flag]) throw Error(usage);
  options[flag] = process.argv[++i];
}
for (const flag of ['--host-cli', '--packages', '--out']) if (!options[flag] || !isAbsolute(options[flag])) throw Error('Explicit absolute path required: ' + flag);
if (options['--omd-package'] && !isAbsolute(options['--omd-package'])) throw Error('OMD archive path must be absolute');
const order = options['--order'] ?? 'omd-first';
assert.ok(['plugins-first', 'omd-first'].includes(order), 'Unknown install order');
const frozen = JSON.parse(await readFile(options['--packages'], 'utf8'));
assert.equal(frozen.version, 1); assert.ok(Array.isArray(frozen.plugins) && frozen.plugins.length > 0);
assert.equal(new Set(frozen.plugins.map(plugin => plugin.name)).size, frozen.plugins.length, 'Use one package version per run');
const out = resolve(options['--out']); await mkdir(out, { recursive: true });
const root = await mkdtemp(join(out, 'isolated-'));
const installTimeoutMs = Number(options['--install-timeout-ms'] ?? 180000);
assert.ok(Number.isSafeInteger(installTimeoutMs) && installTimeoutMs >= 1000 && installTimeoutMs <= 1200000, 'Installation deadline must be 1s–20min');
let storeDir;
if (options['--store-dir']) {
  assert.ok(isAbsolute(options['--store-dir']));
  const work = await realpath(fileURLToPath(new URL('../work/', import.meta.url))), candidate = resolve(options['--store-dir']);
  assert.ok(candidate.startsWith(work + sep), 'Public dependency cache must be inside this worktree work directory');
  await mkdir(candidate, { recursive: true }); storeDir = await realpath(candidate);
  assert.ok(storeDir.startsWith(work + sep), 'Dependency cache symlink escapes the work directory');
}
const report = { version: 1, kind: 'real-plugin-ecosystem', startedAt: new Date().toISOString(), platform: process.platform,
  hostCli: options['--host-cli'], order, mode: options['--omd-package'] ? 'omd-coexistence' : 'original-dsh',
  isolation: options['--isolation'] ?? 'native', root, dependencyStoreDir: storeDir, installTimeoutMs, completed: false, passed: false, packages: [], checks: [], failures: [], cleanup: null,
  limitations: ['Synthetic local model; no real subscription login, paid provider calls, Blender, native desktop carrier or computer interaction.',
    'Host runtime outbound network is blocked except the synthetic provider; native installation may fetch package dependencies.',
    'Subscriptions business tools are checked for scoped visibility and unchanged live schemas; external authenticated search/media generation is not exercised.',
    'The entire OpenDesign provider catalog is compared with the original host; open-design is the representative skill actually loaded through the native tool loop.',
    'Turn Rewind is checked for native installation, root activation and lifecycle; no workspace rollback is exercised.',
    'Default OMD enhancement switches remain enabled; CodeGraph native indexing and optional binary availability are not exercised by this ecology check.',
    'No plugin compatibility claim is inferred from successful package installation alone.'] };
let host;
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
const check = async (name, fn) => {
  try { const evidence = await fn(); report.checks.push({ name, status: 'passed', ...(evidence === undefined ? {} : { evidence }) }); await save(); return evidence; }
  catch (error) { report.checks.push({ name, status: 'failed', error: error.stack }); report.failures.push({ name, error: error.message }); await save(); return undefined; }
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function archive(file, expectedName, expectedVersion, expectedSha) {
  assert.ok(isAbsolute(file)); const bytes = await readFile(file), sha256 = hash(bytes);
  if (expectedSha) { assert.match(expectedSha, /^[a-f0-9]{64}$/); assert.equal(sha256, expectedSha, 'Frozen archive integrity'); }
  const { stdout } = await promisify(execFile)('tar', ['-xOf', file, 'package/package.json'], { maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.name, expectedName); if (expectedVersion) assert.equal(manifest.version, expectedVersion);
  assert.ok(manifest.dsh?.bundle?.patch, 'Archive must declare a native bundle');
  const directory = join(root, 'artifacts'); await mkdir(directory, { recursive: true });
  const snapshot = join(directory, sha256 + '.tgz'); await writeFile(snapshot, bytes, { flag: 'wx' });
  return { file: snapshot, sourceFile: file, name: manifest.name, version: manifest.version, sha256, bytes: bytes.length };
}
const originalInputs = await readFile(options['--packages'], 'utf8');
await writeFile(join(out, 'frozen-packages.json'), originalInputs);
try {
  const plugins = [];
  for (const plugin of frozen.plugins) {
    assert.ok(plugin.source && /^https:\/\//.test(plugin.source), 'Record traceable package source');
    const verified = await archive(plugin.file, plugin.name, plugin.version, plugin.sha256);
    const record = { ...verified, source: plugin.source, capabilities: { tools: plugin.tools ?? [], skills: plugin.skills ?? [], settingsText: plugin.settingsText, apiPath: plugin.apiPath }, supported: false, install: null };
    report.packages.push(record); plugins.push({ ...plugin, file: verified.file, record });
  }
  host = await ecosystemFixture({ root, cli: options['--host-cli'], isolation: report.isolation, storeDir, installTimeoutMs });
  report.hostVersion = host.hostVersion;
  let control;
  if (options['--control-report']) {
    assert.ok(isAbsolute(options['--control-report']) && options['--omd-package'], 'A control report requires an absolute path and a coexistence run');
    const bytes = await readFile(options['--control-report']); control = JSON.parse(bytes);
    assert.equal(control.mode, 'original-dsh'); assert.equal(control.hostVersion, host.hostVersion);
    assert.ok(!control.invalidOriginalHostControl && control.completed && control.failures.length === 0, 'Original DSH control must have completed its actual checks');
    for (const plugin of plugins) { const original = control.packages.find(row => row.name === plugin.name); assert.equal(original?.sha256, plugin.sha256, 'Control must use the same frozen real artifact'); }
    report.control = { file: options['--control-report'], sha256: hash(bytes), hostVersion: control.hostVersion };
  }
  let omd;
  if (options['--omd-package']) {
    omd = await archive(options['--omd-package'], 'trisoul_x');
    assert.ok(omd.version.startsWith(host.hostVersion + (host.hostVersion.includes('-') ? '.' : '-') + 'omd.'), 'OMD must match the actual host');
    report.omd = omd;
  }
  await save();
  const installOmd = async () => {
    const result = await host.cliRun(['plugin', '--profile', host.profile, 'add', 'file:' + omd.file]);
    report.omd.install = result; assert.ok(result.ok, 'Native OMD install failed: ' + result.stderr);
  };
  if (omd && order === 'omd-first') await installOmd();
  for (const plugin of plugins) {
    console.log('Installing real artifact ' + plugin.name + '@' + plugin.version);
    plugin.record.install = await host.cliRun(['plugin', '--profile', host.profile, 'add', 'file:' + plugin.file]);
    if (!plugin.record.install.ok) plugin.record.outcome = 'native-cli-rejected';
    await save();
  }
  if (omd && order === 'plugins-first') await installOmd();
  await host.start();
  const inventory = await host.rpc('pluginManager/listBundles');
  await writeFile(join(out, 'installed-bundles.json'), JSON.stringify(inventory, null, 2));
  const pluginInventory = await host.rpc('pluginManager/listPlugins');
  await writeFile(join(out, 'installed-plugins.json'), JSON.stringify(pluginInventory, null, 2));
  if (omd) { const row = inventory.find(row => row.name === 'trisoul_x'); assert.ok(row?.enabled && !row.error, 'Native OMD activation rejected'); }
  const accepted = [];
  for (const plugin of plugins) {
    const row = inventory.find(row => row.name === plugin.name); plugin.record.bundle = row;
    if (!plugin.record.install.ok || row?.error || !row?.installed || !row.enabled) {
      plugin.record.outcome = row?.error?.code === 'incompatible-version' ? 'native-host-rejected' : plugin.record.outcome ?? 'activation-failed';
      // A refusal is evidence of an unsupported artifact, never a compatibility pass.
      continue;
    }
    assert.equal(row.version, plugin.version); accepted.push(plugin); plugin.record.outcome = 'installed-awaiting-execution';
  }
  if (control) await check('same-host-installation-support', async () => {
    const comparison = plugins.map(plugin => ({ name: plugin.name,
      originalSupported: control.packages.find(row => row.name === plugin.name)?.supported === true,
      coexistenceAccepted: accepted.includes(plugin), outcome: plugin.record.outcome }));
    report.installationSupportComparison = comparison;
    for (const row of comparison) assert.equal(row.coexistenceAccepted, row.originalSupported,
      'Native installation support differs from the same-host original DSH control: ' + row.name);
    return comparison;
  });
  await check('native-root-fibers-active', async () => {
    for (const plugin of accepted) for (const row of plugin.record.bundle.rows) {
      const fiber = pluginInventory.find(entry => entry.entryId === row.entryId);
      assert.equal(fiber?.fiberPhase, 'active', plugin.name + ' real root row did not activate: ' + row.rowId);
    }
    return pluginInventory.filter(entry => accepted.some(plugin => plugin.record.bundle.rows.some(row => row.entryId === entry.entryId)));
  });
  const presets = (options['--presets'] ?? (omd ? 'standard,trisoul-x,omd-ptc' : 'standard,ptc')).split(',').filter(Boolean);
  const hasDesign = accepted.some(plugin => plugin.skills?.includes('open-design'));
  const runPreset = async (preset, stage) => {
    const evidence = await host.exercise(preset, hasDesign);
    await writeFile(join(out, `${stage}-${preset}.json`), JSON.stringify(evidence, null, 2));
    const results = evidence.observer.events.filter(event => event.type === 'tool/result').map(event => event.data?.message);
    const successfulResult = text => results.some(message => message && !message.isError && JSON.stringify(message.content).includes(text));
    assert.ok(successfulResult('ECO_NATIVE_FILE_READ'), 'Native read must return actual probe content successfully');
    if (preset === 'omd-ptc' || preset === 'ptc') {
      const wire = evidence.requests.filter(request => request.tools?.length);
      const allowed = new Set(['run_code', ...(preset === 'omd-ptc' ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [])]);
      assert.ok(wire.length >= 2 && wire.every(request => request.tools.some(tool => tool.function.name === 'run_code') && request.tools.every(tool => allowed.has(tool.function.name))), 'PTC must keep run_code and its documented controls, without direct business tools');
    }
    for (const plugin of accepted) {
      for (const name of plugin.tools ?? []) assert.ok(evidence.observer.tools.some(tool => tool.name === name), plugin.name + ' real tool missing in ' + preset + ': ' + name);
      for (const name of plugin.skills ?? []) {
        assert.ok(evidence.observer.skills.some(skill => skill.name === name), plugin.name + ' skill provider missing in ' + preset);
        assert.ok(successfulResult(name), 'Installed skill must return successful native tool output');
      }
    }
    if (control) {
      const original = JSON.parse(await readFile(join(resolve(options['--control-report'], '..'), 'initial-standard.json'), 'utf8'));
      for (const plugin of accepted) {
        assert.ok(control.packages.find(row => row.name === plugin.name)?.supported, 'Artifact did not pass original DSH control: ' + plugin.name);
        for (const name of plugin.tools ?? []) assert.deepEqual(evidence.observer.tools.find(tool => tool.name === name), original.observer.tools.find(tool => tool.name === name), 'Preserve real third-party tool schema in ' + preset);
        for (const name of plugin.skills ?? []) {
          const expected = original.observer.skills.find(skill => skill.name === name);
          assert.deepEqual(evidence.observer.skills.find(skill => skill.name === name), expected, 'Preserve real skill provider in ' + preset);
          const catalog = view => view.skills.filter(skill => skill.provider === expected.provider).sort((left, right) => left.name.localeCompare(right.name));
          assert.deepEqual(catalog(evidence.observer), catalog(original.observer), 'Preserve the entire installed provider catalog in ' + preset);
        }
      }
    }
    return { sessionId: evidence.sessionId, toolNames: evidence.observer.tools.map(tool => tool.name), skillNames: evidence.observer.skills.map(skill => skill.name), requestCount: evidence.requests.length };
  };
  for (const preset of presets) await check('initial/' + preset, () => runPreset(preset, 'initial'));
  await check('real-client-settings-slots', async () => {
    const ui = await host.ui(); await writeFile(join(out, 'settings.json'), JSON.stringify(ui, null, 2));
    assert.deepEqual(ui.errors, [], 'Actual client plugins must load');
    for (const plugin of accepted) if (plugin.settingsText) assert.match(ui.text, new RegExp(plugin.settingsText, 'i'), plugin.name + ' native settings slot');
    return ui;
  });
  for (const plugin of accepted) if (plugin.apiPath) await check('real-service/' + plugin.name, () => host.request(plugin.apiPath));
  await check('disable-native-bundles', async () => {
    const changes = [];
    for (const plugin of accepted) {
      const result = await host.rpc('pluginManager/setBundleEnabled', { name: plugin.name, enabled: false });
      changes.push({ name: plugin.name, result }); assert.ok(['applied', 'restart-required'].includes(result.application), plugin.name + ': native disable failed');
    }
    return changes;
  });
  await host.stop(); await host.start();
  await check('disabled-after-restart', async () => {
    const rows = await host.rpc('pluginManager/listBundles');
    for (const plugin of accepted) assert.equal(rows.find(row => row.name === plugin.name)?.enabled, false);
    const session = await host.exercise('standard');
    assert.ok(JSON.stringify(session.observer.events).includes('ECO_NATIVE_FILE_READ'));
    for (const plugin of accepted) {
      for (const name of plugin.tools ?? []) assert.ok(!session.observer.tools.some(tool => tool.name === name), 'Disabled tool remains: ' + name);
      for (const name of plugin.skills ?? []) assert.ok(!session.observer.skills.some(skill => skill.name === name), 'Disabled skill remains: ' + name);
    }
    return rows.filter(row => accepted.some(plugin => plugin.name === row.name));
  });
  await check('disabled-real-client-slots-and-services', async () => {
    const ui = await host.ui('disabled-settings');
    assert.deepEqual(ui.errors, []);
    for (const plugin of accepted) {
      if (plugin.settingsText) assert.doesNotMatch(ui.text, new RegExp(plugin.settingsText, 'i'), 'Disabled settings slot remains: ' + plugin.name);
      if (plugin.apiPath) assert.equal(await host.httpStatus(plugin.apiPath), 404, 'Disabled service route remains: ' + plugin.name);
    }
    return ui;
  });
  await check('enable-native-bundles', async () => {
    const changes = [];
    for (const plugin of accepted) { const result = await host.rpc('pluginManager/setBundleEnabled', { name: plugin.name, enabled: true }); changes.push({ name: plugin.name, result }); assert.ok(['applied', 'restart-required'].includes(result.application)); }
    return changes;
  });
  await host.stop(); await host.start();
  for (const preset of presets) await check('reenabled/' + preset, () => runPreset(preset, 'reenabled'));
  await check('reenabled-real-client-slots', async () => {
    const ui = await host.ui('reenabled-settings'); assert.deepEqual(ui.errors, []);
    for (const plugin of accepted) if (plugin.settingsText) assert.match(ui.text, new RegExp(plugin.settingsText, 'i'));
    return ui;
  });
  await host.stop();
  await check('uninstall-native-cli', async () => {
    const changes = [];
    report.uninstall = changes;
    const manifest = JSON.parse(await readFile(join(host.home, 'profiles', host.profile, 'package.json'), 'utf8'));
    for (const plugin of [...plugins].reverse()) {
      if (!manifest.dependencies?.[plugin.name]) { changes.push({ name: plugin.name, skipped: 'Native refused installation was rolled back; no dependency to remove.' }); continue; }
      const result = await host.cliRun(['plugin', '--profile', host.profile, 'remove', plugin.name]); changes.push({ name: plugin.name, result }); await save(); assert.ok(result.ok);
    }
    if (omd) { const result = await host.cliRun(['plugin', '--profile', host.profile, 'remove', 'trisoul_x']); changes.push({ name: 'trisoul_x', result }); await save(); assert.ok(result.ok); }
    return changes;
  });
  await host.start();
  await check('uninstalled-original-host-restored', async () => {
    const rows = await host.rpc('pluginManager/listBundles');
    for (const plugin of plugins) assert.ok(!rows.some(row => row.name === plugin.name && row.installed));
    if (omd) assert.ok(!rows.some(row => row.name === 'trisoul_x' && row.installed));
    const evidence = await host.exercise('standard');
    assert.ok(JSON.stringify(evidence.observer.events).includes('ECO_NATIVE_FILE_READ'));
    for (const plugin of accepted) { for (const name of plugin.tools ?? []) assert.ok(!evidence.observer.tools.some(tool => tool.name === name)); for (const name of plugin.skills ?? []) assert.ok(!evidence.observer.skills.some(skill => skill.name === name)); }
    await writeFile(join(out, 'uninstalled-standard.json'), JSON.stringify(evidence, null, 2));
    return { tools: evidence.observer.tools.map(tool => tool.name), services: evidence.observer.services };
  });
  for (const plugin of accepted) { plugin.record.supported = report.failures.length === 0; plugin.record.outcome = plugin.record.supported ? 'execution-and-lifecycle-verified' : 'verification-failed'; }
} catch (error) { report.failures.push({ name: 'runner', error: error.stack }); }
finally {
  try { if (host) { await writeFile(join(out, 'host-last.log'), host.log()); await host.close(); } report.cleanup = { status: 'passed' }; }
  catch (error) { report.cleanup = { status: 'failed', error: error.stack }; report.failures.push({ name: 'cleanup', error: error.message }); }
  report.completedAt = new Date().toISOString(); report.completed = report.cleanup?.status === 'passed' && !report.failures.some(row => row.name === 'runner');
  report.interactionWarnings = report.checks.filter(check => check.evidence?.interaction?.includes('native-settings-shortcut')).map(check => ({ check: check.name, warning: 'The first settings-button click did not open the dialog within two seconds; the documented native shortcut opened it.' }));
  report.supportedPackages = report.packages.filter(plugin => plugin.supported).map(plugin => plugin.name);
  report.unsupportedPackages = report.packages.filter(plugin => !plugin.supported).map(plugin => ({ name: plugin.name, outcome: plugin.outcome }));
  report.passed = report.completed && report.failures.length === 0 && report.unsupportedPackages.length === 0;
  await save(); console.log(JSON.stringify({ report: join(out, 'report.json'), completed: report.completed, passed: report.passed, supported: report.supportedPackages, unsupported: report.unsupportedPackages, failures: report.failures.map(row => row.name) }));
  process.exitCode = report.passed ? 0 : 1;
}
