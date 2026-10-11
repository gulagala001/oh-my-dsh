import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeValue } from './native.mjs';
import { WindowsNativePresentations } from './windows-native-presentations.mjs';

const IDENTITY_KEYS = ['presentationID', 'threadID', 'turnID', 'targetId', 'viewId', 'captureId', 'pid', 'windowId', 'processIdentity', 'sourceGeneration'];
const LAYOUT_KEYS = ['activeThreadID', 'currentHostID', 'orderedPresentationIDs', 'placement', 'revision', 'stackDisplayHeight', 'stackDisplayWidth', 'isMovingToAnchor'];
const REQUEST_TIMEOUT_MS = 15000;
const fail = (message, code = 'NATIVE_PRESENTATION_UNAVAILABLE') => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.length > 0;
const positive = value => Number.isSafeInteger(value) && value > 0;
const PRODUCER_PUBLIC_KEYS = ['contextID', 'sourceWidth', 'sourceHeight', 'videoEnabled', 'videoFrameInFlight', 'published',
  'maximumPixelDimension', 'encodingFailure', 'nativeContextAvailable', 'sourcePixelsRendered', 'nativeSampleBufferRenderer',
  'nativeCursorCompositing', 'presentationResizePending', 'presentationSizeRequestToken', 'requestedWidth', 'requestedHeight',
  'pendingWidth', 'pendingHeight', 'presentationSizePrepared', 'presentationSizeApplied', 'presentationSizeFailure'];
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const asError = value => value instanceof Error ? value : new Error(String(value));

function descriptor(threadID, target) {
  if (!object(target) || target.sessionId !== threadID || !string(target.id) || !string(target.viewId ?? target.id)
    || !positive(target.pid) || !positive(target.windowId) || !string(target.processIdentity)) {
    throw fail('A native presentation requires the selected thread, process, window and view identities', 'INVALID_TARGET');
  }
  return { id: target.id, viewId: target.viewId ?? target.id, sessionId: threadID, pid: target.pid,
    windowId: target.windowId, processIdentity: target.processIdentity,
    ...(Array.isArray(target.associatedWindowIDs) && target.associatedWindowIDs.every(positive) ? { associatedWindowIDs: [...target.associatedWindowIDs] } : {}),
    ...(string(target.bundleId) ? { bundleId: target.bundleId } : {}), ...(string(target.name) ? { name: target.name } : {}) };
}

function sameIdentity(record, value) {
  return object(value) && IDENTITY_KEYS.every(key => value[key] === record.identity[key]);
}

function sameBinding(binding, value) {
  return binding && binding.senderID === value.senderID && binding.senderGeneration === value.senderGeneration;
}

function base64(value, nullable = false) {
  if (nullable && value === null) return null;
  if (!string(value) || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
    || Buffer.from(value, 'base64').toString('base64') !== value) throw fail('Native video bytes are invalid', 'INVALID_NATIVE_FRAME');
  return value;
}

