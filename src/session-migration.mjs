import { readdir, readFile, open, rename, mkdir, stat } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join, dirname } from 'node:path';
import { sourceHash, hash } from './context/core.mjs';
import { userDocument } from './context/materials.mjs';
import { loadMigrationSupport } from '../lib/host/session-migration.mjs';

const optionalJson = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
async function durableJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path + '.tmp', 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(path + '.tmp', path);
  if (process.platform !== 'win32') { const dir = await open(dirname(path), 'r'); try { await dir.sync(); } finally { await dir.close(); } }
}
const signature = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
const seqFields = new Set(['seq', 'carrierSeq', 'sourceSeq', 'originalSeq', 'snapshotSeq', 'throughSeq', 'startSeq', 'endSeq', 'summarySeq', 'resultSeq']);
const seqArrays = new Set(['seqs', 'sourceSeqs', 'originalSeqs', 'retainedSeqs', 'movedSourceSeqs', 'accountingSeqs', 'resolvedSeqs', 'shadowedSeqs', 'windowSeqs']);
// Only visit OMD-owned structures. Content, user documents and opaque attachments
// are data, even when they happen to contain a field named "seq".
const opaque = new Set(['content', 'blocks', 'block', 'summary', 'text', 'documents', 'metrics', 'activity', 'notes', 'args', 'arguments']);
function currentSource(source) {
  if (source?.kind !== 'plugin') return source;
  const { plugin, ...rest } = source;
  return { ...rest, kind: plugin === '@deepseek-ai/dsh-system-prompt' ? 'runtime-context' : plugin === 'compact' ? 'compact-checkpoint' : 'plugin:' + plugin };
}
export function remapOwned(value, mapping, sessionId, oldEvents, missing) {
  const ref = n => {
    if (typeof n !== 'number' || n < 0) return n;
    if (mapping[n] === undefined) {
      if (missing) return missing(n);
      throw Error('OMD 旧记录引用了不存在的会话事件：' + n);
    }
    return mapping[n];
  };
  function walk(node, inheritedSession = sessionId) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(item => walk(item, inheritedSession));
    const owner = node.sessionId ?? inheritedSession;
    const out = { ...node };
    for (const [key, val] of Object.entries(node)) {
      if (opaque.has(key)) out[key] = structuredClone(val);
      else if (key === 'baseSource' || key === 'source' && val?.kind) out[key] = currentSource(val);
      else if (owner === sessionId && seqFields.has(key)) out[key] = ref(val);
      else if (owner === sessionId && seqArrays.has(key)) out[key] = val.map(ref);
      else if (key === 'applied') out[key] = Object.fromEntries(Object.entries(val).map(([id, seq]) => [id, ref(seq)]));
      else if (key === 'shadowedRange') out[key] = { start: ref(val.start), end: ref(val.end) };
      else if (key === 'ranges') out[key] = val.map(r => r.sessionId === sessionId ? { ...r, from: ref(r.from), to: ref(r.to) } : r);
      else out[key] = walk(val, owner);
    }
    if (owner === sessionId && Number.isInteger(node.seq) && Array.isArray(node.path)
      && oldEvents[node.seq]?.type === 'tool/result' && node.path.length > 1 && node.path[0] === 0) out.path = node.path.slice(1);
    return out;
  }
  return walk(value);
}
// Only generated reference headers change. User prose, quoted materials and
// source-generation files remain byte-for-byte intact.
function rebaseGeneratedContent(content, mapping, sessionId) {
  if (!Array.isArray(content)) return content;
  const reference = value => Number.isInteger(mapping[Number(value)]) ? String(mapping[Number(value)]) : value;
  return content.map((block, index) => {
    if (block.type !== 'text') return block;
    let text = block.text;
    if (index === 0) {
      text = text.replace(/^(\[Context record [^\n]+ · events )([0-9., ]+)( · view=(?:detail|brief)\])/, (_all, prefix, ranges, suffix) => prefix + ranges.replace(/\d+/g, reference) + suffix);
      text = text.replace(/^(\[[^\n]* · source event )(\d+)( · excerpt)?(\])/, (_all, prefix, seq, excerpt = '', end) => prefix + reference(seq) + excerpt + end);
    } else if (/^Attachment \d+:/.test(text) && text.endsWith('Contents are not inferred from the name.')) {
      text = text.split(sessionId + '#').map((part, i) => i ? part.replace(/^\d+/, reference) : part).join(sessionId + '#');
    }
    return text === block.text ? block : { ...block, text };
  });
}
function normalizeSystem(event) {
  const message = event.type === 'system/message' ? event.data?.message : null;
  if (message?.source?.kind !== 'plugin' || !message.source.plugin?.startsWith('trisoul-x:')) return event;
  return { ...event, data: { ...event.data, message: { ...message, source: {
    ...message.source, plugin: '@deepseek-ai/dsh-system-prompt', ...(message.source.plugin === 'trisoul-x:shadow' ? { omdShadow: true } : {}),
  } } } };
}
// The retired pre-step path reserved its empty system head before step/start.
// Move that existing start boundary ahead of the reservation; source messages
// keep their relative order and no model/tool execution is invented.
function normalizeLegacyBoundaries(input, inheritedEventCount) {
  const events = structuredClone(input);
  let step = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'step/start') step = event.data;
    if (event.type === 'step/end' || event.type === 'turn/end') step = null;
    const source = event.type === 'system/message' ? event.data.message?.source : null;
    if (source?.kind !== 'plugin' || !source.plugin?.startsWith('trisoul-x:')) continue;
    if (source.plugin === 'trisoul-x:shadow') {
      event.type = 'user/message'; event.data = { ...event.data.message, role: 'user' };
      continue;
    }
    if (step?.turn === event.data.turn && step.step === event.data.step) continue;
    const later = events.findIndex((item, at) => at > i && item.type === 'step/start' && item.data.turn === event.data.turn && item.data.step === event.data.step);
    if (later < 0 || (event.seq < inheritedEventCount) !== (events[later].seq < inheritedEventCount) || events.slice(i, later).some(item => ['turn/end', 'turn/start', 'step/start', 'step/end', 'session/end-seed', 'assistant/message', 'tool/result'].includes(item.type))) throw Error('OMD 旧系统占位没有对应的请求步骤，原日志保留');
    const [start] = events.splice(later, 1); events.splice(i, 0, start); step = start.data; i++;
  }
  // Retired reminder hooks could append control text before the first system
  // head. Move only those plugin messages behind that existing head, before any
  // assistant/tool execution. Later system updates keep their original order.
  const head = events.findIndex(e => e.type === 'system/message');
  const early = events.slice(0, Math.max(0, head)).filter(e => e.surfaceOp);
  if (early.length) {
    if (events[head].surfaceOp !== 'append' || early.some(e => e.type !== 'user/message' || e.surfaceOp !== 'append'
      || e.data.source?.kind !== 'plugin' || !e.data.source.plugin?.startsWith('trisoul-x:')
      || (e.seq < inheritedEventCount) !== (events[head].seq < inheritedEventCount))) throw Error('旧系统头之前存在非 OMD 控制消息，原日志保留');
    for (const event of early) events.splice(events.indexOf(event), 1);
    events.splice(events.indexOf(events.find(e => e.type === 'system/message')) + 1, 0, ...early);
    // A retired one-time repair could have already copied this exact pair while
    // idle. Replay the equivalent pair inside its original request step, with
    // targets matching the corrected head order. Do not relocate real updates.
    if (early.length === 1) {
      const originalHead = events.find(e => e.type === 'system/message');
      const repairIndex = events.findIndex(e => e !== originalHead && e.type === 'system/message'
        && isDeepStrictEqual(e.data, originalHead.data) && e.surfaceOp?.startSeq === early[0].seq
        && e.surfaceOp?.endSeq === early[0].seq && e.sourceEventSeqs?.includes(originalHead.seq));
      const repair = events[repairIndex], follower = events[repairIndex + 1];
      if (repairIndex >= 0 && follower?.type === 'user/message' && isDeepStrictEqual(follower.data, early[0].data)
        && follower.surfaceOp?.startSeq === originalHead.seq && follower.surfaceOp?.endSeq === originalHead.seq
        && (repair.seq < inheritedEventCount) === (originalHead.seq < inheritedEventCount)) {
        repair.surfaceOp = { op: 'replace', startSeq: originalHead.seq, endSeq: originalHead.seq };
        follower.surfaceOp = { op: 'replace', startSeq: early[0].seq, endSeq: early[0].seq };
        events.splice(repairIndex, 2);
        events.splice(events.indexOf(early[0]) + 1, 0, repair, follower);
      }
    }
  }
  const mapping = []; events.forEach((event, seq) => { mapping[event.seq] = seq; });
  const ref = (value, seq) => { const next = mapping[value]; if (!Number.isInteger(next) || next >= seq) throw Error('旧会话引用无法安全重排'); return next; };
  return { mapping, events: events.map((event, seq) => {
    const r = value => ref(value, seq), list = values => values.map(r), data = event.data;
    if (event.sourceEventSeqs) event.sourceEventSeqs = list(event.sourceEventSeqs);
    if (event.surfaceOp && typeof event.surfaceOp === 'object' && event.surfaceOp.op === 'replace') event.surfaceOp = { ...event.surfaceOp, startSeq: r(event.surfaceOp.startSeq), endSeq: r(event.surfaceOp.endSeq) };
    if (['compaction/summary', 'compaction/prune'].includes(event.type)) { data.shadowedSeqs = list(data.shadowedSeqs); data.shadowedRange = { start: r(data.shadowedRange.start), end: r(data.shadowedRange.end) }; }
    if (['session/title', 'session/title-llm-request'].includes(event.type)) data.messageSeqs = list(data.messageSeqs);
    if (event.type === 'command/done' && data.sourceEventSeq !== undefined) data.sourceEventSeq = r(data.sourceEventSeq);
    if (event.type === 'image/offload') data.targets = data.targets.map(target => ({ ...target, seq: r(target.seq) }));
    return { ...event, seq };
  }) };
}

