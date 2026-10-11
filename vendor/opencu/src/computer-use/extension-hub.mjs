import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeMessageReader, encodeNativeMessage } from './native-messaging.mjs';
import { WindowsPipeServer } from './windows-pipe.mjs';

const BROWSER_FAMILIES = new Set(['chrome', 'edge', 'brave', 'opera', 'vivaldi']);
const CAPABILITIES = new Set(['cursor-overlay', 'session-tab-groups', 'provider-tab-identity', 'tab-lifecycle', 'tab-focus', 'tab-zoom', 'browser-management', 'browser-management-tab-groups', 'browser-profile']);
const optionalText = (value, limit) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : undefined;
const disconnected = (browserId, epoch, cause) => Object.assign(new Error('Browser extension disconnected; select a fresh browser connection'), { code: 'EXTENSION_DISCONNECTED', browserId, epoch, ...(cause ? { cause } : {}) });

export function extensionSocketPath(directory) {
  const key = createHash('sha256').update(resolve(directory)).digest('hex').slice(0, 24);
  if (process.platform === 'win32') return '\\\\.\\pipe\\trisoul-cu-' + key;
  const folder = join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'trisoul-cu-' + key);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const info = lstatSync(folder);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) throw new Error('The browser connection directory is not owned by this user');
  chmodSync(folder, 0o700);
  return join(folder, 'bridge.sock');
}

