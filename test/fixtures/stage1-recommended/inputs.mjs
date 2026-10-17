import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { recommendedPlugins, resolveRecommendedPlugin } from '../../../src/recommended-plugin-catalog.mjs';

export const hostVersion = '0.2.1-alpha.2';
export const omdVersion = '0.2.1-alpha.2.omd.0.17.0';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const run = promisify(execFile);
export const blenderTools = ['blender_rt_see', 'blender_rt_do', 'blender_rt_watch', 'blender_rt_cmd', 'blender_rt_commands', 'blender_rt_loop', 'blender_rt_perf', 'blender_rt_opt', 'blender_rt_headless', 'blender_rt_plan', 'blender_rt_worker', 'blender_rt_txn', 'blender_rt_preset', 'blender_rt_job', 'blender_viewport'];
export const projectSkill = '---\nname: saas-landing\ndescription: Owned project skill keeps native precedence.\n---\nRECOMMENDED_PROJECT_SKILL_PRESERVED\n';

const absolute = (value, name) => { assert.equal(typeof value, 'string', name); assert.ok(isAbsolute(value), name + ' requires an explicit absolute path'); return resolve(value); };
const names = (value, name) => { assert.ok(Array.isArray(value), name + ' must explicitly list the complete capability set (including [])'); assert.ok(value.every(row => typeof row === 'string' && row.length > 0)); assert.equal(new Set(value).size, value.length, name + ' contains duplicates'); return value; };
const oldRoots = ['/Users/mac/Projects/trisoul_x', '/Users/mac/.codex/worktrees/ecosystem-first-round/trisoul_x'];
const inOldSource = path => oldRoots.some(root => path === root || path.startsWith(root + sep));
const memberPath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => ['.', '..', ''].includes(part));
export async function tarJson(file, member = 'package/package.json') {
  assert.ok(memberPath(member), 'Unsafe archive member');
  const { stdout } = await run('tar', ['-xOf', file, member], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }); return JSON.parse(stdout);
}
async function artifact(row, name, version, sha256) {
  const file = absolute(row.file, name + ' archive'); assert.match(row.sha256 ?? '', /^[a-f0-9]{64}$/);
  if (sha256) assert.equal(row.sha256, sha256, 'Input must bind the current catalog fixed asset, not a historical/native repack: ' + name);
  const bytes = await readFile(file); assert.equal(hash(bytes), row.sha256, 'Actual archive bytes: ' + name);
  const manifest = await tarJson(file, row.manifestMember);
  assert.equal(manifest.name, name); assert.equal(manifest.version, version);
  return { ...row, file, name, version, manifest, bytes: bytes.length };
}

