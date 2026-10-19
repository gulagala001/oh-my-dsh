import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { desktopInputs, desktopIdentity, assertDesktopPaths, assertExternalBackends, digest, inside } from './fixtures/desktop-host-boot/inputs.mjs';
import { prepareEnvironment } from '../scripts/desktop-test-environment.mjs';
import { assertComputerBrowserPanel } from './fixtures/desktop-host-boot/settings-panel.mjs';
import { assertNativeModelSeat, modelPriority } from './fixtures/desktop-host-boot/model-panel.mjs';
import { assertClientIdentity, assertHostUiIdentity, assertBlankNavigation } from './fixtures/desktop-host-boot/client-identity.mjs';
import { cleanupFixture, closeFixtureServer } from './fixtures/process.mjs';

const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');
async function until(fn, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  do { const value = await fn(); if (value) return value; await delay(100); } while (Date.now() < deadline);
  throw Error('Desktop host boot timed out: ' + description);
}
const flattenSlots = rows => rows.flatMap(row => [row, ...flattenSlots(row.children)]);

// Intentionally no skip, Linux fallback, model prompts, CU actions or account sign-in.
test('official rc.2 Desktop installs frozen OMD and cold-boots its real UI with zero model calls', { timeout: 360000 }, async t => {
  const inputs = await desktopInputs();
  const root = await realpath(await mkdtemp(join(inputs.root, 'host-boot-')));
  const evidence = join(inputs.root, 'host-boot-evidence');
  const env = await prepareEnvironment(root), home = env.DSH_HOME;
  const profile = join(home, 'profiles', 'desktop'), workspace = join(root, 'workspace'), userData = join(root, 'electron-data');
  const trace = join(root, 'host-lifecycle.jsonl');
  let app, page, provider, cookie, origin, log = '', launchUncertain = false;
  const errors = [], providerRequests = [], externalRendererRequests = [];
  const report = { status: 'running', executed: 1, skipped: 0, phase: 'prepare', platform: process.platform, arch: process.arch,
    scope: 'rc.2 UI boot, bundle install and cold restart only; #54 rc.1 pairing and #64 native CU remain unverified',
    networkScope: 'Renderer routing begins after Electron launch; this is not process-wide network isolation or a zero-egress attestation',
    archive: { sha256: inputs.sha256, clientSha256: inputs.clientSha256, version: inputs.manifest.version },
    isolation: { root, home, profile, workspace, userData, modelEndpoint: 'fixture loopback only',
      externalBackends: { browserEnabled: false, nativeEnabled: false, extensionEnabled: false }, computerUseActions: 'not-exercised',
      nativeOsPathException: 'Disposable GitHub-hosted runner only: native OS home/logs are observed, not redirected. The official shell may prune/write its default native logs outside the fixture; native home account/config data is not used or copied.' },
    nativePathObservations: [],
    launches: [], shutdowns: [], checks: [], errors, providerRequests, externalRendererRequests };
  const save = async () => writeFile(join(evidence, 'desktop-host-boot.json'), JSON.stringify(report, null, 2));
  const lifecycle = async () => (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  await mkdir(evidence, { mode: 0o700 });
  // Cleanup remains registered before the first process/server is created.
  // A rejected close keeps app set and prevents deleting its live profile.
  t.after(async () => {
    try {
      await cleanupFixture([
        async () => {
          await writeFile(join(evidence, 'desktop-log.txt'), redact(log));
          if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'failure.png') });
        },
        async () => {
          if (!app) return;
          const process = app.process();
          await app.close();
          assert.equal(process.exitCode, 0, 'Failure cleanup did not exit successfully; retain its profile');
          assert.equal(process.signalCode, null, 'Forced Playwright cleanup is a failure, never a graceful restart');
          app = undefined;
        },
        async () => { if (provider) await closeFixtureServer(provider); },
        async () => {
          assert(!app, 'Never delete userData beneath an unclosed Desktop');
          assert(!launchUncertain, 'Retain the profile after an Electron launch rejection with no process handle');
          const rows = await lifecycle(); report.lifecycle = rows;
          assert.equal(rows.filter(row => row.event === 'model-call').length, 0);
          assert.equal(providerRequests.length, 0, 'Local provider must receive zero requests');
          assert.equal(await realpath(root), root); assert(inside(inputs.root, root) && root !== inputs.root);
          // Host exit records are required even after a failed Electron boot.
          for (const ready of rows.filter(row => row.event === 'ready'))
            assert(rows.some(row => row.bootId === ready.bootId && row.event === 'exit'), 'Retain files for a Host without exit evidence');
          await rm(root, { recursive: true, force: false }); report.cleanup = { removed: true };
        },
      ]);
      report.status = report.phase === 'checks-complete' ? 'passed' : 'failed';
    } catch (error) {
      report.status = 'failed'; report.cleanup = { removed: false, error: redact(error.message) }; throw error;
    } finally { await save(); }
  });
  for (const path of [profile, workspace, userData]) await mkdir(path, { recursive: true });
  await writeFile(trace, '');
  provider = createServer((req, res) => {
    providerRequests.push({ method: req.method, path: new URL(req.url, 'http://localhost').pathname });
    req.resume(); res.writeHead(500); res.end('Model requests forbidden in desktop boot acceptance');
  });
  await new Promise((done, reject) => { provider.once('error', reject); provider.listen(0, '127.0.0.1', done); });
  const providerOrigin = `http://127.0.0.1:${provider.address().port}`;
  const probe = join(root, 'observer'); await mkdir(probe);
  for (const file of ['observer.mjs', 'client.js']) await writeFile(join(probe, file), await readFile(new URL('./fixtures/desktop-host-boot/' + file, import.meta.url)));
  await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'omd-desktop-host-boot-observer', version: '1.0.0', private: true, type: 'module',
    exports: { '.': './observer.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-modules', '@deepseek-ai/dsh-client-ui-renderer'] } } }));
  // rc.2 order: bundle -> profile patch -> home patch. The final HOME layer
  // restores restrictive defaults after OMD's bundle defaults on every boot.
  // In rc.2 approval 'never' rejects; it does not auto-approve requests.
  await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { id: 'locale', config: { preference: 'zh' } },
    { id: 'product-analytics', config: { enabled: false } },
    { id: 'session-telemetry-otel', config: { mode: 'DISABLED' } },
    { id: 'llm-deepseek', disabled: true },
    { id: 'llm-pi-ai', config: { providers: { 'desktop-host-fixture': { api: 'openai-completions', baseURL: providerOrigin + '/v1',
      apiKeyEnv: 'DESKTOP_HOST_FIXTURE', models: [{ id: 'fixture', name: '隔离启动验收（禁止调用）', contextWindow: 1000000, maxTokens: 4096, input: ['text'] }] } } } },
    { id: 'agent-default-model', config: { provider: 'desktop-host-fixture', model: 'fixture' } },
    { id: 'trisoul-x', config: { componentAutoSetup: false, codegraphEnabled: false, backgroundTasksEnabled: false,
      dreamAutoEnabled: false, idlePreprocessEnabled: false, recommendedPluginsAutoUpdate: false,
      projectlessWorkspaceRoot: join(root, 'projectless'), dreamProvider: 'desktop-host-fixture', dreamModel: 'fixture',
      unifiedBackground: { provider: 'desktop-host-fixture', model: 'fixture', effort: 'off' } } },
    { id: 'omd-opencu', config: { browserEnabled: false, nativeEnabled: false, extensionEnabled: false, dataDir: join(root, 'opencu') } },
    { id: 'sandbox-policy', config: { mode: 'read-only', workspaceRoot: workspace } },
    { id: 'approval', config: { policy: 'ask' } },
    { insert: [{ id: 'desktop-host-boot-observer', name: pathToFileURL(join(probe, 'observer.mjs')).href,
      config: { trace, root, sdkNames: inputs.sdkNames } }] },
  ]));
  // No settings.yaml, credential store, external credential creation or remote login.
  const request = async (path, body) => {
    assert(origin && cookie);
    const response = await fetch(origin + path, { redirect: 'error', headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(180000), ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const value = await response.json(); assert.equal(response.status, 200, path + ': ' + JSON.stringify(value)); return value;
  };
  const rpc = async (method, args = {}) => {
    const value = await request('/api/' + method, { type: 'client-request', rpcId: randomUUID(), method, payload: { args } });
    assert.equal(value.result?.ok, true, method + ': ' + JSON.stringify(value)); return value.result.value;
  };
  const observe = async () => {
    const value = await request('/__desktop-host-boot');
    assert.deepEqual(value.modelCalls, []); assert.equal(providerRequests.length, 0);
    assert.equal(value.profile, profile); assert.equal(value.sandbox.mode, 'read-only'); assert.equal(value.approval, 'ask');
    assert.equal(value.environmentHome, env.HOME); assert.equal(value.nodeHome, env.HOME);
    assert.equal(value.dshHome, home); assert.equal(value.profileHome, home);
    assert.equal(value.shellVersion, inputs.hostVersion, 'Actual shell build version passed to desktop-host');
    for (const name of inputs.sdkNames) {
      assert.equal(value.sdk[name]?.version, inputs.hostVersion, 'Real desktop-host SDK: ' + name);
      assert(inside(inputs.appRoot, value.sdk[name].dir) || inside(inputs.appRoot + '.unpacked', value.sdk[name].dir), 'Host SDK remains in official resources');
    }
    return value;
  };
  const launch = async stage => {
    assert(!app, 'Complete previous shutdown before relaunch');
    assert.equal(digest(await readFile(inputs.archive)), inputs.sha256);
    const { _electron } = await import('playwright');
    try {
      app = await _electron.launch({ executablePath: inputs.executablePath, cwd: workspace, env, timeout: 60000,
        args: ['--user-data-dir=' + userData, '--password-store=basic', ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])] });
    } catch (error) { launchUncertain = true; throw error; }
    for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', chunk => { log += redact(chunk); });
    const identity = await app.evaluate(desktopIdentity, { ...inputs, publicComponents: inputs.manifest.dsh.client.inject,
      cordisVersion: inputs.manifest.peerDependencies['@deepseek-ai/cordis'] });
    report.nativePathObservations.push({ pid: app.process().pid, nativeHome: identity.nativeHome, nativeLogs: identity.nativeLogs,
      environmentHome: identity.environmentHome, nodeHome: identity.nodeHome, dshHome: identity.dshHome, userData: identity.userData });
    await save();
    assert.equal(await realpath(identity.executable), inputs.executablePath);
    const nativePathLocations = assertDesktopPaths(identity, { root, home: env.HOME, dshHome: home, userData });
    assert.equal(identity.appVersion, inputs.hostVersion); assert(identity.electron);
    assert.equal(digest(await readFile(inputs.executablePath)), inputs.executableSha256);
    app.context().on('page', candidate => candidate.on('pageerror', error => errors.push(redact(error.message))));
    page = await until(() => app.windows().find(candidate => candidate.url().startsWith('dsh-app://app/')), 'native app window', 60000);
    page.on('pageerror', error => errors.push(redact(error.message))); page.setDefaultTimeout(20000);
    page.on('console', message => { if (message.type() === 'error') log += '\nRenderer: ' + redact(message.text()); });
    origin = await page.evaluate(async () => (await window.dshDesktopBoot.ready()).streamBaseUrl);
    const url = new URL(origin); assert.equal(url.hostname, '127.0.0.1'); assert.notEqual(url.port, '19387');
    cookie = await app.evaluate(async ({ session }, origin) => (await session.defaultSession.cookies.get({ url: origin })).map(row => row.name + '=' + row.value).join('; '), origin);
    assert(cookie, 'Use this boot\'s authenticated loopback cookie');
    await app.context().route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['dsh-app:', 'data:', 'blob:'].includes(url.protocol) || url.origin === origin) await route.continue();
      else { externalRendererRequests.push({ origin: url.origin, path: url.pathname }); await route.abort(); }
    });
    await page.getByText('更多', { exact: true }).waitFor();
    await until(() => page.evaluate(() => Boolean(window.__OMD_DESKTOP_HOST_BOOT__)), 'real client registry observer');
    const host = await observe();
    const bundleRoot = stage === 'installed' ? await realpath(join(profile, 'node_modules', 'trisoul_x')) : undefined;
    assertHostUiIdentity(host, { stage, bundleRoot, omdVersion: inputs.manifest.version });
    const client = await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__());
    assertClientIdentity(client.identity, { stage, appVersion: identity.appVersion, hostVersion: inputs.hostVersion,
      publicComponents: inputs.manifest.dsh.client.inject });
    report.launches.push({ stage, pid: app.process().pid, identity, nativePathLocations, clientIdentity: client.identity, host });
    await save();
  };
  const close = async () => {
    const child = app.process(), host = await observe();
    // Ask the official app to quit and wait before calling Playwright.close().
    // Its force-kill fallback cannot produce a successful cold-restart record.
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 0); });
    await until(() => child.exitCode !== null || child.signalCode !== null, 'natural Electron exit', 30000);
    assert.equal(child.exitCode, 0); assert.equal(child.signalCode, null);
    const rows = await lifecycle(), owned = rows.filter(row => row.pid === host.pid);
    assert.equal(owned.filter(row => row.event === 'termination-signal').length, 0, 'Host received no termination signal');
    for (const ready of owned.filter(row => row.event === 'ready')) {
      const activation = owned.filter(row => row.bootId === ready.bootId);
      assert.deepEqual(activation.map(row => row.event), ['ready', 'disposed', 'before-exit', 'exit'],
        'Every Host activation disposed and reached beforeExit; forceExit(0) is not a successful restart');
      assert.equal(activation.at(-2).rootDisposed, true); assert.equal(activation.at(-2).code, 0);
      assert.equal(activation.at(-1).code, 0); assert.equal(activation.at(-1).modelCalls, 0);
    }
    await app.close(); app = undefined; page = undefined;
    report.shutdowns.push({ pid: child.pid, hostPid: host.pid, exitCode: child.exitCode, signalCode: child.signalCode, naturalExit: true });
    await save();
  };
  try {
    await launch('stock'); report.phase = 'stock-boot';
    const stockUI = await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__());
    const stockSlots = flattenSlots(stockUI.slots);
    const stockPriority = modelPriority(stockSlots.find(row => row.name === 'conversation.input.model'));
    report.stockModelPriority = stockPriority;
    const stockLabel = stockSlots.find(row => row.name === 'conversation.input.model.label');
    assert(stockLabel?.declaredBy, 'Verified rc.2 stock model label owner'); report.stockUI = stockUI;
    const installed = await rpc('pluginManager/installBundle', { spec: 'file:' + inputs.archive });
    assert(['applied', 'restart-required'].includes(installed.application), JSON.stringify(installed));
    assert.equal(installed.changed, true, 'The official manager changed the new profile'); report.install = installed;
    const dependency = JSON.parse(await readFile(join(profile, 'package.json')));
    assert(dependency.dependencies.trisoul_x, 'Real package-manager installation persisted');
    await close();
    await launch('installed'); report.phase = 'installed-boot';
    assert.notEqual(report.launches[0].pid, report.launches[1].pid);
    assert.notEqual(report.launches[0].host.pid, report.launches[1].host.pid);
    assert.equal(await page.locator('[data-omd-desktop-restart]').count(), 0);
    const installedRoot = await realpath(join(profile, 'node_modules', 'trisoul_x'));
    assert(inside(profile, installedRoot), 'Use the installed tgz, never a link to checkout');
    assert.equal(JSON.parse(await readFile(join(installedRoot, 'package.json'))).version, inputs.manifest.version);
    assert.equal(digest(await readFile(join(installedRoot, 'lib', 'client.js'))), inputs.clientSha256);
    const compatibility = await readFile(join(profile, 'compatibility.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    assert(!compatibility.includes('trisoul_x'), 'No SDK compatibility exemption');
    const host = await observe();
    assertExternalBackends(host.opencu);
    for (const name of ['trisoul_x', 'trisoul_x/opencu', 'trisoul_x/host/ui-conversation', 'trisoul_x/host/ui-chat'])
      assert(host.entries.some(row => row.name === name && row.active), 'Active real host entry: ' + name);
    const registered = await rpc('workspace/create', { request: { path: workspace } });
    const session = await rpc('session/create', { request: { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' } });
    assert(session.sessionId, 'Create a synthetic empty session without prompting');
    await page.evaluate(id => window.__OMD_DESKTOP_OPEN_SESSION__(id), session.sessionId);
    const expectedNavigation = { sessionId: session.sessionId, agentPreset: 'trisoul-x', cwd: workspace };
    const navigation = await until(async () => {
      const state = (await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__())).navigation;
      return state.sessionId === session.sessionId && state.openState === 'open' && state.agentPreset === 'trisoul-x' && state;
    }, 'real blank Session selection and preset');
    assertBlankNavigation(navigation, expectedNavigation); report.navigation = { afterOpen: navigation };
    await page.locator('[data-composer-input]').waitFor();
    await page.getByRole('button', { name: /^模型与思考强度(?:：.+)?$/ }).waitFor({ state: 'visible' });
    assertBlankNavigation((await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__())).navigation, expectedNavigation);
    await page.getByRole('button', { name: '关于 Oh My DSH', exact: true }).click();
    const about = page.getByRole('dialog', { name: '关于 Oh My DSH' });
    await until(async () => await about.getByTestId('omd-current-version').innerText() === inputs.manifest.version, 'matching real client/server version');
    assert.doesNotMatch(await about.innerText(), /服务已更新，当前界面仍为/, 'Loaded client build version matches the installed candidate');
    await about.getByRole('button', { name: '关闭版本信息' }).click();
    const ui = await until(async () => {
      const value = await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__?.());
      return value?.events.some(row => row.kind === 'omd-task-injection') && value.events.some(row => row.kind === 'omd-btw') && value;
    }, 'OMD uiConversation business definitions');
    assert(ui.views.includes('chat'));
    for (const entry of ui.entries) assert.equal(entry.state, 2, 'Real client Loader entry is active: ' + entry.name);
    const slots = flattenSlots(ui.slots);
    for (const name of ['conversation.input.model', 'conversation.input.model.label', 'conversation.chat.node', 'settings.section'])
      assert.equal(slots.filter(row => row.name === name).length, 1, 'Single declared slot: ' + name);
    const model = slots.find(row => row.name === 'conversation.input.model');
    assertNativeModelSeat(model, stockPriority);
    assert.equal(slots.find(row => row.name === 'conversation.input.model.label').declaredBy, stockLabel.declaredBy,
      'Native rc.2 model label declaration retains its actual stock owner');
    const chat = slots.find(row => row.name === 'conversation.chat.node');
    for (const key of ['omd-task-injection', 'omd-btw']) assert(chat.occupants.some(row => row.key === key && row.active), 'Active OMD chat slot: ' + key);
    report.ui = ui;
    await page.screenshot({ path: join(evidence, 'installed-native-ui.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '设置', exact: true }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('button', { name: '电脑与浏览器', exact: true }).waitFor();
    await settings.getByRole('button', { name: '电脑与浏览器', exact: true }).click();
    report.settings = await assertComputerBrowserPanel(settings);
    await settings.getByText('Chrome / Edge 连接', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, 'computer-settings-disabled.png'), animations: 'disabled' });
    await settings.getByRole('switch', { name: '启用托管浏览器', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, 'browser-settings-disabled.png'), animations: 'disabled' });
    report.navigation.afterSettings = (await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__())).navigation;
    assertBlankNavigation(report.navigation.afterSettings, expectedNavigation);
    await close();
    assert.deepEqual(errors, []); assert.equal(providerRequests.length, 0);
    assert.equal(report.launches.length, 2); assert.equal(report.shutdowns.length, 2);
    report.checks = ['official-rc2-identities', 'dsh-app-renderer', 'frozen-tgz-installed', 'natural-cold-restart',
      'uiConversation-definitions', 'native-model-seat-and-visible-omd-panel', 'combined-computer-browser-panel-visible-and-switches-explicitly-off',
      'three-external-backends-disabled-no-cu-actions', 'model-calls-zero'];
    report.phase = 'checks-complete';
  } catch (error) { report.status = 'failed'; report.failure = redact(error.stack ?? error.message); throw error; }
});
