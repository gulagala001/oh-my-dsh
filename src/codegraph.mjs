import { createRequire } from 'node:module';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const require = createRequire(import.meta.url);

function waitFor(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolveResult, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Invoke the bundled Node directly: no shell, global install, download fallback,
// or synchronous npm shim between DSH and the process it must stop.
export function codegraphCommand() {
  const upstream = createRequire(require.resolve('@colbymchenry/codegraph/package.json'));
  const platform = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
  try {
    return {
      command: upstream.resolve(`${platform}/${process.platform === 'win32' ? 'node.exe' : 'node'}`),
      args: ['--liftoff-only', '--disable-warning=ExperimentalWarning', upstream.resolve(`${platform}/lib/dist/bin/codegraph.js`)],
    };
  } catch (cause) {
    throw new Error(`CodeGraph 平台运行时缺失（${process.platform}/${process.arch}），请重新安装插件并保留 optionalDependencies。`, { cause });
  }
}

export function codegraphEnvironment() {
  return { ...getDefaultEnvironment(), CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_DOWNLOAD: '1',
    CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_HOST_PPID: String(process.pid), NO_COLOR: '1' };
}

export async function projectDirectory(cwd, requested) {
  if (!cwd) throw new Error('CodeGraph 需要会话的工作目录。');
  const directory = await realpath(resolve(cwd, requested || '.'));
  if (!(await stat(directory)).isDirectory()) throw new Error(`CodeGraph 项目路径不是目录：${directory}`);
  return directory;
}

async function indexedRoot(directory) {
  for (let current = directory;; current = dirname(current)) {
    try { if ((await stat(join(current, '.codegraph'))).isDirectory()) return current; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(current) === current) return directory;
  }
}

export class CodegraphRuntime {
  constructor({ idleMs = 60_000 } = {}) {
    this.idleMs = idleMs;
    this.connections = new Map();
    this.processes = new Set();
    this.controller = new AbortController();
  }

  async connect(directory, signal) {
    signal?.throwIfAborted();
    this.controller.signal.throwIfAborted();
    const launch = codegraphCommand();
    const client = new Client({ name: 'oh-my-dsh', version: '1' });
    const transport = new StdioClientTransport({ ...launch,
      args: [...launch.args, 'serve', '--mcp', '--path', directory],
      cwd: directory, env: codegraphEnvironment(), stderr: 'pipe' });
    let diagnostic = '';
    transport.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8000); });
    const connection = { client, transport, closed: false };
    this.processes.add(connection);
    client.onclose = () => { connection.closed = true; };
    try {
      await client.connect(transport, { signal, timeout: 30_000 });
      return connection;
    } catch (error) {
      await this.close(connection);
      throw new Error(`CodeGraph MCP 连接失败：${error.message}${diagnostic ? '\n' + diagnostic : ''}`, { cause: error });
    }
  }

  async close(connection) {
    if (!connection.closing) connection.closing = (async () => {
      try { await connection.client.close(); }
      finally { connection.closed = true; this.processes.delete(connection); }
    })();
    await connection.closing;
  }

  catalog() {
    return this.catalogPromise ??= (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'oh-my-dsh-codegraph-'));
      let connection;
      try {
        connection = await this.connect(directory, this.controller.signal);
        const { tools } = await connection.client.listTools();
        return { tools, instructions: connection.client.getInstructions() || '' };
      } finally {
        if (connection) await this.close(connection);
        await rm(directory, { recursive: true, force: true });
      }
    })().catch(error => { this.catalogPromise = undefined; throw error; });
  }

  async call(name, args, { cwd, signal }) {
    const combined = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    combined.throwIfAborted();
    const directory = await indexedRoot(await projectDirectory(cwd, args.projectPath));
    combined.throwIfAborted();
    let entry = this.connections.get(directory);
    if (!entry) {
      entry = { busy: 0, timer: null };
      // Startup belongs to the runtime; one cancelled caller must not abort
      // another session's shared connection handshake.
      entry.ready = this.connect(directory, this.controller.signal).then(connection => entry.connection = connection);
      this.connections.set(directory, entry);
    }
    clearTimeout(entry.timer);
    entry.busy++;
    try {
      const connection = await waitFor(entry.ready, combined);
      combined.throwIfAborted();
      if (connection.closed) throw new Error('CodeGraph 连接已关闭，请重试。');
      return await connection.client.callTool({ name, arguments: { ...args, projectPath: directory } },
        { signal: combined, timeout: 120_000 });
    } catch (error) {
      // Never replay a failed call. A later call reconnects after a crash.
      const connection = entry.connection;
      if ((!connection && !combined.aborted) || connection?.closed) {
        if (this.connections.get(directory) === entry) this.connections.delete(directory);
        if (connection) await this.close(connection);
      }
      throw error;
    } finally {
      entry.busy--;
      if (!entry.busy && this.connections.get(directory) === entry) {
        entry.timer = setTimeout(() => {
          this.connections.delete(directory);
          void entry.ready.then(connection => this.close(connection)).catch(() => {});
        }, this.idleMs);
        entry.timer.unref();
      }
    }
  }

  async index({ projectPath } = {}, { cwd, signal }) {
    const combined = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    combined.throwIfAborted();
    const directory = await projectDirectory(cwd, projectPath);
    const launch = codegraphCommand();
    let initialized = false;
    try { initialized = (await stat(join(directory, '.codegraph', 'codegraph.db'))).isFile(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    combined.throwIfAborted();
    // Sync existing graphs, including a partially indexed graph left by an
    // interrupted init. Never silently return "already initialized" instead.
    const args = initialized ? ['sync', directory] : ['init', directory, '--yes'];
    return await new Promise((resolveResult, reject) => {
      let output = '', killTimer;
      const child = spawn(launch.command, [...launch.args, ...args], {
        cwd: directory, env: codegraphEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
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
          if (combined.aborted) reject(combined.reason);
          else if (code !== 0) reject(new Error(`CodeGraph 索引失败（${code ?? exitSignal}）：\n${output}`));
          else resolveResult(output || `CodeGraph 已初始化：${directory}`);
        });
      });
    });
  }

  async dispose() {
    this.controller.abort(new Error('CodeGraph 已停止。'));
    for (const entry of this.connections.values()) clearTimeout(entry.timer);
    this.connections.clear();
    await Promise.allSettled([...this.processes].map(process => process.child ? process.done : this.close(process)));
  }
}
