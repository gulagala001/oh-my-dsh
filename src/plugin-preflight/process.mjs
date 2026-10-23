import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, readdir, lstat, stat, rm, rename, cp, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FORMAT, LIMITS, problem, redact } from './shared.mjs';

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const gone = child => child.exitCode !== null || child.signalCode !== null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const exec = promisify(execFile);
async function writeOwner(root, pid) {
  const path = join(root, 'owner.next');
  await writeFile(path, JSON.stringify({ format: FORMAT, pid, at: Date.now() }), { mode: 0o600 });
  await rename(path, join(root, 'owner.json'));
}

async function processTable(commands = false) {
  if (process.platform === 'win32') return [];
  const { stdout } = await exec('ps', [...(commands ? ['-ww'] : []), '-axo', 'pid=,ppid=,pgid=,rss=,stat=,lstart=' + (commands ? ',args=' : '')], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim().split('\n').map(line => {
    const row = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+((?:\S+\s+){4}\S+)(?:\s+(.*))?$/);
    if (!row) return null;
    const [, id, parent, group, rss, status, birth, command = ''] = row;
    return { id: +id, parent: +parent, group: +group, rss: +rss, status, birth: birth.replace(/\s+/g, ' '),
      ...(commands ? { command } : {}) };
  }).filter(Boolean);
}
async function processTree(pid, rows) {
  rows ??= await processTable();
  const ids = new Set([pid]);
  for (let n = -1; n !== ids.size;) { n = ids.size; for (const row of rows) if (ids.has(row.parent)) ids.add(row.id); }
  return rows.filter(row => ids.has(row.id));
}

export function cleanEnvironment(root, inherited = process.env) {
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']
    .filter(k => inherited[k] !== undefined).map(k => [k, inherited[k]]));
  const home = join(root, 'home');
  return { ...env, HOME: home, USERPROFILE: home, DSH_HOME: home, XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), XDG_STATE_HOME: join(root, 'state'),
    APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'), TEMP: root, TMP: root, TMPDIR: root,
    DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1', OMD_PLUGIN_PREFLIGHT: '1' };
}

// Package acquisition may reuse the launcher's native caches. Runtime and
// browser environment remain isolated; no second permanent cache is created.
export async function packageEnvironment(inherited = process.env, home = homedir(), platform = process.platform) {
  const env = Object.fromEntries(['PNPM_HOME', 'COREPACK_HOME', 'npm_config_cache', 'NPM_CONFIG_CACHE', 'LOCALAPPDATA']
    .filter(key => inherited[key]).map(key => [key, inherited[key]]));
  env.XDG_DATA_HOME = inherited.XDG_DATA_HOME || join(home, platform === 'darwin' ? 'Library' : '.local/share');
  if (!env.COREPACK_HOME) {
    const native = join(inherited.XDG_CACHE_HOME || inherited.LOCALAPPDATA || join(home, platform === 'win32' ? 'AppData/Local' : '.cache'), 'node/corepack');
    if (await stat(native).then(value => value.isDirectory(), () => false)) env.COREPACK_HOME = native;
  }
  return env;
}

