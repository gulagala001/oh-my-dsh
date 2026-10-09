// Observes the real host; it registers no tools, skills, providers or UI slots.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, realpath, rm, mkdtemp, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { cleanEnvironment } from '../../scripts/simulator/host.mjs';
import { ProcessMonitor } from '../../scripts/simulator/processes.mjs';

const exec = promisify(execFile);
const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');
export const inject = ['webServer', 'connection', 'tools', 'agents', 'sessions'];
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/ecosystem-observer', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const id = new URL(req.url, 'http://localhost').searchParams.get('session');
      const found = id && await ctx.get('sessionController')?.resolveAgent(id);
      if (found?.error) throw found.error;
      const agent = found?.agent ?? (id && ctx.agents.get(id));
      const session = agent?.session ?? (id && ctx.sessions.get(id));
      const skills = ctx.get('skills') ?? ctx.get('skill');
      let catalog = [], skillError;
      try { if (skills?.list) catalog = await skills.list({ cwd: session?.header.cwd, scope: agent }); }
      catch (error) { skillError = error.message; }
      const value = { agent: agent && { id: agent.id, status: agent.status },
        services: Object.fromEntries(['tools', 'llm', 'skills', 'skill', 'pluginManager', 'trisoulX', 'omaa'].map(name => [name, Boolean(ctx.get(name))])),
        tools: ctx.tools.schemas(agent).map(tool => ({ name: tool.name, parameters: tool.parameters })),
        skills: catalog.map(skill => ({ name: skill.name, provider: skill.provider })), skillError,
        events: session?.snapshotEvents().filter(event => ['turn/end', 'tool/call', 'tool/result'].includes(event.type)) ?? [] };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}

export async function until(fn, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error('Timed out: ' + description);
}

