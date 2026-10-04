const STORAGE_KEY = 'omd.projectless-drafts.v1';
const emptyDraft = () => ({ draft: '', occurrences: [], attachmentIds: [] });
const checked = result => { if (!result.ok) throw Error(result.error?.message || '会话设置未保存'); return result.value; };

export function waitForDraftUploads(conversation, ids, signal) {
  if (!ids.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = error => { unsubscribe(); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const abort = () => finish(signal.reason);
    const inspect = () => {
      const uploads = ids.map(id => conversation.fileUploads.getSnapshot()[id]).filter(Boolean);
      const failed = uploads.find(upload => upload.status === 'error');
      if (failed) finish(Error(failed.message || '附件迁移失败，请重试'));
      else if (!uploads.some(upload => upload.status === 'uploading')) finish();
    };
    unsubscribe = conversation.fileUploads.subscribe(inspect);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else inspect();
  });
}

// Keep the source draft reachable until native admission is acknowledged.
// Ordinary messages report admission through onSubmission; slash commands
// settle through the native input machine without an ordinary-message event.
export function submitDraft(shell, mode, args, signal) {
  return new Promise((resolve, reject) => {
    let ordinary = false, commandStarted = false, finished = false;
    const disposers = [];
    const finish = error => {
      if (finished) return;
      finished = true; for (const dispose of disposers) dispose();
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason);
    disposers.push(shell.onSubmission(event => {
      if (event.kind === 'pending') ordinary = true;
      else if (event.kind === 'success') finish();
      else if (event.kind === 'error') finish(Error(event.text || '发送失败，草稿已保留，请重试'));
    }));
    disposers.push(shell.state.subscribe(() => {
      const state = shell.state.getSnapshot();
      if (state.phase === 'adjudicating' || state.phase === 'submitting') commandStarted = true;
      if (!ordinary && commandStarted && state.phase === 'plain' && !state.draft && !state.attachmentIds.length) finish();
    }));
    const notice = shell.notices.getSnapshot();
    disposers.push(shell.notices.subscribe(() => {
      const value = shell.notices.getSnapshot();
      if (!ordinary && value !== notice && value?.level === 'error') finish(Error(value.text));
    }));
    signal.addEventListener('abort', abort, { once: true });
    disposers.push(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) { abort(); return; }
    try { shell.submit(mode, ...args); } catch (error) { finish(error); }
  });
}

