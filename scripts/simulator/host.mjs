import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { assertFaultLedger } from './assertions.mjs';
import { ProcessMonitor } from './processes.mjs';

const exec = promisify(execFile);
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const preload = fileURLToPath(new URL('./clock-preload.mjs', import.meta.url));
const guard = fileURLToPath(new URL('./network-guard.mjs', import.meta.url));
const faults = fileURLToPath(new URL('./fault-preload.mjs', import.meta.url));
const plugin = fileURLToPath(new URL('./host-plugin.mjs', import.meta.url));
const processGate = fileURLToPath(new URL('./process-gate.sh', import.meta.url));
const redact = text => String(text).replace(/token=[\w-]+/g, 'token=[redacted]');

export async function until(fn, { timeout = 30000, signal, description = 'condition', check = () => {} } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal?.throwIfAborted(); check();
    const value = await fn(); if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw Object.assign(Error('Timed out waiting for ' + description), { code: 'SIMULATION_DEADLINE' });
}

export function cleanEnvironment(root, home) {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'),
    DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', OMD_SIMULATION: '1', OMD_SIM_ROOT: root, OMD_SIM_AUDIT: join(root, 'network.jsonl'),
    // Node children of real native tools inherit the network fence, but not the
    // host's virtual clock. Their native timers must continue to run normally.
    NODE_OPTIONS: '--import=' + pathToFileURL(guard).href,
  };
}

