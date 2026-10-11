import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { importFailure, sourceIdentity, assertSourceIdentity, assertSourceIdentitiesSync, captureProfileSource, requireClosedProfile,
  readSourceJson, clearImportRecords, assertImportSignal } from './import-source.mjs';
import { SelectedProfileDecryption, sourceDecryptionCapabilities } from './import-decryption.mjs';
import { importCategory, readProfileCookies, readProfilePasswords, readProfileHistory } from './import-profile-data.mjs';
import { passwordImportAvailable, importCredentialRows } from './import-credentials.mjs';

const scope = 'opencu-owned-browser';
const mode = 'plugin-managed';
const methods = new Set(['nativeProfileImport.getSignals', 'nativeProfileImport.list', 'nativeProfileImport.grantSelection', 'nativeProfileImport.import', 'nativeProfileImport.cancel']);
const object = input => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID'); return input; };
const safeErrorCode = error => typeof error?.code === 'string' && /^(?:SOURCE_|PROFILE_|PASSWORD_|HISTORY_)[A-Z0-9_]+$/u.test(error.code) ? error.code
  : error?.code === 'ABORTED' || error?.name === 'AbortError' ? 'SOURCE_IMPORT_CANCELED' : 'SOURCE_IMPORT_FAILED';
const publicProfile = profile => Object.fromEntries(['id', 'source', 'appName', 'profileName', 'profileDirectoryName', 'profilePath', 'rootPath', 'hasCookies', 'hasPasswords', 'hasHistory'].map(key => [key, profile[key]]));
const categoryList = result => [result.cookies, result.passwords?.profile, result.passwords?.account, result.history].filter(Boolean);
const contains = (parent, child) => { const path = relative(parent, child); return path === '' || !path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path); };

