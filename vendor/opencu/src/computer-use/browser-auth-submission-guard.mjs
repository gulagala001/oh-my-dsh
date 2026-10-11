import { randomUUID, webcrypto } from 'node:crypto';

// Source: Codex browser-service.mjs, line 1081, am/lG/Yk/uG/cG/bw/Hn.
// These adapters must provide real request containment; a missing capability
// prevents setup before the caller is allowed to deliver credentials.
const activeGuards = new WeakMap();
const preservedDebugger = Object.freeze({ preserveDebuggerOnTimeout: true });
const requiredCdpMethods = [
  'call', 'on', 'removeListener', 'waitForEvent', 'suppressRawNetworkEvents',
  'protectBrowserAuthServiceWorkerBypass',
];
const requiredPrivateCdpMethods = [
  'protectBrowserAuthNewTargets', 'protectServiceWorkerStarts',
  'browserAuthNewTargetCheck', 'closeBrowserAuthPausedTarget',
];

function requireMethods(adapter, name, methods) {
  if (adapter == null || !['object', 'function'].includes(typeof adapter)) {
    throw new TypeError(`Browser credential submission requires ${name}`);
  }
  for (const method of methods) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`Browser credential submission requires ${name}.${method}`);
    }
  }
}

function requireDisposer(dispose, capability) {
  if (typeof dispose !== 'function') {
    throw new TypeError(`Browser credential submission requires a disposer from ${capability}`);
  }
  return dispose;
}

function parseRequestUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url;
  } catch {
    return undefined;
  }
}

function assertOptions(options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('Browser credential submission requires guard options');
  }
  const ordinary = options.ordinary != null;
  requireMethods(options.cdp, 'cdp', [
    ...requiredCdpMethods, ...(ordinary ? [] : requiredPrivateCdpMethods),
  ]);
  requireMethods(options.requests, 'requests', ['on', 'removeListener', 'addRequestInterceptor']);
  if (!Number.isSafeInteger(options.tabId) || options.tabId < 0
    || typeof options.frameId !== 'string' || options.frameId.length === 0) {
    throw new TypeError('Browser credential submission requires a tab ID and credential frame ID');
  }
  const target = ordinary ? options.ordinary : options.target;
  const origin = parseRequestUrl(target?.origin);
  if (origin == null || origin.protocol !== 'https:' || origin.origin !== target.origin) {
    throw new TypeError('Browser credential submission requires an exact HTTPS origin');
  }
  if (ordinary) {
    if (typeof options.ordinary.password !== 'string' || options.ordinary.password.length === 0) {
      throw new Error('Browser credential submission is missing its password');
    }
  } else {
    const url = parseRequestUrl(target?.url);
    if (url == null || url.protocol !== 'https:' || url.origin !== origin.origin || url.href !== target.url) {
      throw new TypeError('Browser credential submission requires an exact same-origin HTTPS target URL without a fragment');
    }
    if (!Array.isArray(options.credentialFields) || options.credentialFields.length === 0
      || options.credentialFields.some(field => field == null || typeof field.name !== 'string'
        || field.name.length === 0 || typeof field.value !== 'string')
      || new Set(options.credentialFields.map(field => field.name)).size !== options.credentialFields.length) {
      throw new Error('Browser credential submission is missing a required credential field');
    }
  }
}

/**
 * Required cdp events: `event` with {source:{tabId,sessionId?,targetId?},method,params},
 * and `tabDetached` with tabId. Top-level source must omit sessionId/targetId.
 * Required requests events: `requestResolution` with (tabId, pausedRequest, resolution).
 * The interceptor receives {requestId,networkId?,frameId,resourceType,
 * redirectedRequestId?,request:{url,method,headers,postData?}} and blocks with 'block'.
 */