export async function projectlessApi(path = '', body, signal) {
  const response = await fetch('trisoul-x/api/projectless-workspace' + path, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
  return value;
}

// A native blank Session carries the draft and its settings until the first
// send. It never receives that message: admission moves to a new cwd-only
// Session. No managed directory or Workspace registration exists beforehand.
export class ProjectlessDrafts {
  constructor(ctx, { request = projectlessApi, storage = globalThis.localStorage } = {}) {
    this.ctx = ctx; this.request = request; this.storage = storage;
    this.listeners = new Set(); this.managed = new Map(); this.inspections = new Map(); this.pending = new Map();
    this.lifetime = new AbortController(); this.revision = 0;
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
      this.drafts = Object.fromEntries(Object.entries(saved).filter(([, value]) => value && typeof value.requestId === 'string' && typeof value.sessionId === 'string'));
    } catch { this.drafts = {}; }
    this.subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    this.getSnapshot = () => this.revision;
  }
  emit() { ++this.revision; for (const fn of this.listeners) fn(); }
  save(next) { this.storage.setItem(STORAGE_KEY, JSON.stringify(next)); this.drafts = next; this.emit(); }
  current() {
    return this.ctx.sessions.list.getSnapshot().ids.find(id => this.ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView > 0);
  }
  isDraft(id) {
    if (id === undefined || !Object.hasOwn(this.drafts, id)) return false;
    // A stale browser write must never replay an already-admitted first turn.
    return this.pending.has(id) || this.ctx.sessions.list.getSnapshot().byId[this.drafts[id].sessionId]?.blank !== false;
  }
  isManaged(id) { return this.managed.get(id) === true; }
  isBusy(id) { return this.pending.has(id); }
  mark(id) {
    if (!this.isDraft(id)) this.save({ ...this.drafts, [id]: { requestId: crypto.randomUUID(), sessionId: crypto.randomUUID() } });
  }
  clear(id) { if (Object.hasOwn(this.drafts, id)) { const next = { ...this.drafts }; delete next[id]; this.save(next); } }
  async inspect(id) {
    if (!id || this.managed.has(id)) return this.isManaged(id);
    if (this.inspections.has(id)) return this.inspections.get(id);
    const cwd = this.ctx.sessions.list.getSnapshot().byId[id]?.cwd;
    if (!cwd) return false;
    const attempt = this.request('?cwd=' + encodeURIComponent(cwd), undefined, this.lifetime.signal).then(value => {
      this.managed.set(id, value.managed); this.emit(); return value.managed;
    }).finally(() => this.inspections.delete(id));
    this.inspections.set(id, attempt); return attempt;
  }
  shell(id) { return this.ctx.get('conversation').input.for(this.ctx.sessions.binding(id).ctx); }
  async copySettings(from, to) {
    const projections = this.ctx.sessions.binding(from).session.projections;
    const preset = projections.faceOf('agentPreset').getSnapshot();
    const model = projections.faceOf('modelSelection').getSnapshot();
    if (preset) checked(await this.ctx.remote.agentPresets.select(to, preset));
    const selected = model?.next ?? model?.lastUsed;
    if (selected) checked(await this.ctx.remote.session.selectModel({ sessionId: to, ...selected }));
    // OMD modes live beside native model selection; copying just effort loses
    // Pro/Ultracode. Use the same API as the model panel after selecting preset.
    const response = await fetch('trisoul-x/api/model-mode?session=' + encodeURIComponent(from));
    if (!response.ok) throw Error('无法读取当前模型模式');
    const mode = await response.json();
    if (mode.mode && mode.mode !== 'off') {
      const saved = await fetch('trisoul-x/api/model-mode?session=' + encodeURIComponent(to), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mode.selected, mode: mode.mode }),
      });
      if (!saved.ok) throw Error((await saved.json()).error || '无法保留模型模式');
    }
  }
  installSubmit(id) {
    const shell = this.shell(id), original = shell.submit, owner = this;
    function submit(mode = 'queue', ...args) {
      if (owner.lifetime.signal.aborted || !owner.isDraft(id)) return original.call(shell, mode, ...args);
      const input = shell.captureDraft();
      if (!input.draft.trim() && !input.attachmentIds.length) return;
      void owner.send(id, shell, mode, args);
    }
    shell.submit = submit;
    return () => { if (shell.submit === submit) shell.submit = original; };
  }
  async send(id, source, mode, args) {
    if (this.pending.has(id)) return;
    const choice = this.drafts[id], draft = source.captureDraft();
    const sourceRef = this.ctx.sessions.retain(id, { source: 'workspaceOperation' });
    const navigation = this.ctx.layout.beginNavigation();
    this.pending.set(id, choice); this.emit();
    let targetRef, targetShell, rebound = false, transferred = false;
    const current = () => !this.lifetime.signal.aborted && !navigation.aborted && this.current() === id && this.drafts[id] === choice;
    try {
      const workspace = await this.request('', { requestId: choice.requestId, prompt: draft.draft }, this.lifetime.signal);
      if (!current()) return;
      const target = await this.ctx.sessions.create({ cwd: workspace.cwd, sessionId: choice.sessionId });
      targetRef = this.ctx.sessions.retain(target, { source: 'workspaceOperation' });
      await targetRef.ready;
      if (!current()) return;
      await this.copySettings(id, target);
      if (!current()) return;
      const conversation = this.ctx.get('conversation');
      const files = new Map((conversation.resolveDraftAttachments?.(draft.attachmentIds) ?? []).map(attachment => [attachment.id, attachment.file]));
      rebound = true;
      conversation.rebindDraftFiles(target, draft.attachmentIds);
      await waitForDraftUploads(conversation, draft.attachmentIds,
        AbortSignal.any([navigation, this.lifetime.signal, AbortSignal.timeout(60_000)]));
      if (!current()) return;
      // Edits via other UI integrations must not get silently overwritten.
      if (JSON.stringify(source.captureDraft()) !== JSON.stringify(draft)) throw Error('草稿已变化，请重新发送');
      const next = this.shell(target), before = next.captureDraft();
      if (before.draft || before.attachmentIds.length) throw Error('目标聊天已有草稿，请先打开该聊天');
      // Refuse before admission if browser storage can no longer retain retry
      // identity. Failure after actual admission is handled as success below.
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.drafts));
      targetShell = next;
      next.restoreDraft(draft);
      this.transferOptimizer?.(id, target);
      if (draft.draft.trim()) await submitDraft(next, mode, args, this.lifetime.signal);
      else {
        // The native attachment-only shortcut emits no onSubmission events.
        // Its same send sink provides the actual admission promise directly.
        const outcome = await conversation.sendSession(targetRef.binding.session, '', draft.attachmentIds, mode, this.lifetime.signal);
        if (outcome.kind !== 'success') throw Error(outcome.text || '发送失败，附件已保留，请重试');
        next.restoreDraft(emptyDraft());
      }
      // The source remains the recoverable native blank until this point.
      // A failed first admission never leaves an unreachable ungrouped blank.
      transferred = true;
      try { this.clear(id); }
      catch { delete this.drafts[id]; this.emit(); }
      const remaining = source.captureDraft(), changed = JSON.stringify(remaining) !== JSON.stringify(draft);
      if (changed) {
        // A separate integration may edit the source despite the visual lock.
        // Preserve that new draft, including fresh copies of sent attachments
        // whose native receipt/preview ownership ended with this admission.
        const replacement = new Map();
        for (const attachmentId of remaining.attachmentIds) if (files.has(attachmentId)) {
          replacement.set(attachmentId, conversation.createDrafts(id, [files.get(attachmentId)])[0].id);
        }
        source.restoreDraft({ ...remaining, attachmentIds: remaining.attachmentIds.map(attachmentId => replacement.get(attachmentId) ?? attachmentId) });
        try { this.mark(id); }
        catch { this.drafts[id] = { requestId: crypto.randomUUID(), sessionId: crypto.randomUUID() }; this.emit(); }
        source.notify('info', '上一条消息已发送，新的草稿已保留');
      } else source.restoreDraft(emptyDraft());
      this.managed.set(target, true); this.emit();
      if (!changed && !navigation.aborted && this.current() === id) {
        this.ctx.uiWorkspace.openSession(target); next.focus();
      }
    } catch (error) {
      if (!this.lifetime.signal.aborted && !navigation.aborted) source.notify('error', error.message || '创建独立工作区失败，请重试');
    } finally {
      if (targetShell && !transferred) targetShell.restoreDraft(emptyDraft());
      if (rebound && !transferred && !this.lifetime.signal.aborted) this.ctx.get('conversation').rebindDraftFiles(id, draft.attachmentIds);
      targetRef?.release(); sourceRef.release(); this.pending.delete(id); this.emit();
    }
  }
  async startDraft(from, options) {
    if (this.newDraft) return this.newDraft;
    const navigation = this.ctx.layout.beginNavigation();
    const attempt = (async () => {
      const sourceRef = this.ctx.sessions.retain(from, { source: 'workspaceOperation' });
      let targetRef;
      try {
        // Native blank Sessions are hidden drafts. Reuse an existing directory
        // only for this unsent carrier; send() always allocates its own cwd.
        const cwd = this.ctx.sessions.list.getSnapshot().byId[from].cwd;
        const id = await this.ctx.sessions.create({ cwd });
        targetRef = this.ctx.sessions.retain(id, { source: 'workspaceOperation' });
        await targetRef.ready;
        if (navigation.aborted || this.lifetime.signal.aborted) return;
        await this.copySettings(from, id);
        if (navigation.aborted || this.lifetime.signal.aborted) return;
        this.mark(id);
        if (options) this.ctx.get('conversation').input.requestDraftInitialization(targetRef.binding, options);
        this.ctx.uiWorkspace.openSession(id);
      } catch (error) { if (!this.lifetime.signal.aborted) this.shell(from).notify('error', error.message); }
      finally { targetRef?.release(); sourceRef.release(); }
    })();
    this.newDraft = attempt;
    try { await attempt; } finally { if (this.newDraft === attempt) this.newDraft = null; }
  }
  dispose() { this.lifetime.abort(); this.listeners.clear(); }
}
