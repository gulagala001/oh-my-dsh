const fail = (message, code = 'NATIVE_BROWSER_UNAVAILABLE') => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (input, keys) => Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
const belongs = (state, tabId) => state && (state.target?.id === tabId || state.viewTarget?.id === tabId
  || state.userTabs.has(tabId) || state.previewTargets.has(tabId));

function current(manager, binding) {
  const browser = manager.extensionBrowsers.get('desktop-browser');
  if (!binding || manager.pluginBrowserBinding !== binding || binding.hub.closed || binding.service.draining
    || binding.service.hostClosing || binding.service.released || browser?.hub !== binding.hub || browser.run.lost || browser.closing) {
    throw fail('The native Desktop browser connection is unavailable');
  }
  browser.checkConnection();
  return browser;
}

function promptForSession(browser, state, prompt) {
  if (!object(prompt)) throw fail('The native permission prompt is invalid', 'INVALID_RESPONSE');
  const tab = browser.tabs.get(String(prompt.tabId));
  return tab && belongs(state, tab.id) ? { ...prompt, tabId: tab.id, providerTabId: prompt.tabId } : null;
}

// Only authenticated UI handlers call this facade. Model dispatch never accepts
// explicitUserCommand or reaches native profile and permission mutations.
export async function nativeBrowserAction(manager, id, input, signal) {
  signal?.throwIfAborted();
  if (manager.closed || !manager.enabled) throw fail('Computer Use is disabled', 'CU_DISABLED');
  if (!object(input)) throw new TypeError('A native browser action is required');
  await manager.pluginBrowserStarting;
  signal?.throwIfAborted();
  const binding = manager.pluginBrowserBinding, browser = current(manager, binding), epoch = browser.info.epoch;
  const state = manager.session(id);
  binding.participants.add(id);
  if (input.action !== 'capabilities' && input.browserEpoch !== epoch) throw fail('The Desktop browser connection changed', 'EXTENSION_CONNECTION_CHANGED');
  const request = async (method, params, lifetime = signal) => {
    lifetime?.throwIfAborted();
    if (current(manager, binding) !== browser) throw fail('The Desktop browser connection changed', 'EXTENSION_CONNECTION_CHANGED');
    const result = await browser.call(method, params, { signal: lifetime, trustedUserAction: true });
    lifetime?.throwIfAborted();
    if (manager.closed || !manager.enabled || current(manager, binding) !== browser) throw fail('The Desktop browser connection changed', 'EXTENSION_CONNECTION_CHANGED');
    return result;
  };
  const options = input.options ?? {};
  if (!object(options)) throw new TypeError('Native browser options must be an object');
  let result;
  switch (input.action) {
    case 'capabilities':
      result = await request('browser.nativeCapabilities', {});
      if (!object(result)) throw fail('Invalid native browser capabilities', 'INVALID_RESPONSE');
      return { ...result, ...(Array.isArray(result.siteInfo) ? { siteInfo: result.siteInfo.map(item => promptForSession(browser, state, item)).filter(Boolean) } : {}),
        browserId: browser.id, browserEpoch: epoch };
    case 'history.search':
      result = await request('history.search', { options: pick(options, ['text', 'startTime', 'endTime', 'maxResults', 'offset', 'visitSource']) });
      break;
    case 'history.remove':
      result = await request('history.remove', { entries: input.entries, explicitUserCommand: true });
      break;
    case 'downloads.getHistory':
      result = await request('downloads.getHistory', {});
      break;
    case 'downloads.searchHistory':
      result = await request('downloads.searchHistory', { options: pick(options, ['text', 'maxResults', 'offset']) });
      break;
    case 'downloads.removeFromHistory':
      result = await request('downloads.removeFromHistory', { guid: input.guid, explicitUserCommand: true });
      break;
    case 'permissions.list': {
      const tab = input.tabId === undefined ? null : browser.records.get(input.tabId);
      if (input.tabId !== undefined && (!tab || !belongs(state, tab.id))) throw fail('The permission target is not in this conversation', 'STALE_TARGET');
      const prompts = await request('permissions.list', tab ? { tabId: tab.nativeTabId } : {});
      if (!Array.isArray(prompts)) throw fail('Invalid native permission prompts', 'INVALID_RESPONSE');
      result = prompts.map(prompt => promptForSession(browser, state, prompt)).filter(Boolean);
      break;
    }
    case 'permissions.respond':
    case 'permissions.openSystemSettings':
    case 'tabs.pageInfo': {
      const viewer = state.viewers.get(input.actor), target = manager.viewerTarget(state, input);
      const valid = () => viewer && !manager.closed && manager.enabled && state.viewers.get(input.actor) === viewer
        && state.controlEpoch === input.controlEpoch && target?.kind === 'tab'
        && manager.viewerTarget(state, input)?.id === target.id && browser.records.has(target.id);
      if (!valid() || manager.browserForTab(target.id, target.browserId) !== browser) throw fail('The visible native browser target changed', 'VIEW_CHANGED');
      const view = manager.viewsFor(target).views.get(target.id);
      if (!view || view.closed) throw fail('The visible native browser target disconnected', 'VIEW_CHANGED');
      const lifetime = AbortSignal.any([view.lifetime.signal, signal].filter(Boolean));
      const tab = browser.records.get(target.id);
      const params = input.action === 'tabs.pageInfo'
        ? { tabId: tab.nativeTabId, siteUrl: input.siteUrl, presentation: input.presentation, explicitUserCommand: true }
        : { tabId: tab.nativeTabId, ...pick(input, ['promptId', 'promptGeneration', 'leaseId']),
          ...(input.action === 'permissions.respond' ? { response: input.response } : {}), explicitUserCommand: true };
      result = await request(input.action, params, lifetime);
      if (!valid()) throw fail('The visible native browser target changed', 'VIEW_CHANGED');
      if (input.action === 'tabs.pageInfo' && object(result)) {
        if (result.tabId !== tab.nativeTabId) throw fail('Native page information returned a different tab', 'STALE_TARGET');
        result = { ...result, tabId: target.id, providerTabId: tab.nativeTabId };
      }
      break;
    }
    default: throw fail('Unknown native browser UI action', 'UNSUPPORTED_OPERATION');
  }
  return { browserId: browser.id, browserEpoch: epoch, result };
}

export function nativeBrowserEvent(manager, binding, event) {
  if (!['download-history-changed', 'permission-prompt', 'permission-prompt-closed', 'page-info-dialog-closed'].includes(event.event)) return;
  let browser;
  try { browser = current(manager, binding); } catch { return; }
  if (event.epoch !== browser.info.epoch) return;
  for (const state of manager.sessions.values()) {
    if (!binding.participants.has(state.id)) continue;
    let params = event.params;
    if (event.event !== 'download-history-changed') {
      try { params = promptForSession(browser, state, event.params); } catch { continue; }
      if (!params) continue;
    }
    for (const viewer of state.viewers.values()) {
      try { viewer.send('browser-native', { event: event.event, browserId: browser.id, browserEpoch: event.epoch, params }); }
      catch { /* A disconnected viewer owns its stream cleanup. */ }
    }
  }
}