export async function createBrowserAuthSubmissionGuard(options) {
  assertOptions(options);
  const { cdp, requests, tabId, frameId } = options;
  const active = activeGuards.get(requests) ?? new Map();
  activeGuards.set(requests, active);
  const previous = active.get(tabId);
  const matchesCredentialRequest = options.ordinary == null
    ? await createCredentialRequestMatcher(options.credentialFields) : undefined;
  const unsafeOrdinaryRequest = options.ordinary == null
    ? undefined : await createUnsafeOrdinaryRequestMatcher(options.ordinary.password);
  const target = options.ordinary == null
    ? { ...options.target } : { origin: options.ordinary.origin, url: '' };
  const guard = new BrowserAuthSubmissionGuard(cdp, requests, tabId, frameId, target,
    matchesCredentialRequest, unsafeOrdinaryRequest, active);
  active.set(tabId, guard);
  try {
    await guard.start();
    await previous?.close();
    return guard;
  } catch (error) {
    try {
      await guard.close();
      if (!active.has(tabId) && previous != null) active.set(tabId, previous);
    } catch {}
    throw error;
  }
}

export async function closeBrowserAuthSubmissionGuard(requests, tabId) {
  await activeGuards.get(requests)?.get(tabId)?.close();
}

export async function quiesceBrowserAuthSubmissionGuard(requests, tabId) {
  const guard = activeGuards.get(requests)?.get(tabId);
  if (guard != null) await guard.navigateToBrowserBlank();
}

// Only HMAC digests, a nonextractable key and password length remain in the
// returned matcher. URL decoding and size/variant caps are the source policy.
export async function createUnsafeOrdinaryRequestMatcher(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Browser credential submission is missing its password');
  }
  const key = await webcrypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encoder = new TextEncoder();
  const digest = async value => new Uint8Array(await webcrypto.subtle.sign('HMAC', key, encoder.encode(value)));
  const passwordHash = await digest(password);
  const passwordLength = password.length;
  const containsPassword = async value => {
    if (value.length > 8192) return true;
    const variants = new Set([value]);
    for (const variant of variants) {
      if (variants.size > 128) return true;
      variants.add(variant.replace(/\+/g, ' '));
      variants.add(variant.replace(/(?:%[\da-f]{2})+/gi, encoded => {
        try { return decodeURIComponent(encoded); } catch { return encoded; }
      }));
      for (let offset = 0; offset + passwordLength <= variant.length; offset += 64) {
        const hashes = await Promise.all(Array.from({
          length: Math.min(64, variant.length - passwordLength - offset + 1),
        }, (_, index) => digest(variant.slice(offset + index, offset + index + passwordLength))));
        if (hashes.some(hash => hash.every((byte, index) => byte === passwordHash[index]))) return true;
      }
    }
    return false;
  };
  return async request => {
    if (await containsPassword(request.url)) return true;
    for (const [name, value] of Object.entries(request.headers)) {
      if (name.toLowerCase() === 'referer' && await containsPassword(value)) return true;
    }
    return false;
  };
}

export async function createCredentialRequestMatcher(credentialFields) {
  if (!Array.isArray(credentialFields) || credentialFields.length === 0
    || credentialFields.some(field => field == null || typeof field.name !== 'string'
      || field.name.length === 0 || typeof field.value !== 'string')
    || new Set(credentialFields.map(field => field.name)).size !== credentialFields.length) {
    throw new Error('Browser credential submission is missing a required value');
  }
  const key = await webcrypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encoder = new TextEncoder();
  const digest = async value => new Uint8Array(await webcrypto.subtle.sign('HMAC', key, encoder.encode(value)));
  const fields = await Promise.all(credentialFields.map(async ({ name, value }) => ({ name, hash: await digest(value) })));
  return async request => {
    if (request.postData == null || request.postData.length > 128 * 1024) return false;
    const contentType = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (typeof contentType !== 'string') return false;
    const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase();
    let form;
    try {
      if (mimeType === 'application/x-www-form-urlencoded') form = new URLSearchParams(request.postData);
      else if (mimeType === 'multipart/form-data') {
        form = await new Response(request.postData, { headers: { 'Content-Type': contentType } }).formData();
      } else return false;
      for (const field of fields) {
        const values = form.getAll(field.name);
        const value = values[0];
        if (values.length !== 1 || typeof value !== 'string') return false;
        const hash = await digest(value);
        if (hash.length !== field.hash.length) return false;
        let difference = 0;
        for (const [index, byte] of field.hash.entries()) difference |= byte ^ (hash.at(index) ?? 0);
        if (difference !== 0) return false;
      }
      return true;
    } catch {
      return false;
    }
  };
}

