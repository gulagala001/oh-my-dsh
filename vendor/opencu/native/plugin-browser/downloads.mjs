import { randomUUID } from 'node:crypto';
import { constants, lstatSync, realpathSync } from 'node:fs';
import { open, mkdir, rename, unlink, lstat, link } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const OWNERS = new Map();
const SCHEMA = 1;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const SNAPSHOT_LIMIT = 200;
const RESUME_PROBE_TIMEOUT_MS = 30000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STATES = new Set(['progressing', 'completed', 'cancelled', 'interrupted']);
const TERMINAL = new Set(['complete', 'canceled', 'failed']);
const ACTIONS = new Set(['pause', 'resume', 'cancel', 'removeFromHistory', 'open', 'showInFolder', 'reveal']);
const ITEM_METHODS = ['getState', 'getURL', 'getURLChain', 'getFilename', 'getSavePath', 'getReceivedBytes',
  'getTotalBytes', 'getStartTime', 'isPaused', 'canResume', 'getMimeType', 'getLastModifiedTime', 'getETag',
  'pause', 'resume', 'cancel', 'on', 'removeListener'];
const fail = (message, code = 'DOWNLOAD_STORE_UNAVAILABLE') => Object.assign(new Error(message), { code });
const missing = () => ({ ok: false, reason: 'missing-download' });
const scalarId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/u.test(value);
const downloadId = value => typeof value === 'string' && UUID.test(value);
const routeId = value => value === null || scalarId(value) || Number.isSafeInteger(value) && value >= 0;
const text = (value, maximum = 16384) => typeof value === 'string' && value.length <= maximum && !value.includes('\0');
const bytes = value => Number.isSafeInteger(value) && value >= 0;
const time = value => Number.isFinite(value) && value >= 0;
const count = (value, fallback, name) => {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw fail(`Invalid ${name}`, 'INVALID_ARGUMENT');
  return value;
};
const clone = value => structuredClone(value);

