import { catalogPage } from './catalog.mjs';
import { sourceName } from '../message-source.mjs';
import { contextConfig } from '../config.mjs';
export { contextConfig };
import { randomUUID } from 'node:crypto';
import { serializePreparationInput } from './input-budget.mjs';
import { compactFull } from './full-compaction.mjs';
import { ContextStore } from './store.mjs';
import { createSurfaceIndex, hash, userRevision, userMessages, rawText, actualUser, prepareCandidate, candidateInput, coordinatorInput, newRecord, activeRecords, liveSpan, validatePrepared, normalizeChoices, decodeResult, recordText, backlogView, recordSnapshot, preparationWorkload } from './core.mjs';
import { attachmentsOf, combineAssets, describeAsset, messageOf } from './materials.mjs';
import { createTransaction, applyTransaction } from './transactions.mjs';
import { SUMMARY_PROMPT_VERSION, PREPARE_SYSTEM, PREPARE_TOOL, COORDINATE_SYSTEM, COORDINATE_TOOL } from './prompts.mjs';
import { TODO_META, TASK_CONTEXT_META, taskContextMeta, withoutTodo } from '../task-context.mjs';

const delegated = s => s.header?.origin === 'subagent' || Number(s.header?.delegationDepth) > 0;
const transientFailure = error => /(?:\b(?:408|429|5\d\d)\b|rate_limit|temporarily unavailable|provider unavailable|overloaded|timeout|timed out|超时|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network error|socket hang up)/i.test(String(error?.message || error));
const iso = n => n == null ? '时间未记录' : new Date(n).toISOString();