export class SimulationHost {
  constructor({ root, provider, models = ['simulation'], omd = {}, clock = 'virtual', isolation = 'native', dshCli, signal, trace = () => {} }) {
    this.root = realpathSync(root); this.home = join(this.root, 'home'); this.workspace = join(this.root, 'workspace');
    this.provider = provider; this.models = models; this.omd = omd; this.clockMode = clock; this.isolation = isolation;
    this.cli = resolve(dshCli || process.env.OMD_DSH_CLI || join(repoRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js'));
    this.signal = signal; this.trace = trace; this.boots = 0; this.log = ''; this.closed = false;
    this.hostTrace = join(this.root, 'host.jsonl');
    this.monitors = [];
    this.anchor = createRequire(realpathSync(join(dirname(this.cli), '../package.json')));
  }
  async prepare() {
    for (const dir of [this.home, this.workspace, join(this.root, 'tmp'), join(this.home, 'profiles/simulation/node_modules')]) await mkdir(dir, { recursive: true });
    this.version = JSON.parse(await readFile(this.anchor.resolve('@deepseek-ai/dsh/package.json'), 'utf8')).version;
    const { initProfile, PROFILE_TEMPLATES } = await import(pathToFileURL(this.anchor.resolve('@deepseek-ai/dsh-app-boot')).href);
    const profile = join(this.home, 'profiles/simulation');
    initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, 'trisoul_x']);
    const manifestPath = join(profile, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dependencies.trisoul_x = 'link:' + repoRoot;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await symlink(repoRoot, join(profile, 'node_modules/trisoul_x'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
      // The whole process already runs inside the enforcing outer sandbox.
      // macOS refuses sandbox_apply inside an existing Seatbelt sandbox, so
      // native shell tools must not try to create a second one.
      { id: 'sandbox-policy', config: { mode: 'danger-full-access', workspaceRoot: this.workspace } },
      { id: 'permission', config: { presets: { simulation: { sandbox: 'danger-full-access', approval: 'never', name: 'simulation' } }, defaultPreset: 'simulation' } },
      { insert: [{ id: 'omd-simulation', name: pathToFileURL(plugin).href, config: { traceFile: this.hostTrace, models: this.models } }] },
    ]));
    await writeFile(join(this.home, 'settings.yaml'), JSON.stringify({
      locale: { preference: 'zh' },
      'llm-pi-ai': { providers: { simulation: { api: 'openai-completions', baseURL: this.provider.baseURL, apiKeyEnv: 'OMD_SIMULATION_KEY', streamIdleTimeoutMs: 1200000,
        models: this.models.map(id => ({ id, name: '离线模拟 ' + id, contextWindow: 1000000, maxTokens: 16384, input: ['text', 'image'] })) } } },
      'agent-default-model': { provider: 'simulation', model: this.models[0] },
      'trisoul-x': { componentAutoSetup: false, computerUseEnabled: false, codegraphEnabled: false, backgroundTasksEnabled: false,
        dreamAutoEnabled: false, flushIdleMs: 0, digestEvery: 1000, coordinatorEvery: 1000,
        unifiedBackground: { provider: 'simulation', model: this.models[0], effort: 'off' }, dreamProvider: 'simulation', dreamModel: this.models[0],
        computerUseChromeUserDataDir: join(this.root, 'chrome-profile'), ...this.omd },
    }));
    await writeFile(join(this.home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { OMD_SIMULATION_KEY: 'local-simulation-only' } }), { mode: 0o600 });
    await writeFile(join(this.workspace, 'AGENTS.md'), 'Simulation workspace: keep all generated files here.\n');
    await mkdir(join(this.workspace, '.git'));
    await writeFile(this.hostTrace, ''); await writeFile(join(this.root, 'network.jsonl'), '');
    if (process.platform === 'darwin') {
      const key = createHash('sha256').update(join(this.home, 'trisoul-x/computer-use')).digest('hex').slice(0, 24);
      this.extensionDirectory = '/private/tmp/trisoul-cu-' + key;
      await mkdir(this.extensionDirectory, { mode: 0o700 });
    }
    return this;
  }
  check() {
    this.signal?.throwIfAborted();
    this.monitor?.assertHealthy();
    if (this.child && (this.child.exitCode !== null || this.child.signalCode !== null)) throw Error('DSH exited unexpectedly:\n' + this.log.slice(-5000));
    if (this.provider.errors.length) throw Object.assign(Error('Strict provider failed: ' + this.provider.errors[0].message), { code: 'SIM_PROTOCOL' });
  }
  async start({ now } = {}) {
    if (this.child) throw Error('DSH is already running');
    if (this.closed) throw Error('Simulation host is closed');
    this.signal?.throwIfAborted();
    const env = cleanEnvironment(this.root, this.home);
    env.OMD_SIM_ALLOW_PORTS = new URL(this.provider.baseURL).port;
    if (process.platform !== 'win32') {
      const ackDirectory = realpathSync(await mkdtemp(join(tmpdir(), 'omd-simulation-monitor-')));
      try {
        this.signal?.throwIfAborted();
        if (this.closed) throw Error('Simulation host closed while allocating its process monitor');
        this.monitor = new ProcessMonitor({ ackDirectory, trace: this.trace }); this.monitors.push(this.monitor);
        Object.assign(env, { OMD_SIM_MONITOR_FD: '9', OMD_SIM_ACK_DIR: ackDirectory, OMD_SIM_PROCESS_GATE: processGate });
      } catch (error) { await rm(ackDirectory, { recursive: true, force: true }); throw error; }
    }
    const args = ['--import', pathToFileURL(preload).href, '--import', pathToFileURL(faults).href, this.cli, '--profile', 'simulation', '--no-open', '--port', '0'];
    let command = process.execPath, argv = args;
    if (this.isolation === 'native') {
      if (process.platform !== 'darwin') throw Object.assign(Error('Native isolation currently requires macOS sandbox-exec. Use process isolation only when its documented boundary is acceptable.'), { code: 'ISOLATION_UNAVAILABLE' });
      const profile = '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:' + new URL(this.provider.baseURL).port + '")) (deny signal) (allow signal (target self) (target children) (target same-sandbox)) (deny file-write*) (allow file-write* (subpath ' + JSON.stringify(this.root) + ') (subpath ' + JSON.stringify(this.extensionDirectory) + ') (literal "/dev/null") (literal "/dev/tty"))';
      command = '/usr/bin/sandbox-exec'; argv = ['-p', profile, process.execPath, ...args];
    } else if (this.isolation !== 'process') throw Error('Unknown isolation: ' + this.isolation);
    this.boots++; this.log = '';
    const child = this.child = spawn(command, argv, { cwd: this.workspace, env, detached: process.platform !== 'win32',
      stdio: process.platform === 'win32' ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'pipe'] });
    child.on('error', error => { this.spawnError = error; });
    const output = data => { this.log = (this.log + redact(data)).slice(-30000); };
    // Save a private bootstrap URL in memory; never write its token to reports.
    let bootstrap;
    child.stdout.on('data', data => { const raw = String(data); bootstrap ??= raw.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; output(data); });
    child.stderr.on('data', output);
    if (this.monitor) await this.monitor.attach(child);
    await until(() => { if (this.spawnError) throw this.spawnError; return bootstrap; }, { timeout: 45000, signal: this.signal, check: () => this.check(), description: 'DSH bootstrap' });
    this.origin = new URL(bootstrap).origin; this.bootstrap = bootstrap;
    await this.authenticate();
    const registered = await this.rpc('workspace/create', { path: this.workspace });
    this.workspaceId = registered.workspace.workspaceId;
    await until(async () => (await this.rpc('llm/listProviders')).some(provider => provider.id === 'simulation'),
      { timeout: 15000, signal: this.signal, check: () => this.check(), description: 'simulation model provider' });
    await this.control('/clock'); // Also proves instrumentation was mounted.
    if (this.clockMode === 'virtual') await this.control('/clock', { enable: true, now: now ?? Date.now() });
    else if (this.clockMode !== 'real') throw Error('Unknown clock mode: ' + this.clockMode);
    // Authentication uses the host's Date too. Reissue through the unchanged
    // native login endpoint after changing its clock epoch, including restart.
    await this.authenticate();
    if (this.initialEpoch === undefined) this.initialEpoch = (await this.control('/clock')).now;
    this.trace({ type: 'host/start', boot: this.boots, pid: child.pid, version: this.version, clock: this.clockMode, isolation: this.isolation });
    return this;
  }
  async authenticate() {
    const login = await fetch(this.bootstrap, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    this.cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!this.cookie) throw Error('DSH did not issue an authenticated simulation cookie');
  }
  async request(path, body, renewed = false) {
    this.check();
    const response = await fetch(this.origin + path, { headers: { cookie: this.cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    if (response.status === 401 && !renewed) {
      await response.text(); await this.authenticate(); this.trace({ type: 'auth/renewed', reason: 'native authentication after clock movement' });
      return this.request(path, body, true);
    }
    const raw = await response.text();
    let value; try { value = JSON.parse(raw); } catch { throw Object.assign(Error(path + ': HTTP ' + response.status + ' ' + redact(raw).slice(0, 300)), { code: 'HOST_HTTP_ERROR' }); }
    if (!response.ok) throw Object.assign(Error(path + ': ' + JSON.stringify(value)), { code: 'HOST_HTTP_ERROR', status: response.status });
    return value;
  }
  async rpc(method, request, args) {
    const result = await this.request('/api/' + method, { type: 'client-request', rpcId: crypto.randomUUID(), method,
      payload: { args: args ?? (request === undefined ? {} : { request }) } });
    if (!result.result?.ok) throw Object.assign(Error(method + ': ' + JSON.stringify(result)), { code: 'HOST_RPC_ERROR' });
    return result.result.value;
  }
  api(path, body) { return this.request('/trisoul-x/api' + path, body); }
  async control(path, body) {
    const result = await this.request('/__simulation' + path, body);
    if (path === '/clock') this.clockSnapshot = result;
    return result;
  }
  async createSession({ id, preset = 'trisoul-x' } = {}) {
    const result = await this.rpc('session/create', { workspaceId: this.workspaceId, ...(id ? { sessionId: id } : {}), agentPreset: preset });
    return result.sessionId;
  }
  prompt(sessionId, text, mode = 'queue') {
    this.trace({ type: 'user/prompt', sessionId, text, mode });
    return this.rpc('session/prompt', { sessionId, requestId: crypto.randomUUID(), mode, content: [{ type: 'text', text }], clientTimeZone: 'Asia/Shanghai' });
  }
  async idle(sessionId, predicate = () => true) {
    return until(async () => { const state = await this.api('/state?session=' + sessionId);
      if (state.running === 'idle' && !state.live && await predicate(state)) return state;
      // Drive host-owned polling/yield timers while native I/O completes. This
      // is separate from explicit long deadline advances in timeout scenarios.
      if (this.clockMode === 'virtual') await this.control('/clock', { advance: 25 });
      return false;
    },
      { signal: this.signal, check: () => this.check(), description: 'idle session ' + sessionId });
  }
  async stop({ crash = false } = {}) {
    const child = this.child; if (!child) return;
    let auditError;
    try { assertFaultLedger((await this.audit()).faults); } catch (error) { auditError = error; }
    this.child = null;
    if (this.monitor) {
      try { await this.monitor.stop({ crash }); this.monitor.assertHealthy(); }
      finally { child.stdout?.destroy(); child.stderr?.destroy(); child.stdio?.[9]?.destroy(); child.unref(); }
      this.trace({ type: 'host/stop', boot: this.boots, crash, exitCode: child.exitCode, signal: child.signalCode, processMonitor: this.monitor.snapshot() });
      if (auditError) throw auditError;
      return;
    }
    const kill = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      if (process.platform === 'win32') await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(error => { if (child.exitCode === null && child.signalCode === null) throw error; });
      else kill(crash ? 'SIGKILL' : 'SIGTERM');
      let deadline;
      try { await Promise.race([exited, new Promise((_, reject) => { deadline = setTimeout(() => { kill('SIGKILL'); reject(Error('DSH shutdown timed out')); }, 5000); })]); }
      finally { clearTimeout(deadline); }
    }
    // The dedicated group can outlive its leader (for example esbuild after a
    // crash). Always reap it, including when DSH already exited on its own.
    if (process.platform !== 'win32') kill('SIGKILL');
    child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
    this.trace({ type: 'host/stop', boot: this.boots, crash, exitCode: child.exitCode, signal: child.signalCode });
    if (auditError) throw auditError;
  }
  async restart({ crash = false } = {}) {
    const now = (await this.control('/clock')).now;
    await this.stop({ crash }); await this.start({ now });
  }
  async durable(sessionId) {
    // Independent read using the actual host persistence backend, not the live
    // session projection or a simulator copy of its event state.
    const find = async dir => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { const found = await find(path); if (found) return found; }
        else if (dirname(path).endsWith(sessionId) && /^session\.v\d+\.jsonl(?:\.zstd)?$/.test(entry.name)) return path;
      }
    };
    const file = await find(this.home);
    if (!file) throw Error('No native durable session file: ' + sessionId);
    const { Context } = await import(pathToFileURL(this.anchor.resolve('@deepseek-ai/cordis')).href);
    const { default: Persistence } = await import(pathToFileURL(this.anchor.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href);
    const ctx = new Context();
    try {
      await ctx.plugin(Persistence, { root: dirname(dirname(dirname(file))), compression: file.endsWith('.zstd') ? 'zstd' : 'none' });
      const handle = await ctx.sessionPersistence.open(sessionId, 'read');
      try { return await handle.read(); } finally { await handle.close(); }
    } finally { await ctx.fiber.dispose(); }
  }
  async audit() {
    const parse = async path => (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const records = await parse(join(this.root, 'network.jsonl'));
    const host = await parse(this.hostTrace);
    const faults = await parse(join(this.root, 'faults.jsonl')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const processMonitors = this.monitors?.map(monitor => monitor.snapshot()) ?? [];
    const monitorEvents = processMonitors.flatMap(monitor => (monitor.events ?? []).map(event => event.type === 'process/untrusted-trace' ? event.event : event));
    const network = [...new Map([...records.filter(event => event.type.startsWith('network/')), ...monitorEvents.filter(event => event.type === 'network/denied')]
      .map(event => [JSON.stringify(event), event])).values()];
    return { host, faults, processMonitors, network,
      modelDenials: monitorEvents.filter(event => event.type === 'model/denied'),
      processes: [...records.filter(event => event.type.startsWith('process/')), ...host.filter(event => event.type.startsWith('process/'))] };
  }
  async close() {
    try { await this.stop(); } finally {
      this.closed = true;
      for (const monitor of this.monitors ?? []) await rm(monitor.ackDirectory, { recursive: true, force: true });
      if (this.extensionDirectory) await rm(this.extensionDirectory, { recursive: true, force: true });
    }
  }
}
