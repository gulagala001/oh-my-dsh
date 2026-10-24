const STORAGE_KEY = 'omd.projectless-drafts.v1';
const emptyDraft = () => ({ draft: '', occurrences: [], attachmentIds: [] });

export function initializeDraft(conversation, binding, options) {
  if (conversation.input.requestDraftInitialization) return conversation.input.requestDraftInitialization(binding, options);
  const input = conversation.input.for(binding.ctx), state = input.state.getSnapshot();
  if (state.phase === 'adjudicating' || state.phase === 'submitting') return 'blocked';
  if (options.prompt === undefined && options.clearPreviousDraft !== true) return 'preserved';
  if (options.clearPreviousDraft !== true && (state.draft !== '' || state.attachmentIds.length > 0)) return 'preserved';
  input.setDraft(options.prompt ?? '');
  return 'applied';
}

const checked = result => { if (!result.ok) throw Error(result.error?.message || '会话设置未保存'); return result.value; };

export async function copyPermissions(source, target, signal) {
  signal.throwIfAborted();
  const value = source.projections.faceOf('permissions').getSnapshot()?.currentValue;
  if (value === undefined) return; // Hosts without a permission service expose no selection.
  // The public projection exposes only the preset name, not custom sandbox /
  // approval knobs. Never replace an unknowable custom policy with defaults.
  if (value === 'custom') throw Error('请先选择一个权限预设，再发送独立聊天；草稿已保留');
  const selection = target.projections.faceOf('permissions');
  if (selection.getSnapshot()?.currentValue === value) return;
  if (!checked(await target.command(`/permission ${value}`)).matched) throw Error('无法保留当前权限设置，草稿已保留');
  signal.throwIfAborted();
  // Command admission is not settlement. Wait for the actual durable policy
  // projection before allowing any user message into the new Session.
  const waiting = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  await new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = error => { unsubscribe(); waiting.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const abort = () => finish(signal.aborted ? signal.reason : Error('权限设置未同步，请重试；草稿已保留'));
    const inspect = () => { if (selection.getSnapshot()?.currentValue === value) finish(); };
    unsubscribe = selection.subscribe(inspect);
    waiting.addEventListener('abort', abort, { once: true });
    if (waiting.aborted) abort(); else inspect();
  });
}

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
  const response = await fetch('oh-my-dsh/api/projectless-workspace' + path, {
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
    if (this.lifetime.signal.aborted) return undefined;
    return this.ctx.sessions.list.getSnapshot().ids.find(id => this.ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView > 0);
  }
  isDraft(id) {
    if (this.lifetime.signal.aborted || id === undefined || !Object.hasOwn(this.drafts, id)) return false;
    // A stale browser write must never replay an already-admitted first turn.
    return this.pending.has(id) || this.ctx.sessions.list.getSnapshot().byId[this.drafts[id].sessionId]?.blank !== false;
  }
  isManaged(id) { return !this.lifetime.signal.aborted && this.managed.get(id) === true; }
  isBusy(id) { return !this.lifetime.signal.aborted && this.pending.has(id); }
  mark(id) {
    if (!this.isDraft(id)) this.save({ ...this.drafts, [id]: { requestId: crypto.randomUUID(), sessionId: crypto.randomUUID() } });
  }
  clear(id) { if (Object.hasOwn(this.drafts, id)) { const next = { ...this.drafts }; delete next[id]; this.save(next); } }
  async inspect(id) {
    if (this.lifetime.signal.aborted) return false;
    if (!id || this.managed.has(id)) return this.isManaged(id);
    if (this.inspections.has(id)) return this.inspections.get(id);
    const cwd = this.ctx.sessions.list.getSnapshot().byId[id]?.cwd;
    if (!cwd) return false;
    const attempt = this.request('?cwd=' + encodeURIComponent(cwd), undefined, this.lifetime.signal).then(value => {
      if (this.lifetime.signal.aborted) return false;
      this.managed.set(id, value.managed); this.emit(); return value.managed;
    }).finally(() => this.inspections.delete(id));
    this.inspections.set(id, attempt); return attempt;
  }
  shell(id) { return this.ctx.get('conversation').input.for(this.ctx.sessions.binding(id).ctx); }
  async copySettings(from, to, signal = this.lifetime.signal, requestedPreset) {
    signal.throwIfAborted();
    const source = this.ctx.sessions.binding(from).session;
    const projections = source.projections;
    await copyPermissions(source, this.ctx.sessions.binding(to).session, signal);
    signal.throwIfAborted();
    const sourcePreset = projections.faceOf('agentPreset').getSnapshot();
    const preset = requestedPreset ?? sourcePreset;
    const model = projections.faceOf('modelSelection').getSnapshot();
    if (preset) checked(await this.ctx.remote.agentPresets.select(to, preset));
    signal.throwIfAborted();
    const selected = model?.next ?? model?.lastUsed;
    if (selected) checked(await this.ctx.remote.session.selectModel({ sessionId: to, ...selected }));
    signal.throwIfAborted();
    // Explicit native actions (for example Create Plugin) own their preset.
    // Carry model and permissions, but never transplant another preset's mode.
    if (preset !== sourcePreset) return;
    if (preset?.startsWith('omaa-')) {
      const transferred = await fetch('omaa/api/session-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ sourceSessionId: from, targetSessionId: to, requestId: this.drafts[from]?.requestId ?? to }),
      });
      if (!transferred.ok) {
        const error = await transferred.json().catch(() => ({}));
        throw Error(error.error || '无法保留 OMAA 预设设置，请更新匹配的 OMAA；草稿已保留');
      }
      const result = await transferred.json();
      signal.throwIfAborted();
      if (result.handledWorkMode) return;
    }
    // OMD mode and the remembered Ultra submode live beside native model
    // selection. Copy both, including the submode while Ultra is off.
    const response = await fetch('oh-my-dsh/api/model-mode?session=' + encodeURIComponent(from), { signal });
    if (!response.ok) throw Error('无法读取当前模型模式');
    const mode = await response.json();
    signal.throwIfAborted();
    const targetResponse = await fetch('oh-my-dsh/api/model-mode?session=' + encodeURIComponent(to), { signal });
    if (!targetResponse.ok) throw Error('无法读取目标模型模式');
    const targetMode = await targetResponse.json();
    signal.throwIfAborted();
    const saved = await fetch('oh-my-dsh/api/model-mode?session=' + encodeURIComponent(to), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ ...mode.selected, mode: mode.mode ?? 'off', submode: (mode.mode === 'off' ? mode.savedSubmode : mode.submode) ?? mode.submode ?? 'free', expectedRevision: targetMode.revision }),
    });
    if (!saved.ok) throw Error((await saved.json()).error || '无法保留模型模式');
  }
  installSubmit(id) {
    // Slot wrappers can survive a plugin reload until React commits the new
    // registration. Never resolve services through their disposed owner.
    if (this.lifetime.signal.aborted) return;
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
    if (this.lifetime.signal.aborted || this.pending.has(id)) return;
    const choice = this.drafts[id], draft = source.captureDraft();
    const navigation = this.ctx.layout.beginNavigation();
    // Preparation follows navigation. Native retain cancels only this waiter's
    // readiness; the finally block still owns every acquired reference.
    const signal = AbortSignal.any([navigation, this.lifetime.signal]);
    this.pending.set(id, choice); this.emit();
    let sourceRef, targetRef, targetShell, rebound = false, transferred = false;
    const current = () => !signal.aborted && this.current() === id && this.drafts[id] === choice;
    try {
      signal.throwIfAborted();
      sourceRef = this.ctx.sessions.retain(id, { source: 'workspaceOperation' });
      const workspace = await this.request('', { requestId: choice.requestId, prompt: draft.draft }, signal);
      if (!current()) return;
      const target = await this.ctx.sessions.create({ cwd: workspace.cwd, sessionId: choice.sessionId });
      if (!current()) return;
      targetRef = this.ctx.sessions.retain(target, { source: 'workspaceOperation', signal });
      await targetRef.ready;
      if (!current()) return;
      await this.copySettings(id, target, signal);
      if (!current()) return;
      const conversation = this.ctx.get('conversation');
      const files = new Map((conversation.resolveDraftAttachments?.(draft.attachmentIds) ?? []).map(attachment => [attachment.id, attachment.file]));
      rebound = true;
      conversation.rebindDraftFiles(target, draft.attachmentIds);
      await waitForDraftUploads(conversation, draft.attachmentIds,
        AbortSignal.any([signal, AbortSignal.timeout(60_000)]));
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
      signal.throwIfAborted();
      // Once submitted, navigation cannot discard the actual admission receipt
      // or return attachments that the host may already have consumed.
      if (draft.draft.trim()) await submitDraft(next, mode, args, this.lifetime.signal);
      else {
        // The native attachment-only shortcut emits no onSubmission events.
        // Its same send sink provides the actual admission promise directly.
        next.restoreDraft(emptyDraft());
        const outcome = await conversation.sendSession(targetRef.binding.session, '', draft.attachmentIds, mode, this.lifetime.signal);
        if (outcome.kind !== 'success') throw Error(outcome.text || '发送失败，附件已保留，请重试');
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
      if (targetShell && !transferred) {
        const remaining = targetShell.captureDraft();
        targetShell.restoreDraft(JSON.stringify(remaining) === JSON.stringify(draft) ? emptyDraft() : {
          ...remaining, attachmentIds: remaining.attachmentIds.filter(attachmentId => !draft.attachmentIds.includes(attachmentId)),
        });
      }
      if (rebound && !transferred && !this.lifetime.signal.aborted) this.ctx.get('conversation').rebindDraftFiles(id, draft.attachmentIds);
      targetRef?.release(); sourceRef?.release(); this.pending.delete(id); this.emit();
    }
  }
  async startDraft(from, options) {
    if (this.lifetime.signal.aborted) return;
    if (this.newDraft) return this.newDraft;
    const navigation = this.ctx.layout.beginNavigation();
    const signal = AbortSignal.any([navigation, this.lifetime.signal]);
    const attempt = (async () => {
      let sourceRef, targetRef;
      try {
        sourceRef = this.ctx.sessions.retain(from, { source: 'workspaceOperation', signal });
        await sourceRef.ready;
        signal.throwIfAborted();
        // Native blank Sessions are hidden drafts. Reuse an existing directory
        // only for this unsent carrier; send() always allocates its own cwd.
        const source = this.ctx.sessions.binding(from).session;
        const agentPreset = options?.agentPreset ?? source.projections.faceOf('agentPreset').getSnapshot();
        const sessions = this.ctx.sessions.list.getSnapshot();
        const cwd = sessions.byId[from].cwd;
        // New Session must bring back a retained unsent draft, including its
        // settings and attachments. Never adopt another preset or an admitted
        // first send merely because its carrier still looks blank.
        const reusable = Object.keys(this.drafts).find(id => this.isDraft(id) && !this.isBusy(id)
          && sessions.byId[id]?.blank === true && sessions.byId[id]?.projectionValues?.agentPreset === agentPreset);
        const id = reusable ?? await this.ctx.sessions.create({ cwd, agentPreset });
        signal.throwIfAborted();
        targetRef = this.ctx.sessions.retain(id, { source: 'workspaceOperation', signal });
        await targetRef.ready;
        signal.throwIfAborted();
        if (!reusable) await this.copySettings(from, id, signal, agentPreset);
        signal.throwIfAborted();
        this.mark(id);
        if (options && initializeDraft(this.ctx.get('conversation'), targetRef.binding, options) === 'blocked') {
          throw Error('草稿正在提交，请稍后重试；现有草稿已保留');
        }
        signal.throwIfAborted();
        this.ctx.uiWorkspace.openSession(id);
      } catch (error) { if (!signal.aborted) this.shell(from).notify('error', error.message); }
      finally { targetRef?.release(); sourceRef?.release(); }
    })();
    this.newDraft = attempt;
    try { await attempt; } finally { if (this.newDraft === attempt) this.newDraft = null; }
  }
  dispose() { this.lifetime.abort(); this.listeners.clear(); }
}
