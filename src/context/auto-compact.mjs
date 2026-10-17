import { hash, activeRecords, liveSpan, prepareCandidate, candidateInput, decodeResult, validatePrepared, newRecord, backlogView } from './core.mjs';
import { serializePreparationInput } from './input-budget.mjs';
import { SUMMARY_PROMPT_VERSION, PREPARE_SYSTEM, PREPARE_TOOL } from './prompts.mjs';

export class AutoCompaction {
  constructor(pipeline) { this.pipeline = pipeline; this.signals = new WeakMap(); }
  used(session) { return this.pipeline.hub.ctx.tokenMeter?.measure(session)?.totalTokens ?? 0; }
  fingerprint(session, state, cfg) {
    return hash([session.surface.nodes, state.records.map(r => [r.id, r.version, r.mode, r.mergedInto]), cfg.autoCompactThreshold, cfg.autoCompactMode]);
  }
  idle(agent) {
    const signal = this.signals.get(agent);
    this.signals.delete(agent);
    if (signal?.aborted) this.pipeline.controllers.get(agent.session.id + ':autoCompact')?.abort(signal.reason);
    else this.kick(agent);
  }
  kick(agent) {
    void this.check(agent).catch(error => this.pipeline.hub.ctx.logger?.warn?.(`Auto Compact：${error.message}`));
  }
  check(agent, signal = this.signals.get(agent), { maintenance = true } = {}) {
    if (signal) this.signals.set(agent, signal);
    const p = this.pipeline, session = agent.session, id = session.id, key = id + ':autoCompact', cfg = p.config();
    if (p.closed || !cfg.autoCompactEnabled || session.header?.origin === 'subagent' || Number(session.header?.delegationDepth) > 0
      || p.agents.get(id) !== agent || p.adaptive.isManaged && !p.adaptive.isManaged(session)) return Promise.resolve(null);
    if (p.jobs.has(key)) {
      const controller = p.controllers.get(key), abort = () => controller?.abort(signal.reason);
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      return p.jobs.get(key).finally(() => { signal?.removeEventListener('abort', abort); signal?.throwIfAborted(); });
    }
    if (signal?.aborted || p.manualSessions.has(id)) return Promise.resolve(null);
    const s = p.state(session);
    if (s.transaction || s.manualQueue.length || this.used(session) < cfg.autoCompactThreshold) return Promise.resolve(null);
    if (s.autoCompact?.lastKey === this.fingerprint(session, s, cfg)) return Promise.resolve(null);
    const controller = new AbortController();
    const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    p.controllers.set(key, controller);
    p.manualSessions.set(id, 'auto-compact');
    let resumeReview = false, reviewSignal = joined;
    const run = async ownSignal => {
      const activeSignal = ownSignal ? AbortSignal.any([joined, ownSignal]) : joined;
      reviewSignal = activeSignal;
      const current = () => {
        activeSignal.throwIfAborted();
        if (p.closed || p.agents.get(id) !== agent || !p.config().autoCompactEnabled
          || p.adaptive.isManaged && !p.adaptive.isManaged(session)) throw Error('Auto Compact 已取消');
      };
      current();
      resumeReview = p.jobs.has(id + ':coordinate') || p.reviewTimers.has(id + ':coordinate') || s.pending?.source === 'coordinator';
      for (const kind of ['prepare', 'coordinate', 'adaptive']) p.controllers.get(id + ':' + kind)?.abort(Error('Auto Compact 已接管本次整理'));
      await Promise.allSettled(['prepare', 'coordinate', 'adaptive'].map(kind => p.jobs.get(id + ':' + kind)).filter(Boolean));
      current();
      if (this.used(session) < cfg.autoCompactThreshold) return null;
      s.pending = null;
      if (resumeReview) s.review.needed = true;
      s.autoCompact = { ...s.autoCompact, lastAt: Date.now(), mode: cfg.autoCompactMode, threshold: cfg.autoCompactThreshold, beforeTokens: this.used(session), error: null };
      p.store.save(s);
      let result = null;
      // A threshold trigger bypasses cadence, cooldown and the ordinary recent
      // tail, but never splits a tool round-trip or replaces protected prompts.
      const preparation = { ...cfg, preprocessBoundaries: false, keepTailEvents: 0, prepareContinueTokens: 0 };
      const limit = session.surface.nodes.length;
      for (let i = 0; i <= limit; i++) {
        current();
        const ids = activeRecords(s).filter(r => liveSpan(session, r)
          && (cfg.autoCompactMode === 'brief' ? r.mode !== 'brief' : r.mode === 'raw')).map(r => r.id);
        if (ids.length) {
          const applied = await p.applyReady(agent, { manual: true, ids, mode: cfg.autoCompactMode, source: 'auto-compact' });
          if (applied) result = applied;
        }
        current();
        if (this.used(session) < cfg.autoCompactThreshold) break;
        const events = prepareCandidate(session, s, preparation, p.adapter.pairing);
        if (!events) break;
        const inputs = candidateInput(session, events, cfg.digestLookback);
        inputs.target_characters = cfg.summaryTargetChars;
        const encoded = serializePreparationInput(inputs, cfg.prepareInputTokens * 4);
        const reply = await p.call(agent, 'prepare', { system: PREPARE_SYSTEM,
          messages: [p.adapter.message(encoded, 'prepare-input')], tools: [PREPARE_TOOL],
          ...(cfg.digestMaxTokens > 0 ? { maxTokens: cfg.digestMaxTokens } : {}) }, activeSignal);
        current();
        const prepared = validatePrepared(decodeResult(reply, PREPARE_TOOL.name), inputs.decision_sources);
        if (prepared.summary.length > cfg.summaryTargetChars * 2) throw Error('基础摘要超过目标长度两倍；原文保留');
        const record = newRecord(session, events, prepared, s.binding, { state: s });
        record.summaryFormatVersion = 2; record.summaryPromptVersion = SUMMARY_PROMPT_VERSION;
        if (s.transaction || !liveSpan(session, record)) throw Error('Auto Compact 生成期间原区间已变化，原文保留');
        for (const parent of s.records) if (record.parents.includes(parent.id)) parent.mergedInto = record.id;
        s.records.push(record); s.review.newRecords++; s.review.needed = true; p.store.save(s);
        p.hub.action(session, 'preparedSegments', 1);
        p.hub.event?.(session, { kind: 'prepare', status: 'success', title: 'Auto Compact 产出摘要',
          count: events.length, data: { recordId: record.id, documents: record.documents.length, mode: cfg.autoCompactMode } });
      }
      s.prepareBacklog = backlogView(session, s, cfg);
      s.autoCompact.afterTokens = this.used(session);
      p.hub.event?.(session, { kind: 'autoCompact', status: result ? 'success' : 'skip',
        title: cfg.autoCompactMode === 'brief' ? 'Auto Compact · 仅摘要' : 'Auto Compact · 摘要＋资料',
        detail: result ? '阈值触发后已立即应用' : '当前没有可安全缩减的内容，原文保留',
        savedTokens: s.autoCompact.beforeTokens - s.autoCompact.afterTokens,
        data: { threshold: cfg.autoCompactThreshold, beforeTokens: s.autoCompact.beforeTokens, afterTokens: s.autoCompact.afterTokens } });
      return result;
    };
    // Register the job before maintenance emits status or replacement events.
    const job = Promise.resolve().then(() => maintenance && agent.status === 'idle' && agent.runMaintenance ? agent.runMaintenance(run) : run())
      .then(result => {
        s.autoCompact = { ...s.autoCompact, lastKey: this.fingerprint(session, s, cfg) }; p.store.save(s);
        return result;
      }).catch(error => {
        if (!joined.aborted && !p.closed) {
          s.autoCompact = { ...s.autoCompact, error: error.message };
          p.reportError(agent, 'autoCompact', error);
        }
        if (signal?.aborted) throw error;
        return null;
      }).finally(() => {
        if (p.jobs.get(key) === job) p.jobs.delete(key);
        if (p.controllers.get(key) === controller) p.controllers.delete(key);
        p.manualSessions.delete(id); p.releaseState(id);
        // Threshold maintenance does not consume the coordinator's turn.
        // Resume against the new surface only after releasing its exclusion.
        if (!reviewSignal.aborted && !p.closed && p.agents.get(id) === agent && p.config().contextEnabled
          && p.mode(session) !== 'adaptive' && !s.transaction && !p.reviewTimers.has(id + ':coordinate')
          && (resumeReview || s.review.newRecords >= p.config().coordinatorEvery)) {
          void p.coordinate(agent, resumeReview, { retry: true }).catch(error => {
            if (!p.closed && p.agents.get(id) === agent) p.reportError(agent, 'coordinate', error);
          });
        }
      });
    p.jobs.set(key, job);
    return job;
  }
}
