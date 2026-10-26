import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { assertCachedRequestPrefix } from './request-prefix.mjs';
import { summaryMessageReader, taskContextMeta } from '../task-context.mjs';
import { hash } from './core.mjs';
import { materialText } from './materials.mjs';
import { CACHED_PREPARE_TASK } from './prompts.mjs';
import { RequestSnapshots, cachedBudgetReason } from './request-snapshots.mjs';
import { imageSourceValue } from '../image-request-state.mjs';

const parts = (blocks, path = []) => (blocks || []).flatMap((block, index) => {
  const at = [...path, index];
  return block.type === 'tool-result' ? parts(block.content, [...at, 'content']) : [{ block, path: at }];
});
const partKey = block => JSON.stringify([block.type, materialText([block], 0)]);

export function cachedPreparationInput(session, snapshot, inputs) {
  const read = summaryMessageReader(session);
  const positions = new Map(snapshot.request.messages.map((message, index) => [message.id, index]));
  const selected = new Set(inputs.summary_scope.event_seqs), segment = [];
  for (const entry of inputs.segment) {
    if (!selected.has(entry.seq)) { segment.push(entry); continue; }
    const event = session.eventAt(entry.seq), original = session.deriveEventMessage(event), message = read(event);
    let index = positions.get(original?.id);
    if (index === undefined) {
      const projected = snapshot.request.messages.findIndex(m => taskContextMeta(m)?.originalSeq === entry.seq);
      if (projected >= 0) index = projected;
    }
    // A successful request's input necessarily predates its own assistant
    // reply. Keep the chosen window intact: append only those newly arrived,
    // already-filtered records after the cached prefix instead of waiting
    // forever for a snapshot that also contains its own response.
    if (index === undefined && entry.seq > snapshot.throughSeq) {
      segment.push({ ...entry, new_since_snapshot: true }); continue;
    }
    const available = parts(snapshot.request.messages[index]?.content), used = new Set(), paths = [], attachments = [];
    for (const { block } of parts(message?.content)) {
      if (!['text', 'reasoning', 'tool-call'].includes(block.type)) {
        attachments.push(materialText([block], entry.seq)); continue;
      }
      const match = available.findIndex((part, at) => !used.has(at) && partKey(part.block) === partKey(block));
      // Trace can move earlier reasoning out of its original message. It is
      // reference analysis, never additional completed work to reconstruct.
      if (match < 0 && block.type === 'reasoning') continue;
      if (match < 0) return { reason: '等待包含当前处理范围的主执行请求' };
      used.add(match); paths.push(available[match].path);
    }
    const { text, ...metadata } = entry;
    segment.push({ ...metadata, ...(index !== undefined ? { message_index: index } : {}), content_paths: paths,
      ...(attachments.length ? { attachment_references: attachments } : {}) });
  }
  // User originals remain explicit evidence, including the preceding user
  // decision when its message has already been archived by compaction.
  return { payload: { ...inputs, reference: [], segment } };
}

export function decodeCachedPreparation(result) {
  if (result.blocks.some(block => block.type === 'tool-call')) throw Error('记忆缓存预处理调用了工具；未执行，原文保留');
  const text = result.blocks.filter(block => block.type === 'text').map(block => block.text).join('').trim();
  const value = JSON.parse(text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).some(key => !['summary', 'documents', 'decisions'].includes(key))) throw Error('记忆缓存预处理回复格式无效，原文保留');
  return value;
}

