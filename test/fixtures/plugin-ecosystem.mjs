// Observes the real host; it registers no tools, skills, providers or UI slots.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, realpath, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { stopFixtureProcess, cleanupFixture, closeFixtureServer } from './process.mjs';
import { launchFixtureBrowser } from './browser.mjs';
import { createOwnedDirectory, assertRetiredMonitor, assertStoppedMonitor } from './ownership-cleanup.mjs';
import { cleanEnvironment } from '../../scripts/simulator/host.mjs';
import { ProcessMonitor } from '../../scripts/simulator/processes.mjs';

const exec = promisify(execFile);
const redact = value => String(value).replace(/token=[\w-]+/g, 'token=[redacted]');
export const inject = ['webServer', 'connection', 'tools', 'agents', 'sessions'];
export function apply(ctx) {
  const modelRoutes = [], modelDenials = [];
  ctx.on('llm/stream', (request, next) => {
    const route = { provider: request.provider, model: request.model, sessionId: request.sessionId };
    if (request.provider !== 'ecosystem' || request.model !== 'ecosystem') {
      modelDenials.push(route); throw Error('Ecosystem refused an unconfigured model route: ' + JSON.stringify(route));
    }
    modelRoutes.push(route); return next();
  }, { global: true });
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
        skills: catalog.map(skill => ({ name: skill.name, provider: skill.provider })), skillError, modelRoutes, modelDenials,
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

export async function ecosystemFixture({ root, cli, isolation = 'native', storeDir, installTimeoutMs = 180000, extraLoopbackPorts = [], monitorEvidenceDir, onMonitorCleanup = () => {} }) {
  if (!Array.isArray(extraLoopbackPorts) || extraLoopbackPorts.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw Error('Invalid owned loopback port');
  if (!Number.isSafeInteger(installTimeoutMs) || installTimeoutMs < 1000) throw Error('Installation deadline must be at least one second');
  if (typeof onMonitorCleanup !== 'function') throw Error('Monitor cleanup observer must be a function');
  if (!['native', 'process'].includes(isolation) || isolation === 'native' && process.platform !== 'darwin') throw Error('Native ecosystem isolation requires macOS; process isolation must be explicit');
  root = await realpath(root); cli = await realpath(resolve(cli));
  const home = join(root, 'home'), workspace = join(root, 'workspace'), profile = 'ecosystem';
  for (const path of [home, workspace, join(root, 'tmp'), ...['config','cache/corepack','data','state','pi-agent','bin'].map(path => join(home, path))]) await mkdir(path, { recursive: true });
  const anchor = createRequire(join(dirname(cli), '../package.json'));
  const hostVersion = JSON.parse(await readFile(anchor.resolve('@deepseek-ai/dsh/package.json'), 'utf8')).version;
  const installEnv = cleanEnvironment(root, home);
  // Native CLI installation must retain its own compatibility and build decisions.
  delete installEnv.NODE_OPTIONS;
  const env = { ...installEnv, NODE_OPTIONS: '--import=' + pathToFileURL(fileURLToPath(new URL('../../scripts/simulator/network-guard.mjs', import.meta.url))).href };
  const requests = [], protocolErrors = [], issued = new Set(), monitorCleanups = [];
  let child, browser, origin, cookie, monitor, acknowledgements, stopping, stop, log = '', boots = 0, welcomed = false, ready = false;
  const provider = createServer(async (req, res) => {
    try {
      if (req.url !== '/v1/chat/completions' || req.method !== 'POST') throw Error('Unexpected model route: ' + req.method + ' ' + req.url);
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8 * 1024 * 1024) throw Error('Model request too large'); }
      const payload = JSON.parse(body);
      if (payload.model !== 'ecosystem' || !Array.isArray(payload.messages)) throw Error('Unexpected model or messages');
      requests.push(payload);
      const texts = message => typeof message.content === 'string' ? [message.content] : Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text) : [];
      const marker = [...payload.messages].reverse().filter(message => message.role === 'user').flatMap(texts).find(text => /^ECO_CHECK:(read|skill)(?::[a-z0-9-]+)?:[a-z0-9-]+\s*$/.test(text));
      // Quoted markers in title/ContextPipeline/Dream inputs are auxiliary
      // requests, not permission to issue another primary business tool call.
      const match = marker && /^ECO_CHECK:(read|skill)(?::([a-z0-9-]+))?:([a-z0-9-]+)\s*$/.exec(marker);
      await appendFile(join(root, 'model-requests.jsonl'), JSON.stringify({ lane: match ? 'primary-marker' : 'auxiliary', payload }) + '\n');
      let delta = { content: 'ECO_SYSTEM_COMPLETE' };
      if (match && payload.tools?.length && !issued.has(match[3]) && payload.messages.at(-1)?.role !== 'tool') {
        issued.add(match[3]);
        const name = match[1] === 'read' ? 'read' : 'skill';
        const args = match[1] === 'read' ? { file_path: join(workspace, 'probe.txt') } : { name: match[2] ?? 'open-design' };
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
  try {
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
      // This first-stage ecology checks non-CU capabilities; the fixed legacy CU
      // snapshot is not a prerequisite or an installation-time runtime download.
      'trisoul-x': { computerUseEnabled: false, componentAutoSetup: false,
        unifiedBackground: { provider: 'ecosystem', model: 'ecosystem', effort: 'off' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem' },
    }));
    await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { ECOSYSTEM_ONLY_KEY: 'local-only-synthetic' } }), { mode: 0o600 });

    const cliRun = async args => {
      const startedAt = Date.now();
      // dsh intentionally sanitizes npm_config_* before spawning pnpm. Forward
      // the documented pnpm flag on every add/remove, rather than silently
      // falling back to the per-HOME store (or an unexpected-store failure).
      const forwarded = storeDir && args[0] === 'plugin' && args.some(arg => ['add', 'remove'].includes(arg)) ? [...args, '--store-dir', storeDir] : args;
      try { const value = await exec(process.execPath, [cli, ...forwarded], { cwd: workspace, env: installEnv, timeout: installTimeoutMs, maxBuffer: 8 * 1024 * 1024 }); return { ok: true, exitCode: 0, elapsedMs: Date.now() - startedAt, argv: forwarded, stdout: redact(value.stdout), stderr: redact(value.stderr) }; }
      catch (error) { return { ok: false, code: error.code, exitCode: error.code, status: error.status, signal: error.signal, killed: error.killed === true, elapsedMs: Date.now() - startedAt,
        timeoutMs: installTimeoutMs, argv: forwarded, diagnostic: redact(error.message), stdout: redact(error.stdout ?? ''), stderr: redact(error.stderr ?? error.message) }; }
    };
    const initialized = await cliRun(['--profile', profile, '--from-default-profile', 'web', '--dump-config']);
    if (!initialized.ok) throw Object.assign(Error('Native profile creation failed: ' + initialized.stderr), { diagnostic: initialized });
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
    stop = async () => {
      stopping ??= (async () => {
        const owned = child, observed = monitor, ownedAcks = acknowledgements, currentBrowser = browser, boot = boots;
        child = undefined; monitor = undefined; acknowledgements = undefined; browser = undefined;
        let snapshot, removal;
        // Logging and browser errors must not skip the host's ownership cleanup.
        // Retain every failure instead of a finally block replacing the original.
        await cleanupFixture([
          async () => {
            if (!owned || !ready) return;
            const observation = await request('/ecosystem-observer');
            if (observation.modelDenials.length) throw Error('Rejected ecosystem model routes during lifecycle: ' + JSON.stringify(observation.modelDenials));
            if (protocolErrors.length) throw Error('Ecosystem provider failed: ' + protocolErrors.join('; '));
          },
          () => currentBrowser?.close(),
          () => owned && writeFile(join(root, 'boot-' + boot + '.log'), log),
          async () => {
            if (!owned) return;
            try {
              if (observed?._attached) { await observed.stop(); observed.assertHealthy(); }
              // A failed spawn has no attached POSIX monitor. Windows cleanup uses
              // observed creation identities and retained handles, not taskkill /T.
              else await stopFixtureProcess(owned);
            } finally { for (const stream of owned.stdio ?? []) stream?.destroy(); owned.unref(); }
          },
          async () => {
            if (!observed) return;
            snapshot = observed.snapshot();
            await writeFile(join(root, 'processes-' + boot + '.json'), JSON.stringify(snapshot, null, 2));
          },
          async () => {
            if (!ownedAcks) return;
            snapshot ??= observed?.snapshot();
            // Preserve ACKs if a monitor can still write or a group is not retired.
            // Errors remain failures even when the stopped directory can be removed.
            if (snapshot?.attached) assertRetiredMonitor(snapshot);
            try {
              removal = await ownedAcks.cleanup({ evidenceDirectory: monitorEvidenceDir ? join(resolve(monitorEvidenceDir), 'boot-' + boot + '-' + (observed?.bootId ?? 'unattached')) : undefined });
            } catch (error) { removal = error.receipt; throw error; }
          },
          async () => {
            if (observed) assertStoppedMonitor(snapshot);
          },
          async () => {
            if (!ownedAcks) return;
            const receipt = { boot, snapshot, removal };
            monitorCleanups.push(receipt);
            await onMonitorCleanup(structuredClone(receipt));
          },
        ]);
      })();
      await stopping;
      return structuredClone(monitorCleanups);
    };
    const start = async () => {
      if (child) throw Error('Host already started');
      if (stopping) await stopping;
      stopping = undefined;
      log = ''; ready = false; boots++; let bootstrap, spawnError;
      if (process.platform !== 'win32') {
        acknowledgements = await createOwnedDirectory({ prefix: 'ecosystem-process-monitor-' });
        const ackDirectory = acknowledgements.path;
        monitor = new ProcessMonitor({ ackDirectory });
        Object.assign(env, { OMD_SIM_MONITOR_FD: '9', OMD_SIM_ACK_DIR: ackDirectory,
          OMD_SIM_PROCESS_GATE: fileURLToPath(new URL('../../scripts/simulator/process-gate.sh', import.meta.url)) });
      }
      const args = [cli, '--profile', profile, '--no-open', '--port', '0'];
      let command = process.execPath, argv = args;
      if (isolation === 'native') {
        if (process.platform !== 'darwin') throw Error('Native ecosystem isolation requires macOS');
        const allowed = [provider.address().port, ...extraLoopbackPorts].map(port => `(remote ip "localhost:${port}")`).join(' ');
        const policy = `(version 1) (allow default) (deny network-outbound) (allow network-outbound ${allowed}) (deny file-write*) (allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null") (literal "/dev/tty"))`;
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
      await request('/ecosystem-observer'); ready = true;
    };
    const inspect = id => request('/ecosystem-observer' + (id ? '?session=' + encodeURIComponent(id) : ''));
    const exercise = async (preset, skill = false) => {
      const skillNames = skill === true ? ['open-design'] : Array.isArray(skill) ? skill : [];
      if (skillNames.some(name => typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name))) throw Error('Invalid ecosystem skill expectation');
      const registered = await rpc('workspace/create', { request: { path: workspace } });
      const created = await rpc('session/create', { request: { workspaceId: registered.workspace.workspaceId, agentPreset: preset } });
      const sessionId = created.sessionId, before = requests.length;
      const selected = await rpc('session/selectModel', { request: { sessionId, provider: 'ecosystem', model: 'ecosystem' } });
      if (selected.selected?.provider !== 'ecosystem' || selected.selected?.model !== 'ecosystem') throw Error('Ecosystem fixture did not select its local model');
      for (const operation of ['read', ...skillNames.map(name => 'skill:' + name)]) {
        const previous = (await inspect(sessionId)).events.filter(event => event.type === 'turn/end').length;
        await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: `ECO_CHECK:${operation}:${randomUUID()}` }] } });
        await until(async () => { if (protocolErrors.length) throw Error(protocolErrors.join('; ')); const value = await inspect(sessionId); if (value.modelDenials.length) throw Error('Rejected ecosystem model routes: ' + JSON.stringify(value.modelDenials)); return value.agent?.status === 'idle' && value.events.filter(event => event.type === 'turn/end').length > previous && value; }, preset + ' ' + operation, 45000);
      }
      return { preset, sessionId, observer: await inspect(sessionId), requests: requests.slice(before) };
    };
    const ui = async (stage = 'settings') => {
      const browserEnv = { ...installEnv }; delete browserEnv.NODE_OPTIONS;
      browser = await launchFixtureBrowser({ env: browserEnv });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
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
        // The first acknowledgement is persisted by this isolated host, so
        // later boots normally skip it. A repeated modal is still handled below.
        if (!welcomed) { await welcome.waitFor({ timeout: 30000 }); await welcome.click(); await welcome.waitFor({ state: 'hidden' }); welcomed = true; }
        // The empty Hero may finish creating/selecting its draft after the shell
        // is clickable, closing an already-open panel. Select an actual completed
        // fixture conversation and await its native header before testing settings.
        const completed = page.getByText('ECO_SYSTEM_COMPLETE', { exact: true }).first();
        await completed.waitFor();
        if (await welcome.isVisible()) { await welcome.click(); await welcome.waitFor({ state: 'hidden' }); }
        await completed.click();
        await page.locator('.wSkVaW_header').waitFor();
        const settings = page.getByRole('button', { name: '设置', exact: true }); await settings.first().click();
        const dialog = page.getByRole('dialog', { name: '设置', exact: true }), interaction = ['settings-button'];
        // Keep an observed first-click miss in evidence. The native documented
        // shortcut still exercises the actual settings UI, without DOM mutation.
        if (!await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
          interaction.push('native-settings-shortcut');
          await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Meta+Comma' : 'Alt+Control+Comma'); await dialog.waitFor();
        }
        const text = await dialog.innerText(), iuiEntrance = await page.getByRole('button', { name: '新建智能聊天', exact: true }).count();
        await page.screenshot({ path: screenshot });
        return { text, iuiEntrance, errors, consoleErrors, failedRequests, interaction, screenshot };
      } catch (error) {
        const diagnostic = { errors, consoleErrors, failedRequests, body: await page.locator('body').innerText().catch(() => ''), screenshot };
        await page.screenshot({ path: screenshot }).catch(() => {});
        await writeFile(screenshot + '.json', JSON.stringify(diagnostic, null, 2));
        throw Error(error.message + '\nClient diagnostic: ' + JSON.stringify(diagnostic));
      } finally { await browser.close(); browser = undefined; }
    };
    // Receipts are detached observations, never cleanup capabilities. ACK path
    // authority remains exclusively in the allocator closure retained above.
    return { root, home, workspace, cli, hostVersion, profile, requests, protocolErrors, cliRun, start, stop, rpc, request, inspect, exercise, ui, log: () => log,
      monitorCleanup: () => structuredClone(monitorCleanups),
      async httpStatus(path) { const response = await fetch(origin + path, { headers: { cookie }, signal: AbortSignal.timeout(10000) }); await response.body?.cancel(); return response.status; },
      async close() { await cleanupFixture([stop, () => closeFixtureServer(provider)]); return structuredClone(monitorCleanups); } };
  } catch (error) {
    try { await cleanupFixture([() => stop?.(), () => closeFixtureServer(provider)]); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Ecosystem setup and cleanup failed', { cause: error }); }
    throw error;
  }
}
