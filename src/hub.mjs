import { sourceName } from './message-source.mjs';
import { Service } from '@deepseek-ai/cordis';
import { BlockAssembler, assembleAssistantStream, createUserMessage } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { HubStore, projectOf } from './hub-store.mjs';
import { Config, configSnapshot } from './config.mjs';
import { ContextPipeline } from './context/pipeline.mjs';
import { createHostAdapter } from './context/host.mjs';
import { createEffortResolver } from './effort.mjs';
import { promptText } from './cc-adaptation/texts.mjs';
import { setRuntimeContext } from './task-context.mjs';

const TASK_PAUSE_GUIDANCE = promptText('runtime/task-pause.md');

export const NS = 'trisoul-x';
export const message = (text, kind = 'context') => createUserMessage({
  content: [{ type: 'text', text }], source: { kind: `plugin:${NS}:${kind}` },
});
export const contentText = (blocks = []) => blocks.flatMap(b => {
  if (b.type === 'text') return [b.text];
  if (b.type === 'tool-call') return [`${b.name}(${b.arguments})`];
  if (b.type === 'tool-result') return [`${b.isError ? '[error] ' : ''}${contentText(b.content)}`];
  return [];
}).join('\n');
export const eventText = (session, e) => contentText(session.deriveEventMessage(e)?.content);
export class Hub extends Service {
  constructor(ctx, config) {
    super(ctx, 'trisoulX');
    this.getConfig = () => configSnapshot(config);
    this.store = new HubStore(config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), NS));
    this.context = new ContextPipeline(this, createHostAdapter(this));
    this.efforts = new Map(); this.agents = new Map();
    this.live = new Map(); this.requestStarts = new Map(); this.taskReviews = new Map();
    ctx.effect(() => async () => {
      this.context.dispose();
      await Promise.all([...this.agents.values()].map(agent => {
        setRuntimeContext(agent.session, () => null);
        return this.context.stripRuntime(agent.session);
      }));
    });
  }
  config() { const value = this.getConfig(); return Object.fromEntries(Object.keys(Config.dict).filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])); }
  taskReminders(session) {
    const saved = (this.store.peek ? this.store.peek(session.id) : this.store.state(session.id))?.betterTodo;
    return { todo: saved?.todo ?? true, verification: saved?.verification ?? false };
  }
  setTaskReminders(session, patch) {
    const state = this.store.state(session.id), previous = this.taskReminders(session), next = { ...previous, ...patch };
    this.store.save({ ...state, betterTodo: next });
    state.betterTodo = next;
    if (next.todo !== previous.todo || next.verification !== previous.verification) this.todoStore?.resetTurnControl(session);
    if (!next.verification) this.taskReviews.delete(session.id);
    return next;
  }
  scope(session) {
    const state = this.store.peek ? this.store.peek(session.id) ?? { id: session.id } : this.store.state(session.id);
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
    const custom = this.config().backgroundMode === 'unified' ? this.config().unifiedBackground : this.config()[['coordinate', 'compactFull'].includes(kind) ? 'surgeon' : 'background'] ?? {};
    return { provider: custom.provider || main.provider, model: custom.model || main.model, temperature: custom.temperature, effort: custom.effort ?? 'off' };
  }
  captureFrame(agent, turn, step) {
    const session = agent.session, state = this.store.state(session.id), meter = this.ctx.tokenMeter.measure(session);
    state.pendingFrame = { at: Date.now(), turn, step, totalTokens: meter.totalTokens, nodes: meter.nodes.map(n => {
      const e = session.eventAt(n.seq), msg = session.deriveEventMessage(e);
      return { seq: n.seq, kind: msg?.source?.compactionId ? 'checkpoint' : sourceName(msg?.source) || msg?.source?.kind || e.type, tokens: n.tokens ?? n.heuristicTokens ?? 0 };
    }) };
  }
  record(session, kind, entry) {
    const state = this.store.state(session.id);
    state.cwd = session.header.cwd;
    state.parentSession = session.header.parentSession;
    const metric = state.metrics[kind] ??= { calls: 0, errors: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    metric.calls++; metric.errors += Number(Boolean(entry.error)); metric.durationMs += entry.durationMs || 0;
    for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) metric[field] = (metric[field] || 0) + (entry.usage?.[field] || 0);
    if (entry.usage?.reasoningTokens !== undefined) metric.reasoningTokens = (metric.reasoningTokens || 0) + entry.usage.reasoningTokens;
    if (!entry.usage) metric.unmetered = (metric.unmetered || 0) + 1;
    metric.peakContext = Math.max(metric.peakContext || 0, (entry.usage?.inputTokens || 0) + (entry.usage?.cacheReadTokens || 0) + (entry.usage?.cacheWriteTokens || 0));
    const recent = session.requestHeader()?.config;
    const frame = state.pendingFrame;
    if (['main', 'subagent'].includes(kind) && frame) {
      const inputTokens = entry.usage ? (entry.usage.inputTokens || 0) + (entry.usage.cacheReadTokens || 0) + (entry.usage.cacheWriteTokens || 0) : undefined;
      state.contextHistory ??= []; state.contextHistory.push({ ...frame, inputTokens, cacheReadTokens: entry.usage?.cacheReadTokens || 0 });
      state.contextHistory = state.contextHistory.slice(-80); delete state.pendingFrame;
    }
    const completed = frame ? null : session.snapshotEvents().findLast(e => e.type === 'step/end');
    state.activity.push({ at: Date.now(), turn: frame?.turn ?? completed?.data.turn, step: frame?.step ?? completed?.data.step, sessionId: session.id, kind, ...entry, usage: entry.usage ?? null, effort: entry.effort ?? (['main', 'subagent'].includes(kind) ? recent?.reasoningEffort ?? null : null) });
    state.activity = state.activity.slice(-60);
    this.budgets?.record(session, kind, entry);
    this.store.save(state);
  }
  action(session, name, count = 1) {
    const state = this.store.state(session.id);
    state.actions ??= {}; state.actions[name] = (state.actions[name] || 0) + count;
    this.store.save(state);
  }
  async call(agent, kind, request, signal) {
    const { effort, ...route } = this.route(agent, kind), start = Date.now();
    const timeoutMs = this.config().jobTimeoutMs;
    const controller = new AbortController(), timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('后台作业超时')), timeoutMs) : undefined;
    timer?.unref();
    signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let onAbort, iterator, complete = false, reasoningEffort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('后台作业已取消'));
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    });
    aborted.catch(() => {});
    const assembler = new BlockAssembler();
    const key = `${agent.session.id}:${kind}:${this.callSerial = (this.callSerial || 0) + 1}`, active = { sessionId: agent.session.id, kind, startedAt: start, ...route };
    this.live.set(key, active);
    try {
      if (!this.efforts.has(effort)) this.efforts.set(effort, createEffortResolver(this.ctx, { effort }));
      reasoningEffort = await Promise.race([this.efforts.get(effort).resolve(route.provider, route.model), aborted]);
      iterator = this.ctx.llm.stream({ ...route, ...(reasoningEffort !== undefined ? { reasoningEffort } : {}), ...request, sessionId: agent.session.id, signal })[Symbol.asyncIterator]();
      for (;;) { const part = await Promise.race([iterator.next(), aborted]); if (part.done) break; assembler.push(part.value); }
      complete = true;
      if (['error', 'aborted', 'max-tokens'].includes(assembler.finish.kind)) throw new Error(assembler.finish.failure?.message || `模型未完成输出：${assembler.finish.kind}`);
      this.record(agent.session, kind, { ...route, effort: reasoningEffort ?? null, durationMs: Date.now() - start, usage: assembler.usage });
      return { blocks: assembler.blocks(), usage: assembler.usage, ...route };
    } catch (error) {
      this.record(agent.session, kind, { ...route, effort: reasoningEffort ?? null, durationMs: Date.now() - start, usage: assembler.usage, error: error.message });
      throw error;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      if (!complete) { try { void iterator?.return?.()?.catch?.(() => {}); } catch {} }
      if (this.live.get(key) === active) this.live.delete(key);
    }
  }
  observe(session, event) {
    if (event.type === 'todo/write') {
      const state = this.store.state(session.id); state.taskList = event.data; this.store.save(state);
    }
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const state = this.store.state(session.id);
      state.memoryScope ??= this.scope(session).mode;
      state.cwd = session.header.cwd; state.parentSession = session.header.parentSession;
      state.started = true; this.store.save(state);
    }
    if ((event.type === 'assistant/message' || event.type === 'assistant/attempt') && sourceName(event.data.message?.source) !== NS + ':shadow') {
      const output = assembleAssistantStream(event.data.stream);
      const route = session.requestHeader()?.config ?? {};
      const failed = ['error', 'aborted', 'max-tokens'].includes(output.finish.kind);
      this.record(session, session.header.origin === 'subagent' ? 'subagent' : 'main', {
        provider: route.provider, model: route.model, usage: output.usage,
        durationMs: this.requestStarts.has(session.id) ? Date.now() - this.requestStarts.get(session.id) : 0,
        ...(failed ? { error: output.finish.failure?.message || output.finish.kind } : {}),
      });
      this.requestStarts.delete(session.id);
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
    const notice = message(text, reviewing ? 'task-review' : 'task-reminder');
    agent.steer(notice);
    control.reminders.add(text);
    if (reviewing) this.taskReviews.set(session.id, { turn, messageId: notice.id, ids: store.textReviewLinkIds(session) });
  }
}
