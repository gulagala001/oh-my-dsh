import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { viewportGeometry } from './browser-screenshot.mjs';
import { registerBrowserAuthDiagnosticsScope, suppressBrowserAuthDiagnostics, protectBrowserAuthCredentialDiagnostics } from './browser-network.mjs';

const browserAuthStates = new Map();
const browserAuthWriteAuthority = Symbol('browser-auth-write-authority');
function authEndpointKey(endpoint) {
  const url = new URL(endpoint);
  url.searchParams.delete('client');
  return url.href;
}
function authEndpointState(endpoint) {
  const key = authEndpointKey(endpoint);
  let state = browserAuthStates.get(key);
  if (!state) { state = { transports: new Set(), targets: new Map(), bindings: new Map(), observers: new Set() }; browserAuthStates.set(key, state); }
  return state;
}
function authTargetState(state, rootTargetId) {
  let target = state.targets.get(rootTargetId);
  if (!target) { target = { rawLeases: 0, diagnosticsProtected: false, writeOwners: new Set(), diagnosticsScope: {} }; state.targets.set(rootTargetId, target); }
  return target;
}

// The caller must prove its actual tab lease; the transport independently checks
// that the same root target is present on a live, owned protocol connection.
export function createBrowserTransportAuthProtection(endpoint, rootTargetId, assertOwnedSession) {
  const state = authEndpointState(endpoint);
  const verify = () => {
    if (typeof rootTargetId !== 'string' || !rootTargetId || typeof assertOwnedSession !== 'function' || assertOwnedSession() !== true
      || ![...state.transports].some(transport => !transport.closed && [...transport.sessions.values()].some(session => session.type === 'page' && session.targetId === rootTargetId && !session.destroyed))) {
      throw new Error('Browser credential protection requires the current owned root target session.');
    }
  };
  verify();
  const target = authTargetState(state, rootTargetId);
  return Object.freeze({
    suppressRawNetworkEvents() {
      verify(); target.rawLeases++; let active = true;
      return () => { if (active) { active = false; target.rawLeases--; } };
    },
    protectBrowserAuthCredentialDiagnostics() { verify(); target.diagnosticsProtected = true; return true; },
    acquireServiceWorkerWriteProtection() {
      verify(); const owner = {}; target.writeOwners.add(owner); let active = true;
      return Object.freeze({
        sendCommand: (transport, method, params, sessionId, options = {}) => {
          verify();
          if (!active || !state.transports.has(transport) || transport.authRootTargetId(sessionId) !== rootTargetId) throw new Error('Browser credential write protection is no longer owned.');
          return transport.sendCommand(method, params, sessionId, { ...options, [browserAuthWriteAuthority]: owner });
        },
        release: () => { if (active) { active = false; target.writeOwners.delete(owner); } },
      });
    },
  });
}

const closedReply = ({ id, sessionId }) => ({ id, sessionId, error: { code: -32001, message: 'Browser transport closed before the request completed' } });

