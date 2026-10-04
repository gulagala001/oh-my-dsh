import { randomUUID } from 'node:crypto';
import { installRequestProjection } from './llm-request-projection.mjs';
import { isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { BTW_LABEL_PREFIX, btwCreation, markBtwSession, isBtwSession, completedBtwPrefix,
  pendingToolCalls, assertBtwCachePrefix, cacheUsageText } from './btw-policy.mjs';

// Upstream remains byte-for-byte intact. This façade changes execution policy
// and lifecycle only, while retaining its native fork call and original prompt.
export function createBtwCompatibility(ctx) {
  const active = new Map(), requests = new Map(), completed = new Map(), assemblies = new Map();
  const ownedIds = new Set();
  let closed = false;
  const owned = agent => isBtwSession(agent?.session);
  const stateOf = session => session?.id ? [...active.values()].find(s => s.child === session.id) : undefined;
  const effect = disposer => ctx.effect(() => disposer);
  // Native fork still owns the balanced, durable seed. While a main turn is
  // running, its latest dispatched request is the cacheable context snapshot;
  // append only the child's side question to that immutable request history.
  installRequestProjection(ctx, options => {
    const state = stateOf({ id: options.sessionId });
    if (!state?.useRequestContext || options.purpose) return options;
    const question = options.messages?.findLast(m => m.role === 'user' && m.source?.kind === 'user');
    if (!question) throw Error('/btw 缺少侧问消息；已停止请求。');
    const projected = Object.freeze({ ...options, toolHistory: state.reference.toolHistory,
      messages: Object.freeze([...state.reference.messages, question]) });
    return isAgentLoopRequest(options) ? markAgentLoopRequest(projected) : projected;
  });
  effect(ctx.on('agent/created', ({ agent }) => {
    const state = btwCreation.getStore();
    if (state && agent.session.header.parentSession === state.parent) {
      markBtwSession(agent.session); ownedIds.add(agent.session.id); state.child = agent.session.id; state.agent = agent;
    }
  }, { global: true, prepend: true }));
  effect(ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const session = context?.agent?.session;
    if (isBtwSession(session)) {
      const state = stateOf(session);
      if (!state?.assembly) throw Error('/btw 缺少主会话已装配内容；已停止。');
      // OMD's ordinary child adapter deliberately uses different tool text.
      // Side questions keep the parent's captured assembly, including schemas,
      // rather than composing a new persona or stripping tools from the wire.
      return state.assembly;
    }
    const result = await next();
    if (session) assemblies.set(session.id, result);
    return result;
  }, { global: true, prepend: true }));
  effect(ctx.tools.guard(exec => {
    if (!owned(exec.agent)) return;
    const state = stateOf(exec.agent.session);
    if (state) state.denied = true;
    return '/btw 侧问默认不执行工具；本次调用已拒绝，侧问将在工具结果配对后停止。';
  }));
  effect(ctx.on('agent/pre-step', async ({ agent, step }, next) => {
    const state = stateOf(agent.session);
    if (owned(agent) && state?.denied && step > 1) {
      if (pendingToolCalls(agent.session.snapshotEvents()).size) throw Error('/btw 工具结果尚未完整配对；停止继续请求。');
      agent.cancel({ kind: 'user' });
      return { kind: 'reject' };
    }
    return next();
  }, { global: true, prepend: true }));
  effect(ctx.on('llm/stream', (options, next) => {
    const session = options.sessionId && ctx.sessions.get(options.sessionId);
    if (!session && !ownedIds.has(options.sessionId)) return next();
    if (isBtwSession(session) || ownedIds.has(options.sessionId)) {
      const state = stateOf(session || {id:options.sessionId});
      if (!state || closed || state.signal.aborted || state.denied)
        throw Error('/btw 已停止；不会继续模型请求。');
      try {
        if (options.purpose) throw Error('/btw 不运行后台压缩或标题模型；已停止附加请求。');
        assertBtwCachePrefix(state.reference, options);
        const seeded = session.snapshotEvents().slice(0, session.inheritedEventCount || 0);
        if (JSON.stringify(seeded) !== JSON.stringify(state.prefix)) throw Error('/btw 未继承完整回合前缀；已停止请求。');
      } catch(error) { state.failure = error.message; throw error; }
    } else if (!options.purpose) requests.set(session.id, { reference: options, assembly: assemblies.get(session.id) });
    return next();
  }, { global: true }));
  effect(ctx.on('session/event', (session, event) => {
    if (!isBtwSession(session)) {
      if (event.type === 'turn/end' && requests.has(session.id)) {
        completed.set(session.id, requests.get(session.id));
      }
      return;
    }
    const state = stateOf(session);
    if (state && event.type === 'assistant/message') state.usages.push(event.data?.usage);
  }, { global: true }));
  effect(ctx.on('session/disposed', session => { requests.delete(session.id); completed.delete(session.id); assemblies.delete(session.id); }, { global: true }));

  const facade = {
    effect: (...args) => ctx.effect(...args),
    commands: { register(definition) {
      return ctx.commands.register({ ...definition, definitionId: 'trisoul_x:btw:v1', input: { hint: '<问题> | cancel' },
        handler: async invocation => {
          const input = invocation.rawInput.trim();
          if (input === 'cancel') {
            const matches = [...active.values()].filter(s => s.parent === invocation.agent.session.id);
            for (const s of matches) s.controller.abort(Error('用户取消 /btw'));
            return { kind: 'success', text: matches.length ? `已取消 ${matches.length} 个侧问。` : '没有正在运行的侧问。' };
          }
          if (closed) return { kind: 'error', text: '/btw 已停用。' };
          const controller = new AbortController(), id = randomUUID();
          const signal = AbortSignal.any([controller.signal, invocation.signal]);
          let settle;
          const done = new Promise(resolve => { settle = resolve; });
          const state = { id, parent: invocation.agent.session.id, controller, signal, usages: [], done };
          active.set(id, state);
          try {
            const result = await btwCreation.run(state, () => definition.handler({ ...invocation, signal }));
            if (signal.aborted || closed) return { kind: 'error', text: '/btw 已取消。' };
            if (state.denied) return { kind: 'error', text: '/btw 尝试调用工具，执行已拒绝并停止侧问；主会话继续运行。' };
            if (state.failure) return { kind: 'error', text: state.failure };
            return result.kind === 'success' ? { ...result, text: `${result.text}\n\n${cacheUsageText(state.usages)}` } : result;
          } finally { active.delete(id); settle(); }
        } });
    } },
    subagents: {
      getProvider: () => ctx.subagents.getProvider('fork'),
      start: async (_provider, request) => {
        const state = btwCreation.getStore();
        if (!state || closed) throw Error('/btw 请求没有有效生命周期。');
        const captured = requests.get(state.parent);
        if (!captured) throw Error('/btw 无法核对已有缓存前缀；请等主模型开始响应后再侧问。');
        state.prefix = completedBtwPrefix(request.parent.session, { allowEmpty: true });
        state.reference = captured.reference;
        state.assembly = captured.assembly;
        state.useRequestContext = captured !== completed.get(state.parent);
        const provider = ctx.subagents.getProvider('fork');
        if (!provider?.inheritsParentContext) throw Error('/btw 需要原生上下文继承 fork；不会切换到其他 provider。');
        const run = await ctx.subagents.start('fork', { ...request, label: BTW_LABEL_PREFIX + state.id });
        state.child = run.id;
        return run;
      },
    },
  };
  const close = () => {
    closed = true;
    for (const state of active.values()) state.controller.abort(Error('/btw 插件退出'));
    requests.clear(); completed.clear(); assemblies.clear();
    return Promise.allSettled([...active.values()].map(state => state.done));
  };
  effect(close);
  return { facade, close, active };
}

export function installBtwCompatibility(ctx) {
  ctx.inject(['commands', 'subagents'], async child => {
    const compatibility = createBtwCompatibility(child);
    const { apply } = await import('../vendor/dsh-btw/lib/index.js');
    apply(compatibility.facade, { provider: 'fork' });
  });
}
