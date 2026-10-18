import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { defaultApprovalCard } from './fixtures/desktop-deny/navigation.mjs';
import { createWireProtocol, assertPending, assertWaitingApproval, assertDenied, disabledBackends, forbiddenMethods, provider as fixtureProvider, model as fixtureModel } from './fixtures/desktop-deny/protocol.mjs';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { desktopInputs, desktopIdentity, assertDesktopPaths, assertExternalBackends, digest, inside } from './fixtures/desktop-host-boot/inputs.mjs';
import { prepareEnvironment } from '../scripts/desktop-test-environment.mjs';
import { assertModelTakeover, modelPriority } from './fixtures/desktop-host-boot/model-panel.mjs';
import { assertClientIdentity, assertHostUiIdentity, assertBlankNavigation } from './fixtures/desktop-host-boot/client-identity.mjs';
import { cleanupFixture, closeFixtureServer } from './fixtures/process.mjs';

const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');
async function until(fn, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  do { const value = await fn(); if (value) return value; await delay(100); } while (Date.now() < deadline);
  throw Error('Desktop host boot timed out: ' + description);
}
const flattenSlots = rows => rows.flatMap(row => [row, ...flattenSlots(row.children)]);

// No skip, Linux UI fallback, real model endpoint, real application target or physical CU input.
test('official rc.2 Agent and real REA card decline one synthetic OpenCU target without physical input', { timeout: 360000 }, async t => {
  const inputs = await desktopInputs();
  inputs.sdkNames = [...inputs.sdkNames, '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop'];
  const root = await realpath(await mkdtemp(join(inputs.root, 'deny-')));
  const evidence = join(inputs.root, 'deny-evidence');
  const env = await prepareEnvironment(root), home = env.DSH_HOME;
  const profile = join(home, 'profiles', 'desktop'), workspace = join(root, 'workspace'), userData = join(root, 'electron-data');
  const trace = join(root, 'host-lifecycle.jsonl');
  let app, page, provider, cookie, origin, log = '', launchUncertain = false;
  const wire = createWireProtocol(), errors = [], providerRequests = wire.requests, externalRendererRequests = [], approvalResponses = [];
  const arm = join(root, 'armed-session.json'), dataDir = join(root, 'opencu');
  let armedSessionId;
  const report = { status: 'running', executed: 1, skipped: 0, cancelledForCleanup: false, phase: 'prepare', platform: process.platform, arch: process.arch,
    scope: 'Issue #64 real Agent/ToolRuntime/OpenCU/REA Deny path with a synthetic backend only; physical operations, grants, Web/WSL export and rc.1 pairing remain unverified',
    networkScope: 'Renderer routing begins after Electron launch; this is not process-wide network isolation or a zero-egress attestation',
    archive: { sha256: inputs.sha256, clientSha256: inputs.clientSha256, version: inputs.manifest.version },
    isolation: { root, home, profile, workspace, userData, modelEndpoint: 'fixture loopback only',
      externalBackends: disabledBackends, computerUseActions: 'Deny only; no physical input',
      nativeOsPathException: 'Disposable GitHub-hosted runner only: native OS home/logs are observed, not redirected. The official shell may prune/write its default native logs outside the fixture; native home account/config data is not used or copied.' },
    nativePathObservations: [],
    launches: [], shutdowns: [], checks: [], errors, providerRequests, externalRendererRequests, approvalResponses, providerFailures: wire.failures };
  const save = async () => writeFile(join(evidence, 'desktop-deny.json'), JSON.stringify(report, null, 2));
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
          if (armedSessionId && report.phase !== 'checks-complete' && app) {
            report.cancelledForCleanup = true;
            await rpc('session/cancel', { request: { sessionId: armedSessionId } });
          }
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
          assert(rows.filter(row => row.event === 'model-call').length <= 2);
          assert(providerRequests.length <= 2); assert.deepEqual(wire.failures, []);
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
  provider = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/chat/completions');
      assert.equal(req.headers.authorization, 'Bearer local-test-only');
      let body = ''; for await (const chunk of req) { body += chunk; assert(Buffer.byteLength(body) <= 8 * 1024 * 1024); }
      const frames = wire.respond(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(frames);
    } catch (error) {
      if (wire.failures.at(-1) !== error.message) wire.failures.push(error.message);
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((done, reject) => { provider.once('error', reject); provider.listen(0, '127.0.0.1', done); });
  const providerOrigin = `http://127.0.0.1:${provider.address().port}`;
  const probe = join(root, 'observer'); await mkdir(probe);
  for (const file of ['observer.mjs', 'protocol.mjs', 'http-observer.mjs']) await writeFile(join(probe, file), await readFile(new URL('./fixtures/desktop-deny/' + file, import.meta.url)));
  await writeFile(join(probe, 'client.js'), await readFile(new URL('./fixtures/desktop-host-boot/client.js', import.meta.url)));
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
    { id: 'session-title-llm', disabled: true },
    { id: 'llm-pi-ai', config: { providers: { [fixtureProvider]: { api: 'openai-completions', baseURL: providerOrigin + '/v1',
      apiKeyEnv: 'DESKTOP_HOST_FIXTURE', models: [{ id: fixtureModel, name: '隔离 Deny 验收（固定两次）', contextWindow: 1000000, maxTokens: 4096, input: ['text'] }] } } } },
    { id: 'agent-default-model', config: { provider: fixtureProvider, model: fixtureModel } },
    { id: 'trisoul-x', config: { componentAutoSetup: false, codegraphEnabled: false, backgroundTasksEnabled: false,
      dreamAutoEnabled: false, idlePreprocessEnabled: false, recommendedPluginsAutoUpdate: false,
      projectlessWorkspaceRoot: join(root, 'projectless'), dreamProvider: fixtureProvider, dreamModel: fixtureModel,
      unifiedBackground: { provider: fixtureProvider, model: fixtureModel, effort: 'off' } } },
    { id: 'omd-opencu', config: { ...disabledBackends, dataDir } },
    { id: 'sandbox-policy', config: { mode: 'read-only', workspaceRoot: workspace } },
    { id: 'approval', config: { policy: 'ask' } },
    { insert: [{ id: 'desktop-host-boot-observer', name: pathToFileURL(join(probe, 'observer.mjs')).href,
      config: { trace, root, sdkNames: inputs.sdkNames, arm, dataDir } }] },
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
    const value = await request('/__desktop-deny');
    report.responseObservation = value.responseObservation;
    assert.equal(value.responseObservation.source, 'host-http');
    assert.deepEqual(value.responseObservation.failures, []);
    assert(value.responseObservation.matches <= 1, 'Only one real matching approval response');
    approvalResponses.splice(0, approvalResponses.length, ...value.responseObservation.records);
    assert.deepEqual(value.rejectedModels, []); assert(value.modelCalls.length <= 2); assert(providerRequests.length <= 2); assert.deepEqual(wire.failures, []);
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
    const host = stage === 'installed' ? await until(async () => { const value = await observe(); return value.deny?.injected && value; }, 'synthetic backend injected before first controller start') : await observe();
    const titlePlugin = host.entries.filter(row => row.id === 'session-title-llm');
    assert.equal(titlePlugin.length, 1); assert.equal(titlePlugin[0].disabled, true); assert.equal(titlePlugin[0].active, false);
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
      assert.deepEqual(activation.filter(row => row.event !== 'model-call').map(row => row.event), ['ready', 'disposed', 'before-exit', 'exit'],
        'Every Host activation disposed and reached beforeExit; forceExit(0) is not a successful restart');
      assert.equal(activation.at(-2).rootDisposed, true); assert.equal(activation.at(-2).code, 0);
      assert.equal(activation.at(-1).code, 0); assert.equal(activation.at(-1).modelCalls, activation.filter(row => row.event === 'model-call').length);
      const counts = activation.at(-1).backendCalls;
      assert.deepEqual(activation.at(-1).credentialFiles, { bridge: false, pairings: false });
      if (counts) { for (const method of forbiddenMethods) assert.equal(counts[method], 0); assert(counts.close >= 1); }
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
    assertModelTakeover(model, stockPriority);
    assert.equal(slots.find(row => row.name === 'conversation.input.model.label').declaredBy, stockLabel.declaredBy,
      'Native rc.2 model label declaration retains its actual stock owner');
    const chat = slots.find(row => row.name === 'conversation.chat.node');
    for (const key of ['omd-task-injection', 'omd-btw']) assert(chat.occupants.some(row => row.key === key && row.active), 'Active OMD chat slot: ' + key);
    report.ui = ui;
    await page.screenshot({ path: join(evidence, 'installed-native-ui.png'), animations: 'disabled' });
    // Lock the real Session returned by the public controller before prompt admission.
    assert.equal(providerRequests.length, 0); assert.deepEqual(host.modelCalls, []);
    const config = await request('/api/opencu', { method: 'config', args: {} });
    assert.equal(config.ok, true);
    assert.deepEqual(Object.fromEntries(Object.keys(disabledBackends).map(key => [key, config.config[key]])), disabledBackends);
    await writeFile(arm, JSON.stringify({ sessionId: session.sessionId }), { flag: 'wx', mode: 0o600 });
    armedSessionId = session.sessionId;
    await rpc('session/selectModel', { request: { sessionId: armedSessionId, provider: fixtureProvider, model: fixtureModel } });
    const before = (await observe()).deny;
    assert.deepEqual(before.pending, []); assert.deepEqual(before.approvals.approvedApps, []);
    assert.deepEqual(before.selected, []); assert.deepEqual(before.authorizationFiles, { persisted: false, pending: false });
    assert.deepEqual(before.credentialFiles, { bridge: false, pairings: false });
    report.before = before;
    await rpc('session/prompt', { request: { sessionId: armedSessionId, requestId: randomUUID(), mode: 'queue',
      content: [{ type: 'text', text: 'OMD_DENY_LOCAL_FIXTURE_ONLY: request the single fixed synthetic target, then finish after denial.' }] } });
    const pendingState = await until(async () => { const value = await observe(); return value.deny.pending.length && value; }, 'one real application approval request');
    const pending = assertPending(pendingState.deny, armedSessionId); report.pending = pendingState;
    report.approvalDisplay = {};
    const approvalNavigation = await defaultApprovalCard(page, {
      sessionId: armedSessionId, pending,
      beforeObservation: async () => {
        const state = await observe();
        report.approvalDisplay.before = assertWaitingApproval(state, { sessionId: armedSessionId, pending, localModelRequests: wire.requests.length });
        await save();
      },
      afterObservation: async beforeCard => {
        report.approvalDisplay.beforeCard = beforeCard;
        await page.screenshot({ path: join(evidence, 'approval-default-visible.png'), animations: 'disabled' });
        const state = await observe();
        report.approvalDisplay.after = assertWaitingApproval(state, { sessionId: armedSessionId, pending, localModelRequests: wire.requests.length });
        await save();
      },
    });
    const { card } = approvalNavigation;
    Object.assign(report.approvalDisplay, approvalNavigation.evidence); await save();
    await card.getByText(`允许 OpenCU 使用 ${pending.request.appDisplayName}？`, { exact: true }).waitFor({ state: 'visible' });
    const deny = card.getByRole('button', { name: /^(?:拒绝|Deny)(?:\s.*)?$/ });
    await deny.waitFor({ state: 'visible' }); assert.equal(await deny.count(), 1);
    await page.screenshot({ path: join(evidence, 'approval-pending.png'), animations: 'disabled' });
    await deny.click(); // The real REA action is the only approval response producer.
    await card.waitFor({ state: 'detached' });
    const settled = await until(async () => {
      const value = await observe();
      return value.deny.agent?.status === 'idle' && value.deny.events.some(row => row.type === 'turn/end') && value;
    }, 'natural completed turn after the real Deny action', 60000);
    await until(async () => { await observe(); return approvalResponses.length === 1; }, 'one finished host-http real response');
    assert.equal(approvalResponses[0].source, 'host-http');
    assert.equal(approvalResponses[0].requestComplete, true); assert.equal(approvalResponses[0].readableEnded, true);
    assert.equal(approvalResponses[0].responseFinished, true);
    assert.equal(approvalResponses[0].status, 200);
    assertDenied({ ...settled.deny, modelCalls: settled.modelCalls, rejectedModels: settled.rejectedModels }, {
      sessionId: armedSessionId, requestId: pending.id, response: approvalResponses[0], wire,
    });
    assert.equal(await card.count(), 0); assert.equal(approvalResponses.length, 1);
    const selected = (await page.evaluate(() => window.__OMD_DESKTOP_HOST_BOOT__())).navigation;
    assert.equal(selected.sessionId, armedSessionId); assert.equal(selected.boundSessionId, armedSessionId);
    assert.equal(selected.agentPreset, 'trisoul-x'); assert.equal(selected.running, false); assert(selected.mainViewReferences > 0);
    await page.screenshot({ path: join(evidence, 'approval-denied.png'), animations: 'disabled' });
    report.denied = settled;
    report.counts = { localModelRequests: wire.requests.length, toolCalls: settled.deny.events.filter(row => row.type === 'tool/call').length,
      externalModelRequests: settled.rejectedModels.length, physicalInputs: forbiddenMethods.reduce((sum, key) => sum + settled.deny.calls[key], 0) };
    await close();
    assert.deepEqual(errors, []); assert.equal(providerRequests.length, 2); assert.deepEqual(wire.failures, []);
    assert.equal(report.launches.length, 2); assert.equal(report.shutdowns.length, 2);
    report.checks = ['official-rc2-identities', 'dsh-app-renderer', 'frozen-tgz-installed', 'natural-cold-restart',
      'uiConversation-definitions', 'omd-model-priority-takeover-and-visible-button', 'four-real-backends-disabled', 'real-agent-and-tool-runtime', 'unique-default-visible-rea-card-in-viewport', 'same-session-and-pending-uuid', 'real-rea-deny-response', 'naturally-completed', 'local-model-requests-two', 'physical-inputs-zero'];
    report.phase = 'checks-complete';
  } catch (error) { report.status = 'failed'; report.failure = redact(error.stack ?? error.message); throw error; }
});
