import { randomUUID } from 'node:crypto';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { ProgramOutputs, programView } from './program.mjs';
import { emptyOptimization, addOptimization } from './accounting.mjs';
import { measureRequest, requestPricing } from '../metering/estimate.mjs';
import { EvidenceStore, hash } from './evidence.mjs';
import { reduceText, textOf, readIdentity, referenced, worthwhile, exactDelta, protectedTool } from './reducers.mjs';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { installRequestProjection } from '../llm-request-projection.mjs';
import { contentTokens } from '../context/materials.mjs';
import { hash as contentHash, frozenJsonValue } from './json-metrics.mjs';

const chars = content => content?.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0) ?? 0;
const estimate = value => contentTokens(Array.isArray(value) ? value : [typeof value === 'string' ? { type: 'text', text: value } : value]);
const eventKey = (session, callId) => session.id + ':' + callId;
const argumentsHash = args => { try { return hash(typeof args === 'string' ? JSON.parse(args) : args); } catch { return null; } };

export class ResultReduction {
  constructor(ctx, hub, managed) {
    this.ctx = ctx; this.hub = hub; this.managed = managed;
    this.evidence = new EvidenceStore(hub.store.dir);
    this.pending = new Map(); this.results = new Map(); this.writes = new Set(); this.metrics = new Map();
    this.visible = new Map();
    this.agentIds = new WeakMap(); this.agentSerial = 0;
    this.recallCalls = new Set(); this.discoveryCalls = new Set();
    this.computerCuts = new Map();
    this.cachedCharacters = 0; this.closed = false;
    this.readViews = new WeakMap();
    this.programs = new ProgramOutputs(); this.restored = new WeakSet(); this.requestViews = new WeakMap(); this.requestMessages = new WeakMap();
    this.decisions = new Map(); this.workMs = new Map(); this.processStartedAt = Date.now(); this.persistenceError = null;
  }
  enabled(session) { return !this.closed && this.hub.config().contextOptimizationEnabled !== false && this.managed(session); }
  state(session) {
    let state = this.metrics.get(session.id);
    if (!state) {
      try { state = structuredClone(this.hub.monitor?.optimizationSnapshot(session.id)); } catch (error) { this.persistenceError = error.message; }
      state ??= emptyOptimization(); this.metrics.set(session.id, state);
    }
    return state;
  }
  snapshot(session) {
    return { enabled: this.enabled(session), ...this.state(session), processStartedAt: this.processStartedAt,
      pendingDecisions: this.decisions.get(session.id) ?? {}, persistent: Boolean(this.hub.monitor) && !this.persistenceError,
      persistenceError: this.persistenceError, accounting: 'estimated-request-input; provider usage and cost remain in Monitor' };
  }
  decision(session, reason) {
    let decisions = this.decisions.get(session.id);
    if (!decisions) this.decisions.set(session.id, decisions = {});
    decisions[reason] = (decisions[reason] ?? 0) + 1;
  }
  record(session, row) {
    addOptimization(this.state(session), row);
    try { appendPluginRecord(session, 'plugin:oh-my-dsh/tool-optimization', row); }
    catch (error) { this.persistenceError = error.message; }
    this.indexRecord(session, row);
  }
  indexRecord(session, row) {
    if (this.hub.monitor && !this.hub.monitor.appendEvent({ id: row.id, sessionId: session.id, kind: 'toolOptimization',
      at: row.at, status: row.status, title: '工具上下文优化', savedTokens: row.status === 'success' ? row.estimatedNetTokens : null,
      inputTokens: row.beforeTokens, outputTokens: row.afterTokens, count: row.rules.length, data: row })) {
      this.persistenceError = this.hub.monitor.error || '工具优化记录尚未持久化';
    }
  }
  async restore(session, signal) {
    if (this.restored.has(session) || !this.enabled(session)) return;
    for (const event of session.snapshotEvents()) {
      if (event.type === 'plugin:oh-my-dsh/tool-optimization' && event.data?.sessionId === session.id && event.data?.version === 1) {
        this.indexRecord(session, event.data); continue;
      }
      if (event.type !== 'tool/ptc-dispatch' || event.data?.isError) continue;
      const { name, arguments: args, rootCallId } = event.data;
      if (name === 'tool_find') this.discoveryCalls.add(eventKey(session, rootCallId));
      if (name === 'recall' && (args?.rawRef || args?.search === 'evidence')) this.recallCalls.add(eventKey(session, rootCallId));
    }
    if (this.hub.monitor) {
      try { this.metrics.set(session.id, structuredClone(this.hub.monitor.optimizationSnapshot(session.id))); }
      catch (error) { this.persistenceError = error.message; }
    }
    const ancestors = await this.ancestors(session, signal);
    const records = await this.evidence.list(session, ancestors, signal);
    for (const record of records.slice(-2048)) {
      signal?.throwIfAborted();
      if (this.results.has(eventKey(session, record.callId)) || this.cachedCharacters + record.characters > 32 * 1024 * 1024) continue;
      const source = await this.evidence.text(record, signal);
      this.results.set(eventKey(session, record.callId), { record, source, callId: record.callId, name: record.tool,
        sessionId: session.id, committed: true, finalHash: record.contentHash, readKey: record.readKey, elapsedMs: 0 });
      this.cachedCharacters += source.length;
    }
    this.restored.add(session);
  }
  refsFor(session, seqs) {
    const refs = new Set();
    for (const seq of seqs) {
      const event = session.eventAt(seq), m = event?.type === 'tool/result' && event.data?.message;
      if (!m || m.isError) continue;
      const item = this.results.get(eventKey(session, m.toolCallId));
      if (item?.committed && item.finalHash === contentHash(m.content)) refs.add(item.record.ref);
    }
    return [...refs];
  }
  graphScope(agent) {
    if (!this.agentIds.has(agent)) this.agentIds.set(agent, ++this.agentSerial);
    const replacements = agent.session.snapshotEvents().filter(e => e.surfaceOp && e.surfaceOp !== 'append').map(e => e.seq);
    return JSON.stringify([agent.session.id, this.agentIds.get(agent), replacements]);
  }
  rememberVisible(session, messages) {
    if (this.closed) return;
    const calls = new Map(), visible = new Map();
    for (const message of messages) {
      if (message.role === 'assistant') for (const block of message.content) if (block.type === 'tool-call') calls.set(block.id, block.name);
      if (message.role === 'tool' && !message.isError && /^(?:computer_use|opencu_observe)$/.test(calls.get(message.toolCallId) ?? '')) visible.set(message.toolCallId, contentHash(message.content));
    }
    if (visible.size) this.visible.set(session.id, visible); else this.visible.delete(session.id);
  }
  computerBaseline(session) {
    if (!this.enabled(session) || this.hub.bc?.view(session)?.backend === 'bc') return false;
    const visible = this.visible.get(session.id);
    if (!visible) return false;
    const events = session.snapshotEvents(), cut = this.computerCuts.get(session.id) ?? 0;
    const calls = new Map(events.filter(e => e.type === 'tool/call').map(e => [e.data?.callId, e.data?.name]));
    let found = false;
    for (const event of events.slice(cut)) {
      if (event.surfaceOp && event.surfaceOp !== 'append') return false;
      if (event.type !== 'tool/result') continue;
      const m = event.data?.message;
      if (!/^(?:computer_use|opencu_observe)$/.test(calls.get(m?.toolCallId) ?? '')) continue;
      found = true;
      if (m.isError || visible.get(m.toolCallId) !== contentHash(m.content)) return false;
    }
    return found;
  }
  resetComputerBaseline(session) { this.computerCuts.set(session.id, session.snapshotEvents().length); }
  release(id) {
    if (id === undefined) this.closed = true;
    this.programs.release(id);
    if (id !== undefined) this.restored.delete(this.ctx.sessions.get(id));
    if (id === undefined) { this.decisions.clear(); this.workMs.clear(); } else { this.decisions.delete(id); this.workMs.delete(id); }
    const owns = item => id === undefined || item.sessionId === id;
    // A prepared reference may already be on its way to the native log. Keep
    // its write-ahead metadata so a later read can finish the durable commit.
    for (const [token, item] of this.pending) if (owns(item)) this.pending.delete(token);
    for (const [key, item] of this.results) if (owns(item)) { this.cachedCharacters -= item.source.length; this.results.delete(key); }
    for (const calls of [this.recallCalls, this.discoveryCalls]) for (const key of calls) if (id === undefined || key.startsWith(id + ':')) calls.delete(key);
    if (id === undefined) { this.visible.clear(); this.computerCuts.clear(); this.metrics.clear(); this.catalogPlans?.clear(); this.readViews = new WeakMap(); this.restored = new WeakSet(); }
    else {
      this.visible.delete(id); this.computerCuts.delete(id);
      // Persisted request history is independent of the disposed execution.
    }
  }
  track(promise) { this.writes.add(promise); promise.catch(error => this.ctx.logger?.warn?.('上下文优化保留原结果：' + error.message)).finally(() => this.writes.delete(promise)); return promise; }
  async settled() { await Promise.allSettled([...this.writes]); }
  async ancestors(session, signal) {
    const ids = [], seen = new Set([session.id]); let current = session;
    while (current.header?.parentSession && current.header.origin !== 'subagent' && ids.length < 64) {
      signal?.throwIfAborted();
      const id = current.header.parentSession;
      if (seen.has(id)) break;
      seen.add(id); ids.push(id);
      const live = this.ctx.sessions.get(id);
      if (live) current = live;
      else { try { const snapshot = await this.hub.dream.sources.read(id, signal); current = { header: snapshot.header }; } catch { signal?.throwIfAborted(); break; } }
    }
    signal?.throwIfAborted();
    return ids;
  }
  async target(session, sessionId, signal) {
    if (!sessionId || sessionId === session.id) return session;
    const snapshot = await this.hub.dream.sources.read(sessionId, signal);
    return { id: sessionId, header: snapshot.header, inheritedEventCount: snapshot.inherited, snapshotEvents: () => snapshot.events };
  }
  async recall(session, args, signal) {
    await this.settled(); signal?.throwIfAborted();
    if (['memory', 'reference', 'id', 'asset', 'from', 'to'].some(key => args[key] !== undefined)) throw Error('原文引用不能与其他回查目标混用');
    const target = await this.target(session, args.sessionId, signal), ancestors = await this.ancestors(target, signal);
    const result = args.rawRef ? await this.evidence.read(target, args, ancestors, signal) : await this.evidence.search(target, args, ancestors, signal);
    return result;
  }
  async archive(exec, text, rule, complete = true, readKey) {
    const started = performance.now();
    if (this.closed) throw Error('上下文优化已停止');
    exec.signal?.throwIfAborted();
    const record = await this.evidence.save({ sessionId: exec.agent.session.id, callId: exec.callId, tool: exec.name, args: exec.arguments, text, rule, complete, readKey });
    if (exec.signal?.aborted || this.closed) { await this.evidence.abandon(record.ref); exec.signal?.throwIfAborted(); throw Error('上下文优化已停止'); }
    this.pending.set(exec.token, { record, sessionId: exec.agent.session.id, name: exec.name, callId: exec.callId, source: text, started });
    return record;
  }
  async finish(exec, value) {
    if (this.closed) throw Error('上下文优化已停止');
    const content = [{ type: 'text', text: value }], item = this.pending.get(exec.token);
    if (item) { item.proposed = content; item.record = await this.evidence.prepare(item.record.ref, content); }
    return value;
  }
  async post(exec, result, decision) {
    const program = exec.name === 'run_code' && !exec.parent ? this.programs.take(exec) : undefined;
    if (!exec.agent || !this.managed(exec.agent.session)) return decision;
    const session = exec.agent.session;
    if (exec.parent) return decision; // Canonical values and intermediate program content are owned by the host.
    const retain = reason => { this.decision(session, reason); return decision; };
    if (!this.enabled(session)) return retain('disabled');
    if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value') || result.isError || exec.signal.aborted) return retain('protected');
    if (this.pending.has(exec.token)) return decision;
    if (protectedTool(exec.name) || program?.blocked) return retain('protected');
    if (this.ctx.tools.get(exec.name, exec.agent)?.finalizeContent) return retain('owner-finalized');
    const content = decision.content ?? result.content, text = textOf(content);
    if (text === null || text.length < 768 || text.length > 32 * 1024 * 1024 || /^ops_/.test(exec.name)) return retain('ineligible');
    const output = { ...result, content };
    const programOutput = exec.name === 'run_code' ? programView(exec, output, program) : null;
    const readKey = programOutput?.readKey ?? readIdentity(exec, output);
    const view = programOutput?.view ?? (readKey ? null : reduceText(exec, output, text));
    const shortenedCandidate = view && worthwhile(text, view.text + ' '.repeat(300));
    if (!readKey && !shortenedCandidate) return retain(view ? 'no-benefit' : 'ineligible');
    const record = await this.archive(exec, text, shortenedCandidate ? view.rule : 'read-baseline', true, readKey);
    const item = this.pending.get(exec.token); item.readKey = readKey;
    const shortened = shortenedCandidate ? referenced(view, record) : text;
    if (shortened === text || !worthwhile(text, shortened)) {
      item.proposed = content; item.record = await this.evidence.prepare(record.ref, content);
      return retain('baseline');
    }
    item.proposed = [{ type: 'text', text: shortened }];
    item.record = await this.evidence.prepare(record.ref, item.proposed);
    this.decision(session, 'reduced');
    return { ...decision, content: item.proposed };
  }
  result(exec, result) {
    if (this.closed || !exec.agent || !this.managed(exec.agent.session)) return;
    this.programs.observe(exec, result);
    if (exec.name === 'run_code' && !exec.parent && exec.agent) this.programs.take(exec);
    if (exec.agent && exec.name === 'recall' && (exec.arguments?.rawRef || exec.arguments?.search === 'evidence') && !result.isError) this.recallCalls.add(eventKey(exec.agent.session, exec.rootCallId ?? exec.callId));
    if (exec.agent && exec.name === 'tool_find' && !result.isError) this.discoveryCalls.add(eventKey(exec.agent.session, exec.rootCallId ?? exec.callId));
    const item = this.pending.get(exec.token); this.pending.delete(exec.token);
    if (!item) return;
    if (result.isError || exec.signal.aborted || item.proposed && hash(item.proposed) !== hash(result.content)) { this.track(this.evidence.abandon(item.record.ref)); return; }
    item.finalHash = hash(result.content); item.afterChars = chars(result.content);
    item.elapsedMs = Math.round(performance.now() - item.started);
    this.results.set(eventKey(exec.agent.session, exec.callId), item);
    this.cachedCharacters += item.source.length;
    while (this.results.size > 2048 || this.cachedCharacters > 32 * 1024 * 1024) {
      const key = this.results.keys().next().value;
      this.cachedCharacters -= this.results.get(key).source.length; this.results.delete(key);
    }
  }
  event(session, event) {
    if (!['tool/result', 'tool/ptc-dispatch'].includes(event.type)) return;
    const m = event.type === 'tool/result' ? event.data?.message : { toolCallId: event.data?.subCallId, content: event.data?.content };
    const item = this.results.get(eventKey(session, m?.toolCallId));
    if (!item || hash(m.content) !== item.finalHash) return;
    this.track(this.evidence.commit(item.record.ref, event).then(committed => { item.committed = committed; }));
  }
  // Only reduce against a complete earlier result in THIS request. Nothing is
  // inferred from a previous call, connection, cache, argument or user marker.
  project(options) {
    if (!isAgentLoopRequest(options)) return options;
    if (this.requestViews.has(options)) return options;
    const started = performance.now();
    const session = options.sessionId && this.ctx.sessions.get(options.sessionId);
    if (!session || !this.enabled(session)) return options;
    const dependent = this.hub.bc?.view(session)?.backend !== 'bc';
    const calls = new Map(), baselines = new Map(), images = new Map(), rules = [], messages = [];
    let changed = false; const originals = [];
    for (const message of options.messages) {
      if (message.role === 'assistant') for (const block of message.content) if (block.type === 'tool-call') calls.set(block.id, block);
      const item = message.role === 'tool' && this.results.get(eventKey(session, message.toolCallId));
      let next = message, original = message;
      if (item?.committed && !message.isError && item.finalHash === contentHash(message.content)) {
        const call = calls.get(message.toolCallId);
        if (call?.name === item.name && argumentsHash(call.arguments) === item.record.argumentsHash) {
          original = { ...message, content: [{ type: 'text', text: item.source }] };
          if (item.readKey && dependent) {
            const baseline = baselines.get(item.readKey);
            if (baseline) {
              const key = JSON.stringify([item.record.ref, item.record.sourceHash, baseline.record.ref, baseline.record.sourceHash, baseline.callId]);
              const immutable = frozenJsonValue(message), cached = immutable && this.readViews.get(message);
              if (cached?.key === key) next = cached.message;
              else {
                const same = baseline.source === item.source;
                const text = same ? 'Unchanged output: the complete earlier output is still present in this request.'
                  : 'Exact unified delta against the complete earlier output in this request:\n' + exactDelta(baseline.source, item.source);
                const view = referenced({ text: `Baseline toolCallId=${baseline.callId}\n${text}`, lossless: true }, item.record);
                if (worthwhile(item.source, view)) next = freezeMessage({ ...message, content: [{ type: 'text', text: view }] });
                if (immutable) this.readViews.set(message, { key, message: next });
              }
              if (next !== message) changed = true;
            } else if (textOf(message.content) === item.source) baselines.set(item.readKey, item);
          }
          item.sourceTokens ??= estimate([{ type: 'text', text: item.source }]);
          const saved = Math.max(0, item.sourceTokens - estimate(next.content));
          if (saved) rules.push({ rule: next !== message ? (item.source === baselines.get(item.readKey)?.source ? 'visible-read-repeat' : 'visible-read-delta') : item.record.rule, saved, elapsedMs: item.elapsedMs });
        }
      }
      if (dependent && !message.isError) {
        const content = next.content.map(block => {
          if (block.type !== 'image' || block.offloaded || !block.attachment?.attachmentId) return block;
          const a = block.attachment;
          const identity = hash([a.attachmentId, a.mediaType, a.bytes, a.width, a.height, a.originalDimensions ?? null, block.detail ?? null]);
          const previous = images.get(identity);
          if (!previous) { images.set(identity, message.toolCallId ?? message.id ?? `request-message-${messages.length + 1}`); return block; }
          changed = true;
          return { type: 'text', text: `[Exact same immutable image as earlier message/toolCallId=${previous} in this request. Current attachment=${JSON.stringify(a)}. Current observation text still applies; the original attachment remains available.]` };
        });
        if (content.some((b, i) => b !== next.content[i])) { next = freezeMessage({ ...next, content }); rules.push({ rule: 'visible-identical-screenshot', saved: 0, elapsedMs: 0, images: content.filter((b,i)=>b!==message.content[i] && message.content[i]?.type==='image').length }); }
      }
      originals.push(original);
      messages.push(next);
    }
    const projected = changed ? markAgentLoopRequest(Object.freeze({ ...options, messages: Object.freeze(messages) })) : options;
    let before = { ...options, messages: originals };
    for (const plan of this.catalogPlans?.values() ?? []) {
      const system = [typeof options.system === 'string' ? options.system : '', ...options.messages.filter(m=>m.role==='system').map(m=>textOf(m.content) ?? '')].join('\n');
      if (!system.includes(plan.notice) || (plan.sdk ? !system.includes(plan.sdk) : hash(options.tools ?? []) !== hash(plan.tools))) continue;
      const restore = text => (plan.sdk ? text.replace(plan.sdk, plan.fullSdk) : text).replace(plan.notice, '');
      before = { ...before, ...(typeof before.system === 'string' ? { system: restore(before.system) } : {}),
        tools: plan.fullTools ?? before.tools,
        messages: before.messages.map(m=>m.role==='system' ? { ...m, content: m.content.map(b=>b.type==='text' ? { ...b, text: restore(b.text) } : b) } : m) };
      rules.push({ rule: 'scoped-tool-discovery', saved: Math.max(0, measureRequest(before).tokens - measureRequest({ ...options, messages: originals }).tokens), images: 0 });
      break;
    }
    const pricing = requestPricing(this.ctx.llm, options), grouped = new Map();
    for (const rule of rules) {
      const entry = grouped.get(rule.rule) ?? { rule: rule.rule, saved: 0, images: 0 };
      entry.saved += rule.saved ?? 0; entry.images += rule.images ?? 0; grouped.set(rule.rule, entry);
    }
    const view = { rules: [...grouped.values()], beforeTokens: measureRequest(before, pricing).tokens,
      afterTokens: measureRequest(projected, pricing).tokens, processingMs: performance.now() - started,
      header: contentHash([projected.system ?? null, projected.tools ?? []]) };
    this.requestViews.set(projected, view); this.requestMessages.set(projected.messages, view);
    return projected;
  }
  limit(session, requested = 12000, text) {
    const maximum=Math.max(256,Math.min(48000,requested));
    if(typeof text!=='string')return maximum;
    let available;
    try { available=this.hub.context?.adapter.catalogBudget?.(session); } catch { /* No current model capacity. */ }
    if(!Number.isFinite(available))return maximum;
    let low=0,high=Math.min(maximum,text.length);
    while(low<high){const mid=Math.ceil((low+high)/2);if(estimate([{type:'text',text:text.slice(0,mid)}])<=available)low=mid;else high=mid-1;}
    if(low>0&&/[\uD800-\uDBFF]/.test(text[low-1]))low--;
    return low;
  }
}

