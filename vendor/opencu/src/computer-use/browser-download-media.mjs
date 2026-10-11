import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

const activeDownloads = new WeakMap();
const activeUploads = new WeakMap();
const unsupported = message => Object.assign(new Error(message), { code: 'UNSUPPORTED_DOWNLOAD_MEDIA' });
function requiredProvider(provider, method) {
  if (typeof provider?.[method] !== 'function') throw unsupported(`The browser download provider does not support ${method}`);
  return provider[method].bind(provider);
}
function timeoutOf(options, fallback) {
  const value = options?.timeoutMs ?? fallback;
  if (!Number.isInteger(value) || value <= 0) throw new TypeError('timeoutMs must be a positive integer');
  return Math.min(value, 120000);
}
function deadline(timeoutMs, message, signal) {
  signal?.throwIfAborted();
  const controller = new AbortController(), error = new Error(message), failed = Promise.withResolvers();
  let until = Date.now() + timeoutMs, timer, closed = false;
  const fail = reason => { if (!closed) { closed = true; clearTimeout(timer); controller.abort(reason); failed.reject(reason); } };
  const arm = () => { timer = setTimeout(() => fail(error), Math.max(0, until - Date.now())); };
  const abort = () => fail(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  failed.promise.catch(() => {});
  arm();
  const check = () => { controller.signal.throwIfAborted(); if (closed) throw new Error('The browser download operation is no longer active'); if (Date.now() >= until) { fail(error); throw error; } };
  return {
    signal: controller.signal,
    remaining() { check(); return Math.max(1, until - Date.now()); },
    race(operation) { check(); return Promise.race([Promise.resolve().then(() => { check(); return operation(); }), failed.promise]); },
    async runPermission(action) {
      check(); clearTimeout(timer);
      const started = Date.now();
      try { return await Promise.race([Promise.resolve().then(action), failed.promise]); }
      finally { until += Date.now() - started; if (!closed) arm(); }
    },
    close() { closed = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (!controller.signal.aborted) controller.abort(new Error('The browser download operation is no longer active')); },
  };
}
async function withDownload(record, action) {
  if (activeDownloads.has(record)) throw new Error('A download is already in progress in this tab. Wait for it to finish before starting another.');
  const token = {};
  activeDownloads.set(record, token);
  try { return await action(token); } finally { if (activeDownloads.get(record) === token) activeDownloads.delete(record); }
}
function rememberDownload(record, result) {
  if (result == null || typeof result !== 'object' || typeof result.id !== 'string' || !result.id || result.path !== null && (typeof result.path !== 'string' || !isAbsolute(result.path))) throw new Error('The browser download provider returned an invalid completed download');
  record.completedDownloads ??= new Map();
  record.completedDownloads.set(result.id, result.path);
  return result;
}

// These callbacks run in the element's document, matching the native locator
// download path. Authorization and browser download interception stay in the provider.
function mediaSource(element) {
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  const media = element.closest?.('img, video, source, a[href]') ?? element.querySelector?.('img, video, source, a[href]') ?? element;
  const value = property => {
    if (property === 'src' && media.getAttribute('src')?.trim() === '') return null;
    const result = media[property];
    return typeof result === 'string' && result.length > 0 ? result : null;
  };
  const source = value('currentSrc') ?? value('src') ?? value('href') ?? '';
  return { source, filename: source.startsWith('blob:') && media.localName === 'a' ? value('download') : null };
}
function clickMediaLink(element, { source, filename }) {
  const link = element.ownerDocument.createElement('a');
  link.href = source;
  link.download = filename ?? (source.split('/').pop()?.split('?')[0] || 'download');
  link.rel = 'noopener';
  link.style.display = 'none';
  element.ownerDocument.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
  return true;
}

export async function downloadLocatorMedia(record, element, options = {}, signal, provider) {
  const sourcePolicy = requiredProvider(provider, 'ensureDownloadSourcePolicyAllowed');
  const enable = requiredProvider(provider, 'enableMediaDownload'), wait = requiredProvider(provider, 'waitForDownload');
  const timeoutMs = timeoutOf(options, 120000);
  return await withDownload(record, async token => {
    const budget = deadline(timeoutMs, `Timed out after ${timeoutMs}ms downloading media.`, signal);
    let revoke, enabled = false;
    const context = () => ({ record, signal: budget.signal, timeoutMs: budget.remaining(), runPermission: budget.runPermission, isActive: () => !budget.signal.aborted && activeDownloads.get(record) === token });
    try {
      await budget.race(() => sourcePolicy(context()));
      const target = await budget.race(() => element.evaluate(mediaSource));
      if (!target?.source) throw new Error('Matched element does not expose a downloadable URL');
      const frameId = options.frameId;
      if (typeof frameId !== 'string' || !frameId) throw new Error('Could not determine the media frame');
      if (new URL(target.source).protocol === 'blob:') {
        const { frameTree } = await budget.race(() => record.cdp.send('Page.getFrameTree'));
        if (frameTree?.frame?.id !== frameId) throw new Error('Blob downloads are not supported in embedded frames.');
      }
      enabled = true;
      revoke = await budget.race(() => enable({ ...context(), source: target.source, filename: target.filename, frameId }));
      if (typeof revoke !== 'function') throw new Error('The browser download provider did not return a revocation callback');
      await budget.race(() => {
        provider.beginMediaDownload?.({ record });
        return element.evaluate(clickMediaLink, target);
      });
      const result = rememberDownload(record, await budget.race(() => wait(context())));
      if (typeof result.path !== 'string' || !result.path) throw new Error('Downloaded media does not have a local file path');
      return result.path;
    } finally {
      try {
        if (enabled) {
          if (typeof revoke === 'function') await revoke();
          else if (typeof provider.disableDownload === 'function') await provider.disableDownload({ record });
        }
      } finally { budget.close(); }
    }
  });
}

export async function downloadMediaAtPoint(record, options, signal, provider) {
  if (!Number.isFinite(options?.x) || !Number.isFinite(options?.y)) throw new TypeError('downloadMedia requires finite x and y coordinates');
  const invoke = requiredProvider(provider, 'downloadMediaAtPoint');
  signal?.throwIfAborted();
  await invoke({ record, options: { x: options.x, y: options.y, timeoutMs: timeoutOf(options, 120000) }, signal });
  signal?.throwIfAborted();
}

export async function downloadMediaForDomNode(record, options, signal, provider) {
  if (typeof options?.node_id !== 'string' || !options.node_id) throw new TypeError('downloadMedia requires a DOM node_id');
  const invoke = requiredProvider(provider, 'downloadMediaForDomNode');
  signal?.throwIfAborted();
  await invoke({ record, options: { node_id: options.node_id, timeoutMs: timeoutOf(options, 120000) }, signal });
  signal?.throwIfAborted();
}

async function waitForDownloadEvent(record, options, signal, provider, onReady) {
  const enable = requiredProvider(provider, 'enableDownload'), wait = requiredProvider(provider, 'waitForDownload');
  const timeoutMs = timeoutOf(options, 120000);
  return await withDownload(record, async token => {
    const budget = deadline(timeoutMs, `Timed out after ${timeoutMs}ms waiting for download.`, signal);
    let revoke, enabled = false;
    const context = () => ({ record, signal: budget.signal, timeoutMs: budget.remaining(), runPermission: budget.runPermission, isActive: () => !budget.signal.aborted && activeDownloads.get(record) === token });
    try {
      enabled = true;
      revoke = await budget.race(() => enable(context()));
      if (typeof revoke !== 'function') throw new Error('The browser download provider did not return a revocation callback');
      provider.finishDownloadSetup?.({ record });
      onReady?.();
      const result = rememberDownload(record, await budget.race(() => wait(context())));
      return { event: 'download', downloadId: result.id };
    } finally {
      try {
        try { provider.finishDownloadSetup?.({ record }); }
        finally {
          if (enabled) {
            if (typeof revoke === 'function') await revoke();
            else if (typeof provider.disableDownload === 'function') await provider.disableDownload({ record });
          }
        }
      } finally { budget.close(); }
    }
  });
}

function chooserEvent(record, event) {
  const params = event?.params ?? event, source = event?.source;
  if (!Number.isInteger(params?.backendNodeId) || params.backendNodeId <= 0) return null;
  if (source?.tabId != null && source.tabId !== record.id) throw new Error('File chooser event belongs to a different tab');
  if (source?.sessionId != null || source?.targetId != null) throw new Error('File uploads in out-of-process frames are not supported.');
  if (typeof params.frameId !== 'string' || !params.frameId) throw new Error('File chooser event did not identify its receiving frame');
  return { backendNodeId: params.backendNodeId, frameId: params.frameId, isMultiple: params.mode === 'selectMultiple' };
}

function uploadTargetKey(target) {
  return JSON.stringify([target.targetId, target.frameId, target.loaderId, target.documentBackendNodeId,
    target.backendNodeId, target.url, target.origin, target.isMultiple]);
}

async function uploadBinding(record, provider, signal, { frame, frameId, expectedSession } = {}) {
  signal?.throwIfAborted();
  if (typeof provider?.resolveFileUploadBinding === 'function') return await provider.resolveFileUploadBinding({ record, frame, frameId, expectedSession, signal });
  const { frameTree } = await record.cdp.send('Page.getFrameTree');
  if (frame !== undefined && frame !== record.page.mainFrame() || frameId !== undefined && frameId !== frameTree?.frame?.id) {
    throw new Error('The upload provider cannot resolve the receiving nested frame');
  }
  if (expectedSession !== undefined && expectedSession !== record.cdp) throw new Error('The receiving file input CDP session changed');
  return { frame: record.page.mainFrame(), frameId: frameTree.frame.id, cdp: record.cdp };
}

function frameInTree(tree, id) {
  if (tree?.frame?.id === id) return tree.frame;
  for (const child of tree?.childFrames ?? []) { const found = frameInTree(child, id); if (found) return found; }
  return null;
}

// Resolve both nodes in a fresh isolated world so page JavaScript cannot supply
// the receiving document, input type or connection state used for authorization.
export async function inspectFileInputTarget(record, backendNodeId, signal, { frameId, binding } = {}) {
  if (!Number.isSafeInteger(backendNodeId) || backendNodeId <= 0) throw new TypeError('Invalid file input backend node ID');
  binding ??= await uploadBinding(record, undefined, signal, { frameId });
  const { cdp, frame: actualFrame } = binding;
  if (cdp !== record.cdp) throw Object.assign(new Error('File uploads in out-of-process frames are not supported.'), { code: 'UNSUPPORTED_FILE_UPLOAD_FRAME' });
  const generation = record.generation;
  const check = async () => {
    signal?.throwIfAborted();
    if (record.page.isClosed() || record.generation !== generation) throw new Error('The receiving page changed while inspecting its file input');
    if (!actualFrame || actualFrame.isDetached() || actualFrame !== record.page.mainFrame()
      && (record.frames.get(actualFrame) !== cdp || record.frameBindingIds.get(actualFrame) !== binding.frameId)) throw new Error('The receiving file input frame binding changed');
    if (typeof record.assertFileAccess === 'function' && await record.assertFileAccess() === false) throw new Error('The file input tab ownership changed');
    signal?.throwIfAborted();
  };
  const send = async (method, params = {}) => { await check(); const result = await cdp.send(method, params); await check(); return result; };
  const { frameTree } = await send('Page.getFrameTree'), frame = frameInTree(frameTree, binding.frameId);
  if (!frame?.id || !frame.loaderId || frameId !== undefined && frameId !== frame.id) throw new Error('The receiving file input frame changed');
  const { targetInfo } = await send('Target.getTargetInfo');
  if (typeof targetInfo?.targetId !== 'string' || !targetInfo.targetId) throw new Error('The receiving browser target is unavailable');
  const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: frame.id, worldName: '__opencu_file_upload_policy', grantUniveralAccess: false });
  if (!Number.isSafeInteger(executionContextId) || executionContextId <= 0) throw new Error('The receiving document cannot be inspected in an isolated world');
  const objects = [];
  try {
    const document = await send('Runtime.evaluate', { contextId: executionContextId, expression: 'document' });
    const documentObjectId = document.result?.objectId;
    if (document.exceptionDetails || !documentObjectId) throw new Error('The receiving document was detached');
    objects.push(documentObjectId);
    const { node: documentNode } = await send('DOM.describeNode', { objectId: documentObjectId });
    if (documentNode?.nodeType !== 9 || !Number.isSafeInteger(documentNode.backendNodeId) || documentNode.backendNodeId <= 0) throw new Error('The receiving frame has no actual document identity');
    const input = await send('DOM.resolveNode', { backendNodeId, executionContextId });
    const inputObjectId = input.object?.objectId;
    if (!inputObjectId) throw new Error('The receiving file input was detached');
    objects.push(inputObjectId);
    const response = await send('Runtime.callFunctionOn', {
      objectId: inputObjectId, arguments: [{ objectId: documentObjectId }], returnByValue: true,
      functionDeclaration: 'function(documentNode) { return { connected: this.isConnected, sameDocument: this.ownerDocument === documentNode, fileInput: this instanceof HTMLInputElement && this.type === "file", disabled: this.disabled, isMultiple: this.multiple, url: documentNode.URL, origin: globalThis.origin }; }',
    });
    const inspected = response.result?.value;
    if (response.exceptionDetails || inspected?.connected !== true || inspected.sameDocument !== true || inspected.fileInput !== true || inspected.disabled !== false) {
      throw Object.assign(new Error('The receiving node is no longer an enabled file input in its captured document'), { code: 'STALE_FILE_UPLOAD' });
    }
    const url = new URL(inspected.url), origin = new URL(inspected.origin), expectedUrl = new URL(frame.url + (frame.urlFragment ?? '')).href;
    const inherited = url.protocol === 'about:' && ['blank', 'srcdoc'].includes(url.pathname);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/' || origin.username || origin.password
      || !inherited && (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.origin)
      || url.username || url.password || url.href !== expectedUrl || frame.securityOrigin && frame.securityOrigin !== origin.origin) {
      throw new Error('File uploads require a stable HTTP(S) receiving document');
    }
    const fresh = frameInTree((await send('Page.getFrameTree')).frameTree, frame.id);
    if (!fresh || fresh.loaderId !== frame.loaderId || fresh.url !== frame.url || fresh.urlFragment !== frame.urlFragment
      || fresh.securityOrigin !== frame.securityOrigin) throw new Error('The receiving document changed during inspection');
    return Object.freeze({ targetId: targetInfo.targetId, frameId: frame.id, loaderId: frame.loaderId,
      documentBackendNodeId: documentNode.backendNodeId, backendNodeId, url: url.href, origin: origin.origin,
      isMultiple: inspected.isMultiple === true, sessionIdentity: cdp, frameIdentity: actualFrame });
  } finally {
    await Promise.allSettled(objects.map(objectId => cdp.send('Runtime.releaseObject', { objectId })));
  }
}
async function waitForFileChooserEvent(record, options, signal, provider, onReady) {
  const timeoutMs = timeoutOf(options, 3000), budget = deadline(timeoutMs, `Timed out after ${timeoutMs}ms waiting for file chooser.`, signal), opened = Promise.withResolvers(), legacyOpened = Promise.withResolvers();
  opened.promise.catch(() => {});
  legacyOpened.promise.catch(() => {});
  let received = false, waiting = true, completed = false, legacyChooser;
  const listener = event => {
    try {
      if (received) return;
      const chooser = chooserEvent(record, event);
      if (!chooser) return;
      received = true;
      void budget.race(async () => inspectFileInputTarget(record, chooser.backendNodeId, budget.signal, {
        frameId: chooser.frameId, binding: await uploadBinding(record, provider, budget.signal, { frameId: chooser.frameId }),
      }))
        .then(target => {
          if (target.isMultiple !== chooser.isMultiple) throw new Error('The file chooser selection mode changed');
          opened.resolve({ ...chooser, target });
        }).catch(error => opened.reject(error));
    }
    catch (error) { opened.reject(error); }
  };
  const playwrightChooser = chooser => {
    if (!waiting || budget.signal.aborted || legacyChooser) return;
    legacyChooser = chooser;
    record.filechooser = chooser;
    // Playwright observes OOPIF chooser events on their own sessions. Preserve
    // Codex's explicit rejection instead of hiding such an event as a timeout.
    void budget.race(async () => {
      const frame = await chooser.element().ownerFrame();
      if (!frame) throw new Error('The receiving file chooser frame is no longer attached');
      const binding = await uploadBinding(record, provider, budget.signal, { frame });
      legacyOpened.resolve({ chooser, binding });
    }).catch(error => {
      legacyOpened.reject(error);
      if (!received) { received = true; opened.reject(error); }
    });
  };
  record.cdp.on('Page.fileChooserOpened', listener);
  record.page.on('filechooser', playwrightChooser);
  try {
    await budget.race(() => record.cdp.send('Page.enable'));
    await budget.race(() => record.cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }));
    provider?.finishFileChooserSetup?.({ record });
    onReady?.();
    const [chooser, legacy] = await budget.race(() => Promise.all([opened.promise, legacyOpened.promise])), id = randomUUID();
    if (legacy.binding.frame !== chooser.target.frameIdentity || legacy.binding.cdp !== chooser.target.sessionIdentity
      || legacy.chooser.isMultiple() !== chooser.isMultiple) throw new Error('The receiving file chooser changed during capture');
    record.fileChoosersById ??= new Map();
    record.fileChoosersById.set(id, chooser);
    completed = true;
    return { event: 'filechooser', fileChooserId: id, isMultiple: chooser.isMultiple };
  } finally {
    waiting = false;
    record.cdp.removeListener('Page.fileChooserOpened', listener);
    record.page.removeListener('filechooser', playwrightChooser);
    if (!completed && legacyChooser && record.filechooser === legacyChooser) record.filechooser = null;
    budget.close();
    try { provider?.finishFileChooserSetup?.({ record }); }
    finally {
      // Preserve other actual listeners, and await our CDP restoration even
      // though Playwright's listener subscription update is fire-and-forget.
      for (;;) {
        const enabled = (record.page.listenerCount?.('filechooser') ?? 0) > 0;
        try { await record.cdp.send('Page.setInterceptFileChooserDialog', { enabled }); }
        catch (error) { if (!record.page.isClosed()) throw error; break; }
        if (enabled === ((record.page.listenerCount?.('filechooser') ?? 0) > 0)) break;
      }
    }
  }
}

