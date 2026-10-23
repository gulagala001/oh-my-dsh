import { MAX_ANSWER, MAX_HISTORY, validateQuestion } from '../protocol.mjs';

const EMPTY_STATE = Object.freeze({ entries: Object.freeze([]), selected: -1, draft: '', error: '' });
const busy = entry => entry?.status === 'connecting' || entry?.status === 'answering';

/** Browser-memory only. React mount/unmount never owns a network request. */
export class SideChatStore {
  constructor(fetcher = globalThis.fetch.bind(globalThis)) {
    this.fetch = fetcher;
    this.clientId = crypto.randomUUID();
    this.states = new Map();
    this.listeners = new Set();
    this.running = new Map();
    this.owners = new Map();
    this.active = null;
    this.disposed = false;
  }
  subscribe = listener => {
    if (this.disposed) return () => {};
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  };
  emit() { for (const listener of this.listeners) listener(); }
  get(id) { return this.states.get(id) ?? EMPTY_STATE; }
  update(id, patch) {
    if (this.disposed) return;
    this.states.set(id, { ...this.get(id), ...patch }); this.emit();
  }
  patch(id, entryId, patch) {
    const state = this.get(id);
    this.update(id, { entries: state.entries.map(entry => entry.id === entryId ? { ...entry, ...patch } : entry) });
  }
  mount(id, owner) {
    if (this.disposed) return () => {};
    let owners = this.owners.get(id);
    if (!owners) this.owners.set(id, owners = new Set());
    owners.add(owner);
    return () => {
      owners.delete(owner);
      if (this.active?.owner === owner) this.close();
      if (!owners.size) this.owners.delete(id);
    };
  }
  open(id, owner) {
    if (this.disposed) return;
    this.active = { id, owner: owner ?? this.owners.get(id)?.values().next().value };
    this.emit();
  }
  close() { this.active = null; this.emit(); }
  isBusy(id) { return this.running.has(id); }
  select(id, selected) {
    this.update(id, { selected: Math.max(0, Math.min(selected, this.get(id).entries.length - 1)) });
  }
  stop(id) { this.running.get(id)?.abort(Error('已停止旁聊')); }
  async ask(id, rawQuestion) {
    if (this.disposed) throw Error('旁聊插件已停用');
    const question = validateQuestion(rawQuestion);
    if (this.isBusy(id)) throw Error('旁聊正在回答，请先停止或等待完成');
    const state = this.get(id);
    const history = state.entries.filter(entry => entry.status === 'done' && !entry.truncated)
      .slice(-MAX_HISTORY).map(({ question, answer, provider, model }) => ({ question, answer, provider, model }));
    const entry = { id: crypto.randomUUID(), question, answer: '', status: 'connecting', error: '', model: '' };
    const controller = new AbortController();
    this.running.set(id, controller);
    const entries = [...state.entries, entry].slice(-MAX_HISTORY);
    this.update(id, { entries, selected: entries.length - 1, error: '' });
    let response;
    try {
      response = await this.fetch('/api/dsh-btw/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.clientId, sessionId: id, question, history }),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!response.ok) {
        const value = await response.json();
        throw Error(value.error || '旁聊请求失败');
      }
      if (!response.body) throw Error('当前客户端不支持流式回答');
      this.patch(id, entry.id, { status: 'answering' });
      // The composer is released as soon as admission succeeds. The drain
      // continues while the popover is closed or another session is selected.
      void this.drain(id, entry.id, response.body, controller);
    } catch (error) {
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      this.patch(id, entry.id, { status: controller.signal.aborted ? 'stopped' : 'error', error: failure.message });
      if (this.running.get(id) === controller) this.running.delete(id);
      this.update(id, {});
      controller.abort();
      await response?.body?.cancel().catch(() => {});
      throw failure;
    }
  }
  async drain(id, entryId, body, controller) {
    const decoder = new TextDecoder();
    let reader;
    // Own the reader as well as the fetch signal: cancellation must wake a
    // pending read, including when a transport wrapper does not forward abort.
    const cancel = () => { void reader.cancel().catch(() => {}); };
    let buffer = '', answer = '', finished = false, thinking = false;
    const accept = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'text') {
        answer += event.text;
        if (answer.length > MAX_ANSWER) throw Error('回答超过长度上限');
        this.patch(id, entryId, { answer, thinking: false });
      } else if (event.type === 'meta') {
        this.patch(id, entryId, { provider: event.provider, model: event.model });
      } else if (event.type === 'usage') {
        this.patch(id, entryId, { usage: event.usage });
      } else if (event.type === 'thinking' && !thinking && !answer) {
        thinking = true;
        this.patch(id, entryId, { thinking: true });
      } else if (event.type === 'done') {
        finished = true;
        this.patch(id, entryId, { status: 'done', truncated: !!event.truncated, thinking: false });
      } else if (event.type === 'error') throw Error(event.error || '旁聊请求失败');
    };
    try {
      reader = body.getReader();
      controller.signal.addEventListener('abort', cancel, { once: true });
      controller.signal.throwIfAborted();
      while (!finished) {
        const { value, done } = await reader.read();
        controller.signal.throwIfAborted();
        buffer += decoder.decode(value, { stream: !done });
        let newline;
        while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
          accept(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
        // The server emits done only after the model iterator has closed.
        // Transport EOF (or anything after the terminal event) is not a
        // second authority for whether this answer completed.
        if (finished) break;
        if (buffer.length > 256000) throw Error('旁聊响应格式无效');
        if (done) { if (!finished && buffer.trim()) accept(buffer); break; }
      }
      if (!finished) throw Error('连接提前结束，回答可能不完整');
    } catch (error) {
      this.patch(id, entryId, {
        status: controller.signal.aborted ? 'stopped' : 'error',
        error: controller.signal.aborted ? '已停止旁聊' : error.message,
        thinking: false,
      });
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      controller.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      if (this.running.get(id) === controller) this.running.delete(id);
      this.update(id, {});
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.running.values()) controller.abort(Error('旁聊插件已停用'));
    this.running.clear();
    this.states.clear();
    this.active = null;
    this.listeners.clear();
    this.owners.clear();
  }
}
export { busy };
