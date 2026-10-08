import { randomUUID } from 'node:crypto';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { assertBtwCachePrefix } from '../btw-policy.mjs';
import { taskContextMeta } from '../task-context.mjs';
import { ADAPTIVE_TASK, SUMMARY_PROMPT_VERSION } from './prompts.mjs';
import { activeRecords, candidateInput, hash, liveSpan, newRecord, normalizeChoices, preparationWorkload, prepareCandidate, recordBlocks, recordSnapshot, userRevision, validatePrepared } from './core.mjs';
import { messageTokens } from './materials.mjs';

export const adaptiveRouteKey = request => hash(['provider','model','reasoningEffort','temperature','maxTokens','stop'].map(key => request[key]));
const routeKey = adaptiveRouteKey;

// Request copies live only while their owning session is attached. Never persist
// another conversation log or brand this independent call as an agent request.
export class AdaptiveCompaction {
  constructor(pipeline) { this.pipeline = pipeline; this.requests = new Map(); this.followups = new Set(); }
  capture(session, options) {
    const p = this.pipeline;
    if (p.closed || !p.config().contextEnabled || p.mode(session) !== 'adaptive' || !isAgentLoopRequest(options)) return;
    const old = this.requests.get(session.id);
    const routeChanged = old && routeKey(old.request) !== routeKey(options);
    if (routeChanged) {
      p.controllers.get(session.id + ':adaptive')?.abort(Error('主会话模型路由已改变'));
      const state = p.state(session);
      if (state.pending?.source === 'adaptive') { state.pending = null; p.store.save(state); }
    }
    // Avoid retaining unusually large provider replay blobs outside the host.
    const { signal, ...request } = options;
    if (Buffer.byteLength(JSON.stringify(request)) > p.config().prepareInputTokens * 4) {
      this.requests.delete(session.id); return;
    }
    const messageIds = new Set(options.messages.map(m => m.id));
    const seqs = session.surface.nodes.filter(seq => messageIds.has(session.deriveEventMessage(session.eventAt(seq))?.id));
    this.requests.set(session.id, { request, seqs: new Set(seqs), confirmed: false, userRevision: userRevision(session), routeChanged,
      revision: p.state(session).compressionModeRevision || 0 });
  }
  confirm(agent, route) {
    const snapshot = this.requests.get(agent.session.id);
    if (!snapshot) return;
    if (route && (snapshot.request.provider !== route.provider || snapshot.request.model !== route.model)) return;
    snapshot.confirmed = true;
    const status = this.pipeline.state(agent.session).adaptive;
    const maxRetries = this.pipeline.config().backgroundMaxRetries;
    if (status?.failures > maxRetries && (snapshot.routeChanged || status.failureRoute && status.failureRoute !== routeKey(snapshot.request))) {
      // A newly confirmed usable route grants one probe, not an unbounded
      // burst. Same-route validation failures remain finite until manual retry.
      status.failures = maxRetries; this.pipeline.store.save(this.pipeline.state(agent.session));
    }
    snapshot.routeChanged = false;
    void this.check(agent).catch(error => this.pipeline.hub.ctx.logger?.warn?.(`主动异步整理：${error.message}`));
  }
  drop(id) {
    const p = this.pipeline, ids = id ? [id] : [...this.requests.keys()];
    for (const key of ids) {
      this.requests.delete(key); this.followups.delete(key);
      const timerKey = key + ':adaptive', timer = p.timers.get(timerKey);
      if (timer) { clearTimeout(timer); p.timers.delete(timerKey); }
    }
  }
  schedule(agent, delay) {
    const p = this.pipeline, key = agent.session.id + ':adaptive';
    if (p.timers.has(key) || p.closed) return;
    const timer = setTimeout(() => {
      p.timers.delete(key);
      void this.check(agent).catch(error => p.hub.ctx.logger?.warn?.(`主动异步整理：${error.message}`));
    }, Math.max(1, delay));
    timer.unref?.(); p.timers.set(key, timer);
  }
  async check(agent, { force = false } = {}) {
    const p = this.pipeline, session = agent.session, id = session.id, key = id + ':adaptive', cfg = p.config();
    if (p.closed || p.mode(session) !== 'adaptive' || !cfg.contextEnabled || p.manualSessions.has(id)) return;
    if (p.jobs.has(key)) { this.followups.add(id); return p.jobs.get(key); }
    const s = p.state(session), status = s.adaptive ||= {};
    const snapshot = this.requests.get(id);
    const wait = reason => { if (status.waitingReason !== reason) { status.waitingReason = reason; p.store.save(s); } };
    if (!snapshot?.confirmed) { wait('等待主会话完成一次请求后检查'); return; }
    if (snapshot.userRevision !== userRevision(session)) { wait('等待包含当前用户要求的主请求'); return; }
    if (s.transaction || s.pending || s.manualQueue.length) { wait('等待已有替换或手动操作完成'); return; }
    if (!force && (status.failures || 0) > cfg.backgroundMaxRetries) { wait('检查失败，等待手动重试'); return; }
    const pressure = p.adapter.pressure?.(session) ?? 0;
    if (!force && (s.eventsSincePrepare || 0) < cfg.digestEvery && pressure < 0.7) { wait('等待新增内容或上下文压力增长'); return; }
    if (!force && Date.now() - (status.lastAt || 0) < cfg.coordinatorMinGapMs) {
      wait('等待后台检查间隔'); this.schedule(agent, cfg.coordinatorMinGapMs - (Date.now() - status.lastAt)); return;
    }
    const events = prepareCandidate(session, s, cfg, p.adapter.pairing);
    const moved = new Set(s.traceSlot ? s.traceSlot.movedSourceSeqs || [s.traceSlot.sourceSeq] : []);
    const tracePresent = s.traceSlot && snapshot.seqs.has(s.traceSlot.carrierSeq);
    const projectedOut = e => tracePresent && moved.has(e.seq) && session.deriveEventMessage(e)?.role === 'assistant'
      && session.deriveEventMessage(e).content.every(b => b.type === 'reasoning' && typeof b.text === 'string');
    const raw = events && preparationWorkload(session, s, events.filter(e => !projectedOut(e))).estimatedTokens >= cfg.prepareContinueTokens
      && events.every(e => !session.deriveEventMessage(e) || snapshot.seqs.has(e.seq) || projectedOut(e)) ? events : null;
    const prepared = activeRecords(s).filter(r => !raw?.parents?.includes(r.id) && liveSpan(session, r) && liveSpan(session, r).seqs.every(seq => snapshot.seqs.has(seq)));
    if (!raw && !prepared.length) { wait('当前没有足够的可整理材料'); return; }
    const selected = raw ? candidateInput(session, raw, 0) : null;
    if (selected) selected.summary_scope.event_seqs = selected.summary_scope.event_seqs.filter(seq => !projectedOut(session.eventAt(seq)));
    const position = new Map(snapshot.request.messages.map((m, i) => [m.id, i]));
    const messageIndex = seq => {
      const original = session.deriveEventMessage(session.eventAt(seq));
      const direct = position.get(original?.id);
      if (direct !== undefined) return direct;
      const carrier = s.traceSlot?.original?.id === original?.id ? session.deriveEventMessage(session.eventAt(s.traceSlot.carrierSeq))?.id : null;
      if (carrier && position.has(carrier)) return position.get(carrier);
      return snapshot.request.messages.findIndex(m => taskContextMeta(m)?.originalSeq === seq) >= 0
        ? snapshot.request.messages.findIndex(m => taskContextMeta(m)?.originalSeq === seq) : undefined;
    };
    const offeredPrepared = prepared.slice(0, 32);
    const candidates = offeredPrepared.map(r => ({ id: r.id, type: 'prepared', representation: r.mode,
      messages: liveSpan(session, r).seqs.map(messageIndex), summary: r.summary,
      currentTokens: liveSpan(session, r).seqs.reduce((n, seq) => n + messageTokens(session.deriveEventMessage(session.eventAt(seq))), 0),
      detailTokens: messageTokens({ role: 'user', content: recordBlocks(r, 'detail') }), briefTokens: messageTokens({ role: 'user', content: recordBlocks(r, 'brief') }),
      allowed: ['keep', 'detail', 'brief'] }));
    // A preceding user decision may already be in an archived brief record.
    // Only offer sources whose verbatim text is present in this request; absence
    // of that historical source must not block new factual work indefinitely.
    if (selected) selected.decision_sources = selected.decision_sources.filter(d => messageIndex(d.seq) !== undefined);
    if (raw) candidates.unshift({ id: 'new-window', type: 'original', messages: raw.filter(e => session.deriveEventMessage(e) && !projectedOut(e)).map(e => ({ seq: e.seq, index: messageIndex(e.seq) })),
      summary_scope: selected.summary_scope.event_seqs, decision_sources: selected.decision_sources.map(d => ({ seq: d.seq, index: messageIndex(d.seq) })),
      target_characters: cfg.summaryTargetChars });
    const fingerprint = hash([candidates, snapshot.userRevision, snapshot.request.messages.at(-1)?.id, routeKey(snapshot.request), pressure >= 0.85]);
    if (!force && status.lastKey === fingerprint) { wait('同一批材料已检查，等待变化'); return; }
    const task = `${ADAPTIVE_TASK}\n\n${JSON.stringify({ pressure_ratio: pressure, last_rejection: s.review.lastRejection || null, candidates })}`;
    const request = { ...snapshot.request, purpose: 'compaction', messages: [...snapshot.request.messages, p.adapter.message(task, 'adaptive-task')] };
    assertBtwCachePrefix(snapshot.request, request);
    if (Buffer.byteLength(JSON.stringify(request)) > cfg.prepareInputTokens * 4) { wait('请求超过后台输入预算，原文保留'); return; }
    const controller = new AbortController(), revision = s.compressionModeRevision || 0, seenEvents = s.eventsSincePrepare || 0;
    const signatures = new Map(offeredPrepared.map(r => [r.id, recordSnapshot(session, r)]));
    const rawSignature = raw ? hash(raw.map(e => [e.seq, e.type, e.data])) : null;
    status.lastAt = Date.now(); status.waitingReason = null; status.error = null; status.cacheReadTokens = null;
    p.controllers.set(key, controller); p.store.save(s);
    const current = () => !p.closed && !controller.signal.aborted && p.agents.get(id) === agent
      && p.mode(session) === 'adaptive' && (s.compressionModeRevision || 0) === revision && p.config().contextEnabled && !p.manualSessions.has(id)
      && (this.isManaged?.(session) ?? true)
      && this.requests.get(id) && routeKey(this.requests.get(id).request) === routeKey(snapshot.request);
    const job = (async () => {
      const result = await p.call(agent, 'adaptive', request, controller.signal, () => { if (!current()) throw Error('后台检查条件已改变'); });
      controller.signal.throwIfAborted();
      if (!current()) return;
      if (result.blocks.some(b => b.type === 'tool-call')) throw Error('主动整理请求调用了工具；未执行，原文保留');
      const text = result.blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const value = JSON.parse(text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
      if (!value || !['skip', 'compress'].includes(value.action) || Object.keys(value).some(k => !['action', 'reason', 'choices', 'prepared'].includes(k))) throw Error('主动整理回复格式无效，原文保留');
      if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > 500)) throw Error('主动整理说明格式无效');
      if (s.transaction || s.pending || userRevision(session) !== snapshot.userRevision) { status.lastDecision = 'stale'; status.reason = '用户要求或替换状态已变化，未提交旧结果'; p.store.save(s); return; }
      if (value.action === 'skip') {
        if (value.prepared !== undefined || value.choices?.length) throw Error('不压缩的回复不能提交替换内容');
        status.lastKey = fingerprint; status.lastDecision = 'skip'; status.reason = value.reason || '本次保留当前上下文'; status.failures = 0;
        s.eventsSincePrepare = Math.max(0, (s.eventsSincePrepare || 0) - seenEvents);
        status.cacheReadTokens = result.usage?.cacheReadTokens ?? null; p.store.save(s); return;
      }
      if (!Array.isArray(value.choices) || !value.choices.length || value.choices.length > 32) throw Error('主动整理没有提交有效选择');
      let record;
      if (value.prepared !== undefined) {
        if (!raw || hash(raw.map(e => [e.seq, e.type, e.data])) !== rawSignature) throw Error('主动整理的原文范围已改变');
        if (Object.keys(value.prepared || {}).some(k => !['summary','documents','decisions'].includes(k))) throw Error('主动摘要字段无效');
        const body = validatePrepared(value.prepared, selected.decision_sources);
        if (body.summary.length > cfg.summaryTargetChars * 2) throw Error('基础摘要超过目标长度两倍，原文保留');
        record = newRecord(session, raw, body, s.binding, { state: s });
        if (!liveSpan(session, record)) { status.lastDecision = 'stale'; status.reason = '原文已被其他操作替换'; p.store.save(s); return; }
        record.summaryFormatVersion = 2; record.summaryPromptVersion = SUMMARY_PROMPT_VERSION;
      }
      const choices = value.choices.map(c => {
        if (!c || Object.keys(c).some(k => !['action','id'].includes(k))) throw Error('主动整理选择字段无效');
        if (c.id === 'new-window') { if (!record) throw Error('新片段缺少经过校验的摘要'); return { action: c.action, ids: [record.id] }; }
        if (!signatures.has(c.id) || signatures.get(c.id) !== recordSnapshot(session, s.records.find(r => r.id === c.id))) throw Error('主动整理选择了过期或未提供的记录');
        return { action: c.action, ids: [c.id] };
      });
      if (record && !value.choices.some(c => c.id === 'new-window' && c.action !== 'keep')) throw Error('新摘要必须用于本次替换');
      const staged = { ...s, records: [...s.records, ...(record ? [record] : [])] };
      const normalized = normalizeChoices({ choices }, staged, session, new Set([...signatures.keys(), ...(record ? [record.id] : [])]));
      if (!normalized.some(c => c.action !== 'keep')) throw Error('压缩回复没有选择实际替换');
      if (!current() || s.transaction || s.pending) return;
      if (record) {
        for (const parent of s.records) if (record.parents.includes(parent.id)) parent.mergedInto = record.id;
        s.records.push(record); s.eventsSincePrepare = Math.max(0, (s.eventsSincePrepare || 0) - seenEvents);
        s.review.newRecords++; s.review.needed = true;
        p.hub.action(session, 'preparedSegments', 1);
      }
      s.pending = { id: randomUUID(), createdAt: Date.now(), source: 'adaptive', routeKey: routeKey(snapshot.request), userRevision: userRevision(session), choices: normalized, summaryPromptVersion: SUMMARY_PROMPT_VERSION };
      p.hub.action(session, 'contextDecisions', 1);
      status.lastKey = fingerprint; status.lastDecision = 'compress'; status.reason = value.reason || '已准备替换，等待安全请求边界'; status.failures = 0;
      status.cacheReadTokens = result.usage?.cacheReadTokens ?? null; p.store.save(s);
    })().catch(error => {
      if (!current()) return;
      status.error = error.message; status.failures = (status.failures || 0) + 1; status.failureRoute = routeKey(snapshot.request); p.store.save(s);
      p.hub.ctx.logger?.warn?.(`主动异步整理：${error.message}`);
    }).finally(() => {
      if (p.jobs.get(key) === job) p.jobs.delete(key);
      if (p.controllers.get(key) === controller) p.controllers.delete(key);
      p.releaseState(id);
      if (this.followups.delete(id) && current()) void this.check(agent);
    });
    p.jobs.set(key, job); return job;
  }
}

export function installAdaptiveCapture(ctx, isManagedSession, pipeline) {
  pipeline.adaptive.isManaged = isManagedSession;
  ctx.on('llm/stream', (options, next) => {
    if (isAgentLoopRequest(options) && options.sessionId) {
      const session = ctx.sessions.get(options.sessionId);
      if (session && isManagedSession(session) && session.header?.origin !== 'subagent') pipeline.adaptive.capture(session, options);
    }
    return next();
  }, { global: true });
}
