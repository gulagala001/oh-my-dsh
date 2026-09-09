import { CompactionEngine, compactCheckpointSource, toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { SURGEON_SYSTEM } from './prompts.mjs';
import { NS, contentText, eventText, message, sessionEvents, substantive } from './hub.mjs';

const checkpoint = e => e.type === 'user/message' && Boolean(e.data.source.compactionId);
export function selectRegion(session, state, config, force = false, pressure = false) {
  const surface = session.surface.nodes.map(seq => session.eventAt(seq));
  const latest = new Map();
  for (const e of surface) if (e.type === 'user/message' && [NS + ':state', NS + ':memory', NS + ':tasks'].includes(e.data.source.plugin)) latest.set(e.data.source.plugin, e.seq);
  const released = new Set(state.digests.flatMap(d => d.release));
  const ready = state.digests.filter(d => d.compactable || released.has(d.id));
  const isReady = seq => ready.some(d => seq >= d.from && seq <= d.to);
  const tail = surface.filter(substantive).slice(-(force ? 8 : config.keepTailEvents));
  const boundary = tail.length ? surface.indexOf(tail[0]) : surface.length;
  let run = [], best = null;
  for (const [position, e] of surface.entries()) {
    const protectedNode = e.type === 'system/message'
      || (e.type === 'user/message' && (e.data.source.kind === 'user' || e.data.source.form === 'snapshot' || latest.get(e.data.source.plugin) === e.seq));
    if (position >= boundary || protectedNode || (!force && !pressure && substantive(e) && !isReady(e.seq))) {
      if (best) return best;
      run = []; continue;
    }
    if (!run.length && !toolPairingBalancedBefore(session, e.seq)) continue;
    run.push(e);
    if (run.length < 2 || !toolPairingBalancedAfter(session, e.seq)) continue;
    const freshChars = run.filter(x => !checkpoint(x)).reduce((n, x) => n + eventText(session, x).length, 0);
    if (force || pressure || freshChars / 4 >= config.minRegionTokens || run.filter(checkpoint).length >= 2) best = { start: run[0].seq, end: e.seq };
  }
  return best;
}

export class Canvas extends CompactionEngine {
  constructor(ctx, hub) {
    super(ctx);
    this.hub = hub;
    this.busy = new Set();
  }
  async compactIfNeeded(agent, trigger, signal) {
    const session = agent.session, state = this.hub.store.state(session.id), config = this.hub.config();
    const steps = sessionEvents(session).filter(e => e.type === 'step/end').length;
    if (trigger !== 'context-overflow' && steps - (state.lastSurgeryStep ?? -Infinity) < config.surgeryCooldownSteps) return null;
    const capacity = session.requestContext()?.contextWindow;
    const pressure = trigger === 'context-overflow' || (capacity && this.ctx.tokenMeter.measure(session).totalTokens >= capacity * config.thresholdRatio);
    const range = selectRegion(session, state, config, false, pressure);
    if (!range || this.busy.has(session.id)) return null;
    const result = await this.compactRegion(range.start, range.end, agent, signal);
    state.lastSurgeryStep = steps; this.hub.store.save(state);
    return result;
  }
  compactNow(agent, signal, sourceCommandId) {
    return agent.runMaintenance(async ownSignal => {
      const joined = AbortSignal.any([ownSignal, signal]);
      const range = selectRegion(agent.session, this.hub.store.state(agent.session.id), this.hub.config(), true);
      if (!range) return null;
      try { return await this.compactRegion(range.start, range.end, agent, joined, sourceCommandId); }
      finally { await this.ctx.sessions.flush(agent.session); }
    });
  }
  async compactRegion(start, end, agent, signal, sourceCommandId) {
    const session = agent.session;
    if (this.busy.has(session.id)) throw new Error('上下文正在整理');
    const nodes = [...session.surface.nodes], first = nodes.indexOf(start), last = nodes.indexOf(end);
    if (first < 0 || last < first || !toolPairingBalancedBefore(session, start) || !toolPairingBalancedAfter(session, end)) throw new Error('整理区间必须包含完整的工具往返');
    const seqs = nodes.slice(first, last + 1), events = seqs.map(seq => session.eventAt(seq));
    if (events.some(e => e.type === 'system/message' || (e.type === 'user/message' && e.data.source.kind === 'user'))) throw new Error('用户原文和系统提示词保留在上下文中');
    const latestTurn = sessionEvents(session).findLast(e => e.type === 'turn/start' || e.type === 'turn/end');
    const turn = latestTurn?.type === 'turn/start' ? latestTurn.data.turn : null;
    const lifecycle = { compactionId: randomUUID(), turn, ...(sourceCommandId ? { sourceCommandId } : {}) };
    const priorRanges = events.filter(checkpoint).flatMap(e => {
      const match = eventText(session, e).match(/seq (\d+)\.\.(\d+)/);
      return match ? [Number(match[1]), Number(match[2])] : [];
    });
    const lo = Math.min(...seqs, ...priorRanges), hi = Math.max(...seqs, ...priorRanges);
    const source = events.map(e => `${checkpoint(e) ? '[checkpoint]' : `[seq ${e.seq} ${e.type}]`}\n${eventText(session, e)}`).join('\n');
    const selected = this.ctx.tokenMeter.measure(session).nodes.filter(n => seqs.includes(n.seq));
    const shadowedTokenCount = selected.reduce((n, e) => n + e.heuristicTokens, 0);
    this.busy.add(session.id);
    const begin = session.append('compaction/start', lifecycle);
    let ended = false;
    try {
      const result = await this.hub.call(agent, 'surgeon', { system: SURGEON_SYSTEM, messages: [message(source)], purpose: 'compaction' }, signal);
      signal?.throwIfAborted();
      const text = contentText(result.blocks).trim();
      const header = `[Work record · seq ${lo}..${hi}] Condensed from your own earlier work in this session — continue from the recorded progress and carry forward unfinished work. For verbatim details condensed away, call recall with {"query":"what you need","from":${lo},"to":${hi}}.`;
      if (!text || (header.length + text.length >= source.length)) throw new Error('整理结果未缩短，原文仍保留');
      const current = session.surface.nodes, a = current.indexOf(start), b = current.indexOf(end);
      if (a < 0 || JSON.stringify(current.slice(a, b + 1)) !== JSON.stringify(seqs)) throw new Error('整理期间区间发生变化，原文仍保留');
      const summary = [{ type: 'text', text: `${header}\n${text}` }];
      const summarized = session.append('compaction/summary', {
        compactionId: lifecycle.compactionId, ...(sourceCommandId ? { sourceCommandId } : {}),
        summary, shadowedRange: { start, end }, shadowedSeqs: seqs, shadowedTokenCount,
        provider: result.provider, model: result.model, rawOutput: result.blocks, llmStreamCall: true,
        ...(result.usage ? { usage: result.usage } : {}),
      });
      session.append('user/message', createUserMessage({ content: summary, source: compactCheckpointSource(lifecycle.compactionId) }), {
        surfaceOp: { op: 'replace', startSeq: start, endSeq: end }, sourceEventSeqs: [begin.seq, summarized.seq, ...seqs],
      });
      const done = session.append('compaction/end', lifecycle);
      ended = true;
      const state = this.hub.store.state(session.id);
      state.checkpoint = { from: lo, to: hi, text, at: Date.now(), freedTokens: shadowedTokenCount - Math.ceil((header.length + text.length) / 4) };
      this.hub.store.save(state);
      this.hub.action(session, 'surgeries', 1, { from: lo, to: hi, inputChars: source.length, outputChars: header.length + text.length, freedTokens: state.checkpoint.freedTokens });
      return { compactionId: lifecycle.compactionId, startSeq: begin.seq, summarySeq: summarized.seq, endSeq: done.seq, summary, shadowedRange: { start, end }, shadowedSeqs: seqs, shadowedTokenCount };
    } catch (error) {
      if (!ended) session.append('compaction/end', { ...lifecycle, error: error.message });
      this.hub.action(session, 'surgeryErrors', 1, { error: error.message });
      throw error;
    } finally { this.busy.delete(session.id); }
  }
}