// Historical OMD used the first compaction summary to account for every
// selected range, then removed the other ranges with shadow replacements.
// V4 requires the summary's references to name its actual contiguous span.
function normalizeCompactionSpans(events) {
  const surface = [];
  let turn = null, compaction = null;
  for (const event of events) {
    if (event.type === 'turn/start') turn = event.data.turn;
    if (event.type === 'turn/end') turn = null;
    if (event.type === 'compaction/start') {
      event.data.turn = turn;
      compaction = event.data;
    }
    if (event.type === 'compaction/end') {
      event.data.turn = turn;
      compaction = null;
    }
    // Legacy manual compaction omitted its command id from the checkpoint.
    const source = event.type === 'user/message' ? event.data.source : null;
    if (source?.kind === 'plugin' && source.plugin === 'compact' && compaction?.compactionId === source.compactionId
      && source.sourceCommandId === undefined && compaction.sourceCommandId !== undefined) source.sourceCommandId = compaction.sourceCommandId;
    if (source?.kind === 'plugin' && source.plugin === 'compact' && compaction?.compactionId !== source.compactionId
      && event.data.omdBatchId) source.plugin = 'trisoul-x:context-record';
    if (event.type === 'compaction/summary') {
      const {start,end} = event.data.shadowedRange;
      const first = surface.indexOf(start), last = surface.indexOf(end);
      if (first < 0 || last < first) throw Error('旧压缩记录的来源区间已不存在');
      event.data.shadowedSeqs = surface.slice(first,last+1);
    }
    if (event.surfaceOp === 'append') surface.push(event.seq);
    else if (event.surfaceOp?.op === 'replace') {
      const first=surface.indexOf(event.surfaceOp.startSeq),last=surface.indexOf(event.surfaceOp.endSeq);
      if (first<0||last<first) throw Error('旧会话替换区间已不存在');
      surface.splice(first,last-first+1,event.seq);
    }
  }
}