export async function ecosystemFixture({ root, cli, isolation = 'native', storeDir, installTimeoutMs = 180000, extraLoopbackPorts = [] }) {
  if (!Array.isArray(extraLoopbackPorts) || extraLoopbackPorts.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw Error('Invalid owned loopback port');
  root = await realpath(root); cli = await realpath(resolve(cli));
  const home = join(root, 'home'), workspace = join(root, 'workspace'), profile = 'ecosystem';
  for (const path of [home, workspace, join(root, 'tmp')]) await mkdir(path, { recursive: true });
  const anchor = createRequire(join(dirname(cli), '../package.json'));
  const hostVersion = JSON.parse(await readFile(anchor.resolve('@deepseek-ai/dsh/package.json'), 'utf8')).version;
  const installEnv = cleanEnvironment(root, home);
  // Native CLI installation must retain its own compatibility and build decisions.
  delete installEnv.NODE_OPTIONS;
  const env = { ...installEnv, NODE_OPTIONS: '--import=' + pathToFileURL(fileURLToPath(new URL('../../scripts/simulator/network-guard.mjs', import.meta.url))).href };
  const requests = [], protocolErrors = [], issued = new Set();
  const provider = createServer(async (req, res) => {
    try {
      if (req.url !== '/v1/chat/completions' || req.method !== 'POST') throw Error('Unexpected model route: ' + req.method + ' ' + req.url);
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8 * 1024 * 1024) throw Error('Model request too large'); }
      const payload = JSON.parse(body);
      if (payload.model !== 'ecosystem' || !Array.isArray(payload.messages)) throw Error('Unexpected model or messages');
      requests.push(payload);
      const texts = message => typeof message.content === 'string' ? [message.content] : Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text) : [];
      const marker = [...payload.messages].reverse().filter(message => message.role === 'user').flatMap(texts).find(text => /^ECO_CHECK:(read|skill):[a-z0-9-]+\s*$/.test(text));
      // Quoted markers in title/ContextPipeline/Dream inputs are auxiliary
      // requests, not permission to issue another primary business tool call.
      const match = marker && /^ECO_CHECK:(read|skill):([a-z0-9-]+)\s*$/.exec(marker);
      await appendFile(join(root, 'model-requests.jsonl'), JSON.stringify({ lane: match ? 'primary-marker' : 'auxiliary', payload }) + '\n');
      let delta = { content: 'ECO_SYSTEM_COMPLETE' };
      if (match && payload.tools?.length && !issued.has(match[2]) && payload.messages.at(-1)?.role !== 'tool') {
        issued.add(match[2]);
        const name = match[1] === 'read' ? 'read' : 'skill';
        const args = match[1] === 'read' ? { file_path: join(workspace, 'probe.txt') } : { name: 'open-design' };
        const ptc = payload.tools?.some(tool => tool.function.name === 'run_code');
        if (!ptc && !payload.tools?.some(tool => tool.function.name === name)) throw Error('Real wire schema lacks requested ' + name);
        delta = { tool_calls: [{ index: 0, id: 'ecosystem-' + requests.length, type: 'function', function: {
          name: ptc ? 'run_code' : name,
          arguments: JSON.stringify(ptc ? { code: `return await tools[${JSON.stringify(name)}](${JSON.stringify(args)})`, description: 'Read an installed ecosystem capability' } : args),
        } }] };
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ id: 'ecosystem', object: 'chat.completion.chunk', model: 'ecosystem', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    } catch (error) { protocolErrors.push(error.message); res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  env.OMD_SIM_ALLOW_PORTS = [provider.address().port, ...extraLoopbackPorts].join(',');
  await writeFile(join(root, 'network.jsonl'), '');
  await writeFile(join(workspace, 'probe.txt'), 'ECO_NATIVE_FILE_READ\n');
  // Repository-aware plugins must never discover this checkout as the test
  // workspace's Git root or snapshot other agents' working changes.
  for (const args of [['-c', 'init.defaultBranch=main', 'init', '--quiet', workspace],
    ['-C', workspace, 'add', '--', 'probe.txt'],
    ['-C', workspace, '-c', 'user.name=Ecosystem test', '-c', 'user.email=ecosystem@example.invalid', 'commit', '--quiet', '-m', 'Isolated ecosystem workspace']]) {
    await exec('git', args, { env: installEnv, timeout: 30000 });
  }
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ locale: { preference: 'zh' },
    'llm-pi-ai': { providers: { ecosystem: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'ECOSYSTEM_ONLY_KEY',
      models: [{ id: 'ecosystem', name: 'Local ecosystem verification', contextWindow: 1000000, maxTokens: 8192, input: ['text'] }] } } },
    'agent-default-model': { provider: 'ecosystem', model: 'ecosystem' },
    // Preserve feature switches. Configure only this synthetic model and test-owned paths.
    'trisoul-x': { unifiedBackground: { provider: 'ecosystem', model: 'ecosystem', effort: 'off' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem',
      computerUseChromeUserDataDir: join(root, 'chrome') },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { ECOSYSTEM_ONLY_KEY: 'local-only-synthetic' } }), { mode: 0o600 });
  const extensionDirectory = process.platform === 'darwin' ? '/private/tmp/trisoul-cu-' + createHash('sha256').update(join(home, 'trisoul-x/computer-use')).digest('hex').slice(0, 24) : null;
  if (extensionDirectory) await mkdir(extensionDirectory, { recursive: true, mode: 0o700 });
  const cliRun = async args => {
    const startedAt = Date.now();
    // dsh intentionally sanitizes npm_config_* before spawning pnpm. Forward
    // the documented pnpm flag on every add/remove, rather than silently
    // falling back to the per-HOME store (or an unexpected-store failure).
    const forwarded = storeDir && args[0] === 'plugin' && args.some(arg => ['add', 'remove'].includes(arg)) ? [...args, '--store-dir', storeDir] : args;
    try { const value = await exec(process.execPath, [cli, ...forwarded], { cwd: workspace, env: installEnv, timeout: installTimeoutMs, maxBuffer: 8 * 1024 * 1024 }); return { ok: true, exitCode: 0, elapsedMs: Date.now() - startedAt, argv: forwarded, stdout: redact(value.stdout), stderr: redact(value.stderr) }; }
    catch (error) { return { ok: false, exitCode: error.code, signal: error.signal, killed: error.killed, elapsedMs: Date.now() - startedAt,
      timeoutMs: installTimeoutMs, diagnostic: redact(error.message), stdout: redact(error.stdout ?? ''), stderr: redact(error.stderr ?? error.message) }; }
  };
  const initialized = await cliRun(['--profile', profile, '--from-default-profile', 'web', '--dump-config']);
  if (!initialized.ok) { provider.closeAllConnections(); provider.close(); throw Error('Native profile creation failed: ' + initialized.stderr); }
  // Client discovery associates URL-mounted rows with the nearest package.
  // Referencing this repository's fixture would accidentally inject OMD Client
  // into an original-host control. Give the pure observer its own identity.
  const observerDirectory = join(root, 'observer'); await mkdir(observerDirectory);
  await writeFile(join(observerDirectory, 'package.json'), JSON.stringify({ name: 'ecosystem-test-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  await writeFile(join(observerDirectory, 'index.mjs'), `export const inject = ${JSON.stringify(inject)};\nexport const apply = ${apply.toString()};\n`);
  await writeFile(join(home, 'profiles', profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'sandbox-policy', config: { mode: 'danger-full-access', workspaceRoot: workspace } },
    { id: 'approval', config: { policy: 'never' } },
    { insert: [{ id: 'ecosystem-observer', name: pathToFileURL(join(observerDirectory, 'index.mjs')).href }] },
  ]));
  let child, browser, origin, cookie, monitor, log = '', boots = 0, welcomed = false;
  const request = async (path, body) => {
    const response = await fetch(origin + path, { headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    const text = await response.text(); let value;
    try { value = JSON.parse(text); } catch { throw Error(path + ': ' + response.status + ' ' + text.slice(0, 300)); }
    if (!response.ok) throw Error(path + ': ' + response.status + ' ' + JSON.stringify(value));
    return value;
  };
  const rpc = async (method, args = {}) => {
    const result = await request('/api/' + method, { type: 'client-request', rpcId: randomUUID(), method, payload: { args } });
    if (!result.result?.ok) throw Error(method + ': ' + JSON.stringify(result));
    return result.result.value;
  };
  const stop = async () => {
    if (browser) { await browser.close(); browser = undefined; }
    if (!child) return;
    await writeFile(join(root, 'boot-' + boots + '.log'), log);
    const owned = child; child = undefined;
    if (monitor) {
      try { await monitor.stop(); monitor.assertHealthy(); await writeFile(join(root, 'processes-' + boots + '.json'), JSON.stringify(monitor.snapshot(), null, 2)); }
      finally { owned.stdout.destroy(); owned.stderr.destroy(); owned.stdio[9]?.destroy(); owned.unref(); monitor = undefined; }
      return;
    }
    const kill = signal => { try { if (process.platform === 'win32') owned.kill(signal); else process.kill(-owned.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    if (owned.exitCode === null && owned.signalCode === null) {
      const exited = once(owned, 'exit'); kill('SIGTERM');
      let timer;
      try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => { kill('SIGKILL'); reject(Error('Host did not stop')); }, 10000); })]); }
      finally { clearTimeout(timer); }
    }
    if (process.platform !== 'win32') kill('SIGKILL');
    owned.stdout.destroy(); owned.stderr.destroy(); owned.unref();
  };
  const start = async () => {
    if (child) throw Error('Host already started');
    log = ''; boots++; let bootstrap, spawnError;
    if (process.platform !== 'win32') {
      const ackDirectory = await realpath(await mkdtemp(join(tmpdir(), 'ecosystem-process-monitor-')));
      monitor = new ProcessMonitor({ ackDirectory });
      Object.assign(env, { OMD_SIM_MONITOR_FD: '9', OMD_SIM_ACK_DIR: ackDirectory,
        OMD_SIM_PROCESS_GATE: fileURLToPath(new URL('../../scripts/simulator/process-gate.sh', import.meta.url)) });
    }
    const args = [cli, '--profile', profile, '--no-open', '--port', '0'];
    let command = process.execPath, argv = args;
    if (isolation === 'native') {
      if (process.platform !== 'darwin') throw Error('Native ecosystem isolation requires macOS');
      const allowed = [provider.address().port, ...extraLoopbackPorts].map(port => `(remote ip "localhost:${port}")`).join(' ');
      const policy = `(version 1) (allow default) (deny network-outbound) (allow network-outbound ${allowed}) (deny file-write*) (allow file-write* (subpath ${JSON.stringify(root)}) (subpath ${JSON.stringify(extensionDirectory)}) (literal "/dev/null") (literal "/dev/tty"))`;
      command = '/usr/bin/sandbox-exec'; argv = ['-p', policy, process.execPath, ...args];
    } else if (isolation !== 'process') throw Error('Unknown isolation');
    child = spawn(command, argv, { cwd: workspace, env, detached: process.platform !== 'win32',
      stdio: process.platform === 'win32' ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'pipe'] });
    child.on('error', error => { spawnError = error; });
    child.stdout.on('data', chunk => { bootstrap ??= String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; log = (log + redact(chunk)).slice(-100000); });
    child.stderr.on('data', chunk => { log = (log + redact(chunk)).slice(-100000); });
    if (monitor) await monitor.attach(child);
    await until(() => { if (spawnError) throw spawnError; if (child.exitCode !== null) throw Error(log); return bootstrap; }, 'host bootstrap', 45000);
    origin = new URL(bootstrap).origin;
    const login = await fetch(bootstrap, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!cookie) throw Error('No native authentication cookie');
    await until(async () => (await rpc('llm/listProviders')).some(provider => provider.id === 'ecosystem'), 'local provider');
    await request('/ecosystem-observer');
  };
  const inspect = id => request('/ecosystem-observer' + (id ? '?session=' + encodeURIComponent(id) : ''));
  const exercise = async (preset, skill = false) => {
    const registered = await rpc('workspace/create', { request: { path: workspace } });
    const created = await rpc('session/create', { request: { workspaceId: registered.workspace.workspaceId, agentPreset: preset } });
    const sessionId = created.sessionId, before = requests.length;
    for (const operation of ['read', ...(skill ? ['skill'] : [])]) {
      const previous = (await inspect(sessionId)).events.filter(event => event.type === 'turn/end').length;
      await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: `ECO_CHECK:${operation}:${randomUUID()}` }] } });
      await until(async () => { if (protocolErrors.length) throw Error(protocolErrors.join('; ')); const value = await inspect(sessionId); return value.agent?.status === 'idle' && value.events.filter(event => event.type === 'turn/end').length > previous && value; }, preset + ' ' + operation, 45000);
    }
    return { preset, sessionId, observer: await inspect(sessionId), requests: requests.slice(before) };
  };
  const ui = async (stage = 'settings') => {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath(), args: ['--use-mock-keychain', '--password-store=basic'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    await context.addCookies(cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: origin }; }));
    await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) await route.continue(); else await route.abort(); });
    const page = await context.newPage(), errors = [], consoleErrors = [], failedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
    page.on('requestfailed', entry => failedRequests.push({ path: new URL(entry.url()).pathname, error: entry.failure()?.errorText }));
    const screenshot = join(root, stage.replace(/[^a-z0-9-]/gi, '-') + '.png');
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      const welcome = page.getByRole('button', { name: '继续', exact: true });
      // A fresh browser context must settle the host's asynchronous welcome
      // gate before any background settings button can receive a click.
      if (!welcomed) { await welcome.waitFor({ timeout: 30000 }); await welcome.click(); await welcome.waitFor({ state: 'hidden' }); welcomed = true; }
      // The empty Hero may finish creating/selecting its draft after the shell
      // is clickable, closing an already-open panel. Select an actual completed
      // fixture conversation and await its native header before testing settings.
      const completed = page.getByText('ECO_SYSTEM_COMPLETE', { exact: true }).first();
      await completed.waitFor(); await completed.click();
      await page.locator('.wSkVaW_header').waitFor();
      const settings = page.getByRole('button', { name: '设置', exact: true }); await settings.first().click();
      const dialog = page.getByRole('dialog', { name: '设置', exact: true }), interaction = ['settings-button'];
      // Keep an observed first-click miss in evidence. The native documented
      // shortcut still exercises the actual settings UI, without DOM mutation.
      if (!await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
        interaction.push('native-settings-shortcut');
        await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Meta+Comma' : 'Alt+Control+Comma'); await dialog.waitFor();
      }
      const text = await dialog.innerText(); await page.screenshot({ path: screenshot });
      return { text, errors, consoleErrors, failedRequests, interaction, screenshot };
    } catch (error) {
      const diagnostic = { errors, consoleErrors, failedRequests, body: await page.locator('body').innerText().catch(() => ''), screenshot };
      await page.screenshot({ path: screenshot }).catch(() => {});
      await writeFile(screenshot + '.json', JSON.stringify(diagnostic, null, 2));
      throw Error(error.message + '\nClient diagnostic: ' + JSON.stringify(diagnostic));
    } finally { await browser.close(); browser = undefined; }
  };
  return { root, home, workspace, cli, hostVersion, profile, requests, protocolErrors, cliRun, start, stop, rpc, request, inspect, exercise, ui, log: () => log,
    async httpStatus(path) { const response = await fetch(origin + path, { headers: { cookie }, signal: AbortSignal.timeout(10000) }); await response.body?.cancel(); return response.status; },
    async close() { const errors = []; try { await stop(); } catch (error) { errors.push(error); } provider.closeAllConnections(); try { await new Promise((resolve, reject) => provider.close(error => error ? reject(error) : resolve())); } catch (error) { errors.push(error); } try { if (extensionDirectory) await rm(extensionDirectory, { recursive: true, force: true }); } catch (error) { errors.push(error); } if (errors.length) throw new AggregateError(errors, 'Ecosystem cleanup failed'); } };
}
