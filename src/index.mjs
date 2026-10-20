import { installOmaaEnhancement, omaaWorkflowComposition, omaaIdentityPrompt } from './omaa-enhancement.mjs';
import { readJsonBody as readBody, rejectUntrusted, sendJson as send } from './http.mjs';
import { installFileUploadCompatibility } from './file-upload-compat.mjs';
import { legacySettings } from './legacy-settings.mjs';
import { homedir } from 'node:os';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { realpath } from 'node:fs/promises';
import { migrateSessionStorage } from './session-migration.mjs';
import { currentDirectory } from './working-directory.mjs';
import { apiSessionTarget } from './api-session.mjs';
import { installLoaderLifecycleCompatibility } from './loader-lifecycle-compat.mjs';
import { installToolSchedulerCompatibility } from './tool-scheduler-compat.mjs';
import { installToolCancellationPresentation } from './tool-cancellation.mjs';
import { installSearchCompatibility } from './search-compat.mjs';
import { monitorSelection, compactMonitorSnapshot, unavailableMonitorMetrics } from './monitoring.mjs';
import { handleMonitorApi } from './monitor-api.mjs';
import { coldNativeMonitorTarget } from './monitor-session.mjs';
import { monitorQuery } from './monitor-ledger.mjs';
import { monitorCallStream } from './monitor-call.mjs';
import { validateSessionId } from './hub-store.mjs';
import { createVersionService, handleVersionApi } from './version.mjs';
import { VersionUpdater, handleVersionUpdateApi } from './version-update.mjs';
import { handleSkinAsset } from './skin-assets.mjs';
import { installImageBudget } from './image-budget.mjs';
import { Config } from './config.mjs';
import { neutralizeHostEnvironment } from './cc-adaptation/environment.mjs';
import { Hub } from "./hub.mjs";
import { installContextErrorRecovery } from './context/host.mjs';
import { currentTasks, restoreTaskProjection } from './tasks.mjs';
import { ensureSystemHead } from './system-head.mjs';
import { handleContextApi } from './context/api.mjs';
import { publishDreamMemory } from './dream/publication.mjs';
import { handleDreamApi } from './dream/api.mjs';
import { installTraceCleanup } from './context/trace.mjs';
import { installAdaptiveCapture } from './context/adaptive.mjs';
import { installCommandCodeCompatibility } from './commandcode-compat.mjs';
import { installComputerUseImageCompatibility } from './computer-use-image-compat.mjs';
import { trackProviderProfiles } from './llm-request-projection.mjs';
import { repairShadows } from './context/shadow.mjs';
import { TODO_NUDGE } from './todolist.mjs';
import { message } from './hub.mjs';
import { join } from 'node:path';
import { acquireComputer } from './opencu.mjs';
import { CodegraphRuntime } from './codegraph.mjs';
import { Components, mountComponents } from './components.mjs';
import { runtimeContext } from './runtime-state.mjs';
import { TaskBudgets, consumeBudgetAliases } from './task-budget.mjs';
import { WorkflowBudget } from '../vendor/workflow/src/budget.mjs';
import { UltracodeControl, installUltracodeProjection } from './ultracode.mjs';
import { installOverviewProjection } from './session-overview-projection.mjs';
import { setRuntimeContext, taskContextMeta } from './task-context.mjs';
import { installBackground } from './background.mjs';
import { mountRecommendedPlugins } from './recommended-plugins.mjs';
import { createPromptOptimizer, handlePromptOptimizerApi } from './prompt-optimizer.mjs';
import { installBtwCompatibility } from './btw-compat.mjs';
import { isBtwSession } from './btw-policy.mjs';
import { TemporaryChats, handleTemporaryChatApi } from './temporary-chat.mjs';
import { createProjectlessWorkspaceService } from './projectless-workspaces.mjs';

export { Config };
export const name = 'trisoul-x';
export const inject = ['loader', 'tools', 'llm', 'agents', 'sessions', 'settings', 'tokenMeter', 'sessionProjections', 'sessionPersistence'];