export function migrateArtifact(support, historical, children) {
  const normalized = normalizeLegacyBoundaries(historical.events, historical.inheritedEventCount);
  normalizeCompactionSpans(normalized.events);
  const edge = support.createSessionFormatV3ToV4(children);
  const header = edge.migrateHeader(historical.header), collector = new support.SessionFormatEventCollector();
  const stage = edge.createStage({ sourceHeader: historical.header, targetHeader: header, sourceInheritedEventCount: historical.inheritedEventCount, sourceKind: 'decoded' });
  const mapping = [];
  for (const event of normalized.events) {
    stage.transformEvent(normalizeSystem(event), collector);
    mapping[event.seq] = collector.values.at(-1).seq;
  }
  const inheritedEventCount = stage.finish(collector);
  const combined = normalized.mapping.map(seq => mapping[seq]);
  const events = structuredClone(collector.values);
  for (const event of events) {
    if (event.type === 'compaction/summary' && event.data.omdBatchId) event.data.summary = rebaseGeneratedContent(event.data.summary, combined, header.id);
    const message = event.type === 'user/message' ? event.data : event.data?.message;
    if (!message) continue;
    if (message.omdBatchId || message.source?.kind === 'plugin:trisoul-x:trace') message.content = rebaseGeneratedContent(message.content, combined, header.id);
    for (const key of ['omdTodo', 'omdTaskContext']) if (message[key]) message[key] = remapOwned(message[key], combined, header.id, historical.events);
  }
  const restore = support.sessionFormatCatalog.createRestore(support.sessionFormatCatalog.encodeCurrentHeader(header, inheritedEventCount), { recovery: 'strict', validation: 'current' });
  for (const event of events) restore.decodeRow(support.sessionFormatCatalog.encodeCurrentEvent(event));
  restore.finish();
  return { artifact: { header, events, inheritedEventCount }, mapping: combined };
}
export function migrateContextState(state, mapping, oldEvents, artifact) {
  // Some old shutdowns saved cache references after the host stopped flushing.
  // Keep their material, but use an impossible seq so future appends cannot make
  // a stale reference live again. The journal retains the exact original state.
  // Write-ahead transactions remain strict: never discard or invent their writes.
  const transaction = state.transaction && remapOwned(state.transaction, mapping, state.id, oldEvents);
  const missing = new Set();
  const result = remapOwned({ ...state, transaction: null, pending: null }, mapping, state.id, oldEvents,
    seq => { missing.add(seq); return -1; });
  result.transaction = transaction ?? null;
  if (missing.size) result.notices = [...(result.notices ?? []), { at: Date.now(),
    text: `升级时发现 ${missing.size} 个未落盘的旧事件索引，已停用这些索引；摘要、原话和附件保留，原索引见迁移备份。` }].slice(-40);
  const session = { eventAt: seq => artifact.events[seq] };
  function records(items) {
    for (const r of items ?? []) {
      if ((r.sessionId === state.id || !r.sessionId) && r.sourceSeqs.every(seq => session.eventAt(seq))) r.sourceHash = sourceHash(session, r.sourceSeqs);
      if (r.userOriginals?.length) r.documents = [...(r.documents ?? []).filter(d => d.kind !== 'user-original'), ...userDocument(r.userOriginals)];
    }
  }
  records(result.records); records(result.transaction?.records);
  for (const op of result.transaction?.operations ?? []) {
    if (op.content) op.content = rebaseGeneratedContent(op.content, mapping, state.id);
    if (op.message?.content) op.message.content = rebaseGeneratedContent(op.message.content, mapping, state.id);
    if (op.text && ['record', 'trace'].includes(op.kind)) op.text = rebaseGeneratedContent([{ type: 'text', text: op.text }], mapping, state.id)[0].text;
  }
  // A coordinator decision is disposable. Durable write-ahead operations are not.
  result.pending = null; result.review = { ...result.review, lastKey: '', needed: true };
  if (result.transaction) result.transaction.userRevision = null;
  result.sessionFormatVersion = 4;
  return result;
}

