const HOST = 'ai.trisoul.computer_use';
const controls = new Map(); let port, connecting, transportState, profileInstanceId, ready = false, error = '', detail = '', enabled = true;
let reconnectTimer, reconnectAttempts = 0, connectionIntent = 0;
const tabActivity = new Map();
const browserFamilies = {
  chrome: 'Chrome', edge: 'Microsoft Edge', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi',
};
const sessionGroups = new SessionTabGroups(chrome, controls, cause => { error = '会话标签分组暂不可用，网页操作仍可继续。'; detail = cause.message; });
const groupWarning = (control, promise) => promise.then(result => { if (control) control.groupError = null; return result; }, cause => { if (control) control.groupError = cause.message; else { error = '会话标签分组暂不可用，网页操作仍可继续。'; detail = cause.message; } return { grouped: false, error: cause.message }; });
const send = (message, transport = transportState) => {
  if (transport?.closed || transport && transport.port !== port) return;
  try { port?.postMessage(message); } catch {}
};
const failed = (message, code = 'EXTENSION_OPERATION_FAILED') => Object.assign(new Error(message), { code });
const describe = tab => {
  const accessed = Math.max(Number.isFinite(tab.lastAccessed) ? tab.lastAccessed : 0, tabActivity.get(tab.id) ?? 0);
  return {
    id: String(tab.id), providerTabId: String(tab.id), title: tab.title ?? '', url: tab.url ?? '', windowId: tab.windowId,
    ...(profileInstanceId ? { browserId: profileInstanceId } : {}),
    ...(transportState ? { generation: transportState.generation } : {}),
    ...(typeof tab.active === 'boolean' ? { active: tab.active } : {}),
    ...(typeof tab.pinned === 'boolean' ? { pinned: tab.pinned } : {}),
    ...(Number.isSafeInteger(tab.groupId) ? { groupId: tab.groupId } : {}),
    ...(accessed > 0 ? { lastOpened: new Date(accessed).toISOString() } : {}),
    ...(typeof tab.favIconUrl === 'string' ? { faviconUrl: tab.favIconUrl } : {}),
  };
};
async function describeTab(tab) {
  const info = describe(tab);
  if (Number.isSafeInteger(tab.groupId) && tab.groupId >= 0 && chrome.tabGroups?.get) {
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (typeof group.title === 'string' && group.title) info.tabGroup = group.title;
    } catch {}
  }
  return info;
}
async function browserIdentity() {
  const userAgent = navigator.userAgent;
  let family = /Edg\//.test(userAgent) ? 'edge' : /(?:OPR|Opera)\//.test(userAgent) ? 'opera' : /Vivaldi\//.test(userAgent) ? 'vivaldi' : /Brave\//.test(userAgent) ? 'brave' : 'chrome';
  if (family === 'chrome' && navigator.brave?.isBrave) {
    try { if (await navigator.brave.isBrave()) family = 'brave'; } catch {}
  }
  return { family, name: browserFamilies[family], userAgent };
}
function assertTransport(transport) {
  if (!enabled || transport.closed || port !== transport.port) throw failed('Browser connection has ended', 'EXTENSION_DISCONNECTED');
}
function assertExpectedTab(tab, expected, transport) {
  if (!expected) return;
  if (expected.url !== undefined && expected.url !== tab.url || expected.title !== undefined && expected.title !== tab.title ||
      expected.providerTabId !== undefined && expected.providerTabId !== String(tab.id) ||
      expected.browserId !== undefined && expected.browserId !== profileInstanceId ||
      expected.generation !== undefined && expected.generation !== transport.generation) {
    throw failed('The referenced tab has changed', 'STALE_TAB');
  }
}
function invalidateTabs(reason, tabId, extra = {}) {
  if (ready && transportState && !transportState.closed) send({ event: 'tabs-invalidated', params: { generation: transportState.generation, ...(tabId !== undefined ? { tabId } : {}), reason, ...extra } });
}
const zoomSteps = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const clampZoom = value => Math.min(500, Math.max(25, value));
// Normalize native floating-point noise before comparing adjacent zoom steps.
const zoomPercent = factor => Math.round(factor * 100 * 1e6) / 1e6;
const hasTabZoom = () => ['getZoom', 'setZoom', 'getZoomSettings'].every(method => typeof chrome.tabs[method] === 'function');
function assertZoomControl(control, actorId) {
  assertTransport(control.transport);
  if (controls.get(control.tabId) !== control || control.stopped || control.stoppedActors.has(actorId)) throw failed('Control stopped; queued zoom operation cancelled', 'CONTROL_STOPPED');
}
function enqueueZoom(control, params) {
  if (typeof params.actorId !== 'string' || !params.actorId || params.sessionId !== undefined || !['get', 'set', 'step', 'reset'].includes(params.action)) throw failed('Invalid tab zoom operation', 'INVALID_ZOOM_ARGUMENT');
  if (params.action === 'set' && !Number.isFinite(params.zoomPercent) || params.action === 'step' && !Number.isFinite(params.delta)) throw failed('Zoom percentage and step direction must be finite numbers', 'INVALID_ZOOM_ARGUMENT');
  if (!hasTabZoom()) throw failed('Native tab zoom is unavailable in this browser', 'ZOOM_UNAVAILABLE');
  const actorId = params.actorId;
  const pending = (control.zoomQueue ?? Promise.resolve()).then(async () => {
    assertZoomControl(control, actorId);
    let settings = await chrome.tabs.getZoomSettings(control.tabId); assertZoomControl(control, actorId);
    let factor = await chrome.tabs.getZoom(control.tabId); assertZoomControl(control, actorId);
    if (!settings || typeof settings !== 'object' || !Number.isFinite(factor) || factor <= 0) throw failed('The browser returned invalid tab zoom state', 'ZOOM_STATE_UNAVAILABLE');
    if (params.action !== 'get') {
      if (settings.mode !== undefined && settings.mode !== 'automatic') throw failed('This tab does not use automatic browser page zoom', 'ZOOM_UNAVAILABLE');
      let percent = params.action === 'set' ? clampZoom(params.zoomPercent) : 100;
      if (params.action === 'step') {
        const current = clampZoom(zoomPercent(factor));
        percent = params.delta > 0 ? zoomSteps.find(value => value > current) ?? 500 : [...zoomSteps].reverse().find(value => value < current) ?? 25;
      }
      await chrome.tabs.setZoom(control.tabId, percent / 100); assertZoomControl(control, actorId);
      factor = await chrome.tabs.getZoom(control.tabId); assertZoomControl(control, actorId);
      settings = await chrome.tabs.getZoomSettings(control.tabId); assertZoomControl(control, actorId);
      if (!settings || typeof settings !== 'object' || !Number.isFinite(factor) || factor <= 0) throw failed('The browser returned invalid tab zoom state', 'ZOOM_STATE_UNAVAILABLE');
    }
    return { zoomPercent: zoomPercent(factor), zoomFactor: factor, zoomSettings: settings };
  });
  control.zoomQueue = pending.catch(() => {});
  control.zoomJobs ??= new Map();
  const jobs = control.zoomJobs.get(actorId) ?? new Set(); jobs.add(pending); control.zoomJobs.set(actorId, jobs);
  void pending.finally(() => { jobs.delete(pending); if (!jobs.size) control.zoomJobs.delete(actorId); }).catch(() => {});
  return pending;
}
const managementMethods = {
  windows: { get: false, getAll: false, create: true, update: true },
  tabs: { get: false, query: false, update: true, remove: true, move: true, group: true },
  tabGroups: { get: false, query: false, update: true, move: true },
};
const groupColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const windowStates = ['normal', 'minimized', 'maximized', 'fullscreen'];
let managementQueue = Promise.resolve();
const managementAudit = [];
const managementInvalid = () => failed('Invalid browser management arguments', 'INVALID_BROWSER_MANAGEMENT_ARGUMENT');
const managementBlocked = message => failed(message, 'BROWSER_MANAGEMENT_BLOCKED');
const nativeId = value => Number.isSafeInteger(value) && value >= 0;
function managementObject(value, validators) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw managementInvalid();
  for (const [key, item] of Object.entries(value)) if (!Object.hasOwn(validators, key) || !validators[key](item)) throw managementInvalid();
  return value;
}
const bool = value => typeof value === 'boolean';
const integer = Number.isSafeInteger;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.length <= 4096;
const nativeIds = value => nativeId(value) || Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(nativeId) && new Set(value).size === value.length;
const asIds = value => Array.isArray(value) ? value : [value];
function managementBounds(options) {
  if (['left', 'top', 'width', 'height'].some(key => options[key] !== undefined) && options.state !== 'normal') throw managementBlocked('Window bounds require state: normal');
}
function managementCall(params) {
  const { namespace, method, args } = params;
  if (namespace === 'bookmarks') throw failed('Bookmarks management is unavailable without the bookmarks permission', 'BROWSER_MANAGEMENT_UNAVAILABLE');
  if (!Object.hasOwn(managementMethods, namespace) || !Object.hasOwn(managementMethods[namespace], method)) throw managementBlocked('This browser management method is unavailable');
  if (!Array.isArray(args)) throw managementInvalid();
  const count = (min, max = min) => { if (args.length < min || args.length > max) throw managementInvalid(); };
  const id = value => { if (!nativeId(value)) throw managementInvalid(); };
  const ids = value => { if (!nativeIds(value)) throw managementInvalid(); };
  const object = (value, validators) => managementObject(value, validators);
  const layout = { focused: bool, left: integer, top: integer, width: positiveInteger, height: positiveInteger, state: value => windowStates.includes(value) };
  if (namespace === 'windows') {
    if (method === 'get') { count(1, 2); id(args[0]); if (args[1] !== undefined) object(args[1], { populate: bool }); }
    if (method === 'getAll') { count(0, 1); if (args[0] !== undefined) object(args[0], { populate: bool }); }
    if (method === 'create') {
      count(0, 1); const options = object(args[0] === undefined ? {} : args[0], { ...layout, tabId: nativeId, type: value => value === 'normal', incognito: value => value === false }); managementBounds(options);
    }
    if (method === 'update') { count(2); id(args[0]); managementBounds(object(args[1], layout)); if (!Object.keys(args[1]).length) throw managementInvalid(); }
  }
  if (namespace === 'tabs') {
    if (method === 'get') { count(1); id(args[0]); }
    if (method === 'query') {
      count(1); object(args[0], { active: bool, audible: bool, autoDiscardable: bool, currentWindow: bool, discarded: bool, groupId: value => integer(value) && value >= -1, highlighted: bool, index: nativeId, lastFocusedWindow: bool, muted: bool, pinned: bool, status: value => ['loading', 'complete'].includes(value), title: text, url: value => text(value) || Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(text), windowId: nativeId, windowType: value => value === 'normal' });
    }
    if (method === 'update') { count(2); id(args[0]); object(args[1], { pinned: bool }); if (args[1].pinned === undefined) throw managementInvalid(); }
    if (method === 'remove') { count(1); ids(args[0]); }
    if (method === 'move') { count(2); ids(args[0]); object(args[1], { index: value => integer(value) && value >= -1, windowId: nativeId }); if (args[1].index === undefined) throw managementInvalid(); }
    if (method === 'group') {
      count(1); const options = object(args[0], { tabIds: nativeIds, groupId: nativeId, createProperties: value => { object(value, { windowId: nativeId }); return true; } });
      if (options.tabIds === undefined || options.groupId !== undefined && options.createProperties !== undefined) throw managementInvalid();
    }
  }
  if (namespace === 'tabGroups') {
    if (method === 'get') { count(1); id(args[0]); }
    if (method === 'query') { count(1); object(args[0], { windowId: nativeId, title: text, color: value => groupColors.includes(value), collapsed: bool }); }
    if (method === 'update') { count(2); id(args[0]); object(args[1], { title: text, color: value => groupColors.includes(value), collapsed: bool }); if (!Object.keys(args[1]).length) throw managementInvalid(); }
    if (method === 'move') { count(2); id(args[0]); object(args[1], { index: value => integer(value) && value >= -1, windowId: nativeId }); if (args[1].index === undefined) throw managementInvalid(); }
  }
  return { namespace, method, args, mutating: managementMethods[namespace][method] };
}
async function managementGroup(id) {
  if (!chrome.tabGroups?.get) throw failed('Tab group management is unavailable', 'BROWSER_MANAGEMENT_UNAVAILABLE');
  const group = await chrome.tabGroups.get(id);
  if (group.shared === true) throw managementBlocked('Shared tab groups cannot be changed');
  return group;
}
async function managementWindow(id) {
  const window = await chrome.windows.get(id);
  if (window.type !== 'normal' || window.incognito === true) throw managementBlocked('Only normal, non-incognito windows can be changed');
  return window;
}
async function managementSharedWindows(ids) {
  if (!chrome.tabGroups?.query) throw failed('Shared tab group state is unavailable', 'BROWSER_MANAGEMENT_UNAVAILABLE');
  for (const windowId of new Set(ids)) {
    await managementWindow(windowId);
    const groups = await chrome.tabGroups.query({ windowId });
    if (groups.some(group => group.shared === true)) throw managementBlocked('Tab moves are unavailable in windows containing a shared group');
  }
}
async function managementTargets({ namespace, method, args }) {
  if (namespace === 'windows') {
    if (method === 'update') await managementWindow(args[0]);
    if (method === 'create' && args[0]?.tabId !== undefined) {
      const tab = await chrome.tabs.get(args[0].tabId);
      if (tab.pinned) throw managementBlocked('A pinned tab cannot be moved into a new window');
      await managementSharedWindows([tab.windowId]);
    }
    return;
  }
  if (namespace === 'tabs') {
    const options = method === 'group' ? args[0] : args[1];
    const tabs = await Promise.all(asIds(method === 'group' ? options.tabIds : args[0]).map(tabId => chrome.tabs.get(tabId)));
    for (const tab of tabs) if (tab.groupId >= 0) await managementGroup(tab.groupId);
    if (method === 'group') {
      const windowId = tabs[0].windowId;
      if (tabs.some(tab => tab.windowId !== windowId)) throw managementBlocked('Tabs must be in the same window before grouping');
      if (options.createProperties?.windowId !== undefined && options.createProperties.windowId !== windowId) throw managementBlocked('The group window must match the selected tabs');
      if (options.groupId !== undefined && (await managementGroup(options.groupId)).windowId !== windowId) throw managementBlocked('The existing group is in a different window');
    }
    if (method === 'move') await managementSharedWindows([...tabs.map(tab => tab.windowId), ...(options.windowId !== undefined ? [options.windowId] : [])]);
    return;
  }
  const group = await managementGroup(args[0]);
  if (method === 'move') await managementSharedWindows([group.windowId, ...(args[1].windowId !== undefined ? [args[1].windowId] : [])]);
}
async function managementBefore({ namespace, method, args }) {
  const before = {};
  if (namespace === 'windows' || namespace === 'tabs' && ['remove', 'move'].includes(method) || namespace === 'tabGroups' && method === 'move') {
    const windows = await chrome.windows.getAll({ populate: false });
    before.windows = windows.map(window => ({ id: window.id, focused: window.focused, ...Object.fromEntries(['height', 'left', 'state', 'top', 'width'].filter(key => window[key] !== undefined).map(key => [key, window[key]])) }));
    if (namespace === 'windows' && (method !== 'create' || args[0]?.tabId === undefined)) return before;
  }
  const [tabs, groups] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups?.query ? chrome.tabGroups.query({}) : []]);
  before.tabLayout = {
    groups: groups.map(group => ({ id: group.id, windowId: group.windowId, collapsed: group.collapsed, color: group.color, ...(group.title !== undefined ? { title: group.title } : {}) })),
    tabs: tabs.map(tab => ({ id: tab.id, windowId: tab.windowId, index: tab.index, pinned: tab.pinned, groupId: tab.groupId, autoDiscardable: tab.autoDiscardable, ...(tab.url !== undefined ? { url: tab.url } : {}) })),
  };
  return before;
}
async function executeManagement(call, transport) {
  assertTransport(transport);
  const api = chrome[call.namespace];
  if (typeof api?.[call.method] !== 'function') throw failed('This browser management API is unavailable', 'BROWSER_MANAGEMENT_UNAVAILABLE');
  let before;
  if (call.mutating) {
    await managementTargets(call); before = await managementBefore(call); assertTransport(transport);
    if (call.namespace === 'tabs' && call.method === 'remove') {
      for (const tabId of asIds(call.args[0])) { const control = controls.get(tabId); if (control) await stop(control, 'tab-closed'); }
      assertTransport(transport);
    }
  }
  const args = call.namespace === 'windows' && call.method === 'create' ? [{ ...call.args[0], type: 'normal', incognito: false }] : call.args;
  const result = await api[call.method](...args);
  if (call.mutating) {
    const entry = { namespace: call.namespace, method: call.method, args: structuredClone(call.args), before, createdAt: Date.now(), ...(typeof result === 'number' ? { result } : {}) };
    managementAudit.unshift(entry); if (managementAudit.length > 256) managementAudit.length = 256;
  }
  return { value: result ?? null };
}
function enqueueManagement(params, transport) {
  const call = managementCall(params);
  const result = managementQueue.then(() => executeManagement(call, transport));
  managementQueue = result.catch(() => {});
  return result;
}