function defaultSourceRoots() {
  if (process.platform === 'darwin') {
    const applicationData = join(homedir(), 'Library', 'Application Support');
    const roots = [{ source: 'chrome', path: join(applicationData, 'Google', 'Chrome'), appName: 'Google Chrome' }];
    for (const [id, appName] of [['com.openai.atlas', 'Atlas'], ['com.openai.atlas.alpha', 'Atlas Alpha'], ['com.openai.atlas.beta', 'Atlas Beta'], ['com.openai.atlas.mac-debug', 'Atlas Debug']]) {
      roots.push({ source: 'atlas', path: join(applicationData, id, 'browser-data', 'host'), appName },
        { source: 'atlas', path: join(applicationData, id, 'web'), appName: appName + ' Legacy' });
    }
    return roots;
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return [{ source: 'chrome', path: join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'), appName: 'Google Chrome' }];
  return [];
}

function finalizeCategory(category, canceled) {
  if (category.status === 'not-requested') return;
  if (canceled) category.status = 'canceled';
  else if (category.status !== 'missing') category.status = category.error || category.failed || category.remaining ? category.imported > 0 ? 'partial-success' : 'failed' : 'success';
}

export class PluginManagedProfileImporter {
  #session; #history; #passwords; #directory; #roots; #sources = new Map(); #selections = new Map(); #terminals = new Map();
  #closed = false; #disposed; #active; #metadata = new Set(); #lifetime = new AbortController(); #listing = false; #cleanupFailure;
  constructor({ browserSession, history, passwordStore, storageDirectory, chooseSource } = {}) {
    this.#session = browserSession; this.#history = history; this.#passwords = passwordStore;
    this.#directory = storageDirectory; this.#roots = defaultSourceRoots();
  }
  capabilities() {
    const history = this.#history?.getCapabilities?.();
    const accepting = !this.#closed && !this.#cleanupFailure;
    const types = { history: accepting && history?.persistentReady === true && typeof this.#history?.importVisits === 'function',
      cookies: accepting && ['get', 'set', 'flushStore'].every(method => typeof this.#session?.cookies?.[method] === 'function'),
      passwords: accepting && passwordImportAvailable(this.#passwords), extensions: false };
    const available = accepting && typeof this.#directory === 'string' && isAbsolute(this.#directory) && Object.values(types).some(Boolean);
    return { scope, mode, provider: 'opencu-profile-import', nativeProvider: false, available, persistentReady: available,
      supportedDataTypes: types, sources: [...new Set(this.#roots.map(root => root.source))], historyImportMode: 'opencu-history-transaction',
      atlasRootRequiresNativeRegistration: process.platform !== 'darwin', sourceDecryption: sourceDecryptionCapabilities(),
      elevatedChromeDecryption: { platform: process.platform, explicitConsentRequired: true, available: false, requiresOriginalBrowserIdentity: process.platform === 'win32' },
      requiresClosedSqliteSource: true, credentialFields: ['origin', 'username', 'password'], partitionedCookieImport: false,
      unsupportedCredentialKinds: ['blocked', 'federated', 'http-auth', 'android'],
      ...(available ? {} : { error: this.#cleanupFailure ? 'SOURCE_SNAPSHOT_CLEANUP_FAILED' : 'PROFILE_NATIVE_IMPORT_UNAVAILABLE' }) };
  }
  #assert(signal) {
    if (this.#closed) throw importFailure('PROFILE_IMPORT_CLOSED'); assertImportSignal(signal);
  }
  #permit(id) {
    const permit = this.#selections.get(id);
    if (!permit) throw importFailure('PROFILE_IMPORT_SELECTION_REQUIRED');
    if (Date.now() >= permit.expiresAt) { this.#selections.delete(id); throw importFailure('PROFILE_IMPORT_SELECTION_EXPIRED'); }
    return permit;
  }
  #assertPermit(permit) {
    this.#assert(permit.signal);
    if (this.#cleanupFailure) throw importFailure('SOURCE_SNAPSHOT_CLEANUP_FAILED');
    if (Date.now() >= permit.expiresAt) throw importFailure('SOURCE_SELECTION_EXPIRED');
    assertSourceIdentitiesSync(permit.identities); requireClosedProfile(permit.identities);
  }
  async #list(signal) {
    if (this.#listing || this.#active || this.#metadata.size) throw importFailure('PROFILE_IMPORT_BUSY');
    this.#listing = true;
    try {
      const sources = new Map(), errors = [];
      for (const root of this.#roots) {
        this.#assert(signal);
        try {
          const rootIdentity = await sourceIdentity(root.path, { optional: true, directory: true });
          if (!rootIdentity.exists) continue;
          const stateIdentity = await sourceIdentity(join(root.path, 'Local State'), { maxBytes: 16777216 });
          const state = await readSourceJson(stateIdentity, { signal });
          const profiles = state.value?.profile?.info_cache;
          if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) throw importFailure('SOURCE_METADATA_INVALID');
          // Do not retain Local State's key material with the public inventory.
          if (state.value.os_crypt) state.value.os_crypt = undefined;
          for (const [directory, metadata] of Object.entries(profiles)) {
            this.#assert(signal);
            if (sources.size >= 256) throw importFailure('SOURCE_PROFILE_LIMIT');
            if (!directory || ['.', '..'].includes(directory) || /[/\\\x00-\x1f]/u.test(directory) || !metadata || typeof metadata !== 'object') continue;
            const profilePath = join(root.path, directory), profileIdentity = await sourceIdentity(profilePath, { optional: true, directory: true });
            if (!profileIdentity.exists || !contains(root.path, profilePath) || profilePath === root.path) continue;
            const exists = async name => (await sourceIdentity(join(profilePath, name), { optional: true })).exists;
            const previous = [...this.#sources.values()].find(profile => profile.source === root.source && profile.profilePath === profilePath);
            const profile = { id: previous?.id ?? randomUUID(), source: root.source, appName: root.appName,
              profileName: typeof metadata.name === 'string' && metadata.name.length <= 1024 ? metadata.name : directory,
              profileDirectoryName: directory, profilePath, rootPath: root.path,
              hasCookies: await exists('Network/Cookies') || await exists('Cookies'),
              hasPasswords: await exists('Login Data') || await exists('Login Data For Account'), hasHistory: await exists('History'),
              listedIdentities: [rootIdentity, stateIdentity, profileIdentity] };
            sources.set(profile.id, profile);
          }
          await assertSourceIdentity(rootIdentity); await assertSourceIdentity(stateIdentity);
        } catch (error) {
          if (signal.aborted) throw error;
          errors.push({ source: root.source, appName: root.appName, error: safeErrorCode(error) });
        }
      }
      this.#assert(signal); this.#sources = sources;
      return { ...this.capabilities(), profiles: [...sources.values()].map(publicProfile), ...(errors.length ? { sourceErrors: errors } : {}) };
    } finally { this.#listing = false; }
  }
  async #grant(input, signal) {
    if (this.#active || this.#listing || this.#metadata.size) throw importFailure('PROFILE_IMPORT_BUSY');
    if (Object.keys(input).some(key => !['sourceId', 'importCookies', 'importPasswords', 'importHistory', 'allowElevatedChromeDecryption', 'cookieDomainAllowlist'].includes(key))
      || typeof input.sourceId !== 'string' || input.sourceId.length > 256 || !input.sourceId
      || ['importCookies', 'importPasswords', 'importHistory'].some(key => typeof input[key] !== 'boolean')
      || !input.importCookies && !input.importPasswords && !input.importHistory
      || input.allowElevatedChromeDecryption !== undefined && typeof input.allowElevatedChromeDecryption !== 'boolean') throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
    const profile = this.#sources.get(input.sourceId);
    if (!profile) throw importFailure('PROFILE_IMPORT_SELECTION_REQUIRED');
    if (input.allowElevatedChromeDecryption) throw importFailure('SOURCE_ELEVATED_IMPORT_UNAVAILABLE');
    const options = { ...input, allowElevatedChromeDecryption: false, cookieDomainAllowlist: [] };
    if (input.cookieDomainAllowlist !== undefined) {
      if (!input.importCookies || !Array.isArray(input.cookieDomainAllowlist) || input.cookieDomainAllowlist.length > 1000) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
      for (const domain of input.cookieDomainAllowlist) {
        if (typeof domain !== 'string' || !domain || domain.length > 253 || domain.startsWith('.') || /[\s/\\:@\x00-\x1f]/u.test(domain)) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
        let host; try { host = new URL('https://' + domain + '/').hostname; } catch { throw importFailure('PROFILE_NATIVE_IMPORT_INVALID'); }
        if (host !== domain.toLowerCase()) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
        options.cookieDomainAllowlist.push(host);
      }
      options.cookieDomainAllowlist = [...new Set(options.cookieDomainAllowlist)];
    }
    const capabilities = this.capabilities();
    for (const [type, key] of [['history', 'importHistory'], ['cookies', 'importCookies'], ['passwords', 'importPasswords']])
      if (input[key] && !capabilities.supportedDataTypes[type]) throw importFailure('PROFILE_NATIVE_IMPORT_UNAVAILABLE');
    if (contains(profile.profilePath, this.#directory) || contains(this.#directory, profile.profilePath)) throw importFailure('SOURCE_DESTINATION_OVERLAP');
    assertSourceIdentitiesSync(profile.listedIdentities);
    const captured = await captureProfileSource(profile, options); this.#assert(signal); assertSourceIdentitiesSync(profile.listedIdentities);
    requireClosedProfile(captured.identities);
    for (const id of this.#selections.keys()) this.#remember(this.#canceled(this.#selections.get(id)));
    const id = randomUUID(), permit = { id, profile, options, ...captured, expiresAt: Date.now() + 300000 };
    this.#selections.set(id, permit);
    return { ...this.capabilities(), selectionId: id, expiresAt: permit.expiresAt, profile: publicProfile(profile) };
  }
  #envelope(permit) { return { scope, mode, source: permit.profile.source, profilePath: permit.profile.profilePath, selectionId: permit.id }; }
  #canceled(permit) { return { ...this.#envelope(permit), status: 'canceled', canceled: true }; }
  #remember(receipt) {
    this.#selections.delete(receipt.selectionId); this.#terminals.set(receipt.selectionId, receipt);
    if (this.#terminals.size > 32) this.#terminals.delete(this.#terminals.keys().next().value);
    return structuredClone(receipt);
  }
  async #cookies(permit, decryptor, category) {
    const records = await readProfileCookies(permit, decryptor, category, this.#directory);
    category.remaining = records.length;
    try {
      if (category.status === 'missing') return;
      this.#assertPermit(permit);
      const existing = await this.#session.cookies.get({});
      const keys = new Set(existing.map(cookie => JSON.stringify([cookie.domain, cookie.path, cookie.name])));
      for (const cookie of existing) cookie.value = '';
      for (const record of records) {
        this.#assertPermit(permit);
        if (keys.has(record.key)) { category.skippedExisting++; category.remaining--; record.value = ''; continue; }
        const { key, ...details } = record;
        try { await this.#session.cookies.set(details); category.imported++; keys.add(key); }
        catch { category.failed++; category.error = 'SOURCE_COOKIE_DESTINATION_REJECTED'; }
        finally { category.remaining--; record.value = ''; details.value = ''; }
      }
    } finally {
      clearImportRecords(records);
      if (category.imported > 0) {
        try { await this.#session.cookies.flushStore(); }
        catch { category.error = 'SOURCE_COOKIE_FLUSH_FAILED'; }
      }
    }
  }
  async #passwordCategory(permit, decryptor, filename, category) {
    const records = await readProfilePasswords(permit, decryptor, filename, category, this.#directory);
    try {
      if (category.status === 'missing') return;
      category.remaining = records.length;
      const progress = value => {
        category.imported = value.added + value.updated; category.skippedExisting = value.unchanged;
        category.remaining = value.remaining;
      };
      try {
        const result = await importCredentialRows(this.#passwords, records, { sourceId: permit.profile.id + (filename === 'Login Data' ? ':profile' : ':account'),
          sourceFingerprint: permit.sourceFingerprint, signal: permit.signal, assertCurrent: () => this.#assertPermit(permit), onProgress: progress });
        progress(result); category.failed += result.failed;
        if (result.failed) category.error = 'SOURCE_PASSWORD_DESTINATION_FAILED';
        if (result.canceled) throw importFailure('ABORTED');
      } catch (error) {
        if (error.importResult) { progress(error.importResult); category.failed += error.importResult.failed; }
        throw error;
      }
    } finally { clearImportRecords(records); }
  }
  async #historyCategory(permit, category) {
    const records = await readProfileHistory(permit, category, this.#directory);
    category.committed = false;
    try {
      if (category.status === 'missing') return;
      category.remaining = records.length; this.#assertPermit(permit);
      const imported = await this.#history.importVisits(records, { source: 'chromium-history-sqlite',
        receipt: { id: permit.id, sourceFingerprint: permit.sourceFingerprint, selectedByUser: true }, signal: permit.signal });
      const counters = ['importedVisits', 'duplicateVisits', 'skippedVisits'];
      if (!imported || !counters.every(key => Number.isSafeInteger(imported[key]) && imported[key] >= 0)
        || counters.reduce((sum, key) => sum + imported[key], 0) + (imported.failed ?? 0) + (imported.remaining ?? 0) !== records.length
        || imported.committed !== true && imported.status !== 'imported') throw importFailure('SOURCE_HISTORY_OUTCOME_UNCONFIRMED');
      category.committed = imported.committed !== false; category.imported = imported.importedVisits;
      category.skippedExisting += imported.duplicateVisits; category.skippedInvalid += imported.skippedVisits;
      category.failed += imported.failed ?? 0; category.remaining = imported.remaining ?? 0;
      if (imported.error) category.error = safeErrorCode(imported.error);
      if (imported.canceled) throw importFailure('ABORTED');
    } finally { records.length = 0; }
  }
  async #run(permit, signal) {
    const controller = new AbortController(); permit.signal = AbortSignal.any([signal, controller.signal]);
    const result = this.#envelope(permit), decryptor = new SelectedProfileDecryption(permit);
    let finish;
    const active = { id: permit.id, controller, done: new Promise(resolve => { finish = resolve; }) };
    this.#active = active; this.#selections.delete(permit.id);
    if (permit.options.importCookies) result.cookies = importCategory('reading');
    if (permit.options.importPasswords) result.passwords = { profile: importCategory('reading'), account: importCategory('reading'), accountStorage: 'opencu-password-store-local' };
    if (permit.options.importHistory) result.history = { ...importCategory('reading'), committed: false };
    const attempt = async (category, work) => {
      try { this.#assertPermit(permit); await work(); }
      catch (error) {
        category.error = safeErrorCode(error);
        if (permit.signal.aborted) controller.abort();
        if (error.code === 'SOURCE_CHANGED' || error.code === 'SOURCE_SELECTION_EXPIRED' || error.code === 'SOURCE_SNAPSHOT_CLEANUP_FAILED') result.error = safeErrorCode(error);
        if (error.code === 'SOURCE_SNAPSHOT_CLEANUP_FAILED') this.#cleanupFailure = error;
      }
    };
    try {
      if (result.cookies) await attempt(result.cookies, () => this.#cookies(permit, decryptor, result.cookies));
      if (result.passwords) {
        await attempt(result.passwords.profile, () => this.#passwordCategory(permit, decryptor, 'Login Data', result.passwords.profile));
        await attempt(result.passwords.account, () => this.#passwordCategory(permit, decryptor, 'Login Data For Account', result.passwords.account));
      }
      if (result.history) await attempt(result.history, () => this.#historyCategory(permit, result.history));
      const canceled = permit.signal.aborted;
      const categories = categoryList(result);
      for (const category of categories) finalizeCategory(category, canceled);
      const failed = Boolean(result.error) || categories.some(category => category.error || category.failed > 0 || category.remaining > 0 || category.status === 'missing');
      const writes = categories.some(category => category.imported > 0 && (category !== result.history || category.committed));
      result.status = canceled ? 'canceled' : failed ? writes ? 'partial-success' : 'failed' : 'completed'; result.canceled = canceled;
      return this.#remember(result);
    } finally { decryptor.dispose(); this.#active = undefined; finish(); }
  }
  async #cancel(id) {
    if (this.#terminals.has(id)) return structuredClone(this.#terminals.get(id));
    if (this.#active?.id === id) {
      const active = this.#active; active.controller.abort(importFailure('ABORTED'));
      await active.done;
      if (!this.#terminals.has(id)) throw importFailure('PROFILE_IMPORT_OUTCOME_UNCONFIRMED');
      return structuredClone(this.#terminals.get(id));
    }
    const permit = this.#selections.get(id);
    if (!permit) throw importFailure('PROFILE_IMPORT_SELECTION_REQUIRED');
    return this.#remember(this.#canceled(permit));
  }
  async handle(method, input = {}, options = {}) {
    try { return await this.#handle(method, input, options); }
    catch (error) { const code = safeErrorCode(error); throw importFailure(code, code); }
  }
  async #handle(method, input = {}, { signal, trustedUserAction = false } = {}) {
    object(input);
    if (!methods.has(method)) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
    if (method !== 'nativeProfileImport.cancel') this.#assert(signal); else assertImportSignal(signal);
    if (this.#cleanupFailure && !['nativeProfileImport.getSignals', 'nativeProfileImport.cancel'].includes(method)) throw importFailure('SOURCE_SNAPSHOT_CLEANUP_FAILED');
    const lifetime = signal ? AbortSignal.any([signal, this.#lifetime.signal]) : this.#lifetime.signal;
    if (method === 'nativeProfileImport.getSignals' || method === 'nativeProfileImport.list') {
      if (Object.keys(input).length) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
      if (method === 'nativeProfileImport.getSignals') return this.capabilities();
      const task = this.#list(lifetime); this.#metadata.add(task);
      try { return await task; } finally { this.#metadata.delete(task); }
    }
    if (trustedUserAction !== true) throw importFailure('PROFILE_IMPORT_USER_ACTION_REQUIRED');
    if (method === 'nativeProfileImport.grantSelection') {
      const task = this.#grant(input, lifetime); this.#metadata.add(task);
      try {
        const value = await task;
        if (lifetime.aborted || this.#closed) { await this.#cancel(value.selectionId); this.#assert(lifetime); }
        return value;
      } finally { this.#metadata.delete(task); }
    }
    if (Object.keys(input).some(key => key !== 'selectionId') || typeof input.selectionId !== 'string' || !input.selectionId || input.selectionId.length > 256) throw importFailure('PROFILE_NATIVE_IMPORT_INVALID');
    if (method === 'nativeProfileImport.cancel') return this.#cancel(input.selectionId);
    if (this.#terminals.has(input.selectionId)) return structuredClone(this.#terminals.get(input.selectionId));
    if (this.#active || this.#listing || this.#metadata.size) throw importFailure('PROFILE_IMPORT_BUSY');
    return this.#run(this.#permit(input.selectionId), lifetime);
  }
  dispose() {
    if (this.#disposed) return this.#disposed;
    this.#closed = true; this.#lifetime.abort(importFailure('ABORTED'));
    this.#disposed = (async () => {
      if (this.#active) { this.#active.controller.abort(); await this.#active.done; }
      await Promise.allSettled([...this.#metadata]);
      this.#sources.clear(); this.#selections.clear(); this.#terminals.clear(); this.#session = undefined; this.#history = undefined; this.#passwords = undefined;
      if (this.#cleanupFailure) throw importFailure('SOURCE_SNAPSHOT_CLEANUP_FAILED');
    })();
    return this.#disposed;
  }
}
