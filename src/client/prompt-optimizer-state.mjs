export const OPTIMIZER_STORAGE_KEY = 'omd.promptOptimizer.v1';
export const OPTIMIZER_MODES = [['basic', '轻润色'], ['structured', '结构化'], ['planning', '步骤规划']];
const defaults = { enabled: true, automatic: false, mode: 'basic' };
export function optimizerPreferences(value) {
  return { enabled: value?.enabled !== false, automatic: value?.automatic === true, mode: OPTIMIZER_MODES.some(([id]) => id === value?.mode) ? value.mode : 'basic' };
}
export function createOptimizerPreferences(storage, events = globalThis.window) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch {} }
  const read = () => { try { return optimizerPreferences(JSON.parse(storage.getItem(OPTIMIZER_STORAGE_KEY))); } catch { return { ...defaults }; } };
  let state = read(); const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const sync = event => { if (event.key === null || event.key === OPTIMIZER_STORAGE_KEY) { state = read(); emit(); } };
  events?.addEventListener('storage', sync);
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set(patch) { const next = optimizerPreferences({ ...state, ...patch }); storage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify(next)); state = next; emit(); },
    dispose() { events?.removeEventListener('storage', sync); listeners.clear(); } };
}
export function captureDraft(shell) {
  const s = shell.state.getSnapshot();
  return { draft: s.draft, revision: s.draftRev, attachments: [...s.attachmentIds], occurrences: s.occurrences, document: shell.editor.getEditorState().toJSON() };
}
function sameDraft(a, b) { return a?.draft === b?.draft && JSON.stringify(a?.document) === JSON.stringify(b?.document); }
export function draftUnchanged(shell, before) {
  const next = shell.state.getSnapshot();
  return next.phase === 'plain' && next.draftRev === before.revision && next.draft === before.draft
    && JSON.stringify(next.attachmentIds) === JSON.stringify(before.attachments)
    && JSON.stringify(next.occurrences) === JSON.stringify(before.occurrences);
}
export function encodeDraft(snapshot, nonce = crypto.randomUUID().replaceAll('-', '')) {
  const nodes = [];
  const walk = node => { if (node.type === 'reference-chip') nodes.push(node); for (const child of node.children || []) walk(child); };
  walk(snapshot.document.root);
  if (nodes.length !== snapshot.occurrences.length) throw Error('引用状态正在变化，请重试');
  const references = snapshot.occurrences.map((occurrence, i) => ({ token: `OMDREF_${nonce}_${i}_END`, node: nodes[i], ...occurrence }));
  let text = snapshot.draft;
  for (const reference of [...references].reverse()) text = text.slice(0, reference.offset) + reference.token + text.slice(reference.offset + reference.length);
  return { text, references };
}
export function decodeDraft(text, references) {
  const tokens = new Map(references.map(r => [r.token, r]));
  for (const { token } of references) if (text.split(token).length !== 2) throw Error('优化结果未完整保留引用，草稿未改动');
  const parts = text.split(/(OMDREF_[a-zA-Z0-9]+_\d+_END)/g);
  if (parts.some((part, i) => i % 2 && !tokens.has(part))) throw Error('优化结果包含未知引用，草稿未改动');
  const paragraph = () => ({ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [] });
  const children = [paragraph()]; let draft = '';
  for (const part of parts) {
    if (tokens.has(part)) { const node = structuredClone(tokens.get(part).node); children.at(-1).children.push(node); draft += node.clipboardText; }
    else {
      const lines = part.split('\n');
      lines.forEach((line, i) => { if (i) children.push(paragraph()); if (line) children.at(-1).children.push({ type: 'text', version: 1, text: line, format: 0, detail: 0, mode: 'normal', style: '' }); });
      draft += part;
    }
  }
  return { draft, document: { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children } } };
}
export async function requestOptimization(sessionId, input, signal) {
  const response = await fetch('/trisoul-x/api/prompt-optimizer?session=' + encodeURIComponent(sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  const body = await response.json().catch(error => { if (signal?.aborted) throw error; return null; });
  if (response.status === 404 && (!body?.error || body.error === '接口不存在')) throw Error('提示词优化后端尚未加载，请重启当前 DSH 服务后刷新页面。草稿已保留。');
  if (!response.ok) throw Error(body?.error || `HTTP ${response.status}`);
  if (typeof body?.text !== 'string' || !body.text.trim()) throw Error('优化结果为空，草稿已保留');
  return body;
}

export class DraftOptimizer {
  constructor({ shell, sessionId, preferences, request = requestOptimization }) {
    this.shell = shell; this.sessionId = sessionId; this.preferences = preferences; this.request = request;
    this.listeners = new Set(); this.history = []; this.cursor = -1; this.pending = null; this.disposed = false;
    this.state = { busy: '', message: '', error: '', candidate: null, versions: [], cursor: -1 };
    this.subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    this.getSnapshot = () => this.state;
  }
  publish(patch = {}) {
    this.state = { ...this.state, ...patch, versions: this.history.map((item, i) => i ? `版本 ${i}` : '原稿'), cursor: this.cursor };
    this.listeners.forEach(fn => fn());
  }
  activate() {
    if (this.restore || this.disposed) return;
    const shell = this.shell, original = shell.submit, descriptor = Object.getOwnPropertyDescriptor(shell, 'submit'), owner = this;
    if (typeof original !== 'function') { this.publish({ error: '当前宿主不支持草稿优化，请更新插件' }); return; }
    function submit(mode = 'queue') {
      if (!owner.restore || owner.disposed) return original.call(shell, mode);
      if (owner.pending) { owner.publish({ message: '正在优化，可先停止优化再发送' }); return; }
      const prefs = owner.preferences.getSnapshot(), input = shell.state.getSnapshot();
      if (!prefs.enabled || !prefs.automatic || !input.draft.trim() || input.phase !== 'plain' || /^\s*\//.test(input.draft)) return original.call(shell, mode);
      void owner.run({ automatic: true, deliveryMode: mode });
    }
    shell.submit = submit; this.nativeSubmit = mode => original.call(shell, mode);
    const unwatch = shell.state.subscribe(() => {
      if (!this.writing && !shell.state.getSnapshot().draft && this.history.length) { this.history = []; this.cursor = -1; this.publish({ candidate: null }); }
    });
    const unpreferences = this.preferences.subscribe(() => { const p = this.preferences.getSnapshot(); if (!p.enabled || !p.automatic && this.pending?.automatic) this.cancel(); });
    this.restore = () => {
      this.cancel(); unwatch(); unpreferences();
      if (shell.submit === submit) { if (descriptor) Object.defineProperty(shell, 'submit', descriptor); else delete shell.submit; }
      this.restore = null;
    };
  }
  deactivate() { this.restore?.(); }
  cancel() {
    if (!this.pending) return;
    this.pending.controller.abort(); this.pending = null;
    this.publish({ busy: '', message: '已停止，草稿保留', error: '' });
  }
  remember(snapshot) {
    if (!this.history.length || !sameDraft(this.history[this.cursor], snapshot)) {
      this.history = this.history.slice(0, this.cursor + 1); this.history.push(snapshot); this.cursor = this.history.length - 1;
    }
    if (this.history.length > 20) { this.history = [this.history[0], ...this.history.slice(-19)]; this.cursor = this.history.length - 1; }
  }
  write(snapshot) {
    if (this.shell.state.getSnapshot().phase !== 'plain') throw Error('当前正在提交命令，无法替换草稿');
    this.writing = true;
    try { this.shell.editor.setEditorState(this.shell.editor.parseEditorState(snapshot.document), { tag: 'history-push' }); }
    finally { this.writing = false; }
  }
  applyCandidate() {
    if (!this.state.candidate || this.pending) return;
    try { const before = captureDraft(this.shell); this.write(this.state.candidate); this.remember(before); this.remember(captureDraft(this.shell)); this.publish({ candidate: null, error: '', message: '已应用，仍可撤销' }); }
    catch (error) { this.publish({ error: error.message }); }
  }
  selectVersion(index) {
    if (this.pending || !Number.isInteger(index) || !this.history[index]) return;
    try {
      const target = this.history[index], current = captureDraft(this.shell); this.write(target);
      if (!sameDraft(this.history[this.cursor], current)) this.history.push(current);
      if (this.history.length > 20) this.history = [this.history[0], ...this.history.slice(1).filter(item => item !== target).slice(-18), ...(target === this.history[0] ? [] : [target])];
      this.cursor = this.history.indexOf(target); this.publish({ candidate: null, error: '', message: index ? '已恢复所选版本' : '已恢复原稿' });
    } catch (error) { this.publish({ error: error.message }); }
  }
  async run({ instruction = '', automatic = false, deliveryMode = 'queue' } = {}) {
    if (this.pending || this.disposed) return;
    const input = this.shell.state.getSnapshot();
    if (input.phase !== 'plain' || /^\s*\//.test(input.draft)) { this.publish({ error: '命令由宿主直接处理，请输入普通对话草稿' }); return; }
    if (!input.draft.trim()) { this.publish({ error: '请先输入草稿' }); return; }
    const before = captureDraft(this.shell), ticket = { controller: new AbortController(), automatic };
    this.pending = ticket; this.remember(before);
    this.publish({ busy: automatic ? 'send' : 'manual', error: '', candidate: null, message: automatic ? '正在轻润色，完成后自动发送…' : '正在优化…' });
    try {
      const encoded = encodeDraft(before);
      const response = await this.request(this.sessionId, { text: encoded.text, original: this.history[0].draft, instruction, mode: automatic ? 'basic' : this.preferences.getSnapshot().mode }, ticket.controller.signal);
      if (this.pending !== ticket || ticket.controller.signal.aborted || this.disposed) return;
      if (typeof response.text !== 'string' || !response.text.trim()) throw Error('优化结果为空，草稿未改动');
      if (/^\s*\//.test(response.text)) throw Error('优化结果变成了命令，已保留原稿并停止发送');
      const candidate = decodeDraft(response.text, encoded.references);
      if (!draftUnchanged(this.shell, before)) { this.publish({ candidate, message: '草稿或附件已变动，结果待应用；尚未发送' }); return; }
      this.write(candidate); this.remember(captureDraft(this.shell));
      // Call the original host entrance once, preserving queue/steer intent and attachment ownership.
      // Never recurse through our wrapper, or a successful optimization would optimize itself again.
      if (automatic) this.nativeSubmit(deliveryMode);
      this.publish({ message: automatic ? '轻润色完成，已交给宿主发送' : '已回填草稿，可撤销或继续优化' });
    } catch (error) {
      if (this.pending === ticket && !ticket.controller.signal.aborted) this.publish({ error: error.message || '优化失败，草稿已保留', message: '' });
    } finally { if (this.pending === ticket) { this.pending = null; this.publish({ busy: '' }); } }
  }
  dispose() { this.deactivate(); this.disposed = true; this.listeners.clear(); }
}
