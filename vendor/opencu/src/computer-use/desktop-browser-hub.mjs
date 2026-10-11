import { EventEmitter } from 'node:events';

const BROWSER_ID = 'desktop-browser';
const REQUEST_TIMEOUT_MS = 10000;
const CLEANUP_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 300000;
const releaseMethods = new Set(['detach', 'stop-actor', 'stop']);
const isRelease = (method, params) => method === 'tabs.cancelCreate' || releaseMethods.has(method) && params?.tabId !== undefined && typeof params?.leaseId === 'string';
const asError = value => value instanceof Error ? value : new Error(String(value));
const clone = value => structuredClone(value);
const disconnected = (browserId, epoch, cause) => Object.assign(new Error('Desktop browser disconnected; select a fresh browser connection'), {
  code: 'EXTENSION_DISCONNECTED', browserId, epoch,
  ...(cause ? { cause, ...(cause.hostClosing === true ? { hostClosing: true } : {}), ...(typeof cause.released === 'boolean' ? { released: cause.released } : {}),
    ...(cause.providerClosed === true && cause.releaseProof?.epoch === epoch && cause.releaseProof.released === true && cause.releaseProof.providerClosed === true ? { providerClosed: true, releaseProof: clone(cause.releaseProof) } : {}),
    ...(Number.isSafeInteger(cause.cdpCode) ? { cdpCode: cause.cdpCode } : {}) } : {}),
});
const changed = (browserId, epoch, currentEpoch) => Object.assign(new Error('Desktop browser connection changed; select a fresh browser connection'), {
  code: 'EXTENSION_CONNECTION_CHANGED', browserId, epoch, currentEpoch,
});
const releaseFailure = (error, cleanup, connection) => Object.assign(new AggregateError([error, cleanup], error.message + '; cleanup failed: ' + cleanup.message), {
  code: 'INPUT_RELEASE_FAILED', released: false, browserId: connection.info.id, epoch: connection.epoch,
  ...(error.hostClosing === true || cleanup.hostClosing === true ? { hostClosing: true } : {}),
});

// The Desktop service owns its WebContentsViews and debugger sessions. This hub
// only adapts that scoped transport to the existing leased browser/CDP backend.
export class DesktopBrowserHub extends EventEmitter {
  constructor(service) {
    super();
    this.service = service;
    this.connection = null;
    this.unsubscribe = null;
    this.startController = null;
    this.starting = false;
    this.closed = false;
    this.loss = null;
    this.observedEpoch = undefined;
    this.hostClosing = false;
    this.hostClosingError = null;
    this.releasePromise = null;
    this.releaseProof = null;
    this.releaseWatch = null;
    this.serviceTerminated = false;
  }