export async function containBrowserAuthDocuments(cdp, tabId, origin, onRejected, ordinary = false) {
  // Source am explicitly exempts ordinary site submissions from private-mode
  // no-child-document/no-worker containment. Its request guard remains active.
  if (ordinary) return true;
  requireMethods(cdp, 'cdp', ['call', 'browserAuthNewTargetCheck']);
  const [{ frameTree }, { root }] = await Promise.all([
    cdp.call(tabId, 'Page.getFrameTree', undefined),
    cdp.call(tabId, 'DOM.getDocument', { depth: -1, pierce: true }),
  ]);
  if (parseRequestUrl(frameTree.frame.securityOrigin)?.origin !== origin) {
    onRejected?.('frame_origin');
    return false;
  }
  if ((frameTree.childFrames?.length ?? 0) !== 0) {
    onRejected?.('child_frames');
    return false;
  }
  const hasNestedDocument = node => ['iframe', 'frame', 'object', 'embed'].includes(node.localName.toLowerCase())
    || [...(node.children ?? []), ...(node.shadowRoots ?? []),
      ...(node.contentDocument == null ? [] : [node.contentDocument])].some(hasNestedDocument);
  if (hasNestedDocument(root)) {
    onRejected?.('nested_document');
    return false;
  }
  const newTargets = await cdp.browserAuthNewTargetCheck(tabId);
  if (newTargets !== 'contained') {
    onRejected?.(newTargets === 'error' ? 'new_targets_error' : 'new_targets');
    return false;
  }
  if (await hasNoServiceWorkers(cdp, tabId, frameTree.frame.id)) return true;
  onRejected?.('service_workers');
  return false;
}

async function hasNoServiceWorkers(cdp, tabId, frameId) {
  try {
    const { executionContextId } = await cdp.call(tabId, 'Page.createIsolatedWorld', {
      frameId, worldName: 'browser-auth-saving-service-workers',
    });
    const result = await cdp.call(tabId, 'Runtime.evaluate', {
      expression: '(async () => { const container = navigator.serviceWorker; if (container == null) return true; if (container.controller != null || (await container.getRegistrations()).length !== 0) return false; return container.controller == null; })()',
      contextId: executionContextId, awaitPromise: true, returnByValue: true,
    });
    return result.exceptionDetails == null && result.result.value === true;
  } catch {
    return false;
  }
}

class BrowserAuthSubmissionGuard {
  constructor(cdp, requests, tabId, frameId, target, matchesCredentialRequest, unsafeOrdinaryRequest, active) {
    this.cdp = cdp;
    this.requests = requests;
    this.tabId = tabId;
    this.frameId = frameId;
    this.target = target;
    this.matchesCredentialRequest = matchesCredentialRequest;
    this.unsafeOrdinaryRequest = unsafeOrdinaryRequest;
    this.active = active;
    this.unblockRawEvents = requireDisposer(cdp.suppressRawNetworkEvents(tabId), 'cdp.suppressRawNetworkEvents');
  }

  removeInterceptor;
  removeWorkerProtection;
  removeNewPageProtection;
  removeWorkerBypass;
  closePromise;
  pausedTargets = new Set();
  closingTargets = new Map();
  detached = false;
  candidateClaimed = false;
  candidate;
  allowedRedirects = new Set();
  allowedUrls = new Set();
  networkRequests = new Map();
  networkResponses = new Map();
  frameNavigations = new Map();
  blankNavigationPromise;
  rejectedDocumentCleanup;
  ordinarySubmissionSettled = false;
  discardRejectedHistory = false;
  outcome;
  requestId = randomUUID();
  firstRejection;
  ordinaryTerminalRejection;
  attemptEvents = [];
  attemptSequence = 0;
  droppedAttemptEvents = 0;
  ordinaryPhase = 'prompt';
  ordinaryFinalFill = false;
  ordinarySubmissionUrl;
  ordinaryNetworkEvents = 0;
  ordinarySiteSubmissionVerified = false;
  ordinarySiteSubmissionSettled = false;
  completeOrdinarySiteSubmission = () => {};
  ordinarySiteSubmission = new Promise(resolve => { this.completeOrdinarySiteSubmission = resolve; });
  complete = () => {};
  completion = new Promise(resolve => { this.complete = resolve; });
  completeRejection = () => {};
  rejection = new Promise(resolve => { this.completeRejection = resolve; });

