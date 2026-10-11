import {createHash, randomUUID} from 'node:crypto';
import {chmodSync, lstatSync, mkdirSync} from 'node:fs';
import {dirname, isAbsolute} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setImmediate as yieldImport} from 'node:timers/promises';
import {compileHistoryQuery, localDayKey, localDayRange} from './history-query.mjs';

const APPLICATION_ID = 0x4f435548;
const SOURCE = 'opencu-history';
const SCOPE = 'owned-browser-profile-global';
const SCHEMA_VERSION = 2;
const COMMIT_SOURCES = new Set(['electron-did-navigate', 'electron-did-navigate-in-page']);
const SNAPSHOT_SOURCES = new Set(['electron-did-start-navigation']);
const IMPORT_SOURCES = new Set(['chromium-history-sqlite', 'opencu-history-query-json']);
const QUERY_KEYS = new Set(['text', 'matchingAlgorithm', 'visitSource', 'startTime', 'endTime',
  'maxResults', 'deduplicateByDay', 'offset', 'cursor']);
const EXCLUDED_SCHEMES = new Set(['about:', 'javascript:', 'content:', 'devtools:', 'chrome:', 'chrome-untrusted:', 'view-source:', 'chrome-native:', 'chrome-search:', 'chrome-distiller:']);
const MAX_TIME = 8640000000000000;

function failure(message, code = 'INVALID_HISTORY_ARGUMENT') {
  return Object.assign(new Error(message), {code});
}

function object(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw failure(`${name} must be an object`);
  return value;
}

function string(value, name) {
  if (typeof value !== 'string') throw failure(`${name} must be a string`);
  return value;
}

function time(value, name) {
  const result = value instanceof Date ? value.getTime() : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || Math.abs(result) > MAX_TIME) throw failure(`${name} must be finite epoch milliseconds`);
  return result;
}

function url(value) {
  string(value, 'url');
  if (!value || value.length > 65536) throw failure('History URL is invalid');
  try { return new URL(value).href; } catch { throw failure('History URL is invalid'); }
}

function opaque(value, name) {
  string(value, name);
  if (!value.length || value.length > 2048 || /[\x00-\x20]/u.test(value) || value.includes('://')) throw failure(`${name} must be an opaque provider identity`);
  return value;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function integer(value, name, fallback, maximum = 2147483647) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw failure(`${name} must be a non-negative integer`);
  return value;
}

function options(value = {}) {
  object(value, 'History options');
  if (Object.keys(value).some(key => !QUERY_KEYS.has(key))) throw failure('Unsupported history option');
  const text = value.text === undefined ? '' : string(value.text, 'text');
  if (text.length > 65536) throw failure('History search text is too large');
  const matchingAlgorithm = value.matchingAlgorithm ?? 'default';
  const visitSource = value.visitSource ?? 'all';
  if (!['default', 'alwaysPrefix'].includes(matchingAlgorithm)) throw failure('Invalid history matchingAlgorithm');
  if (!['all', 'agent', 'other'].includes(visitSource)) throw failure('Invalid history visitSource');
  if (value.deduplicateByDay !== undefined && typeof value.deduplicateByDay !== 'boolean') throw failure('deduplicateByDay must be boolean');
  const result = {
    text, matchingAlgorithm, visitSource,
    startTime: value.startTime == null ? -MAX_TIME : time(value.startTime, 'startTime'),
    endTime: value.endTime == null ? MAX_TIME + 1 : time(value.endTime, 'endTime'),
    maxResults: integer(value.maxResults, 'maxResults', 100),
    deduplicateByDay: value.deduplicateByDay ?? false,
    offset: integer(value.offset, 'offset', 0),
    cursor: value.cursor ?? null,
  };
  if (result.startTime > result.endTime) throw failure('History startTime must not follow endTime');
  if (result.cursor !== null && (typeof result.cursor !== 'string' || !result.cursor || result.cursor.length > 8192 || result.offset !== 0))
    throw failure('History cursor must be an opaque cursor without an offset');
  return result;
}

export class BrowserHistory {
  #db;
  #state = 'open';
  #databaseId;
  #statements = new Map();
  #matchers = new Map();
  #queue = Promise.resolve();
  #accepting = true;
  #closing;
  #committedMetadata;

