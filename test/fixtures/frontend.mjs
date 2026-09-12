import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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

export async function frontendFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-frontend-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  await mkdir(home); await mkdir(workspace);
  let nextReply, releaseReply;
  const provider = createServer(async (req, res) => {
    let request = ''; for await (const chunk of req) request += chunk; const payload = JSON.parse(request);
    if (payload.tools?.length && nextReply) { const waiting = nextReply; nextReply = null; await waiting; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ id: 'ui', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: !payload.tools?.length ? '整理工作台和对话界面' : '已经梳理好今天的工作。\n\n我们会先整理对话与侧栏，再完善电脑操控的实时预览。所有进展都可以在右侧工作台查看。\n\n- 任务：查看当前进展和验证结果\n- 记忆：保留项目约定与重要决定\n- 电脑：查看网页和应用的实时画面\n\n接下来可以继续处理具体页面。' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'FRONTEND_FIXTURE', models: [{ id: 'fixture', name: '界面预览模型', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'trisoul-x': { stateEnabled: false, probeEnabled: false, digestEvery: 1000, flushIdleMs: 3600000, computerUseNativeBinary: join(root, 'missing-native') },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { FRONTEND_FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', browser, page; const errors = [];
  child.stdout.on('data', data => { log = (log + data).slice(-15000); });
  child.stderr.on('data', data => { log = (log + data).slice(-15000); });
  t.after(async () => {
    releaseReply?.();
    await cleanupFixture([
      async () => { if (process.env.TRISOUL_UI_ARTIFACTS && page && !page.isClosed()) await page.screenshot({path:join(root,'final-state.png')}); },
      () => browser?.close(),
      () => stopFixtureProcess(child),
      () => closeFixtureServer(provider),
      async () => { if (!process.env.TRISOUL_UI_ARTIFACTS) await rm(root, { recursive: true, force: true }); },
    ]);
  });
  const bootstrap = await until(() => { if (child.exitCode !== null) throw new Error(log.replace(/token=\S+/g, 'token=[redacted]')); return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; }, 45000).catch(error => { throw new Error(error.message + '\n' + log.replace(/token=\S+/g, 'token=[redacted]')); });
  const origin = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const response = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) });
    const value = await response.json(); if (!value.result?.ok) throw new Error(JSON.stringify(value)); return value.result.value;
  };
  const registered = await rpc('workspace/create', { path: workspace });
  const { sessionId } = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' });
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '整理工作台和对话界面' }] });
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', locale: 'zh-CN' });
  await context.addCookies(cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: origin }; }));
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  return { root, home, page, context, rpc, sessionId, errors, holdNextReply() {
    nextReply = new Promise(resolve => { releaseReply = resolve; });
    return () => releaseReply?.();
  } };
}