// Called only inside the opt-in test. Missing/malformed external inputs do not
// break default test discovery, and no historical evidence directory is read.
export async function loadInputs() {
  if (process.env.OMD_A2_RECOMMENDED_NATIVE !== '1') return { skip: 'External recommended assets/native macOS host are opt-in: set OMD_A2_RECOMMENDED_NATIVE=1 and OMD_A2_RECOMMENDED_INPUTS.' };
  if (!process.env.OMD_A2_RECOMMENDED_INPUTS) return { skip: 'OMD_A2_RECOMMENDED_INPUTS is missing; provide the final current OMD archive+SHA and complete current fixed-catalog asset list.' };
  try {
    const inputFile = absolute(process.env.OMD_A2_RECOMMENDED_INPUTS, 'Inputs'), source = await readFile(inputFile), input = JSON.parse(source);
    assert.equal(input.version, 1); assert.equal(input.hostVersion, hostVersion);
    const cli = await realpath(absolute(input.hostCli, 'Host CLI')); assert.equal(inOldSource(cli), false, 'Never execute an old-source CLI');
    const req = createRequire(cli);
    assert.equal(JSON.parse(await readFile(req.resolve('@deepseek-ai/dsh/package.json'))).version, hostVersion, 'Use the actual matching alpha.2 CLI');
    const out = absolute(input.out, 'Evidence output');
    const checkout = await realpath(fileURLToPath(new URL('../../../', import.meta.url))), work = join(checkout, 'work');
    assert.ok(out.startsWith(work + sep), 'Evidence must be inside the new checkout work directory, never source/vendor or either old source');
    let ancestor = out;
    while (true) {
      try { ancestor = await realpath(ancestor); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; const parent = resolve(ancestor, '..'); assert.notEqual(parent, ancestor); ancestor = parent; }
    }
    assert.ok(ancestor === checkout || ancestor === work || ancestor.startsWith(work + sep), 'Evidence parent symlink escapes the new checkout work directory');
    const browser = await realpath(absolute(input.browserExecutable, 'Browser executable')); // No historical CFT binary hash/default.
    const browserRegistry = await realpath(absolute(input.browserRegistry, 'Installed Playwright browser registry'));
    assert.ok(browser.startsWith(browserRegistry + sep), 'Explicit browser must belong to the declared installed registry');
    const { chromium } = await import('playwright');
    assert.equal(browser, await realpath(chromium.executablePath()), 'The explicit browser must match the installed Playwright browser used by the shared public runner');
    const installTimeoutMs = input.installTimeoutMs ?? 600000;
    assert.ok(Number.isSafeInteger(installTimeoutMs) && installTimeoutMs >= 1000 && installTimeoutMs <= 1200000);
    const omd = await artifact(input.omd, 'trisoul_x', omdVersion);
    assert.ok((await realpath(omd.file)).startsWith(checkout + sep), 'Final current OMD archive must be produced in the new checkout, never reused from old evidence');
    assert.equal(omd.manifest.private, true); assert.equal(omd.manifest.unpublished, true); assert.ok(omd.manifest.dsh?.bundle?.patch);
    const catalog = recommendedPlugins.filter(row => !row.bundled).map(row => resolveRecommendedPlugin(row, hostVersion));
    assert.ok(Array.isArray(input.plugins)); assert.deepEqual(input.plugins.map(row => row.id).sort(), catalog.map(row => row.id).sort(), 'Declare every current non-bundled recommendation once; accepted subsets are never whole-catalog acceptance');
    const plugins = [];
    for (const row of input.plugins) {
      const entry = catalog.find(entry => entry.id === row.id); assert.ok(entry.review?.version && entry.review?.sha256, entry.id + ' has no fixed asset');
      const verified = await artifact(row, entry.packageName, entry.review.version, entry.review.sha256);
      assert.match(row.source ?? '', /^https:\/\//, 'Explicit traceable upstream/official asset URL required');
      names(row.tools, row.id + ' tools'); names(row.skills, row.id + ' skills');
      names(row.services, row.id + ' services'); names(row.entryIds, row.id + ' loader entry ids');
      assert.ok(row.skills.every(name => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)), 'Native skill names must match the actual alpha.2 grammar');
      assert.ok(Object.hasOwn(row, 'settingsText') && (row.settingsText === null || typeof row.settingsText === 'string' && row.settingsText.length), 'Explicit actual settings label or null required');
      assert.ok(Object.hasOwn(row, 'apiPath') && (row.apiPath === null || typeof row.apiPath === 'string' && row.apiPath.startsWith('/') && !row.apiPath.startsWith('//')), 'Explicit owned same-host service route or null required');
      assert.ok(Array.isArray(row.ui), 'Explicit actual UI probes required, including [] for a plugin without a conversation contribution');
      assert.ok(['accepted', 'rejected'].includes(row.stockGate), 'Explicit expected stock gate required for ' + row.id);
      if (row.stockGate === 'rejected') { assert.ok(typeof row.rejectionPattern === 'string' && row.rejectionPattern.length, 'Record the expected native peer refusal diagnostic'); new RegExp(row.rejectionPattern); }
      if (row.id === 'dsh-blender-plugin') assert.deepEqual([...row.tools].sort(), [...blenderTools].sort());
      if (row.id === 'dsh-infinite-gen-4') assert.ok(row.tools.includes('infinite_gen4_profile'));
      if (row.id === 'dsh-intelligent-ui') { assert.equal(verified.version, hostVersion + '.iui.1.0.6'); assert.ok(row.skills.includes('intelligent-ui')); assert.equal(row.apiPath, '/intelligent-ui/api/health'); }
      if (row.id === 'dsh-open-design') {
        const adapter = await tarJson(verified.file, row.adapterMember ?? 'package/OMD_ADAPTER.json');
        assert.equal(adapter.skillCount, 52); assert.equal(adapter.skills.length, adapter.skillCount);
        assert.deepEqual([...row.skills].sort(), [...adapter.skills].sort(), 'Exercise the entire fixed OpenDesign catalog, not only its entry skill');
      }
      names(row.preservePaths, row.id + ' preserved user-data paths');
      for (const path of row.preservePaths) assert.ok(memberPath(path), 'User-data paths must be nonempty safe files inside isolated HOME');
      for (const probe of row.ui) {
        assert.ok(typeof probe.selector === 'string' && probe.selector.length);
        if (probe.text !== undefined) assert.equal(typeof probe.text, 'string');
      }
      plugins.push({ ...verified, catalog: { id: entry.id, packageName: entry.packageName, review: entry.review, url: entry.url, unavailable: entry.unavailable ?? null } });
    }
    assert.ok(plugins.some(row => row.stockGate === 'rejected'), 'The matrix must include actual refused assets, not just the supported subset');
    assert.equal(plugins.find(row => row.id === 'dsh-status-rotator')?.settingsText, '状态文案', 'Current status settings contribution is required');
    assert.equal(plugins.find(row => row.id === 'dsh-status-rotator')?.apiPath, '/plugins/dsh-status-rotator/config.json');
    assert.equal(plugins.find(row => row.id === 'dsh-whale-widget')?.apiPath, '/dsh-whale/size.json');
    assert.ok(plugins.find(row => row.id === 'dsh-infinite-gen-4')?.ui?.length, 'Infinite Gen4 actual UI expectation is required');
    assert.ok(plugins.find(row => row.id === 'dsh-whale-widget')?.ui?.length, 'Whale actual UI expectation is required');
    assert.equal(plugins.find(row => row.id === 'dsh-market')?.settingsText, '插件市场', 'Current market settings contribution is required');
    // Fixed Blender 1.0.5 exports loader Config and injects tools, not native settings.
    assert.equal(plugins.find(row => row.id === 'dsh-blender-plugin')?.settingsText, null, 'Do not invent a settings label for the fixed Blender asset');
    assert.ok(plugins.find(row => row.id === 'dsh-infinite-gen-4').ui.some(probe => probe.selector === '[data-armor="on"][title="无限四代 v0.4.0"]'));
    assert.ok(plugins.find(row => row.id === 'dsh-whale-widget').ui.some(probe => probe.selector === '.dshwv-root'));
    for (const id of ['dsh-open-design', 'dsh-status-rotator', 'dsh-whale-widget']) assert.equal(plugins.find(row => row.id === id).stockGate, 'accepted', 'Full directory/project priority/settings lifecycle requires actual accepted ' + id);
    return { inputFile, source, cli, out, browser, browserRegistry, omd, plugins, inputSha256: hash(source), installTimeoutMs };
  } catch (error) { return { skip: 'Invalid/unavailable explicit inputs; native matrix NOT RUN: ' + error.message }; }
}

export async function freezeInputs(input, directory) {
  await mkdir(directory);
  await writeFile(join(directory, 'inputs-at-execution.json'), input.source, { flag: 'wx' });
  const freeze = async row => {
    const bytes = await readFile(row.file); assert.equal(hash(bytes), row.sha256);
    const id = row.name === 'trisoul_x' ? 'omd' : row.id;
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const file = join(directory, id, row.sha256 + '.tgz'); await mkdir(join(directory, id));
    await writeFile(file, bytes, { flag: 'wx' }); return { ...row, sourceFile: row.file, file };
  };
  return { ...input, omd: await freeze(input.omd), plugins: await Promise.all(input.plugins.map(freeze)) };
}
