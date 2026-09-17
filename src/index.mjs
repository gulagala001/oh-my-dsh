import { installLoaderLifecycleCompatibility } from './loader-lifecycle-compat.mjs';
import { installToolSchedulerCompatibility } from './tool-scheduler-compat.mjs';
import { monitorSelection, compactMonitorSnapshot } from './monitoring.mjs';
import { createVersionService, handleVersionApi } from './version.mjs';
import { installImageBudget } from './image-budget.mjs';
import { Config } from './config.mjs';
import { neutralizeHostEnvironment } from './cc-adaptation/environment.mjs';
import { Hub, NS } from './hub.mjs';
import { eventText } from './hub.mjs';
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { currentTasks, restoreTaskProjection } from './tasks.mjs';
import { ensureSystemHead } from './system-head.mjs';
import { handleContextApi } from './context/api.mjs';
import { TODO_NUDGE, TODO_EMPTY_NUDGE } from './todolist.mjs';
import { message } from './hub.mjs';
import { join } from 'node:path';
import { acquireComputerUse } from '#opencu/integration';

export { Config };
export const name = 'trisoul-x';
export const inject = ['loader', 'tools', 'llm', 'agents', 'sessions', 'settings', 'tokenMeter', 'sessionProjections'];
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function readBody(req) { let body = ''; for await (const part of req) body += part; return body.trim() ? JSON.parse(body) : {}; }

