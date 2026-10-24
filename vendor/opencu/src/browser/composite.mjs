/**
 * Composes the independently implemented Playwright and extension backends into the controller's
 * browser inventory. Targets keep their real provider and occurrence identity; extension navigation
 * requires explicit reselection, and a disconnected input release is not treated as confirmed.
 * Extension download events stay metadata-only until explicitly imported and validated.
 */
import {basename} from 'node:path';
import {assertBackend, checkExpected, checkSignal, errorJSON, fail, inputReleased, json, readOperation, referenceMatches, sameIdentity} from '../protocol.mjs';
import {parseTarget, targetId} from '../extension/protocol.mjs';
import {normalizeBrowserAction} from './actions.mjs';

const navigation = new Set(['navigate', 'back', 'forward', 'reload']);
const aliases = {press: 'press_key', closeTab: 'close_tab', doubleClick: 'double_click'};

// Extension ids retain document occurrences; navigation promotes only a freshly verified same-tab identity.
export function createCompositeBrowserBackend({browser, extension, dsh, releaseUnavailable = {}} = {}) {
  if (!browser && !extension && !dsh) fail('INVALID_BACKEND', 'A browser or extension provider is required');
  if (browser) assertBackend(browser, 'browser');
  if (extension) assertBackend(extension, 'extension');
  if (dsh) assertBackend(dsh, 'dsh');
  const held = new Map(), stale = new Set(), inventoryErrors = [];
  let closed = false;
  const alive = () => { if (closed) fail('BACKEND_CLOSED', 'Composite browser backend is closed'); };
  const providerName = target => target?.provider ?? (String(target?.id ?? target).startsWith('extension:') ? 'extension' : 'browser');
  const providerFor = target => {
    const provider = providerName(target);
    const backend = provider === 'extension' ? extension : provider === 'browser' ? browser : provider === 'dsh' ? dsh : undefined;
    if (!backend) fail('BACKEND_UNAVAILABLE', `Browser provider ${provider} is unavailable`);
    return {provider, backend};
  };
  function wrap(target, provider) {
    if (provider === 'extension') {
      const identity = parseTarget(target);
      if (target.identity && !sameIdentity(target.identity, identity)) fail('TARGET_IDENTITY_CHANGED', 'Extension id and identity disagree');
      return json({...target, id: targetId(identity), identity, backend: 'browser', kind: 'tab', provider,
        browserId: target.browserId ?? `extension:${identity.instanceId}`});
    }
    return json({...target, backend: 'browser', kind: 'tab', provider});
  }
  function unwrap(target, provider) {
    const {provider: _provider, ...reference} = target;
    return {...reference, backend: provider === 'dsh' ? 'browser' : provider, kind: provider === 'extension' ? 'browser' : 'tab'};
  }
  async function verifyExtension(target, options) {
    if (stale.has(target.id)) return {valid: false, reason: 'Document changed after navigation; list targets and select the new document occurrence'};
    const identity = parseTarget(target);
    if (!sameIdentity(identity, target.identity)) return {valid: false, reason: 'Extension id and identity disagree'};
    try {
      const result = await extension.verify(unwrap(target, 'extension'), options);
      if (result?.valid !== true && result?.verified !== true) return {valid: false, reason: result?.reason ?? 'Extension did not verify the document'};
      const actual = result.target?.identity ?? result.identity;
      if (!actual || !sameIdentity(actual, identity) || result.documentId !== undefined && result.documentId !== identity.documentId) {
        return {valid: false, reason: 'Extension returned a different document occurrence'};
      }
      return {valid: true, target: wrap({...target, ...(result.target ?? {}),
        ...(result.url === undefined ? {} : {url: result.url}), ...(result.title === undefined ? {} : {title: result.title})}, 'extension')};
    } catch (error) { return {valid: false, reason: error.message, error: errorJSON(error)}; }
  }
  async function release({targets = [], dismissDialogs = true} = {}) {
    const failures = [], results = [], retiredTargetIds = [];
    const unavailable = new Set([...targets.map(providerName), ...Object.keys(releaseUnavailable)]);
    for (const [provider, backend] of [['browser', browser], ['extension', extension], ['dsh', dsh]]) if (backend) unavailable.delete(provider);
    for (const provider of unavailable) {
      try {
        if (typeof releaseUnavailable[provider] !== 'function') fail('BACKEND_UNAVAILABLE', `Cannot verify input release for unavailable browser provider ${provider}`);
        const result = await releaseUnavailable[provider]({targets: targets.filter(target => providerName(target) === provider)});
        results.push({provider, result});
        if (!inputReleased(result)) failures.push({provider, code: 'RELEASE_UNACKNOWLEDGED', result});
      } catch (error) { failures.push({provider, ...errorJSON(error)}); }
    }
    for (const [provider, backend] of [['browser', browser], ['dsh', dsh]]) {
      if (!backend) continue;
      try {
        const result = await backend.release({targets: targets.filter(target => providerName(target) === provider).map(target => unwrap(target, provider)), dismissDialogs});
        retiredTargetIds.push(...(result?.retiredTargetIds ?? []));
        results.push({provider, result});
        if (!inputReleased(result)) failures.push({provider, code: 'RELEASE_UNACKNOWLEDGED', result});
      } catch (error) { failures.push({provider, ...errorJSON(error)}); }
    }
    if (extension) {
      const pending = new Map(held);
      for (const target of targets) if (providerName(target) === 'extension') pending.set(target.id, target);
      for (const target of pending.values()) {
        try {
          const result = await extension.release(unwrap(target, 'extension'));
          results.push({provider: 'extension', targetId: target.id, result});
          if (!inputReleased(result)) { held.set(target.id, target); failures.push({provider: 'extension', targetId: target.id, code: 'RELEASE_UNACKNOWLEDGED', result}); }
          else { held.delete(target.id); if (result.retired === true) { retiredTargetIds.push(target.id); stale.delete(target.id); } }
        } catch (error) {
          held.set(target.id, target);
          failures.push({provider: 'extension', targetId: target.id, outcome: 'unknown', ...errorJSON(error)});
        }
      }
      // Also release connected tabs not represented in controller state. Empty sessions prove nothing about pending targets.
      try {
        const result = await extension.release();
        results.push({provider: 'extension', scope: 'connected-sessions', result});
        const empty = Array.isArray(result?.released) && result.released.length === 0;
        if (!inputReleased(result) && !(empty && pending.size === 0)) failures.push({provider: 'extension', code: 'RELEASE_UNACKNOWLEDGED', outcome: 'unknown', result});
      } catch (error) { failures.push({provider: 'extension', outcome: 'unknown', ...errorJSON(error)}); }
    }
    return {released: failures.length === 0, failures, results, retiredTargetIds};
  }
  const composite = {
    kind: 'browser',
    async releaseTarget(target, options) {
      alive();
      const {provider, backend} = providerFor(target), original = unwrap(target, provider);
      const result = provider === 'extension' ? await backend.release(original)
        : typeof backend.releaseTarget === 'function' ? await backend.releaseTarget(original, options)
        : {released: false, failures: [{code: 'TARGET_RELEASE_UNAVAILABLE'}]};
      if (inputReleased(result)) held.delete(target.id);
      return result;
    },
    async confirmClosedTargets(targets) {
      alive();
      const results = [];
      for (const provider of new Set(targets.map(providerName))) {
        const {backend} = providerFor({provider});
        if (!['extension', 'dsh'].includes(provider) || !backend.confirmClosedTargets) fail('UNSUPPORTED_OPERATION', 'Browser recovery is unavailable');
        results.push(await backend.confirmClosedTargets(targets.filter(target => providerName(target) === provider).map(target => unwrap(target, provider))));
      }
      return {released: results.length > 0 && results.every(inputReleased)};
    },
    async listBrowsers({signal} = {}) {
      alive(); checkSignal(signal);
      const browsers = await readOperation(() => browser?.listBrowsers?.({signal}) ?? [], signal);
      const sidebar = await readOperation(() => dsh?.listBrowsers?.({signal}) ?? [], signal);
      checkSignal(signal);
      return [...browsers, ...sidebar, ...(extension?.connections?.() ?? []).map(item =>
        ({id: 'extension:' + item.instanceId, name: item.label, provider: 'extension', connected: true}))];
    },
    async newTab(browserId, url, options) {
      alive(); checkSignal(options?.signal);
      const matches = (await composite.listBrowsers({signal: options?.signal})).filter(item => item.id === browserId);
      checkSignal(options?.signal);
      if (matches.length !== 1) fail('AMBIGUOUS_TARGET', 'Choose one connected browser ID');
      const {provider, backend} = providerFor(matches[0]);
      if (typeof backend.newTab !== 'function') fail('UNSUPPORTED_OPERATION', 'This browser cannot create a tab without an existing target');
      const target = wrap(await backend.newTab(browserId, url, options), provider);
      if (provider === 'extension') held.set(target.id, target);
      return target;
    },
    async listTargets({signal} = {}) {
      alive(); checkSignal(signal);
      const targets = [], errors = [];
      for (const [provider, backend] of [['browser', browser], ['extension', extension], ['dsh', dsh]]) {
        if (!backend) continue;
        try { targets.push(...(await readOperation(() => backend.listTargets({signal}), signal)).map(target => wrap(target, provider))); }
        catch (error) {
          checkSignal(signal);
          errors.push({provider, ...errorJSON(error)});
        }
        alive(); checkSignal(signal);
      }
      inventoryErrors.splice(0, inventoryErrors.length, ...errors);
      if (!targets.length && errors.length) fail('BROWSER_INVENTORY_FAILED', 'Browser providers could not list targets', errors);
      return targets;
    },
    async select(reference, {signal} = {}) {
      alive();
      const id = reference?.targetId ?? reference?.id;
      if (browser && reference?.provider === 'browser' && typeof id === 'string' && reference.identity && typeof reference.identity === 'object' && Object.keys(reference.identity).length) {
        // The provider and occurrence are already explicit. Let that provider
        // verify the live reference without discovering every provider again.
        checkSignal(signal);
        const selected = wrap(await browser.select(unwrap(reference, 'browser'), {signal}), 'browser');
        alive(); checkSignal(signal);
        if (!referenceMatches(selected, reference)) fail('TARGET_NOT_FOUND', 'Reference does not match the live browser target');
        if (!sameIdentity(selected.identity, reference.identity)) fail('TARGET_IDENTITY_CHANGED', 'Selection changed occurrence');
        checkExpected(selected, reference.expected);
        return selected;
      }
      const matches = (await composite.listTargets({signal})).filter(target => referenceMatches(target, reference) && (!reference?.provider || target.provider === reference.provider));
      checkSignal(signal);
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Reference must match one browser target');
      const target = matches[0], {provider, backend} = providerFor(target);
      checkExpected(target, reference?.expected);
      if (reference?.identity && !sameIdentity(reference.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Selection changed document occurrence');
      if (stale.has(target.id)) fail('TARGET_IDENTITY_CHANGED', 'Navigation invalidated this document occurrence; select the new document');
      if (provider === 'extension') held.set(target.id, target);
      const selected = wrap({...target, ...await backend.select(unwrap(target, provider), {signal})}, provider);
      if (selected.id !== target.id || !sameIdentity(selected.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Selection changed occurrence');
      return selected;
    },
    async focus(target, {signal} = {}) {
      alive(); checkSignal(signal); const {provider, backend} = providerFor(target);
      if (provider === 'extension') {
        const verified = await readOperation(() => verifyExtension(target, {signal}), signal);
        checkSignal(signal);
        if (!verified.valid) fail('TARGET_IDENTITY_CHANGED', verified.reason);
      }
      if (typeof backend.focus !== 'function') fail('UNSUPPORTED_OPERATION', 'This browser backend cannot focus a target');
      const result = await backend.focus(unwrap(target, provider), {signal});
      return {...result, target: wrap(result.target ?? target, provider)};
    },
    async verify(target, options) {
      alive(); const {provider, backend} = providerFor(target);
      if (provider === 'extension') return verifyExtension(target, options);
      const result = await backend.verify(unwrap(target, provider), options);
      return result?.target ? {...result, target: wrap(result.target, provider)} : result;
    },
    async preview(target) {
      alive(); const {provider, backend} = providerFor(target);
      if (typeof backend.preview !== 'function') fail('UNSUPPORTED_OPERATION', `Monitor frames are unavailable for ${provider}`);
      return backend.preview(unwrap(target, provider));
    },
    async observe(target, request = {}) {
      alive(); const {provider, backend} = providerFor(target);
      if (provider === 'extension') {
        const verified = await verifyExtension(target);
        if (!verified.valid) fail('TARGET_IDENTITY_CHANGED', verified.reason);
      }
      const result = await backend.observe(unwrap(target, provider), request);
      if (provider !== 'extension') return result;
      if (!result?.identity || !sameIdentity(result.identity, target.identity) || result.documentId !== undefined && result.documentId !== target.identity.documentId) {
        fail('TARGET_IDENTITY_CHANGED', 'Observation belongs to another document');
      }
      const screenshot = result.screenshot;
      return {...result, provider, ...(screenshot ? {screenshot: {...screenshot, base64: screenshot.base64 ?? screenshot.data,
        viewport: screenshot.viewport ?? {width: screenshot.bounds?.width, height: screenshot.bounds?.height}, coordinateSpace: 'screenshot'}} : {})};
    },
    async act(target, request) {
      request = normalizeBrowserAction(request);
      alive(); checkSignal(request.signal);
      const {provider, backend} = providerFor(target);
      if (provider !== 'extension') {
        const result = await backend.act(unwrap(target, provider), request);
        return result?.target ? {...result, target: wrap(result.target, provider)} : result;
      }
      const verified = await readOperation(() => verifyExtension(target, {signal: request.signal}), request.signal);
      checkSignal(request.signal);
      if (!verified.valid) fail('TARGET_IDENTITY_CHANGED', verified.reason);
      held.set(target.id, target);
      if (['activate', 'focus'].includes(request.action)) return {action: request.action, ...await composite.focus(target, {signal: request.signal})};
      const {signal, ...action} = request;
      action.type = aliases[request.action] ?? request.action;
      if (request.action === 'selectOption') action.value = request.values ?? request.value;
      const result = await extension.act(unwrap(target, provider), {...action, signal});
      if (result?.reselectRequired && request.action !== 'newTab' && !navigation.has(request.action)) stale.add(target.id);
      checkSignal(signal);
      if (request.action === 'closeTab') {
        if (result?.closed !== true || result.tabId !== target.identity.tabId) fail('CLOSE_UNACKNOWLEDGED', 'Extension did not acknowledge closing this tab');
        held.delete(target.id); stale.add(target.id);
        return {...result, action: request.action, closedTargetId: target.id};
      }
      if (request.action === 'newTab' || navigation.has(request.action)) {
        const navigated = navigation.has(request.action);
        if (navigated && result?.tabId !== target.identity.tabId) fail('TARGET_IDENTITY_CHANGED', 'Navigation did not acknowledge the same browser tab');
        const next = (await composite.listTargets()).find(item => item.provider === 'extension' && item.supported &&
          item.browserId === target.browserId && item.identity.tabId === result?.tabId && item.identity.documentId === result?.documentId);
        checkSignal(signal);
        if (!next) fail('TARGET_IDENTITY_CHANGED', 'The completed navigation document changed before verification; discover again');
        if (navigated && next.id !== target.id) stale.add(target.id);
        held.set(next.id, next);
        // Back/forward may restore the same document from Chromium's BFCache.
        // Only the acknowledged navigation plus fresh inventory may revive it.
        const restored = stale.delete(next.id);
        let checked;
        try {
          const selected = await composite.select(next);
          checked = await verifyExtension(selected);
          checkSignal(signal);
          if (!checked.valid) fail('TARGET_IDENTITY_CHANGED', checked.reason);
        } catch (error) { if (restored) stale.add(next.id); throw error; }
        if (navigated && next.id !== target.id) held.delete(target.id);
        return {...result, action: request.action, reselectRequired: false, target: checked.target,
          ...(navigated && next.id !== target.id ? {replacedTargetId: target.id} : {})};
      }
      // Never promote the pre-navigation identity or an arbitrary bridge result to result.target.
      if (result?.identity && !sameIdentity(result.identity, target.identity)) stale.add(target.id);
      const {target: ignoredTarget, ...output} = result ?? {};
      return {...output, action: request.action, ...(stale.has(target.id) ? {reselectRequired: true} : {})};
    },
    release,
    async deliveries() {
      alive(); const records = [];
      if (browser?.deliveries) records.push(...(await browser.deliveries()).map(record => ({...record, provider: 'browser'})));
      if (extension?.deliveries) records.push(...(await extension.deliveries()).map(record => {
        const {filename, downloadUrl, ...metadata} = record;
        return {...metadata, name: record.name ?? basename(filename || String(record.id)), provider: 'extension', backend: 'browser',
          browserDownloadState: record.state, deliverable: record.status === 'complete' && !!record.path};
      }));
      return records;
    },
    async close() {
      if (closed) return;
      const released = await release();
      if (!released.released) fail('RELEASE_FAILED', 'Composite browser input release is not acknowledged', released.failures);
      const failures = [];
      for (const [provider, backend] of [['browser', browser], ['extension', extension], ['dsh', dsh]]) {
        if (!backend) continue;
        try { await backend.close(); } catch (error) { failures.push({provider, ...errorJSON(error)}); }
      }
      if (failures.length) fail('CLOSE_FAILED', 'Browser provider close failed', failures);
      closed = true;
    },
    getDiagnostics() { return {inventoryErrors: json(inventoryErrors), pendingExtensionTargets: [...held.keys()], staleTargets: [...stale]}; },
  };
  return composite;
}

// Call inside the existing HTTP handler, before same-origin UI checks. Do not add a second request listener.
export function createExtensionMountHook(extension) {
  if (typeof extension?.handleRequest !== 'function') fail('INVALID_BACKEND', 'Extension handleRequest is required');
  return (req, res) => extension.handleRequest(req, res) === true;
}
