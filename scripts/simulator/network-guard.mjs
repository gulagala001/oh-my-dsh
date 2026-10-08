// Loaded before DSH and inherited by Node tool children. This is an additional
// fence, not a replacement for the native process sandbox used by the runner.
import net from 'node:net';
import { appendFileSync, writeSync, readFileSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { ChildProcess } from 'node:child_process';
import childProcess from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';

export function isLoopback(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
}

export function installNetworkGuard({ auditFile = process.env.OMD_SIM_AUDIT } = {}) {
  const originalConnect = net.Socket.prototype.connect;
  const originalFetch = globalThis.fetch;
  const allowedPorts = process.env.OMD_SIM_ALLOW_PORTS ? new Set(process.env.OMD_SIM_ALLOW_PORTS.split(',').map(Number)) : null;
  const allowed = (host, port) => isLoopback(host) && (!allowedPorts || allowedPorts.has(Number(port)));
  const originalSpawn = ChildProcess.prototype.spawn, actualNow = Date.now;
  const originalSpawnSync = childProcess.spawnSync;
  const originalExecFileSync = childProcess.execFileSync, originalExecSync = childProcess.execSync;
  const gatePath = process.env.OMD_SIM_PROCESS_GATE, ackDirectory = process.env.OMD_SIM_ACK_DIR;
  const monitorFd = Number(process.env.OMD_SIM_MONITOR_FD ?? -1);
  const send = entry => { if (monitorFd >= 0) writeSync(monitorFd, JSON.stringify(entry) + '\n'); };
  const record = entry => { send(entry); if (auditFile) appendFileSync(auditFile, JSON.stringify(entry) + '\n'); };
  const stdioFor = stdio => {
    const streams = Array.isArray(stdio) ? [...stdio] : stdio === 'inherit' ? [0, 1, 2] : stdio === 'ignore' ? ['ignore', 'ignore', 'ignore'] : ['pipe', 'pipe', 'pipe'];
    while (streams.length <= monitorFd) streams.push('ignore');
    if (streams[monitorFd] !== 'ignore' && streams[monitorFd] !== undefined && streams[monitorFd] !== monitorFd) throw Error('Simulation process-monitor descriptor conflicts with tool stdio');
    streams[monitorFd] = monitorFd; return streams;
  };
  const gated = options => gatePath && monitorFd >= 0 ? { ...options, file: '/bin/sh', args: ['/bin/sh', gatePath, options.file, ...(options.args ?? [options.file]).slice(1)], stdio: stdioFor(options.stdio) } : options;
  const terminateFresh = (child, detached) => {
    try { if (detached && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  ChildProcess.prototype.spawn = function (options) {
    const result = originalSpawn.call(this, gated(options));
    if (this.pid) {
      try {
        if (gatePath && monitorFd >= 0) {
          send({ type: 'process/gated', pid: this.pid, parentPid: process.pid, actualAt: actualNow(), file: options.file, detached: Boolean(options.detached) });
          const ack = join(ackDirectory, process.pid + '-' + this.pid + '.json'), deadline = performance.now() + 5000;
          while (!existsSync(ack) && performance.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
          if (!existsSync(ack)) throw Error('External process ownership verification timed out');
          const verdict = JSON.parse(readFileSync(ack, 'utf8'));
          if (!verdict.ok || verdict.pid !== this.pid) throw Error(verdict.error || 'External process ownership verification failed');
        }
        record({ type: 'process/spawn', pid: this.pid, parentPid: process.pid, actualAt: actualNow(), file: options.file, detached: Boolean(options.detached) });
      } catch (error) {
        try { terminateFresh(this, options.detached); }
        catch (cleanupError) { error.cause ??= cleanupError; }
        throw error;
      }
      this.once('exit', (code, signal) => {
        try { record({ type: 'process/exit', pid: this.pid, parentPid: process.pid, actualAt: actualNow(), code, signal }); }
        catch (error) { try { send({ type: 'audit/error', pid: process.pid, message: error.message }); } catch {} }
      });
    }
    return result;
  };
  // Synchronous tools are gated by the shell registration. The waiting parent
  // cannot exit before external identity verification and command completion.
  const synchronousCommand = (file, args, options) => options.shell
    ? [typeof options.shell === 'string' ? options.shell : '/bin/sh', '-c', [file, ...args].join(' ')]
    : [file, ...args];
  childProcess.spawnSync = function (file, args, options) {
    if (!gatePath || monitorFd < 0) return originalSpawnSync.apply(this, arguments);
    if (!Array.isArray(args)) { options = args ?? {}; args = []; }
    options ??= {};
    return originalSpawnSync('/bin/sh', [gatePath, ...synchronousCommand(file, args, options)], { ...options, shell: false, stdio: stdioFor(options.stdio) });
  };
  childProcess.execFileSync = function (file, args, options) {
    if (!gatePath || monitorFd < 0) return originalExecFileSync.apply(this, arguments);
    if (!Array.isArray(args)) { options = args ?? {}; args = []; }
    options ??= {};
    return originalExecFileSync('/bin/sh', [gatePath, ...synchronousCommand(file, args, options)], { ...options, shell: false, stdio: stdioFor(options.stdio) });
  };
  childProcess.execSync = function (command, options = {}) {
    if (!gatePath || monitorFd < 0) return originalExecSync.apply(this, arguments);
    return originalExecFileSync('/bin/sh', [gatePath, options.shell || '/bin/sh', '-c', command], { ...options, shell: false, stdio: stdioFor(options.stdio) });
  };
  const audit = detail => {
    record({ type: 'network/denied', pid: process.pid, ...detail });
    const error = new Error('Simulation blocked an external network connection: ' + detail.host);
    error.code = 'OMD_SIM_NETWORK_DENIED';
    throw error;
  };
  net.Socket.prototype.connect = function (...args) {
    let options = args[0];
    // normalizeArgs() may already have been called by node:http/tls.
    if (Array.isArray(options)) options = options[0];
    const host = typeof options === 'object' ? options.host ?? options.hostname ?? 'localhost'
      : typeof args[1] === 'string' ? args[1] : 'localhost';
    const port = typeof options === 'object' ? options.port : options;
    const path = typeof options === 'object' ? options.path : typeof options === 'string' && !/^\d+$/.test(options) ? options : null;
    if (path) audit({ host: '[unix socket]', transport: 'socket' });
    if (!allowed(host, port)) audit({ host: String(host) + ':' + String(port), transport: 'socket' });
    return originalConnect.apply(this, args);
  };
  globalThis.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['http:', 'https:'].includes(url.protocol) || !allowed(url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80))) {
      try { audit({ host: url.hostname, transport: 'fetch' }); } catch (error) { return Promise.reject(error); }
    }
    return originalFetch(input, options);
  };
  syncBuiltinESMExports();
  return () => {
    net.Socket.prototype.connect = originalConnect;
    globalThis.fetch = originalFetch;
    ChildProcess.prototype.spawn = originalSpawn;
    childProcess.spawnSync = originalSpawnSync;
    childProcess.execFileSync = originalExecFileSync; childProcess.execSync = originalExecSync;
    syncBuiltinESMExports();
  };
}

if (process.env.OMD_SIMULATION === '1') installNetworkGuard();
