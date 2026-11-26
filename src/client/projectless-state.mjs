const PREFERENCES_KEY = 'omd.draft-preferences.v1';
const validModel = value => value && typeof value.provider === 'string' && value.provider
  && typeof value.model === 'string' && value.model;
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
const modelKey = value => JSON.stringify([value.provider, value.model]);
const validSubmode = value => ['workflow', 'team', 'free'].includes(value);
const hasDraft = state => state.draft !== '' || state.attachmentIds.length > 0;

export async function modelModeApi(sessionId, body, signal) {
  const response = await fetch(`oh-my-dsh/api/model-mode?session=${encodeURIComponent(sessionId)}`, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

export function initializeDraft(conversation, binding, options) {
  if (conversation.input.requestDraftInitialization) return conversation.input.requestDraftInitialization(binding, options);
  const input = conversation.input.for(binding.ctx), state = input.state.getSnapshot();
  if (['adjudicating', 'submitting', 'sending'].includes(state.phase)) return 'blocked';
  if (options.prompt === undefined && options.clearPreviousDraft !== true) return 'preserved';
  if (options.clearPreviousDraft !== true && hasDraft(state)) return 'preserved';
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
  constructor(ctx, { request = projectlessApi, modeRequest = modelModeApi, storage = globalThis.localStorage } = {}) {
    this.ctx = ctx; this.request = request; this.modeRequest = modeRequest; this.storage = storage;
    this.modelRestores = new Map();
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
  rememberModel(id, selected, mode) {
    if (this.lifetime.signal.aborted || !validModel(selected)) return;
    this.clearModelRestore(id);
    const scope = this.scopeFor(id), previous = this.preferences()[scope];
    const ultra = mode?.mode === 'ultra';
    this.remember(scope, { model: { provider: selected.provider, model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) },
      modelMode: { mode: ultra ? 'ultra' : 'off', submode: validSubmode(mode?.savedSubmode ?? mode?.submode) ? mode.savedSubmode ?? mode.submode : 'free' },
      ...(ultra && typeof selected.reasoningEffort === 'string' ? { ultraEfforts: {
        ...previous?.ultraEfforts, [modelKey(selected)]: selected.reasoningEffort,
      } } : {}),
    });
  }
  observeManualChoices() {
    const drafts = this;
    // Native /model and other native selectors use directory.select; automatic
    // transfers use remote.session.selectModel and never enter this UI boundary.
    this.ctx.inject(['modelDirectories'], scope => {
      const models = scope.modelDirectories, original = models.directoryFor, restores = new Map();
      function directoryFor(id) {
        const directory = original.call(this, id);
        if (!restores.has(directory)) {
          const select = directory.select;
          let revision = 0;
          async function choose(selection) {
            const ticket = ++revision;
            if (drafts.modelRestores.has(id)) await drafts.beforeModelChoice(id);
            const result = await select.call(this, selection);
            const current = directory.store?.getSnapshot().current;
            if (result.ok && ticket === revision && (!current || sameModel(current, selection))) drafts.rememberModel(id, selection);
            return result;
          }
          const restore = () => { if (directory.select === choose) directory.select = select; restores.delete(directory); };
          directory.select = choose; restores.set(directory, restore);
          drafts.ctx.sessions.scope(id).effect(() => restore);
        }
        return directory;
      }
      models.directoryFor = directoryFor;
      scope.effect(() => () => {
        if (models.directoryFor === directoryFor) models.directoryFor = original;
        for (const restore of restores.values()) restore();
      });
    });
  }
  preferredUltraEffort(id, route, model) {
    const preferences = this.preferences(), scope = preferences[this.scopeFor(id)];
    const remembered = (validModel(scope?.model) ? scope : preferences.global)?.ultraEfforts?.[modelKey(route)];
    return model?.reasoning?.efforts?.some(level => level.id === remembered) ? remembered : undefined;
  }
  clearModelRestore(id) {
    const restore = this.modelRestores.get(id);
    if (!restore) return;
    this.modelRestores.delete(id);
    restore.controller.abort();
    restore.release?.();
    this.emit();
  }
  // A manual choice supersedes a pending read immediately. An already dispatched
  // write must settle before the native selector writes its user's choice.
  async beforeModelChoice(id) {
    const restore = this.modelRestores.get(id);
    if (!restore) return;
    restore.reason = '请确认模型选择后发送。';
    restore.manual = true; restore.failed = false;
    if (!restore.writing) restore.controller.abort();
    this.emit();
    if (!restore.writing) return false;
    await restore.done;
    return true;
  }
  restoreModel(id, scope) {
    const previous = this.modelRestores.get(id);
    if (previous && !previous.failed) return previous.done;
    this.clearModelRestore(id);
    const controller = new AbortController();
    const prefs = this.preferences();
    const hasPreference = validModel(prefs[scope]?.model) || validModel(prefs.global?.model);
    const restore = { controller, reason: hasPreference ? '正在恢复模型偏好，也可以直接选择模型。' : null };
    this.modelRestores.set(id, restore);
    // Releasing a Session invalidates late catalog replies without retaining a
    // navigation lease (the remote catalog read has no cancellation argument).
    restore.release = this.ctx.sessions.scope?.(id).effect(() => () => {
      if (this.modelRestores.get(id) === restore) this.clearModelRestore(id);
    });
    this.emit();
    restore.done = this.applyModelPreference(id, scope, controller.signal, run => {
      controller.signal.throwIfAborted();
      restore.writing = true;
      return run();
    }).then(() => {
      if (this.modelRestores.get(id) === restore && !restore.manual) this.clearModelRestore(id);
    }, error => {
      if (controller.signal.aborted || restore.manual || this.modelRestores.get(id) !== restore) return;
      if (!hasPreference) {
        this.shell(id).notify('error', '未能读取默认模型：' + error.message + '。本会话使用宿主模型设置。');
        this.clearModelRestore(id);
        return;
      }
      restore.failed = true;
      restore.reason = '未恢复模型偏好：' + error.message + '。请重试或手动选择模型。';
      this.shell(id).notify('error', restore.reason);
      this.emit();
    }).finally(() => { restore.writing = false; });
    return restore.done;
  }
  async applyModelPreference(id, scope, signal, write) {
    const catalog = checked(await this.ctx.remote.session.modelCatalog());
    signal.throwIfAborted();
    // Snapshot the host default once. Automatic native selection also saves
    // the host-wide default; it must not leak one workspace into another.
    if (!validModel(this.preferences().global?.model)) this.remember('global', { model: catalog.default });
    const saved = this.preferences()[scope], global = this.preferences().global;
    const settings = validModel(saved?.model) ? saved : global;
    const preference = settings?.model;
    if (!validModel(preference)) return;
    if (!validModel(saved?.model)) this.remember(scope, { model: preference, modelMode: settings.modelMode, ultraEfforts: settings.ultraEfforts });
    const available = catalog.groups.some(group => group.id === preference.provider && group.models.some(model => model.id === preference.model));
    if (!available) {
      throw Error(`记住的模型渠道 ${preference.provider} / ${preference.model} 当前不可选`);
    }
    const session = this.ctx.sessions.binding(id).session;
    const blank = session.getSnapshot?.().blank ?? this.ctx.sessions.list.getSnapshot().byId[id]?.blank;
    if (blank !== true || !sameModel(this.preferences()[scope]?.model, preference)) return;
    if (['ultra', 'off'].includes(settings.modelMode?.mode)) {
      const before = await this.modeRequest(id, undefined, signal);
      signal.throwIfAborted();
      const latest = this.preferences()[scope];
      if ((session.getSnapshot?.().blank ?? this.ctx.sessions.list.getSnapshot().byId[id]?.blank) !== true
        || !sameModel(latest?.model, preference) || JSON.stringify(latest?.modelMode) !== JSON.stringify(settings.modelMode)) return;
      if (settings.modelMode.mode === 'off' || before.eligible) {
        const submode = settings.modelMode.submode === 'team' && !before.teamAvailable ? 'free'
          : validSubmode(settings.modelMode.submode) ? settings.modelMode.submode : 'free';
        // Restore the model without authorizing a different strategy while Workflow is unavailable.
        const mode = submode === 'workflow' && before.workflowAvailable === false ? 'off' : settings.modelMode.mode;
        if (before.revision < 0 || before.mode !== mode || mode === 'ultra' && before.submode !== submode || !sameModel(before.selected, preference)) {
          const model = catalog.groups.find(group => group.id === preference.provider).models.find(model => model.id === preference.model);
          const reasoningEffort = mode === 'off' || model.reasoning?.efforts?.some(level => level.id === preference.reasoningEffort) ? preference.reasoningEffort : undefined;
          await write(() => this.modeRequest(id, { ...preference, reasoningEffort, mode, submode, expectedRevision: before.revision }, signal));
          signal.throwIfAborted();
        }
        return;
      }
    }
    const projection = session.projections.faceOf('modelSelection').getSnapshot();
    // Pin even an unchanged default on this draft: another workspace's native
    // selection must not later move a still-unselected draft with the global default.
    if (!sameModel(projection?.next ?? projection?.lastUsed, preference)) {
      checked(await write(() => this.ctx.remote.session.selectModel({ sessionId: id, ...preference })));
      signal.throwIfAborted();
    }
  }
  current() {
    if (this.lifetime.signal.aborted) return undefined;
    return this.ctx.sessions.list.getSnapshot().ids.find(id => this.ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView > 0);
  }
  cwdOf(id) { return this.ctx.sessions.list.getSnapshot().byId[id]?.cwd; }
  isManaged(id) {
    const receipt = this.managed.get(id);
    return !this.lifetime.signal.aborted && receipt?.managed === true && receipt.cwd === this.cwdOf(id) && this.scopeFor(id) === 'global';
  }
  async inspect(id) {
    if (this.lifetime.signal.aborted || !id || this.scopeFor(id) !== 'global') return false;
    const cwd = this.cwdOf(id);
    if (!cwd) return false;
    if (this.managed.get(id)?.cwd === cwd) return this.isManaged(id);
    const pending = this.inspections.get(id);
    if (pending?.cwd === cwd) return pending.attempt;
    const attempt = this.request('?cwd=' + encodeURIComponent(cwd) + '&session=' + encodeURIComponent(id), undefined, this.lifetime.signal).then(value => {
      if (this.lifetime.signal.aborted || this.inspections.get(id)?.attempt !== attempt || cwd !== this.cwdOf(id)) return false;
      this.managed.set(id, { cwd, managed: value.managed }); this.emit(); return this.isManaged(id);
    }).finally(() => { if (this.inspections.get(id)?.attempt === attempt) this.inspections.delete(id); });
    this.inspections.set(id, { cwd, attempt }); return attempt;
  }
  shell(id) { return this.ctx.get('conversation').input.for(this.ctx.sessions.binding(id).ctx); }
  prepareWorkspaceDraft(from, to, transfer) {
    const blank = id => this.ctx.sessions.binding(id)?.session.getSnapshot?.().blank
      ?? this.ctx.sessions.list.getSnapshot().byId[id]?.blank;
    if (!from || from === to || blank(from) !== true) return;
    const source = this.shell(from).state.getSnapshot();
    if (!['plain', 'claimed'].includes(source.phase) || !hasDraft(source)) return;
    const target = this.shell(to);
    const state = target.state.getSnapshot();
    if (blank(to) !== true || hasDraft(state) || !['plain', 'claimed'].includes(state.phase)) {
      target.notify('info', '目标已有草稿或正在提交，原草稿仍保留在原会话。');
      return;
    }
    transfer(to);
  }
  async startDraft(from, options, workspaceId, beforeOpen, carryDraft = false) {
    if (this.lifetime.signal.aborted) return;
    const scope = workspaceId === undefined ? 'global' : `workspace:${workspaceId}`;
    if (this.newDraft && this.newDraftScope === scope && this.carryDraft === carryDraft) return this.newDraft;
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
        const workspace = workspaces.items.find(item => item.workspaceId === workspaceId);
        const usable = id => sessions.byId[id]?.blank === true
          && sessions.byId[id]?.origin !== 'subagent' && !sessions.byId[id]?.projectionValues?.subagent
          && (workspaceId === undefined || sessions.byId[id].cwd === workspace?.path)
          && !workspaces.archivedSessionIds.includes(id) && this.scopeFor(id) === scope;
        const preferred = this.preferences()[scope]?.draft;
        let reusable;
        for (const candidate of new Set([preferred, from, ...sessions.ids])) {
          if (usable(candidate) && (workspaceId !== undefined || await this.inspect(candidate))) { reusable = candidate; break; }
          signal.throwIfAborted();
        }
        const agentPreset = options?.agentPreset ?? sessions.byId[reusable]?.projectionValues?.agentPreset
          ?? (carryDraft && !reusable ? sessions.byId[from]?.projectionValues?.agentPreset : undefined);
        let id, allocatedCwd;
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
            const workspace = await this.request('', { requestId: reserved }, signal);
            signal.throwIfAborted();
            allocatedCwd = workspace.cwd;
            id = await this.ctx.sessions.create({ cwd: allocatedCwd, sessionId: reserved, ...(agentPreset ? { agentPreset } : {}) });
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
        if (allocatedCwd && this.cwdOf(id) === allocatedCwd) {
          this.managed.set(id, { cwd: allocatedCwd, managed: true }); this.emit();
        }
        if (options && initializeDraft(this.ctx.get('conversation'), targetRef.binding, options) === 'blocked') {
          throw Error('草稿正在提交，请稍后重试；现有草稿已保留');
        }
        if (carryDraft && beforeOpen) this.prepareWorkspaceDraft(from, id, beforeOpen);
        else if (beforeOpen) await beforeOpen(id);
        signal.throwIfAborted();
        this.ctx.uiWorkspace.openSession(id);
        void this.restoreModel(id, scope);
      } catch (error) { if (!signal.aborted) {
        if (from) this.shell(from).notify('error', error.message); else throw error;
      } }
      finally { targetRef?.release(); sourceRef?.release(); }
    })();
    this.newDraft = attempt; this.newDraftScope = scope; this.carryDraft = carryDraft;
    try { await attempt; } finally { if (this.newDraft === attempt) this.newDraft = null; }
  }
  dispose() {
    this.lifetime.abort(); this.listeners.clear();
    for (const id of this.modelRestores.keys()) this.clearModelRestore(id);
  }
}
