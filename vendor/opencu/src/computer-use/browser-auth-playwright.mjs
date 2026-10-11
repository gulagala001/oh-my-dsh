// Playwright 1.63's in-process bridge exposes its real server Frame, DOM
// handles, and InjectedScript. No selector or element-state engine is rebuilt.
const stale = () => new Error('Browser auth locator document or target changed');
const missing = name => new Error(`Browser auth requires real Playwright ${name}`);

function implementation(value) {
  const connection = value?._connection;
  if (typeof connection?.toImpl !== 'function') throw missing('in-process binding');
  const result = connection.toImpl(value);
  if (result == null) throw missing('server object');
  return result;
}

function frameInTree(tree, id) {
  if (tree?.frame?.id === id) return tree.frame;
  for (const child of tree?.childFrames ?? []) {
    const frame = frameInTree(child, id);
    if (frame) return frame;
  }
}

function documentIdentity(frame) {
  if (typeof frame?.id !== 'string' || !frame.id || typeof frame.loaderId !== 'string'
    || !frame.loaderId || typeof frame.url !== 'string' || !frame.url
    || typeof frame.securityOrigin !== 'string' || !frame.securityOrigin) throw stale();
  const url = new URL(frame.url);
  url.hash = '';
  return { frameId: frame.id, loaderId: frame.loaderId, url: url.href,
    securityOrigin: frame.securityOrigin, domainAndRegistry: frame.domainAndRegistry ?? '' };
}

function sameDocument(left, right) {
  return left.frameId === right.frameId && left.loaderId === right.loaderId
    && left.url === right.url && left.securityOrigin === right.securityOrigin;
}

function sameSelector(left, right) {
  return left._frame === right._frame && left._selector === right._selector;
}

async function dispose(handles) {
  await Promise.all(handles.map(handle => handle.dispose().catch(() => {})));
}

/**
 * Adapt an owned Page to the recovered auth controller. This adapter requires
 * actual native tab, frame, loader, and backend-node identities. A remote
 * Playwright client without its real in-process server bridge is rejected.
 */