  async start() {
    this.cdp.on('event', this.onEvent);
    this.cdp.on('tabDetached', this.onTabDetached);
    this.requests.on('requestResolution', this.onRequestResolution);
    const removeInterceptor = requireDisposer(
      await this.requests.addRequestInterceptor(this.tabId, this.onRequest, 100), 'requests.addRequestInterceptor',
    );
    if (this.closePromise != null) {
      await removeInterceptor();
      throw new Error('Browser credential submission closed during setup');
    }
    this.removeInterceptor = removeInterceptor;
    if (this.unsafeOrdinaryRequest == null) {
      this.removeNewPageProtection = requireDisposer(
        await this.cdp.protectBrowserAuthNewTargets(this.tabId), 'cdp.protectBrowserAuthNewTargets',
      );
      this.removeWorkerProtection = requireDisposer(
        await this.cdp.protectServiceWorkerStarts(this.tabId), 'cdp.protectServiceWorkerStarts',
      );
    }
    await this.cdp.call(this.tabId, 'Network.enable', {});
    this.removeWorkerBypass = requireDisposer(
      await this.cdp.protectBrowserAuthServiceWorkerBypass(this.tabId), 'cdp.protectBrowserAuthServiceWorkerBypass',
    );
    if (!await containBrowserAuthDocuments(this.cdp, this.tabId, this.target.origin, undefined,
      this.unsafeOrdinaryRequest != null)
      || (this.unsafeOrdinaryRequest == null ? this.outcome != null : this.currentRejection() != null)) {
      throw new Error('Browser credential submission cannot contain every document');
    }
  }

  async result(timeoutMs) {
    if (this.outcome != null) return this.outcome;
    let timeout;
    const timedOut = new Promise(resolve => { timeout = setTimeout(() => resolve('submission_failed'), Math.min(timeoutMs, 5000)); });
    try { return await Promise.race([this.completion, timedOut]); }
    finally { clearTimeout(timeout); }
  }

  async ordinaryResult() {
    try { await this.cdp.call(this.tabId, 'Page.getFrameTree', undefined, preservedDebugger); }
    catch (error) { if (this.rejectedDocumentCleanup == null) throw error; }
    await this.waitForOrdinaryDocumentCleanup();
    return this.ordinaryTerminalRejection?.outcome ?? 'submitted';
  }

  async waitForOrdinaryDocumentCleanup() { await this.rejectedDocumentCleanup; }
  settleOrdinarySubmission() { this.ordinarySubmissionSettled = true; }

  recordAttempt(event) {
    if (this.unsafeOrdinaryRequest == null) return;
    const entry = { ...event, sequence: Math.min(this.attemptSequence++, 65535), phase: this.ordinaryPhase };
    if (this.attemptEvents.length < 63) this.attemptEvents.push(entry);
    else if (event.kind === 'attempt_completed' && this.attemptEvents.length < 64) this.attemptEvents.push(entry);
    else this.droppedAttemptEvents = Math.min(this.droppedAttemptEvents + 1, 65535);
  }

  beginOrdinaryFill(fieldIndex, finalFill, submissionUrl) {
    this.ordinaryPhase = 'filling';
    this.ordinaryFinalFill = finalFill;
    this.ordinarySubmissionUrl = submissionUrl;
    this.recordAttempt({ kind: 'field_fill_started', field_index: Math.min(fieldIndex, 63) });
  }

  completeOrdinaryFill(fieldIndex) {
    this.recordAttempt({ kind: 'field_fill_completed', field_index: Math.min(fieldIndex, 63) });
    if (this.ordinaryFinalFill) this.ordinaryPhase = 'before_submit';
  }

  beginOrdinarySubmit() {
    this.ordinaryPhase = 'submitting';
    this.recordAttempt({ kind: 'submit_started' });
  }

  completeOrdinaryAttempt(outcome) {
    this.recordAttempt({ kind: 'attempt_completed', outcome });
    this.ordinaryPhase = 'settled';
  }

