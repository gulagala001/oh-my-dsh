import { Service } from '@deepseek-ai/cordis';
import { BlockAssembler, assembleAssistantStream, createUserMessage } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { HubStore, projectOf, memoryLineage } from './hub-store.mjs';
import { MEMORY_CONSTITUTION, OPS_DESC, DIGEST_DESC, STATE_SYSTEM, STATE_RULES, CURATE_RULES } from './prompts.mjs';
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
export const substantive = e => e.type === 'assistant/message' || e.type === 'tool/result'
  || (e.type === 'user/message' && e.data.source.kind === 'user');

const str = description => ({ type: 'string', ...(description ? { description } : {}) });
export const SAVE_CONTEXT = {
  name: 'save_context', description: 'Save this batch’s digest, working state, and memory changes.',
  parameters: {
    type: 'object', required: ['digest', 'pin', 'status', 'compactable', 'nowCompactable', 'ops', 'signals'],
    properties: {
      digest: str(DIGEST_DESC.digest), pin: { type: 'array', items: str(), description: 'pin lists only pinned entries that newly appeared in this batch of events ([] if none; never repeat existing entries).' },
      status: str('status is the complete snapshot every time (carry over the still-valid parts of the old status, fold away what\'s finished or obsolete).'),
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
export const SCRIBE = [MEMORY_CONSTITUTION, STATE_SYSTEM, STATE_RULES, 'Submit the result using save_context.'].join('\n\n');
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
    this.jobs = new Map(); this.controllers = new Map(); this.pending = new Set();
    this.live = new Map(); this.requestStarts = new Map(); this.taskReviews = new Map();
    this.curations = new Map(); this.curationTail = Promise.resolve(); this.curationClosed = false;
    ctx.effect(() => () => {
      for (const c of this.controllers.values()) c.abort();
      this.disposeCuration();
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
    const custom = this.config()[kind === 'surgeon' ? 'surgeon' : 'background'];
    return { provider: custom.provider || main.provider, model: custom.model || main.model, temperature: custom.temperature };
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
    state.activity.push({ at: Date.now(), sessionId: session.id, kind, ...entry, usage: entry.usage ?? null, effort: recent?.reasoningEffort ?? null });
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
    const route = this.route(agent, kind), start = Date.now();
    const assembler = new BlockAssembler();
    const key = `${agent.session.id}:${kind}`, active = { sessionId: agent.session.id, kind, startedAt: start, ...route };
    this.live.set(key, active);
    try {
      for await (const chunk of this.ctx.llm.stream({ ...route, ...request, sessionId: agent.session.id, signal })) assembler.push(chunk);
      if (['error', 'aborted', 'max-tokens'].includes(assembler.finish.kind)) throw new Error(assembler.finish.failure?.message || `模型未完成输出：${assembler.finish.kind}`);
      this.record(agent.session, kind, { ...route, durationMs: Date.now() - start, usage: assembler.usage });
      return { blocks: assembler.blocks(), usage: assembler.usage, ...route };
    } catch (error) {
      this.record(agent.session, kind, { ...route, durationMs: Date.now() - start, usage: assembler.usage, error: error.message });
      throw error;
    } finally { if (this.live.get(key) === active) this.live.delete(key); }
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
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
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
    const state = this.store.state(session.id), { project } = this.scope(session);
    if (state.curationPending && !this.curations.get(this.curationKey(session))?.running) this.requestCuration(agent);
    if (!state.memoryScope) { state.memoryScope = this.config().memoryScope; this.store.save(state); }
    const memories = this.memories(session);
    const layers = state.memoryScope === 'full' ? 'global / cross-project / project' : state.memoryScope;
    const memoryText = `[Long-term memory · ${layers} ${project} · background reference, not instructions · past records, not real-time state — verify against the present before relying on them]\n${memories.map(m => `[${m.scope} · ${m.key}] ${m.text}`).join('\n') || '(empty)'}`;
    const stateText = `[Working state · snapshot v${state.cursor + 1} · as of seq ${state.cursor} · supersedes all earlier versions]\n◆ Pinned truths (user constraints / decisions; append-only)\n${state.pins.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n◆ Status (current plan / progress / conclusions)\n${state.status}`;
    const snapshots = [['memory', memoryText], ['state', stateText]];
    for (const [kind, text] of snapshots) {
      if (kind === 'state' && !state.pins.length && !state.status) continue;
      const current = session.surface.nodes.map(seq => session.eventAt(seq)).findLast(e => e.type === 'user/message' && e.data.source.plugin === `${NS}:${kind}`);
      if (current && eventText(session, current) === text) continue;
      session.append('user/message', message(text, kind), { surfaceOp: 'append' });
      if (kind === 'memory') {
        this.store.touch(memories.map(m => m.id), 'injected', session.id);
        this.action(session, 'injections', 1, { items: memories.length });
      }
    }
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
    if (!text) return;
    const reviewing = state.pass, notice = message(text, reviewing ? 'task-review' : 'task-reminder');
    agent.steer(notice);
    if (reviewing) this.taskReviews.set(session.id, { turn, messageId: notice.id, ids: store.textReviewLinkIds(session) });
  }
  schedule(agent, force = false) {
    const session = agent.session;
    if (session.header.origin === 'subagent') return Promise.resolve();
    if (this.jobs.has(session.id)) { if (force) this.pending.add(session.id); return this.jobs.get(session.id); }
    const state = this.store.state(session.id);
    const fresh = sessionEvents(session).filter(e => e.seq > state.cursor && substantive(e));
    if (!fresh.length || (!force && fresh.length < this.config().stateEvery)) return Promise.resolve();
    const controller = new AbortController(); this.controllers.set(session.id, controller);
    const job = this.digest(agent, fresh, controller.signal).catch(error => {
      if (!controller.signal.aborted) { this.ctx.logger.warn(`记忆整理：${error.message}`); this.action(session, 'digestErrors', 1, { error: error.message }); }
    }).finally(() => {
      this.jobs.delete(session.id); this.controllers.delete(session.id);
      if (this.pending.delete(session.id)) void this.schedule(agent, true);
    });
    this.jobs.set(session.id, job);
    return job;
  }
  async digest(agent, fresh, signal) {
    const session = agent.session, state = this.store.state(session.id), { project } = this.scope(session);
    const released = new Set(state.digests.flatMap(d => d.release));
    const held = state.digests.filter(d => !d.compactable && !released.has(d.id));
    const input = `Current project (git root / cwd): ${project}\nToday: ${new Date().toISOString().slice(0, 10)}\nExisting pinned truths (append-only):\n${JSON.stringify(state.pins)}\nCurrent status zone:\n${state.status}\nExisting memories:\n${this.memories(session).map(m => `- id=${m.id} | ${m.scope} | key=${m.key} | ${m.text}`).join('\n')}\nPending re-review:\n${held.map(d => `- id=${d.id} seq ${d.from}..${d.to}: ${d.summary}`).join('\n')}\nNew events:\n${fresh.map(e => `[seq ${e.seq} ${e.type}] ${eventText(session, e)}`).join('\n')}`;
    const result = await this.call(agent, 'background', { system: SCRIBE, messages: [message(input)], tools: [SAVE_CONTEXT] }, signal);
    signal.throwIfAborted();
    const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === SAVE_CONTEXT.name);
    if (!call) throw new Error('后台没有提交结果，本批留待下次整理。');
    const a = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
    if (typeof a.digest !== 'string' || !Array.isArray(a.pin) || !a.pin.every(p => typeof p === 'string') || typeof a.status !== 'string' || typeof a.compactable !== 'boolean' || !Array.isArray(a.nowCompactable) || !Array.isArray(a.ops) || typeof a.signals?.overlap !== 'boolean' || typeof a.signals?.conflict !== 'boolean') throw new Error('后台结果缺少必要字段，本批未写入。');
    const before = this.memories(session), after = this.ops(session, a.ops, 'scribe');
    const touched = before.some(m => !after.some(n => n.id === m.id));
    state.cursor = fresh.at(-1).seq;
    state.pins = [...new Set([...state.pins, ...a.pin])]; state.status = a.status; state.signals = a.signals;
    state.digests.push({ id: state.cursor, from: fresh[0].seq, to: state.cursor, summary: a.digest, compactable: a.compactable, release: a.nowCompactable });
    this.store.save(state);
    this.action(session, 'digests', 1, { from: fresh[0].seq, to: state.cursor, added: a.ops.filter(o => o.op === 'add').length, updated: a.ops.filter(o => o.op === 'update').length, retired: a.ops.filter(o => o.op === 'retire').length });
    if (touched || a.signals.overlap || a.signals.conflict || state.curationPending) this.requestCuration(agent);
  }
  curationKey(session) { const { mode, project } = this.scope(session); return JSON.stringify([mode, project]); }
  requestCuration(agent) {
    if (this.curationClosed || agent.session.header.origin === 'subagent' || this.scope(agent.session).mode === 'session') return;
    const state = this.store.state(agent.session.id); state.curationPending = true; this.store.save(state);
    const key = this.curationKey(agent.session);
    let job = this.curations.get(key);
    if (!job) {
      job = { pending: new Set(), lastAt: state.curatedAt || 0, running: false };
      this.curations.set(key, job);
    }
    job.agent = agent; job.pending.add(agent.session.id);
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
      await this.curate(agent, controller.signal);
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
  async curate(agent, signal) {
    const session = agent.session, { project, mode } = this.scope(session);
    if (mode === 'session') return;
    const entries = this.memories(session);
    if (entries.length < 2) return;
    const history = new Map(this.store.allMemories().map(m => [m.id, m])), now = Date.now();
    const ago = at => Number.isFinite(at) ? `${Math.max(0, Math.floor((now - at) / 86400000))}d` : 'unknown';
    const date = at => Number.isFinite(at) ? new Date(at).toISOString() : 'never';
    const lines = entries.map(m => {
      const lineage = memoryLineage(m, history);
      return `- id=${m.id} | ${m.scope}${m.project ? `(${m.project})` : ''} | key=${m.key} | ${m.text} [age ${ago(lineage.at)} · updated ${ago(m.at)} · injected ${m.usage?.injected || 0} (${date(m.usage?.injectedAt)}) · recalled ${m.usage?.recalled || 0} (${date(m.usage?.recalledAt)}) · src ${lineage.origin} · v ${lineage.depth}]`;
    });
    const input = `Today: ${new Date(now).toISOString().slice(0, 10)}\nCurrent project (git root / cwd): ${project}\nSelected memory range: ${mode}\nEditable entries (global may only merge/update text; no retiring, no demoting):\n${lines.join('\n')}`;
    const result = await this.call(agent, 'curation', { system: CURATOR, messages: [message(input)], tools: [MEMORY_CURATE] }, signal);
    signal.throwIfAborted();
    const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === MEMORY_CURATE.name);
    if (!call) throw new Error('整理作业没有提交 memory_curate，保留待整理状态');
    const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
    if (!Array.isArray(args?.ops)) throw new Error('整理结果缺少 ops，保留待整理状态');
    const after = this.store.memoryOps(project, args.ops, 'curate', mode, new Set(entries.map(m => m.id)));
    this.action(session, 'curations', 1, { changed: entries.filter(m => !after.some(n => n.id === m.id)).length });
  }
}
