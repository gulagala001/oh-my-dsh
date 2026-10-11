import { randomUUID } from "node:crypto";

const WORKER_FILTER = [{ type: "iframe", exclude: false }, { type: "service_worker", exclude: false }, { exclude: true }];
const FRAME_FILTER = [{ type: "iframe", exclude: false }, { exclude: true }];
const CLOSE_TIMEOUT_MS = 5000;

function failure(message, code = "BROWSER_AUTH_CONTAINMENT_FAILED") {
  return Object.assign(new Error(`desktop browser authentication: ${message}`), { code });
}
function id(value, name) {
  if (typeof value !== "string" || !value || value.length > 128 || /[\x00-\x1f]/u.test(value)) throw failure(`invalid ${name}`, "INVALID_ARGUMENT");
  return value;
}
function liveFrame(first, second) {
  return first && second && !first.isDestroyed() && !second.isDestroyed()
    && first.processId === second.processId && first.routingId === second.routingId
    && first.frameTreeNodeId === second.frameTreeNodeId && first.frameToken === second.frameToken;
}

export class BrowserAuthContainment {
  constructor(browser) { this.browser = browser; }
  bindings = new Map();
  issued = new Set();
  targets = new Map();
  workerQueues = new WeakMap();

  async documentBinding(params, signal) {
    const browser = this.browser;
    const tab = browser.tab(params.tabId);
    const control = browser.control(tab, params);
    const actorId = id(params.actorId, "actorId");
    browser.assertControl(control, actorId);
    const contents = tab.view.webContents, frame = contents.mainFrame;
    const frameIdentity = { processId: frame.processId, routingId: frame.routingId,
      frameTreeNodeId: frame.frameTreeNodeId, frameToken: frame.frameToken };
    const documentGeneration = tab.documentGeneration, url = contents.getURL();
    const targetId = control.targetInfo.targetId;
    const assertCurrent = () => {
      browser.assertControl(control, actorId);
      if (tab.view.webContents !== contents || contents.session !== browser.browserSession
        || tab.documentGeneration !== documentGeneration || contents.getURL() !== url
        || control.targetInfo.targetId !== targetId || !liveFrame(frame, contents.mainFrame)
        || Object.keys(frameIdentity).some(key => contents.mainFrame[key] !== frameIdentity[key])) {
        throw failure("credential document or native frame changed", "STALE_TARGET");
      }
      return true;
    };
    const { frameTree } = await browser.native(control, { method: "Page.getFrameTree", params: {} });
    signal?.throwIfAborted(); assertCurrent();
    const { root } = await browser.native(control, { method: "DOM.getDocument", params: { depth: 0, pierce: false } });
    signal?.throwIfAborted(); assertCurrent();
    if (!frameTree?.frame?.id || !frameTree.frame.loaderId || !Number.isSafeInteger(root?.backendNodeId)
      || params.frameId !== undefined && params.frameId !== frameTree.frame.id
      || params.loaderId !== undefined && params.loaderId !== frameTree.frame.loaderId) {
      throw failure("credential document has no stable native identity", "STALE_TARGET");
    }
    return { tab, control, actorId, contents, frame, frameId: frameTree.frame.id,
      loaderId: frameTree.frame.loaderId, documentBackendNodeId: root.backendNodeId,
      documentGeneration, targetId, url, frameOrigin: frameTree.frame.securityOrigin, assertCurrent };
  }

  summary(binding) {
    return { protected: true, protectionId: binding.protectionId, targetId: binding.targetId,
      frameId: binding.frameId, loaderId: binding.loaderId,
      documentGeneration: binding.documentGeneration, documentBackendNodeId: binding.documentBackendNodeId };
  }
  forControl(control) { return [...this.bindings.values()].filter(binding => binding.control === control); }
  blocksPopup(tab) { return [...this.bindings.values()].some(binding => binding.tab === tab); }
  rejectPopup(tab) {
    for (const binding of this.bindings.values()) if (binding.tab === tab) binding.targetRejected = true;
  }
  protectsWorkers(control) { return this.forControl(control).some(binding => binding.workerProtected || binding.workerAcquiring); }
  hasWorkerProtection(binding) {
    return this.forControl(binding.control).some(candidate => candidate.workerProtected
      && candidate.actorId === binding.actorId && candidate.frameId === binding.frameId
      && candidate.loaderId === binding.loaderId && candidate.documentGeneration === binding.documentGeneration
      && candidate.documentBackendNodeId === binding.documentBackendNodeId
      && !candidate.workerFailure && !candidate.targetRejected);
  }
  binding(params, current = true) {
    const binding = this.bindings.get(id(params.protectionId, "protectionId"));
    if (!binding || binding.tab.id !== params.tabId || binding.control.leaseId !== params.leaseId
      || binding.actorId !== params.actorId) throw failure("credential protection identity changed", "STALE_TARGET");
    if (current) binding.assertCurrent();
    return binding;
  }
  async currentDocument(binding, signal) {
    binding.assertCurrent();
    const current = await this.documentBinding({ tabId: binding.tab.id, leaseId: binding.control.leaseId,
      actorId: binding.actorId }, signal);
    if (current.frameId !== binding.frameId || current.loaderId !== binding.loaderId
      || current.documentBackendNodeId !== binding.documentBackendNodeId) throw failure("credential document changed", "STALE_TARGET");
    binding.assertCurrent();
  }
  hasExistingPopup(binding) {
    return [...this.browser.tabs.values()].some(tab => !tab.view.webContents.isDestroyed()
      && tab.authPopupSource?.contents === binding.contents
      && tab.authPopupSource.documentGeneration === binding.documentGeneration);
  }