export class ContextPipeline {
  constructor(hub, adapter) {
    this.hub = hub; this.adapter = adapter; this.activeCalls = 0; this.callWaiters = []; this.manualSessions = new Map(); this.store = new ContextStore(hub.store.dir);
    this.agents = new Map(); this.releasing = new Set(); this.jobs = new Map(); this.timers = new Map(); this.reviewTimers = new Map(); this.idleSince = new Map(); this.controllers = new Map(); this.closed = false;
  }
  config() { return contextConfig(this.hub.config()); }
  async call(agent, kind, request, signal) {
    signal?.throwIfAborted();
    if (this.activeCalls >= this.config().backgroundConcurrency) {
      await new Promise((resolve, reject) => {
        const item = { grant: () => { signal?.removeEventListener('abort', abort); this.activeCalls++; resolve(); } };
        const abort = () => {
          const index = this.callWaiters.indexOf(item);
          if (index >= 0) this.callWaiters.splice(index, 1);
          reject(signal.reason || Error('后台排队已取消'));
        };
        this.callWaiters.push(item); signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    } else this.activeCalls++;
    try { signal?.throwIfAborted(); return await this.hub.call(agent, kind, request, signal); }
    finally {
      this.activeCalls--;
      while (this.callWaiters.length && this.activeCalls < this.config().backgroundConcurrency) this.callWaiters.shift().grant();
    }
  }

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
    // Drop queued merges even when saved under the current summary policy.
    // Durable transactions still finish recovery; their writes may already exist.
    if (state.pending?.choices?.some(c => c.action === 'merge')) {
      state.pending = null; state.review.needed = true;
      this.store.notice(state, '中枢合并已关闭；待执行的合并方案已取消，原文与档案保留。');
      this.store.save(state);
    }
    if (state.summaryPromptVersion !== SUMMARY_PROMPT_VERSION) {
      state.summaryPromptVersion = SUMMARY_PROMPT_VERSION; this.store.save(state);
    }
    // A blank session can still change its scope before any data has been read or prepared.
    if (!state.records.length && !state.transaction && !Object.keys(state.publications.catalog).length && state.publications.globalRevision === null && (state.binding.scope !== binding.scope || state.binding.project !== binding.project) && !userMessages(session).length) {
      state.binding = binding; this.store.save(state);
    }
    return state;
  }
  start(agent) {
    if (delegated(agent.session) || this.closed) return;
    this.releasing.delete(agent.session.id);
    this.agents.set(agent.session.id, agent); const s = this.state(agent.session);
    if (!s.initialized) {
      const covered = new Set(s.records.flatMap(r => r.sourceSeqs));
      s.eventsSincePrepare = agent.session.surface.nodes.filter(seq => { const e = agent.session.eventAt(seq); return !covered.has(seq) && (actualUser(e) || (['assistant/message', 'tool/result'].includes(e.type) && !sourceName(e.data?.message?.source))); }).length;
      s.initialized = true; this.store.save(s);
    }
    void this.prepare(agent, false); this.arm(agent);
    if (s.prepareRetryAt > Date.now()) this.arm(agent, s.prepareRetryAt - Date.now(), 'prepare');
  }
  observe(session, event) {
    if (delegated(session) || this.closed || !this.config().contextEnabled) return;
    if (!actualUser(event) && (!['assistant/message', 'tool/result'].includes(event.type) || sourceName(event.data?.message?.source))) return;
    const agent = this.agents.get(session.id);
    if (!agent) return;
    const s = this.state(session);
    s.eventsSincePrepare = (s.eventsSincePrepare || 0) + 1;
    this.store.save(s); this.arm(agent);
    if (s.eventsSincePrepare >= this.config().digestEvery) void this.prepare(agent, false);
  }
  arm(agent, delay = this.config().flushIdleMs, kind = 'idle', since = Date.now(), options = {}) {
    const id = agent.session.id, key = id + ':' + kind;
    const previous = kind === 'coordinate' ? this.reviewTimers.get(key) : null;
    const forceReview = (options.force ?? true) || Boolean(previous?.force);
    if (previous) delay = Math.min(delay, Math.max(1, previous.dueAt - Date.now()));
    clearTimeout(this.timers.get(key)); this.timers.delete(key);
    this.reviewTimers.delete(key);
    if (kind === 'idle') this.idleSince.delete(id);
    if (!delay || this.closed || !this.agents.has(id) || this.manualSessions.has(id)) return;
    // Only pending work in a genuinely idle session gets an idle deadline.
    // Model/tool execution and explicit failure retries are independent of it.
    if (kind === 'idle') {
      if (!this.config().contextEnabled || !this.config().idlePreprocessEnabled || agent.status !== 'idle') return;
      const s = this.state(agent.session);
      if (!(s.eventsSincePrepare > 0 || s.review.newRecords > 0)) return;
      this.idleSince.set(id, since);
    }
    const timer = setTimeout(() => {
      this.timers.delete(key); this.reviewTimers.delete(key);
      if (kind === 'idle') this.idleSince.delete(id);
      const work = kind === 'coordinate' ? this.coordinate(agent, forceReview, { retry: true })
        : kind === 'prepare' ? this.prepare(agent, true, { retry: true }) : this.flushIdle(agent);
      void work.catch(e => this.reportError(agent, kind, e));
    }, kind === 'idle' ? Math.max(1, since + delay - Date.now()) : delay);
    timer.unref?.(); this.timers.set(key, timer);
    if (kind === 'coordinate') this.reviewTimers.set(key, { force: forceReview, dueAt: Date.now() + delay });
  }
  async flushIdle(agent) {
    if (this.closed || !this.agents.has(agent.session.id) || agent.status !== 'idle' || !this.config().contextEnabled || !this.config().idlePreprocessEnabled) return;
    const s = this.state(agent.session);
    // Reviewing a prepared record must not drain unrelated historical backlog.
    if (s.eventsSincePrepare > 0) await this.prepare(agent, true, { retry: true });
    if (!this.closed && this.agents.get(agent.session.id) === agent && agent.status === 'idle'
      && this.config().idlePreprocessEnabled && (s.review.newRecords > 0 || s.review.needed)) await this.coordinate(agent, true, { retry: true });
  }
  followsMain(kind) {
    const cfg = this.config(), route = cfg.backgroundMode === 'unified' ? cfg.unifiedBackground : cfg[kind === 'coordinate' ? 'surgeon' : 'background'];
    return !route?.provider && !route?.model;
  }
  waitsForMain(s, kind) {
    const failure = s.failures[kind];
    return Boolean(failure && failure.count > this.config().backgroundMaxRetries && this.followsMain(kind)
      && (failure.recoverable ?? transientFailure(failure.message)));
  }
  mainSucceeded(session, route) {
    const agent = this.agents.get(session.id);
    if (!agent || this.closed || delegated(session) || !this.config().contextEnabled || this.manualSessions.has(session.id)) return;
    const s = this.state(session);
    for (const kind of ['prepare', 'coordinate']) {
      const key = session.id + ':' + kind;
      if (!this.waitsForMain(s, kind) || this.jobs.has(key)) continue;
      const current = this.hub.route(agent, kind);
      if (!route?.provider || !route.model || current.provider !== route.provider || current.model !== route.model) continue;
      if (kind === 'prepare' && Date.now() < (s.prepareRetryAt || 0)) continue;
      clearTimeout(this.timers.get(key)); this.timers.delete(key); this.reviewTimers.delete(key);
      // A successful main request grants one probe, not another full retry burst.
      s.failures[kind].count = this.config().backgroundMaxRetries;
      if (kind === 'coordinate') s.review.needed = true;
      this.store.save(s);
      void this[kind](agent, true, { retry: true });
    }
  }
  reportError(agent, kind, error, providerFailure = false) {
    const s = this.state(agent.session);
    s.failures[kind] = { count: (s.failures[kind]?.count || 0) + 1, at: Date.now(), message: error.message, recoverable: providerFailure && transientFailure(error) };
    this.store.notice(s, `${kind}：${error.message}`);
    this.hub.action(agent.session, `context${kind}Errors`, 1);
    this.hub.ctx.logger?.warn?.(`上下文${kind}：${error.message}`);
  }
  async prepare(agent, force = false, { retry = false } = {}) {
    if (this.closed || delegated(agent.session) || this.manualSessions.has(agent.session.id) || !this.config().contextEnabled) return;
    const session = agent.session, key = session.id + ':prepare';
    if (this.jobs.has(key)) return this.jobs.get(key);
    const s = this.state(session);
    if (force && !retry) { delete s.failures.prepare; delete s.prepareRetryAt; }
    if ((s.failures.prepare?.count || 0) > this.config().backgroundMaxRetries) return;
    if (Date.now() < (s.prepareRetryAt || 0)) return;
    if (!force && (s.eventsSincePrepare || 0) < this.config().digestEvery) return;
    const controller = new AbortController(); this.controllers.set(key, controller);
    let providerFailure = false;
    const job = (async () => {
      let completed = 0, seenEvents = s.eventsSincePrepare || 0;
      const batchLimit = retry ? 1 : this.config().prepareBatchWindows;
      do {
        const cfg = this.config(), events = prepareCandidate(session, s, cfg, this.adapter.pairing);
        if (!events) break;
        const workload = preparationWorkload(session, s, events);
        if (completed > 0 && workload.events < cfg.digestWindow && workload.estimatedTokens < cfg.prepareContinueTokens) {
          s.prepareDeferred = { ...workload, reason: 'small-tail', at: Date.now() };
          s.prepareBacklog = backlogView(session, s, cfg); this.store.save(s); break;
        }
        delete s.prepareDeferred;
        const inputs = candidateInput(session, events, cfg.digestLookback);
        inputs.target_characters = cfg.summaryTargetChars;
        if (s.failures.prepare) inputs.previous_rejection = s.failures.prepare.message;
        const encoded = serializePreparationInput(inputs, cfg.prepareInputTokens * 4);
        const args = { system: PREPARE_SYSTEM, messages: [this.adapter.message(encoded, 'prepare-input')], tools: [PREPARE_TOOL],
          ...(cfg.digestMaxTokens > 0 ? { maxTokens: cfg.digestMaxTokens } : {}) };
        const result = await this.call(agent, 'prepare', args, controller.signal).catch(error => { providerFailure = true; throw error; });
        controller.signal.throwIfAborted();
        const prepared = validatePrepared(decodeResult(result, PREPARE_TOOL.name));
        if (prepared.summary.length > cfg.summaryTargetChars * 2) throw Error('基础摘要超过目标长度两倍；原文保留，重试时请缩短摘要而非截断');
        const record = newRecord(session, events, prepared, s.binding, { state: s });
        record.summaryFormatVersion = 2; record.summaryPromptVersion = SUMMARY_PROMPT_VERSION;
        // A write-ahead replacement owns the session records until its disk flush completes.
        if (s.transaction) { this.store.notice(s, '预处理完成时替换事务尚未提交，原文保留并等待下一批'); break; }
        // Other maintenance may have replaced this source while the model ran.
        if (!liveSpan(session, record)) { this.store.notice(s, '预处理完成时原区间已变化，未发布过期记录'); break; }
        for (const parent of s.records) if (record.parents.includes(parent.id)) parent.mergedInto = record.id;
        if (record.parents.length) s.pending = null;
        s.records.push(record); s.review.newRecords++; s.review.needed = true;
        s.review.rejectedPlans = []; s.review.replanAttempts = 0;
        delete s.failures.coordinate;
        s.eventsSincePrepare = Math.max(0, (s.eventsSincePrepare || 0) - seenEvents);
        seenEvents = 0; completed++;
        s.prepareBacklog = backlogView(session, s, cfg);
        delete s.failures.prepare; delete s.prepareRetryAt;
        clearTimeout(this.timers.get(session.id + ':prepare')); this.timers.delete(session.id + ':prepare');
        this.store.save(s);
        this.hub.action(session, 'preparedSegments', 1);
        void this.coordinate(agent, false);
        if (completed >= batchLimit || !s.prepareBacklog.events) break;
      } while (!this.closed && !controller.signal.aborted);
    })().catch(e => {
      if (!controller.signal.aborted) {
        this.reportError(agent, 'prepare', e, providerFailure);
        const delay = Math.min(60000, 1000 * 2 ** Math.min(6, s.failures.prepare?.count || 1));
        s.prepareRetryAt = Date.now() + delay; this.store.save(s);
        if (s.failures.prepare.count <= this.config().backgroundMaxRetries) this.arm(agent, delay, 'prepare');
        else this.store.notice(s, this.waitsForMain(s, 'prepare') ? '预处理短重试已用尽，等待主会话请求成功后自动恢复；原文保留，也可手动重新准备。' : '预处理已达到自动重试上限；原文保留，可手动重新准备。');
      }
    }).finally(() => { this.jobs.delete(key); this.controllers.delete(key); });
    this.jobs.set(key, job); return job;
  }
  discardCoordinator(session, state, reason, ids = []) {
    state.review.lastDiscard = { at: Date.now(), reason, ids };
    state.review.discarded = (state.review.discarded || 0) + 1;
    // Obsolete work is not a provider failure or a rejected plan.
    this.store.save(state);
    this.hub.action(session, 'contextDecisionsDiscarded', 1);
  }
  async coordinate(agent, force = false, { retry = false } = {}) {
    if (this.closed || delegated(agent.session) || this.manualSessions.has(agent.session.id) || !this.config().contextEnabled) return;
    // Review a completed preparation batch once instead of reviewing
    // intermediate records after each window.
    const preparing = this.jobs.get(agent.session.id + ':prepare');
    if (preparing) {
      await preparing;
      return this.coordinate(agent, force, { retry });
    }
    const session = agent.session, key = session.id + ':coordinate', s = this.state(session), cfg = this.config();
    // Joining an existing call is not another request for a review.
    if (this.jobs.has(key)) return this.jobs.get(key);
    if (force && !retry) { delete s.failures.coordinate; s.review.rejectedPlans = []; s.review.replanAttempts = 0; s.review.needed = true; }
    if ((s.failures.coordinate?.count || 0) > cfg.backgroundMaxRetries) return;
    if (s.transaction || (!force && s.review.newRecords < cfg.coordinatorEvery)) return;
    const elapsed = Date.now() - s.review.lastAt;
    if (elapsed < cfg.coordinatorMinGapMs) { this.arm(agent, cfg.coordinatorMinGapMs - elapsed, 'coordinate', Date.now(), { force }); return; }
    const input = coordinatorInput(session, s, { ...cfg, pressureRatio: this.adapter.pressure?.(session) ?? null });
    if (!input.records.length) return;
    const keyHash = hash(input);
    if (keyHash === s.review.lastKey && !s.review.needed) return;
    const seenRevision = userRevision(session), seenNewRecords = s.review.newRecords, seenPendingId = s.pending?.id;
    const seenInputIds = new Set(input.records.map(r => r.id));
    const seenIndex = createSurfaceIndex(session);
    const seenRecords = new Map(s.records.filter(r => seenInputIds.has(r.id)).map(r => [r.id, recordSnapshot(session, r, seenIndex)]));
    clearTimeout(this.timers.get(key)); this.timers.delete(key); this.reviewTimers.delete(key);
    let stale = false, retryFailure = false, providerFailure = false;
    const controller = new AbortController(); this.controllers.set(key, controller);
    const job = (async () => {
      s.review.lastAt = Date.now(); s.review.needed = false; this.store.save(s);
      const result = await this.call(agent, 'coordinate', { system: COORDINATE_SYSTEM,
        messages: [this.adapter.message(JSON.stringify(input), 'coordinate-input')], tools: [COORDINATE_TOOL],
        ...(cfg.surgeonMaxTokens > 0 ? { maxTokens: cfg.surgeonMaxTokens } : {}) }, controller.signal).catch(error => { providerFailure = true; throw error; });
      controller.signal.throwIfAborted();
      const currentIndex = createSurfaceIndex(session);
      const changedIds = [...seenRecords].filter(([id, signature]) => signature !== recordSnapshot(session, s.records.find(r => r.id === id), currentIndex)).map(([id]) => id);
      const newerPending = s.pending && s.pending.id !== seenPendingId;
      if (s.transaction || changedIds.length || newerPending) {
        stale = true; s.review.needed = s.review.newRecords > 0;
        this.discardCoordinator(session, s, s.transaction ? 'transaction-in-progress' : changedIds.length ? 'records-changed' : 'newer-plan', changedIds);
        return; // Preserve any newer pending plan. Never retry obsolete input.
      }
      const choices = normalizeChoices(decodeResult(result, COORDINATE_TOOL.name), s, session, seenInputIds);
      const signature = hash(choices.map(({ observed, ...c }) => c));
      if (s.review.rejectedPlans?.includes(signature)) {
        s.review.lastKey = keyHash; s.review.newRecords = Math.max(0, s.review.newRecords - seenNewRecords);
        s.review.needed = s.review.newRecords > 0;
        this.store.notice(s, '相同替换方案已被拒绝，不再重复执行'); return;
      }
      s.pending = { id: randomUUID(), createdAt: Date.now(), userRevision: seenRevision, choices, source: 'coordinator', summaryPromptVersion: SUMMARY_PROMPT_VERSION };
      s.review.lastKey = keyHash; s.review.newRecords = Math.max(0, s.review.newRecords - seenNewRecords);
      s.review.lastInput = input; s.review.lastChoices = choices;
      delete s.failures.coordinate; this.store.save(s);
      this.hub.action(session, 'contextDecisions', 1);
    })().catch(e => {
      if (!controller.signal.aborted) {
        this.reportError(agent, 'coordinate', e, providerFailure);
        retryFailure = s.failures.coordinate.count <= cfg.backgroundMaxRetries;
        s.review.needed = retryFailure; this.store.save(s);
      }
    }).finally(() => {
      this.jobs.delete(key); this.controllers.delete(key);
      if (this.closed || controller.signal.aborted) return;
      const normalDue = s.review.newRecords >= this.config().coordinatorEvery;
      // Staleness alone is not a trigger. Check real work at the usual cadence.
      if (retryFailure || (normalDue && (!stale || !s.pending))) {
        this.arm(agent, Math.max(1000, this.config().coordinatorMinGapMs), 'coordinate', Date.now(),
          { force: retryFailure });
      }
    });
    this.jobs.set(key, job); return job;
  }
  async applyReady(agent, { manual = false, ids, mode = 'detail', ignoreCooldown = false, sourceCommandId, source, retainTrace = true } = {}) {
    const session = agent.session, s = this.state(session), cfg = this.config();
    if (s.transaction) return applyTransaction(session, s, s.transaction, this.store, this.adapter);
    if (!manual && (!cfg.contextEnabled || !cfg.automaticReplace || (!ignoreCooldown && s.steps - s.lastReplacementStep < cfg.surgeryCooldownSteps))) return null;
    const index = createSurfaceIndex(session);
    let plan = s.pending;
    // Applying a prepared plan preserves the coordinator's keep/brief/detail
    // choices. An explicit selection is the user's override of that plan.
    if (manual && (ids || !plan)) {
      if (!['detail', 'brief'].includes(mode)) throw new Error('手动应用请选择 detail 或 brief');
      const chosen = ids || activeRecords(s).filter(r => r.mode === 'raw' && liveSpan(session, r, index)).map(r => r.id);
      if (!Array.isArray(chosen) || !chosen.length) return null;
      plan = { id: randomUUID(), createdAt: Date.now(), userRevision: userRevision(session), source: 'manual',
        choices: normalizeChoices({ choices: chosen.map(id => ({ action: mode, ids: [id], summary: '', documents: [] })) }, s, session) };
    }
    if (!plan) return null;
    if (!manual) {
      const changedIds = plan.choices.filter(c => c.action !== 'keep').flatMap(c => c.ids.filter((id, i) => {
        const r = s.records.find(r => r.id === id), observed = c.observed?.[i];
        return !r || r.mergedInto || !observed || !liveSpan(session, r, index) || observed.version !== r.version
          || observed.mode !== r.mode || observed.carrierSeq !== (r.carrierSeq ?? null) || observed.sourceHash !== r.sourceHash
          || (observed.snapshot && observed.snapshot !== recordSnapshot(session, r, index));
      }));
      if (changedIds.length) {
        s.pending = null; s.review.needed = s.review.newRecords > 0;
        this.discardCoordinator(session, s, 'pending-plan-stale', changedIds);
        if (s.review.newRecords >= cfg.coordinatorEvery) this.arm(agent, Math.max(1000, cfg.coordinatorMinGapMs), 'coordinate', Date.now(), { force: false });
        return null;
      }
    }

    if (sourceCommandId || source) plan = { ...plan, ...(sourceCommandId ? { sourceCommandId } : {}), ...(source ? { source } : {}) };
    let tx;
    try { tx = createTransaction(session, s, plan, retainTrace ? cfg : { ...cfg, traceEnabled: false }, this.adapter.pairing, this.adapter.pricing?.(session)); }
    catch (error) {
      s.pending = null; s.review.lastRejection = { message: error.message, ...error.cost };
      s.review.rejectedPlans = [...(s.review.rejectedPlans || []), hash(plan.choices.map(({ observed, ...c }) => c))].slice(-8);
      s.review.replanAttempts = (s.review.replanAttempts || 0) + 1;
      s.review.needed = s.review.replanAttempts <= cfg.backgroundMaxRetries; this.store.notice(s, error.message);
      if (s.review.needed) this.arm(agent, Math.max(1000, cfg.coordinatorMinGapMs), 'coordinate');
      if (manual) throw error; return null;
    }
    if (!tx) { s.pending = null; this.store.save(s); return null; }
    const outcome = await applyTransaction(session, s, tx, this.store, this.adapter);
    this.hub.action(session, 'contextReplacements', 1);
    return outcome;
  }
  async requestCompaction(session, agent, operation, { signal, sourceCommandId } = {}) {
    if (!['processed', 'full'].includes(operation)) throw Error('未知压缩模式');
    if (delegated(session)) throw Error('请在主会话中使用压缩命令');
    signal?.throwIfAborted();
    if (this.manualSessions.has(session.id)) throw Error('本会话正在压缩，请勿重复提交');
    if (!agent || agent.status !== 'idle') return this.queueManual(session, { operation, sourceCommandId });
    const run = ownSignal => this.runManual(agent, { operation, sourceCommandId }, signal && ownSignal ? AbortSignal.any([signal, ownSignal]) : signal || ownSignal);
    const result = agent.runMaintenance ? await agent.runMaintenance(run) : await run();
    return { changed: Boolean(result), queued: false, result };
  }
  async runManual(agent, { operation, sourceCommandId }, signal) {
    const session = agent.session, id = session.id, s = this.state(session);
    if (this.closed) throw Error('上下文组件已关闭');
    if (this.manualSessions.has(id)) throw Error('本会话正在压缩，请勿重复提交');
    signal?.throwIfAborted();
    this.manualSessions.set(id, operation);
    const key = id + ':manual', controller = new AbortController();
    this.controllers.set(key, controller);
    const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      // Superseded background replies cannot republish an old detailed/merge choice.
      for (const kind of ['prepare', 'coordinate']) this.controllers.get(id + ':' + kind)?.abort();
      for (const [timerKey, timer] of this.timers) if (timerKey.startsWith(id + ':')) { clearTimeout(timer); this.timers.delete(timerKey); }
      this.idleSince.delete(id); this.reviewTimers.delete(id + ':coordinate');
      s.pending = null; s.review.needed = false; this.store.save(s);
      if (s.transaction) {
        const recovered = await applyTransaction(session, s, s.transaction, this.store, this.adapter);
        if (recovered.source === (operation === 'full' ? 'compact-f' : 'compact-p')) return recovered;
      }
      joined.throwIfAborted();
      let result;
      if (operation === 'full') {
        const tx = await compactFull(this, agent, joined, sourceCommandId);
        joined.throwIfAborted();
        result = tx ? await applyTransaction(session, s, tx, this.store, this.adapter) : null;
        if (result) this.hub.action(session, 'contextReplacements', 1);
      } else {
        const ids = activeRecords(s).filter(r => r.mode !== 'brief' && liveSpan(session, r)).map(r => r.id);
        result = await this.applyReady(agent, { manual: true, ids, mode: 'brief', sourceCommandId, source: 'compact-p', retainTrace: false });
        s.review.needed = false; s.review.newRecords = 0;
      }
      delete s.failures[operation === 'full' ? 'compactFull' : 'compactProcessed']; this.store.save(s);
      return result;
    } catch (error) {
      this.reportError(agent, operation === 'full' ? 'compactFull' : 'compactProcessed', error);
      throw error;
    } finally { this.manualSessions.delete(id); this.controllers.delete(key); this.releaseState(id); }
  }
  async preStep(agent, signal) {
    if (delegated(agent.session)) return;
    this.agents.set(agent.session.id, agent);
    const s = this.state(agent.session); s.steps++; this.store.save(s);
    // Ordinary replacement never waits for a model; an explicitly queued /compact-f does.
    const recovered = s.transaction ? await this.applyReady(agent) : null;
    if (!this.hub.config().stateHintsEnabled && !this.hub.config().budgetHintsEnabled) await this.stripRuntime(agent.session);
    await this.retireLegacyInjections(agent.session);
    const manual = s.manualQueue[0];
    let result;
    if (manual) {
      try { result = recovered && manual.operation && recovered.source === (manual.operation === 'full' ? 'compact-f' : 'compact-p') ? recovered : manual.operation ? await this.runManual(agent, manual, signal) : await this.applyReady(agent, { ...manual, manual: true }); s.manualQueue.shift(); this.store.save(s); }
      catch (error) { if (s.transaction) throw error; s.manualQueue.shift(); this.store.notice(s, error.message); }
    } else result = await this.applyReady(agent);
    this.publishMemory(agent.session);
    this.start(agent);
    return result;
  }
  stripRuntime(session) {
    this.runtimeRetirements ||= new Map();
    if (this.runtimeRetirements.has(session.id)) return this.runtimeRetirements.get(session.id);
    const job = Promise.resolve().then(() => this.applyRuntimeRemoval(session)).finally(() => { this.runtimeRetirements.delete(session.id); this.releaseState(session.id); });
    this.runtimeRetirements.set(session.id, job); return job;
  }
  async applyRuntimeRemoval(session) {
    if (!session.deriveMessages().some(m => taskContextMeta(m)?.runtime)) return null;
    const s = this.state(session);
    if (s.transaction) await applyTransaction(session, s, s.transaction, this.store, this.adapter);
    const operations = session.surface.nodes.flatMap(seq => {
      const m = session.deriveEventMessage(session.eventAt(seq)), meta = taskContextMeta(m);
      if (!meta?.runtime) return [];
      const id = randomUUID(), prefix = m[TODO_META];
      if (!meta.todoText && !prefix) return [{ id, kind: 'delete', seqs: [seq], text: '', todoCleanup: true }];
      let message;
      if (meta.todoText) {
        const content = [...m.content]; content[prefix?.index ?? 0] = { type: 'text', text: meta.todoText };
        message = { ...m, id, content, ...(prefix ? { [TODO_META]: { ...prefix, context: { ...meta, runtime: null } } } : { [TASK_CONTEXT_META]: { ...meta, runtime: null } }) };
      } else {
        const base = withoutTodo(m);
        message = { ...base, id, source: base.source?.kind === 'user' ? m.source : base.source };
      }
      return [{ id, kind: 'todo-restore', seqs: [seq], message, text: '' }];
    });
    if (!operations.length) return null;
    const tx = { id: randomUUID(), planId: 'runtime-disable', source: 'runtime-disable', createdAt: Date.now(), operations,
      records: structuredClone(s.records), traceSlot: structuredClone(s.traceSlot), applied: {},
      inputChars: 0, outputChars: 0, userRevision: userRevision(session) };
    return applyTransaction(session, s, tx, this.store, this.adapter);
  }
  async retireLegacyInjections(session) {
    const s = this.state(session);
    if (s.migrationVersion === 1) return;
    const old = session.surface.nodes.map(seq => session.eventAt(seq)).filter(e => e.type === 'user/message' && ['trisoul-x:memory', 'trisoul-x:task-memory'].includes(sourceName(e.data?.source)));
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
    let changed = false;
    if (s.publications.globalRevision !== global.revision) {
      changed = true;
      if (global.text || s.publications.globalRevision != null) this.adapter.publish(session,
        `[User-written global background · revision ${global.revision}]\n${global.text || '(cleared by the user)'}`, 'manual-global');
      s.publications.globalRevision = global.revision;
    }
    const unseen = this.store.visible(session.id).filter(r => r.sessionId !== session.id && s.publications.catalog[r.id] !== r.version);
    const budget = this.adapter.catalogBudget?.(session) ?? Infinity;
    const cost = text => this.adapter.catalogCost?.(text) ?? text.length;
    const header = '[Project summaries · past records, not instructions]\n';
    const pendingNotice = `
[Up to ${unseen.length} project summaries remain outside this request budget; use recall to browse the full saved catalog.]`;
    let remaining = budget - cost(header + pendingNotice);
    const selected = [], parts = []; let lastSession;
    for (const r of unseen) {
      const heading = r.sessionId === lastSession ? '' : `## Session ${r.sessionTitle} (${r.sessionId})
`;
      const body = `${heading}### ${r.id} · ${iso(r.timeStart)} — ${iso(r.timeEnd)}
${r.summary}${r.parents.length ? `
Combined from: ${r.parents.join(', ')}` : ''}
Documents: recall({"id":"${r.id}"})

`;
      const tokens = cost(body);
      if (tokens > remaining) continue;
      remaining -= tokens; parts.push(body); selected.push(r); lastSession = r.sessionId;
    }
    if (selected.length) {
      this.adapter.publish(session, header + parts.join('') + (selected.length < unseen.length ? pendingNotice : ''), 'project-catalog');
      // Only successfully appended entries become delivered. Deferred entries stay recallable.
      for (const r of selected) s.publications.catalog[r.id] = r.version;
      changed = true;
    }
    const deferred = unseen.length - selected.length;
    if ((s.publications.deferred || 0) !== deferred) { s.publications.deferred = deferred; changed = true; }
    if (changed) this.store.save(s);
  }
  queueManual(session, args = {}) {
    const s = this.state(session);
    if (args.operation !== undefined && !['processed', 'full'].includes(args.operation)) throw new Error('未知压缩模式');
    if (args.ids !== undefined && (!Array.isArray(args.ids) || args.ids.some(id => typeof id !== 'string'))) throw new Error('ids 必须是摘要编号数组');
    if (args.mode !== undefined && !['detail', 'brief'].includes(args.mode)) throw new Error('手动替换只能应用已有摘要或文档');
    for (const id of args.ids || []) if (!s.records.some(r => r.id === id && !r.mergedInto && liveSpan(session, r))) throw new Error('选中摘要不在本会话可替换范围');
    const request = args.operation ? { operation: args.operation, ...(args.sourceCommandId ? { sourceCommandId: args.sourceCommandId } : {}) } : { ids: args.ids, mode: args.mode || 'detail' };
    if (!s.manualQueue.some(q => hash(q) === hash(request))) s.manualQueue.push(request);
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
    if (args.cursor != null && (args.id || args.from !== undefined || args.to !== undefined)) throw Error('目录游标不能用于记录或原文范围读取');
    if ((args.from !== undefined || args.to !== undefined) && (!Number.isSafeInteger(args.from) || !Number.isSafeInteger(args.to))) throw new Error('原文回查需要同时提供 from 和 to');
    if (Number.isSafeInteger(args.from) && Number.isSafeInteger(args.to)) {
      const lo = Math.min(args.from, args.to), hi = Math.max(args.from, args.to);
      return session.snapshotEvents().filter(e => e.seq >= lo && e.seq <= hi && Boolean(session.deriveEventMessage(e)))
        .map(e => `[event ${e.seq}]\n${rawText(session, e)}`).join('\n\n') || 'No original events in this range.';
    }
    if (args.id) {
      const r = this.store.get(session.id, args.id);
      this.hub.action(session, 'documentRecalls', 1);
      return recordText(r) + ((r.assets || []).length ? '\n\n' + r.assets.map(describeAsset).join('\n') : '') + (r.mergedInto ? `\nHistorical record; combined into ${r.mergedInto}.` : '')
        + (r.parents.length ? `\nOriginal documents remain available under IDs: ${r.parents.join(', ')}.` : '');
    }
    const page = catalogPage(this.store.visible(session.id), args);
    const text = page.entries.map(r => `[${r.id} | session ${r.sessionTitle} | ${iso(r.timeStart)}]
${r.summary}`).join('\n\n') || 'No matching saved summaries.';
    const next = page.nextCursor ? `
[More saved summaries: recall(${JSON.stringify({ query: args.query || '', cursor: page.nextCursor })})]` : '';
    const warning = this.store.readErrors?.size ? '\n[Some historical archives could not be read; these results are incomplete.]' : '';
    return text + next + warning;
  }
  recallAssets(session, args = {}) {
    this.state(session);
    if (args.id) return this.store.get(session.id, args.id).assets || [];
    if (!Number.isSafeInteger(args.from) || !Number.isSafeInteger(args.to)) throw Error('读取附件需要记录编号或完整原文范围');
    const lo = Math.min(args.from, args.to), hi = Math.max(args.from, args.to);
    return combineAssets(...session.snapshotEvents().filter(e => e.seq >= lo && e.seq <= hi)
      .map(e => attachmentsOf(messageOf(e)?.content, session.id, e.seq)));
  }
  recallContent(session, args = {}) {
    if (args.asset === undefined) return [{ type: 'text', text: this.recall(session, args) }];
    if (!Number.isSafeInteger(args.asset) || args.asset < 1) throw Error('附件编号从 1 开始');
    const assets = this.recallAssets(session, args), asset = assets[args.asset - 1];
    if (!asset) throw Error('该记录没有这个附件编号');
    const block = structuredClone(asset.block);
    if (block.type === 'image') delete block.offloaded;
    this.hub.action(session, 'attachmentRecalls', 1);
    return [{ type: 'text', text: describeAsset(asset, args.asset - 1) }, block];
  }
  view(session) {
    const s = this.state(session), index = createSurfaceIndex(session);
    return { schema: 1, scope: s.binding, steps: s.steps, pending: s.pending, lastReplacement: s.lastReplacement || null, todoRefresh: s.todoRefresh || null,
      records: s.records.map(({ documents, assets = [], userOriginals, originalSeqs, sourceSeqs, sourceHash, ...r }) => ({ ...r, documentCount: documents.length, assetCount: assets.length, originalEventCount: (originalSeqs || sourceSeqs).length, live: Boolean(liveSpan(session, { ...r, documents, sourceSeqs, sourceHash }, index)) })),
      backlog: backlogView(session, s, this.config()), eventsSincePrepare: s.eventsSincePrepare || 0, prepareDeferred: s.prepareDeferred || null,
      limits: { batchWindows: this.config().prepareBatchWindows, concurrency: this.config().backgroundConcurrency, continueTokens: this.config().prepareContinueTokens },
      failures: s.failures, retry: Object.fromEntries(['prepare', 'coordinate'].map(kind => [kind, !s.failures[kind] ? null : this.waitsForMain(s, kind) ? 'waiting-main' : s.failures[kind].count > this.config().backgroundMaxRetries ? 'manual' : 'retrying'])), notices: s.notices, trace: s.traceSlot ? { sourceSeq: s.traceSlot.sourceSeq, sourceAt: s.traceSlot.sourceAt, truncated: s.traceSlot.truncated } : null,
      preparing: this.jobs.has(session.id + ':prepare'), coordinating: this.jobs.has(session.id + ':coordinate'), transactionPending: Boolean(s.transaction),
      projectCatalogDeferred: s.publications.deferred || 0, manualQueued: s.manualQueue.length, manualOperation: this.manualSessions.get(session.id) || null,
      queuedOperations: s.manualQueue.map(q => q.operation || 'ready'),
      review: { lastAt: s.review.lastAt, choices: s.review.lastChoices || [], lastRejection: s.review.lastRejection || null, lastDiscard: s.review.lastDiscard || null, discarded: s.review.discarded || 0 } };
  }
  releaseState(id) {
    if (!this.releasing.has(id) || this.agents.has(id) || this.manualSessions.has(id) || this.runtimeRetirements?.has(id)
      || [...(this.hub.live?.values() || [])].some(call => call.sessionId === id)
      || [...this.jobs.keys()].some(key => key.startsWith(id + ':'))) return;
    this.store.release(id); this.hub.store.release?.(id); this.releasing.delete(id);
  }
  dispose(id) {
    const ids = id ? [id] : [...this.agents.keys()];
    for (const key of ids) this.releasing.add(key);
    if (!id) this.closed = true;
    for (const [key, c] of this.controllers) if (!id || key.startsWith(id + ':')) c.abort();
    for (const [key, timer] of this.timers) if (!id || key.startsWith(id + ':')) { clearTimeout(timer); this.timers.delete(key); }
    for (const key of this.reviewTimers.keys()) if (!id || key.startsWith(id + ':')) this.reviewTimers.delete(key);
    if (id) { this.agents.delete(id); this.idleSince.delete(id); }
    else { this.agents.clear(); this.idleSince.clear(); }
    const pending = [...this.jobs].filter(([key]) => !id || key.startsWith(id + ':')).map(([, job]) => job);
    return Promise.allSettled(pending).then(() => { for (const key of ids) this.releaseState(key); });
  }
}
