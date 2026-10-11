import { EventEmitter } from 'node:events';

// Source: Codex browser-service.mjs, Ff/Ru/YY/ma, offsets 885106-889720.
// The caller owns this CDP connection's Fetch domain exclusively and must
// quiesce credential documents before disposing their request containment.
const documentResponsePattern = Object.freeze({ requestStage: 'Response', resourceType: 'Document' });
const requestPattern = Object.freeze({ requestStage: 'Request' });
const preservedDebugger = Object.freeze({ preserveDebuggerOnTimeout: true });
const requiredCdpMethods = ['call', 'on', 'removeListener', 'isTabAttached', 'addTabAttachHandler'];

function requireCdp(cdp) {
  if (cdp == null || !['object', 'function'].includes(typeof cdp)) {
    throw new TypeError('Browser auth document responses require cdp');
  }
  for (const method of requiredCdpMethods) {
    if (typeof cdp[method] !== 'function') {
      throw new TypeError(`Browser auth document responses require cdp.${method}`);
    }
  }
}

function requireTabId(tabId) {
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new TypeError('Browser auth document responses require a numeric tab ID');
  }
}

/**
 * Implements actual Fetch interception, not an observer. `intercept` receives
 * (tabId, pausedResponse, claim), and a synchronous claim transfers response
 * ownership until continueResponse/failResponse/release. `response` listeners
 * may replace responseHeaders; unchanged responseHeaders pass through intact.
 */
export class BrowserAuthDocumentResponses extends EventEmitter {
  constructor(cdpOrOptions) {
    super();
    const cdp = cdpOrOptions?.cdp ?? cdpOrOptions;
    requireCdp(cdp);
    this.cdp = cdp;
    const removeAttachHandler = cdp.addTabAttachHandler((tabId, options) => {
      if (!this.setupByTab.has(tabId)) return this.ensureInterceptionReady(tabId, options);
    });
    if (typeof removeAttachHandler !== 'function') {
      throw new TypeError('Browser auth document responses require a disposer from cdp.addTabAttachHandler');
    }
    this.removeAttachHandler = removeAttachHandler;
    cdp.on('tabDetached', this.onTabDetached);
    cdp.on('event', this.onEvent);
  }

  ownedResponsesByTab = new Map();
  ownedRequestsByTab = new Map();
  setupByTab = new Map();
  requestInterceptorsByTab = new Map();
  configurationByTab = new Map();
  configuredRequestsByTab = new Set();
  managedTabIds = new Set();
  inFlightByTab = new Map();
  failedOperationsByTab = new Map();
  closing = false;
  disposed = false;
  disposePromise;
  cleanupByTab = new Map();
  cleanupPendingByTab = new Map();

  assertOpen() {
    if (this.closing || this.disposed) throw new Error('Browser auth document responses are closing');
  }

  track(tabId, operation) {
    const pending = this.inFlightByTab.get(tabId) ?? new Set();
    pending.add(operation);
    this.inFlightByTab.set(tabId, pending);
    operation.then(() => this.untrack(tabId, operation), () => {
      // Keep only a nonsecret failure marker. CDP errors can contain a URL,
      // so neither errors nor paused request data enter diagnostics.
      this.failedOperationsByTab.set(tabId, true);
      this.untrack(tabId, operation);
    });
    return operation;
  }

  untrack(tabId, operation) {
    const pending = this.inFlightByTab.get(tabId);
    if (pending == null) return;
    pending.delete(operation);
    if (pending.size === 0) this.inFlightByTab.delete(tabId);
  }

  ensureInterceptionReady(tabId, options = {}) {
    this.assertOpen();
    requireTabId(tabId);
    const existing = this.setupByTab.get(tabId);
    if (existing != null) return existing;
    if (this.cleanupPendingByTab.has(tabId)) throw new Error('The previous browser auth Fetch cleanup is still pending');
    this.managedTabIds.add(tabId);
    if (!this.cleanupByTab.has(tabId)) {
      if (typeof this.cdp.acquireCleanup !== 'function') throw new Error('Browser auth Fetch interception requires an owned cleanup lease');
      const cleanup = this.cdp.acquireCleanup(tabId);
      this.cleanupByTab.set(tabId, cleanup);
      cleanup.onClose(() => this.cleanupTab(tabId));
    }
    const setup = Promise.resolve().then(() => this.cdp.call(tabId, 'Fetch.enable', {
      patterns: [documentResponsePattern],
    }, options));
    this.setupByTab.set(tabId, setup);
    setup.catch(() => { if (this.setupByTab.get(tabId) === setup) this.setupByTab.delete(tabId); });
    return this.track(tabId, setup);
  }

