import { readJsonBody as readBody, rejectUntrusted } from './http.mjs';
import { installFileUploadCompatibility } from './file-upload-compat.mjs';
import { legacySettings } from '#opencu/src/legacy-settings.mjs';
import { homedir } from 'node:os';
import { migrateSessionStorage } from './session-migration.mjs';
import { sourceName } from './message-source.mjs';
import { installLoaderLifecycleCompatibility } from './loader-lifecycle-compat.mjs';
import { installToolSchedulerCompatibility } from './tool-scheduler-compat.mjs';
import { monitorSelection, compactMonitorSnapshot } from './monitoring.mjs';
import { createVersionService, handleVersionApi } from './version.mjs';
import { VersionUpdater, handleVersionUpdateApi } from './version-update.mjs';
import { installImageBudget } from './image-budget.mjs';
import { Config } from './config.mjs';
import { neutralizeHostEnvironment } from './cc-adaptation/environment.mjs';
import { Hub, NS } from './hub.mjs';
import { eventText } from './hub.mjs';
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { currentTasks, restoreTaskProjection } from './tasks.mjs';
import { ensureSystemHead } from './system-head.mjs';
import { handleContextApi } from './context/api.mjs';
import { installTraceCleanup } from './context/trace.mjs';
import { repairShadows } from './context/shadow.mjs';
import { TODO_NUDGE } from './todolist.mjs';
import { message } from './hub.mjs';
import { join } from 'node:path';
import { acquireComputerUse } from '#opencu/integration';
import { CodegraphRuntime } from './codegraph.mjs';
import { Components, mountComponents } from './components.mjs';
import { runtimeContext } from './runtime-state.mjs';
import { TaskBudgets, consumeBudgetAliases } from './task-budget.mjs';
import { WorkflowBudget } from './workflow-budget.mjs';
import { UltracodeControl, installUltracodeProjection } from './ultracode.mjs';
import { setRuntimeContext, taskContextMeta } from './task-context.mjs';
import { installBackground } from './background.mjs';
import { mountRecommendedPlugins } from './recommended-plugins.mjs';
import { createPromptOptimizer, handlePromptOptimizerApi } from './prompt-optimizer.mjs';

export { Config };
export const name = 'trisoul-x';
export const inject = ['loader', 'tools', 'llm', 'agents', 'sessions', 'settings', 'tokenMeter', 'sessionProjections', 'sessionPersistence'];
const send = (res, status, value) => { if (res.destroyed || res.writableEnded) return; if (res.headersSent) { res.destroy(); return; } res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(status === 413 || status === 408 ? { Connection: 'close' } : {}) }); res.end(JSON.stringify(value)); };

