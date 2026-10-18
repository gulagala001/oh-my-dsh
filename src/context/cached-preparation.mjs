import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { assertBtwCachePrefix } from '../btw-policy.mjs';
import { summaryMessageReader, taskContextMeta } from '../task-context.mjs';
import { hash } from './core.mjs';
import { materialText } from './materials.mjs';
import { CACHED_PREPARE_TASK } from './prompts.mjs';

const routeKey = request => hash(['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop'].map(key => request[key]));
const parts = (blocks, path = []) => (blocks || []).flatMap((block, index) => {
  const at = [...path, index];
  return block.type === 'tool-result' ? parts(block.content, [...at, 'content']) : [{ block, path: at }];
});
const partKey = block => JSON.stringify([block.type, materialText([block], 0)]);

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
    this.pipeline = pipeline; this.pending = new Map(); this.requests = new Map();
    this.active = new Map(); this.waiting = new Map(); this.serial = 0; this.enabled = false;
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
    const previous = this.pending.get(session.id) || this.requests.get(session.id);
    const { signal, ...request } = options;
    if (previous && (previous.session !== session || routeKey(previous.request) !== routeKey(request))) this.drop(session.id);
    if (Buffer.byteLength(JSON.stringify(request)) > cfg.prepareInputTokens * 4) {
      this.drop(session.id); return;
    }
    this.pending.set(session.id, { session, request, throughSeq: session.snapshotEvents().at(-1)?.seq ?? -1 });
  }
  confirm(session, route) {
    if (!this.configure()) return false;
    const snapshot = this.pending.get(session.id);
    if (!snapshot || snapshot.session !== session || (route &&
      (snapshot.request.provider !== route.provider || snapshot.request.model !== route.model))) return false;
    snapshot.version = ++this.serial;
    this.requests.set(session.id, snapshot); this.pending.delete(session.id);
    return true;
  }
  version(session) { return this.requests.get(session.id)?.version ?? 0; }
  defer(session, reason, resume) {
    const p = this.pipeline, state = p.state(session);
    if (resume) this.waiting.set(session.id, resume);
    if (state.memoryCache?.waitingReason !== reason) {
      state.memoryCache = { ...state.memoryCache, waitingReason: reason }; p.store.save(state);
    }
    return null;
  }
  build(agent, events, inputs, resume) {
    if (!this.configure()) return null;
    const p = this.pipeline, session = agent.session, snapshot = this.requests.get(session.id);
    if (!snapshot || snapshot.session !== session) return this.defer(session, '等待主执行成功请求的缓存快照', resume);
    const read = summaryMessageReader(session), sourceSignature = hash(events.map(read));
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
        if (match < 0) return this.defer(session, '等待包含当前处理范围的主执行请求', resume);
        used.add(match); paths.push(available[match].path);
      }
      const { text, ...metadata } = entry;
      segment.push({ ...metadata, ...(index !== undefined ? { message_index: index } : {}), content_paths: paths,
        ...(attachments.length ? { attachment_references: attachments } : {}) });
    }
    // User originals remain explicit evidence, including the preceding user
    // decision when its message has already been archived by compaction.
    const payload = { ...inputs, reference: [], segment };
    const task = `${CACHED_PREPARE_TASK}\n\n${JSON.stringify(payload)}`;
    const request = { ...snapshot.request, purpose: 'compaction',
      messages: [...snapshot.request.messages, p.adapter.message(task, 'cached-prepare-task')] };
    assertBtwCachePrefix(snapshot.request, request);
    if (Buffer.byteLength(JSON.stringify(request)) > p.config().prepareInputTokens * 4)
      return this.defer(session, '主执行前缀和预处理提示超过输入预算，原文保留', resume);
    this.waiting.delete(session.id);
    const state = p.state(session);
    state.memoryCache = { ...state.memoryCache, waitingReason: null, cacheReadTokens: null }; p.store.save(state);
    const current = () => !p.closed && this.configure() && p.agents.get(session.id) === agent
      && this.requests.get(session.id)?.session === session
      && routeKey(this.requests.get(session.id).request) === routeKey(snapshot.request)
      && (!this.pending.has(session.id) || routeKey(this.pending.get(session.id).request) === routeKey(snapshot.request))
      && hash(events.map(summaryMessageReader(session))) === sourceSignature;
    return { request, current };
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
    const ids = id ? [id] : new Set([...this.pending.keys(), ...this.requests.keys(), ...this.active.keys(), ...this.waiting.keys()]);
    for (const key of ids) {
      this.active.get(key)?.abort(Error('记忆缓存预处理快照已释放'));
      this.active.delete(key); this.pending.delete(key); this.requests.delete(key); this.waiting.delete(key);
    }
  }
}