// Hoisted installs may retain only conflicting versions in a package's own
// node_modules. Mirror every ancestor lookup in order, including the shared
// profile dependencies, without copying or merging those dependency trees.
export async function copyCandidate(source, root, fallback) {
  const directories = [];
  for (let current = source;; current = dirname(current)) {
    const directory = join(current, 'node_modules');
    if (basename(current) !== 'node_modules' && await stat(directory).then(value => value.isDirectory(), error => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
      throw error;
    })) directories.push(directory);
    if (dirname(current) === current) break;
  }
  if (!directories.length) directories.push(fallback);
  const snapshot = join(root, 'candidate', ...Array(directories.length - 1).fill('scope'));
  await cp(source, snapshot, { recursive: true, dereference: false, verbatimSymlinks: true,
    filter: path => !['node_modules', '.git', '.local'].includes(basename(path)) });
  let parent = snapshot;
  for (const directory of directories) {
    await symlink(directory, join(parent, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    parent = dirname(parent);
  }
  return snapshot;
}

export async function stopTree(child, observed = new Map(), directory) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    if (gone(child)) return;
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolve); killer.once('exit', resolve);
    });
  } else {
    const current = await processTable(Boolean(directory));
    const descendants = await processTree(child.pid, current);
    for (const row of descendants) observed.set(row.id, row);
    // A native hard crash can happen before the first sampling tick. Chromium
    // may already lead a detached group; its unique owned profile identifies it
    // even after reparenting. Never match a browser by executable name alone.
    if (directory) {
      const marker = '--user-data-dir=' + join(directory, 'browser');
      for (const row of current) if (row.command.endsWith(marker) || row.command.includes(marker + ' ')) observed.set(row.id, row);
    }
    // pnpm can create another process group for build scripts. Stop those
    // verified descendants as well, before their parent is allowed to exit.
    const groups = [...new Set(current.filter(p => p.group !== child.pid && observed.get(p.id)?.birth === p.birth
      && observed.get(p.id)?.group === p.group).map(p => p.group))];
    for (const group of groups) { try { process.kill(-group, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    // The worker owns its process group; this also terminates a host/browser
    // left behind after the worker itself crashed or exited early.
    try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    for (let i = 0; i < 30 && (alive(-child.pid) || groups.some(g => alive(-g))); i++) await delay(50);
    for (const group of groups) if (alive(-group)) { try { process.kill(-group, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    if (alive(-child.pid)) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    for (let i = 0; i < 20; i++) {
      const remaining = (await processTable()).filter(p => (p.group === child.pid || groups.includes(p.group)) && !p.status.startsWith('Z'));
      if (!remaining.length) break;
      if (i === 19) throw problem('cleanup-failed', '预检子进程尚未退出，已停止安装');
      await delay(50);
    }
  }
  if (!gone(child)) await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]);
  if (!gone(child)) throw problem('cleanup-failed', '预检进程尚未退出，已停止安装');
}

export async function sweep(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw problem('cleanup-path', '预检目录不能是符号链接');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^run-[A-Za-z0-9]+$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    try {
      const metadata = await lstat(join(path, 'owner.json'));
      if (!metadata.isFile() || metadata.size > 1024) continue;
      const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'));
      if (owner.format !== FORMAT || !Number.isSafeInteger(owner.pid) || owner.pid < 1) continue;
      if (alive(owner.pid) || process.platform !== 'win32' && alive(-owner.pid)) continue;
      // Reclaim a detached browser left by an abrupt parent/worker shutdown
      // before deleting the only directory that proves its ownership.
      if (process.platform !== 'win32') await stopTree({ pid: owner.pid, exitCode: 0, signalCode: null }, new Map(), path);
      await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  }
}

export async function runProbe(input, { directory, signal, progress = () => {}, worker = new URL('./worker.mjs', import.meta.url), limits = LIMITS }) {
  await sweep(directory); signal?.throwIfAborted();
  const root = await mkdtemp(join(directory, 'run-'));
  let child, timer, monitor, ownerWrite, result, log = '', stop, started = Date.now(), stage = 'preparation', sampling = false, peakRssMiB = 0, samples = 0, running = true;
  const env = cleanEnvironment(root);
  const channelKey = randomUUID();
  const observed = new Map();
  try {
    await writeFile(join(root, 'input.json'), JSON.stringify({ ...input, root, channelKey }), { mode: 0o600 });
    await writeOwner(root, process.pid);
    child = spawn(process.execPath, [...(/[\\/]app\.asar[\\/]/.test(input.cli) ? ['--expose-internals'] : []), '--max-old-space-size=512', '--max-semi-space-size=8',
      fileURLToPath(worker), join(root, 'input.json')], {
      cwd: root, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const outcome = await new Promise((resolve, reject) => {
      let stopping;
      stop = error => { if (!stopping) stopping = stopTree(child, observed, root).then(() => reject(error), reject); };
      const bound = ms => { clearTimeout(timer); timer = setTimeout(() => stop(problem('probe-timeout', stage === 'preparation' ? '准备插件超时，预检未完成' : '启动检查超时，预检未完成')), ms); };
      bound(limits.preparationMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (process.platform !== 'win32') monitor = setInterval(async () => {
        if (sampling) return; sampling = true;
        try {
          const tree = await processTree(child.pid);
          for (const row of tree) observed.set(row.id, row);
          const memory = tree.reduce((n, p) => n + p.rss, 0) / 1024;
          peakRssMiB = Math.max(peakRssMiB, Math.round(memory));
          if (running && memory > limits.memoryMiB) stop(problem('resource-limit', '预检达到临时内存预算，已停止检查；正式安装尚未开始'));
          if (running && ++samples % 4 === 0) {
            const { stdout } = await exec('du', ['-sk', root], { timeout: 2000, maxBuffer: 4096 });
            if (running && Number(stdout.trim().split(/\s+/)[0]) > limits.temporaryMiB * 1024)
              stop(problem('resource-limit', '预检达到临时磁盘预算，已停止检查；正式安装尚未开始'));
          }
        } catch {} finally { sampling = false; }
      }, 750);
      const output = bytes => { log = (log + bytes).slice(-LIMITS.logBytes); };
      child.stdout.on('data', output); child.stderr.on('data', output);
      child.on('message', value => {
        // Candidate plugins now share the disposable process. Their unrelated
        // IPC must never be mistaken for the controller's check result.
        if (value?.channelKey !== channelKey) return;
        if (value?.type === 'phase') {
          const previous = stage; stage = value.stage; progress(value.message);
          if (stage === 'runtime' && previous !== 'runtime') bound(limits.runtimeMs);
        } else if (value?.type === 'result') result = value.result;
      });
      child.once('error', reject);
      child.once('close', code => {
        if (stopping) return;
        if (code === 0 && result?.ok) resolve(result);
        else reject(Object.assign(problem(result?.ok ? 'cleanup-failed' : result?.code || 'probe-failed',
          result?.ok ? '隔离宿主未正常退出，预检未完成' : result?.message || '隔离启动未通过检查'), { details: redact(result?.details || log) }));
      });
      if (child.pid) { ownerWrite = writeOwner(root, child.pid); void ownerWrite.catch(stop); }
      if (signal?.aborted) stop(signal.reason);
    });
    return { ...outcome, elapsedMs: Date.now() - started, peakRssMiB: process.platform === 'win32' ? null : peakRssMiB };
  } catch (e) {
    if (!e.details) e.details = redact(log);
    throw e;
  } finally {
    running = false; clearTimeout(timer); clearInterval(monitor); signal?.removeEventListener('abort', abort);
    // Never delete a directory while an owned process may still be writing it.
    try {
      await ownerWrite?.catch(() => {});
      await stopTree(child, observed, root);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) { throw Object.assign(problem('cleanup-failed', '预检进程或临时目录尚未清理完成，已停止安装，请稍后重试'), { cause: error }); }
  }
  function abort() { stop?.(signal.reason); }
}