  refreshOrdinaryDocument(frameId, origin) {
    if (this.unsafeOrdinaryRequest != null) {
      this.frameId = frameId;
      this.target.origin = origin;
    }
  }

  async verifiedOrdinarySiteSubmission(timeoutMs) {
    if (this.unsafeOrdinaryRequest == null) return false;
    try { await this.cdp.call(this.tabId, 'Page.getFrameTree', undefined, preservedDebugger); }
    catch { return this.ordinarySiteSubmissionVerified; }
    if (this.ordinarySiteSubmissionSettled) return this.ordinarySiteSubmissionVerified;
    if (this.candidate == null) return false;
    let timeout;
    try {
      return await Promise.race([this.ordinarySiteSubmission, new Promise(resolve => {
        timeout = setTimeout(() => resolve(false), Math.min(timeoutMs, 5000));
      })]);
    } finally { clearTimeout(timeout); }
  }

  currentRejection() {
    return this.unsafeOrdinaryRequest != null ? this.ordinaryTerminalRejection?.outcome ?? null
      : this.outcome === 'origin_changed' || this.outcome === 'submission_failed' ? this.outcome : null;
  }

  diagnostics() {
    return {
      schema_version: 1,
      request_id: this.requestId,
      submission_mode: this.unsafeOrdinaryRequest == null ? 'private' : 'ordinary',
      first_rejection: this.firstRejection,
      terminal_rejection: this.unsafeOrdinaryRequest == null ? this.firstRejection : this.ordinaryTerminalRejection,
      attempt_events: this.unsafeOrdinaryRequest == null ? undefined : [...this.attemptEvents],
      dropped_attempt_events: this.unsafeOrdinaryRequest == null ? undefined : this.droppedAttemptEvents,
    };
  }

  whenRejected() { return this.rejection; }

  navigateToBrowserBlank() {
    if (this.blankNavigationPromise == null) {
      const navigation = this.quiesceWebsite();
      this.blankNavigationPromise = navigation;
      navigation.catch(() => {
        if (this.blankNavigationPromise === navigation) this.blankNavigationPromise = undefined;
      });
    }
    return this.blankNavigationPromise;
  }

  async quiesceWebsite() {
    const before = await this.cdp.call(this.tabId, 'Page.getFrameTree', undefined);
    if (this.detached || before.frameTree.frame.id !== this.frameId) {
      throw new Error('Browser cannot quiesce the credential document');
    }
    const navigated = this.cdp.waitForEvent(this.tabId, event => {
      if (event.source.sessionId != null || event.source.targetId != null
        || event.method !== 'Page.frameNavigated' || event.params == null || !('frame' in event.params)) return false;
      const frame = event.params.frame;
      return typeof frame === 'object' && frame != null && 'id' in frame && frame.id === this.frameId
        && (!('parentId' in frame) || frame.parentId == null) && 'url' in frame && frame.url === 'about:blank'
        && (!('unreachableUrl' in frame) || frame.unreachableUrl == null);
    }, { timeoutMs: 5000, timeoutMessage: 'Browser could not quiesce the credential document' })
      .then(() => true, () => false);
    const navigation = await this.cdp.call(this.tabId, 'Page.navigate', { url: 'about:blank' }, preservedDebugger);
    const observed = await navigated;
    const frame = (await this.cdp.call(this.tabId, 'Page.getFrameTree', undefined)).frameTree.frame;
    if (this.detached || !observed || navigation.errorText || navigation.isDownload === true
      || !navigation.loaderId || navigation.frameId !== this.frameId || frame.id !== this.frameId
      || frame.loaderId !== navigation.loaderId || frame.loaderId === before.frameTree.frame.loaderId
      || frame.url !== 'about:blank' || frame.unreachableUrl != null) {
      throw new Error('Browser cannot quiesce the credential document');
    }
    if (this.discardRejectedHistory) await this.cdp.call(this.tabId, 'Page.resetNavigationHistory', undefined, preservedDebugger);
    await this.close();
  }

