import { subpathProxy } from './subpath-proxy.mjs';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { stopFixtureProcess, cleanupFixture, closeFixtureServer } from './process.mjs';

export async function until(fn, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(50); }
  throw new Error('Frontend fixture timed out');
}

export async function frontendFixture(t, { imageBudget, versionResponse, headless = false, lifecycleTrace = false, installedPackage = process.env.OMD_UI_PACKED === '1', historyMessages = 0, legacyShadows = false, componentAutoSetup = false, omdConfig = {}, chatConfig = {}, legacyChatConfig, basePath = '/', agentPreset = 'trisoul-x', reply, optimizerReply } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-frontend-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  await mkdir(home); await mkdir(workspace);
  let nextReply, releaseReply, replyFactory = reply, child, browser, page, log = '';
  const errors = [], browserDiagnostics = [];
  const provider = createServer(async (req, res) => {
    let request = ''; for await (const chunk of req) request += chunk; const payload = JSON.parse(request);
    if (payload.tools?.length && nextReply) { const waiting = nextReply; nextReply = null; await waiting; }
    const optimizing = !payload.tools?.length && JSON.stringify(payload.messages).includes('你正在 Oh My DSH 中改写尚未发送的用户草稿');
    const custom=optimizing ? await optimizerReply?.(payload) : payload.tools?.length&&await replyFactory?.(payload);
    if(custom){
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      const choices=custom[Symbol.asyncIterator]?custom:[custom];
      for await(const choice of choices)res.write('data: '+JSON.stringify({id:'ui',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,...choice}]})+'\n\n');
      res.end('data: [DONE]\n\n');return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ id: 'ui', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: !payload.tools?.length ? '整理工作台和对话界面' : '已经梳理好今天的工作。\n\n我们会先整理对话与侧栏，再完善电脑操控的实时预览。所有进展都可以在右侧工作台查看。\n\n- 任务：查看当前进展和验证结果\n- 记忆：保留项目约定与重要决定\n- 电脑：查看网页和应用的实时画面\n\n接下来可以继续处理具体页面。' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    releaseReply?.();
    await cleanupFixture([
      async () => {
        if (t.passed) return;
        const ui = page && !page.isClosed() ? await page.evaluate(() => ({
          url: location.href, appearance: document.documentElement.dataset.appearance,
          rootInert: document.getElementById('root')?.inert,
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map(el => el.textContent?.slice(0, 1500)),
          composer: document.querySelector('[data-composer-card]') && getComputedStyle(document.querySelector('[data-composer-card]')).backgroundColor,
          body: document.body.innerText.slice(0, 2500),
        })).catch(error => ({ error: error.message })) : undefined;
        t.diagnostic(JSON.stringify({ ui, exitCode: child?.exitCode, signalCode: child?.signalCode, errors, browserDiagnostics, log: log.replace(/token=\S+/g, 'token=[redacted]') }));
      },
      async () => { if (process.env.TRISOUL_UI_ARTIFACTS && page && !page.isClosed()) await page.screenshot({path:join(root,'final-state.png')}); },
      () => browser?.close(),
      () => child && stopFixtureProcess(child),
      () => closeFixtureServer(provider),
      async () => { if (!process.env.TRISOUL_UI_ARTIFACTS) await rm(root, { recursive: true, force: true }); },
    ]);
  });

  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    locale: { preference: 'zh' },
    'llm-pi-ai': { providers: { fixture: { ...(imageBudget ? { maxRequestImageBytes: imageBudget } : {}), api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'FRONTEND_FIXTURE', models: [{ id: 'fixture', name: '界面预览模型', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'omd-ui-chat': chatConfig,
    'trisoul-x': { componentAutoSetup, digestEvery: 1000, flushIdleMs: 3600000, computerUseNativeBinary: join(root, 'missing-native'), computerUseChromeUserDataDir: join(root, 'chrome-profile'), ...omdConfig },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { FRONTEND_FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  if (installedPackage) {
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    const packedResult = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { cwd: repo, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 }));
    const [packed] = Array.isArray(packedResult) ? packedResult : Object.values(packedResult);
    const cli = fileURLToPath(new URL('../../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url));
    const options = { cwd: repo, env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 };
    execFileSync(process.execPath, [cli, '--profile', 'trisoul-x', '--from-default-profile', 'web', '--dump-config'], options);
    try { execFileSync(process.execPath, [cli, 'plugin', '--profile', 'trisoul-x', 'add', 'file:' + join(root, packed.filename)], options); }
    catch (error) { throw new Error('Packed plugin installation failed: ' + String(error.stderr || error.stdout || error.message).replace(/token=\S+/g, 'token=[redacted]')); }
  }
  const lifecycleFile = join(root, 'lifecycle.jsonl');
  if (lifecycleTrace || historyMessages || legacyShadows || legacyChatConfig) {
    if (!installedPackage) execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url)), '--profile', 'trisoul-x', '--from-default-profile', 'web', '--dump-config'], { cwd: new URL('../../', import.meta.url), env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'ignore', 'pipe'] });
    const directory = join(home, 'profiles', 'trisoul-x');
    await writeFile(lifecycleFile, '');
    const traceModule = join(root, 'lifecycle-trace.mjs');
    await writeFile(traceModule, await readFile(new URL('./lifecycle-trace.mjs', import.meta.url), 'utf8'));
    const entries = lifecycleTrace ? [{ id: 'omd-test-lifecycle', name: pathToFileURL(traceModule).href, config: { file: lifecycleFile } }] : [];
    if (historyMessages || legacyShadows) {
      const seedModule = join(root, 'history-seed.mjs');
      await writeFile(seedModule, `import { createUserMessage, createMessage } from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-llm'))};
export const inject = ['sessions'];
export function apply(ctx) { let seeded = false; ctx.on('session/created', session => {
  if (seeded) return; seeded = true;
  for (let i = 0; i < ${Number(historyMessages)}; i++) {
    const turn = i + 1; session.append('turn/start', { turn });
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '历史样本 ' + i }], source: { kind: 'user' } }), { surfaceOp: 'append' });
    session.append('step/start', { turn, step: 1 });
    session.append('assistant/message', { turn, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [{ type: 'text', text: '历史回答 ' + i }] }) }, { surfaceOp: 'append' });
    session.append('step/end', { turn, step: 1 });
    session.append('turn/end', { turn, reason: { kind: 'completed' } });
  }
}, { global: true });
  let shadowed = false;
  if (${Boolean(legacyShadows)}) ctx.on('agent/status', async ({ agent, status }) => {
    if (status !== 'idle' || shadowed || !agent.session.snapshotEvents().some(e => e.type === 'turn/end')) return;
    shadowed = true;
    for (const content of [[], [{ type: 'text', text: '' }]]) {
      agent.session.append('user/message', createUserMessage({ content, source: { kind: 'plugin:trisoul-x:shadow' } }), { surfaceOp: 'append' });
    }
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'SHADOW_FIXTURE_ORIGINAL' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
    await ctx.sessions.flush(agent.session);
  }, { global: true });
}`);
      entries.push({ id: 'omd-test-history', name: pathToFileURL(seedModule).href });
    }
    await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify([
      ...entries.length ? [{ insert: entries }] : [],
      ...legacyChatConfig ? [{ id: 'omd-ui-chat', config: legacyChatConfig }] : [],
    ]));
    if (legacyChatConfig) await writeFile(join(directory, '.omd-ui-chat-settings-v4.json'), JSON.stringify({ imported: Object.keys(legacyChatConfig) }));
  }
  child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log = (log + data).slice(-15000); });
  child.stderr.on('data', data => { log = (log + data).slice(-15000); });
  const bootstrap = await until(() => { if (child.exitCode !== null) throw new Error(log.replace(/token=\S+/g, 'token=[redacted]')); return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; }, 45000).catch(error => { throw new Error(error.message + '\n' + log.replace(/token=\S+/g, 'token=[redacted]')); });
  const origin = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const response = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: request === undefined ? {} : { request } } }) });
    const value = await response.json(); if (!value.result?.ok) throw new Error(JSON.stringify(value) + '\n' + log.replace(/token=\S+/g, 'token=[redacted]')); return value.result.value;
  };
  await until(async () => (await rpc('llm/listProviders')).some(provider => provider.id === 'fixture'));
  const registered = await rpc('workspace/create', { path: workspace });
  const { sessionId } = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset });
  if (!historyMessages) await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '整理工作台和对话界面' }] });
  await until(async () => (await (await fetch(origin + '/trisoul-x/api/state?session=' + sessionId, {headers:{cookie}})).json()).running === 'idle');
  if (historyMessages) await rpc('session/rename', { sessionId, title: '整理工作台和对话界面' });
  if (headless) return { root, home, workspace, origin, rpc, sessionId, errors, html: () => fetch(origin, { headers: { cookie } }).then(r => r.text()), replyWith(factory) { replyFactory = factory; },
    async api(path, body) { const r = await fetch(origin + '/trisoul-x/api' + path, { headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) }); if (!r.ok) throw Error(await r.text()); return r.json(); }, lifecycle: () => readFile(lifecycleFile, 'utf8'), log: () => log.replace(/token=\S+/g, 'token=[redacted]'),
    async call(method, args) {
      const response = await fetch(origin + '/api/' + method, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }),
      });
      return response.json();
    },
  };
  const proxy = basePath === '/' ? {url: origin+'/', escaped: []} : await subpathProxy(t, origin, basePath);
  const browserOrigin = new URL(proxy.url).origin;
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', locale: 'zh-CN' });
  await context.addCookies(cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: browserOrigin }; }));
  page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) browserDiagnostics.push(message.text()); });
  // Version-indicator fixtures never depend on public GitHub/network availability.
  const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  await page.route(/\/trisoul-x\/api\/version(?:\?.*)?$/, async route => {
    const value = typeof versionResponse === 'function' ? await versionResponse() : versionResponse || { currentVersion: version, latestVersion: version, status: 'current', severity: 'none', releases: [], checkedAt: Date.now() };
    await route.fulfill({ json: value });
  });
  await page.goto(proxy.url);
  const welcome = page.getByRole('button', { name: '继续', exact: true });
  const failedBoot = page.getByText('Failed to load plugins', { exact: true });
  await welcome.or(failedBoot).waitFor();
  if (await failedBoot.isVisible()) throw Error('Browser boot failed: ' + [...errors, ...browserDiagnostics].join('\n').replace(/https?:\/\/[^\s)]+/g, '[bundle]') + '\n' + log.replace(/token=\S+/g, 'token=[redacted]'));
  await welcome.click();
  await welcome.waitFor({ state: 'hidden', timeout: process.platform === 'win32' ? 30000 : 10000 });
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  return { root, home, workspace, page, context, rpc, sessionId, errors, escapedPaths: proxy.escaped, diagnostics: () => browserDiagnostics, lifecycle: () => readFile(lifecycleFile, 'utf8'), log: () => log.replace(/token=\S+/g, 'token=[redacted]'), replyWith(factory){replyFactory=factory;}, holdNextReply() {
    nextReply = new Promise(resolve => { releaseReply = resolve; });
    return () => releaseReply?.();
  } };
}
