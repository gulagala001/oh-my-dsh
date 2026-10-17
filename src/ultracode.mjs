import { createHash } from 'node:crypto';
import { promptText } from './cc-adaptation/texts.mjs';
import { highestEffort } from './model-efforts.mjs';
import { proWorkflowGuide } from './cc-adaptation/workflow-guide.mjs';
import { z } from 'zod';
import { apiSessionTarget } from './api-session.mjs';
import { validateSessionId } from './hub-store.mjs';

export const ULTRACODE_ON = "Ultracode is on: optimize for the most exhaustive, correct answer — not the fastest or cheapest. Use the Workflow tool on every substantive task to delegate its concrete requirements to subagents; token cost is not a constraint. See the **Ultracode** section and quality patterns in the workflow authoring reference. Solo only on conversational/trivial turns.";
export const ULTRACODE_SPARSE = "Ultracode is still on — use the Workflow tool; see the Ultracode section of the workflow authoring reference.";
export const ULTRACODE_OFF = "Ultracode is off — the Workflow tool's standard opt-in rule applies again.";
export const ULTRACODE_KEYWORD = 'The user included the keyword "ultracode", opting this turn into multi-agent orchestration — use the Workflow tool to fulfill the request.';
export const PRO_ON = ULTRACODE_ON.replaceAll('Ultracode', 'Pro');
export const PRO_SPARSE = ULTRACODE_SPARSE.replaceAll('Ultracode', 'Pro');
export const PRO_OFF = ULTRACODE_OFF.replaceAll('Ultracode', 'Pro');
const reminders = {
  ultracode: { on: ULTRACODE_ON, sparse: ULTRACODE_SPARSE, off: ULTRACODE_OFF, keyword: ULTRACODE_KEYWORD },
  pro: { on: PRO_ON, sparse: PRO_SPARSE, off: PRO_OFF },
};
const modes = new Set(['off', 'pro', 'ultracode']);
const savedMode = state => modes.has(state?.mode) ? state.mode : state?.enabled ? 'ultracode' : 'off';
// Old delivery records belong to Ultracode; the storage key remains compatible.
const deliveryMode = delivery => delivery?.mode === 'pro' ? 'pro' : 'ultracode';
const same = (a, b) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
const human = message => message?.source?.kind === 'user';
const emptyFold = () => ({ through: 0, model: null, request: null, preset: undefined, turn: 0, humans: 0, humanIds: new Set() });
function foldEvent(state, event) {
  if (event.type === 'model/selection') state.model = { ...event.data, seq: event.seq };
  else if (event.type === 'request/header') state.request = event.data.header;
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
function modeView(state, route, mode, eligible) {
  const selected = route ? { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } : null;
  const saved = state.model && mode?.selectionSeq === state.model.seq ? savedMode(mode) : 'off';
  return { selected, mode: eligible ? saved : 'off', savedMode: saved, enabled: saved !== 'off' && eligible, savedEnabled: saved !== 'off', eligible, revision: state.model?.seq ?? -1 };
}
export const hasUltracodeKeyword = message => human(message) && message.content?.some(block => block.type === 'text' && /\bultracode\b/i.test(block.text) && !/^\s*\//.test(block.text));

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
    this.folds = new WeakMap(); this.claims = new WeakMap(); this.frames = new WeakMap(); this.assemblyModes = new WeakMap(); this.fresh = new WeakSet(); this.writes = new Map();
    const ultracode = promptText('runtime/workflow-authoring.md');
    const texts = { ultracode, pro: proWorkflowGuide(ultracode) };
    this.guides = Object.fromEntries(Object.entries(texts).map(([mode, text]) =>
      [mode, { text, hash: createHash('sha256').update(text).digest('hex') }]));
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
    this.store.save({ ...state, ultracode: next });
    state.ultracode = next;
  }
  eligible(agent) {
    if (!agent || agent.session.header.origin === 'subagent' || !this.isOmd(agent.session)) return false;
    return Boolean(agent.ctx.get('tools')?.schemas(agent).find(tool => tool.name === 'workflow')?.parameters?.properties?.resumeFromRunId);
  }
  view(session, agent = this.ctx.agents.get(session.id)) {
    const state = this.fold(session);
    const route = state.model ?? session.requestHeader()?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    return modeView(state, route, this.store.peek(session.id)?.ultracode, this.eligible(agent));
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
    if (!['trisoul-x', 'omd-ptc'].includes(preset)) return unavailable('原生历史当前不是 OMD preset；工作模式未启用。');
    const presets = this.ctx.get('agentPresets'), tools = this.ctx.get('tools');
    if (typeof presets?.compositionInventory !== 'function' || typeof presets?.acquireScope !== 'function' || typeof tools?.schemas !== 'function') return unavailable('冷会话尚未 hydration；宿主不能只读核对当前 preset 与 Workflow。');
    const inventory = await presets.compositionInventory(); signal?.throwIfAborted();
    if (!Array.isArray(inventory)) throw Error('原生 preset 配置查询无效');
    const current = inventory.find(row => row.id === preset);
    if (!current || current.broken !== undefined || !current.rows?.some(row => row.moduleName === 'trisoul_x/host/tool-workflow' && row.enabled === true && row.fiberState === 2)) return unavailable('当前 OMD Workflow bundle 不可用；保留已保存模式，恢复后需重新核对。');
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
    await this.writes.get(sessionId)?.catch(() => {}); signal?.throwIfAborted();
    const target = await apiSessionTarget(this.ctx, this.store, sessionId, signal);
    if (!target.found) throw Object.assign(Error('会话不存在'), { statusCode: 404 });
    const { session, agent, stored, inspection } = target;
    if ((session && session.id !== sessionId) || (stored && stored.id !== sessionId)) throw Error('会话存档身份不匹配');
    this.assertTarget(sessionId, session?.header ?? inspection?.meta ?? stored, agent);
    if (agent) return this.view(session, agent);
    if (target.archivedOnly) {
      const saved = savedMode(stored?.ultracode);
      return { selected: null, mode: 'off', savedMode: saved, enabled: false, savedEnabled: saved !== 'off', eligible: false, revision: -1,
        cold: true, archivedOnly: true, capability: 'archived-only', workflowResumeReady: false, reason: '仅有 OMD 存档，原生会话不存在；保存模式不代表可恢复的模型选择或 Workflow 能力。' };
    }
    const header = session?.header ?? inspection.meta, events = session ? session.snapshotEvents() : inspection.events;
    if (inspection && (!Number.isSafeInteger(inspection.inheritedEventCount) || inspection.inheritedEventCount < 0 || inspection.inheritedEventCount > events.length)) throw Error('原生会话继承记录无效');
    if (events.some(event => event?.sessionId !== undefined && event.sessionId !== sessionId)) throw Error('原生会话事件身份无效');
    const state = foldUltracodeEvents(events);
    // Match the native agentPreset projection, including an inherited selection.
    const preset = state.preset === undefined ? header.agentPreset : state.preset;
    const capability = await this.coldCapability(preset, signal); signal?.throwIfAborted();
    const route = state.model ?? state.request?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    return { ...modeView(state, route, stored?.ultracode, capability.eligible), ...capability, cold: true, archivedOnly: false, preset: preset ?? null };
  }
  async select(sessionId, input) {
    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const mode = input?.mode ?? (typeof input?.ultracode === 'boolean' ? input.ultracode ? 'ultracode' : 'off' : undefined);
      if (!input || !modes.has(mode) || (Object.hasOwn(input, 'mode') && !modes.has(input.mode))
        || (Object.hasOwn(input, 'ultracode') && input.ultracode !== (mode === 'ultracode'))
        || typeof input.provider !== 'string' || !input.provider.trim() || typeof input.model !== 'string' || !input.model.trim()
        || (input.reasoningEffort !== undefined && (typeof input.reasoningEffort !== 'string' || !input.reasoningEffort))) throw new Error('模型、档位和工作模式无效');
      const agent = await this.agent(sessionId), session = agent.session;
      const before = this.view(session, agent);
      if (input.expectedRevision !== undefined && input.expectedRevision !== before.revision) throw new Error('模型设置已在另一处更新，请重试');
      if (mode !== 'off' && !before.eligible) throw new Error('Pro / Ultracode 需要当前会话的 OMD Workflow 能力');
      const controller = this.ctx.get('sessionController');
      if (!controller) throw new Error('当前宿主未提供模型选择服务');
      const info = await this.ctx.llm.resolveModelInfo(input.provider, input.model);
      const effort = mode === 'pro' && info.reasoning?.efforts?.some(level => level.id === 'xhigh')
        ? 'xhigh'
        : mode !== 'off' ? highestEffort(info.reasoning) : input.reasoningEffort;
      const result = await controller.selectModel({ sessionId, provider: input.provider, model: input.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) });
      const model = this.fold(session).model;
      if (!model || !same(model, result.selected)) throw new Error('模型在保存时再次变更，请重试');
      await this.ctx.sessions.flush(session);
      // Flush the native selection first. A crash before the plugin save then
      // leaves an ordinary selection, never a mode tied to an uncommitted route.
      if (this.fold(session).model?.seq !== model.seq) throw new Error('模型在保存时再次变更，请重试');
      // Keep the legacy flag specific to Ultracode so an older plugin cannot
      // silently turn Pro into the stronger mode after a downgrade.
      this.persist(session, { mode, enabled: mode === 'ultracode', selectionSeq: model.seq });
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
  currentMode(agent) {
    if (!agent) return 'off';
    const view = this.view(agent.session, agent);
    if (!view.eligible) return 'off';
    return view.enabled ? view.mode : this.assemblyModes.get(agent) ?? 'off';
  }
  /** Render into the native complete system prompt so unload/clear cannot leave a stale directive. */
  async assemble(agent, next) {
    await this.writes.get(agent.session.id)?.catch(() => {});
    const snapshot = this.view(agent.session, agent), state = { ...this.fold(agent.session) };
    const last = this.store.peek(agent.session.id)?.ultracode?.delivery;
    const pending = this.claims.get(agent) ?? [];
    this.claims.delete(agent);
    const keyword = snapshot.eligible && !snapshot.enabled && (pending.some(hasUltracodeKeyword) || (last?.kind === 'keyword' && last.turn === state.turn && last.revision === snapshot.revision));
    const mode = snapshot.enabled ? snapshot.mode : keyword ? 'ultracode' : deliveryMode(last);
    this.assemblyModes.set(agent, snapshot.eligible && (snapshot.enabled || keyword) ? mode : 'off');
    const assembly = await next();
    if (!snapshot.eligible) {
      this.frames.delete(agent);
      return assembly;
    }
    const guide = this.guides[mode];
    let kind, emit = false;
    if (snapshot.enabled) {
      const missing = !agent.session.deriveMessages().some(message => message.role === 'system' && message.content?.some(block => block.type === 'text' && block.text.includes(guide.text)));
      if (this.fresh.has(agent) || missing || !['on', 'sparse'].includes(last?.kind) || deliveryMode(last) !== mode || last.revision !== snapshot.revision || last.guideHash !== guide.hash) { kind = 'on'; emit = true; }
      else if (pending.some(human) && state.humans - last.humanCount >= 10) { kind = 'sparse'; emit = true; }
      else kind = last.kind;
    } else if (keyword) {
      kind = 'keyword'; emit = last?.kind !== kind || last.turn !== state.turn;
    } else if (['on', 'sparse', 'off'].includes(last?.kind)) { kind = 'off'; emit = last.kind !== 'off' || last.revision !== snapshot.revision; }
    const frame = { kind, mode, emit, revision: snapshot.revision, turn: state.turn, guideHash: guide.hash };
    this.frames.set(agent, frame);
    if (!kind) return assembly;
    const text = [reminders[mode][kind], ...kind === 'on' || kind === 'sparse' || kind === 'keyword' ? [guide.text] : []].join('\n\n');
    return { ...assembly, sections: [...assembly.sections, { name: 'omd:ultracode', text, interpolate: false }] };
  }
  committed(session, event) {
    if (event.type !== 'request/header') return;
    const agent = this.ctx.agents.get(session.id), frame = agent && this.frames.get(agent);
    if (!frame?.emit || !frame.kind) return;
    // No extra model call; durable accounting follows actual request admission.
    const state = this.fold(session);
    const delivery = { kind: frame.kind, mode: frame.mode, revision: frame.revision, guideHash: frame.guideHash, turn: frame.turn, humanCount: state.humans };
    try { this.persist(session, { delivery }); frame.emit = false; this.fresh.delete(agent); }
    catch (error) { this.ctx.logger?.warn?.('Ultracode reminder accounting failed: ' + error.message); }
  }
}
