const PREFIX = 'dsh-resource://opencu-tab/';
const fail = (message, code = 'BROWSER_WORKSPACE_CHANGED') => Object.assign(new Error(message), { code });

function identityPart(value, name) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\x00-\x1f\x7f]/u.test(value)) {
    throw fail(`Invalid browser workspace ${name}`, 'INVALID_BROWSER_WORKSPACE_ADDRESS');
  }
  return value;
}

function address(sessionId, browserId, tabId) {
  return PREFIX + [identityPart(sessionId, 'session'), identityPart(browserId, 'browser'), identityPart(tabId, 'tab')]
    .map(value => encodeURIComponent(value)).join('/');
}

function parse(value) {
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'dsh-resource:' || url.host !== 'opencu-tab' || url.username || url.password
      || url.search || url.hash) throw new Error();
    const parts = url.pathname.split('/');
    if (parts.length !== 4 || parts[0] !== '') throw new Error();
    const [sessionId, browserId, tabId] = parts.slice(1).map(part => decodeURIComponent(part));
    if (address(sessionId, browserId, tabId) !== value) throw new Error();
    return { sessionId, browserId, tabId };
  } catch { throw fail('Invalid browser workspace resource address', 'INVALID_BROWSER_WORKSPACE_ADDRESS'); }
}

function nativeIdentity(sessionId, target) {
  if (!target || target.kind !== undefined && target.kind !== 'tab' || target.available === false
    || target.sessionId !== undefined && target.sessionId !== sessionId) throw fail('This browser tab is unavailable to the conversation');
  return parse(address(sessionId, target.browserId, target.id));
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => key !== 'observedAt').map(key => [key, comparable(value[key])]));
  return value;
}

