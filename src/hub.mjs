import { ownedUsageRequest } from './metering/stream.mjs';
import { assertRequestFits, inputBudget, requestPricing } from './metering/estimate.mjs';
import { usageReceipt, usageFields } from './metering/usage.mjs';
import { sourceName } from './message-source.mjs';
import { Service } from '@deepseek-ai/cordis';
import { BlockAssembler, assembleAssistantStream, createUserMessage, isHarnessError } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { HubStore, projectOf } from './hub-store.mjs';
import { Config, configSnapshot } from './config.mjs';
import { ContextPipeline } from './context/pipeline.mjs';
import { BillionContext } from './context/bc.mjs';
import { createHostAdapter } from './context/host.mjs';
import { createEffortResolver } from './effort.mjs';
import { promptText } from './cc-adaptation/texts.mjs';
import { setRuntimeContext } from './task-context.mjs';
import { DreamService } from './dream/service.mjs';
import { randomUUID } from 'node:crypto';
import { MonitorLedger, reportedMonitorUsage } from './monitor-ledger.mjs';
import { monitorTokenChunk } from './monitor-call.mjs';
import { MonitorPricing } from './monitor-pricing.mjs';
import { TASK_VERIFICATION_MODES, verificationMode } from './task-verification.mjs';

const TASK_PAUSE_GUIDANCE = promptText('runtime/task-pause.md');
const DREAM_CONSUMERS = Symbol('dream-consumers');

