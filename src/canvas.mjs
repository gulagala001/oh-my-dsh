import { CompactionEngine, compactCheckpointSource, toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction';
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { Prober, digestMaterial } from './probe.mjs';
import { SURGEON_SYSTEM } from './prompts.mjs';
import { NS, contentText, eventText, message, sessionEvents, substantive } from './hub.mjs';

const checkpoint = e => e.type === 'user/message' && Boolean(e.data.source.compactionId);
export const estimateTokens = text => {
  const cjk = (text.match(/[\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return Math.ceil(cjk + (text.length - cjk) / 3.5);
};
const source = e => e.type === 'user/message' ? e.data.source.plugin : undefined;
const shadow = e => e.type === 'system/message' && e.data.message?.source?.plugin === NS + ':shadow';
function surfaceInfo(session, config) {
  const surface = session.surface.nodes.map(seq => session.eventAt(seq)), latest = new Map();
  for (const e of surface) if (['state', 'tasks', 'task-memory'].some(k => source(e) === NS + ':' + k)) latest.set(source(e), Math.max(latest.get(source(e)) ?? -1, e.seq));
  const user = Math.max(-1, ...surface.filter(e => e.type === 'user/message' && e.data.source.kind === 'user').map(e => e.seq));
  const pinned = e => (e.type === 'system/message' && !shadow(e)) || (e.type === 'user/message' && (
    (e.data.source.kind === 'user' && (!config.userRetirement || e.seq === user)) || e.data.source.form === 'snapshot'
    || (checkpoint(e) && config.mergeCheckpoints === false)
    || ([NS + ':state', NS + ':tasks'].includes(source(e)) && latest.get(source(e)) === e.seq)));
  const material = e => ![NS + ':state', NS + ':tasks'].includes(source(e)) && !shadow(e) && !(source(e) === NS + ':task-memory' && e.seq !== latest.get(source(e)));
  return { surface, latest, pinned, material };
}
export function selectRegion(session, state, config, force = false, pressure = false) {
  const { surface, pinned, material } = surfaceInfo(session, config);
  const released = new Set(state.digests.flatMap(d => d.release)), closed = Math.max(-1, ...state.digests.filter(d => d.phaseClosed).map(d => d.to));
  const ready = state.digests.filter(d => d.compactable || released.has(d.id));
  const isReady = e => (e.type === 'user/message' && e.data.source.kind === 'plugin') || shadow(e) || e.seq <= closed || ready.some(d => e.seq >= d.from && e.seq <= d.to);
  const cutoff = Math.max(0, surface.length - (force ? Math.min(8, config.keepTailEvents) : config.keepTailEvents));
  const scan = semantic => {
    let run = [];
    const evaluate = () => {
      while (run.length && !toolPairingBalancedBefore(session, run[0].seq)) run.shift();
      while (run.length && !toolPairingBalancedAfter(session, run.at(-1).seq)) run.pop();
      if (!run.length || (force && !run.some(substantive) && run.filter(checkpoint).length < 2)) return null;
      const fresh = run.filter(e => material(e) && !checkpoint(e));
      const merged = config.mergeCheckpoints !== false && run.filter(checkpoint).length >= 2;
      if (!force && !merged && (fresh.length < (config.minRegionEvents ?? 3) || fresh.reduce((n, e) => n + estimateTokens(eventText(session, e)), 0) < config.minRegionTokens)) return null;
      return { start: run[0].seq, end: run.at(-1).seq };
    };
    for (const e of surface.slice(0, cutoff)) {
      if (pinned(e) || (semantic && !isReady(e))) { const result = evaluate(); if (result) return result; run = []; }
      else run.push(e);
    }
    return evaluate();
  };
  if (force) return scan(false);
  if (config.semanticCompaction !== false && (ready.length || closed >= 0)) { const result = scan(true); if (result) return result; }
  return pressure ? scan(false) : null;
}
export function sweepStale(session, config) {
  if (!(config.shadowStale > 0)) return [];
  const done = [];
  for (const kind of ['state', 'tasks', 'task-memory']) {
    const { surface, latest } = surfaceInfo(session, config), key = NS + ':' + kind;
    const stale = surface.flatMap((e, i) => source(e) === key && e.seq !== latest.get(key) ? [i] : []);
    if (stale.length < config.shadowStale) continue;
    const segments = []; let run = [];
    for (const i of stale) { if (run.length && i !== run.at(-1) + 1) { segments.push(run); run = []; } run.push(i); }
    if (run.length) segments.push(run);
    for (const segment of segments) {
      const seqs = segment.map(i => surface[i].seq);
      const log = session.snapshotEvents();
      const turn = log.findLast(e => Number.isSafeInteger(e.data?.turn) && e.data.turn > 0)?.data.turn || 1;
      const step = log.findLast(e => Number.isSafeInteger(e.data?.step) && e.data.step > 0)?.data.step || 1;
      session.append('system/message', { turn, step, message: createSystemMessage('', NS + ':shadow') }, { surfaceOp: { op: 'replace', startSeq: seqs[0], endSeq: seqs.at(-1) }, sourceEventSeqs: seqs });
    }
    done.push({ source: kind, versions: stale.length, segments: segments.length });
  }
  return done;
}

export class Canvas extends CompactionEngine {
  constructor(ctx, hub) {
    super(ctx);
    this.hub = hub;
    this.busy = new Set(); this.prober = new Prober(hub, this);
    ctx.effect(() => () => this.prober.dispose());
  }
  async compactIfNeeded(agent, trigger, signal) {
    const session = agent.session, state = this.hub.store.state(session.id), config = this.hub.config();
    const steps = sessionEvents(session).filter(e => e.type === 'step/end').length;
    for (const swept of sweepStale(session, config)) this.hub.action(session, 'staleVersions', swept.versions, swept);
    if (this.hub.stateZone?.degraded(session)) return null;
    if (trigger !== 'context-overflow' && steps - (state.lastSurgeryStep ?? -Infinity) < config.surgeryCooldownSteps) return null;
    const capacity = session.requestContext()?.contextWindow;
    const totalChars = session.surface.nodes.reduce((n, seq) => n + eventText(session, session.eventAt(seq)).length, 0);
    const pressure = trigger === 'context-overflow' || (config.thresholdChars > 0 ? totalChars > config.thresholdChars : capacity ? this.ctx.tokenMeter.measure(session).totalTokens >= capacity * config.thresholdRatio : totalChars > config.thresholdFallbackChars);
    const range = selectRegion(session, state, config, false, pressure);
    if (!range || this.busy.has(session.id)) return null;
    const key = `${range.start}:${range.end}`, fail = state.surgeryFailure;
    if (trigger !== 'context-overflow' && fail && steps - fail.step < config.surgeryFailCooldownSteps * fail.streak) return null;
    try {
      const result = await this.compactRegion(range.start, range.end, agent, signal);
      state.lastSurgeryStep = steps; delete state.surgeryFailure; this.hub.store.save(state); return result;
    } catch (error) {
      state.surgeryFailure = { key, step: steps, streak: fail?.key === key ? fail.streak + 1 : 1 }; this.hub.store.save(state); throw error;
    }
  }

  compactNow(agent, signal, sourceCommandId) {
    return agent.runMaintenance(async ownSignal => {
      const joined = AbortSignal.any([ownSignal, signal]);
      const range = selectRegion(agent.session, this.hub.store.state(agent.session.id), this.hub.config(), true);
      if (!range) return null;
      this.maintenance ??= new Set(); this.maintenance.add(agent.session.id);
      try {
        const result = await this.compactRegion(range.start, range.end, agent, joined, sourceCommandId);
        await this.prober?.latest?.get(agent.session.id);
        return result;
      }
      finally { this.maintenance.delete(agent.session.id); await this.ctx.sessions.flush(agent.session); }
    });
  }
  async compactRegion(start, end, agent, signal, sourceCommandId) {
    const session = agent.session;
    if (this.busy.has(session.id)) throw new Error('上下文正在整理');
    const nodes = [...session.surface.nodes], first = nodes.indexOf(start), last = nodes.indexOf(end);
    if (first < 0 || last < first || !toolPairingBalancedBefore(session, start) || !toolPairingBalancedAfter(session, end)) throw new Error('整理区间必须包含完整的工具往返');
    const seqs = nodes.slice(first, last + 1), events = seqs.map(seq => session.eventAt(seq));
    const cfg = this.hub.config(), info = surfaceInfo(session, cfg);
    if (events.some(info.pinned)) throw new Error('用户原文、系统提示词和最新状态/任务快照保留在上下文中');
    if (this.hub.stateZone?.degraded(session)) throw new Error('状态提炼暂未恢复，上下文整理等待下一批状态');
    const latestTurn = sessionEvents(session).findLast(e => e.type === 'turn/start' || e.type === 'turn/end');
    const turn = latestTurn?.type === 'turn/start' ? latestTurn.data.turn : null;
    const lifecycle = { compactionId: randomUUID(), turn, ...(sourceCommandId ? { sourceCommandId } : {}) };
    const priorRanges = events.filter(checkpoint).flatMap(e => {
      const match = eventText(session, e).match(/seq (\d+)\.\.(\d+)/);
      return match ? [Number(match[1]), Number(match[2])] : [];
    });
    const lo = Math.min(...seqs, ...priorRanges), hi = Math.max(...seqs, ...priorRanges);
    const material = events.filter(info.material);
    const raw = material.map(e => checkpoint(e) ? `[checkpoint]\n${eventText(session, e).split('\n').slice(1).join('\n')}` : `[seq ${e.seq} ${e.type}]\n${eventText(session, e)}`).join('\n');
    if (!raw.trim()) throw new Error('区间只有已换代快照，无需模型整理');
    const state = this.hub.store.state(session.id), draft = digestMaterial(state, Math.min(...seqs), Math.max(...seqs)), notes = this.prober?.notes(session) || [];
    const notesBlock = notes.length ? `\n\nAddendum (verified facts earlier records missed; preserve each verbatim in the record):\n${notes.map(n => '- ' + n).join('\n')}` : '';
    const source = raw + (draft ? `\n\nPre-condensed draft from the memory hub (usable as a base; the original text above remains authoritative):\n${draft}` : '') + notesBlock;
    const selected = this.ctx.tokenMeter.measure(session).nodes.filter(n => seqs.includes(n.seq));
    const shadowedTokenCount = selected.reduce((n, e) => n + e.heuristicTokens, 0);
    this.busy.add(session.id);
    const begin = session.append('compaction/start', lifecycle);
    let ended = false;
    try {
      const result = await this.hub.call(agent, 'surgeon', { system: SURGEON_SYSTEM, messages: [message(source)], purpose: 'compaction', ...(cfg.surgeonMaxTokens > 0 ? { maxTokens: cfg.surgeonMaxTokens } : {}) }, signal);
      signal?.throwIfAborted();
      let text = contentText(result.blocks).trim();
      const header = `[Work record · seq ${lo}..${hi}] Condensed from your own earlier work in this session — continue from the recorded progress and carry forward unfinished work. For verbatim details condensed away, call recall with {"query":"what you need","from":${lo},"to":${hi}}.`;
      if (!text) throw new Error('整理结果为空，原文仍保留');
      if (cfg.requireShorter !== false && header.length + 1 + text.length >= raw.length + notesBlock.length) {
        if (draft && header.length + 1 + draft.length < raw.length + notesBlock.length) { text = draft; this.hub.action(session, 'digestFallbacks'); }
        else throw new Error('整理结果未缩短，原文仍保留');
      }
      const current = session.surface.nodes, a = current.indexOf(start), b = current.indexOf(end);
      if (a < 0 || JSON.stringify(current.slice(a, b + 1)) !== JSON.stringify(seqs)) throw new Error('整理期间区间发生变化，原文仍保留');
      const summary = [{ type: 'text', text: `${header}\n${text}` }];
      const summarized = session.append('compaction/summary', {
        compactionId: lifecycle.compactionId, ...(sourceCommandId ? { sourceCommandId } : {}),
        summary, shadowedRange: { start, end }, shadowedSeqs: seqs, shadowedTokenCount,
        provider: result.provider, model: result.model, rawOutput: result.blocks, llmStreamCall: true,
        ...(result.usage ? { usage: result.usage } : {}),
      });
      const checkpointEvent = session.append('user/message', createUserMessage({ content: summary, source: compactCheckpointSource(lifecycle.compactionId) }), {
        surfaceOp: { op: 'replace', startSeq: start, endSeq: end }, sourceEventSeqs: [begin.seq, summarized.seq, ...seqs],
      });
      const done = session.append('compaction/end', lifecycle);
      ended = true;
      const state = this.hub.store.state(session.id);
      state.checkpoint = { from: lo, to: hi, text, at: Date.now(), seq: checkpointEvent.seq, compactionId: lifecycle.compactionId, freedTokens: shadowedTokenCount - estimateTokens(header + text) };
      this.hub.store.save(state);
      this.hub.action(session, 'surgeries', 1, { from: lo, to: hi, inputChars: raw.length + notesBlock.length, outputChars: header.length + text.length, freedTokens: state.checkpoint.freedTokens });
      this.prober?.consume(session, notes, text);
      void this.prober?.run(agent, lo, hi, text, lifecycle.compactionId, signal);
      return { compactionId: lifecycle.compactionId, startSeq: begin.seq, summarySeq: summarized.seq, endSeq: done.seq, summary, shadowedRange: { start, end }, shadowedSeqs: seqs, shadowedTokenCount };
    } catch (error) {
      if (!ended) session.append('compaction/end', { ...lifecycle, error: error.message });
      this.hub.action(session, 'surgeryErrors', 1, { error: error.message });
      throw error;
    } finally { this.busy.delete(session.id); }
  }
  async patchCheckpoint(agent, old, text, signal) {
    const apply = async ownSignal => {
      signal?.throwIfAborted(); ownSignal?.throwIfAborted();
      const session = agent.session;
      if (!session.surface.nodes.includes(old.seq)) throw new Error('检查点已被下一次整理接管，补记留待下次');
      const lifecycle = { compactionId: randomUUID(), turn: null }, summary = [{ type: 'text', text }];
      const begin = session.append('compaction/start', lifecycle); let ended = false;
      try {
        const shadowedTokenCount = estimateTokens(eventText(session, old));
        const done = session.append('compaction/summary', { compactionId: lifecycle.compactionId, summary, shadowedRange: { start: old.seq, end: old.seq }, shadowedSeqs: [old.seq], shadowedTokenCount, llmStreamCall: false });
        const cp = session.append('user/message', createUserMessage({ content: summary, source: compactCheckpointSource(lifecycle.compactionId) }), { surfaceOp: { op: 'replace', startSeq: old.seq, endSeq: old.seq }, sourceEventSeqs: [begin.seq, done.seq, old.seq] });
        session.append('compaction/end', lifecycle); ended = true;
        const state = this.hub.store.state(session.id);
        if (state.checkpoint?.compactionId === old.data.source.compactionId) state.checkpoint = { ...state.checkpoint, text, seq: cp.seq, compactionId: lifecycle.compactionId };
        this.hub.store.save(state); await this.ctx.sessions?.flush(session); return cp;
      } catch (error) { if (!ended) session.append('compaction/end', { ...lifecycle, error: error.message }); throw error; }
    };
    return agent.runMaintenance && !this.maintenance?.has(agent.session.id) ? agent.runMaintenance(apply) : apply();
  }

}
