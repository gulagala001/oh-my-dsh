import { STATE_SYSTEM, STATE_RULES } from './prompts.mjs';
import { message, eventText, substantive } from './hub.mjs';

export const SAVE_STATE = {
  name: 'save_state', description: 'Save the new pinned truths and the complete status snapshot.',
  parameters: { type: 'object', required: ['pin', 'status'], properties: {
    pin: { type: 'array', items: { type: 'string' }, description: 'pin lists only pinned entries that newly appeared in this batch of events ([] if none; never repeat existing entries).' },
    status: { type: 'string', description: "status is the complete snapshot every time (carry over the still-valid parts of the old status, fold away what's finished or obsolete)." },
  } },
};
export const STATE_SCRIBE = [STATE_SYSTEM, STATE_RULES, 'Submit the result using save_state.'].join('\n\n');
const PIN = '◆ Pinned truths (user constraints / decisions; append-only)';
const STATUS = '◆ Status (current plan / progress / conclusions)';

export class StateZone {
  constructor(hub) { this.hub = hub; this.jobs = new Map(); this.controllers = new Map(); }
  record(session) {
    const s = this.hub.store.state(session.id);
    if (s.stateCursor === undefined) {
      s.stateCursor = s.cursor; s.stateVersion = 0; s.stateFailures = 0; s.stateCooldown = 0;
      const last = session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data.source.plugin === 'trisoul-x:state');
      if (last) {
        const text = eventText(session, last), head = text.match(/snapshot v(\d+) · as of seq (\d+)/);
        if (head) { s.stateVersion = Number(head[1]); s.stateCursor = Math.max(s.stateCursor, Number(head[2])); }
        const lines = text.split('\n'); let zone;
        const pins = [], status = [];
        for (const line of lines.slice(1)) {
          if (line === PIN) { zone = 'pin'; continue; }
          if (line === STATUS) { zone = 'status'; continue; }
          if (zone === 'pin' && /^\d+\. /.test(line)) pins.push(line.replace(/^\d+\. /, ''));
          else if (zone === 'status') status.push(line);
        }
        if (!s.pins.length) s.pins = pins;
        if (!s.status) s.status = status.join('\n').trim();
      }
      this.hub.store.save(s);
    }
    return s;
  }
  publish(agent) {
    if (!this.hub.config().stateEnabled) return;
    const session = agent.session, s = this.record(session);
    if (!s.pins.length && !s.status.trim()) return;
    const last = session.surface.nodes.map(seq => session.eventAt(seq)).findLast(e => e.type === 'user/message' && e.data.source.plugin === 'trisoul-x:state');
    if (!s.stateDirty && last) return;
    const parts = [`[Working state · snapshot v${++s.stateVersion} · as of seq ${Math.max(0, s.stateCursor)} · supersedes all earlier versions]`];
    if (s.pins.length) parts.push(PIN, s.pins.map((p, i) => `${i + 1}. ${p}`).join('\n'));
    if (s.status.trim()) parts.push(STATUS, s.status.trim());
    session.append('user/message', message(parts.join('\n'), 'state'), { surfaceOp: 'append' });
    s.stateDirty = false; this.hub.store.save(s);
  }
  preStep(agent, signal) {
    if (!this.hub.config().stateEnabled || agent.session.header.origin === 'subagent') return;
    this.publish(agent);
    const s = this.record(agent.session);
    if (s.stateCooldown > 0) { s.stateCooldown--; this.hub.store.save(s); return; }
    return this.schedule(agent, signal);
  }
  schedule(agent, signal) {
    const session = agent.session, cfg = this.hub.config();
    if (!cfg.stateEnabled || session.header.origin === 'subagent') return Promise.resolve();
    if (this.jobs.has(session.id)) return this.jobs.get(session.id);
    const s = this.record(session);
    let fresh = session.snapshotEvents().filter(e => e.seq > s.stateCursor && substantive(e) && eventText(session, e).trim());
    if (fresh.length < cfg.stateEvery || s.stateCooldown > 0) return Promise.resolve();
    if (cfg.stateBatchMax > 0) fresh = fresh.slice(-Math.max(cfg.stateEvery, cfg.stateBatchMax));
    const controller = new AbortController(); this.controllers.set(session.id, controller);
    const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const job = this.distill(agent, fresh, joined).catch(error => {
      if (joined.aborted) return;
      s.stateFailures++; s.stateCooldown = cfg.stateFailCooldownSteps;
      this.hub.action(session, 'stateErrors', 1, { error: error.message, failures: s.stateFailures });
      this.hub.ctx.logger.warn(`状态提炼：${error.message}`);
    }).finally(() => { this.hub.store.save(s); this.jobs.delete(session.id); this.controllers.delete(session.id); });
    this.jobs.set(session.id, job); return job;
  }
  async distill(agent, fresh, signal) {
    const session = agent.session, s = this.record(session), cfg = this.hub.config();
    const text = e => cfg.stateEventChars > 0 ? eventText(session, e).slice(0, cfg.stateEventChars) : eventText(session, e);
    const prompt = `Existing pinned truths (append-only):\n${s.pins.length ? s.pins.map((p, i) => `${i + 1}. ${p}`).join('\n') : '(empty)'}\n\nCurrent status zone:\n${s.status.trim() || '(empty)'}\n\nNew events (seq ${fresh[0].seq}..${fresh.at(-1).seq}):\n${fresh.map(e => `[seq ${e.seq} ${e.type}] ${text(e)}`).join('\n')}`;
    const result = await this.hub.call(agent, 'state', { system: STATE_SCRIBE, messages: [message(prompt)], tools: [SAVE_STATE], ...(cfg.stateMaxTokens > 0 ? { maxTokens: cfg.stateMaxTokens } : {}) }, signal);
    signal.throwIfAborted();
    const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === SAVE_STATE.name);
    const a = call && (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments);
    if (!Array.isArray(a?.pin) || !a.pin.every(p => typeof p === 'string') || typeof a.status !== 'string') throw new Error('状态作业未提交完整结果，保留上一版');
    const before = s.pins.length;
    for (const p of a.pin.map(p => p.trim())) if (p && !s.pins.includes(p) && (!cfg.statePinnedMax || s.pins.length < cfg.statePinnedMax)) s.pins.push(p);
    s.stateDirty ||= s.pins.length > before || a.status.trim() !== s.status;
    s.status = a.status.trim(); s.stateCursor = fresh.at(-1).seq; s.stateFailures = 0;
    this.hub.action(session, 'states', 1, { from: fresh[0].seq, to: s.stateCursor, pinnedAdded: s.pins.length - before });
  }
  degraded(session) { const cfg = this.hub.config(); return cfg.stateEnabled && cfg.stateFailLimit > 0 && this.record(session).stateFailures >= cfg.stateFailLimit; }
  dispose(id) { if (id) this.controllers.get(id)?.abort(); else for (const c of this.controllers.values()) c.abort(); }
}
