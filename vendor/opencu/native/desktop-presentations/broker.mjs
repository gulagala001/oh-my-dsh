import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DEFAULT_TIMEOUT_MS, FLOATING_HOST_ID, OWNER_KIND, deferred, fail, jsonValue, nonempty, positive, record } from './ipc.mjs';

const operations = new Set(['removePresentation', 'invalidateTurn', 'completeThread', 'configureLayout',
  'setNativeVideoEnabled', 'setNativeVideoReady', 'registerNativeHost', 'unregisterNativeHost', 'moveStackToHost',
  'setPreferredAnchorAlignment', 'setMaxDisplaySize', 'interactWithPresentation', 'requestPlacement', 'setDOMVideoHome']);
const identityFields = ['presentationID', 'threadID', 'turnID', 'sourceGeneration', 'targetId', 'viewId',
  'captureId', 'pid', 'windowId', 'processIdentity'];
const object = value => { if (!record(value)) throw fail('Native presentation input must be an object', 'INVALID_ARGUMENT'); return value; };
const sameIdentity = (a, b) => identityFields.every(key => a[key] === b[key]);

function identity(value) {
  const source = object(value), result = {};
  for (const key of identityFields) {
    const field = source[key];
    if (key === 'sourceGeneration' || key === 'pid' || key === 'windowId'
      ? !positive(field) || field > (key === 'pid' ? 0x7fffffff : 0xffffffff)
      : !nonempty(field) || field.length > 4096) throw fail(`Invalid native producer ${key}`, 'INVALID_ARGUMENT');
    result[key] = field;
  }
  if (Object.keys(source).some(key => !identityFields.includes(key))) throw fail('Unexpected native producer identity field', 'INVALID_ARGUMENT');
  return result;
}

async function bounded(promise, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(fail(message, 'NATIVE_PRESENTATION_RELEASE_FAILED')), DEFAULT_TIMEOUT_MS);
  })]); } finally { clearTimeout(timer); }
}

// The owner is this plugin's window. An external DSH window cannot become an AppKit owner here.
export class PluginNativePresentationBroker {
  constructor({ load, getWindow, onEvent, onError = () => {} }) {
    this.load = load; this.getWindow = getWindow; this.onEvent = onEvent; this.onError = onError;
    this.ownerID = randomUUID(); this.binding = undefined; this.closingBindings = new Set();
    this.producers = new Map(); this.retiredProducers = new Map(); this.generation = 0;
    this.hostsCreated = 0; this.hostsTerminated = 0;
    this.closed = false; this.layout = undefined; this.configuredLayout = false;
  }

  capabilities() {
    const loaded = this.load();
    if (loaded.kind !== 'available') return { available: false, reason: loaded.reason, ...(loaded.detail ? { detail: loaded.detail } : {}) };
    return { available: !this.closed, hostActive: !!this.binding, ownerKind: OWNER_KIND,
      homeHostAvailable: false, capabilities: loaded.addon.getCapabilities() };
  }