export class ExtensionHub extends EventEmitter {
  constructor(socketPath, { windowsRuntime } = {}) {
    super(); this.socketPath = socketPath; this.connections = new Map(); this.sockets = new Set(); this.sequence = 0;
    this.windowsRuntime = windowsRuntime;
  }
  async start() {
    if (this.server) throw new Error('Extension hub already started');
    if (process.platform === 'win32' || this.windowsRuntime) {
      if (!this.windowsRuntime) throw new Error('Windows browser connections require the current-user pipe helper');
      const { command, args } = await this.windowsRuntime.command();
      const server = new WindowsPipeServer(command, args, socket => this.accept(socket));
      try { await server.listen(this.socketPath); this.server = server; }
      catch (error) { await new Promise(resolve => server.close(resolve)); throw error; }
      return;
    }
    const server = createServer(socket => this.accept(socket));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.socketPath, resolve); });
    this.server = server;
    try { if (process.platform !== 'win32') await chmod(this.socketPath, 0o600); }
    catch (error) { await this.close(); throw error; }
  }
  accept(socket) {
    socket.setNoDelay?.(true);
    this.sockets.add(socket);
    const connection = { socket, epoch: randomUUID(), pending: new Map(), cancelling: new Map(), info: null };
    const timer = setTimeout(() => socket.destroy(new Error('Extension handshake timed out')), 3000); timer.unref();
    const reader = new NativeMessageReader(message => {
      if (!connection.info) {
        if (message?.type !== 'hello' || message.protocol !== 2 || !/^[a-z0-9-]{8,80}$/i.test(message.instanceId ?? '')) throw new Error('Unsupported extension handshake. Update the extension and host application together.');
        const id = 'chrome:' + message.instanceId;
        if (this.connections.has(id)) throw new Error('This browser profile is already connected');
        if (message.family !== undefined && !BROWSER_FAMILIES.has(message.family)) throw new Error('Unsupported browser extension family');
        if (message.extensionInstanceId !== undefined && message.extensionInstanceId !== message.instanceId || message.metadata?.extensionInstanceId !== undefined && message.metadata.extensionInstanceId !== message.instanceId) throw new Error('Browser extension instance identity does not match its handshake');
        const family = message.family ?? 'chrome';
        const extensionId = /^[a-p]{32}$/.test(message.extensionId ?? message.metadata?.extensionId ?? '') ? message.extensionId ?? message.metadata.extensionId : undefined;
        const profileName = optionalText(message.profileName ?? message.metadata?.profileName, 120);
        const generation = optionalText(message.generation, 100);
        connection.info = { id, type: 'extension', family, name: String(message.name || 'Chrome').slice(0, 120), userAgent: String(message.userAgent??'').slice(0,512), epoch: connection.epoch, version: typeof message.version === 'string' ? message.version.slice(0, 32) : null, build: /^[a-f0-9]{64}$/.test(message.build ?? '') ? message.build : null, metadata: { extensionInstanceId: message.instanceId, ...(extensionId ? { extensionId } : {}) }, ...(profileName ? { profileName } : {}), ...(generation ? { generation } : {}) };
        connection.info.capabilities = Array.isArray(message.capabilities) ? [...new Set(message.capabilities.filter(value => CAPABILITIES.has(value)))] : [];
        this.connections.set(id, connection); clearTimeout(timer);
        socket.write(encodeNativeMessage({ type: 'ready', protocol: 2, epoch: connection.epoch }));
        this.emit('connected', connection.info); return;
      }
      if (Number.isSafeInteger(message.id)) {
        const pending = connection.pending.get(message.id); if (!pending) return;
        connection.pending.delete(message.id); pending.cleanup();
        if (message.error) pending.reject(Object.assign(new Error(String(message.error.message ?? 'Browser extension request failed')), { code: message.error.code, ...(Number.isInteger(message.error.cdpCode) ? { cdpCode: message.error.cdpCode } : {}) }));
        else pending.resolve(message.result);
      } else if (typeof message.event === 'string') this.emit('event', { browser: connection.info.id, epoch: connection.epoch, event: message.event, params: message.params });
      else throw new Error('Invalid extension message');
    });
    socket.on('data', chunk => { try { reader.push(chunk); } catch (error) { socket.destroy(error); } });
    socket.on('end', () => { try { reader.end(); } catch (error) { socket.destroy(error); } });
    socket.on('error', error => { connection.error = error; });
    socket.on('close', () => {
      clearTimeout(timer); this.sockets.delete(socket);
      if (this.connections.get(connection.info?.id) === connection) this.connections.delete(connection.info.id);
      const error = disconnected(connection.info?.id, connection.epoch, connection.error);
      for (const pending of connection.pending.values()) { pending.cleanup(); pending.reject(error); } connection.pending.clear();
      if (connection.info) this.emit('disconnected', connection.info, error);
    });
  }
  list() { return [...this.connections.values()].map(connection => ({ ...connection.info, metadata: { ...connection.info.metadata }, capabilities: [...connection.info.capabilities] })); }
  cancelLease(connection, params) {
    const key = JSON.stringify([params.tabId,params.leaseId,params.actorId??null]);
    if (connection.cancelling.has(key)) return connection.cancelling.get(key);
    const pending = (async () => {
      if (this.connections.get(connection.info.id) !== connection) throw disconnected(connection.info.id, connection.epoch, connection.error);
      const result = await this.call(connection.info.id, params.actorId?'stop-actor':'detach', { tabId: params.tabId, leaseId: params.leaseId, ...(params.actorId?{actorId:params.actorId}:{}) }, { timeoutMs: 3000, epoch: connection.epoch });
      if (result?.released !== true) throw new Error('Browser input release was not confirmed');
    })();
    connection.cancelling.set(key, pending);
    // All requests sharing an AbortSignal reuse this acknowledgement. The
    // extension also keeps terminal acknowledgements for later duplicate stops.
    void pending.finally(() => { if (connection.cancelling.get(key) === pending) connection.cancelling.delete(key); }).catch(() => {});
    return pending;
  }
  call(browserId, method, params = {}, { signal, timeoutMs = 10000, epoch } = {}) {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) return Promise.reject(new Error('Browser extension timeout must be a positive integer'));
    const connection = this.connections.get(browserId); if (!connection || connection.socket.destroyed) return Promise.reject(disconnected(browserId, epoch, connection?.error));
    if (epoch !== undefined && connection.epoch !== epoch) return Promise.reject(Object.assign(new Error('Browser extension connection changed; select a fresh browser connection'), { code: 'EXTENSION_CONNECTION_CHANGED', browserId, epoch, currentEpoch: connection.epoch }));
    const id = ++this.sequence; let frame;
    try { frame = encodeNativeMessage({ id, method, params }); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const cancel = async error => {
        if (!connection.pending.delete(id)) return;
        cleanup();
        try {
          if (method === 'detach' || method === 'stop-actor' || method === 'tabs.cancelCreate') connection.socket.destroy();
          else if (method === 'tabs.create') await this.call(browserId, 'tabs.cancelCreate', { creationId: params.creationId }, { timeoutMs: 3000, epoch: connection.epoch });
          else if (method !== 'cursor' && params.leaseId && params.tabId !== undefined) await this.cancelLease(connection, params);
          reject(error);
        } catch (releaseError) {
          reject(Object.assign(new AggregateError([error, releaseError], error.message + '; cleanup failed: ' + releaseError.message), { code: 'INPUT_RELEASE_FAILED' }));
        }
      };
      const aborted = () => cancel(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? 'Extension operation cancelled')));
      const timer = setTimeout(() => cancel(Object.assign(new Error('Browser extension operation timed out: ' + method), { code: 'EXTENSION_REQUEST_TIMEOUT', browserId, epoch: connection.epoch, method })), timeoutMs);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
      connection.pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { void aborted(); return; }
      try { connection.socket.write(frame, error => { if (error) void cancel(error); }); }
      catch (error) { void cancel(error); }
    });
  }
  async close() {
    for (const socket of this.sockets) socket.destroy();
    // net.Server removes its own Unix socket. Do not unlink the path again:
    // another owner may already have rebound it after the close completed.
    if (this.server) { const server = this.server; this.server = null; await new Promise(resolve => server.close(resolve)); }
  }
}
