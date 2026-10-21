import { AsyncLocalStorage } from 'node:async_hooks';
import { isAgentLoopRequest, markAgentLoopRequest, freezeMessage } from '@deepseek-ai/dsh-llm';
import { installRequestProjection } from '../llm-request-projection.mjs';
import { latestTaskContext } from '../task-context.mjs';
import { sourceName } from '../message-source.mjs';
import { isBtwSession } from '../btw-policy.mjs';
import { hash, activeRecords, liveSpan } from './core.mjs';
import { BC_VERSION, BC_TOOL_NAMES, BC_EXCLUSIVE_TOOLS } from './bc-policy.mjs';

export { BC_VERSION } from './bc-policy.mjs';
export const BC_TOOLS = new Set(BC_TOOL_NAMES);
const exclusiveTools = new Set(BC_EXCLUSIVE_TOOLS);
export const BC_STATE = Symbol.for('billion-context.native-intercept-state');
const traffic = new AsyncLocalStorage();
const hooks = new WeakMap();
const checkpointSources = new Set(['oh-my-dsh:dream-memory', 'oh-my-dsh:manual-global', 'oh-my-dsh:project-catalog', 'oh-my-dsh:trace']);
const jsonHeaders = { 'content-type': 'application/json' };
async function ready(promise, signal) {
  const joined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
  joined.throwIfAborted();
  let aborted;
  try { return await Promise.race([promise, new Promise((_, reject) => { aborted = () => reject(joined.reason); joined.addEventListener('abort', aborted, { once: true }); })]); }
  finally { joined.removeEventListener('abort', aborted); }
}

// The native BC adapter already shares this live slot between fetch and WS.
// Scope changes are request-local; unrelated presets retain BC's original hooks.
export function attachBcTransport(state) {
  if (!state || typeof state.headersFor !== 'function' || typeof state.takeoverGate !== 'function') return false;
  let owned = hooks.get(state);
  if (owned && state.headersFor === owned.headersFor && state.takeoverGate === owned.takeoverGate && state.beforeSend === owned.beforeSend && state.prepareDirectSend === owned.prepareDirectSend) return true;
  owned?.restore();
  const original = { headersFor: state.headersFor, takeoverGate: state.takeoverGate, beforeSend: state.beforeSend, prepareDirectSend: state.prepareDirectSend };
  owned = {
    headersFor(url) {
      const request = traffic.getStore();
      if (!request) return original.headersFor.call(state, url);
      if (request.bypass) return { 'x-bili-plugin-bypass': '1' };
      return { ...original.headersFor.call(state, url), ...request.headers, 'x-bili-plugin': 'dsh', 'x-bili-plugin-conversation': request.conversationId };
    },
    takeoverGate(...args) {
      const request = traffic.getStore();
      return request ? !request.bypass : original.takeoverGate.apply(state, args);
    },
    async beforeSend(...args) {
      const request = traffic.getStore();
      if (request?.bypass) return;
      if (request) request.routed = true;
      return original.beforeSend?.apply(state, args);
    },
    prepareDirectSend(...args) {
      const request = traffic.getStore();
      if (request && !request.bypass) throw Error('BC 当前不可用，本次请求未绕过压缩直发；恢复 BC 或切换为 OMD 后继续。');
      return original.prepareDirectSend?.apply(state, args) ?? { outcome: 'as-is' };
    },
    restore() {
      for (const key of ['headersFor', 'takeoverGate', 'beforeSend', 'prepareDirectSend']) if (state[key] === owned[key]) state[key] = original[key];
      if (hooks.get(state) === owned) hooks.delete(state);
    },
  };
  Object.assign(state, { headersFor: owned.headersFor, takeoverGate: owned.takeoverGate, beforeSend: owned.beforeSend, prepareDirectSend: owned.prepareDirectSend });
  hooks.set(state, owned);
  return true;
}

export async function* bcTraffic(request, next) {
  const iterator = traffic.run(request, () => next()[Symbol.asyncIterator]());
  try {
    for (;;) { const item = await traffic.run(request, () => iterator.next()); if (item.done) break; yield item.value; }
  } finally { await traffic.run(request, () => iterator.return?.()); }
}