  async start() {
    if (this.closed) throw this.loss ?? disconnected(BROWSER_ID);
    if (this.starting || this.connection) throw new Error('Desktop browser hub already started');
    this.starting = true;
    const controller = new AbortController();
    this.startController = controller;
    try {
      if (this.service?.version !== 1 || typeof this.service.request !== 'function' || typeof this.service.subscribe !== 'function') {
        throw Object.assign(new Error('The OpenCU browser requires its version 1 companion service'), { code: 'UNSUPPORTED_PROTOCOL' });
      }
      this.unsubscribe = this.service.subscribe(event => this.receive(event), error => this.serviceClosed(asError(error)));
      if (typeof this.unsubscribe !== 'function') throw Object.assign(new Error('Desktop browser service did not return a subscription disposer'), { code: 'UNSUPPORTED_PROTOCOL' });
      if (this.closed) { this.unsubscribe(); this.unsubscribe = null; throw this.loss; }
      const value = await this.service.request('browser.info', {}, { signal: controller.signal, timeoutMs: REQUEST_TIMEOUT_MS });
      if (this.closed) throw this.loss;
      const epoch = this.service.epoch;
      if (typeof epoch !== 'string' || !epoch || this.observedEpoch !== undefined && this.observedEpoch !== epoch) {
        throw Object.assign(new Error('Desktop browser service did not establish a stable Host generation'), { code: 'INVALID_RESPONSE' });
      }
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== BROWSER_ID || value.type !== 'iab'
        || typeof value.name !== 'string' || !value.name.trim() || typeof value.userAgent !== 'string' || !value.userAgent
        || !value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata) || value.metadata.backend !== 'desktop'
        || !Array.isArray(value.capabilities) || value.capabilities.some(capability => typeof capability !== 'string' || !capability)) {
        throw Object.assign(new Error('Desktop browser service returned invalid browser information'), { code: 'INVALID_RESPONSE' });
      }
      const info = { ...clone(value), epoch };
      this.connection = { info, epoch, pending: new Set(), cancelling: new Map() };
      this.watchRelease(this.connection);
      this.emit('connected', clone(info));
      return this;
    } catch (error) {
      this.invalidate(asError(error));
      throw error;
    } finally {
      this.starting = false;
      if (this.startController === controller) this.startController = null;
    }
  }

  list() {
    const connection = this.connection;
    if (this.closed || !connection) return [];
    if (this.service.epoch !== connection.epoch) {
      this.invalidate(changed(connection.info.id, connection.epoch, this.service.epoch));
      return [];
    }
    return [clone(connection.info)];
  }

  assertCurrent(connection) {
    if (this.closed || this.connection !== connection) throw this.loss ?? disconnected(connection.info.id, connection.epoch);
    if (this.service.epoch !== connection.epoch) {
      const error = changed(connection.info.id, connection.epoch, this.service.epoch);
      this.invalidate(error);
      throw error;
    }
  }

  closingError(cause) {
    this.hostClosing = this.hostClosing || cause?.hostClosing === true || this.service.hostClosing === true;
    if (this.hostClosing) this.hostClosingError ??= cause?.hostClosing === true ? cause : Object.assign(new Error('Desktop browser Host is shutting down'), { code: 'HOST_CLOSING', hostClosing: true });
    return this.hostClosingError ?? cause;
  }

  confirmedRelease(connection) {
    return this.releaseProof?.epoch === connection.epoch && this.releaseProof.released === true && this.releaseProof.providerClosed === true;
  }

  acceptRelease(connection, proof, cause) {
    if (!proof || proof.epoch !== connection.epoch || this.service.epoch !== connection.epoch || proof.released !== true || proof.providerClosed !== true) {
      throw Object.assign(new Error('Desktop browser service returned invalid provider release proof'), { code: 'INPUT_RELEASE_FAILED', released: false });
    }
    this.releaseProof = clone(proof);
    this.closingError(cause);
    const error = Object.assign(new Error(cause?.message ?? 'Desktop browser provider closed'), {
      code: cause?.code ?? 'DISPOSED', released: true, providerClosed: true, releaseProof: clone(proof),
      ...(this.hostClosing ? { hostClosing: true } : {}),
    });
    this.invalidate(error);
    return this.releaseProof;
  }

  watchRelease(connection) {
    if (typeof this.service.waitForRelease !== 'function') return;
    const token = { epoch: connection.epoch };
    this.releaseWatch = token;
    // A disposed consumer must not stay alive solely because the provider's
    // passive release waiter is shared by the longer-lived Desktop service.
    const reference = new WeakRef(this);
    Promise.resolve(this.service.waitForRelease()).then(proof => {
      const hub = reference.deref();
      if (!hub || hub.closed || hub.releaseWatch !== token || hub.connection?.epoch !== token.epoch) return;
      try { hub.acceptRelease(hub.connection, proof); }
      catch (error) { hub.invalidate(asError(error)); }
    }, () => {
      queueMicrotask(() => {
        const hub = reference.deref();
        if (!hub || hub.closed || hub.serviceTerminated || hub.releaseWatch !== token || hub.connection?.epoch !== token.epoch) return;
        // Failed disposal leaves the channel live. Keep observing the next
        // real proof without issuing another provider disposal request.
        hub.watchRelease(hub.connection);
      });
    });
  }

  waitForRelease(connection, cause) {
    this.closingError(cause);
    if (this.confirmedRelease(connection)) return Promise.resolve(this.releaseProof);
    if (this.releasePromise) return this.releasePromise;
    const pending = Promise.resolve().then(async () => {
      if (typeof this.service.waitForRelease !== 'function') throw Object.assign(new Error('Desktop browser service cannot confirm provider release'), { code: 'INPUT_RELEASE_FAILED', released: false });
      // This is a passive waiter. Only the Host or the service's owning scope
      // may dispose the provider; a Hub close never requests global release.
      return this.acceptRelease(connection, await this.service.waitForRelease(), cause);
    });
    this.releasePromise = pending;
    void pending.finally(() => { if (this.releasePromise === pending) this.releasePromise = null; }).catch(() => {});
    return pending;
  }

  serviceClosed(error) {
    if (this.closed) return;
    this.serviceTerminated = true;
    const connection = this.connection;
    if (connection && (error.hostClosing === true || error.released === true || this.service.hostClosing === true || this.service.released === true)) {
      void this.waitForRelease(connection, error).catch(failure => this.invalidate(releaseFailure(error, asError(failure), connection)));
    } else this.invalidate(error);
  }

  receive(event) {
    if (this.closed) return;
    if (!event || typeof event !== 'object' || typeof event.event !== 'string' || typeof event.epoch !== 'string') {
      this.invalidate(Object.assign(new Error('Desktop browser service returned an invalid event'), { code: 'INVALID_RESPONSE' }));
      return;
    }
    const connection = this.connection;
    if (!connection) {
      if (this.observedEpoch !== undefined && this.observedEpoch !== event.epoch
        || this.service.epoch !== undefined && this.service.epoch !== event.epoch) {
        this.invalidate(changed(BROWSER_ID, this.observedEpoch ?? this.service.epoch, event.epoch));
      } else this.observedEpoch = event.epoch;
      return;
    }
    if (event.epoch !== connection.epoch || this.service.epoch !== connection.epoch) {
      this.invalidate(changed(connection.info.id, connection.epoch, event.epoch !== connection.epoch ? event.epoch : this.service.epoch));
      return;
    }
    this.emit('event', { browser: connection.info.id, epoch: connection.epoch, event: event.event, params: clone(event.params) });
  }

  call(browserId, method, params = {}, { signal, timeoutMs = releaseMethods.has(method) || method === 'tabs.cancelCreate' ? CLEANUP_TIMEOUT_MS : REQUEST_TIMEOUT_MS, epoch, trustedUserAction = false, trustedAgentLifecycle = false } = {}) {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
      return Promise.reject(new Error('Desktop browser timeout must be a positive integer at most ' + MAX_TIMEOUT_MS));
    }
    const connection = this.connection;
    if (this.closed || !connection || browserId !== connection.info.id) return Promise.reject(this.loss ?? disconnected(browserId, epoch));
    if (epoch !== undefined && epoch !== connection.epoch) return Promise.reject(changed(browserId, epoch, connection.epoch));
    try {
      this.assertCurrent(connection);
      // Match the extension wire's JSON semantics, including omitted optional
      // fields, before handing parameters to the JSON-only Desktop service.
      params = JSON.parse(JSON.stringify(params));
    } catch (error) { return Promise.reject(error); }
    if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
      if (isRelease(method, params)) return this.dispatch(connection, method, params, { signal, timeoutMs });
      const error = this.closingError() ?? disconnected(browserId, connection.epoch);
      void this.waitForRelease(connection, error).catch(() => {});
      return Promise.reject(error);
    }
    return this.dispatch(connection, method, params, { signal, timeoutMs, trustedUserAction, trustedAgentLifecycle });
  }

  dispatch(connection, method, params, { signal, timeoutMs, trustedUserAction = false, trustedAgentLifecycle = false }, cleanupOnly = false) {
    return new Promise((resolve, reject) => {
      let phase = 'pending';
      let cancellation;
      const controller = new AbortController();
      const stopWatching = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
      const finish = (error, result) => {
        if (phase === 'settled') return;
        phase = 'settled';
        stopWatching();
        connection.pending.delete(record);
        if (error) reject(error); else resolve(result);
      };
      const cancel = error => {
        if (phase !== 'pending') return;
        phase = 'cleaning';
        cancellation = error;
        stopWatching();
        controller.abort(error);
        if (cleanupOnly) {
          if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
            void this.waitForRelease(connection, error).then(() => finish(null, { released: true }), failure => finish(releaseFailure(error, asError(failure), connection)));
          } else finish(error);
          return;
        }
        void this.releaseCancelled(connection, method, params).then(
          () => finish(error),
          cleanup => finish(releaseFailure(error, asError(cleanup), connection)),
        );
      };
      const aborted = () => cancel(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? 'Desktop browser operation cancelled')));
      const timer = setTimeout(() => cancel(Object.assign(new Error('Desktop browser operation timed out: ' + method), {
        code: 'EXTENSION_REQUEST_TIMEOUT', browserId: connection.info.id, epoch: connection.epoch, method,
      })), timeoutMs);
      timer.unref();
      const record = {
        disconnect: error => {
          controller.abort(error);
          if (this.confirmedRelease(connection)) {
            if (cancellation && !cleanupOnly) finish(cancellation);
            else if (cleanupOnly || isRelease(method, params)) finish(null, { released: true });
            else finish(error);
          } else finish(cancellation && !cleanupOnly ? releaseFailure(cancellation, error, connection) : error);
        },
      };
      connection.pending.add(record);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      const failed = value => {
        if (phase !== 'pending') return;
        const error = asError(value);
        try { this.assertCurrent(connection); }
        catch (connectionError) { finish(connectionError); return; }
        if (error.hostClosing === true || this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
          this.closingError(error);
          if (cleanupOnly || isRelease(method, params)) {
            phase = 'waiting-release';
            stopWatching();
            void this.waitForRelease(connection, error).then(() => finish(null, { released: true }), failure => finish(releaseFailure(error, asError(failure), connection)));
          } else {
            finish(error);
            void this.waitForRelease(connection, error).catch(() => {});
          }
          return;
        }
        if (error.code === 'ABORTED' || error.code === 'TIMEOUT') cancel(error);
        else finish(error);
      };
      try {
        this.assertCurrent(connection);
        if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
          failed(this.closingError() ?? disconnected(connection.info.id, connection.epoch));
          return;
        }
        Promise.resolve(this.service.request(method, params, { signal: controller.signal, timeoutMs, trustedUserAction: trustedUserAction === true, trustedAgentLifecycle: trustedAgentLifecycle === true })).then(result => {
          if (phase !== 'pending') return;
          try { this.assertCurrent(connection); }
          catch (error) { finish(error); return; }
          if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
            if (cleanupOnly || isRelease(method, params)) {
              if (result?.released === true) { finish(null, result); return; }
            }
            failed(this.closingError() ?? disconnected(connection.info.id, connection.epoch));
            return;
          }
          finish(null, result);
        }, failed);
      } catch (error) { failed(error); }
    });
  }

  async releaseCancelled(connection, method, params) {
    let cleanupMethod, cleanupParams, key;
    if (method === 'tabs.create' || method === 'tabs.cancelCreate') {
      cleanupMethod = 'tabs.cancelCreate';
      cleanupParams = { creationId: params.creationId };
      key = JSON.stringify([cleanupMethod, params.creationId]);
    } else if (releaseMethods.has(method)) {
      cleanupMethod = method;
      cleanupParams = method === 'stop' && params.tabId === undefined ? {} : {
        tabId: params.tabId, leaseId: params.leaseId, ...(method === 'stop-actor' ? { actorId: params.actorId } : {}),
      };
      key = JSON.stringify([cleanupMethod, params.tabId, params.leaseId, params.actorId ?? null]);
    } else if (method !== 'cursor' && params.leaseId && params.tabId !== undefined) {
      cleanupMethod = params.actorId ? 'stop-actor' : 'detach';
      cleanupParams = { tabId: params.tabId, leaseId: params.leaseId, ...(params.actorId ? { actorId: params.actorId } : {}) };
      key = JSON.stringify([cleanupMethod, params.tabId, params.leaseId, params.actorId ?? null]);
    } else return;
    if (this.confirmedRelease(connection)) return;
    if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
      await this.waitForRelease(connection, this.hostClosingError);
      return;
    }
    this.assertCurrent(connection);
    if (connection.cancelling.has(key)) return connection.cancelling.get(key);
    const pending = Promise.resolve().then(async () => {
      if (this.confirmedRelease(connection)) return;
      if (this.hostClosing || this.service.hostClosing === true || this.service.released === true) {
        await this.waitForRelease(connection, this.hostClosingError);
        return;
      }
      this.assertCurrent(connection);
      const result = await this.dispatch(connection, cleanupMethod, cleanupParams, { timeoutMs: CLEANUP_TIMEOUT_MS }, true);
      if (!this.confirmedRelease(connection)) this.assertCurrent(connection);
      if (result?.released !== true) throw Object.assign(new Error('Desktop browser input or tab creation release was not confirmed'), { code: 'INPUT_RELEASE_FAILED', released: false });
    });
    connection.cancelling.set(key, pending);
    void pending.finally(() => { if (connection.cancelling.get(key) === pending) connection.cancelling.delete(key); }).catch(() => {});
    return pending;
  }

  invalidate(cause) {
    if (this.closed) return;
    this.closed = true;
    this.releaseWatch = null;
    const connection = this.connection;
    this.connection = null;
    this.loss = disconnected(connection?.info.id ?? BROWSER_ID, connection?.epoch, cause);
    this.startController?.abort(this.loss);
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = null;
    unsubscribe?.();
    if (connection) {
      for (const pending of connection.pending) pending.disconnect(this.loss);
      connection.pending.clear();
      connection.cancelling.clear();
      this.emit('disconnected', clone(connection.info), this.loss);
    }
  }

  async close() {
    if (!this.closed && this.connection && this.service.released === true) {
      await this.waitForRelease(this.connection);
      return;
    }
    this.invalidate(Object.assign(new Error('Desktop browser hub closed'), { code: 'DISPOSED' }));
  }
}
