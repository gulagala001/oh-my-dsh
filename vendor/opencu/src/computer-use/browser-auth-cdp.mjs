import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// Source: browser-service.mjs CDP authentication protection, offsets
// 777266-780359. The host owns the raw diagnostics and native containment.
const adapters = new WeakMap();
const failure = (code = 'BROWSER_AUTH_CDP_UNAVAILABLE') => Object.assign(
  new Error('Browser authentication CDP binding or protection is unavailable'), { code },
);
const numericTabId = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0;
const identity = value => JSON.stringify([
  value.tabId, value.leaseId, value.actorId, value.epoch, value.rootTargetId,
]);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const settled = value => value != null && typeof value.then === 'function';

function requireDisposer(value) {
  if (typeof value !== 'function') throw failure('BROWSER_AUTH_PROTECTION_UNCONFIRMED');
  return value;
}

function validateBinding(value) {
  if (!object(value) || !numericTabId(value.tabId)
    || !['leaseId', 'actorId', 'epoch', 'rootTargetId'].every(key => text(value[key]))) throw failure();
  return value;
}

/** Native IDs never come from the public OpenCU tab identifier. */
export function resolveBrowserAuthTabId({ browser, record, root } = {}) {
  if (!browser || !record) throw failure();
  const known = browser.records?.get(record.id);
  const candidates = [root?.tabId, record.nativeTabId, known?.nativeTabId]
    .filter(value => value !== undefined);
  if (candidates.length === 0 || candidates.some(value => !numericTabId(value))
    || candidates.some(value => value !== candidates[0])) throw failure();
  if (known == null || known.id !== record.id) throw failure();
  return candidates[0];
}

function callOptions(options, actorSignal) {
  if (!object(options)) throw failure('INVALID_BROWSER_AUTH_CDP_OPTIONS');
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0
    || options.deadlineMs !== undefined && !Number.isFinite(options.deadlineMs)) throw failure('INVALID_BROWSER_AUTH_CDP_OPTIONS');
  const remaining = options.deadlineMs === undefined ? timeoutMs
    : Math.min(timeoutMs, options.deadlineMs - Date.now());
  if (remaining <= 0) throw failure('BROWSER_AUTH_CDP_TIMEOUT');
  const signals = [actorSignal, options.signal].filter(Boolean);
  const signal = signals.length === 0 ? undefined : AbortSignal.any(signals);
  if (signal?.aborted) throw failure('BROWSER_AUTH_CDP_ABORTED');
  return { ...options, timeoutMs: remaining, signal };
}

/** One stable object serves the gate and every registered tab in a browser. */
export class BrowserAuthCdpRegistryAdapter extends EventEmitter {
  #browser;
  #records = new Map();
  #byRecord = new WeakMap();
  #registrations = new WeakMap();
  #attachHandlers = new Set();
  #retainedStates = new Set();
  #closed = false;
  #containment;

  constructor({ browser, containment } = {}) {
    super();
    if (browser == null || !['object', 'function'].includes(typeof browser)) throw failure();
    this.#browser = browser;
    this.#containment = containment;
  }

