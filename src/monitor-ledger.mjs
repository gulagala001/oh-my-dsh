import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens'];
const additive = ['calls', 'errors', 'cancelled', 'unmetered', 'inputUnreported', 'cacheUnreported', 'durationMs', 'inputTotalTokens', ...fields];
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const text = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inputSQL = `CASE WHEN totalTokens>=outputTokens THEN totalTokens-outputTokens
  ELSE inputTokens+cacheReadTokens+cacheWriteTokens END`;
const metricsSQL = `COUNT(*) calls, COALESCE(SUM(status='error'),0) errors,
  COALESCE(SUM(status='cancelled'),0) cancelled, COALESCE(SUM(totalTokens IS NULL OR outputTokens IS NULL OR (${inputSQL}) IS NULL),0) unmetered,
  COALESCE(SUM(cacheReadTokens IS NULL),0) cacheUnreported, COALESCE(SUM(durationMs),0) durationMs,
  COALESCE(SUM((${inputSQL}) IS NULL),0) inputUnreported,
  CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${inputSQL}) END inputTotalTokens,
  ${fields.map(key => `CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(${key}) END ${key}`).join(',')},
  CASE WHEN COUNT(*)=0 THEN 0 ELSE MAX(${inputSQL}) END peakContext`;

export const emptyMonitorMetric = () => Object.fromEntries([...additive, 'peakContext'].map(key => [key, 0]));
export function addMonitorMetric(target, value) {
  const calls = target.calls || 0;
  for (const key of additive) {
    if (fields.includes(key) || key === 'inputTotalTokens') {
      const before = calls ? number(target[key]) : null, next = value?.calls ? number(value[key]) : null;
      target[key] = before === null && next === null ? null : (before || 0) + (next || 0);
    } else target[key] = (target[key] || 0) + (number(value?.[key]) || 0);
  }
  const before = calls ? number(target.peakContext) : null, next = value?.calls ? number(value.peakContext) : null;
  target.peakContext = before === null && next === null ? null : Math.max(before || 0, next || 0);
  return target;
}

// Missing optional buckets stay missing. In particular a missing cache reading
// is not evidence of a cache miss, and reasoning is a subset of output.
export function reportedMonitorUsage(usage, hasOutput = false) {
  // pi-ai can emit its all-zero initializer even when no usage receipt arrived.
  // Once output exists, those zeros cannot establish measured consumption.
  const values = fields.map(key => number(usage?.[key]));
  return hasOutput && values.some(value => value === 0) && values.every(value => value === null || value === 0) ? null : usage;
}
export function monitorUsage(usage) {
  const result = Object.fromEntries(fields.map(key => [key, number(usage?.[key])]));
  if (result.totalTokens === null && ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(key => result[key] !== null)) {
    result.totalTokens = result.inputTokens + result.outputTokens + result.cacheReadTokens + result.cacheWriteTokens;
  }
  return result;
}
export function monitorInput(usage) {
  const u = monitorUsage(usage);
  if (u.totalTokens !== null && u.outputTokens !== null && u.totalTokens >= u.outputTokens) return u.totalTokens - u.outputTokens;
  return ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(key => u[key] !== null)
    ? u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens : null;
}