const profilePermissions = ['history', 'downloads', 'downloads.open', 'contentSettings', 'browsingData'];
const profileRequests = new Map();
const downloadUpdatedAt = new Map();
const profileEventBindings = new Map();
const profileHistoryLimit = 5000;
const profileDataTypes = ['cache', 'cacheStorage', 'cookies', 'downloads', 'fileSystems', 'formData', 'history', 'indexedDB', 'localStorage', 'serviceWorkers'];
const siteSettingValues = {
  automaticDownloads: ['allow', 'block', 'ask'], camera: ['allow', 'block', 'ask'],
  clipboard: ['allow', 'block', 'ask'], cookies: ['allow', 'block', 'session_only'],
  images: ['allow', 'block'], javascript: ['allow', 'block'], location: ['allow', 'block', 'ask'],
  microphone: ['allow', 'block', 'ask'], notifications: ['allow', 'block', 'ask'],
  popups: ['allow', 'block'], sound: ['allow', 'block'],
};
let profileQueue = Promise.resolve(), profileEventQueue = Promise.resolve();
const profileInvalid = message => failed(message, 'INVALID_BROWSER_PROFILE_ARGUMENT');
const profileUnavailable = message => failed(message, 'BROWSER_PROFILE_UNAVAILABLE');
const profileIdentity = transport => ({ extensionInstanceId: profileInstanceId, generation: transport.generation });
function assertProfile(params, transport) {
  assertTransport(transport);
  if (!params.profile || params.profile.extensionInstanceId !== profileInstanceId || params.profile.generation !== transport.generation) throw failed('The selected browser profile connection changed', 'STALE_BROWSER_PROFILE');
  if (chrome.extension?.inIncognitoContext === true) throw profileUnavailable('Profile actions are unavailable in an incognito extension context');
}
function explicitProfileCommand(params) {
  if (params.explicitUserCommand !== true) throw failed('This profile mutation requires an explicit user command', 'BROWSER_PROFILE_USER_COMMAND_REQUIRED');
}
function optionalPermissionList(value, includeDependencies = false) {
  if (!Array.isArray(value) || !value.length || value.some(permission => !profilePermissions.includes(permission)) || new Set(value).size !== value.length) throw profileInvalid('Permissions must be an explicit nonempty subset of the profile optional permissions');
  return includeDependencies && value.includes('downloads.open') && !value.includes('downloads') ? [...value, 'downloads'] : [...value];
}
async function requireProfilePermission(permission, params, transport) {
  assertProfile(params, transport);
  const granted = await chrome.permissions.contains({ permissions: [permission] }); assertProfile(params, transport);
  if (!granted) throw Object.assign(failed('Browser profile permission has not been granted: ' + permission, 'BROWSER_PROFILE_PERMISSION_REQUIRED'), { permission });
}
function profileNumber(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum) throw profileInvalid(label + ' must be a non-negative integer <= ' + maximum);
  return result;
}
function profileTime(value, fallback, label) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result < 0 || result > 8640000000000000) throw profileInvalid(label + ' must be milliseconds since the epoch');
  return result;
}
function profileText(value = '') {
  if (typeof value !== 'string' || value.length > 4096) throw profileInvalid('History text must be a string of at most 4096 characters');
  return value;
}
function profileChange(kind, extra = {}) {
  if (ready && transportState && !transportState.closed) send({ event: 'profile-changed', params: { profile: profileIdentity(transportState), kind, ...extra } });
}
async function profileStatus(params, transport) {
  assertProfile(params, transport);
  const permissions = Object.fromEntries(await Promise.all(profilePermissions.map(async permission => [permission, await chrome.permissions.contains({ permissions: [permission] })])));
  const identity = await browserIdentity();
  assertProfile(params, transport);
  return {
    profile: profileIdentity(transport), source: 'chrome-extension-profile', permissions,
    history: { available: permissions.history && typeof chrome.history?.search === 'function', visitSource: ['all'], matchingAlgorithm: 'chrome', visitDetails: true, deduplicateByDay: true, selectedEntryRemoval: false, allVisitsForUrlRemoval: true, dateRangeRemoval: true, faviconData: false },
    downloads: {
      available: permissions.downloads && typeof chrome.downloads?.search === 'function',
      persistentHistory: permissions.downloads && typeof chrome.downloads?.search === 'function',
      historySearch: permissions.downloads && typeof chrome.downloads?.search === 'function',
      actions: permissions.downloads && typeof chrome.downloads?.search === 'function' ? [
        'acknowledge', ...Object.entries({ pause: 'pause', resume: 'resume', cancel: 'cancel', removeFromHistory: 'erase', clearHistory: 'erase',
          showDownloadsFolder: 'showDefaultFolder', showInFolder: 'show', open: 'open' })
          .filter(([action, method]) => typeof chrome.downloads?.[method] === 'function' && (action !== 'open' || permissions['downloads.open']))
          .map(([action]) => action),
      ] : [],
      persistentIds: true, idSource: 'chrome-download-id', fileExistsSource: 'chrome-cached',
      openRequiresUserGesture: true, nativeGuid: false, chooseDirectory: false,
    },
    siteSettings: { available: permissions.contentSettings && !!chrome.contentSettings, types: Object.keys(siteSettingValues).filter(type => typeof chrome.contentSettings?.[type]?.get === 'function'), nativePageInfoDialog: false, nativeSettingsPage: identity.family === 'chrome', perSiteReset: false },
    browsingData: { available: permissions.browsingData && typeof chrome.browsingData?.remove === 'function', dataTypes: [...profileDataTypes], boundedEndTime: false, summaryBytes: false },
  };
}
async function createProfileRequest(value, params, transport) {
  assertProfile(params, transport); explicitProfileCommand(params);
  for (const [id, request] of profileRequests) if (request.expiresAt < Date.now() || request.transport.closed) profileRequests.delete(id);
  if (profileRequests.size >= 20) throw profileUnavailable('Too many browser profile actions are awaiting a user');
  const requestId = crypto.randomUUID(), request = { ...value, requestId, profile: profileIdentity(transport), transport, expiresAt: Date.now() + 600000, state: 'pending' };
  profileRequests.set(requestId, request);
  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true }); request.tabId = tab.id; assertProfile(params, transport);
    const url = chrome.runtime.getURL('profile-permissions.html') + '?request=' + encodeURIComponent(requestId);
    await chrome.tabs.update(tab.id, { url }); assertProfile(params, transport);
    return { status: 'pending_user_gesture', requestId, expiresAt: request.expiresAt, authorizationTabId: String(tab.id), authorizationUrl: url, profile: request.profile };
  } catch (cause) { profileRequests.delete(requestId); if (request.tabId !== undefined) await chrome.tabs.remove(request.tabId).catch(() => {}); throw cause; }
}
function ownedProfileRequest(id, transport) {
  const request = profileRequests.get(id);
  if (!request || request.transport !== transport || request.expiresAt < Date.now()) throw failed('The browser profile action expired or belongs to an earlier connection', 'STALE_BROWSER_PROFILE_REQUEST');
  return request;
}
function downloadId(value) {
  const prefix = 'download/' + profileInstanceId + '/';
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw failed('The download belongs to another browser profile', 'STALE_BROWSER_PROFILE');
  const native = value.slice(prefix.length);
  if (!/^\d+$/.test(native) || !Number.isSafeInteger(Number(native))) throw profileInvalid('Invalid native download ID');
  return Number(native);
}
const describeDownloadId = value => 'download/' + profileInstanceId + '/' + value;
function describeDownload(item) {
  const startedAtMs = Date.parse(item.startTime), endedAtMs = Date.parse(item.endTime);
  if (!Number.isSafeInteger(item.id) || !Number.isFinite(startedAtMs) || typeof item.filename !== 'string'
    || !['in_progress', 'complete', 'interrupted'].includes(item.state)) throw profileUnavailable('The native browser returned an invalid download');
  const active = item.state === 'in_progress';
  const status = item.state === 'complete' ? 'complete' : item.state === 'interrupted' ? item.error === 'USER_CANCELED' ? 'canceled' : 'failed' : item.paused ? 'paused' : 'in_progress';
  return {
    id: describeDownloadId(item.id), nativeId: item.id, filename: item.filename.split(/[\\/]/).at(-1), path: item.filename,
    url: item.url, finalUrl: item.finalUrl, receivedBytes: item.bytesReceived, totalBytes: item.totalBytes,
    startedAtMs, updatedAtMs: Number.isFinite(endedAtMs) ? endedAtMs : downloadUpdatedAt.get(item.id) ?? startedAtMs,
    status, canCancel: active, canPause: active && !item.paused, canResume: item.canResume === true,
    fileExists: item.exists, fileExistsIsCached: true, danger: item.danger, ...(item.error ? { error: item.error } : {}),
  };
}
async function nativeDownload(id, params, transport) {
  await requireProfilePermission('downloads', params, transport);
  const nativeId = downloadId(id), items = await chrome.downloads.search({ id: nativeId }); assertProfile(params, transport);
  return items.find(item => item.id === nativeId && item.incognito !== true) ?? null;
}
async function downloadAttention() {
  const data = await chrome.storage.local.get('profileDownloadAttention');
  return Array.isArray(data.profileDownloadAttention) ? data.profileDownloadAttention.filter(Number.isSafeInteger).slice(-1000) : [];
}
async function acknowledgeDownloads(value, params, transport) {
  const ids = value.all === true ? null : Array.isArray(value.ids) && value.ids.length <= 1000 ? value.ids.map(downloadId) : undefined;
  if (ids === undefined || value.all !== undefined && value.all !== true) throw profileInvalid('Acknowledge requires all: true or explicit download ids');
  const previous = await downloadAttention(); assertProfile(params, transport);
  await chrome.storage.local.set({ profileDownloadAttention: ids === null ? [] : previous.filter(id => !ids.includes(id)) }); assertProfile(params, transport);
  profileChange('downloads'); return { ok: true };
}
async function profileDownloadSearch(options, params, transport, snapshot = false) {
  await requireProfilePermission('downloads', params, transport);
  if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some(key => !['text', 'maxResults', 'offset', 'startTime', 'endTime'].includes(key))) throw profileInvalid('Invalid native download search options');
  const limit = profileNumber(options.maxResults, snapshot ? 1000 : 100, 'maxResults', 5000), offset = profileNumber(options.offset, 0, 'offset', 50000);
  const query = { orderBy: ['-startTime'], limit: limit === 0 ? 0 : offset + limit + 1 };
  if (options.text !== undefined && profileText(options.text)) query.query = [options.text];
  if (options.startTime !== undefined) query.startedAfter = new Date(profileTime(options.startTime, 0, 'startTime')).toISOString();
  if (options.endTime !== undefined) query.startedBefore = new Date(profileTime(options.endTime, 0, 'endTime')).toISOString();
  const items = (await chrome.downloads.search(query)).filter(item => item.incognito !== true); assertProfile(params, transport);
  const attention = new Set(await downloadAttention()); assertProfile(params, transport);
  let selected = items.slice(offset, limit === 0 ? undefined : offset + limit);
  if (snapshot) {
    const active = (await chrome.downloads.search({ state: 'in_progress', limit: 0 })).filter(item => item.incognito !== true); assertProfile(params, transport);
    const unique = new Map([...selected, ...active].map(item => [item.id, item]));
    selected = [...unique.values()].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
  }
  return { capturedAtMs: Date.now(), downloads: selected.map(describeDownload), unacknowledgedIds: selected.filter(item => attention.has(item.id)).map(item => describeDownloadId(item.id)), hasMore: limit !== 0 && items.length > offset + limit, profile: profileIdentity(transport), source: 'chrome-downloads' };
}
async function profileHistorySearch(options, params, transport) {
  await requireProfilePermission('history', params, transport);
  if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some(key => !['text', 'maxResults', 'offset', 'startTime', 'endTime', 'visitSource', 'deduplicateByDay', 'matchingAlgorithm'].includes(key))) throw profileInvalid('Invalid profile history search options');
  if (options.visitSource !== undefined && options.visitSource !== 'all') throw profileUnavailable('Chrome does not expose native agent visit classification');
  if (options.matchingAlgorithm !== undefined && options.matchingAlgorithm !== 'chrome') throw profileUnavailable('Chrome extension history does not expose Codex alwaysPrefix matching');
  if (options.deduplicateByDay !== undefined && typeof options.deduplicateByDay !== 'boolean') throw profileInvalid('deduplicateByDay must be a boolean');
  const maxResults = profileNumber(options.maxResults, 100, 'maxResults', 5000), offset = profileNumber(options.offset, 0, 'offset', 50000);
  const startTime = profileTime(options.startTime, 0, 'startTime'), endTime = profileTime(options.endTime, Date.now(), 'endTime');
  if (endTime < startTime) throw profileInvalid('endTime must be at least startTime');
  const candidates = await chrome.history.search({ text: profileText(options.text), startTime, endTime, maxResults: profileHistoryLimit }); assertProfile(params, transport);
  const entries = [];
  // Query real native visits in small batches; no session ledger or actor inference.
  for (let index = 0; index < candidates.length; index += 20) {
    const batch = await Promise.all(candidates.slice(index, index + 20).filter(item => typeof item.url === 'string').map(async item => {
      const visits = await chrome.history.getVisits({ url: item.url }); assertProfile(params, transport);
      const groups = new Map();
      for (const visit of visits) {
        if (!Number.isFinite(visit.visitTime) || visit.visitTime < startTime || visit.visitTime > endTime) continue;
        const date = new Date(visit.visitTime), key = options.deduplicateByDay === false ? visit.visitId : [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
        const previous = groups.get(key); if (previous && previous.visitTime >= visit.visitTime) continue;
        groups.set(key, { id: item.id + '/' + visit.visitId, nativeHistoryId: item.id, nativeVisitId: visit.visitId, url: item.url, title: item.title ?? '', visitTime: visit.visitTime, lastVisitTime: visit.visitTime, transition: visit.transition, isLocal: visit.isLocal });
      }
      return [...groups.values()];
    }));
    entries.push(...batch.flat());
  }
  entries.sort((a, b) => b.visitTime - a.visitTime || a.id.localeCompare(b.id));
  return { entries: entries.slice(offset, maxResults === 0 ? undefined : offset + maxResults), capturedAtMs: Date.now(), complete: candidates.length < profileHistoryLimit, hasMore: maxResults !== 0 && entries.length > offset + maxResults, profile: profileIdentity(transport), semantics: { source: 'chrome-history', matchingAlgorithm: 'chrome', visitSource: 'all', deduplicateByDay: options.deduplicateByDay !== false, selectedEntryRemoval: false } };
}
async function profileTab(params, transport) {
  assertProfile(params, transport);
  const control = controls.get(params.tabId);
  if (!control || control.transport !== transport || control.leaseId !== params.leaseId || typeof params.actorId !== 'string' || !params.actorId) throw failed('The selected tab has no active profile binding', 'STALE_TAB');
  assertZoomControl(control, params.actorId);
  const tab = await chrome.tabs.get(control.tabId); assertZoomControl(control, params.actorId); assertExpectedTab(tab, params.expected, transport);
  if (tab.incognito === true) throw profileUnavailable('Site settings are unavailable for incognito tabs');
  let url;
  try { url = new URL(tab.url); } catch { throw profileUnavailable('The selected tab has no usable site URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw profileUnavailable('Site settings require the selected HTTP(S) page');
  if (!params.expected || params.expected.url !== tab.url) throw failed('Site settings require the exact current tab URL', 'STALE_TAB');
  return { control, tab, url };
}
async function profileSiteSettings(params, transport, set = false) {
  await requireProfilePermission('contentSettings', params, transport);
  const { tab, url } = await profileTab(params, transport);
  const types = params.types === undefined ? Object.keys(siteSettingValues) : params.types;
  if (!Array.isArray(types) || !types.length || types.some(type => !Object.hasOwn(siteSettingValues, type)) || new Set(types).size !== types.length) throw profileInvalid('Invalid site content setting types');
  if (set) {
    explicitProfileCommand(params);
    const { type, setting } = params;
    if (!Object.hasOwn(siteSettingValues, type) || !siteSettingValues[type].includes(setting) || typeof chrome.contentSettings?.[type]?.set !== 'function') throw profileInvalid('Unsupported native site content setting');
    await profileTab(params, transport);
    const pattern = url.protocol + '//' + url.hostname + ':' + (url.port || (url.protocol === 'https:' ? '443' : '80')) + '/*';
    await chrome.contentSettings[type].set({ primaryPattern: pattern, ...(type === 'cookies' ? { secondaryPattern: pattern } : {}), setting, scope: 'regular' });
    await profileTab(params, transport); profileChange('site-settings', { tabId: tab.id, origin: url.origin });
  }
  const settings = await Promise.all(types.map(async type => {
    if (typeof chrome.contentSettings?.[type]?.get !== 'function') return { type, available: false };
    const result = await chrome.contentSettings[type].get({ primaryUrl: tab.url, ...(type === 'cookies' ? { secondaryUrl: tab.url } : {}), incognito: false });
    return { type, available: true, setting: result.setting, values: siteSettingValues[type] };
  }));
  await profileTab(params, transport);
  return { tab: describe(tab), origin: url.origin, settings, source: 'chrome-content-settings', cookieScope: 'first-party-site', nativePageInfoDialog: false, perSiteReset: false };
}
async function profileClearData(params, transport) {
  await requireProfilePermission('browsingData', params, transport); explicitProfileCommand(params);
  const { dataTypes, since } = params;
  if (!Array.isArray(dataTypes) || !dataTypes.length || dataTypes.some(type => !profileDataTypes.includes(type)) || new Set(dataTypes).size !== dataTypes.length) throw profileInvalid('Unsupported browsing data types');
  if (params.endTime !== undefined || params.origins !== undefined || params.originTypes !== undefined) throw profileUnavailable('This clear operation supports a start time and normal web data only');
  const time = profileTime(since, undefined, 'since');
  const settings = await chrome.browsingData.settings(); assertProfile(params, transport);
  if (dataTypes.some(type => settings.dataRemovalPermitted?.[type] !== true)) throw failed('Browser policy does not permit removing the requested data', 'BROWSER_DATA_REMOVAL_BLOCKED');
  await chrome.browsingData.remove({ since: time, originTypes: { unprotectedWeb: true, protectedWeb: false, extension: false } }, Object.fromEntries(dataTypes.map(type => [type, true]))); assertProfile(params, transport);
  profileChange('browsing-data'); return { ok: true, since: time, dataTypes, source: 'chrome-browsing-data' };
}
async function profileDispatch(method, params, transport) {
  assertProfile(params, transport);
  if (method === 'profile.status') return profileStatus(params, transport);
  if (method === 'profile.requestAccess') {
    explicitProfileCommand(params);
    const permissions = optionalPermissionList(params.permissions, true), missing = [];
    for (const permission of permissions) if (!await chrome.permissions.contains({ permissions: [permission] })) missing.push(permission);
    assertProfile(params, transport);
    return missing.length ? createProfileRequest({ kind: 'permissions', permissions: missing }, params, transport) : { status: 'granted', permissions, profile: profileIdentity(transport) };
  }
  if (method === 'profile.getRequest') {
    const request = ownedProfileRequest(params.requestId, transport);
    return { requestId: request.requestId, kind: request.kind, status: request.state, ...(request.result ? { result: request.result } : {}), expiresAt: request.expiresAt };
  }
  if (method === 'profile.cancelRequest') {
    const request = ownedProfileRequest(params.requestId, transport);
    if (request.state !== 'pending') return { cancelled: false, status: request.state };
    request.state = 'canceled'; request.result = { ok: false, reason: 'user-canceled' };
    const tab = await chrome.tabs.get(request.tabId).catch(cause => { if (!/No tab with id/.test(cause.message)) throw cause; return null; }); assertProfile(params, transport);
    const expectedUrl = chrome.runtime.getURL('profile-permissions.html') + '?request=' + encodeURIComponent(request.requestId);
    const closed = tab?.url === expectedUrl;
    if (closed) await chrome.tabs.remove(tab.id);
    profileChange('request', { requestId: request.requestId, status: request.state });
    return { cancelled: true, closed, status: request.state };
  }
  if (method === 'profile.revokeAccess') {
    explicitProfileCommand(params);
    const permissions = optionalPermissionList(params.permissions); const removed = await chrome.permissions.remove({ permissions }); assertProfile(params, transport);
    await refreshProfileEvents(); return { removed, ...(await profileStatus(params, transport)) };
  }
  if (method === 'profile.history.search') return profileHistorySearch(params.options ?? {}, params, transport);
  if (method === 'profile.history.searchUrls') {
    await requireProfilePermission('history', params, transport);
    const options = params.options ?? {};
    if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some(key => !['text', 'maxResults', 'startTime', 'endTime'].includes(key))) throw profileInvalid('Invalid URL history search options');
    const query = { text: profileText(options.text), maxResults: profileNumber(options.maxResults, 100, 'maxResults', 5000), startTime: profileTime(options.startTime, 0, 'startTime') };
    if (!query.maxResults) throw profileInvalid('URL history search requires positive maxResults');
    if (options.endTime !== undefined) query.endTime = profileTime(options.endTime, 0, 'endTime');
    if (query.endTime !== undefined && query.endTime < query.startTime) throw profileInvalid('endTime must be at least startTime');
    const entries = await chrome.history.search(query); assertProfile(params, transport); return { entries, source: 'chrome-history', profile: profileIdentity(transport) };
  }
  if (method === 'profile.history.removeEntries') throw profileUnavailable('Chrome cannot remove the selected URL visits by local day; deleteUrl and deleteRange have different scopes');
  if (method === 'profile.history.deleteUrl' || method === 'profile.history.deleteRange') {
    await requireProfilePermission('history', params, transport); explicitProfileCommand(params);
    if (method.endsWith('deleteUrl')) {
      if (params.allVisitsForUrl !== true || typeof params.url !== 'string') throw profileInvalid('URL deletion requires explicit allVisitsForUrl: true');
      const visits = await chrome.history.getVisits({ url: params.url }); assertProfile(params, transport);
      if (!visits.length) throw profileUnavailable('The URL is no longer present in native history');
      await chrome.history.deleteUrl({ url: params.url });
    } else {
      if (params.allUrlsInRange !== true) throw profileInvalid('Range deletion requires explicit allUrlsInRange: true');
      const startTime = profileTime(params.startTime, undefined, 'startTime'), endTime = profileTime(params.endTime, undefined, 'endTime');
      if (endTime < startTime) throw profileInvalid('endTime must be at least startTime');
      await chrome.history.deleteRange({ startTime, endTime });
    }
    assertProfile(params, transport); profileChange('history'); return { ok: true };
  }
  if (method === 'profile.downloads.getSnapshot' || method === 'profile.downloads.searchHistory') return profileDownloadSearch(params.options ?? {}, params, transport, method.endsWith('getSnapshot'));
  if (method === 'profile.downloads.acknowledge') {
    await requireProfilePermission('downloads', params, transport); return acknowledgeDownloads(params, params, transport);
  }
  if (method === 'profile.downloads.showDownloadsFolder') {
    await requireProfilePermission('downloads', params, transport); explicitProfileCommand(params); chrome.downloads.showDefaultFolder(); return { ok: true };
  }
  if (method === 'profile.downloads.clearHistory') {
    await requireProfilePermission('downloads', params, transport); explicitProfileCommand(params);
    const native = (await chrome.downloads.search({ limit: 0 })).filter(item => item.incognito !== true && item.state !== 'in_progress'); assertProfile(params, transport);
    const removed = [];
    for (const item of native) { const ids = await chrome.downloads.erase({ id: item.id, state: item.state }); removed.push(...ids); assertProfile(params, transport); }
    for (let index = 0; index < removed.length; index += 1000) await acknowledgeDownloads({ ids: removed.slice(index, index + 1000).map(describeDownloadId) }, params, transport);
    return { ok: true, removedIds: removed.map(describeDownloadId) };
  }
  if (['profile.downloads.pause', 'profile.downloads.resume', 'profile.downloads.cancel', 'profile.downloads.removeFromHistory', 'profile.downloads.showInFolder', 'profile.downloads.open'].includes(method)) {
    explicitProfileCommand(params);
    const item = await nativeDownload(params.id, params, transport);
    if (!item) return { ok: false, reason: 'missing-download' };
    const operation = method.split('.').at(-1);
    if (operation === 'pause' && (item.state !== 'in_progress' || item.paused)) return { ok: false, reason: 'download-not-pausable' };
    if (operation === 'resume' && item.canResume !== true) return { ok: false, reason: 'download-not-resumable' };
    if (operation === 'cancel' && item.state !== 'in_progress') return { ok: false, reason: 'download-not-cancelable' };
    if (operation === 'removeFromHistory') {
      if (item.state === 'in_progress') return { ok: false, reason: 'download-not-removable' };
      const erased = await chrome.downloads.erase({ id: item.id, state: item.state }); assertProfile(params, transport);
      if (!erased.includes(item.id)) return { ok: false, reason: 'missing-download' };
      await acknowledgeDownloads({ ids: [params.id] }, params, transport);
    } else if (operation === 'showInFolder') { chrome.downloads.show(item.id); await acknowledgeDownloads({ ids: [params.id] }, params, transport); }
    else if (operation === 'open') {
      await requireProfilePermission('downloads.open', params, transport);
      if (item.state !== 'complete') return { ok: false, reason: 'download-not-complete' };
      return { ok: false, reason: 'user-gesture-required', authorization: await createProfileRequest({ kind: 'open-download', nativeId: item.id, filename: item.filename.split(/[\\/]/).at(-1), downloadId: params.id }, params, transport) };
    } else { await chrome.downloads[operation](item.id); assertProfile(params, transport); }
    profileChange('downloads'); return { ok: true };
  }
  if (method === 'profile.siteSettings.get' || method === 'profile.siteSettings.set') return profileSiteSettings(params, transport, method.endsWith('.set'));
  if (method === 'profile.siteSettings.open') {
    explicitProfileCommand(params);
    const { url } = await profileTab(params, transport);
    if ((await browserIdentity()).family !== 'chrome') throw profileUnavailable('The native site-settings route has only been established for Chrome');
    await profileTab(params, transport);
    const target = 'chrome://settings/content/siteDetails?' + new URLSearchParams({ site: url.origin }).toString();
    const tab = await chrome.tabs.create({ url: target, active: true }); assertProfile(params, transport);
    return { opened: true, tab: describe(tab), origin: url.origin, source: 'chrome-native-settings', nativePageInfoDialog: false, profile: profileIdentity(transport) };
  }
  if (method === 'profile.siteInfo.open' || method === 'profile.siteSettings.reset') throw profileUnavailable('Chrome extensions do not expose the native site-info popup or a single-site content-rule reset');
  if (method === 'profile.browsingData.settings') {
    await requireProfilePermission('browsingData', params, transport); const result = await chrome.browsingData.settings(); assertProfile(params, transport); return { ...result, source: 'chrome-browsing-data' };
  }
  if (method === 'profile.browsingData.clear') return profileClearData(params, transport);
  if (method === 'profile.browsingData.summary') throw profileUnavailable('Chrome extension APIs do not expose Codex native history/cookie/cache/download summary counts and bytes');
  throw profileUnavailable('Unknown browser profile operation: ' + method);
}
function enqueueProfile(method, params, transport) {
  const reads = ['profile.status', 'profile.getRequest', 'profile.history.search', 'profile.history.searchUrls', 'profile.downloads.getSnapshot', 'profile.downloads.searchHistory', 'profile.siteSettings.get', 'profile.browsingData.settings'];
  if (reads.includes(method)) return profileDispatch(method, params, transport);
  const result = profileQueue.then(() => profileDispatch(method, params, transport)); profileQueue = result.catch(() => {}); return result;
}
async function updateProfileEvents() {
  for (const permission of ['history', 'downloads']) {
    const available = await chrome.permissions.contains({ permissions: [permission] });
    const previous = profileEventBindings.get(permission);
    if (!available && previous) { for (const [event, listener] of previous) event.removeListener(listener); profileEventBindings.delete(permission); }
    if (!available || previous) continue;
    const bindings = [];
    const bind = (event, listener) => { if (event?.addListener) { event.addListener(listener); bindings.push([event, listener]); } };
    if (permission === 'history') {
      bind(chrome.history?.onVisited, () => profileChange('history'));
      bind(chrome.history?.onVisitRemoved, () => profileChange('history'));
    } else {
      bind(chrome.downloads?.onCreated, item => { if (item.incognito !== true) { downloadUpdatedAt.set(item.id, Date.now()); profileChange('downloads'); } });
      bind(chrome.downloads?.onChanged, delta => {
        downloadUpdatedAt.set(delta.id, Date.now()); profileChange('downloads');
        if (!['complete', 'interrupted'].includes(delta.state?.current) || delta.error?.current === 'USER_CANCELED') return;
        const job = profileQueue.then(async () => {
          if (!await chrome.permissions.contains({ permissions: ['downloads'] })) return;
          const items = await chrome.downloads.search({ id: delta.id });
          if (!items.some(item => item.incognito !== true && item.id === delta.id && item.error !== 'USER_CANCELED')) return;
          const attention = await downloadAttention();
          await chrome.storage.local.set({ profileDownloadAttention: [...new Set([...attention, delta.id])].slice(-1000) }); profileChange('downloads');
        }); profileQueue = job.catch(cause => { detail = cause.message; });
      });
      bind(chrome.downloads?.onErased, id => { downloadUpdatedAt.delete(id); profileChange('downloads'); });
    }
    if (bindings.length) profileEventBindings.set(permission, bindings);
  }
}
function refreshProfileEvents() {
  const result = profileEventQueue.then(updateProfileEvents); profileEventQueue = result.catch(() => {}); return result;
}

async function cancelCreation(creation) {
  creation.cancelled = true;
  await creation.ready.catch(() => {});
  if (creation.tab && !creation.removed) {
    try { await chrome.tabs.remove(creation.tab.id); }
    catch (cause) { if (!/No tab with id/.test(cause.message)) throw cause; }
    creation.removed = true;
  }
  return { released: true };
}
async function releaseInput(control, actorId) {
  const errors=[];
  for(const [key,input] of control.held){
    if(actorId!==undefined&&input.actorId!==actorId)continue;
    try{await chrome.debugger.sendCommand({tabId:control.tabId,...(input.sessionId?{sessionId:input.sessionId}:{})},input.method,input.params);control.held.delete(key);}
    catch(cause){errors.push(cause.message);}
  }
  return errors;
}
// The native debugger is shared by independent preview/model actors. Keep
// their device overrides separate so losing one actor restores the remaining
// actor's settings instead of leaking simulation or resetting its preview.
const overrideCommands={
  'Emulation.setDeviceMetricsOverride':['metrics','Emulation.clearDeviceMetricsOverride',{}],
  'Emulation.setTouchEmulationEnabled':['touch','Emulation.setTouchEmulationEnabled',{enabled:false}],
  'Emulation.setUserAgentOverride':['ua','Emulation.setUserAgentOverride',{userAgent:''}],
};
function trackOverride(control,actorId,sessionId,method,params){
  const clear=method==='Emulation.clearDeviceMetricsOverride';
  const kind=clear?'metrics':overrideCommands[method]?.[0];if(!kind)return;
  control.overrides??=new Map();const key=JSON.stringify([sessionId??null,kind]);
  let entry=control.overrides.get(key);
  if(!entry){const reset=overrideCommands[method]??overrideCommands['Emulation.setDeviceMetricsOverride'];entry={sessionId,reset:{method:reset[1],params:reset[2]},actors:new Map()};control.overrides.set(key,entry);}
  entry.actors.delete(actorId);
  if(!clear&&!(method==='Emulation.setUserAgentOverride'&&params.userAgent===''))entry.actors.set(actorId,{method,params:{...params}});
  if(!entry.actors.size)control.overrides.delete(key);
}
async function releaseOverrides(control,actorId){
  const errors=[];
  for(const [key,entry]of control.overrides??[]){
    if(actorId!==undefined&&!entry.actors.has(actorId))continue;
    const active=[...entry.actors.keys()].at(-1);
    const remaining=[...entry.actors].filter(([id])=>actorId!==undefined&&id!==actorId);
    if(actorId===undefined||active===actorId){
      const command=remaining.at(-1)?.[1]??entry.reset;
      try{await chrome.debugger.sendCommand({tabId:control.tabId,...(entry.sessionId?{sessionId:entry.sessionId}:{})},command.method,command.params);}
      catch(cause){errors.push(cause.message);continue;}
    }
    entry.actors=new Map(remaining);if(!entry.actors.size)control.overrides.delete(key);
  }
  return errors;
}
async function stopActor(control, actorId) {
  if(typeof actorId!=='string'||!actorId)throw failed('Invalid protocol actor');
  if(control.actorStops.has(actorId))return control.actorStops.get(actorId);
  control.stoppedActors.add(actorId);
  const grouping = groupWarning(control, sessionGroups.release(control, actorId));
  void control.cursor?.stop(actorId);
  const stopping=(async()=>{
    await Promise.allSettled([...(control.zoomJobs?.get(actorId) ?? [])]);
    const errors=[...await releaseInput(control,actorId),...await releaseOverrides(control,actorId)];
    await grouping;
    if(errors.length){control.actorErrors.set(actorId,errors.join('; '));throw failed('Input release was not confirmed: '+errors.join('; '),'INPUT_RELEASE_FAILED');}
    control.actorErrors.delete(actorId);return{released:true};
  })();
  control.actorStops.set(actorId,stopping);
  try{return await stopping;}finally{if(control.actorStops.get(actorId)===stopping)control.actorStops.delete(actorId);}
}
function lostControl(control, reason, tabClosed = false) {
  if (tabClosed) control.tabClosed = true;
  control.isAttached = false;
  void groupWarning(control, sessionGroups.release(control));
  if (control.stopped) return;
  control.stopped = true;
  void control.cursor?.stop();
  if (controls.get(control.tabId) === control) controls.delete(control.tabId);
  if (control.held.size) error = '浏览器已停止控制，部分按键的释放尚未确认。';
  control.transport.ended.set(control.leaseId, { tabId: control.tabId, released: control.held.size === 0 });
  send({ event: 'stopped', params: {tabId:control.tabId,leaseId:control.leaseId,reason,released:control.held.size === 0,...(control.tabClosed ? {tabClosed:true} : {})} }, control.transport);
}

async function stop(control, reason = 'released') {
  if (control.stopping) return control.stopping;
  control.stopped = true;
  const grouping = groupWarning(control, sessionGroups.release(control));
  void control.cursor?.stop();
  const stopping = (async () => {
    await control.attached.catch(() => {});
    await control.zoomQueue?.catch(() => {});
    const errors = [];
    if (control.isAttached) {
      errors.push(...await releaseInput(control),...await releaseOverrides(control));
      if (!errors.length) {
        try { await chrome.debugger.detach({ tabId: control.tabId }); control.isAttached = false; }
        catch (cause) { if (control.isAttached) errors.push(cause.message); }
      }
    }
    if (!control.isAttached) {
      if (control.held.size) errors.push('Debugger detached before input release was confirmed');
      if (controls.get(control.tabId) === control) controls.delete(control.tabId);
      control.transport.ended.set(control.leaseId, {tabId:control.tabId,released:errors.length===0});
    }
    await grouping;
    control.stopError = errors.length ? errors.join('; ') : null;
    send({ event: 'stopped', params: { tabId: control.tabId, leaseId: control.leaseId, reason, released: errors.length === 0, errors, ...(control.tabClosed ? { tabClosed: true } : {}) } }, control.transport);
    if (errors.length) throw failed('Input release was not confirmed: ' + errors.join('; '), 'INPUT_RELEASE_FAILED');
    return { released: true };
  })();
  control.stopping = stopping;
  try { return await stopping; } finally { if (control.stopping === stopping) control.stopping = null; }
}
async function stopAll(reason) {
  const results = await Promise.allSettled([...controls.values()].map(control => stop(control, reason)));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) { error = '浏览器控制已断开，但部分按键的释放尚未确认。'; detail = failures.map(result => result.reason.message).join('\n'); }
  return failures.length === 0;
}

