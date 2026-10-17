import { createHash } from 'node:crypto';

/** Monitoring has its own capture path; display changes never select a tool target. */
export function createPresentationHost({ runtime, activity, browserHost }) {
  const owners = new Map(), videoTargets = new Set(), hiddenTasks = new Set(), placements = new Map(), yieldedTargets = new Map();
  const imageRevisions = new WeakMap(), captures = new Map();
  let timer, refreshing, refreshRequested = false, captureRequested = false, closed = false, frameInterval = 600, revision = 0;
  async function releaseUnusedVideo() {
    const displayed = new Set([...owners.values()].filter(owner => !owner.hidden && !closed).flatMap(owner => owner.targetIds));
    for (const targetId of videoTargets) if (!displayed.has(targetId)) {
      const result = await runtime.request('stopPreview', { targetId });
      if (result.ok === false) throw new Error(result.error.message);
      videoTargets.delete(targetId);
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!closed && [...owners.values()].some(owner => !owner.hidden && owner.targetIds.length)) timer = setTimeout(() => void refresh(), frameInterval);
  }
  function groups() {
    const grouped = new Map();
    const sessions = activity.snapshot().sessions.sort((a, b) => (a.lastStarted?.startedAt || '').localeCompare(b.lastStarted?.startedAt || ''));
    for (const session of sessions) {
      for (const target of session.targets) {
        if (target.backend === 'native' && target.targetType === 'application' && target.windowId == null) continue;
        let ownerId;
        try { ownerId = browserHost.presentationOwner(target, session.sessionId); }
        catch { continue; /* A disconnected window must not move its monitor to another DSH window. */ }
        if (!browserHost.isPresentationSession(ownerId, session.sessionId)) continue;
        let group = grouped.get(ownerId);
        if (!group) { group = { targets: new Map(), activity: new Map() }; grouped.set(ownerId, group); }
        group.targets.delete(target.id); group.targets.set(target.id, { ...target, threadID: session.sessionId, completion: session.completion ?? null });
        group.activity.set(session.sessionId, session.lastStarted?.id || '');
      }
    }
    return grouped;
  }
  function taskState(rendererId, { compactImages = false, knownImages } = {}) {
    const group = groups().get(rendererId), owner = owners.get(rendererId);
    const activeTaskIds = [...group?.activity.keys() ?? []];
    return { activeTaskIds, revision, globalHidden: false,
      taskVisibilities: Object.fromEntries(activeTaskIds.map(id => [id, hiddenTasks.has(id) || owner?.hidden ? 'hidden' : 'shown'])),
      placements: Object.fromEntries(activeTaskIds.map(id => [id, placements.get(id) ?? 'pinned'])),
      frames: owner?.hidden ? [] : (owner?.frames ?? []).filter(frame => activeTaskIds.includes(frame.threadID)).map(frame => {
        if (!compactImages || !frame.imageDataURL) return frame;
        let imageRevision = imageRevisions.get(frame);
        if (!imageRevision) {
          imageRevision = createHash('sha256').update(JSON.stringify([frame.presentationID, frame.threadID])).update(frame.imageDataURL).digest('hex');
          imageRevisions.set(frame, imageRevision);
        }
        if (knownImages?.[frame.presentationID] !== imageRevision) return { ...frame, imageRevision };
        const { imageDataURL, ...value } = frame;
        return { ...value, imageRevision, imageUnchanged: true };
      }), error: owner?.error ?? null };
  }
  function capture(target, ownerId, generation, requested) {
    let record = captures.get(target.id);
    if (!record || record.ownerId !== ownerId || record.threadID !== target.threadID || record.generation !== generation) {
      record = { ownerId, threadID: target.threadID, generation, value: null, work: null };
      captures.set(target.id, record);
      requested = true;
    }
    if (requested && !record.work) {
      if (target.backend === 'native') videoTargets.add(target.id);
      record.work = Promise.resolve().then(() => runtime.request('preview', { targetId: target.id }, { sessionKey: target.threadID }))
        .then(result => {
          record.value = result.ok === false ? { error: result.error.message, errorCode: result.error.code }
            : { active: result.preview.active === true, isDetached: result.preview.isDetached === true,
              title: result.target?.title || target.title || target.name, imageDataURL: result.preview.dataUrl,
              iconDataURL: result.preview.iconDataURL ?? target.iconDataURL ?? target.favicon,
              width: result.preview.width, height: result.preview.height, kind: result.preview.kind, timestamp: result.preview.timestamp };
        }).catch(error => { record.value = { error: error.message, errorCode: error.code }; })
        .finally(() => {
          record.work = null;
          // A completed target publishes independently, without waiting for or recapturing its peers.
          if (!closed && captures.get(target.id) === record) void refresh(false);
        });
    }
    return record.value;
  }
  async function refresh(requestCapture = true) {
    if (closed) return;
    captureRequested ||= requestCapture;
    if (refreshing) { refreshRequested = true; return refreshing; }
    clearTimeout(timer);
    refreshing = (async () => {
      do {
      refreshRequested = false;
      const requested = captureRequested; captureRequested = false;
      const grouped = groups();
      for (const [ownerId, owner] of owners) if (!grouped.has(ownerId) && owner.targetIds.length) {
        owner.targetIds = []; owner.frames = []; owner.visible = false; owner.generation++;
        await browserHost.hidePresentation(ownerId);
      }
      frameInterval = 600;
      for (const [ownerId, group] of grouped) {
        let owner = owners.get(ownerId);
        if (!owner) { owner = { available: true, visible: false, rendered: false, error: null, hidden: false, generation: 0, targetIds: [], frames: [] }; owners.set(ownerId, owner); }
        if (owner.hidden) continue;
        const targets = [...group.targets.values()].filter(target => !hiddenTasks.has(target.threadID)
          && yieldedTargets.get(target.id)?.activity !== group.activity.get(target.threadID)).slice(-5).reverse(), generation = owner.generation;
        owner.targetIds = targets.map(target => target.id);
        if (targets.some(target => target.backend === 'native')) frameInterval = 100;
        const frames = targets.flatMap(target => {
          const value = capture(target, ownerId, generation, requested)
            ?? owner.frames.find(frame => frame.presentationID === target.id && frame.threadID === target.threadID);
          return value ? [{ provider: target.provider, backend: target.backend, isDetached: target.isDetached === true,
            title: target.title || target.name, iconDataURL: target.iconDataURL ?? target.favicon, ...value,
            presentationID: target.id, threadID: target.threadID, placement: placements.get(target.threadID) ?? 'pinned',
            completion: target.completion }] : [];
        });
        if (closed || owner.hidden || generation !== owner.generation) continue;
        owner.frames = frames;
        try {
          const floating = frames.filter(frame => frame.placement === 'pinned');
          const result = floating.length ? await browserHost.present({ frames: floating }, ownerId) : await browserHost.hidePresentation(ownerId);
          Object.assign(owner, result, { available: true, visible: floating.length > 0 && result?.visible === true });
          if (owner.hidden || generation !== owner.generation) { await browserHost.hidePresentation(ownerId); owner.visible = false; }
        } catch (error) { owner.error = error.message; owner.visible = false; }
      }
      for (const [targetId, record] of captures) {
        const owner = owners.get(record.ownerId);
        if (!owner || owner.hidden || owner.generation !== record.generation || !owner.targetIds.includes(targetId)) captures.delete(targetId);
      }
      revision++;
      await releaseUnusedVideo();
      } while (refreshRequested && !closed);
    })().catch(error => { for (const owner of owners.values()) owner.error = error.message; })
      .finally(() => {
        refreshing = null;
        if (refreshRequested && !closed) return refresh(captureRequested);
        schedule();
      });
    return refreshing;
  }
  const unsubscribe = activity.subscribe(() => { void refresh(); });
  return {
    snapshot: () => ({ available: [...owners.values()].some(owner => owner.available), visible: [...owners.values()].some(owner => owner.visible),
      error: [...owners.values()].find(owner => owner.error)?.error ?? null,
      windows: [...owners].map(([rendererId, owner]) => { const { frames, ...state } = owner; return { rendererId, ...state }; }) }),
    async sessionsChanged() {
      for (const [targetId, yielded] of yieldedTargets) {
        if (!browserHost.isPresentationSession(yielded.rendererId, yielded.threadID)) yieldedTargets.delete(targetId);
      }
      for (const [rendererId, owner] of owners) {
        owner.generation++;
        owner.frames = owner.frames.filter(frame => browserHost.isPresentationSession(rendererId, frame.threadID));
        owner.targetIds = owner.frames.map(frame => frame.presentationID);
        if (!owner.frames.some(frame => frame.placement === 'pinned')) {
          owner.visible = false;
          await browserHost.hidePresentation(rendererId);
        }
      }
      revision++;
      void refresh();
    },
    async handle(method, args) {
      const group = groups().get(args.rendererId);
      if (method === 'state') return { ok: true, state: taskState(args.rendererId, { compactImages: args.compactImages === true, knownImages: args.knownImages }) };
      if (method === 'contrast') {
        const owner = owners.get(args.rendererId), rect = args.rect;
        if (!group || !owner?.visible || owner.ownerPid !== args.ownerPid || !Number.isInteger(args.ownerPid) || args.ownerPid <= 0
          || !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
          || rect.width <= 0 || rect.height <= 0 || rect.width > 160 || rect.height > 160) return { ok: true, available: false };
        return runtime.request('presentationContrast', { rect, ownerPid: owner.ownerPid });
      }
      if (!group) throw new Error('The monitoring window is no longer connected');
      if (method !== 'hideAll' && !group.activity.has(args.sessionId)) throw new Error('The monitored task does not belong to this window');
      const owner = owners.get(args.rendererId);
      if (method === 'hideAll') for (const id of group.activity.keys()) hiddenTasks.add(id);
      else if (method === 'hideTask') hiddenTasks.add(args.sessionId);
      else if (method === 'showTask') {
        hiddenTasks.delete(args.sessionId);
        for (const target of group.targets.values()) if (target.threadID === args.sessionId) yieldedTargets.delete(target.id);
        if (owner) owner.hidden = false;
      }
      else if (method === 'placement') {
        if (!['home', 'pinned'].includes(args.placement)) throw new Error('Unsupported monitoring placement');
        placements.set(args.sessionId, args.placement);
      } else throw new Error('Unknown monitoring action');
      if (owner) { owner.generation++; owner.frames = owner.frames.filter(frame => !hiddenTasks.has(frame.threadID)); }
      if (owner && (method === 'hideAll' || method === 'hideTask')) {
        const generation = owner.generation;
        owner.targetIds = owner.targetIds.filter(id => { const target = group.targets.get(id); return target && !hiddenTasks.has(target.threadID); });
        const floating = owner.frames.filter(frame => frame.placement === 'pinned');
        const result = floating.length ? await browserHost.present({ frames: floating }, args.rendererId) : await browserHost.hidePresentation(args.rendererId);
        if (generation === owner.generation) owner.visible = floating.length > 0 && result?.visible === true;
        void refresh();
      } else await refresh();
      revision++;
      return { ok: true, state: taskState(args.rendererId) };
    },
    async event(event) {
      const owner = owners.get(event.rendererId);
      if (!owner) return { ok: true, ignored: true };
      if (event.type === 'focus') {
        const frame = owner.frames.find(frame => frame.presentationID === event.targetId);
        if (!frame || !browserHost.isPresentationSession(event.rendererId, frame.threadID)) return { ok: false, error: { code: 'TARGET_NOT_PRESENTED', message: 'The requested target is no longer in this conversation' } };
        const generation = owner.generation;
        const result = await runtime.request('focus', { targetId: event.targetId }, { sessionKey: frame.threadID });
        if (result.ok === false) { owner.error = result.error.message; return result; }
        if (generation !== owner.generation || !browserHost.isPresentationSession(event.rendererId, frame.threadID)) return { ok: true };
        if (result.result?.placement === 'sidebar') {
          yieldedTargets.set(event.targetId, { rendererId: event.rendererId, threadID: frame.threadID,
            activity: groups().get(event.rendererId)?.activity.get(frame.threadID) });
          owner.generation++;
          owner.frames = owner.frames.filter(value => value.presentationID !== event.targetId);
          owner.targetIds = owner.frames.map(value => value.presentationID);
          const floating = owner.frames.filter(value => value.placement === 'pinned');
          if (floating.length) await browserHost.present({ frames: floating }, event.rendererId);
          else { owner.visible = false; await browserHost.hidePresentation(event.rendererId); }
          revision++; void refresh();
        }
      }
      if (event.type === 'hidden') {
        for (const frame of owner.frames) hiddenTasks.add(frame.threadID);
        owner.visible = false; owner.frames = []; owner.targetIds = []; owner.generation++; revision++; schedule();
        await browserHost.hidePresentation(event.rendererId);
        await releaseUnusedVideo();
      }
      if (event.type === 'rendered') { owner.rendered = true; owner.error = null; }
      if (event.type === 'error') { owner.rendered = false; owner.error = event.message; }
      return { ok: true };
    },
    async close() {
      closed = true; unsubscribe(); clearTimeout(timer); captures.clear();
      for (const owner of owners.values()) { owner.hidden = true; owner.generation++; owner.visible = false; owner.frames = []; }
      const results = await Promise.allSettled([refreshing, releaseUnusedVideo(), browserHost.closePresentations()]);
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Monitoring cleanup failed');
    },
  };
}
