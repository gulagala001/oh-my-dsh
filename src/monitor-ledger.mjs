import { inputSQL, knownInputSQL, knownTotalSQL, cacheMeasuredSQL, validUsageSQL } from './metering/usage-sql.mjs';
import { reportedUsage, usageFields, usageReceipt, USAGE_FIELDS } from './metering/usage.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { monitorActivityFingerprint } from './monitor-activity.mjs';
import { emptyOptimization, addOptimization } from './result-reduction/accounting.mjs';

const fields = USAGE_FIELDS;
const measurements = ['durationMs', 'inputTotalTokens', 'knownInputTokens', 'knownTotalTokens', 'cacheMeasuredInputTokens', 'cacheMeasuredReadTokens', ...fields];
const additive = ['calls', 'errors', 'cancelled', 'unmetered', 'usageUnreported', 'totalUnreported', 'outputUnreported', 'cacheMeasuredCalls',
  'inputUnreported', 'inputBucketUnreported', 'cacheUnreported', 'cacheWriteUnreported', 'durationUnreported', ...measurements];
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const text = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// FILTER skips aggregate steps for non-matching receipts. Keep the original
// predicates, NULL readings and SUM order, including zero for an empty range.
const metricsSQL = `COUNT(*) calls, COUNT(*) FILTER (WHERE status='error') errors,
  COUNT(*) FILTER (WHERE ${cacheMeasuredSQL}) cacheMeasuredCalls,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${inputSQL}) FILTER (WHERE ${cacheMeasuredSQL}) END cacheMeasuredInputTokens,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(cacheReadTokens) FILTER (WHERE ${cacheMeasuredSQL}) END cacheMeasuredReadTokens,
  COUNT(*) FILTER (WHERE status='cancelled') cancelled, COUNT(*) FILTER (WHERE NOT (${validUsageSQL}) OR totalTokens IS NULL OR outputTokens IS NULL OR (${inputSQL}) IS NULL) unmetered,
  COUNT(*) FILTER (WHERE (${knownTotalSQL}) IS NULL) usageUnreported,
  COUNT(*) FILTER (WHERE totalTokens IS NULL OR NOT (${validUsageSQL})) totalUnreported, COUNT(*) FILTER (WHERE outputTokens IS NULL OR NOT (${validUsageSQL})) outputUnreported,
  COUNT(*) FILTER (WHERE inputTokens IS NULL OR NOT (${validUsageSQL})) inputBucketUnreported,
  COUNT(*) FILTER (WHERE cacheReadTokens IS NULL OR NOT (${validUsageSQL})) cacheUnreported, COUNT(*) FILTER (WHERE cacheWriteTokens IS NULL OR NOT (${validUsageSQL})) cacheWriteUnreported,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(durationMs) END durationMs,
  COUNT(*) FILTER (WHERE durationMs IS NULL) durationUnreported, COUNT(*) FILTER (WHERE (${inputSQL}) IS NULL) inputUnreported,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${inputSQL}) END inputTotalTokens,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${knownInputSQL}) END knownInputTokens,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${knownTotalSQL}) END knownTotalTokens,
  ${fields.map(key => `CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${key}) FILTER (WHERE ${validUsageSQL}) END ${key}`).join(',')},
  CASE WHEN COUNT(*)=0 THEN 0 ELSE MAX(${inputSQL}) END peakContext`;

const groupedMetricsSQL = [[cacheMeasuredSQL, '_cacheMeasured'], [knownTotalSQL, '_knownTotal'],
  [knownInputSQL, '_knownInput'], [inputSQL, '_inputTotal']].reduce((sql, [expression, column]) => sql.replaceAll(expression, column), metricsSQL);
const metricGroupsSQL = [['totals', null], ['components', 'kind'], ['models', 'provider,model'],
  ['providers', 'provider'], ['sessions', 'sessionId']].map(([group, column]) => {
  const keys = group === 'models' ? 'NULL _key,provider _provider,model _model' : `${column || 'NULL'} _key,NULL _provider,NULL _model`;
  const select = `SELECT '${group}' _group,${keys},${groupedMetricsSQL} FROM measured`;
  return column ? `SELECT * FROM (${select} GROUP BY ${column} ORDER BY knownTotalTokens DESC)` : select;
}).join(' UNION ALL ');
function groupedMetrics(db, where, args) {
  // Reuse derived receipt values across all groups within this read snapshot,
  // without retaining error text or other activity-only columns in the temporary rows.
  const rows = db.prepare(`WITH measured AS MATERIALIZED (SELECT kind,provider,model,sessionId,status,durationMs,${fields.join(',')},${inputSQL} _inputTotal,${knownInputSQL} _knownInput,
    ${knownTotalSQL} _knownTotal,${cacheMeasuredSQL} _cacheMeasured FROM calls WHERE ${where}) ${metricGroupsSQL}`).all(...args);
  const groups = { totals: [], components: [], models: [], providers: [], sessions: [] };
  for (const row of rows) {
    const { _group, _key, _provider, _model, ...metrics } = row;
    const value = _group === 'totals' ? metrics : _group === 'models'
      ? { key: JSON.stringify([_provider, _model]), provider: _provider, model: _model, ...metrics } : { key: _key, ...metrics };
    groups[_group].push(_group === 'models' ? value : Object.assign(Object.create(Object.getPrototypeOf(row)), value));
  }
  const { totals: [totals], ...result } = groups;
  return { totals, ...result };
}