  async addRequestInterceptor(tabId, interceptor, priority = 0) {
    this.assertOpen();
    if (typeof interceptor !== 'function' || !Number.isFinite(priority)) {
      throw new TypeError('Browser auth request interception requires a function and finite priority');
    }
    await this.ensureInterceptionReady(tabId);
    this.assertOpen();
    const interceptors = this.requestInterceptorsByTab.get(tabId) ?? [];
    const registration = { interceptor, priority };
    interceptors.push(registration);
    interceptors.sort((left, right) => right.priority - left.priority);
    this.requestInterceptorsByTab.set(tabId, interceptors);
    try { await this.configureRequestInterception(tabId); }
    catch (error) {
      interceptors.splice(interceptors.indexOf(registration), 1);
      if (interceptors.length === 0) this.requestInterceptorsByTab.delete(tabId);
      throw error;
    }
    return async () => {
      const current = this.requestInterceptorsByTab.get(tabId);
      if (current == null) return;
      const index = current.indexOf(registration);
      if (index < 0) return;
      current.splice(index, 1);
      if (current.length === 0) this.requestInterceptorsByTab.delete(tabId);
      if (!this.disposed) await this.configureRequestInterception(tabId);
    };
  }

  hasOwnedPausedResponses(tabId) { return (this.ownedResponsesByTab.get(tabId)?.size ?? 0) > 0; }
  hasRequestInterceptors(tabId) { return this.requestInterceptorsByTab.has(tabId); }

