import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink, open, link } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const rawPattern = /\bomd-raw:([a-f0-9-]{36})\b/g;
const refPattern = /^omd-raw:([a-f0-9-]{36})$/;
const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const MAX_META_CACHE = 256;
const message = event => event.type === 'tool/result' ? event.data?.message : event.type === 'tool/ptc-dispatch'
  ? { id: 'ptc:' + event.data?.subCallId, toolCallId: event.data?.subCallId, content: event.data?.content, isError: event.data?.isError } : null;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 512;
const termsOf = text => [...new Set((text.toLowerCase().match(/[a-z0-9_./:@-]+|[\p{Script=Han}]/gu) || []).filter(Boolean))];
function indexTerms(text) {
  const terms = termsOf(text.slice(0, 2 * 1024 * 1024));
  return { terms: terms.filter(t => t.length <= 128).slice(0, 8192), indexComplete: text.length <= 2 * 1024 * 1024 && terms.length <= 8192 && terms.every(t => t.length <= 128) };
}
const token = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function literalIndex(text, query, from = 0) {
  const matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  matcher.lastIndex = from; return matcher.exec(text)?.index ?? -1;
}
function cursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^[\w-]+$/.test(value)) throw Error('原文游标无效');
  try { return JSON.parse(Buffer.from(value, 'base64url')); } catch { throw Error('原文游标无效'); }
}
function boundary(text, offset) {
  return offset > 0 && /[\uDC00-\uDFFF]/.test(text[offset] || '') && /[\uD800-\uDBFF]/.test(text[offset - 1]) ? offset - 1 : offset;
}
function integer(value, fallback, min, max, name) {
  value ??= fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`${name} 必须为 ${min}–${max} 的整数`);
  return value;
}

// Derive provenance once for this read from native events. Keep the snapshot
// local: a later read must see imports, new results and the current fork cut.
function accessIndex(session) {
  const events = session.snapshotEvents(), dispatched = new Map(), results = new Map();
  for (const [position, event] of events.entries()) {
    const data = event.data;
    if (event.type === 'tool/call') dispatched.set(data?.callId, { name: data?.name, root: data?.callId, arguments: data?.arguments ?? {} });
    if (event.type === 'tool/ptc-dispatch') {
      const root = dispatched.get(data?.rootCallId), parent = dispatched.get(data?.parentCallId);
      if (root?.name !== 'run_code' || parent?.root !== data.rootCallId) continue;
      dispatched.set(data.subCallId, { name: data.name, root: data.rootCallId, arguments: data.arguments });
    }
    const m = message(event), call = m && dispatched.get(m.toolCallId);
    if (!call || m.isError) continue;
    if (!results.has(m.toolCallId)) results.set(m.toolCallId, []);
    results.get(m.toolCallId).push({ event, position, message: m, call });
  }
  return { eventCount: events.length, inheritedEventCount: session.inheritedEventCount, results };
}

function argumentsHash(call) {
  if (!Object.hasOwn(call, 'hash')) {
    try { call.hash = hash(typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments); }
    catch { call.hash = null; }
  }
  return call.hash;
}

