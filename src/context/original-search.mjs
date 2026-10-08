import { createHash } from 'node:crypto';
import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { deriveEventMessage } from '@deepseek-ai/dsh-session';
import { sourceName } from '../message-source.mjs';

export const ORIGINAL_SEARCH_LIMIT = 5;
export const ORIGINAL_SEARCH_MAX_LIMIT = 20;
export const ORIGINAL_SEARCH_MAX_QUERY = 512;
export const ORIGINAL_SEARCH_MAX_PAGE_BYTES = 24 * 1024;
const CHUNK_SIZE = 32 * 1024, SNIPPET_SIZE = 360;
const echoTools = new Set(['recall', 'memory_search']);
const messageTypes = new Set(['user/message', 'assistant/message', 'tool/result']);
const fold = text => text.replace(/[A-Z]+/g, value => value.toLowerCase());
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = /^[a-z0-9_./:@-]+$/i;
const wordChar = char => Boolean(char && /[a-z0-9_]/i.test(char));

function validate(args, session) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('原文搜索参数必须是对象');
  if (args.search !== undefined && args.search !== 'original') throw Error('未知搜索范围；原文搜索使用 search=original');
  if (['memory', 'project', 'reference', 'id', 'asset', 'from', 'to'].some(key => args[key] !== undefined)) throw Error('原文搜索不能与摘要、记忆、附件或事件区间读取组合');
  if (typeof args.query !== 'string' || !args.query.trim()) throw Error('原文搜索 query 必须是非空字符串');
  if (args.query.length > ORIGINAL_SEARCH_MAX_QUERY || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(args.query)) throw Error(`原文搜索 query 不能超过 ${ORIGINAL_SEARCH_MAX_QUERY} 字符或包含控制字符`);
  const query = args.query.trim(), terms = [...new Set(fold(query).match(/[\p{L}\p{N}_./:@-]+/gu) || [])];
  if (!terms.length || terms.length > 64) throw Error('原文搜索 query 需要 1 至 64 个文字或标识符词项');
  const limit = args.limit === undefined ? ORIGINAL_SEARCH_LIMIT : args.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ORIGINAL_SEARCH_MAX_LIMIT) throw Error(`原文搜索 limit 必须是 1 至 ${ORIGINAL_SEARCH_MAX_LIMIT} 的整数`);
  if (args.sessionId !== undefined && (typeof args.sessionId !== 'string' || !args.sessionId.trim() || args.sessionId.length > 512 || /[\u0000-\u001f\u007f]/.test(args.sessionId))) throw Error('原文搜索 sessionId 必须是有效的非空会话 ID');
  if (!session || typeof session.id !== 'string' || !session.id || session.id.length > 512 || typeof session.snapshotEvents !== 'function') throw Error('宿主没有可用的目标会话原始事件快照');
  if (session.header?.id !== undefined && session.header.id !== session.id) throw Error('目标会话头部与 sessionId 不一致');
  if (args.sessionId !== undefined && args.sessionId !== session.id) throw Error('原文搜索 sessionId 与目标会话不一致');
  if (args.cursor !== undefined && (typeof args.cursor !== 'string' || !args.cursor || args.cursor.length > 2048)) throw Error('原文搜索 cursor 必须是返回的非空游标');
  return { query, terms, limit };
}

function decodeCursor(value) {
  if (value === undefined) return null;
  try {
    if (!/^[a-z0-9_-]+$/i.test(value)) throw Error();
    const raw = Buffer.from(value, 'base64url');
    if (raw.toString('base64url') !== value) throw Error();
    const cursor = JSON.parse(raw.toString('utf8'));
    if (cursor?.v !== 1 || !Number.isSafeInteger(cursor.through) || cursor.through < 1
      || !Number.isSafeInteger(cursor.seq) || cursor.seq < 0 || cursor.seq >= cursor.through
      || !Number.isSafeInteger(cursor.score) || cursor.score < 0 || cursor.score > 400000
      || !['generation', 'query', 'snapshot'].every(key => typeof cursor[key] === 'string' && /^[a-f0-9]{64}$/.test(cursor[key]))) throw Error();
    return cursor;
  } catch { throw Error('原文搜索 cursor 无效；请使用本次搜索返回的 nextCursor'); }
}

// Validate before opening an explicitly selected archive. Snapshot identity is
// checked again by searchOriginal after the resolved read-only target exists.
export function validateOriginalSearchArgs(args, targetId) {
  const value = validate(args, { id: targetId, snapshotEvents() {} });
  const cursor = decodeCursor(args.cursor);
  if (cursor && cursor.query !== digest([value.query, value.limit])) throw Error('原文搜索 cursor 不属于此查询或 limit；请重新搜索');
  return value;
}

// Only accepted event messages grant source access. Display text, including a
// forged Context record header, never expands this session's event prefix.
function originalMessage(event) {
  if (!messageTypes.has(event.type)) return null;
  // The native unprojected reader returns the immutable logged message. Live
  // surface projections may hide or rewrite it and are not original material.
  const message = deriveEventMessage(event);
  if (!message || !['user', 'assistant', 'tool'].includes(message.role) || sourceName(message.source)) return null;
  return message;
}