// Borrow only actual main-loop requests. Snapshots never enter the session log
// or sidecar archive; the provider's cache identity remains the main session's.
export class CachedPreparation {
  constructor(pipeline) {
    this.pipeline = pipeline;
    this.active = new Map(); this.waiting = new Map(); this.enabled = false;
    this.snapshots = new RequestSnapshots(id => this.active.get(id)?.abort(Error('主会话模型路由已改变')),
      snapshot => pipeline.hub.images?.snapshotReason(snapshot), pipeline.adapter.measureRequest, pipeline.adapter.routeStamp);
    this.pending = this.snapshots.pending; this.requests = this.snapshots.requests;
  }
  configure() {
    const enabled = this.pipeline.config().memoryCacheEnabled;
    if (enabled !== this.enabled) { this.drop(); this.enabled = enabled; }
    return enabled;
  }
  capture(session, options) {
    const p = this.pipeline;
    if (!this.configure() || p.closed || !isAgentLoopRequest(options)) return;
    const cfg = p.config();
    if (!cfg.contextEnabled && !cfg.autoCompactEnabled) return;
    this.snapshots.capture(session, options, cfg.prepareInputTokens);
  }
  confirm(session, route) {
    if (!this.configure()) return false;
    return this.snapshots.confirm(session, route);
  }
  version(session) { return this.snapshots.version(session); }
  defer(session, reason, resume) {
    const p = this.pipeline, state = p.state(session);
    if (resume) {
      const previous = this.waiting.get(session.id);
      this.waiting.set(session.id, previous ? { force: previous.force || resume.force, retry: previous.retry && resume.retry } : resume);
    }
    if (state.memoryCache?.waitingReason !== reason) {
      state.memoryCache = { ...state.memoryCache, waitingReason: reason }; p.store.save(state);
    }
    return null;
  }
  clearWaiting(session) {
    this.waiting.delete(session.id);
    const p = this.pipeline, state = p.state(session);
    if (state.memoryCache?.waitingReason) {
      state.memoryCache.waitingReason = null; p.store.save(state);
    }
  }
  build(agent, events, inputs, resume) {
    if (!this.configure()) return null;
    const p = this.pipeline, session = agent.session;
    let reason;
    for (const snapshot of this.snapshots.candidates(session)) {
      const built = this.buildRequest(session, snapshot, inputs);
      if (!built.request) { reason ??= built.reason; continue; }
      const sourceSignature = hash(imageSourceValue(events.map(summaryMessageReader(session))));
      this.waiting.delete(session.id);
      const state = p.state(session);
      state.memoryCache = { ...state.memoryCache, waitingReason: null, cacheReadTokens: null }; p.store.save(state);
      const current = () => !p.closed && this.configure() && p.agents.get(session.id) === agent
        && this.snapshots.current(snapshot) && hash(imageSourceValue(events.map(summaryMessageReader(session)))) === sourceSignature;
      return { request: built.request, current };
    }
    this.clearWaiting(session);
    return null;
  }
  buildRequest(session, snapshot, inputs) {
    const p = this.pipeline;
    const { payload, reason } = cachedPreparationInput(session, snapshot, inputs);
    if (!payload) return { reason };
    const task = `${CACHED_PREPARE_TASK}\n\n${JSON.stringify(payload)}`;
    const request = { ...snapshot.request, purpose: 'compaction',
      messages: [...snapshot.request.messages, p.adapter.message(task, 'cached-prepare-task')] };
    assertCachedRequestPrefix(snapshot.request, request);
    if (this.snapshots.measurement(request,snapshot).tokens > (p.adapter.inputLimit?.(session,request,p.config().prepareInputTokens) ?? p.config().prepareInputTokens))
      return { reason: cachedBudgetReason };
    return { request };
  }
  async call(agent, prepared, controller, signal = controller.signal, admit) {
    const p = this.pipeline, id = agent.session.id;
    const guard = () => {
      if (!prepared.current()) controller.abort(Error('记忆缓存预处理的来源或设置已改变'));
      signal.throwIfAborted();
    };
    this.active.set(id, controller);
    try {
      const result = await p.call(agent, 'prepare', prepared.request, signal, () => { guard(); admit?.(); }, { preserveRoute: true });
      guard();
      const state = p.state(agent.session);
      state.memoryCache = { ...state.memoryCache, cacheReadTokens: result.usage?.cacheReadTokens ?? null }; p.store.save(state);
      return result;
    } finally { if (this.active.get(id) === controller) this.active.delete(id); }
  }
  drop(id) {
    const ids = id ? [id] : new Set([...this.active.keys(), ...this.waiting.keys()]);
    for (const key of ids) {
      this.active.get(key)?.abort(Error('记忆缓存预处理快照已释放'));
      this.active.delete(key); this.waiting.delete(key);
    }
    this.snapshots.drop(id);
  }
}
