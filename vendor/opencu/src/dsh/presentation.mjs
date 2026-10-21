import { createHash, randomUUID } from 'node:crypto';

const FRAME_LIMIT = 5, EXPANDED_FRAME_LIMIT = 10, MAX_CAPTURE_BACKOFF = 15000;

/** Monitoring has its own capture path; display changes never select a tool target. */
export function createPresentationHost({ runtime, activity, browserHost }) {
  const owners = new Map(), videoTargets = new Set(), hiddenTasks = new Set(), placements = new Map(), yieldedTargets = new Map();
  const hiddenTargets = new Map(), expandedOwners = new Set();
  // Image revisions only need to be unique per host instance; never hash the image bytes.
  const imageInstance = randomUUID().slice(0, 8);
  let imageSequence = 0;
  const captures = new Map(), renderFailures = new Map();
  let mediaGeneration = 0;
  const transientCaptureErrors = new Set(['PRESENTATION_TIMEOUT', 'CAPTURE_FAILED', 'CAPTURE_TIMEOUT', 'VIDEO_CAPTURE_FAILED',
    'VIDEO_CAPTURE_TIMEOUT', 'VIDEO_CAPTURE_STOPPED', 'BROWSER_CAPTURE_TIMEOUT', 'WINDOW_AX_MAPPING_FAILED',
    'JS_DIALOG_OPEN', 'PREVIEW_FRAME_INVALID', 'BACKGROUND_CAPTURE_UNAVAILABLE']);
  let timer, refreshing, refreshRequested = false, captureRequested = false, closed = false, revision = 0;
  const targetKey = (rendererId, sessionId, targetId) => JSON.stringify([rendererId, sessionId, targetId]);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  const visibilityKey = (target, rendererId) => createHash('sha256').update(JSON.stringify([
    rendererId, target.threadID, target.id, target.backend, canonical(target.identity ?? null),
  ])).digest('hex');
  const manuallyHidden = (target, rendererId) => hiddenTargets.get(targetKey(rendererId, target.threadID, target.id))?.visibilityKey === visibilityKey(target, rendererId);
  // Moving a target into the sidebar hides its preview for the current activity; it is restorable like a closed one.
  const yielded = (target, group) => yieldedTargets.get(target.id)?.activity === group.activity.get(target.threadID);
  const eligible = (target, group, ownerId) => !hiddenTasks.has(target.threadID) && !manuallyHidden(target, ownerId) && !yielded(target, group);
  const frameLimit = ownerId => expandedOwners.has(ownerId) ? EXPANDED_FRAME_LIMIT : FRAME_LIMIT;
  const renderFailure = (rendererId, frame) => {
    const failure = renderFailures.get(targetKey(rendererId, frame.threadID, frame.presentationID));
    return failure?.identity === frame.visibilityKey && failure.mediaGeneration === frame.mediaGeneration ? failure : null;
  };
  const ownerError = (rendererId, owner) => owner?.error ?? owner?.frames.map(frame => renderFailure(rendererId, frame)).find(Boolean)?.message ?? null;
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
    if (closed) return;
    let next = Infinity;
    for (const record of captures.values()) {
      const owner = owners.get(record.ownerId);
      if (owner && !owner.hidden && owner.targetIds.includes(record.targetId) && !record.work) next = Math.min(next, record.nextCaptureAt);
    }
    if (Number.isFinite(next)) timer = setTimeout(() => void refresh(), Math.max(0, next - Date.now()));
  }
  async function presentFrames(ownerId, owner, frames) {
    // Image bytes are represented by their cached revision, not serialized again for comparison.
    const signature = JSON.stringify(frames.map(({ imageDataURL, ...frame }) => frame));
    if (signature === owner.presentationSignature && (!frames.length || owner.visible)) return;
    const generation = owner.generation;
    try {
      const result = frames.length ? await browserHost.present({ frames }, ownerId) : await browserHost.hidePresentation(ownerId);
      if (generation !== owner.generation) { owner.presentationSignature = null; return; }
      Object.assign(owner, result, { available: true, visible: frames.length > 0 && result?.visible === true });
      owner.presentationSignature = !frames.length || owner.visible ? signature : null;
      if (!frames.length || owner.visible) owner.error = null;
    } catch (error) { owner.presentationSignature = null; throw error; }
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
  function shownTargets(group, ownerId) {
    return [...group.targets.values()].filter(target => eligible(target, group, ownerId)).slice(-frameLimit(ownerId)).reverse();
  }
  function overflowCounts(ownerId, group) {
    if (!group) return {};
    const shown = new Set(shownTargets(group, ownerId).map(target => target.id)), counts = {};
    for (const target of group.targets.values()) {
      if (eligible(target, group, ownerId) && !shown.has(target.id)) counts[target.threadID] = (counts[target.threadID] ?? 0) + 1;
    }
    return counts;
  }
  function taskState(rendererId, { compactImages = false, knownImages, imagePlacement, imageSessions } = {}) {
    const group = groups().get(rendererId), owner = owners.get(rendererId);
    const activeTaskIds = [...group?.activity.keys() ?? []];
    return { activeTaskIds, revision, globalHidden: false,
      taskVisibilities: Object.fromEntries(activeTaskIds.map(id => [id, hiddenTasks.has(id) || owner?.hidden ? 'hidden' : 'shown'])),
      hiddenTargetCounts: Object.fromEntries(activeTaskIds.map(id => [id,
        [...group.targets.values()].filter(target => target.threadID === id && !hiddenTasks.has(id)
          && (manuallyHidden(target, rendererId) || yielded(target, group))).length])),
      overflowCounts: overflowCounts(rendererId, group), expanded: expandedOwners.has(rendererId),
      placements: Object.fromEntries(activeTaskIds.map(id => [id, placements.get(id) ?? 'pinned'])),
      frames: owner?.hidden ? [] : (owner?.frames ?? []).filter(frame => activeTaskIds.includes(frame.threadID)).map(frame => {
        const failure = renderFailure(rendererId, frame);
        const value = failure ? { ...frame, renderError: failure.message, renderErrorCode: failure.code } : frame;
        // A floating window already receives these pixels through present(). Its
        // owner needs metadata until a dock handoff explicitly requests images.
        if (imagePlacement === 'home' && frame.placement !== 'home' && !imageSessions?.includes(frame.threadID) && value.imageDataURL) {
          const { imageDataURL, ...deferred } = value;
          return { ...deferred, imageDeferred: true };
        }
        if (!compactImages || !value.imageDataURL || knownImages?.[frame.presentationID] !== value.imageRevision) return value;
        const { imageDataURL, ...compact } = value;
        return { ...compact, imageUnchanged: true };
      }), error: ownerError(rendererId, owner) };
  }
  function capture(target, ownerId, generation, requested) {
    const key = targetKey(ownerId, target.threadID, target.id);
    const identity = visibilityKey(target, ownerId);
    let record = captures.get(key);
    if (!record || record.generation !== generation || record.identity !== identity) {
      // Placement changes may recapture an already displayed occurrence. A hidden,
      // switched, or replaced target has no matching visible frame to seed from.
      const previous = record?.identity === identity && owners.get(ownerId)?.frames.some(frame => frame.threadID === target.threadID
        && frame.presentationID === target.id && frame.visibilityKey === identity) ? record : null;
      record = { ownerId, threadID: target.threadID, targetId: target.id, generation, identity, nextCaptureAt: 0,
        mediaGeneration: previous?.mediaGeneration ?? ++mediaGeneration, value: previous?.value ?? null,
        lastGood: previous?.lastGood ?? null, lastGoodAt: previous?.lastGoodAt ?? null,
        lastCaptureTimestamp: previous?.lastCaptureTimestamp, staleSince: previous?.staleSince ?? null, work: null };
      captures.set(key, record);
      if (!previous) renderFailures.delete(key);
      requested = true;
    }
    const failed = error => {
      // Repeated failures back off instead of recapturing every frame interval.
      record.failures = (record.failures ?? 0) + 1;
      record.nextCaptureAt = Date.now() + Math.min((target.backend === 'native' ? 100 : 600) * 2 ** record.failures, MAX_CAPTURE_BACKOFF);
      const errorCode = error?.code ?? 'PRESENTATION_ERROR', message = error?.message ?? 'Preview capture failed';
      if (record.lastGood && transientCaptureErrors.has(errorCode)) {
        record.staleSince ??= Date.now();
        record.value = { ...record.lastGood, stale: true, staleSince: record.staleSince, lastSuccessfulAt: record.lastGoodAt, error: message, errorCode };
      } else {
        // A client may hold a decoded frame too. Explicitly invalidate that cache
        // after closure, identity/permission failures, or an unclassified error.
        if (!record.value?.cacheInvalidated) record.mediaGeneration = ++mediaGeneration;
        record.lastGood = null; record.lastGoodAt = null; record.staleSince = null;
        record.value = { error: message, errorCode, cacheInvalidated: true, mediaGeneration: record.mediaGeneration };
        renderFailures.delete(key);
      }
    };
    if (requested && !record.work && Date.now() >= record.nextCaptureAt) {
      record.nextCaptureAt = Date.now() + (target.backend === 'native' ? 100 : 600);
      if (target.backend === 'native') videoTargets.add(target.id);
      record.work = Promise.resolve().then(() => runtime.request('preview', { targetId: target.id }, { sessionKey: target.threadID }))
        .then(result => {
          if (result.ok === false) { failed(result.error); return; }
          if (result.target?.id && result.target.id !== target.id || result.target?.identity
            && visibilityKey({ ...target, ...result.target, threadID: target.threadID }, ownerId) !== identity) {
            failed({ code: 'TARGET_IDENTITY_CHANGED', message: 'The captured target occurrence changed' }); return;
          }
          const preview = result.preview;
          if (typeof preview?.dataUrl !== 'string' || !preview.dataUrl.startsWith('data:image/') || preview.dataUrl.indexOf(',') < 0
            || preview.dataUrl.endsWith(',') || !Number.isFinite(preview.width) || !Number.isFinite(preview.height) || preview.width <= 0 || preview.height <= 0
            || preview.kind === 'native-video' && preview.timestamp != null && !Number.isFinite(preview.timestamp)) {
            failed({ code: 'PREVIEW_FRAME_INVALID', message: 'The capture returned no usable preview image' }); return;
          }
          const previous = record.lastGood;
          const sameImage = previous?.imageDataURL === preview.dataUrl && previous.width === preview.width
            && previous.height === preview.height && previous.kind === preview.kind;
          record.value = { active: preview.active === true, isDetached: preview.isDetached === true,
              title: result.target?.title || target.title || target.name, imageDataURL: result.preview.dataUrl,
              iconDataURL: result.preview.iconDataURL ?? target.iconDataURL ?? target.favicon,
              width: preview.width, height: preview.height, kind: preview.kind,
              timestamp: sameImage ? previous.timestamp : preview.timestamp, mediaGeneration: record.mediaGeneration };
          if (record.value.imageDataURL) record.value.imageRevision = sameImage && previous.imageRevision ? previous.imageRevision : `${imageInstance}.${++imageSequence}`;
          record.failures = 0;
          record.lastGood = record.value;
          // Keep freshness outside the presentation signature while healthy so a
          // static browser frame still deduplicates. Expose it when updates fail.
          if (preview.kind !== 'native-video' || record.lastCaptureTimestamp !== preview.timestamp || !sameImage) record.lastGoodAt = Date.now();
          record.lastCaptureTimestamp = preview.timestamp;
          record.staleSince = null;
        }).catch(failed)
        .finally(() => {
          record.work = null;
          // A completed target publishes independently, without waiting for or recapturing its peers.
          if (!closed && captures.get(key) === record) void refresh(false);
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
        await presentFrames(ownerId, owner, []);
      }
      for (const [ownerId, group] of grouped) {
        let owner = owners.get(ownerId);
        if (!owner) { owner = { available: true, visible: false, rendered: false, error: null, hidden: false, generation: 0, targetIds: [], frames: [] }; owners.set(ownerId, owner); }
        if (owner.hidden) continue;
        const targets = shownTargets(group, ownerId), generation = owner.generation;
        owner.targetIds = targets.map(target => target.id);
        const frames = targets.flatMap(target => {
          const value = capture(target, ownerId, generation, requested)
            ?? owner.frames.find(frame => frame.presentationID === target.id && frame.threadID === target.threadID
              && frame.visibilityKey === visibilityKey(target, ownerId));
          return value ? [{ provider: target.provider, backend: target.backend, isDetached: target.isDetached === true,
            title: target.title || target.name, iconDataURL: target.iconDataURL ?? target.favicon, ...value,
            presentationID: target.id, threadID: target.threadID, placement: placements.get(target.threadID) ?? 'pinned',
            visibilityKey: visibilityKey(target, ownerId),
            completion: target.completion }] : [];
        });
        if (closed || owner.hidden || generation !== owner.generation) continue;
        owner.frames = frames;
        try {
          const floating = frames.filter(frame => frame.placement === 'pinned');
          await presentFrames(ownerId, owner, floating);
          if (owner.hidden || generation !== owner.generation) { owner.presentationSignature = null; await browserHost.hidePresentation(ownerId); owner.visible = false; }
        } catch (error) { owner.error = error.message; owner.visible = false; }
      }
      for (const [key, record] of captures) {
        const owner = owners.get(record.ownerId);
        if (!owner || owner.hidden || owner.generation !== record.generation || !owner.targetIds.includes(record.targetId)) { captures.delete(key); renderFailures.delete(key); }
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
      error: [...owners].map(([rendererId, owner]) => ownerError(rendererId, owner)).find(Boolean) ?? null,
      windows: [...owners].map(([rendererId, owner]) => { const { frames, presentationSignature, ...state } = owner; return { rendererId, ...state, error: ownerError(rendererId, owner) }; }) }),
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
          await presentFrames(rendererId, owner, []);
        }
      }
      revision++;
      void refresh();
    },
    async handle(method, args) {
      const group = groups().get(args.rendererId);
      const imageOptions = { compactImages: args.compactImages === true, knownImages: args.knownImages,
        imagePlacement: args.imagePlacement === 'home' ? 'home' : undefined,
        imageSessions: Array.isArray(args.imageSessions) ? args.imageSessions.filter(id => typeof id === 'string') : [] };
      if (method === 'state') return { ok: true, state: taskState(args.rendererId, imageOptions) };
      if (method === 'contrast') {
        const owner = owners.get(args.rendererId), rect = args.rect;
        if (!group || !owner?.visible || owner.ownerPid !== args.ownerPid || !Number.isInteger(args.ownerPid) || args.ownerPid <= 0
          || !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
          || rect.width <= 0 || rect.height <= 0 || rect.width > 160 || rect.height > 160) return { ok: true, available: false };
        return runtime.request('presentationContrast', { rect, ownerPid: owner.ownerPid });
      }
      if (!group) throw new Error('The monitoring window is no longer connected');
      if (!['hideAll', 'expand'].includes(method) && !group.activity.has(args.sessionId)) throw new Error('The monitored task does not belong to this window');
      const owner = owners.get(args.rendererId);
      if (method === 'hideAll') for (const id of group.activity.keys()) hiddenTasks.add(id);
      else if (method === 'hideTask') hiddenTasks.add(args.sessionId);
      else if (method === 'showTask') {
        hiddenTasks.delete(args.sessionId);
        for (const [key, hidden] of hiddenTargets) if (hidden.rendererId === args.rendererId && hidden.sessionId === args.sessionId) hiddenTargets.delete(key);
        for (const target of group.targets.values()) if (target.threadID === args.sessionId) yieldedTargets.delete(target.id);
        for (const [key, record] of captures) if (record.ownerId === args.rendererId && record.threadID === args.sessionId) {
          record.mediaGeneration = ++mediaGeneration;
          if (record.value) record.value = { ...record.value, mediaGeneration: record.mediaGeneration };
          if (record.lastGood) record.lastGood = { ...record.lastGood, mediaGeneration: record.mediaGeneration };
          renderFailures.delete(key);
        }
        if (owner) { owner.hidden = false; owner.presentationSignature = null; }
      }
      else if (method === 'expand') {
        if (args.expanded) expandedOwners.add(args.rendererId); else expandedOwners.delete(args.rendererId);
      }
      else if (method === 'placement') {
        if (!['home', 'pinned'].includes(args.placement)) throw new Error('Unsupported monitoring placement');
        placements.set(args.sessionId, args.placement);
      } else throw new Error('Unknown monitoring action');
      if (owner) { owner.generation++; owner.frames = owner.frames.filter(frame => !hiddenTasks.has(frame.threadID)); }
      if (owner && (method === 'hideAll' || method === 'hideTask')) {
        owner.targetIds = owner.targetIds.filter(id => { const target = group.targets.get(id); return target && !hiddenTasks.has(target.threadID); });
        const floating = owner.frames.filter(frame => frame.placement === 'pinned');
        await presentFrames(args.rendererId, owner, floating);
        void refresh();
      } else await refresh();
      revision++;
      return { ok: true, state: taskState(args.rendererId, imageOptions) };
    },
    async event(event) {
      const owner = owners.get(event.rendererId);
      if (!owner) return { ok: true, ignored: true };
      if (event.type === 'hide-target') {
        const frame = owner.frames.find(frame => frame.presentationID === event.targetId && frame.threadID === event.sessionId);
        const target = groups().get(event.rendererId)?.targets.get(event.targetId);
        if (!frame || !target || target.threadID !== event.sessionId || !browserHost.isPresentationSession(event.rendererId, event.sessionId)
          || event.visibilityKey !== frame.visibilityKey || event.visibilityKey !== visibilityKey(target, event.rendererId)) {
          return { ok: false, error: { code: 'TARGET_NOT_PRESENTED', message: 'The requested preview is no longer in this conversation' } };
        }
        hiddenTargets.set(targetKey(event.rendererId, event.sessionId, event.targetId), {
          rendererId: event.rendererId, sessionId: event.sessionId, visibilityKey: event.visibilityKey,
        });
        owner.generation++;
        owner.frames = owner.frames.filter(value => value !== frame);
        owner.targetIds = owner.frames.map(value => value.presentationID);
        const floating = owner.frames.filter(value => value.placement === 'pinned');
        await presentFrames(event.rendererId, owner, floating);
        revision++; void refresh();
        await releaseUnusedVideo();
        return { ok: true };
      }
      if (event.type === 'retry') {
        for (const record of captures.values()) if (record.ownerId === event.rendererId && record.threadID === event.sessionId && record.targetId === event.targetId) {
          record.failures = 0; record.nextCaptureAt = 0;
        }
        renderFailures.delete(targetKey(event.rendererId, event.sessionId, event.targetId));
        void refresh();
        return { ok: true };
      }
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
          await presentFrames(event.rendererId, owner, floating);
          revision++; void refresh();
        }
      }
      if (event.type === 'hidden') {
        for (const frame of owner.frames) hiddenTasks.add(frame.threadID);
        owner.visible = false; owner.frames = []; owner.targetIds = []; owner.generation++; revision++; schedule();
        await presentFrames(event.rendererId, owner, []);
        await releaseUnusedVideo();
      }
      if (event.type === 'rendered' || event.type === 'error') {
        const frame = owner.frames.find(frame => frame.presentationID === event.targetId && frame.threadID === event.sessionId
          && frame.visibilityKey === event.visibilityKey && frame.mediaGeneration === event.mediaGeneration);
        if (event.targetId && event.visibilityKey && !frame) return { ok: true, ignored: true };
        if (event.type === 'rendered') {
          owner.rendered = true; owner.error = null;
          if (frame && !event.degraded) renderFailures.delete(targetKey(event.rendererId, frame.threadID, frame.presentationID));
        } else {
          owner.rendered = false;
          if (frame) renderFailures.set(targetKey(event.rendererId, frame.threadID, frame.presentationID), {
            identity: frame.visibilityKey, mediaGeneration: frame.mediaGeneration, message: event.message, code: event.code ?? 'PREVIEW_DECODE_FAILED',
          });
          else owner.error = event.message;
        }
      }
      return { ok: true };
    },
    async close() {
      closed = true; unsubscribe(); clearTimeout(timer); captures.clear(); hiddenTargets.clear(); renderFailures.clear(); expandedOwners.clear();
      for (const owner of owners.values()) { owner.hidden = true; owner.generation++; owner.visible = false; owner.frames = []; }
      const results = await Promise.allSettled([refreshing, releaseUnusedVideo(), browserHost.closePresentations()]);
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Monitoring cleanup failed');
    },
  };
}