  async registerRecord(record, { signal, containment } = {}) {
    signal?.throwIfAborted();
    if (this.#closed || !record) throw failure();
    const existing = this.#byRecord.get(record);
    if (existing) {
      this.#assert(existing);
      if (containment !== undefined) existing.containment = containment;
      return existing.tabId;
    }
    const pending = this.#registrations.get(record);
    if (pending) return await pending;
    const registration = this.#register(record, { signal, containment });
    this.#registrations.set(record, registration);
    try { return await registration; }
    finally { if (this.#registrations.get(record) === registration) this.#registrations.delete(record); }
  }

  async #register(record, { signal, containment }) {
    const browser = this.#browser;
    let linkState, inspect;
    if (typeof browser.existingLink === 'function') {
      linkState = await browser.existingLink(record.sessionId, record.id, signal);
      if (linkState.record !== record) throw failure();
      inspect = () => {
        linkState.assertBinding();
        if (record.assertFileAccess?.() !== true) throw failure();
        const { gateway, link, nativeTabId } = linkState;
        const actor = gateway.actor(link.clientId);
        const root = gateway.native.get('');
        if (!root || root.info.targetId !== gateway.targetInfo?.targetId) throw failure();
        return validateBinding({ tabId: nativeTabId, leaseId: gateway.leaseId,
          actorId: link.clientId, epoch: gateway.epoch, rootTargetId: root.info.targetId,
          actorSignal: actor.controller.signal });
      };
    } else {
      // Other hosts must inject a synchronous, live ownership proof. Merely
      // supplying an opaque target or a cached page is insufficient.
      const proof = record.browserAuthBinding;
      if (!object(proof) || typeof proof.inspect !== 'function') throw failure();
      inspect = () => {
        const current = proof.inspect();
        if (settled(current) || record.assertFileAccess?.() !== true) throw failure();
        return validateBinding(current);
      };
    }
    signal?.throwIfAborted();
    const adapter = await record.capabilityAdapter;
    if (typeof adapter?.resolveTarget !== 'function') throw failure();
    const root = await adapter.resolveTarget();
    const binding = inspect();
    const tabId = resolveBrowserAuthTabId({ browser, record, root: { ...root, tabId: binding.tabId } });
    if (root?.targetId !== binding.rootTargetId || root.type !== 'page'
      || root.tabId !== undefined && root.tabId !== binding.tabId) throw failure();
    const previous = this.#records.get(tabId);
    if (previous) {
      this.#assert(previous);
      throw failure('BROWSER_AUTH_TAB_ALREADY_REGISTERED');
    }
    const gateway = linkState?.gateway;
    const channel = gateway ?? record.transport;
    if (typeof channel?.subscribeBrowserAuthEvents !== 'function') throw failure();
    if (typeof channel?.sendBrowserAuthCommand !== 'function') throw failure();
    const state = { record, tabId, binding, inspect, adapter, gateway, channel,
      rootSessionId: root.sessionId, containment: containment ?? this.#containment,
      active: true, attached: false, protections: new Set(), leases: new Map(), diagnosticProtection: false };
    this.#records.set(tabId, state);
    this.#byRecord.set(record, state);
    this.#retainedStates.add(state);
    try {
      const closed = () => this.#detach(state);
      record.page.once('close', closed);
      state.removePageListener = () => record.page.removeListener('close', closed);
      state.unsubscribe = requireDisposer(channel.subscribeBrowserAuthEvents(binding.actorId,
        event => this.#receive(state, event), () => this.#detach(state)));
      if (!state.active) {
        state.unsubscribe();
        throw failure();
      }
      this.#assert(state);
      // The tab is usable by handlers, but registration resolves only after
      // their actual Fetch/domain setup has completed.
      for (const handler of this.#attachHandlers) {
        await handler(tabId, { signal });
        this.#assert(state);
        signal?.throwIfAborted();
      }
      state.attached = true;
      this.emit('tabAttached', tabId);
      return tabId;
    } catch {
      this.#detach(state);
      throw failure();
    }
  }

  #assert(state) {
    if (this.#closed || !state?.active || this.#records.get(state.tabId) !== state
      || this.#byRecord.get(state.record) !== state || state.record.page.isClosed()) throw failure();
    let current;
    try { current = state.inspect(); }
    catch { throw failure(); }
    if (identity(current) !== identity(state.binding)) throw failure('BROWSER_AUTH_BINDING_CHANGED');
    if (current.actorSignal?.aborted) throw failure('BROWSER_AUTH_CDP_ABORTED');
    if (this.#browser.info?.epoch !== undefined && this.#browser.info.epoch !== current.epoch) throw failure();
    return current;
  }

  #state(tabId) {
    if (!numericTabId(tabId)) throw failure('INVALID_BROWSER_AUTH_TAB_ID');
    const state = this.#records.get(tabId);
    this.#assert(state);
    return state;
  }

  #binding(state) {
    return { ...this.#assert(state), record: state.record, browser: this.#browser,
      ...(state.rootSessionId ? { rootSessionId: state.rootSessionId } : {}) };
  }

  #target(state, target) {
    if (target == null) return undefined;
    if (!object(target) || Object.keys(target).some(key => !['tabId', 'sessionId', 'targetId'].includes(key))
      || target.tabId !== undefined && target.tabId !== state.tabId) throw failure('INVALID_BROWSER_AUTH_CDP_TARGET');
    const { sessionId, targetId } = target;
    if (sessionId === undefined && targetId === undefined) return undefined;
    if (sessionId !== undefined && !text(sessionId) || targetId !== undefined && !text(targetId)) throw failure();
    if (targetId === state.binding.rootTargetId
      || sessionId !== undefined && sessionId === state.rootSessionId) {
      if (targetId !== undefined && targetId !== state.binding.rootTargetId
        || sessionId !== undefined && sessionId !== state.rootSessionId) throw failure();
      return undefined;
    }
    if (state.gateway) {
      const actor = state.gateway.actor(state.binding.actorId);
      const logical = sessionId === undefined ? undefined : actor.sessions.get(sessionId);
      const nativeId = logical && !logical.browser ? logical.nativeId : sessionId;
      const native = nativeId === undefined ? [...state.gateway.native.values()].find(value => value.info.targetId === targetId)
        : state.gateway.native.get(nativeId);
      if (!native?.id || targetId !== undefined && targetId !== native.info.targetId) throw failure('BROWSER_AUTH_CHILD_TARGET_UNAVAILABLE');
      return { sessionId: native.id, targetId: native.info.targetId };
    }
    const selected = sessionId !== undefined ? { sessionId } : { targetId };
    const resolved = state.adapter.resolveTarget(selected);
    if (settled(resolved) || !resolved || resolved.sessionId === state.rootSessionId
      || resolved.targetId === state.binding.rootTargetId || !text(resolved.sessionId)
      || targetId !== undefined && targetId !== resolved.targetId) throw failure();
    return { sessionId: resolved.sessionId, targetId: resolved.targetId };
  }

  async call(tabId, method, params = {}, options = {}) {
    const state = this.#state(tabId);
    if (!text(method) || !/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(method)
      || params !== undefined && !object(params)) throw failure('INVALID_BROWSER_AUTH_CDP_COMMAND');
    const binding = this.#binding(state);
    const configured = callOptions(options, binding.actorSignal);
    const target = this.#target(state, options.target);
    if (method === 'Target.getTargets') {
      if (target) throw failure();
      const lease = [...state.leases.values()].reverse().find(value => value.kind === 'target');
      const result = await this.#native(state, 'browser.authNewTargetProtection', {
        action: 'inspect', ...(lease ? { protectionId: lease.protectionId } : {}),
      }, configured);
      if (!Array.isArray(result?.targetInfos) || result.targetInfos.some(info => !text(info?.targetId))) throw failure();
      return { targetInfos: result.targetInfos };
    }
    try {
      const result = await state.channel.sendBrowserAuthCommand(binding, method, params ?? {},
        { ...configured, ...(target ? { target: { sessionId: target.sessionId } } : {}) });
      this.#assert(state);
      configured.signal?.throwIfAborted();
      if (target) {
        const current = this.#target(state, target);
        if (current?.sessionId !== target.sessionId || current?.targetId !== target.targetId) throw failure();
      }
      if (method === 'Page.getFrameTree') {
        const frame = result?.frameTree?.frame;
        if (!text(frame?.id) || typeof frame.url !== 'string'
          || frame.loaderId !== undefined && !text(frame.loaderId)) throw failure();
        if (!target) {
          if (state.frameId !== undefined && state.frameId !== frame.id) throw failure('BROWSER_AUTH_FRAME_CHANGED');
          state.frameId = frame.id;
        }
      }
      return result;
    } catch {
      throw failure('BROWSER_AUTH_CDP_COMMAND_FAILED');
    }
  }

