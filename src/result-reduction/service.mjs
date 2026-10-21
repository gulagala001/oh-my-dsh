import { EvidenceStore, hash } from './evidence.mjs';
import { reduceText, textOf, readIdentity, referenced, worthwhile, exactDelta } from './reducers.mjs';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { installRequestProjection } from '../llm-request-projection.mjs';
import { contentTokens } from '../context/materials.mjs';

const chars = content => content?.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0) ?? 0;
const estimate = value => Math.ceil(Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)) / 3);
const eventKey = (session, callId) => session.id + ':' + callId;
const argumentsHash = args => { try { return hash(typeof args === 'string' ? JSON.parse(args) : args); } catch { return null; } };
const media = blocks => (blocks ?? []).flatMap(b => ['image', 'file'].includes(b.type) ? [b] : b.type === 'tool-result' ? media(b.content) : []);

export class ResultReduction {
  constructor(ctx, hub, managed) {
    this.ctx = ctx; this.hub = hub; this.managed = managed;
    this.evidence = new EvidenceStore(hub.store.dir);
    this.pending = new Map(); this.results = new Map(); this.writes = new Set(); this.metrics = new Map(); this.projections = new WeakMap();
    this.visible = new Map();
    this.agentIds = new WeakMap(); this.agentSerial = 0;
    this.recallCalls = new Set(); this.discoveryCalls = new Set(); this.schemaSavings = new Map();
    this.computerCuts = new Map();
    this.cachedCharacters = 0;
  }
  enabled(session) { return this.hub.config().contextOptimizationEnabled !== false && this.managed(session); }
  state(session) {
    let state = this.metrics.get(session.id);
    if (!state) { state = { requests: 0, estimatedSavedTokens: 0, recallTokens: 0, discoveryTokens: 0, fallbacks: 0, rules: {}, lastRequest: null }; this.metrics.set(session.id, state); }
    return state;
  }
  snapshot(session) { return { enabled: this.enabled(session), ...this.state(session), accounting: 'estimated-request-tokens; actual provider usage remains in Monitor' }; }
  refsFor(session, seqs) {
    const refs = new Set();
    for (const seq of seqs) {
      const event = session.eventAt(seq), m = event?.type === 'tool/result' && event.data?.message;
      if (!m || m.isError) continue;
      const item = this.results.get(eventKey(session, m.toolCallId));
      if (item?.committed && item.finalHash === hash(m.content)) refs.add(item.record.ref);
    }
    return [...refs];
  }
  graphScope(agent) {
    if (!this.agentIds.has(agent)) this.agentIds.set(agent, ++this.agentSerial);
    const replacements = agent.session.snapshotEvents().filter(e => e.surfaceOp && e.surfaceOp !== 'append').map(e => e.seq);
    return JSON.stringify([agent.session.id, this.agentIds.get(agent), replacements]);
  }
  computerBaseline(session) {
    if (!this.enabled(session) || this.hub.bc?.view(session)?.backend === 'bc') return false;
    const visible = this.visible.get(session.id);
    if (!visible) return false;
    const events = session.snapshotEvents(), cut = this.computerCuts.get(session.id) ?? 0;
    let found = false;
    for (const event of events.slice(cut)) {
      if (event.surfaceOp && event.surfaceOp !== 'append') return false;
      if (event.type !== 'tool/result') continue;
      const m = event.data?.message;
      const call = events.find(e => e.type === 'tool/call' && e.data?.callId === m?.toolCallId);
      if (!/^(?:computer_use|opencu_observe)$/.test(call?.data?.name ?? '')) continue;
      found = true;
      if (m.isError || !visible.some(v => v.role === 'tool' && v.toolCallId === m.toolCallId && hash(v.content) === hash(m.content))) return false;
    }
    return found;
  }
  resetComputerBaseline(session) { this.computerCuts.set(session.id, session.snapshotEvents().length); }
  track(promise) { this.writes.add(promise); promise.catch(error => this.ctx.logger?.warn?.('上下文优化保留原结果：' + error.message)).finally(() => this.writes.delete(promise)); return promise; }
  async settled() { await Promise.allSettled([...this.writes]); }
  async ancestors(session) {
    const ids = [], seen = new Set([session.id]); let current = session;
    while (current.header?.parentSession && current.header.origin !== 'subagent' && ids.length < 64) {
      const id = current.header.parentSession;
      if (seen.has(id)) break;
      seen.add(id); ids.push(id);
      const live = this.ctx.sessions.get(id);
      if (live) current = live;
      else { try { const snapshot = await this.hub.dream.sources.read(id); current = { header: snapshot.header }; } catch { break; } }
    }
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
    const target = await this.target(session, args.sessionId, signal), ancestors = await this.ancestors(target);
    const result = args.rawRef ? await this.evidence.read(target, args, ancestors, signal) : await this.evidence.search(target, args, ancestors, signal);
    return result;
  }
  async archive(exec, text, rule, complete = true) {
    const started = performance.now();
    exec.signal?.throwIfAborted();
    const record = await this.evidence.save({ sessionId: exec.agent.session.id, callId: exec.callId, tool: exec.name, args: exec.arguments, text, rule, complete });
    if (exec.signal?.aborted) { await this.evidence.abandon(record.ref); exec.signal.throwIfAborted(); }
    this.pending.set(exec.token, { record, exec, source: text, started });
    return record;
  }
  async finish(exec, value) {
    const content = [{ type: 'text', text: value }], item = this.pending.get(exec.token);
    if (item) { item.proposed = content; item.record = await this.evidence.prepare(item.record.ref, content); }
    return value;
  }
  async post(exec, result, decision) {
    if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value') || !exec.agent || !this.enabled(exec.agent.session) || exec.parent || result.isError || exec.signal.aborted || this.pending.has(exec.token)) return decision;
    if (this.ctx.tools.get(exec.name, exec.agent)?.finalizeContent) return decision;
    const content = decision.content ?? result.content, text = textOf(content);
    if (text === null || text.length < 768 || text.length > 32 * 1024 * 1024 || /^ops_/.test(exec.name)) return decision;
    const readKey = readIdentity(exec, { ...result, content });
    const view = readKey ? null : reduceText(exec, result, text);
    if (!readKey && (!view || !worthwhile(text, view.text + ' '.repeat(300)))) return decision;
    const record = await this.archive(exec, text, view?.rule ?? 'read-baseline');
    const item = this.pending.get(exec.token); item.readKey = readKey;
    if (!view) { item.proposed = content; item.record = await this.evidence.prepare(record.ref, content); return decision; }
    const shortened = referenced(view, record);
    if (!worthwhile(text, shortened)) { await this.evidence.abandon(record.ref); this.pending.delete(exec.token); return decision; }
    item.proposed = [{ type: 'text', text: shortened }];
    item.record = await this.evidence.prepare(record.ref, item.proposed);
    return { ...decision, content: item.proposed };
  }
  result(exec, result) {
    if (exec.agent && exec.name === 'recall' && !result.isError) this.recallCalls.add(eventKey(exec.agent.session, exec.rootCallId ?? exec.callId));
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
    const session = options.sessionId && this.ctx.sessions.get(options.sessionId);
    if (!session || !this.enabled(session)) return options;
    const dependent = this.hub.bc?.view(session)?.backend !== 'bc';
    const calls = new Map(), baselines = new Map(), images = new Map(), rules = [], messages = [];
    let changed = false;
    for (const message of options.messages) {
      if (message.role === 'assistant') for (const block of message.content) if (block.type === 'tool-call') calls.set(block.id, block);
      const item = message.role === 'tool' && this.results.get(eventKey(session, message.toolCallId));
      let next = message;
      if (item?.committed && !message.isError && item.finalHash === hash(message.content)) {
        const call = calls.get(message.toolCallId);
        if (call?.name === item.exec.name && argumentsHash(call.arguments) === item.record.argumentsHash) {
          if (item.readKey && dependent) {
            const baseline = baselines.get(item.readKey);
            if (baseline) {
              const same = baseline.source === item.source;
              const text = same ? 'Unchanged read window: the complete earlier read is still present in this request.'
                : 'Exact unified delta against the complete earlier read in this request:\n' + exactDelta(baseline.source, item.source);
              const view = referenced({ text: `Baseline toolCallId=${baseline.exec.callId}\n${text}`, lossless: true }, item.record);
              if (worthwhile(item.source, view)) { next = freezeMessage({ ...message, content: [{ type: 'text', text: view }] }); changed = true; }
            } else baselines.set(item.readKey, item);
          }
          const saved = Math.max(0, estimate([{ type: 'text', text: item.source }]) - estimate(next.content));
          if (saved) rules.push({ rule: next !== message ? (item.source === baselines.get(item.readKey)?.source ? 'visible-read-repeat' : 'visible-read-delta') : item.record.rule, saved, elapsedMs: item.elapsedMs });
        }
      }
      const call = message.role === 'tool' && calls.get(message.toolCallId);
      if (dependent && !message.isError && /^(?:computer_use|opencu_observe)$/.test(call?.name ?? '')) {
        const content = next.content.map(block => {
          if (block.type !== 'image' || block.offloaded || !block.attachment?.attachmentId) return block;
          const a = block.attachment;
          const identity = hash([a.attachmentId, a.mediaType, a.bytes, a.width, a.height, a.originalDimensions ?? null, block.detail ?? null]);
          const previous = images.get(identity);
          if (!previous) { images.set(identity, message.toolCallId); return block; }
          changed = true;
          return { type: 'text', text: `[Exact same immutable screenshot as earlier toolCallId=${previous} in this request. Current attachment=${JSON.stringify(a)}. Fresh observation metadata above still applies; original image remains in this tool's archived event.]` };
        });
        if (content.some((b, i) => b !== next.content[i])) { next = freezeMessage({ ...next, content }); rules.push({ rule: 'visible-identical-screenshot', saved: 0, elapsedMs: 0, images: 1 }); }
      }
      messages.push(next);
    }
    const projected = changed ? markAgentLoopRequest(Object.freeze({ ...options, messages: Object.freeze(messages) })) : options;
    this.projections.set(projected.messages, rules);
    return projected;
  }
  limit(session, requested = 12000) {
    const budget = this.state(session).lastRequest;
    const remaining = budget?.capacity ? Math.max(768, (budget.capacity - budget.used - budget.reserved) * 2) : 12000;
    return Math.max(256, Math.min(48000, requested, remaining));
  }
}