function* argumentParts(value, path) {
  if (typeof value === 'string') yield { text: value, path, kind: 'tool-call' };
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield { text: key, path: [...path, key], kind: 'tool-call' };
      yield* argumentParts(child, [...path, key]);
    }
  } else if (value !== undefined) yield { text: JSON.stringify(value), path, kind: 'tool-call' };
}

function attachmentReference(block, path) {
  const reference = {}, original = block.attachment || {};
  for (const key of ['attachmentId', 'name', 'mediaType', 'bytes', 'width', 'height']) {
    const value = original[key] ?? (key === 'name' ? block.name : undefined);
    if (typeof value === 'string' && value.length <= 512) reference[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) reference[key] = value;
  }
  return { type: String(block.type).slice(0, 64), path, reference, contentsRead: false };
}

function* contentParts(blocks, calls, path = []) {
  for (const [index, block] of (blocks || []).entries()) {
    const at = [...path, index];
    // Search the body/tool material supported by the original-text reader.
    // Reasoning is retained in the log, but is not a full-text recall source.
    if (block.type === 'reasoning') continue;
    if (block.type === 'text') {
      if (typeof block.text === 'string') yield { text: block.text, path: at, kind: block.type };
    } else if (block.type === 'tool-call') {
      if (echoTools.has(block.name)) continue;
      yield { text: block.name || '', path: at, kind: 'tool-call' };
      yield* argumentParts(block.arguments, [...at, 'arguments']);
    } else if (block.type === 'tool-result') {
      if (!echoTools.has(calls.get(block.toolCallId))) yield* contentParts(block.content, calls, at);
    } else {
      const attachment = attachmentReference(block, at);
      yield { text: Object.values(attachment.reference).filter(value => typeof value === 'string').join('\n'), path: at, kind: 'attachment-reference', attachment };
    }
  }
}

function registerCalls(blocks, calls) {
  for (const block of blocks || []) {
    if (block.type === 'tool-call' && typeof block.id === 'string') {
      if (echoTools.has(block.name)) calls.set(block.id, block.name); else calls.delete(block.id);
    }
    else if (block.type === 'tool-result') registerCalls(block.content, calls);
  }
}

function findTerm(chunk, term, offset, original) {
  let at = chunk.indexOf(term);
  while (at >= 0) {
    const pos = offset + at;
    if (!identifier.test(term) || ((!wordChar(term[0]) || !wordChar(original[pos - 1]))
      && (!wordChar(term.at(-1)) || !wordChar(original[pos + term.length])))) return pos;
    at = chunk.indexOf(term, at + 1);
  }
  return -1;
}

function snippet(part, at, length) {
  let start = Math.max(0, at - 100), end = Math.min(part.text.length, start + SNIPPET_SIZE);
  if (start > 0 && /[\udc00-\udfff]/.test(part.text[start])) start--;
  if (end < part.text.length && /[\udc00-\udfff]/.test(part.text[end])) end--;
  return { text: part.text.slice(start, end), offset: start, path: part.path, kind: part.kind,
    before: start > 0, after: end < part.text.length };
}

const compare = (a, b) => b.score - a.score || a.seq - b.seq;
const after = (candidate, cursor) => !cursor || compare(candidate, cursor) > 0;
const cursorFor = value => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Search one already-resolved session; never open parents, catalogs or sidecars.
 * A read-only facade needs id, header, inheritedEventCount and snapshotEvents().
 * Continuations scan the original fixed prefix, so logging this recall and later
 * appends cannot skip/repeat hits. A fresh search includes those new events.
 * No event text, index, or result cache survives the call.
 */
