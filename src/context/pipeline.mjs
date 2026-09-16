import { randomUUID } from 'node:crypto';
import { ContextStore } from './store.mjs';
import { hash, userRevision, userMessages, rawText, actualUser, prepareCandidate, candidateInput, coordinatorInput, newRecord, activeRecords, liveSpan, validatePrepared, normalizeChoices, decodeResult, recordText } from './core.mjs';
import { createTransaction, applyTransaction } from './transactions.mjs';
import { PREPARE_SYSTEM, PREPARE_TOOL, COORDINATE_SYSTEM, COORDINATE_TOOL } from './prompts.mjs';

export const DEFAULTS = Object.freeze({ contextEnabled: true, digestEvery: 32, digestWindow: 32, digestLookback: 8,
  idlePreprocessEnabled: false, flushIdleMs: 90000, coordinatorEvery: 2, coordinatorMinGapMs: 30000, coordinatorRecentEvents: 12,
  automaticReplace: true, surgeryCooldownSteps: 20, keepTailEvents: 30, traceEnabled: true, traceMaxChars: 0, requireShorter: true });
export function contextConfig(raw = {}) {
  const cfg = { ...DEFAULTS, ...raw };
  for (const key of ['contextEnabled', 'idlePreprocessEnabled', 'automaticReplace', 'traceEnabled', 'requireShorter']) if (typeof cfg[key] !== 'boolean') throw new Error(`${key} 必须为布尔值`);
  for (const key of ['digestEvery', 'digestWindow', 'coordinatorEvery']) if (!Number.isInteger(cfg[key]) || cfg[key] < 1) throw new Error(`${key} 必须为正整数`);
  for (const key of ['digestLookback', 'flushIdleMs', 'coordinatorMinGapMs', 'coordinatorRecentEvents', 'surgeryCooldownSteps', 'keepTailEvents', 'traceMaxChars']) if (!Number.isInteger(cfg[key]) || cfg[key] < 0) throw new Error(`${key} 必须为非负整数`);
  return cfg;
}
const delegated = s => s.header?.origin === 'subagent' || Number(s.header?.delegationDepth) > 0;
const iso = n => n == null ? '时间未记录' : new Date(n).toISOString();

