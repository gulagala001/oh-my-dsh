import { Marked } from 'marked';
import { compile } from 'html-to-text';
import { randomUUID } from 'node:crypto';

const markdown = new Marked({ gfm: true, async: false });
const plainText = compile({ wordwrap: false, selectors: [
  { selector: 'a', options: { ignoreHref: true } },
  { selector: 'img', format: 'skip' },
  { selector: 'h1', options: { uppercase: false } },
  { selector: 'h2', options: { uppercase: false } },
  { selector: 'h3', options: { uppercase: false } },
  { selector: 'h4', options: { uppercase: false } },
  { selector: 'h5', options: { uppercase: false } },
  { selector: 'h6', options: { uppercase: false } },
] });

// Pure conversion: no browser, document execution or resource loading in the
// host. The destination app chooses a supported clipboard representation.
export function nativePastePayload(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('paste text must be a string.');
  const format = options?.format ?? 'text';
  if (!['text', 'md', 'html'].includes(format)) throw new TypeError('paste format must be text, md or html.');
  if (format === 'text') return { text };
  const html = format === 'md' ? markdown.parse(text) : text;
  return { text: plainText(html), html };
}

export function browserPastePayload(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('paste text must be a string.');
  const format = options?.format ?? 'text';
  if (!['text', 'md', 'html'].includes(format)) throw new TypeError('paste format must be text, md or html.');
  const entries = [{ mimeType: 'text/plain', text }];
  if (format === 'html') entries.unshift({ mimeType: 'text/html', text });
  return [{ entries }];
}

// Browser clipboard items use MIME representations, unlike NSPasteboard's
// native type identifiers. Keep binary bytes as base64 across the RPC boundary.
export function normalizeClipboardItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError('clipboard.write requires at least one clipboard item.');
  }
  return items.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || !Array.isArray(item.entries) || item.entries.length === 0) {
      throw new TypeError('Each clipboard item must include a nonempty entries array.');
    }
    const entries = item.entries.map((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.mimeType !== 'string' || entry.mimeType.length === 0) {
        throw new TypeError('Clipboard entries require a nonempty string mimeType.');
      }
      const hasText = entry.text !== undefined;
      const hasBase64 = entry.base64 !== undefined;
      if (hasText === hasBase64) throw new TypeError('Clipboard entries must set exactly one of text or base64.');
      if (hasText && typeof entry.text !== 'string') throw new TypeError('Clipboard entry text must be a string.');
      if (hasBase64 && typeof entry.base64 !== 'string') throw new TypeError('Clipboard entry base64 must be a string.');
      if (hasBase64) {
        try { atob(entry.base64); }
        catch { throw new TypeError('Clipboard entries require valid base64 data.'); }
      }
      return hasText ? { mimeType: entry.mimeType, text: entry.text } : { mimeType: entry.mimeType, base64: entry.base64 };
    });
    if (item.presentationStyle === undefined) return { entries };
    if (!['unspecified', 'inline', 'attachment'].includes(item.presentationStyle)) {
      throw new TypeError('Clipboard presentationStyle must be unspecified, inline or attachment.');
    }
    return { entries, presentationStyle: item.presentationStyle };
  });
}

const browserClipboards = new WeakMap();

function clipboardState(target, scope) {
  const page = typeof target.context === 'function' ? target : target.page();
  const key = scope ?? page.context();
  if ((typeof key !== 'object' && typeof key !== 'function') || key === null) throw new TypeError('Browser clipboard scope must be an object.');
  let state = browserClipboards.get(key);
  if (!state) {
    state = { items: [], tail: Promise.resolve(), bridges: new Map(), observers: new Map(), aliases: new WeakMap(), installations: new Set(), operationGrants: new Map(), pages: new Set(), epoch: 0, cleaning: false, disposed: false };
    browserClipboards.set(key, state);
  }
  if (state.disposed) throw new Error('Browser clipboard is disposed.');
  state.pages.add(page);
  return state;
}

const clipboardRevoked = () => Object.assign(new Error('Browser clipboard operation was revoked.'), { code: 'CLIPBOARD_CANCELLED' });

function clipboardGuard(state, epoch, signal) {
  signal?.throwIfAborted();
  if (state.disposed || state.cleaning || state.epoch !== epoch) throw clipboardRevoked();
  if (state.cleanupFailure) throw new Error('Browser clipboard cleanup failed; retry cleanup before using this scope.', { cause: state.cleanupFailure });
}

function clipboardAwait(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const finish = (handler, value) => { signal.removeEventListener('abort', abort); handler(value); };
    const abort = () => finish(reject, signal.reason ?? clipboardRevoked());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then((value) => finish(resolve, value), (error) => finish(reject, error));
    if (signal.aborted) abort();
  });
}

function clipboardExclusive(state, operation, signal) {
  const epoch = state.epoch;
  const pending = state.tail.then(async () => { clipboardGuard(state, epoch, signal); return operation(epoch); });
  state.tail = pending.then(() => {}, () => {});
  return clipboardAwait(pending, signal);
}

function clipboardCopy(items) {
  return items.map((item) => ({ entries: item.entries.map((entry) => ({ ...entry })), ...(item.presentationStyle === undefined ? {} : { presentationStyle: item.presentationStyle }) }));
}

