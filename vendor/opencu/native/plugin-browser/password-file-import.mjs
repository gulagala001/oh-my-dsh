import { randomUUID } from 'node:crypto';
import { basename, extname, isAbsolute } from 'node:path';
import { fail, record } from './ipc.mjs';
import { sourceIdentity, readSelectedBytes, assertSourceIdentitiesSync, clearImportRecords } from './import-source.mjs';
import { parsePasswordCsv, PASSWORD_CSV_MAX_BYTES, PASSWORD_CSV_MAX_RECORDS } from './import-csv.mjs';
import { passwordImportAvailable, importCredentialRows } from './import-credentials.mjs';

const methods = new Set(['passwordFileImport.getSignals', 'passwordFileImport.chooseSource', 'passwordFileImport.import', 'passwordFileImport.cancel']);
const terminalStatuses = new Set(['completed', 'partial-success', 'failed', 'canceled']);
const counts = ['discovered', 'skippedInvalid', 'added', 'updated', 'unchanged', 'failed', 'remaining'];
const safeCodes = new Set(['ABORTED', 'BUSY', 'PROVIDER_CLOSED', 'DISCONNECTED', 'TIMEOUT',
  'PASSWORD_FILE_IMPORT_INVALID_ARGUMENT', 'PASSWORD_FILE_IMPORT_UNAVAILABLE', 'PASSWORD_FILE_IMPORT_INVALID_RESULT',
  'PASSWORD_FILE_IMPORT_SELECTION_REQUIRED', 'PASSWORD_FILE_IMPORT_BUSY', 'PASSWORD_FILE_IMPORT_FAILED',
  'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED', 'PASSWORD_FILE_IMPORT_CLEANUP_UNCONFIRMED',
  'PASSWORD_FILE_IMPORT_USER_ACTION_REQUIRED', 'PASSWORD_FILE_IMPORT_SOURCE_CHANGED', 'PASSWORD_FILE_IMPORT_TOO_LARGE',
  'PASSWORD_FILE_IMPORT_SOURCE_INVALID', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED']);
const invalid = () => fail('Password file import accepts only its supported metadata and selection receipt', 'PASSWORD_FILE_IMPORT_INVALID_ARGUMENT');
const invalidResult = () => fail('The password file importer returned an invalid receipt', 'PASSWORD_FILE_IMPORT_INVALID_RESULT');
const unavailable = () => fail('The password file importer is unavailable', 'PASSWORD_FILE_IMPORT_UNAVAILABLE');
const unconfirmed = () => fail('The password file import did not confirm its terminal outcome', 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED');
const boundedCount = value => Number.isSafeInteger(value) && value >= 0;
export const passwordFileSelectionId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value);
const only = (value, keys, error = invalidResult) => {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key))) throw error();
  return value;
};

export function passwordFileImportError(error, fallback = 'PASSWORD_FILE_IMPORT_FAILED') {
  const mapped = error?.code === 'SOURCE_CHANGED' ? 'PASSWORD_FILE_IMPORT_SOURCE_CHANGED'
    : error?.code === 'SOURCE_FILE_TOO_LARGE' ? 'PASSWORD_FILE_IMPORT_TOO_LARGE'
      : error?.code === 'PASSWORD_IMPORT_OUTCOME_UNCONFIRMED' ? 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED' : error?.code;
  const code = safeCodes.has(mapped) ? mapped : fallback;
  return fail(code === 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED' ? 'The password file import did not confirm its terminal outcome'
    : code === 'PASSWORD_FILE_IMPORT_CLEANUP_UNCONFIRMED' ? 'The password file importer cleanup is unconfirmed'
      : code === 'ABORTED' ? 'Password file import was interrupted'
        : code === 'PASSWORD_FILE_IMPORT_SOURCE_CHANGED' ? 'The selected password file changed; select it again'
          : code === 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED' ? 'The password file selection expired; select it again'
            : 'The password file import operation could not complete', code);
}
const publicError = value => {
  only(value, ['code', 'message']);
  if (typeof value.code !== 'string' || typeof value.message !== 'string') throw invalidResult();
  const error = passwordFileImportError(value); return { code: error.code, message: error.message };
};