  rejectOrdinaryRequest(request, outcome, reason) {
    if (request.resourceType === 'Document' && request.frameId === this.frameId && this.rejectedDocumentCleanup == null) {
      this.discardRejectedHistory = true;
      this.rejectedDocumentCleanup = Promise.resolve().then(async () => {
        try { await this.cdp.call(this.tabId, 'Page.stopLoading', undefined, preservedDebugger); } catch {}
        await this.navigateToBrowserBlank();
      });
      this.rejectedDocumentCleanup.catch(() => {});
    }
    this.setOutcome(outcome, reason, request.resourceType === 'Document' ? 'main_document' : 'background');
    return 'block';
  }

  close() {
    if (this.closePromise == null) {
      const closing = this.dispose();
      this.closePromise = closing;
      closing.catch(() => { if (this.closePromise === closing) this.closePromise = undefined; });
    }
    return this.closePromise;
  }

  async dispose() {
    await this.stopPausedTargets();
    await this.removeWorkerProtection?.();
    await this.removeNewPageProtection?.();
    await this.removeWorkerBypass?.();
    await this.removeInterceptor?.();
    if (!this.detached) await this.cdp.call(this.tabId, 'Runtime.discardConsoleEntries', undefined, preservedDebugger);
    if (this.active.get(this.tabId) === this) this.active.delete(this.tabId);
    this.cdp.removeListener('event', this.onEvent);
    this.cdp.removeListener('tabDetached', this.onTabDetached);
    this.requests.removeListener('requestResolution', this.onRequestResolution);
    this.unblockRawEvents();
  }

  stopPausedTarget(targetId) {
    const current = this.closingTargets.get(targetId);
    if (current != null) return current;
    if (this.detached || !this.pausedTargets.has(targetId)) return Promise.resolve();
    const closing = this.cdp.closeBrowserAuthPausedTarget(this.tabId, targetId).then(closed => {
      if (!closed && this.pausedTargets.has(targetId)) throw new Error('Browser could not stop a protected target');
      this.pausedTargets.delete(targetId);
    }).finally(() => {
      if (this.closingTargets.get(targetId) === closing) this.closingTargets.delete(targetId);
    });
    this.closingTargets.set(targetId, closing);
    return closing;
  }

  async stopPausedTargets() {
    while (!this.detached) {
      await Promise.all([...this.closingTargets.values(), ...[...this.pausedTargets].map(targetId => this.stopPausedTarget(targetId))]);
      if (this.detached) break;
      await this.cdp.call(this.tabId, 'Target.getTargets', {}, preservedDebugger);
      if (this.pausedTargets.size === 0 && this.closingTargets.size === 0) return;
    }
    this.pausedTargets.clear();
  }

  setOutcome(outcome, reason, requestClass = 'other') {
    if (outcome !== 'submitted') {
      const rejection = {
        outcome, reason: reason ?? 'other', request_class: requestClass,
        submission_phase: this.unsafeOrdinaryRequest == null ? 'not_applicable'
          : this.ordinarySubmissionSettled ? 'settled' : 'pending',
      };
      this.firstRejection ??= rejection;
      if (this.unsafeOrdinaryRequest != null && requestClass !== 'background') this.ordinaryTerminalRejection ??= rejection;
    }
    if (this.outcome == null) {
      this.outcome = outcome;
      this.complete(outcome);
      if (outcome !== 'submitted') this.completeRejection(outcome);
    }
  }

  onTabDetached = tabId => {
    if (tabId !== this.tabId) return;
    this.detached = true;
    this.setOutcome('submission_failed');
    this.close().catch(() => {});
  };

