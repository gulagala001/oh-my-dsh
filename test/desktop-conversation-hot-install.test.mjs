import { classifyShutdownErrors } from './fixtures/conversation-hot-install/shutdown-errors.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { assertLiveErrors, readSnapshotWithLiveErrors } from './fixtures/conversation-hot-install/live-errors.mjs';
import { createResourceDiagnostics } from './fixtures/conversation-hot-install/resources.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { desktopInputs, desktopIdentity, assertDesktopPaths, digest, inside, pins } from './fixtures/conversation-hot-install/inputs.mjs';
import { prepareEnvironment } from './fixtures/conversation-hot-install/environment.mjs';
import { assertStage, assertReceipt, assertNaturalShutdown, stockBaseline } from './fixtures/conversation-hot-install/contract.mjs';
import { persistReceipt, printDiagnosticSummary } from './fixtures/conversation-hot-install/diagnostics.mjs';
import { cleanupFixture, closeFixtureServer } from './fixtures/process.mjs';

const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');
async function until(fn, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  do { const value = await fn(); if (value) return value; await delay(100); } while (Date.now() < deadline);
  throw Error('Desktop host boot timed out: ' + description);
}

// Intentionally no skip, Linux fallback, model prompts, CU actions or account sign-in.
test('official rc2 arm64 hot-installs the candidate with an already-selected blank session and zero prompts', { timeout: 720000 }, async t => {
  const inputs = await desktopInputs();
  const root = await realpath(await mkdtemp(join(inputs.root, 'conversation-hot-')));
  const evidence = join(inputs.root, 'conversation-hot-evidence');
  const env = await prepareEnvironment(root), home = env.DSH_HOME;
  const profile = join(home, 'profiles', 'desktop'), workspace = join(root, 'workspace'), userData = join(root, 'electron-data');
  const trace = join(root, 'host-lifecycle.jsonl');
  let currentStage, app, page, provider, cookie, origin, log = '', launchUncertain = false;
  const errors = [], errorEvents = [], providerRequests = [], externalRendererRequests = [];
  const report = { status: 'running', executed: 1, skipped: 0, phase: 'prepare', platform: process.platform, arch: process.arch,
    scope: '#54 rc2/mac-arm64 selected-session hot installation only; frozen rc1 package failure baseline remains separate; no #64 CU or Windows attestation',
    networkScope: 'Renderer routing begins after Electron launch; this is not process-wide network isolation or a zero-egress attestation',
    archive: { sha256: inputs.sha256, clientSha256: inputs.clientSha256, version: inputs.manifest.version, helperModes: inputs.helperModes },
    isolation: { root, home, profile, workspace, userData, modelEndpoint: 'fixture loopback only',
      externalBackends: { browserEnabled: false, nativeEnabled: false, extensionEnabled: false }, computerUseActions: 'not-exercised',
      nativeOsPathException: 'Disposable GitHub-hosted runner only: native OS home/logs are observed, not redirected. The official shell may prune/write its default native logs outside the fixture; native home account/config data is not used or copied.' },
    nativePathObservations: [],
    launches: [], stages: [], receipts: [], diagnostics: [], shutdowns: [], checks: [], errors, errorEvents, providerRequests, externalRendererRequests };
  const resources = createResourceDiagnostics({ now: () => performance.now() });
  const recordError = (source, message, resourceSequence) => { const text = redact(message); errors.push(text); errorEvents.push({ source, message: text, resourceSequence }); };
  const save = async () => { report.resources = resources.snapshot(); await writeFile(join(evidence, 'conversation-hot-install.json'), JSON.stringify(report, null, 2)); };
  const lifecycle = async () => (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  let hostPoll, hostReadFailures = 0;
  const receivedHost = new Set();
  const pollHost = async () => {
    try {
      // Host Date.now fields are not compared with this process's monotonic clock.
      const text = await readFile(trace, 'utf8');
      for (const line of text.split('\n').slice(0, -1).filter(Boolean)) {
        const row = JSON.parse(line), key = row.bootId + ':' + row.event;
        if (!['before-exit', 'exit'].includes(row.event) || receivedHost.has(key)) continue;
        receivedHost.add(key);
        resources.mark(row.event === 'before-exit' ? 'host-before-exit-received' : 'host-exit-received', { pid: row.pid });
      }
    } catch (error) { hostReadFailures++; } // Missing/partially written trace is retried; lifecycle assertions remain authoritative.
  };
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
          resources.mark('cleanup-app-close-before');
          await app.close(); resources.mark('cleanup-app-close-returned');
          assert.equal(process.exitCode, 0, 'Failure cleanup did not exit successfully; retain its profile');
          assert.equal(process.signalCode, null, 'Forced Playwright cleanup is a failure, never a graceful restart');
          app = undefined;
        },
        async () => { if (provider) await closeFixtureServer(provider); },
        async () => {
          assert(!app, 'Never delete userData beneath an unclosed Desktop');
          assert(!launchUncertain, 'Retain the profile after an Electron launch rejection with no process handle');
          await pollHost(); clearInterval(hostPoll);
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
    } finally { clearInterval(hostPoll); report.hostTraceReadFailures = hostReadFailures; resources.flush(); await save(); }
  });
  for (const path of [profile, workspace, userData]) await mkdir(path, { recursive: true });
  await writeFile(trace, '');
  hostPoll = setInterval(() => { void pollHost(); }, 50); hostPoll.unref();
  provider = createServer((req, res) => {
    providerRequests.push({ method: req.method, path: new URL(req.url, 'http://localhost').pathname });
    req.resume(); res.writeHead(500); res.end('Model requests forbidden in desktop boot acceptance');
  });
  await new Promise((done, reject) => { provider.once('error', reject); provider.listen(0, '127.0.0.1', done); });
  const providerOrigin = `http://127.0.0.1:${provider.address().port}`;
  const probe = join(root, 'observer'); await mkdir(probe);
  for (const file of ['observer.mjs', 'client.js']) await writeFile(join(probe, file), await readFile(new URL('./fixtures/conversation-hot-install/' + file, import.meta.url)));
  await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'omd-desktop-conversation-hot-observer', version: '1.0.0', private: true, type: 'module',
    exports: { '.': './observer.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-modules', '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-api-session-controller'] } } }));
  // Official profile order: bundle -> profile patch -> home patch. The final HOME layer
  // restores restrictive defaults after OMD's bundle defaults on every boot.
  // Approval 'never' rejects; it does not auto-approve requests.
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
    { insert: [{ id: 'desktop-conversation-hot-observer', name: pathToFileURL(join(probe, 'observer.mjs')).href,
      config: { trace, root, sdkNames: inputs.sdkNames } }] },
  ]));
  // No settings.yaml, credential store, external credential creation or remote login.
  const request = async (path, body, timeout = 180000) => {
    assert(origin && cookie);
    const response = await fetch(origin + path, { redirect: 'error', headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeout), ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const value = await response.json(); assert.equal(response.status, 200, path + ': ' + JSON.stringify(value)); return value;
  };
  const rpc = async (method, args = {}) => {
    const value = await request('/api/' + method, { type: 'client-request', rpcId: randomUUID(), method, payload: { args } });
    assert.equal(value.result?.ok, true, method + ': ' + JSON.stringify(value)); return value.result.value;
  };
  const observe = async () => {
    const value = await request('/__conversation-hot-install');
    resources.allowModules(value.clientGraph?.entries);
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
    assert(!app, 'Complete previous shutdown before relaunch'); currentStage = stage; resources.mark('launch');
    assert.equal(digest(await readFile(inputs.archive)), inputs.sha256);
    const { _electron } = await import('playwright');
    try {
      app = await _electron.launch({ executablePath: inputs.executablePath, cwd: workspace, env, timeout: 60000,
        args: ['--user-data-dir=' + userData, '--password-store=basic', ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])] });
    } catch (error) { launchUncertain = true; throw error; }
    const electron = app.process();
    electron.once('exit', () => resources.mark('electron-exit', { pid: electron.pid }));
    let markerBuffer = '', quitMarkerSeen = false;
    for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', chunk => {
      log += redact(chunk); markerBuffer = (markerBuffer + String(chunk)).slice(-2048);
      if (!quitMarkerSeen && markerBuffer.includes('OMD_HOT_QUIT_ISSUED')) {
        quitMarkerSeen = true; resources.mark('quit-issued-received');
      }
    });
    const identity = await app.evaluate(desktopIdentity, { ...inputs, publicComponents: inputs.manifest.dsh.client.inject,
      cordisVersion: inputs.manifest.peerDependencies['@deepseek-ai/cordis'] });
    resources.allowStaticPaths(identity.staticPaths);
    report.nativePathObservations.push({ pid: app.process().pid, nativeHome: identity.nativeHome, nativeLogs: identity.nativeLogs,
      environmentHome: identity.environmentHome, nodeHome: identity.nodeHome, dshHome: identity.dshHome, userData: identity.userData });
    await save();
    assert.equal(await realpath(identity.executable), inputs.executablePath);
    const nativePathLocations = assertDesktopPaths(identity, { root, home: env.HOME, dshHome: home, userData });
    assert.equal(identity.appVersion, inputs.hostVersion); assert(identity.electron);
    assert.equal(digest(await readFile(inputs.executablePath)), inputs.executableSha256);
    app.context().on('page', candidate => candidate.on('pageerror', error => recordError('pageerror', error.message)));
    page = await until(() => app.windows().find(candidate => candidate.url().startsWith('dsh-app://app/')), 'native app window', 60000);
    page.on('request', request => resources.request({ key: request, url: request.url(), method: request.method(), type: request.resourceType(),
      readBody: () => request.postData() }));
    page.on('response', response => resources.response({ key: response.request(), url: response.url(), status: response.status(),
      method: response.request().method(), type: response.request().resourceType() }));
    page.on('requestfailed', request => resources.failed({ key: request, url: request.url(), errorText: request.failure()?.errorText,
      method: request.method(), type: request.resourceType() }));
    page.on('close', () => resources.pageEvent('page-close'));
    page.on('crash', () => resources.pageEvent('page-crash'));
    page.on('pageerror', error => recordError('pageerror', error.message)); page.setDefaultTimeout(20000);
    page.on('console', message => { if (message.type() === 'error') { const sequence = resources.consoleError(message.location()); recordError('console', message.text(), sequence); log += '\nRenderer: ' + redact(message.text()); } });
    origin = await page.evaluate(async () => (await window.dshDesktopBoot.ready()).streamBaseUrl);
    resources.setLoopback(origin);
    const url = new URL(origin); assert.equal(url.hostname, '127.0.0.1'); assert.notEqual(url.port, '19387');
    cookie = await app.evaluate(async ({ session }, origin) => (await session.defaultSession.cookies.get({ url: origin })).map(row => row.name + '=' + row.value).join('; '), origin);
    assert(cookie, 'Use this boot\'s authenticated loopback cookie');
    await app.context().route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['dsh-app:', 'data:', 'blob:'].includes(url.protocol) || url.origin === origin) await route.continue();
      else { externalRendererRequests.push({ origin: url.origin, path: url.pathname }); await route.abort(); }
    });
    await page.getByText('更多', { exact: true }).waitFor();
    await until(() => page.evaluate(() => Boolean(window.__OMD_HOT_SLOTS__)), 'real client registry observer');
    const host = await observe();
    report.launches.push({ stage, pid: app.process().pid, identity, nativePathLocations, hostPid: host.pid });
    await save();
  };
  const close = async () => {
    const child = app.process(), host = await observe();
    // Ask the official app to quit and wait before calling Playwright.close().
    // Its force-kill fallback cannot produce a successful cold-restart record.
    assertLiveErrors(errors, 'before-quit');
    resources.mark('quit-before');
    await app.evaluate(({ app }) => { setTimeout(() => { console.log('OMD_HOT_QUIT_ISSUED'); app.quit(); }, 0); });
    resources.mark('quit-evaluation-returned');
    await until(() => child.exitCode !== null || child.signalCode !== null, 'natural Electron exit', 30000);
    await pollHost();
    assert.equal(child.exitCode, 0); assert.equal(child.signalCode, null);
    assertNaturalShutdown(await lifecycle(), host.pid); resources.mark('exit-verified');
    await app.close(); app = undefined; page = undefined;
    report.shutdowns.push({ stage: currentStage, pid: child.pid, hostPid: host.pid, exitCode: child.exitCode, signalCode: child.signalCode, naturalExit: true });
    await save();
  };
  const persisted = async () => {
    const manifest = JSON.parse(await readFile(join(profile, 'package.json')));
    const compatibility = await readFile(join(profile, 'compatibility.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    assert(!compatibility.includes('trisoul_x'), 'No compatibility exemption');
    return { installed: Object.hasOwn(manifest.dependencies ?? {}, 'trisoul_x'),
      enabled: (manifest.dsh?.profile?.bundles ?? []).includes('trisoul_x') };
  };
  const openSession = async () => {
    await until(() => page.evaluate(async id => {
      if (!window.__OMD_HOT_SLOTS__) return false;
      try { await window.__OMD_HOT_SLOTS__({ openSessionId: id, sessionId: id }); return true; }
      catch (error) {
        // refresh() may join a list request started before the external create.
        // Retry only this public catalog read; never invent the missing identity.
        if (error.message === 'Session missing from refreshed public catalog') return false;
        throw error;
      }
    }, report.sessionId), 'refreshed public catalog knows the blank session');
  };
  const snapshot = async stage => {
    let lastFailure;
    try {
      const completed = await until(async () => {
        assert.deepEqual(errors, [], 'Renderer error fails slot acceptance');
        const host = await observe();
        assert.equal(host.entries.some(row => row.state === 3), false, 'Failed Host fiber');
        const ui = await page.evaluate(id => window.__OMD_HOT_SLOTS__?.({ sessionId: id }), report.sessionId);
        if (!ui) return false;
        const button = page.getByRole('button', { name: /^模型与思考强度(?:：.+)?$/ }), count = await button.count();
        const value = await readSnapshotWithLiveErrors(async () => ({ stage, pid: app.process().pid, host, ui, persisted: await persisted(),
          bundles: await rpc('pluginManager/listBundles'), errors: [...errors],
          composerVisible: await page.locator('[data-composer-input]').first().isVisible(),
          modelButtonCount: count, modelButtonVisible: count === 1 && await button.isVisible(),
          additiveButtonCount: await page.getByRole('button', { name: /^OMD 模式与思考强度(?:：.+)?$/ }).count() }), errors);
        try {
          const baseline = report.baseline ?? stockBaseline(ui);
          assertStage(value, baseline, { stage, sessionId: report.sessionId, bundleRoot: report.bundleRoot });
          report.baseline ??= baseline;
          return value;
        } catch (error) { lastFailure = error; return false; }
      }, stage + ' actual Host/renderer/slot/session convergence', 45000);
      assertLiveErrors(errors, 'snapshot-complete');
      return completed;
    } catch (error) { throw new Error(error.message + (lastFailure ? ': ' + lastFailure.message : ''), { cause: error }); }
  };
  const captureDiagnostic = async label => {
    const value = { label, at: Date.now(), phase: report.phase, targetStage: report.targetStage,
      pid: app?.process().pid, errors: [...errors] };
    const reads = { host: () => request('/__conversation-hot-install', undefined, 10000),
      renderer: () => page.evaluate(() => window.__OMD_HOT_DIAGNOSTICS__?.() ?? { observerUnavailable: true }) };
    await Promise.all(Object.entries(reads).map(async ([key, read]) => {
      try { value[key] = await read(); }
      catch (error) { value[key + 'Error'] = redact(error.stack ?? error); }
    }));
    report.diagnostics.push(value);
    printDiagnosticSummary(report, value);
    await save();
  };
  try {
    report.phase = 'stock'; report.targetStage = 'stock'; await save();
    await launch('stock');
    const workspaceResult = await rpc('workspace/create', { request: { path: workspace } });
    const session = await rpc('session/create', { request: { workspaceId: workspaceResult.workspace.workspaceId, agentPreset: 'standard' } });
    assert(session.sessionId); report.sessionId = session.sessionId;
    // An empty session remains blank and may not appear as a renamed tree row.
    // Only the public openSession API plus real adapter/retain evidence selects it.
    await openSession(); report.stages.push(await snapshot('stock')); resources.mark('stock-selected'); await save();
    for (const [operation, next] of [['install', 'installed']]) {
      resources.mark('install-request'); report.phase = operation + ':request'; report.targetStage = next; await save();
      const host = await observe(), before = { pid: app.process().pid, hostPid: host.pid };
      const eventCount = (await lifecycle()).filter(row => row.event === 'plugin-change').length;
      const receipt = operation === 'install'
        ? await rpc('pluginManager/installBundle', { spec: 'file:' + inputs.archive })
        : await rpc('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: operation === 'reenable' });
      const value = await persistReceipt(report, { operation, receipt, before, coldStage: next }, save); resources.mark('receipt-returned');
      await captureDiagnostic(operation + ':receipt-returned');
      assert(['applied', 'restart-required'].includes(receipt.application), 'Real receipt: ' + JSON.stringify(receipt));
      const bundleRoot = await realpath(join(profile, 'node_modules', 'trisoul_x'));
      assert(inside(profile, bundleRoot), 'Actual installed package remains under the temporary profile');
      report.bundleRoot ??= bundleRoot; assert.equal(bundleRoot, report.bundleRoot);
      assert.equal(JSON.parse(await readFile(join(bundleRoot, 'package.json'))).version, pins.plugin.version);
      assert.equal(digest(await readFile(join(bundleRoot, 'lib/client.js'))), inputs.clientSha256, 'Installed published client bytes');
      const bundles = await rpc('pluginManager/listBundles');
      Object.assign(value, { changedEvents: (await lifecycle()).filter(row => row.event === 'plugin-change').length - eventCount,
        persisted: await persisted(), bundle: bundles.find(row => row.name === 'trisoul_x') });
      report.phase = operation + ':hot-check'; await save();
      if (receipt.application === 'applied') {
        value.hot = await snapshot(next); // Observe retained selection; never reopen it to mask a lost session.
        resources.mark('installed-snapshot-ok');
      }
      assertReceipt(value, next); value.validated = true; await save();
      report.readiness = await page.evaluate(() => window.__OMD_HOT_DIAGNOSTICS__());
      assert.deepEqual(report.readiness.crashes, [], 'No slot abdication during actual hot installation');
      assert.equal(report.readiness.uiConversation.conversation.activePresent, true);
      assert.equal(report.readiness.uiConversation.conversation.provider[0].state, 2);
  assert.equal(report.readiness.uiConversation.conversation.provider[1].uid, report.readiness.uiConversation.owner[0].uid, 'Actual controller belongs to current conversation owner');
      const flatten = rows => rows.flatMap(row => [row, ...flatten(row.children ?? [])]);
      const dock = flatten(value.hot.ui.slots).find(row => row.name === 'conversation.input.dock');
      assert(dock?.occupants.some(row => row.id === 'queue' && row.active), 'Native QueueDock registers after readiness');
      resources.mark('readiness-ok');
      report.stages.push(value.hot); await save();
      resources.mark('screenshot-before');
      await page.screenshot({ path: join(evidence, next + '-slots.png'), animations: 'disabled' });
      resources.mark('screenshot-after');
    }
    await close();
    assert.equal(report.launches.length, 1); assert.equal(report.stages.length, 2);
    assert.equal(report.shutdowns.length, 1); assert.equal(report.receipts.length, 1);
    report.lifecycle = await lifecycle();
    assert.equal(providerRequests.length, 0);
    assert.equal(report.lifecycle.filter(row => row.event === 'model-call').length, 0);
    report.resources = resources.snapshot();
    report.shutdownErrorClassification = classifyShutdownErrors(report);
    console.log('OMD_HOT_SHUTDOWN ' + JSON.stringify(report.shutdownErrorClassification));
    assert.equal(report.shutdownErrorClassification.ok, true, report.shutdownErrorClassification.reasons.join(', '));
    report.checks = ['official-rc2-and-frozen-candidate-bytes', 'standard-blank-session-public-open',
      'one-natural-exit', 'one-real-applied-hot-manager-receipt', 'applied-same-pid-current-host-graph',
      'unique-model-and-direct-label-owner', 'exact-two-occupant-hot-takeover', 'three-external-backends-false', 'no-prompts-or-model-calls'];
    report.phase = 'checks-complete';
  } catch (error) {
    resources.mark('failure'); report.status = 'failed'; report.failure = redact(error.stack ?? error.message); await save();
    await captureDiagnostic('failure-immediate');
    // Read-only follow-up is evidence, never recovery or a replacement acceptance.
    await delay(1000); await captureDiagnostic('failure-followup');
    throw error;
  }
});
