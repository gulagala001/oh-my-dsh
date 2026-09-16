import { randomUUID } from 'node:crypto';
import { textBlocks } from '../src/context/core.mjs';
// A protocol fixture, not the DSH implementation. Native integration is tested separately.
export class FixtureSession {
  constructor(id = 's1', events = [], nodes, header = {}) {
    this.id = id; this.header = { id, cwd: '/project', agentPreset: 'trisoul-x', ...header };
    this.events = structuredClone(events); this.surface = { nodes: nodes ? [...nodes] : [] }; this.seq = this.events.length;
  }
  append(type, data, options = {}) {
    const seq = this.seq++, e = { seq, type, data: structuredClone(data), timestamp: 1000 + seq, ...options };
    this.events.push(e);
    if (options.surfaceOp === 'append') this.surface.nodes.push(seq);
    else if (options.surfaceOp?.op === 'replace') {
      const a = this.surface.nodes.indexOf(options.surfaceOp.startSeq), b = this.surface.nodes.indexOf(options.surfaceOp.endSeq);
      if (a < 0 || b < a) throw Error('Invalid surface range');
      const replaced = this.surface.nodes.slice(a, b + 1);
      if (replaced.some(n => !options.sourceEventSeqs.includes(n))) throw Error('Missing source member');
      this.surface.nodes.splice(a, b - a + 1, seq);
    }
    return e;
  }
  eventAt(seq) { return this.events[seq]; }
  snapshotEvents() { return [...this.events]; }
  deriveEventMessage(e) {
    if (!e) return;
    const m = e.type === 'user/message' ? e.data : ['assistant/message', 'system/message', 'tool/result'].includes(e.type) ? e.data.message : undefined;
    if (e.type === 'system/message' && m?.source?.plugin === 'trisoul-x:shadow' && !textBlocks(m.content)) return;
    return m;
  }
  deriveMessages() { return this.surface.nodes.map(n => this.deriveEventMessage(this.eventAt(n))).filter(Boolean); }
  requestContext() { return { contextWindow: 100000 }; }
}
export const user = (s, text) => s.append('user/message', { id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }, { surfaceOp: 'append' });
export const plugin = (s, text, kind = 'context') => s.append('user/message', { id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'trisoul-x:' + kind } }, { surfaceOp: 'append' });
export const system = s => s.append('system/message', { turn: 1, step: 1, message: { id: randomUUID(), role: 'system', content: [{ type: 'text', text: 'System prompt' }], source: { plugin: 'system' } } }, { surfaceOp: 'append' });
export function exchange(s, value = 'Original source material. '.repeat(250), reasoning) {
  const id = randomUUID();
  const a = s.append('assistant/message', { turn: 1, step: 1, message: { id: randomUUID(), role: 'assistant', source: { kind: 'model', model: 'fixture' }, content: [...(reasoning ? [{ type: 'reasoning', text: reasoning }] : []), { type: 'tool-call', id, name: 'read', arguments: '{}' }] } }, { surfaceOp: 'append' });
  const b = s.append('tool/result', { turn: 1, step: 1, message: { id: randomUUID(), role: 'tool', content: [{ type: 'tool-result', toolCallId: id, content: [{ type: 'text', text: value }], isError: false }] } }, { surfaceOp: 'append' });
  return [a, b];
}
const balanced = (s, index) => {
  const pending = new Set();
  for (const seq of s.surface.nodes.slice(0, index)) for (const b of s.deriveEventMessage(s.eventAt(seq))?.content || []) {
    if (b.type === 'tool-call') pending.add(b.id);
    if (b.type === 'tool-result') pending.delete(b.toolCallId);
  }
  return pending.size === 0;
};
export const pairing = { before: (s, seq) => balanced(s, s.surface.nodes.indexOf(seq)), after: (s, seq) => balanced(s, s.surface.nodes.indexOf(seq) + 1) };
export const adapter = {
  pairing,
  message(text, kind) { return { role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'trisoul-x:' + kind } }; },
  publish: plugin,
  async flush() {},
  append(s, op, surfaceOp, sourceEventSeqs) {
    if (op.kind === 'delete') return s.append('system/message', { turn: 1, step: 1, message: { id: op.id, role: 'system', content: [{ type: 'text', text: '' }], source: { plugin: 'trisoul-x:shadow' } } }, { surfaceOp, sourceEventSeqs });
    return s.append('user/message', { ...adapter.message(op.text, op.kind === 'trace' ? 'trace' : 'context-record'), id: op.id,
      content: [{ type: 'text', text: op.text }, ...(op.kind === 'trace' ? op.original.content : [])] }, { surfaceOp, sourceEventSeqs });
  },
};
