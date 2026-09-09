import { Service } from '@deepseek-ai/cordis';
import { BlockAssembler, assembleAssistantStream, createUserMessage } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { HubStore, projectOf, memoryLineage, matchesProject } from './hub-store.mjs';
import { MEMORY_CONSTITUTION, OPS_DESC, DIGEST_DESC, CURATE_RULES } from './prompts.mjs';
import { MemoryContext } from './memory-context.mjs';
import { StateZone } from './state-zone.mjs';
import { createEffortResolver } from './effort.mjs';
import { TODO_NUDGE, TODO_EMPTY_NUDGE } from './todolist.mjs';

export const NS = 'trisoul-x';
export const message = (text, kind = 'context') => createUserMessage({
  content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: `${NS}:${kind}` },
});
export const contentText = (blocks = []) => blocks.flatMap(b => {
  if (b.type === 'text') return [b.text];
  if (b.type === 'tool-call') return [`${b.name}(${b.arguments})`];
  if (b.type === 'tool-result') return [`${b.isError ? '[error] ' : ''}${contentText(b.content)}`];
  return [];
}).join('\n');
export const eventText = (session, e) => contentText(session.deriveEventMessage(e)?.content);
export const sessionEvents = session => session.snapshotEvents();
export const substantive = e => (e.type === 'assistant/message' && e.data.message?.source?.plugin !== 'trisoul-x:shadow') || e.type === 'tool/result'
  || (e.type === 'user/message' && e.data.source.kind === 'user');

const str = description => ({ type: 'string', ...(description ? { description } : {}) });
export const SAVE_CONTEXT = {
  name: 'save_context', description: 'Save this batch’s digest, task memo rewrite, and memory changes.',
  parameters: {
    type: 'object', required: ['digest', 'workdoc', 'phaseClosed', 'compactable', 'nowCompactable', 'ops', 'signals'],
    properties: {
      digest: str(DIGEST_DESC.digest), workdoc: str(DIGEST_DESC.workdoc),
      phaseClosed: { type: 'boolean', description: DIGEST_DESC.phaseClosed },
      compactable: { type: 'boolean', description: DIGEST_DESC.compactable },
      nowCompactable: { type: 'array', items: { type: 'integer' }, description: DIGEST_DESC.nowCompactable },
      signals: { type: 'object', required: ['overlap', 'conflict'], additionalProperties: false, properties: {
        overlap: { type: 'boolean', description: DIGEST_DESC.overlap },
        conflict: { type: 'boolean', description: DIGEST_DESC.conflict },
      } },
      ops: { type: 'array', description: OPS_DESC.ops, items: {
        type: 'object', required: ['op', 'scope', 'key', 'text', 'target'], properties: {
          op: { ...str(OPS_DESC.op), enum: ['add', 'update', 'retire'] },
          scope: { ...str(OPS_DESC.scope), enum: ['global', 'cross', 'project'] },
          key: str(OPS_DESC.key), text: str(OPS_DESC.text), target: str(OPS_DESC.target),
        },
      } },
    },
  },
};
export const SCRIBE = [MEMORY_CONSTITUTION, 'Submit the result using save_context.'].join('\n\n');
export const MEMORY_CURATE = {
  name: 'memory_curate', description: 'Save the memory curation operations.',
  parameters: { type: 'object', required: ['ops'], properties: { ops: SAVE_CONTEXT.parameters.properties.ops } },
};
export const CURATOR = [MEMORY_CONSTITUTION, CURATE_RULES, 'Submit the result using memory_curate.'].join('\n\n');

