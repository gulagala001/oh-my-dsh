import { Config } from './config.mjs';
import { Hub, NS } from './hub.mjs';
import { eventText, sessionEvents, substantive } from './hub.mjs';
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { currentTasks, restoreTaskProjection } from './tasks.mjs';
import { ensureSystemHead } from './system-head.mjs';
import { join } from 'node:path';
import { acquireComputerUse } from '#opencu/integration';

export { Config };
export const name = 'trisoul-x';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'tokenMeter', 'sessionProjections'];

const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function readBody(req) { let body = ''; for await (const part of req) body += part; return JSON.parse(body); }

export function apply(ctx, config) {
  const hub = new Hub(ctx, config);
  ctx.settings.installSection(ctx, NS, Config, config, { setSource: source => { hub.getConfig = source; }, onChange() {
    if (hub.computerUse) void hub.computerRefresh().catch(error => ctx.logger.warn(error.message));
    for (const agent of hub.agents.values()) hub.armIdle(agent);
  } });
  const computer = acquireComputerUse(ctx, { getConfig: () => hub.config(), dataDir: join(hub.store.dir, 'computer-use') });
  hub.computerUse = computer.computerUse;
  hub.computerRefresh = computer.refresh;
  hub.computerImages = computer.computerImages;
  const isX = session => (ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset) === 'trisoul-x';
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next();
    if (!assembly.sections.some(s => s.name === 'trisoul-x:persona')) return assembly;
    return { ...assembly,
      sections: assembly.sections.map(s => {
        let text = s.text;
        if (['tool:write', 'tool:edit'].includes(s.name)) text = text.replace(' (the default fs-observation-policy requires it)', '');
        if (s.name === 'harness:identity') text = text.replace('You are an AI agent powered by DeepSeek Harness.', 'You are an AI agent.');
        if (s.name === 'harness:source') text = text
          .replace('The DeepSeek Harness implementation checkout', 'The host application source checkout')
          .replace('inspect or extend DSH itself.', 'inspect or extend the host application itself.');
        if (s.name === 'app:web-surface') text = text.replace('DeepSeek Harness Web GUI', "current application's Web GUI");
        return text === s.text ? s : { ...s, text };
      }),
      contexts: assembly.contexts.map(s => s.name === 'sandbox:policy' ? { ...s, text: s.text
        .replace('Current DSH file policy:', 'Current file policy:')
        .replaceAll('The DSH file sandbox', 'The file sandbox')
        .replaceAll('the DSH file sandbox', 'the file sandbox') } : s),
    };
  }, { global: true });
  ctx.on('agent/request', async ({ agent }, next) => {
    if (!isX(agent.session)) return next();
    hub.requestStarts.set(agent.session.id, Date.now());
    return next();
  }, { global: true });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    // DSH has committed the prompt, admitted input and built the request at start.
    if (frame.type === 'start' && isX(agent.session)) hub.captureFrame(agent, frame.turn, frame.step);
  }, { global: true });
  ctx.on('agent/pre-step', async ({ agent, messages, signal, turn, step }, next) => {
    if (isX(agent.session) && !signal.aborted) {
      ensureSystemHead(agent.session, { turn, step });
      restoreTaskProjection(ctx, agent.session);
      hub.publish(agent, messages);
      void hub.stateZone.preStep(agent, signal);
      try {
        if (hub.store.state(agent.session.id).memoryReinject) {
          await hub.memoryContext.compact(agent, signal);
          delete hub.store.state(agent.session.id).memoryReinject;
        }
        await hub.memoryContext.preStep(agent, messages, signal);
      } catch (error) { if (!signal.aborted) ctx.logger.warn(`记忆补注：${error.message}`); }
      try { await hub.canvas.compactIfNeeded(agent, 'pressure', signal); }
      catch (error) { if (!signal.aborted) ctx.logger.warn(`上下文整理：${error.message}`); }
    }
    return next();
  }, { global: true });
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    if (isX(agent.session) && failure.code === CONTEXT_WINDOW_EXCEEDED_CODE && !signal.aborted) {
      try {
        if (await hub.canvas.compactIfNeeded(agent, 'context-overflow', signal)) return { kind: 'retry' };
      } catch (error) { if (!signal.aborted) ctx.logger.warn(`上下文整理：${error.message}`); }
    }
    return next();
  }, { global: true });
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    if (isX(agent.session)) hub.finishTasks(agent, turn, signal);
  }, { global: true });
  ctx.on('agent/disposed', async ({ agent }) => {
    hub.disposeAgent(agent);
  }, { global: true });
  ctx.on('agent/session-start', ({ agent, source }) => {
    if (!isX(agent.session) || agent.session.header.origin === 'subagent') return;
    const state = hub.store.state(agent.session.id);
    hub.startDigestSession(agent);
    if (source === 'resume') { const record = hub.memoryContext.record(agent.session); record.opened = true; record.taskDone = false; }
    if (source === 'compact') state.memoryReinject = true;
    hub.store.save(state); hub.armIdle(agent);
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (!isX(session)) return;
    hub.observe(session, event);
    const agent = ctx.agents.get(session.id);
    if (agent && substantive(event)) {
      const urgent = event.type === 'user/message' && event.data.source.kind === 'user' && /记住|以后都|从今往后|决定|别再|不要再/.test(eventText(session, event));
      void hub.schedule(agent, urgent);
    }
  }, { global: true });
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/trisoul-x/api', async handler(req, res) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('session');
        const agent = id ? ctx.agents.get(id) : undefined;
        const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
        const stored = id ? hub.store.state(id) : undefined;
        const scopeSession = session ?? { id: id || 'settings', header: { cwd: stored?.cwd || process.cwd() } };
        if (url.pathname === '/trisoul-x/api/better-todo') {
          if (!id) { send(res, 400, { error: '请选择一个会话' }); return; }
          if (req.method === 'POST') {
            const input = await readBody(req), patch = {};
            for (const key of ['todo', 'verification']) if (Object.hasOwn(input, key)) {
              if (typeof input[key] !== 'boolean') { send(res, 400, { error: '提醒选项必须为开或关' }); return; }
              patch[key] = input[key];
            }
            send(res, 200, hub.setTaskReminders(scopeSession, patch)); return;
          }
          send(res, 200, hub.taskReminders(scopeSession)); return;
        }
        if (url.pathname === '/trisoul-x/api/scope') {
          const locked = Boolean(stored?.started || (session && sessionEvents(session).some(e => e.type === 'user/message' && e.data.source.kind === 'user')));
          if (req.method === 'POST') {
            if (locked) { send(res, 409, { error: '这个会话已开始，记忆范围已绑定' }); return; }
            const { scope } = await readBody(req);
            if (!['full', 'project', 'session'].includes(scope)) throw new Error('记忆范围无效');
            if (stored) { stored.memoryScope = scope; hub.store.save(stored); }
            else await ctx.settings.update(NS, { memoryScope: scope });
          }
          send(res, 200, { scope: stored?.memoryScope || hub.config().memoryScope, locked, default: hub.config().memoryScope }); return;
        }
        if (url.pathname === '/trisoul-x/api/state' && req.method === 'GET') {
          const directory = id ? [] : await Promise.all(ctx.llm.listProviders().map(async provider => ({ ...provider, models: await ctx.llm.listModels(provider.id).catch(() => []) })));
          const states = hub.store.allStates(), ids = new Set(id ? [id] : states.map(s => s.id));
          for (let changed = true; changed;) {
            changed = false;
            for (const s of states) if (ids.has(s.parentSession) && !ids.has(s.id)) { ids.add(s.id); changed = true; }
          }
          const all = url.searchParams.get('range') === 'all' ? states : states.filter(s => ids.has(s.id));
          const metrics = {};
          for (const state of all) for (const [kind, m] of Object.entries(state.metrics)) {
            const target = metrics[kind] ??= {};
            for (const [key, n] of Object.entries(m)) target[key] = key === 'peakContext' ? Math.max(target[key] || 0, n) : (target[key] || 0) + n;
          }
          const actions = {};
          for (const state of all) for (const [key, n] of Object.entries(state.actions || {})) actions[key] = (actions[key] || 0) + n;
          const meter = session ? ctx.tokenMeter.measure(session) : null;
          send(res, 200, {
            config: hub.config(), directory, metrics, actions, sessionCount: all.length,
            contextHistory: stored?.contextHistory || [],
            context: stored ? { pins: stored.pins, status: stored.status, notes: stored.notes, checkpoint: stored.checkpoint, cursor: stored.cursor, digestCount: stored.digests.length, stateCursor: stored.stateCursor, stateFailures: stored.stateFailures || 0, workdoc: stored.memoryContext?.doc || '', workdocVersion: stored.memoryContext?.version || 0, supplementPending: stored.memoryContext?.pending.length || 0, probe: stored.probe, probeNotes: stored.probeNotes || [], memoryTrace: stored.memoryTrace } : null,
            tasks: currentTasks(session, stored?.taskList ?? stored?.tasks), taskRelease: stored?.taskRelease,
            activity: all.flatMap(s => s.activity).sort((a, b) => b.at - a.at).slice(0, 60),
            live: id ? ([...hub.live.values()].find(call => call.sessionId === id) ?? null) : [...hub.live.values()],
            liveCalls: [...hub.live.values()].filter(call => !id || url.searchParams.get('range') === 'all' || ids.has(call.sessionId)),
            scope: hub.scope(scopeSession), running: agent?.status ?? 'idle',
            meter,
            frame: session ? meter.nodes.map(n => { const e = session.eventAt(n.seq), m = session.deriveEventMessage(e); return { seq: n.seq, role: m?.role, kind: m?.source?.plugin || m?.source?.kind || e.type, tokens: n.tokens ?? n.heuristicTokens, chars: eventText(session, e).length, checkpoint: Boolean(m?.source?.compactionId) }; }) : [],
            route: session?.requestHeader()?.config ? { provider: session.requestHeader().config.provider, model: session.requestHeader().config.model } : null,
          }); return;
        }
        if (url.pathname === '/trisoul-x/api/settings' && req.method === 'POST') {
          await ctx.settings.update(NS, await readBody(req)); send(res, 200, hub.config()); return;
        }
        if (url.pathname === '/trisoul-x/api/memories') {
          if (req.method === 'GET') {
            const all = hub.store.allMemories(), visibleIds = new Set(hub.memories(scopeSession, true).map(m => m.id));
            const items = (url.searchParams.get('view') === 'all' ? all : all.filter(m => visibleIds.has(m.id))).map(m => ({ ...m, visible: visibleIds.has(m.id), touched: m.usage?.sessions?.includes(id) || m.usage?.lastSessionId === id }));
            send(res, 200, { items, scope: hub.scope(scopeSession), projects: [...new Set(all.filter(m => m.project).map(m => m.project))], trace: stored?.memoryTrace || [], health: hub.store.health(hub.scope(scopeSession).project, hub.scope(scopeSession).mode) }); return;
          }
          if (req.method === 'POST') {
            const input = await readBody(req);
            if (input.op === 'delete') hub.store.deleteMemory(input.target);
            else if (input.op === 'restore') hub.store.restore(input.target);
            else if (input.op === 'update') hub.store.edit(input.target, input);
            else if (input.op === 'retire') {
              const old = hub.store.allMemories().find(m => m.id === input.target);
              if (!old) throw new Error('找不到这条记忆');
              hub.store.memoryOps(old.project, [{ ...old, ...input }], 'user');
            } else hub.store.memoryOps(input.project || hub.scope(scopeSession).project, [input], 'user');
            send(res, 200, { ok: true }); return;
          }
        }
        if (url.pathname === '/trisoul-x/api/curate' && req.method === 'POST') {
          if (!agent) throw new Error('先继续一次对话，再整理这个会话的记忆');
          const shard = hub.store.pickShard(hub.curationKey(session), hub.scope(session));
          if (shard) await hub.requestCuration(agent, shard, 'manual');
          send(res, 200, { queued: Boolean(shard) }); return;
        }
        if (url.pathname === '/trisoul-x/api/compact' && req.method === 'POST') {
          if (!agent) throw new Error('先继续一次对话，再整理这个会话');
          const result = await hub.canvas.compactNow(agent, new AbortController().signal);
          send(res, 200, { changed: Boolean(result) }); return;
        }
        send(res, 404, { error: '接口不存在' });
      } catch (error) { send(res, 400, { error: error.message }); }
    } }));
  });
}