  host() {
    if (this.closed) throw fail('The plugin native presentation provider has closed', 'PROVIDER_CLOSED');
    const window = this.getWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) throw fail('No live plugin presentation owner window is available');
    if (this.binding?.window === window) return this.binding;
    if (this.binding || this.closingBindings.size) throw fail('The previous native owner is still releasing', 'NATIVE_HOST_CLOSED');
    const loaded = this.load();
    if (loaded.kind !== 'available') throw fail(`Native presentation artifact is unavailable: ${loaded.reason}`);
    const senderID = window.webContents.id, senderGeneration = ++this.generation, terminal = deferred();
    let binding;
    const host = loaded.addon.createHost({ ownerWindowHandle: window.getNativeWindowHandle(), senderID, senderGeneration }, event => {
      try { this.nativeEvent(binding, event); } catch (error) { this.onError(error); }
    });
    const invalidate = () => {
      if (this.binding !== binding) return;
      try { this.releaseHost(); } catch (error) {
        this.onError(error);
        this.onEvent('native-presentation', { type: 'releaseFailed', senderID, senderGeneration, payload: { message: error.message } });
      }
    };
    const unlisten = () => {
      window.removeListener('closed', invalidate);
      window.webContents.removeListener('did-navigate', invalidate);
      window.webContents.removeListener('render-process-gone', invalidate);
    };
    binding = { window, host, senderID, senderGeneration, terminal, unlisten, nativeClosed: false };
    this.hostsCreated += 1;
    this.binding = binding;
    window.once('closed', invalidate);
    window.webContents.on('did-navigate', invalidate);
    window.webContents.on('render-process-gone', invalidate);
    const owner = this.owner();
    this.command(binding, 'registerNativeHost', { ...this.nativeHost(owner.host), ownerWindowHandle: window.getNativeWindowHandle() });
    this.layout = owner.layout;
    this.command(binding, 'configureLayout', this.layout);
    this.command(binding, 'moveStackToHost', { hostID: FLOATING_HOST_ID, alignment: 1 });
    return binding;
  }

  nativeEvent(binding, event) {
    if (!binding || event.hostToken !== binding.host.hostToken || event.senderID !== binding.senderID || event.senderGeneration !== binding.senderGeneration) return;
    if (this.binding !== binding && (!this.closingBindings.has(binding) || !['hostClosed', 'presentationRemoved'].includes(event.type))) return;
    if (!jsonValue(event.payload)) throw fail('The native presentation event exceeds its JSON protocol', 'INVALID_NATIVE_EVENT');
    const payload = object(event.payload);
    if (event.type === 'producerChannelReady' || event.type === 'producerChannelFailed') {
      const source = identity(payload.identity), producer = this.producers.get(source.presentationID);
      if (producer?.binding !== binding || !sameIdentity(producer.identity, source)) return;
      if (event.type === 'producerChannelFailed') {
        producer.ready.reject(fail(typeof payload.error === 'string' ? payload.error : 'Native producer channel failed'));
        this.onEvent('native-presentation', { type: 'producerFailed', senderID: binding.senderID,
          senderGeneration: binding.senderGeneration, payload: { identity: source, error: payload.error ?? 'Native producer channel failed' } });
      } else {
        const endpoint = object(payload.hostEndpoint);
        if (!nonempty(endpoint.name) || !nonempty(endpoint.nonce) || endpoint.pid !== process.pid
          || !positive(endpoint.pidVersion) || endpoint.euid !== process.geteuid?.()) throw fail('Invalid native producer endpoint', 'INVALID_NATIVE_EVENT');
        producer.endpoint = endpoint;
        producer.ready.resolve({ hostEndpoint: endpoint, senderID: binding.senderID, senderGeneration: binding.senderGeneration });
      }
      return;
    }
    if (event.type === 'presentationRemoved') {
      const source = payload.identity, producer = this.producers.get(source?.presentationID);
      if (producer?.binding === binding && source.threadID === producer.identity.threadID && source.turnID === producer.identity.turnID
        && payload.sourceGeneration === producer.identity.sourceGeneration && payload.surfaceDetached === true) producer.detachReceipt = structuredClone(payload);
    }
    if (event.type === 'hostClosed') for (const producer of this.producers.values()) if (producer.binding === binding) {
      producer.hostReleased = true;
      producer.ready.reject(fail('The native owner window closed', 'NATIVE_HOST_CLOSED'));
    }
    this.onEvent(event.type === 'nativeVideoFrame' ? 'native-video' : 'native-presentation', event.type === 'nativeVideoFrame'
      ? payload : { type: event.type, senderID: binding.senderID, senderGeneration: binding.senderGeneration, payload });
    if (event.type === 'hostClosed') {
      if (!binding.nativeClosed) this.hostsTerminated += 1;
      binding.nativeClosed = true; binding.unlisten();
      if (this.binding === binding) this.binding = undefined;
      this.closingBindings.delete(binding); binding.terminal.resolve();
    }
  }

  owner() {
    const binding = this.binding ?? this.host(), window = binding.window;
    const [width, height] = window.getContentSize(), inset = Math.min(24, width / 2, height / 2);
    const anchors = [[inset, height - inset], [width - inset, height - inset], [width - inset, inset],
      [inset, inset], [width / 2, height - inset], [width / 2, inset]]
      .map(([x, y], alignment) => ({ contentPoint: { x, y }, alignment }));
    const host = { ownerKind: OWNER_KIND, ownerID: this.ownerID, hostID: FLOATING_HOST_ID,
      anchorContentRect: { x: 0, y: 0, width, height }, interactionPassthroughContentRect: { x: 0, y: 0, width: 0, height: 0 },
      anchors, presentationScope: 0, codexHomeAvailable: false };
    const layout = { activeThreadID: null, currentHostID: FLOATING_HOST_ID, currentAlignment: 1, codexPlacement: 1,
      presentationScope: 0, visibleStackItemLimit: 5, maxDisplaySize: 200, stackDisplayWidth: 0,
      stackDisplayHeight: 0, homeHandoffPending: false, codexHomeAvailable: false };
    return { available: true, ownerKind: OWNER_KIND, ownerID: this.ownerID, hostID: FLOATING_HOST_ID,
      ownerWindowID: binding.host.ownerWindowID, senderID: binding.senderID, senderGeneration: binding.senderGeneration,
      bounds: window.getBounds(), contentSize: { width, height }, host, layout };
  }

  nativeHost(payload) {
    if (payload.ownerKind !== OWNER_KIND || payload.ownerID !== this.ownerID || payload.hostID !== FLOATING_HOST_ID
      || payload.codexHomeAvailable !== false || payload.presentationScope !== 0) throw fail('The registration does not own this plugin companion window', 'INVALID_NATIVE_OWNER');
    const actual = this.owner().host;
    for (const key of ['anchorContentRect', 'interactionPassthroughContentRect', 'anchors']) {
      if (!isDeepStrictEqual(payload[key], actual[key])) throw fail('Native anchors must come from this companion window\'s current geometry', 'INVALID_NATIVE_OWNER');
    }
    const { ownerID: _id, ownerKind: _kind, ...native } = payload;
    return native;
  }

  command(binding, operation, payload) {
    if (this.binding !== binding || this.closed) throw fail('The native owner window changed', 'NATIVE_HOST_CLOSED');
    const result = binding.host.command({ senderContext: { senderID: binding.senderID,
      senderGeneration: binding.senderGeneration, hostToken: binding.host.hostToken }, operation, payload });
    if (!jsonValue(result)) throw fail('The native result exceeds its JSON protocol', 'INVALID_NATIVE_RESULT');
    return result;
  }

  async handle(method, params, { signal } = {}) {
    signal?.throwIfAborted();
    if (method === 'nativePresentation.capabilities') return this.capabilities();
    if (method === 'nativePresentation.owner') return this.owner();
    const input = object(params);
    if (method === 'nativePresentation.configureOwner') {
      if (Object.keys(input).some(key => !['ownerID', 'bounds'].includes(key)) || input.ownerID !== this.ownerID) throw fail('The companion owner identity changed', 'INVALID_NATIVE_OWNER');
      const bounds = object(input.bounds);
      if (Object.keys(bounds).sort().join(',') !== 'height,width,x,y' || !Object.values(bounds).every(Number.isSafeInteger)
        || bounds.width < 1 || bounds.height < 1 || bounds.width > 16384 || bounds.height > 16384) throw fail('Invalid companion window bounds', 'INVALID_ARGUMENT');
      const binding = this.host(); binding.window.setBounds(bounds);
      const owner = this.owner();
      this.command(binding, 'registerNativeHost', { ...this.nativeHost(owner.host), ownerWindowHandle: binding.window.getNativeWindowHandle() });
      return owner;
    }
    if (method === 'nativePresentation.openProducer') return this.openProducer(input, signal);
    if (['nativePresentation.cancelProducer', 'nativePresentation.releaseProducer', 'nativePresentation.producerStatus', 'nativePresentation.retireExitedProducer'].includes(method)) {
      const source = identity(input.identity), producer = this.producers.get(source.presentationID), retired = this.retiredProducers.get(source.presentationID);
      if (!producer && retired && sameIdentity(retired, source) && ['nativePresentation.cancelProducer', 'nativePresentation.releaseProducer'].includes(method)) return { accepted: true };
      if (!producer || !sameIdentity(producer.identity, source)) throw fail('The native producer reservation is unavailable', 'STALE_PRESENTATION');
      const { senderID, senderGeneration } = producer.binding;
      if (method === 'nativePresentation.producerStatus') return { hostReleased: producer.hostReleased,
        ...(producer.hostReleased && producer.endpoint ? { hostEndpoint: producer.endpoint } : {}), senderID, senderGeneration };
      if (method === 'nativePresentation.retireExitedProducer') {
        if (producer.hostReleased) return { surfaceDetached: !!producer.detachReceipt, closed: true, senderID, senderGeneration };
        const result = object(this.command(producer.binding, 'retireExitedProducerChannel', { identity: source }));
        return { surfaceDetached: result.surfaceDetached === true, closed: result.closed === true, senderID, senderGeneration };
      }
      if (producer.hostReleased) { this.retireProducer(producer); return { accepted: true }; }
      const result = this.command(producer.binding, method === 'nativePresentation.releaseProducer' ? 'forgetProducerChannel' : 'cancelProducerChannel', { identity: source });
      if (result.accepted === true) { producer.ready.reject(fail('The native producer reservation was released', 'CANCELLED')); this.retireProducer(producer); }
      return result;
    }
    if (method === 'nativePresentation.frame') {
      const producer = this.producers.get(input.presentationID);
      if (!producer || producer.hostReleased || !sameIdentity(producer.identity, input)) throw fail('The native frame source is unavailable', 'STALE_PRESENTATION');
      const result = this.command(producer.binding, 'publishEncodedFrame', input);
      if (result.accepted !== true) throw fail('The native host rejected this encoded frame', 'INVALID_NATIVE_FRAME');
      return result;
    }
    if (method !== 'nativePresentation.command') throw fail('Unknown native presentation method', 'METHOD_UNAVAILABLE');
    if (Object.keys(input).some(key => key !== 'operation' && key !== 'payload') || !operations.has(input.operation)) throw fail('Unsupported native presentation operation', 'INVALID_ARGUMENT');
    let payload = object(input.payload);
    if (['ownerWindowHandle', 'nativeOwner', 'senderContext', 'hostToken', 'senderID', 'senderGeneration'].some(key => key in payload)) throw fail('Native ownership must be issued by the plugin main process', 'INVALID_ARGUMENT');
    const binding = this.host();
    signal?.throwIfAborted();
    if (input.operation === 'registerNativeHost') payload = { ...this.nativeHost(payload), ownerWindowHandle: binding.window.getNativeWindowHandle() };
    if (input.operation === 'configureLayout') {
      if (![null, FLOATING_HOST_ID].includes(payload.currentHostID) || payload.codexHomeAvailable !== false || payload.homeHandoffPending !== false
        || payload.codexPlacement !== 1 || payload.presentationScope !== 0) throw fail('The layout requires the actual plugin companion host', 'INVALID_NATIVE_OWNER');
    }
    const result = this.command(binding, input.operation, payload);
    if (input.operation === 'configureLayout' && result.accepted === true) { this.layout = structuredClone(payload); this.configuredLayout = true; }
    return result;
  }

  retireProducer(producer) {
    const key = producer.identity.presentationID;
    if (this.producers.get(key) === producer) this.producers.delete(key);
    this.retiredProducers.set(key, producer.identity);
    if (this.retiredProducers.size > 1024) this.retiredProducers.delete(this.retiredProducers.keys().next().value);
  }

  async openProducer(input, signal) {
    if (Object.keys(input).some(key => key !== 'identity' && key !== 'producer')) throw fail('Unexpected native producer input', 'INVALID_ARGUMENT');
    const source = identity(input.identity), binding = this.host(), key = source.presentationID;
    if (this.producers.has(key)) throw fail('The native producer identity is already reserved', 'NATIVE_PRODUCER_BUSY');
    if (this.producers.size >= 4096) throw fail('The native producer reservation limit was reached', 'RESOURCE_LIMIT');
    const producer = { binding, identity: source, ready: deferred(), endpoint: undefined, hostReleased: false, detachReceipt: undefined };
    this.producers.set(key, producer);
    let timer;
    const cancelled = () => producer.ready.reject(fail('Native producer registration was cancelled', 'CANCELLED'));
    try {
      signal?.throwIfAborted(); signal?.addEventListener('abort', cancelled, { once: true });
      const response = this.command(binding, 'openProducerChannel', { identity: source, producer: object(input.producer) });
      if (response.accepted !== true) throw fail('The native host did not accept the producer reservation');
      if (!this.configuredLayout) {
        this.layout = { ...this.layout, activeThreadID: source.threadID };
        this.command(binding, 'configureLayout', this.layout);
      }
      timer = setTimeout(() => producer.ready.reject(fail('Native producer registration timed out', 'NATIVE_PRESENTATION_TIMEOUT')), DEFAULT_TIMEOUT_MS);
      return await producer.ready.promise;
    } catch (error) {
      producer.ready.reject(error);
      try {
        if (this.binding !== binding) {
          await bounded(binding.terminal.promise, 'The native producer owner close is unconfirmed');
          if (!producer.hostReleased) throw fail('The native producer owner close is unconfirmed', 'NATIVE_PRESENTATION_RELEASE_FAILED');
        } else if (this.command(binding, 'cancelProducerChannel', { identity: source }).accepted !== true) {
          throw fail('The native producer reservation remains bound', 'NATIVE_PRESENTATION_RELEASE_FAILED');
        }
        this.retireProducer(producer);
      } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native registration failed and its reservation requires cleanup'); }
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); }
  }

  releaseHost() {
    const binding = this.binding;
    if (!binding) return;
    this.closingBindings.add(binding);
    if (!binding.host.close()) throw fail('The native presentation host did not confirm its close', 'NATIVE_PRESENTATION_RELEASE_FAILED');
    for (const producer of this.producers.values()) if (producer.binding === binding) producer.ready.reject(fail('The native host is closing', 'NATIVE_HOST_CLOSED'));
    binding.unlisten();
    if (this.binding === binding) this.binding = undefined;
  }

  async dispose() {
    this.closed = true;
    this.releaseHost();
    await Promise.all([...this.closingBindings].map(binding => bounded(binding.terminal.promise, 'The native host terminal event was not delivered')));
    return { nativeHostCreated: this.hostsCreated > 0, nativeHostClosed: this.hostsTerminated === this.hostsCreated,
      nativeTerminalDelivered: this.hostsCreated > 0 && this.hostsTerminated === this.hostsCreated, ownerKind: OWNER_KIND };
  }
}
