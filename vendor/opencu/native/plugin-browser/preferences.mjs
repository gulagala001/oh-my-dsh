import { randomUUID } from 'node:crypto';
import { constants, accessSync, realpathSync, statSync } from 'node:fs';
import { access, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const OWNERS = new Map();
const MAX_FILE_BYTES = 64 * 1024;
const TIME_RANGES = Object.freeze(['lastHour', 'lastDay', 'lastWeek', 'lastMonth', 'allTime']);
const SITE_STORAGES = Object.freeze(['fileSystems', 'indexedDB', 'localStorage', 'webSQL', 'serviceWorkers']);
const CLEAR_TYPES = Object.freeze(['history', 'cookies', 'siteData', 'cache', 'downloads', 'formData', 'siteSettings']);
const LINK_PREFERENCES = new Set(['openLinkInTargetPreference', 'openLocalUrlInTargetPreference']);
const LINK_CONSUMER_REASON = 'Stored preference only: no installed scoped link-opening consumer; the host default URL route has no public scoped override';
const failure = (message, code = 'BROWSER_PREFERENCES_UNAVAILABLE') => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

// Codex's shared setting descriptors and defaults, not Chromium profile preferences.
export const CODEX_BROWSER_PREFERENCE_FIELDS = Object.freeze({
  showFullUrl: Object.freeze({ key: 'browser-show-full-url', default: false }),
  annotationScreenshotsMode: Object.freeze({ key: 'browser-annotation-screenshots-mode', default: 'always' }),
  downloadDirectory: Object.freeze({ key: 'browser-download-directory', default: null }),
  promptForDownloadLocation: Object.freeze({ key: 'browser-download-prompt-enabled', default: false }),
  openLinkInTargetPreference: Object.freeze({ key: 'open-link-in-target-preference', default: 'in-app-browser' }),
  openLocalUrlInTargetPreference: Object.freeze({ key: 'open-local-url-in-target-preference', default: 'in-app-browser' }),
});

function object(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) throw failure(`Invalid ${name}`, 'INVALID_ARGUMENT');
  return value;
}

function preference(key, value) {
  if (!Object.hasOwn(CODEX_BROWSER_PREFERENCE_FIELDS, key)) throw failure('Unknown browser preference', 'INVALID_ARGUMENT');
  if (['showFullUrl', 'promptForDownloadLocation'].includes(key) && typeof value === 'boolean') return value;
  if (key === 'annotationScreenshotsMode' && ['always', 'necessary'].includes(value)) return value;
  if (['openLinkInTargetPreference', 'openLocalUrlInTargetPreference'].includes(key)
    && ['in-app-browser', 'external-browser'].includes(value)) return value;
  if (key === 'downloadDirectory' && (value === null || typeof value === 'string' && value.length > 0
    && value.length <= 32768 && !value.includes('\0') && isAbsolute(value))) return value;
  throw failure(`Invalid ${key}`, 'INVALID_ARGUMENT');
}

function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw failure('Download directory must be an absolute path', 'INVALID_DOWNLOAD_DIRECTORY');
  try {
    const canonical = realpathSync(path);
    if (!statSync(canonical).isDirectory()) throw failure('Download location is not a directory', 'INVALID_DOWNLOAD_DIRECTORY');
    accessSync(canonical, constants.W_OK | constants.X_OK);
    return canonical;
  } catch (error) {
    if (error.code === 'INVALID_DOWNLOAD_DIRECTORY') throw error;
    throw failure(`Download directory is unavailable: ${error.message}`, 'INVALID_DOWNLOAD_DIRECTORY');
  }
}

function cutoff(range, now = Date.now()) {
  if (!TIME_RANGES.includes(range)) throw failure('Unknown browsing data time range', 'INVALID_ARGUMENT');
  return range === 'allTime' ? 0 : now - ({ lastHour: 3600000, lastDay: 86400000,
    lastWeek: 604800000, lastMonth: 2419200000 })[range];
}

