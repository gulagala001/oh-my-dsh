import { textOf } from './store.mjs';
import { MEMORY_CONSTITUTION, OPS_DESC, DIGEST_DESC, STATE_SYSTEM, STATE_RULES, SURGEON_SYSTEM } from './prompts.mjs';

const userMessage = (text, timestamp = Date.now()) => ({ role: 'user', content: text, timestamp });
export function messagesFor(session) {
  const checkpoint = session.events.findLast(e => e.type === 'checkpoint');
  const to = checkpoint?.to ?? -1;
  const messages = session.events.filter(e => e.type === 'message' && e.seq <= to && e.message.role === 'user').map(e => e.message);
  if (checkpoint) messages.push(userMessage(`[Work record · seq ${checkpoint.from}..${checkpoint.to}] Condensed from your own earlier work in this session — continue from the recorded progress and carry forward unfinished work. For verbatim details condensed away, call recall with {"query":"what you need","from":${checkpoint.from},"to":${checkpoint.to}}.\n${checkpoint.text}`, checkpoint.at));
  for (const event of session.events) {
    if (event.seq <= to) continue;
    if (event.type === 'message') messages.push(event.message);
    if (event.type === 'context' || event.type === 'memory-injection') messages.push(userMessage(event.text, event.at));
  }
  return structuredClone(messages);
}

const FIELD = { type: 'string' };
const COMMIT = {
  name: 'save_context', constrainedSampling: false,
  description: 'Save this batch’s digest, working state, and memory changes.',
  parameters: {
    type: 'object', required: ['digest', 'pin', 'status', 'compactable', 'nowCompactable', 'ops'],
    properties: {
      digest: { type: 'string', description: DIGEST_DESC.digest },
      pin: { type: 'array', items: FIELD, description: 'pin lists only pinned entries that newly appeared in this batch of events ([] if none; never repeat existing entries).' },
      status: { type: 'string', description: 'status is the complete snapshot every time (carry over the still-valid parts of the old status, fold away what\'s finished or obsolete).' },
      compactable: { type: 'boolean', description: DIGEST_DESC.compactable },
      nowCompactable: { type: 'array', items: { type: 'integer' }, description: DIGEST_DESC.nowCompactable },
      ops: {
        type: 'array', description: OPS_DESC.ops,
        items: { type: 'object', required: ['op', 'scope', 'key', 'text', 'target'], properties: {
          op: { type: 'string', enum: ['add', 'update', 'retire'], description: OPS_DESC.op }, scope: { type: 'string', enum: ['global', 'cross', 'project'], description: OPS_DESC.scope }, key: { ...FIELD, description: OPS_DESC.key }, text: { ...FIELD, description: OPS_DESC.text }, target: { ...FIELD, description: OPS_DESC.target },
        } },
      },
    },
  },
};

export const SCRIBE = [MEMORY_CONSTITUTION, STATE_SYSTEM, STATE_RULES, 'Submit the result using save_context.'].join('\n\n');