// Hash logical data with stable object-key order, independent of codec insertion order.
function artifactHash(artifact) {
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  return hash(sort(artifact));
}
async function applySidecars(updates) {
  // Validate the entire set first, including already-applied files after a crash.
  for (const update of updates) {
    const current = await optionalJson(update.path);
    if (!isDeepStrictEqual(current, update.before) && !isDeepStrictEqual(current, update.after)) throw Error('迁移关联记录已被其他进程修改，保留现场：' + update.path);
  }
  for (const update of updates) if (!isDeepStrictEqual(await optionalJson(update.path), update.after)) await durableJson(update.path, update.after);
}
async function readHeader(path, compression, support) {
  const file = await open(path, 'r');
  try {
    let bytes = Buffer.alloc(0);
    for (;;) {
      const chunk = Buffer.alloc(16384), read = await file.read(chunk);
      if (!read.bytesRead) throw Error('会话日志缺少完整头部：' + path);
      bytes = Buffer.concat([bytes, chunk.subarray(0, read.bytesRead)]);
      let first = bytes;
      if (compression === 'zstd') {
        const frame = support.scanZstdFrames(bytes, 1).frames[0];
        if (!frame) continue;
        first = await support.decompressZstdPrefix(bytes.subarray(frame.start, frame.end));
      }
      const end = first.indexOf(10);
      if (end >= 0) return JSON.parse(first.subarray(0, end).toString());
    }
  } finally { await file.close(); }
}