// Playwright's public CDP transport lets us observe the actual input, including
// locator actions after scrolling/hit testing, without replacing those actions
// or installing event handlers in the website. Observer connections use this
// same transport, but the manager only displays its conversation's controller.
export class BrowserTransport {
  #browserAuth;
  constructor(endpoint, onPointer, wantsPointer = () => true) {
    this.endpoint = endpoint; this.onPointer = onPointer; this.wantsPointer = wantsPointer; this.source = randomUUID();
    this.sessions = new Map(); this.requests = new Map(); this.commands = new Map(); this.observations = new Map(); this.frameRestores = new Map(); this.frameAttachments = new Map();
    this.adapterAttachments = new Map(); this.eventSubscribers = new Set();
    this.adapterTransports = new Set();
    this.#browserAuth = authEndpointState(endpoint); this.#browserAuth.transports.add(this);
    this.browserAuthControls = Object.freeze({
      suppressRawNetworkEvents: binding => {
        const owned = this.registerBrowserAuthBinding(binding);
        const release = owned.protection.suppressRawNetworkEvents();
        const clear = suppressBrowserAuthDiagnostics(binding.record, owned.diagnosticsScope);
        let active = true;
        return () => { if (active) { active = false; clear(); release(); } };
      },
      protectBrowserAuthCredentialDiagnostics: binding => {
        const owned = this.registerBrowserAuthBinding(binding);
        owned.protection.protectBrowserAuthCredentialDiagnostics();
        return protectBrowserAuthCredentialDiagnostics(binding.record, owned.diagnosticsScope);
      },
      protectBrowserAuthServiceWorkerBypass: (binding, options) => this.protectBrowserAuthWorkerBypass(binding, options),
    });
    this.sequence = 0; this.nextId = -1; this.queue = [];
    this.open();
  }
  open() {
    if (this.socket || this.closed) return;
    const socket = this.socket = new WebSocket(this.endpoint, { handshakeTimeout: 10000 });
    socket.on('open', () => { for (const message of this.queue.splice(0)) socket.send(message); });
    // A WebSocket read can contain several CDP messages. Each delivery needs
    // its own task so Playwright can settle a response before handling the
    // execution-context events following it (notably with extension replay).
    this.deliver = message => {
      const command = this.commands.get(message.id);
      if (command) {
        this.commands.delete(message.id);
        if (message.error) command.reject(new Error(message.error.message)); else command.resolve(message.result);
        return;
      }
      if (message.method === 'Target.attachedToTarget' && !message.sessionId) {
        const pending = this.adapterAttachments.get(message.params.targetInfo.targetId);
        if (pending) { pending.events.push(message); return; }
        if (this.sessions.get(message.params.sessionId)?.rawRootSessionId === message.params.sessionId) return;
      }
      const attachment = this.frameAttachments.get(message.id);
      if (attachment) {
        this.frameAttachments.delete(message.id);
        if (this.sessions.get(attachment.message.sessionId) !== attachment.parent) return;
        message = attachment.message;
      } else if (message.method === 'Target.attachedToTarget' && message.params.targetInfo.type === 'iframe' && !message.params.waitingForDebugger) {
        const parent = this.sessions.get(message.sessionId);
        if (parent && !parent.rawRootSessionId && ['page', 'iframe'].includes(parent.type)) {
          // Restored OOPIFs attach before their parent's BFCache navigation.
          // A protocol round trip lets that commit reach Playwright first,
          // so it cannot immediately discard the restored child registration.
          const id = this.nextId--;
          this.frameAttachments.set(id, { message, parent });
          this.write({ id, sessionId: message.sessionId, method: 'Page.getFrameTree', params: {} });
          return;
        }
      }
      const restore = this.frameRestores.get(message.id);
      if (restore) {
        this.frameRestores.delete(message.id);
        const session = this.sessions.get(restore.sessionId), tree = message.result?.frameTree;
        if (!message.error && session === restore.session && session.loaderId === restore.loaderId && tree?.frame.loaderId === restore.loaderId) {
          const frames = new Set();
          const visit = node => {
            frames.add(node.frame.id);
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Page.frameAttached', params: { frameId: node.frame.id, parentFrameId: node.frame.parentId } });
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Page.frameNavigated', params: { frame: node.frame, type: 'Navigation' } });
            for (const child of node.childFrames ?? []) visit(child);
          };
          for (const child of tree.childFrames ?? []) visit(child);
          for (const context of session.contexts.values()) if (frames.has(context.auxData?.frameId))
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Runtime.executionContextCreated', params: { context } });
        }
        return;
      }
      const observation = this.observations.get(message.id);
      if (observation) {
        this.observations.delete(message.id);
        const { sessionId, session, ...pointer } = observation;
        if (!message.error && message.result?.cssVisualViewport && this.sessions.get(sessionId) === session && session.loaderId === pointer.loaderId)
          this.pointer({ ...pointer, geometry: viewportGeometry(message.result) });
        return;
      }
      // Negative IDs belong to this transport, including work already retired
      // by a detach. Its late replies must not reach Playwright's connection.
      if (Number.isInteger(message.id) && message.id < 0) return;
      const request = this.requests.get(message.id);
      if (request) {
        this.requests.delete(message.id);
        if (request.method === 'Page.getFrameTree') {
          const session = this.sessions.get(request.sessionId);
          if (session && message.result?.frameTree) {
            const frame = message.result.frameTree.frame;
            session.loaderId = frame.loaderId;
            // A restored OOPIF has no new frameNavigated event. Playwright
            // does not initialize its URL from this non-main frame tree.
            if (session.restoreFrame && frame.id === session.targetId) {
              session.restoreFrame = false;
              this.onmessage?.({ sessionId: request.sessionId, method: 'Page.frameNavigated', params: { frame, type: 'Navigation' } });
            }
          }
        }
      }
      // Timed out or cancelled private commands may reply after their promise
      // settled. Their negative IDs must never reach Playwright's connection.
      if (typeof message.id === 'number' && message.id < 0 && !message.method) return;
      const detached = message.method === 'Target.detachedFromTarget' ? this.sessions.get(message.params.sessionId) : null;
      const sourceSession = this.sessions.get(message.sessionId);
      const rawRootSessionId = sourceSession?.rawRootSessionId ?? detached?.rawRootSessionId;
      if (message.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = message.params;
        const parent = this.sessions.get(message.sessionId);
        this.sessions.set(sessionId, { ...targetInfo, parentSessionId: message.sessionId, ...(parent?.rawRootSessionId ? { rawRootSessionId: parent.rawRootSessionId } : {}), contexts: new Map(), restoreFrame: !parent?.rawRootSessionId && targetInfo.type === 'iframe' && !message.params.waitingForDebugger && ['page', 'iframe'].includes(parent?.type) });
        if (parent?.rawRootSessionId && ['page', 'iframe'].includes(targetInfo.type)) void this.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId, { timeoutMs: 3000 }).catch(() => {});
      } else if (message.method === 'Target.detachedFromTarget') {
        this.emitAdapterEvent(message, sourceSession ?? detached, rawRootSessionId);
        this.detachAdapterRoot(message.params.sessionId);
        this.detachSession(message.params.sessionId);
      } else if (message.method === 'Page.frameNavigated') {
        const session = this.sessions.get(message.sessionId);
        if (session) {
          if (!message.params.frame.parentId || message.params.frame.id === session.targetId) { session.loaderId = message.params.frame.loaderId; session.url = message.params.frame.url; }
          if (message.params.frame.id === session.targetId) session.restoreFrame = false;
        }
      } else if (message.method === 'Page.navigatedWithinDocument') {
        if (sourceSession && message.params.frameId === sourceSession.targetId) sourceSession.url = message.params.url;
      } else if (message.method === 'Target.targetInfoChanged') {
        for (const session of this.sessions.values()) if (session.targetId === message.params.targetInfo.targetId) Object.assign(session, message.params.targetInfo);
      } else if (message.method === 'Target.targetDestroyed') {
        for (const [sessionId, session] of this.sessions) if (session.targetId === message.params.targetId) {
          session.destroyed = true;
          if (session.rawRootSessionId === sessionId) this.detachAdapterRoot(sessionId);
        }
      }
      const session = this.sessions.get(message.sessionId);
      if (message.method === 'Runtime.executionContextsCleared') session?.contexts.clear();
      else if (message.method === 'Runtime.executionContextCreated') session?.contexts.set(message.params.context.id, message.params.context);
      else if (message.method === 'Runtime.executionContextDestroyed') session?.contexts.delete(message.params.executionContextId);
      this.emitBrowserAuthEvent(message, session ?? sourceSession ?? detached, rawRootSessionId);
      if (message.method !== 'Target.detachedFromTarget') this.emitAdapterEvent(message, session, rawRootSessionId);
      if (!rawRootSessionId) this.onmessage?.(message);
      // BFCache restores existing documents without child frameAttached events.
      // Playwright clears its children at the main navigation, even though
      // Chromium has already replayed their execution contexts. Restore the
      // missing bindings from the actual frame tree, without reloading the page.
      if (session && !session.rawRootSessionId && message.method === 'Page.frameNavigated' && message.params.type === 'BackForwardCacheRestore' && !message.params.frame.parentId) {
        const id = this.nextId--;
        this.frameRestores.set(id, { sessionId: message.sessionId, session, loaderId: session.loaderId });
        this.write({ id, sessionId: message.sessionId, method: 'Page.getFrameTree', params: {} });
      }
    };
    socket.on('message', data => setImmediate(() => {
      let message;
      try { message = JSON.parse(data.toString()); }
      catch { this.close(); return; }
      this.deliver(message);
    }));
    socket.on('error', error => { this.reason = error.message; });
    socket.on('close', () => setImmediate(() => {
      this.closed = true; this.queue = []; this.sessions.clear(); this.observations.clear(); this.frameRestores.clear(); this.frameAttachments.clear();
      this.#browserAuth.transports.delete(this);
      for (const [actorId, binding] of this.#browserAuth.bindings) if (binding.transport === this) this.detachBrowserAuthActor(actorId);
      // A connection EOF need not include Target.detachedFromTarget for every
      // custom CDP session. Settle its outstanding requests before Playwright
      // disposes the root connection and removes our message callback.
      const pending = [...this.requests.values()]; this.requests.clear();
      for (const request of pending) this.onmessage?.(closedReply(request));
      for (const command of this.commands.values()) command.reject(new Error('Browser transport closed before the request completed'));
      this.commands.clear();
      for (const transport of this.adapterTransports) transport.close();
      this.adapterTransports.clear();
      for (const subscriber of [...this.eventSubscribers]) this.detachAdapterRoot(subscriber.rootSessionId);
      this.pointer({ hidden: true }); this.onclose?.(this.reason);
    }));
  }
  emitAdapterEvent(message, sourceSession, rawRootSessionId) {
    if (!message.method || message.id !== undefined) return;
    const trackedTargetId = message.method === 'Target.attachedToTarget' ? message.params.targetInfo.targetId
      : message.method === 'Target.detachedFromTarget' ? message.params.targetId ?? this.sessions.get(message.params.sessionId)?.targetId
      : message.method === 'Target.targetInfoChanged' ? message.params.targetInfo.targetId
      : message.method === 'Target.targetDestroyed' ? message.params.targetId : sourceSession?.targetId;
    for (const subscriber of this.eventSubscribers) {
      if (!subscriber.active) continue;
      const root = this.sessions.get(subscriber.rootSessionId);
      const protection = this.#browserAuth.targets.get(root?.targetId);
      if (protection?.rawLeases || protection?.diagnosticsProtected) continue;
      const globalTarget = !message.sessionId && ['Target.targetInfoChanged', 'Target.targetDestroyed'].includes(message.method)
        && [...this.sessions.values()].some(session => session.rawRootSessionId === subscriber.rootSessionId && session.targetId === trackedTargetId);
      if (rawRootSessionId !== subscriber.rootSessionId && !globalTarget) continue;
      const child = message.sessionId && message.sessionId !== subscriber.rootSessionId;
      const event = { method: message.method, params: message.params ?? {}, source: { ...(child ? { sessionId: message.sessionId } : {}), ...(sourceSession?.targetId ?? trackedTargetId ? { targetId: sourceSession?.targetId ?? trackedTargetId } : {}) }, ...(trackedTargetId ? { trackedTargetId } : {}), topLevel: message.sessionId === subscriber.rootSessionId && message.method === 'Page.frameNavigated' && !message.params.frame.parentId };
      if (!root) continue;
      try { subscriber.listener(structuredClone(event)); } catch {}
    }
  }
  detachAdapterRoot(rootSessionId) {
    for (const [actorId, binding] of this.#browserAuth.bindings) if (binding.transport === this && binding.rootSessionId === rootSessionId) this.detachBrowserAuthActor(actorId);
    for (const subscriber of [...this.eventSubscribers]) if (subscriber.rootSessionId === rootSessionId) {
      subscriber.active = false;
      this.eventSubscribers.delete(subscriber);
      try { subscriber.onDetached?.(); } catch {}
    }
  }
  async createAdapter(rootTargetId, { canObserve = () => true } = {}) {
    if (typeof rootTargetId !== 'string' || !rootTargetId) throw new TypeError('A browser target ID is required for its CDP adapter.');
    if (this.closed) throw new Error('Browser transport closed');
    if (!this.adapterOnly) {
      // Raw domains and auto-attach belong to a separate browser connection.
      // Late attach replies or domain disable commands cannot affect Playwright.
      const transport = new BrowserTransport(this.endpoint);
      transport.adapterOnly = true;
      this.adapterTransports.add(transport);
      try {
        const adapter = await transport.createAdapter(rootTargetId, { canObserve: () => !this.closed && canObserve() !== false });
        return Object.freeze({ ...adapter, dispose: () => { adapter.dispose(); transport.close(); this.adapterTransports.delete(transport); } });
      } catch (error) {
        transport.close(); this.adapterTransports.delete(transport); throw error;
      }
    }
    if (this.adapterAttachments.has(rootTargetId)) throw new Error('A CDP adapter is already attaching to this tab.');
    const { targetInfo } = await this.sendCommand('Target.getTargetInfo', { targetId: rootTargetId }, undefined, { timeoutMs: 3000 });
    if (this.adapterAttachments.has(rootTargetId)) throw new Error('A CDP adapter is already attaching to this tab.');
    if (targetInfo.type !== 'page' || targetInfo.targetId !== rootTargetId) throw new Error('Raw CDP adapters require the selected top-level page target.');
    const pending = { events: [] };
    this.adapterAttachments.set(rootTargetId, pending);
    let rootSessionId, root;
    try {
      // A dedicated session prevents raw Runtime/Network.disable from removing
      // the domains required by Playwright's own automation connection.
      ({ sessionId: rootSessionId } = await this.sendCommand('Target.attachToTarget', { targetId: rootTargetId, flatten: true }, undefined, { timeoutMs: 3000 }));
      if (typeof rootSessionId !== 'string' || !rootSessionId) throw new Error('The browser did not return a CDP session for this tab.');
      const attached = pending.events.find(event => event.params.sessionId === rootSessionId);
      root = { ...(attached?.params.targetInfo ?? targetInfo), rawRootSessionId: rootSessionId, contexts: new Map() };
      this.sessions.set(rootSessionId, root);
    } finally {
      this.adapterAttachments.delete(rootTargetId);
      if (!this.closed) for (const event of pending.events) if (event.params.sessionId !== rootSessionId) this.deliver(event);
    }
    try {
      await this.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, rootSessionId, { timeoutMs: 3000 });
    } catch (error) {
      void this.sendCommand('Target.detachFromTarget', { sessionId: rootSessionId }, undefined, { timeoutMs: 3000 }).catch(() => {});
      throw error;
    }
    let disposed = false;
    const available = () => !disposed && !this.closed && !root.destroyed && this.sessions.get(rootSessionId) === root && canObserve() !== false;
    const descriptor = (sessionId, session) => ({ sessionId, targetId: session.targetId, url: session.url, type: session.type });
    const resolveTarget = target => {
      if (!available()) return null;
      if (target == null) return descriptor(rootSessionId, root);
      if (!target || typeof target !== 'object' || (typeof target.sessionId === 'string') === (typeof target.targetId === 'string')) return null;
      for (const [sessionId, session] of this.sessions) {
        if (sessionId === rootSessionId || session.destroyed || session.rawRootSessionId !== rootSessionId) continue;
        if (target.sessionId === sessionId || target.targetId === session.targetId) return descriptor(sessionId, session);
      }
      return null;
    };
    const subscriptions = new Set();
    return Object.freeze({
      browserAuthDiagnosticsScope: authTargetState(this.#browserAuth, rootTargetId).diagnosticsScope,
      canObserve: available,
      resolveTarget,
      send: async (method, params, { target, timeoutMs = 3000, deadlineMs, signal } = {}) => {
        signal?.throwIfAborted();
        if (!available()) throw new Error('The CDP adapter is no longer attached to this tab.');
        const resolved = resolveTarget(target);
        if (!resolved) throw new Error('The CDP child target is not attached to this tab.');
        return await this.sendCommand(method, params, resolved.sessionId, { timeoutMs, deadlineMs, signal });
      },
      subscribeEvents: (listener, onDetached) => {
        if (typeof listener !== 'function') throw new TypeError('A CDP event listener is required.');
        if (!available()) { onDetached?.(); return () => {}; }
        const subscriber = { rootSessionId, listener: event => { if (available()) listener(event); }, onDetached, active: true };
        this.eventSubscribers.add(subscriber); subscriptions.add(subscriber);
        return () => { subscriber.active = false; this.eventSubscribers.delete(subscriber); subscriptions.delete(subscriber); };
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const subscriber of subscriptions) {
          subscriber.active = false; this.eventSubscribers.delete(subscriber);
          try { subscriber.onDetached?.(); } catch {}
        }
        subscriptions.clear();
        if (!this.closed) void this.sendCommand('Target.detachFromTarget', { sessionId: rootSessionId }, undefined, { timeoutMs: 3000 }).catch(() => {});
      },
    });
  }
  pointer(value) {
    if (this.closed && !value.hidden) return;
    // Visual feedback cannot throw into or delay the browser input channel.
    try { this.onPointer?.({ ...value, source: this.source }); } catch {}
  }
  registerBrowserAuthBinding(binding) {
    const verify = () => {
      const proof = binding?.record?.browserAuthBinding;
      const current = typeof proof?.inspect === 'function' ? proof.inspect() : null;
      if (!current || typeof current.then === 'function' || !['tabId', 'leaseId', 'actorId', 'epoch', 'rootTargetId'].every(key => current[key] === binding[key])
        || binding.record.transport !== this || binding.record.assertFileAccess?.() !== true || binding.record.page?.isClosed() !== false
        || binding.browser?.owners?.get(binding.record.id)?.sessionId !== binding.record.sessionId
        || typeof binding.rootSessionId !== 'string' || !binding.rootSessionId) throw new Error('Browser authentication requires a live owned CDP session proof.');
      return true;
    };
    verify();
    const transport = [...this.#browserAuth.transports].find(value => !value.closed && value.sessions.get(binding.rootSessionId)?.targetId === binding.rootTargetId);
    if (!transport) throw new Error('Browser authentication root session is not attached to the owned transport.');
    const previous = this.#browserAuth.bindings.get(binding.actorId);
    if (previous) {
      previous.verify();
      if (previous.record !== binding.record || previous.rootSessionId !== binding.rootSessionId || previous.transport !== transport) throw new Error('Browser authentication actor binding changed.');
      return previous;
    }
    const protection = createBrowserTransportAuthProtection(this.endpoint, binding.rootTargetId, verify);
    const state = { record: binding.record, tabId: binding.tabId, rootSessionId: binding.rootSessionId, transport, verify, protection,
      diagnosticsScope: authTargetState(this.#browserAuth, binding.rootTargetId).diagnosticsScope, workerCount: 0, workerEnabled: false, workerUncertain: false, workerPending: Promise.resolve() };
    registerBrowserAuthDiagnosticsScope(binding.record, state.diagnosticsScope);
    this.#browserAuth.bindings.set(binding.actorId, state);
    return state;
  }
  subscribeBrowserAuthEvents(actorId, listener, onDetached) {
    const binding = this.#browserAuth.bindings.get(actorId);
    if (!binding || typeof listener !== 'function') throw new Error('A verified private browser authentication actor is required.');
    binding.verify();
    const observer = { actorId, binding, listener, onDetached };
    this.#browserAuth.observers.add(observer);
    return () => this.#browserAuth.observers.delete(observer);
  }
  detachBrowserAuthActor(actorId) {
    this.#browserAuth.bindings.delete(actorId);
    for (const observer of [...this.#browserAuth.observers]) if (observer.actorId === actorId) {
      this.#browserAuth.observers.delete(observer); try { observer.onDetached?.(); } catch {}
    }
  }
  emitBrowserAuthEvent(message, session, rawRootSessionId) {
    if (!message.method || message.id !== undefined) return;
    for (const observer of this.#browserAuth.observers) {
      const binding = observer.binding;
      if (binding.transport !== this || message.sessionId !== binding.rootSessionId && rawRootSessionId !== binding.rootSessionId) continue;
      try {
        binding.verify();
        observer.listener({ method: message.method, params: message.params ?? {}, source: { tabId: binding.tabId,
          ...(message.sessionId ? { sessionId: message.sessionId } : {}), ...(session?.targetId ? { targetId: session.targetId } : {}) } });
      } catch { this.detachBrowserAuthActor(observer.actorId); }
    }
  }
  async sendBrowserAuthCommand(binding, method, params = {}, options = {}) {
    const state = this.registerBrowserAuthBinding(binding);
    const sessionId = options.target?.sessionId ?? state.rootSessionId;
    const session = state.transport.sessions.get(sessionId);
    if (!session || sessionId !== state.rootSessionId && session.rawRootSessionId !== state.rootSessionId) throw new Error('Browser authentication child session is not attached to its root.');
    const result = await state.transport.sendCommand(method, params, sessionId, options);
    state.verify(); options.signal?.throwIfAborted(); return result;
  }
  async protectBrowserAuthWorkerBypass(binding, { signal } = {}) {
    const state = this.registerBrowserAuthBinding(binding);
    const owner = state.protection.acquireServiceWorkerWriteProtection();
    const update = () => {
      const pending = state.workerPending.catch(() => {}).then(async () => {
        state.verify(); const bypass = state.workerCount > 0;
        if (state.workerEnabled !== bypass || state.workerUncertain) {
          try {
            await owner.sendCommand(state.transport, 'Network.setBypassServiceWorker', { bypass }, state.rootSessionId, { signal: bypass ? signal : undefined, timeoutMs: 3000 });
            state.workerEnabled = bypass; state.workerUncertain = false;
          } catch (error) { state.workerUncertain = true; throw error; }
        }
      });
      state.workerPending = pending; return pending;
    };
    state.workerCount++;
    try { await update(); }
    catch (error) { state.workerCount--; try { await update(); owner.release(); } catch {} throw error; }
    let active = true;
    return async () => { if (active) { active = false; state.workerCount--; } await update(); owner.release(); };
  }
  authRootTargetId(sessionId) {
    let session = this.sessions.get(sessionId);
    const seen = new Set();
    while (session && !seen.has(session)) {
      seen.add(session);
      if (session.type === 'page') return session.targetId;
      session = this.sessions.get(session.rawRootSessionId ?? session.parentSessionId);
    }
  }
  assertBrowserAuthWrite(message, authority) {
    if (message.method !== 'Network.setBypassServiceWorker') return;
    const rootTargetId = this.authRootTargetId(message.sessionId);
    const target = this.#browserAuth.targets.get(rootTargetId);
    if (rootTargetId === undefined && [...this.#browserAuth.targets.values()].some(value => value.writeOwners.size)) throw new Error('Unverified CDP sessions cannot change protected service worker bypass.');
    if (target?.writeOwners.size && !target.writeOwners.has(authority)) throw new Error('Service worker bypass is owned by active browser credential protection.');
  }
  detachSession(sessionId) {
    const detached = new Set([sessionId]);
    let count;
    do {
      count = detached.size;
      for (const [id, session] of this.sessions) if (detached.has(session.parentSessionId)) detached.add(id);
      for (const attachment of this.frameAttachments.values()) if (detached.has(attachment.message.sessionId)) detached.add(attachment.message.params.sessionId);
    } while (count !== detached.size);
    for (const id of detached) this.sessions.delete(id);
    for (const [id, restore] of this.frameRestores) if (detached.has(restore.sessionId)) this.frameRestores.delete(id);
    for (const [id, attachment] of this.frameAttachments) if (detached.has(attachment.message.sessionId) || detached.has(attachment.message.params.sessionId)) this.frameAttachments.delete(id);
    for (const [id, observation] of this.observations) if (detached.has(observation.sessionId)) this.observations.delete(id);
    // Playwright settles normal requests through the detach notification.
    // Our command promises must also settle when Chromium omits their replies.
    for (const [id, request] of this.requests) if (detached.has(request.sessionId)) this.requests.delete(id);
    for (const [id, command] of this.commands) if (detached.has(command.sessionId)) {
      this.commands.delete(id); command.reject(new Error('Browser session detached before the request completed'));
    }
  }
  write(message, authority) {
    this.assertBrowserAuthWrite(message, authority);
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (!this.closed) this.queue.push(data);
  }
  send(message) {
    if (this.closed) { setImmediate(() => this.onmessage?.(closedReply(message))); return; }
    try { this.assertBrowserAuthWrite(message); }
    catch {
      setImmediate(() => this.onmessage?.({ id: message.id, sessionId: message.sessionId, error: { code: -32000, message: 'Service worker bypass is owned by active browser credential protection.' } }));
      return;
    }
    this.requests.set(message.id, { id: message.id, method: message.method, sessionId: message.sessionId });
    const session = this.sessions.get(message.sessionId);
    if (message.method === 'Input.dispatchMouseEvent' && session?.type === 'page' && session.loaderId && this.onPointer && this.wantsPointer(session.targetId)) {
      const { type, x, y, buttons = 0, button, clickCount } = message.params;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const id = this.nextId--, sequence = ++this.sequence, at = Date.now();
        if (type === 'mousePressed') session.press = { x, y, at, sequence, loaderId: session.loaderId };
        const press = session.press?.loaderId === session.loaderId && at - session.press.at < 250 ? session.press : undefined;
        this.observations.set(id, { sessionId: message.sessionId, session, targetId: session.targetId, loaderId: session.loaderId, sequence, at, issuedAt: performance.now(), type, x, y, buttons, button, clickCount, press });
        // Obtain the geometry in the same protocol stream as this input. This
        // adds no awaited round trip, and does not use old screenshot bounds.
        this.write({ id, sessionId: message.sessionId, method: 'Page.getLayoutMetrics', params: {} });
      }
    }
    this.write(message);
  }
  sendCommand(method, params, sessionId, { timeoutMs, deadlineMs, signal, [browserAuthWriteAuthority]: authority } = {}) {
    if (this.closed) return Promise.reject(new Error('Browser transport closed'));
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) return Promise.reject(new TypeError('Browser command timeoutMs must be positive.'));
    if (deadlineMs !== undefined && !Number.isFinite(deadlineMs)) return Promise.reject(new TypeError('Browser command deadlineMs must be finite.'));
    const remaining = deadlineMs === undefined ? timeoutMs : Math.min(timeoutMs ?? Infinity, deadlineMs - Date.now());
    if (remaining !== undefined && remaining <= 0) return Promise.reject(new Error('Browser command exceeded its deadline before dispatch'));
    const id = this.nextId--;
    return new Promise((resolve, reject) => {
      let timer;
      const message = { id, method, params, sessionId }, raw = JSON.stringify(message);
      const settle = (callback, value) => {
        this.commands.delete(id);
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.queue = this.queue.filter(queued => queued !== raw);
        callback(value);
      };
      const abort = () => settle(reject, signal.reason);
      this.commands.set(id, { resolve: value => settle(resolve, value), reject: error => settle(reject, error), sessionId });
      signal?.addEventListener('abort', abort, { once: true });
      if (remaining !== undefined) timer = setTimeout(() => {
        const error = new Error(`Timed out running browser CDP command "${method}"`);
        error.name = 'CdpCommandTimeoutError';
        settle(reject, error);
      }, remaining);
      try { this.write(message, authority); }
      catch (error) { settle(reject, error); }
    });
  }
  close() {
    this.closed = true; this.queue = [];
    for (const transport of this.adapterTransports) transport.close();
    this.adapterTransports.clear();
    this.socket?.terminate();
    this.#browserAuth.transports.delete(this);
    if (!this.#browserAuth.transports.size && !this.#browserAuth.targets.size) browserAuthStates.delete(authEndpointKey(this.endpoint));
  }
}
