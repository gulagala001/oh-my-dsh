import { Duplex } from 'node:stream';
import { spawn } from 'node:child_process';

const MAX_CHUNK = 65536;

// This adapter presents the same byte streams as net.Server. The helper owns
// Windows pipe ACLs; the existing ExtensionHub still validates every message.
export class WindowsPipeServer {
  constructor(command, args, accept) {
    this.command = command; this.args = args; this.accept = accept;
    this.connections = new Map(); this.header = Buffer.alloc(9); this.headerOffset = 0; this.offset = 0; this.body = null;
  }
  async listen(path) {
    if (this.child) throw new Error('Browser pipe server already started');
    this.child = spawn(this.command, [...this.args, 'pipe-server', path], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.stderr = '';
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data).slice(-2000); });
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stdout.on('data', chunk => { try { this.read(chunk); } catch (error) { this.fail(error); this.child.kill(); } });
    this.child.once('error', error => this.fail(error));
    this.child.once('exit', code => this.fail(new Error('Windows browser bridge exited (' + code + ')' + (this.stderr ? ': ' + this.stderr.trim() : ''))));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail(new Error('Windows browser pipe did not become ready')); this.child.kill(); }, 10000);
      this.ready = () => { clearTimeout(timer); this.ready = null; this.rejectReady = null; resolve(); };
      this.rejectReady = error => { clearTimeout(timer); this.ready = null; this.rejectReady = null; reject(error); };
    });
  }
  fail(error) {
    this.failure = error; this.rejectReady?.(error);
    for (const connection of this.connections.values()) connection.destroy(error);
    this.connections.clear();
  }
  read(chunk) {
    let at = 0;
    while (at < chunk.length) {
      if (!this.body) {
        const size = Math.min(9 - this.headerOffset, chunk.length - at);
        chunk.copy(this.header, this.headerOffset, at, at + size); at += size; this.headerOffset += size;
        if (this.headerOffset !== 9) continue;
        this.type = this.header[0]; this.id = this.header.readUInt32LE(1); const length = this.header.readUInt32LE(5);
        this.headerOffset = 0;
        if (![0, 1, 2, 3].includes(this.type) || length > MAX_CHUNK || (this.type !== 2 && length !== 0) || (this.type === 0 ? this.id !== 0 || !this.ready : this.id === 0)) throw new Error('Invalid Windows browser transport packet');
        if (!length) { this.packet(this.type, this.id, Buffer.alloc(0)); continue; }
        this.body = Buffer.allocUnsafe(length); this.offset = 0;
      }
      const size = Math.min(this.body.length - this.offset, chunk.length - at);
      chunk.copy(this.body, this.offset, at, at + size); at += size; this.offset += size;
      if (this.offset === this.body.length) { const data = this.body; this.body = null; this.packet(this.type, this.id, data); }
    }
  }
  packet(type, id, data) {
    if (type === 0) { this.ready(); return; }
    if (type === 1) {
      if (this.connections.has(id)) throw new Error('Duplicate Windows browser connection');
      const server = this;
      const socket = new Duplex({
        read() {},
        write(chunk, encoding, done) { server.send(2, id, chunk, done); },
        final(done) { server.send(3, id, Buffer.alloc(0), done); },
        destroy(error, done) {
          server.connections.delete(id);
          server.send(3, id, Buffer.alloc(0), () => done(error));
        },
      });
      this.connections.set(id, socket); this.accept(socket); return;
    }
    const socket = this.connections.get(id); if (!socket) return;
    if (type === 2) socket.push(data);
    else { socket.push(null); socket.destroy(); }
  }
  send(type, id, data, callback) {
    if (this.failure || !this.child?.stdin.writable) { callback(this.failure ?? new Error('Windows browser bridge is closed')); return; }
    let at = 0;
    const next = () => {
      const size = Math.min(MAX_CHUNK, data.length - at), packet = Buffer.allocUnsafe(9 + size);
      packet[0] = type; packet.writeUInt32LE(id, 1); packet.writeUInt32LE(size, 5); data.copy(packet, 9, at, at + size); at += size;
      this.child.stdin.write(packet, error => { if (error || at === data.length) callback(error); else next(); });
    };
    next();
  }
  close(callback) {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) { callback(); return; }
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); callback(); });
  }
}