function nativeTypes(types, includesCookies) {
  const result = new Set();
  if (types.includes('cookies') || types.includes('siteData') && includesCookies) result.add('cookies');
  if (types.includes('siteData')) for (const type of SITE_STORAGES) result.add(type);
  if (types.includes('cache')) result.add('cache');
  if (types.includes('downloads')) result.add('downloads');
  return [...result];
}

export class PluginBrowserPreferences {
  #values = Object.fromEntries(Object.entries(CODEX_BROWSER_PREFERENCE_FIELDS).map(([key, field]) => [key, field.default]));
  #revision = 0;
  #ready = false;
  #closing = false;
  #initializing = false;
  #storageError;
  #queue = Promise.resolve();
  #lock;
  #disposing;
  #linkOpeningConsumer;
  #browserSession;

  constructor(options) {
    if (!options || !isAbsolute(options.storageDirectory)) throw failure('Preferences storageDirectory must be absolute', 'INVALID_ARGUMENT');
    const consumer = options.linkOpeningConsumer;
    if (consumer !== undefined) {
      object(consumer, ['installed', 'scope'], 'link-opening consumer registration');
      if (typeof consumer.installed !== 'boolean' || consumer.installed && (typeof consumer.scope !== 'string'
        || !consumer.scope || consumer.scope.length > 256 || /[\x00-\x1f]/u.test(consumer.scope)))
        throw failure('Invalid link-opening consumer registration', 'INVALID_ARGUMENT');
      // Capture trusted process initialization, never mutable options or request data.
      this.#linkOpeningConsumer = Object.freeze({ installed: consumer.installed, scope: consumer.installed ? consumer.scope : null });
    }
    this.options = options;
    this.#browserSession = options.browserSession;
    this.directory = resolve(options.storageDirectory);
    this.path = join(this.directory, 'preferences.json');
    this.lockPath = join(this.directory, 'preferences.lock');
  }