export function passwordFileImportResult(method, value, expectedSelectionId) {
  if (method === 'passwordFileImport.getSignals') {
    only(value, ['available', 'persistentReady', 'format', 'maxFileBytes', 'maxRecords', 'error']);
    if (typeof value.available !== 'boolean' || typeof value.persistentReady !== 'boolean' || value.format !== 'csv'
      || !boundedCount(value.maxFileBytes) || !boundedCount(value.maxRecords)
      || value.available && (value.maxFileBytes === 0 || value.maxRecords === 0) || value.persistentReady && !value.available) throw invalidResult();
    return { available: value.available, persistentReady: value.persistentReady, format: 'csv', maxFileBytes: value.maxFileBytes,
      maxRecords: value.maxRecords, ...(value.error === undefined ? {} : { error: publicError(value.error) }) };
  }
  if (method === 'passwordFileImport.chooseSource') {
    if (value?.status === 'canceled') {
      only(value, ['status', 'canceled']); if (value.canceled !== true) throw invalidResult(); return { status: 'canceled', canceled: true };
    }
    only(value, ['status', 'selectionId', 'fileName', 'discovered', 'valid', 'skippedInvalid']);
    if (value.status !== 'selected' || !passwordFileSelectionId(value.selectionId) || typeof value.fileName !== 'string'
      || !value.fileName || value.fileName.length > 1024 || /[/\\\x00-\x1f\x7f]/u.test(value.fileName) || ['.', '..'].includes(value.fileName)
      || !['discovered', 'valid', 'skippedInvalid'].every(key => boundedCount(value[key]))
      || !Number.isSafeInteger(value.valid + value.skippedInvalid) || value.discovered !== value.valid + value.skippedInvalid) throw invalidResult();
    return { status: 'selected', selectionId: value.selectionId, fileName: value.fileName, discovered: value.discovered,
      valid: value.valid, skippedInvalid: value.skippedInvalid };
  }
  if (method !== 'passwordFileImport.import' && method !== 'passwordFileImport.cancel') throw invalidResult();
  only(value, ['status', 'selectionId', ...counts, 'canceled', 'transactionStarted', 'error']);
  if (!terminalStatuses.has(value.status) || !passwordFileSelectionId(value.selectionId)
    || expectedSelectionId !== undefined && value.selectionId !== expectedSelectionId || !counts.every(key => boundedCount(value[key]))
    || typeof value.canceled !== 'boolean' || value.canceled !== (value.status === 'canceled') || typeof value.transactionStarted !== 'boolean'
    || !value.transactionStarted && value.added + value.updated + value.unchanged !== 0
    || value.status === 'completed' && (value.failed !== 0 || value.remaining !== 0 || value.error !== undefined)) throw invalidResult();
  const total = value.skippedInvalid + value.added + value.updated + value.unchanged + value.failed + value.remaining;
  if (!Number.isSafeInteger(total) || total !== value.discovered) throw invalidResult();
  return { status: value.status, selectionId: value.selectionId, ...Object.fromEntries(counts.map(key => [key, value[key]])),
    canceled: value.canceled, transactionStarted: value.transactionStarted, ...(value.error === undefined ? {} : { error: publicError(value.error) }) };
}