export async function waitForBrowserEvent(record, event, options = {}, signal, provider, onReady) {
  if (event === 'download') return await waitForDownloadEvent(record, options, signal, provider, onReady);
  if (event === 'filechooser') return await waitForFileChooserEvent(record, options, signal, provider, onReady);
  throw new TypeError(`Unsupported browser event: ${String(event)}`);
}

export function downloadPath(record, downloadId) {
  if (typeof downloadId !== 'string' || !downloadId) throw new TypeError('download.path requires a download ID');
  return record.completedDownloads?.get(downloadId) ?? null;
}

function uploadPaths(files) {
  const paths = typeof files === 'string' ? [files] : files;
  if (!Array.isArray(paths) || !paths.length || paths.length > 128) throw new TypeError('File upload requires between one and 128 files');
  if (paths.some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new TypeError('File upload requires absolute file paths');
  return paths.slice();
}

async function submitFileInput(record, target, files, options, signal, provider, completed) {
  if (activeUploads.has(record)) throw new Error('A file upload is already active in this tab');
  const token = {}, paths = uploadPaths(files);
  const authorize = requiredProvider(provider, 'ensureFileUploadAllowed');
  const timeoutMs = timeoutOf(options, 3000), budget = deadline(timeoutMs, `Timed out after ${timeoutMs}ms setting file input files.`, signal);
  activeUploads.set(record, token);
  let receipt;
  try {
    const inspected = await budget.race(async () => inspectFileInputTarget(record, target.backendNodeId, budget.signal, {
      frameId: target.frameId, binding: await uploadBinding(record, provider, budget.signal, { frame: target.frameIdentity, frameId: target.frameId, expectedSession: target.sessionIdentity }),
    }));
    if (uploadTargetKey(inspected) !== uploadTargetKey(target) || inspected.sessionIdentity !== target.sessionIdentity || inspected.frameIdentity !== target.frameIdentity) throw new Error('The captured receiving file input changed');
    if (!target.isMultiple && paths.length > 1) throw new Error('The file input does not accept multiple files');
    receipt = await budget.runPermission(() => authorize({ record, target, files: paths, signal: budget.signal,
      isActive: () => !budget.signal.aborted && activeUploads.get(record) === token }));
    if (receipt?.allowed !== true || typeof receipt.commit !== 'function' || typeof receipt.dispose !== 'function'
      || !Array.isArray(receipt.files) || receipt.files.length !== paths.length || receipt.files.some(path => typeof path !== 'string' || !isAbsolute(path))) {
      throw new Error('The upload provider did not return approved file paths and a one-use submission');
    }
    await budget.race(() => receipt.commit((approvedPaths, transfer) => {
      budget.signal.throwIfAborted();
      if (activeUploads.get(record) !== token || !Array.isArray(approvedPaths) || approvedPaths.length !== receipt.files.length
        || approvedPaths.some((path, index) => path !== receipt.files[index])) throw new Error('The approved upload paths changed');
      if (transfer !== undefined && (typeof transfer.opencuTransferId !== 'string' || !transfer.opencuTransferId)) throw new Error('The native upload transfer identity is invalid');
      return target.sessionIdentity.send('DOM.setFileInputFiles', { backendNodeId: target.backendNodeId, files: approvedPaths,
        ...(transfer === undefined ? {} : { opencuTransferId: transfer.opencuTransferId }) });
    }));
    completed?.();
  } finally {
    try { await receipt?.dispose?.(); }
    finally { budget.close(); if (activeUploads.get(record) === token) activeUploads.delete(record); }
  }
}

export async function setFileChooserFiles(record, fileChooserId, files, options = {}, signal, provider) {
  const chooser = record.fileChoosersById?.get(fileChooserId);
  if (!chooser) throw new Error(`Unknown file chooser id "${fileChooserId}"`);
  if (!chooser.target) throw new Error('This file chooser has no captured receiving document; open the file chooser again');
  await submitFileInput(record, chooser.target, files, options, signal, provider, () => record.fileChoosersById.delete(fileChooserId));
}

async function locatorFileInputTarget(record, element, provider, signal) {
  signal?.throwIfAborted();
  const frame = await element.ownerFrame();
  if (!frame || frame.isDetached()) throw new Error('The matched file input frame is no longer attached');
  const binding = await uploadBinding(record, provider, signal, { frame });
  if (binding.cdp !== record.cdp) throw Object.assign(new Error('File uploads in out-of-process frames are not supported.'), { code: 'UNSUPPORTED_FILE_UPLOAD_FRAME' });
  const generation = record.generation;
  const slot = '__opencu_upload_' + randomUUID().replaceAll('-', '');
  const cdp = await record.page.context().newCDPSession(record.page), contexts = new Map();
  let objectId, closed = false;
  const created = ({ context }) => { contexts.set(context.id, context); };
  const destroyed = ({ executionContextId }) => { contexts.delete(executionContextId); };
  const cleared = () => { contexts.clear(); };
  const disconnected = () => { closed = true; };
  cdp.on('Runtime.executionContextCreated', created);
  cdp.on('Runtime.executionContextDestroyed', destroyed);
  cdp.on('Runtime.executionContextsCleared', cleared);
  cdp.on('close', disconnected);
  const check = async () => {
    signal?.throwIfAborted();
    if (closed || record.page.isClosed() || frame.isDetached() || generation !== record.generation || await record.assertFileAccess?.() === false) {
      throw new Error('The matched file input document changed during CDP resolution');
    }
    signal?.throwIfAborted();
  };
  const send = async (method, params = {}) => { await check(); const result = await cdp.send(method, params); await check(); return result; };
  try {
    const { targetInfo: rootTarget } = await binding.cdp.send('Target.getTargetInfo');
    const { targetInfo: privateTarget } = await send('Target.getTargetInfo');
    if (!rootTarget?.targetId || privateTarget?.targetId !== rootTarget.targetId) throw new Error('The file input resolution session belongs to another browser target');
    // A dedicated public CDPSession replays real default-world contexts even
    // when Runtime was already enabled by another feature on the shared one.
    await send('Runtime.enable');
    const defaults = [...contexts.values()].filter(context => context.auxData?.isDefault === true && context.auxData.frameId === binding.frameId);
    if (defaults.length !== 1 || !Number.isSafeInteger(defaults[0].id)) throw new Error('Could not identify the matched file input frame execution context');
    await element.evaluate((node, key) => {
      if (!node.isConnected || !(node instanceof HTMLInputElement) || node.type !== 'file') throw new Error('The matched element is not a connected file input');
      Object.defineProperty(globalThis, key, { value: node, configurable: true });
    }, slot);
    const remote = await send('Runtime.evaluate', { contextId: defaults[0].id, expression: `globalThis[${JSON.stringify(slot)}]` });
    objectId = remote.result?.objectId;
    if (remote.exceptionDetails || !objectId || await element.evaluate((node, key) => globalThis[key] === node, slot) !== true) {
      throw new Error('The matched file input changed during CDP resolution');
    }
    const { node } = await send('DOM.describeNode', { objectId });
    return await inspectFileInputTarget(record, node?.backendNodeId, signal, { frameId: binding.frameId, binding });
  } finally {
    await element.evaluate((_, key) => { delete globalThis[key]; }, slot).catch(() => {});
    if (objectId) await cdp.send('Runtime.releaseObject', { objectId }).catch(() => {});
    cdp.removeListener('Runtime.executionContextCreated', created);
    cdp.removeListener('Runtime.executionContextDestroyed', destroyed);
    cdp.removeListener('Runtime.executionContextsCleared', cleared);
    cdp.removeListener('close', disconnected);
    await cdp.detach();
  }
}

export async function setLocatorInputFiles(record, element, files, options = {}, signal, provider) {
  const target = await locatorFileInputTarget(record, element, provider, signal);
  await submitFileInput(record, target, files, { timeoutMs: options.timeoutMs ?? options.timeout ?? 3000 }, signal, provider);
}
