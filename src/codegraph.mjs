import { createRequire } from 'node:module';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const require = createRequire(import.meta.url);
const STDERR_LIMIT = 8000;

function diagnosticTail(output, secrets, truncated) {
  // A bounded byte tail may begin in the middle of a sensitive value.
  if (truncated) output = output.slice(output.indexOf('\n') + 1 || output.length);
  // Diagnostics contain stderr only, never the environment, request arguments
  // or stdout. Redaction is not a classifier for protocol/SDK failures.
  for (const secret of secrets) output = output.split(secret).join('[redacted]');
  return output
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted]')
    .replace(/^[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted]')
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\b(Bearer|Basic)\s+[^\s,;"']+/gi, '$1 [redacted]')
    .replace(/(["']?[\w-]*(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|private[_-]?key)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '$1[redacted]')
    .slice(-STDERR_LIMIT);
}

function codegraphFailure(error) {
  if (error instanceof Error) return error;
  let message;
  try {
    message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : JSON.stringify(error);
  } catch { /* A non-serializable cancellation reason still retains its original cause. */ }
  return new Error(message || 'CodeGraph 请求失败；请重新索引当前项目后重试。', { cause: error });
}

function connectionFailure(error, connection, phase) {
  // Cancellation reasons may be plain objects before an MCP connection exists.
  const failure = codegraphFailure(error);
  if (!connection) return failure;
  // Keep the original SDK instance, code, data, cause and stack intact.
  const facts = { ...failure.facts, codegraph: { phase, ...connection.diagnostics() } };
  try { failure.facts = facts; return failure; }
  catch {
    // A frozen caller/SDK error cannot accept facts. Preserve its identity and
    // structured fields in cause rather than replacing it with a TypeError.
    const wrapped = new Error(failure.message, { cause: failure });
    wrapped.name = failure.name;
    wrapped.stack = failure.stack;
    if ('code' in failure) wrapped.code = failure.code;
    if ('data' in failure) wrapped.data = failure.data;
    wrapped.facts = facts;
    return wrapped;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw codegraphFailure(signal.reason);
}

function waitFor(promise, signal) {
  throwIfAborted(signal);
  return new Promise((resolveResult, reject) => {
    const abort = () => reject(codegraphFailure(signal.reason));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolveResult, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Dependency downloads belong to prepare(); tool processes always use the
// prepared Node directly, without a shell or a synchronous installer shim.
export function codegraphCommand(cacheDir) {
  const upstream = createRequire(require.resolve('@colbymchenry/codegraph/package.json'));
  const platform = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
  try {
    return {
      command: upstream.resolve(`${platform}/${process.platform === 'win32' ? 'node.exe' : 'node'}`),
      args: ['--liftoff-only', '--disable-warning=ExperimentalWarning', upstream.resolve(`${platform}/lib/dist/bin/codegraph.js`)],
    };
  } catch (cause) {
    if (cacheDir) {
      const version = JSON.parse(readFileSync(require.resolve('@colbymchenry/codegraph/package.json'), 'utf8')).version;
      const bundle = join(cacheDir, 'bundles', `${process.platform}-${process.arch}-${version}`);
      const command = join(bundle, process.platform === 'win32' ? 'node.exe' : 'node');
      const entry = join(bundle, 'lib/dist/bin/codegraph.js');
      if (existsSync(command) && existsSync(entry)) return { command, args: ['--liftoff-only', '--disable-warning=ExperimentalWarning', entry] };
    }
    throw new Error(`CodeGraph 平台运行时缺失（${process.platform}/${process.arch}），请重新安装插件并保留 optionalDependencies。`, { cause });
  }
}

export function codegraphEnvironment() {
  return { ...getDefaultEnvironment(), CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_DOWNLOAD: '1',
    CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_HOST_PPID: String(process.pid), NO_COLOR: '1',
    CODEGRAPH_EXPLORE_DEDUP: '0', CODEGRAPH_MCP_TOOLS: 'explore,node,search,callers,callees,impact,files,status' };
}

export async function projectDirectory(cwd, requested) {
  if (!cwd) throw new Error('CodeGraph 需要会话的工作目录。');
  const directory = await realpath(resolve(cwd, requested || '.'));
  if (!(await stat(directory)).isDirectory()) throw new Error(`CodeGraph 项目路径不是目录：${directory}`);
  return directory;
}

async function indexedRoot(directory) {
  for (let current = directory;; current = dirname(current)) {
    // The upstream runtime cache also uses ~/.codegraph. Only an actual
    // index database identifies a project, not a bundles-only cache folder.
    try { if ((await stat(join(current, '.codegraph', 'codegraph.db'))).isFile()) return current; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // A nested repository or worktree owns its project identity, even before
    // it has an index. Its own index is usable, but an outer project's is not.
    try {
      const git = await stat(join(current, '.git'));
      if (git.isDirectory() || git.isFile()) return directory;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(current) === current) return directory;
  }
}

export class CodegraphRuntime {
  constructor({ idleMs = 60_000, cacheDir, enabled = true, autoIndex = true, autoInstall = true, resolveCommand = codegraphCommand } = {}) {
    this.idleMs = idleMs;
    this.cacheDir = cacheDir;
    this.enabled = enabled;
    this.autoIndex = autoIndex;
    this.autoInstall = autoInstall;
    this.resolveCommand = resolveCommand;
    this.projects = new Map();
    this.indexing = new Map();
    this.catalogRevision = 0;
    this.connections = new Map();
    this.processes = new Set();
    this.controller = new AbortController();
    this.catalogController = new AbortController();
  }

  async prepare({ catalog = false, allowDownload = this.autoInstall } = {}) {
    if ((!this.enabled && !catalog) || this.disposed) throw new Error('CodeGraph 已关闭。');
    try { return this.resolveCommand(this.cacheDir); } catch (error) { if (!this.cacheDir) throw error; }
    if (!allowDownload) throw new Error('CodeGraph 运行时未安装；自动准备已关闭，请在基础组件页点击准备。');
    return this.preparing ??= (async () => {
      const shim = join(dirname(require.resolve('@colbymchenry/codegraph/package.json')), 'npm-shim.js');
      const env = { ...codegraphEnvironment(), CODEGRAPH_INSTALL_DIR: this.cacheDir };
      delete env.CODEGRAPH_NO_DOWNLOAD;
      await this.run(process.execPath, [shim, '--version'], { env, signal: catalog ? this.catalogController.signal : this.controller.signal });
      return this.resolveCommand(this.cacheDir);
    })().finally(() => { this.preparing = null; });
  }

  async setEnabled(enabled) {
    if (this.enabled === enabled) return;
    if (!enabled) { this.enabled = false; await this.stop(); }
    else { this.controller = new AbortController(); this.enabled = true; this.retryCatalog(); }
  }

  retryCatalog() { this.catalogPromise = undefined; this.catalogError = null; this.catalogRevision++; }

  async ensureProject(cwd, { retry = false } = {}) {
    if (!this.enabled || this.disposed) throw new Error('CodeGraph 已关闭。');
    const directory = await indexedRoot(await projectDirectory(cwd));
    let state = this.projects.get(directory);
    if (state?.pending) return state.pending;
    if (state?.status === 'ready') return directory;
    if (state?.status === 'error' && !retry) throw new Error(state.error);
    state = { path: directory, status: 'preparing', error: null };
    this.projects.set(directory, state);
    state.pending = (async () => {
      try {
        await this.prepare();
        await this.index({}, { cwd: directory });
        state.status = 'ready'; return directory;
      } catch (error) { const failure = codegraphFailure(error); state.status = 'error'; state.error = failure.message; throw failure; }
      finally { state.pending = null; }
    })();
    return state.pending;
  }

  status() {
    let installed = false;
    try { this.resolveCommand(this.cacheDir); installed = true; } catch {}
    return { enabled: this.enabled, installed, preparing: !!this.preparing, error: this.catalogError || null,
      projects: [...this.projects.values()].map(({ path, status, error }) => ({ path, status, error })) };
  }

  async connect(directory, signal, { catalog = false } = {}) {
    throwIfAborted(signal);
    throwIfAborted((catalog ? this.catalogController : this.controller).signal);
    const launch = await this.prepare({ catalog });
    throwIfAborted(signal);
    const client = new Client({ name: 'oh-my-dsh', version: '1' });
    const transport = new StdioClientTransport({ ...launch,
      args: [...launch.args, 'serve', '--mcp', '--path', directory],
      cwd: directory, env: codegraphEnvironment(), stderr: 'pipe' });
    const secrets = Object.entries(process.env)
      .filter(([key, value]) => value && /token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|private[_-]?key/i.test(key))
      .map(([, value]) => value).sort((a, b) => b.length - a.length);
    let stderrTail = Buffer.alloc(0), truncated = false;
    const connection = { client, transport, directory, command: launch.command, pid: null,
      handshakeComplete: false, closed: false, closeObserved: false, closeRequested: false, catalog };
    connection.diagnostics = () => ({ directory: connection.directory, command: connection.command,
      pid: connection.pid, transportPid: transport.pid, handshakeComplete: connection.handshakeComplete, closed: connection.closed,
      closeObserved: connection.closeObserved, closeRequested: connection.closeRequested, catalog,
      stderrTail: diagnosticTail(stderrTail.toString('utf8'), secrets, truncated), stderrTruncated: truncated });
    transport.stderr.on('data', chunk => {
      const output = Buffer.concat([stderrTail, Buffer.from(chunk)]);
      truncated ||= output.length > STDERR_LIMIT;
      stderrTail = Buffer.from(output.subarray(-STDERR_LIMIT));
    });
    this.processes.add(connection);
    client.onclose = () => {
      connection.closed = true;
      connection.closeObserved = true;
    };
    // Capture the public PID before the SDK clears it on close, including a
    // handshake failure. Keep the base transport (and its negotiation) intact.
    const start = transport.start.bind(transport);
    transport.start = async () => {
      const starting = start();
      connection.pid = transport.pid ?? connection.pid;
      try { await starting; }
      finally { connection.pid = transport.pid ?? connection.pid; }
    };
    try {
      await client.connect(transport, { signal, timeout: 30_000 });
      connection.handshakeComplete = true;
      return connection;
    } catch (error) {
      const failure = connectionFailure(error, connection, 'connect');
      try { await this.close(connection); } catch {}
      throw failure;
    }
  }

  async close(connection) {
    connection.closeRequested = true;
    if (!connection.closing) connection.closing = (async () => {
      try { await connection.client.close(); }
      finally { connection.closed = true; this.processes.delete(connection); }
    })();
    await connection.closing;
  }

  catalog() {
    return this.catalogPromise ??= (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'oh-my-dsh-codegraph-'));
      let connection, failure;
      try {
        connection = await this.connect(directory, this.catalogController.signal, { catalog: true });
        const { tools } = await connection.client.listTools();
        return { tools, instructions: connection.client.getInstructions() || '' };
      } catch (error) {
        failure = connectionFailure(error, connection, 'catalog');
        throw failure;
      } finally {
        try {
          if (connection) await this.close(connection);
          await rm(directory, { recursive: true, force: true });
        } catch (error) {
          if (!failure) throw connectionFailure(error, connection, 'catalog-close');
        }
      }
    })().catch(error => { this.catalogPromise = undefined; this.catalogError = error.message; throw error; });
  }

  async call(name, args, { cwd, signal, sessionKey = 'metadata' }) {
    if (!this.enabled) throw new Error('CodeGraph 已关闭。');
    const combined = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    throwIfAborted(combined);
    const directory = await indexedRoot(await projectDirectory(cwd, args.projectPath));
    if (this.autoIndex) {
      try { await waitFor(this.ensureProject(directory), combined); }
      catch (error) { throw codegraphFailure(error); }
    }
    throwIfAborted(combined);
    const connectionKey = JSON.stringify([directory, sessionKey]);
    let entry = this.connections.get(connectionKey);
    if (!entry) {
      entry = { busy: 0, timer: null };
      // Startup belongs to the runtime; one cancelled caller must not abort
      // another session's shared connection handshake.
      entry.ready = this.connect(directory, this.controller.signal).then(connection => entry.connection = connection);
      this.connections.set(connectionKey, entry);
    }
    clearTimeout(entry.timer);
    entry.busy++;
    try {
      const connection = await waitFor(entry.ready, combined);
      throwIfAborted(combined);
      if (connection.closed) throw new Error('CodeGraph 连接已关闭，请重试。');
      return await connection.client.callTool({ name, arguments: { ...args, projectPath: directory } },
        { signal: combined, timeout: 120_000 });
    } catch (error) {
      // Never replay a failed call. A later call reconnects after a crash.
      const connection = entry.connection;
      const failure = connectionFailure(error, connection, 'call');
      if ((!connection && !combined.aborted) || connection?.closed) {
        if (this.connections.get(connectionKey) === entry) this.connections.delete(connectionKey);
        if (connection) try { await this.close(connection); } catch {}
      }
      throw failure;
    } finally {
      entry.busy--;
      if (!entry.busy && this.connections.get(connectionKey) === entry) {
        entry.timer = setTimeout(() => {
          this.connections.delete(connectionKey);
          void entry.ready.then(connection => this.close(connection)).catch(() => {});
        }, this.idleMs);
        entry.timer.unref();
      }
    }
  }

  async index({ projectPath } = {}, { cwd, signal }) {
    const combined = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    throwIfAborted(combined);
    const directory = await projectDirectory(cwd, projectPath);
    if (this.indexing.has(directory)) return waitFor(this.indexing.get(directory), combined);
    const pending = this.buildIndex(directory, combined);
    this.indexing.set(directory, pending);
    try {
      const result = await pending;
      const state = this.projects.get(directory);
      if (state) { state.status = 'ready'; state.error = null; }
      return result;
    } catch (error) {
      const failure = codegraphFailure(error);
      const state = this.projects.get(directory);
      if (state) { state.status = 'error'; state.error = failure.message; }
      throw failure;
    }
    finally { if (this.indexing.get(directory) === pending) this.indexing.delete(directory); }
  }

  async buildIndex(directory, combined) {
    const launch = await this.prepare();
    let initialized = false;
    try { initialized = (await stat(join(directory, '.codegraph', 'codegraph.db'))).isFile(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    throwIfAborted(combined);
    // Sync existing graphs, including a partially indexed graph left by an
    // interrupted init. Never silently return "already initialized" instead.
    const args = initialized ? ['sync', directory] : ['init', directory, '--yes'];
    return this.run(launch.command, [...launch.args, ...args], { cwd: directory, signal: combined });
  }

  run(command, args, { cwd, signal: combined, env = codegraphEnvironment() }) {
    throwIfAborted(combined);
    return new Promise((resolveResult, reject) => {
      let output = '', killTimer;
      const child = spawn(command, args, {
        cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const job = { child, done: null };
      this.processes.add(job);
      const append = chunk => { output = (output + chunk).slice(-64_000); };
      child.stdout.on('data', append); child.stderr.on('data', append);
      const abort = () => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2000); killTimer.unref();
      };
      combined.addEventListener('abort', abort, { once: true });
      if (combined.aborted) abort();
      job.done = new Promise(done => {
        child.once('error', reject);
        child.once('close', (code, exitSignal) => {
          clearTimeout(killTimer); combined.removeEventListener('abort', abort); this.processes.delete(job); done();
          if (combined.aborted) reject(codegraphFailure(combined.reason));
          else if (code !== 0) reject(new Error(`CodeGraph 运行失败（${code ?? exitSignal}）：\n${output}`));
          else resolveResult(output || 'CodeGraph 已就绪。');
        });
      });
    });
  }

  async dispose() {
    this.disposed = true;
    this.catalogController.abort(new Error('CodeGraph 已停止。'));
    await this.stop();
    await Promise.allSettled([...this.processes].filter(p => p.catalog).map(p => this.close(p)));
  }

  async stop() {
    this.controller.abort(new Error('CodeGraph 已停止。'));
    for (const entry of this.connections.values()) clearTimeout(entry.timer);
    this.connections.clear();
    this.projects.clear();
    await Promise.allSettled([...this.processes].filter(p => !p.catalog).map(process => process.child ? process.done : this.close(process)));
  }
}