export class ContextPipeline {
  constructor(hub, adapter) {
    this.hub = hub; this.adapter = adapter; this.store = new ContextStore(hub.store.dir);
    this.agents = new Map(); this.jobs = new Map(); this.timers = new Map(); this.idleSince = new Map(); this.controllers = new Map(); this.closed = false;
  }
  config() { return contextConfig(this.hub.config()); }
  state(session) {
    const scope = this.hub.scope(session);
    const binding = { scope: scope.mode === 'session' ? 'session' : 'project', project: scope.project, title: session.header?.title || session.id };
    const state = this.store.state(session.id, binding);
    // Older counters measured uncovered backlog, not newly arrived events.
    // Rebase once; archives stay intact and the ordinary idle flush remains available.
    if (state.prepareCadenceVersion !== 1) {
      if (state.initialized) state.eventsSincePrepare = 0;
      state.prepareCadenceVersion = 1;
      this.store.save(state);
    }
    // A blank session can still change its scope before any data has been read or prepared.
    if (!userMessages(session).length && !state.records.length && !state.transaction && !Object.keys(state.publications.catalog).length && state.publications.globalRevision === null && (state.binding.scope !== binding.scope || state.binding.project !== binding.project)) {
      state.binding = binding; this.store.save(state);
    }
    return state;
  }
  start(agent) {
    if (delegated(agent.session) || this.closed) return;
    this.agents.set(agent.session.id, agent); const s = this.state(agent.session);
    if (!s.initialized) {
      const covered = new Set(s.records.flatMap(r => r.sourceSeqs));
      s.eventsSincePrepare = agent.session.surface.nodes.filter(seq => { const e = agent.session.eventAt(seq); return !covered.has(seq) && (actualUser(e) || (['assistant/message', 'tool/result'].includes(e.type) && !e.data?.message?.source?.plugin)); }).length;
      s.initialized = true; this.store.save(s);
    }
    void this.prepare(agent, false); this.arm(agent);
    if (s.prepareRetryAt > Date.now()) this.arm(agent, s.prepareRetryAt - Date.now(), 'prepare');
  }
  observe(session, event) {
    if (delegated(session) || this.closed || !this.config().contextEnabled) return;
    if (!actualUser(event) && (!['assistant/message', 'tool/result'].includes(event.type) || event.data?.message?.source?.plugin)) return;
    const agent = this.agents.get(session.id);
    if (!agent) return;
    const s = this.state(session);
    s.eventsSincePrepare = (s.eventsSincePrepare || 0) + 1;
    if (actualUser(event)) { s.pending = null; s.review.needed = true; }
    this.store.save(s); this.arm(agent);
    if (s.eventsSincePrepare >= this.config().digestEvery) void this.prepare(agent, false);
    if (actualUser(event)) void this.coordinate(agent, true);
  }
  arm(agent, delay = this.config().flushIdleMs, kind = 'idle', since = Date.now()) {
    const id = agent.session.id, key = id + ':' + kind;
    clearTimeout(this.timers.get(key)); this.timers.delete(key);
    if (kind === 'idle') this.idleSince.delete(id);
    if (!delay || this.closed || !this.agents.has(id)) return;
    // Only pending work in a genuinely idle session gets an idle deadline.
    // Model/tool execution and explicit failure retries are independent of it.
    if (kind === 'idle') {
      if (!this.config().contextEnabled || !this.config().idlePreprocessEnabled || agent.status !== 'idle') return;
      const s = this.state(agent.session);
      if (!(s.eventsSincePrepare > 0 || s.review.newRecords > 0)) return;
      this.idleSince.set(id, since);
    }
    const timer = setTimeout(() => {
      this.timers.delete(key);
      if (kind === 'idle') this.idleSince.delete(id);
      const work = kind === 'coordinate' ? this.coordinate(agent, true)
        : kind === 'prepare' ? this.prepare(agent, true) : this.flushIdle(agent);
      void work.catch(e => this.reportError(agent, kind, e));
    }, kind === 'idle' ? Math.max(1, since + delay - Date.now()) : delay);
    timer.unref?.(); this.timers.set(key, timer);
  }
  async flushIdle(agent) {
    if (this.closed || !this.agents.has(agent.session.id) || agent.status !== 'idle' || !this.config().contextEnabled || !this.config().idlePreprocessEnabled) return;
    const s = this.state(agent.session);
    // Reviewing a prepared record must not drain unrelated historical backlog.
    if (s.eventsSincePrepare > 0) await this.prepare(agent, true);
    if (!this.closed && this.agents.get(agent.session.id) === agent && agent.status === 'idle'
      && this.config().idlePreprocessEnabled && (s.review.newRecords > 0 || s.review.needed)) await this.coordinate(agent, true);
  }
  reportError(agent, kind, error) {
    const s = this.state(agent.session);
    s.failures[kind] = { count: (s.failures[kind]?.count || 0) + 1, at: Date.now(), message: error.message };
    this.store.notice(s, `${kind}：${error.message}`);
    this.hub.action(agent.session, `context${kind}Errors`, 1, { error: error.message });
    this.hub.ctx.logger?.warn?.(`上下文${kind}：${error.message}`);
  }
  async prepare(agent, force = false) {
    if (this.closed || delegated(agent.session) || !this.config().contextEnabled) return;
    const session = agent.session, key = session.id + ':prepare';
    if (this.jobs.has(key)) return this.jobs.get(key);
    const s = this.state(session);
    if (Date.now() < (s.prepareRetryAt || 0)) return;
    if (!force && (s.eventsSincePrepare || 0) < this.config().digestEvery) return;
    const controller = new AbortController(); this.controllers.set(key, controller);
    const job = (async () => {
      do {
        const cfg = this.config(), events = prepareCandidate(session, s, cfg, this.adapter.pairing);
        if (!events) break;
        const seenEvents = s.eventsSincePrepare || 0;
        const inputs = candidateInput(session, events, cfg.digestLookback);
        const args = { system: PREPARE_SYSTEM, messages: [this.adapter.message(JSON.stringify(inputs), 'prepare-input')], tools: [PREPARE_TOOL],
          ...(cfg.digestMaxTokens > 0 ? { maxTokens: cfg.digestMaxTokens } : {}) };
        const result = await this.hub.call(agent, 'prepare', args, controller.signal);
        controller.signal.throwIfAborted();
        const record = newRecord(session, events, validatePrepared(decodeResult(result, PREPARE_TOOL.name)), s.binding);
        // A write-ahead replacement owns the session records until its disk flush completes.
        if (s.transaction) { this.store.notice(s, '预处理完成时替换事务尚未提交，原文保留并等待下一批'); break; }
        // Other maintenance may have replaced this source while the model ran.
        if (!liveSpan(session, record)) { this.store.notice(s, '预处理完成时原区间已变化，未发布过期记录'); break; }
        s.records.push(record); s.review.newRecords++; s.review.needed = true;
        s.eventsSincePrepare = Math.max(0, (s.eventsSincePrepare || 0) - seenEvents);
        delete s.failures.prepare; delete s.prepareRetryAt;
        clearTimeout(this.timers.get(session.id + ':prepare')); this.timers.delete(session.id + ':prepare');
        this.store.save(s);
        this.hub.action(session, 'preparedSegments', 1, { id: record.id, from: events[0].seq, to: events.at(-1).seq, chars: record.summary.length + record.documents.reduce((n, d) => n + d.text.length, 0) });
        void this.coordinate(agent, false);
        if (s.eventsSincePrepare < cfg.digestEvery) break;
      } while (!this.closed && !controller.signal.aborted);
    })().catch(e => {
      if (!controller.signal.aborted) {
        this.reportError(agent, 'prepare', e);
        const delay = Math.min(60000, 1000 * 2 ** Math.min(6, s.failures.prepare?.count || 1));
        s.prepareRetryAt = Date.now() + delay; this.store.save(s);
        this.arm(agent, delay, 'prepare');
      }
    }).finally(() => { this.jobs.delete(key); this.controllers.delete(key); });
    this.jobs.set(key, job); return job;
  }
  async coordinate(agent, force = false) {
    if (this.closed || delegated(agent.session) || !this.config().contextEnabled) return;
    const session = agent.session, key = session.id + ':coordinate', s = this.state(session), cfg = this.config();
    // observe()/prepare() mark real changes; joining a call is not a new review.
    if (this.jobs.has(key)) return this.jobs.get(key);
    if (s.transaction || (!force && s.review.newRecords < cfg.coordinatorEvery)) return;
    const elapsed = Date.now() - s.review.lastAt;
    if (elapsed < cfg.coordinatorMinGapMs) { this.arm(agent, cfg.coordinatorMinGapMs - elapsed, 'coordinate'); return; }
    const input = coordinatorInput(session, s, { ...cfg, pressureRatio: this.adapter.pressure?.(session) ?? null });
    if (!input.records.length) return;
    const keyHash = hash(input);
    if (keyHash === s.review.lastKey && !s.review.needed) return;
    const seenRevision = userRevision(session), seenNewRecords = s.review.newRecords;
    const seenInputIds = new Set(input.records.map(r => r.id));
    const controller = new AbortController(); this.controllers.set(key, controller);
    const job = (async () => {
      s.review.lastAt = Date.now(); s.review.needed = false; this.store.save(s);
      const result = await this.hub.call(agent, 'coordinate', { system: COORDINATE_SYSTEM,
        messages: [this.adapter.message(JSON.stringify(input), 'coordinate-input')], tools: [COORDINATE_TOOL],
        ...(cfg.surgeonMaxTokens > 0 ? { maxTokens: cfg.surgeonMaxTokens } : {}) }, controller.signal);
      controller.signal.throwIfAborted();
      if (seenRevision !== userRevision(session)) { s.review.needed = true; this.store.notice(s, '中枢运行期间用户消息变化，旧决定未应用'); return; }
      if (s.transaction) { s.review.needed = true; this.store.save(s); return; }
      const choices = normalizeChoices(decodeResult(result, COORDINATE_TOOL.name), s, session, seenInputIds);
      s.pending = { id: randomUUID(), createdAt: Date.now(), userRevision: seenRevision, choices, source: 'coordinator' };
      s.review.lastKey = keyHash; s.review.newRecords = Math.max(0, s.review.newRecords - seenNewRecords);
      s.review.lastInput = input; s.review.lastChoices = choices;
      delete s.failures.coordinate; this.store.save(s);
      this.hub.action(session, 'contextDecisions', 1, { choices: choices.map(c => ({ action: c.action, ids: c.ids })) });
    })().catch(e => {
      if (!controller.signal.aborted) { this.reportError(agent, 'coordinate', e); s.review.needed = true; this.arm(agent, Math.max(1000, cfg.coordinatorMinGapMs), 'coordinate'); }
    }).finally(() => { this.jobs.delete(key); this.controllers.delete(key); if (s.review.needed) this.arm(agent, Math.max(1000, cfg.coordinatorMinGapMs), 'coordinate'); });
    this.jobs.set(key, job); return job;
  }
  async applyReady(agent, { manual = false, ids, mode = 'detail', ignoreCooldown = false, sourceCommandId } = {}) {
    const session = agent.session, s = this.state(session), cfg = this.config();
    if (s.transaction) return applyTransaction(session, s, s.transaction, this.store, this.adapter);
    if (!manual && (!cfg.contextEnabled || !cfg.automaticReplace || (!ignoreCooldown && s.steps - s.lastReplacementStep < cfg.surgeryCooldownSteps))) return null;
    let plan = s.pending;
    if (manual && (ids || !plan)) {
      if (!['detail', 'brief'].includes(mode)) throw new Error('手动应用请选择 detail 或 brief；合并由后台中枢准备');
      const chosen = ids || activeRecords(s).filter(r => r.mode === 'raw' && liveSpan(session, r)).map(r => r.id);
      if (!Array.isArray(chosen) || !chosen.length) return null;
      plan = { id: randomUUID(), createdAt: Date.now(), userRevision: userRevision(session), source: 'manual',
        choices: normalizeChoices({ choices: chosen.map(id => ({ action: mode, ids: [id], summary: '', documents: [] })) }, s, session) };
    }
    if (!plan) return null;
    if (sourceCommandId) plan = { ...plan, sourceCommandId };
    let tx;
    try { tx = createTransaction(session, s, plan, cfg, this.adapter.pairing); }
    catch (error) { s.pending = null; s.review.needed = true; this.store.notice(s, error.message); if (manual) throw error; return null; }
    if (!tx) { s.pending = null; this.store.save(s); return null; }
    const outcome = await applyTransaction(session, s, tx, this.store, this.adapter);
    this.hub.action(session, 'contextReplacements', 1, outcome);
    return outcome;
  }
  async preStep(agent) {
    if (delegated(agent.session)) return;
    this.agents.set(agent.session.id, agent);
    const s = this.state(agent.session); s.steps++; this.store.save(s);
    // Only completed work and disk I/O are awaited at the request boundary.
    if (s.transaction) await this.applyReady(agent);
    await this.retireLegacyInjections(agent.session);
    const manual = s.manualQueue[0];
    let result;
    if (manual) {
      try { result = await this.applyReady(agent, { ...manual, manual: true }); s.manualQueue.shift(); this.store.save(s); }
      catch (error) { if (s.transaction) throw error; s.manualQueue.shift(); this.store.notice(s, error.message); }
    } else result = await this.applyReady(agent);
    this.publishMemory(agent.session);
    this.start(agent);
    return result;
  }
  async retireLegacyInjections(session) {
    const s = this.state(session);
    if (s.migrationVersion === 1) return;
    const old = session.surface.nodes.map(seq => session.eventAt(seq)).filter(e => e.type === 'user/message' && ['trisoul-x:memory', 'trisoul-x:task-memory'].includes(e.data?.source?.plugin));
    if (old.length) {
      const tx = { id: randomUUID(), planId: 'legacy-memory-retirement', source: 'migration', createdAt: Date.now(),
        operations: old.map(e => ({ id: randomUUID(), kind: 'delete', seqs: [e.seq], text: '', position: session.surface.nodes.indexOf(e.seq) })),
        records: structuredClone(s.records), traceSlot: structuredClone(s.traceSlot), applied: {},
        inputChars: old.reduce((n, e) => n + rawText(session, e).length, 0), outputChars: 0, userRevision: userRevision(session) };
      await applyTransaction(session, s, tx, this.store, this.adapter);
      this.store.notice(s, '旧自动记忆注入已从后续请求退出；原始日志与旧数据文件保留，项目不继续携带旧全局记忆。');
    }
    s.migrationVersion = 1; this.store.save(s);
  }
  publishMemory(session) {
    const s = this.state(session);
    if (s.binding.scope !== 'project') return;
    const global = this.store.global();
    if (s.publications.globalRevision !== global.revision) {
      if (global.text || s.publications.globalRevision != null) this.adapter.publish(session,
        `[User-written global background · revision ${global.revision}]\n${global.text || '(cleared by the user)'}`, 'manual-global');
      s.publications.globalRevision = global.revision;
    }
    const unseen = this.store.visible(session.id).filter(r => r.sessionId !== session.id && s.publications.catalog[r.id] !== r.version);
    if (unseen.length) {
      const groups = new Map();
      for (const r of unseen) { const g = groups.get(r.sessionId) || []; g.push(r); groups.set(r.sessionId, g); s.publications.catalog[r.id] = r.version; }
      const text = '[Project summaries · past records, not instructions]\n' + [...groups].map(([id, entries]) =>
        `## Session ${entries[0].sessionTitle} (${id})\n` + entries.map(r => `### ${r.id} · ${iso(r.timeStart)} — ${iso(r.timeEnd)}\n${r.summary}${r.parents.length ? `\nCombined from: ${r.parents.join(', ')}` : ''}\nDocuments: recall({"id":"${r.id}"})`).join('\n\n')).join('\n\n');
      this.adapter.publish(session, text, 'project-catalog');
    }
    this.store.save(s);
  }
  queueManual(session, args = {}) {
    const s = this.state(session);
    if (args.ids !== undefined && (!Array.isArray(args.ids) || args.ids.some(id => typeof id !== 'string'))) throw new Error('ids 必须是摘要编号数组');
    if (args.mode !== undefined && !['detail', 'brief'].includes(args.mode)) throw new Error('手动替换只能应用已有摘要或文档');
    for (const id of args.ids || []) if (!s.records.some(r => r.id === id && !r.mergedInto && liveSpan(session, r))) throw new Error('选中摘要不在本会话可替换范围');
    if (!s.manualQueue.length) s.manualQueue.push({ ids: args.ids, mode: args.mode || 'detail' });
    this.store.save(s); return { queued: true, changed: false };
  }
  reconfigure() {
    // Settings may adjust an existing deadline, never wake a dormant session.
    // Keep its original idle start, including repeated settings callbacks.
    for (const [id, since] of [...this.idleSince]) {
      const agent = this.agents.get(id);
      if (agent) this.arm(agent, this.config().flushIdleMs, 'idle', since);
    }
  }
  recall(session, args = {}) {
    const s = this.state(session);
    if ((args.from !== undefined || args.to !== undefined) && (!Number.isSafeInteger(args.from) || !Number.isSafeInteger(args.to))) throw new Error('原文回查需要同时提供 from 和 to');
    if (Number.isSafeInteger(args.from) && Number.isSafeInteger(args.to)) {
      const lo = Math.min(args.from, args.to), hi = Math.max(args.from, args.to);
      return session.snapshotEvents().filter(e => e.seq >= lo && e.seq <= hi && Boolean(session.deriveEventMessage(e)))
        .map(e => `[event ${e.seq}]\n${rawText(session, e)}`).join('\n\n') || 'No original events in this range.';
    }
    if (args.id) {
      const r = this.store.get(session.id, args.id);
      this.hub.action(session, 'documentRecalls', 1, { id: r.id, session: r.sessionId });
      return recordText(r) + (r.mergedInto ? `\nHistorical record; combined into ${r.mergedInto}.` : '')
        + (r.parents.length ? `\nOriginal documents remain available under IDs: ${r.parents.join(', ')}.` : '');
    }
    const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const entries = this.store.visible(session.id).filter(r => !query || `${r.summary} ${r.id} ${r.sessionTitle}`.toLowerCase().includes(query));
    return entries.map(r => `[${r.id} | session ${r.sessionTitle} | ${iso(r.timeStart)}]\n${r.summary}`).join('\n\n') || 'No matching saved summaries.';
  }
  view(session) {
    const s = this.state(session);
    return { schema: 1, scope: s.binding, steps: s.steps, pending: s.pending, lastReplacement: s.lastReplacement || null,
      records: s.records.map(({ documents, sourceSeqs, sourceHash, ...r }) => ({ ...r, documentCount: documents.length, live: Boolean(liveSpan(session, { ...r, documents, sourceSeqs, sourceHash })) })),
      failures: s.failures, notices: s.notices, trace: s.traceSlot ? { sourceSeq: s.traceSlot.sourceSeq, sourceAt: s.traceSlot.sourceAt, truncated: s.traceSlot.truncated } : null,
      preparing: this.jobs.has(session.id + ':prepare'), coordinating: this.jobs.has(session.id + ':coordinate'), transactionPending: Boolean(s.transaction),
      manualQueued: s.manualQueue.length,
      review: { lastAt: s.review.lastAt, choices: s.review.lastChoices || [] } };
  }
  dispose(id) {
    if (!id) this.closed = true;
    for (const [key, c] of this.controllers) if (!id || key.startsWith(id + ':')) c.abort();
    for (const [key, timer] of this.timers) if (!id || key.startsWith(id + ':')) { clearTimeout(timer); this.timers.delete(key); }
    if (id) { this.agents.delete(id); this.idleSince.delete(id); }
    else { this.agents.clear(); this.idleSince.clear(); }
  }
}