  async handleTargets(params, signal) {
    const action = id(params.action, "action");
    if (action === "inspect" && params.protectionId === undefined) {
      const tab = this.browser.tab(params.tabId), control = this.browser.control(tab, params);
      this.browser.assertControl(control, id(params.actorId, "actorId"));
      await this.browser.native(control, { method: "Target.getTargetInfo", params: {} });
      signal?.throwIfAborted(); this.browser.assertControl(control, params.actorId);
      return { targetInfos: [control.targetInfo, ...[...control.children.values()].map(child => child.info),
        ...[...this.targets.values()].filter(target => target.control === control && !target.destroyed).map(target => target.info)] };
    }
    if (action === "check" && params.protectionId === undefined) {
      const probe = { ...params, protectionId: randomUUID() };
      let acquired = false, workers = false;
      try {
        await this.handleTargets({ ...probe, action: "acquire" }, signal); acquired = true;
        await this.handleWorkers({ ...probe, action: "acquire" }, signal); workers = true;
        return await this.handleTargets(probe, signal);
      } catch { return { contained: false }; }
      finally {
        if (workers) await this.handleWorkers({ ...probe, action: "release" });
        if (acquired) await this.handleTargets({ ...probe, action: "release" });
      }
    }
    if (action === "acquire") {
      const protectionId = id(params.protectionId, "protectionId");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(protectionId)
        || this.issued.has(protectionId)) throw failure("protection token is not fresh", "INVALID_ARGUMENT");
      const tab = this.browser.tab(params.tabId), control = this.browser.control(tab, params);
      const actorId = id(params.actorId, "actorId"); this.browser.assertControl(control, actorId);
      this.issued.add(protectionId);
      // Install the popup fence before the first asynchronous native identity query.
      const pending = { tab, control, actorId, protectionId, kind: "target" };
      this.bindings.set(protectionId, pending);
      try {
        const document = await this.documentBinding(params, signal);
        const binding = Object.assign(pending, document);
        if (this.bindings.get(protectionId) !== pending) throw failure("credential protection ended during acquisition", "CONTROL_STOPPED");
        if (this.hasExistingPopup(binding)) throw failure("credential document already opened another target");
        return this.summary(binding);
      } catch (error) {
        this.bindings.delete(protectionId); throw error;
      }
    }
    if (action === "release" && !this.bindings.has(id(params.protectionId, "protectionId"))) return { released: true, protectionId: params.protectionId };
    const binding = this.binding(params, false);
    if (action === "release") {
      if (binding.workerProtected || binding.workerAcquiring) throw failure("release worker protection before popup protection");
      await this.closePaused(binding);
      this.bindings.delete(binding.protectionId);
      for (const [targetId, target] of this.targets) {
        target.protectionIds.delete(binding.protectionId);
        if (!target.protectionIds.size && target.destroyed) this.targets.delete(targetId);
      }
      return { released: true, protectionId: binding.protectionId };
    }
    if (action === "close") return { closed: await this.closeTarget(binding, id(params.targetId, "targetId")) };
    if (action === "inspect") {
      this.browser.assertControl(binding.control, binding.actorId);
      await this.browser.native(binding.control, { method: "Target.getTargetInfo", params: {} });
      return { targetInfos: [binding.control.targetInfo,
        ...[...binding.control.children.values()].map(child => child.info),
        ...[...this.targets.values()].filter(target => target.control === binding.control && !target.destroyed).map(target => target.info)] };
    }
    if (action === "check") {
      try {
        await this.currentDocument(binding, signal);
        return { contained: this.hasWorkerProtection(binding) && !binding.workerFailure && !binding.targetRejected && !this.hasExistingPopup(binding) };
      } catch { return { contained: false }; }
    }
    throw failure("unsupported target protection action", "INVALID_ARGUMENT");
  }

  serializeWorkers(control, operation) {
    const pending = (this.workerQueues.get(control) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.workerQueues.set(control, pending);
    void pending.finally(() => { if (this.workerQueues.get(control) === pending) this.workerQueues.delete(control); }).catch(() => {});
    return pending;
  }
  workerConfiguration(control) {
    return this.protectsWorkers(control)
      ? { autoAttach: true, flatten: true, waitForDebuggerOnStart: true, filter: WORKER_FILTER }
      : control.authPreviousAutoAttach ?? { autoAttach: false, flatten: true, waitForDebuggerOnStart: false, filter: FRAME_FILTER };
  }
  async handleWorkers(params, signal) {
    const action = id(params.action, "action");
    if (action === "release" && !this.bindings.has(id(params.protectionId, "protectionId"))) return { released: true, protectionId: params.protectionId };
    let ownToken = false;
    if (action === "acquire" && !this.bindings.has(id(params.protectionId, "protectionId"))) {
      await this.handleTargets(params, signal);
      this.bindings.get(params.protectionId).kind = "worker"; ownToken = true;
    }
    const binding = this.binding(params, action === "acquire");
    return this.serializeWorkers(binding.control, async () => {
      if (action === "acquire") {
        if (binding.workerProtected || binding.workerAcquiring) throw failure("worker protection was already acquired");
        await this.currentDocument(binding, signal);
        if (!this.protectsWorkers(binding.control)) binding.control.authPreviousAutoAttach = binding.control.autoAttachConfig;
        binding.workerAcquiring = true;
        try {
          // CDP pauses related service workers before their script starts, as in the source policy.
          await this.browser.native(binding.control, { method: "Target.setAutoAttach", params: this.workerConfiguration(binding.control) });
          signal?.throwIfAborted(); await this.currentDocument(binding, signal);
          if (binding.workerFailure) throw failure("an existing service worker was not paused before execution");
          binding.workerProtected = true; binding.workerAcquiring = false;
          return this.summary(binding);
        } catch (error) {
          // Keep an uncertain native configuration owned until rollback is acknowledged.
          binding.workerAcquiring = false; binding.workerProtected = true; binding.workerFailure = true;
          await this.closePaused(binding);
          binding.workerProtected = false;
          try {
            await this.browser.native(binding.control, { method: "Target.setAutoAttach", params: this.workerConfiguration(binding.control) });
          } catch (cleanupError) { binding.workerProtected = true; throw cleanupError; }
          if (ownToken) await this.handleTargets({ ...params, action: "release" });
          throw error;
        }
      }
      if (action !== "release") throw failure("unsupported worker protection action", "INVALID_ARGUMENT");
      if (!binding.workerProtected && !binding.workerAcquiring) {
        if (binding.kind === "worker") await this.handleTargets({ ...params, action: "release" });
        return { released: true, protectionId: binding.protectionId };
      }
      await this.closePaused(binding);
      binding.workerProtected = false; binding.workerAcquiring = false;
      try {
        await this.browser.native(binding.control, { method: "Target.setAutoAttach", params: this.workerConfiguration(binding.control) });
        await this.closePaused(binding);
      } catch (error) { binding.workerProtected = true; binding.workerFailure = true; throw error; }
      if (!this.protectsWorkers(binding.control)) delete binding.control.authPreviousAutoAttach;
      if (binding.kind === "worker") await this.handleTargets({ ...params, action: "release" });
      return { released: true, protectionId: binding.protectionId };
    });
  }

  onAttached(control, params, parent) {
    const bindings = this.forControl(control);
    const info = params.targetInfo;
    if (!bindings.length || !info || !["iframe", "service_worker"].includes(info.type)) return false;
    if (info.type === "service_worker" && !this.protectsWorkers(control)) return false;
    if (typeof params.sessionId !== "string" || typeof info.targetId !== "string" || !info.targetId) {
      for (const binding of bindings) binding.workerFailure = true;
      return true;
    }
    const existing = this.findTarget(control, info.targetId);
    if (existing) {
      existing.sessionIds.add(params.sessionId);
      if (params.waitingForDebugger !== true) for (const binding of bindings) binding.workerFailure = true;
      for (const binding of bindings) { existing.protectionIds.add(binding.protectionId); binding.targetRejected = true; }
      return info.type === "service_worker";
    }
    const target = { control, info, targetId: info.targetId, sessionId: params.sessionId,
      sessionIds: new Set([params.sessionId]), parent,
      protectionIds: new Set(bindings.map(binding => binding.protectionId)), paused: params.waitingForDebugger === true,
      destroyed: false, destroyedPromise: undefined, confirmDestroyed: undefined };
    target.destroyedPromise = new Promise(resolve => { target.confirmDestroyed = resolve; });
    this.targets.set(JSON.stringify([control.leaseId, info.targetId]), target);
    if (target.paused || info.type === "service_worker") for (const binding of bindings) binding.targetRejected = true;
    if (!target.paused && info.type === "service_worker") for (const binding of bindings) binding.workerFailure = true;
    // Service workers stay outside the general child-command scope and are never auto-resumed.
    return info.type === "service_worker";
  }
  onDestroyed(control, targetId) {
    const target = this.findTarget(control, targetId);
    if (!target || target.control !== control) return;
    target.destroyed = true; target.confirmDestroyed();
  }
  isPaused(control, sessionId) {
    return [...this.targets.values()].some(target => target.control === control && target.sessionIds.has(sessionId) && target.paused && !target.destroyed);
  }
  findTarget(control, targetId) { return [...this.targets.values()].find(target => target.control === control && target.targetId === targetId); }
  async closeTarget(binding, targetId) {
    const target = this.findTarget(binding.control, targetId);
    if (!target || target.control !== binding.control || !target.protectionIds.has(binding.protectionId) || !target.paused) return false;
    if (target.destroyed) return true;
    if (target.closing) return target.closing;
    const closing = this.destroyTarget(target);
    target.closing = closing;
    try { return await closing; } finally { if (target.closing === closing) target.closing = undefined; }
  }
  async destroyTarget(target) {
    if (this.browser.tabs.get(target.control.tab.id) !== target.control.tab
      || target.control.tab.control !== target.control || target.control.detached) throw failure("protected target lost its native debugger", "CONTROL_STOPPED");
    const result = await this.browser.native(target.control, { method: "Target.closeTarget", params: { targetId: target.targetId } });
    if (result?.success !== true && !target.destroyed) return false;
    const deadline = Date.now() + CLOSE_TIMEOUT_MS;
    while (!target.destroyed && Date.now() < deadline) {
      try {
        await this.browser.native(target.control, { method: "Target.getTargetInfo", params: { targetId: target.targetId } });
      } catch (error) {
        // Only the native protocol's specific missing-target response confirms destruction.
        if (/^No target with given id(?: found)?\.?$/iu.test(error?.message ?? "")) {
          this.onDestroyed(target.control, target.targetId); break;
        }
        if (!target.destroyed) throw error;
      }
      if (!target.destroyed) await Promise.race([target.destroyedPromise, new Promise(resolve => setTimeout(resolve, 25))]);
    }
    if (target.destroyed) {
      for (const sessionId of target.sessionIds) if (target.control.children.has(sessionId) || target.control.detachedChildren.has(sessionId)) this.browser.dropChild(target.control, sessionId, true);
      if (!target.control.stopped) this.browser.emit("cdp", { tabId: target.control.tab.id,
        leaseId: target.control.leaseId, method: "Target.targetDestroyed", params: { targetId: target.targetId } });
    }
    return target.destroyed;
  }
  async closePaused(binding) {
    for (const target of this.targets.values()) if (target.control === binding.control
      && target.protectionIds.has(binding.protectionId) && target.paused && !target.destroyed) {
      if (!await this.closeTarget(binding, target.targetId)) throw failure("protected target destruction was not confirmed");
    }
  }
  async releaseControl(control, actorId) {
    for (const binding of this.forControl(control)) if (actorId === undefined || binding.actorId === actorId) {
      if (binding.workerProtected || binding.workerAcquiring) await this.handleWorkers({ action: "release", tabId: binding.tab.id,
        leaseId: control.leaseId, actorId: binding.actorId, protectionId: binding.protectionId });
      await this.closePaused(binding); this.bindings.delete(binding.protectionId);
    }
    if (!this.forControl(control).length) for (const [targetId, target] of this.targets) if (target.control === control && target.destroyed) this.targets.delete(targetId);
  }
  tabDestroyed(tab) {
    for (const [token, binding] of this.bindings) if (binding.tab === tab) this.bindings.delete(token);
    for (const [targetId, target] of this.targets) if (target.control.tab === tab && target.destroyed) this.targets.delete(targetId);
  }
}
