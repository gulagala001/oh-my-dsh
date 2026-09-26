import { createHash } from 'node:crypto';
import { promptText } from './cc-adaptation/texts.mjs';
import { highestEffort } from './model-efforts.mjs';
import { z } from 'zod';

export const ULTRACODE_ON = "Ultracode is on: optimize for the most exhaustive, correct answer — not the fastest or cheapest. Use the Workflow tool on every substantive task; token cost is not a constraint. See the **Ultracode** section and quality patterns in the workflow authoring reference. Solo only on conversational/trivial turns.";
export const ULTRACODE_SPARSE = "Ultracode is still on — use the Workflow tool; see the Ultracode section of the workflow authoring reference.";
export const ULTRACODE_OFF = "Ultracode is off — the Workflow tool's standard opt-in rule applies again.";
export const ULTRACODE_KEYWORD = 'The user included the keyword "ultracode", opting this turn into multi-agent orchestration — use the Workflow tool to fulfill the request.';
const reminder = { on: ULTRACODE_ON, sparse: ULTRACODE_SPARSE, off: ULTRACODE_OFF, keyword: ULTRACODE_KEYWORD };
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
    if (!agent || agent.session.header.parentSession || agent.session.header.origin === 'subagent' || !this.isOmd(agent.session)) return false;
    return Boolean(agent.ctx.get('tools')?.schemas(agent).find(tool => tool.name === 'workflow')?.parameters?.properties?.resumeFromRunId);
  }
  view(session, agent = this.ctx.agents.get(session.id)) {
    const state = this.fold(session);
    const route = state.model ?? session.requestHeader()?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    const selected = route ? { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } : null;
    const mode = this.store.peek(session.id)?.ultracode;
    const savedEnabled = Boolean(mode?.enabled && mode.selectionSeq === state.model?.seq);
    const eligible = this.eligible(agent);
    return { selected, enabled: savedEnabled && eligible, savedEnabled, eligible, revision: state.model?.seq ?? -1 };
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
    if (agent.session.header.parentSession || agent.session.header.origin === 'subagent') throw new Error('不能通过模型面板接管子代理会话');
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
      if (!input || typeof input.ultracode !== 'boolean' || typeof input.provider !== 'string' || !input.provider.trim() || typeof input.model !== 'string' || !input.model.trim()
        || (input.reasoningEffort !== undefined && (typeof input.reasoningEffort !== 'string' || !input.reasoningEffort))) throw new Error('模型、档位和 Ultracode 状态无效');
      const agent = await this.agent(sessionId), session = agent.session;
      const before = this.view(session, agent);
      if (input.expectedRevision !== undefined && input.expectedRevision !== before.revision) throw new Error('模型设置已在另一处更新，请重试');
      if (input.ultracode && !before.eligible) throw new Error('Ultracode 需要当前会话的 OMD Workflow 能力');
      const controller = this.ctx.get('sessionController');
      if (!controller) throw new Error('当前宿主未提供模型选择服务');
      const info = await this.ctx.llm.resolveModelInfo(input.provider, input.model);
      const effort = input.ultracode ? highestEffort(info.reasoning) : input.reasoningEffort;
      const result = await controller.selectModel({ sessionId, provider: input.provider, model: input.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) });
      const model = this.fold(session).model;
      if (!model || !same(model, result.selected)) throw new Error('模型在保存时再次变更，请重试');
      await this.ctx.sessions.flush(session);
      // Flush the native selection first. A crash before the plugin save then
      // leaves an ordinary selection, never a mode tied to an uncommitted route.
      if (this.fold(session).model?.seq !== model.seq) throw new Error('模型在保存时再次变更，请重试');
      this.persist(session, { enabled: input.ultracode, selectionSeq: model.seq });
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
    let kind, emit = false;
    if (snapshot.enabled) {
      const missing = !agent.session.deriveMessages().some(message => message.role === 'system' && message.content?.some(block => block.type === 'text' && block.text.includes(this.guide)));
      if (this.fresh.has(agent) || missing || !['on', 'sparse'].includes(last?.kind) || last.revision !== snapshot.revision || last.guideHash !== this.guideHash) { kind = 'on'; emit = true; }
      else if (pending.some(human) && state.humans - last.humanCount >= 10) { kind = 'sparse'; emit = true; }
      else kind = last.kind;
    } else if (pending.some(hasUltracodeKeyword) || (last?.kind === 'keyword' && last.turn === state.turn && last.revision === snapshot.revision)) {
      kind = 'keyword'; emit = last?.kind !== kind || last.turn !== state.turn;
    } else if (['on', 'sparse', 'off'].includes(last?.kind)) { kind = 'off'; emit = last.kind !== 'off' || last.revision !== snapshot.revision; }
    const frame = { kind, emit, revision: snapshot.revision, turn: state.turn, guideHash: this.guideHash };
    this.frames.set(agent, frame);
    if (!kind) return assembly;
    const text = [reminder[kind], ...kind === 'on' || kind === 'sparse' || kind === 'keyword' ? [this.guide] : []].join('\n\n');
    return { ...assembly, sections: [...assembly.sections, { name: 'omd:ultracode', text, interpolate: false }] };
  }
  committed(session, event) {
    if (event.type !== 'request/header') return;
    const agent = this.ctx.agents.get(session.id), frame = agent && this.frames.get(agent);
    if (!frame?.emit || !frame.kind) return;
    // No extra model call; durable accounting follows actual request admission.
    const state = this.fold(session);
    const delivery = { kind: frame.kind, revision: frame.revision, guideHash: frame.guideHash, turn: frame.turn, humanCount: state.humans };
    try { this.persist(session, { delivery }); frame.emit = false; this.fresh.delete(agent); }
    catch (error) { this.ctx.logger?.warn?.('Ultracode reminder accounting failed: ' + error.message); }
  }
}
