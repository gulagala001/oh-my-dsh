import { normalizeBrowserHistoryOptions } from './browser-history.mjs';
import { passwordFileImportError, passwordFileImportResult, passwordFileSelectionId } from '../../native/plugin-browser/password-file-import.mjs';

export const BROWSER_PROFILE_PERMISSION_NAMES = Object.freeze(['history', 'downloads', 'downloads.open', 'contentSettings', 'browsingData']);
export const BROWSER_PROFILE_METHODS = Object.freeze([
  'profile.status', 'profile.requestAccess', 'profile.getRequest', 'profile.cancelRequest', 'profile.revokeAccess',
  'profile.history.search', 'profile.history.searchUrls', 'profile.history.removeEntries', 'profile.history.deleteUrl', 'profile.history.deleteRange',
  'profile.downloads.getSnapshot', 'profile.downloads.searchHistory', 'profile.downloads.acknowledge',
  'profile.downloads.pause', 'profile.downloads.resume', 'profile.downloads.cancel', 'profile.downloads.removeFromHistory',
  'profile.downloads.clearHistory', 'profile.downloads.showDownloadsFolder', 'profile.downloads.showInFolder', 'profile.downloads.open',
  'profile.siteSettings.get', 'profile.siteSettings.set', 'profile.siteSettings.open', 'profile.siteSettings.reset', 'profile.siteInfo.open',
  'profile.browsingData.settings', 'profile.browsingData.clear', 'profile.browsingData.summary',
]);

