import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { cleanupFixture, closeFixtureServer } from '../process.mjs';
import { desktopIdentity, digest, inside } from './inputs.mjs';
import { localProvider, verificationFile, verificationMarker } from './provider.mjs';

export async function until(fn, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(50); }
  throw Error('Non-CU Desktop fixture timed out');
}

function environment(root, home) {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL',
    'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return { ...inherited, DSH_HOME: home, HOME: join(root, 'user-home'), USERPROFILE: join(root, 'user-home'),
    XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), XDG_STATE_HOME: join(root, 'state'),
    APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'), TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
    PI_CODING_AGENT_DIR: join(root, 'pi-agent'), PNPM_HOME: join(root, 'bin'), COREPACK_HOME: join(root, 'cache/corepack'), COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    npm_config_userconfig: join(root, 'empty.npmrc'), NPM_CONFIG_USERCONFIG: join(root, 'empty.npmrc'),
    npm_config_cache: join(root, 'cache/npm'), NPM_CONFIG_CACHE: join(root, 'cache/npm'),
    npm_config_prefix: join(root, 'npm-global'), NPM_CONFIG_PREFIX: join(root, 'npm-global'), CI: 'true' };
}
const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');

export async function desktopFixture(t, inputs) {
  // Keep every generated file in this test's exclusive fixture tree. Do not use
  // the user's DSH_HOME, account credentials, normal browser or active web port.
  const parent = await realpath(new URL('.', import.meta.url));
  assert(inside(inputs.boundary, parent));
  const root = await realpath(await mkdtemp(join(parent, 'run-'))), home = join(root, 'home'), workspace = join(root, 'workspace');
  assert(inside(parent, root) && root !== parent, 'Generated fixture must stay in the exclusive new tree');
  const profile = join(home, 'profiles/desktop'), userData = join(root, 'electron-data');
  for (const dir of [home, workspace, userData, ...['user-home', 'config', 'cache/npm', 'cache/corepack', 'data', 'state', 'tmp', 'pi-agent', 'bin', 'npm-global'].map(name => join(root, name))]) await mkdir(dir, { recursive: true });
  const env = environment(root, home); await writeFile(env.npm_config_userconfig, '');
  let provider;
  let app, page, media, origin, cookie, bootLog = '', log = '', identity, boot = 0;
  const errors = [], launches = [], externalRendererRequests = [];
  const report = { status: 'not-tested', platform: process.platform, arch: process.arch, phase: 'prepared',
    archive: { file: inputs.archive, sha256: inputs.sha256, version: inputs.manifest.version }, executableSha256: inputs.executableSha256,
    isolation: { root, home, profile, workspace, userData, computerUseEnabled: false },
    launches, checks: [], errors, externalRendererRequests, modelErrors: [] };
  const evidence = process.env.OMD_DESKTOP_NONCU_EVIDENCE ? resolve(process.env.OMD_DESKTOP_NONCU_EVIDENCE) : undefined;
  let evidenceReady = false;
  const checkpoint = async phase => {
    report.phase = phase;
    if (evidenceReady) await writeFile(join(evidence, 'desktop-noncu.json'), JSON.stringify(report, null, 2));
  };
  t.after(async () => {
    try { await cleanupFixture([
      async () => {
        if (evidenceReady) {
          await writeFile(join(evidence, 'desktop-log.txt'), redact(log));
          if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'desktop-final.png') });
        }
      },
      async () => { await app?.close(); app = undefined; },
      () => provider && closeFixtureServer(provider.server),
      async () => {
        const actual = await realpath(root);
        assert.equal(actual, root); assert(inside(parent, actual) && actual !== parent, 'Only remove the checked fixture root');
        assert(!app, 'Never delete user-data beneath an unclosed Desktop');
        await rm(actual, { recursive: true, force: true });
        report.cleanup = { root: actual, removed: true };
        if (!t.passed && report.status === 'passed') report.status = 'failed';
        await checkpoint(report.phase);
      },
    ]); }
    catch (error) {
      report.status = 'failed'; report.cleanupFailure = { message: error.message, stack: error.stack };
      await checkpoint('cleanup-failed'); throw error;
    }
  });
  if (evidence) {
    assert(inside(inputs.boundary, evidence) && !inside(root, evidence), 'Evidence must be a fresh directory outside disposable home in the new workspace');
    assert(inside(inputs.boundary, await realpath(resolve(evidence, '..'))), 'Evidence parent cannot redirect into an old source');
    await mkdir(evidence, { mode: 0o700 }); evidenceReady = true;
  }
  provider = await localProvider();
  report.isolation.provider = provider.origin; report.modelErrors = provider.errors;
  const observer = join(root, 'observer.mjs');
  await writeFile(observer, await readFile(new URL('./observer.mjs', import.meta.url)));
  await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { insert: [{ id: 'desktop-noncu-observer', name: pathToFileURL(observer).href, config: { peers: inputs.peerNames } }] },
  ]));
  const settings = {
    locale: { preference: 'zh' }, 'product-analytics': { enabled: false }, 'session-telemetry-otel': { mode: 'DISABLED' },
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: provider.origin + '/v1', apiKeyEnv: 'DESKTOP_NONCU_FIXTURE',
      models: [{ id: 'fixture', name: '非 CU 桌面隔离模型', contextWindow: 1000000, maxTokens: 4096, input: ['text'] }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'trisoul-x': { componentAutoSetup: false, computerUseEnabled: false, backgroundTasksEnabled: false, digestEvery: 1000,
      codegraphEnabled: false, unifiedBackground: { provider: 'fixture', model: 'fixture', effort: 'off' }, dreamProvider: 'fixture', dreamModel: 'fixture' },
  };
  await writeFile(join(home, 'settings.yaml'), JSON.stringify(settings));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { DESKTOP_NONCU_FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  await writeFile(join(home, 'desktop-user-config.bin'), Buffer.from([0, 255, 42, 13, 10, 0, 128]));
  await writeFile(join(workspace, verificationFile), `import { writeFileSync } from 'node:fs'; writeFileSync('native-verification.txt', '${verificationMarker}'); console.log('${verificationMarker}');`);

  const request = async (path, body) => {
    assert(origin && cookie, 'Only use the authenticated fixture-owned host');
    const response = await fetch(origin + path, { headers: { cookie, 'content-type': 'application/json' }, signal: AbortSignal.timeout(180000),
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const raw = await response.text(); let value;
    try { value = JSON.parse(raw); }
    catch { throw Error(path + ': HTTP ' + response.status + ' non-JSON ' + raw.slice(0, 1000)); }
    assert.equal(response.status, 200, path + ': ' + JSON.stringify(value)); return value;
  };
  const rpc = async (method, args = {}) => {
    const value = await request('/api/' + method, { type: 'client-request', rpcId: randomUUID(), method, payload: { args } });
    assert.equal(value.result?.ok, true, method + ': ' + JSON.stringify(value)); return value.result.value;
  };
  const observe = sessionId => request('/__desktop-noncu' + (sessionId ? '?session=' + encodeURIComponent(sessionId) : ''));
  const launch = async () => {
    assert(!app, 'Previous Electron process must be fully closed before cold boot');
    const { _electron } = await import('playwright');
    bootLog = ''; cookie = undefined; origin = undefined;
    app = await _electron.launch({ executablePath: inputs.executablePath,
      args: [inputs.appRoot, '--user-data-dir=' + userData, '--password-store=basic', ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])],
      cwd: workspace, env, timeout: 60000 });
    const append = chunk => { bootLog += chunk; log += chunk; };
    for (const stream of [app.process().stdout, app.process().stderr]) stream.on('data', append);
    // Identity rejection occurs before any install/session mutation. Never drive
    // a merely similar rc.2 Desktop or a matching version with mismatched SDKs.
    try {
      identity = await app.evaluate(desktopIdentity, { appRoot: inputs.appRoot, sdkNames: inputs.sdkNames,
        publicComponents: inputs.publicComponents, hostVersion: inputs.hostVersion, cordisVersion: inputs.manifest.peerDependencies['@deepseek-ai/cordis'] });
      assert.equal(await realpath(identity.executable), inputs.executablePath);
      assert.equal(resolve(identity.userData), userData); assert.equal(resolve(identity.home), join(root, 'user-home'));
      assert.equal(identity.appVersion, inputs.hostVersion, 'Actual official Desktop version');
      assert.equal(digest(await readFile(inputs.executablePath)), inputs.executableSha256, 'Explicit native executable is unchanged');
    } catch (error) {
      await app.close(); app = undefined;
      throw Object.assign(Error('Non-CU Desktop not tested: actual boot identity mismatch: ' + error.message), { desktopInputMismatch: true });
    }
    page = await app.firstWindow(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push({ boot, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') log += '\nRenderer: ' + message.text(); });
    const bootstrap = await until(() => {
      if (app.process().exitCode !== null) throw Error('Owned Desktop exited before boot: ' + redact(bootLog));
      return bootLog.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/)?.[1];
    }, 60000);
    origin = new URL(bootstrap).origin;
    assert.notEqual(new URL(origin).port, '19387', 'Never operate the current DSH GUI');
    const login = await fetch(bootstrap, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert(cookie, 'Each cold boot authenticates with its own fresh loopback token/cookies');
    await app.context().route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'dsh-app:' || url.protocol === 'data:' || url.protocol === 'blob:' || url.origin === origin) await route.continue();
      else {
        externalRendererRequests.push({ boot, origin: url.origin, path: url.pathname });
        await route.abort();
      }
    });
    await until(async () => {
      if (await page.getByText('Failed to load plugins', { exact: true }).isVisible()) throw Error('Real Desktop plugin boot failed: ' + redact(log));
      const welcome = page.getByRole('button', { name: /^(继续|Continue)$/, exact: true });
      if (await welcome.isVisible()) await welcome.click();
      return await page.locator('[data-composer-input]').count();
    }, 45000);
    assert(page.url().startsWith('dsh-app://app/'), 'Use the actual native custom-protocol renderer, not headless web');
    media = await app.context().newCDPSession(page);
    const reducedTransparency = await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches);
    const stock = await observe(); assert.equal(stock.nativeToolRuntime, true);
    const compatibility = await readFile(join(profile, 'compatibility.json'), 'utf8').then(JSON.parse, error => {
      if (error.code === 'ENOENT') return undefined; throw error;
    });
    if (compatibility) {
      // A matching boot requires no SDK exemption. Do not silently grant one.
      assert.equal(JSON.stringify(compatibility).includes('trisoul_x@'), false, 'No OMD compatibility exemption');
    }
    launches.push({ boot: ++boot, pid: app.process().pid, origin, identity, reducedTransparency, compatibility });
    report.isolation.origin = origin;
    await checkpoint('boot-' + boot);
    return { page, identity, reducedTransparency };
  };
  const close = async () => {
    const previous = app?.process(); await app?.close(); app = undefined; page = undefined; media = undefined;
    if (previous) await until(() => previous.exitCode !== null || previous.signalCode !== null, 15000);
  };
  const restart = async () => { const previous = launches.at(-1)?.pid; await close(); await launch(); assert.notEqual(launches.at(-1).pid, previous, 'Cold restart uses a fresh native process'); };
  const screenshot = async name => { if (evidenceReady) await page.screenshot({ path: join(evidence, name), animations: 'disabled' }); };
  const assertArchive = async () => assert.equal(digest(await readFile(inputs.archive)), inputs.sha256, 'Frozen final archive did not change');
  return { root, home, profile, workspace, userData, provider, report, errors, launches, rpc, request, observe, launch, close, restart,
    checkpoint, screenshot, assertArchive, get page() { return page; }, get media() { return media; }, get identity() { return identity; } };
}

// Snapshot the actual native persistence/config bytes, never a mocked Session.
export async function retainedFiles(home) {
  const files = {};
  const visit = async directory => {
    for (const name of await readdir(directory)) {
      const file = join(directory, name), entry = await lstat(file);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (name !== 'node_modules' && name !== '.pnpm') await visit(file);
      } else if (entry.isFile() && (name === 'session.v4.jsonl.zstd' || name === 'desktop-user-config.bin'
        || name === 'settings.yaml' || name === '.credentials.yaml')) files[file] = await readFile(file);
    }
  };
  await visit(home); return files;
}
