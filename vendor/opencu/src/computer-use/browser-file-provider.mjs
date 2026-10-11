import { lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { inspectFileInputTarget } from './browser-download-media.mjs';

const validGuid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const denied = () => Object.assign(new Error('The configured file policy denied this browser operation'), { code: 'FILE_POLICY_DENIED' });
const sourceUrl = value => { const url = new URL(value); url.hash = ''; return url.href; };
const header = (headers, name) => headers?.find(entry => entry.name.toLowerCase() === name)?.value;

async function nativeFileBinding(browser, record, signal) {
  signal?.throwIfAborted();
  if (!browser.hub?.service || typeof browser.existingLink !== 'function') throw new Error('This browser has no private native file transport');
  const { nativeTabId, gateway, link, record: actual, assertBinding } = await browser.existingLink(record.sessionId, record.id, signal);
  assertBinding();
  const root = link.capabilityAdapter.resolveTarget(), nativeRoot = gateway.native.get('')?.info;
  if (actual !== record || gateway.epoch !== browser.info.epoch || !nativeRoot || root.targetId !== nativeRoot.targetId
    || root.targetId !== gateway.targetInfo?.targetId || root.url !== record.page.url()) throw new Error('The native file browser binding changed');
  signal?.throwIfAborted();
  return Object.freeze({ epoch: browser.info.epoch, tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId,
    rootTargetId: root.targetId, rootUrl: root.url });
}

function interceptMedia(browser, record, context, state, authorize, check, fail, begun, progressed) {
  const source = sourceUrl(context.source), requests = new Set(), paused = new Set(), stoppingRequests = new Map();
  let cdp, enabled = false, detached = false, stopping, detaching;
  const removeListeners = () => {
    cdp?.removeListener('Fetch.requestPaused', requestPaused);
    cdp?.removeListener('Page.downloadWillBegin', begun);
    cdp?.removeListener('Page.downloadProgress', progressed);
    cdp?.removeListener('close', disconnected);
  };
  const disconnected = () => {
    detached = true;
    enabled = false;
    removeListeners();
    if (!state.closed && !state.done) fail(new Error('The media frame disconnected during download'));
  };
  const stopRequest = id => {
    if (stoppingRequests.has(id)) return stoppingRequests.get(id);
    const task = (async () => {
      await cdp.send('Fetch.failRequest', { requestId: id, errorReason: 'Aborted' });
      paused.delete(id);
      if (state.committedRequestId === id && !state.guid) {
        state.responseCommitted = false;
        state.committedRequestId = null;
      }
    })().finally(() => { if (stoppingRequests.get(id) === task) stoppingRequests.delete(id); });
    stoppingRequests.set(id, task); return task;
  };
  const requestPaused = event => {
    void handle(event).catch(error => { if (!state.closed) fail(error); });
  };
  async function handle(event) {
    const response = event.responseStatusCode != null || event.responseErrorReason != null;
    const url = sourceUrl(event.request.url);
    if (!response && event.resourceType === 'Document' && event.frameId === context.frameId
      && (requests.size === 0 && url === source || requests.has(event.redirectedRequestId))) requests.add(event.requestId);
    if (!requests.has(event.requestId)) {
      const attachment = /^attachment(?:\s*;|\s*$)/i.test(header(event.responseHeaders, 'content-disposition') ?? '');
      const binary = header(event.responseHeaders, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/octet-stream';
      if (response && state.exclusiveDownloadResponses && (attachment || binary)) {
        paused.add(event.requestId); await stopRequest(event.requestId); return;
      }
      await cdp.send(response ? 'Fetch.continueResponse' : 'Fetch.continueRequest', { requestId: event.requestId });
      return;
    }
    paused.add(event.requestId);
    try {
      if (state.closed) { await stopRequest(event.requestId); return; }
      if (!response) {
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
        paused.delete(event.requestId);
        return;
      }
      if (event.responseErrorReason) throw new Error('The requested media response failed');
      if ([301, 302, 303, 307, 308].includes(event.responseStatusCode) && header(event.responseHeaders, 'location')) {
        await cdp.send('Fetch.continueResponse', { requestId: event.requestId });
        paused.delete(event.requestId);
        return;
      }
      const contentType = header(event.responseHeaders, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      const attachment = /^attachment(?:\s*;|\s*$)/i.test(header(event.responseHeaders, 'content-disposition') ?? '');
      const media = contentType === 'application/pdf' || contentType?.startsWith('image/') || contentType?.startsWith('video/');
      if (event.responseStatusCode < 200 || event.responseStatusCode >= 300 || !attachment && !media && contentType !== 'application/octet-stream') {
        throw new Error('The requested response cannot be downloaded as supported media');
      }
      await state.awaitNativeDownloadPermit?.();
      await authorize('ensureDownloadSourcePolicyAllowed', { ...context, source: event.request.url, requestedSource: context.source });
      check(context);
      if (state.closed) { await stopRequest(event.requestId); return; }
      const responseHeaders = media && !attachment
        ? event.responseHeaders.some(entry => entry.name.toLowerCase() === 'content-disposition')
          ? event.responseHeaders.map(entry => entry.name.toLowerCase() === 'content-disposition' ? { ...entry, value: entry.value.replace(/^[^;]*/u, 'attachment') } : entry)
          : [...event.responseHeaders, { name: 'Content-Disposition', value: 'attachment' }]
        : undefined;
      state.allowedUrls.add(url);
      state.responseCommitted = true;
      state.committedRequestId = event.requestId;
      await cdp.send('Fetch.continueResponse', { requestId: event.requestId, ...(responseHeaders ? {
        responseCode: event.responseStatusCode,
        ...(event.responseStatusText ? { responsePhrase: event.responseStatusText } : {}), responseHeaders,
      } : {}) });
      paused.delete(event.requestId);
    } catch (error) {
      // Keep a failed abort in paused so revoke can retry it before detaching.
      if (paused.has(event.requestId)) { try { await stopRequest(event.requestId); } catch {} }
      throw error;
    }
  }
  const ready = (async () => {
    const binding = (await browser.frameBindings(record)).find(binding => binding.frameId === context.frameId);
    if (!binding) throw new Error('The media frame is no longer available');
    let frame = binding.frame;
    while (frame) {
      try { cdp = await record.page.context().newCDPSession(frame); break; }
      catch (error) { if (!error.message.includes('part of the parent frame')) throw error; frame = frame.parentFrame(); }
    }
    if (!cdp) throw new Error('The media frame does not support response interception');
    cdp.on('close', disconnected);
    cdp.on('Page.downloadWillBegin', begun);
    cdp.on('Page.downloadProgress', progressed);
    await cdp.send('Page.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const contains = tree => tree?.frame?.id === context.frameId || tree?.childFrames?.some(contains);
    if (!contains(frameTree)) throw new Error('The media frame changed before download setup');
    cdp.on('Fetch.requestPaused', requestPaused);
    enabled = true;
    await cdp.send('Fetch.enable', { patterns: [
      { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' },
      { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
    ] });
    check(context);
  })();
  ready.catch(() => {});
  return {
    ready,
    stopResponses() {
      if (stopping) return stopping;
      const pending = (async () => {
        await ready.catch(() => {});
        if (!cdp || detached) return;
        for (const id of [...paused]) await stopRequest(id);
        if (enabled) { await cdp.send('Fetch.disable'); enabled = false; }
      })().finally(() => { if (stopping === pending) stopping = null; });
      stopping = pending;
      return pending;
    },
    detach() {
      if (detaching) return detaching;
      const pending = (async () => {
        await ready.catch(() => {});
        if (!cdp || detached) return;
        await cdp.detach(); detached = true; removeListeners();
      })().finally(() => { if (detaching === pending) detaching = null; });
      detaching = pending;
      return pending;
    },
  };
}

// Uploads use the same host policy for managed and extension-backed browsers.
// An absent policy cannot manufacture permission to expose local file paths.
export function createBrowserUploadProvider(browser, { filePolicy } = {}) {
  const resolveBinding = async ({ record, frame, frameId, signal, expectedSession }) => {
    signal?.throwIfAborted();
    if (typeof record.assertFileAccess !== 'function' || await record.assertFileAccess() === false) throw new Error('The browser tab file access ownership changed');
    const bindings = await browser.frameBindings(record);
    const binding = bindings.find(value => (frame === undefined || value.frame === frame) && (frameId === undefined || value.frameId === frameId));
    if (!binding || binding.frame.isDetached()) throw Object.assign(new Error('The receiving file input frame is no longer attached'), { code: 'STALE_FILE_UPLOAD' });
    // Codex UJ/qJ rejects OOPIF chooser uploads. Same-process descendants use
    // the actual shared parent CDP session and their own document identities.
    if (binding.cdp !== record.cdp) throw Object.assign(new Error('File uploads in out-of-process frames are not supported.'), { code: 'UNSUPPORTED_FILE_UPLOAD_FRAME' });
    if (expectedSession !== undefined && binding.cdp !== expectedSession) throw Object.assign(new Error('The receiving file input CDP session changed'), { code: 'STALE_FILE_UPLOAD' });
    signal?.throwIfAborted();
    if (await record.assertFileAccess() === false) throw new Error('The browser tab file access ownership changed');
    return binding;
  };
  return {
    resolveFileUploadBinding: resolveBinding,
    async ensureFileUploadAllowed(context) {
      context.signal?.throwIfAborted();
      if (browser.closing || context.record?.page?.isClosed?.() !== false || context.isActive?.() === false) throw new Error('The browser upload operation is no longer active');
      if (typeof filePolicy?.ensureFileUploadAllowed !== 'function') throw Object.assign(new Error('Browser uploads require a real DSH file upload policy'), { code: 'FILE_UPLOAD_UNAVAILABLE' });
      if (typeof context.record.assertFileAccess !== 'function') throw new Error('The browser record has no trusted file access ownership inspector');
      await context.record.assertFileAccess();
      const { record, target, signal } = context;
      if (!target || !Number.isSafeInteger(target.backendNodeId)) throw new Error('Browser uploads require an inspected receiving file input');
      return await filePolicy.ensureFileUploadAllowed({ ...context,
        ...(browser.hub?.service ? { browserService: browser.hub.service,
          inspectBrowserBinding: () => nativeFileBinding(browser, record, signal) } : {}),
        inspectTarget: async () => inspectFileInputTarget(record, target.backendNodeId, signal, {
          frameId: target.frameId,
          binding: await resolveBinding({ record, frame: target.frameIdentity, frameId: target.frameId, signal, expectedSession: target.sessionIdentity }),
        }),
      });
    },
    async releaseTab({ record }) {
      if (typeof filePolicy?.releaseTab === 'function') await filePolicy.releaseTab(record);
    },
  };
}

// Stock DownloadItem identities come from the private companion service, not
// Chromium GUIDs or model paths. Response interception keeps the source policy.
export function createPluginBrowserFileProvider(browser, { filePolicy, adapter } = {}) {
  if (!adapter || adapter.service !== browser.hub?.service) throw new Error('The native file provider has no matching companion adapter');
  const operations = new WeakMap();
  const check = context => {
    context.signal?.throwIfAborted();
    if (browser.closing || context.record.page.isClosed() || context.isActive?.() === false) throw new Error('The native browser file operation is no longer active');
  };
  const authorize = async (method, context) => {
    check(context);
    if (filePolicy != null) {
      if (typeof filePolicy[method] !== 'function') throw new Error(`The configured file policy does not support ${method}`);
      const action = () => filePolicy[method](context);
      const result = await (context.runPermission ? context.runPermission(action) : action());
      if (result === false || result?.allowed === false) throw denied();
    }
    check(context);
  };
  const remember = (record, snapshot) => {
    const state = snapshot.state === 'progressing' ? 'inProgress' : snapshot.state === 'cancelled' ? 'canceled' : snapshot.state;
    browser.downloadHistory.set(snapshot.id, { id: snapshot.id, sessionId: record.sessionId, tabId: record.id, browserId: browser.id,
      filename: snapshot.filename, url: snapshot.sourceUrl, startedAt: snapshot.startedAtMs, updatedAt: snapshot.updatedAtMs,
      state, receivedBytes: snapshot.receivedBytes, totalBytes: snapshot.totalBytes, paused: snapshot.paused, resumable: snapshot.resumable,
      nativeDownloadId: snapshot.id, ...(snapshot.state === 'completed' && snapshot.fileExists === true ? { path: snapshot.path } : {}) });
  };

  async function enable(context, media = false) {
    check(context);
    if (operations.has(context.record)) throw new Error('A native download is already active in this tab');
    await authorize('ensureDownloadSourcePolicyAllowed', context);
    if (operations.has(context.record)) throw new Error('A native download is already active in this tab');
    let source;
    if (media) {
      source = new URL(context.source);
      if (!['http:', 'https:', 'blob:'].includes(source.protocol)) throw new Error('This media source is not supported by the native browser');
      const current = new URL(context.record.page.url());
      if (source.protocol === 'blob:' && (!['http:', 'https:'].includes(current.protocol) || source.origin !== current.origin)) throw new Error('Blob downloads must come from the current website');
    }
    let permitReady, permitFailed;
    const readiness = new Promise((resolve, reject) => { permitReady = resolve; permitFailed = reject; });
    readiness.catch(() => {});
    const state = { closed: false, done: false, cleanup: null, interceptor: null, revokePermit: null, responseCommitted: false,
      committedRequestId: null, guid: null, allowedUrls: new Set(), error: null, nativeContext: null };
    if (media && source.protocol !== 'blob:') {
      state.exclusiveDownloadResponses = true;
      state.awaitNativeDownloadPermit = () => readiness;
    }
    const revoke = () => {
      if (state.cleanup) return state.cleanup;
      state.closed = true;
      permitFailed(state.error ?? new Error('The native download intent was revoked'));
      const task = (async () => {
        const errors = [];
        try { await state.interceptor?.stopResponses(); } catch (error) { errors.push(error); }
        try {
          if (state.revokePermit) await state.revokePermit();
          else await adapter.disableDownload({ record: context.record });
        } catch (error) { errors.push(error); }
        try { await state.interceptor?.detach(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Native download revocation did not complete');
        if (operations.get(context.record) === state) operations.delete(context.record);
      })().finally(() => { if (state.cleanup === task) state.cleanup = null; });
      state.cleanup = task; return task;
    };
    const failed = error => { state.error = error; void revoke().catch(cleanup => browser.onDownloadError?.(cleanup)); };
    state.revoke = revoke;
    operations.set(context.record, state);
    state.nativeContext = { ...context, ...(media && source.protocol !== 'blob:' ? { source: sourceUrl(context.source) } : {}),
      inspectBrowserBinding: () => nativeFileBinding(browser, context.record, context.signal),
      onDownloadSnapshot: snapshot => remember(context.record, snapshot) };
    try {
      if (media && source.protocol !== 'blob:') {
        state.interceptor = interceptMedia(browser, context.record, context, state, authorize, check, failed, () => {}, () => {});
        await state.interceptor.ready;
      }
      if (state.closed || state.error) throw state.error ?? new Error('The native download setup was revoked');
      state.revokePermit = await adapter.enableDownload(state.nativeContext);
      permitReady();
      check(context);
      if (state.error) throw state.error;
    } catch (error) {
      permitFailed(error);
      try { await revoke(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native download setup and cleanup failed', { cause: error }); }
      throw error;
    }
    return revoke;
  }

  return {
    ...createBrowserUploadProvider(browser, { filePolicy }),
    nativeDownloadIdentity: true,
    ensureDownloadSourcePolicyAllowed: context => authorize('ensureDownloadSourcePolicyAllowed', context),
    enableDownload: context => enable(context),
    enableMediaDownload: context => enable(context, true),
    beginMediaDownload({ record }) {
      const state = operations.get(record);
      if (!state || state.closed || state.done) throw new Error('The native media download intent is no longer active');
    },
    async waitForDownload(context) {
      check(context);
      const state = operations.get(context.record);
      if (!state || state.closed) throw new Error('No native download intent is active in this tab');
      if (state.error) throw state.error;
      const result = await adapter.waitForDownload({ ...state.nativeContext, timeoutMs: context.timeoutMs });
      state.done = true;
      return result;
    },
    async listDownloads(context) {
      check(context);
      const downloads = await adapter.listDownloads({ ...context,
        inspectBrowserBinding: () => nativeFileBinding(browser, context.record, context.signal) });
      check(context);
      return downloads;
    },
    async saveDownload(context) {
      check(context);
      const result = await adapter.saveDownload({ ...context,
        inspectBrowserBinding: () => nativeFileBinding(browser, context.record, context.signal),
        authorizeSource: source => authorize('ensureDownloadSourcePolicyAllowed', { ...context, source }),
      });
      check(context);
      return result;
    },
    async disableDownload({ record }) { await operations.get(record)?.revoke(); },
  };
}

// Managed downloads already use allowAndName. Each operation observes that
// policy without replacing browser-wide settings or another tab's download.
export function createManagedFileProvider(browser, { filePolicy } = {}) {
  const operations = new WeakMap();
  const check = context => {
    context.signal?.throwIfAborted();
    if (context.isActive?.() === false) throw new Error('The browser file operation is no longer active');
    if (browser.closing || context.record.page.isClosed()) throw new Error('The browser tab is no longer available');
  };
  const authorize = async (method, context) => {
    check(context);
    if (filePolicy != null) {
      if (typeof filePolicy[method] !== 'function') throw new Error(`The configured file policy does not support ${method}`);
      const action = () => filePolicy[method](context);
      const result = await (context.runPermission ? context.runPermission(action) : action());
      if (result === false || result?.allowed === false) throw denied();
    }
    check(context);
  };
  const pathFor = async guid => {
    if (!validGuid(guid) || !isAbsolute(browser.directory)) throw new Error('Invalid managed browser download identity');
    const directory = join(browser.directory, 'downloads'), path = join(directory, guid);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(path) !== join(await realpath(directory), guid)) {
      throw new Error('The downloaded file is outside the managed browser directory');
    }
    return path;
  };

  async function enable(context, media = false) {
    check(context);
    const { record, signal, frameId } = context;
    if (operations.has(record)) throw new Error('A managed download is already active in this tab');
    await authorize('ensureDownloadSourcePolicyAllowed', context);
    let source;
    if (media) {
      source = new URL(context.source);
      if (!['http:', 'https:', 'blob:'].includes(source.protocol)) throw new Error('This media source is not supported by the managed browser');
      if (source.protocol === 'blob:') {
        const current = new URL(record.page.url());
        if (!['http:', 'https:'].includes(current.protocol) || source.origin !== current.origin) throw new Error('Blob downloads must come from the current website');
      }
    }
    if (!isAbsolute(browser.directory)) throw new Error('The managed browser directory must be absolute');
    await mkdir(join(browser.directory, 'downloads'), { recursive: true, mode: 0o700 });
    check(context);
    if (operations.has(record)) throw new Error('A managed download is already active in this tab');
    const completed = Promise.withResolvers();
    completed.promise.catch(() => {});
    const started = Promise.withResolvers();
    started.promise.catch(() => {});
    const previousIds = new Set(browser.downloadHistory.keys());
    const previousDownloads = new Set(record.downloads?.values() ?? []);
    const state = { completed: completed.promise, guid: null, candidate: null, done: false, closed: false, cleanup: null, revoke: null, interceptor: null, cancelConfirmed: false, responseCommitted: false, committedRequestId: null, blob: source?.protocol === 'blob:', signal, allowedUrls: new Set() };
    if (source?.protocol === 'blob:') state.allowedUrls.add(context.source);
    let timer;
    const removeListeners = () => {
      clearTimeout(timer);
      record.cdp.removeListener('Page.downloadWillBegin', begun);
      record.cdp.removeListener('Page.downloadProgress', progressed);
      record.cdp.removeListener('close', disconnected);
      record.page.removeListener('download', downloaded);
      record.page.removeListener('close', disconnected);
      signal?.removeEventListener('abort', aborted);
    };
    const finish = (error, value) => {
      if (state.closed || state.done) return;
      state.done = true;
      removeListeners();
      if (error) completed.reject(error);
      else completed.resolve(value);
    };
    const cancelCaptured = async () => {
      if (state.done || state.cancelConfirmed) return;
      // A continued response may announce its GUID after cancellation begins.
      // Preserve its identity listener and wait for that announcement instead
      // of treating the absence of a GUID as confirmed cancellation.
      if (media && state.responseCommitted && !state.guid) await started.promise;
      if (state.done || state.cancelConfirmed) return;
      if (state.guid) {
        await record.cdp.send('Browser.cancelDownload', { guid: state.guid });
      } else if (!media && state.candidate) {
        await state.candidate.cancel();
      }
      state.cancelConfirmed = true;
    };
    const revoke = () => {
      if (state.cleanup) return state.cleanup;
      state.closed = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      completed.reject(signal?.reason ?? new Error('The managed download was revoked'));
      let cancelTimer;
      const cancellation = (async () => {
        await state.interceptor?.stopResponses();
        await cancelCaptured();
        await state.interceptor?.detach();
      })();
      const pending = Promise.race([cancellation, new Promise((_, reject) => {
        cancelTimer = setTimeout(() => reject(new Error('The browser did not confirm download cancellation')), 2000);
      })]).then(() => {
        removeListeners();
        if (operations.get(record) === state) operations.delete(record);
      }).finally(() => { clearTimeout(cancelTimer); if (state.cleanup === pending) state.cleanup = null; });
      state.cleanup = pending;
      return pending;
    };
    const fail = error => {
      if (state.closed || state.done) return;
      completed.reject(error);
      void revoke().catch(error => browser.onDownloadError?.(error));
    };
    const active = () => !state.closed && !state.done && operations.get(record) === state;
    const completedGuid = async guid => {
      try {
        const path = await pathFor(guid);
        if (active() && state.guid === guid) finish(null, { id: guid, path });
      } catch (error) { if (active()) fail(error); }
    };
    function begun(event) {
      if (state.done || operations.get(record) !== state || !validGuid(event.guid) || previousIds.has(event.guid) || state.guid) return;
      if (media && (event.frameId !== frameId || !state.allowedUrls.has(source?.protocol === 'blob:' ? event.url : sourceUrl(event.url)))) return;
      state.guid = event.guid;
      state.cancelConfirmed = false;
      started.resolve(event.guid);
      if (state.closed) void revoke().catch(error => browser.onDownloadError?.(error));
    }
    function progressed(event) {
      if (event.guid !== state.guid) return;
      if (state.closed) {
        if (['completed', 'canceled'].includes(event.state)) {
          state.done = true; state.cancelConfirmed = true;
          void revoke().catch(error => browser.onDownloadError?.(error));
        }
        return;
      }
      if (!active()) return;
      if (event.state === 'completed') {
        state.cancelConfirmed = true;
        void completedGuid(event.guid);
      }
      else if (event.state === 'canceled') finish(new Error('The browser download was canceled'));
    }
    function downloaded(download) {
      if (!active() || previousDownloads.has(download) || state.candidate) return;
      if (media && !state.allowedUrls.has(source?.protocol === 'blob:' ? download.url() : sourceUrl(download.url()))) return;
      // A Playwright completion path carries Chromium's GUID. Bind it only
      // after checking that it agrees with this operation's Page event.
      const candidate = download;
      state.candidate = candidate;
      void (async () => {
        try {
          const path = await Promise.race([candidate.path(), state.completed]);
          if (!active()) return;
          if (!path) throw new Error(await candidate.failure() || 'The browser download has no local file');
          const guid = basename(path);
          if (!validGuid(guid) || previousIds.has(guid) || state.guid && state.guid !== guid) return;
          // Media must retain the frame identity established by Page events.
          if (media && state.guid !== guid) return;
          if (await realpath(path) !== await pathFor(guid)) throw new Error('The browser download has an unexpected local path');
          if (!active() || state.guid && state.guid !== guid) return;
          state.guid = guid;
          finish(null, { id: guid, path: await pathFor(guid) });
        } catch (error) { if (active() && !media) fail(error); }
      })();
    }
    function disconnected() {
      const error = new Error('The browser tab disconnected while waiting for download');
      started.reject(error);
      if (state.closed) removeListeners();
      else fail(error);
    }
    function aborted() { fail(signal.reason); }
    state.revoke = revoke;
    operations.set(record, state);
    record.cdp.on('Page.downloadWillBegin', begun);
    record.cdp.on('Page.downloadProgress', progressed);
    record.cdp.on('close', disconnected);
    record.page.on('download', downloaded);
    record.page.on('close', disconnected);
    signal?.addEventListener('abort', aborted, { once: true });
    // The helper owns a deadline that pauses while policy callbacks run.
    if (typeof context.runPermission !== 'function' && Number.isInteger(context.timeoutMs) && context.timeoutMs > 0) {
      timer = setTimeout(() => fail(new Error('Timed out waiting for the managed browser download')), context.timeoutMs);
    }
    try {
      if (media && source.protocol !== 'blob:') {
        state.interceptor = interceptMedia(browser, record, context, state, authorize, check, fail, begun, progressed);
        await state.interceptor.ready;
      }
      check(context);
    } catch (error) {
      try { await revoke(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Media download setup and cleanup failed', { cause: error }); }
      throw error;
    }
    return revoke;
  }

  return {
    ensureDownloadSourcePolicyAllowed: context => authorize('ensureDownloadSourcePolicyAllowed', context),
    ...createBrowserUploadProvider(browser, { filePolicy }),
    enableDownload: context => enable(context),
    enableMediaDownload: context => enable(context, true),
    beginMediaDownload({ record }) {
      const state = operations.get(record);
      state?.signal?.throwIfAborted();
      if (!state || state.closed || state.done) throw new Error('The managed media download is no longer active');
      if (state.blob) state.responseCommitted = true;
    },
    async waitForDownload(context) {
      check(context);
      const state = operations.get(context.record);
      if (!state) throw new Error('No managed browser download is active in this tab');
      return await state.completed;
    },
    async disableDownload({ record }) { await operations.get(record)?.revoke(); },
  };
}