function videoFrame(record, value) {
  if (!sameIdentity(record, value) || value.bridgeSessionId !== record.bridgeSessionId
    || !positive(value.contextID) || value.contextID > 0xffffffff || value.contextID !== record.nativeProducer?.contextID
    || !string(value.frameToken) || !/^[1-9][0-9]*$/.test(value.frameId ?? '')
    || !/^(0|[1-9][0-9]*)$/.test(value.timestampNanoseconds ?? '') || !string(value.codec)
    || typeof value.isKeyFrame !== 'boolean') throw fail('Native video frame belongs to an invalid source', 'INVALID_NATIVE_FRAME');
  const nanoseconds = BigInt(value.timestampNanoseconds);
  if (nanoseconds > 0xffffffffffffffffn) throw fail('Native video timestamp exceeds its unsigned 64-bit source', 'INVALID_NATIVE_FRAME');
  const microseconds = nanoseconds / 1000n;
  if (microseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw fail('Native video timestamp cannot be represented exactly', 'INVALID_NATIVE_FRAME');
  return { presentationID: record.identity.presentationID, threadID: record.identity.threadID,
    codec: value.codec, decoderConfiguration: base64(value.decoderConfiguration, true),
    timestamp: Number(microseconds), isKeyFrame: value.isKeyFrame, videoData: base64(value.videoData) };
}

function nativeLayout(value) {
  if (!object(value) || ![value.activeThreadID, value.currentHostID].every(id => id === null || string(id))
    || !Array.isArray(value.orderedPresentationIDs) || value.orderedPresentationIDs.some(id => !string(id))
    || ![null, 'home', 'pinned', 'pet'].includes(value.placement) || !Number.isSafeInteger(value.revision) || value.revision < 0
    || ![value.stackDisplayHeight, value.stackDisplayWidth].every(size => Number.isFinite(size) && size >= 0)
    || typeof value.isMovingToAnchor !== 'boolean') throw fail('The native host returned an invalid layout', 'INVALID_NATIVE_EVENT');
  return Object.fromEntries(LAYOUT_KEYS.map(key => [key, clone(value[key])]));
}

// This consumer owns source identities and read-only captures. AppKit layout,
// remote contexts, frame encoding and detach receipts stay with their native owners.
export class DesktopNativePresentations {
  constructor({ service, native, nativeViews, onChanged = () => {}, onError = () => {}, onReveal } = {}) {
    if (native?.platform === 'win32') return new WindowsNativePresentations({ service, native, onChanged, onError, onReveal });
    this.service = service; this.native = native; this.nativeViews = nativeViews;
    this.onChanged = onChanged; this.onError = onError; this.onReveal = onReveal;
    this.records = new Map(); this.sources = new Map(); this.sourceGenerations = new Map(); this.pending = new Map(); this.sourceQueues = new Map();
    this.turns = new Map(); this.subscribers = new Map(); this.videoQueues = new Map(); this.videoDisposers = new Set(); this.enabledThreads = new Set();
    this.visibility = new Map(); this.globalHidden = false; this.visibilityRevision = 0;
    this.epoch = undefined; this.observedEpoch = undefined; this.capabilities = undefined; this.layout = undefined;
    this.layoutBinding = undefined;
    this.actualHostInput = undefined; this.registeredHostID = undefined; this.maximumDisplaySize = undefined;
    this.needsHost = new Map();
    this.domHomes = new Map(); this.domHomeRevisions = new Map(); this.domHomeQueues = new Map();
    this.started = false; this.closed = false; this.draining = false; this.stopping = false; this.starting = null; this.closing = null;
    this.unsubscribe = null; this.releaseProof = null; this.releaseWait = null; this.failure = null;
  }

  changed(threadID) { try { this.onChanged(threadID); } catch (error) { this.report(error, threadID); } }
  report(error, threadID) { try { this.onError(asError(error), threadID); } catch {} }
  sourceFailure(record, error) {
    record.failure = asError(error); this.report(error, record.identity.threadID);
    if (!record.released && !record.closing) void this.retire(record, 'native-source-failed').catch(cleanup => this.report(cleanup, record.identity.threadID));
  }
  assertOpen(allowClosing = false) {
    if (this.closed || this.draining || this.stopping && !allowClosing || this.service?.hostClosing === true || this.service?.released === true) {
      throw this.failure ?? fail('The native presentation provider is closing', 'PROVIDER_CLOSED');
    }
    if (this.epoch !== undefined && this.service.epoch !== this.epoch) throw fail('The native presentation Host generation changed', 'HOST_GENERATION_CHANGED');
  }

  start() {
    if (this.started) { this.assertOpen(); return Promise.resolve(this); }
    if (this.starting) return this.starting;
    const pending = (async () => {
      this.assertOpen();
      if (this.service?.version !== 1 || typeof this.service.request !== 'function' || typeof this.service.subscribe !== 'function'
        || typeof this.native?.subscribe !== 'function' || typeof this.nativeViews?.subscribe !== 'function') {
        throw fail('Native presentations require the scoped Desktop service and native capture observer', 'UNSUPPORTED_PROTOCOL');
      }
      this.unsubscribe = this.service.subscribe(event => this.receive(event), error => this.serviceClosed(error));
      if (typeof this.unsubscribe !== 'function') throw fail('The Desktop service did not return a subscription disposer', 'UNSUPPORTED_PROTOCOL');
      const value = await this.service.request('nativePresentation.capabilities', {}, { timeoutMs: REQUEST_TIMEOUT_MS });
      const epoch = this.service.epoch;
      if (!string(epoch) || this.observedEpoch !== undefined && this.observedEpoch !== epoch) throw fail('Native presentations did not establish a stable Host generation', 'INVALID_RESPONSE');
      this.epoch = epoch;
      this.assertOpen();
      if (!object(value) || typeof value.available !== 'boolean') throw fail('Native presentation capabilities are invalid', 'INVALID_RESPONSE');
      this.capabilities = clone(value); this.started = true;
      if (typeof this.service.waitForRelease === 'function') this.watchRelease();
      this.changed();
      return this;
    })().catch(error => {
      if (!this.started) { this.unsubscribe?.(); this.unsubscribe = null; }
      throw error;
    });
    this.starting = pending;
    void pending.finally(() => { if (this.starting === pending) this.starting = null; }).catch(() => {});
    return pending;
  }

  async request(method, payload) {
    this.assertOpen(method !== 'nativePresentation.openProducer');
    const epoch = this.epoch;
    const result = await this.service.request(method, payload, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (this.epoch !== epoch || this.service.epoch !== epoch) throw fail('The native presentation reply belongs to another Host generation', 'HOST_GENERATION_CHANGED');
    this.assertOpen(true);
    return result;
  }
  command(operation, payload) { return this.request('nativePresentation.command', { operation, payload }); }

  ownsView(viewId) { return [...this.records.values()].some(record => record.target.viewId === viewId && !record.released); }

  ensureTarget(threadID, turnID, targetDescriptor) {
    if (!string(threadID) || !string(turnID)) return Promise.reject(fail('A native presentation requires its real thread and turn identities', 'INVALID_TURN'));
    let target;
    try { target = descriptor(threadID, targetDescriptor); } catch (error) { return Promise.reject(error); }
    const key = JSON.stringify([threadID, target.viewId]), pendingKey = JSON.stringify([threadID, turnID, target.viewId]);
    if (this.turns.has(JSON.stringify([threadID, turnID]))) return Promise.reject(fail('This presentation turn has already ended', 'TURN_ENDED'));
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey);
    const previous = this.sourceQueues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(() => this.ensureSource(key, threadID, turnID, target));
    this.sourceQueues.set(key, pending);
    void pending.finally(() => { if (this.sourceQueues.get(key) === pending) this.sourceQueues.delete(key); }).catch(() => {});
    this.pending.set(pendingKey, pending);
    void pending.finally(() => { if (this.pending.get(pendingKey) === pending) this.pending.delete(pendingKey); }).catch(() => {});
    return pending;
  }

  async ensureSource(key, threadID, turnID, target) {
    await this.start(); this.assertOpen();
    if (this.capabilities.available !== true) throw fail(`Native presentations are unavailable: ${this.capabilities.reason ?? 'native host unavailable'}`);
    const associated = new Set(target.associatedWindowIDs ?? []);
    for (const record of this.records.values()) {
      if (!record.released && record.identity.threadID === threadID && record.identity.turnID === turnID
        && record.target.pid === target.pid && record.target.processIdentity === target.processIdentity
        && associated.has(record.target.windowId)) await this.retire(record, 'associated-with-owner-window');
    }
    const previous = this.sources.get(key);
    if (previous) {
      await previous.initializing?.catch(() => {});
      if (!previous.released && previous.identity.turnID === turnID && !previous.closing && !previous.failure
        && previous.target.processIdentity === target.processIdentity && previous.target.windowId === target.windowId) return this.publicRecord(previous);
      await this.retire(previous, 'source-replaced');
    }
    this.assertOpen();
    const sourceGeneration = (this.sourceGenerations.get(key) ?? 0) + 1;
    if (!Number.isSafeInteger(sourceGeneration)) throw fail('The presentation source generation is exhausted', 'SOURCE_GENERATION_EXHAUSTED');
    this.sourceGenerations.set(key, sourceGeneration);
    const record = { key, target, identity: { presentationID: randomUUID(), threadID, turnID, targetId: target.id, viewId: target.viewId,
      pid: target.pid, windowId: target.windowId, processIdentity: target.processIdentity, sourceGeneration },
    controller: new AbortController(), terminal: deferred(), released: false, hostRemoved: false, published: false, completed: false,
    observerSession: null, bridgeSessionId: null, hostEndpoint: null, unlisten: null, releaseView: null, initializing: null, closing: null, failure: null };
    this.records.set(record.identity.presentationID, record); this.sources.set(key, record);
    if (!this.visibility.has(threadID)) { this.visibility.set(threadID, this.globalHidden ? 'hidden' : 'shown'); this.visibilityRevision += 1; }
    const initializing = this.openSource(record);
    record.initializing = initializing;
    try { await initializing; this.assertOpen(); await this.reconcileVideo(threadID); this.changed(threadID); return this.publicRecord(record); }
    catch (error) {
      record.failure = asError(error);
      try { await this.retire(record, 'source-open-failed'); } catch (cleanup) { this.report(cleanup, threadID); }
      throw error;
    } finally { if (record.initializing === initializing) record.initializing = null; }
  }

  async openSource(record) {
    record.releaseView = await this.nativeViews.subscribe(record.identity.threadID, record.target.viewId,
      (event, value) => this.captureEvent(record, event, value), record.controller.signal, record.target);
    const view = this.nativeViews.views.get(record.target.viewId);
    if (record.stopRequested) throw fail('The native capture ended while its presentation was opening', 'SOURCE_CLOSED');
    if (!view || view.closed || !string(view.sessionId) || !string(view.captureId)) throw fail('The native capture did not return a live observer and capture identity', 'CAPTURE_UNAVAILABLE');
    record.observerSession = view.sessionId; record.identity.captureId = view.captureId;
    const connection = await this.native.connection(record.observerSession);
    if (record.stopRequested) throw fail('The native source was closed before endpoint registration', 'SOURCE_CLOSED');
    const producer = connection.info?._meta?.trisoul;
    if (!positive(producer?.pid) || !positive(producer?.pidVersion) || !Number.isSafeInteger(producer?.euid) || producer.euid < 0) {
      throw fail('The native daemon did not return its actual process authority', 'INVALID_NATIVE_IDENTITY');
    }
    record.unlisten = this.native.subscribe(record.observerSession, (message, observedConnection) => {
      if (observedConnection !== connection || message?.method !== 'notifications/native-presentation') return;
      this.nativeEvent(record, message.params);
    });
    if (typeof record.unlisten !== 'function') throw fail('The native observer did not return a notification disposer', 'INVALID_NATIVE_IDENTITY');
    record.registrationAttempted = true;
    const opened = await this.request('nativePresentation.openProducer', { identity: clone(record.identity),
      producer: { pid: producer.pid, pidVersion: producer.pidVersion, euid: producer.euid } });
    if (!object(opened) || !object(opened.hostEndpoint) || !positive(opened.senderID) || !positive(opened.senderGeneration)) throw fail('The native host did not issue an owned producer endpoint', 'INVALID_RESPONSE');
    record.hostEndpoint = clone(opened.hostEndpoint);
    record.binding = { senderID: opened.senderID, senderGeneration: opened.senderGeneration };
    if (record.stopRequested) throw fail('The native source was closed before producer creation', 'SOURCE_CLOSED');
    record.startAttempted = true;
    let started;
    try {
      started = nativeValue(await this.native.call(record.observerSession, 'start_native_presentation', {
        ...record.identity, hostEndpoint: record.hostEndpoint,
        ...(Number.isFinite(this.maximumDisplaySize) ? { maximumDisplaySize: this.maximumDisplaySize } : {}) }));
    } catch (error) {
      const actual = error.result?.structuredContent?.nativePresentation;
      if (actual) this.acceptState(record, actual);
      throw error;
    }
    this.acceptState(record, started);
    if (record.stopRequested) throw fail('The native source ended while producer publication was pending', 'SOURCE_CLOSED');
    if (!record.published || !positive(record.nativeProducer?.contextID)
      || ![record.nativeProducer?.sourceWidth, record.nativeProducer?.sourceHeight].every(size => Number.isFinite(size) && size > 0)) {
      throw fail('The producer did not confirm a published native context and actual source size', 'INVALID_NATIVE_PRESENTATION');
    }
  }

  captureEvent(record, event, value) {
    if (record.released || record.closing) return;
    if (event === 'closed' || event === 'failure' || event === 'capture' && value?.stopped === true) {
      record.failure = fail(value?.message ?? 'The native capture source ended', value?.reason ?? 'CAPTURE_STOPPED');
      void this.retire(record, 'capture-ended').catch(error => this.report(error, record.identity.threadID));
    } else if (event === 'capture' && record.identity.captureId && string(value?.captureId) && value.captureId !== record.identity.captureId) {
      // A new capture owns a new producer; immutable turn/source identities are never patched in place.
      const pending = this.pending.get(JSON.stringify([record.identity.threadID, record.identity.turnID, record.target.viewId]));
      void this.retire(record, 'capture-reconnected').then(async () => {
        await pending?.catch(() => {});
        if (!this.closed && !this.draining && !this.turns.has(JSON.stringify([record.identity.threadID, record.identity.turnID]))) {
          return this.ensureTarget(record.identity.threadID, record.identity.turnID, record.target);
        }
      }).catch(error => this.report(error, record.identity.threadID));
    }
  }

  acceptState(record, state) {
    if (!sameIdentity(record, state) || !string(state.bridgeSessionId)
      || record.bridgeSessionId !== null && record.bridgeSessionId !== state.bridgeSessionId) throw fail('The native source state belongs to another binding', 'INVALID_NATIVE_IDENTITY');
    record.bridgeSessionId = state.bridgeSessionId;
    if (typeof state.published !== 'boolean' || typeof state.closed !== 'boolean' || !object(state.nativeProducer)) throw fail('The native source returned an invalid state', 'INVALID_NATIVE_PRESENTATION');
    record.published = state.published; record.nativeProducer = clone(state.nativeProducer);
    record.cleanupPending = state.cleanupPending === true;
    if (state.closed) {
      if (state.captureStopped !== true || state.hostDetached !== true && state.providerDestroyed !== true) throw fail('Native source closure has no actual stop and detach receipt', 'NATIVE_CLEANUP_UNCONFIRMED');
      record.detached = true; record.terminal.resolve(clone(state));
    }
    this.changed(record.identity.threadID);
    return state;
  }

  nativeEvent(record, value) {
    if (record.released || !object(value) || !sameIdentity(record, value)) return;
    if (record.bridgeSessionId !== null && value.bridgeSessionId !== record.bridgeSessionId) return;
    try {
      if (value.type === 'encoded-frame') {
        if (record.bridgeSessionId === null) throw fail('Video arrived before the real bridge identity', 'INVALID_NATIVE_FRAME');
        void this.forwardFrame(record, value).catch(error => this.sourceFailure(record, error));
      } else if (value.type === 'state' || value.type === 'source-ended') {
        this.acceptState(record, value);
        if (value.failure) {
          this.sourceFailure(record, fail(String(value.failure), 'NATIVE_SOURCE_FAILED'));
        }
      }
    } catch (error) { this.report(error, record.identity.threadID); }
  }

  async forwardFrame(record, value) {
    let error;
    try {
      const frame = videoFrame(record, value);
      await this.request('nativePresentation.frame', { ...record.identity, bridgeSessionId: record.bridgeSessionId,
        contextID: value.contextID, frameToken: value.frameToken, frameId: value.frameId, ...frame });
    } catch (cause) { error = asError(cause); }
    // Delivery is acknowledged only after the real host RPC settled. Its failure
    // disables the producer rather than pretending an unforwarded frame succeeded.
    const state = nativeValue(await this.native.presentationFrameAck(record.observerSession, {
      ...record.identity, bridgeSessionId: record.bridgeSessionId, frameToken: value.frameToken, frameId: value.frameId,
      success: !error, ...(error ? { error: { message: error.message, code: error.code ?? 'FRAME_DELIVERY_FAILED' } } : {}) }));
    this.acceptState(record, state);
    if (error) throw error;
  }

  async producerCommand(record, command, parameters = {}) {
    if (record.released || record.closing || !record.bridgeSessionId) throw fail('This native source is closing', 'SOURCE_CLOSED');
    const state = nativeValue(await this.native.call(record.observerSession, 'native_presentation_command', {
      ...record.identity, bridgeSessionId: record.bridgeSessionId, command, ...parameters }));
    this.acceptState(record, state); return state;
  }

  reconcileVideo(threadID) {
    const before = this.videoQueues.get(threadID) ?? Promise.resolve();
    const pending = before.catch(() => {}).then(async () => {
      this.assertOpen(true);
      const enabled = (this.subscribers.get(threadID)?.size ?? 0) > 0;
      const records = [...this.records.values()].filter(record => record.identity.threadID === threadID && record.published && !record.closing && !record.released);
      if (!records.length && enabled) return;
      for (const record of records) {
        if (record.nativeProducer?.videoEnabled === enabled) continue;
        const state = await this.producerCommand(record, 'setVideoEnabled', { enabled });
        if (state.nativeProducer.videoEnabled !== enabled) throw fail('The producer did not acknowledge its video delivery state', 'VIDEO_CONTROL_UNCONFIRMED');
      }
      if (this.enabledThreads.has(threadID) === enabled) return;
      const result = await this.command('setNativeVideoEnabled', { threadID, enabled, producerAcknowledged: true });
      if (result?.accepted !== true) throw fail('The native host did not acknowledge video delivery state', 'VIDEO_CONTROL_UNCONFIRMED');
      if (enabled) this.enabledThreads.add(threadID);
      else { this.enabledThreads.delete(threadID); this.emitVideo(threadID, { stopped: true, threadID }); }
    });
    this.videoQueues.set(threadID, pending);
    void pending.finally(() => { if (this.videoQueues.get(threadID) === pending) this.videoQueues.delete(threadID); }).catch(() => {});
    return pending;
  }

  async subscribeVideo(threadID, listener, signal) {
    if (!string(threadID) || typeof listener !== 'function') throw new TypeError('Native video requires a thread and a frame listener');
    signal?.throwIfAborted(); await this.start(); this.assertOpen(); signal?.throwIfAborted();
    let subscribers = this.subscribers.get(threadID);
    if (!subscribers) this.subscribers.set(threadID, subscribers = new Map());
    const token = {}; subscribers.set(token, listener);
    let closing;
    const close = () => closing ??= (async () => {
      signal?.removeEventListener('abort', aborted);
      subscribers.delete(token); if (!subscribers.size && this.subscribers.get(threadID) === subscribers) this.subscribers.delete(threadID);
      if (!this.closed && !this.draining) {
        await this.reconcileVideo(threadID);
        if (!this.enabledThreads.has(threadID) && !this.subscribers.has(threadID)) {
          try { listener({ stopped: true, threadID }); } catch (error) { this.report(error, threadID); }
        }
      }
      this.videoDisposers.delete(close);
    })().catch(error => { closing = null; throw error; });
    const aborted = () => { void close().catch(error => this.report(error, threadID)); };
    signal?.addEventListener('abort', aborted, { once: true });
    this.videoDisposers.add(close);
    try { await this.reconcileVideo(threadID); signal?.throwIfAborted(); return close; }
    catch (error) { await close().catch(cleanup => this.report(cleanup, threadID)); throw error; }
  }
  emitVideo(threadID, frame) { for (const listener of this.subscribers.get(threadID)?.values() ?? []) { try { listener(clone(frame)); } catch (error) { this.report(error, threadID); } } }
  async setVideoReady(threadID, ready) {
    this.assertOpen();
    if (!string(threadID) || typeof ready !== 'boolean') throw new TypeError('Native video readiness requires a thread and a boolean');
    if (!this.enabledThreads.has(threadID)) return { accepted: false };
    return this.command('setNativeVideoReady', { threadID, ready });
  }

  configureDOMHome(threadID, value) {
    if (!string(threadID) || !object(value) || !string(value.surfaceID) || value.surfaceID.length > 4096
      || !positive(value.revision) || ['available', 'visible', 'active', 'ready'].some(key => typeof value[key] !== 'boolean')
      || !Array.isArray(value.orderedPresentationIDs) || value.orderedPresentationIDs.length > 5
      || value.orderedPresentationIDs.some(id => !string(id)) || new Set(value.orderedPresentationIDs).size !== value.orderedPresentationIDs.length
      || Object.keys(value).some(key => !['surfaceID', 'revision', 'available', 'visible', 'active', 'ready', 'orderedPresentationIDs'].includes(key))
      || !value.available && (value.visible || value.active || value.ready) || value.ready && (!value.visible || !value.active)) {
      return Promise.reject(fail('DOM home requires its real surface, revision, visibility and presentation IDs', 'INVALID_DOM_HOME'));
    }
    const input = clone(value), previous = this.domHomeQueues.get(threadID) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      await this.start(); this.assertOpen();
      const key = JSON.stringify([threadID, input.surfaceID]);
      if (input.revision <= (this.domHomeRevisions.get(key) ?? 0)) return { accepted: false, reason: 'stale-dom-revision' };
      if (!this.domHomeRevisions.has(key) && this.domHomeRevisions.size >= 4096) throw fail('The DOM home surface limit was reached', 'RESOURCE_LIMIT');
      for (const id of input.orderedPresentationIDs) {
        const record = this.records.get(id);
        if (!record || record.identity.threadID !== threadID || !record.published || record.released || record.closing) {
          throw fail('DOM home does not own this live native presentation', 'INVALID_DOM_PRESENTATION');
        }
      }
      if (input.ready) {
        const expected = this.layout?.activeThreadID === threadID ? this.layout.orderedPresentationIDs.slice(0, 5) : [];
        if (!this.enabledThreads.has(threadID) || !expected.length || JSON.stringify(expected) !== JSON.stringify(input.orderedPresentationIDs)) {
          return { accepted: false, reason: 'dom-source-not-current' };
        }
      }
      const result = await this.command('setDOMVideoHome', { threadID, ...input });
      if (!object(result) || typeof result.accepted !== 'boolean') throw fail('The native host did not acknowledge DOM home state', 'INVALID_RESPONSE');
      if (result.accepted) this.domHomeRevisions.set(key, input.revision);
      if (result.domHome) {
        if (!object(result.domHome) || result.domHome.threadID !== threadID || result.domHome.ownerKind !== 'dsh-dom') throw fail('DOM home state belongs to another surface authority', 'INVALID_RESPONSE');
        this.domHomes.set(threadID, clone(result.domHome)); this.changed(threadID);
      }
      return result;
    });
    this.domHomeQueues.set(threadID, pending);
    void pending.finally(() => { if (this.domHomeQueues.get(threadID) === pending) this.domHomeQueues.delete(threadID); }).catch(() => {});
    return pending;
  }
  async interact(threadID, presentationID, isLead) {
    this.assertOpen();
    const record = this.records.get(presentationID);
    if (!record || record.released || record.identity.threadID !== threadID || typeof isLead !== 'boolean') throw fail('The presentation does not belong to this thread', 'INVALID_PRESENTATION');
    return this.command('interactWithPresentation', { threadID, presentationID, isLead });
  }

  async completeTurn(threadID, turnID, reason) {
    if (!string(threadID) || !string(turnID)) throw new TypeError('Presentation completion requires the actual thread and turn');
    const relevantPending = [...this.pending].filter(([key]) => { const value = JSON.parse(key); return value[0] === threadID && value[1] === turnID; }).map(([, promise]) => promise);
    const owned = [...this.records.values()].some(record => record.identity.threadID === threadID && record.identity.turnID === turnID && !record.released);
    if (!owned && !relevantPending.length) return;
    const turnKey = JSON.stringify([threadID, turnID]); this.turns.set(turnKey, reason);
    await Promise.allSettled(relevantPending);
    if (![...this.records.values()].some(record => record.identity.threadID === threadID && record.identity.turnID === turnID && !record.released)) return;
    const source = [...this.records.values()].find(record => record.identity.threadID === threadID && record.identity.turnID === turnID && !record.released && !record.detached && record.bridgeSessionId);
    if (source) {
      const ended = nativeValue(await this.native.presentationControl(source.observerSession, 'end_native_presentation_turn', { ...source.identity, bridgeSessionId: source.bridgeSessionId }));
      if (ended?.ended !== true) throw fail('The native source did not release the completed turn cache', 'COMPLETION_UNCONFIRMED');
    }
    await this.start();
    if (reason === 'completed') {
      const result = await this.command('completeThread', { threadID });
      if (result?.accepted !== true) throw fail('The native host did not acknowledge thread completion', 'COMPLETION_UNCONFIRMED');
      for (const record of this.records.values()) if (record.identity.threadID === threadID) record.completed = true;
    } else {
      const result = await this.command('invalidateTurn', { threadID, turnID });
      if (result?.accepted !== true) throw fail('The native host did not acknowledge turn invalidation', 'COMPLETION_UNCONFIRMED');
      const results = await Promise.allSettled([...this.records.values()].filter(record => record.identity.threadID === threadID && record.identity.turnID === turnID).map(record => this.retire(record, 'turn-invalidated')));
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Native presentation turn cleanup is unconfirmed');
    }
    this.changed(threadID);
  }

  async configureHost(actualUIinput) {
    await this.start(); this.assertOpen();
    if (!object(actualUIinput) || !object(actualUIinput.layout) || !('host' in actualUIinput)) throw new TypeError('Host configuration requires actual UI host and layout inputs');
    const { host, layout } = actualUIinput;
    if (!(host === null || object(host) && string(host.hostID)) || !(layout.activeThreadID === null || string(layout.activeThreadID))) throw new TypeError('Host configuration requires actual host and active thread identities');
    if (host === null && this.registeredHostID) {
      await this.command('unregisterNativeHost', { hostID: this.registeredHostID }); this.registeredHostID = undefined;
    } else if (host !== null) {
      const result = await this.command('registerNativeHost', clone(host));
      if (result?.accepted !== true) throw fail('The native host did not accept the actual UI registration', 'HOST_CONFIGURATION_FAILED');
      if (this.registeredHostID && this.registeredHostID !== host.hostID) await this.command('unregisterNativeHost', { hostID: this.registeredHostID });
      this.registeredHostID = host.hostID;
      this.needsHost.delete(host.hostID);
    }
    this.actualHostInput = clone(actualUIinput); this.maximumDisplaySize = layout.maxDisplaySize;
    const result = await this.applyVisibility();
    const records = [...this.records.values()].filter(record => record.published && !record.closing);
    if (Number.isFinite(this.maximumDisplaySize)) await Promise.all(records.map(record => this.producerCommand(record, 'setMaximumDisplaySize', { maximumDisplaySize: this.maximumDisplaySize })));
    return result;
  }
  applyVisibility() {
    if (!this.actualHostInput) return Promise.resolve({ accepted: true });
    const layout = clone(this.actualHostInput.layout), threadID = layout.activeThreadID;
    if (this.globalHidden || threadID !== null && this.visibility.get(threadID) === 'hidden') layout.activeThreadID = null;
    return this.command('configureLayout', layout);
  }
  async hideTask(threadID) {
    this.assertOpen();
    if (!string(threadID)) throw new TypeError('A task visibility change requires a thread');
    if (this.visibility.get(threadID) !== 'hidden') { this.visibility.set(threadID, 'hidden'); this.visibilityRevision += 1; }
    await this.applyVisibility(); this.changed(threadID); return this.taskState();
  }
  async showTask(threadID) {
    this.assertOpen();
    if (!string(threadID)) throw new TypeError('A task visibility change requires a thread');
    if (this.globalHidden || this.visibility.get(threadID) !== 'shown') { this.globalHidden = false; this.visibility.set(threadID, 'shown'); this.visibilityRevision += 1; }
    await this.applyVisibility(); this.changed(threadID); return this.taskState();
  }
  async hideAll(threadIDs = []) {
    this.assertOpen();
    if (!Array.isArray(threadIDs) || threadIDs.some(id => !string(id))) throw new TypeError('Hidden task identities must be strings');
    let changed = !this.globalHidden; this.globalHidden = true;
    for (const threadID of new Set([...this.taskState().activeTaskIds, ...threadIDs])) if (this.visibility.get(threadID) !== 'hidden') { this.visibility.set(threadID, 'hidden'); changed = true; }
    if (changed) this.visibilityRevision += 1;
    await this.applyVisibility(); this.changed(); return this.taskState();
  }
  taskState() { return { activeTaskIds: [...new Set([...this.records.values()].filter(record => !record.released && !record.completed && !record.closing).map(record => record.identity.threadID))].sort(),
    globalHidden: this.globalHidden, revision: this.visibilityRevision, taskVisibilities: Object.fromEntries(this.visibility) }; }

  receive(event) {
    if (this.closed || !object(event) || !string(event.epoch)) return;
    if (this.epoch === undefined) {
      if (this.observedEpoch !== undefined && this.observedEpoch !== event.epoch) { this.serviceClosed(fail('Native Host generation changed before startup', 'HOST_GENERATION_CHANGED')); return; }
      this.observedEpoch = event.epoch;
    } else if (event.epoch !== this.epoch || this.service.epoch !== this.epoch) { this.serviceClosed(fail('Native Host generation changed', 'HOST_GENERATION_CHANGED')); return; }
    if (event.event === 'native-video') {
      const frame = event.params, record = this.records.get(frame?.presentationID);
      if (!record || record.identity.threadID !== frame.threadID || !this.enabledThreads.has(frame.threadID)) return;
      try {
        if (!string(frame.codec) || !Number.isFinite(frame.timestamp) || frame.timestamp < 0 || typeof frame.isKeyFrame !== 'boolean') throw fail('The Host video event is invalid', 'INVALID_NATIVE_FRAME');
        this.emitVideo(frame.threadID, { presentationID: frame.presentationID, threadID: frame.threadID, codec: frame.codec,
          decoderConfiguration: base64(frame.decoderConfiguration, true), timestamp: frame.timestamp,
          isKeyFrame: frame.isKeyFrame, videoData: base64(frame.videoData) });
      } catch (error) { this.report(error, frame.threadID); }
      return;
    }
    if (event.event !== 'native-presentation' || !object(event.params)) return;
    const { type, payload } = event.params;
    if (!object(payload)) return;
    try {
      if (type === 'domHomeStateChanged') {
        if (!positive(event.params.senderID) || !positive(event.params.senderGeneration) || !string(payload.threadID)
          || payload.ownerKind !== 'dsh-dom' || !Array.isArray(payload.surfaces)) throw fail('The DOM home event has no actual native binding', 'INVALID_NATIVE_EVENT');
        this.domHomes.set(payload.threadID, clone(payload)); this.changed(payload.threadID); return;
      }
      if (type === 'layout') {
        if (!positive(event.params.senderID) || !positive(event.params.senderGeneration)) throw fail('The native layout has no actual host binding', 'INVALID_NATIVE_EVENT');
        this.layout = nativeLayout(payload); this.layoutBinding = { senderID: event.params.senderID, senderGeneration: event.params.senderGeneration }; this.changed(); return;
      }
      const identity = payload.identity ?? payload;
      const record = this.records.get(identity.presentationID);
      if (type === 'presentationClickRequested' && record && sameBinding(record.binding, event.params) && identity.threadID === record.identity.threadID) {
        void this.reveal(record).catch(error => this.report(error, record.identity.threadID)); return;
      }
      if (record && sameBinding(record.binding, event.params) && identity.threadID === record.identity.threadID && identity.turnID === record.identity.turnID) {
        if (type === 'presentationPublished') { record.hostPublished = true; this.changed(record.identity.threadID); }
        if (type === 'presentationCompleted') { record.completed = true; this.changed(record.identity.threadID); }
        if (type === 'presentationRemoved') { record.hostRemoved = true; void this.retire(record, payload.reason ?? 'host-removed').catch(error => this.report(error, record.identity.threadID)); }
      }
      if (type === 'visibilityRequested') {
        if (payload.kind === 'hide-for-all-active-tasks') void this.hideAll(payload.threadIDs ?? []).catch(error => this.report(error));
        else if (payload.kind === 'hide-for-task' && Array.isArray(payload.threadIDs)) for (const threadID of payload.threadIDs) void this.hideTask(threadID).catch(error => this.report(error, threadID));
      } else if (type === 'hostClosed') {
        this.domHomes.clear();
        if (sameBinding(this.layoutBinding, event.params)) {
          this.layout = undefined; this.layoutBinding = undefined;
          this.actualHostInput = undefined; this.registeredHostID = undefined;
        }
        for (const record of this.records.values()) if (sameBinding(record.binding, event.params)) {
          record.hostClosed = true;
          void this.retire(record, 'host-closed').catch(error => this.report(error, record.identity.threadID));
        }
      } else if ((type === 'nativeHostRequested' || type === 'hostHandoffRequested') && string(payload.hostID)) {
        this.needsHost.set(payload.hostID, { hostID: payload.hostID, reason: type,
          ...(Number.isSafeInteger(payload.alignment) && payload.alignment >= 0 && payload.alignment <= 5 ? { alignment: payload.alignment } : {}) });
        this.changed();
      } else if (type === 'maxDisplaySizeChanged' && Number.isFinite(payload.maxDisplaySize)) {
        this.maximumDisplaySize = payload.maxDisplaySize;
        if (this.actualHostInput) this.actualHostInput.layout.maxDisplaySize = payload.maxDisplaySize;
        for (const record of this.records.values()) if (record.published && !record.closing) void this.producerCommand(record, 'setMaximumDisplaySize', { maximumDisplaySize: payload.maxDisplaySize }).catch(error => this.report(error, record.identity.threadID));
      } else if (type === 'domVideoRemovalRequested' && string(payload.threadID)) {
        void this.setVideoReady(payload.threadID, false).catch(error => this.report(error, payload.threadID));
      }
    } catch (error) { this.report(error); }
  }
  async reveal(record) {
    if (record.released) return;
    if (typeof this.onReveal === 'function') await this.onReveal(record.identity.threadID, record.target, record.identity.presentationID);
    else await this.native.revealWindow(record.target);
  }

  watchRelease() {
    const epoch = this.epoch, reference = new WeakRef(this);
    Promise.resolve(this.service.waitForRelease()).then(proof => {
      const consumer = reference.deref();
      if (!consumer || consumer.closed || consumer.epoch !== epoch) return;
      void consumer.providerReleased(proof).catch(error => consumer.report(error));
    }, error => { const consumer = reference.deref(); if (consumer && !consumer.closed && consumer.draining) consumer.report(error); });
  }
  async providerReleased(proof) {
    if (!object(proof) || proof.epoch !== this.epoch || this.service.epoch !== this.epoch || proof.released !== true || proof.providerClosed !== true) throw fail('The provider release receipt does not prove this Host generation was destroyed', 'NATIVE_CLEANUP_UNCONFIRMED');
    this.releaseProof = clone(proof); this.draining = true;
    return this.close();
  }
  serviceClosed(error) {
    if (this.closed) return;
    this.draining = true; this.failure = asError(error); this.report(error);
    void this.close().catch(cleanup => this.report(cleanup));
  }
  async waitRelease() {
    if (this.releaseProof) return this.releaseProof;
    if (this.releaseWait) return this.releaseWait;
    if (typeof this.service.waitForRelease !== 'function') throw fail('The Desktop service cannot prove provider destruction', 'NATIVE_CLEANUP_UNCONFIRMED');
    const pending = (async () => {
      const proof = await this.service.waitForRelease();
      if (!object(proof) || proof.epoch !== this.epoch || this.service.epoch !== this.epoch || proof.released !== true || proof.providerClosed !== true) throw fail('The provider release proof does not match this Host generation', 'NATIVE_CLEANUP_UNCONFIRMED');
      this.releaseProof = clone(proof); return this.releaseProof;
    })();
    this.releaseWait = pending;
    void pending.finally(() => { if (this.releaseWait === pending) this.releaseWait = null; }).catch(() => {});
    return pending;
  }

  async bindingReleased(record) {
    const proof = await this.request('nativePresentation.producerStatus', { identity: clone(record.identity) });
    if (!object(proof) || typeof proof.hostReleased !== 'boolean' || !sameBinding(record.binding, proof)) throw fail('The host closure receipt belongs to another source binding', 'NATIVE_CLEANUP_UNCONFIRMED');
    if (!proof.hostReleased) return false;
    if (proof.hostEndpoint && ['name', 'nonce', 'pid', 'pidVersion', 'euid'].some(key => proof.hostEndpoint[key] !== record.hostEndpoint[key])) throw fail('The released host endpoint does not match this producer', 'NATIVE_CLEANUP_UNCONFIRMED');
    return true;
  }

  confirmBindingDestroyed(record) {
    return this.native.presentationCleanup(record.observerSession, 'confirm_native_presentation_provider_destroyed', {
      ...record.identity, bridgeSessionId: record.bridgeSessionId, providerDestroyed: true, hostEndpoint: record.hostEndpoint });
  }

  async retireDisconnectedSource(record, error) {
    await this.native.confirmPresentationDisconnected(record.observerSession, error);
    if (this.draining || this.service.hostClosing === true || this.service.released === true) await this.waitRelease();
    else {
      let unused;
      try { unused = await this.request('nativePresentation.cancelProducer', { identity: clone(record.identity) }); }
      catch { /* A bound producer requires kernel-confirmed retirement below. */ }
      if (unused?.accepted === true) {
        record.reservationReleased = true; record.detached = true; record.published = false;
        return;
      }
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      while (true) {
        const actual = await this.request('nativePresentation.retireExitedProducer', { identity: clone(record.identity) });
        if (!object(actual) || !sameBinding(record.binding, actual)) throw fail('The source cleanup receipt belongs to another host', 'NATIVE_CLEANUP_UNCONFIRMED');
        if (actual.surfaceDetached === true && actual.closed === true) break;
        if (Date.now() >= deadline) throw fail('The exited producer still has a native surface', 'NATIVE_CLEANUP_UNCONFIRMED');
        await delay(100);
      }
    }
    record.detached = true; record.published = false;
  }

  retire(record, reason) {
    if (record.released) return Promise.resolve();
    if (record.closing) return record.closing;
    record.stopRequested = true;
    const pending = (async () => {
      await record.initializing?.catch(() => {});
      try {
        if (record.startAttempted && !record.bridgeSessionId) {
          // A failed start reply or missing notification is not proof that no
          // producer was created. Inspect this existing native lease first.
          const actual = nativeValue(await this.native.presentationStatus(record.observerSession, record.identity));
          if (actual?.exists === false) record.noBridge = true;
          else if (actual?.exists === true) this.acceptState(record, actual);
          else throw fail('The native runtime did not confirm whether the producer exists', 'NATIVE_CLEANUP_UNCONFIRMED');
        }
        if (record.bridgeSessionId && !record.detached) {
          let result;
          if (this.draining || this.service.hostClosing === true || this.service.released === true) {
            await this.waitRelease();
            result = nativeValue(await this.confirmBindingDestroyed(record));
          } else if (record.hostClosed && await this.bindingReleased(record)) {
            result = nativeValue(await this.confirmBindingDestroyed(record));
          } else {
            try { result = nativeValue(await this.native.presentationCleanup(record.observerSession, 'end_native_presentation', { ...record.identity, bridgeSessionId: record.bridgeSessionId })); }
            catch (error) {
              if (this.draining || this.service.hostClosing === true || this.service.released === true) {
                this.draining = true; await this.waitRelease();
              } else if (!record.hostClosed || !await this.bindingReleased(record)) throw error;
              result = nativeValue(await this.confirmBindingDestroyed(record));
            }
          }
          this.acceptState(record, result);
          if (!record.detached) throw fail('The native source did not acknowledge actual surface detachment', 'NATIVE_CLEANUP_UNCONFIRMED');
        }
      } catch (error) { await this.retireDisconnectedSource(record, error); }
      if (record.registrationAttempted && !record.bridgeSessionId && !record.reservationReleased && !record.detached) {
        if (this.draining || this.service.hostClosing === true || this.service.released === true) await this.waitRelease();
        else if((await this.request('nativePresentation.cancelProducer', { identity: clone(record.identity) }))?.accepted!==true)throw fail('The native producer reservation was not released','NATIVE_CLEANUP_UNCONFIRMED');
        record.reservationReleased=true;
      }
      if(record.detached&&!record.reservationReleased){
        if(this.draining||this.service.hostClosing===true||this.service.released===true)await this.waitRelease();
        else if((await this.request('nativePresentation.releaseProducer',{identity:clone(record.identity)}))?.accepted!==true)throw fail('The native host retained its producer channel','NATIVE_CLEANUP_UNCONFIRMED');
        record.reservationReleased=true;
      }
      record.unlisten?.(); record.unlisten = null;
      if (record.releaseView) { await record.releaseView(); record.releaseView = null; }
      record.controller.abort(fail(`Native presentation ended: ${reason}`, 'SOURCE_CLOSED'));
      record.released = true; record.published = false;
      if (this.records.get(record.identity.presentationID) === record) this.records.delete(record.identity.presentationID);
      if (this.sources.get(record.key) === record) this.sources.delete(record.key);
      this.changed(record.identity.threadID);
    })();
    record.closing = pending;
    void pending.finally(() => { if (record.closing === pending) record.closing = null; }).catch(() => {});
    return pending;
  }

  publicRecord(record) {
    const producer = record.nativeProducer && Object.fromEntries(PRODUCER_PUBLIC_KEYS.filter(key => key in record.nativeProducer).map(key => [key, clone(record.nativeProducer[key])]));
    return { ...record.identity,
      published: record.published, completed: record.completed, cleanupPending: !!record.closing || record.cleanupPending === true,
      ...(producer ? { nativeProducer: producer } : {}) };
  }
  snapshot(threadID) {
    const records = [...this.records.values()].filter(record => !record.released && (threadID === undefined || record.identity.threadID === threadID));
    return { ...(this.capabilities ? { capabilities: clone(this.capabilities) } : {}),
      ...(this.layout ? { nativePresentationLayout: clone(this.layout) } : {}),
      ...(threadID !== undefined && this.domHomes.has(threadID) ? { domHome: clone(this.domHomes.get(threadID)) } : {}),
      presentations: records.map(record => this.publicRecord(record)), taskState: this.taskState(), needsHost: [...this.needsHost.values()].map(clone) };
  }

  close() {
    if (this.closed) return Promise.resolve();
    if (this.closing) return this.closing;
    this.stopping = true;
    const pending = (async () => {
      if (this.service?.hostClosing === true || this.service?.released === true) this.draining = true;
      if (this.draining && this.epoch !== undefined) await this.waitRelease();
      await Promise.allSettled([...this.pending.values()]);
      if (!this.draining && this.started) {
        // A dead producer can no longer ACK video controls. Detach its real
        // surface before retrying the retained video subscriptions below.
        await Promise.allSettled([...this.videoDisposers].map(dispose => dispose()));
      }
      const results = await Promise.allSettled([...this.records.values()].map(record => this.retire(record, 'consumer-closed')));
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Native presentation shutdown is unconfirmed');
      await Promise.all([...this.videoDisposers].map(dispose => dispose()));
      this.unsubscribe?.(); this.unsubscribe = null; this.subscribers.clear(); this.enabledThreads.clear();
      this.closed = true; this.layout = undefined; this.domHomes.clear(); this.domHomeRevisions.clear(); this.changed();
    })();
    this.closing = pending;
    void pending.finally(() => { if (this.closing === pending) this.closing = null; }).catch(() => {});
    return pending;
  }
}