export function createBrowserAuthPlaywright({ browser, record, signal }) {
  const page = record?.page, rootCdp = record?.cdp;
  if (!page || !rootCdp || typeof browser?.frameBindings !== 'function'
    || typeof page.locator !== 'function') throw missing('page/frame bindings');
  const serverPage = implementation(page);
  // Construct only to obtain this installed library's Locator prototype; the
  // empty selector is never resolved or substituted for a caller's selector.
  const locatorPrototype = Object.getPrototypeOf(page.locator(''));

  function checkRecord() {
    signal?.throwIfAborted();
    if (record.page !== page || record.cdp !== rootCdp || page.isClosed()) throw stale();
    record.assertFileAccess?.();
    if (implementation(page) !== serverPage) throw stale();
  }

  async function nativeBinding(tabId) {
    checkRecord();
    const adapter = record.capabilityAdapter;
    if (typeof adapter?.resolveTarget !== 'function') throw missing('native target binding');
    const native = await adapter.resolveTarget();
    checkRecord();
    const stored = browser.records?.get(record.id);
    const ids = [stored?.nativeTabId, record.nativeTabId].filter(value => value !== undefined);
    if (!Number.isSafeInteger(native?.tabId) || native.tabId <= 0 || !ids.length
      || ids.some(value => value !== native.tabId) || Number(tabId) !== native.tabId
      || typeof native.targetId !== 'string' || !native.targetId) throw stale();
    const { targetInfo } = await rootCdp.send('Target.getTargetInfo');
    checkRecord();
    if (targetInfo?.targetId !== native.targetId) throw stale();
    return native;
  }

  function budget(options = {}, bound) {
    const timeout = options.timeoutMs ?? options.timeout_ms ?? 3000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Browser auth timeout must be a positive integer');
    const deadline = Math.min(Date.now() + timeout, bound?.deadline ?? Infinity);
    const lifetime = AbortSignal.any([signal, bound?.signal,
      AbortSignal.timeout(Math.max(1, deadline - Date.now()))].filter(Boolean));
    return { deadline, signal: lifetime, remaining() {
      checkRecord(); lifetime.throwIfAborted();
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DOMException('Browser auth timed out', 'TimeoutError');
      return remaining;
    } };
  }

  async function wait(operation, limit, lateDispose) {
    limit.remaining();
    let abort;
    const aborted = new Promise((_, reject) => {
      abort = () => reject(limit.signal.reason);
      limit.signal.addEventListener('abort', abort, { once: true });
      if (limit.signal.aborted) abort();
    });
    const pending = Promise.resolve().then(() => { limit.remaining(); return operation(); });
    try { return await Promise.race([pending, aborted]); }
    catch (error) {
      if (lateDispose) pending.then(lateDispose, () => {}).catch(() => {});
      throw error;
    } finally { limit.signal.removeEventListener('abort', abort); }
  }

  function locatorFor(selector) {
    checkRecord();
    if (typeof selector === 'string') {
      if (!selector) throw new Error('Browser auth requires a nonempty selector');
      return page.locator(selector);
    }
    if (Object.getPrototypeOf(selector ?? {}) !== locatorPrototype
      || typeof selector?.page !== 'function' || selector.page() !== page
      || selector._frame?.page() !== page || typeof selector._selector !== 'string'
      || typeof selector.elementHandle !== 'function' || typeof selector.elementHandles !== 'function') throw stale();
    const serverFrame = implementation(selector._frame);
    if (serverFrame._page !== serverPage) throw stale();
    return selector;
  }

  async function routeFor(locator, limit, strict) {
    const sourceFrame = implementation(locator._frame);
    if (sourceFrame._page !== serverPage
      || typeof sourceFrame.selectors?.resolveFramesForSelector !== 'function') throw missing('selector frame resolver');
    const routes = await wait(() => sourceFrame.selectors.resolveFramesForSelector(
      locator._selector, { strict }), limit);
    if (!Array.isArray(routes) || routes.length !== 1) throw stale();
    const serverFrame = routes[0].frame;
    const frame = page.frames().find(candidate => implementation(candidate) === serverFrame);
    if (!frame || frame.isDetached() || serverFrame._page !== serverPage) throw stale();
    return { frame, serverFrame };
  }

  async function frameBinding(frame, serverFrame, limit) {
    const bindings = await wait(() => browser.frameBindings(record), limit);
    const matches = bindings.filter(binding => binding.frame === frame);
    if (matches.length !== 1) throw stale();
    const binding = matches[0];
    if (!binding.cdp || typeof binding.cdp.send !== 'function'
      || binding.frameId !== serverFrame._id) throw stale();
    return binding;
  }

  async function identityFor(binding, serverFrame, limit) {
    const { frameTree } = await wait(() => binding.cdp.send('Page.getFrameTree'), limit);
    const identity = documentIdentity(frameInTree(frameTree, binding.frameId));
    if (serverFrame._currentDocument?.documentId !== identity.loaderId) throw stale();
    return identity;
  }

  async function nodeIdentity(handle, serverFrame, limit) {
    const element = implementation(handle);
    if (element._frame !== serverFrame || element._context?.frame !== serverFrame
      || !element._objectId || element._disposed) throw stale();
    const delegate = serverFrame._page.delegate;
    if (typeof delegate?._sessionForHandle !== 'function') throw missing('Chromium node session');
    const client = delegate._sessionForHandle(element)?._client;
    if (typeof client?.send !== 'function') throw missing('Chromium node transport');
    const { node } = await wait(() => client.send('DOM.describeNode', { objectId: element._objectId }), limit);
    if (!Number.isSafeInteger(node?.backendNodeId) || node.backendNodeId <= 0 || node.nodeType !== 1) throw stale();
    const connected = await wait(() => handle.evaluate(node => node.isConnected && node.ownerDocument === document), limit);
    if (connected !== true) throw stale();
    return { element, backendNodeId: node.backendNodeId };
  }

  async function targetFor(binding, native, limit) {
    if (binding.cdp === rootCdp) return { tabId: native.tabId };
    const sessionId = implementation(binding.cdp)._session?._sessionId;
    const { targetInfo } = await wait(() => binding.cdp.send('Target.getTargetInfo'), limit);
    if (typeof sessionId !== 'string' || !sessionId || typeof targetInfo?.targetId !== 'string'
      || !targetInfo.targetId) throw stale();
    return { tabId: native.tabId, sessionId, targetId: targetInfo.targetId };
  }

  async function documentNodeIdentity(serverFrame, limit) {
    const context = await wait(() => serverFrame.context('main'), limit);
    if (context.frame !== serverFrame || context.world !== 'main') throw stale();
    const root = await wait(() => context.evaluateHandle(() => document.documentElement), limit,
      handle => handle.dispose());
    try {
      if (!root.asElement() || root._frame !== serverFrame || !root._objectId) throw stale();
      const client = serverFrame._page.delegate._sessionForHandle(root)?._client;
      if (typeof client?.send !== 'function') throw missing('Chromium document transport');
      const { node } = await wait(() => client.send('DOM.describeNode', { objectId: root._objectId }), limit);
      if (node?.frameId !== serverFrame._id || node.nodeType !== 1
        || !Number.isSafeInteger(node.backendNodeId) || node.backendNodeId <= 0) throw stale();
      return node.backendNodeId;
    } finally { root.dispose(); }
  }

  async function capture(tabId, selector, options, limit, all = false) {
    const native = await wait(() => nativeBinding(tabId), limit);
    const locator = locatorFor(selector);
    const route = await routeFor(locator, limit, options.strict !== false);
    const binding = await frameBinding(route.frame, route.serverFrame, limit);
    const identity = await identityFor(binding, route.serverFrame, limit);
    let handles = [];
    try {
      handles = all ? await wait(() => locator.elementHandles(), limit, dispose)
        : [await wait(() => (options.strict === false ? locator.first() : locator).elementHandle({
          timeout: limit.remaining(), signal: limit.signal,
        }), limit, handle => handle?.dispose())];
      if (handles.some(handle => !handle)) throw stale();
      const owners = await wait(() => Promise.all(handles.map(handle => handle.ownerFrame())), limit);
      if (owners.some(frame => frame !== route.frame)) throw stale();
      const nodes = await Promise.all(handles.map(handle => nodeIdentity(handle, route.serverFrame, limit)));
      const documentBackendNodeId = handles.length ? undefined : await documentNodeIdentity(route.serverFrame, limit);
      const target = await targetFor(binding, native, limit);
      const captured = { tabId, selector, locator, ...route, binding, identity, handles, nodes, target, documentBackendNodeId };
      await assertCapture(captured, limit);
      return captured;
    } catch (error) { await dispose(handles.filter(Boolean)); throw error; }
  }

  async function assertCapture(captured, limit) {
    await wait(() => nativeBinding(captured.tabId), limit);
    const binding = await frameBinding(captured.frame, captured.serverFrame, limit);
    if (binding.cdp !== captured.binding.cdp || binding.frameId !== captured.binding.frameId
      || !sameDocument(await identityFor(binding, captured.serverFrame, limit), captured.identity)) throw stale();
    const nodes = await Promise.all(captured.handles.map(handle => nodeIdentity(handle, captured.serverFrame, limit)));
    if (nodes.some((node, index) => node.backendNodeId !== captured.nodes[index].backendNodeId)) throw stale();
    if (!nodes.length && await documentNodeIdentity(captured.serverFrame, limit) !== captured.documentBackendNodeId) throw stale();
  }

  async function evaluateCaptured(captured, callback, options, limit, all) {
    if (typeof callback !== 'function') throw new Error('Browser auth requires a page function');
    const source = callback.toString();
    new Function(`return (${source});`);
    const world = options.isolatedWorld === true ? 'utility' : 'main';
    const context = await wait(() => captured.serverFrame.context(world), limit);
    if (context.frame !== captured.serverFrame || context.world !== world) throw stale();
    const injected = await wait(() => context.injectedScript(), limit);
    if (injected._context !== context || injected._disposed || !injected._objectId) throw missing('InjectedScript');
    await assertCapture(captured, limit);
    // All DOM operations remain methods of the installed InjectedScript. Only
    // its renamed accessible-name text utility receives a scoped API alias.
    const expression = `(payload) => {
      const injected = payload.injected;
      for (const name of ['retarget', 'elementState', 'parseSelector', 'querySelectorAll', 'fill']) {
        if (typeof injected[name] !== 'function') throw new Error('Browser auth InjectedScript is incomplete');
      }
      if (injected.utils.builtins.Date.now() >= payload.deadline) throw new Error('Browser auth timed out');
      for (const element of payload.elements) {
        if (!element.isConnected || element.ownerDocument !== document) throw new Error('Browser auth locator document changed');
      }
      const nameText = injected.utils.getElementAccessibleName ?? injected.utils.getElementAccessibleNameText;
      if (typeof nameText !== 'function') throw new Error('Browser auth accessible-name utility is unavailable');
      const utils = { ...injected.utils, getElementAccessibleName: nameText };
      const helper = new Proxy(injected, { get(target, property) {
        if (property === 'utils') return utils;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      return (${source})(${all ? 'payload.elements' : 'payload.elements[0]'}, helper, payload.arg);
    }`;
    return await wait(() => context.evaluateExpression(expression, { isFunction: true }, {
      injected, elements: captured.nodes.map(node => node.element), arg: options.arg, deadline: limit.deadline,
    }), limit);
  }

  function adapterFor(bound) {
    const effective = options => {
      if (bound && !bound.active) throw stale();
      if (bound?.isolatedWorld && options?.isolatedWorld === false) throw stale();
      return { ...options, ...(bound?.isolatedWorld ? { isolatedWorld: true } : {}) };
    };

    async function use(tabId, selector, options, operation, all = false) {
      options = effective(options);
      const limit = budget(options, bound);
      if (bound) await assertCapture(bound.captured, limit);
      const locator = locatorFor(selector);
      const existing = !all && bound && sameSelector(locator, bound.captured.locator);
      const captured = existing ? bound.captured : await capture(tabId, selector, options, limit, all);
      try {
        if (Number(tabId) !== captured.target.tabId) throw stale();
        return await operation(captured, options, limit);
      } finally { if (!existing) await dispose(captured.handles); }
    }

    const api = {
      evaluateOnPlaywrightSelector(tabId, selector, callback, options = {}) {
        return use(tabId, selector, options, (captured, actual, limit) => evaluateCaptured(captured, callback, actual, limit, false));
      },
      evaluateOnPlaywrightSelectorWithTarget(tabId, selector, callback, options = {}) {
        return use(tabId, selector, options, async (captured, actual, limit) => ({
          result: await evaluateCaptured(captured, callback, actual, limit, false), target: captured.target,
          ...actual.includeFrameIdentity ? { frameIdentity: {
            frameId: captured.identity.frameId, loaderId: captured.identity.loaderId,
            url: captured.identity.url, domainAndRegistry: captured.identity.domainAndRegistry,
          } } : {},
        }));
      },
      evaluateOnPlaywrightSelectorAll(tabId, selector, callback, options = {}) {
        return use(tabId, selector, options, (captured, actual, limit) => evaluateCaptured(captured, callback, actual, limit, true), true);
      },
      async selectorsResolveToDistinctElements(tabId, selectors, options = {}) {
        const actual = effective(options), limit = budget(actual, bound), captures = [];
        try {
          await wait(() => nativeBinding(tabId), limit);
          if (bound) await assertCapture(bound.captured, limit);
          for (const selector of selectors) captures.push(await capture(tabId, selector, { ...actual, strict: true }, limit));
          for (const captured of captures) await assertCapture(captured, limit);
          const keys = captures.map(captured => `${captured.target.tabId}:${captured.target.sessionId ?? ''}:${captured.target.targetId ?? ''}:${captured.identity.frameId}:${captured.identity.loaderId}:${captured.nodes[0].backendNodeId}`);
          return new Set(keys).size === keys.length;
        } finally { await dispose(captures.flatMap(captured => captured.handles)); }
      },
      readElementState(locator, state) {
        if (locator.browser_id !== undefined && locator.browser_id !== browser.id) throw stale();
        if (!['visible', 'enabled', 'editable'].includes(state)) throw new Error('Unsupported browser auth element state');
        return api.evaluateOnPlaywrightSelector(locator.tab_id, locator.selector,
          (element, helper, state) => helper.elementState(element, state).matches,
          { arg: state, timeoutMs: locator.timeout_ms, strict: true });
      },
      async withBoundPlaywrightSelector(tabId, selector, validate, action, options = {}) {
        const actual = effective(options), limit = budget(actual, bound);
        const captured = await capture(tabId, selector, { ...actual, strict: true }, limit);
        const current = { captured, active: true, isolatedWorld: actual.isolatedWorld === true,
          deadline: limit.deadline, signal: limit.signal };
        try {
          if (typeof validate !== 'function' || typeof action !== 'function') throw new Error('Browser auth requires validation and action callbacks');
          if (await wait(validate, limit) !== true) return;
          await assertCapture(captured, limit);
          const after = await capture(tabId, selector, { ...actual, strict: true }, limit);
          try {
            if (after.binding.cdp !== captured.binding.cdp || !sameDocument(after.identity, captured.identity)
              || after.nodes[0].backendNodeId !== captured.nodes[0].backendNodeId) throw stale();
          } finally { await dispose(after.handles); }
          return await action(adapterFor(current));
        } finally { current.active = false; await dispose(captured.handles); }
      },
      clickLocator(locator, clickCount = 1) {
        if (locator.browser_id !== undefined && locator.browser_id !== browser.id) throw stale();
        return use(locator.tab_id, locator.selector, { timeoutMs: locator.timeout_ms, strict: true }, async (captured, _options, limit) => {
          if (bound && !sameSelector(captured.locator, bound.captured.locator)) throw stale();
          await assertCapture(captured, limit);
          await captured.handles[0].click({ clickCount, timeout: limit.remaining(), signal: limit.signal });
        });
      },
      pressLocator(locator) {
        if (locator.browser_id !== undefined && locator.browser_id !== browser.id) throw stale();
        if (typeof locator.value !== 'string') throw new Error('Browser auth requires a key value');
        return use(locator.tab_id, locator.selector, { timeoutMs: locator.timeout_ms, strict: true }, async (captured, _options, limit) => {
          if (bound && !sameSelector(captured.locator, bound.captured.locator)) throw stale();
          await assertCapture(captured, limit);
          await captured.handles[0].press(locator.value, { timeout: limit.remaining(), signal: limit.signal });
        });
      },
    };
    return Object.freeze(api);
  }

  return adapterFor();
}
