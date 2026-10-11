import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';

const OWNERS = new Map();
const SECURE_LINUX_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const MAX_SELECTIONS = 4096;
const MAX_RECEIPTS = 256;
const RECEIPT_LIFETIME_MS = 5 * 60 * 1000;
const SELECTION_LIFETIME_MS = 5 * 60 * 1000;
const failure = (message = 'Local browser credentials are unavailable', code = 'BROWSER_CREDENTIAL_STORE_UNAVAILABLE') =>
  Object.assign(new Error(message), { code });
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;
const uid = () => process.getuid?.();

function object(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !keys.includes(key))) throw failure('Invalid local credential schema');
  return value;
}
function exactOrigin(value, protocols = ['https:']) {
  if (typeof value !== 'string' || value.length > 2048) throw failure('Invalid credential origin', 'INVALID_ARGUMENT');
  let url;
  try { url = new URL(value); } catch { throw failure('Invalid credential origin', 'INVALID_ARGUMENT'); }
  if (!protocols.includes(url.protocol) || url.username || url.password || url.origin !== value)
    throw failure('Credentials require an exact supported origin', 'INVALID_ARGUMENT');
  return value;
}
function text(value, maximum, empty = false) {
  if (typeof value !== 'string' || !empty && !value.length || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > maximum) throw failure('Invalid credential value', 'INVALID_ARGUMENT');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw failure('Invalid credential identity', 'INVALID_ARGUMENT');
  return value;
}
function boundScope(value, origin) {
  object(value, ['frameOrigin', 'fieldBinding']);
  const frameOrigin = exactOrigin(value.frameOrigin);
  if (typeof value.fieldBinding !== 'string' || Buffer.byteLength(value.fieldBinding, 'utf8') > 32768)
    throw failure('Invalid credential field binding', 'INVALID_ARGUMENT');
  let parsed;
  try { parsed = JSON.parse(value.fieldBinding); } catch { throw failure('Invalid credential field binding', 'INVALID_ARGUMENT'); }
  object(parsed, ['page', 'username', 'password', 'optionId']);
  text(parsed.page, 4096);
  let page;
  try { page = new URL(parsed.page); } catch { throw failure('Invalid credential page binding', 'INVALID_ARGUMENT'); }
  if (page.protocol !== 'https:' || page.username || page.password || page.search || page.hash
    || origin !== undefined && (page.origin !== origin || frameOrigin !== origin)
    || parsed.page !== page.origin + page.pathname) throw failure('Invalid credential page binding', 'INVALID_ARGUMENT');
  for (const name of ['username', 'password']) {
    const field = parsed[name];
    if (name === 'username' && field === null) continue;
    object(field, ['id', 'type', 'autocomplete', 'inputName', 'label']);
    text(field.id, 256); text(field.type, 32); text(field.label, 4096, true);
    if (field.autocomplete !== undefined) text(field.autocomplete, 256, true);
    if (field.inputName !== undefined) text(field.inputName, 2048, true);
    if (name === 'password' && field.type !== 'password') throw failure('Invalid credential password binding', 'INVALID_ARGUMENT');
  }
  if (parsed.optionId !== null && parsed.optionId !== undefined) text(parsed.optionId, 256);
  return { frameOrigin, fieldBinding: value.fieldBinding };
}
const sameScope = (first, second) => first.frameOrigin === second.frameOrigin && first.fieldBinding === second.fieldBinding;
function timestamp(value) {
  if (typeof value !== 'string') throw failure('Invalid credential timestamp');
  try { if (new Date(value).toISOString() === value) return value; } catch {}
  throw failure('Invalid credential timestamp');
}
function privateFile(info, mode, directory = false) {
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)
    || uid() !== undefined && info.uid !== uid()
    || process.platform !== 'win32' && (info.mode & 0o777) !== mode) throw failure('Credential storage is not private');
}
function metadata(record) {
  return { id: record.id, origin: record.origin, username: record.username, updatedAt: record.updatedAt };
}
const accountKey = record => JSON.stringify([record.origin, record.username]);
function wipe(records) {
  for (const record of records ?? []) if (record && typeof record === 'object') { record.password = ''; record.username = ''; }
}
function recordsFrom(value) {
  object(value, ['schema', 'records']);
  if (![1, 2].includes(value.schema) || !Array.isArray(value.records) || value.records.length > MAX_ENTRIES)
    throw failure('Invalid local credential schema');
  const ids = new Set(), accounts = new Set();
  try {
    for (const record of value.records) {
      object(record, value.schema === 1 ? ['id', 'origin', 'username', 'password', 'updatedAt', 'scope']
        : ['id', 'origin', 'username', 'password', 'updatedAt']);
      identifier(record.id); exactOrigin(record.origin, value.schema === 1 ? ['https:'] : ['http:', 'https:']);
      text(record.username, 4096, true);
      text(record.password, 16384); timestamp(record.updatedAt);
      if (value.schema === 1) boundScope(record.scope, record.origin);
      const account = value.schema === 1
        ? JSON.stringify([record.origin, record.scope.frameOrigin, record.scope.fieldBinding, record.username]) : accountKey(record);
      if (ids.has(record.id) || accounts.has(account)) throw failure('Duplicate local credential identity');
      ids.add(record.id); accounts.add(account);
    }
    if (value.schema === 2) return value.records;
    const migrated = new Map();
    for (const record of value.records) {
      const key = accountKey(record), previous = migrated.get(key);
      if (!previous || record.updatedAt > previous.updatedAt) {
        if (previous) wipe([previous]);
        delete record.scope; migrated.set(key, record);
      } else wipe([record]);
    }
    return [...migrated.values()];
  } catch (error) { wipe(value.records); throw error; }
}