/** Own-kind host records are views of real browser tabs; opening is always explicit. */
export function createBrowserWorkspaceTabs({ sidebar, kind, api, onState, onError }) {
  if (!sidebar || ['openResourceIn', 'tabsIn', 'closeIn', 'focus'].some(name => typeof sidebar[name] !== 'function')
    || typeof kind !== 'string' || !kind || typeof api !== 'function') throw new TypeError('Browser workspace operations are required');
  const inventories = new Map(), suppressClose = new Set(), pending = new Map(), placements = new Map(), errors = new Map();
  const views = new Map(), detached = new Map(), snapshots = new Map(), listeners = new Map();
  const routes = new Map();
  let disposed = false;
  const hostKey = (sessionId, tabId) => JSON.stringify([sessionId, tabId]);
  const report = (error, sessionId) => {
    errors.set(sessionId,error);
    if (typeof onError === 'function') {
      try { onError(error, sessionId); }
      catch (reportError) { console.error('OpenCU browser workspace error reporting failed:', error, reportError); }
    } else console.error('OpenCU browser workspace failed:', error);
  };
  const ownHostTabs = sessionId => sidebar.tabsIn(sessionId).filter(tab => tab.kind === kind);
  const publish = (sessionId, events) => {
    const inventory = inventories.get(sessionId) ?? new Map(), previous = snapshots.get(sessionId);
    const signature = JSON.stringify([...inventory].sort(([left], [right]) => left.localeCompare(right))
      .map(([resource, target]) => [resource, comparable(target)]));
    if (previous?.signature === signature && !events.length) return;
    snapshots.set(sessionId, { revision: (previous?.revision ?? 0) + 1, signature, events });
    for (const listener of listeners.get(sessionId) ?? []) {
      try { listener(); } catch (error) { report(error, sessionId); }
    }
  };
  const withSuppressedClose = (sessionId, tabId, action) => {
    const key = hostKey(sessionId, tabId), already = suppressClose.has(key);
    suppressClose.add(key);
    try { return action(); } finally { if (!already) suppressClose.delete(key); }
  };
  const closeHost = (sessionId, hostTabId) => {
    const host = ownHostTabs(sessionId).find(tab => tab.id === hostTabId);
    if (!host) return false;
    const identity = parse(host.contentId);
    if (identity.sessionId !== sessionId) throw fail('The host tab belongs to another conversation');
    withSuppressedClose(sessionId, hostTabId, () => sidebar.closeIn(sessionId, hostTabId));
    views.delete(hostKey(sessionId, hostTabId));
    return true;
  };

  function rememberView(sessionId, hostTabId, { paneId } = {}) {
    const host = ownHostTabs(sessionId).find(tab => tab.id === hostTabId);
    if (!host) return false;
    const identity = parse(host.contentId);
    if (identity.sessionId !== sessionId) throw fail('The browser workspace view belongs to another conversation');
    views.set(hostKey(sessionId, hostTabId), { sessionId, hostTabId, resource: host.contentId, paneId });
    return true;
  }

  function open(sessionId, target, { paneId, replaceTab } = {}) {
    if (disposed) throw fail('Browser workspace is disposed');
    const identity = nativeIdentity(sessionId, target), resource = address(sessionId, identity.browserId, identity.tabId);
    const options = { kind, ...(paneId === undefined ? {} : { paneId }), ...(replaceTab === undefined ? {} : { replaceTab }) };
    const replaced = replaceTab === undefined ? null : sidebar.tabsIn(sessionId).find(tab => tab.id === replaceTab);
    if (replaced?.kind === kind && parse(replaced.contentId).sessionId !== sessionId) throw fail('The replacement belongs to another conversation');
    const place = () => sidebar.openResourceIn(sessionId, resource, options);
    if (replaced?.kind === kind) withSuppressedClose(sessionId, replaced.id, place);
    else place();
    if (paneId !== undefined || !placements.has(resource)) placements.set(resource, { paneId });
    const hostTab = ownHostTabs(sessionId).find(tab => tab.contentId === resource) ?? null;
    if (hostTab && paneId !== undefined) rememberView(sessionId, hostTab.id, { paneId });
    // Publish the actual created target before the first inventory poll supplies its title.
    const inventory = new Map(inventories.get(sessionId) ?? []);
    inventory.set(resource, { ...target });
    inventories.set(sessionId, inventory);
    publish(sessionId, []);
    return { address: resource, identity, hostTab };
  }

  function reveal(sessionId, target, { hostTabId, paneId } = {}) {
    const identity = nativeIdentity(sessionId, target), resource = address(sessionId, identity.browserId, identity.tabId);
    const hosts = ownHostTabs(sessionId).filter(tab => tab.contentId === resource);
    const host = hosts.find(tab => tab.id === hostTabId) ?? hosts[0];
    if (host) {
      if (sidebar.mounted?.getSnapshot() === sessionId) sidebar.focus(host.id);
      return { address: resource, identity, hostTab: host };
    }
    return open(sessionId, target, { paneId: paneId ?? placements.get(resource)?.paneId });
  }

  function openFromHost(sessionId, tab, { paneId } = {}) {
    if (disposed) throw fail('Browser workspace is disposed');
    const value = tab.navigation?.params?.url;
    if (value === undefined || value === '') return Promise.resolve(null);
    let destination;
    try {
      if (typeof value !== 'string' || value.length > 32768 || /[\x00-\x1f\x7f]/u.test(value)) throw new Error();
      destination = new URL(value);
      if (!['http:', 'https:'].includes(destination.protocol)) throw new Error();
    } catch { return Promise.reject(fail('Browser links require an absolute HTTP(S) URL', 'INVALID_BROWSER_ADDRESS')); }
    const key = hostKey(sessionId, tab.id), previous = routes.get(key);
    if (previous?.signal === tab.signal && previous.revision === tab.navigation?.revision && previous.url === destination.href) return previous.promise;
    previous?.controller.abort();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, tab.signal].filter(Boolean));
    const job = { controller, signal: tab.signal, revision: tab.navigation?.revision, url: destination.href };
    const current = () => {
      signal.throwIfAborted();
      if (disposed || routes.get(key) !== job || !sidebar.tabsIn(sessionId).some(record => record.id === tab.id && record.contentId === tab.contentId)) {
        throw fail('The browser destination has changed');
      }
    };
    routes.set(key, job);
    job.promise = Promise.resolve().then(async () => {
      current();
      const state = await api('state', sessionId, undefined, signal);
      current();
      if (!Number.isSafeInteger(state?.controlEpoch) || state.enabled === false || state.transitioning || state.resuming) throw fail('The conversation control state changed');
      const next = await api('tabs', sessionId, { action: 'new', browserId: 'browser', url: destination.href, controlEpoch: state.controlEpoch }, signal);
      current();
      const target = next?.viewTarget ?? next?.target;
      if (target?.kind !== 'tab') throw fail('The browser did not return an opened tab');
      onState?.(next, sessionId);
      return open(sessionId, target, { paneId, replaceTab: tab.id });
    }).catch(error => {
      if (routes.get(key) === job) routes.delete(key);
      throw error;
    }).finally(() => {
      // A completed route is retained while its page exists so rerenders cannot duplicate it.
      if (routes.get(key) === job && !sidebar.tabsIn(sessionId).some(record => record.id === tab.id)) routes.delete(key);
    });
    return job.promise;
  }

  function sync(sessionId, tabs, { inventorySucceeded = false, successfulBrowserIds } = {}) {
    identityPart(sessionId, 'session');
    if (disposed) return { tabs: [], removed: [], complete: false };
    if (!Array.isArray(tabs)) throw new TypeError('A real browser tab inventory is required');
    const inventory = new Map();
    for (const target of tabs) {
      if (target?.sessionId !== undefined && target.sessionId !== sessionId) continue;
      const resource = address(sessionId, target.browserId, target.id);
      if (inventory.has(resource)) throw fail('The browser inventory contains duplicate tab identities');
      inventory.set(resource, { ...target });
    }
    if (inventorySucceeded !== true) return { tabs: [...inventory.values()], removed: [], complete: false };
    if (successfulBrowserIds !== undefined && (!Array.isArray(successfulBrowserIds)
      || successfulBrowserIds.some(id => typeof id !== 'string' || !id))) throw new TypeError('Successful browser identities must be an array');
    const successful = new Set(successfulBrowserIds ?? []);
    const merged = new Map([...(inventories.get(sessionId) ?? [])].filter(([resource]) => !successful.has(parse(resource).browserId)));
    for (const [resource, target] of inventory) if (successful.has(target.browserId)) merged.set(resource, target);
    inventories.set(sessionId, merged);
    const removed = [], events = [];
    for (const resource of detached.keys()) {
      const identity = parse(resource);
      if (identity.sessionId === sessionId && successful.has(identity.browserId) && !merged.has(resource)) {
        detached.delete(resource);
        events.push({ type: 'closed', identity });
      }
    }
    for (const [resource, target] of merged) {
      const identity = parse(resource);
      if (!successful.has(identity.browserId)) continue;
      const hosts = ownHostTabs(sessionId).filter(host => host.contentId === resource), previous = detached.get(resource);
      if (target.available !== true) {
        if (previous) { detached.delete(resource); events.push({ type: 'ownership-changed', identity }); }
        continue;
      }
      if (target.detached && hosts.length) {
        detached.set(resource, { browserEpoch: target.browserEpoch, providerTabId: target.providerTabId,
          detachedId: target.detached.id, views: hosts.map(host => views.get(hostKey(sessionId, host.id))
            ?? { sessionId, hostTabId: host.id, resource, ...placements.get(resource) }) });
      } else if (!target.detached && previous) {
        detached.delete(resource);
        if (previous.browserEpoch !== target.browserEpoch || previous.providerTabId !== target.providerTabId) {
          report(fail('The detached browser connection changed'), sessionId);
          events.push({ type: 'connection-changed', identity });
          continue;
        }
        // Existing host records stay in their original panes. Only a missing known source view is recovered.
        if (!hosts.length && !pending.has(resource)) {
          const source = previous.views[0];
          try { open(sessionId, target, { paneId: source?.paneId }); }
          catch (error) { report(error, sessionId); open(sessionId, target); }
        }
        events.push({ type: 'restored', identity, target: { ...target },
          hostTabIds: ownHostTabs(sessionId).filter(host => host.contentId === resource).map(host => host.id) });
      }
    }
    for (const host of ownHostTabs(sessionId)) {
      let identity;
      try { identity = parse(host.contentId); } catch (error) { report(error, sessionId); continue; }
      if (identity.sessionId !== sessionId) { report(fail('A browser workspace record belongs to another conversation'), sessionId); continue; }
      if (!successful.has(identity.browserId) || merged.has(host.contentId)) continue;
      closeHost(sessionId, host.id);
      removed.push(host.id);
    }
    const liveHosts = new Set(ownHostTabs(sessionId).map(host => hostKey(sessionId, host.id)));
    for (const [key, view] of views) if (view.sessionId === sessionId && !liveHosts.has(key)) views.delete(key);
    publish(sessionId, events);
    return { tabs: [...merged.values()], removed, events, complete: true };
  }

  async function readNativeTab(identity, signal) {
    const snapshot = await api('tabs', identity.sessionId, undefined, signal);
    signal.throwIfAborted();
    if (!snapshot || !Array.isArray(snapshot.tabs) || !Array.isArray(snapshot.successfulBrowserIds)
      || !snapshot.successfulBrowserIds.includes(identity.browserId)) throw fail('The native browser inventory is unavailable');
    const matches = snapshot.tabs.filter(tab => tab.id === identity.tabId && tab.browserId === identity.browserId);
    if (matches.length > 1) throw fail('The native browser tab identity is ambiguous');
    return matches[0] ?? null;
  }

  function closeHandler(sessionId, hostTab) {
    if (hostTab?.kind !== kind || suppressClose.has(hostKey(sessionId, hostTab.id))) return;
    if (disposed) throw fail('Browser workspace is disposed');
    const identity = parse(hostTab.contentId);
    if (identity.sessionId !== sessionId) throw fail('The closing browser tab belongs to another conversation');
    if (ownHostTabs(sessionId).some(tab => tab.id !== hostTab.id && tab.contentId === hostTab.contentId)) return;
    if (pending.has(hostTab.contentId)) return;
    const controller = new AbortController(), job = { controller, promise: null };
    const originalPlacement = views.get(hostKey(sessionId, hostTab.id)) ?? placements.get(hostTab.contentId);
    const reopen = target => {
      if (disposed || controller.signal.aborted || target?.available === false) return;
      try { reveal(sessionId, { ...target, sessionId }, { hostTabId: hostTab.id, paneId: originalPlacement?.paneId }); }
      catch (error) {
        report(error, sessionId);
        // The containing pane may disappear when its last host view closes.
        open(sessionId, { ...target, sessionId });
      }
    };
    // The host hook is synchronous. Retain cleanup before its removal commit, then reopen if native close is blocked.
    job.promise = Promise.resolve().then(async () => {
      const signal = controller.signal;
      let original;
      try {
        original = await readNativeTab(identity, signal);
        if (!original) throw fail('The native browser tab could not be confirmed');
        if (original.available !== true || original.sessionId !== undefined && original.sessionId !== sessionId) {
          throw fail('This browser tab is now controlled by another conversation', 'BROWSER_WORKSPACE_OWNERSHIP_CHANGED');
        }
        const state = await api('state', sessionId, undefined, signal);
        signal.throwIfAborted();
        if (!Number.isSafeInteger(state?.controlEpoch) || state.enabled === false || state.transitioning || state.resuming) {
          throw fail('The conversation control state changed');
        }
        if (ownHostTabs(sessionId).some(tab => tab.contentId === hostTab.contentId)) return;
        const expected = ['title', 'url', 'providerTabId'].every(key => typeof original[key] === 'string')
          ? Object.fromEntries(['title', 'url', 'providerTabId'].map(key => [key, original[key]])) : undefined;
        const next = await api('tabs', sessionId, { action: 'close', tabId: identity.tabId, browserId: identity.browserId,
          controlEpoch: state.controlEpoch, ...(expected ? { expected } : {}) }, signal);
        signal.throwIfAborted();
        if (next === false || next?.ok === false || next?.success === false) throw fail('Native browser tab close failed');
        onState?.(next, sessionId);
        const remaining = await readNativeTab(identity, signal);
        if (remaining) {
          if (remaining.available !== true) throw fail('Browser tab ownership changed during close', 'BROWSER_WORKSPACE_OWNERSHIP_CHANGED');
          reopen(remaining);
        }
      } catch (error) {
        if (controller.signal.aborted || disposed) return;
        report(error, sessionId);
        try {
          const remaining = await readNativeTab(identity, controller.signal);
          if (remaining?.available === true) reopen(remaining);
        } catch (recoveryError) {
          report(recoveryError, sessionId);
          if (original?.available === true && error.code !== 'BROWSER_WORKSPACE_OWNERSHIP_CHANGED') reopen(original);
        }
      }
    }).catch(error => report(error, sessionId))
      .finally(() => { if (pending.get(hostTab.contentId) === job) pending.delete(hostTab.contentId); });
    pending.set(hostTab.contentId, job);
  }

  function dispose() {
    disposed = true;
    for (const job of pending.values()) job.controller.abort();
    for (const job of routes.values()) job.controller.abort();
    inventories.clear(); placements.clear(); suppressClose.clear(); views.clear(); detached.clear(); snapshots.clear(); listeners.clear();
    const work = [...pending.values(), ...routes.values()].map(job => job.promise);
    routes.clear();
    return Promise.allSettled(work);
  }
  return { address, parse, open, openFromHost, reveal, rememberView, sync, closeHandler, closeHost, dispose, error: sessionId => errors.get(sessionId),
    snapshot: sessionId => snapshots.get(sessionId)?.revision ?? 0,
    events: sessionId => snapshots.get(sessionId)?.events ?? [],
    subscribe: (sessionId, listener) => {
      let owned = listeners.get(sessionId);
      if (!owned) { owned = new Set(); listeners.set(sessionId, owned); }
      owned.add(listener);
      return () => { owned.delete(listener); if (!owned.size && listeners.get(sessionId) === owned) listeners.delete(sessionId); };
    },
    inventory: sessionId => [...(inventories.get(sessionId)?.values() ?? [])] };
}