async function connect() {
  if (port) return;
  if (connecting) { await connecting; if (!port && enabled) return connect(); return; }
  const intent = connectionIntent;
  connecting = (async () => {
    const settings = await chrome.storage.local.get(['instanceId', 'enabled']);
    if (intent !== connectionIntent) return;
    enabled = settings.enabled !== false; if (!enabled) return;
    const instanceId = settings.instanceId ?? crypto.randomUUID(); profileInstanceId = instanceId;
    if (!settings.instanceId) await chrome.storage.local.set({ instanceId });
    const identity = await browserIdentity();
    if (!enabled || intent !== connectionIntent) return;
    error = ''; detail = ''; ready = false;
    const current = chrome.runtime.connectNative(HOST), transport = { port: current, generation: crypto.randomUUID(), closed: false, ended: new Map(), creations: new Map() }; port = current; transportState = transport;
    current.onMessage.addListener(message => {
      if (port !== current) return;
      if (!ready && message?.type === 'ready' && message.protocol === 2) { ready = true; reconnectAttempts = 0; return; }
      if (!ready || !Number.isSafeInteger(message?.id) || typeof message.method !== 'string') { current.disconnect(); return; }
      void dispatch(message.method, message.params ?? {}, transport).then(result => {
        if (port === current) send({ id: message.id, result });
      }, cause => { if (port === current) send({ id: message.id, error: { message: cause.message, code: cause.code } }); });
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      transport.closed = true; if (transportState === transport) transportState = null;
      detail = chrome.runtime.lastError?.message ?? ''; error = enabled ? '与 Oh My DSH 的连接已断开。启动连接服务后可重新连接。' : '';
      ready = false; port = null;
      void (async () => {
        const released = await stopAll('connection-lost');
        const cancelled = await Promise.allSettled([...transport.creations.values()].map(cancelCreation));
        if (cancelled.some(result => result.status === 'rejected')) { error = '取消新标签页失败'; return; }
        // A migrated installation closes its old host. Reconnect only after
        // releasing old input, and never override an explicit Disconnect.
        if (released && enabled && !port && reconnectAttempts < 5) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => { if (enabled && !port) void connect().catch(cause => { error = '重新连接失败，请点击连接重试。'; detail = cause.message; }); }, 250 * 2 ** reconnectAttempts++);
        }
      })();
    });
    const hasTabGroups = ['get', 'query', 'update', 'move'].every(method => typeof chrome.tabGroups?.[method] === 'function') && typeof chrome.tabs.group === 'function';
    current.postMessage({ type: 'hello', protocol: 2, instanceId, extensionInstanceId: instanceId, extensionId: chrome.runtime.id, generation: transport.generation, ...identity, metadata: { extensionId: chrome.runtime.id, extensionInstanceId: instanceId }, capabilities: ['cursor-overlay', ...(chrome.tabGroups?.get && chrome.tabs.group ? ['session-tab-groups'] : []), ...(hasTabGroups ? ['browser-management-tab-groups'] : []), ...(hasTabZoom() ? ['tab-zoom'] : []), 'provider-tab-identity', 'tab-lifecycle', 'tab-focus', 'browser-management', 'browser-profile'], version: chrome.runtime.getManifest().version, build: typeof TRISOUL_BUNDLE_ID === 'string' ? TRISOUL_BUNDLE_ID : null });
  })().finally(() => { connecting = null; });
  return connecting;
}

