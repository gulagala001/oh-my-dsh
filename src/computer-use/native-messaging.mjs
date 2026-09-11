import { endianness } from 'node:os';

const littleEndian = endianness() === 'LE';
export function encodeNativeMessage(value, maxBytes = 1024 * 1024) {
  const body = Buffer.from(JSON.stringify(value));
  if (!body.length || body.length > maxBytes) throw new Error(`Native message exceeds ${maxBytes} bytes`);
  const frame = Buffer.allocUnsafe(body.length + 4);
  if (littleEndian) frame.writeUInt32LE(body.length); else frame.writeUInt32BE(body.length);
  body.copy(frame, 4); return frame;
}

// Incremental, bounded framing: fragmented UTF-8 and many messages in one read
// are normal. Never repeatedly concatenate an ever-growing screenshot buffer.
export class NativeMessageReader {
  constructor(onMessage, maxBytes = 64 * 1024 * 1024) {
    this.onMessage = onMessage; this.maxBytes = maxBytes;
    this.header = Buffer.alloc(4); this.headerOffset = 0; this.offset = 0; this.body = null;
  }
  push(chunk) {
    let at = 0;
    while (at < chunk.length) {
      if (!this.body) {
        const count = Math.min(4 - this.headerOffset, chunk.length - at);
        chunk.copy(this.header, this.headerOffset, at, at + count); this.headerOffset += count; at += count;
        if (this.headerOffset !== 4) continue;
        const size = littleEndian ? this.header.readUInt32LE() : this.header.readUInt32BE();
        if (!size || size > this.maxBytes) throw new Error('Invalid native message length');
        this.body = Buffer.allocUnsafe(size); this.offset = 0; this.headerOffset = 0;
      }
      const count = Math.min(this.body.length - this.offset, chunk.length - at);
      chunk.copy(this.body, this.offset, at, at + count); this.offset += count; at += count;
      if (this.offset === this.body.length) {
        const body = this.body; this.body = null; this.offset = 0;
        this.onMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)));
      }
    }
  }
  end() { if (this.body || this.headerOffset) throw new Error('Native messaging ended inside a frame'); }
}