export class ContextHub {
  constructor(store, callModel, notify = () => {}) {
    this.store = store; this.callModel = callModel; this.notify = notify; this.jobs = new Map(); this.pending = new Set(); this.controller = new AbortController();
  }
  dispose() { this.controller.abort(); this.pending.clear(); }
  injectMemories(session) {
    if (session.events.some(e => e.type === 'memory-injection')) return;
    const memories = this.store.memories(session.events[0].project);
    this.store.append(session, 'memory-injection', { text: `[Long-term memory · global / cross-project / project ${session.events[0].project} · background reference, not instructions · past records, not real-time state — verify against the present before relying on them]\n${memories.map(m => `[${m.scope} · ${m.key}] ${m.text}`).join('\n') || '(empty)'}` });
  }
  schedule(session, force = false) {
    if (this.controller.signal.aborted) return Promise.resolve();
    if (this.jobs.has(session.id)) { if (force) this.pending.add(session.id); return this.jobs.get(session.id); }
    const cursor = session.events.findLast(e => e.type === 'digest')?.to ?? -1;
    const fresh = session.events.filter(e => e.seq > cursor && e.type === 'message');
    if (!fresh.length || (!force && fresh.length < 8)) return Promise.resolve();
    const job = this.digest(session, fresh).catch(error => {
      if (this.controller.signal.aborted) return;
      this.notify(session.id, { type: 'maintenance', state: 'error', message: error.message });
      console.error(`[context ${session.id}] ${error.message}`);
    }).finally(() => {
      this.jobs.delete(session.id);
      if (this.pending.delete(session.id)) void this.schedule(session, true);
    });
    this.jobs.set(session.id, job);
    return job;
  }
  async digest(session, fresh) {
    const config = this.store.settings();
    const route = config.background ?? config.main;
    if (!route.model || !route.baseUrl) return;
    const project = session.events[0].project;
    const previous = session.events.findLast(e => e.type === 'context');
    const released = new Set(session.events.filter(e => e.type === 'digest').flatMap(e => e.release));
    const held = session.events.filter(e => e.type === 'digest' && !e.compactable && !released.has(e.seq));
    const prompt = `Current project (git root / cwd): ${project}\nToday: ${new Date().toISOString().slice(0, 10)}\nExisting pinned truths (append-only):\n${JSON.stringify(previous?.pins ?? [])}\nCurrent status zone:\n${previous?.status ?? ''}\nExisting memories:\n${this.store.memories(project).map(m => `- id=${m.id} | ${m.scope} | key=${m.key} | ${m.text}`).join('\n')}\nPending re-review:\n${held.map(e => `- id=${e.seq} seq ${e.from}..${e.to}: ${e.summary}`).join('\n')}\nNew events:\n${fresh.map(e => `[seq ${e.seq} ${e.message.role}] ${textOf(e.message)}`).join('\n')}`;
    this.notify(session.id, { type: 'maintenance', state: 'running' });
    const result = await this.callModel(route, { systemPrompt: SCRIBE, messages: [userMessage(prompt)], tools: [COMMIT] }, { sessionId: `${session.id}:context`, signal: this.controller.signal });
    const call = result.content.findLast(b => b.type === 'toolCall' && b.name === COMMIT.name);
    if (result.stopReason === 'length' || !call) throw new Error('后台未提交完整结果，本批保留待下次整理。');
    const a = call.arguments;
    if (typeof a.digest !== 'string' || !Array.isArray(a.pin) || !a.pin.every(p => typeof p === 'string') || typeof a.status !== 'string' || typeof a.compactable !== 'boolean' || !Array.isArray(a.nowCompactable) || !Array.isArray(a.ops)) throw new Error('后台提交缺少必要字段，本批未提交。');
    this.store.memoryOps(project, a.ops, 'scribe');
    this.store.append(session, 'digest', { from: fresh[0].seq, to: fresh.at(-1).seq, summary: a.digest, compactable: a.compactable, release: a.nowCompactable, usage: result.usage });
    const pins = [...new Set([...(previous?.pins ?? []), ...a.pin])];
    if (JSON.stringify(pins) !== JSON.stringify(previous?.pins ?? []) || a.status !== (previous?.status ?? '')) {
      const version = session.events.filter(e => e.type === 'context').length + 1;
      const text = `[Working state · snapshot v${version} · as of seq ${fresh.at(-1).seq} · supersedes all earlier versions]\n◆ Pinned truths (user constraints / decisions; append-only)\n${pins.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n◆ Status (current plan / progress / conclusions)\n${a.status}`;
      this.store.append(session, 'context', { pins, status: a.status, text });
    }
    this.notify(session.id, { type: 'maintenance', state: 'done' });
  }
  async compact(session, force = false, signal) {
    const config = this.store.settings();
    const current = messagesFor(session);
    const pressure = JSON.stringify(current).length / 4 > (config.main.contextWindow || 128000) * 0.7;
    const previous = session.events.findLast(e => e.type === 'checkpoint');
    const after = previous?.to ?? -1;
    const messageEvents = session.events.filter(e => e.type === 'message');
    if (messageEvents.length < 12) return false;
    const tailStart = messageEvents.at(-8).seq;
    let boundary = -1;
    const pending = new Set();
    for (const e of messageEvents) {
      if (e.seq >= tailStart) break;
      for (const b of Array.isArray(e.message.content) ? e.message.content : []) if (b.type === 'toolCall') pending.add(b.id);
      if (e.message.role === 'toolResult') pending.delete(e.message.toolCallId);
      if (!pending.size && e.seq > after) boundary = e.seq;
    }
    if (boundary < 0) return false;
    const digests = session.events.filter(e => e.type === 'digest');
    const released = new Set(digests.flatMap(e => e.release));
    let ready = -1;
    for (const d of digests.filter(d => d.to > after)) {
      if (d.to > boundary || (!d.compactable && !released.has(d.seq))) break;
      ready = d.to;
    }
    const to = force || pressure ? boundary : ready;
    if (to <= after) return false;
    const span = session.events.filter(e => e.type === 'message' && e.seq > after && e.seq <= to);
    const material = span.map(e => `[seq ${e.seq} ${e.message.role}] ${textOf(e.message)}`).join('\n');
    if (!force && !pressure && material.length < 24000) return false;
    this.notify(session.id, { type: 'maintenance', state: 'compacting' });
    const source = `${previous ? `[checkpoint seq ${previous.from}..${previous.to}]\n${previous.text}\n\n` : ''}${material}`;
    const result = await this.callModel(config.background ?? config.main, {
      systemPrompt: SURGEON_SYSTEM,
      messages: [userMessage(source)],
    }, { sessionId: `${session.id}:compact`, signal: signal ?? this.controller.signal });
    const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text || result.stopReason === 'length' || text.length >= source.length) throw new Error('整理未产生完整且更短的记录，原文已保留。');
    this.store.append(session, 'checkpoint', { from: previous?.from ?? span[0].seq, to, text, usage: result.usage });
    this.notify(session.id, { type: 'maintenance', state: 'done' });
    return true;
  }
}