  #receive(state, event) {
    if (!state.active) return;
    try {
      this.#assert(state);
      if (!object(event) || !text(event.method) || !object(event.params ?? {}) || !object(event.source)) throw failure();
      if (event.source.tabId !== undefined && event.source.tabId !== state.tabId) throw failure();
      const source = { tabId: state.tabId };
      const incomingSession = event.source.sessionId;
      const incomingTarget = event.source.targetId;
      const root = incomingSession == null || incomingSession === state.rootSessionId;
      if (root) {
        if (incomingTarget != null && incomingTarget !== state.binding.rootTargetId) throw failure();
      } else {
        const child = this.#target(state, { sessionId: incomingSession,
          ...(incomingTarget == null ? {} : { targetId: incomingTarget }) });
        if (!child) throw failure();
        source.sessionId = child.sessionId;
        source.targetId = child.targetId;
      }
      const normalized = { method: event.method, params: event.params ?? {}, source,
        ...(text(event.trackedTargetId) ? { trackedTargetId: event.trackedTargetId } : {}),
        ...(event.topLevel === true ? { topLevel: true } : {}) };
      this.emit('event', normalized);
    } catch {
      this.#detach(state);
    }
  }

  isTabAttached(tabId) {
    try { this.#state(tabId); return true; } catch { return false; }
  }

  addTabAttachHandler(handler) {
    if (this.#closed || typeof handler !== 'function') throw failure();
    this.#attachHandlers.add(handler);
    return () => this.#attachHandlers.delete(handler);
  }

  waitForEvent(tabId, predicate, options = {}) {
    const state = this.#state(tabId);
    if (typeof predicate !== 'function') throw failure();
    const configured = callOptions(options, state.binding.actorSignal);
    return new Promise((resolve, reject) => {
      let timer, finished = false;
      const finish = (error, event) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.removeListener('event', receive);
        this.removeListener('tabDetached', detached);
        configured.signal?.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve(event);
      };
      const receive = event => {
        if (event.source.tabId !== tabId) return;
        try { this.#assert(state); if (predicate(event)) finish(undefined, event); }
        catch { finish(failure()); }
      };
      const detached = detachedTabId => { if (detachedTabId === tabId) finish(failure()); };
      const aborted = () => finish(failure('BROWSER_AUTH_CDP_ABORTED'));
      this.on('event', receive);
      this.on('tabDetached', detached);
      configured.signal?.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => finish(failure('BROWSER_AUTH_CDP_TIMEOUT')), configured.timeoutMs);
      if (configured.signal?.aborted) aborted();
    });
  }

  #controls(state) {
    const controls = state.gateway?.browserAuthControls ?? state.record.browserAuthControls
      ?? state.record.transport?.browserAuthControls;
    if (!object(controls)) throw failure('BROWSER_AUTH_TRANSPORT_CONTROLS_REQUIRED');
    return controls;
  }
  acquireCleanup(tabId) {
    const state = this.#state(tabId);
    if (typeof state.channel.acquireBrowserAuthCleanup !== 'function') throw failure('BROWSER_AUTH_CLEANUP_LEASE_REQUIRED');
    const lease = state.channel.acquireBrowserAuthCleanup(this.#binding(state));
    if (!lease || typeof lease.call !== 'function' || typeof lease.release !== 'function' || typeof lease.onClose !== 'function' || typeof lease.requestIds !== 'function') throw failure('BROWSER_AUTH_CLEANUP_LEASE_REQUIRED');
    return lease;
  }

  #trackProtection(state, release, priority = 0) {
    requireDisposer(release);
    let released = false, pending;
    const undo = () => {
      if (released) return pending;
      if (pending) return pending;
      let result;
      try { result = release(); }
      catch (cause) { throw Object.assign(failure('BROWSER_AUTH_PROTECTION_RELEASE_FAILED'), { cause }); }
      if (!settled(result)) {
        released = true;
        state.protections.delete(undo);
        return result;
      }
      pending = Promise.resolve(result).then(value => {
        released = true;
        state.protections.delete(undo);
        return value;
      }, cause => {
        pending = undefined;
        throw Object.assign(failure('BROWSER_AUTH_PROTECTION_RELEASE_FAILED'), { cause });
      });
      return pending;
    };
    Object.defineProperty(undo, 'priority', { value: priority });
    state.protections.add(undo);
    return undo;
  }

  suppressRawNetworkEvents(tabId) {
    const state = this.#state(tabId), controls = this.#controls(state);
    if (typeof controls.suppressRawNetworkEvents !== 'function') throw failure('BROWSER_AUTH_TRANSPORT_CONTROLS_REQUIRED');
    const release = controls.suppressRawNetworkEvents(this.#binding(state));
    const undo = this.#trackProtection(state, release, 0);
    this.#assert(state);
    return undo;
  }

  protectBrowserAuthCredentialDiagnostics(tabId) {
    const state = this.#state(tabId), controls = this.#controls(state);
    if (state.diagnosticProtection) return;
    if (typeof controls.protectBrowserAuthCredentialDiagnostics !== 'function') throw failure('BROWSER_AUTH_TRANSPORT_CONTROLS_REQUIRED');
    const protectedValue = controls.protectBrowserAuthCredentialDiagnostics(this.#binding(state));
    if (protectedValue !== true && typeof protectedValue !== 'function') throw failure('BROWSER_AUTH_PROTECTION_UNCONFIRMED');
    if (typeof protectedValue === 'function') state.diagnosticRelease = protectedValue;
    state.diagnosticProtection = true;
    this.#assert(state);
  }

  async protectBrowserAuthServiceWorkerBypass(tabId) {
    const state = this.#state(tabId), controls = this.#controls(state);
    if (typeof controls.protectBrowserAuthServiceWorkerBypass !== 'function') throw failure('BROWSER_AUTH_TRANSPORT_CONTROLS_REQUIRED');
    const release = await controls.protectBrowserAuthServiceWorkerBypass(this.#binding(state));
    const undo = this.#trackProtection(state, release, 1);
    this.#assert(state);
    return undo;
  }

  async #native(state, method, params, options = {}) {
    const binding = this.#binding(state);
    const containment = state.containment;
    const operation = method === 'browser.authNewTargetProtection'
      ? containment?.browserAuthNewTargetProtection : containment?.browserAuthServiceWorkerProtection;
    const request = { tabId: binding.tabId, leaseId: binding.leaseId,
      actorId: binding.actorId, ...params };
    const configured = callOptions(options, binding.actorSignal);
    let result;
    try {
      if (typeof operation === 'function') result = await operation.call(containment, request, configured);
      else if (typeof containment?.request === 'function') result = await containment.request(method, request, configured);
      else if (typeof this.#browser.call === 'function' && state.gateway) result = await this.#browser.call(method, request, configured);
      else throw failure('BROWSER_AUTH_NATIVE_CONTAINMENT_REQUIRED');
      this.#assert(state);
      configured.signal?.throwIfAborted();
      return result;
    } catch {
      throw failure('BROWSER_AUTH_NATIVE_CONTAINMENT_UNCONFIRMED');
    }
  }

  async #acquireNativeProtection(state, kind) {
    const method = kind === 'target' ? 'browser.authNewTargetProtection' : 'browser.authServiceWorkerProtection';
    const protectionId = randomUUID();
    const before = (await this.call(state.tabId, 'Page.getFrameTree')).frameTree.frame;
    const lease = { kind, protectionId };
    // An uncertain acquire can still arm protection. Retain the token before
    // dispatch so cleanup can resolve that actual native lease.
    state.leases.set(protectionId, lease);
    const release = this.#trackProtection(state, async () => {
      const receipt = await this.#native(state, method, { action: 'release', protectionId });
      if (receipt?.released !== true) throw failure();
      state.leases.delete(protectionId);
    }, kind === 'worker' ? 3 : 2);
    try {
      const result = await this.#native(state, method, { action: 'acquire', protectionId });
      const after = (await this.call(state.tabId, 'Page.getFrameTree')).frameTree.frame;
      if (result?.protected !== true || result.protectionId !== protectionId
        || result.targetId !== state.binding.rootTargetId || result.frameId !== before.id
        || result.loaderId !== before.loaderId || after.id !== before.id || after.loaderId !== before.loaderId
        || !Number.isSafeInteger(result.documentGeneration) || result.documentGeneration < 0) throw failure();
      return release;
    } catch {
      await release();
      throw failure('BROWSER_AUTH_PROTECTION_UNCONFIRMED');
    }
  }

  protectBrowserAuthNewTargets(tabId) {
    return this.#acquireNativeProtection(this.#state(tabId), 'target');
  }

  protectNewTargets(tabId) { return this.protectBrowserAuthNewTargets(tabId); }

  protectServiceWorkerStarts(tabId) {
    return this.#acquireNativeProtection(this.#state(tabId), 'worker');
  }

  async browserAuthNewTargetCheck(tabId) {
    try {
      const state = this.#state(tabId);
      const lease = [...state.leases.values()].reverse().find(value => value.kind === 'target');
      const receipt = await this.#native(state, 'browser.authNewTargetProtection', {
        action: 'check', ...(lease ? { protectionId: lease.protectionId } : {}),
      });
      return receipt?.contained === true ? 'contained' : 'rejected';
    } catch { return 'error'; }
  }

  async closeBrowserAuthPausedTarget(tabId, targetId) {
    const state = this.#state(tabId);
    if (!text(targetId) || targetId === state.binding.rootTargetId) throw failure();
    const leases = [...state.leases.values()].filter(value => value.kind === 'target');
    if (leases.length === 0) throw failure('BROWSER_AUTH_NATIVE_CONTAINMENT_REQUIRED');
    for (const lease of leases) {
      const receipt = await this.#native(state, 'browser.authNewTargetProtection', {
        action: 'close', targetId, protectionId: lease.protectionId,
      });
      if (receipt?.closed === true) return true;
    }
    return false;
  }

  #detach(state) {
    if (!state.active) return;
    state.active = false;
    state.attached = false;
    if (this.#records.get(state.tabId) === state) this.#records.delete(state.tabId);
    try { state.unsubscribe?.(); } catch {}
    try { state.removePageListener?.(); } catch {}
    // Protections remain retained. A detached actor is not proof that native
    // leases or credential diagnostics may be restored.
    this.emit('tabDetached', state.tabId);
  }

  async unregisterRecord(record) {
    const state = this.#byRecord.get(record);
    if (!state) return;
    if (!state.active && state.gateway?.hasReleasedProvider?.() === true) {
      state.protections.clear();
      state.leases.clear();
    } else {
      // Keep raw diagnostics suppressed until every native lease and bypass
      // lock has actually been released. A failed release stops restoration.
      const releases = [...state.protections].sort((left, right) => right.priority - left.priority);
      for (const release of releases) await release();
    }
    this.#detach(state);
    this.#byRecord.delete(record);
    this.#retainedStates.delete(state);
  }

  async dispose() {
    if (this.#closed) return;
    for (const state of [...this.#retainedStates]) await this.unregisterRecord(state.record);
    this.#closed = true;
    this.#attachHandlers.clear();
    this.removeAllListeners();
    if (adapters.get(this.#browser) === this) adapters.delete(this.#browser);
  }
}

export async function createBrowserAuthCdpAdapter({ browser, record, signal, containment } = {}) {
  if (browser == null || !['object', 'function'].includes(typeof browser)) throw failure();
  let adapter = adapters.get(browser);
  if (!adapter) {
    adapter = new BrowserAuthCdpRegistryAdapter({ browser, containment });
    adapters.set(browser, adapter);
  }
  if (record !== undefined) await adapter.registerRecord(record, { signal, containment });
  return adapter;
}
