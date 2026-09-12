import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeMessageReader, encodeNativeMessage } from './native-messaging.mjs';

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
  constructor(socketPath) {
    super(); this.socketPath = socketPath; this.connections = new Map(); this.sockets = new Set(); this.sequence = 0;
  }
  async start() {
    if (this.server) throw new Error('Extension hub already started');
    const server = createServer(socket => this.accept(socket));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.socketPath, resolve); });
    this.server = server;
    try { if (process.platform !== 'win32') await chmod(this.socketPath, 0o600); }
    catch (error) { await this.close(); throw error; }
  }
  accept(socket) {
    this.sockets.add(socket);
    const connection = { socket, epoch: randomUUID(), pending: new Map(), cancelling: new Map(), info: null };
    const timer = setTimeout(() => socket.destroy(new Error('Extension handshake timed out')), 3000); timer.unref();
    const reader = new NativeMessageReader(message => {
      if (!connection.info) {
        if (message?.type !== 'hello' || message.protocol !== 2 || !/^[a-z0-9-]{8,80}$/i.test(message.instanceId ?? '')) throw new Error('Unsupported extension handshake. Update the extension and Oh My DSH together.');
        const id = 'chrome:' + message.instanceId;
        if (this.connections.has(id)) throw new Error('This browser profile is already connected');
        connection.info = { id, type: 'extension', name: String(message.name || 'Chrome').slice(0, 120), userAgent: String(message.userAgent??'').slice(0,512), epoch: connection.epoch, version: typeof message.version === 'string' ? message.version.slice(0, 32) : null, build: /^[a-f0-9]{64}$/.test(message.build ?? '') ? message.build : null };
        connection.info.capabilities = Array.isArray(message.capabilities) ? message.capabilities.filter(value => value === 'cursor-overlay') : [];
        this.connections.set(id, connection); clearTimeout(timer);
        socket.write(encodeNativeMessage({ type: 'ready', protocol: 2, epoch: connection.epoch }));
        this.emit('connected', connection.info); return;
      }
      if (Number.isSafeInteger(message.id)) {
        const pending = connection.pending.get(message.id); if (!pending) return;
        connection.pending.delete(message.id); pending.cleanup();
        if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
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
      const error = Object.assign(new Error('Browser extension disconnected'), { code: 'EXTENSION_DISCONNECTED', cause: connection.error });
      for (const pending of connection.pending.values()) { pending.cleanup(); pending.reject(error); } connection.pending.clear();
      if (connection.info) this.emit('disconnected', connection.info, error);
    });
  }
  list() { return [...this.connections.values()].map(connection => ({ ...connection.info })); }
  cancelLease(connection, params) {
    const key = JSON.stringify([params.tabId,params.leaseId,params.actorId??null]);
    if (connection.cancelling.has(key)) return connection.cancelling.get(key);
    const pending = (async () => {
      if (this.connections.get(connection.info.id) !== connection) throw new Error('Browser connection changed during cancellation');
      const result = await this.call(connection.info.id, params.actorId?'stop-actor':'detach', { tabId: params.tabId, leaseId: params.leaseId, ...(params.actorId?{actorId:params.actorId}:{}) }, { timeoutMs: 3000 });
      if (result?.released !== true) throw new Error('Browser input release was not confirmed');
    })();
    connection.cancelling.set(key, pending);
    // All requests sharing an AbortSignal reuse this acknowledgement. The
    // extension also keeps terminal acknowledgements for later duplicate stops.
    void pending.finally(() => { if (connection.cancelling.get(key) === pending) connection.cancelling.delete(key); }).catch(() => {});
    return pending;
  }
  call(browserId, method, params = {}, { signal, timeoutMs = 10000 } = {}) {
    signal?.throwIfAborted();
    const connection = this.connections.get(browserId); if (!connection) return Promise.reject(new Error('Browser extension is not connected'));
    const id = ++this.sequence; let frame;
    try { frame = encodeNativeMessage({ id, method, params }); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const cancel = async error => {
        if (!connection.pending.delete(id)) return;
        cleanup();
        try {
          if (method === 'detach' || method === 'stop-actor' || method === 'tabs.cancelCreate') connection.socket.destroy();
          else if (method === 'tabs.create') await this.call(browserId, 'tabs.cancelCreate', { creationId: params.creationId }, { timeoutMs: 3000 });
          else if (method !== 'cursor' && params.leaseId && params.tabId !== undefined) await this.cancelLease(connection, params);
          reject(error);
        } catch (releaseError) {
          reject(Object.assign(new AggregateError([error, releaseError], error.message + '; cleanup failed: ' + releaseError.message), { code: 'INPUT_RELEASE_FAILED' }));
        }
      };
      const aborted = () => cancel(signal.reason ?? new Error('Extension operation cancelled'));
      const timer = setTimeout(() => cancel(new Error('Browser extension operation timed out: ' + method)), timeoutMs);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
      connection.pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', aborted, { once: true });
      connection.socket.write(frame, error => { if (error) cancel(error); });
    });
  }
  async close() {
    for (const socket of this.sockets) socket.destroy();
    // net.Server removes its own Unix socket. Do not unlink the path again:
    // another owner may already have rebound it after the close completed.
    if (this.server) { const server = this.server; this.server = null; await new Promise(resolve => server.close(resolve)); }
  }
}