export function protectBcContext(options, session) {
  const current = new Map();
  for (const message of options.messages) {
    const source = sourceName(message.source);
    if (checkpointSources.has(source)) current.set(source, message.content);
    if (message.source?.kind === 'runtime-context') current.set('dsh:runtime-context', message.content);
  }
  const task = latestTaskContext(session);
  const user = options.messages.findLast(message => message.role === 'user' && message.source?.kind === 'user');
  const parts = [{ type: 'text', text: 'Current runtime context\nOMD current state. Newer versions supersede earlier ones. Historical memory and earlier reasoning remain references, not new instructions.' },
    ...(task ? [{ type: 'text', text: task.text }] : []),
    ...[...current].flatMap(([source, blocks]) => [{ type: 'text', text: `[${source}]` }, ...blocks]),
    ...(user ? [{ type: 'text', text: '[Active user request · verbatim]' }, ...user.content] : [])];
  // BC protects a CoreMessage, not an arbitrary surrounding block array.
  // Attachments stay in their original position and BC's native image policy.
  // Repeating binary blocks here would double image cost on every request.
  const content = [{ type: 'text', text: parts.map(block => block.type === 'text' ? block.text
    : `[Original ${block.type} attachment remains in the preceding request.]`).join('\n\n') }];
  const state = freezeMessage({ id: `omd-bc-state:${hash(content)}`, role: 'user', source: { kind: 'plugin:oh-my-dsh:bc-state' }, content });
  return markAgentLoopRequest(Object.freeze({ ...options, messages: Object.freeze([...options.messages, state]) }));
}