export class Hub extends Service {
  constructor(ctx, config) {
    super(ctx, 'trisoulX');
    this.getConfig = () => config;
    this.store = new HubStore(config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), NS));
    this.presetRoot = fileURLToPath(new URL('../presets/', import.meta.url));
    this.memoryContext = new MemoryContext(this); this.stateZone = new StateZone(this);
    this.efforts = new Map(); this.idleTimers = new Map(); this.agents = new Map(); this.disposedAgents = new Set();
    this.digestQueue = new Map(); this.digesting = false;
    this.jobs = new Map(); this.controllers = new Map();
    this.live = new Map(); this.requestStarts = new Map(); this.taskReviews = new Map();
    this.curations = new Map(); this.curationTail = Promise.resolve(); this.curationClosed = false;
    ctx.effect(() => () => {
      for (const c of this.controllers.values()) c.abort();
      this.disposeCuration(); this.memoryContext.dispose(); this.stateZone.dispose();
      for (const timer of this.idleTimers.values()) clearTimeout(timer);
    });
  }
  config() { return this.getConfig(); }
  scope(session) {
    const state = this.store.state(session.id);
    let root = state, parentId = session.header.parentSession;
    while (parentId) { root = this.store.state(parentId); parentId = root.parentSession; }
    const mode = state.memoryScope ?? root.memoryScope ?? this.config().memoryScope;
    return { mode, project: mode === 'session' ? `session:${root.id}` : projectOf(session.header.cwd || process.cwd()) };
  }
  memories(session, history = false) {
    const { project, mode } = this.scope(session);
    return this.store.memories(project, mode, history);
  }
  ops(session, ops, source) {
    const { project, mode } = this.scope(session);
    return this.store.memoryOps(project, ops, source, mode);
  }
  route(agent, kind) {
    const main = agent.session.requestHeader()?.config ?? agent.options;
    const custom = this.config().backgroundMode === 'unified' ? this.config().unifiedBackground : this.config()[kind === 'surgeon' ? 'surgeon' : ['state', 'probeAsk', 'probeAnswer'].includes(kind) ? 'canvas' : 'background'] ?? {};
    return { provider: custom.provider || main.provider, model: custom.model || main.model, temperature: custom.temperature, effort: custom.effort ?? 'off' };
  }
  captureFrame(agent, turn, step) {
    const session = agent.session, state = this.store.state(session.id), meter = this.ctx.tokenMeter.measure(session);
    state.pendingFrame = { at: Date.now(), turn, step, totalTokens: meter.totalTokens, nodes: meter.nodes.map(n => {
      const e = session.eventAt(n.seq), msg = session.deriveEventMessage(e);
      return { seq: n.seq, kind: msg?.source?.compactionId ? 'checkpoint' : msg?.source?.plugin || msg?.source?.kind || e.type, tokens: n.tokens ?? n.heuristicTokens ?? 0 };
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
      state.contextHistory ??= []; state.contextHistory.push({ ...frame, cacheReadTokens: entry.usage?.cacheReadTokens || 0 });
      state.contextHistory = state.contextHistory.slice(-80); delete state.pendingFrame;
    }
    const completed = session.snapshotEvents().findLast(e => e.type === 'step/end');
    state.activity.push({ at: Date.now(), turn: frame?.turn ?? completed?.data.turn, step: frame?.step ?? completed?.data.step, sessionId: session.id, kind, ...entry, usage: entry.usage ?? null, effort: entry.effort ?? (['main', 'subagent'].includes(kind) ? recent?.reasoningEffort ?? null : null) });
    state.activity = state.activity.slice(-60);
    this.store.save(state);
  }
  action(session, name, count = 1, detail = {}) {
    const state = this.store.state(session.id);
    state.actions ??= {}; state.actions[name] = (state.actions[name] || 0) + count;
    if (name === 'recalls') state.actions.recallHits = (state.actions.recallHits || 0) + detail.items;
    if (name === 'surgeries') {
      state.actions.compactInputChars = (state.actions.compactInputChars || 0) + detail.inputChars;
      state.actions.compactOutputChars = (state.actions.compactOutputChars || 0) + detail.outputChars;
    }
    state.memoryTrace ??= [];
    state.memoryTrace.push({ at: Date.now(), name, count, ...detail });
    state.memoryTrace = state.memoryTrace.slice(-40);
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
    if ((event.type === 'assistant/message' || event.type === 'assistant/attempt') && event.data.message?.source?.plugin !== NS + ':shadow') {
      const output = assembleAssistantStream(event.data.stream);
      const route = session.requestHeader()?.config ?? {};
      const failed = ['error', 'aborted', 'max-tokens'].includes(output.finish.kind);
      this.record(session, session.header.origin === 'subagent' ? 'subagent' : 'main', {
        provider: route.provider, model: route.model, usage: output.usage,
        durationMs: this.requestStarts.has(session.id) ? Date.now() - this.requestStarts.get(session.id) : 0,
        ...(failed ? { error: output.finish.failure?.message || output.finish.kind } : {}),
      });
      this.requestStarts.delete(session.id);
    }
  }
  publish(agent, offered = []) {
    const session = agent.session;
    if (session.header.origin === 'subagent') return;
    const state = this.store.state(session.id);
    if (state.curationPending && !this.curations.get(this.curationKey(session))?.running) this.requestCuration(agent);
    if (!state.memoryScope) { state.memoryScope = this.config().memoryScope; this.store.save(state); }
    this.agents.set(session.id, agent);
    this.stateZone.publish(agent);
    if (this.todoStore) {
      this.todoStore.maintainInjection(session);
      const notice = offered.some(m => m.source?.kind === 'user') ? TODO_NUDGE : this.todoStore.takeEmptyNudge(session) ? TODO_EMPTY_NUDGE.replace('with task_map', 'with todo_write') : null;
      if (notice) session.append('user/message', message(notice, 'task-reminder'), { surfaceOp: 'append' });
    }
  }
  finishTasks(agent, turn, signal) {
    const session = agent.session, store = this.todoStore;
    if (!store || signal.aborted || session.header.origin === 'subagent') return;
    const events = session.snapshotEvents();
    if (events.findLast(e => e.type === 'plan/mode')?.data.active) return;
    const answer = events.findLast(e => e.type === 'assistant/message' || e.type === 'assistant/attempt');
    if (answer && ['error', 'aborted', 'max-tokens'].includes(assembleAssistantStream(answer.data.stream).finish.kind)) return;
    const pending = this.taskReviews.get(session.id);
    if (pending?.turn === turn) {
      const delivered = events.find(e => e.type === 'user/message' && e.data.id === pending.messageId);
      if (delivered && answer?.seq > delivered.seq) store.markTextReviewed(session, pending.ids);
    }
    this.taskReviews.delete(session.id);
    const state = store.gateState(session);
    const text = state.undone ? store.unresolvedText(session)
      : state.unqualified ? store.unqualifiedText(session) : store.textReviewText(session);
    if (!text) {
      const summary = store.releaseSummary(session);
      if (summary.total) { const saved = this.store.state(session.id); saved.taskRelease = { ...summary, at: Date.now(), turn }; this.store.save(saved); }
      return;
    }
    const reviewing = state.pass, notice = message(text, reviewing ? 'task-review' : 'task-reminder');
    agent.steer(notice);
    if (reviewing) this.taskReviews.set(session.id, { turn, messageId: notice.id, ids: store.textReviewLinkIds(session) });
  }
  startDigestSession(agent) {
    const session = agent.session, state = this.store.state(session.id);
    this.disposedAgents.delete(session.id); this.agents.set(session.id, agent);
    // Newly encountered sessions/forks start here; known sessions replay their unfinished tail.
    if (!state.digestInitialized) {
      if (state.cursor < 0 && !state.started && !state.digests.length) state.cursor = session.seq - 1;
      state.digestInitialized = true; this.store.save(state);
    }
    this.digestQueue ??= new Map();
    if (!this.digestQueue.has(session.id) && this.config().catchupMax > 0) {
      const backlog = sessionEvents(session).filter(e => e.seq > state.cursor && substantive(e) && eventText(session, e).trim());
      if (backlog.length > this.config().catchupMax) {
        state.cursor = backlog.at(-this.config().catchupMax).seq - 1; this.store.save(state);
      }
    }
    void this.schedule(agent);
  }
  schedule(agent, force = false) {
    const session = agent.session;
    if (session.header.origin === 'subagent' || this.curationClosed || this.disposedAgents?.has(session.id)) return Promise.resolve();
    this.agents.set(session.id, agent); this.lastDigestAgent = agent;
    this.digestQueue ??= new Map();
    let pending = this.digestQueue.get(session.id);
    if (!pending) {
      pending = { agent, events: [], scanSeq: this.store.state(session.id).cursor, retries: 0, urgent: false };
      this.digestQueue.set(session.id, pending);
    }
    pending.agent = agent;
    const fresh = sessionEvents(session).filter(e => e.seq > pending.scanSeq && substantive(e) && eventText(session, e).trim());
    pending.scanSeq = session.seq - 1; pending.events.push(...fresh);
    if (force && pending.events.length) pending.urgent = true;
    if (fresh.length) this.armIdle(agent);
    return this.drainDigests();
  }
  drainDigests() {
    if (this.digesting) return this.digestRun;
    this.digestQueue ??= new Map();
    const next = () => [...this.digestQueue.values()].find(p => p.events.length && (p.urgent || p.events.length >= this.config().digestEvery));
    if (this.curationClosed || !next()) return Promise.resolve();
    this.digesting = true;
    this.digestRun = (async () => {
      for (let pending; !this.curationClosed && (pending = next());) {
        const { agent } = pending, session = agent.session, cfg = this.config();
        const batch = pending.events.splice(0, cfg.digestBatchMax > 0 ? Math.max(cfg.digestEvery, cfg.digestBatchMax) : pending.events.length);
        pending.urgent = false;
        const controller = new AbortController(); this.controllers.set(session.id, controller);
        const job = this.digest(agent, batch, controller.signal); this.jobs.set(session.id, job);
        try { await job; pending.retries = 0; }
        catch (error) {
          if (!controller.signal.aborted) {
            this.ctx.logger.warn(`记忆消化：${error.message}`); this.action(session, 'digestErrors', 1, { error: error.message });
            if (pending.retries < 1) { pending.retries++; pending.events.unshift(...batch); }
            else { pending.retries = 0; this.action(session, 'digestDeferred', 1, { from: batch[0].seq, to: batch.at(-1).seq }); }
          }
        } finally { this.jobs.delete(session.id); this.controllers.delete(session.id); }
      }
    })().finally(() => { this.digesting = false; this.digestRun = undefined; this.armIdle(); });
    return this.digestRun;
  }
  async digest(agent, fresh, signal) {
    const session = agent.session, state = this.store.state(session.id), { project } = this.scope(session);
    const released = new Set(state.digests.flatMap(d => d.release));
    const held = state.digests.filter(d => !d.compactable && !released.has(d.id));
    const cfg = this.config(), workdoc = this.memoryContext.record(session).doc;
    let memories = this.memories(session).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
    if (cfg.contextMemories > 0) memories = memories.slice(0, cfg.contextMemories);
    memories.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    const input = `Current project (git root / cwd): ${project}\nToday: ${new Date().toLocaleDateString('en-CA')}\n\nExisting memories (visible to this project${cfg.contextMemories > 0 ? `, at most ${cfg.contextMemories}` : ''}, oldest→newest):\n${memories.map(m => `- id=${m.id} | ${m.scope} | key=${m.key} | ${m.text}`).join('\n') || '(empty)'}`
      + (held.length ? `\n\nPending re-review (batches this session previously marked "original text still in use"; if this batch of new events shows they are done with, put their ids into nowCompactable):\n${held.map(d => `- id=${d.id} seq ${d.from}..${d.to}: ${d.summary}`).join('\n')}` : '')
      + (cfg.supplementMode === 'renew' && workdoc ? `\n\nCurrent task memo document (the session's working-memory view; rewrite rules under workdoc in the tool parameters):\n${workdoc}` : '')
      + `\n\nNew events (seq ${fresh[0].seq}..${fresh.at(-1).seq}):\n${fresh.map(e => `[seq ${e.seq} ${e.type}] ${cfg.digestEventChars > 0 ? eventText(session, e).slice(0, cfg.digestEventChars) : eventText(session, e)}`).join('\n')}`;
    const result = await this.call(agent, 'background', { system: SCRIBE, messages: [message(input)], tools: [SAVE_CONTEXT], ...(cfg.digestMaxTokens > 0 ? { maxTokens: cfg.digestMaxTokens } : {}) }, signal);
    signal.throwIfAborted();
    const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === SAVE_CONTEXT.name);
    if (!call) throw new Error('后台没有提交结果，本批留待下次整理。');
    const a = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
    if (typeof a.digest !== 'string' || typeof a.workdoc !== 'string' || typeof a.phaseClosed !== 'boolean' || typeof a.compactable !== 'boolean' || !Array.isArray(a.nowCompactable) || !Array.isArray(a.ops) || typeof a.signals?.overlap !== 'boolean' || typeof a.signals?.conflict !== 'boolean') throw new Error('后台结果缺少必要字段，本批未写入。');
    const before = this.memories(session), after = this.ops(session, a.ops, 'scribe');
    const touched = before.some(m => !after.some(n => n.id === m.id));
    state.cursor = fresh.at(-1).seq;
    state.signals = a.signals;
    this.memoryContext.applyWorkdoc(session, workdoc, a.workdoc);
    if (a.phaseClosed) for (const d of state.digests) if (d.to <= state.cursor) d.compactable = true;
    state.digests.push({ id: state.cursor, from: fresh[0].seq, to: state.cursor, summary: a.digest, compactable: a.compactable || a.phaseClosed, phaseClosed: a.phaseClosed, release: a.nowCompactable });
    this.store.save(state);
    this.action(session, 'digests', 1, { from: fresh[0].seq, to: state.cursor, added: a.ops.filter(o => o.op === 'add').length, updated: a.ops.filter(o => o.op === 'update').length, retired: a.ops.filter(o => o.op === 'retire').length });
    void this.memoryContext.proactive(agent, a.digest);
    state.digestCount = (state.digestCount || 0) + 1; this.store.save(state);
    if (touched || a.signals.overlap || a.signals.conflict || state.curationPending) this.requestCuration(agent);
    else if (cfg.curateEvery > 0 && state.digestCount % cfg.curateEvery === 0) this.requestCuration(agent, this.store.pickShard(this.curationKey(session), this.scope(session)), 'cadence');
  }
  armIdle(agent) {
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    if (agent && !this.disposedAgents?.has(agent.session.id)) this.lastDigestAgent = agent;
    if (this.curationClosed || !this.config().flushIdleMs) return;
    const actor = this.lastDigestAgent && !this.disposedAgents?.has(this.lastDigestAgent.session.id) ? this.lastDigestAgent : [...this.agents.values()].at(-1);
    if (!actor) return;
    const timer = setTimeout(() => { this.idleTimers.clear(); void this.onIdle(actor).catch(error => this.ctx.logger.warn(`空闲整理：${error.message}`)); }, this.config().flushIdleMs);
    timer.unref(); this.idleTimers.set('memory', timer);
  }
  async onIdle(agent) {
    if (this.curationClosed) return;
    if (this.digesting) { this.armIdle(agent); return; }
    const queues = this.digestQueue ?? new Map(), hasPending = () => [...queues.values()].some(p => p.events.length);
    for (let guard = queues.size + 1; guard > 0 && hasPending() && !this.curationClosed; guard--) {
      for (const pending of queues.values()) if (pending.events.length) pending.urgent = true;
      await this.drainDigests();
    }
    if (this.curationClosed) return;
    if (hasPending() || this.digesting || [...this.curations.values()].some(job => job.running)) { this.armIdle(agent); return; }
    const shard = this.store.pickShard(this.curationKey(agent.session), this.scope(agent.session));
    if (shard) { await this.requestCuration(agent, shard, 'idle'); this.armIdle(agent); }
  }
  disposeAgent(agent) {
    const id = agent.session.id;
    this.disposedAgents?.add(id); this.memoryContext.dispose(id);
    this.taskReviews.delete(id); this.controllers.get(id)?.abort(); this.stateZone.dispose(id); this.canvas?.prober?.dispose(id);
    this.digestQueue?.delete(id); this.agents.delete(id);
    if (this.lastDigestAgent?.session.id === id) this.lastDigestAgent = undefined;
    this.armIdle();
  }
  curationKey(session) { return `project:${this.scope(session).project}`; }
  requestCuration(agent, shard = this.curationKey(agent.session), trigger = 'signal') {
    if (!shard || this.curationClosed || agent.session.header.origin === 'subagent' || this.scope(agent.session).mode === 'session') return;
    const state = this.store.state(agent.session.id); state.curationPending = true; this.store.save(state);
    const key = shard;
    let job = this.curations.get(key);
    if (!job) {
      job = { shard, trigger, pending: new Set(), lastAt: this.store.curationState().lastAt[shard] || 0, running: false };
      this.curations.set(key, job);
    }
    job.agent = agent; job.trigger = trigger; job.pending.add(agent.session.id);
    return this.drainCuration(job);
  }
  drainCuration(job) {
    if (this.curationClosed || job.running || !job.pending.size) return job.promise;
    clearTimeout(job.timer);
    const delay = job.lastAt + this.config().curateMinGapMs - Date.now();
    if (delay > 0) {
      job.timer = setTimeout(() => this.drainCuration(job), delay); job.timer.unref();
      return;
    }
    job.running = true;
    const agent = job.agent, ids = [...job.pending]; job.pending.clear();
    const controller = new AbortController(); job.controller = controller;
    job.promise = this.curationTail.catch(() => {}).then(async () => {
      controller.signal.throwIfAborted();
      await this.curate(agent, controller.signal, job.shard, job.trigger);
      for (const id of ids) {
        const state = this.store.state(id); state.curatedAt = Date.now();
        state.curationPending = job.pending.has(id); this.store.save(state);
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        this.ctx.logger.warn(`记忆整理：${error.message}`);
        this.action(agent.session, 'curationErrors', 1, { error: error.message });
      }
    }).finally(() => {
      job.running = false; job.lastAt = Date.now(); job.controller = undefined;
      if (job.pending.size) this.drainCuration(job);
    });
    this.curationTail = job.promise;
    return job.promise;
  }
  disposeCuration() {
    this.curationClosed = true;
    for (const job of this.curations.values()) { clearTimeout(job.timer); job.controller?.abort(); }
  }
  async curate(agent, signal, shard = this.curationKey(agent.session), trigger = 'manual') {
    const session = agent.session, { mode } = this.scope(session);
    if (mode === 'session') return;
    const cfg = this.config(), window = this.store.curateWindow(shard, cfg.curateLimit), now = Date.now();
    const scope = shard.startsWith('project:') ? 'project' : shard, project = scope === 'project' ? shard.slice(8) : undefined;
    if (mode === 'project' && !matchesProject(project, this.scope(session).project)) return;
    const candidates = scope === 'cross' && mode === 'full' ? this.store.crossCandidates() : [];
    const entries = window.entries, editable = [...entries, ...candidates.flatMap(g => g.entries)];
    if (window.total < 2 && editable.length < 2) { this.store.markCurated(shard, 0); return; }
    const history = new Map(this.store.allMemories().map(m => [m.id, m]));
    const ago = at => Number.isFinite(at) ? `${Math.max(0, Math.floor((now - at) / 86400000))}d` : 'unknown';
    const date = at => Number.isFinite(at) ? new Date(at).toISOString() : 'never';
    const line = m => {
      const lineage = memoryLineage(m, history);
      return `- id=${m.id} | ${m.scope}${m.project ? `(${m.project})` : ''} | key=${m.key} | ${m.text} [age=${ago(lineage.at)} updated=${ago(m.at)} source=${m.source} origin=${lineage.origin} versions=${lineage.depth}; injected=${m.usage?.injected || 0} last=${date(m.usage?.injectedAt)}; recalled=${m.usage?.recalled || 0} last=${date(m.usage?.recalledAt)}]`;
    };
    const rot = window.total > entries.length ? ` (this round: entries ${window.cursor + 1}~${window.cursor + entries.length} of ${window.total}; the rest next round)` : '';
    let head, extra = '';
    if (scope === 'project') {
      head = `Current shard: this project's project layer (git root / cwd: ${project})${rot}\nEditable entries (ops may target only these ids):\n`;
      const shared = mode === 'full' ? this.store.allMemories().filter(m => !m.retired && !m.supersededBy && m.scope !== 'project') : [];
      if (shared.length) extra = `\n\nGlobal / cross-project digest (read-only, no ids, do not emit ops against them; only for spotting project entries that duplicate them — such duplicates may retire the project-side entry):\n${shared.map(m => `- (read-only) [${m.scope}] ${m.text}`).join('\n')}`;
    } else if (scope === 'cross') {
      head = `Current shard: cross-project cross layer${rot}\nEditable entries (ops may target these ids):\n`;
      if (candidates.length) extra = `\n\nPromotion candidates (entries from various projects' project layers with the same key or similar text, appearing in ≥2 projects; also editable): if one holds in any project, promote it with update (target = one of the ids, scope=cross, text = the merged general statement) and retire the remaining duplicates; if they are still each project's own matter, leave them alone:\n` + candidates.map((g, i) => `Group ${i + 1} (key=${g.key}):\n${g.entries.map(line).join('\n')}`).join('\n');
    } else head = `Current shard: base global layer (facts about the user themselves / machine / accounts / environment)${rot}\nEditable entries (global may only merge/update text; no retiring, no demoting):\n`;
    const input = `Today: ${new Date().toLocaleDateString('en-CA')}\n\n` + head + (entries.map(line).join('\n') || '(empty)') + extra;
    const result = await this.call(agent, 'curation', { system: CURATOR, messages: [message(input)], tools: [MEMORY_CURATE], ...(cfg.curateMaxTokens > 0 ? { maxTokens: cfg.curateMaxTokens } : {}) }, signal);
    signal.throwIfAborted();
    const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === MEMORY_CURATE.name);
    const args = call && (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments);
    if (!Array.isArray(args?.ops)) throw new Error('整理作业未提交操作，本轮留待重试');
    const ops = cfg.curateOpsMax > 0 ? args.ops.slice(0, cfg.curateOpsMax) : args.ops;
    this.store.memoryOps(project, ops, 'curate', mode, new Set(editable.map(m => m.id)));
    this.store.markCurated(shard, window.next);
    this.action(session, 'curations', 1, { shard, trigger, scanned: editable.length, cursor: window.next, total: window.total, operations: ops.length, truncated: args.ops.length - ops.length });
  }
}
