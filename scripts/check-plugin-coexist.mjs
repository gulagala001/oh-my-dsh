#!/usr/bin/env node
// Run against explicit host/package artifacts; never the user's DSH profile.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath, readdir } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ecosystemFixture } from '../test/fixtures/plugin-ecosystem.mjs';
import { mountSkillObserver, exerciseSkillTurns, exercisePro, assertSkillResults, ownFixtureRoot, closeOwnedFixture } from '../test/fixtures/stage1-recommended/runtime.mjs';
import { parse as parseYaml } from 'yaml';

const usage = `Usage: node scripts/check-plugin-coexist.mjs --host-cli /absolute/bin.js --packages /absolute/frozen-packages.json --out /absolute/evidence-dir [--omd-package /absolute/current.tgz] [--iui-package /absolute/iui-1.0.6.tgz --iui-sha256 <64 hex chars>] [--control-report /absolute/original/report.json] [--order plugins-first|omd-first] [--presets standard,trisoul-x,omd-ptc] [--store-dir /absolute/this-repo/work/public-store] [--install-timeout-ms 600000] [--isolation native|process]

Without --omd-package this runs the same-host original DSH control. Run both
loading orders with each host's matching OMD artifact. Package JSON:
{ "version": 1, "plugins": [{ "name": "real-package", "version": "1.2.3",
  "file": "/absolute/real.tgz", "sha256": "64 hex chars", "source": "https://...",
  "tools": ["real_tool"], "skills": ["real-skill"], "settingsText": "Settings label",
  "apiPath": "/real-plugin/config", "preservePaths": ["status-rotator/config.json"] }] }
Use one version of a package per run. Omitted capability expectations are not
claimed as tested. preservePaths are existing user-data files relative to the
isolated HOME, compared byte-for-byte through disable/restart/uninstall. IUI
1.0.6 is checked from its explicit archive without modifying its source/data.
Evidence output must be a new directory inside this checkout's work/ directory.
Only roots created by this runner are removed after evidence capture; close and
root removal are not attestations of natural native shutdown.
No peer exemptions, ignored builds or fake product tools.
`;
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  if (!['--host-cli', '--packages', '--out', '--omd-package', '--iui-package', '--iui-sha256', '--control-report', '--order', '--presets', '--store-dir', '--install-timeout-ms', '--isolation'].includes(flag) || !process.argv[i + 1] || options[flag]) throw Error(usage);
  options[flag] = process.argv[++i];
}
for (const flag of ['--host-cli', '--packages', '--out']) if (!options[flag] || !isAbsolute(options[flag])) throw Error('Explicit absolute path required: ' + flag);
if (options['--omd-package'] && !isAbsolute(options['--omd-package'])) throw Error('OMD archive path must be absolute');
if (options['--iui-package']) {
  assert.ok(isAbsolute(options['--iui-package']), 'IUI archive path must be absolute');
  assert.match(options['--iui-sha256'] ?? '', /^[a-f0-9]{64}$/, 'IUI requires an explicit frozen SHA256');
} else assert.equal(options['--iui-sha256'], undefined, 'IUI SHA256 requires its archive');
const order = options['--order'] ?? 'omd-first';
assert.ok(['plugins-first', 'omd-first'].includes(order), 'Unknown install order');
const frozen = JSON.parse(await readFile(options['--packages'], 'utf8'));
assert.equal(frozen.version, 1); assert.ok(Array.isArray(frozen.plugins) && frozen.plugins.length > 0);
assert.equal(new Set(frozen.plugins.map(plugin => plugin.name)).size, frozen.plugins.length, 'Use one package version per run');
const out = resolve(options['--out']); await mkdir(out, { recursive: true });
assert.deepEqual(await readdir(out), [], 'Public evidence output must be empty; never overwrite first-round reports/TAP');
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
const root = await mkdtemp(join(out, 'isolated-'));
const rootIdentity = await ownFixtureRoot(root, out);
const report = { version: 1, kind: 'real-plugin-ecosystem', startedAt: new Date().toISOString(), platform: process.platform,
  hostCli: options['--host-cli'], order, mode: options['--omd-package'] ? 'omd-coexistence' : 'original-dsh',
  isolation: options['--isolation'] ?? 'native', root, dependencyStoreDir: storeDir, installTimeoutMs, completed: false, passed: false, packages: [], checks: [], failures: [], cleanup: null,
  limitations: ['Synthetic local model; no real subscription login, paid provider calls, Blender, native desktop carrier or computer interaction.',
    'Host runtime outbound network is blocked except the synthetic provider; native installation may fetch package dependencies.',
    'Subscriptions business tools are checked for scoped visibility and unchanged live schemas; external authenticated search/media generation is not exercised.',
    'Complete invocation-neutral skill metadata is compared with the original host; actual model-invocable bodies succeed, model-prohibited calls explicitly refuse, and user-invocable slash gestures inject canonical instructions. Neither-invocable entries stay visible without execution.',
    'Turn Rewind is checked for native installation, root activation and lifecycle; no workspace rollback is exercised.',
    'Non-CU OMD enhancements remain enabled; fixed transitional CU and auto-setup are disabled, and CodeGraph native indexing/optional binaries are not exercised.',
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
  const directory = join(root, 'artifacts'); await mkdir(directory, { recursive: true });
  const snapshot = join(directory, sha256 + '.tgz');
  try { await writeFile(snapshot, bytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; assert.equal(hash(await readFile(snapshot)), sha256); }
  const { stdout } = await promisify(execFile)('tar', ['-xOf', snapshot, 'package/package.json'], { maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.name, expectedName); if (expectedVersion) assert.equal(manifest.version, expectedVersion);
  assert.ok(manifest.dsh?.bundle?.patch, 'Archive must declare a native bundle');
  if (expectedName === 'dsh-intelligent-ui') assert.match(manifest.version, /\.iui\.1\.0\.6$/, 'Only the preserved IUI 1.0.6 artifact is accepted');
  return { file: snapshot, sourceFile: file, name: manifest.name, version: manifest.version, sha256, bytes: bytes.length };
}
try {
  const originalInputs = await readFile(options['--packages'], 'utf8');
  await writeFile(join(out, 'frozen-packages.json'), originalInputs);
  const plugins = [];
  const inputs = [...frozen.plugins];
  if (options['--iui-package']) {
    assert.ok(!inputs.some(plugin => plugin.name === 'dsh-intelligent-ui'), 'IUI must be supplied once, not both in --packages and --iui-package');
    inputs.push({ name: 'dsh-intelligent-ui', file: options['--iui-package'], sha256: options['--iui-sha256'],
      source: 'https://github.com/gulagala001/dsh-intelligent-ui', skills: ['intelligent-ui'], apiPath: '/intelligent-ui/api/health' });
  }
  for (const plugin of inputs) {
    assert.ok(plugin.source && /^https:\/\//.test(plugin.source), 'Record traceable package source');
    assert.match(plugin.sha256 ?? '', /^[a-f0-9]{64}$/, 'Every frozen third-party artifact requires SHA256');
    const verified = await archive(plugin.file, plugin.name, plugin.version, plugin.sha256);
    const record = { ...verified, source: plugin.source, capabilities: { tools: plugin.tools ?? [], skills: plugin.skills ?? [], settingsText: plugin.settingsText, apiPath: plugin.apiPath }, supported: false, install: null };
    report.packages.push(record); plugins.push({ ...plugin, version: verified.version, sha256: verified.sha256, file: verified.file, record });
    if (plugin.name === 'dsh-intelligent-ui') report.iui = { version: verified.version, sha256: verified.sha256, sourceFile: verified.sourceFile };
  }
  host = await ecosystemFixture({ root, cli: options['--host-cli'], isolation: report.isolation, storeDir, installTimeoutMs });
  report.hostVersion = host.hostVersion;
  const observe = await mountSkillObserver(host);
  const nativeExercise = async (preset, names = []) => {
    if (['trisoul-x', 'omd-ptc'].includes(preset)) {
      const result = await exercisePro(host, observe, preset, undefined, names);
      const guarded = await host.inspect(result.sessionId);
      result.observer.modelDenials = guarded.modelDenials; result.observer.modelRoutes = guarded.modelRoutes; return result;
    }
    const result = { ...await host.exercise(preset), workspace: host.workspace };
    const full = await observe(result.sessionId);
    result.observer = { ...result.observer, ...full };
    return exerciseSkillTurns(host, observe, result, names);
  };
  let control;
  if (options['--control-report']) {
    assert.ok(isAbsolute(options['--control-report']) && options['--omd-package'], 'A control report requires an absolute path and a coexistence run');
    const bytes = await readFile(options['--control-report']); control = JSON.parse(bytes);
    assert.equal(control.mode, 'original-dsh'); assert.equal(control.hostVersion, host.hostVersion);
    assert.ok(!control.invalidOriginalHostControl && control.completed && control.failures.length === 0, 'Original DSH control must have completed its actual checks');
    for (const plugin of plugins) { const original = control.packages.find(row => row.name === plugin.name); assert.equal(original?.sha256, plugin.sha256, 'Control must use the same frozen real artifact'); }
    report.control = { file: options['--control-report'], sha256: hash(bytes), hostVersion: control.hostVersion };
  }
  const neutral = (rows, prefix) => JSON.parse(JSON.stringify(rows).replaceAll(prefix, '<owned-fixture-root>'));
  let omd;
  if (options['--omd-package']) {
    omd = await archive(options['--omd-package'], 'trisoul_x');
    assert.ok(omd.version.startsWith(host.hostVersion + (host.hostVersion.includes('-') ? '.' : '-') + 'omd.'), 'OMD must match the actual host');
    report.omd = omd;
  }
  await save();
  const installArtifact = async artifact => {
    assert.equal(hash(await readFile(artifact.file)), artifact.sha256, 'Frozen archive before native installation');
    const profile = await realpath(join(host.home, 'profiles', host.profile));
    const approvedBuild = artifact.name + '@file:' + relative(profile, artifact.file).replaceAll('\\', '/');
    const result = await host.cliRun(['plugin', '--profile', host.profile, 'add', '--allow-build=' + approvedBuild, 'file:' + artifact.file]);
    assert.equal(hash(await readFile(artifact.file)), artifact.sha256, 'Frozen archive after native installation');
    return result;
  };
  const installOmd = async () => {
    const result = await installArtifact(omd);
    report.omd.install = result; assert.ok(result.ok, 'Native OMD install failed: ' + result.stderr);
  };
  if (omd && order === 'omd-first') await installOmd();
  for (const plugin of plugins) {
    console.log('Installing real artifact ' + plugin.name + '@' + plugin.version);
    plugin.record.install = await installArtifact(plugin);
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
  let installedSkills;
  const expectedSkills = [...new Set(accepted.flatMap(plugin => plugin.skills ?? []))];
  const assertNativeResults = (evidence, skills = []) => {
    assert.deepEqual(evidence.observer.modelDenials, [], 'All scoped model calls must use the isolated local provider');
    assert.ok(evidence.observer.modelRoutes.some(route => route.sessionId === evidence.sessionId && route.provider === 'ecosystem' && route.model === 'ecosystem'), 'Actual session must reach the guarded local model route');
    const results = evidence.observer.events.filter(event => event.type === 'tool/result').map(event => event.data?.message);
    const successfulResult = text => results.some(message => message && !message.isError && JSON.stringify(message.content).includes(text));
    assert.ok(successfulResult('ECO_NATIVE_FILE_READ'), 'Native read must return actual probe content successfully');
    assertSkillResults(evidence, skills);
  };
  const runPreset = async (preset, stage) => {
    const evidence = await nativeExercise(preset, expectedSkills);
    await writeFile(join(out, `${stage}-${preset}.json`), JSON.stringify(evidence, null, 2));
    assertNativeResults(evidence, expectedSkills);
    if (!installedSkills) installedSkills = evidence.observer.skills;
    else assert.deepEqual(evidence.observer.skills, installedSkills, 'Complete native policy/provider directory survives preset and re-enable');
    if (preset === 'omd-ptc' || preset === 'ptc') {
      const wire = evidence.requests.filter(request => request.tools?.length);
      const allowed = new Set(['run_code', ...(preset === 'omd-ptc' ? ['job_output', 'job_list', 'job_kill', 'runtime_status'] : [])]);
      assert.ok(wire.length >= 2 && wire.every(request => request.tools.some(tool => tool.function.name === 'run_code') && request.tools.every(tool => allowed.has(tool.function.name))), 'PTC must keep run_code and its documented controls, without direct business tools');
    }
    for (const plugin of accepted) {
      for (const name of plugin.tools ?? []) assert.ok(evidence.observer.tools.some(tool => tool.name === name), plugin.name + ' real tool missing in ' + preset + ': ' + name);
      for (const name of plugin.skills ?? []) {
        assert.ok(evidence.observer.skills.some(skill => skill.name === name), plugin.name + ' skill provider missing in ' + preset);
      }
    }
    if (control) {
      const original = JSON.parse(await readFile(join(resolve(options['--control-report'], '..'), 'initial-standard.json'), 'utf8'));
      assert.deepEqual(neutral(evidence.observer.skills, host.root), neutral(original.observer.skills, control.root), 'Preserve the entire actual invocation-neutral directory/policy/provider in ' + preset);
      for (const plugin of accepted) {
        assert.ok(control.packages.find(row => row.name === plugin.name)?.supported, 'Artifact did not pass original DSH control: ' + plugin.name);
        for (const name of plugin.tools ?? []) assert.deepEqual(neutral(evidence.observer.tools.find(tool => tool.name === name), host.root), neutral(original.observer.tools.find(tool => tool.name === name), control.root), 'Preserve real third-party tool schema/description in ' + preset);
        for (const name of plugin.skills ?? []) {
          const expected = original.observer.skills.find(skill => skill.name === name);
          assert.deepEqual(neutral(evidence.observer.skills.find(skill => skill.name === name), host.root), neutral(expected, control.root), 'Preserve real skill provider/policy in ' + preset);
          const catalog = view => view.skills.filter(skill => skill.provider === expected.provider).sort((left, right) => left.name.localeCompare(right.name));
          assert.deepEqual(neutral(catalog(evidence.observer), host.root), neutral(catalog(original.observer), control.root), 'Preserve the entire installed provider catalog in ' + preset);
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
    if (accepted.some(plugin => plugin.name === 'dsh-intelligent-ui')) assert.ok(ui.iuiEntrance > 0, 'Preserved IUI native Chat entrance');
    return ui;
  });
  for (const plugin of accepted) if (plugin.apiPath) await check('real-service/' + plugin.name, async () => {
    const value = await host.request(plugin.apiPath);
    if (plugin.name === 'dsh-intelligent-ui') { assert.equal(value.version, plugin.version); assert.equal(value.sdkVersion, host.hostVersion); }
    return value;
  });
  const preservedPaths = ['settings.yaml', '.credentials.yaml', 'profiles/' + host.profile + '/cordis.yml', ...accepted.flatMap(plugin => plugin.preservePaths ?? [])];
  const preserved = [];
  for (const path of [...new Set(preservedPaths)]) {
    assert.equal(typeof path, 'string');
    const absolute = resolve(host.home, path);
    assert.ok(!isAbsolute(path) && !path.split(/[\\/]+/).includes('..') && absolute.startsWith(resolve(host.home) + sep), 'Preservation paths must stay within the isolated HOME');
    assert.ok((await realpath(absolute)).startsWith(await realpath(host.home) + sep), 'Preservation path symlink must remain inside the isolated HOME');
    const bytes = await readFile(absolute); preserved.push({ path, bytes, sha256: hash(bytes) });
  }
  const patchPath = join(host.home, 'profiles', host.profile, 'cordis.patch.yml');
  const userPatchBytes = await readFile(patchPath), userPatchBefore = parseYaml(userPatchBytes.toString('utf8'));
  const assertPreserved = async () => {
    for (const item of preserved) assert.deepEqual(await readFile(resolve(host.home, item.path)), item.bytes, 'Preserve user configuration/data: ' + item.path);
    const currentPatch = await readFile(patchPath);
    assert.deepEqual(currentPatch, userPatchBytes, 'Preserve the authored user patch bytes');
    assert.deepEqual(parseYaml(currentPatch.toString('utf8')), userPatchBefore, 'Lifecycle must not materialize effective bundle rows into the user patch');
    return preserved.map(({ path, sha256 }) => ({ path, sha256 }));
  };
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
    const sessions = [];
    for (const preset of presets) { const session = await nativeExercise(preset); assertNativeResults(session); sessions.push(session);
      await writeFile(join(out, 'disabled-' + preset + '.json'), JSON.stringify(session, null, 2)); }
    for (const session of sessions) for (const plugin of accepted) {
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
      if (plugin.name === 'dsh-intelligent-ui') assert.equal(ui.iuiEntrance, 0, 'Disabled IUI entrance remains');
    }
    return ui;
  });
  await check('disabled-preserves-user-config-and-third-party-data', assertPreserved);
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
    if (accepted.some(plugin => plugin.name === 'dsh-intelligent-ui')) assert.ok(ui.iuiEntrance > 0, 'Reenabled IUI native Chat entrance');
    return ui;
  });
  await host.stop();
  await check('reenabled-preserves-user-config-and-third-party-data', assertPreserved);
  if (omd) {
    await check('uninstall-omd-preserves-third-party-bundles', async () => {
      const removed = await host.cliRun(['plugin', '--profile', host.profile, 'remove', 'trisoul_x']);
      report.omd.uninstall = removed; assert.ok(removed.ok, removed.stderr);
      await host.start();
      try {
        const bundles = await host.rpc('pluginManager/listBundles');
        assert.ok(!bundles.some(row => row.name === 'trisoul_x' && row.installed));
        for (const plugin of accepted) assert.ok(bundles.some(row => row.name === plugin.name && row.installed && row.enabled), 'OMD uninstall must retain ' + plugin.name);
        const sessions = [];
        for (const preset of ['standard', 'ptc']) { const evidence = await nativeExercise(preset, expectedSkills); assertNativeResults(evidence, expectedSkills); sessions.push(evidence);
          await writeFile(join(out, 'omd-uninstalled-third-party-' + preset + '.json'), JSON.stringify(evidence, null, 2)); }
        const evidence = sessions[0];
        for (const session of sessions) assert.deepEqual(session.observer.skills, installedSkills, 'OMD-only uninstall retains every third-party policy/provider');
        for (const plugin of accepted) {
          for (const name of plugin.tools ?? []) assert.ok(evidence.observer.tools.some(tool => tool.name === name));
          for (const name of plugin.skills ?? []) assert.ok(evidence.observer.skills.some(skill => skill.name === name));
          if (plugin.apiPath) await host.request(plugin.apiPath);
        }
        await writeFile(join(out, 'omd-uninstalled-third-party-standard.json'), JSON.stringify(evidence, null, 2));
        const ui = await host.ui('omd-uninstalled-settings'); assert.deepEqual(ui.errors, []);
        for (const plugin of accepted) if (plugin.settingsText) assert.match(ui.text, new RegExp(plugin.settingsText, 'i'));
        if (accepted.some(plugin => plugin.name === 'dsh-intelligent-ui')) assert.ok(ui.iuiEntrance > 0, 'OMD-only uninstall must preserve the IUI Chat entrance');
        await writeFile(join(out, 'omd-uninstalled-third-party-settings.json'), JSON.stringify(ui, null, 2));
      } finally { await host.stop(); }
      return assertPreserved();
    });
  }
  await check('uninstall-native-cli', async () => {
    const changes = [];
    report.uninstall = changes;
    const manifest = JSON.parse(await readFile(join(host.home, 'profiles', host.profile, 'package.json'), 'utf8'));
    for (const plugin of [...plugins].reverse()) {
      if (!manifest.dependencies?.[plugin.name]) { changes.push({ name: plugin.name, skipped: 'Native refused installation was rolled back; no dependency to remove.' }); continue; }
      const result = await host.cliRun(['plugin', '--profile', host.profile, 'remove', plugin.name]); changes.push({ name: plugin.name, result }); await save(); assert.ok(result.ok);
    }
    if (manifest.dependencies?.trisoul_x) { const result = await host.cliRun(['plugin', '--profile', host.profile, 'remove', 'trisoul_x']); changes.push({ name: 'trisoul_x', result }); await save(); assert.ok(result.ok); }
    return changes;
  });
  await host.start();
  await check('uninstalled-original-host-restored', async () => {
    const rows = await host.rpc('pluginManager/listBundles');
    for (const plugin of plugins) assert.ok(!rows.some(row => row.name === plugin.name && row.installed));
    if (omd) assert.ok(!rows.some(row => row.name === 'trisoul_x' && row.installed));
    const sessions = [];
    for (const preset of ['standard', 'ptc']) {
      const evidence = await nativeExercise(preset); assertNativeResults(evidence); sessions.push(evidence);
      for (const plugin of accepted) { for (const name of plugin.tools ?? []) assert.ok(!evidence.observer.tools.some(tool => tool.name === name)); for (const name of plugin.skills ?? []) assert.ok(!evidence.observer.skills.some(skill => skill.name === name)); }
      await writeFile(join(out, 'uninstalled-' + preset + '.json'), JSON.stringify(evidence, null, 2));
    }
    const evidence = sessions[0];
    return { tools: evidence.observer.tools.map(tool => tool.name), services: evidence.observer.services };
  });
  await check('uninstalled-real-client-slots-and-services', async () => {
    const ui = await host.ui('uninstalled-settings'); assert.deepEqual(ui.errors, []);
    for (const plugin of accepted) {
      if (plugin.settingsText) assert.doesNotMatch(ui.text, new RegExp(plugin.settingsText, 'i'), 'Uninstalled settings slot remains: ' + plugin.name);
      if (plugin.apiPath) assert.equal(await host.httpStatus(plugin.apiPath), 404, 'Uninstalled service route remains: ' + plugin.name);
      if (plugin.name === 'dsh-intelligent-ui') assert.equal(ui.iuiEntrance, 0, 'Uninstalled IUI entrance remains');
    }
    return ui;
  });
  await host.stop();
  await check('uninstall-preserves-user-config-and-third-party-data', assertPreserved);
  for (const plugin of accepted) { plugin.record.supported = report.failures.length === 0; plugin.record.outcome = plugin.record.supported ? 'execution-and-lifecycle-verified' : 'verification-failed'; }
} catch (error) { report.failures.push({ name: 'runner', error: error.stack }); }
finally {
  try { report.cleanup = await closeOwnedFixture(host, rootIdentity, out); }
  catch (error) { report.cleanup = error.receipt ?? { status: 'failed', rootRemoved: false, error: error.stack }; report.failures.push({ name: 'cleanup', error: error.message }); }
  report.completedAt = new Date().toISOString(); report.completed = report.cleanup?.status === 'passed' && report.cleanup.rootRemoved === true && !report.failures.some(row => row.name === 'runner');
  report.interactionWarnings = report.checks.filter(check => check.evidence?.interaction?.includes('native-settings-shortcut')).map(check => ({ check: check.name, warning: 'The first settings-button click did not open the dialog within two seconds; the documented native shortcut opened it.' }));
  report.supportedPackages = report.packages.filter(plugin => plugin.supported).map(plugin => plugin.name);
  report.unsupportedPackages = report.packages.filter(plugin => !plugin.supported).map(plugin => ({ name: plugin.name, outcome: plugin.outcome }));
  report.passed = report.completed && report.failures.length === 0 && report.unsupportedPackages.length === 0;
  await save(); console.log(JSON.stringify({ report: join(out, 'report.json'), completed: report.completed, passed: report.passed, supported: report.supportedPackages, unsupported: report.unsupportedPackages, failures: report.failures.map(row => row.name) }));
  process.exitCode = report.passed ? 0 : 1;
}
