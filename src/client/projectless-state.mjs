const PREFERENCES_KEY = 'omd.draft-preferences.v1';
const validModel = value => value && typeof value.provider === 'string' && value.provider
  && typeof value.model === 'string' && value.model;
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;

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

export async function projectlessApi(path = '', body, signal) {
  const response = await fetch('oh-my-dsh/api/projectless-workspace' + path, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
  return value;
}

// A projectless chat owns its final directory and native Session before the
// composer is shown. Submission, attachments and every plugin's session state
// stay with that same identity; OMD never substitutes a Session on first send.
export class ProjectlessDrafts {
  constructor(ctx, { request = projectlessApi, storage = globalThis.localStorage } = {}) {
    this.ctx = ctx; this.request = request; this.storage = storage;
    this.listeners = new Set(); this.managed = new Map(); this.inspections = new Map();
    this.lifetime = new AbortController(); this.revision = 0;
    this.subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    this.getSnapshot = () => this.revision;
  }
  emit() { ++this.revision; for (const fn of this.listeners) fn(); }
  preferences() {
    try {
      const value = JSON.parse(this.storage.getItem(PREFERENCES_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  workspaceState() { return this.ctx.get?.('workspaces')?.list?.getSnapshot() ?? { items: [], archivedSessionIds: [] }; }
  scopeFor(id) {
    // Native workspace membership wins even when a former projectless chat's
    // directory was later added as a workspace. Browser preferences are not ownership.
    const workspace = this.workspaceState().items.find(item => item.sessionIds.includes(id));
    return workspace ? `workspace:${workspace.workspaceId}` : 'global';
  }
  remember(scope, patch) {
    const preferences = this.preferences();
    this.storage.setItem(PREFERENCES_KEY, JSON.stringify({ ...preferences, [scope]: { ...preferences[scope], ...patch } }));
  }
  // Called by user-facing model controls only, never by projection replay or
  // the native RPC used to restore a draft.
  rememberModel(id, selected) {
    if (this.lifetime.signal.aborted || !validModel(selected)) return;
    this.remember(this.scopeFor(id), { model: { provider: selected.provider, model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) } });
  }
  async applyModelPreference(id, scope, signal) {
    const catalog = checked(await this.ctx.remote.session.modelCatalog());
    signal.throwIfAborted();
    // Snapshot the host default once. Automatic native selection also saves
    // the host-wide default; it must not leak one workspace into another.
    if (!validModel(this.preferences().global?.model)) this.remember('global', { model: catalog.default });
    const preference = this.preferences()[scope]?.model ?? this.preferences().global?.model;
    if (!validModel(preference)) return;
    if (!validModel(this.preferences()[scope]?.model)) this.remember(scope, { model: preference });
    const available = catalog.groups.some(group => group.id === preference.provider && group.models.some(model => model.id === preference.model));
    if (!available) {
      this.shell(id).notify('error', `记住的模型渠道 ${preference.provider} / ${preference.model} 当前不可选，请重新选择；草稿已保留`);
      return;
    }
    const session = this.ctx.sessions.binding(id).session;
    const blank = session.getSnapshot?.().blank ?? this.ctx.sessions.list.getSnapshot().byId[id]?.blank;
    if (blank !== true || !sameModel(this.preferences()[scope]?.model, preference)) return;
    const projection = session.projections.faceOf('modelSelection').getSnapshot();
    // Pin even an unchanged default on this draft: another workspace's native
    // selection must not later move a still-unselected draft with the global default.
    if (!sameModel(projection?.next ?? projection?.lastUsed, preference)) {
      checked(await this.ctx.remote.session.selectModel({ sessionId: id, ...preference }));
      signal.throwIfAborted();
    }
  }
  current() {
    if (this.lifetime.signal.aborted) return undefined;
    return this.ctx.sessions.list.getSnapshot().ids.find(id => this.ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView > 0);
  }
  isManaged(id) { return !this.lifetime.signal.aborted && this.managed.get(id) === true && this.scopeFor(id) === 'global'; }
  async inspect(id) {
    if (this.lifetime.signal.aborted) return false;
    if (!id || this.managed.has(id)) return this.isManaged(id);
    if (this.inspections.has(id)) return this.inspections.get(id);
    const cwd = this.ctx.sessions.list.getSnapshot().byId[id]?.cwd;
    if (!cwd) return false;
    const attempt = this.request('?cwd=' + encodeURIComponent(cwd), undefined, this.lifetime.signal).then(value => {
      if (this.lifetime.signal.aborted) return false;
      this.managed.set(id, value.managed); this.emit(); return this.isManaged(id);
    }).finally(() => this.inspections.delete(id));
    this.inspections.set(id, attempt); return attempt;
  }
  shell(id) { return this.ctx.get('conversation').input.for(this.ctx.sessions.binding(id).ctx); }
  async startDraft(from, options, workspaceId, beforeOpen) {
    if (this.lifetime.signal.aborted) return;
    const scope = workspaceId === undefined ? 'global' : `workspace:${workspaceId}`;
    if (this.newDraft && this.newDraftScope === scope) return this.newDraft;
    const navigation = this.ctx.layout.beginNavigation();
    const signal = AbortSignal.any([navigation, this.lifetime.signal]);
    const attempt = (async () => {
      let sourceRef, targetRef;
      try {
        if (from) {
          sourceRef = this.ctx.sessions.retain(from, { source: 'workspaceOperation', signal });
          await sourceRef.ready;
        }
        signal.throwIfAborted();
        const sessions = this.ctx.sessions.list.getSnapshot();
        const workspaces = this.workspaceState();
        const usable = id => sessions.byId[id]?.blank === true
          && sessions.byId[id]?.origin !== 'subagent' && !sessions.byId[id]?.projectionValues?.subagent
          && !workspaces.archivedSessionIds.includes(id) && this.scopeFor(id) === scope;
        const preferred = this.preferences()[scope]?.draft;
        let reusable;
        for (const candidate of new Set([preferred, from, ...sessions.ids])) {
          if (usable(candidate) && (workspaceId !== undefined || await this.inspect(candidate))) { reusable = candidate; break; }
          signal.throwIfAborted();
        }
        const agentPreset = options?.agentPreset ?? sessions.byId[reusable]?.projectionValues?.agentPreset;
        let id;
        if (workspaceId === undefined) {
          if (reusable) {
            id = reusable;
            if (options?.agentPreset) checked(await this.ctx.remote.agentPresets.select(id, options.agentPreset));
          } else {
            // Reserve one identity before any I/O. A cancelled or failed creation
            // retries the same directory and Session, without exposing a carrier.
            let reserved = this.preferences().global?.pendingDraft;
            if (typeof reserved !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(reserved)) reserved = crypto.randomUUID();
            this.remember(scope, { pendingDraft: reserved });
            const workspace = await this.request('', { requestId: reserved, prompt: options?.prompt }, signal);
            signal.throwIfAborted();
            id = await this.ctx.sessions.create({ cwd: workspace.cwd, sessionId: reserved, ...(agentPreset ? { agentPreset } : {}) });
            if (id !== reserved) {
              this.remember(scope, { pendingDraft: undefined });
              throw Error('预留会话已开始，请重新新建聊天；原会话与草稿已保留');
            }
          }
        } else {
          id = await this.ctx.sessions.create({ workspaceId,
            ...(reusable ? { sessionId: reusable } : {}), ...(agentPreset ? { agentPreset } : {}) });
        }
        signal.throwIfAborted();
        targetRef = this.ctx.sessions.retain(id, { source: 'workspaceOperation', signal });
        await targetRef.ready;
        signal.throwIfAborted();
        this.remember(scope, { draft: id, pendingDraft: undefined });
        if (workspaceId === undefined) { this.managed.set(id, true); this.emit(); }
        await this.applyModelPreference(id, scope, signal);
        signal.throwIfAborted();
        if (options && initializeDraft(this.ctx.get('conversation'), targetRef.binding, options) === 'blocked') {
          throw Error('草稿正在提交，请稍后重试；现有草稿已保留');
        }
        await beforeOpen?.(id);
        signal.throwIfAborted();
        this.ctx.uiWorkspace.openSession(id);
      } catch (error) { if (!signal.aborted) {
        if (from) this.shell(from).notify('error', error.message); else throw error;
      } }
      finally { targetRef?.release(); sourceRef?.release(); }
    })();
    this.newDraft = attempt; this.newDraftScope = scope;
    try { await attempt; } finally { if (this.newDraft === attempt) this.newDraft = null; }
  }
  dispose() { this.lifetime.abort(); this.listeners.clear(); }
}