function waitForChooser(work, signal) {
  if (signal.aborted) throw fail('Password source selection was interrupted', 'ABORTED');
  return new Promise((resolve, reject) => {
    const abort = () => reject(fail('Password source selection was interrupted', 'ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => {});
    if (signal.aborted) abort();
  });
}

export class PasswordFileImporter {
  #store; #chooseSource; #closed = false; #disposed; #lifetime = new AbortController(); #choosing = false;
  #selections = new Map(); #terminals = new Map(); #active; #tasks = new Set(); #unconfirmed = new Set();
  constructor({ passwordStore, chooseSource } = {}) {
    if (typeof chooseSource !== 'function') throw invalid(); this.#store = passwordStore; this.#chooseSource = chooseSource;
  }
  #assert(signal) {
    if (this.#closed) throw fail('The password file importer is closed', 'PROVIDER_CLOSED');
    if (signal?.aborted) throw fail('Password file import was interrupted', 'ABORTED');
  }
  #remember(receipt) {
    const selection = this.#selections.get(receipt.selectionId);
    if (selection) { clearTimeout(selection.timer); clearImportRecords(selection.records); }
    this.#selections.delete(receipt.selectionId); this.#terminals.set(receipt.selectionId, receipt);
    if (this.#terminals.size > 32) this.#terminals.delete(this.#terminals.keys().next().value);
    return structuredClone(receipt);
  }
  #terminal(selection, result, error) {
    const canceled = result.canceled === true;
    const success = result.added + result.updated + result.unchanged > 0;
    const incomplete = Boolean(error) || result.failed > 0 || result.remaining > 0 || selection.skippedInvalid > 0;
    const status = canceled ? 'canceled' : incomplete && success ? 'partial-success' : error || result.failed || result.remaining ? 'failed' : 'completed';
    const normalizedError = error ? passwordFileImportError(error) : undefined;
    return passwordFileImportResult('passwordFileImport.import', { status, selectionId: selection.id, discovered: selection.discovered,
      skippedInvalid: selection.skippedInvalid, ...result, ...(normalizedError ? { error: { code: normalizedError.code, message: normalizedError.message } } : {}) }, selection.id);
  }
  #unsubmitted(selection, error, canceled = false) {
    return this.#terminal(selection, { added: 0, updated: 0, unchanged: 0, failed: 0, remaining: selection.records.length, canceled, transactionStarted: false }, error);
  }
  #signals() {
    const available = !this.#closed && passwordImportAvailable(this.#store);
    return { available, persistentReady: available, format: 'csv', maxFileBytes: PASSWORD_CSV_MAX_BYTES, maxRecords: PASSWORD_CSV_MAX_RECORDS,
      ...(available ? {} : { error: { code: 'PASSWORD_FILE_IMPORT_UNAVAILABLE', message: 'The password file importer is unavailable' } }) };
  }
  async #choose(signal) {
    if (this.#choosing || this.#active) throw fail('Another password file operation is running', 'PASSWORD_FILE_IMPORT_BUSY');
    this.#choosing = true; let parsed, image;
    try {
      if (!this.#signals().available) throw unavailable();
      for (const id of this.#selections.keys()) await this.#cancel(id);
      this.#assert(signal);
      const chosen = await waitForChooser(Promise.resolve().then(() => this.#chooseSource({ signal })), signal);
      this.#assert(signal);
      if (!record(chosen) || typeof chosen.canceled !== 'boolean') throw invalidResult();
      if (chosen.canceled) return { status: 'canceled', canceled: true };
      if (!Array.isArray(chosen.filePaths) || chosen.filePaths.length !== 1 || typeof chosen.filePaths[0] !== 'string'
        || !isAbsolute(chosen.filePaths[0]) || chosen.filePaths[0].length > 32768 || /[\x00-\x1f]/u.test(chosen.filePaths[0])
        || extname(chosen.filePaths[0]).toLowerCase() !== '.csv') throw invalidResult();
      const identity = await sourceIdentity(chosen.filePaths[0], { maxBytes: PASSWORD_CSV_MAX_BYTES });
      image = await readSelectedBytes(identity, { signal, maxBytes: PASSWORD_CSV_MAX_BYTES });
      parsed = await parsePasswordCsv(image.bytes, signal); this.#assert(signal);
      const id = randomUUID(), selection = { id, identity, digest: image.digest, ...parsed, expiresAt: Date.now() + 300000 };
      const metadata = passwordFileImportResult('passwordFileImport.chooseSource', { status: 'selected', selectionId: id,
        fileName: basename(identity.path), discovered: parsed.discovered, valid: parsed.records.length, skippedInvalid: parsed.skippedInvalid });
      selection.timer = setTimeout(() => {
        if (this.#active?.id === id) { this.#active.expired = true; this.#active.controller.abort(); }
        else if (this.#selections.has(id)) this.#remember(this.#unsubmitted(selection, fail('The password file selection expired', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED')));
      }, 300000); selection.timer.unref?.();
      this.#selections.set(id, selection); parsed = undefined; return metadata;
    } finally { image?.bytes.fill(0); clearImportRecords(parsed?.records); this.#choosing = false; }
  }
  async #import(id, signal) {
    if (this.#active || this.#choosing) throw fail('Another password file operation is running', 'PASSWORD_FILE_IMPORT_BUSY');
    if (this.#unconfirmed.has(id)) throw unconfirmed();
    if (this.#terminals.has(id)) return structuredClone(this.#terminals.get(id));
    const selection = this.#selections.get(id);
    if (!selection) throw fail('Choose the password file with the native dialog first', 'PASSWORD_FILE_IMPORT_SELECTION_REQUIRED');
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal]);
    let finish;
    const active = { id, controller, done: new Promise(resolve => { finish = resolve; }), expired: false };
    this.#active = active;
    let result = { added: 0, updated: 0, unchanged: 0, failed: 0, remaining: selection.records.length, canceled: false, transactionStarted: false }, error, uncertain = false;
    try {
      if (Date.now() >= selection.expiresAt) throw fail('The password file selection expired', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED');
      const image = await readSelectedBytes(selection.identity, { signal: combined, maxBytes: PASSWORD_CSV_MAX_BYTES, expectedHash: selection.digest });
      image.bytes.fill(0);
      result = await importCredentialRows(this.#store, selection.records, { sourceId: selection.id, sourceFingerprint: selection.digest, signal: combined,
        assertCurrent: () => {
          assertSourceIdentitiesSync([selection.identity]);
          if (Date.now() >= selection.expiresAt) throw fail('The password file selection expired', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED');
        }, onProgress: value => { result = value; } });
      if (result.failed) error = fail('Some passwords could not be stored', 'PASSWORD_FILE_IMPORT_FAILED');
      if (active.expired) error = fail('The password file selection expired', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED');
    } catch (cause) {
      if (cause.importResult) result = cause.importResult;
      uncertain = cause.code === 'PASSWORD_IMPORT_OUTCOME_UNCONFIRMED';
      error = passwordFileImportError(cause); result.canceled ||= combined.aborted;
      if (active.expired) error = fail('The password file selection expired', 'PASSWORD_FILE_IMPORT_SELECTION_EXPIRED');
    } finally {
      try {
        if (uncertain) throw unconfirmed();
        this.#remember(this.#terminal(selection, result, error));
      } catch {
        clearTimeout(selection.timer); clearImportRecords(selection.records); this.#selections.delete(id); this.#unconfirmed.add(id);
        throw unconfirmed();
      }
      finally { this.#active = undefined; finish(); }
    }
    return structuredClone(this.#terminals.get(id));
  }
  async #cancel(id) {
    if (this.#unconfirmed.has(id)) throw unconfirmed();
    if (this.#terminals.has(id)) return structuredClone(this.#terminals.get(id));
    if (this.#active?.id === id) {
      const active = this.#active; active.controller.abort(); await active.done;
      if (!this.#terminals.has(id)) throw unconfirmed(); return structuredClone(this.#terminals.get(id));
    }
    const selection = this.#selections.get(id);
    if (!selection) throw fail('The password selection receipt is unknown', 'PASSWORD_FILE_IMPORT_SELECTION_REQUIRED');
    return this.#remember(this.#unsubmitted(selection, undefined, true));
  }
  async handle(method, input = {}, { signal, trustedUserAction = false } = {}) {
    try {
      if (method !== 'passwordFileImport.cancel') this.#assert(signal);
      else if (signal?.aborted) throw fail('Password file cancellation was interrupted before dispatch', 'ABORTED');
      if (!methods.has(method)) throw invalid();
      only(input, ['passwordFileImport.import', 'passwordFileImport.cancel'].includes(method) ? ['selectionId'] : [], invalid);
      if (method !== 'passwordFileImport.getSignals' && trustedUserAction !== true) throw fail('Password file operations require a real user action', 'PASSWORD_FILE_IMPORT_USER_ACTION_REQUIRED');
      if (method === 'passwordFileImport.import' || method === 'passwordFileImport.cancel') if (!passwordFileSelectionId(input.selectionId)) throw invalid();
      const lifetime = signal ? AbortSignal.any([signal, this.#lifetime.signal]) : this.#lifetime.signal;
      if (method !== 'passwordFileImport.getSignals' && method !== 'passwordFileImport.cancel' && !this.#signals().available) throw unavailable();
      const task = method === 'passwordFileImport.getSignals' ? Promise.resolve(this.#signals())
        : method === 'passwordFileImport.chooseSource' ? this.#choose(lifetime)
          : method === 'passwordFileImport.import' ? this.#import(input.selectionId, lifetime) : this.#cancel(input.selectionId);
      this.#tasks.add(task); try { return await task; } finally { this.#tasks.delete(task); }
    } catch (error) { throw passwordFileImportError(error); }
  }
  dispose() {
    if (this.#disposed) return this.#disposed;
    this.#closed = true; this.#lifetime.abort(fail('The password file importer closed', 'PROVIDER_CLOSED'));
    this.#disposed = (async () => {
      const cancellations = [...this.#selections.keys()].map(id => this.#cancel(id));
      const results = await Promise.allSettled([...cancellations, ...this.#tasks]);
      for (const selection of this.#selections.values()) { clearTimeout(selection.timer); clearImportRecords(selection.records); }
      this.#selections.clear(); this.#terminals.clear(); this.#store = undefined;
      const uncertain = this.#unconfirmed.size > 0; this.#unconfirmed.clear();
      if (uncertain || results.some(value => value.status === 'rejected' && value.reason?.code === 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED'))
        throw passwordFileImportError(null, 'PASSWORD_FILE_IMPORT_CLEANUP_UNCONFIRMED');
    })(); return this.#disposed;
  }
}