  onEvent = event => {
    if (event.source.tabId !== this.tabId) return;
    if (event.method === 'Page.windowOpen' && this.unsafeOrdinaryRequest == null
      || event.method === 'Page.javascriptDialogOpening') {
      this.setOutcome('submission_failed');
      return;
    }
    if (event.method === 'Target.attachedToTarget') {
      if (this.unsafeOrdinaryRequest != null) return;
      const target = event.params.targetInfo;
      if (target.type === 'service_worker' || target.type === 'iframe' && event.params.waitingForDebugger) {
        this.setOutcome(target.type === 'service_worker' ? 'submission_failed' : 'origin_changed',
          target.type === 'iframe' ? 'paused_iframe' : 'other');
        if (event.params.waitingForDebugger) {
          this.pausedTargets.add(target.targetId);
          this.stopPausedTarget(target.targetId).catch(() => {});
        }
        return;
      }
      if (target.type === 'iframe' && parseRequestUrl(target.url)?.origin !== this.target.origin) {
        this.setOutcome('origin_changed', 'iframe_origin');
      }
      return;
    }
    if (event.method === 'Target.targetDestroyed') {
      this.pausedTargets.delete(event.params.targetId);
      return;
    }
    if (this.unsafeOrdinaryRequest == null && event.method === 'Page.frameNavigated' && event.params.frame.id !== this.frameId) {
      const { frame } = event.params;
      if (!(frame.url === 'about:blank' || frame.url === 'about:srcdoc')
        && parseRequestUrl(frame.securityOrigin)?.origin !== this.target.origin) {
        this.setOutcome('origin_changed', 'child_frame_origin');
      }
      return;
    }
    if (event.source.sessionId != null || event.source.targetId != null) return;
    if (event.method === 'Network.requestWillBeSent') {
      const { requestId, loaderId, frameId, type, request, redirectResponse } = event.params;
      if (frameId !== this.frameId || type !== 'Document' || redirectResponse != null || this.networkRequests.size >= 32) return;
      const url = parseRequestUrl(request.url);
      if (url != null) this.networkRequests.set(requestId, { loaderId, url: url.href, method: request.method });
    } else if (event.method === 'Network.responseReceived') {
      const { requestId, loaderId, frameId, type, response } = event.params;
      const url = parseRequestUrl(response.url);
      if (frameId !== this.frameId || type !== 'Document' || url == null || response.status < 200 || response.status > 599
        || [204, 205, 301, 302, 303, 307, 308].includes(response.status) || this.networkResponses.size >= 32) return;
      this.networkResponses.set(requestId, { loaderId, url: url.href });
    } else if (event.method === 'Network.loadingFailed') {
      if (event.params.requestId === this.candidate?.networkId) {
        if (this.unsafeOrdinaryRequest == null) this.setOutcome('submission_failed');
        else {
          this.ordinarySiteSubmissionSettled = true;
          this.completeOrdinarySiteSubmission(false);
        }
      }
      return;
    } else if (event.method === 'Page.frameNavigated') {
      const { frame } = event.params;
      if (frame.id !== this.frameId) return;
      const url = parseRequestUrl(frame.url);
      if (url == null || this.frameNavigations.size >= 32) return;
      if (this.unsafeOrdinaryRequest != null && !this.ordinarySubmissionSettled) {
        this.recordAttempt({ kind: 'site_navigation', origin_relation: url.origin === this.target.origin ? 'same' : 'cross' });
      }
      this.frameNavigations.set(frame.loaderId, { url: url.href, reachable: frame.unreachableUrl == null });
    } else return;
    this.finishCandidate();
  };

  onRequestResolution = (tabId, request, resolution) => {
    if (tabId !== this.tabId || !this.allowedRedirects.has(request.requestId)) return;
    if (resolution === 'blocked') {
      if (this.unsafeOrdinaryRequest == null) this.setOutcome('submission_failed');
      else {
        this.ordinarySiteSubmissionSettled = true;
        this.completeOrdinarySiteSubmission(false);
      }
      return;
    }
    if (request.requestId === this.candidate?.fetchId) this.candidate.released = true;
    this.finishCandidate();
  };

  finishCandidate() {
    const candidate = this.candidate;
    if (candidate == null || !candidate.released
      || (this.unsafeOrdinaryRequest == null ? this.outcome != null : this.currentRejection() != null)) return;
    const request = this.networkRequests.get(candidate.networkId);
    const response = this.networkResponses.get(candidate.networkId);
    if (request == null || response == null || request.loaderId !== response.loaderId || request.method !== 'POST'
      || this.unsafeOrdinaryRequest == null && request.url !== this.target.url || !this.allowedUrls.has(response.url)) return;
    const navigation = this.frameNavigations.get(request.loaderId);
    if (navigation == null) return;
    if (!navigation.reachable || navigation.url !== response.url) {
      if (this.unsafeOrdinaryRequest == null) this.setOutcome('submission_failed');
      else {
        this.ordinarySiteSubmissionSettled = true;
        this.completeOrdinarySiteSubmission(false);
      }
      return;
    }
    if (this.unsafeOrdinaryRequest != null) {
      if (!this.ordinarySiteSubmissionSettled) {
        this.ordinarySiteSubmissionVerified = true;
        this.ordinarySiteSubmissionSettled = true;
        this.recordAttempt({ kind: 'site_submission_verified' });
        this.completeOrdinarySiteSubmission(true);
      }
      return;
    }
    this.setOutcome('submitted');
    this.close().catch(() => {});
  }

