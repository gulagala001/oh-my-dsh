import { spawn } from 'node:child_process';
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class NativeTransportError extends Error {
  constructor(message, { code = 'NATIVE_TRANSPORT_FAILED', cause, method } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'NativeTransportError';
    this.code = code;
    this.method = method;
  }
}

export class NativeProtocolError extends NativeTransportError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 'NATIVE_PROTOCOL_ERROR' });
    this.name = 'NativeProtocolError';
  }
}

export class NativeRpcError extends Error {
  constructor(error, method) {
    super(error.message);
    this.name = 'NativeRpcError';
    this.code = error.code;
    this.data = error.data;
    this.method = method;
    this.requestType = 'jsonRPC';
  }
}

export class NativeToolError extends Error {
  constructor(name, result) {
    const error = result.structuredContent?.error;
    const text = result.content?.filter(value => value?.type === 'text' && typeof value.text === 'string').map(value => value.text).join('\n');
    super(typeof error?.message === 'string' ? error.message : text || `Native tool ${name} failed`);
    this.name = 'NativeToolError';
    this.code = error?.code;
    this.toolName = name;
    this.requestType = 'tools/call';
    this.result = result;
  }
}

// One transport owns one native lease. Reconnection requires a new client and
// session; replaying an unacknowledged input operation can duplicate its effect.
export class McpClient {
  constructor(command, args = [], options = {}) {
    const { onNotification, maxMessageBytes = MAX_MESSAGE_BYTES, ...spawnOptions } = options;
    if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes <= 0) throw new RangeError('Invalid native message byte limit');
    this.sequence = 0;
    this.pending = new Map();
    this.closed = false;
    this.stderr = '';
    this.maxMessageBytes = maxMessageBytes;
    this.onNotification = onNotification;
    this.fragments = [];
    this.fragmentBytes = 0;
    this.child = spawn(command, args, { ...spawnOptions, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.exited = new Promise(resolve => this.child.once('close', resolve));
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data).slice(-4000); });
    this.child.stdout.on('data', data => {
      if (this.closed) return;
      try { this.receive(data); } catch (cause) {
        this.fail(cause instanceof NativeProtocolError ? cause : new NativeProtocolError('Computer Use returned an invalid JSON-RPC message', { cause }));
        void this.close().catch(() => {});
      }
    });
    this.child.stdout.on('end', () => {
      this.fail(this.fragmentBytes ? new NativeProtocolError('Computer Use transport ended inside a message') : new NativeTransportError('Computer Use transport closed before response', { code: 'NATIVE_TRANSPORT_CLOSED' }));
      void this.close().catch(() => {});
    });
    const fail = cause => {
      this.fail(new NativeTransportError('Computer Use transport failed', { cause }));
      void this.close().catch(() => {});
    };
    this.child.on('error', fail);
    this.child.stdin.on('error', fail);
    this.child.stdout.on('error', fail);
    this.child.stderr.on('error', fail);
    this.child.on('exit', (code, signal) => this.fail(new NativeTransportError(`Computer Use transport exited (${signal ?? code})`, { code: 'NATIVE_TRANSPORT_CLOSED' })));
  }

  get isClosed() { return this.closed; }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
    this.fragments = [];
    this.fragmentBytes = 0;
  }

  receive(data) {
    let offset = 0;
    while (offset < data.length) {
      const newline = data.indexOf(10, offset);
      const end = newline === -1 ? data.length : newline;
      const part = data.subarray(offset, end);
      this.fragmentBytes += part.length;
      if (this.fragmentBytes > this.maxMessageBytes) throw new NativeProtocolError(`Computer Use message exceeds ${this.maxMessageBytes} bytes`);
      if (part.length) this.fragments.push(part);
      if (newline === -1) return;
      let line = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments, this.fragmentBytes);
      this.fragments = [];
      this.fragmentBytes = 0;
      if (line.at(-1) === 13) line = line.subarray(0, -1);
      if (line.length) this.handleMessage(JSON.parse(line.toString('utf8')));
      offset = newline + 1;
      if (this.closed) return;
    }
  }

  handleMessage(message) {
    if (!object(message) || message.jsonrpc !== '2.0') throw new NativeProtocolError('Computer Use returned an invalid JSON-RPC message');
    if (!hasOwn(message, 'id')) {
      if (typeof message.method !== 'string' || hasOwn(message, 'result') || hasOwn(message, 'error')) throw new NativeProtocolError('Computer Use returned an invalid notification');
      try { this.onNotification?.(message); } catch {}
      return;
    }
    if (!Number.isSafeInteger(message.id) || hasOwn(message, 'method') || hasOwn(message, 'result') === hasOwn(message, 'error')) throw new NativeProtocolError('Computer Use returned an invalid JSON-RPC response');
    if (hasOwn(message, 'error') && (!object(message.error) || !Number.isInteger(message.error.code) || typeof message.error.message !== 'string')) throw new NativeProtocolError('Computer Use returned an invalid JSON-RPC error');
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.cleanup();
    if (hasOwn(message, 'error')) pending.reject(new NativeRpcError(message.error, pending.method));
    else pending.resolve(message.result);
  }

  send(message) {
    if (this.closed) throw new NativeTransportError('Computer Use transport is closed', { code: 'NATIVE_TRANSPORT_CLOSED', cause: this.closeError });
    if (!this.child.stdin.writable || this.child.stdin.writableEnded) {
      const error = new NativeTransportError('Computer Use transport is closed', { code: 'NATIVE_TRANSPORT_CLOSED' });
      this.fail(error);
      void this.close().catch(() => {});
      throw error;
    }
    const line = JSON.stringify({ ...message, jsonrpc: '2.0' });
    if (Buffer.byteLength(line, 'utf8') > this.maxMessageBytes) throw new NativeProtocolError(`Computer Use message exceeds ${this.maxMessageBytes} bytes`);
    const failWrite = cause => {
      this.fail(new NativeTransportError('Computer Use transport write failed', { cause }));
      void this.close().catch(() => {});
    };
    try { this.child.stdin.write(line + '\n', cause => { if (cause) failWrite(cause); }); }
    catch (cause) { failWrite(cause); throw this.closeError; }
  }

  request(method, params = {}, { signal, timeoutMs = 30000 } = {}) {
    signal?.throwIfAborted();
    if (typeof method !== 'string' || !method) throw new TypeError('Native request method must be a nonempty string');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new RangeError('Native request timeout must be a positive timer duration');
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      let timer, sent = false;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const cancel = error => {
        if (!this.pending.delete(id)) return;
        cleanup();
        if (sent) {
          try { this.send({ method: 'notifications/cancelled', params: { requestId: id, reason: signal?.aborted ? 'Host cancelled operation' : 'Host operation timed out' } }); } catch {}
        }
        reject(error);
      };
      const abort = () => cancel(signal.reason);
      this.pending.set(id, { resolve, reject, cleanup, method });
      timer = setTimeout(() => cancel(new NativeTransportError(`Computer Use ${method} timed out`, { code: 'NATIVE_TRANSPORT_TIMEOUT', method })), timeoutMs);
      timer.unref();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try { this.send({ id, method, params }); sent = true; } catch (error) { this.pending.delete(id); cleanup(); reject(error); }
    });
  }

  async initialize() {
    const info = await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trisoul-x-computer-use', version: '0.1.0' } });
    this.send({ method: 'notifications/initialized' });
    return info;
  }
  async call(name, args = {}, options) {
    const result = await this.request('tools/call', { name, arguments: args }, options);
    if (!object(result) || result.content !== undefined && !Array.isArray(result.content) || result.isError !== undefined && typeof result.isError !== 'boolean') {
      const error = new NativeProtocolError(`Native tool ${name} returned an invalid result`, { method: 'tools/call' });
      this.fail(error);
      void this.close().catch(() => {});
      throw error;
    }
    if (result.isError) throw new NativeToolError(name, result);
    return result;
  }

  close() {
    if (this.closing) return this.closing;
    this.fail(new NativeTransportError('Computer Use transport is closed', { code: 'NATIVE_TRANSPORT_CLOSED' }));
    // EOF revokes the daemon lease. Wait for process/stdio close even when an
    // earlier failure already marked the client closed.
    this.closing = (async () => {
      let kill, deadline;
      try {
        const timeout = new Promise((_, reject) => {
          kill = setTimeout(() => { try { this.child.kill('SIGKILL'); } catch (cause) { reject(new NativeTransportError('Could not stop Computer Use transport', { cause })); } }, 1500);
          deadline = setTimeout(() => reject(new NativeTransportError('Computer Use transport did not close', { code: 'NATIVE_TRANSPORT_TIMEOUT' })), 3000);
        });
        if (!this.child.stdin.destroyed && !this.child.stdin.writableEnded) this.child.stdin.end();
        await Promise.race([this.exited, timeout]);
      } finally { clearTimeout(kill); clearTimeout(deadline); }
    })().catch(error => {
      this.closing = null;
      throw error;
    });
    return this.closing;
  }
}
