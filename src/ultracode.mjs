import { createHash } from 'node:crypto';
import { promptText } from './cc-adaptation/texts.mjs';
import { highestEffort } from './model-efforts.mjs';
import { z } from 'zod';
import { apiSessionTarget } from './api-session.mjs';
import { isOmdPreset } from './legacy-identity.mjs';
import { validateSessionId } from './hub-store.mjs';

export const ULTRA_WORKFLOW_ON = "Ultra Workflow mode is on. Use the Workflow tool on substantive tasks to delegate concrete requirements under the shared Ultra quality and initiative requirements. See the workflow authoring reference for the actual tool API.";
export const ULTRA_OFF = "Ultra is off. Its standing multi-agent authorization and selected collaboration strategy no longer apply; follow the user's current task and the tools' ordinary guidance.";
export const ULTRA_SUBMODES = new Set(['workflow', 'team', 'free']);
const modes = new Set(['off', 'ultra']);
// Keep the storage key readable by existing archives, but retire the old
// exhaustive Ultracode mode (including enabled-only records and keywords).
export function savedUltraMode(state) {
  if (state?.mode === 'pro') return { mode: 'ultra', submode: 'workflow' };
  return { mode: state?.mode === 'ultra' ? 'ultra' : 'off',
    submode: ULTRA_SUBMODES.has(state?.submode) ? state.submode : 'free' };
}
const same = (a, b) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
const human = message => message?.source?.kind === 'user';
const emptyFold = () => ({ through: 0, model: null, pendingModel: null, request: null, preset: undefined, turn: 0, humans: 0, humanIds: new Set() });
function foldEvent(state, event) {
  if (event.type === 'model/selection') {
    state.model = { ...event.data, seq: event.seq };
    state.pendingModel = state.model;
  } else if (event.type === 'request/header') {
    state.request = event.data.header;
    // Match the native modelSelection projection: a matching request consumes
    // pending intent, while a different in-flight request leaves it intact.
    if (same(state.pendingModel, state.request.config)) state.pendingModel = null;
  }
  else if (event.type === 'agent-preset/selected') state.preset = event.data.agentPreset;
  else if (event.type === 'turn/start') state.turn = event.data.turn;
  else if (event.type === 'user/message' && human(event.data) && !state.humanIds.has(event.data.id)) { state.humanIds.add(event.data.id); state.humans++; }
}
// Fold detached native data, not a substitute Session or a projection registration.
export function foldUltracodeEvents(events) {
  const state = emptyFold();
  for (const event of events) {
    if (!event || event.seq !== state.through || typeof event.type !== 'string') throw Error('原生会话事件顺序或记录无效');
    if (event.type === 'model/selection' && (typeof event.data?.provider !== 'string' || typeof event.data?.model !== 'string')
      || event.type === 'agent-preset/selected' && typeof event.data?.agentPreset !== 'string'
      || event.type === 'request/header' && (!event.data?.header?.config || typeof event.data.header.config.provider !== 'string' || typeof event.data.header.config.model !== 'string')) throw Error('原生会话选择或请求记录无效');
    foldEvent(state, event); state.through++;
  }
  return state;
}
export function hasNativeTeamTools(schemas = []) {
  const tools = new Map(schemas.map(tool => [tool.name, tool]));
  return ['spawn_teammate', 'send_message', 'list_agents', 'wait_agent',
    'team_task_create', 'team_task_list', 'team_task_get', 'team_task_update'].every(name => tools.has(name))
    && Object.hasOwn(tools.get('send_message').parameters?.properties ?? {}, 'target');
}
function modeView(state, route, mode, eligible, teamAvailable = false) {
  const selected = route ? { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } : null;
  const remembered = savedUltraMode(mode);
  const saved = state.model && mode?.selectionSeq === state.model.seq ? remembered.mode : 'off';
  const submode = remembered.submode === 'team' && !teamAvailable ? 'free' : remembered.submode;
  return { selected, mode: eligible ? saved : 'off', submode, savedSubmode: remembered.submode, teamAvailable, savedMode: saved, enabled: saved !== 'off' && eligible, savedEnabled: saved !== 'off', eligible, revision: state.model?.seq ?? -1 };
}
export function installUltracodeProjection(ctx) {
  const schema = z.object({ revision: z.number() });
  ctx.sessionProjections.register({ key: 'omdUltracode', stateVersion: 2, stateSchema: schema,
    init: () => ({ revision: -1 }),
    apply(state, event) {
      if (event.type === 'model/selection') return { revision: event.seq };
      return state;
    },
    wire: { viewSchema: schema, view: value => value },
  });
}