// This object stays in the native main process. None of its secret operations are wire methods.
export class PluginBrowserCredentialStore {
  #directory; #path; #safeStorage; #directoryIdentity; #fileIdentity; #encrypted;
  #receipts = new WeakMap(); #activeReceipts = new Set(); #selections = new Map();
  #queue = Promise.resolve(); #initializing; #ready = false; #needsMigration = false;
  #lifetime = new AbortController();
  #closing = false; #disposing; #lock;

  constructor({ directory, safeStorage } = {}) {
    if (!isAbsolute(directory ?? '') || !safeStorage
      || ['isEncryptionAvailable', 'encryptString', 'decryptString'].some(name => typeof safeStorage[name] !== 'function'))
      throw failure('Local credentials require native safeStorage and an absolute private directory', 'INVALID_ARGUMENT');
    this.#directory = resolve(directory); this.#path = join(this.#directory, 'credentials.json');
    this.#safeStorage = safeStorage;
  }

  get available() {
    if (!this.#ready || this.#closing) return false;
    try { this.#secureBackend(); return true; } catch { return false; }
  }
  get capabilities() {
    return Object.freeze({ schemaVersion: 1, version: 1, provider: 'opencu-password-store', nativeProvider: false,
      nativePasswordStore: false, pluginPasswordStore: this.available, available: this.available,
      persistentReady: this.available, encryption: 'electron-safe-storage', originBinding: true,
      fieldBinding: true, oneTimeReceipts: true, maxRecords: MAX_ENTRIES });
  }

  #secureBackend() {
    if (!this.#safeStorage || this.#safeStorage.isEncryptionAvailable() !== true
      || !['darwin', 'win32', 'linux'].includes(process.platform)) throw failure('OS credential encryption is unavailable');
    if (process.platform === 'linux' && (typeof this.#safeStorage.getSelectedStorageBackend !== 'function'
      || !SECURE_LINUX_BACKENDS.has(this.#safeStorage.getSelectedStorageBackend())))
      throw failure('A secure OS password manager is required');
  }
  #assertReady() {
    if (!this.#ready || this.#closing) throw failure('Local credential storage is not ready');
  }
  async #privateDirectory() {
    const root = parse(this.#directory).root;
    let current = root;
    for (const component of this.#directory.slice(root.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      let info;
      try { info = await lstat(current); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        try { await mkdir(current, { mode: 0o700 }); } catch (cause) { if (cause.code !== 'EEXIST') throw cause; }
        info = await lstat(current);
      }
      if (info.isSymbolicLink() || !info.isDirectory()) throw failure('Credential paths cannot contain symbolic links');
    }
    const info = await lstat(this.#directory); privateFile(info, 0o700, true);
    if (await realpath(this.#directory) !== this.#directory) throw failure('Credential directory is not canonical');
    this.#directoryIdentity = info;
  }
  async #assertDirectory() {
    const info = await lstat(this.#directory); privateFile(info, 0o700, true);
    if (!sameFile(info, this.#directoryIdentity) || await realpath(this.#directory) !== this.#directory)
      throw failure('Credential directory identity changed');
  }
  async #acquireLock() {
    const path = join(this.#directory, 'credentials.lock');
    for (let attempt = 0; attempt < 2; attempt++) {
      let handle;
      try {
        handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        const identity = await handle.stat(); this.#lock = { handle, path, identity }; privateFile(identity, 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() })); await handle.sync();
        this.#lock = { handle, path, identity }; return;
      } catch (error) {
        if (handle && this.#lock?.handle === handle) await this.#releaseLock();
        else await handle?.close();
        if (error.code !== 'EEXIST' || attempt) throw error;
        const previous = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        let saved, identity;
        try {
          identity = await previous.stat(); privateFile(identity, 0o600);
          if (identity.size > 4096) throw failure('Invalid credential owner lock');
          saved = object(JSON.parse(await previous.readFile('utf8')), ['pid', 'token']);
        } finally { await previous.close(); }
        if (!Number.isSafeInteger(saved.pid) || saved.pid < 1 || !UUID.test(saved.token ?? '')) throw failure('Invalid credential owner lock');
        try { process.kill(saved.pid, 0); throw failure('Local credentials are already in use', 'BROWSER_CREDENTIAL_STORE_BUSY'); }
        catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
        const current = await lstat(path); privateFile(current, 0o600);
        if (!sameFile(current, identity)) throw failure('Credential owner lock changed');
        await unlink(path);
      }
    }
  }
  async #releaseLock() {
    const lock = this.#lock; this.#lock = undefined;
    if (!lock) return;
    try {
      const current = await lstat(lock.path);
      if (sameFile(current, lock.identity) && !current.isSymbolicLink()) await unlink(lock.path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    finally { await lock.handle.close(); }
  }

  initialize() {
    if (this.#closing) return Promise.reject(failure('Local credentials were disposed'));
    if (this.#ready) return Promise.resolve();
    if (this.#initializing) return this.#initializing;
    this.#initializing = (async () => {
      this.#secureBackend(); await this.#privateDirectory();
      if (OWNERS.has(this.#directory)) throw failure('Local credentials are already owned', 'BROWSER_CREDENTIAL_STORE_BUSY');
      OWNERS.set(this.#directory, this);
      try {
        await this.#acquireLock(); await this.#assertDirectory();
        let handle;
        try {
          try { handle = await open(this.#path, constants.O_RDONLY | constants.O_NOFOLLOW); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (handle) {
          const info = await handle.stat(); privateFile(info, 0o600);
          if (info.size > MAX_FILE_BYTES || !sameFile(info, await lstat(this.#path))) throw failure('Invalid credential storage file');
          const saved = object(JSON.parse(await handle.readFile('utf8')), ['schema', 'encryption', 'payload']);
          if (saved.schema !== 1 || saved.encryption !== 'electron-safe-storage' || typeof saved.payload !== 'string'
            || !saved.payload.length || saved.payload.length > MAX_FILE_BYTES) throw failure('Invalid encrypted credential schema');
          const encrypted = Buffer.from(saved.payload, 'base64');
          if (!encrypted.length || encrypted.toString('base64') !== saved.payload) throw failure('Invalid encrypted credential encoding');
          this.#encrypted = encrypted; this.#fileIdentity = info;
          const records = this.#decrypt(); wipe(records);
          }
        }
        finally { await handle?.close(); }
        if (this.#closing) throw failure('Local credentials were disposed');
        this.#ready = true;
        if (!this.#encrypted || this.#needsMigration) {
          const records = this.#decrypt();
          try { await this.#persist(records); this.#needsMigration = false; } finally { wipe(records); }
        }
      } catch (error) {
        this.#ready = false;
        this.#encrypted?.fill(0); this.#encrypted = undefined; this.#fileIdentity = undefined;
        await this.#releaseLock(); if (OWNERS.get(this.#directory) === this) OWNERS.delete(this.#directory);
        throw error;
      }
    })().finally(() => { this.#initializing = undefined; });
    return this.#initializing;
  }
  #decrypt() {
    this.#secureBackend();
    if (!this.#encrypted) return [];
    let plain;
    try {
      plain = this.#safeStorage.decryptString(this.#encrypted);
      const value = JSON.parse(plain); this.#needsMigration = value.schema === 1;
      return recordsFrom(value);
    }
    catch { throw failure('Encrypted local credentials could not be read'); }
    finally { plain = undefined; }
  }
  #enqueue(operation) {
    this.#assertReady();
    const pending = this.#queue.then(async () => { this.#assertReady(); return operation(); });
    this.#queue = pending.catch(() => {}); return pending;
  }
  async #assertFile() {
    await this.#assertDirectory();
    let current;
    try { current = await lstat(this.#path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!this.#fileIdentity) { if (current) throw failure('Credential storage changed externally'); return; }
    if (!current) throw failure('Credential storage disappeared');
    privateFile(current, 0o600);
    if (!sameFile(current, this.#fileIdentity) || current.size !== this.#fileIdentity.size
      || current.mtimeMs !== this.#fileIdentity.mtimeMs) throw failure('Credential storage changed externally');
  }
  async #persist(records, { signal, assertAuthorized } = {}) {
    signal?.throwIfAborted(); assertAuthorized?.();
    this.#secureBackend(); await this.#assertFile(); this.#assertReady();
    signal?.throwIfAborted(); assertAuthorized?.();
    let plain = JSON.stringify({ schema: 2, records }), encrypted;
    try { encrypted = this.#safeStorage.encryptString(plain); }
    catch { throw failure('OS credential encryption failed'); }
    finally { plain = undefined; }
    if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw failure('OS credential encryption returned invalid data');
    const data = JSON.stringify({ schema: 1, encryption: 'electron-safe-storage', payload: encrypted.toString('base64') });
    if (Buffer.byteLength(data, 'utf8') > MAX_FILE_BYTES) { encrypted.fill(0); throw failure('Local credential storage is full'); }
    const temporary = join(this.#directory, `.credentials-${randomUUID()}.tmp`);
    let handle, committed = false;
    try {
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      privateFile(await handle.stat(), 0o600); await handle.writeFile(data, 'utf8'); await handle.sync();
      const temporaryIdentity = await handle.stat(); await handle.close(); handle = undefined;
      await this.#assertFile(); this.#secureBackend(); this.#assertReady();
      signal?.throwIfAborted(); assertAuthorized?.();
      await rename(temporary, this.#path); committed = true;
      const installed = await lstat(this.#path); privateFile(installed, 0o600);
      if (!sameFile(installed, temporaryIdentity)) throw failure('Credential storage identity changed during publication');
      this.#fileIdentity = installed;
      this.#encrypted?.fill(0); this.#encrypted = encrypted; encrypted = undefined;
      if (process.platform !== 'win32') {
        const parent = await open(this.#directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try { await parent.sync(); } finally { await parent.close(); }
      }
    } catch (error) {
      if (committed) throw failure('Credential commit durability could not be confirmed', 'BROWSER_CREDENTIAL_COMMIT_UNCONFIRMED');
      throw error;
    } finally {
      encrypted?.fill(0); await handle?.close();
      if (!committed) try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  #prune() {
    const now = Date.now();
    for (const [id, selection] of this.#selections) if (selection.expiresAt <= now) this.#selections.delete(id);
    for (const receipt of this.#activeReceipts) {
      const grant = this.#receipts.get(receipt);
      if (!grant || grant.expiresAt <= now) this.revokeReceipt(receipt);
    }
  }
  #issue(grant) {
    this.#prune();
    if (this.#activeReceipts.size >= MAX_RECEIPTS) throw failure('Too many active credential actions', 'BROWSER_CREDENTIAL_STORE_BUSY');
    const receipt = Object.freeze(Object.create(null));
    this.#receipts.set(receipt, { ...grant, claimed: false, expiresAt: Date.now() + RECEIPT_LIFETIME_MS });
    this.#activeReceipts.add(receipt); return receipt;
  }
  #assertGrant(receipt, grant) {
    this.#assertReady();
    if (this.#receipts.get(receipt) !== grant || !this.#activeReceipts.has(receipt) || grant.expiresAt <= Date.now())
      throw failure('The credential action expired or was revoked', 'USER_ACTION_REQUIRED');
  }
  #selected(id, origin, scope) {
    this.#prune(); const selected = this.#selections.get(id);
    if (!selected || selected.origin !== origin || !sameScope(selected.scope, scope))
      throw failure('A current credential selection is required', 'USER_ACTION_REQUIRED');
    return selected;
  }
  // Only an authenticated private user callback can issue these object-identity grants.
  createUserReceipt(input) {
    this.#assertReady(); object(input, ['action', 'origin', 'id', 'username', 'scope']);
    if (!['read', 'save', 'remove'].includes(input.action)) throw failure('Invalid credential user action', 'INVALID_ARGUMENT');
    const origin = exactOrigin(input.origin);
    const scope = boundScope(input.scope, origin);
    if (input.action !== 'save') identifier(input.id);
    else if (input.id !== undefined || input.username === undefined) throw failure('Invalid credential save authorization', 'INVALID_ARGUMENT');
    if (input.username !== undefined) text(input.username, 4096, true);
    const selected = input.action !== 'save' ? this.#selected(input.id, origin, scope) : undefined;
    if (selected && input.username !== undefined && input.username !== selected.username)
      throw failure('The selected credential identity changed', 'USER_ACTION_REQUIRED');
    return this.#issue({ action: input.action, origin, id: input.id,
      username: selected?.username ?? input.username, scope, selected });
  }
  #consume(receipt, action, origin, id, username, scope) {
    const grant = receipt && typeof receipt === 'object' ? this.#receipts.get(receipt) : undefined;
    if (!grant || grant.claimed || grant.action !== action || grant.origin !== origin || grant.expiresAt <= Date.now()
      || grant.id !== id || action === 'save' && grant.username !== username
      || scope && !sameScope(grant.scope, scope))
      throw failure('A real user credential action is required', 'USER_ACTION_REQUIRED');
    grant.claimed = true;
    return grant;
  }
  list(origin, scope) {
    exactOrigin(origin); const expectedScope = boundScope(scope, origin);
    return this.#enqueue(async () => {
      await this.#assertFile(); const records = this.#decrypt();
      try {
        this.#prune(); this.#assertReady();
        const selected = records.filter(record => record.origin === origin)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 32);
        if (this.#selections.size + selected.length > MAX_SELECTIONS) throw failure('Too many active credential selections', 'BROWSER_CREDENTIAL_STORE_BUSY');
        return selected.map(record => {
          const id = randomUUID();
          this.#selections.set(id, { recordId: record.id, origin, username: record.username,
            updatedAt: record.updatedAt, scope: expectedScope, expiresAt: Date.now() + SELECTION_LIFETIME_MS });
          return { ...metadata(record), id };
        });
      } finally { wipe(records); }
    });
  }
  read(id, origin, scope, receipt) {
    identifier(id); exactOrigin(origin); const expectedScope = boundScope(scope, origin);
    const grant = this.#consume(receipt, 'read', origin, id, undefined, expectedScope);
    return this.#enqueue(async () => {
      let records;
      try {
        this.#assertGrant(receipt, grant); await this.#assertFile(); this.#assertGrant(receipt, grant);
        records = this.#decrypt();
        const record = records.find(value => value.id === grant.selected.recordId && value.origin === origin
          && value.username === grant.username && value.updatedAt === grant.selected.updatedAt);
        this.#assertGrant(receipt, grant);
        return record ? { ...metadata(record), id, password: record.password } : null;
      } finally { wipe(records); this.revokeReceipt(receipt); }
    });
  }
  save(input, receipt) {
    this.#assertReady(); object(input, ['origin', 'username', 'password', 'scope']);
    const origin = exactOrigin(input.origin), username = text(input.username, 4096, true);
    const scope = boundScope(input.scope, origin);
    let password = text(input.password, 16384);
    const grant = this.#consume(receipt, 'save', origin, undefined, username, scope);
    return this.#enqueue(async () => {
      let records;
      try {
        this.#assertGrant(receipt, grant); await this.#assertFile(); this.#assertGrant(receipt, grant);
        records = this.#decrypt();
        let record = records.find(value => value.origin === origin && value.username === username);
        if (!record) {
          if (records.length >= MAX_ENTRIES) throw failure('Local credential storage is full');
          record = { id: randomUUID(), origin, username, password: '', updatedAt: '' }; records.push(record);
        }
        record.password = password; record.updatedAt = new Date().toISOString();
        await this.#persist(records, { assertAuthorized: () => this.#assertGrant(receipt, grant) }); return metadata(record);
      } finally { password = undefined; wipe(records); this.revokeReceipt(receipt); }
    });
  }
  remove(id, origin, receipt) {
    this.#assertReady(); identifier(id); exactOrigin(origin);
    const grant = this.#consume(receipt, 'remove', origin, id);
    return this.#enqueue(async () => {
      let records;
      try {
        this.#assertGrant(receipt, grant); await this.#assertFile(); this.#assertGrant(receipt, grant);
        records = this.#decrypt();
        const selected = records.find(record => record.id === grant.selected.recordId && record.origin === origin);
        if (selected && (selected.username !== grant.username || selected.updatedAt !== grant.selected.updatedAt))
          throw failure('The selected credential identity changed', 'USER_ACTION_REQUIRED');
        const remaining = records.filter(record => record !== selected);
        if (remaining.length === records.length) return { removed: false };
        await this.#persist(remaining, { assertAuthorized: () => this.#assertGrant(receipt, grant) });
        this.#selections.delete(id); return { removed: true };
      } finally { wipe(records); this.revokeReceipt(receipt); }
    });
  }
  revokeReceipt(receipt) {
    const existed = receipt && typeof receipt === 'object' && this.#receipts.has(receipt);
    if (existed) this.#receipts.delete(receipt);
    this.#activeReceipts.delete(receipt); return { revoked: !!existed };
  }
  createImportReceipt(input) {
    this.#assertReady(); object(input, ['sourceId', 'sourceFingerprint']);
    text(input.sourceId, 256); text(input.sourceFingerprint, 2048);
    return this.#issue({ action: 'import', sourceId: input.sourceId, sourceFingerprint: input.sourceFingerprint });
  }
  async importCredentials(input, { receipt, signal } = {}) {
    this.#assertReady();
    if (!Array.isArray(input) || input.length > MAX_ENTRIES) throw failure('Invalid credential import batch', 'INVALID_ARGUMENT');
    const grant = receipt && typeof receipt === 'object' ? this.#receipts.get(receipt) : undefined;
    if (!grant || grant.claimed || grant.action !== 'import') throw failure('A selected password source is required', 'USER_ACTION_REQUIRED');
    this.#assertGrant(receipt, grant); grant.claimed = true;
    const records = input.map(record => {
      try {
        object(record, ['origin', 'username', 'password']);
        return { origin: exactOrigin(record.origin, ['http:', 'https:']),
          username: text(record.username, 4096, true), password: text(record.password, 16384) };
      } catch { return null; }
    });
    const combined = signal ? AbortSignal.any([signal, this.#lifetime.signal]) : this.#lifetime.signal;
    const result = { added: 0, updated: 0, unchanged: 0, failed: 0, remaining: input.length,
      canceled: false, transactionStarted: false };
    try {
      return await this.#enqueue(async () => {
        let saved, staged = { added: 0, updated: 0, unchanged: 0 }, valid = 0;
        if (combined.aborted) return { ...result, canceled: true };
        try {
          this.#assertGrant(receipt, grant); await this.#assertFile(); this.#assertGrant(receipt, grant);
          if (combined.aborted) return { ...result, canceled: true };
          saved = this.#decrypt(); result.transactionStarted = true;
          const accounts = new Map(saved.map(record => [accountKey(record), record]));
          for (let index = 0; index < records.length; index++) {
            if (index % 128 === 0) {
              await new Promise(resolve => setImmediate(resolve));
              this.#assertGrant(receipt, grant);
              if (combined.aborted) return { ...result, canceled: true };
            }
            const record = records[index];
            if (!record) { result.failed++; result.remaining--; continue; }
            const key = accountKey(record), current = accounts.get(key);
            if (!current && saved.length >= MAX_ENTRIES) { result.failed++; result.remaining--; continue; }
            valid++;
            if (current?.password === record.password) { staged.unchanged++; continue; }
            if (current) { current.password = record.password; current.updatedAt = new Date().toISOString(); staged.updated++; }
            else {
              const added = { ...record, id: randomUUID(), updatedAt: new Date().toISOString() };
              accounts.set(key, added); saved.push(added); staged.added++;
            }
          }
          if (combined.aborted) return { ...result, canceled: true };
          this.#assertGrant(receipt, grant);
          if (staged.added || staged.updated) await this.#persist(saved,
            { signal: combined, assertAuthorized: () => this.#assertGrant(receipt, grant) });
          Object.assign(result, staged); result.remaining -= valid; result.canceled = combined.aborted;
          return result;
        } catch (error) {
          if (error.code === 'BROWSER_CREDENTIAL_COMMIT_UNCONFIRMED') throw error;
          if (combined.aborted) return { ...result, canceled: true };
          result.failed += result.remaining; result.remaining = 0; return result;
        } finally { wipe(saved); }
      });
    } catch (error) {
      if (error.code === 'BROWSER_CREDENTIAL_COMMIT_UNCONFIRMED') throw error;
      if (combined.aborted) return { ...result, canceled: true };
      throw error;
    } finally { wipe(records); this.revokeReceipt(receipt); }
  }
  dispose() {
    if (this.#disposing) return this.#disposing;
    this.#closing = true; this.#lifetime.abort(failure('Local credentials were disposed'));
    this.#receipts = new WeakMap(); this.#activeReceipts.clear(); this.#selections.clear();
    this.#disposing = (async () => {
      await this.#initializing?.catch(() => {}); await this.#queue;
      this.#ready = false; this.#encrypted?.fill(0); this.#encrypted = undefined;
      this.#safeStorage = undefined; this.#fileIdentity = undefined;
      try { await this.#releaseLock(); }
      finally { if (OWNERS.get(this.#directory) === this) OWNERS.delete(this.#directory); }
    })();
    return this.#disposing;
  }
}