export function installResultReduction(ctx, hub, managed) {
  const service = hub.optimization = new ResultReduction(ctx, hub, managed);
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next(), started = performance.now();
    try { return await service.post(exec, result, decision); }
    catch (error) {
      const pending = service.pending.get(exec.token); service.pending.delete(exec.token);
      if (pending) service.track(service.evidence.abandon(pending.record.ref));
      if (exec.agent) service.decision(exec.agent.session, 'fallback');
      ctx.logger?.warn?.('上下文优化回退：' + error.message); return decision;
    } finally {
      if (exec.agent && !exec.parent && managed(exec.agent.session)) service.workMs.set(exec.agent.session.id, (service.workMs.get(exec.agent.session.id) ?? 0) + performance.now() - started);
    }
  }, { global: true });
  ctx.on('tools/result', (exec, result) => { service.result(exec, result); }, { global: true });
  ctx.on('session/event', (session, event) => { service.event(session, event); }, { global: true });
  ctx.on('agent/disposed', ({ agent }) => service.release(agent.session.id), { global: true });
  ctx.on('session/disposed', session => service.release(session.id), { global: true });
  installRequestProjection(ctx, options => {
    try { return service.project(options); }
    catch (error) { const session = options.sessionId && ctx.sessions.get(options.sessionId); if (session) service.decision(session, 'fallback'); ctx.logger?.warn?.('上下文请求优化回退：' + error.message); return options; }
  });
  ctx.on('agent/pre-step', async (event, next) => {
    const session = event?.agent?.session;
    if (session && managed(session)) {
      try { await service.restore(session, event.signal); }
      catch (error) { if (event.signal?.aborted) throw error; service.decision(session, 'fallback'); ctx.logger?.warn?.('工具原文恢复失败，保留完整结果：' + error.message); }
    }
    return next();
  }, { global: true });
  ctx.on('llm/stream', async function* (options, next) {
    const session = isAgentLoopRequest(options) && options.sessionId && ctx.sessions.get(options.sessionId);
    if (!session || !managed(session)) { yield* next(); return; }
    let view = service.requestViews.get(options) ?? service.requestMessages.get(options.messages);
    if (view && view.header !== contentHash([options.system ?? null, options.tools ?? []])) { service.decision(session, 'projection-changed'); view = null; }
    const pricing = requestPricing(ctx.llm, options);
    const used = view?.afterTokens ?? measureRequest(options, pricing).tokens;
    const row = { version: 1, sessionId: session.id, id: 'tool-optimization:' + randomUUID(), at: Date.now(), revision: session.seq, status: 'error',
      provider: options.provider, model: options.model,
      beforeTokens: view?.beforeTokens ?? used, afterTokens: used, estimatedSavedTokens: 0, estimatedNetTokens: 0,
      recallTokens: 0, discoveryTokens: 0, processingMs: (view?.processingMs ?? 0) + (service.workMs.get(session.id) ?? 0),
      rules: view?.rules ?? [], decisions: service.decisions.get(session.id) ?? {}, estimated: true };
    service.decisions.delete(session.id); service.workMs.delete(session.id);
    if (!service.enabled(session)) row.decisions = { ...row.decisions, disabled: 1 };
    const overhead = new Map();
    for (const message of options.messages) {
      if (message.role === 'assistant') for (const block of message.content) if (block.type === 'tool-call') {
        let args; try { args = typeof block.arguments === 'string' ? JSON.parse(block.arguments) : block.arguments; } catch {}
        const key = eventKey(session, block.id), kind = (block.name === 'recall' && (args?.rawRef || args?.search === 'evidence')) || service.recallCalls.has(key) ? 'recallTokens'
          : block.name === 'tool_find' || service.discoveryCalls.has(key) ? 'discoveryTokens' : null;
        if (kind) { overhead.set(block.id, kind); row[kind] += estimate(block); }
      }
      if (message.role === 'tool' && overhead.has(message.toolCallId)) row[overhead.get(message.toolCallId)] += estimate(message.content);
    }
    row.estimatedSavedTokens = row.beforeTokens - row.afterTokens;
    row.estimatedNetTokens = row.estimatedSavedTokens - row.recallTokens - row.discoveryTokens;
    if (!row.rules.length && !Object.keys(row.decisions).length) row.decisions['not-triggered'] = 1;
    service.visible.delete(session.id);
    try {
      for await (const frame of next()) {
        if (frame.type === 'finish') row.status = ['aborted', 'abort'].includes(frame.reason?.kind) ? 'cancelled' : frame.reason?.kind === 'error' ? 'error' : 'success';
        yield frame;
      }
    } finally {
      if (options.signal?.aborted) row.status = 'cancelled';
      service.record(session, row);
      if (row.status === 'success') service.rememberVisible(session, options.messages);
    }
  }, { global: true });
  ctx.effect(() => () => { service.release(); return service.settled(); });
  return service;
}