  constructor({path}) {
    if (typeof path !== 'string' || !isAbsolute(path)) throw failure('History path must be an absolute owned-profile path');
    let existing;
    try { existing = lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw failure('History path must be a regular owned database file');
    mkdirSync(dirname(path), {recursive: true, mode: 0o700});
    try {
      this.#db = new DatabaseSync(path, {enableForeignKeyConstraints: true, allowExtension: false, timeout: 5000});
      const applicationId = this.#db.prepare('PRAGMA application_id').get().application_id;
      const tables = this.#db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (applicationId !== APPLICATION_ID && (applicationId !== 0 || tables.length)) throw failure('Refusing a database not owned by OpenCU browser history', 'FOREIGN_HISTORY_DATABASE');
      const version = this.#db.prepare('PRAGMA user_version').get().user_version;
      if (![0, 1, SCHEMA_VERSION].includes(version)) throw failure('Unsupported owned history schema', 'HISTORY_SCHEMA_UNSUPPORTED');
      chmodSync(path, 0o600);
      this.#db.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        PRAGMA secure_delete=ON;
        PRAGMA busy_timeout=5000;
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS history_meta (
          key TEXT PRIMARY KEY, value TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS history_urls (
          id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL DEFAULT '', favicon_urls TEXT,
          hidden INTEGER NOT NULL CHECK(hidden IN (0,1))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS history_visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url_id INTEGER NOT NULL REFERENCES history_urls(id),
          tab_id TEXT NOT NULL, visit_time REAL NOT NULL,
          actor INTEGER CHECK(actor IN (0,1)), actor_snapshot_source TEXT,
          commit_source TEXT NOT NULL, typed INTEGER CHECK(typed IN (0,1)),
          http_response_code INTEGER
        ) STRICT;
        CREATE INDEX IF NOT EXISTS history_visit_time ON history_visits(visit_time DESC,id DESC);
        CREATE INDEX IF NOT EXISTS history_visit_url_time ON history_visits(url_id,visit_time DESC,id DESC);
        CREATE INDEX IF NOT EXISTS history_unknown_actor ON history_visits(id) WHERE actor IS NULL;
        CREATE INDEX IF NOT EXISTS history_unknown_typed ON history_visits(id) WHERE typed IS NULL;
        CREATE TABLE IF NOT EXISTS history_commit_receipts (
          navigation_key TEXT PRIMARY KEY, commit_digest TEXT,
          visit_id INTEGER REFERENCES history_visits(id) ON DELETE SET NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS history_import_receipts (
          receipt_key TEXT PRIMARY KEY, source TEXT NOT NULL,
          source_fingerprint TEXT NOT NULL, records_digest TEXT NOT NULL,
          terminal_receipt TEXT NOT NULL
        ) STRICT;
        PRAGMA application_id=${APPLICATION_ID};
        PRAGMA user_version=${SCHEMA_VERSION};
        COMMIT;
      `);
      this.#db.prepare("INSERT OR IGNORE INTO history_meta(key,value) VALUES ('database_id',?)").run(randomUUID());
      this.#db.prepare("INSERT OR IGNORE INTO history_meta(key,value) VALUES ('revision','0')").run();
      this.#databaseId = this.#db.prepare("SELECT value FROM history_meta WHERE key='database_id'").get().value;
      if (typeof this.#databaseId !== 'string' || !this.#databaseId) throw failure('Owned history database identity is missing', 'HISTORY_DATABASE_INVALID');
      this.#db.function('history_local_day', timestamp => localDayKey(timestamp));
      this.#db.exec(`CREATE TEMP TABLE history_delete_ranges(
        url_id INTEGER NOT NULL,start_time REAL NOT NULL,end_time REAL NOT NULL,
        PRIMARY KEY(url_id,start_time,end_time)
      ) STRICT`);
      this.#db.function('history_matches', {deterministic: true}, (address, title, query, algorithm) => {
        const key = JSON.stringify([query, algorithm]);
        let matcher = this.#matchers.get(key);
        if (!matcher) {
          matcher = compileHistoryQuery(query, algorithm);
          if (this.#matchers.size >= 32) this.#matchers.delete(this.#matchers.keys().next().value);
          this.#matchers.set(key, matcher);
        }
        return matcher(address, title) ? 1 : 0;
      });
      this.#committedMetadata = this.#readCommittedMetadata();
    } catch (error) {
      try { this.#db?.close(); } catch {}
      this.#state = 'failed';
      throw error;
    }
  }

  #assertOpen() {
    if (this.#state !== 'open') throw failure('Owned browser history is closed', 'HISTORY_CLOSED');
  }

  #enqueue(operation, signal) {
    if (!this.#accepting || this.#state !== 'open') return Promise.reject(failure('Owned browser history is closed', 'HISTORY_CLOSED'));
    const job = this.#queue.then(() => {
      this.#assertOpen();
      signal?.throwIfAborted();
      return operation();
    });
    this.#queue = job.catch(() => {});
    return job;
  }

  #statement(sql) {
    let statement = this.#statements.get(sql);
    if (!statement) {
      statement = this.#db.prepare(sql);
      statement.setReadBigInts(true);
      this.#statements.set(sql, statement);
    }
    return statement;
  }

  #revision() {
    return this.#statement("SELECT value FROM history_meta WHERE key='revision'").get().value;
  }

  #readCommittedMetadata() {
    const revision = this.#revision();
    if (typeof revision !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(revision))
      throw failure('Owned history revision is invalid', 'HISTORY_DATABASE_INVALID');
    return {revision,
      unknownActorVisits: Number(this.#statement('SELECT COUNT(*) AS count FROM history_visits WHERE actor IS NULL').get().count),
      unknownTypedVisits: Number(this.#statement('SELECT COUNT(*) AS count FROM history_visits WHERE typed IS NULL').get().count)};
  }

  #bumpRevision() {
    this.#statement("UPDATE history_meta SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='revision'").run();
    return this.#revision();
  }

  #transaction(operation) {
    this.#assertOpen();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      const metadata = this.#readCommittedMetadata();
      this.#db.exec('COMMIT');
      this.#committedMetadata = metadata;
      return result;
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch (rollbackError) {
        this.#state = 'failed';
        throw new AggregateError([error, rollbackError], 'Owned history transaction rollback failed');
      }
      throw error;
    }
  }

  async ready() {
    return this.#enqueue(() => this.getCapabilities());
  }

  getCapabilities() {
    const available = this.#state === 'open' && this.#accepting;
    const metadata = this.#committedMetadata;
    const classified = metadata?.unknownActorVisits === 0;
    return {schemaVersion: SCHEMA_VERSION, available, persistent: available, persistentReady: available,
      state: !this.#accepting && this.#state === 'open' ? 'closing' : this.#state,
      storage: 'node:sqlite', scope: SCOPE, source: SOURCE, idSource: SOURCE,
      nativeProvider: false, chromeNativeDatabase: false, nativeNavigationObserver: false,
      navigationSource: 'electron-main-frame-navigation-events', titleSource: 'electron-page-title-updated',
      actorClassification: classified ? 'navigation-snapshot' : 'incomplete',
      actorFilters: available && classified, visitSources: available ? classified ? ['all', 'agent', 'other'] : ['all'] : [],
      unknownActorVisits: metadata?.unknownActorVisits ?? null,
      typedCount: metadata?.unknownTypedVisits === 0 ? 'observed' : 'incomplete',
      matchingAlgorithms: ['default', 'alwaysPrefix'], deduplicateByDay: available,
      pagination: available, paginationModel: 'owned-sqlite-revision-keyset', nativeRevision: false,
      idnMatchingPolicy: 'node-uts46-not-chromium-spoof-display',
      removeUrlDay: available, clear: available, dateCounts: available, dateCountsSource: 'derived-owned-history', nativeDateCounts: false,
      summary: available, summarySource: 'derived-owned-history', importData: available, importVisits: available,
      flush: available, metadataWrites: available, faviconSource: 'observed-page-favicon-urls',
      lifecycle: 'plugin-owned-database', revision: metadata?.revision ?? null};
  }

  async recordCommit(value) {
    object(value, 'Navigation commit');
    const navigationId = opaque(value.navigationId, 'navigationId');
    if (typeof value.tabId !== 'string' && (!Number.isSafeInteger(value.tabId) || value.tabId <= 0)) throw failure('tabId requires an owned native tab identity');
    const tabId = opaque(String(value.tabId), 'tabId');
    const address = url(value.url);
    if (EXCLUDED_SCHEMES.has(new URL(address).protocol)) return this.#enqueue(() => ({recorded: false, reason: 'not-history-url', navigationId, source: SOURCE}));
    const visitedAt = time(value.visitedAt, 'visitedAt');
    if (!COMMIT_SOURCES.has(value.source)) throw failure('History requires a real owned-provider navigation commit source');
    const commitSource = value.source;
    if (value.isActorVisit !== null && typeof value.isActorVisit !== 'boolean') throw failure('isActorVisit requires an observed snapshot boolean or explicit null');
    if (typeof value.isActorVisit === 'boolean' && !SNAPSHOT_SOURCES.has(value.actorSnapshotSource)) throw failure('Actor classification requires a navigation-start snapshot source');
    if (value.typed !== undefined && value.typed !== null && typeof value.typed !== 'boolean') throw failure('typed must be an observed boolean or null');
    const title = value.title === undefined ? null : string(value.title, 'title');
    const status = value.httpResponseCode ?? null;
    if (status !== null && (!Number.isInteger(status) || status < -1 || status > 999)) throw failure('Invalid observed HTTP response code');
    if (value.hidden !== undefined && typeof value.hidden !== 'boolean') throw failure('hidden must be boolean');
    const hidden = value.hidden ?? (status !== null && status >= 400 && status < 600);
    const actor = value.isActorVisit === null ? null : Number(value.isActorVisit);
    const snapshot = actor === null ? null : value.actorSnapshotSource;
    const typed = value.typed == null ? null : Number(value.typed);
    const key = digest(navigationId);
    const commitDigest = digest(JSON.stringify([address, tabId, visitedAt, actor, snapshot, commitSource, typed, status, hidden]));
    return this.#enqueue(() => this.#transaction(() => {
      const prior = this.#statement('SELECT commit_digest,visit_id FROM history_commit_receipts WHERE navigation_key=?').get(key);
      if (prior) {
        if (prior.visit_id === null) return {recorded: false, suppressed: true, navigationId, source: SOURCE};
        if (prior.commit_digest !== commitDigest) throw failure('Conflicting facts for an already committed navigation', 'HISTORY_COMMIT_CONFLICT');
        const visit = this.#statement('SELECT url_id FROM history_visits WHERE id=?').get(prior.visit_id);
        return {recorded: false, duplicate: true, visitId: String(prior.visit_id), urlId: String(visit.url_id), navigationId, source: SOURCE, revision: this.#revision()};
      }
      this.#statement(`INSERT INTO history_urls(url,title,hidden) VALUES(?,?,?)
        ON CONFLICT(url) DO UPDATE SET title=CASE WHEN ? IS NULL THEN history_urls.title ELSE excluded.title END,
          hidden=MIN(history_urls.hidden,excluded.hidden)`).run(address, title ?? '', Number(hidden), title);
      const urlId = this.#statement('SELECT id FROM history_urls WHERE url=?').get(address).id;
      const visit = this.#statement(`INSERT INTO history_visits(url_id,tab_id,visit_time,actor,actor_snapshot_source,commit_source,typed,http_response_code)
        VALUES(?,?,?,?,?,?,?,?)`).run(urlId, tabId, visitedAt, actor, snapshot, commitSource, typed, status);
      const visitId = visit.lastInsertRowid;
      this.#statement('INSERT INTO history_commit_receipts(navigation_key,commit_digest,visit_id) VALUES(?,?,?)').run(key, commitDigest, visitId);
      const revision = this.#bumpRevision();
      return {recorded: true, visitId: String(visitId), urlId: String(urlId), navigationId, revision, source: SOURCE};
    }));
  }

  // Imports share the observation queue; yielding must not expose an open transaction.
  async importVisits(records, {source, receipt, signal} = {}) {
    if (!IMPORT_SOURCES.has(source)
      || !receipt || typeof receipt.id !== 'string' || !receipt.id
      || typeof receipt.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.sourceFingerprint)
      || receipt.selectedByUser !== true || receipt.source !== undefined && receipt.source !== source)
      throw failure('History import requires an actual scoped user-selection receipt', 'HISTORY_IMPORT_SELECTION_REQUIRED');
    const receiptId = opaque(receipt.id, 'Import receipt ID');
    const sourceFingerprint = receipt.sourceFingerprint;
    const receiptKey = digest(receiptId);
    if (!Array.isArray(records) || records.length > 500000) throw failure('History import exceeds the complete transaction limit', 'HISTORY_IMPORT_TOO_LARGE');
    const prepared = records.map(record => {
      object(record, 'Imported history visit');
      const address = url(record.url), visitedAt = time(record.visitedAt ?? record.visitTime, 'Imported visit time');
      if (record.visitTime !== undefined && time(record.visitTime, 'Imported visit time') !== visitedAt)
        throw failure('Imported visit timestamps disagree');
      const title = record.title === undefined ? '' : string(record.title, 'Imported title');
      const sourceVisitId = opaque(record.sourceVisitId, 'Imported source visit ID');
      if (record.hidden !== undefined && typeof record.hidden !== 'boolean') throw failure('Imported hidden state must be boolean');
      if (record.incrementedOmniboxTypedScore !== undefined && typeof record.incrementedOmniboxTypedScore !== 'boolean')
        throw failure('Imported typed score must be an observed boolean');
      if (title.length > 1048576 || address.length > 65536) throw failure('Imported history metadata is too large');
      return {address, visitedAt, title, sourceVisitId, hidden: record.hidden === true,
        typed: record.incrementedOmniboxTypedScore === undefined ? null : Number(record.incrementedOmniboxTypedScore)};
    });
    const recordsDigest = digest(JSON.stringify(prepared));
    return this.#enqueue(async () => {
      const prior = this.#statement('SELECT * FROM history_import_receipts WHERE receipt_key=?').get(receiptKey);
      if (prior) {
        if (prior.source !== source || prior.source_fingerprint !== sourceFingerprint || prior.records_digest !== recordsDigest)
          throw failure('History source-selection receipt was already used for different data', 'HISTORY_IMPORT_RECEIPT_CONFLICT');
        return {...JSON.parse(prior.terminal_receipt), replayed: true,
          ...(signal?.aborted ? {cancellationRequested: true} : {})};
      }
      let importedVisits = 0, duplicateVisits = 0, skippedVisits = 0;
      const operationId = randomUUID();
      const terminal = (committed, canceled, transactionStarted, error) => ({
        accepted: true, committed, canceled, transactionStarted, operationId,
        scope: 'opencu-owned-browser', status: canceled ? 'canceled' : committed ? 'imported' : 'failed',
        source: SOURCE, importSource: source, receiptId,
        imported: committed ? importedVisits : 0,
        skipped_existing: duplicateVisits, skipped_invalid: skippedVisits,
        failed: !committed && !canceled ? prepared.length - duplicateVisits - skippedVisits : 0,
        remaining: canceled ? prepared.length - duplicateVisits - skippedVisits : 0,
        importedVisits: committed ? importedVisits : 0, duplicateVisits, skippedVisits,
        revision: committed ? this.#revision() : this.#committedMetadata.revision,
        actorClassification: 'unavailable', typedClassification: 'source-observations-only',
        ...(error ? {error: error.code ?? 'HISTORY_IMPORT_FAILED'} : {}),
        ...(signal?.aborted ? {cancellationRequested: true} : {})});
      if (signal?.aborted) return terminal(false, true, false);
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        for (let index = 0; index < prepared.length; index++) {
          if (index > 0 && index % 256 === 0) await yieldImport(undefined, {signal});
          signal?.throwIfAborted();
          const record = prepared[index];
          if (EXCLUDED_SCHEMES.has(new URL(record.address).protocol)) {skippedVisits++;continue;}
          // Keep the existing receipt identity so reimporting collected data stays a no-op.
          const key = digest(JSON.stringify(['selected-history-import', source, record.sourceVisitId, record.address, record.visitedAt]));
          if (this.#statement('SELECT navigation_key FROM history_commit_receipts WHERE navigation_key=?').get(key)) {duplicateVisits++;continue;}
          this.#statement(`INSERT INTO history_urls(url,title,hidden) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET
            title=CASE WHEN history_urls.title='' THEN excluded.title ELSE history_urls.title END,
            hidden=MIN(history_urls.hidden,excluded.hidden)`).run(record.address, record.title, Number(record.hidden));
          const urlId = this.#statement('SELECT id FROM history_urls WHERE url=?').get(record.address).id;
          const visit = this.#statement(`INSERT INTO history_visits(url_id,tab_id,visit_time,actor,actor_snapshot_source,commit_source,typed,http_response_code)
            VALUES(?,?,?,NULL,NULL,?,?,NULL)`).run(urlId, 'profile-import:' + source, record.visitedAt, 'profile-import:' + source, record.typed);
          this.#statement('INSERT INTO history_commit_receipts(navigation_key,commit_digest,visit_id) VALUES(?,?,?)')
            .run(key, sourceFingerprint, visit.lastInsertRowid);
          importedVisits++;
        }
        signal?.throwIfAborted();
        if (importedVisits) this.#bumpRevision();
        const result = terminal(true, false, true);
        this.#statement(`INSERT INTO history_import_receipts(receipt_key,source,source_fingerprint,records_digest,terminal_receipt)
          VALUES(?,?,?,?,?)`).run(receiptKey, source, sourceFingerprint, recordsDigest, JSON.stringify(result));
        const metadata = this.#readCommittedMetadata();
        this.#db.exec('COMMIT');
        this.#committedMetadata = metadata;
        return result;
      } catch (error) {
        try {this.#db.exec('ROLLBACK');} catch (rollbackError) {
          this.#state = 'failed';throw new AggregateError([error, rollbackError], 'History import rollback failed');
        }
        const canceled = signal?.aborted === true && (error === signal.reason || error?.name === 'AbortError');
        return terminal(false, canceled, true, canceled ? undefined : error);
      }
    });
  }

  async updateTitle({navigationId, title}) {
    string(title, 'title');
    if (title.length > 1048576) throw failure('History title is too large');
    return this.#updateMetadata(navigationId, 'title', title);
  }

  async updateFavicon({navigationId, faviconUrls}) {
    if (!Array.isArray(faviconUrls) || faviconUrls.length > 256) throw failure('faviconUrls must be a bounded list of observed page URLs');
    const values = [...new Set(faviconUrls.map(value => url(value)))];
    return this.#updateMetadata(navigationId, 'favicon_urls', JSON.stringify(values));
  }

  #updateMetadata(navigationId, column, value) {
    const key = digest(opaque(navigationId, 'navigationId'));
    return this.#enqueue(() => this.#transaction(() => {
      const visit = this.#statement(`SELECT v.url_id FROM history_commit_receipts r
        JOIN history_visits v ON v.id=r.visit_id WHERE r.navigation_key=?`).get(key);
      if (!visit) return {updated: false, reason: 'no-live-committed-navigation', source: SOURCE, revision: this.#revision()};
      const changed = this.#statement(`UPDATE history_urls SET ${column}=? WHERE id=? AND ${column} IS NOT ?`).run(value, visit.url_id, value).changes;
      return {updated: changed !== 0n && changed !== 0, revision: changed ? this.#bumpRevision() : this.#revision(), source: SOURCE};
    }));
  }

  #eligibleSql(query, {includeActorFilter = true, joinStats = false} = {}) {
    const actor = !includeActorFilter || query.visitSource === 'all' ? '' : query.visitSource === 'agent' ? ' AND v.actor=1' : ' AND v.actor=0';
    return `FROM history_visits v JOIN history_urls u ON u.id=v.url_id${joinStats ? ' JOIN stats s ON s.url_id=v.url_id' : ''}
      WHERE v.visit_time>=? AND v.visit_time<? AND u.hidden=0
      AND (v.http_response_code IS NULL OR v.http_response_code<>404)
      AND history_matches(u.url,u.title,?,?)=1${actor}`;
  }

  async searchHistory(value = {}, request = {}) {
    return (await this.query(value, request)).entries;
  }

  async query(value = {}, {signal} = {}) {
    const query = options(value);
    return this.#enqueue(() => this.#query(query, signal), signal);
  }

  #query(query, signal) {
    this.#assertOpen();
    signal?.throwIfAborted();
    const revision = this.#revision();
    const parameters = [query.startTime, query.endTime, query.text, query.matchingAlgorithm];
    const unknown = this.#statement(`SELECT COUNT(*) AS count ${this.#eligibleSql(query, {includeActorFilter: false})} AND v.actor IS NULL`).get(...parameters).count;
    if (query.visitSource !== 'all' && unknown !== 0n) throw failure('History range contains unclassified real navigations', 'HISTORY_ACTOR_CLASSIFICATION_UNAVAILABLE');
    const fingerprint = digest(JSON.stringify({...query, cursor: null, offset: 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}));
    let cursor = null;
    if (query.cursor !== null) {
      if (typeof query.cursor !== 'string' || query.cursor.length > 8192 || query.offset !== 0) throw failure('Invalid history cursor');
      try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); } catch { throw failure('Invalid history cursor'); }
      object(cursor, 'History cursor');
      if (cursor.databaseId !== this.#databaseId || cursor.fingerprint !== fingerprint) throw failure('History cursor belongs to another query');
      if (cursor.revision !== revision) throw failure('History changed; restart pagination', 'HISTORY_CURSOR_STALE');
      time(cursor.time, 'cursor time');
      if (typeof cursor.id !== 'string' || !/^[1-9][0-9]*$/u.test(cursor.id)) throw failure('Invalid history cursor id');
      if (BigInt(cursor.id) > 9223372036854775807n) throw failure('Invalid history cursor id');
    }
    const partition = query.deduplicateByDay ? 'v.url_id,history_local_day(v.visit_time)' : 'v.url_id';
    const boundary = cursor ? ' AND (visit_time<? OR (visit_time=? AND visit_id<?))' : '';
    const pagination = query.maxResults === 0 ? (query.offset ? ' LIMIT -1 OFFSET ?' : '') : ' LIMIT ? OFFSET ?';
    const sql = `WITH stats AS (
        SELECT url_id,COUNT(*) AS visit_count,MAX(visit_time) AS last_visit_time,
          CASE WHEN SUM(typed IS NULL)>0 THEN NULL ELSE SUM(typed) END AS typed_count
        FROM history_visits GROUP BY url_id
      ), ranked AS (
        SELECT v.id AS visit_id,v.url_id,v.visit_time,v.actor,u.url,u.title,u.favicon_urls,
          s.visit_count,s.last_visit_time,s.typed_count,
          ROW_NUMBER() OVER(PARTITION BY ${partition} ORDER BY v.visit_time DESC,v.id DESC) AS duplicate_rank
        ${this.#eligibleSql(query, {joinStats: true})}
      ) SELECT * FROM ranked WHERE duplicate_rank=1${boundary}
        ORDER BY visit_time DESC,visit_id DESC${pagination}`;
    const bound = [...parameters];
    if (cursor) bound.push(cursor.time, cursor.time, BigInt(cursor.id));
    if (query.maxResults !== 0) bound.push(query.maxResults + 1, query.offset);
    else if (query.offset) bound.push(query.offset);
    const rows = this.#statement(sql).all(...bound);
    const more = query.maxResults !== 0 && rows.length > query.maxResults;
    if (more) rows.pop();
    const entries = rows.map(row => {
      const entry = {id: String(row.url_id), url: row.url, title: row.title, selectedVisitTime: row.visit_time,
        lastVisitTime: row.last_visit_time, visitCount: Number(row.visit_count),
        typedCount: row.typed_count === null ? null : Number(row.typed_count),
        isActorVisit: row.actor === null ? null : row.actor === 1n,
        actorClassification: row.actor === null ? 'unavailable' : 'navigation-snapshot',
        idSource: SOURCE};
      if (query.deduplicateByDay) {
        entry.visitTime = row.visit_time;
      }
      if (row.favicon_urls !== null) {
        entry.faviconUrls = JSON.parse(row.favicon_urls);
        if (entry.faviconUrls.length) entry.faviconUrl = entry.faviconUrls[0];
      }
      return entry;
    });
    const last = rows.at(-1);
    const nextCursor = more ? Buffer.from(JSON.stringify({databaseId: this.#databaseId, revision,
      fingerprint, time: last.visit_time, id: String(last.visit_id)})).toString('base64url') : null;
    signal?.throwIfAborted();
    return {entries, nextCursor, hasMore: more, complete: !more, revision,
      actorClassification: unknown === 0n ? 'navigation-snapshot' : 'incomplete',
      unknownActorVisits: Number(unknown), source: SOURCE, idSource: SOURCE, scope: SCOPE,
      queryRange: {startTime: query.startTime === -MAX_TIME ? null : query.startTime,
        endTime: query.endTime === MAX_TIME + 1 ? null : query.endTime},
      offset: query.offset};
  }

  queryHistory(value = {}, request = {}) { return this.query(value, request); }

  #deleteWhere(where, parameters) {
    const selected = `SELECT id FROM history_visits WHERE ${where}`;
    this.#statement(`UPDATE history_commit_receipts SET commit_digest=NULL WHERE visit_id IN (${selected})`).run(...parameters);
    const deletedVisits = this.#statement(`DELETE FROM history_visits WHERE ${where}`).run(...parameters).changes;
    const deletedUrls = this.#statement('DELETE FROM history_urls WHERE NOT EXISTS(SELECT 1 FROM history_visits WHERE url_id=history_urls.id)').run().changes;
    return {accepted: true, committed: true, source: SOURCE,
      deletedVisits: Number(deletedVisits), deletedUrls: Number(deletedUrls),
      revision: deletedVisits ? this.#bumpRevision() : this.#revision()};
  }

  async removeBrowsingHistoryEntries(entries, {signal} = {}) {
    signal?.throwIfAborted();
    if (!Array.isArray(entries) || !entries.length) throw failure('History removal requires a nonempty entry array');
    const selected = entries.map(entry => {
      object(entry, 'History entry');
      const visitTime = time(entry.visitTime, 'visitTime');
      return {url: url(entry.url), visitTime, ...localDayRange(visitTime)};
    });
    return this.#enqueue(() => this.#transaction(() => {
      const ids = new Map();
      for (const entry of selected) {
        const row = this.#statement(`SELECT v.url_id FROM history_visits v JOIN history_urls u ON u.id=v.url_id
          WHERE u.url=? AND v.visit_time=? LIMIT 1`).get(entry.url, entry.visitTime);
        if (!row) throw failure('Selected browsing history visit no longer exists', 'HISTORY_VISIT_GONE');
        ids.set(JSON.stringify([String(row.url_id), entry.start, entry.end]), {id: row.url_id, ...entry});
      }
      this.#statement('DELETE FROM history_delete_ranges').run();
      for (const entry of ids.values()) {
        this.#statement('INSERT OR IGNORE INTO history_delete_ranges(url_id,start_time,end_time) VALUES(?,?,?)').run(entry.id, entry.start, entry.end);
      }
      return {...this.#deleteWhere(`EXISTS(SELECT 1 FROM history_delete_ranges d WHERE d.url_id=history_visits.url_id
        AND history_visits.visit_time>=d.start_time AND history_visits.visit_time<d.end_time)`, []),
        selectedEntries: selected.length};
    }), signal);
  }

  async clear(value = {}, {signal} = {}) {
    object(value, 'History clear options');
    if (Object.keys(value).some(key => !['startTime', 'endTime', 'urls'].includes(key))) throw failure('Unsupported history clear option');
    signal?.throwIfAborted();
    const start = value.startTime == null ? -MAX_TIME : time(value.startTime, 'startTime');
    const end = value.endTime == null ? MAX_TIME + 1 : time(value.endTime, 'endTime');
    if (start > end) throw failure('History startTime must not follow endTime');
    const addresses = value.urls === undefined ? null : value.urls;
    if (addresses !== null && !Array.isArray(addresses)) throw failure('clear urls must be an array');
    const selected = addresses === null ? null : [...new Set(addresses.map(address => url(address)))];
    return this.#enqueue(() => this.#transaction(() => {
      if (selected?.length === 0) return {accepted: true, committed: true, source: SOURCE,
        deletedVisits: 0, deletedUrls: 0, revision: this.#revision(), noOp: true};
      if (selected === null) return this.#deleteWhere('visit_time>=? AND visit_time<?', [start, end]);
      this.#statement('DELETE FROM history_delete_ranges').run();
      for (const address of selected) {
        const row = this.#statement('SELECT id FROM history_urls WHERE url=?').get(address);
        if (row) this.#statement('INSERT OR IGNORE INTO history_delete_ranges(url_id,start_time,end_time) VALUES(?,?,?)').run(row.id, start, end);
      }
      return this.#deleteWhere(`EXISTS(SELECT 1 FROM history_delete_ranges d WHERE d.url_id=history_visits.url_id
        AND history_visits.visit_time>=d.start_time AND history_visits.visit_time<d.end_time)`, []);
    }), signal);
  }

  async summary(value = {}, request = {}) {
    const result = await this.query({...value, cursor: null, offset: 0, maxResults: 0, deduplicateByDay: true}, request);
    const sites = new Set();
    for (const entry of result.entries) sites.add(new URL(entry.url).hostname || entry.url);
    return {firstSite: sites.values().next().value ?? null, siteCount: sites.size,
      representedUrlDays: result.entries.length, complete: result.complete,
      revision: result.revision, source: SOURCE, aggregationSource: 'derived-owned-history'};
  }

  async dateCounts(value = {}, request = {}) {
    const result = await this.query({...value, cursor: null, offset: 0, maxResults: 0, deduplicateByDay: true}, request);
    const dates = new Map();
    for (const entry of result.entries) {
      const date = localDayKey(entry.visitTime);
      dates.set(date, (dates.get(date) ?? 0) + 1);
    }
    return {dates: [...dates].map(([date, count]) => ({date, count})), revision: result.revision,
      complete: result.complete, source: SOURCE, aggregationSource: 'derived-owned-history', unit: 'url-days'};
  }

  async handle(method, value = {}, request = {}) {
    object(value, 'History operation');
    if (method === 'history.search') return this.searchHistory(value, request);
    if (method === 'history.query' || method === 'history.list') return this.query(value, request);
    if (method === 'history.remove') return this.removeBrowsingHistoryEntries(value.entries, request);
    if (method === 'history.clear') return this.clear(value, request);
    if (method === 'history.dateCounts') return this.dateCounts(value, request);
    if (method === 'history.summary') return this.summary(value, request);
    if (method === 'history.capabilities') return this.getCapabilities();
    throw failure('Unknown owned history operation', 'HISTORY_METHOD_UNAVAILABLE');
  }

  #checkpoint() {
    const status = this.#db.prepare('PRAGMA wal_checkpoint(FULL)').get();
    if (status.busy !== 0) throw failure('Owned history checkpoint is busy', 'HISTORY_CHECKPOINT_BUSY');
    return {accepted: true, committed: true, flushed: true, source: SOURCE, revision: this.#revision()};
  }

  async flush({signal} = {}) {
    return this.#enqueue(() => this.#checkpoint(), signal);
  }

  close() {
    if (this.#state === 'closed') return Promise.resolve({closed: true, source: SOURCE, revision: this.#committedMetadata.revision});
    if (this.#closing) return this.#closing;
    this.#accepting = false;
    this.#closing = this.#queue.then(() => {
      this.#state = 'closing';
      const committed = this.#checkpoint();
      this.#db.close();
      this.#state = 'closed';
      this.#statements.clear();
      this.#matchers.clear();
      return {...committed, closed: true};
    }).catch(error => {
      this.#closing = undefined;
      throw error;
    });
    return this.#closing;
  }
}

export {BrowserHistory as OwnedBrowserHistory};
