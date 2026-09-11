import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// One transport belongs to one Computer Use session. Never share its implicit
// native authority between conversations.
export class McpClient {
  constructor(command, args = [], options = {}) {
    this.sequence = 0; this.pending = new Map(); this.closed = false;
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...options });
    this.stderr = '';
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data).slice(-4000); });
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); pending.cleanup();
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else pending.resolve(message.result);
    });
    const fail = error => {
      this.closed = true;
      for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
      this.pending.clear();
    };
    this.child.on('error', fail);
    this.child.on('exit', (code, signal) => fail(new Error(`Computer Use transport exited (${signal ?? code})`)));
  }
  send(message) {
    if (this.closed || !this.child.stdin.writable) throw new Error('Computer Use transport is closed');
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }
  request(method, params = {}, { signal, timeoutMs = 30000 } = {}) {
    signal?.throwIfAborted();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (!this.pending.delete(id)) return;
        cleanup();
        try { this.send({ method: 'notifications/cancelled', params: { requestId: id, reason: 'Host cancelled operation' } }); } catch {}
        reject(signal?.aborted ? signal.reason : new Error(`Computer Use ${method} timed out`));
      };
      const timer = setTimeout(cancel, timeoutMs); timer.unref();
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
      this.pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', cancel, { once: true });
      try { this.send({ id, method, params }); } catch (error) { this.pending.delete(id); cleanup(); reject(error); }
    });
  }
  async initialize() {
    const info = await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trisoul-x-computer-use', version: '0.1.0' } });
    this.send({ method: 'notifications/initialized' });
    return info;
  }
  async call(name, args = {}, options) {
    const result = await this.request('tools/call', { name, arguments: args }, options);
    if (result.isError) throw Object.assign(new Error(result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || `Native tool ${name} failed`), { code: result.structuredContent?.error?.code });
    return result;
  }
  async close() {
    if (this.closed) return;
    // EOF closes the driver's authenticated transport lease. Wait for actual
    // process exit so a disposed plugin cannot leave a live transport behind.
    this.child.stdin.end();
    await new Promise(resolve => {
      const kill = setTimeout(() => this.child.kill('SIGKILL'), 1500);
      this.child.once('exit', () => { clearTimeout(kill); resolve(); });
      if (this.child.exitCode !== null || this.child.signalCode !== null) { clearTimeout(kill); resolve(); }
    });
    this.lines.close();
  }
}