export class BillionContext {
  constructor(hub) { this.hub = hub; this.restrictions = new Map(); this.selections = new Map(); this.meters = new Map(); this.patched = new Set(); this.closed = false; }
  backend(session) {
    const p = this.hub.context, own = p.store.peek(session.id);
    if (own?.contextBackend) return own.contextBackend;
    if (session.header?.parentSession) return p.store.peek(session.header.parentSession)?.contextBackend || 'omd';
    return 'omd';
  }
  active(session) { return this.backend(session) === 'bc'; }
  state(session) { return this.hub.context.state(session); }
  native() {
    const state = globalThis[BC_STATE];
    if (attachBcTransport(state)) { this.patched.add(state); return state; }
    return null;
  }
  async connect(signal) {
    if (this.closed) throw Error('上下文组件已关闭');
    const state = this.native();
    if (!state) throw Error('请先安装并启用 Billion Context 0.1.202，再选择 BC 模式。');
    if (!state.origin) await ready(state.ready, signal);
    let origin = state.origin;
    if (!origin || !/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin)) throw Error('BC 本地代理尚未就绪；保留当前模式与历史。');
    // BC can update/restart on the same port. Never cache a version decision
    // by origin across requests, which would silently admit a different build.
    let manifest;
    try { manifest = await this.api(origin, '/manifest', undefined, signal); }
    catch (error) {
      signal?.throwIfAborted();
      if (!state.respawn || error.status) throw error;
      // Keep BC's own single-flight recovery and all existing session data.
      state.ready = state.respawn();
      const recovered = await ready(state.ready, signal);
      origin = state.origin || recovered;
      if (!origin || !/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin)) throw error;
      manifest = await this.api(origin, '/manifest', undefined, signal);
    }
    if (this.closed) throw Error('上下文组件已关闭');
    if (manifest.version !== BC_VERSION) throw Error(`BC ${manifest.version || '未知版本'} 尚未适配；当前要求 ${BC_VERSION}。`);
    return origin;
  }
  async api(origin, path, body, signal) {
    const response = await fetch(`${origin}/__bili/plugin${path}`, { ...(body === undefined ? {} : { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]) });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw Object.assign(Error(data.error || `BC 请求失败（${response.status}）`), { status: response.status });
    return data;
  }
  identity(session) {
    const s = this.state(session);
    if (!s.bc) this.hub.context.store.update(s, { bc: { conversationId: session.id, revision: 0 } });
    return s.bc;
  }
  rebase(session, reason) {
    const s = this.state(session), previous = s.bc;
    this.hub.context.store.update(s, { bc: { ...previous, conversationId: session.id, needsBoundary: true, revision: (previous?.revision || 0) + 1, reason } });
    this.meters.delete(session.id);
    return s.bc;
  }
  reconcile(session) {
    let bc = this.identity(session);
    const ids = session.surface.nodes.flatMap(seq => {
      const message = session.deriveEventMessage(session.eventAt(seq));
      return message && (!sourceName(message.source) || message.source?.kind === 'user' || message.source?.kind === 'assistant' || message.role === 'tool') ? [message.id] : [];
    });
    if (bc.material && !bc.material.every((id, i) => ids[i] === id)) bc = this.rebase(session, '会话有效历史已改变');
    if (hash(bc.material || []) !== hash(ids)) { bc.material = ids; this.hub.context.store.save(this.state(session)); }
    return bc;
  }
  async choose(session, backend, agent) {
    if (this.closed) throw Error('上下文组件已关闭');
    if (!['omd', 'bc'].includes(backend)) throw Error('上下文管理请选择 OMD 或 BC');
    if (session.header?.origin === 'subagent') throw Error('请在主会话选择上下文管理方式');
    const selection = {}; this.selections.set(session.id, selection);
    if (backend === this.backend(session) && !this.state(session).pendingBackend) return { queued: false, backend };
    if (backend === 'bc') await this.connect();
    if (this.selections.get(session.id) !== selection) return { queued: Boolean(this.state(session).pendingBackend), backend: this.backend(session), superseded: true };
    const s = this.state(session);
    this.hub.context.store.update(s, { pendingBackend: backend, backendError: undefined });
    if (agent && agent.status !== 'idle') return { queued: true, backend: this.backend(session), pendingBackend: backend };
    const run = signal => this.applyChoice(session, signal);
    if (agent?.runMaintenance) await agent.runMaintenance(run); else await run();
    return { queued: Boolean(s.pendingBackend), backend: this.backend(session), pendingBackend: s.pendingBackend };
  }
  async applyChoice(session, signal) {
    const s = this.state(session), backend = s.pendingBackend, selection = this.selections.get(session.id);
    if (!backend) return;
    try { return await this.commitChoice(session, signal); }
    catch (error) {
      if (s.pendingBackend === backend && this.selections.get(session.id) === selection) {
        this.hub.context.store.update(s, { pendingBackend: undefined, backendError: error.message });
      }
      throw error;
    }
  }
  async commitChoice(session, signal) {
    const p = this.hub.context, s = this.state(session), backend = s.pendingBackend;
    const selection = this.selections.get(session.id);
    if (!backend) return;
    signal?.throwIfAborted();
    if (p.manualSessions.has(session.id)) return;
    if (s.transaction) await p.applyReady({ session });
    if (backend === 'bc') await this.connect(signal);
    for (const kind of ['prepare', 'coordinate', 'adaptive', 'autoCompact']) p.controllers.get(session.id + ':' + kind)?.abort(Error('上下文管理方式切换'));
    await Promise.allSettled(['prepare', 'coordinate', 'adaptive', 'autoCompact'].map(kind => p.jobs.get(session.id + ':' + kind)).filter(Boolean));
    signal?.throwIfAborted();
    if (this.closed || selection !== this.selections.get(session.id) || s.pendingBackend !== backend) return;
    if (backend === 'omd' && this.active(session)) {
      const agent = p.agents.get(session.id) || this.hub.agents.get(session.id);
      const capacity = p.adapter.contextCapacity?.(session) ?? session.requestContext?.()?.contextWindow;
      const used = () => this.hub.ctx.tokenMeter?.measure(session)?.totalTokens ?? 0;
      // The proxy's folds do not shrink the native surface. Prepare a safe
      // native representation before returning ownership to the host.
      while (capacity && used() > capacity * 0.8) {
        if (selection !== this.selections.get(session.id) || s.pendingBackend !== backend) return;
        if (!agent) throw Error('此会话本地历史超过窗口，需先恢复会话以完成 OMD 交接；BC 模式与原文保持。');
        const before = used(); signal?.throwIfAborted();
        await p.prepare(agent, true, { handoff: true });
        signal?.throwIfAborted();
        if (selection !== this.selections.get(session.id) || s.pendingBackend !== backend) return;
        const ids = activeRecords(s).filter(record => record.mode !== 'brief' && liveSpan(session, record)).map(record => record.id);
        if (ids.length) await p.applyReady(agent, { manual: true, ids, mode: 'brief', source: 'backend-handoff' });
        if (used() >= before) throw Error('当前历史尚不能安全交给 OMD；保留 BC 模式、全部原文与已生成档案，请查看档案准备状态。');
      }
    }
    if (this.closed || selection !== this.selections.get(session.id) || s.pendingBackend !== backend) return;
    p.store.update(s, { pending: null, contextBackend: backend, pendingBackend: undefined, backendError: undefined,
      compressionModeRevision: (s.compressionModeRevision || 0) + 1,
      bc: { ...s.bc, conversationId: session.id, needsBoundary: true, revision: (s.bc?.revision || 0) + 1, reason: '上下文管理方式切换' } });
    this.meters.delete(session.id); p.adaptive.drop(session.id); p.cachedPreparation.drop(session.id);
    const agent = p.agents.get(session.id);
    if (agent && backend === 'omd') void p.coordinate(agent, true);
  }
  async refresh(session, signal, inputHostTokens) {
    const native = this.native();
    if (!native?.origin || !this.state(session).bc) return null;
    const status = await this.api(native.origin, '/status?conversationId=' + encodeURIComponent(this.identity(session).conversationId), undefined, signal);
    const response = status.sessionId && await fetch(`${native.origin}/__bili/sessions/${encodeURIComponent(status.sessionId)}/detail`, { signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]) });
    const detail = response?.ok ? await response.json() : null;
    const previous = this.meters.get(session.id);
    // The outgoing estimate excludes the response. Anchor against the native
    // input before dispatch so the response is counted as growth next time.
    const hostTokens = inputHostTokens ?? (previous?.requests === status.requests ? previous?.hostTokens : null);
    const current = { ...status, sentTokens: detail?.contextUpperTokens ?? null, sampledAt: Date.now(), hostTokens, conversationId: this.identity(session).conversationId };
    this.meters.set(session.id, current); return current;
  }
  view(session) { return { backend: this.backend(session), pendingBackend: this.hub.context.store.peek(session.id)?.pendingBackend ?? null,
    available: Boolean(globalThis[BC_STATE]), version: BC_VERSION, status: this.meters.get(session.id) ?? null,
    switchError: this.state(session).backendError ?? null, error: this.state(session).bc?.error ?? null }; }
  effectiveTokens(session, hostTokens) {
    if (!this.active(session)) return hostTokens;
    const sample = this.meters.get(session.id);
    if (!sample || sample.conversationId !== this.identity(session).conversationId || !Number.isFinite(sample.sentTokens) || !Number.isFinite(sample.hostTokens)) return hostTokens;
    return sample.sentTokens + Math.max(0, hostTokens - sample.hostTokens);
  }
  install(ctx, managed) {
    this.managed = managed;
    ctx.on('agent/created', ({ agent }) => {
      if (!managed(agent.session) || !agent.session.header?.parentSession) return;
      const s = this.state(agent.session);
      if (!s.contextBackend) { s.contextBackend = this.hub.context.store.peek(agent.session.header.parentSession)?.contextBackend || 'omd'; this.hub.context.store.save(s); }
    }, { global: true });
    ctx.on('agent/disposed', ({ agent }) => { this.restrictions.get(agent)?.(); this.restrictions.delete(agent); this.selections.delete(agent.session.id); this.meters.delete(agent.session.id); }, { global: true });
    ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      if (managed(agent.session) && agent.session.header?.origin !== 'subagent') await this.applyChoice(agent.session, signal).catch(error => { signal?.throwIfAborted(); this.hub.context.store.notice(this.state(agent.session), error.message); });
      return next();
    }, { global: true, prepend: true });
    installRequestProjection(ctx, options => {
      const session = options.sessionId && ctx.sessions.get(options.sessionId);
      if (!session || !managed(session) || !isAgentLoopRequest(options)) return options;
      const bc = this.active(session);
      let projected = bc ? protectBcContext(options, session) : options;
      if (!bc && globalThis[BC_STATE] && projected.tools?.some(tool => exclusiveTools.has(tool.name))) projected = markAgentLoopRequest(Object.freeze({ ...projected, tools: Object.freeze(projected.tools.filter(tool => !exclusiveTools.has(tool.name))) }));
      return projected;
    });
    ctx.on('system-prompt/assemble', (_assembly, context, next) => {
      const agent = context?.agent;
      if (agent && managed(agent.session) && !isBtwSession(agent.session)) {
        this.restrictions.get(agent)?.(); this.restrictions.delete(agent);
        if (!this.active(agent.session) && globalThis[BC_STATE]) {
          const deny = agent.ctx.tools.schemas().filter(tool => exclusiveTools.has(tool.name)).map(tool => tool.name);
          if (deny.length) this.restrictions.set(agent, agent.ctx.tools.restrict({ deny }));
        }
      }
      return next();
    }, { global: true, prepend: true });
    ctx.effect(() => ctx.tools.guard(exec => globalThis[BC_STATE] && managed(exec.agent.session) && exclusiveTools.has(exec.name) && !this.active(exec.agent.session) ? '当前会话由 OMD 管理上下文，BC 压缩写入工具不执行；回查与诊断仍可用。' : undefined));
    ctx.on('tools/execute', async (exec, next) => {
      const result = await next();
      if (managed(exec.agent.session) && this.active(exec.agent.session) && BC_TOOLS.has(exec.name)) await this.refresh(exec.agent.session, exec.signal).catch(() => {});
      return result;
    }, { global: true });
    const owner = this;
    ctx.on('llm/stream', async function* (options, next) {
      const session = options.sessionId && ctx.sessions.get(options.sessionId);
      const ownBackground = !isAgentLoopRequest(options) && options.messages?.some(message => sourceName(message.source)?.startsWith('oh-my-dsh:'));
      if ((!session || !managed(session)) && !ownBackground) { yield* next(); return; }
      if (ownBackground && (!session || !managed(session))) {
        owner.native(); yield* bcTraffic({ bypass: true }, next); return;
      }
      const main = isAgentLoopRequest(options), useBc = main && owner.active(session);
      const state = owner.native();
      if (!useBc && !state) { yield* next(); return; }
      let request = { bypass: !useBc };
      const inputHostTokens = useBc ? owner.hub.ctx.tokenMeter?.measure(session)?.totalTokens : undefined;
      try {
        if (useBc) {
          const origin = await owner.connect(options.signal);
          const bc = owner.reconcile(session);
          if (bc.needsBoundary) {
            await owner.api(origin, '/compact', { conversationId: bc.conversationId }, options.signal).catch(error => { if (error.status !== 404) throw error; });
            delete bc.needsBoundary; owner.hub.context.store.save(owner.state(session));
          }
          const info = await ctx.llm.resolveModelInfo(options.provider, options.model, options.signal);
          const model = /^[\x20-\x7e]+$/.test(options.model) ? options.model : undefined;
          const window = info?.context?.contextWindow, output = options.maxTokens ?? info?.defaultMaxTokens;
          request = { bypass: false, conversationId: bc.conversationId, routed: false, headers: {
            ...(model ? { 'x-bili-plugin-model': model } : {}),
            ...(Number.isFinite(window) ? { 'x-bili-plugin-context-window': String(window) } : {}),
            ...(Number.isFinite(output) ? { 'x-bili-plugin-max-output': String(output) } : {}),
          } };
        }
        yield* bcTraffic(request, next);
        if (useBc && !request.routed) throw Error('当前模型通道未经过 BC，未将本次请求标为 BC 压缩成功。');
        if (useBc) {
          delete owner.identity(session).error;
          await owner.refresh(session, options.signal, inputHostTokens).catch(error => { owner.identity(session).error = error.message; });
          owner.hub.context.store.save(owner.state(session));
        }
      } catch (error) {
        if (useBc) { owner.identity(session).error = error.message; owner.hub.context.store.save(owner.state(session)); }
        throw error;
      }
    }, { global: true });
    ctx.effect(() => () => { this.closed = true; for (const dispose of this.restrictions.values()) dispose(); this.restrictions.clear(); for (const state of this.patched) hooks.get(state)?.restore(); this.patched.clear(); });
  }
}