export async function apply(ctx, config) {
  installLoaderLifecycleCompatibility(ctx);
  installFileUploadCompatibility(ctx);
  const legacy = await legacySettings(ctx, 'trisoul-x', Config, ['opencu']);
  const directory = legacy.value.dataDir || config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'trisoul-x');
  installSearchCompatibility(ctx, directory);
  await migrateSessionStorage(ctx, directory);
  installToolSchedulerCompatibility(ctx);
  installToolCancellationPresentation(ctx);
  const hub = new Hub(ctx, { ...config, dataDir: directory });
  hub.omaaWorkflowComposition = omaaWorkflowComposition;
  hub.omaaIdentityPrompt = () => omaaIdentityPrompt(hub);
  const projectless = createProjectlessWorkspaceService({
    root: legacy.value.projectlessWorkspaceRoot || hub.config().projectlessWorkspaceRoot || join(homedir(), 'Documents', 'DSH'),
    storeDir: join(await realpath(hub.store.dir), 'projectless-workspaces'),
  });
  hub.projectless = projectless;
  const liveConfig = hub.getConfig;
  let importing = true;
  hub.getConfig = () => ({ ...liveConfig(), ...(importing ? legacy.current() : {}) });
  legacy.persist(() => { importing = false; });
  ctx.effect(() => { void hub.dream.start().catch(error => hub.dream.notice(error)); });
  hub.budgets = new TaskBudgets(hub);
  hub.workflowBudget = new WorkflowBudget(hub.store);
  ctx.effect(() => () => { for (const agent of hub.agents.values()) hub.budgets.dispose(agent.session); });
  const temporaryChats = new TemporaryChats(ctx);
  ctx.effect(() => () => temporaryChats.dispose());
  const promptOptimizer = createPromptOptimizer(ctx, hub);
  ctx.effect(() => () => promptOptimizer.dispose());
  hub.codegraph = new CodegraphRuntime({ cacheDir: join(hub.store.dir, 'components', 'codegraph'), enabled: hub.config().codegraphEnabled !== false, autoInstall: hub.config().componentAutoSetup !== false });
  ctx.effect(() => () => hub.codegraph.dispose());
  const nativeVersionService = createVersionService();
  hub.omaaInstalledVersion = nativeVersionService.snapshot().currentVersion;
  const omaaUpdates = () => ctx.get('omaa')?.updates;
  let omaaInactive = false;
  const originalVersionSnapshot = () => omaaInactive ? {
    ...nativeVersionService.snapshot(), status: 'unknown', latestVersion: null, releases: [],
    error: 'OMAA 已安装但未启用，请启用它以检查配对更新；卸载 OMAA 后可恢复原 OMD 更新。',
  } : nativeVersionService.snapshot();
  const sharedVersionSnapshot = shared => {
    if (!shared) return originalVersionSnapshot();
    const native = nativeVersionService.snapshot();
    return shared.currentRelease == null && shared.currentVersion === native.currentVersion
      ? { ...shared, currentRelease: native.currentRelease } : shared;
  };
  // While OMAA is installed, only its published pair may update this bridge.
  // Keep bundled notes for the same running version, never native update targets.
  // Disabling it pauses updates; removing it restores the original OMD feed.
  const versionService = {
    snapshot: () => sharedVersionSnapshot(omaaUpdates()?.omdVersionSnapshot()),
    async check(force) {
      const shared = omaaUpdates();
      if (shared) return sharedVersionSnapshot(await shared.omdVersionCheck(force));
      omaaInactive = Boolean((await ctx.get('pluginManager')?.listBundles())?.some(row => row.name === 'oh-my-agents-above-all' && row.installed));
      return omaaInactive ? originalVersionSnapshot() : nativeVersionService.check(force);
    },
    dispose: () => nativeVersionService.dispose(),
  };
  ctx.effect(() => () => versionService.dispose());
  const nativeVersionUpdater = new VersionUpdater({ versions: versionService, getManager: () => ctx.get('pluginManager'),
    isRunning: () => ctx.agents.list().some(agent => agent.status === 'running') });
  const versionUpdater = {
    snapshot: () => omaaUpdates()?.omdUpdateSnapshot() ?? nativeVersionUpdater.snapshot(),
    status: () => omaaUpdates()?.omdUpdateStatus() ?? nativeVersionUpdater.status(),
    start: version => omaaUpdates()?.start('omd', version) ?? nativeVersionUpdater.start(version),
    progress: event => { nativeVersionUpdater.progress(event); omaaUpdates()?.progress(event); },
    close: () => nativeVersionUpdater.close(),
  };
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
  const computer = acquireComputer();
  hub.installOmaaEnhancement = scope => installOmaaEnhancement(scope, computer);
  hub.components = new Components(ctx, hub);
  mountComponents(ctx, hub.components);
  ctx.effect(() => { hub.components.start(); return () => hub.components.close(); });
  mountRecommendedPlugins(ctx, hub);
  const isX = session => ['trisoul-x', 'omd-ptc'].includes(ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset);
  const isOmaaEnhanced = session => Boolean(ctx.get('omaa')?.enhancementEnabled(session));
  hub.ultracode = new UltracodeControl(ctx, session => isX(session) || (isOmaaEnhanced(session) && ctx.get('omaa').modeFor(session) === 'default'), hub.store);
  hub.omaaWorkMode = {
    inspect: (session, agent) => hub.ultracode.inspectView(session, agent),
    current: (session, agent = ctx.agents.get(session.id)) => isOmaaEnhanced(session) ? hub.ultracode.currentMode(agent) : 'off',
    submode: (session, agent = ctx.agents.get(session.id)) => hub.ultracode.currentSubmode(agent),
    async select(sessionId, mode, submode) {
      const before = await hub.ultracode.inspect(sessionId);
      if (!before.selected) throw new Error('当前会话没有可用的模型配置');
      return hub.ultracode.select(sessionId, { ...before.selected, mode, submode, expectedRevision: before.revision });
    },
    restore: (sessionId, snapshot) => hub.ultracode.restore(sessionId, snapshot),
  };
  const monitored = session => !isBtwSession(session) && (isX(session) || (session.header.origin === 'subagent' && Boolean(hub.workflowBudget.owner(session))));
  installUltracodeProjection(ctx);
  installOverviewProjection(ctx);
  ctx.on('agent/inbox/claimed', ({ agent, message }) => { if(!isBtwSession(agent.session))hub.ultracode.claimed(agent, message); }, { global: true });
  ctx.on('system-prompt/assemble', (_assembly, context, next) => context?.agent && !isBtwSession(context.agent.session)
    ? hub.ultracode.assemble(context.agent, next) : next(), { global: true, prepend: true });
  installBackground(ctx, hub, isX);
  trackProviderProfiles(ctx);
  installImageBudget(ctx, isX);
  installCommandCodeCompatibility(ctx, isX);
  installComputerUseImageCompatibility(ctx, isX);
  installTraceCleanup(ctx, isX, hub.context);
  installAdaptiveCapture(ctx, session => isX(session) && !isBtwSession(session), hub.context);
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
  ctx.on('agent/assistant-stream', ({ agent, frame }) => { if (frame.type === 'start' && isX(agent.session) && !isBtwSession(agent.session)) hub.captureFrame(agent, frame.turn, frame.step); }, { global: true });
  ctx.on('agent/pre-step', async ({ agent, messages, signal, turn, step }, next) => {
    if(isBtwSession(agent.session))return next();
    const consumed = isX(agent.session) || isOmaaEnhanced(agent.session) ? await consumeBudgetAliases(agent, messages, signal) : new Set();
    if (consumed.size && !messages.some(m => !consumed.has(m.id)) && step === 1) return { kind: 'reject' };
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    const accepted = consumed.size ? decision.messages.filter(m => !consumed.has(m.id)) : decision.messages;
    hub.workflowBudget.admit(agent.session, { turn, step, messages: accepted, enabled: isX(agent.session) || isOmaaEnhanced(agent.session) });
    pendingSteps.set(agent, { turn, step, messages: accepted });
    return { ...decision, messages: accepted };
  }, { global: true });
  ctx.on('agent/request', async ({ agent, signal, turn, step }, next) => {
    if(isBtwSession(agent.session))return next();
    const route = await next();
    if (isX(agent.session)) await hub.context.adapter.prepareRoute?.(agent.session, route, signal);
    const pending = pendingSteps.get(agent);
    if (pending?.turn === turn && pending.step === step) {
      pendingSteps.delete(agent);
      const messages = pending.messages;
    hub.budgets.tick(agent.session, isX(agent.session) && !signal.aborted);
    if (!isX(agent.session) && !signal.aborted && hub.agents.has(agent.session.id)) {
      publishDreamMemory(hub, agent.session, false);
      setRuntimeContext(agent.session, () => null);
      await hub.context.stripRuntime(agent.session);
    }
    if (isX(agent.session) && !signal.aborted && agent.session.header.origin !== 'subagent') {
      ensureSystemHead(agent.session, { turn, step });
      restoreTaskProjection(ctx, agent.session);
      const state = hub.store.state(agent.session.id);
      if (state.memoryScope == null) { state.memoryScope = hub.config().memoryScope; hub.store.save(state); }
      hub.agents.set(agent.session.id, agent);
      hub.components.project(currentDirectory(ctx, agent.session));
      // A pending write-ahead transaction must finish before sending another request.
      // Explicit full compaction and opt-in Auto Compact may await model work here.
      setRuntimeContext(agent.session, () => runtimeContext(agent, hub, { messages, turn, step }));
      await hub.context.preStep(agent, signal, route);
      const hints = hub.config();
      // preStep already retired every runtime block when both hints are off.
      if ((hints.stateHintsEnabled || hints.budgetHintsEnabled || Number(agent.session.header.delegationDepth) > 0)
        && (!hints.budgetHintsEnabled || hub.budgets.saved(agent.session)?.visible === false)
        && agent.session.deriveMessages().some(m => /^(?:预算(?:：|$)|Budget(?::|$))/m.test(taskContextMeta(m)?.runtime?.text ?? ''))) {
        await hub.context.stripRuntime(agent.session);
      }
      if (hub.todoStore) {
        hub.todoStore.maintainInjection(agent.session);
        if (messages.some(m => m.source?.kind === 'user')) agent.session.append('user/message', message(TODO_NUDGE, 'task-reminder'), { surfaceOp: 'append' });
      }
      await hub.context.autoCompact.check(agent, signal, { maintenance: false });
    }
    }
    // Old OMD placeholders can survive a preset switch or be inherited by a child.
    // Only repair our own shadows; ordinary user content remains untouched.
    if (!signal.aborted && (!isX(agent.session) || agent.session.header.origin === 'subagent' || Number(agent.session.header.delegationDepth) > 0)
      && repairShadows(agent.session)) await hub.context.adapter.flush(agent.session);
    if (!hub.closed && monitored(agent.session)) hub.requestStarts.set(agent.session.id, { startedAt: Date.now(), signal, turn, step });
    return route;
  }, { global: true });
  ctx.on('llm/stream', (options, next) => {
    if (isAgentLoopRequest(options) && options.sessionId) {
      const request = hub.requestStarts.get(options.sessionId);
      // This boundary sees the prepared adapter route, not the next model
      // selection nor the agent/request proposal before defaults are resolved.
      if (request && request.signal === options.signal) {
        request.route ??= Object.freeze({ provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort });
        return monitorCallStream(next(), request);
      }
    }
    return next();
  }, { global: true });
  installContextErrorRecovery(ctx, hub, session=>isX(session)&&!isBtwSession(session));
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => { if (isX(agent.session)&&!isBtwSession(agent.session)) hub.finishTasks(agent, turn, signal); }, { global: true });
  ctx.on('agent/status', ({ agent, status }) => {
    if(isBtwSession(agent.session))return;
    hub.budgets.tick(agent.session, isX(agent.session) && status === 'running');
    if (isX(agent.session)&&hub.context.agents.has(agent.session.id)) {
      hub.context.arm(agent);
      if (status === 'idle') hub.context.autoCompact.idle(agent);
    }
  }, { global: true });
  ctx.on('user-questions/request', ({ agent }, next) => agent && isX(agent.session) ? hub.budgets.waitForUser(agent, next) : next(), { global: true });
  ctx.on('agent/disposed', ({ agent }) => {
    hub.budgets.dispose(agent.session);
    // A preset can have changed before disposal; release resources we owned.
    const id = agent.session.id;
    hub.requestStarts.delete(id);
    if (!monitored(agent.session) && !hub.agents.has(id) && !hub.context.agents.has(id)) return;
    const disposed = hub.context.dispose(id); hub.taskReviews.delete(id); hub.agents.delete(id);
    return disposed;
  }, { global: true });
  ctx.on('session/disposed', session => {
    hub.requestStarts.delete(session.id);
    // Read-only historical sessions may never have created an agent.
    if (!hub.agents.has(session.id)) return hub.context.dispose(session.id);
  }, { global: true });
  ctx.on('agent/created', async ({ agent, source, signal }) => {
    if(isBtwSession(agent.session))return;
    hub.ultracode.lifecycle(agent, source);
    hub.workflowBudget.attach(agent.session);
    await hub.dream.sources.refreshScope(agent.session.header,signal);
    if (!monitored(agent.session)) return;
    const state = hub.store.state(agent.session.id);
    state.cwd = agent.session.header.cwd; state.parentSession = agent.session.header.parentSession;
    state.origin = agent.session.header.origin ?? null;
    if (agent.session.header.origin === 'subagent') { hub.store.save(state); return; }
    // Native create announces the agent before attaching Workspace membership.
    // Preserve the configured preference; defer a provisional Chat binding
    // until the first request can see the completed native registration.
    state.memoryScope ??= hub.scope(agent.session,{effective:false}).mode;
    hub.store.save(state); hub.agents.set(agent.session.id, agent);
    if(!hub.dream.sources.projectlessKnown(agent.session.header))hub.context.start(agent);
    hub.components.project(currentDirectory(ctx, agent.session));
  }, { global: true });
  ctx.on('session/created', async session => {
    if (!isX(session) || !session.header.parentSession || !session.header.isSeeded || session.header.origin === 'subagent') return;
    const state = hub.store.state(session.id);
    state.memoryScope ??= hub.scope(session,{effective:false}).mode;
    state.cwd = session.header.cwd; state.parentSession = session.header.parentSession; state.origin = session.header.origin ?? null;
    hub.store.save(state);
    // Seeded user events already lock the archive, so resolve inherited Chat
    // ownership before pinning its Context binding and historical records.
    await hub.dream.sources.refreshScope(session.header);
    hub.context.state(session);
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (!hub.dream.closed) hub.dream.sources.observe(session, event);
    if(isBtwSession(session))return;
    hub.ultracode.committed(session, event);
    hub.workflowBudget.observe(session, event);
    if (!monitored(session) && !hub.requestStarts.has(session.id)) return;
    hub.observe(session, event);
    if (isX(session)) hub.context.observe(session, event);
  }, { global: true });
  // Capture completed assemblies after OMD's mode-specific prompt middleware
  // has been registered, so side questions reuse the full parent assembly.
  installBtwCompatibility(ctx);
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/trisoul-x/api', async handler(req, res) {
      try {
        const url = new URL(req.url, 'http://localhost'), id = url.searchParams.get('session');
        if (await handleVersionApi({ req, res, url, service: versionService, send })) return;
        if (rejectUntrusted(ctx, req, res)) return;
        if (await handleSkinAsset(req, res, url)) return;
        if (await handleTemporaryChatApi({ service: temporaryChats, req, res, url })) return;
        if (url.pathname === '/trisoul-x/api/projectless-workspace') {
          if (req.method === 'GET') {
            send(res, 200, { managed: await projectless.owns(url.searchParams.get('cwd') || '') }); return;
          }
          if (req.method === 'POST') { send(res, 200, await projectless.prepare(await readBody(req))); return; }
          send(res, 405, { error: '不支持此方法' }); return;
        }
        if (await handleDreamApi({ hub, ctx, req, res, url, send, readBody })) return;
        if (url.pathname === '/trisoul-x/api/model-mode') {
          if (!id) { send(res, 400, { error: '缺少会话编号' }); return; }
          if (req.method === 'POST') { send(res, 200, await hub.ultracode.select(id, await readBody(req))); return; }
          if (req.method === 'GET') {
            validateSessionId(id);
            const reading = new AbortController(), abortRead = () => reading.abort(new Error('模型模式读取已取消'));
            req.once?.('aborted', abortRead); res.once?.('close', abortRead);
            try {
              if (req.aborted || res.destroyed) abortRead();
              send(res, 200, await hub.ultracode.inspect(id, reading.signal));
            } finally { req.off?.('aborted', abortRead); res.off?.('close', abortRead); }
            return;
          }
          send(res, 405, { error: '不支持此方法' }); return;
        }
        if (await handleVersionUpdateApi({ req, res, url, service: versionUpdater, send })) return;
        if (await handlePromptOptimizerApi({ ctx, service: promptOptimizer, req, res, url, getSession: () => id ? ctx.agents.get(id)?.session ?? ctx.sessions.get(id) : undefined, send })) return;
        if (await handleMonitorApi({ hub, ctx, req, res, url, send })) return;
        if (url.pathname === '/trisoul-x/api/state' && req.method === 'GET' && url.searchParams.get('view') === 'summary') {
          if (id) validateSessionId(id);
          const agent = id ? ctx.agents.get(id) : undefined;
          const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
          const query = monitorQuery({ session: id || '', range: url.searchParams.get('range') || 'session' });
          const { ids, selected: all, metrics: legacyMetrics, actions } = monitorSelection(hub.store.monitorStates(), id, query.range);
          if (id && !session && !all.some(state => state.id === id) && !hub.monitor.hasSession(id)
            && !await coldNativeMonitorTarget(ctx, id, req, res)) {
            send(res, 404, { error: '会话不存在' }); return;
          }
          let metrics;
          try { metrics = hub.monitor.query(all, ids, query).metrics; }
          catch { metrics = unavailableMonitorMetrics(legacyMetrics); }
          let meter = null;
          try { if (session) meter = ctx.tokenMeter.measure(session); } catch {}
          const liveCalls = [...hub.live.values()].filter(call => !id || url.searchParams.get('range') === 'all' || ids.has(call.sessionId));
          res.setHeader('Cache-Control', 'no-store');
          send(res, 200, compactMonitorSnapshot({ metrics, actions, meter, liveCalls, sessionCount: all.length, running: agent?.status ?? 'idle' })); return;
        }
        const readTarget = async () => {
          const reading = new AbortController();
          const abortRead = () => reading.abort(new Error('会话读取已取消'));
          req.once?.('aborted', abortRead); res.once?.('close', abortRead);
          try {
            if (req.aborted || res.destroyed) abortRead();
            return await apiSessionTarget(ctx, hub.store, id, reading.signal);
          } finally { req.off?.('aborted', abortRead); res.off?.('close', abortRead); }
        };
        const target = await readTarget();
        const { agent, session, stored, inspection, archivedOnly } = target;
        if (!target.found) { send(res, 404, { error: '会话不存在' }); return; }
        const scopeSession = session ?? { id: id || 'settings', header: inspection?.meta ?? { cwd: stored?.cwd || process.cwd() } };
        if (url.pathname === '/trisoul-x/api/background-wait' && req.method === 'GET') {
          const denied = ctx.get('connection')?.requestRejection(req);
          if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
          res.setHeader('Cache-Control', 'no-store');
          send(res, 200, { waiting: hub.backgroundWaiting(agent) }); return;
        }
        if (await handleContextApi({ hub, ctx, req, res, url, session, agent, inspection, archivedOnly, refreshSession: readTarget, id, send, readBody })) return;
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
          // Settings read config and providers; the record view reads notes and tasks.
          // Usage and context meters are served by /monitor and /context.
          const directory = id ? [] : await Promise.all(ctx.llm.listProviders().map(async provider => ({ ...provider, models: await ctx.llm.listModels(provider.id).catch(() => []) })));
          res.setHeader('Cache-Control', 'no-store');
          send(res, 200, {
            config: hub.config(), directory,
            notes: stored?.notes || [],
            legacyContext: stored && (stored.status || stored.pins?.length || stored.memoryContext?.doc || stored.checkpoint || stored.digests?.length || stored.probe || stored.probeNotes?.length) ? {
              status: stored.status, pins: stored.pins, workdoc: stored.memoryContext?.doc, checkpoint: stored.checkpoint,
              digests: stored.digests, probe: stored.probe, probeNotes: stored.probeNotes,
            } : null,
            tasks: currentTasks(session, stored?.taskList ?? stored?.tasks), taskRelease: stored?.taskRelease,
            scope: hub.scope(scopeSession), running: agent?.status ?? 'idle',
            route: session?.requestHeader()?.config ? { provider: session.requestHeader().config.provider, model: session.requestHeader().config.model } : null,
          }); return;
        }
        send(res, 404, { error: '接口不存在' });
      } catch (error) { send(res, error.statusCode || 400, { error: error.message }); }
    } }));
  });
}