export function monitorQuery(params, now = Date.now()) {
  const get = key => params instanceof URLSearchParams ? params.get(key) : params?.[key];
  const range = get('range') || 'session', period = get('period') || 'all', status = get('status') || 'all';
  if (!['session', 'all'].includes(range) || !['all', 'today', '7d', '30d'].includes(period) || !['all', 'error', 'cancelled'].includes(status)) throw Error('监控筛选无效');
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

/** Derived metadata only; no messages, credentials or tool arguments are stored. */
export class MonitorLedger {
  constructor(directory, { now = Date.now } = {}) {
    this.now = now; this.error = null; this.imported = new Map(); this.closed = false;
    try {
      mkdirSync(join(directory, 'monitor-v1'), { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(join(directory, 'monitor-v1', 'usage.sqlite'));
      // Monitoring must not delay execution behind another process's database lock.
      this.db.exec(`PRAGMA busy_timeout=50; PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,sessionId TEXT,kind TEXT NOT NULL,
          at REAL NOT NULL,provider TEXT,model TEXT,status TEXT NOT NULL,source TEXT NOT NULL,
          turn INTEGER,step INTEGER,eventSeq INTEGER,startedAt REAL,durationMs REAL,effort TEXT,error TEXT,
          inputTokens REAL,outputTokens REAL,cacheReadTokens REAL,cacheWriteTokens REAL,reasoningTokens REAL,totalTokens REAL);
        CREATE INDEX IF NOT EXISTS monitor_session_time ON calls(sessionId,at DESC,id);
        CREATE INDEX IF NOT EXISTS monitor_time ON calls(at DESC,id);
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
      const schema = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('schema');
      if (schema && schema.value !== '1') throw Error('监控数据版本不兼容');
      this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('schema', '1');
      this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('startedAt', String(now()));
      this.startedAt = Number(this.db.prepare('SELECT value FROM metadata WHERE key=?').get('startedAt').value);
      this.insert = this.db.prepare('INSERT OR IGNORE INTO calls VALUES(' + Array(21).fill('?').join(',') + ')');
    } catch (error) {
      this.error = String(error.message); try { this.db?.close(); } catch {} this.db = null;
    }
  }
  append(entry) {
    if (!this.db || this.closed) return false;
    try {
      const u = monitorUsage(reportedMonitorUsage(entry.usage, entry.hasOutput)), id = text(entry.id, 512) || randomUUID();
      const status = ['success', 'error', 'cancelled'].includes(entry.status) ? entry.status : entry.error ? 'error' : 'success';
      this.insert.run(id, text(entry.sessionId), text(entry.kind) || 'unknown', number(entry.at) ?? this.now(),
        text(entry.provider), text(entry.model), status, text(entry.source) || 'background',
        number(entry.turn), number(entry.step), number(entry.eventSeq), number(entry.startedAt), number(entry.durationMs),
        text(entry.effort), text(entry.error, 2000), ...fields.map(key => u[key]));
      return true;
    } catch (error) { this.error = String(error.message); return false; }
  }
  hasSession(id) {
    return Boolean(this.db && !this.closed && this.db.prepare('SELECT 1 FROM calls WHERE sessionId=? LIMIT 1').get(id));
  }
  import(states) {
    // The old ring is intentionally not promoted to complete historical data.
    for (const state of states) {
      const signature = hash(state.activity || []);
      if (this.imported.get(state.id) === signature) continue;
      const duplicates = new Map(); let complete = true;
      for (const entry of state.activity || []) {
        if (number(entry.at) === null) continue; // Old undated totals cannot be placed on today's timeline.
        const key = hash([state.id, entry]), ordinal = duplicates.get(key) || 0; duplicates.set(key, ordinal + 1);
        if (!this.append({ ...entry, id: entry.id || `legacy:${key}:${ordinal}`, sessionId: state.id, source: entry.source || 'legacy' })) complete = false;
      }
      if (complete) this.imported.set(state.id, signature);
    }
  }
  query(states, ids, query) {
    if (!this.db || this.closed) throw Error(this.error || '监控账本不可用');
    this.import(states);
    const scope = query.range === 'all' ? '1=1' : 'sessionId IN (SELECT value FROM json_each(?))';
    const scopeArgs = query.range === 'all' ? [] : [JSON.stringify([...ids])];
    const clauses = [scope, 'at>=?', 'at<=?'], args = [...scopeArgs, query.from, query.to];
    for (const key of ['provider', 'model', 'kind']) if (query[key]) { clauses.push(`${key}=?`); args.push(query[key]); }
    if (query.status !== 'all') { clauses.push('status=?'); args.push(query.status); }
    if (query.query) {
      clauses.push("(instr(lower(COALESCE(provider,'')||' '||COALESCE(model,'')||' '||kind||' '||COALESCE(error,'')),lower(?))>0)"); args.push(query.query);
    }
    const where = clauses.join(' AND '), fingerprint = hash({ ...query,
      ids: query.range === 'all' || query.session ? [] : [...ids].sort(),
      session: query.range === 'all' ? null : query.session, cursor: '', to: 0 });
    let cursor = null, until = query.to;
    if (query.cursor) {
      if (query.cursor.length > 1800) throw Error('监控分页标记无效');
      try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url')); } catch { throw Error('监控分页标记无效'); }
      if (cursor?.fingerprint !== fingerprint || !Number.isFinite(cursor.at) || typeof cursor.id !== 'string' || cursor.id.length > 512 || !Number.isFinite(cursor.until) || cursor.until > query.to || cursor.at > cursor.until) throw Error('筛选已变化，请重新读取调用记录');
      until = cursor.until; args[scopeArgs.length + 1] = until;
    }
    // One synchronous read transaction keeps all widgets on the same snapshot.
    this.db.exec('BEGIN');
    try {
      const totals = this.db.prepare(`SELECT ${metricsSQL} FROM calls WHERE ${where}`).get(...args);
      const group = column => this.db.prepare(`SELECT ${column} key,${metricsSQL} FROM calls WHERE ${where} GROUP BY ${column} ORDER BY totalTokens DESC`).all(...args);
      const components = group('kind'), metrics = Object.fromEntries(components.map(({ key, ...value }) => [key, value]));
      const models = this.db.prepare(`SELECT provider,model,${metricsSQL} FROM calls WHERE ${where} GROUP BY provider,model ORDER BY totalTokens DESC`).all(...args).map(row => ({ key: JSON.stringify([row.provider, row.model]), ...row }));
      const groups = { components, models, providers: group('provider'), sessions: group('sessionId') };
      const legacy = this.legacy(states, scope, scopeArgs);
      const includeLegacy = query.period === 'all' && !query.provider && !query.model && !query.query && query.status === 'all';
      let legacyCalls = 0;
      for (const [kind, value] of Object.entries(legacy)) {
        legacyCalls += value.calls;
        if (includeLegacy && (!query.kind || query.kind === kind)) {
          addMonitorMetric(totals, value); addMonitorMetric(metrics[kind] ||= emptyMonitorMetric(), value);
        }
      }
      if (includeLegacy) {
        groups.components = Object.entries(metrics).map(([key, value]) => ({ key, ...value }));
        const rest = Object.entries(legacy).filter(([kind]) => !query.kind || query.kind === kind).reduce((m, [, value]) => addMonitorMetric(m, value), emptyMonitorMetric());
        if (rest.calls) for (const name of ['models', 'providers', 'sessions']) groups[name].push({ key: 'legacy-unattributed', label: '历史累计（未归因）', ...rest });
      }
      const first = this.db.prepare(`SELECT MIN(at) at FROM calls WHERE ${where}`).get(...args).at;
      const grain = query.period === 'today' ? '%Y-%m-%d %H:00' : first != null && until - first > 90 * 86400000 ? '%Y-%m' : '%Y-%m-%d';
      const series = this.db.prepare(`SELECT strftime('${grain}',at/1000,'unixepoch','localtime') label,MIN(at) at,${metricsSQL} FROM calls WHERE ${where} GROUP BY label ORDER BY label`).all(...args);
      const pageClause = cursor ? ' AND (at<? OR (at=? AND id<?))' : '';
      const items = this.db.prepare(`SELECT * FROM calls WHERE ${where}${pageClause} ORDER BY at DESC,id DESC LIMIT ?`).all(...args, ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), query.limit + 1);
      const more = items.length > query.limit; items.length = Math.min(items.length, query.limit);
      const activity = items.map(row => {
        const usage = Object.fromEntries(fields.filter(key => row[key] !== null).map(key => [key, row[key]]));
        const value = Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
        return { ...value, usage: Object.keys(usage).length ? usage : null };
      });
      const tail = items.at(-1), nextCursor = more ? Buffer.from(JSON.stringify({ fingerprint, until, at: tail.at, id: tail.id })).toString('base64url') : null;
      const available = this.db.prepare(`SELECT DISTINCT provider,model,kind FROM calls WHERE ${scope} ORDER BY provider,model,kind`).all(...scopeArgs);
      const count = this.db.prepare(`SELECT COUNT(*) total FROM calls WHERE ${where}`).get(...args).total;
      const messages = [];
      if (legacyCalls) messages.push(`${legacyCalls} 次较早调用仅保留累计统计，无法按日期或模型归因；趋势和明细只含有记录的调用。`);
      if (totals.unmetered) messages.push(`${totals.unmetered} 次调用未返回完整用量。`);
      if (totals.cacheUnreported) messages.push(`${totals.cacheUnreported} 次调用未单独披露缓存读取。`);
      if (this.error) messages.push('部分监控记录写入失败；原生执行不受影响。');
      this.db.exec('COMMIT');
      const sessionIds = this.db.prepare(`SELECT DISTINCT sessionId FROM calls WHERE ${scope} AND sessionId IS NOT NULL`).all(...scopeArgs).map(row => row.sessionId);
      return { generatedAt: this.now(), range: query.range, period: query.period, selection: { ...query, cursor: undefined, to: until },
        sessionCount: new Set([...states.map(state => state.id), ...sessionIds]).size,
        totals, metrics, groups, series, activity, activityTotal: count, nextCursor,
        filters: { providers: [...new Set(available.map(row => row.provider).filter(Boolean))], models: [...new Map(available.filter(row => row.model).map(row => [JSON.stringify([row.provider, row.model]), { provider: row.provider, model: row.model }])).values()], kinds: [...new Set(available.map(row => row.kind))] },
        coverage: { partial: Boolean(legacyCalls || this.error), legacyCalls, unmetered: totals.unmetered, cacheUnreported: totals.cacheUnreported, startedAt: this.startedAt,
          message: messages.join(' '), scope: 'OMD 主会话、其真实子代理及已记录后台调用；不包含未接入的原生预设或侧问。' } };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  legacy(states, scope, args) {
    const seen = this.db.prepare(`SELECT sessionId,kind,${metricsSQL} FROM calls WHERE ${scope} AND source!='dream' GROUP BY sessionId,kind`).all(...args);
    const byId = new Map(seen.map(row => [JSON.stringify([row.sessionId, row.kind]), row])), result = {};
    for (const state of states) for (const [kind, saved] of Object.entries(state.metrics || {})) {
      const known = byId.get(JSON.stringify([state.id, kind])) || emptyMonitorMetric(), calls = Math.max(0, (saved.calls || 0) - known.calls);
      if (!calls) continue;
      const value = emptyMonitorMetric();
      for (const key of additive) value[key] = Math.max(0, (number(saved[key]) || 0) - (known[key] || 0));
      // The old counter treated interrupted calls as errors; the new ledger
      // separates cancellation. Subtract both before carrying the remainder.
      value.errors = Math.max(0, (saved.errors || 0) - known.errors - known.cancelled);
      value.calls = calls; value.cacheUnreported = calls; value.peakContext = saved.peakContext || 0;
      value.inputTotalTokens = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'].reduce((n, key) => n + value[key], 0);
      if (saved.totalTokens == null) value.totalTokens = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].reduce((n, key) => n + value[key], 0);
      if (value.unmetered >= calls) for (const key of [...fields, 'inputTotalTokens', 'peakContext']) value[key] = null;
      addMonitorMetric(result[kind] ||= emptyMonitorMetric(), value);
    }
    return result;
  }
  close() { this.closed = true; try { this.db?.close(); } catch (error) { this.error = String(error.message); } }
}