// This function is serialized into every document of an attached CDP target.
// Its bridge replaces only the page API; it never reads the system clipboard.
function installPageClipboardBridge(bindingName) {
  if (globalThis.__opencuClipboardRevocations?.has(bindingName)) throw new Error('Browser clipboard bridge was revoked.');
  const previous = globalThis.__opencuClipboardBridge;
  if (previous?.bindingName === bindingName) return;
  previous?.cleanup();
  const binding = globalThis[bindingName];
  if (typeof binding !== 'function') throw new Error('Browser clipboard bridge is unavailable.');
  const original = navigator.clipboard;
  const hadOwn = Object.prototype.hasOwnProperty.call(navigator, 'clipboard');
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const pending = new Map();
  let nextId = 0;
  const decode = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const encode = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const parts = [];
    for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
    return btoa(parts.join(''));
  };
  const blob = (entry) => new Blob([typeof entry.text === 'string' ? entry.text : decode(entry.base64 ?? '')], { type: entry.mimeType });
  const makeItem = (item) => typeof ClipboardItem === 'function'
    ? new ClipboardItem(Object.fromEntries(item.entries.map((entry) => [entry.mimeType, blob(entry)])), { presentationStyle: item.presentationStyle ?? 'unspecified' })
    : { types: item.entries.map((entry) => entry.mimeType), presentationStyle: item.presentationStyle ?? 'unspecified', getType: async (type) => {
      const entry = item.entries.find((candidate) => candidate.mimeType === type);
      if (!entry) throw new DOMException(`No clipboard entry for ${type}`, 'NotFoundError');
      return blob(entry);
    } };
  const request = (operation, items, operationId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { binding(JSON.stringify({ id, operation, items, operationId })); }
    catch (error) { pending.delete(id); reject(error); }
  });
  let clipboard;
  const checkReceiver = (receiver) => { if (receiver !== clipboard) throw new TypeError('Illegal invocation'); };
  const methods = {
    async read() { checkReceiver(this); return (await request('read')).map(makeItem); },
    async readText() {
      checkReceiver(this);
      const entry = (await request('read')).flatMap((item) => item.entries).find((candidate) => candidate.mimeType === 'text/plain');
      return entry ? blob(entry).text() : '';
    },
    async write(items) {
      checkReceiver(this);
      if (arguments.length === 0) throw new TypeError('clipboard.write requires an argument.');
      const values = await Promise.all(Array.from(items).map(async (item) => ({
        entries: await Promise.all(item.types.map(async (mimeType) => {
          const data = await item.getType(mimeType);
          return mimeType.startsWith('text/') ? { mimeType, text: await data.text() } : { mimeType, base64: encode(await data.arrayBuffer()) };
        })),
        presentationStyle: item.presentationStyle ?? 'unspecified',
      })));
      if (values.length) await request('write', values);
    },
    async writeText(text) {
      checkReceiver(this);
      if (arguments.length === 0) throw new TypeError('clipboard.writeText requires an argument.');
      await request('write', [{ entries: [{ mimeType: 'text/plain', text: `${text}` }], presentationStyle: 'unspecified' }]);
    },
  };
  clipboard = { ...methods, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  const getter = { configurable: true, get: () => clipboard };
  const savedMethods = new Map();
  let patched;
  const restoreMethods = () => {
    if (!patched) return;
    for (const [name, saved] of savedMethods) if (Object.getOwnPropertyDescriptor(patched, name)?.value === methods[name]) {
      if (saved) Object.defineProperty(patched, name, saved);
      else Reflect.deleteProperty(patched, name);
    }
    patched = undefined;
    savedMethods.clear();
  };
  const patchMethods = (object) => {
    patched = object;
    try {
      for (const name of Object.keys(methods)) {
        savedMethods.set(name, Object.getOwnPropertyDescriptor(object, name));
        Object.defineProperty(object, name, { configurable: true, enumerable: true, writable: true, value: methods[name] });
      }
      return true;
    } catch { restoreMethods(); return false; }
  };
  if (original) {
    const prototype = Object.getPrototypeOf(original);
    if (patchMethods(original) || (prototype && Object.keys(methods).every((name) => name in prototype) && patchMethods(prototype))) clipboard = original;
    else Object.defineProperty(navigator, 'clipboard', getter);
  } else Object.defineProperty(navigator, 'clipboard', getter);
  const cleanup = () => {
    (globalThis.__opencuClipboardRevocations ??= new Set()).add(bindingName);
    if (globalThis.__opencuClipboardBridge?.bindingName !== bindingName) return;
    delete globalThis.__opencuPendingCut;
    for (const frame of document.querySelectorAll('iframe,frame')) frame.contentWindow?.postMessage(bindingName, '*');
    globalThis.removeEventListener('message', onMessage);
    for (const request of pending.values()) request.reject(new Error('Browser clipboard bridge was removed.'));
    pending.clear();
    if (patched) restoreMethods();
    else if (Object.getOwnPropertyDescriptor(navigator, 'clipboard')?.get === getter.get) {
      if (hadOwn && descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
    delete globalThis.__opencuClipboardBridge;
    if (globalThis[bindingName] === binding) Reflect.deleteProperty(globalThis, bindingName);
  };
  const onMessage = (event) => { if (event.data === bindingName && (event.source === globalThis || event.source === globalThis.parent)) cleanup(); };
  globalThis.__opencuClipboardBridge = {
    bindingName, cleanup,
    authorize: (operationId) => request('authorize', undefined, operationId),
    respond(payload) {
      let response;
      try { response = JSON.parse(payload); } catch { return; }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.ok) request.resolve(Array.isArray(response.items) ? response.items : []);
      else request.reject(new Error(response.error ?? 'Browser clipboard request failed.'));
    },
  };
  globalThis.addEventListener('message', onMessage);
}

function clipboardBounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser clipboard cleanup timed out: ${label}`)), Math.max(1, milliseconds)); })]).finally(() => clearTimeout(timer));
}

function observeClipboardContexts(bridge, cdp) {
  if (bridge.contextSession === cdp) return;
  stopClipboardContextObservation(bridge, bridge.contextSession);
  bridge.contextSession = cdp;
  bridge.contexts = new Map();
  bridge.contextVersion = 0;
  bridge.seenDefaultContext = false;
  bridge.onContextCreated = ({ context }) => {
    if (!context || !(context.auxData?.isDefault === true || context.auxData?.type === 'default')) return;
    bridge.contexts.set(context.id, context);
    bridge.contextVersion += 1;
    bridge.seenDefaultContext = true;
  };
  bridge.onContextDestroyed = (event) => {
    for (const [id, context] of bridge.contexts) if (id === event.executionContextId || context.uniqueId && context.uniqueId === event.executionContextUniqueId) {
      bridge.contexts.delete(id);
      bridge.contextVersion += 1;
    }
  };
  bridge.onContextsCleared = () => { bridge.contexts.clear(); bridge.contextVersion += 1; };
  cdp.on('Runtime.executionContextCreated', bridge.onContextCreated);
  cdp.on('Runtime.executionContextDestroyed', bridge.onContextDestroyed);
  cdp.on('Runtime.executionContextsCleared', bridge.onContextsCleared);
}

function stopClipboardContextObservation(bridge, cdp) {
  if (!cdp) return;
  for (const [event, listener] of [
    ['Runtime.executionContextCreated', bridge.onContextCreated],
    ['Runtime.executionContextDestroyed', bridge.onContextDestroyed],
    ['Runtime.executionContextsCleared', bridge.onContextsCleared],
  ]) if (typeof listener === 'function') cdp.off?.(event, listener);
  if (bridge.contextSession === cdp) bridge.contextSession = undefined;
}

function removeClipboardBridgeListeners(bridge, cdp) {
  if (typeof bridge.onBinding === 'function') cdp?.off?.('Runtime.bindingCalled', bridge.onBinding);
  if (typeof bridge.onCdpClose === 'function') cdp?.off?.('close', bridge.onCdpClose);
  if (typeof bridge.onTargetDestroyed === 'function') cdp?.off?.('Target.targetDestroyed', bridge.onTargetDestroyed);
  if (typeof bridge.onClose === 'function') bridge.page?.off?.('close', bridge.onClose);
  stopClipboardContextObservation(bridge, cdp);
}

async function restoreClipboardContexts(bridge, cdp, deadline) {
  const restored = new Set();
  if (!bridge.seenDefaultContext) throw new Error('Browser clipboard cleanup could not identify the target default execution contexts.');
  for (;;) {
    const version = bridge.contextVersion;
    const pending = [...bridge.contexts.values()].filter((context) => !restored.has(context));
    const results = await Promise.allSettled(pending.map((context) => {
      if (bridge.contexts.get(context.id) !== context) return;
      const restoring = cdp.send('Runtime.evaluate', {
        contextId: context.id,
        expression: `(globalThis.__opencuClipboardRevocations ??= new Set()).add(${JSON.stringify(bridge.bindingName)}); if (globalThis.__opencuClipboardBridge?.bindingName === ${JSON.stringify(bridge.bindingName)}) globalThis.__opencuClipboardBridge.cleanup()`,
        returnByValue: true,
      }).then((result) => {
        if (result?.exceptionDetails && bridge.contexts.get(context.id) === context) throw new Error(`Browser clipboard API restoration failed in execution context ${context.id}.`);
        restored.add(context);
      }, (error) => { if (bridge.contexts.get(context.id) === context) throw error; });
      return clipboardBounded(restoring, deadline - Date.now(), `restore execution context ${context.id}`);
    }));
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Browser clipboard API restoration was incomplete.');
    if (version === bridge.contextVersion && [...bridge.contexts.values()].every((context) => restored.has(context))) return;
    if (Date.now() >= deadline) throw new Error('Browser clipboard cleanup timed out while execution contexts were changing.');
  }
}

async function cleanupSessionCandidate(state, page, target, deadline) {
  const connecting = page.context().newCDPSession(target);
  let cdp;
  try { cdp = await clipboardBounded(connecting, deadline - Date.now(), 'attach cleanup candidate'); }
  catch (error) {
    connecting.then(async (lateCdp) => {
      const late = { key: Symbol('late-clipboard-candidate'), cdp: lateCdp, page, target };
      state.bridges.set(late.key, late);
      try { await cleanupClipboardBridge(state, late); } catch (cleanupError) { state.cleanupFailure = cleanupError; }
    }, () => {}).catch((cleanupError) => { state.cleanupFailure = cleanupError; });
    throw error;
  }
  const temporary = { key: Symbol('clipboard-candidate'), cdp, page, target };
  state.bridges.set(temporary.key, temporary);
  return temporary;
}

async function reconnectClipboardBridge(state, bridge, deadline) {
  if (!bridge.rootTargetId || !bridge.targetId) throw new Error('Browser clipboard actor disconnected before its stable target identity was available.');
  for (const page of state.pages) {
    if (page.isClosed()) continue;
    if (Date.now() >= deadline) throw new Error('Browser clipboard cleanup timed out locating a live target.');
    const root = await cleanupSessionCandidate(state, page, page, deadline);
    let adoptedRoot = false;
    try {
      const info = await clipboardBounded(root.cdp.send('Target.getTargetInfo'), deadline - Date.now(), 'identify cleanup page');
      if (info.targetInfo?.targetId !== bridge.rootTargetId) continue;
      if (bridge.targetId === bridge.rootTargetId) {
        state.bridges.delete(root.key);
        adoptedRoot = true;
        return { page, target: page, cdp: root.cdp };
      }
      for (const frame of page.frames()) {
        if (frame === page.mainFrame() || frame.isDetached()) continue;
        if (Date.now() >= deadline) throw new Error('Browser clipboard cleanup timed out locating a live iframe target.');
        let child;
        try { child = await cleanupSessionCandidate(state, page, frame, deadline); }
        catch (error) { if (String(error.message).includes('part of the parent frame')) continue; throw error; }
        let adoptedChild = false;
        try {
          const childInfo = await clipboardBounded(child.cdp.send('Target.getTargetInfo'), deadline - Date.now(), 'identify cleanup iframe');
          if (childInfo.targetInfo?.targetId !== bridge.targetId) continue;
          await cleanupClipboardBridge(state, root, { timeoutMs: Math.max(1, deadline - Date.now()) });
          adoptedRoot = true;
          state.bridges.delete(child.key);
          adoptedChild = true;
          return { page, target: frame, cdp: child.cdp };
        } finally { if (!adoptedChild) await cleanupClipboardBridge(state, child, { timeoutMs: Math.max(1, deadline - Date.now()) }); }
      }
    } finally { if (!adoptedRoot) await cleanupClipboardBridge(state, root, { timeoutMs: Math.max(1, deadline - Date.now()) }); }
  }
  throw new Error('The browser clipboard target has no connected actor with a matching stable target ID; its cleanup record was retained.');
}

async function identifyClipboardBridge(state, bridge, epoch, signal) {
  const info = await clipboardAwait(bridge.cdp.send('Target.getTargetInfo'), signal);
  clipboardGuard(state, epoch, signal);
  if (typeof info.targetInfo?.targetId !== 'string') throw new Error('Browser clipboard target identity is unavailable.');
  bridge.targetId = info.targetInfo.targetId;
  if (bridge.key === bridge.page) { bridge.rootTargetId = bridge.targetId; return; }
  const knownRoot = state.bridges.get(bridge.page);
  if (knownRoot?.rootTargetId) { bridge.rootTargetId = knownRoot.rootTargetId; return; }
  const cdp = await attachClipboardSession(bridge.page, bridge.page, state, epoch, signal);
  const root = { key: Symbol('clipboard-root-identity'), cdp, page: bridge.page, target: bridge.page };
  state.bridges.set(root.key, root);
  try {
    const rootInfo = await clipboardAwait(cdp.send('Target.getTargetInfo'), signal);
    clipboardGuard(state, epoch, signal);
    if (typeof rootInfo.targetInfo?.targetId !== 'string') throw new Error('Browser clipboard root target identity is unavailable.');
    bridge.rootTargetId = rootInfo.targetInfo.targetId;
  } finally { await cleanupClipboardBridge(state, root); }
}

async function cleanupClipboardTargetObserver(state, observer, { timeoutMs = 2000 } = {}) {
  if (observer.cleanup) return observer.cleanup;
  const attempt = (async () => {
    const deadline = Date.now() + timeoutMs;
    if (!observer.cdp && observer.connecting) {
      try { await clipboardBounded(observer.connecting, deadline - Date.now(), 'pending target observer attachment'); }
      catch (error) { if (!observer.attachFailed) throw error; }
    }
    if (!observer.closed && observer.cdp) {
      const errors = [];
      if (observer.discoveryRequested && !observer.discoveryDisabled) {
        try { await clipboardBounded(observer.cdp.send('Target.setDiscoverTargets', { discover: false }).then(() => { observer.discoveryDisabled = true; }), deadline - Date.now(), 'disable target discovery'); }
        catch (error) { errors.push(error); }
      }
      try { await clipboardBounded(observer.cdp.detach(), Math.max(250, deadline - Date.now()), 'detach target observer'); observer.closed = true; }
      catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Browser clipboard target observer cleanup was incomplete.');
    }
    if (typeof observer.onDestroyed === 'function') observer.cdp?.off?.('Target.targetDestroyed', observer.onDestroyed);
    if (typeof observer.onClose === 'function') observer.cdp?.off?.('close', observer.onClose);
    if (state.observers.get(observer.browser) === observer) state.observers.delete(observer.browser);
  })();
  observer.cleanup = attempt;
  try { return await attempt; }
  finally { if (observer.cleanup === attempt) observer.cleanup = undefined; }
}

async function ensureClipboardTargetObserver(state, page, epoch, signal) {
  const browser = page.context().browser();
  if (typeof browser?.newBrowserCDPSession !== 'function') throw new Error('Browser clipboard target lifecycle observation is unavailable.');
  const previous = state.observers.get(browser);
  if (previous && !previous.closed && !previous.cleanup) return;
  if (previous) await cleanupClipboardTargetObserver(state, previous);
  const observer = { browser };
  state.observers.set(browser, observer);
  const connecting = browser.newBrowserCDPSession().then(async (cdp) => {
    observer.cdp = cdp;
    if (state.epoch !== epoch || state.cleaning || signal?.aborted) {
      state.observers.set(browser, observer);
      const earlier = observer.cleanup ?? Promise.resolve();
      void earlier.catch(() => {}).then(() => cleanupClipboardTargetObserver(state, observer)).catch((error) => { state.cleanupFailure = error; });
    }
    return cdp;
  }, (error) => { observer.attachFailed = true; throw error; });
  observer.connecting = connecting;
  state.installations.add(connecting);
  connecting.finally(() => state.installations.delete(connecting)).catch(() => {});
  try {
    const cdp = await clipboardAwait(connecting, signal);
    clipboardGuard(state, epoch, signal);
    observer.onDestroyed = ({ targetId }) => {
      for (const bridge of state.bridges.values()) {
        if (targetId !== bridge.targetId && targetId !== bridge.rootTargetId) continue;
        bridge.physicalDestroyed = true;
        const earlier = bridge.cleanup ?? Promise.resolve();
        void earlier.catch(() => {}).then(() => cleanupClipboardBridge(state, bridge)).catch((error) => { state.cleanupFailure = error; });
      }
    };
    observer.onClose = () => { observer.closed = true; };
    cdp.on('Target.targetDestroyed', observer.onDestroyed);
    cdp.on('close', observer.onClose);
    observer.discoveryRequested = true;
    await clipboardAwait(cdp.send('Target.setDiscoverTargets', { discover: true }), signal);
    clipboardGuard(state, epoch, signal);
  } catch (error) {
    try { await cleanupClipboardTargetObserver(state, observer); }
    catch (cleanupError) { state.cleanupFailure = cleanupError; throw new AggregateError([error, cleanupError], 'Browser clipboard target observation and cleanup failed.'); }
    throw error;
  }
}

async function cleanupClipboardBridge(state, bridge, { timeoutMs = 2000 } = {}) {
  if (bridge.cleanup) return bridge.cleanup;
  const attempt = (async () => {
    const deadline = Date.now() + timeoutMs;
    const errors = [];
    const target = bridge.target ?? bridge.key;
    const hasPageChanges = bridge.bindingRequested && !bridge.bindingRemoved || bridge.scriptRequested && !bridge.scriptRemoved && !bridge.scriptFailed;
    const disconnected = bridge.page?.context?.().browser?.()?.isConnected?.() === false;
    const gone = bridge.physicalDestroyed === true || !hasPageChanges && (bridge.closed || bridge.detached || disconnected);
    if (gone) {
      removeClipboardBridgeListeners(bridge, bridge.cdp);
      bridge.detached = true;
      if (state.bridges.get(bridge.key) === bridge) state.bridges.delete(bridge.key);
      return;
    }
    if (!gone && hasPageChanges && (bridge.detached || bridge.closed || bridge.page.isClosed() || target !== bridge.page && target?.isDetached?.())) {
      let connection;
      try { connection = await reconnectClipboardBridge(state, bridge, deadline); }
      catch (error) {
        if (!bridge.physicalDestroyed) throw error;
        removeClipboardBridgeListeners(bridge, bridge.cdp);
        bridge.detached = true;
        if (state.bridges.get(bridge.key) === bridge) state.bridges.delete(bridge.key);
        return;
      }
      removeClipboardBridgeListeners(bridge, bridge.cdp);
      bridge.cdp = connection.cdp;
      bridge.page = connection.page;
      bridge.target = connection.target;
      bridge.detached = false; bridge.closed = false;
    }
    const cdp = bridge.cdp;
    if (!cdp) return;
    if (!gone) {
      // Stop future injection before refreshing and restoring every live page
      // world. Parent-frame postMessage cleanup cannot reach shadow-root frames.
      if (bridge.identifier && !bridge.scriptRemoved) {
        try { await clipboardBounded(cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bridge.identifier }).then(() => { bridge.scriptRemoved = true; }), deadline - Date.now(), 'remove document script'); }
        catch (error) { errors.push(error); }
      }
      else if (!bridge.identifier && bridge.scriptRequested && !bridge.scriptFailed) errors.push(new Error('Browser clipboard document script registration has not completed.'));
      if (bridge.bindingRequested && !bridge.bindingRemoved) {
        try {
          observeClipboardContexts(bridge, cdp);
          await clipboardBounded(cdp.send('Runtime.disable'), deadline - Date.now(), 'refresh execution contexts');
          bridge.contexts.clear(); bridge.contextVersion += 1; bridge.seenDefaultContext = false;
          await clipboardBounded(cdp.send('Runtime.enable'), deadline - Date.now(), 'enumerate execution contexts');
          await restoreClipboardContexts(bridge, cdp, deadline);
        } catch (error) { errors.push(error); }
        if (!errors.length && !bridge.bindingRemoved) {
          try { await clipboardBounded(cdp.send('Runtime.removeBinding', { name: bridge.bindingName }).then(() => { bridge.bindingRemoved = true; }), deadline - Date.now(), 'remove Runtime binding'); }
          catch (error) { errors.push(error); }
        }
      }
    }
    if (errors.length && !bridge.physicalDestroyed) throw new AggregateError(errors, 'Browser clipboard bridge cleanup was incomplete.');
    if (!bridge.detached) {
      try { await clipboardBounded(cdp.detach().then(() => { bridge.detached = true; }), Math.max(250, deadline - Date.now()), 'detach clipboard CDP session'); }
      catch (error) { errors.push(error); }
    }
    if (errors.length && !bridge.physicalDestroyed) throw new AggregateError(errors, 'Browser clipboard bridge cleanup was incomplete.');
    removeClipboardBridgeListeners(bridge, cdp);
    if (state.bridges.get(bridge.key) === bridge) state.bridges.delete(bridge.key);
  })();
  bridge.cleanup = attempt;
  try { return await attempt; }
  finally { if (bridge.cleanup === attempt) bridge.cleanup = undefined; }
}

async function attachClipboardSession(page, key, state, epoch, signal) {
  const attaching = page.context().newCDPSession(key).then(async (cdp) => {
    if (state.epoch !== epoch || state.cleaning || signal?.aborted) {
      const late = { key: Symbol('late-clipboard-session'), cdp, page, target: key };
      state.bridges.set(late.key, late);
      try { await cleanupClipboardBridge(state, late); }
      catch (error) { state.cleanupFailure = error; }
      throw signal?.reason ?? clipboardRevoked();
    }
    return cdp;
  });
  state.installations.add(attaching);
  attaching.finally(() => state.installations.delete(attaching)).catch(() => {});
  return clipboardAwait(attaching, signal);
}

async function ensureClipboardBridge(target, state, epoch, signal) {
  clipboardGuard(state, epoch, signal);
  const page = typeof target.context === 'function' ? target : target.page();
  await ensureClipboardTargetObserver(state, page, epoch, signal);
  clipboardGuard(state, epoch, signal);
  const alias = state.aliases.get(target);
  if (alias && !alias.cleanup && !alias.closed && !alias.detached) {
    const installed = await clipboardAwait(target.evaluate((name) => globalThis.__opencuClipboardBridge?.bindingName === name, alias.bindingName), signal);
    clipboardGuard(state, epoch, signal);
    if (!installed) throw new Error('Browser clipboard bridge is not installed in the current input document.');
    clipboardGuard(state, epoch, signal);
    return alias;
  }
  let key = target === page || target === page.mainFrame() ? page : target;
  let bridge = state.bridges.get(key);
  if (bridge?.closed || bridge?.detached) { await cleanupClipboardBridge(state, bridge); bridge = undefined; clipboardGuard(state, epoch, signal); }
  if (!bridge) {
    let cdp;
    try { cdp = await attachClipboardSession(page, key, state, epoch, signal); }
    catch (error) {
      if (key === page || !String(error?.message).includes('part of the parent frame')) throw error;
      key = page;
      bridge = state.bridges.get(key);
      if (!bridge) cdp = await attachClipboardSession(page, page, state, epoch, signal);
    }
    if (!bridge) {
      try { clipboardGuard(state, epoch, signal); }
      catch (error) {
        const late = { key: Symbol('revoked-clipboard-session'), cdp, page, target: key };
        state.bridges.set(late.key, late);
        try { await cleanupClipboardBridge(state, late); } catch (cleanupError) { state.cleanupFailure = cleanupError; }
        throw error;
      }
      bridge = { key, cdp, page, target, epoch, bindingName: `__opencuClipboard_${randomUUID().replaceAll('-', '')}` };
      state.bridges.set(key, bridge);
      bridge.onBinding = async (event) => {
        if (event.name !== bridge.bindingName || bridge.cleanup || state.epoch !== bridge.epoch || state.cleaning || state.disposed) return;
        let request;
        try { request = JSON.parse(event.payload); } catch { return; }
        if (!Number.isSafeInteger(request?.id)) return;
        let response;
        try {
          if (request.operation === 'authorize') {
            const grant = state.operationGrants.get(request.operationId);
            if (!grant || grant.bindingName !== bridge.bindingName || grant.used) throw clipboardRevoked();
            clipboardGuard(state, grant.epoch, grant.signal);
            grant.used = true;
            if (typeof grant.ensureFocus === 'function') await clipboardAwait(Promise.resolve().then(grant.ensureFocus), grant.signal);
            clipboardGuard(state, grant.epoch, grant.signal);
            response = { id: request.id, ok: true };
          }
          else if (request.operation === 'read') response = { id: request.id, ok: true, items: clipboardCopy(state.items) };
          else if (request.operation === 'write') { state.items = normalizeClipboardItems(request.items); response = { id: request.id, ok: true }; }
          else throw new Error('Unsupported clipboard operation.');
        } catch (error) { response = { id: request.id, ok: false, error: error.message ?? String(error) }; }
        cdp.send('Runtime.evaluate', { contextId: event.executionContextId, expression: `globalThis.__opencuClipboardBridge?.bindingName === ${JSON.stringify(bridge.bindingName)} && globalThis.__opencuClipboardBridge.respond(${JSON.stringify(JSON.stringify(response))})`, returnByValue: true }).catch(() => {});
      };
      bridge.onClose = () => { void cleanupClipboardBridge(state, bridge).catch((error) => { state.cleanupFailure = error; }); };
      bridge.onCdpClose = () => { bridge.closed = true; state.aliases = new WeakMap(); };
      bridge.onTargetDestroyed = ({ targetId }) => {
        if (targetId !== bridge.targetId) return;
        bridge.physicalDestroyed = true;
        const earlier = bridge.cleanup ?? Promise.resolve();
        void earlier.catch(() => {}).then(() => cleanupClipboardBridge(state, bridge)).catch((error) => { state.cleanupFailure = error; });
      };
      cdp.on('Runtime.bindingCalled', bridge.onBinding);
      cdp.on('close', bridge.onCdpClose);
      cdp.on('Target.targetDestroyed', bridge.onTargetDestroyed);
      observeClipboardContexts(bridge, cdp);
      page.on?.('close', bridge.onClose);
      try {
        await identifyClipboardBridge(state, bridge, epoch, signal);
        await clipboardAwait(cdp.send('Runtime.enable'), signal);
        clipboardGuard(state, epoch, signal);
        bridge.bindingRequested = true;
        await clipboardAwait(cdp.send('Runtime.addBinding', { name: bridge.bindingName }), signal);
        clipboardGuard(state, epoch, signal);
        const source = `(${installPageClipboardBridge.toString()})(${JSON.stringify(bridge.bindingName)})`;
        bridge.scriptRequested = true;
        const registration = cdp.send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: true }).then((result) => {
          bridge.identifier = result.identifier;
          if (state.epoch !== epoch) {
            const earlier = bridge.cleanup ?? Promise.resolve();
            void earlier.catch(() => {}).then(() => cleanupClipboardBridge(state, bridge)).catch((error) => { state.cleanupFailure = error; });
          }
          return result;
        }, (error) => { bridge.scriptFailed = true; throw error; });
        await clipboardAwait(registration, signal);
        clipboardGuard(state, epoch, signal);
      } catch (error) { try { await cleanupClipboardBridge(state, bridge); } catch (cleanupError) { state.cleanupFailure = cleanupError; throw new AggregateError([error, cleanupError], 'Browser clipboard installation and cleanup failed.'); } throw error; }
    }
  }
  const installed = await clipboardAwait(target.evaluate((name) => globalThis.__opencuClipboardBridge?.bindingName === name, bridge.bindingName), signal);
  clipboardGuard(state, epoch, signal);
  if (!installed) throw new Error('Browser clipboard bridge is not installed in the current input document.');
  clipboardGuard(state, epoch, signal);
  state.aliases.set(target, bridge);
  return bridge;
}

function evaluateClipboardOperation(target, state, operation, args, signal, ensureFocus) {
  const operationId = randomUUID();
  const grant = { epoch: state.epoch, signal, bindingName: args.bindingName, used: false, ensureFocus };
  clipboardGuard(state, grant.epoch, signal);
  state.operationGrants.set(operationId, grant);
  let pending;
  try { pending = target.evaluate(operation, { ...args, operationId }); }
  catch (error) { state.operationGrants.delete(operationId); throw error; }
  state.installations.add(pending);
  pending.finally(() => { state.installations.delete(pending); state.operationGrants.delete(operationId); }).catch(() => {});
  return clipboardAwait(pending, signal);
}

export async function browserClipboardReadText(page, scope, signal) {
  const state = clipboardState(page, scope);
  return clipboardExclusive(state, async (epoch) => {
    await ensureClipboardBridge(page, state, epoch, signal);
    clipboardGuard(state, epoch, signal);
    return state.items.flatMap((item) => item.entries).find((entry) => entry.mimeType === 'text/plain')?.text ?? '';
  }, signal);
}

export async function browserClipboardWriteText(page, text, scope, signal) {
  if (typeof text !== 'string') throw new TypeError('clipboard.writeText requires text.');
  return browserClipboardWrite(page, [{ entries: [{ mimeType: 'text/plain', text }], presentationStyle: 'unspecified' }], scope, signal);
}

export async function browserClipboardRead(page, scope, signal) {
  const state = clipboardState(page, scope);
  return clipboardExclusive(state, async (epoch) => { await ensureClipboardBridge(page, state, epoch, signal); clipboardGuard(state, epoch, signal); return clipboardCopy(state.items); }, signal);
}

export async function browserClipboardWrite(page, items, scope, signal) {
  const payload = normalizeClipboardItems(items);
  const state = clipboardState(page, scope);
  await clipboardExclusive(state, async (epoch) => { await ensureClipboardBridge(page, state, epoch, signal); clipboardGuard(state, epoch, signal); state.items = payload; }, signal);
}

async function deliverBrowserClipboard({ action = 'paste', items = [], policy, cutToken, inputTargetToken, requireFocusedFrame = false, bindingName, operationId }) {
  const guard = () => {
    if (!bindingName || globalThis.__opencuClipboardBridge?.bindingName !== bindingName || globalThis.__opencuClipboardRevocations?.has(bindingName)) throw new Error('Browser clipboard operation was revoked.');
  };
  guard();
  await globalThis.__opencuClipboardBridge.authorize(operationId);
  guard();
  delete globalThis.__opencuPendingCut;
  if (requireFocusedFrame) {
    let child = window;
    for (;;) {
      let owner;
      try { owner = child.frameElement; } catch { break; }
      if (!owner) break;
      let active = owner.ownerDocument.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      if (active !== owner) throw new Error('The clipboard input frame is no longer in the active frame chain.');
      child = owner.ownerDocument.defaultView;
      if (!child) throw new Error('The clipboard input frame is detached.');
    }
  }
  const localName = Object.getOwnPropertyDescriptor(window.Element.prototype, 'localName')?.get;
  const namespace = Object.getOwnPropertyDescriptor(window.Element.prototype, 'namespaceURI')?.get;
  if (!localName || !namespace) throw new Error('Browser virtual paste requires native DOM getters.');
  const htmlElement = (element) => namespace.call(element) === 'http://www.w3.org/1999/xhtml';
  const focused = (root) => {
    const active = root.activeElement;
    if (!active) return null;
    try { localName.call(active); } catch { return null; }
    if (!active.ownerDocument.defaultView) return null;
    if (htmlElement(active) && active.shadowRoot) return focused(active.shadowRoot) ?? active;
    if (htmlElement(active) && ['iframe', 'frame'].includes(localName.call(active))) {
      try { const child = active.contentDocument ?? active.contentWindow?.document; if (child) return focused(child) ?? active; } catch {}
    }
    return active;
  };
  const target = focused(document) ?? document.body;
  if (!target) throw new Error('Browser paste has no focused document target.');
  if (inputTargetToken !== undefined && target.__opencuClipboardInputTargetToken !== inputTargetToken) throw new Error('Active element is no longer the expected clipboard input target.');
  const targetWindow = target.ownerDocument.defaultView ?? window;
  if (action !== 'paste') {
    if (!policy) throw new Error('Virtual clipboard is missing credential protection.');
    const protectedInput = (element) => element.tagName?.toLowerCase() === 'input' && (element.getAttribute('type')?.toLowerCase() === 'hidden' || new RegExp(policy.pattern, 'i').test(policy.attributes.map((attribute) => element.getAttribute(attribute) ?? '').join(' ')));
    if (protectedInput(target)) return {};
    const scrub = (root) => {
      let changed = false;
      for (const input of root.querySelectorAll('input[value]')) if (protectedInput(input)) { input.removeAttribute('value'); changed = true; }
      return changed;
    };
    const representations = (text, html) => {
      const entries = [];
      if (text.length) entries.push({ mimeType: 'text/plain', text });
      if (html.length) entries.push({ mimeType: 'text/html', text: html });
      return entries.length ? [{ entries, presentationStyle: 'unspecified' }] : [];
    };
    const cutEvent = (type) => new targetWindow.InputEvent(type, { bubbles: true, cancelable: type === 'beforeinput', composed: true, inputType: 'deleteByCut' });
    let selection;
    if (htmlElement(target) && ['input', 'textarea'].includes(localName.call(target))) {
      const start = target.selectionStart, end = target.selectionEnd;
      if (start !== null && end !== null && start !== end) {
        const text = target.value.slice(start, end);
        selection = { items: representations(text, ''), commit() {
          if (target.disabled || target.readOnly || target.value.slice(start, end) !== text || !target.dispatchEvent(cutEvent('beforeinput'))) return;
          target.setRangeText('', start, end, 'end');
          target.dispatchEvent(cutEvent('input'));
        } };
      }
    } else {
      const current = targetWindow.getSelection?.();
      if (current && current.rangeCount && !current.isCollapsed) {
        const ranges = Array.from({ length: current.rangeCount }, (_, index) => current.getRangeAt(index).cloneRange());
        const fragment = target.ownerDocument.createElement('div');
        for (const range of ranges) fragment.append(range.cloneContents());
        scrub(fragment);
        const text = current.toString();
        let editable;
        if (htmlElement(target) && target.isContentEditable) {
          editable = target;
          while (editable.parentElement?.isContentEditable) editable = editable.parentElement;
        }
        selection = { items: representations(text, fragment.innerHTML), commit() {
          if (!editable?.isConnected || !editable.isContentEditable || !ranges.every((range) => editable.contains(range.commonAncestorContainer)) || ranges.map((range) => range.toString()).join('') !== text || !target.dispatchEvent(cutEvent('beforeinput'))) return;
          for (const range of ranges.reverse()) range.deleteContents();
          target.dispatchEvent(cutEvent('input'));
        } };
      }
    }
    const data = new targetWindow.DataTransfer();
    const event = new targetWindow.ClipboardEvent(action, { bubbles: true, cancelable: true, composed: true, clipboardData: data });
    if (!target.dispatchEvent(event)) {
      const entries = [];
      for (const mimeType of Array.from(data.types)) if (mimeType !== 'Files') entries.push({ mimeType, text: data.getData(mimeType) });
      for (const file of Array.from(data.files)) if (file.type.length) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        guard();
        const parts = [];
        for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
        entries.push({ mimeType: file.type, base64: btoa(parts.join('')) });
      }
      if (!entries.length) return {};
      for (const entry of entries) if (entry.mimeType === 'text/html' && typeof entry.text === 'string' && /<input[\s/>]/i.test(entry.text)) {
        const template = target.ownerDocument.createElement('template');
        template.innerHTML = entry.text;
        if (scrub(template.content)) entry.text = template.innerHTML;
      }
      return { items: [{ entries, presentationStyle: 'unspecified' }] };
    }
    if (!selection?.items.length) return {};
    if (action === 'cut') {
      if (!cutToken) throw new Error('Virtual cut is missing a commit token.');
      globalThis.__opencuPendingCut = { token: cutToken, commit() { guard(); selection.commit(); } };
    }
    return { items: selection.items, ...(action === 'cut' ? { cutToken } : {}) };
  }
  if (!items.length) throw new Error('Browser virtual clipboard has no data to paste.');
  const plain = items.flatMap((item) => item.entries).find((entry) => entry.mimeType === 'text/plain')?.text ?? '';
  const fallback = () => {
    if (htmlElement(target) && ['input', 'textarea'].includes(localName.call(target))) {
      if (target.disabled || target.readOnly || !plain.length) return;
      const setValue = (value) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
        const ownSetter = Object.getOwnPropertyDescriptor(target, 'value')?.set;
        if (nativeSetter && ownSetter !== nativeSetter) nativeSetter.call(target, value);
        else target.value = value;
      };
      if (target.selectionStart === null || target.selectionEnd === null) setValue(target.value + plain);
      else {
        try { target.setRangeText(plain, target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length, 'end'); }
        catch { setValue(target.value + plain); }
      }
      target.dispatchEvent(new targetWindow.InputEvent('input', { bubbles: true }));
    } else if (htmlElement(target) && (target.isContentEditable || target.closest('[contenteditable=true]'))) {
      target.focus();
      if (plain.length) target.ownerDocument.execCommand('insertText', false, plain);
    }
  };
  if (typeof targetWindow.DataTransfer !== 'function' || typeof targetWindow.ClipboardEvent !== 'function') { fallback(); return {}; }
  const data = new targetWindow.DataTransfer();
  data.clearData();
  for (const item of items) for (const entry of item.entries) {
    if (typeof entry.text === 'string') data.setData(entry.mimeType, entry.text);
    else {
      const bytes = Uint8Array.from(atob(entry.base64 ?? ''), (char) => char.charCodeAt(0));
      data.items.add(new targetWindow.File([bytes], `clipboard.${entry.mimeType.split('/')[1] ?? 'bin'}`, { type: entry.mimeType }));
    }
  }
  if (target.dispatchEvent(new targetWindow.ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: data }))) fallback();
  return {};
}

export async function browserClipboardPaste(target, text, options = {}, scope, signal) {
  const payload = browserPastePayload(text, options);
  const state = clipboardState(target, scope);
  await clipboardExclusive(state, async (epoch) => {
    const bridge = await ensureClipboardBridge(target, state, epoch, signal);
    clipboardGuard(state, epoch, signal);
    if (typeof options?.ensureFocus === 'function') { await clipboardAwait(Promise.resolve().then(() => options.ensureFocus()), signal); clipboardGuard(state, epoch, signal); }
    state.items = payload;
    await evaluateClipboardOperation(target, state, deliverBrowserClipboard, { items: clipboardCopy(payload), inputTargetToken: options?.inputTargetToken, requireFocusedFrame: typeof options?.ensureFocus === 'function', bindingName: bridge.bindingName }, signal, options?.ensureFocus);
    clipboardGuard(state, epoch, signal);
  }, signal);
}

const credentialClipboardPolicy = {
  attributes: ['type', 'autocomplete', 'id', 'name', 'placeholder', 'aria-label', 'title'],
  pattern: /user[-_ ]?name|e[-_ ]?mail|one[-_ ]?time[-_ ]?code|password|passcode|passwd|\botp\b|\b(?:2fa|mfa)\b|phone|mobile|\btel\b/i.source,
};
const nativeClipboardShortcutError = () => new Error('Native clipboard shortcuts are disabled; use browser virtual clipboard commands instead.');

export function browserClipboardShortcutAction(key, platform = process.platform) {
  const tokens = (Array.isArray(key) ? key : [key]).flatMap((value) => {
    if (typeof value !== 'string') throw new TypeError('Browser keypress requires string keys.');
    const result = [];
    let current = '';
    for (const char of value) {
      if (char === '+' && current) { result.push(current); current = ''; }
      else current += char;
    }
    if (current) result.push(current);
    return result;
  });
  const aliases = { alt: 'Alt', option: 'Alt', control: 'Control', controlormeta: 'ControlOrMeta', ctrl: 'ControlOrMeta', cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', super: 'Meta', shift: 'Shift', insert: 'Insert', delete: 'Delete', del: 'Delete' };
  const codes = { AltLeft: 'Alt', AltRight: 'Alt', ControlLeft: 'Control', ControlRight: 'Control', MetaLeft: 'Meta', MetaRight: 'Meta', ShiftLeft: 'Shift', ShiftRight: 'Shift', KeyC: 'KeyC', KeyV: 'KeyV', KeyX: 'KeyX', c: 'KeyC', C: 'KeyC', v: 'KeyV', V: 'KeyV', x: 'KeyX', X: 'KeyX' };
  const modifiers = new Set();
  const regular = [];
  let blocked = false;
  const blocksNative = (code) => {
    if (['KeyC', 'KeyX'].includes(code) && modifiers.size === 2 && modifiers.has('Shift') && (modifiers.has('Meta') || modifiers.has('Control'))) return false;
    return (['KeyC', 'KeyV', 'KeyX'].includes(code) && (modifiers.has('Meta') || modifiers.has('Control'))) || code === 'Insert' && (modifiers.has('Control') || modifiers.has('Shift')) || code === 'Delete' && modifiers.has('Shift');
  };
  for (const token of tokens) {
    const side = /^(alt|control|meta|super|shift)_[lr]$/i.exec(token);
    const normalized = codes[token] ?? aliases[(side?.[1] ?? token).toLowerCase().replaceAll('_', '')] ?? token;
    const code = normalized === 'ControlOrMeta' ? platform === 'darwin' ? 'Meta' : 'Control' : normalized;
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(code)) modifiers.add(code);
    else { regular.push(code); if (blocksNative(code)) blocked = true; }
  }
  if (regular.length === 1) {
    const code = regular[0];
    if (modifiers.size === 1) {
      if (code === 'Insert' && modifiers.has('Control')) return 'copy';
      if (code === 'Insert' && modifiers.has('Shift')) return 'paste';
      if (code === 'Delete' && modifiers.has('Shift')) return 'cut';
    }
    const primary = (modifiers.has('Meta') || modifiers.has('Control')) && !(modifiers.has('Meta') && modifiers.has('Control'));
    const supported = modifiers.size === 1 || modifiers.size === 2 && modifiers.has('Shift');
    if (primary && supported) {
      if (code === 'KeyC' && !modifiers.has('Shift')) return 'copy';
      if (code === 'KeyV') return modifiers.has('Shift') ? 'paste-plain-text' : 'paste';
      if (code === 'KeyX' && !modifiers.has('Shift')) return 'cut';
    }
    if (blocksNative(code)) return 'blocked';
  }
  return blocked ? 'blocked' : null;
}

export async function browserClipboardShortcut(target, key, scope, signal, { platform = process.platform, durationMs = 0, inputTargetToken, ensureFocus } = {}) {
  const action = browserClipboardShortcutAction(key, platform);
  if (action === null) return false;
  if (action === 'blocked' || durationMs > 0) throw nativeClipboardShortcutError();
  const state = clipboardState(target, scope);
  await clipboardExclusive(state, async (epoch) => {
    const bridge = await ensureClipboardBridge(target, state, epoch, signal);
    clipboardGuard(state, epoch, signal);
    if (typeof ensureFocus === 'function') { await clipboardAwait(Promise.resolve().then(ensureFocus), signal); clipboardGuard(state, epoch, signal); }
    let items = clipboardCopy(state.items);
    if (action === 'paste-plain-text') items = items.map((item) => ({ ...item, entries: item.entries.filter((entry) => entry.mimeType === 'text/plain') })).filter((item) => item.entries.length);
    const token = action === 'cut' ? randomUUID() : undefined;
    const result = await evaluateClipboardOperation(target, state, deliverBrowserClipboard, { action: action.startsWith('paste') ? 'paste' : action, items, policy: credentialClipboardPolicy, cutToken: token, inputTargetToken, requireFocusedFrame: typeof ensureFocus === 'function', bindingName: bridge.bindingName }, signal, ensureFocus);
    clipboardGuard(state, epoch, signal);
    if (!action.startsWith('paste') && result?.items) {
      state.items = normalizeClipboardItems(result.items);
      if (action === 'cut' && result.cutToken) {
        if (typeof ensureFocus === 'function') { await clipboardAwait(Promise.resolve().then(ensureFocus), signal); clipboardGuard(state, epoch, signal); }
        await evaluateClipboardOperation(target, state, async ({ cutToken, inputTargetToken, requireFocusedFrame, bindingName, operationId }) => {
          if (globalThis.__opencuClipboardBridge?.bindingName !== bindingName || globalThis.__opencuClipboardRevocations?.has(bindingName)) throw new Error('Browser clipboard operation was revoked.');
          await globalThis.__opencuClipboardBridge.authorize(operationId);
          if (globalThis.__opencuClipboardBridge?.bindingName !== bindingName || globalThis.__opencuClipboardRevocations?.has(bindingName)) throw new Error('Browser clipboard operation was revoked.');
          if (requireFocusedFrame) {
            let child = window;
            for (;;) {
              let owner;
              try { owner = child.frameElement; } catch { break; }
              if (!owner) break;
              let active = owner.ownerDocument.activeElement;
              while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
              if (active !== owner) throw new Error('The clipboard input frame is no longer in the active frame chain.');
              child = owner.ownerDocument.defaultView;
              if (!child) throw new Error('The clipboard input frame is detached.');
            }
          }
          if (inputTargetToken !== undefined) {
            let active = document.activeElement;
            while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
            if (active?.__opencuClipboardInputTargetToken !== inputTargetToken) throw new Error('Active element is no longer the expected clipboard input target.');
          }
          const pending = globalThis.__opencuPendingCut;
          if (pending?.token !== cutToken) throw new Error('Virtual cut is no longer pending.');
          delete globalThis.__opencuPendingCut;
          pending.commit();
        }, { cutToken: result.cutToken, inputTargetToken, requireFocusedFrame: typeof ensureFocus === 'function', bindingName: bridge.bindingName }, signal, ensureFocus);
        clipboardGuard(state, epoch, signal);
      }
    }
  }, signal);
  return true;
}

export async function cleanupBrowserClipboard(scope, { dispose = false, timeoutMs = 2000, pages = [] } = {}) {
  const state = browserClipboards.get(scope);
  if (!state) return;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Clipboard cleanup timeoutMs must be positive.');
  for (const page of pages) if (page && typeof page.isClosed === 'function') state.pages.add(page);
  if (state.cleanupAttempt) {
    await state.cleanupAttempt;
    if (dispose && !state.disposed) return cleanupBrowserClipboard(scope, { dispose, timeoutMs, pages });
    return;
  }
  state.epoch += 1;
  state.cleaning = true;
  state.tail = Promise.resolve();
  state.operationGrants.clear();
  const attempt = (async () => {
    const work = [...state.bridges.values()].map((bridge) => cleanupClipboardBridge(state, bridge, { timeoutMs }));
    for (const pending of state.installations) work.push(clipboardBounded(pending.catch(() => {}), timeoutMs, 'pending clipboard attachment'));
    const results = await Promise.allSettled(work);
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length || state.bridges.size) {
      const failure = new AggregateError(errors, 'Browser clipboard cleanup was incomplete; its scope was retained for retry.');
      state.cleanupFailure = failure;
      throw failure;
    }
    const observerResults = await Promise.allSettled([...state.observers.values()].map((observer) => cleanupClipboardTargetObserver(state, observer, { timeoutMs })));
    const observerErrors = observerResults.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (observerErrors.length || state.observers.size) {
      const failure = new AggregateError(observerErrors, 'Browser clipboard target observer cleanup was incomplete; its scope was retained for retry.');
      state.cleanupFailure = failure;
      throw failure;
    }
    state.aliases = new WeakMap();
    state.cleanupFailure = undefined;
    if (dispose) { state.items = []; state.pages.clear(); state.disposed = true; }
  })();
  state.cleanupAttempt = attempt;
  try { return await attempt; }
  finally { state.cleaning = false; if (state.cleanupAttempt === attempt) state.cleanupAttempt = undefined; }
}