  async continueResponse(tabId, requestId, options) {
    const operation = Promise.resolve().then(async () => {
      if (this.closing) {
        await this.cdp.call(tabId, 'Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, preservedDebugger);
      } else {
        await this.cdp.call(tabId, 'Fetch.continueResponse', { requestId, ...options }, preservedDebugger);
      }
      this.release(tabId, requestId);
    });
    await this.track(tabId, operation);
  }

  async failResponse(tabId, requestId) {
    const operation = Promise.resolve().then(async () => {
      await this.cdp.call(tabId, 'Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, preservedDebugger);
      this.release(tabId, requestId);
      this.releaseRequest(tabId, requestId);
    });
    await this.track(tabId, operation);
  }

  onTabDetached = tabId => {
    this.ownedResponsesByTab.delete(tabId);
    this.ownedRequestsByTab.delete(tabId);
    this.setupByTab.delete(tabId);
    this.requestInterceptorsByTab.delete(tabId);
    this.configurationByTab.delete(tabId);
    this.configuredRequestsByTab.delete(tabId);
    this.managedTabIds.delete(tabId);
    this.failedOperationsByTab.delete(tabId);
    this.emit('tabDetached', tabId);
  };
  cleanupTab(tabId) {
    const existing = this.cleanupPendingByTab.get(tabId);
    if (existing) return existing;
    const lease = this.cleanupByTab.get(tabId);
    if (!lease) return Promise.resolve();
    const pending = (async () => {
      await this.drain(tabId);
      for (;;) {
        const ids = lease.requestIds();
        if (!ids.length) break;
        for (const requestId of ids) await lease.call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      }
      await lease.call('Fetch.disable', {});
      lease.release();
      if (this.cleanupByTab.get(tabId) === lease) {
        this.cleanupByTab.delete(tabId);
        this.managedTabIds.delete(tabId); this.setupByTab.delete(tabId); this.configuredRequestsByTab.delete(tabId);
        this.ownedResponsesByTab.delete(tabId); this.ownedRequestsByTab.delete(tabId);
        this.requestInterceptorsByTab.delete(tabId); this.configurationByTab.delete(tabId);
      }
    })();
    this.cleanupPendingByTab.set(tabId, pending);
    pending.finally(() => { if (this.cleanupPendingByTab.get(tabId) === pending) this.cleanupPendingByTab.delete(tabId); }).catch(() => {});
    return pending;
  }

  onEvent = event => {
    if (event.method !== 'Fetch.requestPaused' || this.disposed) return;
    const tabId = event.source?.tabId;
    if (typeof tabId !== 'number' || event.source.sessionId != null || event.source.targetId != null) return;
    // Ownership is recorded before yielding, so cleanup can account for every
    // Fetch pause already delivered by the real CDP event stream.
    const request = event.params;
    this.managedTabIds.add(tabId);
    if (request.responseStatusCode == null && request.responseErrorReason == null) {
      if (!this.requestInterceptorsByTab.has(tabId) && !this.configuredRequestsByTab.has(tabId) && !this.closing) return;
      const owned = this.ownedRequestsByTab.get(tabId) ?? new Set();
      owned.add(request.requestId);
      this.ownedRequestsByTab.set(tabId, owned);
    } else if (request.resourceType === 'Document') {
      const owned = this.ownedResponsesByTab.get(tabId) ?? new Set();
      owned.add(request.requestId);
      this.ownedResponsesByTab.set(tabId, owned);
    } else return;
    this.track(tabId, this.handleEvent(event)).catch(() => {});
  };

  async handleEvent(event) {
    if (event.method !== 'Fetch.requestPaused') return;
    const tabId = event.source.tabId;
    if (typeof tabId !== 'number' || event.source.sessionId != null || event.source.targetId != null) return;
    const request = event.params;
    if (request.responseStatusCode == null && request.responseErrorReason == null) {
      if (!this.requestInterceptorsByTab.has(tabId) && !this.configuredRequestsByTab.has(tabId) && !this.closing) return;
      await this.handleRequest(tabId, request);
      return;
    }
    if (request.resourceType !== 'Document') return;
    const owned = this.ownedResponsesByTab.get(tabId) ?? new Set();
    owned.add(request.requestId);
    this.ownedResponsesByTab.set(tabId, owned);
    if (this.closing) {
      await this.failResponse(tabId, request.requestId);
      return;
    }
    if (request.responseErrorReason != null) {
      await this.cdp.call(tabId, 'Fetch.continueRequest', { requestId: request.requestId }, preservedDebugger);
      this.release(tabId, request.requestId);
      return;
    }
    let claimed = false;
    this.emit('intercept', tabId, request, () => { claimed = true; });
    if (claimed) return;
    const originalHeaders = request.responseHeaders;
    this.emit('response', tabId, request);
    await this.continueResponse(tabId, request.requestId, request.responseHeaders === originalHeaders ? undefined : {
      responseCode: request.responseStatusCode,
      ...(request.responseStatusText ? { responsePhrase: request.responseStatusText } : {}),
      responseHeaders: request.responseHeaders,
    });
  }

  configureRequestInterception(tabId) {
    const configuration = (this.configurationByTab.get(tabId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!this.cdp.isTabAttached(tabId)) return;
      const requestsEnabled = this.requestInterceptorsByTab.has(tabId);
      if (this.configuredRequestsByTab.has(tabId) === requestsEnabled) return;
      const configure = requestsEnabled ? this.cdp.call.bind(this.cdp, tabId) : this.cleanupByTab.get(tabId)?.call;
      if (!configure) throw new Error('Browser auth Fetch cleanup lease is unavailable');
      await configure('Fetch.enable', {
        patterns: requestsEnabled ? [requestPattern, documentResponsePattern] : [documentResponsePattern],
      }, preservedDebugger);
      if (requestsEnabled) this.configuredRequestsByTab.add(tabId);
      else this.configuredRequestsByTab.delete(tabId);
    });
    this.configurationByTab.set(tabId, configuration);
    configuration.finally(() => {
      if (this.configurationByTab.get(tabId) === configuration) this.configurationByTab.delete(tabId);
    }).catch(() => {});
    return this.track(tabId, configuration);
  }

  async handleRequest(tabId, request) {
    let resolution = 'blocked';
    try {
      if (!this.closing) {
        const interceptors = this.requestInterceptorsByTab.get(tabId) ?? [];
        for (const { interceptor } of [...interceptors]) {
          let decision;
          try { decision = await interceptor(request); } catch { decision = 'block'; }
          if (this.closing) decision = 'block';
          if (decision === 'handled') {
            resolution = 'handled';
            return;
          }
          if (decision === 'block') {
            await this.cdp.call(tabId, 'Fetch.failRequest', {
              requestId: request.requestId, errorReason: 'BlockedByClient',
            }, preservedDebugger);
            this.releaseRequest(tabId, request.requestId);
            return;
          }
        }
      }
      if (this.closing) {
        await this.cdp.call(tabId, 'Fetch.failRequest', {
          requestId: request.requestId, errorReason: 'BlockedByClient',
        }, preservedDebugger);
      } else {
        await this.cdp.call(tabId, 'Fetch.continueRequest', { requestId: request.requestId }, preservedDebugger);
        resolution = 'released';
      }
      this.releaseRequest(tabId, request.requestId);
    } finally {
      this.emit('requestResolution', tabId, request, resolution);
    }
  }

  release(tabId, requestId) {
    const owned = this.ownedResponsesByTab.get(tabId);
    if (owned == null) return;
    owned.delete(requestId);
    if (owned.size === 0) this.ownedResponsesByTab.delete(tabId);
  }

  // For an interceptor returning 'handled', its actual CDP operation must
  // finish before the external owner explicitly releases its pause here.
  releaseRequest(tabId, requestId) {
    const owned = this.ownedRequestsByTab.get(tabId);
    if (owned == null) return;
    owned.delete(requestId);
    if (owned.size === 0) this.ownedRequestsByTab.delete(tabId);
  }

  async drain(tabId) {
    for (;;) {
      const pending = tabId == null ? [...this.inFlightByTab.values()].flatMap(set => [...set])
        : [...(this.inFlightByTab.get(tabId) ?? [])];
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }

  async waitForIdle(tabId) {
    if (tabId != null) requireTabId(tabId);
    await this.drain(tabId);
    if (tabId == null ? this.failedOperationsByTab.size !== 0 : this.failedOperationsByTab.has(tabId)) {
      throw new Error('Browser auth document request containment has a failed operation');
    }
  }

  dispose() {
    if (this.disposePromise == null) {
      const disposal = this.disposeResources();
      this.disposePromise = disposal;
      disposal.catch(() => { if (this.disposePromise === disposal) this.disposePromise = undefined; });
    }
    return this.disposePromise;
  }

  async disposeResources() {
    if (this.disposed) return;
    this.closing = true;
    this.removeAttachHandler();
    await this.drain();
    const tabs = new Set([...this.cleanupByTab.keys(), ...this.managedTabIds, ...this.setupByTab.keys(), ...this.configuredRequestsByTab,
      ...this.ownedResponsesByTab.keys(), ...this.ownedRequestsByTab.keys()]);
    for (const tabId of tabs) {
      if (this.cleanupByTab.has(tabId)) { await this.cleanupTab(tabId); continue; }
      if (!this.cdp.isTabAttached(tabId)) continue;
      for (;;) {
        await this.drain(tabId);
        const owned = new Set([...(this.ownedResponsesByTab.get(tabId) ?? []), ...(this.ownedRequestsByTab.get(tabId) ?? [])]);
        if (owned.size === 0) break;
        for (const requestId of owned) await this.failResponse(tabId, requestId);
      }
      // Fetch.disable is allowed only after delivered pauses are settled.
      // Callers must finish/quiesce all credential actions before disposal.
      await this.cdp.call(tabId, 'Fetch.disable', {}, preservedDebugger);
    }
    await this.drain();
    this.cdp.removeListener('event', this.onEvent);
    this.cdp.removeListener('tabDetached', this.onTabDetached);
    this.ownedResponsesByTab.clear();
    this.ownedRequestsByTab.clear();
    this.setupByTab.clear();
    this.requestInterceptorsByTab.clear();
    this.configurationByTab.clear();
    this.configuredRequestsByTab.clear();
    this.managedTabIds.clear();
    this.failedOperationsByTab.clear();
    this.disposed = true;
  }
}