// Public aggregate contract: durationMs: null | number; durationUnreported: number.
// Empty ranges and measured zero stay 0; calls without readings stay null.
// Mixed readings retain a known subtotal and count uncovered calls separately.
export const emptyMonitorMetric = () => Object.fromEntries([...additive, 'peakContext'].map(key => [key, 0]));
export function addMonitorMetric(target, value) {
  const calls = target.calls || 0, nextCalls = value?.calls || 0;
  const durationUnreported = number(target.durationUnreported) ?? (number(target.durationMs) === null ? calls : 0);
  for (const key of additive) {
    if (measurements.includes(key)) {
      const before = calls ? number(target[key]) : null, next = nextCalls ? number(value[key]) : null;
      target[key] = before === null && next === null ? (key === 'durationMs' && !calls && !nextCalls ? 0 : null) : (before || 0) + (next || 0);
    } else if (key === 'durationUnreported') {
      target[key] = durationUnreported + (number(value?.[key]) ?? (number(value?.durationMs) === null ? nextCalls : 0));
    } else target[key] = (target[key] || 0) + (number(value?.[key]) || 0);
  }
  const before = calls ? number(target.peakContext) : null, next = nextCalls ? number(value.peakContext) : null;
  target.peakContext = before === null && next === null ? null : Math.max(before || 0, next || 0);
  return target;
}

