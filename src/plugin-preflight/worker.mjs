// Disposable process only. Never import this module into the working host.
import { readFile, writeFile, mkdir, cp, symlink, access, realpath, rm, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { launchNativeHost } from './native-host.mjs';
import { cleanEnvironment } from './process.mjs';
import { LIMITS, packageDigest, problem, redact } from './shared.mjs';

if (process.env.OMD_PLUGIN_PREFLIGHT !== '1') throw Error('Plugin preflight requires its disposable launcher');
const { channelKey, ...input } = JSON.parse(await readFile(process.argv[2], 'utf8'));
await rm(process.argv[2], { force: true });
const { root, cli, profile, action, target, options = {} } = input;
const env = cleanEnvironment(root), home = env.DSH_HOME, dir = join(home, 'profiles', 'omd-preflight');
const req = createRequire(profile.installAnchor);
const sdk = name => import(pathToFileURL(req.resolve(name)).href);
const exists = path => access(path).then(() => true, () => false);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const send = process.send.bind(process);
const notify = message => { if (process.connected) send({ ...message, channelKey }, () => {}); };
const phase = (stage, message) => notify({ type: 'phase', stage, message });
const abort = new AbortController();
let browser, browserLaunch, preparing, finishing, nativeHost, disconnected = false, hostStopping = false, hostLog = '', candidate;
const nativeExit = process.exit.bind(process);
const terminate = () => { abort.abort(problem('cancelled', '预检已取消')); void finish({ ok: false, code: 'cancelled', message: '预检已取消' }); };

function finish(result) {
  return finishing ??= (async () => {
    abort.abort(problem('cancelled', '预检已结束'));
    await preparing?.catch(() => {});
    await browserLaunch?.catch(() => {});
    await browser?.close().catch(() => {});
    if (!disconnected && process.connected) await new Promise(resolve => send({ type: 'result', result, channelKey }, () => resolve()));
    process.removeListener('SIGTERM', terminate);
    if (!nativeHost) { nativeExit(result?.ok ? 0 : 1); return; }
    hostStopping = true;
    nativeHost.quit(result?.ok ? 0 : 1, () => notify({ type: 'result', result: {
      ok: false, code: 'cleanup-failed', message: '隔离宿主退出超时，预检未完成',
    } }));
  })();
}
process.once('SIGTERM', terminate);
process.once('disconnect', () => { disconnected = true; terminate(); });
process.once('exit', code => {
  // A healthy parent owns normal cleanup. If it vanished, native shutdown has
  // already disposed the host; failed shutdown leaves a recoverable owner file.
  if (disconnected && hostStopping && code === 0) {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

async function findBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const shells = [];
  const paths = [input.browserPath, chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  // Prefer an already installed headless shell. Do not download or create a
  // second permanent browser cache just to perform a plugin check.
  for (const cache of [process.env.PLAYWRIGHT_BROWSERS_PATH, input.browserCache,
    process.platform === 'darwin' ? join(input.userHome || homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32' ? join(input.localAppData || '', 'ms-playwright') : join(input.userHome || homedir(), '.cache/ms-playwright')].filter(Boolean)) {
    for (const entry of (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-'))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))) {
      for (const folder of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64', 'chrome-headless-shell-win64']) {
        const path = join(cache, entry, folder, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
        if (await exists(path)) shells.push(path);
      }
    }
  }
  for (const path of [...shells, ...paths.filter(Boolean)]) if (await exists(path)) return { chromium, executablePath: path };
  throw problem('browser-unavailable', '没有可复用的检查浏览器，预检未完成；未额外下载浏览器');
}

async function prepare() {
  // SDK modules must see the same working directory and argv as native boot,
  // including modules which capture these values when they are imported.
  await mkdir(join(root, 'workspace'), { recursive: true });
  process.chdir(join(root, 'workspace'));
  process.argv = [process.execPath, cli, '--profile', 'omd-preflight', '--no-open', '--port', '0'];
  const { initProfile, resolveBundleDir, loadProfileDirectory } = await sdk('@deepseek-ai/dsh-app-boot');
  await mkdir(dir, { recursive: true });
  initProfile(dir, []);
  const original = await json(join(profile.dir, 'package.json'));
  if (action === 'install') {
    phase('preparation', '正在准备插件安装预检');
    // Keep native registry, build-script approvals and source formats. All
    // package-manager writes go to the disposable profile.
    for (const file of ['.npmrc', 'pnpm-workspace.yaml']) if (await exists(join(profile.dir, file)))
      await cp(join(profile.dir, file), join(dir, file));
    const { parse, stringify } = createRequire(import.meta.url)('yaml');
    const workspace = parse(await readFile(join(dir, 'pnpm-workspace.yaml'), 'utf8')) || {};
    workspace.packageImportMethod = 'copy';
    try {
      const modules = parse(await readFile(join(profile.dir, 'node_modules/.modules.yaml'), 'utf8'));
      if (typeof modules?.storeDir === 'string') workspace.storeDir = modules.storeDir;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (options.approvedBuilds?.length) workspace.allowBuilds = { ...workspace.allowBuilds,
      ...Object.fromEntries(options.approvedBuilds.map(name => [name, true])) };
    await writeFile(join(dir, 'pnpm-workspace.yaml'), stringify(workspace), { mode: 0o600 });
    const { runProfilePnpm } = await sdk('@deepseek-ai/dsh-plugin-manager/operations');
    const result = await runProfilePnpm({ ...profile, dir, home, profile: 'omd-preflight' }, ['add', target,
      ...(options.registry ? [`--registry=${options.registry}`] : []), '--save-exact'], {
      ...profile.packageManager, execution: 'service', signal: abort.signal, outputBytes: LIMITS.logBytes,
      activateNewBundles: false, idleTimeoutMs: 45000, lookupTimeoutMs: 15000,
      // Only package acquisition shares the launcher's package/tool caches.
      // The runtime and browser still receive the isolated environment above.
      env: { ...profile.packageManager?.env, ...env, ...input.packageEnvironment },
    });
    if (result.exitCode !== 0 || result.timedOut) throw Object.assign(problem(result.incompatible?.length ? 'incompatible-version' : 'preparation-failed',
      result.incompatible?.length ? '插件声明的宿主版本不兼容' : '安装包准备未完成；正式安装尚未开始'), { details: result.output });
    const staged = await json(join(dir, 'package.json'));
    const names = Object.keys(staged.dependencies || {});
    if (names.length !== 1) throw problem('package-format', '无法确定安装请求对应的唯一插件');
    const name = names[0];
    candidate = { name, path: await realpath(join(dir, 'node_modules', name)) };
  } else {
    const name = input.bundle;
    candidate = { name, path: resolveBundleDir('omd-preflight', name, profile.installAnchor, profile.dir) };
  }
  candidate.path = await realpath(candidate.path);
  const manifest = await json(join(candidate.path, 'package.json'));
  if (!manifest.dsh?.bundle) throw problem('package-format', '安装包没有 DSH 插件声明');
  const identity = await packageDigest(candidate.path, abort.signal);
  // Local links and installed candidates must execute from a disposable copy,
  // never from a directory the user edits. Existing dependency bytes are reused.
  const source = candidate.path;
  const modules = join(dir, 'node_modules'); await mkdir(modules, { recursive: true });
  if (!source.startsWith(root + '/') && !source.startsWith(root + '\\')) {
    const snapshot = join(root, 'candidate');
    await cp(source, snapshot, { recursive: true, dereference: false, verbatimSymlinks: true, filter: path => !['node_modules', '.git', '.local'].includes(path.split(/[\\/]/).at(-1)) });
    await symlink(await exists(join(source, 'node_modules')) ? join(source, 'node_modules') : modules,
      join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const link = join(modules, candidate.name); await mkdir(dirname(link), { recursive: true });
    await rm(link, { recursive: true, force: true });
    await symlink(snapshot, link, process.platform === 'win32' ? 'junction' : 'dir');
  }
  const bundles = [...(original.dsh?.profile?.bundles || [])];
  if (!bundles.includes(candidate.name)) bundles.push(candidate.name);
  for (const name of bundles) {
    if (name === candidate.name) continue;
    const path = resolveBundleDir('omd-preflight', name, profile.installAnchor, profile.dir), to = join(modules, name);
    if (await exists(to)) {
      if ((await json(join(to, 'package.json'))).version !== (await json(join(path, 'package.json'))).version)
        throw problem('environment-unavailable', `准备环境中的 ${name} 与当前已启用版本不同，未进行替代验证`);
    } else if (!/[\\/]app\.asar[\\/]/.test(path)) {
      await mkdir(dirname(to), { recursive: true }); await symlink(path, to, process.platform === 'win32' ? 'junction' : 'dir');
    }
    // Packaged desktop bundles resolve through installAnchor. OS symlinks
    // into ASAR are not real directories and break native profile resolution.
  }
  const staged = await json(join(dir, 'package.json'));
  staged.dsh = { profile: { bundles } };
  await writeFile(join(dir, 'package.json'), JSON.stringify(staged));
  // Preserve explicit entry enablement, without copying user data paths,
  // credentials or expressions into a second live application.
  const patches = [...(input.entryStates || [])];
  if (action === 'entry') patches.push({ id: input.entryId, disabled: false });
  await writeFile(join(dir, 'cordis.patch.yml'), JSON.stringify(patches));
  const loaded = loadProfileDirectory('omd-preflight', dir, profile.installAnchor);
  if (loaded.skippedBundles.length) {
    const skipped = loaded.skippedBundles.find(row => row.packageName === candidate.name) || loaded.skippedBundles[0];
    throw Object.assign(problem(skipped.packageName === candidate.name ? 'package-format' : 'environment-unavailable',
      `插件组合无法完整加载：${skipped.packageName}`), { details: skipped.reason });
  }
  // Package-registry authentication is only needed during preparation. Do
  // not leave it or raw installer logs available to the trial runtime.
  await rm(join(dir, '.npmrc'), { force: true });
  await rm(join(dir, '.plugin-manager'), { recursive: true, force: true });
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n');
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ locale: { preference: 'zh' }, 'oh-my-dsh': {
    pluginPreflightEnabled: false, componentAutoSetup: false, backgroundTasksEnabled: false, dreamAutoEnabled: false,
    codegraphEnabled: false, computerUseEnabled: false, dataDir: join(home, 'oh-my-dsh'), projectlessWorkspaceRoot: join(root, 'workspace'),
  } }), { mode: 0o600 });
  const spec = staged.dependencies?.[candidate.name];
  return { identity: { name: candidate.name, packageName: manifest.name, version: manifest.version, ...identity },
    installSpec: action === 'install' && /^\d+\.\d+\.\d+/.test(spec || '') ? `${candidate.name}@${spec}` : undefined };
}

async function checkPage(chromium, executablePath, bootstrap) {
  const errors = [];
  browser = await (browserLaunch = chromium.launchPersistentContext(join(root, 'browser'), { executablePath, headless: true, env,
    downloadsPath: join(root, 'downloads'), tracesDir: join(root, 'traces'), viewport: { width: 1024, height: 768 },
    args: ['--js-flags=--max-semi-space-size=8',
      ...(process.platform === 'darwin' ? ['--use-mock-keychain', '--password-store=basic'] : [])] }));
  abort.signal.throwIfAborted();
  const page = browser.pages()[0] || await browser.newPage();
  let rejectFatal;
  const fatal = new Promise((_, reject) => { rejectFatal = reject; });
  page.on('pageerror', error => {
    if (errors.length < 10) errors.push(String(error.stack || error.message).slice(0, 4096));
    rejectFatal(Object.assign(problem('client-failed', '隔离页面运行失败：' + String(error.message).slice(0, 512)), { details: errors.join('\n') }));
  });
  await Promise.race([(async () => {
  await page.goto(bootstrap, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const input = page.locator('[data-composer-input]').first();
  const proceed = page.getByRole('button', { name: '继续', exact: true });
  const key = page.getByRole('button', { name: '添加 API Key', exact: true });
  // The composer renders behind onboarding before its buttons hydrate. Wait
  // for the real onboarding action rather than clicking through its overlay.
  await proceed.or(key).first().waitFor({ state: 'visible', timeout: 12000 });
  if (await proceed.isVisible()) { await proceed.click(); await key.waitFor({ state: 'visible' }); }
  if (await key.isVisible()) {
    await key.click(); const skip = page.getByRole('button', { name: '稍后配置', exact: true });
    await skip.click(); await skip.waitFor({ state: 'hidden' });
  }
  const inventory = await page.evaluate(async () => {
    const call = async method => {
      const response = await fetch('/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: {} } }) });
      const data = await response.json();
      if (!response.ok || !data.result?.ok) throw Error('无法读取原生插件加载状态：' + method);
      return data.result.value;
    };
    return { plugins: await call('pluginManager/listPlugins'), bundles: await call('pluginManager/listBundles') };
  });
  const ownIds = new Set(inventory.bundles.find(bundle => bundle.name === candidate.name)?.rows.map(row => row.entryId));
  const failed = inventory.plugins.filter(row => row.enabled && (row.fiberPhase === 'failed' || row.fiberPhase === null));
  if (failed.length) throw Object.assign(problem(failed.some(row => ownIds.has(row.entryId)) ? 'host-failed' : 'environment-unavailable',
    '隔离插件组合存在加载失败：' + failed.map(row => row.moduleName).join('、')), { details: hostLog });
  const waiting = inventory.plugins.filter(row => ownIds.has(row.entryId) && row.enabled && row.fiberPhase === 'pending');
  if (waiting.length) throw Object.assign(problem('environment-unavailable', '候选插件仍在等待依赖服务，预检未完成'), { details: hostLog });
  if (await input.getAttribute('contenteditable') === 'false' && await input.getAttribute('data-phase') === 'inert') {
    // A fresh native profile asks for a workspace before editing. Exercise
    // that picker rather than treating the intentional empty state as a crash.
    await input.click({ timeout: 5000 });
    await page.getByRole('menu').first().waitFor({ state: 'visible', timeout: 5000 }); await page.keyboard.press('Escape');
  } else { await input.fill('插件启动检查', { timeout: 8000 }); await input.fill(''); }
  await page.getByRole('button', { name: '账号菜单', exact: true }).click({ timeout: 5000 });
  await page.getByRole('menuitem', { name: '设置', exact: true }).click({ timeout: 5000 });
  await page.getByRole('dialog', { name: '设置', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  if (errors.length) throw Object.assign(problem('client-failed', '隔离页面出现运行错误'), { details: errors.join('\n') });
  })(), fatal]);
}

let result;
try {
  const { chromium, executablePath } = await findBrowser();
  const prepared = await (preparing = prepare()); preparing = undefined; abort.signal.throwIfAborted();
  phase('runtime', '正在检查插件启动与基础界面');
  nativeHost = launchNativeHost(cli, join(root, 'workspace'), log => { hostLog = log; });
  const bootstrap = await nativeHost.listening;
  await Promise.all([checkPage(chromium, executablePath, bootstrap), nativeHost.boot]);
  nativeHost.assertAlive?.();
  result = { ok: true, ...prepared, checks: ['host-start', 'plugin-activation', 'page-load', 'composer', 'settings'] };
} catch (error) {
  result = { ok: false, code: error.code || 'probe-failed', message: error.message,
    details: redact(error.details || hostLog || error.stack) };
} finally { await finish(result); }