const invalid = message => Object.assign(new Error(message), { code: 'INVALID_BROWSER_PROFILE_ARGUMENT' });
const unavailable = message => Object.assign(new Error(message), { code: 'BROWSER_PROFILE_UNAVAILABLE' });
const object = (value, label, keys) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || keys && Object.keys(value).some(key => !keys.includes(key))) throw invalid(label + ' must contain only supported options');
  return value;
};
const userCommand = options => {
  if (options?.explicitUserCommand !== true) throw Object.assign(new Error('Browser profile mutations require an explicit user command'), { code: 'BROWSER_PROFILE_USER_COMMAND_REQUIRED' });
};
const nativeUserCommand = options => {
  userCommand(options);
  if (options?.trustedUserAction !== true) throw Object.assign(new Error('Native profile operations require the authenticated UI route'), { code: 'BROWSER_PROFILE_USER_COMMAND_REQUIRED' });
};
function contentSettingType(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid('Native content setting type must be an integer from the provider capability table');
  return value;
}
function settingTypes(values) {
  if (!Array.isArray(values) || values.length > 256 || new Set(values).size !== values.length) throw invalid('Native content setting types must be an explicit bounded subset');
  return values.map(contentSettingType);
}
function canonicalOrigin(value) {
  if (typeof value !== 'string' || value.length > 4096) throw invalid('Native site settings require a canonical origin');
  let url;
  try { url = new URL(value); } catch { throw invalid('Native site settings require a canonical origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || value !== url.origin && value !== url.origin + '/') throw invalid('Native site settings require a canonical HTTP(S) origin');
  return url.origin;
}
function nativeSetting(value) {
  if (['allow', 'block', 'ask'].includes(value)) return value;
  object(value, 'native geolocation setting', ['approximate', 'precise']);
  if (!['allow', 'block', 'ask'].includes(value.approximate) || !['allow', 'block', 'ask'].includes(value.precise)) throw invalid('Invalid native geolocation setting');
  return { approximate: value.approximate, precise: value.precise };
}
function selectionId(input) {
  object(input, 'native profile import selection', ['selectionId']);
  if (typeof input.selectionId !== 'string' || !input.selectionId || input.selectionId.length > 256 || /[\x00-\x1f]/u.test(input.selectionId)) throw invalid('Native profile import requires its actual selection receipt');
  return { selectionId: input.selectionId };
}
const permissionList = permissions => {
  if (!Array.isArray(permissions) || !permissions.length || permissions.some(permission => !BROWSER_PROFILE_PERMISSION_NAMES.includes(permission)) || new Set(permissions).size !== permissions.length) throw invalid('permissions must be an explicit subset of the profile optional permissions');
  return [...permissions];
};
function historyOptions(options = {}) {
  object(options, 'history options', ['text', 'maxResults', 'offset', 'startTime', 'endTime', 'visitSource', 'deduplicateByDay', 'matchingAlgorithm']);
  if (options.visitSource !== undefined && options.visitSource !== 'all') throw unavailable('Chrome does not expose native agent visit classification');
  if (options.matchingAlgorithm !== undefined && options.matchingAlgorithm !== 'chrome') throw unavailable('Chrome does not expose Codex alwaysPrefix matching');
  return { ...options };
}
function downloadOptions(options = {}) {
  object(options, 'download options', ['text', 'maxResults', 'offset', 'startTime', 'endTime']); return { ...options };
}

// Every call targets one authenticated extension connection and its real profile.
// The facade does not read or recreate Chrome databases in the host process.
export class BrowserProfile {
  constructor(browser) {
    this.browser = browser;
    this.identity = Object.freeze({ browserId: browser?.id, epoch: browser?.info?.epoch,
      extensionInstanceId: browser?.info?.metadata?.extensionInstanceId, generation: browser?.info?.generation });
  }
  available() {
    return typeof this.browser?.call === 'function' && this.browser.info?.capabilities?.includes('browser-profile') === true
      && typeof this.identity.extensionInstanceId === 'string' && typeof this.identity.generation === 'string';
  }
  assertCurrent(signal) {
    signal?.throwIfAborted();
    if (!this.available()) throw unavailable('The selected browser does not expose profile actions');
    const info = this.browser.info;
    if (this.browser.id !== this.identity.browserId || info.epoch !== this.identity.epoch
      || info.generation !== this.identity.generation || info.metadata?.extensionInstanceId !== this.identity.extensionInstanceId) {
      throw Object.assign(new Error('The selected browser profile connection changed'), { code: 'STALE_BROWSER_PROFILE' });
    }
    this.browser.checkConnection?.();
  }
  async call(method, params = {}, options = {}) {
    if (!BROWSER_PROFILE_METHODS.includes(method)) throw unavailable('Unsupported browser profile operation: ' + method);
    this.assertCurrent(options.signal);
    const profile = { extensionInstanceId: this.identity.extensionInstanceId, generation: this.identity.generation };
    const result = await this.browser.call(method, { ...params, profile }, { ...options, timeoutMs: options.timeoutMs ?? 30000 });
    this.assertCurrent(options.signal);
    if (result?.profile && (result.profile.extensionInstanceId !== profile.extensionInstanceId || result.profile.generation !== profile.generation)) throw Object.assign(new Error('The browser returned another profile connection'), { code: 'STALE_BROWSER_PROFILE' });
    return result;
  }
  async status(options = {}) {
    if (!this.available()) return { available: false, source: null, reason: 'The selected browser does not expose profile actions' };
    const result = await this.call('profile.status', {}, options);
    object(result, 'profile status'); object(result.permissions, 'profile permissions');
    if (BROWSER_PROFILE_PERMISSION_NAMES.some(permission => typeof result.permissions[permission] !== 'boolean')) throw unavailable('The browser returned invalid profile permission state');
    return { ...result, available: true, browserId: this.identity.browserId, epoch: this.identity.epoch,
      preferences: { available: false, supportedPreferences: [], chooseDownloadDirectory: false, resetDownloadDirectory: false },
      browsingData: { ...result.browsingData, summaryAvailable: false },
      accessRequests: { available: true, optionalPermissions: [...BROWSER_PROFILE_PERMISSION_NAMES] } };
  }
  async requirePermission(permission, options) {
    const status = await this.status(options);
    if (!status.available) throw unavailable(status.reason);
    if (status.permissions[permission] !== true) throw Object.assign(new Error('Browser profile permission has not been granted: ' + permission), { code: 'BROWSER_PROFILE_PERMISSION_REQUIRED', permission });
  }
  requestAccess(permissions, options = {}) {
    userCommand(options); return this.call('profile.requestAccess', { permissions: permissionList(permissions), explicitUserCommand: true }, options);
  }
  revokeAccess(permissions, options = {}) {
    userCommand(options); return this.call('profile.revokeAccess', { permissions: permissionList(permissions), explicitUserCommand: true }, options);
  }
  getRequest(requestId, options = {}) {
    if (typeof requestId !== 'string' || !requestId) throw invalid('requestId must be an explicit browser profile request ID');
    return this.call('profile.getRequest', { requestId }, options);
  }
  cancelRequest(requestId, options = {}) {
    if (typeof requestId !== 'string' || !requestId) throw invalid('requestId must be an explicit browser profile request ID');
    return this.call('profile.cancelRequest', { requestId }, options);
  }
  searchHistory(options = {}, callOptions = {}) {
    return this.call('profile.history.search', { options: historyOptions(options) }, callOptions);
  }
  async userHistory(options = {}, callOptions = {}) {
    const input = normalizeBrowserHistoryOptions(options), limit = input.limit ?? 100;
    if (limit > 5000 || (input.queries?.length ?? 1) > 100) throw invalid('Browser history supports at most 5000 results and 100 queries per request');
    await this.requirePermission('history', callOptions);
    const batches = await Promise.all((input.queries ?? ['']).map(text => this.call('profile.history.searchUrls', { options: {
      text, maxResults: limit, startTime: input.from === undefined ? 0 : Date.parse(input.from),
      ...(input.to === undefined ? {} : { endTime: Date.parse(input.to) }),
    } }, callOptions)));
    const entries = batches.flatMap(batch => {
      if (!Array.isArray(batch?.entries)) throw unavailable('The browser returned invalid profile history');
      return batch.entries.filter(entry => typeof entry.url === 'string' && Number.isFinite(entry.lastVisitTime))
        .map(entry => ({ url: entry.url, ...(entry.title === undefined ? {} : { title: entry.title }), dateVisited: new Date(entry.lastVisitTime).toISOString() }));
    }).sort((a, b) => b.dateVisited.localeCompare(a.dateVisited));
    const seen = new Set();
    return entries.filter(entry => { if (seen.has(entry.url)) return false; seen.add(entry.url); return true; }).slice(0, limit);
  }
  removeEntries() { throw unavailable('Chrome cannot remove Codex selected URL visits by local day'); }
  deleteAllVisitsForUrl(url, options = {}) {
    userCommand(options);
    if (typeof url !== 'string' || !url) throw invalid('url must be a URL returned by native profile history');
    return this.call('profile.history.deleteUrl', { url, allVisitsForUrl: true, explicitUserCommand: true }, options);
  }
  deleteAllUrlsInRange({ startTime, endTime }, options = {}) {
    userCommand(options); return this.call('profile.history.deleteRange', { startTime, endTime, allUrlsInRange: true, explicitUserCommand: true }, options);
  }
  getDownloadSnapshot(options = {}) { return this.call('profile.downloads.getSnapshot', {}, options); }
  searchDownloadHistory(options = {}, callOptions = {}) { return this.call('profile.downloads.searchHistory', { options: downloadOptions(options) }, callOptions); }
  downloadAction(action, input = {}, options = {}) {
    const methods = ['acknowledge', 'pause', 'resume', 'cancel', 'removeFromHistory', 'clearHistory', 'showDownloadsFolder', 'showInFolder', 'open'];
    if (!methods.includes(action)) throw unavailable('Unsupported profile download action: ' + action);
    object(input, 'download action', action === 'acknowledge' ? ['ids', 'all'] : ['id']);
    if (action !== 'acknowledge') userCommand(options);
    if (!['acknowledge', 'clearHistory', 'showDownloadsFolder'].includes(action) && (typeof input.id !== 'string' || !input.id)) throw invalid('download action requires a native profile download ID');
    return this.call('profile.downloads.' + action, { ...input, ...(action === 'acknowledge' ? {} : { explicitUserCommand: true }) }, options);
  }
  async tabCall(method, sessionId, id, input, options) {
    this.assertCurrent(options.signal);
    if (typeof this.browser.existingLink !== 'function') throw unavailable('The browser does not expose a live tab binding for site settings');
    const binding = await this.browser.existingLink(sessionId, id, options.signal);
    const { nativeTabId, gateway, link, record, assertBinding } = binding;
    const url = record.page.url(); assertBinding();
    const result = await this.call(method, { ...input, tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId,
      expected: { url, providerTabId: String(nativeTabId), browserId: this.identity.extensionInstanceId, generation: this.identity.generation } }, options);
    assertBinding();
    if (record.page.url() !== url) throw Object.assign(new Error('The selected site changed while reading or changing its settings'), { code: 'STALE_TAB' });
    return result;
  }
  siteSettings(sessionId, id, types, options = {}) {
    return this.tabCall('profile.siteSettings.get', sessionId, id, types === undefined ? {} : { types }, options);
  }
  setSiteSetting(sessionId, id, { type, setting }, options = {}) {
    userCommand(options);
    return this.tabCall('profile.siteSettings.set', sessionId, id, { type, setting, types: [type], explicitUserCommand: true }, options);
  }
  openSiteSettings(sessionId, id, options = {}) {
    userCommand(options); return this.tabCall('profile.siteSettings.open', sessionId, id, { explicitUserCommand: true }, options);
  }
  openSiteInfo() { throw unavailable('Chrome extensions do not expose the native site-info popup'); }
  resetSiteSettings() { throw unavailable('Chrome contentSettings.clear removes every extension rule, not one selected site'); }
  getBrowsingDataSettings(options = {}) { return this.call('profile.browsingData.settings', {}, options); }
  getBrowsingDataSummary() { throw unavailable('Chrome does not expose Codex native history/cookie/cache/download summary counts and bytes'); }
  getPreferences() { throw unavailable('Chrome extension profile APIs do not expose OpenCU owned-browser preferences'); }
  setPreference() { throw unavailable('Chrome extension profile APIs do not expose OpenCU owned-browser preferences'); }
  chooseDownloadDirectory() { throw unavailable('Chrome extensions do not expose a profile download-directory chooser'); }
  resetDownloadDirectory() { throw unavailable('Chrome extensions do not expose profile download-directory resetting'); }
  clearBrowsingData(input, options = {}) {
    userCommand(options); object(input, 'clear browsing data', ['dataTypes', 'since']);
    return this.call('profile.browsingData.clear', { ...input, explicitUserCommand: true }, options);
  }
  subscribe(listener) {
    if (typeof listener !== 'function' || typeof this.browser?.hub?.on !== 'function') throw invalid('Profile events require an event listener and native extension hub');
    const handler = event => {
      if (event.browser !== this.identity.browserId || event.epoch !== this.identity.epoch || event.event !== 'profile-changed'
        || event.params?.profile?.extensionInstanceId !== this.identity.extensionInstanceId || event.params?.profile?.generation !== this.identity.generation) return;
      listener(event.params);
    };
    this.browser.hub.on('event', handler);
    return () => this.browser.hub.off('event', handler);
  }
  downloads(options = {}) {
    return Object.freeze({
      getSnapshot: () => this.getDownloadSnapshot(options), searchHistory: input => this.searchDownloadHistory(input, options),
      ...Object.fromEntries(['acknowledge', 'pause', 'resume', 'cancel', 'removeFromHistory', 'clearHistory', 'showDownloadsFolder', 'showInFolder', 'open']
        .map(action => [action, input => this.downloadAction(action, input, options)])),
      subscribe: listener => this.subscribe(event => { if (event.kind === 'downloads') listener(event); }),
    });
  }
}

const pluginProfile = browser => browser?.id === 'desktop-browser' && browser.info?.type === 'iab'
  && browser.info.metadata?.backend === 'desktop' && browser.info.metadata.runtime === 'plugin-electron';
const pluginMethods = new Set(['browser.nativeCapabilities', 'downloads.list', 'downloads.action', 'history.search', 'history.query', 'history.remove', 'history.clear',
  'profileImport.getSignals', 'profileImport.list', 'profileImport.chooseSource', 'profileImport.import', 'profileImport.cancelSelection',
  'nativeProfileImport.getSignals', 'nativeProfileImport.list', 'nativeProfileImport.grantSelection', 'nativeProfileImport.import', 'nativeProfileImport.cancel',
  'passwordFileImport.getSignals', 'passwordFileImport.chooseSource', 'passwordFileImport.import', 'passwordFileImport.cancel',
  'siteSettings.get', 'siteSettings.set', 'siteSettings.reset', 'siteSettings.clear', 'siteSettings.open', 'tabs.pageInfo',
  'preferences.get', 'preferences.set', 'preferences.chooseDownloadDirectory', 'preferences.resetDownloadDirectory', 'browsingData.settings', 'browsingData.summary', 'browsingData.clear',
  'profile.downloads.getSnapshot', 'profile.downloads.searchHistory', 'profile.downloads.pause', 'profile.downloads.resume', 'profile.downloads.cancel',
  'profile.downloads.removeFromHistory', 'profile.downloads.open', 'profile.downloads.showInFolder', 'profile.downloads.acknowledge',
  'profile.downloads.clearHistory', 'profile.downloads.showDownloadsFolder']);
const pluginDownloadActions = ['pause', 'resume', 'cancel', 'open', 'showInFolder'];
const nativeDownloadGuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const pluginDownloadEvents = new Set(['download-created', 'download-updated', 'download-done', 'download-permit-closed', 'download-history-changed']);
const pluginPermissionEvents = new Set(['permission-prompt', 'permission-prompt-closed', 'site-settings-changed']);
const pluginHistoryEvents = new Set(['history-changed']);
const profileFacades = new WeakMap();
const pluginHistoryUnavailable = () => unavailable('The authoritative owned-browser history service or requested operation is unavailable');
const pluginSettingsUnavailable = () => unavailable('The owned Electron provider does not expose native site settings or the page-info dialog');
const pluginBrowsingDataUnavailable = () => unavailable('The owned-browser browsing-data service or requested operation is unavailable');

// The owned provider supplies authoritative profile services and real native
// items, independently of Chrome extension permissions and Chrome databases.
export class PluginBrowserProfile extends BrowserProfile {
  constructor(browser) {
    super(browser);
    this.identity = Object.freeze({ browserId: browser?.id, epoch: browser?.info?.epoch, profileId: browser?.info?.metadata?.profile });
    this.historyRequests = new Set();
    this.passwordFileRequests = new Set();
    this.passwordFileSelections = new Map();
    this.passwordFileTerminals = new Map();
    this.downloadActions = ['pause', 'resume', 'cancel'];
    this.attention = new Set();
    if (typeof browser?.hub?.on === 'function') {
      this.onDownload = event => {
        if (!this.ownsEvent(event) || event.event !== 'download-done' || !['completed', 'interrupted'].includes(event.params?.state)
          || typeof event.params?.id !== 'string') return;
        this.attention.add(event.params.id);
        if (this.attention.size > 1000) this.attention.delete(this.attention.values().next().value);
      };
      this.onDisconnected = info => {
        if (info?.id !== this.identity.browserId || info.epoch !== this.identity.epoch) return;
        this.dispose();
      };
      browser.hub.on('event', this.onDownload); browser.hub.on('disconnected', this.onDisconnected);
    }
  }
  available() {
    return this.disposed !== true && pluginProfile(this.browser) && typeof this.browser.call === 'function' && typeof this.identity.epoch === 'string'
      && typeof this.identity.profileId === 'string' && this.identity.profileId.length > 0
      && this.browser.info.capabilities?.some(capability => ['live-downloads', 'browser-permissions'].includes(capability)) === true;
  }
  assertCurrent(signal) {
    signal?.throwIfAborted();
    if (!this.available()) throw unavailable('The selected owned browser does not expose live native profile actions');
    if (this.browser.id !== this.identity.browserId || this.browser.info.epoch !== this.identity.epoch
      || this.browser.info.metadata.profile !== this.identity.profileId) throw Object.assign(new Error('The owned browser profile connection changed'), { code: 'STALE_BROWSER_PROFILE' });
    this.browser.checkConnection?.();
  }
  async nativeCall(method, params = {}, options = {}) {
    if (!pluginMethods.has(method)) throw unavailable('Unsupported owned browser profile operation: ' + method);
    this.assertCurrent(options.signal);
    const result = await this.browser.call(method, params, { ...options, timeoutMs: options.timeoutMs ?? 30000 });
    const terminal = method.startsWith('passwordFileImport.') && method !== 'passwordFileImport.getSignals'
      || ['nativeProfileImport.import', 'nativeProfileImport.cancel', 'profileImport.import',
        'siteSettings.set', 'siteSettings.reset', 'siteSettings.clear'].includes(method);
    this.assertCurrent(terminal ? undefined : options.signal); return result;
  }
  call() { throw unavailable('Chrome extension profile operations are unavailable on the owned Electron provider'); }
  async status(options = {}) {
    if (!this.available()) return { available: false, source: null, reason: 'The selected owned browser does not expose live native profile actions' };
    const native = await this.nativeCall('browser.nativeCapabilities', {}, options);
    object(native, 'owned browser native capabilities');
    const history = native.history?.available === true && native.history.persistentReady === true
      && native.history.idSource === 'opencu-history' && native.history.scope === 'owned-browser-profile-global';
    const persistentDownloads = native.downloads?.available === true && native.downloads.persistentReady === true
      && native.downloads.provider === 'electron-download-item'
      && native.downloads.scope === 'opencu-owned-browser' && native.downloads.idSource === 'opencu-download-store';
    const liveDownloads = native.downloads?.liveItems === true;
    const downloads = liveDownloads || persistentDownloads;
    const permissions = native.permissions?.available === true;
    const siteSettings = native.siteSettings?.available === true && native.siteSettings.persistentReady === true
      && Array.isArray(native.siteSettings.supportedContentSettings)
      && native.siteSettings.supportedContentSettings.every(type => Number.isSafeInteger(type) && type >= 0);
    const preferences = native.preferences?.available === true && native.preferences.persistentReady === true && native.preferences.scope === 'opencu-owned-browser';
    this.downloadActions = persistentDownloads ? (Array.isArray(native.downloads.actions) ? native.downloads.actions : [])
      .filter(action => [...pluginDownloadActions, 'removeFromHistory', 'clearHistory', 'showDownloadsFolder'].includes(action))
      : liveDownloads ? (Array.isArray(native.downloads.actions) ? native.downloads.actions : ['pause', 'resume', 'cancel'])
        .filter(action => pluginDownloadActions.includes(action)) : [];
    return {
      available: true, source: 'plugin-electron-profile', browserId: this.identity.browserId, epoch: this.identity.epoch,
      profile: { id: this.identity.profileId, epoch: this.identity.epoch }, native,
      permissions: { history, downloads, 'downloads.open': this.downloadActions.includes('open'), contentSettings: siteSettings, browsingData: native.browsingData?.available === true },
      permissionSource: 'plugin-owned-service-capabilities', accessRequests: { available: false, optionalPermissions: [] },
      history: { ...native.history, available: history, visitSource: history ? native.history.actorFilters === true ? ['all', 'agent', 'other'] : ['all'] : [],
        matchingAlgorithm: history ? 'alwaysPrefix' : null, selectedEntryRemoval: history && native.history.removeUrlDay === true,
        persistentHistory: history && native.history.persistent === true, idSource: history ? native.history.idSource : null,
        pagination: history && native.history.pagination === true,
        ...(history ? {} : { reason: native.history?.reason ?? 'owned-profile-history-unavailable' }) },
      downloads: { available: downloads, provider: native.downloads?.provider, liveItems: liveDownloads,
        persistentHistory: persistentDownloads, persistentIds: persistentDownloads, nativeGuid: persistentDownloads && native.downloads.nativeGuid === true, historySearch: persistentDownloads,
        idSource: persistentDownloads ? native.downloads.idSource : 'provider-live-item', scope: persistentDownloads ? 'opencu-owned-browser' : 'provider-live-items',
        actions: downloads ? [...this.downloadActions, 'acknowledge'] : [], crossRestartResume: persistentDownloads && native.downloads.crossRestartResume === true,
        resumeValidation: native.downloads?.resumeValidation,
        fileExistsSource: native.downloads?.fileExistsSource ?? null, chooseDirectory: false,
        openRequiresUserGesture: native.downloads?.openRequiresUserGesture === true },
      sitePermissions: { ...native.permissions, available: permissions },
      siteSettings: { ...native.siteSettings, available: siteSettings,
        types: siteSettings ? [...native.siteSettings.supportedContentSettings] : [],
        contentSettings: siteSettings && Array.isArray(native.siteSettings.contentSettings)
          ? native.siteSettings.contentSettings.map(item => ({ ...item })) : [],
        siteInfoDialog: Array.isArray(native.siteInfo) && native.siteInfo.some(item => item?.available === true),
        settingsPage: siteSettings && native.siteSettings.settingsPage === true,
        nativePageInfoDialog: false, nativeSettingsPage: false,
        perSiteReset: siteSettings && native.siteSettings.perSiteReset === true },
      nativeProfileImport: { ...native.nativeProfileImport,
        available: native.nativeProfileImport?.available === true && native.nativeProfileImport.persistentReady === true },
      preferences: { ...native.preferences, available: preferences },
      browsingData: { ...native.browsingData, available: native.browsingData?.available === true,
        summaryAvailable: native.browsingData?.summaryAvailable === true },
    };
  }
  requestAccess() { throw unavailable('The owned Electron service does not use Chrome extension optional permission grants'); }
  revokeAccess() { throw unavailable('The owned Electron service does not expose Chrome extension permission revocation'); }
  getRequest() { throw unavailable('The owned Electron service has native permission prompts rather than Chrome extension access requests'); }
  cancelRequest() { throw unavailable('Native permission prompt dismissal uses the owned browser permission response'); }
  async historyRequest(options, work) {
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    this.historyRequests.add(controller);
    try {
      this.assertCurrent(signal);
      return await work({ ...options, signal });
    } finally {
      this.historyRequests.delete(controller);
      controller.abort(new DOMException('The history request finished', 'AbortError'));
    }
  }
  async historyCall(method, input, options, terminal = false) {
    if (!['history.query', 'history.search', 'history.remove', 'history.clear'].includes(method)) throw pluginHistoryUnavailable();
    this.assertCurrent(options.signal);
    const result = await this.browser.call(method, input, { ...options, timeoutMs: options.timeoutMs ?? 30000 });
    this.assertCurrent(terminal ? undefined : options.signal);
    return result;
  }
  async searchHistory(options = {}, callOptions = {}) {
    object(options, 'owned history options', ['text', 'maxResults', 'offset', 'startTime', 'endTime', 'visitSource', 'deduplicateByDay', 'matchingAlgorithm', 'cursor']);
    return this.historyRequest(callOptions, async request => {
      const status = await this.status(request);
      if (!status.history.available) throw pluginHistoryUnavailable();
      const input = { ...options, deduplicateByDay: options.deduplicateByDay ?? true, matchingAlgorithm: options.matchingAlgorithm ?? 'alwaysPrefix' };
      const result = await this.historyCall('history.query', { options: input }, request);
      if (!result || result.source !== 'opencu-history' || !Array.isArray(result.entries) ||
        typeof result.hasMore !== 'boolean' || typeof result.complete !== 'boolean' || result.complete === result.hasMore ||
        typeof result.revision !== 'string' || !/^(0|[1-9][0-9]*)$/.test(result.revision) || result.nextCursor !== null && (typeof result.nextCursor !== 'string' || !result.nextCursor) ||
        result.hasMore !== (result.nextCursor !== null) || result.nextCursor !== null && result.nextCursor === input.cursor ||
        result.entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.url !== 'string' ||
          !URL.canParse(entry.url) || !Number.isFinite(entry.selectedVisitTime) ||
          input.deduplicateByDay && (!Number.isFinite(entry.visitTime) || entry.isActorVisit !== null && typeof entry.isActorVisit !== 'boolean')))
        throw unavailable('The owned browser returned invalid native history pagination');
      return { ...result, entries: result.entries.map(entry => ({ ...entry, idSource: status.history.idSource })),
        capturedAtMs: Date.now(), source: 'opencu-history', profile: { id: this.identity.profileId, epoch: this.identity.epoch },
        semantics: { source: 'opencu-history', matchingAlgorithm: input.matchingAlgorithm, visitSource: input.visitSource ?? 'all',
          deduplicateByDay: input.deduplicateByDay, selectedEntryRemoval: status.history.selectedEntryRemoval, actorClassification: result.actorClassification } };
    });
  }
  async userHistory(options = {}, callOptions = {}) {
    const input = normalizeBrowserHistoryOptions(options), limit = input.limit ?? 100;
    if (limit > 5000 || (input.queries?.length ?? 1) > 100) throw invalid('Browser history supports at most 5000 results and 100 queries per request');
    return this.historyRequest(callOptions, async request => {
    const status = await this.status(request);
    if (!status.history.available) throw pluginHistoryUnavailable();
    const endTime = input.to === undefined ? Date.now() : Date.parse(input.to);
    const batches = await Promise.all((input.queries ?? ['']).map(text => this.historyCall('history.search', { options: {
      text, maxResults: limit, deduplicateByDay: false, matchingAlgorithm: 'default', visitSource: 'all',
      startTime: input.from === undefined ? 0 : Date.parse(input.from), endTime,
    } }, request)));
    const entries = batches.flatMap(batch => {
      if (!Array.isArray(batch)) throw unavailable('The owned browser returned invalid user history');
      if (batch.some(entry => typeof entry.url !== 'string' || !Number.isFinite(entry.selectedVisitTime))) throw unavailable('The owned browser did not provide the selected real visit timestamp');
      return batch
        .map(entry => ({ url: entry.url, ...(entry.title === undefined ? {} : { title: entry.title }),
          dateVisited: new Date(entry.selectedVisitTime).toISOString() }));
    }).sort((a, b) => b.dateVisited.localeCompare(a.dateVisited));
    const seen = new Set();
    return entries.filter(entry => { if (seen.has(entry.url)) return false; seen.add(entry.url); return true; }).slice(0, limit);
    });
  }
  async removeEntries(entries, options = {}) {
    userCommand(options);
    if (!Array.isArray(entries) || !entries.length || entries.some(entry => !entry ||
      typeof entry.url !== 'string' || !URL.canParse(entry.url) || !Number.isFinite(entry.visitTime)))
      throw invalid('Owned history removal requires the selected native URL and visit timestamp');
    return this.historyRequest(options, async request => {
      const status = await this.status(request);
      if (!status.history.selectedEntryRemoval) throw pluginHistoryUnavailable();
      const result = await this.historyCall('history.remove', {
        entries: entries.map(({url, visitTime}) => ({url, visitTime})), explicitUserCommand: true,
      }, request, true);
      if (result?.accepted !== true || result.committed !== true || result.source !== 'opencu-history')
        throw unavailable('The native history deletion did not return its committed receipt');
      return { ...result, ...(request.signal.aborted ? {cancellationRequested: true} : {}) };
    });
  }
  deleteAllVisitsForUrl() { throw pluginHistoryUnavailable(); }
  deleteAllUrlsInRange() { throw pluginHistoryUnavailable(); }
  async searchDownloadHistory(options = {}, callOptions = {}) {
    object(options, 'owned download history options', ['text', 'maxResults', 'offset']);
    const status = await this.status(callOptions);
    if (!status.downloads.persistentHistory) throw unavailable('The owned persistent download store is not ready');
    const maximum = options.maxResults ?? 100;
    if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum >= 2147483647) throw invalid('Owned download maxResults must be a non-negative bounded integer');
    const result = await this.nativeCall('profile.downloads.searchHistory', { options: { ...options, maxResults: maximum === 0 ? 0 : maximum + 1 } }, callOptions);
    const mapped = this.describeStoredSnapshot(result), hasMore = maximum !== 0 && mapped.downloads.length > maximum;
    if (hasMore) mapped.downloads.length = maximum;
    const visible = new Set(mapped.downloads.map(item => item.id)); mapped.unacknowledgedIds = mapped.unacknowledgedIds.filter(id => visible.has(id));
    return { ...mapped, hasMore };
  }
  storedDownloadPrefix() { return 'profile-download/' + encodeURIComponent(this.identity.profileId) + '/'; }
  externalStoredDownloadId(nativeId) { return this.storedDownloadPrefix() + encodeURIComponent(nativeId); }
  nativeStoredDownloadId(id) {
    if (typeof id !== 'string' || !id.startsWith(this.storedDownloadPrefix())) throw Object.assign(new Error('The download belongs to another owned browser profile'), { code: 'STALE_BROWSER_PROFILE' });
    let nativeId;
    try { nativeId = decodeURIComponent(id.slice(this.storedDownloadPrefix().length)); } catch { throw invalid('Invalid owned profile download ID'); }
    if (!nativeDownloadGuid(nativeId) || this.externalStoredDownloadId(nativeId) !== id) throw invalid('Invalid owned profile download ID');
    return nativeId;
  }
  describeStoredDownload(item) {
    if (!item || !nativeDownloadGuid(item.id) || item.idSource !== 'opencu-download-store'
      || !Number.isFinite(item.startedAtMs) || item.startedAtMs < 0 || !Number.isFinite(item.updatedAtMs) || item.updatedAtMs < 0
      || !['started', 'in_progress', 'paused', 'complete', 'canceled', 'failed'].includes(item.status)
      || typeof item.filename !== 'string' || typeof item.path !== 'string' || typeof item.url !== 'string'
      || !Number.isSafeInteger(item.receivedBytes) || item.receivedBytes < 0
      || !Number.isSafeInteger(item.totalBytes) || item.totalBytes < 0 || typeof item.fileExists !== 'boolean'
      || typeof item.live !== 'boolean'
      || ['canCancel', 'canPause', 'canResume'].some(key => typeof item[key] !== 'boolean')) throw unavailable('The owned browser returned invalid stored download state');
    return { ...item, id: this.externalStoredDownloadId(item.id), fileExistsIsCached: true, persistentHistory: true,
      canOpen: item.status === 'complete' && item.fileExists === true, canShowInFolder: item.fileExists === true };
  }
  describeStoredSnapshot(result) {
    if (!result || !Array.isArray(result.downloads) || !Array.isArray(result.unacknowledgedIds) || !Number.isFinite(result.capturedAtMs)) throw unavailable('The owned browser returned an invalid persistent download snapshot');
    const ids = new Set(result.downloads.map(item => item?.id));
    if (ids.size !== result.downloads.length || result.unacknowledgedIds.some(id => !nativeDownloadGuid(id) || !ids.has(id))
      || new Set(result.unacknowledgedIds).size !== result.unacknowledgedIds.length) throw unavailable('The owned browser returned inconsistent download identities');
    return { ...result, downloads: result.downloads.map(item => this.describeStoredDownload(item)),
      unacknowledgedIds: result.unacknowledgedIds.map(id => this.externalStoredDownloadId(id)),
      source: 'opencu-download-store', persistentHistory: true, scope: 'opencu-owned-browser',
      profile: { id: this.identity.profileId, epoch: this.identity.epoch } };
  }
  downloadPrefix() { return 'live-download/' + encodeURIComponent(this.identity.profileId) + '/' + encodeURIComponent(this.identity.epoch) + '/'; }
  externalDownloadId(nativeId) { return this.downloadPrefix() + encodeURIComponent(nativeId); }
  nativeDownloadId(id) {
    if (typeof id !== 'string' || !id.startsWith(this.downloadPrefix())) throw Object.assign(new Error('The download belongs to another owned browser profile connection'), { code: 'STALE_BROWSER_PROFILE' });
    let nativeId;
    try { nativeId = decodeURIComponent(id.slice(this.downloadPrefix().length)); } catch { throw invalid('Invalid native owned download ID'); }
    if (!nativeId || nativeId.length > 128 || this.externalDownloadId(nativeId) !== id) throw invalid('Invalid native owned download ID');
    return nativeId;
  }
  async liveDownloads(options) {
    const items = await this.nativeCall('downloads.list', {}, options);
    if (!Array.isArray(items) || items.some(item => !item || typeof item.id !== 'string' || item.idSource !== 'provider-live-item'
      || !Number.isSafeInteger(item.tabId) || !['progressing', 'completed', 'cancelled', 'interrupted'].includes(item.state))) throw unavailable('The owned browser returned invalid native live downloads');
    return items;
  }
  async downloadBinding(item, options) {
    if (typeof options.sessionId !== 'string' || !options.sessionId || typeof this.browser.existingLink !== 'function') return null;
    const record = [...this.browser.records.values()].find(tab => tab.nativeTabId === item.tabId);
    if (!record) return null;
    try {
      const binding = await this.browser.existingLink(options.sessionId, record.id, options.signal);
      binding.assertBinding(); this.assertCurrent(options.signal);
      if (binding.nativeTabId !== item.tabId || binding.gateway.leaseId !== item.leaseId || binding.link.clientId !== item.actorId) return null;
      return binding;
    } catch (error) {
      options.signal?.throwIfAborted(); this.assertCurrent(options.signal);
      return null;
    }
  }
  async describeLiveDownload(item, options) {
    const binding = await this.downloadBinding(item, options), active = item.state === 'progressing';
    return {
      id: this.externalDownloadId(item.id), idSource: 'provider-live-item', filename: item.filename, path: item.path,
      url: item.sourceUrl, urlChain: [...item.urlChain], receivedBytes: item.receivedBytes, totalBytes: item.totalBytes,
      status: item.state === 'completed' ? 'complete' : item.state === 'cancelled' ? 'canceled' : item.state === 'interrupted' ? 'failed' : item.paused ? 'paused' : 'in_progress',
      ...(Number.isFinite(item.startedAtMs) ? { startedAtMs: item.startedAtMs } : {}),
      ...(Number.isFinite(item.updatedAtMs) ? { updatedAtMs: item.updatedAtMs } : {}),
      ...(typeof item.fileExists === 'boolean' ? { fileExists: item.fileExists, fileExistsIsCached: false } : {}),
      ...(binding ? { tabId: binding.link.tabId } : {}),
      canCancel: binding !== null && active && this.downloadActions.includes('cancel'),
      canPause: binding !== null && active && !item.paused && this.downloadActions.includes('pause'),
      canResume: binding !== null && item.resumable === true && this.downloadActions.includes('resume'),
      canOpen: binding !== null && item.state === 'completed' && item.fileExists === true && this.downloadActions.includes('open'),
      canShowInFolder: binding !== null && item.state === 'completed' && item.fileExists === true && this.downloadActions.includes('showInFolder'), persistentHistory: false,
    };
  }
  async getDownloadSnapshot(options = {}) {
    const status = await this.status(options);
    if (status.downloads?.available !== true) throw unavailable('The owned browser does not expose native live downloads');
    if (status.downloads.persistentHistory) return this.describeStoredSnapshot(await this.nativeCall('profile.downloads.getSnapshot', {}, options));
    const items = await this.liveDownloads(options), downloads = await Promise.all(items.map(item => this.describeLiveDownload(item, options)));
    downloads.sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
    this.assertCurrent(options.signal);
    return { capturedAtMs: Date.now(), downloads, unacknowledgedIds: items.filter(item => this.attention.has(item.id)).map(item => this.externalDownloadId(item.id)),
      hasMore: false, source: 'electron-download-item', persistentHistory: false, scope: 'provider-live-items', profile: { id: this.identity.profileId, epoch: this.identity.epoch } };
  }
  async downloadAction(action, input = {}, options = {}) {
    object(input, 'download action', action === 'acknowledge' ? ['ids', 'all'] : ['id']); this.assertCurrent(options.signal);
    const status = await this.status(options);
    if (status.downloads.persistentHistory && (input.id === undefined || typeof input.id === 'string' && input.id.startsWith(this.storedDownloadPrefix()))) {
      const supported = status.downloads.actions;
      if (!supported.includes(action)) throw unavailable('Unsupported owned download-store action: ' + action);
      if (action !== 'acknowledge') nativeUserCommand(options);
      let params;
      if (action === 'acknowledge') {
        if (input.all === true && input.ids !== undefined || input.all !== true && (!Array.isArray(input.ids) || input.ids.length > 10000))
          throw invalid('Acknowledge requires all: true or explicit owned profile download IDs');
        params = input.all === true ? { all: true } : { ids: input.ids.map(id => this.nativeStoredDownloadId(id)) };
      }
      else {
        if (['clearHistory', 'showDownloadsFolder'].includes(action) && input.id !== undefined) throw invalid('Global download actions do not accept a selected download ID');
        params = ['clearHistory', 'showDownloadsFolder'].includes(action) ? {} : { id: this.nativeStoredDownloadId(input.id) };
      }
      const result = await this.nativeCall('profile.downloads.' + action, params, options);
      if (!result || typeof result.ok !== 'boolean') throw unavailable('The owned browser returned an invalid persistent download action');
      return { ...result, ...(result.download ? { download: this.describeStoredDownload(result.download) } : {}) };
    }
    if (action === 'acknowledge') {
      if (input.all === true) this.attention.clear();
      else if (Array.isArray(input.ids) && input.ids.length <= 1000) for (const id of input.ids) this.attention.delete(this.nativeDownloadId(id));
      else throw invalid('Acknowledge requires all: true or explicit owned download IDs');
      return { ok: true, source: 'provider-live-item-attention' };
    }
    userCommand(options);
    if (!status.downloads?.actions.includes(action) || !pluginDownloadActions.includes(action)) throw unavailable('The owned Electron provider does not expose this download action: ' + action);
    const nativeId = this.nativeDownloadId(input.id), item = (await this.liveDownloads(options)).find(download => download.id === nativeId);
    if (!item) return { ok: false, reason: 'missing-download' };
    const binding = await this.downloadBinding(item, options);
    if (!binding) throw Object.assign(new Error('The download has no current conversation tab binding'), { code: 'STALE_TARGET' });
    if (action === 'pause' && (item.state !== 'progressing' || item.paused)) return { ok: false, reason: 'download-not-pausable' };
    if (action === 'resume' && item.resumable !== true) return { ok: false, reason: 'download-not-resumable' };
    if (action === 'cancel' && item.state !== 'progressing') return { ok: false, reason: 'download-not-cancelable' };
    if (['open', 'showInFolder'].includes(action) && item.state !== 'completed') return { ok: false, reason: 'download-not-complete' };
    binding.assertBinding();
    const result = await this.nativeCall('downloads.action', { id: item.id, action, tabId: item.tabId,
      leaseId: binding.gateway.leaseId, actorId: binding.link.clientId, explicitUserCommand: true }, options);
    binding.assertBinding();
    if (result?.id !== item.id || result.idSource !== 'provider-live-item') throw unavailable('The owned browser returned another native download');
    return { ok: true, download: await this.describeLiveDownload(result, options) };
  }
  async nativeSiteBinding(sessionId, id, options) {
    nativeUserCommand(options); this.assertCurrent(options.signal);
    if (typeof this.browser.existingLink !== 'function') throw pluginSettingsUnavailable();
    const binding = await this.browser.existingLink(sessionId, id, options.signal);
    const url = binding.record.page.url(); binding.assertBinding();
    const frame = binding.record.page.mainFrame();
    const frameUrl = frame.url();
    const assertCurrent = () => {
      this.assertCurrent(options.signal); binding.assertBinding();
      if (binding.record.page.url() !== url || binding.record.page.mainFrame() !== frame || frame.url() !== frameUrl)
        throw Object.assign(new Error('The native site document changed'), { code: 'STALE_TAB' });
    };
    assertCurrent();
    return { ...binding, url, frameUrl, assertCurrent,
      params: { tabId: binding.nativeTabId, leaseId: binding.gateway.leaseId, actorId: binding.link.clientId } };
  }
  nativeSiteSelection(input, binding) {
    const scope = input.scope ?? 'origin';
    if (!['origin', 'default'].includes(scope)) throw invalid('Native site settings scope must be origin or default');
    if (scope === 'default') {
      if (input.requestingOrigin !== undefined || input.embeddingOrigin !== undefined) throw invalid('Default site settings cannot contain origins');
      return { scope };
    }
    const explicit = input.requestingOrigin !== undefined || input.embeddingOrigin !== undefined;
    if (explicit && (input.requestingOrigin === undefined || input.embeddingOrigin === undefined)) throw invalid('Native site settings require both actual origins');
    return { scope, requestingOrigin: canonicalOrigin(explicit ? input.requestingOrigin : new URL(binding.frameUrl).origin),
      embeddingOrigin: canonicalOrigin(explicit ? input.embeddingOrigin : new URL(binding.url).origin) };
  }
  async requireNativeSiteSettings(options) {
    nativeUserCommand(options);
    const status = await this.status(options);
    if (!status.siteSettings.available) throw pluginSettingsUnavailable();
    return status.siteSettings;
  }
  async nativeSiteCall(method, binding, input, options) {
    binding.assertCurrent();
    const result = await this.nativeCall(method, { ...binding.params, ...input }, options);
    const committed = ['siteSettings.set', 'siteSettings.reset', 'siteSettings.clear'].includes(method)
      && result?.accepted === true && result.source === 'opencu-permission-store'
      && (result.prefWriteCompleted === true || result.temporaryGrantApplied === true);
    // Revoking a live grant can reload the document after its durable write.
    if (!committed) binding.assertCurrent();
    return result;
  }
  nativeSettingResult(result, type, selection) {
    if (!result || result.type !== type || result.scope !== selection.scope || result.persistentReady !== true
      || result.source !== 'opencu-permission-store'
      || selection.scope === 'origin' && (result.requestingOrigin !== selection.requestingOrigin || result.embeddingOrigin !== selection.embeddingOrigin))
      throw unavailable('The provider returned another native site-setting selection');
    return result;
  }
  async siteSettings(sessionId, id, input, options = {}) {
    const requested = input === undefined || Array.isArray(input) ? { types: input } : object(input, 'native site-setting query', ['type', 'types', 'scope', 'requestingOrigin', 'embeddingOrigin']);
    const capabilities = await this.requireNativeSiteSettings(options), binding = await this.nativeSiteBinding(sessionId, id, options);
    const selection = this.nativeSiteSelection(requested, binding);
    const types = requested.type !== undefined ? [contentSettingType(requested.type)]
      : requested.types === undefined ? [...capabilities.types] : settingTypes(requested.types);
    if (types.some(type => !capabilities.types.includes(type))) throw unavailable('The provider does not support this native content setting type');
    const settings = [];
    for (const type of types) settings.push(this.nativeSettingResult(await this.nativeSiteCall('siteSettings.get', binding, { type, ...selection }, options), type, selection));
    return { source: 'opencu-permission-store', ...selection, types, settings,
      contentSettings: capabilities.contentSettings, persistentReady: settings.every(setting => setting.persistentReady === true),
      profile: { id: this.identity.profileId, epoch: this.identity.epoch } };
  }
  async setSiteSetting(sessionId, id, input, options = {}) {
    object(input, 'native site setting', ['type', 'setting', 'geolocation', 'scope', 'requestingOrigin', 'embeddingOrigin', 'oneTime']);
    const capabilities = await this.requireNativeSiteSettings(options), type = contentSettingType(input.type);
    if (!capabilities.types.includes(type) || input.oneTime !== undefined && typeof input.oneTime !== 'boolean') throw invalid('Unsupported native setting or temporary grant');
    const binding = await this.nativeSiteBinding(sessionId, id, options), selection = this.nativeSiteSelection(input, binding);
    if (input.oneTime === true && selection.scope !== 'origin') throw invalid('Temporary grants require an actual origin selection');
    const descriptor = capabilities.contentSettings.find(value => value.type === type);
    let setting;
    if (descriptor?.settingKind === 'geolocation') {
      if (input.geolocation !== undefined && input.setting !== undefined) throw invalid('Native geolocation settings require one explicit axis selection');
      const axes = nativeSetting(input.geolocation ?? input.setting);
      if (typeof axes === 'string') throw invalid('Native geolocation requires approximate and precise settings');
      setting = { geolocation: axes };
    } else if (descriptor?.settingKind === 'content-setting') {
      const value = nativeSetting(input.setting);
      if (input.geolocation !== undefined || typeof value !== 'string' || !Array.isArray(descriptor.settingValues)
        || !descriptor.settingValues.includes(value)) throw invalid('The provider does not support this native setting value');
      setting = { setting: value };
    } else throw unavailable('The provider did not expose a native content-setting value schema');
    const result = this.nativeSettingResult(await this.nativeSiteCall('siteSettings.set', binding,
      { type, ...selection, ...setting, ...(input.oneTime === undefined ? {} : { oneTime: input.oneTime }) }, options), type, selection);
    const applied = input.oneTime === true
      ? result.temporaryGrantApplied === true && result.prefWriteCompleted === false
      : result.prefWriteCompleted === true;
    if (result.accepted !== true || !applied) throw unavailable('The site setting was not committed');
    return result;
  }
  async resetSiteSettings(sessionId, id, input = {}, options = {}) {
    object(input, 'native site-setting reset', ['type', 'types', 'scope', 'requestingOrigin', 'embeddingOrigin']);
    const capabilities = await this.requireNativeSiteSettings(options), binding = await this.nativeSiteBinding(sessionId, id, options);
    const selection = this.nativeSiteSelection(input, binding);
    if (selection.scope === 'origin' && capabilities.perSiteReset !== true) throw pluginSettingsUnavailable();
    const types = input.type === undefined ? input.types === undefined ? [...capabilities.types] : settingTypes(input.types) : [contentSettingType(input.type)];
    if (types.some(type => !capabilities.types.includes(type))) throw invalid('Unsupported native content setting type');
    const result = await this.nativeSiteCall('siteSettings.reset', binding, { types, ...selection }, options);
    if (result?.accepted !== true || result.prefWriteCompleted !== true || result.source !== 'opencu-permission-store'
      || result.scope !== selection.scope || !Array.isArray(result.types) || !Array.isArray(result.settings)
      || result.types.length !== types.length || new Set(result.types).size !== types.length
      || result.types.some(type => !types.includes(type)) || result.settings.length !== types.length
      || selection.scope === 'origin' && (result.requestingOrigin !== selection.requestingOrigin || result.embeddingOrigin !== selection.embeddingOrigin))
      throw unavailable('The site-setting reset was not committed');
    const settings = types.map(type => {
      const matches = result.settings.filter(value => value?.type === type);
      if (matches.length !== 1) throw unavailable('The site-setting reset returned another selection');
      return this.nativeSettingResult(matches[0], type, selection);
    });
    return { ...result, types, settings };
  }
  async clearSiteSettings(sessionId, id, input, options = {}) {
    object(input, 'native site-settings clear', ['types', 'allOrigins', 'requestingOrigin', 'embeddingOrigin']);
    const capabilities = await this.requireNativeSiteSettings(options), types = settingTypes(input.types);
    if (!types.length || types.some(type => !capabilities.types.includes(type)) || input.allOrigins !== undefined && input.allOrigins !== true) throw invalid('Unsupported native content setting clear');
    const binding = await this.nativeSiteBinding(sessionId, id, options);
    const selected = input.allOrigins === true ? { allOrigins: true }
      : this.nativeSiteSelection({ scope: 'origin', requestingOrigin: input.requestingOrigin, embeddingOrigin: input.embeddingOrigin }, binding);
    if (selected.scope) delete selected.scope;
    if (input.allOrigins === true && (input.requestingOrigin !== undefined || input.embeddingOrigin !== undefined)) throw invalid('All-origin clearing cannot contain an origin');
    const result = await this.nativeSiteCall('siteSettings.clear', binding, { types, ...selected }, options);
    if (result?.accepted !== true || result.prefWriteCompleted !== true || result.defaultsCleared !== false
      || result.source !== 'opencu-permission-store' || !Array.isArray(result.types)
      || result.types.length !== types.length || result.types.some(type => !types.includes(type))
      || result.allOrigins !== (input.allOrigins === true)
      || input.allOrigins !== true && (result.requestingOrigin !== selected.requestingOrigin || result.embeddingOrigin !== selected.embeddingOrigin))
      throw unavailable('The native site settings were not cleared');
    return result;
  }
  async openSiteSettings(sessionId, id, options = {}) {
    const capabilities = await this.requireNativeSiteSettings(options);
    if (capabilities.settingsPage !== true) throw pluginSettingsUnavailable();
    const binding = await this.nativeSiteBinding(sessionId, id, options);
    return this.nativeSiteCall('siteSettings.open', binding,
      { siteUrl: binding.url, origin: canonicalOrigin(new URL(binding.url).origin) }, options);
  }
  async openSiteInfo(sessionId, id, input = {}, options = {}) {
    nativeUserCommand(options); object(input, 'native page-info dialog', []);
    const binding = await this.nativeSiteBinding(sessionId, id, options);
    return this.nativeSiteCall('tabs.pageInfo', binding, { siteUrl: binding.url,
      presentation: 'opencu-browser-window', explicitUserCommand: true }, options);
  }
  async getNativeImportSignals(options = {}) {
    nativeUserCommand(options);
    const result = await this.nativeCall('nativeProfileImport.getSignals', {}, options);
    if (!result || typeof result.available !== 'boolean' || typeof result.persistentReady !== 'boolean') throw unavailable('The native importer returned invalid availability signals');
    return result;
  }
  async requireNativeImport(options) {
    const signals = await this.getNativeImportSignals(options);
    if (!signals.available || !signals.persistentReady) throw unavailable('The native browser profile importer is not ready');
    return signals;
  }
  async listNativeImportSources(input = {}, options = {}) {
    object(input, 'native import source list', []); await this.requireNativeImport(options);
    return this.nativeCall('nativeProfileImport.list', {}, options);
  }
  async chooseNativeImportSource(input, options = {}) {
    nativeUserCommand(options); object(input, 'native import source selection', ['sourceId', 'importCookies', 'importPasswords', 'importHistory', 'allowElevatedChromeDecryption', 'cookieDomainAllowlist']);
    if (typeof input.sourceId !== 'string' || !input.sourceId || input.sourceId.length > 256
      || ['importCookies', 'importPasswords', 'importHistory', 'allowElevatedChromeDecryption'].some(key => typeof input[key] !== 'boolean')
      || !input.importCookies && !input.importPasswords && !input.importHistory) throw invalid('Native import requires an explicit source and data selection');
    if (input.cookieDomainAllowlist !== undefined && (!Array.isArray(input.cookieDomainAllowlist)
      || input.cookieDomainAllowlist.length > 1000 || input.cookieDomainAllowlist.some(domain => typeof domain !== 'string' || !domain || domain.length > 253 || /[\s\x00-\x1f\/]/u.test(domain)))) throw invalid('Invalid native cookie-domain allowlist');
    await this.requireNativeImport(options);
    return this.nativeCall('nativeProfileImport.grantSelection', { ...input,
      ...(input.cookieDomainAllowlist === undefined ? {} : { cookieDomainAllowlist: [...input.cookieDomainAllowlist] }) }, options);
  }
  async importNativeProfile(input, options = {}) {
    nativeUserCommand(options); const selected = selectionId(input); await this.requireNativeImport(options);
    return this.nativeCall('nativeProfileImport.import', selected, { ...options, timeoutMs: options.timeoutMs ?? 300000 });
  }
  cancelNativeImportSelection(input, options = {}) {
    nativeUserCommand(options); return this.nativeCall('nativeProfileImport.cancel', selectionId(input), options);
  }
  async getPasswordFileImportSignals(options = {}) {
    nativeUserCommand(options);
    return passwordFileImportResult('passwordFileImport.getSignals', await this.nativeCall('passwordFileImport.getSignals', {}, options));
  }
  passwordFileOwner(options) {
    nativeUserCommand(options);
    if (typeof options.sessionId !== 'string' || !options.sessionId || typeof options.selectionOwner !== 'string'
      || !options.selectionOwner || options.selectionOwner.length > 2048) throw invalid('Password file import requires its current UI selection owner');
    return options.selectionOwner;
  }
  passwordFileSelection(input, options) {
    object(input, 'password file import selection', ['selectionId']);
    if (!passwordFileSelectionId(input.selectionId)) throw invalid('Password file import requires its opaque selection receipt');
    const owner = this.passwordFileOwner(options), selection = this.passwordFileSelections.get(input.selectionId)
      ?? this.passwordFileTerminals.get(input.selectionId);
    if (!selection || selection.owner !== owner) throw Object.assign(new Error('The password file selection belongs to another UI lifecycle'), { code: 'STALE_BROWSER_PROFILE' });
    return selection;
  }
  finishPasswordFileSelection(selection, receipt) {
    selection.signal?.removeEventListener('abort', selection.abort);
    selection.release?.(); selection.release = undefined;
    this.passwordFileSelections.delete(receipt.selectionId);
    this.passwordFileTerminals.set(receipt.selectionId, { owner: selection.owner, receipt });
    if (this.passwordFileTerminals.size > 32) this.passwordFileTerminals.delete(this.passwordFileTerminals.keys().next().value);
    return receipt;
  }
  cancelPasswordFileSelection(id, selection) {
    if (selection.receipt) return Promise.resolve(structuredClone(selection.receipt));
    if (selection.cancel) return selection.cancel;
    selection.cancel = (async () => {
      // Lifecycle revocation remains a trusted UI cleanup after its request
      // signal is aborted. Only the already issued receipt is sent.
      const result = await this.browser.call('passwordFileImport.cancel', { selectionId: id },
        { timeoutMs: 300000, trustedUserAction: true });
      return this.finishPasswordFileSelection(selection, passwordFileImportResult('passwordFileImport.cancel', result, id));
    })();
    void selection.cancel.catch(() => { selection.cancel = undefined; });
    return selection.cancel;
  }
  async choosePasswordFileImportSource(input = {}, options = {}) {
    object(input, 'password file source chooser', []);
    const owner = this.passwordFileOwner(options), controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    this.passwordFileRequests.add(controller);
    let selection;
    try {
      for (const [id, previous] of this.passwordFileSelections) await this.cancelPasswordFileSelection(id, previous);
      const signals = await this.getPasswordFileImportSignals({ ...options, signal });
      if (!signals.available || !signals.persistentReady) throw unavailable('The native password file importer is not ready');
      const result = passwordFileImportResult('passwordFileImport.chooseSource', await this.nativeCall('passwordFileImport.chooseSource', {},
        { ...options, signal, timeoutMs: options.timeoutMs ?? 300000 }));
      if (result.status === 'canceled') { this.assertCurrent(signal); return result; }
      selection = { owner, controller, signal, release: options.selectionReleased };
      this.passwordFileSelections.set(result.selectionId, selection);
      selection.abort = () => { void this.cancelPasswordFileSelection(result.selectionId, selection).catch(error => {
        selection.cleanupError = passwordFileImportError(error, 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED');
        selection.release?.(); selection.release = undefined;
      }); };
      signal.addEventListener('abort', selection.abort, { once: true });
      try { this.assertCurrent(signal); }
      catch (error) { await this.cancelPasswordFileSelection(result.selectionId, selection); throw error; }
      return result;
    } catch (error) {
      if (!selection) options.selectionReleased?.();
      throw error;
    } finally { this.passwordFileRequests.delete(controller); }
  }
  async importPasswordFile(input, options = {}) {
    const selection = this.passwordFileSelection(input, options);
    if (selection.receipt) throw invalid('The password file selection has already reached its terminal state');
    const controller = new AbortController(), signal = AbortSignal.any([selection.signal, controller.signal, options.signal].filter(Boolean));
    this.passwordFileRequests.add(controller);
    try {
      const result = await this.nativeCall('passwordFileImport.import', { selectionId: input.selectionId },
        { ...options, signal, timeoutMs: options.timeoutMs ?? 300000 });
      return this.finishPasswordFileSelection(selection, passwordFileImportResult('passwordFileImport.import', result, input.selectionId));
    } finally { this.passwordFileRequests.delete(controller); }
  }
  async cancelPasswordFileImport(input, options = {}) {
    const selection = this.passwordFileSelection(input, options);
    this.assertCurrent(options.signal);
    const result = await this.cancelPasswordFileSelection(input.selectionId, selection);
    this.assertCurrent(); return result;
  }
  getImportSignals(options = {}) {
    return this.nativeCall('profileImport.getSignals', {}, options);
  }
  listImportSources(input = {}, options = {}) {
    object(input, 'owned history import source', ['selectionId']);
    return this.nativeCall('profileImport.list', input, options);
  }
  chooseImportSource(input, options = {}) {
    userCommand(options);object(input, 'owned history source chooser', ['kind']);
    if (!['file', 'directory'].includes(input.kind)) throw invalid('Import chooser kind must be file or directory');
    return this.nativeCall('profileImport.chooseSource', input, {...options, timeoutMs: options.timeoutMs ?? 300000});
  }
  importProfile(input, options = {}) {
    userCommand(options);object(input, 'owned history import', ['selectionId', 'importHistory', 'importCookies', 'importPasswords', 'importExtensions', 'dryRun']);
    if (typeof input.selectionId !== 'string' || !input.selectionId || input.importHistory !== true) throw invalid('Import requires an explicitly selected history receipt');
    return this.nativeCall('profileImport.import', input, {...options, timeoutMs: options.timeoutMs ?? 300000});
  }
  cancelImportSelection(input, options = {}) {
    userCommand(options);object(input, 'owned history import cancellation', ['selectionId']);
    if (typeof input.selectionId !== 'string' || !input.selectionId) throw invalid('Import cancellation requires a source selection ID');
    return this.nativeCall('profileImport.cancelSelection', input, options);
  }
  async getPreferences(options = {}) {
    const status = await this.status(options);
    if (!status.preferences.available) throw unavailable('Owned browser preferences are not ready');
    return this.nativeCall('preferences.get', {}, options);
  }
  async setPreference(input, options = {}) {
    userCommand(options); object(input, 'owned browser preference', ['key', 'value']);
    const status = await this.status(options);
    if (!status.preferences.available || !status.preferences.supportedPreferences?.includes(input.key)) throw unavailable('This owned browser preference is unavailable');
    return this.nativeCall('preferences.set', input, options);
  }
  async chooseDownloadDirectory(options = {}) {
    userCommand(options);
    const status = await this.status(options);
    if (!status.preferences.available || status.preferences.chooseDownloadDirectory !== true) throw unavailable('The native owned-browser download-directory chooser is unavailable');
    return this.nativeCall('preferences.chooseDownloadDirectory', {}, { ...options, timeoutMs: options.timeoutMs ?? 300000 });
  }
  async resetDownloadDirectory(options = {}) {
    userCommand(options);
    const status = await this.status(options);
    if (!status.preferences.available || status.preferences.resetDownloadDirectory !== true) throw unavailable('Owned browser download-directory reset is unavailable');
    return this.nativeCall('preferences.resetDownloadDirectory', {}, options);
  }
  async getBrowsingDataSettings(options = {}) {
    const status = await this.status(options);
    if (!status.browsingData.available) throw pluginBrowsingDataUnavailable();
    return this.nativeCall('browsingData.settings', {}, options);
  }
  async getBrowsingDataSummary(input = {}, options = {}) {
    object(input, 'owned browsing-data summary', ['timeRange']);
    const status = await this.status(options);
    if (!status.browsingData.summaryAvailable) throw pluginBrowsingDataUnavailable();
    return this.nativeCall('browsingData.summary', input, options);
  }
  async clearBrowsingData(input, options = {}) {
    userCommand(options); object(input, 'owned clear browsing data', ['dataTypes', 'timeRange']);
    const status = await this.status(options);
    if (!status.browsingData.available) throw pluginBrowsingDataUnavailable();
    return this.nativeCall('browsingData.clear', input, options);
  }
  ownsEvent(event) { return event?.browser === this.identity.browserId && event.epoch === this.identity.epoch; }
  subscribe(listener) {
    if (typeof listener !== 'function' || typeof this.browser?.hub?.on !== 'function') throw invalid('Owned profile events require a listener and browser hub');
    const handler = event => {
      if (!this.ownsEvent(event) || !pluginDownloadEvents.has(event.event) && !pluginPermissionEvents.has(event.event) && !pluginHistoryEvents.has(event.event)) return;
      listener({ kind: pluginDownloadEvents.has(event.event) ? 'downloads' : pluginHistoryEvents.has(event.event) ? 'history' : 'permissions', nativeEvent: event.event, params: event.params,
        source: 'plugin-electron-profile', profile: { id: this.identity.profileId, epoch: this.identity.epoch } });
    };
    this.browser.hub.on('event', handler); return () => this.browser.hub.off('event', handler);
  }
  dispose() {
    for (const controller of this.passwordFileRequests) controller.abort(new DOMException('The browser profile closed', 'AbortError'));
    this.passwordFileRequests.clear();
    const passwordSelections = [...this.passwordFileSelections.entries()];
    for (const [, selection] of passwordSelections) selection.controller.abort(new DOMException('The browser profile closed', 'AbortError'));
    this.passwordFileDisposal = Promise.allSettled(passwordSelections.map(([id, selection]) => this.cancelPasswordFileSelection(id, selection)))
      .then(results => { this.passwordFileCleanupErrors = results.filter(result => result.status === 'rejected')
        .map(result => passwordFileImportError(result.reason, 'PASSWORD_FILE_IMPORT_CLEANUP_UNCONFIRMED')); });
    this.passwordFileTerminals.clear();
    for (const controller of this.historyRequests) controller.abort(new DOMException('The browser profile closed', 'AbortError'));
    this.historyRequests.clear();
    this.disposed = true;
    if (this.onDownload) this.browser.hub.off('event', this.onDownload);
    if (this.onDisconnected) this.browser.hub.off('disconnected', this.onDisconnected);
    this.attention.clear();
  }
}

export function createBrowserProfile(browser) {
  if (!browser || typeof browser !== 'object') throw invalid('A connected browser is required');
  const key = JSON.stringify([browser.id, browser.info?.epoch, browser.info?.metadata?.runtime,
    browser.info?.metadata?.profile, browser.info?.metadata?.extensionInstanceId, browser.info?.generation]);
  const previous = profileFacades.get(browser);
  if (previous?.key === key && previous.facade.disposed !== true) return previous.facade;
  previous?.facade.dispose?.();
  const facade = pluginProfile(browser) ? new PluginBrowserProfile(browser) : new BrowserProfile(browser);
  profileFacades.set(browser, { key, facade }); return facade;
}