// Missing optional buckets stay missing. In particular a missing cache reading
// is not evidence of a cache miss, and reasoning is a subset of output.
export const reportedMonitorUsage = reportedUsage;
export const monitorUsage = usageFields;
export function monitorQuery(params, now = Date.now()) {
  const get = key => params instanceof URLSearchParams ? params.get(key) : params?.[key];
  const range = get('range') || 'session', period = get('period') || 'all', status = get('status') || 'all';
  if (!['session', 'all'].includes(range) || !['all', 'today', '7d', '30d'].includes(period) || !['all', 'error', 'cancelled', 'local', 'recovered'].includes(status)) throw Error('监控筛选无效');
  const limit = get('limit') == null ? 50 : Number(get('limit'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('监控分页大小无效');
  const filter = Object.fromEntries(['provider', 'model', 'kind', 'query'].map(key => {
    const value = get(key) || '';
    if (typeof value !== 'string' || value.length > (key === 'query' ? 200 : 256)) throw Error('监控筛选过长');
    return [key, value === 'all' && key !== 'query' ? '' : value];
  }));
  const date = new Date(now); date.setHours(0, 0, 0, 0);
  if (period === '7d' || period === '30d') date.setDate(date.getDate() - (period === '7d' ? 6 : 29));
  const from = period === 'all' ? 0 : date.getTime();
  return { range, period, status, limit, from, to: now, session: text(get('session')), cursor: get('cursor') || '', ...filter };
}

export function monitorEventQuery(params, now = Date.now()) {
  const get = key => params instanceof URLSearchParams ? params.get(key) : params?.[key];
  const base = monitorQuery({ range: get('range'), period: get('period'), limit: get('limit') ?? 20, session: get('session') }, now);
  const status = get('status') || 'all', kind = get('kind') || '', query = get('query') || '', offset = Number(get('offset') || 0);
  if (!['all', 'success', 'error', 'skip', 'stale', 'running', 'info'].includes(status)) throw Error('事件筛选无效');
  if (kind.length > 64 || query.length > 200) throw Error('事件筛选过长');
  if (!Number.isInteger(offset) || offset < 0 || offset > 1e6) throw Error('事件分页无效');
  return { ...base, status, kind: kind === 'all' ? '' : kind, query, offset };
}

/** Derived metadata only; no messages, credentials or tool arguments are stored. */
export class MonitorLedger {
  constructor(directory, { now = Date.now } = {}) {
    this.now = now; this.error = null; this.imported = new Map(); this.closed = false; this.eventChanges = 0;
    this.groupCache = null; this.usageCache = null; this.legacyCache = null; this.legacyCountCache = null; this.overviewCache = null; this.costCache = null;
    try {
      mkdirSync(join(directory, 'monitor-v1'), { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(join(directory, 'monitor-v1', 'usage.sqlite'));
      // Monitoring must not delay execution behind another process's database lock.
      this.db.exec(`PRAGMA busy_timeout=50; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,sessionId TEXT,kind TEXT NOT NULL,
          at REAL NOT NULL,provider TEXT,model TEXT,status TEXT NOT NULL,source TEXT NOT NULL,
          turn INTEGER,step INTEGER,eventSeq INTEGER,startedAt REAL,durationMs REAL,effort TEXT,error TEXT,
          inputTokens REAL,outputTokens REAL,cacheReadTokens REAL,cacheWriteTokens REAL,reasoningTokens REAL,totalTokens REAL);
        CREATE INDEX IF NOT EXISTS monitor_session_time ON calls(sessionId,at DESC,id);
        CREATE INDEX IF NOT EXISTS monitor_time ON calls(at DESC,id);
        CREATE INDEX IF NOT EXISTS monitor_filter_options ON calls(+provider,+model,+kind);
        CREATE TABLE IF NOT EXISTS call_timings(id TEXT PRIMARY KEY,firstTokenMs REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,sessionId TEXT,kind TEXT NOT NULL,at REAL NOT NULL,
          status TEXT NOT NULL,title TEXT,detail TEXT,count REAL,savedTokens REAL,inputTokens REAL,outputTokens REAL,data TEXT);
        CREATE INDEX IF NOT EXISTS events_session_time ON events(sessionId,at DESC,id);
        CREATE INDEX IF NOT EXISTS events_time ON events(at DESC,id);`);
      const schema = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('schema');
      if (schema && schema.value !== '1') throw Error('监控数据版本不兼容');
      this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('schema', '1');
      this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('startedAt', String(now()));
      this.startedAt = Number(this.db.prepare('SELECT value FROM metadata WHERE key=?').get('startedAt').value);
      this.insert = this.db.prepare('INSERT OR IGNORE INTO calls VALUES(' + Array(21).fill('?').join(',') + ')');
      const columns=['sessionId','kind','at','provider','model','status','source','turn','step','eventSeq','startedAt','durationMs','effort','error',...fields];
      this.replace=this.db.prepare('INSERT INTO calls VALUES('+Array(21).fill('?').join(',')+') ON CONFLICT(id) DO UPDATE SET '+columns.map(key=>key+'=excluded.'+key).join(',')+' WHERE calls.sessionId=excluded.sessionId AND calls.kind=excluded.kind AND calls.source=excluded.source AND ((excluded.eventSeq IS NOT NULL AND (calls.eventSeq IS NULL OR excluded.eventSeq>=calls.eventSeq)) OR (excluded.eventSeq IS NULL AND excluded.at>=calls.at))');
      this.insertTiming = this.db.prepare('INSERT OR IGNORE INTO call_timings VALUES(?,?)');
      this.insertEvent = this.db.prepare('INSERT OR IGNORE INTO events VALUES(' + Array(12).fill('?').join(',') + ')');
      this.replaceEvent = this.db.prepare('INSERT INTO events VALUES(' + Array(12).fill('?').join(',') + ') ON CONFLICT(id) DO UPDATE SET status=excluded.status,title=excluded.title,detail=excluded.detail,data=excluded.data WHERE events.sessionId=excluded.sessionId AND events.kind=excluded.kind');
    } catch (error) {
      this.error = String(error.message); try { this.db?.close(); } catch {} this.db = null;
    }
  }
  append(entry) {
    if (!this.db || this.closed) return false;
    try {
      const u = monitorUsage(reportedMonitorUsage(entry.usage, entry.hasOutput)), id = text(entry.id, 512) || randomUUID();
      if (entry.source === 'native' && !entry.hasOutput && !Object.values(u).some(value => value > 0)
        && this.db.prepare("SELECT 1 FROM events WHERE id=? AND sessionId=? AND kind='imagePreparation' AND json_extract(data,'$.providerRequestSent')=0").get('image-preflight:' + id, entry.sessionId)) {
        // Verified local preparation belongs to events, including on legacy
        // import. Retain any contradictory positive provider receipt.
        const removed = this.db.prepare(`DELETE FROM calls WHERE id=? AND sessionId=? AND source='native' AND ${fields.map(key=>`COALESCE(${key},0)=0`).join(' AND ')}`).run(id, entry.sessionId);
        if (removed.changes) this.db.prepare('DELETE FROM call_timings WHERE id=?').run(id);
        return true;
      }
      if(usageReceipt(entry.usage).inconsistent)this.appendEvent({id:'usage:'+id,sessionId:entry.sessionId,kind:'usage',status:'error',title:'用量回执不一致',detail:'原始计数互相矛盾，未计作精确用量。',data:{callId:id,usage:entry.usage}});
      const status = ['success', 'error', 'cancelled'].includes(entry.status) ? entry.status : entry.error ? 'error' : 'success';
      (entry.replace?this.replace:this.insert).run(id, text(entry.sessionId), text(entry.kind) || 'unknown', number(entry.at) ?? this.now(),
        text(entry.provider), text(entry.model), status, text(entry.source) || 'background',
        number(entry.turn), number(entry.step), number(entry.eventSeq), number(entry.startedAt), number(entry.durationMs),
        text(entry.effort), text(entry.error, 2000), ...fields.map(key => u[key]));
      if (number(entry.firstTokenMs) !== null) this.insertTiming.run(id, entry.firstTokenMs);
      return true;
    } catch (error) { this.error = String(error.message); return false; }
  }
  // Background mechanism history (preparation, hub decisions, replacements,
  // compaction, adaptive checks, Dream jobs). Derived summaries only.
  appendEvent(entry) {
    if (!this.db || this.closed || !this.insertEvent) return false;
    try {
      let data = null;
      if (entry.data && typeof entry.data === 'object') { data = JSON.stringify(entry.data); if (data.length > 8000) data = null; }
      const result = (entry.replace ? this.replaceEvent : this.insertEvent).run(text(entry.id, 512) || randomUUID(), text(entry.sessionId), text(entry.kind) || 'unknown', number(entry.at) ?? this.now(),
        text(entry.status, 32) || 'success', text(entry.title, 400), text(entry.detail, 2000),
        number(entry.count), Number.isFinite(entry.savedTokens) ? entry.savedTokens : null, number(entry.inputTokens), number(entry.outputTokens), data);
      // These direct writes cannot affect receipt metrics. Like total_changes(),
      // this counter includes rolled-back writes; ignored inserts contribute zero.
      // Trigger side effects and writes through other paths still invalidate reads.
      this.eventChanges += Number(result.changes);
      return true;
    } catch (error) { this.error = String(error.message); return false; }
  }
  events(ids, query) {
    if (!this.db || this.closed) throw Error(this.error || '监控账本不可用');
    const clauses = ['at>=?', 'at<=?'], args = [query.from, query.to];
    if (query.range !== 'all') { clauses.push('sessionId IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify([...ids])); }
    const scoped = clauses.join(' AND '), scopedArgs = [...args];
    if (query.kind) { clauses.push('kind=?'); args.push(query.kind); }
    if (query.status !== 'all') { clauses.push('status=?'); args.push(query.status); }
    if (query.query) { clauses.push("instr(lower(kind||' '||COALESCE(title,'')||' '||COALESCE(detail,'')),lower(?))>0"); args.push(query.query); }
    const where = clauses.join(' AND ');
    const total = this.db.prepare(`SELECT COUNT(*) n FROM events WHERE ${where}`).get(...args).n;
    const items = this.db.prepare(`SELECT * FROM events WHERE ${where} ORDER BY at DESC,id DESC LIMIT ? OFFSET ?`).all(...args, query.limit, query.offset)
      .map(row => { let data = null; try { data = row.data ? JSON.parse(row.data) : null; } catch {} return { ...row, data }; });
    const kinds = this.db.prepare(`SELECT kind key,COUNT(*) events,COALESCE(SUM(status='error'),0) errors,
      COALESCE(SUM(CASE WHEN savedTokens>0 THEN savedTokens END),0) savedTokens,COALESCE(SUM(count),0) count,MAX(at) lastAt
      FROM events WHERE ${scoped} GROUP BY kind`).all(...scopedArgs);
    const statuses = this.db.prepare(`SELECT status key,COUNT(*) events FROM events WHERE ${scoped} GROUP BY status`).all(...scopedArgs);
    return { generatedAt: this.now(), total, items, kinds, statuses, offset: query.offset, limit: query.limit };
  }
  hasSession(id) {
    return Boolean(this.db && !this.closed && this.db.prepare('SELECT 1 FROM calls WHERE sessionId=? LIMIT 1').get(id));
  }
  optimizationSnapshot(sessionId) {
    if (!this.db || this.closed) throw Error(this.error || '监控账本不可用');
    this.optimizationCache ??= new Map();
    const revision = this.db.prepare('SELECT COUNT(*) n,MAX(rowid) last FROM events WHERE sessionId=? AND kind=?').get(sessionId, 'toolOptimization');
    const key = `${revision.n}:${revision.last}`, cached = this.optimizationCache.get(sessionId);
    if (cached?.key === key) return cached.value;
    const value = emptyOptimization();
    for (const entry of this.db.prepare('SELECT data FROM events WHERE sessionId=? AND kind=? ORDER BY at,id').iterate(sessionId, 'toolOptimization')) {
      if (entry.data) addOptimization(value, JSON.parse(entry.data));
    }
    this.optimizationCache.set(sessionId, { key, value });
    while (this.optimizationCache.size > 128) this.optimizationCache.delete(this.optimizationCache.keys().next().value);
    return value;
  }
  import(states) {
    if (!this.db || this.closed) return;
    const pending = states.map(state => [state, monitorActivityFingerprint(state.activity || [])]).filter(([state, signature]) => this.imported.get(state.id) !== signature);
    if (!pending.length) return;
    const imported = []; let opened = false;
    try {
      this.db.exec('SAVEPOINT monitor_import'); opened = true;
      // Reopening archives usually finds receipts already in the ledger. Resolve
      // identities once, then check them in this same write snapshot before doing
      // usage normalization or INSERT OR IGNORE for every historical entry.
      const batches = pending.map(([state, signature]) => {
        const duplicates = new Map(), entries = [];
        for (const entry of state.activity || []) {
          if (number(entry.at) === null) continue; // Undated totals cannot enter the timeline.
          let id = entry.id;
          if (!id) {
            const key = hash([state.id, entry]), ordinal = duplicates.get(key) || 0;
            duplicates.set(key, ordinal + 1); id = `legacy:${key}:${ordinal}`;
          }
          entries.push({ entry, id });
        }
        return { state, signature, entries };
      });
      // INSERT OR IGNORE used to acquire a writer reservation before any read.
      // Keep that protection: a competing writer must not invalidate the lookup
      // snapshot before a missing receipt or timing can be inserted. No rows change.
      if (batches.some(({ entries }) => entries.length)) this.db.exec('UPDATE calls SET id=id WHERE 0');
      const ids = batches.flatMap(({ entries }) => entries.map(({ id }) => text(id, 512))).filter(Boolean);
      const existing = new Map(this.db.prepare(`SELECT id,EXISTS(SELECT 1 FROM call_timings WHERE call_timings.id=calls.id) timed
        FROM calls WHERE id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids)).map(row => [row.id, row.timed]));
      // The old ring is intentionally not promoted to complete historical data.
      for (const { state, signature, entries } of batches) {
        let complete = true;
        for (const { entry, id } of entries) {
          const key = text(id, 512);
          if (existing.has(key) && (number(entry.firstTokenMs) === null || existing.get(key))) continue;
          if (!this.append({ ...entry, id, sessionId: state.id, source: entry.source || 'legacy' })) complete = false;
        }
        if (complete) imported.push([state.id, signature]);
      }
      this.db.exec('RELEASE monitor_import');
      for (const [id, signature] of imported) this.imported.set(id, signature);
    } catch (error) {
      if (opened) try { this.db.exec('ROLLBACK TO monitor_import; RELEASE monitor_import'); } catch {}
      this.error = String(error.message);
    }
  }
  metricCacheKey(query, args, upperIndex) {
    // Read versions inside the transaction so external writers cannot race a cache hit.
    const version = this.db.prepare('SELECT total_changes() changes,(SELECT data_version FROM pragma_data_version) version,(SELECT MAX(at) FROM calls) lastAt').get();
    const effective = [...args];
    if (upperIndex !== undefined) effective[upperIndex] = Math.min(effective[upperIndex], version.lastAt ?? effective[upperIndex]);
    return hash([version.changes - this.eventChanges, version.version, query, effective]);
  }
  metricRows(cacheName, sql, args, upperIndex) {
    const key = this.metricCacheKey(sql, args, upperIndex);
    let rows = this[cacheName]?.key === key ? this[cacheName].value : null;
    if (!rows) {
      this[cacheName] = null;
      rows = this.db.prepare(sql).all(...args);
      // One result per read family, with the same bound as grouped metrics.
      // Never retain receipt bodies, errors or caller-owned mutable counters.
      if (Buffer.byteLength(JSON.stringify(rows)) <= 512 * 1024) this[cacheName] = { key, value: rows };
    }
    return rows.map(row => Object.assign(Object.create(Object.getPrototypeOf(row)), row));
  }
  metricGroups(where, args, upperIndex) {
    const key = this.metricCacheKey(where, args, upperIndex);
    let value = this.groupCache?.key === key ? this.groupCache.value : null;
    if (!value) {
      this.groupCache = null;
      value = groupedMetrics(this.db, where, args);
      if (Buffer.byteLength(JSON.stringify(value)) <= 512 * 1024) this.groupCache = { key, value };
    }
    const copy = row => Object.assign(Object.create(Object.getPrototypeOf(row)), row);
    return Object.fromEntries(Object.entries(value).map(([group, rows]) => [group, Array.isArray(rows) ? rows.map(copy) : copy(rows)]));
  }
  overviewMetrics(where, args, upperIndex, grain) {
    // Only derived readings are retained. Pricing, live spans and empty time
    // buckets still follow the current request, not the cached read snapshot.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const key = this.metricCacheKey([where, grain, zone, process.env.TZ], args, upperIndex);
    let value = this.overviewCache?.key === key ? this.overviewCache.value : null;
    if (!value) {
      this.overviewCache = null;
      const performance = this.db.prepare(`SELECT AVG(t.firstTokenMs) avgFirstTokenMs,COUNT(t.firstTokenMs) firstTokenCalls,
        COALESCE(SUM(CASE WHEN c.outputTokens>=0 AND c.durationMs>t.firstTokenMs THEN c.outputTokens END),0) decodeTokens,
        COALESCE(SUM(CASE WHEN c.outputTokens>=0 AND c.durationMs>t.firstTokenMs THEN c.durationMs-t.firstTokenMs END),0) decodeMs,
        COUNT(CASE WHEN c.outputTokens>=0 AND c.durationMs>t.firstTokenMs THEN 1 END) tpsCalls
        FROM calls c LEFT JOIN call_timings t ON t.id=c.id WHERE ${where}`).get(...args);
      const sessionSpans = this.db.prepare(`SELECT sessionId,
        MIN(CASE WHEN startedAt<=at THEN startedAt WHEN durationMs<=at THEN at-durationMs ELSE at END) startedAt,
        MAX(at) endedAt,COUNT(*) calls,
        SUM(CASE WHEN startedAt<=at OR durationMs<=at THEN 0 ELSE 1 END) untimedCalls
        FROM calls WHERE ${where} GROUP BY sessionId`).all(...args);
      const buckets = this.db.prepare(`SELECT strftime('${grain}',at/1000,'unixepoch','localtime') label,MIN(at) at,${metricsSQL},
        COALESCE(SUM(CASE WHEN kind IN ('main','subagent') THEN ${knownTotalSQL} END),0) main,
        COALESCE(SUM(CASE WHEN kind NOT IN ('main','subagent') THEN ${knownTotalSQL} END),0) background
        FROM calls WHERE ${where} GROUP BY label ORDER BY label`).all(...args);
      const modelBuckets = this.db.prepare(`SELECT strftime('${grain}',at/1000,'unixepoch','localtime') label,
        NULLIF(model,'') model,COALESCE(SUM(${knownTotalSQL}),0) tokens FROM calls WHERE ${where} GROUP BY label,NULLIF(model,'')`).all(...args);
      value = { performance, sessionSpans, buckets, modelBuckets };
      // One overview, at most 512 KiB serialized; large histories still use
      // the same uncached queries. Never retain receipts or caller mutations.
      if (Buffer.byteLength(JSON.stringify(value)) <= 512 * 1024) this.overviewCache = { key, value };
    }
    const copy = row => Object.assign(Object.create(Object.getPrototypeOf(row)), row);
    return { performance: copy(value.performance), sessionSpans: value.sessionSpans.map(copy),
      buckets: value.buckets.map(copy), modelBuckets: value.modelBuckets.map(copy) };
  }
  receiptCosts(where, args, upperIndex, grain, costOf, pricing) {
    // Only known immutable pricing catalogs opt in; arbitrary callbacks stay live.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const key = pricing ? this.metricCacheKey([where, grain, zone, process.env.TZ], args, upperIndex) : null;
    let value = pricing && this.costCache?.key === key && this.costCache.catalog === pricing.catalog
      && this.costCache.custom === pricing.custom ? this.costCache.value : null;
    if (!value) {
      this.costCache = null;
      const summary = { totals: [], unpricedCalls: 0, partialCalls: 0 }, buckets = new Map(), totals = new Map();
      // Preserve receipt order, per-call tiers, missing usage and floating-point sums.
      const receipts = this.db.prepare(`SELECT strftime('${grain}',at/1000,'unixepoch','localtime') label,provider,model,${fields.join(',')} FROM calls WHERE ${where}`);
      // Stream positional rows directly into the callback contract. Avoid a
      // named SQLite object plus filter/map entry arrays for every receipt.
      const positional = typeof receipts.setReturnArrays === 'function';
      if (positional) receipts.setReturnArrays(true);
      for (const entry of receipts.iterate(...args)) {
        // Some non-LTS Node releases lack the array API; keep them readable.
        const row = positional ? entry : [entry.label, entry.provider, entry.model, ...fields.map(key => entry[key])];
        const label = row[0], usage = {};
        for (let i = 0; i < fields.length; i++) if (row[i + 3] !== null) usage[fields[i]] = row[i + 3];
        let bucket = buckets.get(label);
        if (!bucket) { bucket = { label, costs: {}, unpricedCalls: 0 }; buckets.set(label, bucket); }
        const cost = costOf({ provider: row[1], model: row[2], usage });
        if (!cost) { summary.unpricedCalls++; bucket.unpricedCalls++; continue; }
        const total = totals.get(cost.currency) || { currency: cost.currency, amount: 0, calls: 0 };
        total.amount += cost.amount; total.calls++; totals.set(cost.currency, total);
        if (cost.partial) summary.partialCalls++;
        bucket.costs[cost.currency] = (bucket.costs[cost.currency] || 0) + cost.amount;
      }
      summary.totals = [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
      value = { summary, buckets: [...buckets.values()] };
      // One selection, at most 512 KiB including custom rates; never retain receipts.
      if (pricing && Buffer.byteLength(JSON.stringify(value)) + Buffer.byteLength(pricing.custom) <= 512 * 1024) {
        this.costCache = { key, catalog: pricing.catalog, custom: pricing.custom, value };
      }
    }
    return { summary: { ...value.summary, totals: value.summary.totals.map(row => ({ ...row })) },
      buckets: new Map(value.buckets.map(row => [row.label, { ...row, costs: { ...row.costs } }])) };
  }
  query(states, ids, query, costOf, { callsOnly = false, usageOnly = false, costCacheKey } = {}) {
    if (!this.db || this.closed) throw Error(this.error || '监控账本不可用');
    this.import(states);
    const scope = query.range === 'all' ? '1=1' : 'sessionId IN (SELECT value FROM json_each(?))';
    const scopeArgs = query.range === 'all' ? [] : [JSON.stringify([...ids])];
    const fingerprint = hash({ range: query.range, period: query.period, status: query.status, limit: query.limit,
      provider: query.provider, model: query.model, kind: query.kind, query: query.query,
      ids: query.range === 'all' ? [] : [...ids].sort(), session: query.range === 'all' ? null : query.session });
    let cursor = null, from = query.from, until = query.to;
    if (query.cursor) {
      if (typeof query.cursor !== 'string' || query.cursor.length > 1800 || !/^[\w-]+$/.test(query.cursor)) throw Error('监控分页标记无效');
      try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url')); } catch { throw Error('监控分页标记无效'); }
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)
        || typeof cursor.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.fingerprint)) throw Error('监控分页标记无效');
      if (cursor.fingerprint !== fingerprint) throw Error('筛选已变化，请重新读取调用记录');
      if (number(cursor.from) === null || number(cursor.until) === null || number(cursor.at) === null
        || cursor.from > cursor.until || cursor.until > query.to || cursor.at < cursor.from || cursor.at > cursor.until
        || typeof cursor.id !== 'string' || !cursor.id.length || cursor.id.length > 512
        || cursor.from !== monitorQuery({ period: query.period }, cursor.until).from) throw Error('监控分页标记无效');
      // Relative periods are evaluated once; midnight must not change a page's
      // lower bound or look like an intentional filter change.
      from = cursor.from; until = cursor.until;
    }
    const clauses = [scope, 'at>=?', 'at<=?'], args = [...scopeArgs, from, until];
    for (const key of ['provider', 'model', 'kind']) if (query[key]) { clauses.push(`${key}=?`); args.push(query[key]); }
    if (query.status !== 'all') { clauses.push('status=?'); args.push(query.status); }
    if (query.query) {
      clauses.push("(instr(lower(COALESCE(provider,'')||' '||COALESCE(model,'')||' '||kind||' '||COALESCE(error,'')),lower(?))>0)"); args.push(query.query);
    }
    const where = clauses.join(' AND ');
    // One synchronous read transaction keeps all widgets on the same snapshot.
    this.db.exec('BEGIN');
    try {
      const { totals, ...groups } = usageOnly
        ? { totals: emptyMonitorMetric(), components: this.metricRows('usageCache', `SELECT kind key,${metricsSQL} FROM calls WHERE ${where} GROUP BY kind ORDER BY knownTotalTokens DESC`, args, scopeArgs.length + 1) }
        : callsOnly ? { totals: this.db.prepare(`SELECT ${metricsSQL} FROM calls WHERE ${where}`).get(...args), components: [] }
        : this.metricGroups(where, args, scopeArgs.length + 1);
      let performance, overview, first, grain;
      if (!callsOnly && !usageOnly) {
        first = this.db.prepare(`SELECT MIN(at) at FROM calls WHERE ${where}`).get(...args).at;
        grain = query.period === 'today' ? '%Y-%m-%d %H:00' : first != null && until - first > 90 * 86400000 ? '%Y-%m' : '%Y-%m-%d';
        overview = this.overviewMetrics(where, args, scopeArgs.length + 1, grain);
        performance = overview.performance;
        performance.avgTps = performance.decodeMs > 0 ? performance.decodeTokens / (performance.decodeMs / 1000) : null;
        performance.sessionSpans = overview.sessionSpans;
      }
      const metrics = Object.fromEntries(groups.components.map(({ key, ...value }) => [key, value]));
      const legacy = this.legacy(states, scope, scopeArgs);
      const includeLegacy = query.period === 'all' && !query.provider && !query.model && !query.query && query.status === 'all';
      let legacyCalls = 0;
      for (const [kind, value] of Object.entries(legacy)) {
        legacyCalls += value.calls;
        if (includeLegacy && (!query.kind || query.kind === kind)) {
          addMonitorMetric(totals, value); addMonitorMetric(metrics[kind] ||= emptyMonitorMetric(), value);
        }
      }
      if (usageOnly) {
        this.db.exec('COMMIT');
        return { generatedAt: this.now(), range: query.range, period: query.period, selection: { ...query, cursor: undefined, from, to: until }, metrics };
      }
      if (includeLegacy && !callsOnly) {
        groups.components = Object.entries(metrics).map(([key, value]) => ({ key, ...value }));
        const rest = Object.entries(legacy).filter(([kind]) => !query.kind || query.kind === kind).reduce((m, [, value]) => addMonitorMetric(m, value), emptyMonitorMetric());
        if (rest.calls) for (const name of ['models', 'providers', 'sessions']) groups[name].push({ key: 'legacy-unattributed', label: '历史累计（未归因）', ...rest });
      }
      let series, seriesSplit, costSummary;
      if (!callsOnly) {
        const { buckets, modelBuckets } = overview;
        series = buckets.map(({ main, background, ...row }) => row);
        const split = buckets.map(({ label, main, background, errors, calls }) => ({ label, main, background, errors, calls }));
        seriesSplit = fillBuckets(split, grain, query.period === 'all' ? first : from, Math.min(until, this.now()), { main: 0, background: 0, errors: 0, calls: 0 });
        const byLabel = new Map(seriesSplit.map(row => [row.label, row]));
        for (const row of seriesSplit) row.models = {};
        for (const row of modelBuckets) byLabel.get(row.label).models[JSON.stringify(row.model)] = row.tokens;
        costSummary = { totals: [], unpricedCalls: 0, partialCalls: 0 };
        if (costOf) {
          const costs = this.receiptCosts(where, args, scopeArgs.length + 1, grain, costOf, costCacheKey);
          costSummary = costs.summary;
          for (const row of seriesSplit) {
            const bucket = costs.buckets.get(row.label);
            row.costs = bucket?.costs || {}; row.unpricedCalls = bucket?.unpricedCalls || 0;
          }
          if (includeLegacy) costSummary.unpricedCalls += Object.entries(legacy).filter(([kind]) => !query.kind || query.kind === kind).reduce((n, [, value]) => n + value.calls, 0);
        }
      }
      const pageClause = cursor ? ' AND (at<? OR (at=? AND id<?))' : '';
      const items = this.db.prepare(`SELECT *,(SELECT firstTokenMs FROM call_timings WHERE call_timings.id=calls.id) firstTokenMs FROM calls WHERE ${where}${pageClause} ORDER BY at DESC,id DESC LIMIT ?`).all(...args, ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), query.limit + 1);
      const more = items.length > query.limit; items.length = Math.min(items.length, query.limit);
      const activity = items.map(row => {
        const usage = Object.fromEntries(fields.filter(key => row[key] !== null).map(key => [key, row[key]]));
        const value = Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
        return { ...value, usage: Object.keys(usage).length ? usage : null };
      });
      const tail = items.at(-1), nextCursor = more ? Buffer.from(JSON.stringify({ fingerprint, from, until, at: tail.at, id: tail.id })).toString('base64url') : null;
      // Unary + keeps the values and sort order, but isolates this index from
      // receipt queries: changing their scan order can change floating-point costs.
      // Scoped reads already use the session index; keep their original query.
      const columns = query.range === 'all' ? '+provider provider,+model model,+kind kind' : 'provider,model,kind';
      const order = query.range === 'all' ? '+provider,+model,+kind' : 'provider,model,kind';
      const available = this.db.prepare(`SELECT DISTINCT ${columns} FROM calls WHERE ${scope} ORDER BY ${order}`).all(...scopeArgs);
      const count = this.db.prepare(`SELECT COUNT(*) total FROM calls WHERE ${where}`).get(...args).total;
      const sessionIds = callsOnly ? [] : this.db.prepare(`SELECT DISTINCT sessionId FROM calls WHERE ${scope} AND sessionId IS NOT NULL`).all(...scopeArgs).map(row => row.sessionId);
      const messages = [];
      if (legacyCalls) messages.push(`${legacyCalls} 次较早调用仅保留累计统计，无法按日期或模型归因；趋势和明细只含有记录的调用。`);
      if (totals.usageUnreported) messages.push(`${totals.usageUnreported} 次调用未返回可用用量。`);
      if (totals.unmetered > totals.usageUnreported) messages.push(`${totals.unmetered - totals.usageUnreported} 次调用仅返回部分用量；已知值保留，≥ 表示已知下界，不是完整消耗。`);
      if (totals.cacheUnreported) messages.push(`${totals.cacheUnreported} 次调用未单独披露缓存读取。`);
      if (totals.cacheWriteUnreported) messages.push(`${totals.cacheWriteUnreported} 次调用未单独披露缓存写入；未知不按零计。`);
      if (totals.durationUnreported) messages.push(`${totals.durationUnreported} 次调用未记录耗时；未知不按零计${totals.durationMs === null ? '。' : '，已知耗时仅为下界。'}`);
      if (this.error) messages.push('部分监控记录写入失败；原生执行不受影响。');
      this.db.exec('COMMIT');
      return { generatedAt: this.now(), range: query.range, period: query.period, selection: { ...query, cursor: undefined, from, to: until },
        ...(callsOnly ? {} : { sessionCount: new Set([...states.map(state => state.id), ...sessionIds]).size,
          metrics, groups, series, seriesSplit, costSummary, performance }),
        totals, activity, activityTotal: count, nextCursor,
        filters: { providers: [...new Set(available.map(row => row.provider).filter(Boolean))], models: [...new Map(available.filter(row => row.model).map(row => [JSON.stringify([row.provider, row.model]), { provider: row.provider, model: row.model }])).values()], kinds: [...new Set(available.map(row => row.kind))] },
        coverage: { partial: Boolean(legacyCalls || this.error), legacyCalls, unmetered: totals.unmetered,
          usageUnreported: totals.usageUnreported, cacheUnreported: totals.cacheUnreported, cacheWriteUnreported: totals.cacheWriteUnreported,
          durationUnreported: totals.durationUnreported, startedAt: this.startedAt,
          message: messages.join(' '), scope: 'OMD 主会话、其真实子代理及已记录后台调用；不包含未接入的原生预设或侧问。' } };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  legacy(states, scope, args) {
    if (!states.some(state => Object.values(state.metrics || {}).some(metric => metric.calls > 0))) return {};
    // Most old counters are already covered by receipts. Only reconcile token
    // and timing subtotals for groups that still have unrecorded calls. Both
    // reads stay in query()'s transaction; live saved counters are never cached.
    const counts = this.metricRows('legacyCountCache', `SELECT sessionId,kind,COUNT(*) calls FROM calls WHERE ${scope} AND source!='dream' GROUP BY sessionId,kind`, args);
    const callsById = new Map(counts.map(row => [JSON.stringify([row.sessionId, row.kind]), row.calls]));
    const needed = [];
    for (const state of states) for (const [kind, saved] of Object.entries(state.metrics || {})) {
      if ((saved.calls || 0) > (callsById.get(JSON.stringify([state.id, kind])) || 0)) needed.push({ state, kind, saved });
    }
    if (!needed.length) return {};
    const seen = this.metricRows('legacyCache', `SELECT sessionId,kind,${metricsSQL} FROM calls WHERE ${scope} AND source!='dream'
      AND (sessionId,kind) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)) GROUP BY sessionId,kind`,
    [...args, JSON.stringify(needed.map(({ state, kind }) => [state.id, kind]))]);
    const byId = new Map(seen.map(row => [JSON.stringify([row.sessionId, row.kind]), row])), result = {};
    for (const { state, kind, saved } of needed) {
      const known = byId.get(JSON.stringify([state.id, kind])) || emptyMonitorMetric(), calls = Math.max(0, (saved.calls || 0) - known.calls);
      if (!calls) continue;
      const value = emptyMonitorMetric();
      for (const key of additive) value[key] = Math.max(0, (number(saved[key]) || 0) - (known[key] || 0));
      // The old counter treated interrupted calls as errors; the new ledger
      // separates cancellation. Subtract both before carrying the remainder.
      value.errors = Math.max(0, (saved.errors || 0) - known.errors - known.cancelled);
      const entirelyUnmetered = value.unmetered >= calls;
      value.calls = calls; value.unmetered = calls;
      value.cacheUnreported = calls; value.cacheWriteUnreported = calls;
      // Historical counters have no per-field receipt coverage, even when the
      // old unmetered counter is absent. Keep positive remainders as lower
      // bounds; missing fields and inherited initializer zeros prove nothing.
      value.inputBucketUnreported = calls; value.outputUnreported = calls;
      value.totalUnreported = calls; value.inputUnreported = calls;
      value.peakContext = number(saved.peakContext) > 0 ? saved.peakContext : null;
      for (const key of [...fields, 'durationMs']) {
        if (number(saved[key]) === null || value[key] === 0) value[key] = null;
      }
      value.durationUnreported = calls;
      const knownSum = keys => keys.some(key => value[key] !== null)
        ? keys.reduce((sum, key) => sum + (value[key] || 0), 0) : null;
      value.inputTotalTokens = entirelyUnmetered ? null : knownSum(['inputTokens', 'cacheReadTokens', 'cacheWriteTokens']);
      if (saved.totalTokens == null) value.totalTokens = entirelyUnmetered ? null : knownSum(['inputTotalTokens', 'outputTokens']);
      value.knownInputTokens = value.inputTotalTokens ?? knownSum(['inputTokens', 'cacheReadTokens', 'cacheWriteTokens']);
      value.knownTotalTokens = value.totalTokens ?? knownSum(['knownInputTokens', 'outputTokens']);
      value.usageUnreported = value.knownTotalTokens === null ? calls : 0;
      addMonitorMetric(result[kind] ||= emptyMonitorMetric(), value);
    }
    return result;
  }
  close() { this.closed = true; this.groupCache = null; this.usageCache = null; this.legacyCache = null; this.legacyCountCache = null; this.overviewCache = null; this.costCache = null; try { this.db?.close(); } catch (error) { this.error = String(error.message); } }
}

// Empty buckets keep the console trend on a steady time axis. Labels follow
// SQLite's localtime strftime, which uses this process's time zone as Date does.
function fillBuckets(rows, grain, start, end, blank) {
  if (!rows.length || number(start) === null) return rows;
  const p2 = n => String(n).padStart(2, '0'), hour = grain.includes('%H'), month = grain === '%Y-%m';
  const label = d => month ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
    : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}${hour ? ` ${p2(d.getHours())}:00` : ''}`;
  const d = new Date(start); d.setMinutes(0, 0, 0); if (!hour) d.setHours(0); if (month) d.setDate(1);
  const byLabel = new Map(rows.map(row => [row.label, row])), out = [];
  while (d.getTime() <= end && out.length < 400) {
    const key = label(d); out.push(byLabel.get(key) ?? { label: key, ...blank }); byLabel.delete(key);
    if (hour) d.setHours(d.getHours() + 1); else if (month) d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 1);
  }
  return [...out, ...byLabel.values()].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}