/** Native selection is authoritative; plugin-owned durable state supplies mode intent.
 * The pinned host cannot append ignorable extension events. Never put unknown
 * events in its session log: stock readers would refuse to restore the session.
 */
export class UltracodeControl {
  constructor(ctx, isOmd, store) {
    this.ctx = ctx; this.isOmd = isOmd; this.store = store;
    this.folds = new WeakMap(); this.claims = new WeakMap(); this.frames = new WeakMap(); this.active = new WeakMap(); this.fresh = new WeakSet(); this.writes = new Map();
    const quality = promptText('runtime/ultra-quality.md');
    const texts = { workflow: promptText('runtime/workflow-authoring.md'), team: promptText('runtime/ultra-team.md'), free: promptText('runtime/ultra-free.md') };
    this.guides = Object.fromEntries(Object.entries(texts).map(([mode, strategy]) => {
      const text = quality + '\n\n' + strategy;
      return [mode, { text, hash: createHash('sha256').update(text).digest('hex') }];
    }));
  }
  fold(session) {
    let state = this.folds.get(session);
    if (!state || state.through > session.seq) {
      state = emptyFold();
      this.folds.set(session, state);
    }
    while (state.through < session.seq) {
      const event = session.eventAt(state.through++);
      foldEvent(state, event);
    }
    return state;
  }
  persist(session, patch) {
    const state = this.store.state(session.id), next = { ...state.ultracode, ...patch };
    this.store.update(state, { ultracode: next });
  }
  eligible(agent) {
    if (!agent || agent.session.header.origin === 'subagent' || !this.isOmd(agent.session)) return false;
    return Boolean(agent.ctx.get('tools')?.schemas(agent).find(tool => tool.name === 'workflow')?.parameters?.properties?.resumeFromRunId);
  }
  teamAvailable(agent) {
    return Boolean(agent && hasNativeTeamTools(agent.ctx.get('tools')?.schemas(agent)));
  }
  coldTeamAvailable() {
    // Native Team tools are installed per live Agent. For a cold session only
    // read DSH's existing service and active plugin; never hydrate or enable it.
    return Boolean(this.ctx.get('agentTeams') && [...this.ctx.get('loader')?.entries() ?? []].some(entry =>
      entry.options.name === '@deepseek-ai/dsh-experimental-tool-agent-team' && !entry.disabled && entry.fiber?.state === 2));
  }
  view(session, agent = this.ctx.agents.get(session.id)) {
    const state = this.fold(session);
    const route = state.pendingModel ?? state.request?.config ?? session.requestHeader?.()?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    const view = modeView(state, route, this.store.peek(session.id)?.ultracode, this.eligible(agent), this.teamAvailable(agent));
    const active = agent && this.active.get(agent);
    const activeSubmode = active?.submode === 'team' && !view.teamAvailable ? 'free' : active?.submode;
    const currentMode = view.eligible && agent?.status === 'running' && active ? active.mode : view.mode;
    const currentSubmode = agent?.status === 'running' && active ? activeSubmode : view.submode;
    return { ...view, currentMode, currentSubmode,
      pending: agent?.status === 'running' && Boolean(active && (currentMode !== view.mode || currentSubmode !== view.submode)) };
  }
  async settled(sessionId, signal) {
    let pending;
    do {
      pending = this.writes.get(sessionId);
      await pending?.catch(() => {}); signal?.throwIfAborted();
    } while (pending && this.writes.get(sessionId) && this.writes.get(sessionId) !== pending);
  }
  async inspectView(session, agent) {
    await this.settled(session.id);
    return this.view(session, agent);
  }
  async agent(sessionId) {
    let agent = this.ctx.agents.get(sessionId);
    if (!agent) {
      const controller = this.ctx.get('sessionController');
      if (!controller) throw new Error('当前宿主未提供模型选择服务');
      const resolved = await controller.resolveAgent(sessionId);
      if (resolved.error) throw resolved.error;
      agent = resolved.agent;
    }
    if (!agent) throw new Error('会话尚未恢复，请重试');
    // Ordinary user forks have durable lineage but no native runtime ownership.
    this.assertTarget(sessionId, agent.session.header, agent);
    return agent;
  }
  assertTarget(sessionId, header, agent) {
    if ((header?.id !== undefined && header.id !== sessionId) || (agent && agent.session.id !== sessionId)) throw Error('原生会话查询身份无效');
    const parent = header?.parentSession && this.ctx.agents.get(header.parentSession);
    if (header?.origin === 'subagent' || agent && parent && this.ctx.agents.isOwnedBy?.(agent.id, parent)) throw Error('不能通过模型面板接管子代理会话');
  }
  async coldCapability(preset, signal) {
    const unavailable = reason => ({ eligible: false, capability: 'cold-unavailable', workflowResumeReady: false,
      reason: reason + ' 冷会话尚未 hydration，Workflow resume 能力未就绪。' });
    if (!isOmdPreset(preset)) return unavailable('原生历史当前不是 OMD preset；工作模式未启用。');
    const presets = this.ctx.get('agentPresets'), tools = this.ctx.get('tools');
    if (typeof presets?.compositionInventory !== 'function' || typeof presets?.acquireScope !== 'function' || typeof tools?.schemas !== 'function') return unavailable('冷会话尚未 hydration；宿主不能只读核对当前 preset 与 Workflow。');
    const inventory = await presets.compositionInventory(); signal?.throwIfAborted();
    if (!Array.isArray(inventory)) throw Error('原生 preset 配置查询无效');
    const current = inventory.find(row => row.id === preset);
    if (!current || current.broken !== undefined || !current.rows?.some(row => row.moduleName === 'oh-my-dsh/host/tool-workflow' && row.enabled === true && row.fiberState === 2)) return unavailable('当前 OMD Workflow bundle 不可用；保留已保存模式，恢复后需重新核对。');
    // The native cold-read lease exposes the standing preset's public tool view.
    // It neither creates/binds an Agent nor mounts a new preset revision.
    const lease = await presets.acquireScope(preset);
    try {
      signal?.throwIfAborted();
      const schemas = tools.schemas(lease.key);
      if (!Array.isArray(schemas)) throw Error('原生 Workflow 工具查询无效');
      if (!schemas.some(tool => tool.name === 'workflow' && tool.parameters?.properties?.resumeFromRunId)) return unavailable('当前 preset 的公开 Workflow resume schema 不可用；保留已保存模式。');
      return { eligible: true, capability: 'cold-preset', workflowResumeReady: false, reason: '冷会话尚未 hydration；当前 OMD preset 与公开 Workflow schema 已只读核对，模式将在有意恢复后重新核验，并非已可执行的 resume 能力。' };
    } finally { await lease[Symbol.asyncDispose](); }
  }
  async inspect(sessionId, signal) {
    validateSessionId(sessionId); signal?.throwIfAborted();
    await this.settled(sessionId, signal); signal?.throwIfAborted();
    const target = await apiSessionTarget(this.ctx, this.store, sessionId, signal);
    if (!target.found) throw Object.assign(Error('会话不存在'), { statusCode: 404 });
    const { session, agent, stored, inspection } = target;
    if ((session && session.id !== sessionId) || (stored && stored.id !== sessionId)) throw Error('会话存档身份不匹配');
    this.assertTarget(sessionId, session?.header ?? inspection?.meta ?? stored, agent);
    if (agent) return this.view(session, agent);
    if (target.archivedOnly) {
      const { mode: saved, submode } = savedUltraMode(stored?.ultracode);
      return { selected: null, mode: 'off', submode: submode === 'team' ? 'free' : submode, savedSubmode: submode, teamAvailable: false, savedMode: saved, enabled: false, savedEnabled: saved !== 'off', eligible: false, revision: -1,
        cold: true, archivedOnly: true, capability: 'archived-only', workflowResumeReady: false, reason: '仅有 OMD 存档，原生会话不存在；保存模式不代表可恢复的模型选择或 Workflow 能力。' };
    }
    const header = session?.header ?? inspection.meta, events = session ? session.snapshotEvents() : inspection.events;
    if (inspection && (!Number.isSafeInteger(inspection.inheritedEventCount) || inspection.inheritedEventCount < 0 || inspection.inheritedEventCount > events.length)) throw Error('原生会话继承记录无效');
    if (events.some(event => event?.sessionId !== undefined && event.sessionId !== sessionId)) throw Error('原生会话事件身份无效');
    const state = foldUltracodeEvents(events);
    // Match the native agentPreset projection, including an inherited selection.
    const preset = state.preset === undefined ? header.agentPreset : state.preset;
    const capability = await this.coldCapability(preset, signal); signal?.throwIfAborted();
    const route = state.pendingModel ?? state.request?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    return { ...modeView(state, route, stored?.ultracode, capability.eligible, this.coldTeamAvailable()), ...capability, cold: true, archivedOnly: false, preset: preset ?? null };
  }
  select(sessionId, input) { return this.writeSelection(sessionId, input); }
  // Compensation restores intent, including a remembered Team whose native
  // tools are currently unavailable. This is not a user-selectable override.
  async restore(sessionId, snapshot) {
    const before = await this.inspect(sessionId);
    if (!before.selected) throw new Error('当前会话没有可用的模型配置');
    return this.writeSelection(sessionId, { ...before.selected, mode: snapshot?.savedMode,
      submode: snapshot?.savedSubmode ?? snapshot?.submode, expectedRevision: before.revision }, true);
  }
  async writeSelection(sessionId, input, restoring = false) {
    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const mode = input?.mode;
      if (!input || !modes.has(mode) || Object.hasOwn(input, 'ultracode')
        || (input.submode !== undefined && !ULTRA_SUBMODES.has(input.submode))
        || typeof input.provider !== 'string' || !input.provider.trim() || typeof input.model !== 'string' || !input.model.trim()
        || (input.reasoningEffort !== undefined && (typeof input.reasoningEffort !== 'string' || !input.reasoningEffort))) throw new Error('模型、档位和工作模式无效');
      // Capability lookup can await provider work. Inspect the live owner,
      // native revision and available tools only after preparation completes;
      // no plugin-owned wait may separate that decision from native admission.
      const info = await this.ctx.llm.resolveModelInfo(input.provider, input.model);
      const agent = await this.agent(sessionId), session = agent.session;
      const before = this.view(session, agent);
      const submode = input.submode ?? (mode === 'off' ? before.savedSubmode : before.submode);
      this.prepare(agent);
      if (input.expectedRevision !== undefined && input.expectedRevision !== before.revision) throw new Error('模型设置已在另一处更新，请重试');
      if (mode !== 'off' && !before.eligible && !restoring) throw new Error('Ultra 需要当前会话的 OMD 协作能力');
      if (mode === 'ultra' && submode === 'team' && !before.teamAvailable && !restoring) throw new Error('请先在 DSH 中启用 Agent Team');
      const controller = this.ctx.get('sessionController');
      if (!controller) throw new Error('当前宿主未提供模型选择服务');
      const effort = mode === 'ultra' && info.reasoning?.efforts?.some(level => level.id === 'xhigh')
        ? 'xhigh'
        : mode !== 'off' ? highestEffort(info.reasoning) : input.reasoningEffort;
      const result = await controller.selectModel({ sessionId, provider: input.provider, model: input.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) });
      const model = this.fold(session).model;
      if (!model || !same(model, result.selected)) throw new Error('模型在保存时再次变更，请重试');
      await this.ctx.sessions.flush(session);
      // Flush the native selection first. A crash before the plugin save then
      // leaves an ordinary selection, never a mode tied to an uncommitted route.
      if (this.fold(session).model?.seq !== model.seq) throw new Error('模型在保存时再次变更，请重试');
      this.persist(session, { mode, submode, enabled: false, selectionSeq: model.seq });
      if (agent.status !== 'running') this.prepare(agent, true);
      return this.view(session, agent);
    });
    this.writes.set(sessionId, operation);
    try { return await operation; }
    finally { if (this.writes.get(sessionId) === operation) this.writes.delete(sessionId); }
  }
  claimed(agent, message) {
    const pending = this.claims.get(agent) ?? [];
    pending.push(message); this.claims.set(agent, pending);
  }
  lifecycle(agent, source) { if (source === 'clear' || source === 'compact') this.fresh.add(agent); }
  prepare(agent, force = false) {
    const turn = this.fold(agent.session).turn;
    const active = this.active.get(agent);
    if (!force && active?.turn === turn) return active;
    const view = this.view(agent.session, agent);
    const next = { turn, mode: view.mode, submode: view.submode };
    this.active.set(agent, next);
    return next;
  }
  currentMode(agent) {
    if (!agent || !this.eligible(agent)) return 'off';
    return (agent.status === 'running' ? this.active.get(agent)?.mode : undefined) ?? this.view(agent.session, agent).mode;
  }
  currentSubmode(agent) {
    if (!agent) return 'free';
    const selected = (agent.status === 'running' ? this.active.get(agent)?.submode : undefined) ?? this.view(agent.session, agent).submode;
    return selected === 'team' && !this.teamAvailable(agent) ? 'free' : selected;
  }
  /** Pin the requested strategy per turn. DSH alone owns tools and children;
   * a disabled native Team must not leave instructions for unavailable tools. */
  async assemble(agent, next) {
    await this.settled(agent.session.id);
    const active = this.prepare(agent), state = this.fold(agent.session);
    const assembly = await next();
    if (!this.eligible(agent)) return assembly;
    const last = this.store.peek(agent.session.id)?.ultracode?.delivery;
    const submode = active.submode === 'team' && !this.teamAvailable(agent) ? 'free' : active.submode;
    const guide = this.guides[submode];
    const pending = this.claims.get(agent) ?? [];
    this.claims.delete(agent);
    const on = active.mode === 'ultra';
    const kind = on ? 'on' : 'off';
    const emit = this.fresh.has(agent) || last?.kind !== kind || last?.submode !== submode || last?.guideHash !== guide.hash
      || pending.some(human) && state.humans - (last?.humanCount ?? 0) >= 10;
    this.frames.set(agent, { kind, mode: active.mode, submode, emit,
      revision: this.fold(agent.session).model?.seq ?? -1, turn: state.turn, guideHash: guide.hash });
    // Fuse the selected Team prompt into DSH's existing policy section. The
    // native identity, tool contracts, registration and UI remain DSH-owned.
    if (on && submode === 'team' && assembly.sections.some(section => section.name === 'team:policy')) {
      return { ...assembly, sections: assembly.sections.map(section => section.name === 'team:policy' ? { ...section, text: guide.text, interpolate: false } : section) };
    }
    const text = on ? [submode === 'workflow' ? ULTRA_WORKFLOW_ON : '', guide.text].filter(Boolean).join('\n\n') : last ? ULTRA_OFF : '';
    return text ? { ...assembly, sections: [...assembly.sections, { name: 'omd:ultra', text, interpolate: false }] } : assembly;
  }
  committed(session, event) {
    if (event.type === 'turn/start') {
      const running = this.ctx.agents.get(session.id);
      if (running) this.prepare(running, true);
    }
    if (event.type !== 'request/header') return;
    const agent = this.ctx.agents.get(session.id), frame = agent && this.frames.get(agent);
    if (!frame?.emit || !frame.kind) return;
    // No extra model call; durable accounting follows actual request admission.
    const state = this.fold(session);
    const delivery = { kind: frame.kind, mode: frame.mode, submode: frame.submode, revision: frame.revision, guideHash: frame.guideHash, turn: frame.turn, humanCount: state.humans };
    try { this.persist(session, { delivery }); frame.emit = false; this.fresh.delete(agent); }
    catch (error) { this.ctx.logger?.warn?.('Ultra reminder accounting failed: ' + error.message); }
  }
}