  onRequest = async paused => {
    const { request } = paused;
    if (this.unsafeOrdinaryRequest != null) {
      if (paused.frameId !== this.frameId) return;
      const url = parseRequestUrl(request.url);
      if (url == null || url.protocol !== 'https:') {
        return this.rejectOrdinaryRequest(paused, 'origin_changed', url == null ? 'request_url_invalid' : 'request_scheme');
      }
      const rejection = this.currentRejection();
      if (rejection != null && (!this.ordinarySubmissionSettled || this.rejectedDocumentCleanup != null)) {
        return this.rejectOrdinaryRequest(paused, rejection);
      }
      if (await this.unsafeOrdinaryRequest(request)) return this.rejectOrdinaryRequest(paused, 'submission_failed');
      if (!this.ordinarySubmissionSettled && this.ordinaryNetworkEvents++ < 8) {
        this.recordAttempt({
          kind: 'site_request', request_class: paused.resourceType === 'Document' ? 'main_document' : 'background',
          method: request.method === 'GET' ? 'get' : request.method === 'POST' ? 'post' : 'other',
          origin_relation: url.origin === this.target.origin ? 'same' : 'cross',
        });
      }
      if (paused.resourceType === 'Document' && paused.networkId != null && this.candidate == null
        && request.method === 'POST' && url.href === this.ordinarySubmissionUrl
        && (this.ordinaryPhase === 'filling' && this.ordinaryFinalFill || this.ordinaryPhase === 'before_submit')) {
        this.candidate = { fetchId: paused.requestId, networkId: paused.networkId, released: false };
        this.allowedRedirects.add(paused.requestId);
        this.allowedUrls.add(url.href);
      } else if (paused.resourceType === 'Document' && paused.redirectedRequestId != null
        && this.allowedRedirects.has(paused.redirectedRequestId)) {
        this.allowedRedirects.add(paused.requestId);
        this.allowedUrls.add(url.href);
      }
      return;
    }
    const requestClass = paused.frameId === this.frameId && paused.resourceType === 'Document' ? 'main_document' : 'background';
    const url = parseRequestUrl(request.url);
    if (url == null) {
      this.setOutcome('origin_changed', 'request_url_invalid', requestClass);
      return 'block';
    }
    const readOnly = request.method === 'GET' || request.method === 'HEAD';
    if (readOnly && paused.frameId === this.frameId && paused.resourceType === 'Document'
      && paused.redirectedRequestId != null && this.allowedRedirects.has(paused.redirectedRequestId)
      && url.protocol === 'https:' && url.origin === this.target.origin && this.outcome == null) {
      this.allowedRedirects.add(paused.requestId);
      this.allowedUrls.add(url.href);
      return;
    }
    if (url.origin !== this.target.origin || url.protocol !== 'https:') {
      this.setOutcome('origin_changed', url.protocol !== 'https:' ? 'request_scheme' : 'request_origin', requestClass);
      return 'block';
    }
    if (paused.frameId !== this.frameId || paused.resourceType !== 'Document') {
      if (readOnly) return;
      this.setOutcome('submission_failed', 'other', requestClass);
      return 'block';
    }
    if (request.method !== 'POST' || url.href !== this.target.url || this.candidateClaimed || paused.networkId == null) {
      this.setOutcome('origin_changed', 'other', requestClass);
      return 'block';
    }
    this.candidateClaimed = true;
    if (this.matchesCredentialRequest == null || !await this.matchesCredentialRequest(request) || this.outcome != null) {
      this.setOutcome('submission_failed', 'other', requestClass);
      return 'block';
    }
    this.candidate = { fetchId: paused.requestId, networkId: paused.networkId, released: false };
    this.allowedRedirects.add(paused.requestId);
    this.allowedUrls.add(url.href);
  };
}