function fingerprint(path) {
  if (!isAbsolute(path)) return null;
  try {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return { canonicalPath: realpathSync(path), dev: String(stat.dev), ino: String(stat.ino),
      size: String(stat.size), mtimeNs: String(stat.mtimeNs) };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}

function sameFile(first, second) {
  return first !== null && second !== null && ['canonicalPath', 'dev', 'ino', 'size', 'mtimeNs']
    .every(key => first[key] === second[key]);
}

function validFingerprint(value) {
  return value === null || value && typeof value === 'object' && typeof value.canonicalPath === 'string'
    && isAbsolute(value.canonicalPath)
    && ['dev', 'ino', 'size', 'mtimeNs'].every(key => typeof value[key] === 'string' && /^\d+$/u.test(value[key]));
}

function status(state, paused, resumable) {
  if (state === 'completed') return 'complete';
  if (state === 'cancelled') return 'canceled';
  if (state === 'interrupted') return resumable ? 'paused' : 'failed';
  return paused ? 'paused' : 'in_progress';
}

function nativeRead(item, fallbackPath) {
  const state = item.getState(), urlChain = item.getURLChain(), path = item.getSavePath() || fallbackPath;
  const data = { state, url: item.getURL(), urlChain, filename: item.getFilename(), path,
    receivedBytes: item.getReceivedBytes(), totalBytes: Math.max(0, item.getTotalBytes()),
    startedAtMs: item.getStartTime() * 1000, paused: item.isPaused(), resumable: item.canResume(),
    mimeType: item.getMimeType(), lastModified: item.getLastModifiedTime(), eTag: item.getETag() };
  if (!STATES.has(state) || !text(data.url) || !Array.isArray(urlChain) || !urlChain.length
    || urlChain.length > 128 || urlChain.some(url => !text(url)) || !text(data.filename, 4096)
    || !text(path, 32768) || !isAbsolute(path) || !bytes(data.receivedBytes) || !bytes(data.totalBytes)
    || !time(data.startedAtMs) || typeof data.paused !== 'boolean' || typeof data.resumable !== 'boolean'
    || !text(data.mimeType, 4096) || !text(data.lastModified, 4096) || !text(data.eTag, 4096)) {
    throw fail('DownloadItem returned invalid download metadata', 'INVALID_NATIVE_RESULT');
  }
  return data;
}

function validRecord(record) {
  return record && downloadId(record.id) && STATES.has(record.nativeState)
    && ['started', 'in_progress', 'paused', 'complete', 'canceled', 'failed'].includes(record.status)
    && text(record.url) && text(record.filename, 4096) && text(record.path, 32768) && isAbsolute(record.path)
    && bytes(record.receivedBytes) && bytes(record.totalBytes) && time(record.startedAtMs)
    && time(record.updatedAtMs) && time(record.endedAtMs) && typeof record.userInitiated === 'boolean'
    && Array.isArray(record.urlChain) && record.urlChain.length > 0 && record.urlChain.length <= 128
    && record.urlChain.every(url => text(url)) && text(record.mimeType, 4096)
    && text(record.lastModified, 4096) && text(record.eTag, 4096) && validFingerprint(record.fileIdentity)
    && routeId(record.browserTabId) && (record.conversationId === null || scalarId(record.conversationId))
    && (record.paused === undefined || typeof record.paused === 'boolean')
    && (record.resumable === undefined || typeof record.resumable === 'boolean')
    && (record.resumeValidation === undefined || ['not-checked', 'validated', 'failed'].includes(record.resumeValidation))
    && (record.resumeValidationAtMs === undefined || time(record.resumeValidationAtMs))
    && (record.resumeFailure === undefined || text(record.resumeFailure, 256));
}

function resumeValidator(record) {
  if (/^"[^"\x00-\x20\x7f]*"$/u.test(record.eTag)) return record.eTag;
  if (record.lastModified && !/[\r\n]/u.test(record.lastModified) && Number.isFinite(Date.parse(record.lastModified)))
    return record.lastModified;
  return null;
}

function resumeMetadata(record) {
  if (record.nativeState === 'completed' || record.nativeState === 'cancelled'
    || record.receivedBytes <= 0 || record.totalBytes <= record.receivedBytes
    || !record.fileIdentity || record.fileIdentity.size !== String(record.receivedBytes)
    || !resumeValidator(record)) return null;
  try {
    if (record.urlChain.some(value => {
      const url = new URL(value);
      return !['http:', 'https:'].includes(url.protocol) || url.username || url.password;
    })) return null;
    if (!sameFile(record.fileIdentity, fingerprint(record.path))) return null;
  } catch { return null; }
  return { path: record.path, urlChain: [...record.urlChain], mimeType: record.mimeType,
    offset: record.receivedBytes, length: record.totalBytes, lastModified: record.lastModified,
    eTag: record.eTag, startTime: record.startedAtMs / 1000 };
}

function sameRestore(item, expected) {
  try {
    const actual = nativeRead(item, expected.path);
    return actual.state === 'interrupted' && actual.path === expected.path
      && actual.receivedBytes === expected.offset && actual.totalBytes === expected.length
      && actual.mimeType === expected.mimeType && actual.lastModified === expected.lastModified
      && actual.eTag === expected.eTag && Math.abs(actual.startedAtMs / 1000 - expected.startTime) <= 0.000001
      && actual.urlChain.length === expected.urlChain.length
      && actual.urlChain.every((url, index) => url === expected.urlChain[index]);
  } catch { return false; }
}

/** Plugin-owned history observed from this browser's real Electron DownloadItems. */
export class PluginBrowserDownloads {
  #records = new Map();
  #live = new Map();
  #items = new WeakMap();
  #unacknowledged = new Set();
  #restoreCall;
  #restoreAttachments = new WeakMap();
  #retiredItems = new Set();
  #revision = 0;
  #persistedRevision = -1;
  #writeQueue = Promise.resolve();
  #writeTimer;
  #loaded = false;
  #initializing = false;
  #closing = false;
  #storageError;
  #lock;
  #sequence = 0;
  #changeListener;
  #lifecycleListener;
  #activeListener;
  #disposal;
  #initialization;
  #operationQueue = Promise.resolve();
  #jobs = new Set();
  #resumeControllers = new Set();

  constructor(options) {
    if (!options || !isAbsolute(options.storageDirectory)) throw fail('Downloads storageDirectory must be absolute', 'INVALID_ARGUMENT');
    this.options = options;
    this.directory = resolve(options.storageDirectory);
    this.path = join(this.directory, 'downloads.json');
    this.lockPath = join(this.directory, 'downloads.lock');
  }

  initialize() {
    if (this.#closing) return Promise.reject(fail('Download store is closing'));
    if (!this.#initialization) this.#initialization = this.#initialize();
    return this.#initialization;
  }

  async #initialize() {
    this.#initializing = true;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const directory = await lstat(this.directory);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw fail('Downloads store directory must not be a symlink');
      if (OWNERS.has(this.directory)) throw fail('Downloads store is already owned', 'DOWNLOAD_STORE_BUSY');
      OWNERS.set(this.directory, this);
      await this.#acquireLock();
      let source;
      try {
        const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw fail('Downloads history file is invalid');
          source = JSON.parse(await file.readFile('utf8'));
        } finally { await file.close(); }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (source !== undefined) {
        if (source.schema !== SCHEMA || !Array.isArray(source.downloads) || !Array.isArray(source.unacknowledgedIds)
          || !Number.isSafeInteger(source.lifecycleSequence) || source.lifecycleSequence < 0) throw fail('Downloads history schema is invalid');
        for (const record of source.downloads) {
          if (!validRecord(record) || this.#records.has(record.id)) throw fail('Downloads history contains an invalid or duplicate record');
          this.#records.set(record.id, { ...record,
            interruptedByRestart: !TERMINAL.has(record.status) || record.interruptedByRestart === true,
            resumeValidation: 'not-checked', resumeValidationAtMs: 0 });
        }
        for (const id of source.unacknowledgedIds) {
          if (!downloadId(id) || !this.#records.has(id) || this.#unacknowledged.has(id))
            throw fail('Downloads history acknowledgement state is invalid');
          this.#unacknowledged.add(id);
        }
        this.#sequence = source.lifecycleSequence;
      }
      if (this.#closing) throw fail('Download store closed during initialization');
      this.#loaded = true;
      await this.#persist();
      // Restoring a dormant DownloadItem does not initiate a network request.
      if (typeof this.options.browserSession?.createInterruptedDownload === 'function') {
        for (const record of this.#records.values()) {
          if (!resumeMetadata(record)) continue;
          try { this.#restore(record); }
          catch (error) {
            record.resumeFailure = text(error.code, 256) ? error.code : 'DOWNLOAD_RESTORE_FAILED';
            this.#changed();
            this.#emitItemError(error);
          }
        }
      }
      await this.flush();
      this.#initializing = false;
      return this.getCapabilities();
    } catch (error) {
      this.#storageError = error;
      this.#loaded = false;
      if (this.#writeTimer) { clearTimeout(this.#writeTimer); this.#writeTimer = undefined; }
      await this.#writeQueue;
      try { await this.#releaseLock(); }
      finally { if (OWNERS.get(this.directory) === this) OWNERS.delete(this.directory); }
      throw error;
    } finally { this.#initializing = false; }
  }

  getCapabilities() {
    const available = this.#loaded && !this.#initializing && !this.#storageError && !this.#closing;
    const canRestore = typeof this.options.browserSession?.createInterruptedDownload === 'function'
      && typeof this.options.browserSession?.fetch === 'function';
    const actions = available ? ['pause', 'resume', 'cancel', 'removeFromHistory', 'clearHistory', 'acknowledge'] : [];
    if (available && typeof this.options.shell?.openPath === 'function') actions.push('open', 'showDownloadsFolder');
    if (available && typeof this.options.shell?.showItemInFolder === 'function') actions.push('showInFolder', 'reveal');
    return { available, provider: 'electron-download-item', source: 'opencu-download-store',
      nativeProvider: false, nativeGuid: false, persistentReady: available, persistentHistory: available,
      persistentIds: available, historySearch: available, scope: 'opencu-owned-browser', actions,
      idSource: 'opencu-download-store', crossRestartResume: available && canRestore,
      fileExistsSource: 'actual-filesystem', openRequiresUserGesture: true,
      resumeValidation: 'file-identity-and-server-range-validators-then-electron-download-item',
      ...available ? {} : { reason: this.#storageError?.message ?? (this.#closing ? 'Download store is closing' : 'Download store is initializing') } };
  }

  #assertReady() {
    if (!this.#loaded || this.#closing || this.#storageError) throw this.#storageError ?? fail('Download store is unavailable');
  }

  attach(item, context = {}) {
    this.#assertReady();
    if (!item || ITEM_METHODS.some(method => typeof item[method] !== 'function'))
      throw fail('A real Electron DownloadItem is required', 'INVALID_ARGUMENT');
    if (this.#retiredItems.has(item)) throw fail('The download attachment has been retired', 'STALE_DOWNLOAD');
    const existing = this.#items.get(item);
    if (existing) {
      if (this.#live.get(existing)?.item !== item || context.id !== undefined && context.id !== existing)
        throw fail('The download attachment has ended or changed', 'STALE_DOWNLOAD');
      return existing;
    }
    const restoration = this.#restoreAttachments.get(item);
    if (context.restorationToken !== undefined && (!restoration || restoration.nonce !== context.restorationToken))
      throw fail('Unissued download restoration', 'STALE_DOWNLOAD');
    if (restoration && context.restorationToken !== restoration.nonce) throw fail('Restoration token was not consumed', 'STALE_DOWNLOAD');
    const id = restoration?.record.id ?? context.id ?? randomUUID();
    if (!downloadId(id) || this.#live.has(id) || (!restoration && this.#records.has(id))) throw fail('Download identity already exists or is invalid', 'STALE_DOWNLOAD');
    if (restoration && typeof item.setSavePath === 'function') item.setSavePath(restoration.record.path);
    const native = nativeRead(item, context.savePath);
    const now = Date.now(), old = restoration?.record;
    const record = { id, browserTabId: old?.browserTabId ?? context.browserTabId ?? context.tabId ?? null,
      conversationId: old?.conversationId ?? context.conversationId ?? null,
      userInitiated: old?.userInitiated ?? (context.userInitiated === true || context.isUserInitiated === true),
      ...native, nativeState: native.state,
      status: restoration && old.status === 'failed' ? 'failed'
        : !restoration && native.state === 'progressing' && !native.paused ? 'started'
          : status(native.state, native.paused, native.resumable),
      startedAtMs: old?.startedAtMs ?? native.startedAtMs, updatedAtMs: now,
      endedAtMs: restoration && old.status === 'failed' ? old.endedAtMs : 0,
      fileIdentity: restoration ? clone(old.fileIdentity) : fingerprint(native.path),
      interruptedByRestart: old?.interruptedByRestart === true,
      resumeValidation: 'not-checked', resumeValidationAtMs: 0 };
    delete record.state;
    if (!validRecord(record)) throw fail('Invalid trusted download attachment', 'INVALID_ARGUMENT');
    const binding = { id, item, record, listeners: [], native, dormant: !!restoration,
      ended: restoration && old.status === 'failed',
      resumeIdentity: restoration ? clone(old.fileIdentity) : null };
    const updated = (_event, state) => this.#event(binding, state, false);
    const done = (_event, state) => this.#event(binding, state, true);
    item.on('updated', updated);
    item.on('done', done);
    binding.listeners.push(['updated', updated], ['done', done]);
    this.#live.set(id, binding);
    this.#items.set(item, id);
    this.#records.set(id, record);
    if (restoration) {
      restoration.item = item;
      this.#restoreAttachments.delete(item);
    }
    this.#transition(record, old?.status ?? null);
    this.#notify(this.#activeListener);
    this.#changed();
    return id;
  }

  /** Called synchronously before the provider's new-download gate, with the actual event WebContents. */
  consumeRestoration(item, webContents) {
    const pending = this.#restoreCall;
    if (!pending || pending.consumed || webContents != null || !sameRestore(item, pending.metadata)) return null;
    pending.consumed = true;
    this.#restoreAttachments.set(item, pending);
    return { id: pending.record.id, savePath: pending.record.path, sourceUrl: pending.record.url,
      urlChain: [...pending.record.urlChain], filename: pending.record.filename,
      browserTabId: pending.record.browserTabId, conversationId: pending.record.conversationId,
      userInitiated: pending.record.userInitiated, restorationToken: pending.nonce, restored: true };
  }

  #restore(record) {
    if (this.#live.has(record.id)) return this.#live.get(record.id);
    const metadata = resumeMetadata(record);
    if (!metadata || typeof this.options.browserSession?.createInterruptedDownload !== 'function') return null;
    if (this.#restoreCall) throw fail('Another native restoration is active', 'DOWNLOAD_BUSY');
    const pending = { nonce: randomUUID(), record, metadata, consumed: false, item: null };
    this.#restoreCall = pending;
    try {
      this.options.browserSession.createInterruptedDownload(metadata);
      if (!pending.item) throw fail('The provider did not attach the issued native restoration', 'DOWNLOAD_RESTORE_NOT_ATTACHED');
      return this.#live.get(record.id);
    } finally { this.#restoreCall = undefined; }
  }

  #event(binding, state, done) {
    if (this.#live.get(binding.id) !== binding) return;
    try {
      if (!STATES.has(state)) throw fail('Invalid DownloadItem event state', 'INVALID_NATIVE_RESULT');
      if (done) binding.ended = true;
      this.#refresh(binding, done, true);
      if (binding.record.nativeState !== state) throw fail('DownloadItem event disagrees with native readback', 'INVALID_NATIVE_RESULT');
      if (done && state !== 'interrupted') this.#detach(binding);
      if (done && state === 'interrupted') this.#notify(this.#activeListener);
      this.#changed();
    } catch (error) { this.#itemFailure(binding, error); }
  }

  #refresh(binding, done = false, observedEvent = false) {
    const native = nativeRead(binding.item, binding.record.path), record = binding.record;
    const captureIdentity = observedEvent || done || native.state === 'progressing' && !native.paused
      || native.receivedBytes !== binding.native.receivedBytes || native.state !== binding.native.state
      || native.paused !== binding.native.paused;
    if (native.state === 'progressing') {
      if (binding.dormant) { binding.dormant = false; this.#notify(this.#activeListener); }
      binding.ended = false;
    }
    const previous = record.status;
    const next = { url: native.url, urlChain: native.urlChain, filename: native.filename, path: native.path,
      receivedBytes: native.receivedBytes, totalBytes: native.totalBytes, mimeType: native.mimeType,
      lastModified: native.lastModified, eTag: native.eTag, nativeState: native.state,
      paused: native.paused, resumable: native.resumable,
      status: binding.ended && native.state === 'interrupted' ? 'failed'
        : !done && !observedEvent && record.status === 'started' && native.state === 'progressing' && !native.paused
          ? 'started' : status(native.state, native.paused, native.resumable),
      fileIdentity: binding.dormant ? binding.resumeIdentity
        : captureIdentity ? fingerprint(native.path) : record.fileIdentity,
      interruptedByRestart: binding.dormant && record.interruptedByRestart === true };
    const changed = Object.keys(next).some(key => JSON.stringify(next[key]) !== JSON.stringify(record[key]));
    Object.assign(record, next);
    if (changed || done) record.updatedAtMs = Date.now();
    if (done) record.endedAtMs = record.updatedAtMs;
    else if (native.state === 'progressing') record.endedAtMs = 0;
    binding.native = native;
    this.#transition(record, previous);
    return changed || done;
  }

  #detach(binding, retain = false) {
    for (const [name, callback] of binding.listeners) binding.item.removeListener(name, callback);
    this.#live.delete(binding.id);
    // Electron's wrapper destructor calls native Remove(). A dormant restored
    // partial file must not be deleted merely because its history was cleared.
    if (retain) this.#retiredItems.add(binding.item);
    this.#notify(this.#activeListener);
  }

  #transition(record, previousStatus) {
    if (previousStatus === record.status) return;
    if (['complete', 'failed'].includes(record.status)) {
      this.#unacknowledged.add(record.id);
      while (this.#unacknowledged.size > SNAPSHOT_LIMIT) this.#unacknowledged.delete(this.#unacknowledged.values().next().value);
    }
    this.#sequence += 1;
    this.#notify(this.#lifecycleListener, { id: record.id, browserTabId: record.browserTabId, conversationId: record.conversationId,
      filename: record.filename, occurredAtMs: record.updatedAtMs, previousStatus,
      sequence: this.#sequence, status: record.status, userInitiated: record.userInitiated });
  }

  #public(record) {
    const live = this.#live.get(record.id), native = live?.native;
    const identity = fingerprint(record.path), matchesFile = sameFile(record.fileIdentity, identity);
    const interrupted = native?.state === 'interrupted';
    return { id: record.id, idSource: 'opencu-download-store', source: 'opencu-download-store',
      nativeGuid: false, filename: record.filename, path: record.path,
      url: record.url, receivedBytes: record.receivedBytes, totalBytes: record.totalBytes,
      startedAtMs: record.startedAtMs, updatedAtMs: record.updatedAtMs, status: record.status,
      browserTabId: record.browserTabId, conversationId: record.conversationId, userInitiated: record.userInitiated,
      canCancel: !!live && !['completed', 'cancelled'].includes(native.state),
      canPause: !!live && !live.dormant && native.state === 'progressing' && !native.paused,
      canResume: !!live && native.resumable && (native.paused || native.state === 'interrupted')
        && (interrupted ? matchesFile && resumeMetadata(record) !== null
          && typeof this.options.browserSession?.fetch === 'function' : record.fileIdentity === null || matchesFile),
      fileExists: identity !== null, fileExistsIsCached: false,
      fileIdentityMatches: matchesFile, canOpen: record.status === 'complete' && matchesFile
        && typeof this.options.shell?.openPath === 'function',
      canShowInFolder: identity !== null && matchesFile && typeof this.options.shell?.showItemInFolder === 'function',
      live: !!live && !live.dormant && native.state === 'progressing',
      restoredDormant: live?.dormant === true, interruptedByRestart: record.interruptedByRestart === true,
      nativeUnavailable: record.nativeUnavailable === true,
      resumeValidation: record.resumeValidation ?? 'not-checked',
      resumeValidationAtMs: record.resumeValidationAtMs ?? 0,
      ...(record.resumeFailure ? { resumeFailure: record.resumeFailure } : {}) };
  }

  #ordered() {
    for (const binding of [...this.#live.values()]) {
      try { if (this.#refresh(binding)) this.#changed(); }
      catch (error) {
        this.#itemFailure(binding, error);
      }
    }
    return [...this.#records.values()].sort((first, second) => second.startedAtMs - first.startedAtMs || first.id.localeCompare(second.id));
  }

  #snapshot(records) {
    const downloads = records.map(record => this.#public(record)), ids = new Set(downloads.map(record => record.id));
    return { capturedAtMs: Date.now(), revision: this.#revision, source: 'opencu-download-store',
      idSource: 'opencu-download-store', nativeProvider: false, nativeGuid: false,
      downloads, unacknowledgedIds: [...this.#unacknowledged].filter(id => ids.has(id)) };
  }

  getSnapshot() {
    this.#assertReady();
    const records = this.#ordered(), live = records.filter(record => this.#isActive(this.#live.get(record.id)));
    const terminal = records.filter(record => !this.#isActive(this.#live.get(record.id)))
      .slice(0, Math.max(0, SNAPSHOT_LIMIT - live.length));
    return this.#snapshot([...live, ...terminal].sort((a, b) => b.startedAtMs - a.startedAtMs || a.id.localeCompare(b.id)));
  }

  #search(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['text', 'maxResults', 'offset'].includes(key))) throw fail('Invalid download search options', 'INVALID_ARGUMENT');
    const query = options.text ?? '';
    if (!text(query)) throw fail('Invalid download search text', 'INVALID_ARGUMENT');
    const maximum = count(options.maxResults, 100, 'maxResults'), offset = count(options.offset, 0, 'offset');
    const lower = query.toLowerCase();
    const matches = this.#ordered().filter(record => record.filename.toLowerCase().includes(lower) || record.url.toLowerCase().includes(lower));
    return matches.slice(offset, maximum > 0 ? offset + maximum : undefined);
  }

  searchHistory(options = {}) { this.#assertReady(); return this.#snapshot(this.#search(options)); }

  #historyRow(record) {
    // guid is a legacy field alias for our UUID, never a Chromium GUID.
    return { guid: record.id, nativeGuid: false, url: record.url, filename: record.filename, savePath: record.path,
      receivedBytes: record.receivedBytes, totalBytes: record.totalBytes, startTime: record.startedAtMs / 1000,
      endTime: record.endedAtMs / 1000, state: record.nativeState, nativeState: record.nativeState,
      paused: record.paused === true, resumable: record.resumable === true, ...this.#public(record) };
  }

  getHistory() { this.#assertReady(); return this.#ordered().map(record => this.#historyRow(record)); }

  list(input = {}) {
    this.#assertReady();
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => key !== 'tabId')
      || input.tabId !== undefined && !routeId(input.tabId)) throw fail('Invalid observed download list', 'INVALID_ARGUMENT');
    return this.#ordered().filter(record => this.#live.has(record.id)
      && !this.#live.get(record.id).dormant && (input.tabId === undefined || record.browserTabId === input.tabId))
      .map(record => this.#historyRow(record));
  }

  getSummary() {
    this.#assertReady();
    const records = this.#ordered();
    return { source: 'opencu-download-store', count: records.length,
      activeCount: records.filter(record => this.#isActive(this.#live.get(record.id))).length,
      receivedBytes: records.reduce((sum, record) => sum + record.receivedBytes, 0),
      totalBytes: records.reduce((sum, record) => sum + record.totalBytes, 0) };
  }

  acknowledge(input) {
    this.#assertReady();
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['all', 'ids'].includes(key))
      || input.all === true && input.ids !== undefined
      || input.all !== true && (!Array.isArray(input.ids) || input.ids.length > 10000
        || input.ids.some(id => !downloadId(id)))) throw fail('Invalid acknowledgement IDs', 'INVALID_ARGUMENT');
    let changed = false;
    if (input.all === true) { changed = this.#unacknowledged.size > 0; this.#unacknowledged.clear(); }
    else for (const id of input.ids) changed = this.#unacknowledged.delete(id) || changed;
    if (changed) this.#changed();
    return { ok: true, source: 'opencu-download-store' };
  }

  async #authorize(action, record, options) {
    options.signal?.throwIfAborted();
    const approved = this.options.authorizeAction
      ? await this.options.authorizeAction({ action, id: record?.id, path: record?.path }, options)
      : options.trustedUserAction === true;
    options.signal?.throwIfAborted();
    if (approved !== true) throw fail('Download action requires a trusted user decision', 'DOWNLOAD_USER_ACTION_REQUIRED');
    this.#assertReady();
  }

  #operation(task) {
    this.#assertReady();
    const operation = this.#operationQueue.then(() => { this.#assertReady(); return task(); });
    this.#operationQueue = operation.then(() => undefined, () => undefined);
    this.#jobs.add(operation);
    void operation.then(() => this.#jobs.delete(operation), () => this.#jobs.delete(operation));
    return operation;
  }

  async #validateResume(binding, options) {
    const record = binding.record, metadata = resumeMetadata(record);
    if (!metadata) return { ok: false, reason: 'download-file-changed-or-missing' };
    if (typeof this.options.browserSession?.fetch !== 'function')
      return { ok: false, reason: 'download-server-validation-unavailable' };
    const identity = clone(record.fileIdentity);
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason ?? fail('Download resume was canceled', 'ABORTED'));
    const timer = setTimeout(() => controller.abort(fail('Download server validation timed out', 'DOWNLOAD_RESUME_TIMEOUT')), RESUME_PROBE_TIMEOUT_MS);
    timer.unref?.();
    this.#resumeControllers.add(controller);
    options.signal?.addEventListener('abort', abort, { once: true });
    let response, reader, result;
    try {
      options.signal?.throwIfAborted();
      // redirect:error fixes the endpoint; Electron's Response.url is not reliable.
      // This is a bounded probe through the owned session, not a second downloader.
      response = await this.options.browserSession.fetch(metadata.urlChain.at(-1), {
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
        headers: { Range: `bytes=${metadata.offset}-${metadata.offset}`, 'If-Range': resumeValidator(record),
          'Accept-Encoding': 'identity' },
        signal: controller.signal, bypassCustomProtocolHandlers: true,
      });
      if (!response || typeof response.headers?.get !== 'function')
        throw fail('Invalid download range validation response', 'INVALID_NATIVE_RESULT');
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(response.headers.get('content-range') ?? '');
      const encoding = response.headers.get('content-encoding');
      const length = response.headers.get('content-length');
      if (response.status !== 206 || !range || Number(range[1]) !== metadata.offset
        || Number(range[2]) !== metadata.offset || Number(range[3]) !== metadata.length
        || length !== null && length !== '1' || encoding !== null && encoding.toLowerCase() !== 'identity') {
        result = { ok: false, reason: 'download-server-range-mismatch' };
      } else if (record.eTag && response.headers.get('etag') !== record.eTag
        || record.lastModified && response.headers.get('last-modified') !== record.lastModified) {
        result = { ok: false, reason: 'download-server-validator-mismatch' };
      } else if (typeof response.body?.getReader !== 'function') {
        result = { ok: false, reason: 'download-server-response-invalid' };
      } else {
        reader = response.body.getReader();
        let received = 0;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value?.byteLength ?? 0;
          if (received > 1) break;
        }
        result = received === 1 ? { ok: true } : { ok: false, reason: 'download-server-response-invalid' };
      }
      this.#assertReady();
      options.signal?.throwIfAborted();
      if (this.#live.get(record.id) !== binding || this.#records.get(record.id) !== record)
        throw fail('The download changed during resume validation', 'STALE_DOWNLOAD');
      if (record.path !== metadata.path || record.receivedBytes !== metadata.offset
        || record.totalBytes !== metadata.length || record.eTag !== metadata.eTag
        || record.lastModified !== metadata.lastModified
        || !sameFile(identity, fingerprint(record.path)))
        result = { ok: false, reason: 'download-file-changed-or-missing' };
    } catch (error) {
      options.signal?.throwIfAborted();
      this.#assertReady();
      if (error.code === 'STALE_DOWNLOAD') throw error;
      result = { ok: false, reason: error.code === 'DOWNLOAD_RESUME_TIMEOUT'
        || controller.signal.reason?.code === 'DOWNLOAD_RESUME_TIMEOUT'
        ? 'download-server-validation-timed-out' : 'download-server-validation-failed' };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      this.#resumeControllers.delete(controller);
      controller.abort();
      try {
        const cancellation = reader ? reader.cancel() : response?.body?.cancel();
        void cancellation?.catch(() => undefined);
      } catch { /* Cancel only the probe stream; the DownloadItem owns the actual file. */ }
    }
    record.resumeValidation = result.ok ? 'validated' : 'failed';
    record.resumeValidationAtMs = Date.now();
    if (result.ok) delete record.resumeFailure;
    else record.resumeFailure = result.reason;
    this.#changed();
    return result;
  }

  action(action, input, options = {}) {
    if (!ACTIONS.has(action)) throw fail('Unsupported download action', 'UNSUPPORTED_OPERATION');
    const id = input?.id ?? input?.guid;
    if (!downloadId(id) || input?.id !== undefined && input?.guid !== undefined && input.id !== input.guid)
      throw fail('A stored plugin download UUID is required', 'INVALID_ARGUMENT');
    return this.#operation(async () => {
      let record = this.#records.get(id);
      if (!record) return missing();
      const identity = fingerprint(record.path);
      await this.#authorize(action, record, options);
      if (this.#records.get(id) !== record) return missing();
      let binding = this.#live.get(id);
      if (action === 'resume' && !binding) {
        if (!resumeMetadata(record)) return { ok: false, reason: 'download-not-resumable' };
        try { binding = this.#restore(record); }
        catch (error) {
          record.resumeFailure = text(error.code, 256) ? error.code : 'DOWNLOAD_RESTORE_FAILED';
          this.#changed(); await this.flush();
          return { ok: false, reason: 'download-restoration-failed' };
        }
      }
      if (binding) record = binding.record;
      if (['pause', 'resume', 'cancel'].includes(action)) {
        if (!binding) return { ok: false, reason: `download-not-${action === 'pause' ? 'pausable' : action === 'resume' ? 'resumable' : 'cancelable'}` };
        if (this.#refresh(binding)) this.#changed();
        if (action === 'pause' && (binding.dormant || binding.native.state !== 'progressing' || binding.native.paused))
          return { ok: false, reason: 'download-not-pausable' };
        if (action === 'resume' && (!binding.native.resumable || (!binding.native.paused && binding.native.state !== 'interrupted')))
          return { ok: false, reason: 'download-not-resumable' };
        if (action === 'resume' && binding.native.state === 'progressing' && record.fileIdentity !== null
          && !sameFile(record.fileIdentity, fingerprint(record.path)))
          return { ok: false, reason: 'download-file-changed-or-missing' };
        if (action === 'resume' && binding.native.state === 'interrupted') {
          const validation = await this.#validateResume(binding, options);
          if (!validation.ok) { await this.flush(); return validation; }
          if (this.#refresh(binding)) this.#changed();
          if (!binding.native.resumable || binding.native.state !== 'interrupted')
            return { ok: false, reason: 'download-not-resumable' };
        }
        if (action === 'cancel' && ['completed', 'cancelled'].includes(binding.native.state))
          return { ok: false, reason: 'download-not-cancelable' };
        options.signal?.throwIfAborted();
        binding.item[action]();
        if (this.#live.get(id) === binding) this.#refresh(binding);
        this.#changed();
        await this.flush();
        return { ok: true, source: 'opencu-download-store', download: this.#public(record) };
      }
      if (action === 'removeFromHistory') {
        if (binding && this.#refresh(binding)) this.#changed();
        if (this.#isActive(binding)) return { ok: false, reason: 'download-not-removable' };
        if (binding) this.#detach(binding, true);
        this.#records.delete(id);
        this.#unacknowledged.delete(id);
        this.#changed();
        await this.flush();
        return { ok: true, accepted: true, committed: true, source: 'opencu-download-store', filesDeleted: false };
      }
      if (action === 'open' && record.status !== 'complete') return { ok: false, reason: 'download-not-complete' };
      if (!sameFile(record.fileIdentity, identity) || !sameFile(identity, fingerprint(record.path)))
        return { ok: false, reason: 'download-file-changed-or-missing' };
      if (action === 'open' ? typeof this.options.shell?.openPath !== 'function'
        : typeof this.options.shell?.showItemInFolder !== 'function') throw fail('Native file shell is unavailable');
      options.signal?.throwIfAborted();
      if (action === 'open') {
        const message = await this.options.shell.openPath(record.path);
        if (typeof message !== 'string') throw fail('Invalid native shell result', 'INVALID_NATIVE_RESULT');
        if (message) return { ok: false, reason: 'open-failed', message };
      } else {
        try { this.options.shell.showItemInFolder(record.path); }
        catch { return { ok: false, reason: 'show-in-folder-failed' }; }
      }
      this.#assertReady();
      this.acknowledge({ ids: [id] });
      await this.flush();
      return { ok: true, source: 'opencu-download-store' };
    });
  }

  clearHistory(options = {}) {
    return this.#operation(async () => {
      await this.#authorize('clearHistory', null, options);
      this.#ordered();
      let removedCount = 0, retainedActiveCount = 0;
      for (const id of this.#records.keys()) {
        const binding = this.#live.get(id);
        if (this.#isActive(binding)) { retainedActiveCount += 1; continue; }
        if (binding) this.#detach(binding, true);
        this.#records.delete(id);
        this.#unacknowledged.delete(id);
        removedCount += 1;
      }
      if (removedCount) this.#changed();
      await this.flush();
      return { ok: true, accepted: true, committed: true, source: 'opencu-download-store',
        filesDeleted: false, removedCount, retainedActiveCount };
    });
  }

  showDownloadsFolder(options = {}) {
    return this.#operation(async () => {
      await this.#authorize('showDownloadsFolder', null, options);
      const path = this.options.getDownloadDirectory?.() ?? this.options.downloadDirectory;
      if (!text(path, 32768) || !isAbsolute(path) || typeof this.options.shell?.openPath !== 'function')
        throw fail('The owned downloads directory is unavailable');
      const message = await this.options.shell.openPath(path);
      this.#assertReady();
      if (typeof message !== 'string') throw fail('Invalid native shell result', 'INVALID_NATIVE_RESULT');
      return message ? { ok: false, reason: 'open-failed', message } : { ok: true, source: 'opencu-download-store' };
    });
  }

  async handle(method, input = {}, options = {}) {
    options.signal?.throwIfAborted();
    if (method === 'downloads.getCapabilities') return this.getCapabilities();
    if (method === 'downloads.getHistory') return this.getHistory();
    if (method === 'downloads.searchHistory') { this.#assertReady(); return this.#search(input.options ?? input).map(record => this.#historyRow(record)); }
    if (method === 'downloads.list') return this.list(input);
    if (['downloads.getSnapshot', 'profile.downloads.getSnapshot'].includes(method)) return this.getSnapshot();
    if (method === 'profile.downloads.searchHistory') return this.searchHistory(input.options ?? input);
    if (['downloads.summary', 'profile.downloads.summary'].includes(method)) return this.getSummary();
    if (['downloads.clearHistory', 'profile.downloads.clearHistory'].includes(method)) return this.clearHistory(options);
    if (['downloads.showDownloadsFolder', 'profile.downloads.showDownloadsFolder'].includes(method)) return this.showDownloadsFolder(options);
    if (['downloads.acknowledge', 'profile.downloads.acknowledge'].includes(method)) { const result = this.acknowledge(input); await this.flush(); return result; }
    if (method === 'downloads.action') return this.action(input.action, input, options);
    const match = /^(?:profile\.)?downloads\.(pause|resume|cancel|removeFromHistory|open|showInFolder|reveal)$/u.exec(method);
    if (!match) throw fail('Unsupported downloads method', 'UNSUPPORTED_OPERATION');
    return this.action(match[1], input, options);
  }

  #isActive(binding) { return !!binding && !binding.dormant && binding.native.state === 'progressing'; }
  getRestartBlockers() {
    this.#assertReady(); this.#ordered();
    return [...this.#live.values()].some(binding => this.#isActive(binding)) ? ['download.active'] : [];
  }
  hasActiveDownloadForRoute(route) {
    this.#assertReady(); this.#ordered();
    return [...this.#live.values()].some(binding => this.#isActive(binding)
      && binding.record.browserTabId === route?.browserTabId && binding.record.conversationId === route?.conversationId);
  }
  reassignActiveDownloadRoute(from, to) {
    this.#assertReady();
    if (!to || !routeId(to.browserTabId) || !(to.conversationId === null || scalarId(to.conversationId)))
      throw fail('Invalid download route', 'INVALID_ARGUMENT');
    this.#ordered();
    let changed = false;
    for (const binding of this.#live.values()) {
      if (!this.#isActive(binding) || binding.record.browserTabId !== from?.browserTabId
        || binding.record.conversationId !== from?.conversationId) continue;
      binding.record.browserTabId = to.browserTabId;
      binding.record.conversationId = to.conversationId;
      changed = true;
    }
    if (changed) { this.#changed(); this.#notify(this.#activeListener); }
  }
  setChangeListener(listener) { this.#changeListener = listener; }
  setLifecycleEventListener(listener) { this.#lifecycleListener = listener; }
  setActiveDownloadChangeListener(listener) { this.#activeListener = listener; }

  #notify(listener, ...args) {
    try { listener?.(...args); }
    catch { /* A listener cannot change the download or durable-write result. */ }
  }

  #emitItemError(error) {
    this.#notify(this.options.onEvent, 'download-store-error', {
      message: 'An Electron download could not be attached or read', code: error.code ?? 'DOWNLOAD_ITEM_UNAVAILABLE' });
  }

  #itemFailure(binding, error) {
    binding.record.nativeUnavailable = true;
    this.#detach(binding, true);
    this.#changed();
    this.#emitItemError(error);
  }

  #changed() {
    this.#revision += 1;
    this.#notify(this.#changeListener);
    this.#notify(this.options.onEvent, 'download-history-changed', { revision: this.#revision });
    if (!this.#writeTimer) {
      this.#writeTimer = setTimeout(() => {
        this.#writeTimer = undefined;
        void this.#persist().catch(error => this.#storeFailure(error));
      }, 50);
      this.#writeTimer.unref?.();
    }
  }

  #storeFailure(error) {
    this.#storageError = error;
    try { this.options.onEvent?.('download-store-error', { message: error.message, code: error.code ?? 'DOWNLOAD_STORE_UNAVAILABLE' }); }
    catch { /* An event sink cannot turn failed persistence into success. */ }
  }

  async #acquireLock() {
    const token = randomUUID();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const file = await open(this.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { await file.writeFile(JSON.stringify({ pid: process.pid, token })); await file.sync(); }
        finally { await file.close(); }
        this.#lock = token;
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let owner, observed;
        try {
          const existing = await open(this.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            observed = await existing.stat();
            if (!observed.isFile() || observed.size > 4096) throw fail('Downloads store lock is invalid');
            owner = JSON.parse(await existing.readFile('utf8'));
          } finally { await existing.close(); }
        } catch (readError) { if (readError.code === 'ENOENT') continue; throw readError; }
        if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || !scalarId(owner.token)) throw fail('Downloads store lock owner is invalid');
        try { process.kill(owner.pid, 0); throw fail('Downloads store is owned by a live process', 'DOWNLOAD_STORE_BUSY'); }
        catch (alive) { if (alive.code !== 'ESRCH') throw alive; }
        const stale = `${this.lockPath}.stale.${token}`;
        try { await rename(this.lockPath, stale); } catch (moveError) { if (moveError.code === 'ENOENT') continue; throw moveError; }
        const moved = await lstat(stale);
        if (moved.dev !== observed.dev || moved.ino !== observed.ino) {
          try { await link(stale, this.lockPath); } catch (restoreError) { if (restoreError.code !== 'EEXIST') throw restoreError; }
          throw fail('Downloads store ownership changed during stale-lock recovery', 'DOWNLOAD_STORE_BUSY');
        }
        await unlink(stale);
      }
    }
    throw fail('Downloads store lock could not be acquired', 'DOWNLOAD_STORE_BUSY');
  }

  async #checkLock() {
    const file = await open(this.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 4096) throw fail('Downloads store ownership is invalid');
      const owner = JSON.parse(await file.readFile('utf8'));
      if (owner.pid !== process.pid || owner.token !== this.#lock) throw fail('Downloads store ownership was lost', 'DOWNLOAD_STORE_BUSY');
    } finally { await file.close(); }
  }

  #persist() {
    const task = this.#writeQueue.then(async () => {
      if (this.#storageError) throw this.#storageError;
      if (this.#persistedRevision === this.#revision) return;
      await this.#checkLock();
      const revision = this.#revision;
      const data = JSON.stringify({ schema: SCHEMA, lifecycleSequence: this.#sequence,
        downloads: [...this.#records.values()].map(clone), unacknowledgedIds: [...this.#unacknowledged] });
      if (Buffer.byteLength(data) > MAX_FILE_BYTES) throw fail('Downloads history exceeded its storage bound');
      const path = `${this.path}.write.${this.#lock}`;
      let file;
      let created = false;
      try {
        file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        await file.writeFile(data);
        await file.sync();
        await file.close(); file = undefined;
        await this.#checkLock();
        await rename(path, this.path);
        let directory;
        try { directory = await open(this.directory, constants.O_RDONLY); await directory.sync(); }
        catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error; }
        finally { await directory?.close(); }
        this.#persistedRevision = revision;
      } finally {
        if (file) await file.close();
        if (created) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    });
    this.#writeQueue = task.catch(error => { this.#storeFailure(error); });
    return task;
  }

  async flush() {
    if (this.#writeTimer) { clearTimeout(this.#writeTimer); this.#writeTimer = undefined; }
    await this.#writeQueue;
    if (this.#storageError) throw this.#storageError;
    while (this.#persistedRevision !== this.#revision) await this.#persist();
  }

  async #releaseLock() {
    if (!this.#lock) return;
    try { await this.#checkLock(); await unlink(this.lockPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    this.#lock = undefined;
  }

  dispose() {
    if (!this.#disposal) this.#disposal = this.#dispose();
    return this.#disposal;
  }

  async #dispose() {
    this.#closing = true;
    for (const controller of this.#resumeControllers) controller.abort(fail('Download store is closing', 'ABORTED'));
    if (this.#initialization) await this.#initialization.catch(() => undefined);
    await Promise.allSettled([...this.#jobs]);
    // The provider must await actual cancellation/done before disposal. No
    // terminal outcome is invented here or during abrupt process exit.
    for (const binding of [...this.#live.values()]) {
      try { this.#refresh(binding); } catch { binding.record.interruptedByRestart = true; }
      this.#detach(binding, binding.dormant || binding.native.state === 'interrupted');
    }
    this.#revision += 1;
    try { if (this.#loaded) await this.flush(); }
    finally {
      try { await this.#releaseLock(); }
      finally {
        if (OWNERS.get(this.directory) === this) OWNERS.delete(this.directory);
        this.#loaded = false;
        this.#changeListener = this.#lifecycleListener = this.#activeListener = undefined;
      }
    }
  }
}