async function dispatch(method, params, transport) {
  assertTransport(transport);
  if (method.startsWith('profile.')) return enqueueProfile(method, params, transport);
  if (method === 'management.call') return enqueueManagement(params, transport);
  if (method === 'management.getAuditTrail') { await managementQueue; assertTransport(transport); return { changes: structuredClone(managementAudit) }; }
  if (method === 'groups.rename') return groupWarning(null, sessionGroups.rename(params.conversation));
  if (method === 'tabs.list') {
    const tabs = await chrome.tabs.query({}); assertTransport(transport);
    return Promise.all(tabs.filter(tab => !tab.url?.startsWith('chrome-extension://')).map(describeTab));
  }
  if (['tabs.create', 'tabs.cancelCreate', 'tabs.commitCreate'].includes(method)) {
    if (typeof params.creationId !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(params.creationId)) throw failed('Invalid tab creation ID');
    let creation = transport.creations.get(params.creationId);
    if (method === 'tabs.create') {
      if (creation) throw failed('This tab creation was already requested');
      creation = { cancelled: false }; transport.creations.set(params.creationId, creation);
      creation.ready = chrome.tabs.create({ url: 'about:blank', active: false }).then(tab => { creation.tab = tab; return tab; });
      const tab = await creation.ready;
      if (creation.cancelled) { await cancelCreation(creation); throw failed('Tab creation cancelled', 'CONTROL_STOPPED'); }
      return describeTab(tab);
    }
    if (method === 'tabs.cancelCreate') return creation ? cancelCreation(creation) : { released: true };
    if (!creation || creation.cancelled) throw failed('This tab creation has ended', 'CONTROL_STOPPED');
    await creation.ready;
    if (creation.cancelled) throw failed('This tab creation has ended', 'CONTROL_STOPPED');
    transport.creations.delete(params.creationId); return { committed: true };
  }
  if(!Number.isSafeInteger(params.tabId)||params.tabId<0)throw failed('tabId must be a numeric Chrome tab ID');
  if(params.actorId!==undefined&&(typeof params.actorId!=='string'||!params.actorId||params.actorId.length>128))throw failed('Invalid protocol actor');
  if(params.sessionId!==undefined&&(typeof params.sessionId!=='string'||!params.sessionId))throw failed('Invalid child session ID');
  if (method === 'tabs.get' || method === 'tabs.focus') {
    let tab = await chrome.tabs.get(params.tabId); assertTransport(transport);
    assertExpectedTab(tab, params.expected, transport);
    if (method === 'tabs.focus') {
      tab = await chrome.tabs.update(tab.id, { active: true }); assertTransport(transport);
      await chrome.windows.update(tab.windowId, { focused: true }); assertTransport(transport);
    }
    return describeTab(tab);
  }
  if (method === 'attach') {
    const tabId = Number(params.tabId);
    if (!Number.isSafeInteger(tabId) || typeof params.leaseId !== 'string' || !params.leaseId) throw failed('Invalid tab lease');
    if (transport.ended.has(params.leaseId)) throw failed('This lease has already ended; create a fresh binding', 'CONTROL_STOPPED');
    if (controls.has(tabId)) throw failed('This tab already has an active controller', 'TAB_BUSY');
    const control = { tabId, leaseId: params.leaseId, transport, held: new Map(), children: new Map(), stoppedActors:new Set(),actorStops:new Map(),actorErrors:new Map(),stopped: false };
    control.cursor = new CursorOverlay((method, value) => chrome.debugger.sendCommand({ tabId }, method, value), actorId => control.isAttached && !control.stopped && typeof actorId === 'string' && !control.stoppedActors.has(actorId));
    controls.set(tabId, control);
    let tab;
    // Reserve before the first await so stop/disconnect cancels an attachment
    // still waiting on the browser's tab lookup, not just an active debugger.
    control.attached = (async () => {
      tab = await chrome.tabs.get(tabId);
      if (tab.url?.startsWith(chrome.runtime.getURL('profile-permissions.html'))) throw failed('Browser profile authorization pages require a real user gesture', 'BROWSER_PROFILE_USER_GESTURE_REQUIRED');
      assertTransport(transport);
      if (control.stopped) throw failed('Control was stopped while selecting the tab', 'CONTROL_STOPPED');
      if (params.creationId !== undefined) {
        const creation = transport.creations.get(params.creationId);
        if (!creation || creation.cancelled || creation.tab?.id !== tabId) throw failed('The new tab no longer belongs to this creation', 'STALE_TAB');
      }
      assertExpectedTab(tab, params.expected, transport);
      await chrome.debugger.attach({ tabId }, '1.3'); control.isAttached = true;
    })();
    try {
      await control.attached;
      if (control.stopped) throw failed('Control was stopped while attaching', 'CONTROL_STOPPED');
      const { targetInfo } = await chrome.debugger.sendCommand({ tabId }, 'Target.getTargetInfo');
      if (control.stopped) throw failed('Control was stopped while attaching', 'CONTROL_STOPPED');
      control.targetId = targetInfo.targetId;
      const info = await describeTab(tab); assertTransport(transport);
      if (control.stopped) throw failed('Control was stopped while attaching', 'CONTROL_STOPPED');
      return { ...info, targetId: control.targetId, targetInfo, leaseId: control.leaseId };
    } catch (cause) { await stop(control, 'attach-failed').catch(() => {}); throw cause; }
  }
  const control = controls.get(Number(params.tabId));
  const belongs = control?.leaseId === params.leaseId && control.transport === transport;
  if (method === 'detach' || method === 'stop-actor') {
    if (belongs) return method==='detach'?stop(control):stopActor(control,params.actorId);
    const ended = transport.ended.get(params.leaseId);
    if (ended?.tabId === Number(params.tabId)) {
      if (!ended.released) throw failed('Input release was not confirmed for this ended lease', 'INPUT_RELEASE_FAILED');
      return { released: true };
    }
  }
  if (!belongs || control.stopped) throw failed('This tab lease has ended; explicitly select it again', 'CONTROL_STOPPED');
  if (method === 'tabs.zoom') return enqueueZoom(control, params);
  if (method === 'tabs.setSession') {
    if (typeof params.actorId !== 'string' || control.stoppedActors.has(params.actorId)) throw failed('Control stopped', 'CONTROL_STOPPED');
    return groupWarning(control, sessionGroups.claim(control, params.actorId, params.conversation));
  }
  if (method === 'cursor') {
    if (typeof params.actorId !== 'string' || control.stoppedActors.has(params.actorId)) return { queued: false };
    const p = params.pointer;
    if (p === null) { void control.cursor.stop(params.actorId); return { queued: true }; }
    if (!p || typeof p.source !== 'string' || typeof p.loaderId !== 'string' || !Number.isSafeInteger(p.sequence) || ![p.x,p.y,p.at,p.geometry?.width,p.geometry?.height,p.geometry?.pageX,p.geometry?.pageY,p.geometry?.scale,p.geometry?.zoom].every(Number.isFinite) || p.geometry.scale <= 0 || p.geometry.zoom <= 0) throw failed('Invalid cursor observation');
    void control.cursor.update(params.actorId, p).then(() => { control.cursorError = null; }, cause => { control.cursorError = cause.message; });
    return { queued: true };
  }
  if (method === 'close') {
    await stop(control, 'tab-closed');
    await chrome.tabs.remove(control.tabId); return { success: true, tabClosed: true };
  }
  if (method !== 'command') throw failed('Unknown extension operation: ' + method);
  const action = async () => {
    if (control.stopped || control.stoppedActors.has(params.actorId)) throw failed('Control stopped; queued command cancelled', 'CONTROL_STOPPED');
    if (params.sessionId && !control.children.has(params.sessionId)) throw failed('Unknown child target session', 'STALE_TARGET');
    const command = params.method, value = params.params ?? {};
    if (typeof command !== 'string') throw failed('Missing CDP command');
    if (command.startsWith('Target.')) {
      if (!['Target.getTargetInfo', 'Target.setAutoAttach', 'Target.attachToTarget', 'Target.detachFromTarget'].includes(command)) throw failed('Target management must use an explicit tab lease');
      if (command === 'Target.setAutoAttach' && value.flatten !== true) throw failed('Only flat child sessions are supported');
      if (value.targetId && value.targetId !== control.targetId && ![...control.children.values()].includes(value.targetId)) throw failed('Target belongs to another tab', 'STALE_TARGET');
      if (command === 'Target.detachFromTarget' && !control.children.has(value.sessionId)) throw failed('Unknown child target session', 'STALE_TARGET');
    }
    const session = { tabId: control.tabId, ...(params.sessionId ? {sessionId:params.sessionId} : {}) };
    const prefix = JSON.stringify([params.actorId??null,params.sessionId??null]);
    let released;
    if (command === 'Input.dispatchMouseEvent' && value.type === 'mouseMoved' && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      for (const [key, input] of control.held) if (key.startsWith(prefix + ':mouse:')) input.params = {...input.params,x:value.x,y:value.y};
    }
    if (command === 'Input.dispatchMouseEvent' && value.button && value.button !== 'none') {
      const key = prefix + ':mouse:' + value.button;
      if (value.type === 'mousePressed') control.held.set(key, { actorId:params.actorId,sessionId: params.sessionId, method: command, params: { ...value, type: 'mouseReleased', buttons: 0 } });
      if (value.type === 'mouseReleased') released = key;
    }
    if (command === 'Input.dispatchKeyEvent') {
      const key = prefix + ':key:' + (value.code ?? value.windowsVirtualKeyCode ?? value.key);
      if (['keyDown', 'rawKeyDown'].includes(value.type)) control.held.set(key, { actorId:params.actorId,sessionId: params.sessionId, method: command, params: { ...value, type: 'keyUp', text: undefined, unmodifiedText: undefined, modifiers: 0 } });
      if (value.type === 'keyUp') released = key;
    }
    if(command==='Input.dispatchTouchEvent'){
      const key=prefix+':touch';
      if(value.type==='touchStart')control.held.set(key,{actorId:params.actorId,sessionId:params.sessionId,method:command,params:{type:'touchCancel',touchPoints:[]}});
      if(value.type==='touchEnd'||value.type==='touchCancel')released=key;
    }
    let result;
    try { result = await (command === 'Page.captureScreenshot' ? control.cursor.capture(() => chrome.debugger.sendCommand(session, command, value)) : chrome.debugger.sendCommand(session, command, value)); }
    catch (cause) {
      if (/Debugger is not attached to the tab|No tab with id/.test(cause.message)) {
        lostControl(control, 'debugger-disconnected');
        throw failed('Browser control has ended; explicitly select the tab again', 'CONTROL_STOPPED');
      }
      throw cause;
    }
    trackOverride(control,params.actorId,params.sessionId,command,value);
    // A command already handed to Chromium may finish after stop began.
    // Restore its actor's override before acknowledging that late result.
    if(control.stopped||control.stoppedActors.has(params.actorId)){const errors=await releaseOverrides(control,params.actorId);if(errors.length)throw failed(errors.join('; '),'INPUT_RELEASE_FAILED');}
    if (released) control.held.delete(released);
    return result ?? {};
  };
  // CDP is concurrent: a pending Runtime evaluation may need a dialog reply,
  // frame resume, or input release before it can finish. The caller/manager
  // orders UI actions; the transport must not serialize protocol responses.
  return action();
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const control = controls.get(source.tabId); if (!control || control.stopped) return;
  if (!source.sessionId && method === 'Page.frameNavigated' && !params.frame.parentId) { control.cursor.invalidate(); control.cursorError = null; }
  if (!source.sessionId && method === 'Page.javascriptDialogOpening') control.cursor.setDialog(true);
  if (!source.sessionId && method === 'Page.javascriptDialogClosed') control.cursor.setDialog(false);
  if (method === 'Target.attachedToTarget') control.children.set(params.sessionId, params.targetInfo.targetId);
  if (method === 'Target.detachedFromTarget') control.children.delete(params.sessionId);
  send({ event: 'cdp', params: { tabId: source.tabId, leaseId: control.leaseId, ...(source.sessionId ? {sessionId:source.sessionId} : {}), method, params } }, control.transport);
});
chrome.debugger.onDetach.addListener((source, reason) => {
  const control = controls.get(source.tabId); if (!control) return;
  lostControl(control, reason, reason === 'target_closed');
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const control = controls.get(tabId);
  if (change.groupId !== undefined || change.pinned === false) void groupWarning(control, sessionGroups.moved(tabId));
  if (control && !control.stopped && (change.url !== undefined || change.title !== undefined)) send({ event: 'tab-updated', params: { ...describe(tab), tabId, leaseId: control.leaseId } }, control.transport);
  if (['url', 'title', 'favIconUrl', 'groupId', 'pinned', 'status'].some(key => change[key] !== undefined)) invalidateTabs('updated', tabId);
});
chrome.tabs.onCreated.addListener(tab => { void groupWarning(null, sessionGroups.inherit(tab)); invalidateTabs('created', tab.id); });
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => { tabActivity.set(tabId, Date.now()); invalidateTabs('activated', tabId, { windowId }); });
chrome.tabs.onZoomChange?.addListener(({ tabId, newZoomFactor, zoomSettings }) => {
  if (!Number.isFinite(newZoomFactor) || newZoomFactor <= 0) return;
  const info = { zoomPercent: zoomPercent(newZoomFactor), zoomFactor: newZoomFactor, zoomSettings };
  const control = controls.get(tabId);
  if (control && !control.stopped) {
    control.cursor?.invalidate();
    send({ event: 'tab-zoom-changed', params: { tabId, leaseId: control.leaseId, ...info } }, control.transport);
  }
  invalidateTabs('zoom', tabId, info);
});
chrome.tabs.onAttached.addListener((tabId, info) => { void groupWarning(controls.get(tabId), sessionGroups.moved(tabId)); invalidateTabs('attached', tabId, info); });
chrome.tabs.onDetached.addListener((tabId, info) => { invalidateTabs('detached', tabId, info); });
chrome.tabs.onMoved.addListener((tabId, info) => { invalidateTabs('moved', tabId, info); });
chrome.tabs.onRemoved.addListener((tabId, info) => {
  for (const request of profileRequests.values()) if (request.tabId === tabId && request.state === 'pending') { request.state = 'canceled'; request.result = { ok: false, reason: 'user-canceled' }; profileChange('request', { requestId: request.requestId, status: request.state }); }
  const control = controls.get(tabId); if (control) lostControl(control, 'tab-closed', true);
  tabActivity.delete(tabId); void groupWarning(null, sessionGroups.removed(tabId)); invalidateTabs('removed', tabId, { ...info, tabClosed: true });
});
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  const control = controls.get(removedTabId); if (control) lostControl(control, 'tab-replaced');
  tabActivity.delete(removedTabId); void groupWarning(null, sessionGroups.removed(removedTabId));
  invalidateTabs('replaced', removedTabId, { addedTabId });
  void chrome.tabs.get(addedTabId).then(tab => groupWarning(null, sessionGroups.inherit(tab))).catch(() => {});
});
// A worker can restart with updated files before Chrome reloads manifest permissions.
// Grouping errors remain visible through groupWarning; keep the connection alive.
chrome.tabGroups?.onUpdated?.addListener(group => { invalidateTabs('group-updated', undefined, { groupId: group.id, windowId: group.windowId }); });
chrome.tabGroups?.onRemoved?.addListener(group => { void sessionGroups.enqueue(async () => { sessionGroups.removeGroup(group.id); await sessionGroups.save(); }).catch(cause => { detail = cause.message; }); invalidateTabs('group-removed', undefined, { groupId: group.id, windowId: group.windowId }); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && sender.frameId === 0 && sender.url?.startsWith(chrome.runtime.getURL('profile-permissions.html') + '?')) {
    const run = async () => {
      const transport = transportState; if (!transport) throw failed('Browser connection has ended', 'EXTENSION_DISCONNECTED');
      const request = ownedProfileRequest(message.requestId, transport);
      if (sender.tab?.id !== request.tabId || new URL(sender.url).searchParams.get('request') !== request.requestId) throw failed('The browser profile request belongs to another page', 'STALE_BROWSER_PROFILE_REQUEST');
      assertProfile({ profile: request.profile }, transport);
      if (message.action === 'profile-request-info') {
        if (request.state !== 'pending') return { status: request.state, result: request.result };
        return { kind: request.kind, permissions: request.permissions ?? [], nativeId: request.nativeId, filename: request.filename, profile: request.profile, expiresAt: request.expiresAt };
      }
      if (message.action !== 'profile-request-complete' || request.state !== 'pending') throw profileInvalid('Invalid browser profile request state');
      if (request.kind === 'permissions') {
        const granted = await chrome.permissions.contains({ permissions: request.permissions }); assertProfile({ profile: request.profile }, transport);
        if (request.state !== 'pending') return { status: request.state, result: request.result };
        request.state = granted ? 'granted' : 'denied'; request.result = { granted }; await refreshProfileEvents();
      } else {
        request.state = message.ok === true ? 'completed' : 'failed'; request.result = message.ok === true ? { ok: true } : { ok: false, reason: 'open-failed', message: String(message.error ?? 'The browser could not open the download').slice(0, 1000) };
        if (message.ok === true) await enqueueProfile('profile.downloads.acknowledge', { ids: [request.downloadId], profile: request.profile }, transport);
      }
      profileChange('request', { requestId: request.requestId, status: request.state });
      return { status: request.state, result: request.result };
    };
    void run().then(respond, cause => respond({ error: cause.message, code: cause.code })); return true;
  }
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  const run = async () => {
    if (message.action === 'connect') { connectionIntent++; enabled = true; reconnectAttempts = 0; clearTimeout(reconnectTimer); await chrome.storage.local.set({enabled}); await connect(); }
    if (message.action === 'disconnect') {
      connectionIntent++; enabled = false; clearTimeout(reconnectTimer);
      const current = port, transport = transportState;
      if (transport) transport.closed = true;
      const release = stopAll('user-disconnected');
      await chrome.storage.local.set({ enabled: false });
      const released = await release;
      const cancelled = await Promise.allSettled([...(transport?.creations.values() ?? [])].map(cancelCreation));
      if (port === current) { current?.disconnect(); port = null; if (transportState === transport) transportState = null; ready = false; }
      if (cancelled.some(result => result.status === 'rejected')) { error = '取消新标签页失败'; detail = cancelled.filter(result => result.status === 'rejected').map(result => result.reason.message).join('\n'); }
      else if (released) { error = ''; detail = ''; }
      if (enabled && !port) await connect();
    }
    if (message.action === 'stop') {
      const control = controls.get(message.tabId); if (control) await stop(control, 'user-stopped');
    }
    const releaseErrors = [...controls.values()].flatMap(control=>[control.stopError,...control.actorErrors.values()]).filter(Boolean);
    const groupErrors = [...controls.values()].filter(control => control.groupError).map(control => control.groupError);
    const cursorErrors = [...controls.values()].filter(control=>!control.stopped&&control.cursorError).map(control=>control.cursorError);
    return { connected: ready, connecting: !!port && !ready, error: error || (releaseErrors.length ? '部分按键尚未确认释放，请重试停止。' : cursorErrors.length ? '小鼠标显示暂不可用，网页操作仍可继续。' : groupErrors.length ? '会话标签分组暂不可用，网页操作仍可继续。' : ''), detail: detail || [...releaseErrors,...cursorErrors,...groupErrors].join('\n'), controls: await Promise.all([...controls.values()].map(async control => ({...describe(await chrome.tabs.get(control.tabId)),stopped:control.stopped,stopping:!!control.stopping||control.actorStops.size>0,stopError:control.stopError||[...control.actorErrors.values()][0],cursorError:control.cursorError??null}))) };
  };
  void run().then(respond, cause => respond({error:cause.message,connected:ready,controls:[]})); return true;
});
chrome.runtime.onStartup.addListener(() => { void connect(); });
chrome.runtime.onInstalled.addListener(() => { void connect(); });
const changedProfilePermissions = () => { void refreshProfileEvents().then(() => profileChange('permissions'), cause => { detail = cause.message; }); };
chrome.permissions.onAdded.addListener(changedProfilePermissions);
chrome.permissions.onRemoved.addListener(changedProfilePermissions);
void refreshProfileEvents().catch(cause => { detail = cause.message; });
void connect();
import { CursorOverlay } from './cursor.js';

import { SessionTabGroups } from './session-groups.js';