export async function searchOriginal(session, args = {}, { signal } = {}) {
  signal?.throwIfAborted();
  const { query, terms, limit } = validate(args, session), cursor = decodeCursor(args.cursor);
  const inherited = session.inheritedEventCount ?? 0;
  if (!Number.isSafeInteger(inherited) || inherited < 0) throw Error('目标会话的冻结继承范围无效');
  const generation = digest([session.id, session.header?.version, session.header?.createdAt, session.header?.parentSession, Boolean(session.header?.isSeeded), inherited]);
  const queryDigest = digest([query, limit]);
  if (cursor && (cursor.generation !== generation || cursor.query !== queryDigest)) throw Error('原文搜索 cursor 不属于此会话、查询或 limit；请重新搜索');
  const events = session.snapshotEvents();
  if (!Array.isArray(events)) throw Error('宿主没有返回可读取的原始事件快照');
  const through = cursor?.through ?? events.length;
  if (through > events.length || inherited > events.length) throw Error('原文搜索快照已变化；请重新搜索');
  const hash = createHash('sha256'), calls = new Map(), best = [];
  const foldedQuery = fold(query), grams = new Map();
  for (const term of terms) if (/^\p{Script=Han}{3,}$/u.test(term)) {
    const chars = Array.from(term);
    grams.set(term, [...new Set(chars.slice(0, -1).map((char, index) => char + chars[index + 1]))]);
  }
  const fuzzyTerms = terms.filter(term => !grams.has(term));
  let work = 0, totalMatches = 0, cursorHit = !cursor;
  const cooperate = async () => {
    signal?.throwIfAborted();
    if (++work >= 32) { work = 0; await yieldImmediate(); signal?.throwIfAborted(); }
  };
  for (let index = 0; index < through; index++) {
    await cooperate();
    const event = events[index];
    if (!event || event.seq !== index) throw Error('目标会话原始事件序列不完整');
    const message = originalMessage(event);
    hash.update(JSON.stringify([event.seq, event.type, message?.id, message?.role, message?.source, message?.toolCallId, message?.isError]));
    if (!message) continue;
    if (message.role === 'assistant') registerCalls(message.content, calls);
    if (message.role === 'tool' && echoTools.has(calls.get(message.toolCallId ?? message.source?.callId))) continue;
    const found = new Set(), gramHits = new Map(), marks = [], attachments = [];
    let exact = false, foldedExact = false;
    const mark = (part, at, length, priority = false) => {
      if (at < 0) return;
      const entry = snippet(part, at, length);
      if (marks.some(old => JSON.stringify(old.path) === JSON.stringify(entry.path) && Math.abs(old.offset - entry.offset) < SNIPPET_SIZE / 2)) return;
      if (priority) marks.unshift(entry); else marks.push(entry);
      marks.splice(2);
    };
    for (const part of contentParts(message.content, calls)) {
      await cooperate();
      hash.update(JSON.stringify([part.path, part.kind, part.text.length, part.attachment]));
      if (part.attachment && attachments.length < 2) attachments.push(part.attachment);
      const overlap = Math.max(query.length, ...terms.map(term => term.length), 2) - 1;
      for (let offset = 0; offset < part.text.length; offset += CHUNK_SIZE) {
        await cooperate();
        const text = part.text.slice(offset, offset + CHUNK_SIZE + overlap), folded = fold(text);
        hash.update(Buffer.from(part.text.slice(offset, offset + CHUNK_SIZE), 'utf16le'));
        if (!exact) { const at = findTerm(text, query, offset, part.text); if (at >= 0) { exact = true; mark(part, at, query.length, true); } }
        if (!foldedExact) { const at = findTerm(folded, foldedQuery, offset, part.text); if (at >= 0) { foldedExact = true; mark(part, at, query.length, true); } }
        for (const term of terms) if (!found.has(term)) {
          const at = findTerm(folded, term, offset, part.text);
          if (at >= 0) { found.add(term); mark(part, at, term.length); }
        }
        for (const [term, values] of grams) {
          const hits = gramHits.get(term) || new Set();
          for (const gram of values) if (!hits.has(gram)) { const at = folded.indexOf(gram); if (at >= 0) { hits.add(gram); mark(part, offset + at, gram.length); } }
          gramHits.set(term, hits);
        }
      }
    }
    let score = exact ? 400000 : foldedExact ? 390000 : found.size === terms.length ? 300000 : 0;
    if (!score && grams.size && fuzzyTerms.every(term => found.has(term))) {
      const ratios = [...grams].map(([term, values]) => found.has(term) ? 1 : (gramHits.get(term)?.size || 0) / values.length);
      if (ratios.every(ratio => ratio >= 0.75)) score = 200000 + Math.floor(1000 * Math.min(...ratios));
    }
    if (!score) continue;
    totalMatches++;
    const candidate = { seq: event.seq, score };
    if (cursor && compare(candidate, cursor) === 0) cursorHit = true;
    if (!after(candidate, cursor)) continue;
    const result = { ...candidate, sessionId: session.id, role: message.role, type: event.type, inherited: event.seq < inherited,
      from: event.seq, to: event.seq, recall: { sessionId: session.id, from: event.seq, to: event.seq }, snippets: marks,
      ...(attachments.length ? { attachments } : {}) };
    best.push(result); best.sort(compare); if (best.length > limit + 1) best.pop();
  }
  signal?.throwIfAborted();
  const snapshot = hash.digest('hex');
  if (cursor && cursor.snapshot !== snapshot) throw Error('原文搜索快照已变化；请重新搜索');
  if (!cursorHit) throw Error('原文搜索 cursor 的位置无效；请重新搜索');
  const selected = [], base = { search: 'original', sessionId: session.id, query, limit, through, totalMatches };
  const continuation = last => cursorFor({ v: 1, generation, query: queryDigest, snapshot, through, score: last.score, seq: last.seq });
  for (const result of best.slice(0, limit)) {
    const trial = [...selected, result], nextCursor = best.length > trial.length ? continuation(result) : null;
    if (Buffer.byteLength(JSON.stringify({ ...base, results: trial, nextCursor })) > ORIGINAL_SEARCH_MAX_PAGE_BYTES) break;
    selected.push(result);
  }
  if (best.length && !selected.length) throw Error('原文搜索单项引用超过输出上限；请缩短查询或使用事件区间回查');
  return { ...base, results: selected, nextCursor: best.length > selected.length ? continuation(selected.at(-1)) : null };
}

export function originalSearchContent(result) {
  return [{ type: 'text', text: JSON.stringify(result) }];
}
