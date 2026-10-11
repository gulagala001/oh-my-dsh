import { randomUUID } from 'node:crypto';
import { nativeValue } from './native.mjs';

const producerKind = 'windows-wgc-png';
const format = 'image/png';
const identityKeys = ['presentationID', 'threadID', 'turnID', 'targetId', 'viewId', 'captureId', 'pid', 'windowId', 'processIdentity', 'sourceGeneration'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const positive = value => Number.isSafeInteger(value) && value > 0;
const failure = (message, code = 'WINDOWS_PRESENTATION_UNAVAILABLE') => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class WindowsNativePresentationProvider {
  constructor({ native } = {}) {
    if (native?.platform !== 'win32') throw new TypeError('Windows presentations require the Windows native host');
    this.native = native; this.version = 1; this.epoch = randomUUID(); this.producerKind = producerKind;
    this.listeners = new Set(); this.observerSession = 'native-preview-windows-presentation-owner-' + this.epoch;
    this.started = false; this.hostClosing = false; this.released = false;
  }
  async start() {
    if (this.hostClosing || this.released) throw failure('The Windows presentation owner is closing', 'PROVIDER_CLOSED');
    if (!this.started) {
      const permission = await this.native.permissions(this.observerSession);
      const capabilities = permission.native_presentations;
      if (!object(capabilities) || typeof capabilities.available !== 'boolean'
        || capabilities.producerKind !== producerKind || capabilities.format !== format || capabilities.nativeOverlay !== true) {
        throw failure('The Windows runtime does not provide the native PNG presentation protocol', 'UNSUPPORTED_PROTOCOL');
      }
      this.capabilities = { ...clone(capabilities), platform: 'win32', ownerKind: 'windows-native', hardwareSharedSurface: false };
      this.started = true;
    }
    return this;
  }
  async request(method) {
    await this.start();
    if (method === 'nativePresentation.capabilities') return clone(this.capabilities);
    if (method === 'nativePresentation.owner') return { epoch: this.epoch, ownerKind: 'windows-native', producerKind, format,
      owners: this.consumer?.ownerState() ?? [], nativePresentationLayout: this.consumer?.layout ?? null };
    throw failure('The Windows native presentation owner does not implement this operation', 'UNSUPPORTED_OPERATION');
  }
  subscribe(listener, onClosed) {
    if (typeof listener !== 'function') throw new TypeError('A presentation owner listener is required');
    const entry = { listener, onClosed }; this.listeners.add(entry); return () => this.listeners.delete(entry);
  }
  async close() {
    this.hostClosing = true;
    await this.consumer?.close();
    await this.native.releasePreview(this.observerSession);
    this.released = true; this.listeners.clear();
    return { epoch: this.epoch, released: true, ownerKind: 'windows-native', producerKind };
  }
}

export class WindowsNativePresentations {
  constructor({ native, service, onChanged = () => {}, onError = () => {}, onReveal } = {}) {
    this.native = native; this.service = service ?? new WindowsNativePresentationProvider({ native });
    this.service.consumer = this; this.onChanged = onChanged; this.onError = onError; this.onReveal = onReveal;
    this.records = new Map(); this.sources = new Map(); this.generations = new Map(); this.queues = new Map();
    this.subscribers = new Map(); this.visibility = new Map(); this.domHomes = new Map(); this.ready = new Set();
    this.globalHidden = false; this.revision = 0; this.closed = false; this.stopping = false;
    this.native.windowsPresentations = this;
  }
  changed(threadID) { try { this.onChanged(threadID); } catch (error) { this.report(error, threadID); } }
  report(error, threadID) { try { this.onError(error, threadID); } catch {} }
  async start() {
    if (this.closed || this.stopping) throw failure('Windows presentations are closing', 'PROVIDER_CLOSED');
    await this.service.start(); this.capabilities = clone(this.service.capabilities); return this;
  }
  ownsView(viewId) { return [...this.records.values()].some(record => record.identity.viewId === viewId && !record.closed); }
  ensureTarget(threadID, turnID, target) {
    if (!text(threadID) || !text(turnID) || !object(target) || target.sessionId !== threadID || !text(target.id)
      || !text(target.viewId ?? target.id) || !positive(target.pid) || !positive(target.windowId) || !text(target.processIdentity)) {
      return Promise.reject(failure('The Windows native presentation target is not owned', 'INVALID_TARGET'));
    }
    const key = JSON.stringify([threadID, target.viewId ?? target.id]);
    const pending = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await this.start();
      if (this.capabilities.available !== true) throw failure('The Windows desktop cannot publish a native presentation');
      const previous = this.sources.get(key);
      if (previous && !previous.closing && !previous.closed && previous.identity.turnID === turnID
        && previous.identity.windowId === target.windowId && previous.identity.processIdentity === target.processIdentity) return this.publicRecord(previous);
      if (previous) await this.retire(previous, 'source-replaced');
      const sourceGeneration = (this.generations.get(key) ?? 0) + 1;
      if (!positive(sourceGeneration)) throw failure('Windows presentation generations are exhausted', 'RESOURCE_LIMIT');
      this.generations.set(key, sourceGeneration);
      const identity = { presentationID: randomUUID(), threadID, turnID, targetId: target.id, viewId: target.viewId ?? target.id,
        captureId: randomUUID(), pid: target.pid, windowId: target.windowId, processIdentity: target.processIdentity, sourceGeneration };
      const record = { key, identity, target: clone(target), observerSession: 'native-preview-windows-presentation-' + identity.presentationID,
        closed: false, completed: false, sequence: 0, connection: null, bridgeSessionId: null };
      this.records.set(identity.presentationID, record); this.sources.set(key, record);
      if (this.layout?.activeThreadID === threadID && !this.layout.orderedPresentationIDs.includes(identity.presentationID)) {
        this.layout.orderedPresentationIDs.push(identity.presentationID); this.layout.revision = ++this.revision;
        this.layout.stackDisplayHeight = this.maximumDisplaySize * this.layout.orderedPresentationIDs.length;
      }
      if (!this.visibility.has(threadID)) this.visibility.set(threadID, this.globalHidden ? 'hidden' : 'shown');
      try {
        record.connection = await this.native.connection(record.observerSession);
        record.unlisten = this.native.subscribe(record.observerSession, (message, connection) => {
          if (connection === record.connection && message?.method === 'notifications/windows-native-presentation') this.receive(record, message.params);
        });
        const value = nativeValue(await this.native.windowsPresentationCall(record.observerSession, 'start_native_presentation', {
          ...identity, ...this.windowArguments(record), visible: this.visible(record), maximumDisplaySize: this.maximumDisplaySize ?? 200 }, record.connection));
        this.acceptState(record, value);
        if (!value.published || value.closed) throw failure('The Windows native window did not publish its first PNG frame', 'INVALID_NATIVE_PRESENTATION');
        await this.applyLayout(); this.changed(threadID); return this.publicRecord(record);
      } catch (error) {
        record.failure = error;
        try { await this.retire(record, 'source-open-failed'); } catch (cleanup) { this.report(cleanup, threadID); }
        throw error;
      }
    });
    this.queues.set(key, pending);
    pending.finally(() => { if (this.queues.get(key) === pending) this.queues.delete(key); }).catch(() => {});
    return pending;
  }
  windowArguments(record) { return { pid: record.identity.pid, window_id: record.identity.windowId, process_identity: record.identity.processIdentity }; }
  arguments(record) { return { ...record.identity, ...this.windowArguments(record), ...(record.bridgeSessionId ? { bridgeSessionId: record.bridgeSessionId } : {}) }; }
  acceptState(record, value) {
    if (!object(value) || !identityKeys.every(key => value[key] === record.identity[key]) || value.producerKind !== producerKind
      || !text(value.bridgeSessionId) || record.bridgeSessionId && value.bridgeSessionId !== record.bridgeSessionId
      || typeof value.published !== 'boolean' || typeof value.closed !== 'boolean' || !positive(value.ownerWindowId)
      || !positive(value.producerPid) || !text(value.producerProcessIdentity) || !object(value.nativeProducer)
      || value.nativeProducer.format !== format || value.nativeProducer.hardwareSharedSurface !== false
      || value.published && (!positive(value.nativeProducer.sourceWidth) || !positive(value.nativeProducer.sourceHeight))) {
      throw failure('The Windows native presentation reply belongs to another source', 'INVALID_NATIVE_IDENTITY');
    }
    if (record.state && (record.state.ownerWindowId !== value.ownerWindowId || record.state.producerPid !== value.producerPid
      || record.state.producerProcessIdentity !== value.producerProcessIdentity)) throw failure('The Windows native overlay owner changed', 'INVALID_NATIVE_IDENTITY');
    if (value.closed && (value.captureStopped !== true || value.hostDetached !== true)) throw failure('Windows presentation closure has no capture and HWND release receipt', 'NATIVE_CLEANUP_UNCONFIRMED');
    record.bridgeSessionId = value.bridgeSessionId; record.state = clone(value);
  }
  receive(record, value) {
    if (record.closed || record.closing) return;
    try {
      this.acceptState(record, value);
      if (value.type === 'frame') {
        if (value.mediaType !== format || !text(value.data) || !positive(value.sequence) || value.sequence <= record.sequence
          || !positive(value.nativeProducer.sourceWidth) || !positive(value.nativeProducer.sourceHeight)) return;
        const bytes = Buffer.from(value.data, 'base64');
        if (bytes.length < 24 || bytes.length > 16 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw failure('The Windows producer returned an invalid PNG frame', 'INVALID_NATIVE_FRAME');
        const pixelWidth = bytes.readUInt32BE(16), pixelHeight = bytes.readUInt32BE(20);
        if (!positive(pixelWidth) || !positive(pixelHeight) || pixelWidth > 16384 || pixelHeight > 16384) throw failure('The Windows producer returned invalid PNG dimensions', 'INVALID_NATIVE_FRAME');
        record.sequence = value.sequence;
        record.latest = { ...record.identity, bridgeSessionId: record.bridgeSessionId, producerKind, format, mediaType: format, data: value.data,
          sequence: value.sequence, ...(value.capturedAt !== undefined ? { capturedAt: value.capturedAt } : {}),
          pixelWidth, pixelHeight, width: pixelWidth, height: pixelHeight,
          sourceWidth: value.nativeProducer.sourceWidth, sourceHeight: value.nativeProducer.sourceHeight };
        this.emitVideo(record.identity.threadID, record.latest);
      } else if (value.type === 'interaction' && value.action === 'activate' && value.reason === 'native-window-click'
        && value.published === true && value.closed === false && !record.completed && this.sources.get(record.key) === record && this.visible(record)) {
        if (!record.interacting) {
          const pending = this.interact(record.identity.threadID, record.identity.presentationID, true);
          record.interacting = pending;
          pending.catch(error => this.report(error, record.identity.threadID)).finally(() => {
            if (record.interacting === pending) record.interacting = null;
          });
        }
      } else if (value.type === 'closed') void this.retire(record, value.closeReason ?? 'native-window-closed').catch(error => this.report(error, record.identity.threadID));
      else if (value.type === 'failure') { record.failure = failure(value.error?.message ?? 'Windows native capture failed', value.error?.code); void this.retire(record, 'native-source-failed').catch(error => this.report(error, record.identity.threadID)); }
      this.changed(record.identity.threadID);
    } catch (error) { record.failure = error; this.report(error, record.identity.threadID); void this.retire(record, 'invalid-native-event').catch(cleanup => this.report(cleanup, record.identity.threadID)); }
  }
  visible(record) {
    const threadID = record.identity.threadID, home = this.domHomes.get(threadID);
    return !this.globalHidden && this.visibility.get(threadID) !== 'hidden' && (!this.layout || this.layout.activeThreadID === threadID)
      && !(home?.available && home.visible && home.active && home.ready && home.orderedPresentationIDs.includes(record.identity.presentationID));
  }
  async update(record, fields) {
    if (record.closed || record.closing) return;
    const value = nativeValue(await this.native.windowsPresentationCall(record.observerSession, 'update_native_presentation', { ...this.arguments(record), ...fields }, record.connection));
    this.acceptState(record, value); this.changed(record.identity.threadID);
  }
  async applyLayout() {
    const ordered = this.layout?.orderedPresentationIDs ?? [...this.records.keys()];
    let index = 0;
    for (const id of ordered) {
      const record = this.records.get(id); if (!record || record.closed || record.closing) continue;
      const fields = { visible: this.visible(record), maximumDisplaySize: this.maximumDisplaySize ?? 200 };
      const anchor = this.host?.bounds;
      if (this.host?.coordinateSpace === 'physical-pixels' && object(anchor)
        && [anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) && anchor.width > 0 && anchor.height > 0) {
        fields.bounds = { x: anchor.x, y: anchor.y + index * (this.maximumDisplaySize ?? 200), width: anchor.width, height: this.maximumDisplaySize ?? 200 };
      }
      await this.update(record, fields); index++;
    }
    for (const record of this.records.values()) if (!ordered.includes(record.identity.presentationID)) await this.update(record, { visible: false });
    return { accepted: true, producerKind, nativePresentationLayout: this.layout ?? null };
  }
  async configureHost({ host, layout } = {}) {
    await this.start();
    if (!(host === null || object(host)) || !object(layout) || !(layout.activeThreadID === null || text(layout.activeThreadID))) throw new TypeError('Windows presentation layout requires an actual host and active thread');
    const orderedPresentationIDs = layout.orderedPresentationIDs ?? [...this.records.values()].filter(record => record.identity.threadID === layout.activeThreadID).map(record => record.identity.presentationID);
    if (!Array.isArray(orderedPresentationIDs) || orderedPresentationIDs.some(id => !this.records.has(id))) throw failure('The layout contains an unavailable Windows source', 'INVALID_LAYOUT');
    if (layout.maxDisplaySize !== undefined && (!Number.isFinite(layout.maxDisplaySize) || layout.maxDisplaySize < 1 || layout.maxDisplaySize > 400)) throw new TypeError('Windows native display size must be from 1 to 400');
    this.maximumDisplaySize = layout.maxDisplaySize ?? this.maximumDisplaySize ?? 200; this.host = clone(host);
    this.layout = { activeThreadID: layout.activeThreadID, currentHostID: host?.hostID ?? null, orderedPresentationIDs: [...orderedPresentationIDs],
      placement: layout.placement ?? 'home', revision: ++this.revision, stackDisplayHeight: this.maximumDisplaySize * orderedPresentationIDs.length,
      stackDisplayWidth: host?.coordinateSpace === 'physical-pixels' ? host.bounds?.width ?? this.maximumDisplaySize : this.maximumDisplaySize,
      isMovingToAnchor: layout.isMovingToAnchor === true,
      producerKind, format, coordinateSpace: 'physical-pixels' };
    const result = await this.applyLayout(); this.changed(); return result;
  }
  async configureDOMHome(threadID, home) {
    if (!object(home) || !text(home.surfaceID) || !positive(home.revision) || !Array.isArray(home.orderedPresentationIDs)
      || ['available', 'visible', 'active', 'ready'].some(key => typeof home[key] !== 'boolean')) throw new TypeError('A Windows DOM home requires its actual surface state');
    const previous = this.domHomes.get(threadID);
    if (home.available) {
      for (const id of home.orderedPresentationIDs) if (this.records.get(id)?.identity.threadID !== threadID) throw failure('The DOM surface does not own this Windows presentation', 'INVALID_DOM_PRESENTATION');
    } else if (previous && previous.surfaceID !== home.surfaceID) return { accepted: false, reason: 'stale-dom-surface' };
    if (previous?.surfaceID === home.surfaceID && previous.revision >= home.revision) return { accepted: false, reason: 'stale-dom-revision' };
    this.domHomes.set(threadID, { ...clone(home), threadID, ownerKind: 'dsh-dom', producerKind, format });
    await this.applyLayout(); this.changed(threadID); return { accepted: true, domHome: clone(this.domHomes.get(threadID)) };
  }
  async setVideoReady(threadID, ready) {
    if (typeof ready !== 'boolean') throw new TypeError('Windows frame readiness must be boolean');
    if (ready) { this.ready.add(threadID); for (const record of this.records.values()) if (record.identity.threadID === threadID && record.latest) this.emitVideo(threadID, record.latest); }
    else this.ready.delete(threadID);
    return { accepted: true, producerKind, format };
  }
  async subscribeVideo(threadID, listener, signal) {
    signal?.throwIfAborted(); await this.start();
    if (!text(threadID) || typeof listener !== 'function') throw new TypeError('Windows frame subscriptions require a thread and listener');
    const group = this.subscribers.get(threadID) ?? new Set(); this.subscribers.set(threadID, group); group.add(listener);
    for (const record of this.records.values()) if (record.identity.threadID === threadID && record.latest) listener(clone(record.latest));
    const close = async () => { signal?.removeEventListener('abort', aborted); group.delete(listener); if (!group.size) this.subscribers.delete(threadID); };
    const aborted = () => { void close(); }; signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { await close(); signal.throwIfAborted(); }
    return close;
  }
  emitVideo(threadID, value) { for (const listener of this.subscribers.get(threadID) ?? []) try { listener(clone(value)); } catch (error) { this.report(error, threadID); } }
  async interact(threadID, presentationID, isLead) {
    const record = this.records.get(presentationID);
    if (!record || record.closed || record.closing || record.completed || this.sources.get(record.key) !== record
      || record.identity.threadID !== threadID || typeof isLead !== 'boolean') throw failure('The Windows presentation is not owned by this thread', 'INVALID_PRESENTATION');
    if (this.onReveal) await this.onReveal(threadID, record.target, presentationID); else await this.native.revealWindow(record.target);
    return { accepted: true, producerKind };
  }
  async hideTask(threadID) { this.visibility.set(threadID, 'hidden'); this.revision++; await this.applyLayout(); this.changed(threadID); return this.taskState(); }
  async showTask(threadID) { this.globalHidden = false; this.visibility.set(threadID, 'shown'); this.revision++; await this.applyLayout(); this.changed(threadID); return this.taskState(); }
  async hideAll(threadIDs = []) { this.globalHidden = true; for (const id of threadIDs) this.visibility.set(id, 'hidden'); this.revision++; await this.applyLayout(); this.changed(); return this.taskState(); }
  async completeTurn(threadID, turnID, reason) {
    await Promise.allSettled([...this.queues.values()]);
    for (const record of [...this.records.values()]) if (record.identity.threadID === threadID && record.identity.turnID === turnID) { record.completed = true; await this.retire(record, reason ?? 'turn-ended'); }
  }
  async stopThread(threadID, reason = 'owner-stopped') {
    await Promise.allSettled([...this.queues.entries()].filter(([key]) => JSON.parse(key)[0] === threadID).map(([, pending]) => pending));
    for (const record of [...this.records.values()]) if (record.identity.threadID === threadID) await this.retire(record, reason);
  }
  retire(record, reason) {
    if (record.closed) return Promise.resolve();
    if (record.closing) return record.closing;
    const pending = (async () => {
      if (!record.bridgeSessionId) {
        // The dedicated connection's end_session waits for its real producer
        // cleanup even when a start reply did not deliver the bridge identity.
        await this.native.releasePreview(record.observerSession);
      }
      if (record.bridgeSessionId && !record.state?.closed) {
        const value = nativeValue(await this.native.windowsPresentationCall(record.observerSession, 'stop_native_presentation', this.arguments(record), record.connection));
        this.acceptState(record, value);
        if (value.closed !== true || value.captureStopped !== true || value.hostDetached !== true) throw failure('Windows capture and overlay release are unconfirmed', 'NATIVE_CLEANUP_UNCONFIRMED');
      }
      await this.native.releasePreview(record.observerSession);
      record.unlisten?.(); record.closed = true;
      this.emitVideo(record.identity.threadID, { ...record.identity, bridgeSessionId: record.bridgeSessionId, producerKind, format, stopped: true, reason });
      if (this.records.get(record.identity.presentationID) === record) this.records.delete(record.identity.presentationID);
      if (this.sources.get(record.key) === record) this.sources.delete(record.key);
      if (this.layout?.orderedPresentationIDs.includes(record.identity.presentationID)) {
        this.layout.orderedPresentationIDs = this.layout.orderedPresentationIDs.filter(id => id !== record.identity.presentationID);
        this.layout.revision = ++this.revision;
        this.layout.stackDisplayHeight = this.maximumDisplaySize * this.layout.orderedPresentationIDs.length;
      }
      this.changed(record.identity.threadID);
    })();
    record.closing = pending; pending.finally(() => { if (record.closing === pending) record.closing = null; }).catch(() => {}); return pending;
  }
  publicRecord(record) { return { ...record.identity, producerKind, format, published: record.state?.published === true && !record.closed, completed: record.completed,
    cleanupPending: !!record.closing, bridgeSessionId: record.bridgeSessionId, ownerWindowId: record.state?.ownerWindowId,
    producerPid: record.state?.producerPid, producerProcessIdentity: record.state?.producerProcessIdentity, nativeProducer: clone(record.state?.nativeProducer ?? { format, hardwareSharedSurface: false }) }; }
  ownerState() { return [...this.records.values()].map(record => this.publicRecord(record)); }
  taskState() { return { activeTaskIds: [...new Set([...this.records.values()].filter(record => !record.closed && !record.completed).map(record => record.identity.threadID))], globalHidden: this.globalHidden, revision: this.revision, taskVisibilities: Object.fromEntries(this.visibility) }; }
  snapshot(threadID) { return { producerKind, format, ...(this.capabilities ? { capabilities: clone(this.capabilities) } : {}), ...(this.layout ? { nativePresentationLayout: clone(this.layout) } : {}),
    ...(this.domHomes.has(threadID) ? { domHome: clone(this.domHomes.get(threadID)) } : {}), presentations: [...this.records.values()].filter(record => threadID === undefined || record.identity.threadID === threadID).map(record => this.publicRecord(record)), taskState: this.taskState(), needsHost: [] }; }
  close() {
    if (this.closed) return Promise.resolve(); if (this.closing) return this.closing;
    this.stopping = true;
    const pending = (async () => { await Promise.allSettled([...this.queues.values()]); for (const record of [...this.records.values()]) await this.retire(record, 'consumer-closed'); this.subscribers.clear(); this.closed = true; this.changed(); })();
    this.closing = pending; pending.finally(() => { if (this.closing === pending) this.closing = null; }).catch(() => {}); return pending;
  }
}
