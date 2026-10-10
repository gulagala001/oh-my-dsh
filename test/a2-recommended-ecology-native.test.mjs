import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile, readdir, lstat, cp, rm } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse, stringify } from 'yaml';
import { ecosystemFixture, until } from './fixtures/plugin-ecosystem.mjs';
import { cleanEnvironment } from '../scripts/simulator/host.mjs';

const run = promisify(execFile);
const enabled = process.env.OMD_A2_RECOMMENDED_NATIVE === '1';
const mode = process.env.OMD_A2_RECOMMENDED_MODE ?? 'stock-gates';
const evidence = resolve(process.env.OMD_A2_RECOMMENDED_EVIDENCE ?? 'work/a2-compat/recommended-ecology');
const cli = resolve(process.env.OMD_DSH_CLI ?? 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const sourceBytes = await readFile(new URL(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const inventory = enabled ? JSON.parse(await readFile(join(evidence, 'artifact-inventory.json'))) : [];
const accepted = inventory.filter(row => !['omd-intent-assistant', 'dsh-turn-rewind'].includes(row.id));
const omd = { path: resolve(process.env.OMD_A2_RECOMMENDED_OMD_ARCHIVE ?? 'work/a2-compat/formal-candidate-a2/trisoul_x-0.2.1-alpha.2.omd.0.12.1.tgz'), sha256: process.env.OMD_A2_RECOMMENDED_OMD_SHA256 ?? 'c96fdf9051039b0f775526de6e3fa46476077174246358e3c4f70f15e932f5f6' };
const coldPatch = { path: resolve('work/a2-compat/formal-candidate-a2-0122/trisoul_x-0.2.1-alpha.2.omd.0.12.2.tgz'), sha256: 'ec34bca30ad4ff99f84b25da2d00c279f79f6a1beda235382422839cfacfc665' };
const projectSkill = '---\nname: saas-landing\ndescription: Owned project skill keeps native precedence.\n---\nRECOMMENDED_PROJECT_SKILL_PRESERVED\n';
const blenderTools = ['blender_rt_see', 'blender_rt_do', 'blender_rt_watch', 'blender_rt_cmd', 'blender_rt_commands', 'blender_rt_loop', 'blender_rt_perf', 'blender_rt_opt', 'blender_rt_headless', 'blender_rt_plan', 'blender_rt_worker', 'blender_rt_txn', 'blender_rt_preset', 'blender_rt_job', 'blender_viewport'];
const cft = join(evidence, 'browser/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

function assertNativeRead(result) {
  const reads = result.observer.events.filter(event => event.type === 'tool/result' && !event.data.message?.isError && JSON.stringify(event.data.message).includes('ECO_NATIVE_FILE_READ'));
  assert.equal(reads.length, 1, 'Exactly one actual native read must return owned source bytes');
}

async function interactiveCli(f, args) {
  const env = { ...cleanEnvironment(f.root, f.home), CI: 'true' }; delete env.NODE_OPTIONS;
  const argv = args[0] === 'plugin' && args.some(value => ['add', 'remove', 'install'].includes(value)) ? [...args, '--store-dir', join(evidence, 'public-store')] : args;
  try { const result = await run(process.execPath, [f.cli, ...argv], { cwd: f.workspace, env, timeout: 600000, maxBuffer: 16 * 1024 * 1024 }); return { ok: true, exitCode: 0, argv, CI: true, ...result }; }
  catch (error) { return { ok: false, exitCode: error.code, argv, CI: true, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }; }
}

async function nativeFixture(t, label) {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
  const out = join(evidence, label + (process.env.OMD_A2_RECOMMENDED_CASE_SUFFIX ? '-' + process.env.OMD_A2_RECOMMENDED_CASE_SUFFIX : '')), root = join(out, 'fixture-root'); await mkdir(root, { recursive: true });
  const f = await ecosystemFixture({ root, cli, isolation: 'native', storeDir: join(evidence, 'public-store'), installTimeoutMs: 600000 });
  assert.equal(f.hostVersion, '0.2.1-alpha.2');
  await writeFile(join(out, 'test-source-at-execution.mjs'), sourceBytes);
  t.after(async () => {
    await f.close();
    const remaining = (await run('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(row => row.includes(root));
    assert.deepEqual(remaining, []);
    const monitorAcks = await retainAndCleanMonitorAcks(root, out);
    await writeFile(join(out, 'cleanup.json'), JSON.stringify({ root, retainedOwnedEvidence: true, nativeStopped: true, ownedProcessesRemaining: remaining, monitorAcks }, null, 2) + '\n');
  });
  return { f, out };
}

async function retainAndCleanMonitorAcks(root, out) {
  const rows = [];
  for (const file of (await readdir(root)).filter(name => /^processes-\d+\.json$/.test(name))) {
    const audit = JSON.parse(await readFile(join(root, file))), path = audit.ackDirectory;
    assert.equal(audit.closed, true); assert.match(audit.bootId, /^[a-f0-9-]{36}$/);
    assert.equal(path, resolve(path)); assert.match(basename(path), /^ecosystem-process-monitor-[a-zA-Z0-9]+$/);
    assert(path.startsWith('/private/var/folders/') || path.startsWith('/private/tmp/') || path.startsWith('/tmp/'));
    const owned = join(out, 'monitor-acks', audit.bootId);
    let stat; try { stat = await lstat(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat) {
      assert(stat.isDirectory() && !stat.isSymbolicLink()); assert.equal(stat.uid, process.getuid());
      const processes = (await run('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(line => line.includes(path)); assert.deepEqual(processes, []);
      await cp(path, owned, { recursive: true, errorOnExist: true, force: false }); await rm(path, { recursive: true });
    }
    await assert.rejects(access(path), { code: 'ENOENT' });
    rows.push({ audit: file, bootId: audit.bootId, originalPath: path, retainedAckEvidence: stat ? owned : null, removed: true });
  }
  return rows;
}

if (mode === 'stock-gates') for (const artifact of inventory) test('stock official a2 Native install and peer gate: ' + artifact.id, { timeout: 750000, skip: !enabled }, async t => {
  assert.equal(artifact.catalogMatches, true); assert.equal(hash(await readFile(artifact.path)), artifact.sha256);
  const { f, out } = await nativeFixture(t, 'stock-' + artifact.id);
  const target = artifact.nativeArchive ?? artifact;
  assert.equal(hash(await readFile(target.path)), target.sha256);
  const report = { artifact, installedArchive: { path: target.path, sha256: target.sha256 }, host: { cli: f.cli, version: f.hostVersion }, sourceSha256: hash(sourceBytes), installAccepted: false, bootAccepted: false, nativeControlPassed: false, nativeCompatibilityExemptions: {}, startedAt: new Date().toISOString() };
  const install = await f.cliRun(['plugin', '--profile', f.profile, 'add', 'file:' + target.path]);
  report.install = install; report.installAccepted = install.ok;
  report.nativeCompatibilityExemptions = JSON.parse((await f.cliRun(['plugin', '--profile', f.profile, 'version-exemptions'])).stdout); assert.deepEqual(report.nativeCompatibilityExemptions, {});
  await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  if (install.ok) {
    try {
      await f.start(); report.bootAccepted = true;
      report.registry = await f.inspect();
      report.bundles = await f.rpc('pluginManager/listBundles');
      report.toolsAndSkills = await f.exercise('standard', artifact.id === 'dsh-open-design');
      assertNativeRead(report.toolsAndSkills);
      assert.equal(report.toolsAndSkills.observer.agent.status, 'idle'); assert.deepEqual(f.protocolErrors, []);
      report.nativeControlPassed = true;
    } catch (error) { report.bootFailure = { name: error.name, message: error.message }; }
  }
  report.finishedAt = new Date().toISOString(); report.scope = 'Original stock Native installation/gate and actual boot/read/skill registration control; UI and lifecycle are separate acceptance.';
  await writeFile(join(out, 'host.log'), f.log()); await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.diagnostic(JSON.stringify({ id: artifact.id, installAccepted: report.installAccepted, bootAccepted: report.bootAccepted, diagnostic: report.installAccepted ? report.bootFailure : report.install.stderr, nativeCompatibilityExemptions: report.nativeCompatibilityExemptions }));
  if (report.installAccepted) { assert.equal(report.bootAccepted, true, JSON.stringify(report.bootFailure)); assert.equal(report.nativeControlPassed, true, JSON.stringify(report.bootFailure)); }
  else assert.equal(report.install.exitCode, 1, 'Actual native rejection must remain a concrete non-zero exit, never a skip');
});

// Pure observation of the public NativeLoader, tools and session services.
// No Agent/provider implementation or production registration is replaced.
async function recommendedObserver(ctx, config) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/recommended-observer', async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req); if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const query = new URL(req.url, 'http://localhost').searchParams;
      if (query.has('residency')) { const id = query.get('residency'); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ sessionId: id, agentResident: Boolean(ctx.agents.get(id)) })); return; }
      // Credentials stay in Node memory, used only to drive this owned native UI.
      if (query.has('browser')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ origin: 'http://' + req.headers.host, cookie: req.headers.cookie })); return; }
      const id = query.get('session'), found = id && await ctx.get('sessionController')?.resolveAgent(id);
      if (found?.error) throw found.error;
      const agent = found?.agent ?? (id && ctx.agents.get(id)), session = agent?.session ?? (id && ctx.sessions.get(id));
      const entries = [...ctx.loader.entries()], hostEntry = entries.find(row => row.options.name === '@deepseek-ai/dsh-tools');
      const native = await hostEntry.parent.tree.import('@deepseek-ai/dsh-tools'), cordis = await hostEntry.parent.tree.import('@deepseek-ai/cordis');
      const owners = {};
      for (const owner of config.owners) {
        const entry = owner === 'dsh-open-design' ? entries.find(row => row.options.id === 'open-design-skill-filesystem') : entries.find(row => row.options.name === owner) ?? entries.find(row => row.options.name?.startsWith(owner + '/')); if (!entry) continue;
        const row = owners[owner] = { entry: entry.options.name, peers: {} };
        for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-web', '@deepseek-ai/dsh-home-paths']) {
          try { const fromOwner = await entry.parent.tree.import(peer), fromHost = await hostEntry.parent.tree.import(peer); row.peers[peer] = { namespaceEqual: fromOwner === fromHost }; }
          catch (error) { row.peers[peer] = { error: error.message }; }
        }
      }
      const skills = ctx.get('skills') ?? ctx.get('skill'), catalog = skills?.list ? await skills.list({ cwd: session?.header.cwd, scope: agent }) : [];
      const value = { nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof native.ToolRuntime,
        owners, entries: entries.map(row => row.options.name), tools: ctx.tools.schemas(agent), skills: catalog,
        agent: agent && { id: agent.id, status: agent.status }, header: session?.header, events: session?.snapshotEvents() ?? [] };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}

async function prepareRecommended(f) {
  const dir = join(f.root, 'recommended-observer'); await mkdir(dir);
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'owned-recommended-native-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  await writeFile(join(dir, 'index.mjs'), 'export const inject = ["loader","tools","webServer","connection","agents","sessions"];\nexport const apply = ' + recommendedObserver.toString() + ';\n');
  const path = join(f.home, 'profiles', f.profile, 'cordis.patch.yml'), rows = parse(await readFile(path, 'utf8')); assert(Array.isArray(rows));
  rows.push({ id: 'trisoul-x', config: { componentAutoSetup: false, computerUseNativeBinary: join(f.root, 'missing-native-driver'), computerUseNativeSocket: join(f.root, 'missing-native.sock'), computerUseChromeUserDataDir: join(f.root, 'owned-chrome-profile'), unifiedBackground: { provider: 'ecosystem', model: 'ecosystem', effort: 'off' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem' } },
    { insert: [{ id: 'owned-recommended-observer', name: pathToFileURL(join(dir, 'index.mjs')).href, config: { owners: ['trisoul_x', ...accepted.map(row => row.manifest.name)] } }] });
  await writeFile(path, stringify(rows));
  const skillDir = join(f.workspace, '.dsh/skills/saas-landing'); await mkdir(skillDir, { recursive: true }); await writeFile(join(skillDir, 'SKILL.md'), projectSkill);
  return { patchPath: path, projectPath: join(skillDir, 'SKILL.md') };
}

async function realUi(f, out, sessionId, label) {
  await access(cft); assert.equal(hash(await readFile(cft)), '8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a');
  const { chromium } = await import('playwright'), { origin, cookie } = await f.request('/recommended-observer?browser=1');
  const env = cleanEnvironment(f.root, f.home); delete env.NODE_OPTIONS;
  const browser = await chromium.launch({ executablePath: cft, headless: true, env, args: ['--use-mock-keychain', '--password-store=basic'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }), errors = [], consoleErrors = [], failed = [], httpErrors = [], interactions = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', row => { if (row.type() === 'error') consoleErrors.push({ text: row.text(), path: row.location().url ? new URL(row.location().url).pathname : '' }); });
  page.on('response', row => { if (row.status() >= 400) httpErrors.push({ path: new URL(row.url()).pathname, status: row.status() }); });
  page.on('requestfailed', row => failed.push({ path: new URL(row.url()).pathname, error: row.failure()?.errorText }));
  await page.context().addCookies(cookie.split('; ').map(row => { const at = row.indexOf('='); return { name: row.slice(0, at), value: row.slice(at + 1), url: origin }; }));
  await page.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) await route.continue(); else await route.abort(); });
  try {
    await f.rpc('session/rename', { request: { sessionId, title: 'RECOMMENDED_NATIVE_' + label } });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.waitFor({ state: 'visible', timeout: label === 'installed' ? 30000 : 3000 }).then(() => true, () => false)) { await welcome.click(); await welcome.waitFor({ state: 'hidden' }); interactions.push('welcome'); }
    await page.getByText('RECOMMENDED_NATIVE_' + label, { exact: true }).first().click(); await page.locator('.wSkVaW_header').waitFor();
    await page.locator('[data-armor="on"][title="无限四代 v0.4.0"]').waitFor({ state: 'visible' });
    const widget = page.locator('.dshwv-root'); await widget.waitFor({ state: 'visible' });
    await page.screenshot({ path: join(out, label + '-conversation.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '设置', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    if (!await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false)) { await page.keyboard.press('Alt+Meta+Comma'); await dialog.waitFor(); interactions.push('native-settings-shortcut'); }
    const menuText = await dialog.innerText(); assert.match(menuText, /状态文案/);
    await dialog.getByText('状态文案', { exact: true }).first().click();
    await dialog.locator('.dsh-sr-settings').waitFor({ state: 'visible' });
    await dialog.getByRole('tab', { name: '行为', exact: true }).click();
    const interval = dialog.locator('label.dsh-sr-field').filter({ has: page.getByText('轮换间隔(毫秒)', { exact: true }) }).locator('input');
    await until(async () => await interval.inputValue() === '1377', 'Status settings shows the saved native configuration');
    const settingsText = await dialog.innerText(); await page.screenshot({ path: join(out, label + '-status-settings.png'), animations: 'disabled' });
    assert.deepEqual(errors, []); return { menuText, settingsText, savedIntervalRendered: await interval.inputValue(), errors, consoleErrors, failed, httpErrors, interactions, infiniteVisible: true, whaleVisible: true };
  } catch (error) {
    await page.screenshot({ path: join(out, label + '-first-failure.png') }).catch(() => {});
    await writeFile(join(out, label + '-first-failure.json'), JSON.stringify({ message: error.message, body: await page.locator('body').innerText().catch(() => ''), errors, consoleErrors, failed, httpErrors, interactions }, null, 2)); throw error;
  } finally { await browser.close(); }
}

async function exercisePro(f, preset, existingSession) {
  const workspace = await f.rpc('workspace/create', { request: { path: f.workspace } });
  const sessionId = existingSession ?? (await f.rpc('session/create', { request: { workspaceId: workspace.workspace.workspaceId, agentPreset: preset } })).sessionId;
  const mode = await f.request('/trisoul-x/api/model-mode?session=' + sessionId, existingSession ? undefined : { provider: 'ecosystem', model: 'ecosystem', mode: 'pro' });
  assert.equal(mode.eligible, true); assert.equal(mode.mode, 'pro');
  const before = f.requests.length, eventCount = (await f.inspect(sessionId)).events.length;
  for (const operation of ['read', 'skill']) {
    const ends = (await f.inspect(sessionId)).events.filter(row => row.type === 'turn/end').length;
    await f.rpc('session/prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'ECO_CHECK:' + operation + ':' + crypto.randomUUID() }] } });
    await until(async () => { assert.deepEqual(f.protocolErrors, []); const value = await f.inspect(sessionId); return value.agent?.status === 'idle' && value.events.filter(row => row.type === 'turn/end').length > ends; }, preset + ' Pro ' + operation, 45000);
  }
  const observer = await f.inspect(sessionId); observer.events = observer.events.slice(eventCount);
  return { preset, sessionId, mode, observer, requests: f.requests.slice(before) };
}

if (['accepted-combo', 'stock-accepted-combo'].includes(mode)) for (const order of mode === 'stock-accepted-combo' ? [0] : [1, 2]) test('accepted official catalog plugins coexist with ' + (order ? 'full OMD Native, order ' + order : 'original stock Native'), { timeout: 1800000, skip: !enabled }, async t => {
  if (order) assert.equal(hash(await readFile(omd.path)), omd.sha256);
  const { f, out } = await nativeFixture(t, 'combo-' + (process.env.OMD_A2_RECOMMENDED_COMBO_LABEL ?? 'current') + '-order-' + order), owned = await prepareRecommended(f);
  const report = { order, omd, catalogArtifacts: accepted.map(row => ({ id: row.id, path: row.path, sha256: row.sha256 })), sourceSha256: hash(sourceBytes), startedAt: new Date().toISOString(), installations: [], lifecycle: [], stateChecks: [] };
  const persist = () => writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.after(async () => { await writeFile(join(out, 'host.log'), f.log()); await persist(); });
  const observe = id => f.request('/recommended-observer' + (id ? '?session=' + encodeURIComponent(id) : ''));
  await f.start(); report.stockExercise = await f.exercise('standard'); assertNativeRead(report.stockExercise); report.stock = await observe(report.stockExercise.sessionId);
  assert.equal(report.stock.nativeToolRuntime, true); assert.equal(report.stock.tools.length, 31);
  const originalProject = report.stock.skills.find(row => row.name === 'saas-landing'); assert(originalProject); assert.equal(originalProject.path, owned.projectPath);
  await f.stop();
  const all = order === 0 ? accepted : order === 1 ? [{ id: 'omd', ...omd, manifest: { name: 'trisoul_x' } }, ...accepted] : [...accepted, { id: 'omd', ...omd, manifest: { name: 'trisoul_x' } }];
  for (const artifact of all) {
    assert.equal(hash(await readFile(artifact.path)), artifact.sha256);
    const install = await interactiveCli(f, ['plugin', '--profile', f.profile, 'add', 'file:' + artifact.path]); report.installations.push({ id: artifact.id, install }); await persist(); assert.equal(install.ok, true, artifact.id + ': ' + install.stderr);
  }
  const manifestPath = join(f.home, 'profiles', f.profile, 'package.json'), requireProfile = createRequire(manifestPath), packageRoot = resolve(requireProfile.resolve('dsh-open-design/package.json'), '..');
  const openDesign = JSON.parse(await readFile(join(packageRoot, 'OMD_ADAPTER.json'))); assert.equal(openDesign.skillCount, 52);
  await f.start(); report.bundles = await f.rpc('pluginManager/listBundles');
  for (const artifact of all) { const row = report.bundles.find(row => row.name === artifact.manifest.name); assert(row?.installed && row?.enabled, artifact.id + ' actual enabled bundle'); }
  report.exemptions = JSON.parse((await interactiveCli(f, ['plugin', '--profile', f.profile, 'version-exemptions'])).stdout); assert.deepEqual(report.exemptions, {});
  report.standardExercise = await f.exercise('standard', true); assertNativeRead(report.standardExercise); report.standard = await observe(report.standardExercise.sessionId);
  for (const previous of report.stock.tools) assert.deepEqual(report.standard.tools.find(row => row.name === previous.name), previous, 'Original full native schema/description preserved: ' + previous.name);
  assert.equal(report.standard.nativeToolRuntime, true);
  for (const artifact of all) { const row = report.standard.owners[artifact.manifest.name]; assert(row, artifact.id + ' actual NativeLoader owner'); for (const [peer, value] of Object.entries(row.peers)) assert.equal(value.namespaceEqual, true, artifact.id + ' ' + peer + ': ' + JSON.stringify(value)); }
  for (const name of [...blenderTools, 'infinite_gen4_profile']) assert(report.standard.tools.some(row => row.name === name), name);
  const added = report.standard.skills.filter(row => !report.stock.skills.some(previous => previous.name === row.name)); assert.equal(added.length, 51);
  assert.deepEqual(added.map(row => row.name).sort(), openDesign.skills.filter(name => name !== 'saas-landing').sort());
  assert.deepEqual(report.standard.skills.find(row => row.name === 'saas-landing'), originalProject);
  const skillResult = report.standardExercise.observer.events.find(row => row.type === 'tool/result' && JSON.stringify(row.data.message).includes('OpenDesign bridge')); assert(skillResult && !skillResult.data.message?.isError);
  report.pro = [];
  for (const preset of order ? ['trisoul-x', 'omd-ptc'] : []) {
    const result = await exercisePro(f, preset); report.pro.push(result); assertNativeRead(result);
    result.ptcWireObserved = result.requests.some(row => row.tools?.some(tool => tool.function.name === 'run_code'));
    if (preset === 'omd-ptc') assert.equal(result.ptcWireObserved, true, 'PTC preset must expose its actual run_code loop');
    else assert(result.requests.some(row => row.tools?.some(tool => tool.function.name === 'workflow' && tool.function.parameters?.properties?.resumeFromRunId)), 'Normal Pro retains native Workflow resume capability');
  }
  const layerPath = join(f.home, 'profiles', f.profile, 'cordis.yml'), layerBytes = await readFile(layerPath); let patchBytes = await readFile(owned.patchPath);
  const statusDoc = await f.request('/plugins/dsh-status-rotator/config.json'); report.statusBefore = statusDoc;
  statusDoc.config = { ...statusDoc.config, intervalMs: 1377 }; const savedStatus = await f.request('/plugins/dsh-status-rotator/config.json', statusDoc); assert.equal(savedStatus.ok, true);
  report.statusSave = savedStatus;
  const whaleSaved = await f.request('/dsh-whale/size.json', { scale: 0.73, sound: false, vol: 0.37, menuBtnHide: false }); assert.equal(whaleSaved.ok, true); report.whaleSave = whaleSaved;
  const statusPath = join(f.home, 'status-rotator/config.json'), whalePath = join(f.home, '.dshw-size.json'), statusBytes = await readFile(statusPath), whaleBytes = await readFile(whalePath);
  assert.equal(JSON.parse(statusBytes).config.intervalMs, 1377); assert.equal(JSON.parse(whaleBytes).scale, 0.73);
  const stateCheck = async label => { assert.deepEqual(await readFile(layerPath), layerBytes); assert.deepEqual(await readFile(owned.patchPath), patchBytes); assert.equal(await readFile(owned.projectPath, 'utf8'), projectSkill); assert.deepEqual(await readFile(statusPath), statusBytes); assert.deepEqual(await readFile(whalePath), whaleBytes); report.stateChecks.push({ label, userLayerSha256: hash(layerBytes), patchSha256: hash(patchBytes), statusSha256: hash(statusBytes), whaleSha256: hash(whaleBytes), projectSkillSha256: hash(projectSkill) }); };
  await writeFile(join(out, 'user-patch-before-first-ui.yml'), patchBytes);
  report.ui = await realUi(f, out, report.standardExercise.sessionId, 'installed');
  const afterWelcome = await readFile(owned.patchPath), welcomeRow = { id: 'ui-settings-general', name: '@deepseek-ai/dsh-client-ui-settings-general', config: { welcomeNoticeVersion: '2026-09-28.1' } };
  assert.deepEqual(afterWelcome.subarray(0, patchBytes.length), patchBytes, 'Native welcome acknowledgement retains every original user patch byte');
  assert.deepEqual(parse(afterWelcome.toString()), [...parse(patchBytes.toString()), welcomeRow], 'Only the actual native welcome acknowledgement may be appended');
  report.welcomeAcknowledgement = { beforeSha256: hash(patchBytes), afterSha256: hash(afterWelcome), appendedNativeRow: welcomeRow }; patchBytes = afterWelcome;
  await stateCheck('after-ui'); await persist();
  for (const artifact of all) for (const enabled of [false, true]) {
    const mutation = await f.rpc('pluginManager/setBundleEnabled', { name: artifact.manifest.name, enabled }); assert(['applied', 'restart-required'].includes(mutation.application)); await f.stop(); await f.start();
    const result = await f.exercise('standard', artifact.id !== 'dsh-open-design' || enabled); assertNativeRead(result); const actual = await observe(result.sessionId);
    assert.equal(actual.nativeToolRuntime, true); for (const previous of report.stock.tools) assert.deepEqual(actual.tools.find(row => row.name === previous.name), previous);
    if (artifact.id === 'dsh-infinite-gen-4') assert.equal(actual.tools.some(row => row.name === 'infinite_gen4_profile'), enabled);
    if (artifact.id === 'dsh-blender-plugin') for (const name of blenderTools) assert.equal(actual.tools.some(row => row.name === name), enabled);
    if (artifact.id === 'dsh-open-design') assert.equal(actual.skills.some(row => row.name === 'open-design'), enabled);
    if (artifact.id === 'dsh-whale-widget') assert.equal(await f.httpStatus('/dsh-whale/last-turn.json'), enabled ? 200 : 404);
    if (artifact.id === 'dsh-status-rotator') assert.equal(await f.httpStatus('/plugins/dsh-status-rotator/config.json'), enabled ? 200 : 404);
    await stateCheck(artifact.id + '-' + enabled); report.lifecycle.push({ id: artifact.id, enabled, mutation }); await persist();
  }
  report.coldExercise = await f.exercise('standard', true); assertNativeRead(report.coldExercise); report.cold = await observe(report.coldExercise.sessionId);
  assert.deepEqual(report.cold.tools, report.standard.tools); assert.deepEqual(report.cold.skills, report.standard.skills);
  if (order) { report.coldPro = await exercisePro(f, 'omd-ptc', report.pro.find(row => row.preset === 'omd-ptc').sessionId); assertNativeRead(report.coldPro); assert(report.coldPro.requests.some(row => row.tools?.some(tool => tool.function.name === 'run_code'))); }
  report.coldUi = await realUi(f, out, report.coldExercise.sessionId, 'cold');
  await stateCheck('all-cold-restored'); await f.stop();
  report.removals = [];
  for (const artifact of [...all].reverse()) { const result = await interactiveCli(f, ['plugin', '--profile', f.profile, 'remove', artifact.manifest.name]); report.removals.push({ id: artifact.id, result }); assert.equal(result.ok, true, result.stderr); }
  await f.start(); report.afterRemovalExercise = await f.exercise('standard'); assertNativeRead(report.afterRemovalExercise); report.afterRemoval = await observe(report.afterRemovalExercise.sessionId);
  assert.deepEqual(report.afterRemoval.tools, report.stock.tools); assert.deepEqual(report.afterRemoval.skills, report.stock.skills); await stateCheck('all-uninstalled');
  assert.deepEqual(f.protocolErrors, []); report.finishedAt = new Date().toISOString(); report.passed = true; await persist();
});

if (mode === 'cold-0122') for (const order of [1, 2]) test('0.12.2 targeted cold HTTP scope and retained Pro sessions, order ' + order, { timeout: 750000, skip: !enabled }, async t => {
  assert.equal(hash(await readFile(omd.path)), omd.sha256); assert.equal(hash(await readFile(coldPatch.path)), coldPatch.sha256);
  const { f, out } = await nativeFixture(t, 'cold-0122-' + (process.env.OMD_A2_RECOMMENDED_COMBO_LABEL ?? 'current') + '-order-' + order); await prepareRecommended(f);
  const report = { order, baselineArtifact: omd, patchedArtifact: coldPatch, sourceSha256: hash(sourceBytes), startedAt: new Date().toISOString(), installations: [], queries: [], passed: false };
  const persist = () => writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.after(async () => { await writeFile(join(out, 'host.log'), f.log()); await persist(); });
  const all = order === 1 ? [{ id: 'omd', ...omd }, ...accepted] : [...accepted, { id: 'omd', ...omd }];
  for (const artifact of all) { const install = await interactiveCli(f, ['plugin', '--profile', f.profile, 'add', 'file:' + artifact.path]); report.installations.push({ id: artifact.id, install }); await persist(); assert.equal(install.ok, true, install.stderr); }
  await f.start(); report.warm = [];
  for (const preset of ['trisoul-x', 'omd-ptc']) { const result = await exercisePro(f, preset); assertNativeRead(result); report.warm.push(result); }
  const before = await f.request('/recommended-observer?session=' + report.warm[0].sessionId); report.before = before;
  const layerPath = join(f.home, 'profiles', f.profile, 'cordis.yml'), layer = await readFile(layerPath), patchPath = join(f.home, 'profiles', f.profile, 'cordis.patch.yml'), patch = await readFile(patchPath), projectPath = join(f.workspace, '.dsh/skills/saas-landing/SKILL.md');
  await f.stop(); report.upgrade = await interactiveCli(f, ['plugin', '--profile', f.profile, 'add', 'file:' + coldPatch.path]); assert.equal(report.upgrade.ok, true, report.upgrade.stderr); await persist();
  await f.start();
  for (const previous of report.warm) { const residency = await f.request('/recommended-observer?residency=' + previous.sessionId); assert.equal(residency.agentResident, false, 'Cold query must precede any native Agent hydration'); report.queries.push({ phase: 'cold-residency', preset: previous.preset, residency }); }
  // Query each saved session before any observer resolves it. This specifically
  // verifies the public HTTP path that previously inspected a root context.
  const normal = report.warm.find(row => row.preset === 'trisoul-x'), ptc = report.warm.find(row => row.preset === 'omd-ptc');
  const normalMode = await f.request('/trisoul-x/api/model-mode?session=' + normal.sessionId); assert.equal(normalMode.mode, 'pro'); assert.equal(normalMode.eligible, true); report.queries.push({ phase: 'first-cold-mode', preset: normal.preset, result: normalMode });
  const ptcSummary = await f.request('/trisoul-x/api/state?session=' + ptc.sessionId + '&view=summary'); assert.equal(ptcSummary.running, 'idle'); report.queries.push({ phase: 'first-cold-summary', preset: ptc.preset, result: ptcSummary });
  const ptcMode = await f.request('/trisoul-x/api/model-mode?session=' + ptc.sessionId); assert.equal(ptcMode.mode, 'pro'); assert.equal(ptcMode.eligible, true); report.queries.push({ phase: 'cold-mode-after-summary', preset: ptc.preset, result: ptcMode });
  const state = await f.request('/trisoul-x/api/state?session=' + normal.sessionId); assert.equal(state.route.provider, 'ecosystem'); assert.equal(state.route.model, 'ecosystem'); assert.equal(state.running, 'idle'); report.queries.push({ phase: 'cold-full-state', preset: normal.preset, result: state });
  report.resumed = [];
  for (const previous of report.warm) { const result = await exercisePro(f, previous.preset, previous.sessionId); assertNativeRead(result); if (previous.preset === 'omd-ptc') assert(result.requests.some(row => row.tools?.some(tool => tool.function.name === 'run_code'))); report.resumed.push(result); }
  report.after = await f.request('/recommended-observer?session=' + normal.sessionId); assert.equal(report.after.nativeToolRuntime, true); assert.deepEqual(report.after.tools, before.tools); assert.deepEqual(report.after.skills, before.skills);
  // Official a2 JSONL hydration normalizes an omitted root delegation depth to
  // zero. Preserve every other header field and require that exact normal form.
  assert.deepEqual(report.after.header, { ...before.header, delegationDepth: before.header.delegationDepth ?? 0 });
  report.nativeHeaderNormalization = { before: before.header, after: report.after.header, expectedRootDelegationDepth: 0 };
  for (const owner of ['trisoul_x', ...accepted.map(row => row.manifest.name)]) { const row = report.after.owners[owner]; assert(row); for (const [peer, value] of Object.entries(row.peers)) assert.equal(value.namespaceEqual, true, owner + ' ' + peer); }
  assert.deepEqual(await readFile(layerPath), layer); assert.deepEqual(await readFile(patchPath), patch); assert.equal(await readFile(projectPath, 'utf8'), projectSkill); assert.deepEqual(f.protocolErrors, []);
  report.exemptions = JSON.parse((await interactiveCli(f, ['plugin', '--profile', f.profile, 'version-exemptions'])).stdout); assert.deepEqual(report.exemptions, {});
  report.bundles = await f.rpc('pluginManager/listBundles'); assert.equal(report.bundles.find(row => row.name === 'trisoul_x').version, '0.2.1-alpha.2.omd.0.12.2');
  report.scope = 'Targeted c96 to ec34 upgrade: cold HTTP scope, persisted Pro modes, actual native read/skill/PTC resume, SDK identity and unchanged foreign metadata. Full UI/lifecycle matrix is the separately recorded c96 baseline.';
  report.passed = true; report.finishedAt = new Date().toISOString(); await persist();
});

if (mode === 'reject-recovery') for (const artifact of inventory.filter(row => ['omd-intent-assistant', 'dsh-turn-rewind'].includes(row.id))) test('original a2 rejection keeps stock state and CI transaction rolls back: ' + artifact.id, { timeout: 750000, skip: !enabled }, async t => {
  const { f, out } = await nativeFixture(t, 'ci-reject-' + artifact.id), target = artifact.nativeArchive ?? artifact;
  const profileManifest = join(f.home, 'profiles', f.profile, 'package.json');
  const before = await readFile(profileManifest); const report = { artifact, sourceSha256: hash(sourceBytes), CI: true, startedAt: new Date().toISOString(), rejected: false, rollback: false, stockRead: false, coldStockRead: false };
  const originalOut = join(evidence, 'stock-' + artifact.id), originalManifest = await readFile(join(originalOut, 'fixture-root/home/profiles/ecosystem/package.json'));
  assert.deepEqual(JSON.parse(originalManifest), JSON.parse(before), 'Original non-TTY failure must retain the stock profile manifest, not a rejected bundle');
  const originalDump = await run(process.execPath, [cli, '--profile', f.profile, '--dump-config'], { cwd: join(originalOut, 'fixture-root/workspace'), env: { ...cleanEnvironment(join(originalOut, 'fixture-root'), join(originalOut, 'fixture-root/home')), CI: 'true', NODE_OPTIONS: '' }, maxBuffer: 16 * 1024 * 1024 });
  await writeFile(join(out, 'original-non-CI-stock-dump.yml'), originalDump.stdout); report.originalFailedEntry = { stockManifestRetained: true, stockConfigResolved: true, rollbackWarning: 'Original diagnostics retained; node_modules rollback failed with non-TTY install environment.' };
  report.install = await interactiveCli(f, ['plugin', '--profile', f.profile, 'add', 'file:' + target.path]);
  assert.equal(report.install.ok, false); assert.equal(report.install.exitCode, 1); assert.match(report.install.stderr, /installation rejected.*incompatible with dsh 0\.2\.1-alpha\.2/);
  assert.doesNotMatch(report.install.stderr, /node_modules could not be reinstalled|run 'dsh plugin install'/); report.rejected = true;
  assert.deepEqual(await readFile(profileManifest), before); report.rollback = true;
  await f.start(); report.stockBundles = await f.rpc('pluginManager/listBundles'); assert(!report.stockBundles.some(row => row.name === artifact.manifest.name && row.installed));
  report.originalRead = await f.exercise('standard'); assertNativeRead(report.originalRead); report.stockRead = true;
  await f.stop(); await f.start(); report.coldRead = await f.exercise('standard'); assertNativeRead(report.coldRead); report.coldStockRead = true;
  assert.deepEqual(JSON.parse((await interactiveCli(f, ['plugin', '--profile', f.profile, 'version-exemptions'])).stdout), {});
  report.finishedAt = new Date().toISOString(); await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
});
