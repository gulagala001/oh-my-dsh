import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron } from 'playwright';
import sharp from 'sharp';
import { until } from './fixtures/frontend.mjs';
import { cleanupFixture, closeFixtureServer } from './fixtures/process.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { browserExecutablePath } from '#opencu/src/computer-use/browser.mjs';

const executablePath = process.env.OMD_DESKTOP_EXECUTABLE;
test('packaged Desktop installs OMD, preserves conversations across restart and restores stock UI on removal', { skip: !executablePath && 'Set OMD_DESKTOP_EXECUTABLE to an official rc.2 desktop executable', timeout: 300000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd-desktop-'))), home = join(root, 'home'), workspace = join(root, 'workspace');
  for (const dir of [home, workspace]) await mkdir(dir);
  let app, page, log = '', origin, cookie, exerciseComputer = false, toolSent = false;
  const errors = [], payloads = [];
  const browserExecutable = await testBrowserExecutable(root, browserExecutablePath());
  const fixture = await startFixture();
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body); payloads.push(payload);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let reply = { delta: { role: 'assistant', content: payload.tools?.length ? '桌面适配验证完成。' : '验证桌面插件' }, finish_reason: 'stop' };
    if (payload.tools?.length && exerciseComputer) {
      if (toolSent) reply.delta.content = '桌面电脑验证完成。';
      else {
        toolSent = true;
        reply = { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'desktop-cu', type: 'function', function: { name: 'computer_use', arguments: JSON.stringify({ title: '读取桌面测试页面', code: `var tab = await cua.createBrowserTab('browser', ${JSON.stringify(fixture.url)}); nodeRepl.write('desktop-test: tab created'); await tab.markDeliverable(); nodeRepl.write('desktop-test: deliverable marked'); await tab.getAXStateAndScreenshot();` }) } }] }, finish_reason: 'tool_calls' };
      }
    }
    res.end('data: ' + JSON.stringify({ id: 'desktop', choices: [{ index: 0, ...reply }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(r => provider.listen(0, '127.0.0.1', r));
  t.after(() => cleanupFixture([
    async () => {
      if (process.env.TRISOUL_UI_ARTIFACTS) {
        await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
        await writeFile(join(process.env.TRISOUL_UI_ARTIFACTS, 'desktop-log.txt'), log.replace(/token=[\w-]+/g, 'token=[redacted]'));
        if (origin && cookie) {
          const diagnostic = await fetch(origin + '/omd-desktop-test/diagnostics', { headers: { cookie }, signal: AbortSignal.timeout(2000) }).then(r => r.json()).catch(error => ({ error: error.message }));
          await writeFile(join(process.env.TRISOUL_UI_ARTIFACTS, 'desktop-runtime.json'), JSON.stringify(diagnostic, null, 2));
        }
        if (page && !page.isClosed()) await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'desktop-final.png') });
      }
    },
    () => app?.close(), () => closeFixtureServer(provider), () => fixture.close(),
    () => process.env.TRISOUL_UI_ARTIFACTS ? undefined : rm(root, { recursive: true, force: true }),
  ]));
  const probe = join(root, 'desktop-probe.mjs');
  await writeFile(probe, `export const inject = ['webServer'];
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/omd-desktop-test/diagnostics', handler(_req, res) {
    const browser = ctx.root[Symbol.for('opencu.runtime.v1')]?.computerUse?.browser, run = browser?.run;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ executable: process.execPath, electron: process.versions.electron, browserExecutable: browser?.runtimePath,
      phase: run?.phase, portFile: run?.portFileState, browserPid: run?.browserPid, jobPid: run?.jobPid,
      stderr: run?.stderr, verification: run?.verificationError, launchError: run?.launchError?.message, cleanupError: run?.cleanupError?.message }));
  } }));
}`);
  await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { insert: [{ id: 'omd-desktop-test-probe', name: pathToFileURL(probe).href }] },
  ]));
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    locale: { preference: 'zh' },
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'FIXTURE', models: [{ id: 'fixture', name: '桌面测试模型', contextWindow: 1000000, maxTokens: 4096, input: ['text', 'image'] }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'trisoul-x': { componentAutoSetup: false, backgroundTasksEnabled: false, digestEvery: 1000, codegraphEnabled: false, computerUseBrowserExecutable: browserExecutable, computerUseNativeBinary: join(root, 'missing-native'), computerUseChromeUserDataDir: join(root, 'chrome-profile') },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  const launch = async () => {
    log = '';
    app = await _electron.launch({ executablePath: resolve(executablePath), args: ['--user-data-dir=' + join(root, 'electron-data')], env: { ...process.env, DSH_HOME: home }, timeout: 60000 });
    for (const stream of [app.process().stdout, app.process().stderr]) stream.on('data', chunk => { log += chunk; });
    await app.evaluate(({ app, dialog }) => { dialog.showMessageBox = async (...args) => { console.error('Desktop dialog', JSON.stringify(args.at(-1))); app.exit(1); return { response: 0, checkboxChecked: false }; }; });
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') log += '\nRenderer: ' + message.text(); });
    origin = await until(() => log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)?.[1], 45000);
    const bootstrap = await until(() => log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/)?.[1]);
    const login = await fetch(bootstrap, { redirect: 'manual' });
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    await until(() => page.locator('[data-composer-input]').count());
    assert.equal(page.url().startsWith('dsh-app://app/'), true);
    assert.equal((await app.evaluate(({ app }) => app.getPath('userData'))), join(root, 'electron-data'));
  };
  const rpc = async (method, args = {}) => {
    const r = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) });
    const result = await r.json(); assert.equal(result.result?.ok, true, JSON.stringify(result)); return result.result.value;
  };
  await launch();
  const packResult = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { cwd: new URL('../', import.meta.url), encoding: 'utf8', shell: process.platform === 'win32' }));
  const [packed] = Array.isArray(packResult) ? packResult : Object.values(packResult);
  const installed = await rpc('pluginManager/installBundle', { spec: 'file:' + join(root, packed.filename) });
  assert.equal(installed.application, 'applied', JSON.stringify(installed));
  await page.locator('[data-omd-desktop-restart]').waitFor();
  await app.close(); app = undefined;
  await launch();
  assert.equal(await page.locator('[data-omd-desktop-restart]').count(), 0);
  const manifest = JSON.parse(await readFile(join(home, 'profiles/desktop/package.json'), 'utf8'));
  assert.ok(manifest.dependencies.trisoul_x);
  const registered = await rpc('workspace/create', { request: { path: workspace } });
  const { sessionId } = await rpc('session/create', { request: { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' } });
  await rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '验证桌面插件' }] } });
  await until(async () => { const r = await fetch(origin + '/trisoul-x/api/state?session=' + sessionId, { headers: { cookie } }); return r.ok && (await r.json()).running === 'idle'; });
  assert.ok(payloads.some(payload => payload.tools?.some(tool => tool.function.name === 'computer_use')));
  await rpc('session/rename', { request: { sessionId, title: '验证桌面插件' } });
  await page.getByText('workspace', { exact: true }).first().click();
  await page.getByText('验证桌面插件', { exact: true }).first().click();
  await page.getByText('桌面适配验证完成。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  assert.equal(await page.locator('.tx-cu-chip').count(), 1);
  await page.getByText('更多', { exact: true }).click();
  await page.getByText('设置', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('codex-desktop');
  assert.equal(await page.getByLabel('配色', { exact: true }).locator('option').count(), 29);
  await page.getByLabel('配色', { exact: true }).selectOption('palette:lavender');
  const wallpaper = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#416975' } }).png().toBuffer();
  await page.getByLabel('背景图片', { exact: true }).setInputFiles({ name: 'desktop-wallpaper.png', mimeType: 'image/png', buffer: wallpaper });
  await page.locator('html[data-omd-background]').waitFor();
  await page.getByLabel('背景显示区域', { exact: true }).selectOption('conversation');
  await page.locator('.omd-advanced > summary').click();
  await page.getByLabel('Logo 与名称', { exact: true }).selectOption('native');
  await page.getByLabel('浏览器标题', { exact: true }).selectOption('custom');
  await page.getByLabel('标题名称', { exact: true }).fill('桌面定制');
  await page.getByLabel('标题名称', { exact: true }).press('Enter');
  await page.getByLabel('启用高级外观定制', { exact: true }).check();
  await page.getByLabel('对话字号', { exact: true }).fill('17');
  await page.getByLabel('对话字号', { exact: true }).press('Enter');
  await until(() => page.locator('[data-omd-background-layer] img').evaluate(img => img.complete && img.naturalWidth === 32));
  await page.keyboard.press('Escape');

  const response = await page.evaluate(async id => { const r = await fetch('trisoul-x/api/state?session=' + id); return { ok: r.ok, body: await r.json() }; }, sessionId);
  assert.equal(response.ok, true, 'custom-protocol fetch reaches the authenticated host');
  exerciseComputer = true;
  await page.locator('[data-composer-input]').fill('验证桌面电脑操作');
  await page.locator('.uV2eYG_primary').click();
  await page.getByText('桌面电脑验证完成。', { exact: true }).waitFor({ timeout: 45000 });
  assert.ok(payloads.some(payload => payload.tools?.length && /image_url/.test(JSON.stringify(payload.messages))),
    'real browser screenshot reaches the model; tool responses: ' + JSON.stringify(payloads.flatMap(payload => payload.messages?.filter(message => message.role === 'tool') ?? [])));
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  const preview = page.locator('.tx-cu-pane .tx-cu-live img').first();
  await preview.waitFor();
  await until(() => preview.evaluate(img => img.complete && img.naturalWidth > 0));
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.mouse.move(10, 10);
    await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'desktop-computer.png') });
  }
  const computer = (op, body) => page.evaluate(async ({ op, sessionId, body }) => {
    const r = await fetch(`trisoul-x/computer-use/${op}?session=${sessionId}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw Error(await r.text());
    return r.json();
  }, { op, sessionId, body });
  assert.equal((await computer('stop', {})).status, 'stopped');
  assert.equal((await computer('resume', {})).status, 'idle');
  await page.locator('.codex-panel-toggle').click();
  await page.locator('[data-composer-input]').fill('保留桌面草稿');
  if (process.env.TRISOUL_UI_ARTIFACTS) { await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true }); await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'desktop-installed.png') }); }
  await app.close(); app = undefined;
  await launch();
  await page.getByText('验证桌面插件', { exact: true }).first().click();
  await page.getByText('桌面适配验证完成。', { exact: true }).waitFor();
  await until(async () => (await page.locator('[data-composer-input]').innerText()) === '保留桌面草稿');
  assert.equal(await page.locator('html').getAttribute('data-omd-skin'), 'codex-desktop');
  assert.equal(await page.locator('html').getAttribute('data-omd-palette'), 'palette:lavender');
  await page.locator('html[data-omd-background="conversation"]').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-custom'), '');
  assert.equal(await page.locator('.hHd-Xa_logoRow .tx-brand-mark').count(), 0);
  assert.match(await page.title(), /桌面定制$/);
  assert.equal(await page.locator('[data-composer-input]').evaluate(el => getComputedStyle(el).fontSize), '17px');
  await until(() => page.locator('[data-omd-background-layer] img').evaluate(img => img.complete && img.naturalWidth === 32));

  const removed = await rpc('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: false });
  assert.equal(removed.application, 'applied');
  await page.locator('[data-omd-desktop-restart]').waitFor();
  await app.close(); app = undefined;
  await launch();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.tx-cu-chip').count(), 0);
  assert.equal(await page.locator('[data-omd-background-layer], style[data-omd-background-style], style[data-omd-custom-style], link[data-omd-favicon]').count(), 0);
  assert.match(await page.title(), /DeepSeek Harness$/);
  await page.getByText('桌面适配验证完成。', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