export function apply(ctx, config) {
  installLoaderLifecycleCompatibility(ctx);
  installToolSchedulerCompatibility(ctx);
  const hub = new Hub(ctx, config);
  const versionService = createVersionService();
  ctx.effect(() => () => versionService.dispose());
  ctx.settings.installSection(ctx, NS, Config, config, { setSource: source => { hub.getConfig = source; }, onChange() {
    if (hub.computerUse) void hub.computerRefresh().catch(error => ctx.logger.warn(error.message));
    hub.context.reconfigure();
  } });
  const computer = acquireComputerUse(ctx, { getConfig: () => hub.config(), dataDir: join(hub.store.dir, 'computer-use') });
  hub.computerUse = computer.computerUse; hub.computerRefresh = computer.refresh; hub.computerImages = computer.computerImages;
  const isX = session => (ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset) === 'trisoul-x';
  installImageBudget(ctx, isX);
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next();
    // Children inherit the preset; stock sessions and non-agent calls stay exact.
    if (!context?.agent || !isX(context.agent.session)) return assembly;
    const result = neutralizeHostEnvironment(assembly);
    return { ...result, sections: result.sections.map(s => {
      if (!['tool:write', 'tool:edit'].includes(s.name)) return s;
      const text = s.text.replace(' (the default fs-observation-policy requires it)', '');
      return text === s.text ? s : { ...s, text };
    }) };
  }, { global: true });
  ctx.on('agent/request', async ({ agent }, next) => { if (isX(agent.session)) hub.requestStarts.set(agent.session.id, Date.now()); return next(); }, { global: true });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => { if (frame.type === 'start' && isX(agent.session)) hub.captureFrame(agent, frame.turn, frame.step); }, { global: true });
  ctx.on('agent/pre-step', async ({ agent, messages, signal, turn, step }, next) => {
    if (isX(agent.session) && !signal.aborted && agent.session.header.origin !== 'subagent') {
      ensureSystemHead(agent.session, { turn, step });
      restoreTaskProjection(ctx, agent.session);
      const state = hub.store.state(agent.session.id);
      if (state.memoryScope == null) { state.memoryScope = hub.config().memoryScope; hub.store.save(state); }
      hub.agents.set(agent.session.id, agent);
      // A pending write-ahead transaction must finish before sending another request.
      // Only an explicitly queued full-compaction command can await model work here.
      await hub.context.preStep(agent, signal);
      if (hub.todoStore) {
        hub.todoStore.maintainInjection(agent.session);
        const notice = messages.some(m => m.source?.kind === 'user') ? TODO_NUDGE : hub.todoStore.takeEmptyNudge(agent.session) ? TODO_EMPTY_NUDGE.replace('with task_map', 'with todo_write') : null;
        if (notice) agent.session.append('user/message', message(notice, 'task-reminder'), { surfaceOp: 'append' });
      }
    }
    return next();
  }, { global: true });
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    if (isX(agent.session) && failure.code === CONTEXT_WINDOW_EXCEEDED_CODE && !signal.aborted) {
      const changed = await hub.context.applyReady(agent, { ignoreCooldown: true });
      if (changed) return { kind: 'retry' };
      ctx.logger.warn('上下文已达容量上限，但没有可应用的摘要。原文保留；没有现场调用摘要模型。');
    }
    return next();
  }, { global: true });
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => { if (isX(agent.session)) hub.finishTasks(agent, turn, signal); }, { global: true });
  ctx.on('agent/status', ({ agent }) => {
    if (isX(agent.session)) hub.context.arm(agent);
  }, { global: true });
  ctx.on('agent/disposed', ({ agent }) => {
    // A preset can have changed before disposal; release resources we owned.
    const id = agent.session.id;
    if (!isX(agent.session) && !hub.agents.has(id) && !hub.context.agents.has(id)) return;
    hub.context.dispose(id); hub.taskReviews.delete(id); hub.agents.delete(id); hub.requestStarts.delete(id);
  }, { global: true });
  ctx.on('agent/created', ({ agent }) => {
    if (!isX(agent.session) || agent.session.header.origin === 'subagent') return;
    const state = hub.store.state(agent.session.id);
    state.memoryScope ??= hub.config().memoryScope;
    state.cwd = agent.session.header.cwd; state.parentSession = agent.session.header.parentSession;
    hub.store.save(state); hub.agents.set(agent.session.id, agent); hub.context.start(agent);
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (!isX(session)) return;
    hub.observe(session, event);
    hub.context.observe(session, event);
  }, { global: true });
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/trisoul-x/api', async handler(req, res) {
      try {
        const url = new URL(req.url, 'http://localhost'), id = url.searchParams.get('session');
        if (await handleVersionApi({ req, res, url, service: versionService, send })) return;
        const agent = id ? ctx.agents.get(id) : undefined;
        const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
        const stored = id ? hub.store.state(id) : undefined;
        const scopeSession = session ?? { id: id || 'settings', header: { cwd: stored?.cwd || process.cwd() } };
        if (await handleContextApi({ hub, ctx, req, res, url, session, agent, id, send, readBody })) return;
        if (url.pathname === '/trisoul-x/api/better-todo') {
          if (!id) { send(res, 400, { error: '请选择一个会话' }); return; }
          if (req.method === 'POST') {
            const input = await readBody(req), patch = {};
            for (const key of ['todo', 'verification']) if (Object.hasOwn(input, key)) {
              if (typeof input[key] !== 'boolean') throw new Error('提醒选项必须为开或关');
              patch[key] = input[key];
            }
            send(res, 200, hub.setTaskReminders(scopeSession, patch)); return;
          }
          send(res, 200, hub.taskReminders(scopeSession)); return;
        }
        if (url.pathname === '/trisoul-x/api/state' && req.method === 'GET') {
          const directory = id ? [] : await Promise.all(ctx.llm.listProviders().map(async provider => ({ ...provider, models: await ctx.llm.listModels(provider.id).catch(() => []) })));
          const { ids, selected: all, metrics, actions } = monitorSelection(hub.store.monitorStates(), id, url.searchParams.get('range'));
          const meter = session ? ctx.tokenMeter.measure(session) : null;
          const liveCalls = [...hub.live.values()].filter(call => !id || url.searchParams.get('range') === 'all' || ids.has(call.sessionId));
          res.setHeader('Cache-Control', 'no-store');
          if (url.searchParams.get('view') === 'summary') {
            send(res, 200, compactMonitorSnapshot({ metrics, actions, meter, liveCalls, sessionCount: all.length, running: agent?.status ?? 'idle' })); return;
          }
          send(res, 200, {
            config: hub.config(), directory, metrics, actions, sessionCount: all.length, contextHistory: stored?.contextHistory || [],
            context: stored ? { legacy: true, pins: stored.pins, status: stored.status ? '[历史状态，旧提炼链路已停止]\n' + stored.status : '', notes: stored.notes,
              checkpoint: stored.checkpoint, cursor: stored.cursor, digestCount: stored.digests.length,
              stateCursor: stored.stateCursor, stateFailures: stored.stateFailures || 0,
              workdoc: stored.memoryContext?.doc ? '[历史任务文档，非当前摘要目录]\n' + stored.memoryContext.doc : '',
              workdocVersion: stored.memoryContext?.version || 0, supplementPending: 0, probe: null, probeNotes: [], memoryTrace: stored.memoryTrace } : null,
            contextPipeline: session && session.header.origin !== 'subagent' ? hub.context.view(session) : null,
            tasks: currentTasks(session, stored?.taskList ?? stored?.tasks), taskRelease: stored?.taskRelease,
            activity: all.flatMap(s => s.activity).sort((a, b) => b.at - a.at).slice(0, 60),
            live: id ? ([...hub.live.values()].find(call => call.sessionId === id) ?? null) : [...hub.live.values()],
            liveCalls,
            scope: hub.scope(scopeSession), running: agent?.status ?? 'idle', meter,
            frame: session ? meter.nodes.map(n => { const e = session.eventAt(n.seq), m = session.deriveEventMessage(e); return { seq: n.seq, role: m?.role, kind: m?.source?.plugin || m?.source?.kind || e.type, tokens: n.tokens ?? n.heuristicTokens, chars: eventText(session, e).length, checkpoint: Boolean(m?.source?.compactionId) }; }) : [],
            route: session?.requestHeader()?.config ? { provider: session.requestHeader().config.provider, model: session.requestHeader().config.model } : null,
          }); return;
        }
        send(res, 404, { error: '接口不存在' });
      } catch (error) { send(res, 400, { error: error.message }); }
    } }));
  });
}