export function installResultReduction(ctx, hub, managed) {
  const service = hub.optimization = new ResultReduction(ctx, hub, managed);
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try { return await service.post(exec, result, decision); }
    catch (error) {
      const pending = service.pending.get(exec.token); service.pending.delete(exec.token);
      if (pending) service.track(service.evidence.abandon(pending.record.ref));
      if (exec.agent) service.state(exec.agent.session).fallbacks++;
      ctx.logger?.warn?.('上下文优化回退：' + error.message); return decision;
    }
  }, { global: true });
  ctx.on('tools/result', (exec, result) => { service.result(exec, result); }, { global: true });
  ctx.on('session/event', (session, event) => { service.event(session, event); }, { global: true });
  installRequestProjection(ctx, options => {
    try { return service.project(options); }
    catch (error) { ctx.logger?.warn?.('上下文请求优化回退：' + error.message); return options; }
  });
  ctx.on('llm/stream', async function* (options, next) {
    const session = isAgentLoopRequest(options) && options.sessionId && ctx.sessions.get(options.sessionId);
    if (!session || !managed(session)) { yield* next(); return; }
    const state = service.state(session), rules = [...(service.projections.get(options.messages) ?? [])];
    const schemaSaved = service.schemaSavings.get(hash(options.tools ?? []));
    if (service.enabled(session) && schemaSaved > 0) rules.push({ rule: 'scoped-tool-discovery', saved: schemaSaved, elapsedMs: 0 });
    let used = estimate({ messages: options.messages, tools: options.tools, system: options.system });
    try {
      used += contentTokens(options.messages.flatMap(m => media(m.content)), { imagePricing: ctx.llm.imageRequestPricing?.(options.provider, options.model), fileText: ctx.llm.fileRequestText ? ref => ctx.llm.fileRequestText(ref) : undefined });
      used = Math.max(used, ctx.tokenMeter?.measure(session)?.totalTokens ?? 0);
    } catch { /* Host preflight remains authoritative for unsupported media. */ }
    let info;
    try { info = await ctx.llm.resolveModelInfo(options.provider, options.model, options.signal); } catch { /* The host reports route errors. */ }
    state.lastRequest = { used, capacity: info?.context?.contextWindow ?? null, reserved: (options.maxTokens ?? info?.defaultMaxTokens ?? 0) + Math.ceil(used * .1), estimated: true };
    let succeeded = false;
    service.visible.delete(session.id);
    for await (const frame of next()) { if (frame.type === 'finish') succeeded = !['error', 'aborted', 'abort'].includes(frame.reason?.kind); yield frame; }
    if (succeeded && !options.signal?.aborted) {
      state.requests++;
      const overhead = new Map();
      for (const message of options.messages) {
        if (message.role === 'assistant') for (const block of message.content) if (block.type === 'tool-call') {
          const key = eventKey(session, block.id), kind = block.name === 'recall' || service.recallCalls.has(key) ? 'recallTokens'
            : block.name === 'tool_find' || service.discoveryCalls.has(key) ? 'discoveryTokens' : null;
          if (kind) { overhead.set(block.id, kind); state[kind] += estimate(block); }
        }
        if (message.role === 'tool' && overhead.has(message.toolCallId)) state[overhead.get(message.toolCallId)] += estimate(message.content);
      }
      for (const rule of rules) { state.estimatedSavedTokens += rule.saved; const row = state.rules[rule.rule] ??= { requests: 0, savedTokens: 0, elapsedMs: 0, images: 0 }; row.requests++; row.savedTokens += rule.saved; row.elapsedMs += rule.elapsedMs; row.images += rule.images ?? 0; }
      service.visible.set(session.id, options.messages);
    }
  }, { global: true });
  ctx.effect(() => () => { service.pending.clear(); service.results.clear(); service.visible.clear(); });
  return service;
}