export const NS = 'oh-my-dsh';
export const message = (text, kind = 'context') => createUserMessage({
  content: [{ type: 'text', text }], source: { kind: `plugin:${NS}:${kind}` },
});
export const contentText = (blocks = []) => blocks.flatMap(b => {
  if (b.type === 'text') return [b.text];
  if (b.type === 'tool-call') return [`${b.name}(${b.arguments})`];
  if (b.type === 'tool-result') return [`${b.isError ? '[error] ' : ''}${contentText(b.content)}`];
  return [];
}).join('\n');
export class Hub extends Service {
  constructor(ctx, config) {
    super(ctx, 'omd');
    this.getConfig = () => configSnapshot(config);
    this.store = new HubStore(config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), NS));
    this.monitor = new MonitorLedger(this.store.dir);
    this.pricing = new MonitorPricing(this.store.dir);
    this.context = new ContextPipeline(this, createHostAdapter(this));
    this.bc = new BillionContext(this);
    this.efforts = createEffortResolver(ctx); this.agents = new Map();
    this.live = new Map(); this.calls = new Map(); this.requestStarts = new Map(); this.taskReviews = new Map();
    this.closed = false; this.closing = null;
    this[DREAM_CONSUMERS] = { retired: null };
    this.dream = new DreamService(this, { consumersRetired: () => this[DREAM_CONSUMERS].retired });
    ctx.effect(() => () => this.close());
  }
  close() { return this.closing ??= this.shutdown(); }
  async shutdown() {
    this.closed = true;
    const sessions = new Map([...this.agents.values(), ...this.context.agents.values(), ...this.calls.values()].map(owner => [owner.session.id, owner.session]));
    const errors = [], calls = [...this.calls.values()], pending = [...this.context.jobs.values(), ...(this.context.runtimeRetirements?.values() || [])];
    const collect = results => { for (const result of results) if (result.status === 'rejected') errors.push(result.reason); };
    let retireDreamConsumers;
    this[DREAM_CONSUMERS].retired = new Promise(resolve => { retireDreamConsumers = resolve; });
    for (const call of this.calls.values()) call.controller.abort(Error('OMD 服务正在退出'));
    const dream = Promise.allSettled([(async () => this.dream.close())(), this.pricing?.close()]);
    try {
      // Context.dispose itself allSettles its jobs; retain their real rejections
      // here rather than promoting a failed drain to a successful unload.
      collect(await Promise.allSettled([
        (async () => this.context.dispose())(), ...pending,
      ]));
      const cleanup = await Promise.allSettled(calls.map(call => call.done));
      collect(cleanup);
      for (const result of cleanup) if (result.status === 'fulfilled') errors.push(...result.value);
      collect(await Promise.allSettled([...sessions.values()].map(session => Promise.resolve().then(() => {
        setRuntimeContext(session, () => null);
        return this.context.stripRuntime(session);
      }))));
    } finally {
      // Abort Dream immediately, but release its database only after the last
      // Context consumer (including in-flight runtime removal) has retired.
      collect(await Promise.allSettled([...(this.context.runtimeRetirements?.values() || [])]));
      retireDreamConsumers();
      collect(await dream);
      await this.optimization?.settled();
      this.requestStarts.clear(); this.taskReviews.clear(); this.agents.clear();
      try { this.monitor.close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError([...new Set(errors)], 'OMD 退出清理失败');
  }
  config() {
    const value = this.getConfig();
    return { ...Object.fromEntries(Object.keys(Config.dict).filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])), ...this.persona?.config() };
  }
  taskReminders(session) {
    const read = id => (this.store.peek ? this.store.peek(id) : this.store.state(id));
    const saved = read(session.id)?.betterTodo;
    let inherited, parent = session.header?.origin === 'subagent' || Number(session.header?.delegationDepth) > 0 ? session.header.parentSession : null;
    const seen = new Set([session.id]);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const state = read(parent);
      if (state?.betterTodo?.verificationMode !== undefined || typeof state?.betterTodo?.verification === 'boolean') { inherited = state.betterTodo; break; }
      parent = state?.parentSession;
    }
    const mode = verificationMode(saved, verificationMode(inherited, this.config().taskVerificationMode));
    return { todo: saved?.todo ?? true, verificationMode: mode, verification: mode === 'on' };
  }
  setTaskReminders(session, patch) {
    if (Object.hasOwn(patch, 'verificationMode') && !TASK_VERIFICATION_MODES.includes(patch.verificationMode)) throw Error('无效的任务验证档位');
    const state = this.store.state(session.id), previous = this.taskReminders(session), saved = { ...state.betterTodo };
    if (Object.hasOwn(patch, 'todo')) saved.todo = patch.todo;
    if (Object.hasOwn(patch, 'verificationMode') || Object.hasOwn(patch, 'verification')) {
      saved.verificationMode = patch.verificationMode ?? (patch.verification ? 'on' : 'default');
      delete saved.verification;
    }
    this.store.update(state, { betterTodo: saved });
    const next = this.taskReminders(session);
    if (next.todo !== previous.todo || next.verificationMode !== previous.verificationMode) this.todoStore?.resetTurnControl(session);
    if (!next.verification) this.taskReviews.delete(session.id);
    this.refreshTaskVerification();
    return next;
  }
  refreshTaskVerification() {
    for (const refresh of this.taskVerificationControllers ?? []) refresh();
  }
  scope(session, { effective = true } = {}) {
    if(effective&&this.dream?.sources?.projectlessKnown?.(session.header))return {mode:'session',project:`session:${session.id}`};
    const state = this.store.peek ? this.store.peek(session.id) ?? { id: session.id } : this.store.state(session.id);
    const prepared=effective&&this.context?.store?.peek?.(session.id);
    if(prepared?.binding?.scope==='session'&&(state.started||prepared.records?.length))return {mode:'session',project:`session:${session.id}`};
    let root = state, parentId = session.header.parentSession, workflowProject = state.workflowProject;
    const ancestors = new Set([session.id]);
    while (parentId) {
      if (ancestors.has(parentId)) throw Error('会话继承关系形成循环，未扩大记忆范围');
      ancestors.add(parentId); root = this.store.peek ? this.store.peek(parentId) ?? { id: parentId } : this.store.state(parentId); parentId = root.parentSession;
      workflowProject ??= root.workflowProject;
    }
    const mode = state.memoryScope ?? root.memoryScope ?? this.config().memoryScope;
    return { mode, project: mode === 'session' ? `session:${root.id}` : workflowProject ?? projectOf(session.header.cwd || process.cwd()) };
  }
  route(agent, kind) {
    const main = agent.session.requestHeader()?.config ?? agent.options;
    if (kind === 'prepare' && this.config().memoryCacheEnabled) {
      const captured = this.context.cachedPreparation.requests.get(agent.session.id)?.request;
      return { provider: captured?.provider ?? main.provider, model: captured?.model ?? main.model };
    }
    const custom = this.config().backgroundMode === 'unified' ? this.config().unifiedBackground : this.config()[['coordinate', 'compactFull'].includes(kind) ? 'surgeon' : 'background'] ?? {};
    return { provider: custom.provider || main.provider, model: custom.model || main.model, temperature: custom.temperature, effort: custom.effort ?? 'off' };
  }
  // Calls are attributed to the request step that started them.
  captureFrame(agent, turn, step) {
    this.store.state(agent.session.id).pendingFrame = { at: Date.now(), turn, step };
  }
  record(session, kind, entry) {
    entry = { ...entry, usage: reportedMonitorUsage(entry.usage, entry.hasOutput) };
    const state = this.store.state(session.id);
    state.cwd = session.header.cwd;
    state.parentSession = session.header.parentSession;
    state.origin = session.header.origin ?? null;
    const previous=entry.id&&state.lastNativeCall?.id===entry.id?state.lastNativeCall:null;
    if(previous)entry={...previous,...entry,usage:entry.usage??previous.usage,error:entry.error??null,durationMs:entry.durationMs??previous.durationMs,firstTokenMs:entry.firstTokenMs??previous.firstTokenMs,startedAt:entry.startedAt??previous.startedAt,replace:true};
    const prior=usageReceipt(previous?.usage,{hasOutput:previous?.hasOutput});
    const measured=usageFields(entry.usage),priorFields=usageFields(previous?.usage);
    const metric = state.metrics[kind] ??= { calls: 0, errors: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const previousKnownTotal = metric.knownTotalTokens ?? usageReceipt(metric).knownTotalTokens ?? 0;
    metric.calls+=Number(!previous); metric.errors += Number(Boolean(entry.error))-Number(Boolean(previous?.error)); metric.durationMs += (entry.durationMs||0)-(previous?.durationMs||0);
    for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) metric[field] = (metric[field] || 0) + (measured[field] ?? 0) - (priorFields[field] ?? 0);
    if (measured.reasoningTokens !== null || priorFields.reasoningTokens !== null) metric.reasoningTokens = (metric.reasoningTokens || 0) + (measured.reasoningTokens ?? 0) - (priorFields.reasoningTokens ?? 0);
    const receipt = usageReceipt(entry.usage, { hasOutput:entry.hasOutput });
    metric.knownTotalTokens = previousKnownTotal + (receipt.knownTotalTokens ?? 0) - (previous ? prior.knownTotalTokens ?? 0 : 0);
    metric.unmetered=(metric.unmetered||0)+Number(receipt.totalTokens===null)-Number(Boolean(previous)&&prior.totalTokens===null);
    metric.peakContext = Math.max(metric.peakContext || 0, receipt.inputTotalTokens ?? receipt.knownInputTokens ?? 0);
    const recent = session.requestHeader()?.config;
    const frame = state.pendingFrame;
    const call = { at: Date.now(), turn: frame?.turn, step: frame?.step, sessionId: session.id, kind, ...entry,
      id: entry.id || randomUUID(), usage: entry.usage ?? null,
      effort: Object.hasOwn(entry, 'effort') ? entry.effort : (['main', 'subagent'].includes(kind) ? recent?.reasoningEffort ?? null : null) };
    if (['main', 'subagent'].includes(kind) && frame) delete state.pendingFrame;
    // Retired per-call context frames had no reader; drop them from the archive.
    delete state.contextHistory;
    const completed = frame ? null : session.snapshotEvents().findLast(e => e.type === 'step/end');
    call.turn ??= completed?.data.turn; call.step ??= completed?.data.step;
    if(entry.source==='native')state.lastNativeCall=call;
    if(previous)state.activity=state.activity.filter(item=>item.id!==call.id);
    state.activity.push(call);
    state.activity = state.activity.slice(-60);
    // An enabled own budget has already saved this complete state synchronously.
    // Keep that save before ancestor traversal, including its failure behavior.
    if (this.budgets?.record(session, kind, entry) !== true) this.store.save(state);
    // Telemetry is optional: a broken recorder must not turn success into a
    // failed model call (nor cause the caller to record the same call again).
    try { this.monitor?.append(call); } catch {}
  }
  event(session, entry) {
    // Background history is optional telemetry; never fail the mechanism itself.
    try { this.monitor?.appendEvent({ sessionId: typeof session === 'string' ? session : session?.id ?? null, ...entry }); } catch {}
  }
  action(session, name, count = 1) {
    const state = this.store.state(session.id);
    state.actions ??= {}; state.actions[name] = (state.actions[name] || 0) + count;
    this.store.save(state);
  }
  async call(agent, kind, request, signal, { preserveRoute = kind === 'adaptive' } = {}) {
    if (this.closed) throw Error('OMD 服务已关闭');
    const { effort, ...route } = preserveRoute ? {} : this.route(agent, kind);
    const proposed = { ...route, ...request }, fields = ['provider', 'model', 'temperature', 'reasoningEffort', 'maxTokens', 'stop'];
    const config = Object.fromEntries(fields.filter(key => Object.hasOwn(proposed, key)).map(key => [key, proposed[key]]));
    const envelope = Object.fromEntries(Object.entries(request).filter(([key]) => !fields.includes(key)));
    const requestedEffort = preserveRoute || Object.hasOwn(request, 'reasoningEffort') ? request.reasoningEffort : effort;
    const timeoutMs = this.config().jobTimeoutMs, timeoutReason = new Error('后台作业超时');
    const controller = new AbortController(), timeout = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => timeout.abort(timeoutReason), timeoutMs) : undefined;
    timer?.unref();
    signal = AbortSignal.any([controller.signal, timeout.signal, ...(signal ? [signal] : [])]);
    let onAbort, iterator, pendingNext, failure, complete = false, resolving, drained, startedAt, firstTokenMs, finalConfig, recorded = false, hasOutput = false, finished = false;
    const cleanup = [], done = new Promise(resolve => { drained = resolve; });
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('后台作业已取消'));
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    });
    aborted.catch(() => {});
    const assembler = new BlockAssembler();
    const key = `${agent.session.id}:${kind}:${this.callSerial = (this.callSerial || 0) + 1}`;
    const active = { sessionId: agent.session.id, kind, status: 'preparing', preparingAt: Date.now(), provider: config.provider, model: config.model };
    const owned = { session: agent.session, controller, done };
    this.live.set(key, active); this.calls.set(key, owned);
    try {
      signal.throwIfAborted();
      // Select controls from the same registration that owns defaults and dispatch.
      // Unsupported/inherit selections omit the control, letting this adapter default.
      resolving = this.ctx.llm.prepareCall(config, signal, (controls, modelInfo) => {
        const { reasoningEffort, ...rest } = controls;
        return requestedEffort && requestedEffort !== 'inherit' && modelInfo.reasoning?.efforts.some(option => option.id === requestedEffort)
          ? { ...rest, reasoningEffort: requestedEffort } : rest;
      });
      const prepared = await Promise.race([resolving, aborted]);
      signal.throwIfAborted();
      finalConfig = prepared.config;
      if (preserveRoute && kind === 'prepare' && fields.some(key => JSON.stringify(finalConfig[key]) !== JSON.stringify(config[key])))
        throw Error('主执行请求配置已改变，未发送不同前缀的后台请求');
      const modelInfo = await this.ctx.llm.resolveModelInfo?.(finalConfig.provider,finalConfig.model,signal);
      const inputLimit = ['prepare','adaptive'].includes(kind) ? this.config().prepareInputTokens : Infinity;
      assertRequestFits({ ...envelope, ...finalConfig }, inputBudget({ inputLimit, contextWindow:modelInfo?.context?.contextWindow, maxTokens:finalConfig.maxTokens ?? modelInfo?.defaultMaxTokens ?? 0 }), requestPricing(this.ctx.llm,finalConfig));
      iterator = prepared.stream(ownedUsageRequest({ ...envelope, ...finalConfig, sessionId: agent.session.id, signal },kind))[Symbol.asyncIterator]();
      signal.throwIfAborted();
      startedAt = Date.now();
      Object.assign(active, finalConfig, { status: 'running', startedAt, effort: finalConfig.reasoningEffort ?? null });
      for (;;) {
        pendingNext = iterator.next();
        const part = await Promise.race([pendingNext, aborted]);
        signal.throwIfAborted(); pendingNext = null;
        if (part.done) break;
        const chunk = part.value;
        if (firstTokenMs === undefined && monitorTokenChunk(chunk)) firstTokenMs = Math.max(0, Date.now() - startedAt);
        hasOutput ||= (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') ? Boolean(chunk.text)
          : chunk.type === 'tool-call-delta' ? Boolean(chunk.id || chunk.name || chunk.argumentsDelta) : chunk.type === 'block-end';
        assembler.push(chunk); finished ||= chunk.type === 'finish';
      }
      complete = true;
      if (!finished) throw Error('模型流结束但未报告完成状态');
      if (['error', 'aborted', 'max-tokens'].includes(assembler.finish.kind)) throw Object.assign(
        new Error(assembler.finish.failure?.message || `模型未完成输出：${assembler.finish.kind}`),
        assembler.finish.failure ? { ...assembler.finish.failure, failure: assembler.finish.failure } : {});
      const blocks = assembler.blocks();
      recorded = true;
      this.record(agent.session, kind, { ...finalConfig, source: 'background', startedAt, firstTokenMs, status: 'success', effort: finalConfig.reasoningEffort ?? null, durationMs: Date.now() - startedAt, usage: assembler.usage, hasOutput });
      return { blocks, usage: assembler.usage, ...finalConfig, effort: finalConfig.reasoningEffort ?? null };
    } catch (error) {
      failure = error;
      if (startedAt !== undefined && !recorded) {
        recorded = true;
        try {
          const cancelled = signal.aborted ? signal.reason !== timeoutReason : assembler.finish.kind === 'aborted';
          this.record(agent.session, kind, { ...finalConfig, source: 'background', startedAt, firstTokenMs, status: cancelled ? 'cancelled' : 'error', effort: finalConfig.reasoningEffort ?? null, durationMs: Date.now() - startedAt, usage: assembler.usage, hasOutput, error: error.message,
            ...(typeof error.code === 'string' ? { code: error.code } : {}),
            ...(Number.isInteger(error.status ?? error.failure?.status) ? { httpStatus: error.status ?? error.failure.status } : {}),
            ...(error.failure ? { failure: error.failure } : {}) });
        } catch (recordError) { if (recordError !== error) cleanup.push(recordError); }
      }
      throw error;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      // Aborting the race does not retire adapter-owned preparation. Drain its
      // real continuation before unload; aborted preparation never records consumption.
      try { await resolving; } catch (error) { if (error !== failure) cleanup.push(error); }
      const collect = part => {
        const reason = !part?.done && part?.value?.type === 'finish' ? part.value.reason : null;
        if (reason?.failure && ['error', 'aborted'].includes(reason.kind)
          && reason.failure.code !== 'ABORTED'
          && !(reason.failure.message === signal.reason?.message && reason.failure.code === (isHarnessError(signal.reason) ? signal.reason.code : 'UNKNOWN')))
          cleanup.push(Object.assign(Error(reason.failure.message), { ...reason.failure, failure: reason.failure }));
      };
      try {
        const returning = !complete && iterator ? (async () => {
          for (let part = await iterator.return?.(); part && !part.done; part = await iterator.next()) collect(part);
        })() : Promise.resolve();
        for (const result of await Promise.allSettled([returning, ...(pendingNext ? [pendingNext] : [])])) {
          if (result.status === 'rejected') {
            if (result.reason !== failure && result.reason !== signal.reason) cleanup.push(result.reason);
          } else collect(result.value);
        }
      } finally {
        if (this.live.get(key) === active) this.live.delete(key);
        if (this.calls.get(key) === owned) this.calls.delete(key);
        drained(cleanup);
      }
      if (cleanup.length) throw Object.assign(new AggregateError([...(failure ? [failure] : []), ...cleanup], '后台调用清理失败', { cause: failure }),
        { ...(typeof failure?.code === 'string' ? { code: failure.code } : {}),
          ...(Number.isInteger(failure?.status ?? failure?.failure?.status) ? { status: failure.status ?? failure.failure.status } : {}),
          ...(failure?.failure ? { failure: failure.failure } : {}) });
    }
  }
  observe(session, event) {
    if (event.type === 'step/end' || event.type === 'turn/end') {
      // Preparation can abort before live.start, leaving no assistant settlement.
      const request = this.requestStarts.get(session.id);
      if (request?.turn === event.data.turn && (event.type === 'turn/end' || request.step === event.data.step)) this.requestStarts.delete(session.id);
    }
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const state = this.store.state(session.id);
      state.memoryScope ??= this.scope(session,{effective:false}).mode;
      state.cwd = session.header.cwd; state.parentSession = session.header.parentSession;
      state.origin = session.header.origin ?? null;
      state.started = true; this.store.save(state);
    }
    if ((event.type === 'assistant/message' || event.type === 'assistant/attempt') && sourceName(event.data.message?.source) !== NS + ':shadow') {
      const output = assembleAssistantStream(event.data.stream);
      const fact=this.ctx.tokenMeter?.receiptFor?.(session,event);
      const pending = this.requestStarts.get(session.id);
      const request = pending && pending.turn === event.data.turn && pending.step === event.data.step ? pending : null;
      const route = request?.route ?? (event.data.message?.source?.kind === 'model' ? event.data.message.source : session.requestHeader()?.config ?? {});
      const cancelled = event.data.interrupted === true || output.finish.kind === 'aborted' || request?.signal.aborted === true;
      const failed = cancelled || event.type === 'assistant/attempt' || ['error', 'max-tokens'].includes(output.finish.kind);
      try {
        this.record(session, session.header.origin === 'subagent' ? 'subagent' : 'main', {
          id: `native:${session.id}:${fact?.eventSeq ?? event.seq}`, source: 'native', eventSeq: event.seq, at: event.time,
          turn: event.data.turn, step: event.data.step, hasOutput: Boolean(event.data.message?.content?.length || output.blocks().length),
          provider: route.provider, model: route.model, usage: event.data.usage ?? output.usage,
          ...(request?.route ? { effort: request.route.reasoningEffort ?? null } : {}),
          status: cancelled ? 'cancelled' : failed ? 'error' : 'success', startedAt: request?.streamStartedAt ?? request?.startedAt,
          durationMs: request ? Date.now() - (request.streamStartedAt ?? request.startedAt) : null, firstTokenMs: request?.firstTokenMs ?? null,
          ...(failed ? { error: output.finish.failure?.message || (cancelled ? '已取消' : event.type === 'assistant/attempt' ? '请求未完成' : output.finish.kind) } : {}),
        });
      } finally {
        if (request && this.requestStarts.get(session.id) === request) this.requestStarts.delete(session.id);
      }
      if (!failed && event.type === 'assistant/message' && event.data.message?.source?.kind === 'model' && event.data.stream?.length) this.context.mainSucceeded(session, event.data.message.source);
    }
  }
  finishTasks(agent, turn, signal) {
    const session = agent.session, store = this.todoStore;
    if (!store || signal.aborted || session.header.origin === 'subagent') return;
    const events = session.snapshotEvents();
    if (events.findLast(e => e.type === 'plan/mode')?.data.active) return;
    const answer = events.findLast(e => e.type === 'assistant/message' || e.type === 'assistant/attempt');
    if (answer && ['error', 'aborted', 'max-tokens'].includes(assembleAssistantStream(answer.data.stream).finish.kind)) return;
    const control = store.turnControl(session, turn);
    if (control.paused) { this.taskReviews.delete(session.id); return; }
    const reminders = this.taskReminders(session), pending = this.taskReviews.get(session.id);
    if (reminders.verification && pending?.turn === turn) {
      const delivered = events.find(e => e.type === 'user/message' && e.data.id === pending.messageId);
      if (delivered && answer?.seq > delivered.seq) store.markTextReviewed(session, pending.ids);
    }
    this.taskReviews.delete(session.id);
    const state = store.gateState(session);
    let text, reviewing = false;
    if (reminders.todo && state.undone) text = store.unresolvedText(session, { verification: reminders.verification });
    else if (reminders.verification && state.unqualified) text = store.unqualifiedText(session);
    else if (reminders.verification) { text = store.textReviewText(session); reviewing = Boolean(text); }
    if (!text) {
      const summary = store.releaseSummary(session);
      if (summary.total) { const saved = this.store.state(session.id); saved.taskRelease = { ...summary, at: Date.now(), turn }; this.store.save(saved); }
      return;
    }
    text += '\n' + TASK_PAUSE_GUIDANCE;
    if (control.reminders.has(text)) return;
    const notice = message(text, reviewing ? 'task-review' : reminders.verification ? 'task-verification' : 'task-reminder');
    agent.steer(notice);
    control.reminders.add(text);
    if (reviewing) this.taskReviews.set(session.id, { turn, messageId: notice.id, ids: store.textReviewLinkIds(session) });
  }
}