// Native publication is exclusive and retains predecessor generations. The
// journal is durable before publication; a crash resumes sidecar writes once.
export async function migrateSessionStorage(ctx, dataDir, providedSupport) {
  const backend = ctx.get('sessionPersistence');
  if (!backend?.config?.root) return; // Memory/other backends own their formats.
  const support = providedSupport ?? await loadMigrationSupport(ctx);
  const root = backend.config.root, compression = backend.config.compression ?? 'zstd';
  const corpus = [];
  async function directories(path, depth) {
    let entries; try { entries = await readdir(path, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    const files = entries.filter(e => e.isFile()).map(e => ({ path: join(path, e.name), version: support.parseGenerationLogFilename(e.name, compression) })).filter(e => e.version !== undefined).sort((a, b) => b.version - a.version);
    if (files.length) {
      const selected = files[0];
      const header = await readHeader(selected.path, compression, support);
      if (header.version !== selected.version) throw Error('会话头部版本与文件名不符：' + selected.path);
      corpus.push({ ...selected, dir: path, header }); return;
    }
    if (depth > 0) for (const entry of entries) if (entry.isDirectory()) await directories(join(path, entry.name), depth - 1);
  }
  await directories(root, 2);
  for (const item of corpus) {
    const journalPath = join(item.dir, 'omd-v4-migration.json');
    let journal = await optionalJson(journalPath);
    if (item.version >= 4 && (!journal || journal.complete)) continue;
    const owned = ['trisoul-x', 'omd-ptc'].includes(item.header.agentPreset)
      || await optionalJson(join(dataDir, 'context-v1/sessions', hash(item.header.id) + '.json'))
      || await optionalJson(join(dataDir, 'sessions', item.header.id + '.json'));
    if (!owned && !journal) continue;
    const lease = await support.SessionWriteLease.acquire(item.dir, item.header.id);
    try {
      journal = await optionalJson(journalPath);
      const target = join(item.dir, support.generationLogFilename(4, compression));
      let targetExists = await stat(target).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
      if (journal && targetExists) {
        if (!journal.complete) {
          if (journal.id !== item.header.id || journal.target !== target) throw Error('迁移日志与目标会话不符');
          const current = await support.readDecodedJsonlSource(target, 4, compression, { createRestore: h => support.sessionFormatCatalog.createRestore(h, { recovery: 'strict', validation: 'current' }) });
          if (artifactHash(current.artifact) !== journal.artifactHash) throw Error('迁移目标已发生变化，保留原始记录：' + target);
          await applySidecars(journal.updates);
          await durableJson(journalPath, { ...journal, complete: true });
        }
        continue;
      }
      if (targetExists) throw Error('旧会话已被其他宿主升级，请先恢复 OMD 关联记录：' + item.header.id);
      const children = [], witnesses = [];
      for (const child of corpus.filter(c => c.header.parentSession === item.header.id && c.header.origin === 'subagent')) {
        const catalog = child.version < 4 ? support.historicalSessionFormatCatalog : support.sessionFormatCatalog;
        const read = await support.readDecodedJsonlSource(child.path, child.version, compression, { createRestore: h => catalog.createRestore(h, { recovery: 'strict', validation: child.version < 4 ? 'transformed' : 'current' }) });
        children.push(support.historicalChildCatalogSource(read.artifact)); witnesses.push({ path: child.path, identity: signature(read.identity) });
      }
      let old, mapping;
      const prepared = await support.prepareJsonlMigration({ sourcePath: item.path, sourceVersion: item.version, currentPath: target, compression,
        verifyCurrentFile: support.verifyJsonlCurrentGeneration,
        validateHistoricalHeader: header => { if (header.id !== item.header.id) throw Error('会话在迁移期间被替换'); },
        validateRelatedSources: async () => { for (const witness of witnesses) if (signature(await stat(witness.path, { bigint: true })) !== witness.identity) throw Error('子会话在迁移期间发生变化'); },
        format: { currentVersion: 4, encodeHeader: support.sessionFormatCatalog.encodeCurrentHeader, encodeEvent: support.sessionFormatCatalog.encodeCurrentEvent,
          createRestore(header) {
            const read = support.historicalSessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'transformed' });
            return { decodeRow: row => read.decodeRow(row), finish() { old = read.finish(); const migrated = migrateArtifact(support, old, children); mapping = migrated.mapping; return migrated.artifact; } };
          } },
      });
      const updates = [];
      for (const [path, context] of [[join(dataDir, 'context-v1/sessions', hash(item.header.id) + '.json'), true], [join(dataDir, 'sessions', item.header.id + '.json'), false]]) {
        const before = await optionalJson(path);
        if (before) updates.push({ path, before, after: context ? migrateContextState(before, mapping, old.events, prepared.artifact) : remapOwned(before, mapping, item.header.id, old.events) });
      }
      journal = { version: 1, artifactHash: artifactHash(prepared.artifact), id: item.header.id, source: item.path, target, mapping, updates, complete: false };
      await durableJson(journalPath, journal);
      for (const update of updates) if (!isDeepStrictEqual(await optionalJson(update.path), update.before)) throw Error('迁移关联记录在发布前被修改：' + update.path);
      await prepared.publish();
      await applySidecars(updates);
      await durableJson(journalPath, { ...journal, complete: true });
      ctx.logger.info('OMD 已迁移旧会话 %s；原始日志和关联记录备份已保留。', item.header.id);
    } finally { await lease.release(); }
  }
}