/** Owned files, not an OPS cache. Committed objects are never expired by a TTL. */
export class EvidenceStore {
  constructor(directory) {
    this.dir = join(directory, 'tool-evidence-v1');
    this.ready = mkdir(join(this.dir, 'objects'), { recursive: true, mode: 0o700 });
    this.ready.catch(() => {});
    this.cache = new Map();
    this.index = null;
    this.updates = new Map();
  }
  id(ref) { const match = refPattern.exec(ref); if (!match) throw Error('原文引用无效'); return match[1]; }
  async atomic(path, value) {
    await this.ready;
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { const file = await open(temporary, 'wx', 0o600); try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); } await rename(temporary, path); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  // One reference has one metadata writer. Different archives stay concurrent;
  // failures release the slot so a later verified restoration can continue.
  update(ref, change) {
    this.id(ref);
    const previous = this.updates.get(ref) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(change);
    this.updates.set(ref, current);
    return current.finally(() => { if (this.updates.get(ref) === current) this.updates.delete(ref); });
  }
  async persist(record) {
    await this.atomic(join(this.dir, this.id(record.ref) + '.json'), record);
    this.remember(record);
    return record;
  }
  async storeObject(sourceHash, text) {
    await this.ready;
    const object = join(this.dir, 'objects', sourceHash + '.txt');
    const verify = async () => { if (hash(await readFile(object, 'utf8')) !== sourceHash) throw Error('原文对象校验失败'); };
    try { await verify(); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = `${object}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
      // Publish a complete immutable object once. Other references can reuse it
      // without ever seeing a partially written file or replacing its bytes.
      try { await link(temporary, object); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await verify(); }
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async save({ sessionId, callId, tool, args, text, complete = true, rule, parent, readKey }) {
    if (!validId(sessionId) || !validId(callId) || !validId(tool) || typeof text !== 'string') throw Error('原文身份不完整');
    if (!text.isWellFormed()) throw Error('原文包含无效 Unicode，保留工具原结果');
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_OBJECT_BYTES) throw Error('本次原文超过存档上限，保留工具原结果');
    const sourceHash = hash(text);
    await this.storeObject(sourceHash, text);
    const ref = 'omd-raw:' + randomUUID();
    const record = { version: 1, ref, sessionId, callId, tool, argumentsHash: hash(args ?? {}),
      sourceHash, bytes, characters: text.length, complete, rule, parent, readKey, createdAt: Date.now(),
      ...indexTerms(text), committed: false };
    await this.persist(record);
    await this.indexOwner(record);
    return record;
  }
  async indexOwner(record, owner = record.sessionId) {
    const directory = join(this.dir, 'owners', hash(owner));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, this.id(record.ref)), '', { mode: 0o600 });
  }
  remember(record) {
    this.cache.delete(record.ref); this.cache.set(record.ref, record);
    if (this.cache.size > MAX_META_CACHE) this.cache.delete(this.cache.keys().next().value);
  }
  async meta(ref, retain = true) {
    const id = this.id(ref);
    if (this.cache.has(ref)) return this.cache.get(ref);
    let record;
    try { record = JSON.parse(await readFile(join(this.dir, id + '.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw Object.assign(Error('原文引用不存在或已被删除'), { code: 'ENOENT' }); throw error; }
    if (record.version !== 1 || record.ref !== ref || !/^[a-f0-9]{64}$/.test(record.sourceHash) || !validId(record.sessionId)) throw Error('原文记录校验失败');
    if (retain) this.remember(record); return record;
  }
  commit(ref, event) {
    return this.update(ref, async () => {
      const record = { ...await this.meta(ref) }, m = message(event);
      if (!m || m.toolCallId !== record.callId || m.isError || record.preparedHash && record.preparedHash !== hash(m.content)) return false;
      record.committed = true; record.eventSeq = event.seq; record.messageId = m.id; record.contentHash = hash(m.content);
      await this.persist(record); return true;
    });
  }
  prepare(ref, content) {
    return this.update(ref, async () => this.persist({ ...await this.meta(ref), preparedHash: hash(content) }));
  }
  abandon(ref) {
    return this.update(ref, async () => {
      let record;
      try { record = await this.meta(ref); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (record.committed) return;
      await unlink(join(this.dir, this.id(ref) + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
      this.cache.delete(ref);
      await unlink(join(this.dir, 'owners', hash(record.sessionId), this.id(ref))).catch(error => { if (error.code !== 'ENOENT') throw error; });
      // Content objects may be shared. Never delete one without a full reference scan.
    });
  }
  access(record, session, ancestors = [], index) {
    if (!record.committed || !validId(record.callId) || !validId(record.tool) || !validId(record.messageId)
      || ![record.sourceHash, record.contentHash, record.argumentsHash].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) return false;
    const owners = [record.sessionId, ...(record.importedSessions ?? [])], own = owners.includes(session.id);
    if (!own && !ancestors.some(id => owners.includes(id))) return false;
    index ??= accessIndex(session);
    const cut = own ? index.eventCount : index.inheritedEventCount;
    if (!Number.isSafeInteger(cut) || cut < 0 || cut > index.eventCount) return false;
    for (const item of index.results.get(record.callId) || []) {
      const m = item.message;
      if (item.position >= cut || item.call.name !== record.tool || m.id !== record.messageId || argumentsHash(item.call) !== record.argumentsHash) continue;
      if ((item.contentHash ??= hash(m.content)) === record.contentHash) {
        const body = item.text ??= m.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        if ((item.sourceHash ??= hash(body)) === record.sourceHash || body.includes(record.ref) && body.includes(record.sourceHash)) return true;
      }
    }
    return false;
  }
  async text(record, signal) {
    signal?.throwIfAborted();
    const text = await readFile(join(this.dir, 'objects', record.sourceHash + '.txt'), { encoding: 'utf8', signal });
    signal?.throwIfAborted();
    if (hash(text) !== record.sourceHash) throw Error('原文内容校验失败，不使用当前同名文件代替');
    return text;
  }
  async list(session, ancestors = [], signal, index) {
    signal?.throwIfAborted();
    await this.ready;
    const result = [];
    const names = new Set();
    for (const id of [session.id, ...ancestors]) {
      signal?.throwIfAborted();
      let entries;
      try { entries = await readdir(join(this.dir, 'owners', hash(id))); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      for (const entry of entries) if (/^[a-f0-9-]{36}$/.test(entry)) names.add(entry + '.json');
    }
    signal?.throwIfAborted();
    index ??= accessIndex(session);
    for (const name of names) {
      signal?.throwIfAborted();
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      // A sweep larger than the cache must not evict every useful entry before
      // reaching it. Ordinary reads/writes still admit their current record.
      let record;
      try { record = await this.meta('omd-raw:' + name.slice(0, -5), this.cache.size < MAX_META_CACHE); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      // A process can end between durable tool/result and the observation hook.
      // Recover only our pre-published hash plus a genuine authorized event pair.
      if (!record.committed && record.preparedHash) for (const item of index.results.get(record.callId) || []) {
        const { event, message: m } = item;
        if ((item.contentHash ??= hash(m.content)) !== record.preparedHash) continue;
        const candidate = { ...record, committed: true, eventSeq: event.seq, messageId: m.id, contentHash: item.contentHash };
        if (this.access(candidate, session, ancestors, index)) { await this.commit(record.ref, event); record = await this.meta(record.ref); break; }
      }
      if (this.access(record, session, ancestors, index)) result.push(record);
    }
    signal?.throwIfAborted();
    return result.sort((a, b) => a.createdAt - b.createdAt || a.ref.localeCompare(b.ref));
  }
  async read(session, args, ancestors = [], signal) {
    signal?.throwIfAborted();
    const index = accessIndex(session);
    let record = await this.meta(args.rawRef);
    if (!record.committed) { await this.list(session, ancestors, signal, index); record = await this.meta(args.rawRef); }
    if (!this.access(record, session, ancestors, index)) throw Error('当前会话无权读取此原文；跨会话需显式选择可读取的来源会话');
    const text = await this.text(record, signal), maxChars = integer(args.maxChars, 12000, 256, 48000, 'maxChars');
    const mode = args.mode ?? 'head';
    if (!['head', 'tail', 'range', 'query'].includes(mode)) throw Error('原文 mode 只支持 head、tail、range、query');
    const query = args.query ?? '';
    if (typeof query !== 'string' || query.length > 512) throw Error('query 不能超过 512 字符');
    const startLine = integer(args.startLine, 1, 1, Number.MAX_SAFE_INTEGER, 'startLine');
    const maxLines = integer(args.maxLines, 160, 1, 2000, 'maxLines');
    const signature = hash([record.ref, record.sourceHash, mode, query, startLine, maxLines, maxChars]);
    const next = cursor(args.cursor);
    if (next && (next.v !== 1 || next.signature !== signature || !Number.isSafeInteger(next.offset) || next.offset < 0 || next.offset > text.length)) throw Error('游标不属于此次原文读取');
    let start = next?.offset ?? 0;
    if (!next && mode === 'tail') {
      start = boundary(text, Math.max(0, text.length - maxChars));
      let remaining = maxLines;
      for (let at = text.length - (text.endsWith('\n') ? 2 : 1); at >= start; at--) if (text[at] === '\n' && --remaining === 0) { start = at + 1; break; }
    }
    if (!next && mode === 'range') {
      for (let line = 1; line < startLine && start < text.length; line++) { const p = text.indexOf('\n', start); start = p < 0 ? text.length : p + 1; }
    }
    if (mode === 'query') {
      if (!query.trim()) throw Error('query 模式需要非空查询');
      const found = literalIndex(text, query, start);
      if (found < 0) return { rawRef: record.ref, sourceHash: record.sourceHash, rawComplete: record.complete, text: '', matched: false, hasMore: false };
      start = next ? found : Math.max(0, found - 240);
    }
    let end = Math.min(text.length, start + maxChars), lines = 0;
    for (let at = start; at < end; at++) if (text[at] === '\n' && ++lines >= maxLines) { end = at + 1; break; }
    end = boundary(text, end);
    const hasMore = end < text.length;
    return { rawRef: record.ref, sourceHash: record.sourceHash, rawComplete: record.complete, tool: record.tool,
      startLine: text.slice(0, start).split('\n').length, startCharacter: start, endCharacter: end,
      totalCharacters: text.length, text: text.slice(start, end), hasMore,
      ...(hasMore ? { nextCursor: token({ v: 1, signature, offset: end }) } : {}) };
  }
  async search(session, args, ancestors = [], signal) {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 512) throw Error('原文搜索需要 1–512 字符的 query');
    const query = args.query.toLowerCase(), terms = termsOf(query), limit = integer(args.limit, 5, 1, 20, 'limit');
    const records = await this.list(session, ancestors, signal);
    const revision = hash(records.map(r => [r.ref, r.sourceHash]));
    if (this.index?.revision !== revision) {
      const words = new Map(), incomplete = new Set();
      for (const record of records) {
        if (!record.indexComplete) incomplete.add(record.ref);
        for (const term of record.terms) { if (!words.has(term)) words.set(term, new Set()); words.get(term).add(record.ref); }
      }
      this.index = { revision, words, incomplete };
    }
    let candidates;
    for (const term of terms) {
      const matching = new Set(this.index.incomplete);
      for (const [word, refs] of this.index.words) if (word.includes(term)) for (const ref of refs) matching.add(ref);
      candidates = candidates ? new Set([...candidates].filter(ref => matching.has(ref))) : matching;
    }
    const signature = hash([session.id, query, limit, records.map(r => [r.ref, r.sourceHash])]);
    const next = cursor(args.cursor);
    if (next && (next.v !== 1 || next.signature !== signature || !Number.isSafeInteger(next.offset) || next.offset < 0)) throw Error('搜索游标已失效，请重新搜索');
    const hits = [];
    for (const record of records) {
      signal?.throwIfAborted();
      if (candidates && !candidates.has(record.ref)) continue;
      if (record.indexComplete && terms.length && !terms.every(t => record.terms.some(word => word.includes(t)))) continue;
      const text = await this.text(record, signal), folded = text.toLowerCase();
      const at = literalIndex(text, args.query);
      if (at < 0 && (!terms.length || !terms.every(t => folded.includes(t)))) continue;
      const p = at >= 0 ? at : Math.max(0, literalIndex(text, terms[0]));
      hits.push({ rawRef: record.ref, tool: record.tool, sourceHash: record.sourceHash, rawComplete: record.complete,
        startLine: text.slice(0, p).split('\n').length, snippet: text.slice(Math.max(0, p - 120), p + 480) });
      await yieldImmediate();
    }
    const offset = next?.offset ?? 0, results = hits.slice(offset, offset + limit);
    return { query: args.query, searchedRecords: records.length, matchedRecords: hits.length, results,
      ...(offset + limit < hits.length ? { nextCursor: token({ v: 1, signature, offset: offset + limit }) } : {}) };
  }
  async export(session, ancestors = [], signal, rawRef) {
    const records = (await this.list(session, ancestors, signal)).filter(r => !rawRef || r.ref === rawRef), objects = {};
    if (rawRef && !records.length) throw Error('当前会话没有该原文');
    if (records.reduce((n, r) => n + r.bytes, 0) > 48 * 1024 * 1024) throw Error('原文较多，请按单份原文档案导出');
    for (const record of records) { signal?.throwIfAborted(); objects[record.sourceHash] ??= await this.text(record, signal); }
    return { format: 'omd-tool-evidence', version: 1, sessionId: session.id, records, objects };
  }
  async import(bundle, session, ancestors = [], signal) {
    if (bundle?.format !== 'omd-tool-evidence' || bundle.version !== 1 || !Array.isArray(bundle.records) || !bundle.objects) throw Error('无法识别原文档案');
    signal?.throwIfAborted();
    const index = accessIndex(session);
    let count = 0;
    for (const original of bundle.records) {
      signal?.throwIfAborted();
      this.id(original.ref);
      if (original.version !== 1 || !validId(original.sessionId) || !Number.isFinite(original.createdAt) || typeof original.complete !== 'boolean') throw Error('档案元数据无效');
      const text = bundle.objects[original.sourceHash];
      // Explicit import may restore a host-exported session under a new ID.
      // Only a complete matching logged call/result can grant that new owner.
      if (!this.access({ ...original, sessionId: session.id, importedSessions: [] }, session, [], index) || typeof text !== 'string' || !text.isWellFormed() || Buffer.byteLength(text) > MAX_OBJECT_BYTES || hash(text) !== original.sourceHash) throw Error('档案来源或内容与当前会话不匹配');
      await this.update(original.ref, async () => {
        signal?.throwIfAborted();
        let record = { ...original, bytes: Buffer.byteLength(text), characters: text.length, importedSessions: original.sessionId === session.id ? [] : [session.id], ...indexTerms(text) };
        let old;
        try { old = await this.meta(record.ref); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (old) {
          if (['sourceHash', 'callId', 'tool', 'argumentsHash'].some(k => old[k] !== record[k])
            || old.committed && ['contentHash', 'messageId'].some(k => old[k] !== record[k])
            || old.preparedHash && old.preparedHash !== record.contentHash) throw Error('原文引用冲突，未覆盖');
          // The native event proof above completes an interrupted preparation.
          // Keep its original owner and merge only this verified new owner.
          record = { ...old, ...(old.committed ? {} : { committed: true, contentHash: record.contentHash, messageId: record.messageId, eventSeq: record.eventSeq }),
            importedSessions: [...new Set([...(old.importedSessions ?? []), session.id])], ...indexTerms(text) };
        }
        await this.storeObject(record.sourceHash, text);
        // Owner markers are only discovery hints. A failed metadata publication
        // may leave a marker, which readers skip until a retry publishes it.
        await this.indexOwner(record, session.id);
        await this.persist(record);
      });
      count++;
    }
    return { imported: count };
  }
}