  async initialize() {
    if (this.#ready || this.#initializing || this.#closing) throw failure('Preferences initialization was already requested');
    this.#initializing = true;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const info = await lstat(this.directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw failure('Preferences storage must be a private directory');
      this.directory = await realpath(this.directory);
      this.path = join(this.directory, 'preferences.json');
      this.lockPath = join(this.directory, 'preferences.lock');
      if (OWNERS.has(this.directory)) throw failure('Browser preferences are already owned', 'BROWSER_PREFERENCES_BUSY');
      OWNERS.set(this.directory, this);
      await this.#acquireLock();
      let saved;
      try {
        const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const info = await file.stat();
          if (!info.isFile() || info.size > MAX_FILE_BYTES) throw failure('Browser preferences file is invalid');
          saved = JSON.parse(await file.readFile('utf8'));
        } finally { await file.close(); }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (saved !== undefined) {
        object(saved, ['schema', 'revision', 'values'], 'saved preferences');
        if (saved.schema !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 0)
          throw failure('Browser preferences schema is invalid');
        object(saved.values, Object.values(CODEX_BROWSER_PREFERENCE_FIELDS).map(field => field.key), 'saved preference values');
        for (const [key, field] of Object.entries(CODEX_BROWSER_PREFERENCE_FIELDS)) {
          if (Object.hasOwn(saved.values, field.key)) this.#values[key] = preference(key, saved.values[field.key]);
        }
        this.#revision = saved.revision;
      }
      // A removed custom folder stays visible as invalid; it never silently changes the destination.
      await this.#persist(this.#values, this.#revision);
      this.#ready = true;
      this.#initializing = false;
      return this.getCapabilities();
    } catch (error) {
      this.#storageError = error;
      this.#ready = false;
      await this.#releaseLock();
      if (OWNERS.get(this.directory) === this) OWNERS.delete(this.directory);
      throw error;
    } finally { this.#initializing = false; }
  }

  async #acquireLock() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        this.#lock = { handle, token: randomUUID(), identity: await handle.stat() };
        await handle.writeFile(JSON.stringify({ pid: process.pid, token: this.#lock.token }), 'utf8');
        await handle.sync();
        return;
      } catch (error) {
        if (error.code !== 'EEXIST' || attempt !== 0) throw error;
        const handle = await open(this.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        let saved, identity;
        try {
          identity = await handle.stat();
          if (!identity.isFile() || identity.size > 4096) throw failure('Preferences owner lock is invalid');
          saved = JSON.parse(await handle.readFile('utf8'));
        } finally { await handle.close(); }
        if (!Number.isSafeInteger(saved.pid) || saved.pid <= 0 || typeof saved.token !== 'string')
          throw failure('Preferences owner lock is invalid');
        try { process.kill(saved.pid, 0); throw failure('Browser preferences are in use', 'BROWSER_PREFERENCES_BUSY'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
        const current = await lstat(this.lockPath);
        if (current.dev !== identity.dev || current.ino !== identity.ino || current.isSymbolicLink())
          throw failure('Preferences ownership changed', 'BROWSER_PREFERENCES_BUSY');
        await unlink(this.lockPath);
      }
    }
  }

  async #releaseLock() {
    const lock = this.#lock;
    if (!lock) return;
    this.#lock = undefined;
    try {
      const current = await lstat(this.lockPath);
      if (current.dev === lock.identity.dev && current.ino === lock.identity.ino && !current.isSymbolicLink()) await unlink(this.lockPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    finally { await lock.handle.close(); }
  }

  async #persist(values, revision) {
    const saved = { schema: 1, revision, values: Object.fromEntries(Object.entries(CODEX_BROWSER_PREFERENCE_FIELDS)
      .map(([key, field]) => [field.key, values[key]])) };
    const temporary = join(this.directory, `.preferences-${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(`${JSON.stringify(saved)}\n`, 'utf8');
      await file.sync();
      await file.close(); file = undefined;
      await rename(temporary, this.path);
      if (process.platform !== 'win32') {
        const parent = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
        try { await parent.sync(); } finally { await parent.close(); }
      }
    } finally {
      await file?.close();
      try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  #assertReady() {
    if (!this.#ready || this.#closing || this.#storageError) throw this.#storageError ?? failure('Browser preferences are not ready');
  }

  #trusted(options) {
    this.#assertReady();
    options.signal?.throwIfAborted();
    if (options.trustedUserAction !== true) throw failure('Browser setting changes require the trusted user-action route', 'USER_ACTION_REQUIRED');
  }

  #enqueue(work) {
    this.#assertReady();
    const job = this.#queue.then(work);
    this.#queue = job.catch(() => {});
    return job;
  }

  getDownloadDirectory() {
    this.#assertReady();
    return directory(this.#values.downloadDirectory ?? this.options.app?.getPath('downloads'));
  }

  getPromptForUserDownloads() { this.#assertReady(); return this.#values.promptForDownloadLocation; }
  getValues() { this.#assertReady(); return clone(this.#values); }

  getCapabilities() {
    const available = this.#ready && !this.#initializing && !this.#closing && !this.#storageError;
    let effectiveDownloadDirectory = null, downloadDirectoryError;
    if (available) {
      try { effectiveDownloadDirectory = this.getDownloadDirectory(); }
      catch (error) { downloadDirectoryError = error.message; }
    }
    const storedPreferences = Object.keys(CODEX_BROWSER_PREFERENCE_FIELDS);
    const linkOpeningInstalled = this.#linkOpeningConsumer?.installed === true;
    const supportedPreferences = storedPreferences.filter(key => !LINK_PREFERENCES.has(key) || linkOpeningInstalled);
    const consumerScope = { showFullUrl: 'opencu-owned-browser-address-bar',
      annotationScreenshotsMode: 'opencu-owned-browser-annotation', downloadDirectory: 'opencu-owned-browser-downloads',
      promptForDownloadLocation: 'opencu-owned-browser-user-downloads',
      openLinkInTargetPreference: linkOpeningInstalled ? this.#linkOpeningConsumer.scope : null,
      openLocalUrlInTargetPreference: linkOpeningInstalled ? this.#linkOpeningConsumer.scope : null };
    return { available, persistentReady: available, scope: 'opencu-owned-browser',
      storedPreferences, supportedPreferences, consumerScope,
      unsupportedPreferences: linkOpeningInstalled ? {} : Object.fromEntries([...LINK_PREFERENCES].map(key => [key, LINK_CONSUMER_REASON])),
      chooseDownloadDirectory: available && typeof this.options.dialog?.showOpenDialog === 'function',
      resetDownloadDirectory: available, effectiveDownloadDirectory,
      downloadDirectoryReady: effectiveDownloadDirectory !== null,
      ...(downloadDirectoryError ? { downloadDirectoryError } : {}),
      ...available ? {} : { reason: this.#storageError?.message ?? (this.#closing ? 'Browser preferences are closing' : 'Browser preferences are initializing') } };
  }

  getSnapshot() {
    this.#assertReady();
    const capabilities = this.getCapabilities();
    return { available: true, revision: this.#revision, values: this.getValues(),
      supportedPreferences: capabilities.supportedPreferences,
      effectiveDownloadDirectory: capabilities.effectiveDownloadDirectory, capabilities };
  }

  async #update(key, value, options) {
    this.#trusted(options);
    value = preference(key, value);
    if (key === 'downloadDirectory' && value !== null) {
      value = await realpath(value);
      if (!(await lstat(value)).isDirectory()) throw failure('Download location is not a directory', 'INVALID_DOWNLOAD_DIRECTORY');
      await access(value, constants.W_OK | constants.X_OK);
      value = directory(value);
    }
    options.signal?.throwIfAborted();
    if (this.#values[key] === value) return this.getSnapshot();
    const values = { ...this.#values, [key]: value }, revision = this.#revision + 1;
    if (!Number.isSafeInteger(revision)) throw failure('Browser preference revision overflow');
    try { await this.#persist(values, revision); }
    catch (error) { this.#storageError = error; throw error; }
    this.#values = values; this.#revision = revision;
    const snapshot = this.getSnapshot();
    try { this.options.onChange?.(snapshot); }
    catch (error) { console.error('OpenCU browser preference listener failed:', error); }
    return snapshot;
  }

  setPreference(key, value, options = {}) {
    this.#trusted(options);
    preference(key, value);
    return this.#enqueue(() => this.#update(key, value, options));
  }

  chooseDownloadDirectory(options = {}) {
    this.#trusted(options);
    if (typeof this.options.dialog?.showOpenDialog !== 'function') throw failure('Native directory chooser is unavailable', 'DIRECTORY_CHOOSER_UNAVAILABLE');
    return this.#enqueue(async () => {
      this.#trusted(options);
      const input = { properties: ['openDirectory', 'createDirectory'], title: 'Choose Downloads Folder' };
      const parent = this.options.getDialogParent?.();
      const result = parent && !parent.isDestroyed() ? await this.options.dialog.showOpenDialog(parent, input)
        : await this.options.dialog.showOpenDialog(input);
      options.signal?.throwIfAborted();
      if (result.canceled) return { canceled: true, path: null, preferences: this.getSnapshot() };
      if (!Array.isArray(result.filePaths) || result.filePaths.length !== 1)
        throw failure('Directory chooser did not return one directory', 'INVALID_NATIVE_RESULT');
      const snapshot = await this.#update('downloadDirectory', result.filePaths[0], options);
      return { canceled: false, path: snapshot.values.downloadDirectory, preferences: snapshot };
    });
  }

  resetDownloadDirectory(options = {}) { return this.setPreference('downloadDirectory', null, options); }

  #nativeSiteSettingsCapabilities() {
    const session = this.#browserSession;
    const unavailable = reason => ({ available: false, persistentReady: false, supportedContentSettings: [], reason });
    if (!session || this.options.browserSession !== session) return unavailable('The owned browser session changed');
    const store = this.options.permissionStore;
    if (typeof store?.settingsCapabilities !== 'function' || typeof store?.clearData !== 'function')
      return unavailable('The browser permission service is unavailable');
    let capabilities;
    try { capabilities = store.settingsCapabilities(); }
    catch { return unavailable('Site-setting capabilities are unavailable'); }
    if (capabilities?.available !== true || capabilities.persistentReady !== true
      || !Array.isArray(capabilities.supportedContentSettings)
      || capabilities.supportedContentSettings.some(type => !Number.isSafeInteger(type) || type < 0))
      return unavailable('Persistent site settings are not ready');
    return { available: true, persistentReady: true, supportedContentSettings: [...capabilities.supportedContentSettings] };
  }

  #assertOwnedSession(session) {
    this.#assertReady();
    if (!session || this.#browserSession !== session || this.options.browserSession !== session)
      throw failure('The owned browser session changed', 'STALE_BROWSER_PROFILE');
  }

  getBrowsingDataSettings() {
    const ready = this.#ready && !this.#initializing && !this.#closing && !this.#storageError;
    const native = ready && typeof this.options.browserSession?.clearData === 'function';
    const historyCapabilities = this.options.history?.getCapabilities();
    const history = ready && historyCapabilities?.available === true && historyCapabilities.clear === true;
    const downloads = ready && this.options.downloadStore?.getCapabilities().available === true;
    const siteSettings = this.#nativeSiteSettingsCapabilities();
    const dataRemovalPermitted = { history, cookies: native, siteData: native, cache: native, downloads,
      formData: false, siteSettings: ready && siteSettings.available };
    const supportedDataTypes = CLEAR_TYPES.filter(type => dataRemovalPermitted[type]);
    const dataTypeTimeRanges = Object.fromEntries(CLEAR_TYPES.map(type => [type, !dataRemovalPermitted[type] ? []
      : ['history', 'downloads'].includes(type) ? [...TIME_RANGES] : ['allTime']]));
    return { available: ready && supportedDataTypes.length > 0, scope: 'opencu-owned-browser',
      supportedDataTypes, dataRemovalPermitted, supportedTimeRanges: [...TIME_RANGES], dataTypeTimeRanges,
      summaryAvailable: ready && (history || downloads || typeof this.options.browserSession?.cookies?.get === 'function'
        || typeof this.options.browserSession?.getCacheSize === 'function'),
      nativeTimeRangeRemoval: false,
      historySource: this.options.history?.getCapabilities().idSource ?? null,
      downloadsSource: this.options.downloadStore?.getCapabilities().idSource ?? null,
      siteDataIncludesCookies: 'explicit-timeRange-only',
      siteSettings: { ...siteSettings, available: dataRemovalPermitted.siteSettings,
        supportedTimeRanges: dataRemovalPermitted.siteSettings ? ['allTime'] : [],
        allOrigins: dataRemovalPermitted.siteSettings, defaultsCleared: false, summaryAvailable: false },
      unsupportedDataTypes: { formData: 'Official Electron does not expose the Chromium autofill store',
        ...(dataRemovalPermitted.siteSettings ? {} : { siteSettings: siteSettings.reason ?? 'Native site-setting removal is unavailable' }) } };
  }

  getBrowsingDataCapabilities() { return this.getBrowsingDataSettings(); }

  async getBrowsingDataSummary(input = {}, options = {}) {
    this.#assertReady();
    object(input, ['timeRange'], 'browsing data summary');
    options.signal?.throwIfAborted();
    const startTime = cutoff(input.timeRange ?? 'lastHour');
    const settings = this.getBrowsingDataSettings(), session = this.options.browserSession;
    const [history, downloads, cookies, cache] = await Promise.all([
      settings.dataRemovalPermitted.history ? this.options.history.searchHistory({ deduplicateByDay: true,
        matchingAlgorithm: 'alwaysPrefix', maxResults: 0, startTime, text: '' }, options) : null,
      settings.dataRemovalPermitted.downloads ? Promise.resolve(this.options.downloadStore.getHistory()) : null,
      typeof session?.cookies?.get === 'function' ? session.cookies.get({}).catch(() => null) : null,
      typeof session?.getCacheSize === 'function' ? session.getCacheSize().catch(() => null) : null,
    ]);
    options.signal?.throwIfAborted();
    const sites = new Set();
    if (history) for (const entry of history) {
      if (entry.lastVisitTime == null || entry.url == null) continue;
      try { sites.add(new URL(entry.url).hostname || entry.url); } catch { /* Invalid native URLs have no site summary. */ }
    }
    return { history: history === null ? null : { firstSite: sites.values().next().value ?? null, siteCount: sites.size },
      downloads: downloads === null ? null : { count: downloads.filter(item => !item.live
        && item.startTime * 1000 >= startTime).length },
      cache: Number.isSafeInteger(cache) && cache >= 0 ? { sizeBytes: cache } : null,
      siteData: Array.isArray(cookies) ? { siteCount: new Set(cookies.flatMap(cookie => typeof cookie.domain === 'string'
        ? [cookie.domain.replace(/^\./u, '')] : [])).size } : null,
      formData: null, siteSettings: null };
  }

  clearBrowsingData(input, options = {}) {
    this.#trusted(options);
    object(input, ['dataTypes', 'timeRange'], 'browsing data clear request');
    if (!Array.isArray(input.dataTypes) || input.dataTypes.length > CLEAR_TYPES.length
      || input.dataTypes.some(type => !CLEAR_TYPES.includes(type))) throw failure('Invalid browsing data types', 'INVALID_ARGUMENT');
    const types = [...new Set(input.dataTypes)], range = input.timeRange ?? 'allTime';
    cutoff(range);
    const assertSupported = () => {
      const settings = this.getBrowsingDataSettings();
      for (const type of types) {
        if (!settings.dataRemovalPermitted[type]) throw failure(`Browsing data removal is unavailable for ${type}`, 'UNSUPPORTED_DATA_TYPE');
        if (!settings.dataTypeTimeRanges[type].includes(range)) throw failure(`The owned browser cannot remove ${type} for ${range}`, 'UNSUPPORTED_TIME_RANGE');
      }
    };
    assertSupported();
    return this.#enqueue(async () => {
      this.#trusted(options); assertSupported();
      const startTime = cutoff(range), results = {};
      try {
        const native = nativeTypes(types.filter(type => type !== 'downloads'), input.timeRange !== undefined);
        // Storage removal is all-time; ranged history removal uses its native service.
        const supportedNative = range === 'allTime' && typeof this.options.browserSession?.clearData === 'function' ? native : [];
        if (supportedNative.length) {
          await this.options.browserSession.clearData({ dataTypes: supportedNative });
          results.native = { completed: true, dataTypes: supportedNative };
          if (supportedNative.includes('cookies') && typeof this.options.browserSession.cookies?.flushStore === 'function')
            await this.options.browserSession.cookies.flushStore();
        }
        options.signal?.throwIfAborted();
        if (types.includes('history')) results.history = await this.options.history.clear({ startTime }, options);
        options.signal?.throwIfAborted();
        if (types.includes('downloads')) {
          const history = await this.options.downloadStore.getHistory();
          results.downloads = { removedCount: 0 };
          if (range === 'allTime') {
            const result = await this.options.downloadStore.clearHistory(options);
            if (result.ok !== true) throw failure('Download history clear did not complete', 'DOWNLOAD_HISTORY_CLEAR_FAILED');
            const retained = new Set((await this.options.downloadStore.getHistory()).map(item => item.guid));
            if (history.some(item => !item.live && retained.has(item.guid)))
              throw failure('Native download history still contains selected completed records', 'DOWNLOAD_HISTORY_CLEAR_FAILED');
            results.downloads.removedCount = history.filter(item => !item.live && !retained.has(item.guid)).length;
          } else {
            const selected = history.filter(item => !item.live && item.startTime * 1000 >= startTime);
            for (const item of selected) {
              options.signal?.throwIfAborted();
              const result = await this.options.downloadStore.action('removeFromHistory', { id: item.guid }, options);
              if (result.ok === true) results.downloads.removedCount += 1;
              else if (result.reason !== 'missing-download') throw failure(`Download history removal failed: ${result.reason}`, 'DOWNLOAD_HISTORY_CLEAR_FAILED');
            }
            const retained = new Set((await this.options.downloadStore.getHistory()).map(item => item.guid));
            if (selected.some(item => retained.has(item.guid)))
              throw failure('Native download history still contains selected records', 'DOWNLOAD_HISTORY_CLEAR_FAILED');
            results.downloads.removedCount = selected.filter(item => !retained.has(item.guid)).length;
          }
          this.#trusted(options);
        }
        if (types.includes('siteSettings')) {
          this.#trusted(options);
          const session = this.#browserSession;
          this.#assertOwnedSession(session);
          const capabilities = this.#nativeSiteSettingsCapabilities();
          if (!capabilities.available || range !== 'allTime') throw failure('Native site settings support only all-time removal', 'UNSUPPORTED_TIME_RANGE');
          const receipt = await this.options.permissionStore.clearData({ since: 0, until: Date.now(), signal: options.signal });
          if (receipt?.accepted !== true || receipt.prefWriteCompleted !== true
            || receipt.source !== 'opencu-permission-store')
            throw failure('Site-setting removal was not committed', 'SITE_SETTINGS_CLEAR_UNCONFIRMED');
          results.siteSettings = { ...clone(receipt), completed: true, timeRange: 'allTime' };
          this.#assertOwnedSession(session); this.#trusted(options);
        }
        options.signal?.throwIfAborted();
        return { cleared: true, dataTypes: types, timeRange: range, results };
      } catch (error) {
        error.partialResults = results;
        throw error;
      }
    });
  }

  async handle(method, input = {}, options = {}) {
    options.signal?.throwIfAborted();
    if (method === 'preferences.get') { object(input, [], 'preferences query'); return this.getSnapshot(); }
    if (method === 'preferences.set') { object(input, ['key', 'value'], 'preference update'); return this.setPreference(input.key, input.value, options); }
    if (method === 'preferences.chooseDownloadDirectory') { object(input, [], 'directory chooser request'); return this.chooseDownloadDirectory(options); }
    if (method === 'preferences.resetDownloadDirectory') { object(input, [], 'directory reset request'); return this.resetDownloadDirectory(options); }
    if (method === 'browsingData.settings') { this.#assertReady(); object(input, [], 'browsing data settings query'); return this.getBrowsingDataSettings(); }
    if (method === 'browsingData.summary') return this.getBrowsingDataSummary(input, options);
    if (method === 'browsingData.clear') return this.clearBrowsingData(input, options);
    throw failure('Unknown browser preference operation', 'UNSUPPORTED_OPERATION');
  }

  async flush() { await this.#queue; }

  dispose() {
    if (this.#disposing) return this.#disposing;
    this.#closing = true;
    this.#disposing = (async () => {
      await this.#queue;
      await this.#releaseLock();
      if (OWNERS.get(this.directory) === this) OWNERS.delete(this.directory);
      this.#ready = false;
    })();
    return this.#disposing;
  }
}