export async function apply(ctx, config) {
  installLoaderLifecycleCompatibility(ctx);
  installFileUploadCompatibility(ctx);
  const legacy = await legacySettings(ctx, 'trisoul-x', Config, ['opencu']);
  const directory = legacy.value.dataDir || config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'trisoul-x');
  await migrateSessionStorage(ctx, directory);
  installToolSchedulerCompatibility(ctx);
  const hub = new Hub(ctx, { ...config, dataDir: directory });
  const liveConfig = hub.getConfig;
  let overlay = legacy.value;
  hub.getConfig = () => ({ ...liveConfig(), ...overlay });
  legacy.persist(() => { overlay = {}; });
  hub.budgets = new TaskBudgets(hub);
  hub.workflowBudget = new WorkflowBudget(hub.store);
  ctx.effect(() => () => { for (const agent of hub.agents.values()) hub.budgets.dispose(agent.session); });
  const promptOptimizer = createPromptOptimizer(ctx, hub);
  ctx.effect(() => () => promptOptimizer.dispose());
  hub.codegraph = new CodegraphRuntime({ cacheDir: join(hub.store.dir, 'components', 'codegraph'), enabled: hub.config().codegraphEnabled !== false, autoInstall: hub.config().componentAutoSetup !== false });
  ctx.effect(() => () => hub.codegraph.dispose());
  const versionService = createVersionService();
  ctx.effect(() => () => versionService.dispose());
  const versionUpdater = new VersionUpdater({ versions: versionService, getManager: () => ctx.get('pluginManager'),
    isRunning: () => ctx.agents.list().some(agent => agent.status === 'running') });
  ctx.effect(() => () => versionUpdater.close());
  ctx.on('plugin-manager/install-state', progress => versionUpdater.progress(progress), { global: true });
  ctx.effect(() => ctx.settings.configure({ auto: false }));
  let currentConfig = JSON.stringify(hub.config());
  ctx.on('app-boot/config-reload', () => {
    const next = JSON.stringify(hub.config());
    if (next === currentConfig) return;
    currentConfig = next;
    hub.context.reconfigure();
  });
  const computer = await acquireComputerUse(ctx, { namespace: 'trisoul-x', getConfig: () => hub.config(), dataDir: join(hub.store.dir, 'computer-use') });
  hub.components = new Components(ctx, hub, computer);
  mountComponents(ctx, hub.components);
  ctx.effect(() => { hub.components.start(); return () => hub.components.close(); });
  mountRecommendedPlugins(ctx, hub);
  const isX = session => ['trisoul-x', 'omd-ptc'].includes(ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset);
  hub.ultracode = new UltracodeControl(ctx, isX, hub.store);
  installUltracodeProjection(ctx);
  ctx.on('agent/inbox/claimed', ({ agent, message }) => hub.ultracode.claimed(agent, message), { global: true });
  ctx.on('system-prompt/assemble', (_assembly, context, next) => context?.agent
    ? hub.ultracode.assemble(context.agent, next) : next(), { global: true, prepend: true });
  installBackground(ctx, hub, isX);
  installImageBudget(ctx, isX);
  installTraceCleanup(ctx, isX, hub.context);
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    if (context?.agent) hub.prepareBackground(context.agent);
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
  const pendingSteps = new WeakMap();
  ctx.on('agent/assistant-stream', ({ agent, frame }) => { if (frame.type === 'start' && isX(agent.session)) hub.captureFrame(agent, frame.turn, frame.step); }, { global: true });
  ctx.on('agent/pre-step', async ({ agent, messages, signal, turn, step }, next) => {
    const consumed = isX(agent.session) ? await consumeBudgetAliases(agent, messages, signal) : new Set();
    if (consumed.size && !messages.some(m => !consumed.has(m.id)) && step === 1) return { kind: 'reject' };
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    const accepted = consumed.size ? decision.messages.filter(m => !consumed.has(m.id)) : decision.messages;
    hub.workflowBudget.admit(agent.session, { turn, step, messages: accepted, enabled: isX(agent.session) });
    pendingSteps.set(agent, { turn, step, messages: accepted });
    return { ...decision, messages: accepted };
  }, { global: true });
  ctx.on('agent/request', async ({ agent, signal, turn, step }, next) => {
    const route = await next();
    if (isX(agent.session)) await hub.context.adapter.prepareRoute?.(agent.session, route, signal);
    const pending = pendingSteps.get(agent);
    if (pending?.turn === turn && pending.step === step) {
      pendingSteps.delete(agent);
      const messages = pending.messages;
    hub.budgets.tick(agent.session, isX(agent.session) && !signal.aborted);
    if (!isX(agent.session) && !signal.aborted && hub.agents.has(agent.session.id)) {
      setRuntimeContext(agent.session, () => null);
      await hub.context.stripRuntime(agent.session);
    }
    if (isX(agent.session) && !signal.aborted && agent.session.header.origin !== 'subagent') {
      ensureSystemHead(agent.session, { turn, step });
      restoreTaskProjection(ctx, agent.session);
      const state = hub.store.state(agent.session.id);
      if (state.memoryScope == null) { state.memoryScope = hub.config().memoryScope; hub.store.save(state); }
      hub.agents.set(agent.session.id, agent);
      hub.components.project(agent.session.header.cwd);
      // A pending write-ahead transaction must finish before sending another request.
      // Only an explicitly queued full-compaction command can await model work here.
      setRuntimeContext(agent.session, () => runtimeContext(agent, hub, { messages, turn, step }));
      await hub.context.preStep(agent, signal);
      if ((!hub.config().budgetHintsEnabled || hub.budgets.saved(agent.session)?.visible === false)
        && agent.session.deriveMessages().some(m => /^预算(?:：|$)/m.test(taskContextMeta(m)?.runtime?.text ?? ''))) {
        await hub.context.stripRuntime(agent.session);
      }
      if (hub.todoStore) {
        hub.todoStore.maintainInjection(agent.session);
        if (messages.some(m => m.source?.kind === 'user')) agent.session.append('user/message', message(TODO_NUDGE, 'task-reminder'), { surfaceOp: 'append' });
      }
    }
    }
    // Old OMD placeholders can survive a preset switch or be inherited by a child.
    // Only repair our own shadows; ordinary user content remains untouched.
    if (!signal.aborted && (!isX(agent.session) || agent.session.header.origin === 'subagent' || Number(agent.session.header.delegationDepth) > 0)
      && repairShadows(agent.session)) await hub.context.adapter.flush(agent.session);
    if (isX(agent.session)) hub.requestStarts.set(agent.session.id, Date.now());
    return route;
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
  ctx.on('agent/status', ({ agent, status }) => {
    hub.budgets.tick(agent.session, isX(agent.session) && status === 'running');
    if (isX(agent.session)) hub.context.arm(agent);
  }, { global: true });
  ctx.on('user-questions/request', ({ agent }, next) => agent && isX(agent.session) ? hub.budgets.waitForUser(agent, next) : next(), { global: true });
  ctx.on('agent/disposed', ({ agent }) => {
    hub.budgets.dispose(agent.session);
    // A preset can have changed before disposal; release resources we owned.
    const id = agent.session.id;
    if (!isX(agent.session) && !hub.agents.has(id) && !hub.context.agents.has(id)) return;
    const disposed = hub.context.dispose(id); hub.taskReviews.delete(id); hub.agents.delete(id); hub.requestStarts.delete(id);
    return disposed;
  }, { global: true });
  ctx.on('session/disposed', session => {
    // Read-only historical sessions may never have created an agent.
    if (!hub.agents.has(session.id)) return hub.context.dispose(session.id);
  }, { global: true });
  ctx.on('agent/created', ({ agent, source }) => {
    hub.ultracode.lifecycle(agent, source);
    hub.workflowBudget.attach(agent.session);
    if (!isX(agent.session) || agent.session.header.origin === 'subagent') return;
    const state = hub.store.state(agent.session.id);
    state.memoryScope ??= hub.config().memoryScope;
    state.cwd = agent.session.header.cwd; state.parentSession = agent.session.header.parentSession;
    hub.store.save(state); hub.agents.set(agent.session.id, agent); hub.context.start(agent);
    hub.components.project(agent.session.header.cwd);
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    hub.ultracode.committed(session, event);
    hub.workflowBudget.observe(session, event);
    if (!isX(session)) return;
    hub.observe(session, event);
    hub.context.observe(session, event);
  }, { global: true });
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/trisoul-x/api', async handler(req, res) {
      try {
        const url = new URL(req.url, 'http://localhost'), id = url.searchParams.get('session');
        if (await handleVersionApi({ req, res, url, service: versionService, send })) return;
        if (rejectUntrusted(ctx, req, res)) return;
        if (url.pathname === '/trisoul-x/api/model-mode') {
          if (!id) { send(res, 400, { error: '缺少会话编号' }); return; }
          if (req.method === 'POST') { send(res, 200, await hub.ultracode.select(id, await readBody(req))); return; }
          if (req.method === 'GET') { send(res, 200, await hub.ultracode.inspect(id)); return; }
          send(res, 405, { error: '不支持此方法' }); return;
        }
        if (await handleVersionUpdateApi({ req, res, url, service: versionUpdater, send })) return;
        if (await handlePromptOptimizerApi({ ctx, service: promptOptimizer, req, res, url, getSession: () => id ? ctx.agents.get(id)?.session ?? ctx.sessions.get(id) : undefined, send })) return;
        const agent = id ? ctx.agents.get(id) : undefined;
        const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
        const stored = id ? hub.store.peek(id) : undefined;
        if (id && !session && !stored) { send(res, 404, { error: '会话不存在' }); return; }
        const scopeSession = session ?? { id: id || 'settings', header: { cwd: stored?.cwd || process.cwd() } };
        if (url.pathname === '/trisoul-x/api/background-wait' && req.method === 'GET') {
          const denied = ctx.get('connection')?.requestRejection(req);
          if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
          res.setHeader('Cache-Control', 'no-store');
          send(res, 200, { waiting: hub.backgroundWaiting(agent) }); return;
        }
        if (await handleContextApi({ hub, ctx, req, res, url, session, agent, id, send, readBody })) return;
        if (url.pathname === '/trisoul-x/api/better-todo') {
          if (!id) { send(res, 400, { error: '请选择一个会话' }); return; }
          if (!['GET', 'POST'].includes(req.method)) { send(res, 405, { error: 'Method not allowed' }); return; }
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
          const unreadableArchives = hub.store.monitorErrors.size;
          const meter = session ? ctx.tokenMeter.measure(session) : null;
          const liveCalls = [...hub.live.values()].filter(call => !id || url.searchParams.get('range') === 'all' || ids.has(call.sessionId));
          res.setHeader('Cache-Control', 'no-store');
          if (url.searchParams.get('view') === 'summary') {
            send(res, 200, { ...compactMonitorSnapshot({ metrics, actions, meter, liveCalls, sessionCount: all.length, running: agent?.status ?? 'idle' }), unreadableArchives }); return;
          }
          send(res, 200, {
            config: hub.config(), directory, metrics, actions, unreadableArchives, sessionCount: all.length, contextHistory: stored?.contextHistory || [],
            notes: stored?.notes || [],
            legacyContext: stored && (stored.status || stored.pins?.length || stored.memoryContext?.doc || stored.checkpoint || stored.digests?.length || stored.probe || stored.probeNotes?.length) ? {
              status: stored.status, pins: stored.pins, workdoc: stored.memoryContext?.doc, checkpoint: stored.checkpoint,
              digests: stored.digests, probe: stored.probe, probeNotes: stored.probeNotes,
            } : null,
            contextPipeline: session && session.header.origin !== 'subagent' ? hub.context.view(session) : null,
            tasks: currentTasks(session, stored?.taskList ?? stored?.tasks), taskRelease: stored?.taskRelease,
            activity: all.flatMap(s => s.activity).sort((a, b) => b.at - a.at).slice(0, 60),
            live: id ? ([...hub.live.values()].find(call => call.sessionId === id) ?? null) : [...hub.live.values()],
            liveCalls,
            scope: hub.scope(scopeSession), running: agent?.status ?? 'idle', meter,
            frame: session ? meter.nodes.map(n => { const e = session.eventAt(n.seq), m = session.deriveEventMessage(e); return { seq: n.seq, role: m?.role, kind: sourceName(m?.source) || m?.source?.kind || e.type, tokens: n.tokens ?? n.heuristicTokens, chars: eventText(session, e).length, checkpoint: Boolean(m?.source?.compactionId) }; }) : [],
            route: session?.requestHeader()?.config ? { provider: session.requestHeader().config.provider, model: session.requestHeader().config.model } : null,
          }); return;
        }
        send(res, 404, { error: '接口不存在' });
      } catch (error) { send(res, error.statusCode || 400, { error: error.message }); }
    } }));
  });
}
