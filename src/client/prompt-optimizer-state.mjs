export const OPTIMIZER_STORAGE_KEY = 'omd.promptOptimizer.v1';
export const OPTIMIZER_MODES = [['basic', '轻润色'], ['structured', '结构化'], ['planning', '步骤规划']];
const REQUIREMENT_LIMIT = 64000;
export function optimizerPreferences(value) {
  const requirementPresets = [], ids = new Set(), names = new Set();
  for (const item of Array.isArray(value?.requirementPresets) ? value.requirementPresets : []) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (typeof item?.id !== 'string' || !item.id || ids.has(item.id) || !name || name.length > 80 || names.has(name.toLocaleLowerCase())
      || typeof item.requirements !== 'string' || !item.requirements.trim() || item.requirements.length > REQUIREMENT_LIMIT) continue;
    ids.add(item.id); names.add(name.toLocaleLowerCase()); requirementPresets.push({ id: item.id, name, requirements: item.requirements });
  }
  const requirementDrafts = Object.fromEntries(requirementPresets.filter(p => typeof value?.requirementDrafts?.[p.id] === 'string'
    && value.requirementDrafts[p.id].length <= REQUIREMENT_LIMIT).map(p => [p.id, value.requirementDrafts[p.id]]));
  return { enabled: value?.enabled !== false, automatic: value?.automatic === true,
    mode: OPTIMIZER_MODES.some(([id]) => id === value?.mode) ? value.mode : 'basic',
    requirementPresets, requirementDrafts, requirementPreset: ids.has(value?.requirementPreset) ? value.requirementPreset : '',
    customRequirements: typeof value?.customRequirements === 'string' && value.customRequirements.length <= REQUIREMENT_LIMIT ? value.customRequirements : '' };
}
export function optimizerRequirements(prefs) {
  const preset = prefs.requirementPresets?.find(p => p.id === prefs.requirementPreset);
  return preset ? (Object.hasOwn(prefs.requirementDrafts ?? {}, preset.id) ? prefs.requirementDrafts[preset.id] : preset.requirements) : (prefs.customRequirements ?? '');
}
export function createOptimizerPreferences(storage, events = globalThis.window) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch {} }
  const read = () => { try { return optimizerPreferences(JSON.parse(storage.getItem(OPTIMIZER_STORAGE_KEY))); } catch { return optimizerPreferences(); } };
  let state = read(); const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const sync = event => { if (event.key === null || event.key === OPTIMIZER_STORAGE_KEY) { state = read(); emit(); } };
  events?.addEventListener('storage', sync);
  const set = patch => { const next = optimizerPreferences({ ...state, ...patch }); storage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify(next)); state = next; emit(); };
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, set,
    selectRequirementPreset(id) { set({ requirementPreset: id }); },
    setRequirements(requirements) {
      if (typeof requirements !== 'string' || requirements.length > REQUIREMENT_LIMIT) throw Error('额外要求不能超过 64000 字符');
      set(state.requirementPreset ? { requirementDrafts: { ...state.requirementDrafts, [state.requirementPreset]: requirements } } : { customRequirements: requirements });
    },
    saveRequirementPreset(name, asNew = false) {
      name = name.trim(); const requirements = optimizerRequirements(state), id = asNew ? '' : state.requirementPreset;
      if (!name || name.length > 80) throw Error('请输入 1–80 字符的预设名称');
      if (!requirements.trim()) throw Error('请先填写额外要求，不能保存空预设');
      if (state.requirementPresets.some(p => p.id !== id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('已有同名预设，请换一个名称');
      const preset = { id: id || crypto.randomUUID(), name, requirements };
      const requirementDrafts = { ...state.requirementDrafts }; delete requirementDrafts[preset.id];
      set({ requirementPresets: id ? state.requirementPresets.map(p => p.id === id ? preset : p) : [...state.requirementPresets, preset],
        requirementPreset: preset.id, requirementDrafts });
    },
    removeRequirementPreset() {
      const id = state.requirementPreset; if (!id) return;
      const requirementDrafts = { ...state.requirementDrafts }; delete requirementDrafts[id];
      set({ requirementPresets: state.requirementPresets.filter(p => p.id !== id), requirementDrafts,
        requirementPreset: '', customRequirements: optimizerRequirements(state) });
    },
    dispose() { events?.removeEventListener('storage', sync); listeners.clear(); } };
}
export function captureDraft(shell) {
  const s = shell.state.getSnapshot();
  return { draft: s.draft, revision: s.draftRev, attachments: [...s.attachmentIds], occurrences: s.occurrences, document: shell.editor.getEditorState().toJSON() };
}
function sameDraft(a, b) { return a?.draft === b?.draft && JSON.stringify(a?.document) === JSON.stringify(b?.document); }
function sameNavigationDraft(a, b) {
  const references = value => value.occurrences.map(({ source, ref, offset, length }) => ({ source, ref, offset, length }));
  return a.draft === b.draft && JSON.stringify(references(a)) === JSON.stringify(references(b));
}
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
  const response = await fetch('trisoul-x/api/prompt-optimizer?session=' + encodeURIComponent(sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
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
    this.sends = new Map(); this.recoveries = new Map(); this.recoverySeq = 0;
    this.state = { busy: '', message: '', error: '', candidate: null, instruction: '', versions: [], cursor: -1, recoveries: [] };
    this.subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    this.getSnapshot = () => this.state;
    // Admission can settle after the composer switches to another session.
    // Keep this subscription with the session controller, not its visible view.
    this.unsubmit = shell.onSubmission?.(event => this.submission(event));
    this.unwatch = shell.state.subscribe(() => {
      if (!this.writing && !shell.state.getSnapshot().draft && (this.history.length || this.state.candidate || this.state.instruction)) { this.history = []; this.cursor = -1; this.publish({ candidate: null, instruction: '' }); }
    });
  }
  publish(patch = {}) {
    this.state = { ...this.state, ...patch, versions: this.history.map((item, i) => i ? `版本 ${i}` : '原稿'), cursor: this.cursor,
      recoveries: [...this.recoveries].map(([id, value]) => ({ id, draft: value.history[0].draft })) };
    this.listeners.forEach(fn => fn());
  }
  // Transfer data only. Requests, shell listeners and send attempts belong to
  // their original scope and must never restart merely because a view returns.
  navigationState({ deactivate = true } = {}) {
    if (deactivate) this.deactivate();
    if (!this.history.length && !this.recoveries.size && !this.state.candidate && !this.state.instruction) return null;
    return structuredClone({ snapshot: captureDraft(this.shell), history: this.history, cursor: this.cursor,
      recoveries: [...this.recoveries], recoverySeq: this.recoverySeq, candidate: this.state.candidate,
      instruction: this.state.instruction, error: this.state.error, message: this.state.message });
  }
  restoreNavigation(saved) {
    if (!saved || this.disposed) return;
    this.recoveries = new Map(saved.recoveries); this.recoverySeq = saved.recoverySeq;
    const current = captureDraft(this.shell);
    if (sameNavigationDraft(current, saved.snapshot)) {
      this.history = saved.history; this.cursor = saved.cursor;
      this.publish({ candidate: saved.candidate, instruction: saved.instruction, error: saved.error, message: saved.message });
    } else {
      if (saved.history.length) this.recoveries.set('draft-' + ++this.recoverySeq, {
        snapshot: saved.snapshot, history: saved.history, cursor: saved.cursor, instruction: saved.instruction,
      });
      this.publish({ message: this.recoveries.size ? '切换前的版本已保留，当前草稿保持不变。' : '' });
    }
  }
  activate() {
    if (this.restore || this.disposed) return;
    const shell = this.shell, original = shell.submit, descriptor = Object.getOwnPropertyDescriptor(shell, 'submit'), owner = this;
    if (typeof original !== 'function') { this.publish({ error: '当前宿主不支持草稿优化，请更新插件' }); return; }
    function submit(mode = 'queue', ...args) {
      if (!owner.restore || owner.disposed) return original.call(shell, mode, ...args);
      if (owner.pending) { owner.publish({ message: '正在优化，可先停止优化再发送' }); return; }
      const prefs = owner.preferences.getSnapshot(), input = shell.state.getSnapshot();
      if (!prefs.enabled || !prefs.automatic || !input.draft.trim() || input.phase !== 'plain' || /^\s*\//.test(input.draft)) return original.call(shell, mode, ...args);
      void owner.run({ automatic: true, deliveryMode: mode, deliveryArgs: args });
    }
    shell.submit = submit; this.nativeSubmit = (mode, ...args) => original.call(shell, mode, ...args);
    const unpreferences = this.preferences.subscribe(() => { const p = this.preferences.getSnapshot(); if (!p.enabled || !p.automatic && this.pending?.automatic) this.cancel(); });
    this.restore = () => {
      this.cancel(); unpreferences();
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
  submission(event) {
    if (this.disposed) return;
    if (event.kind === 'pending') {
      if (this.history.length) {
        const snapshot = captureDraft(this.shell);
        this.remember(snapshot);
        this.sends.set(event.id, { snapshot, history: this.history, cursor: this.cursor, instruction: this.state.instruction });
      }
      this.history = []; this.cursor = -1; this.publish({ candidate: null, instruction: '', error: '', message: '' });
      return;
    }
    const saved = this.sends.get(event.id);
    this.sends.delete(event.id);
    if (!saved || event.kind !== 'error') return;
    if (event.restored && sameDraft(captureDraft(this.shell), saved.snapshot) && !this.history.length) {
      this.history = saved.history; this.cursor = saved.cursor;
      this.state = { ...this.state, instruction: saved.instruction };
    } else {
      // A newer draft or several failed sends may now occupy the editor. Keep
      // their versions separate until the user chooses to inspect them.
      this.recoveries.set('draft-' + ++this.recoverySeq, saved);
    }
    this.publish({ error: '发送失败，原稿和优化版本已保留。', message: '' });
  }
  inspectRecovery(id) {
    const saved = this.recoveries.get(id);
    if (!saved || this.pending) return;
    const current = captureDraft(this.shell);
    if (this.history.length) this.recoveries.set('draft-' + ++this.recoverySeq, { history: this.history, cursor: this.cursor, snapshot: current, instruction: this.state.instruction });
    this.history = saved.history; this.cursor = saved.cursor;
    this.remember(current); this.recoveries.delete(id);
    this.publish({ error: '', candidate: null, instruction: saved.instruction ?? '', message: '已载入保留版本，当前草稿保持不变。' });
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
  async run({ instruction = '', automatic = false, deliveryMode = 'queue', deliveryArgs = [] } = {}) {
    if (this.pending || this.disposed) return;
    const input = this.shell.state.getSnapshot();
    if (input.phase !== 'plain' || /^\s*\//.test(input.draft)) { this.publish({ error: '命令由宿主直接处理，请输入普通对话草稿' }); return; }
    if (!input.draft.trim()) { this.publish({ error: '请先输入草稿' }); return; }
    const before = captureDraft(this.shell), ticket = { controller: new AbortController(), automatic };
    this.pending = ticket; this.remember(before);
    this.publish({ busy: automatic ? 'send' : 'manual', error: '', candidate: null, message: automatic ? '正在轻润色，完成后自动发送…' : '正在优化…' });
    try {
      const encoded = encodeDraft(before), prefs = this.preferences.getSnapshot();
      const response = await this.request(this.sessionId, { text: encoded.text, original: this.history[0].draft, instruction, requirements: optimizerRequirements(prefs), mode: automatic ? 'basic' : prefs.mode }, ticket.controller.signal);
      if (this.pending !== ticket || ticket.controller.signal.aborted || this.disposed) return;
      if (typeof response.text !== 'string' || !response.text.trim()) throw Error('优化结果为空，草稿未改动');
      if (/^\s*\//.test(response.text)) throw Error('优化结果变成了命令，已保留原稿并停止发送');
      const candidate = decodeDraft(response.text, encoded.references);
      if (!draftUnchanged(this.shell, before)) { this.publish({ candidate, message: '草稿或附件已变动，结果待应用；尚未发送' }); return; }
      this.write(candidate); this.remember(captureDraft(this.shell));
      // Call the original host entrance once, preserving queue/steer intent and attachment ownership.
      // Never recurse through our wrapper, or a successful optimization would optimize itself again.
      if (automatic) this.nativeSubmit(deliveryMode, ...deliveryArgs);
      this.publish({ message: automatic ? '轻润色完成，已交给宿主发送' : '已回填草稿，可撤销或继续优化' });
    } catch (error) {
      if (this.pending === ticket && !ticket.controller.signal.aborted) this.publish({ error: error.message || '优化失败，草稿已保留', message: '' });
    } finally { if (this.pending === ticket) { this.pending = null; this.publish({ busy: '' }); } }
  }
  dispose() { this.deactivate(); this.disposed = true; this.unsubmit?.(); this.unwatch(); this.sends.clear(); this.recoveries.clear(); this.listeners.clear(); }
}
