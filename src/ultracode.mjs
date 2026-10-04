import { createHash } from 'node:crypto';
import { promptText } from './cc-adaptation/texts.mjs';
import { highestEffort } from './model-efforts.mjs';
import { proWorkflowGuide } from './cc-adaptation/workflow-guide.mjs';
import { z } from 'zod';

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
    this.folds = new WeakMap(); this.claims = new WeakMap(); this.frames = new WeakMap(); this.fresh = new WeakSet(); this.writes = new Map();
    this.guide = promptText('runtime/workflow-authoring.md');
    this.guideHash = createHash('sha256').update(this.guide).digest('hex');
    const pro = proWorkflowGuide(this.guide);
    this.guides = { ultracode: { text: this.guide, hash: this.guideHash }, pro: { text: pro, hash: createHash('sha256').update(pro).digest('hex') } };
  }
  fold(session) {
    let state = this.folds.get(session);
    if (!state || state.through > session.seq) {
      state = { through: 0, model: null, turn: 0, humans: 0, humanIds: new Set() };
      this.folds.set(session, state);
    }
    while (state.through < session.seq) {
      const event = session.eventAt(state.through++);
      if (event.type === 'model/selection') state.model = { ...event.data, seq: event.seq };
      else if (event.type === 'turn/start') state.turn = event.data.turn;
      else if (event.type === 'user/message' && human(event.data) && !state.humanIds.has(event.data.id)) { state.humanIds.add(event.data.id); state.humans++; }
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
    const selected = route ? { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } : null;
    const mode = this.store.peek(session.id)?.ultracode;
    const saved = mode?.selectionSeq === state.model?.seq ? savedMode(mode) : 'off';
    const eligible = this.eligible(agent);
    return { selected, mode: eligible ? saved : 'off', savedMode: saved, enabled: saved !== 'off' && eligible, savedEnabled: saved !== 'off', eligible, revision: state.model?.seq ?? -1 };
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
    // Ordinary user forks also have parentSession; only origin identifies a subagent.
    if (agent.session.header.origin === 'subagent') throw new Error('不能通过模型面板接管子代理会话');
    return agent;
  }
  async inspect(sessionId) {
    await this.writes.get(sessionId)?.catch(() => {});
    const agent = await this.agent(sessionId);
    return this.view(agent.session, agent);
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
      const effort = mode !== 'off' ? highestEffort(info.reasoning) : input.reasoningEffort;
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
  /** Render into the native complete system prompt so unload/clear cannot leave a stale directive. */
  async assemble(agent, next) {
    await this.writes.get(agent.session.id)?.catch(() => {});
    const snapshot = this.view(agent.session, agent), state = { ...this.fold(agent.session) };
    const last = this.store.peek(agent.session.id)?.ultracode?.delivery;
    const pending = this.claims.get(agent) ?? [];
    this.claims.delete(agent);
    const assembly = await next();
    if (!snapshot.eligible) {
      this.frames.delete(agent);
      return assembly;
    }
    const keyword = !snapshot.enabled && (pending.some(hasUltracodeKeyword) || (last?.kind === 'keyword' && last.turn === state.turn && last.revision === snapshot.revision));
    const mode = snapshot.enabled ? snapshot.mode : keyword ? 'ultracode' : deliveryMode(last);
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
