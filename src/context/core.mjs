import { createHash, randomUUID } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const textBlocks = blocks => (blocks || []).flatMap(b => {
  if (b.type === 'text') return [b.text || ''];
  if (b.type === 'tool-call') return [`${b.name}(${typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)})`];
  if (b.type === 'tool-result') return [(b.isError ? '[error] ' : '') + textBlocks(b.content)];
  return [];
}).join('\n');
export const actualUser = e => e.type === 'user/message' && e.data?.source?.kind === 'user';
export const userMessages = session => session.snapshotEvents().filter(actualUser).map(e => ({
  seq: e.seq, at: eventTime(e), text: textBlocks(e.data.content),
  attachments: (e.data.content || []).filter(b => b.type !== 'text').map(b => ({ type: b.type, name: b.name ?? null, status: 'Attachment retained in the original message; contents not inferred from its name.' })),
}));
export const userRevision = session => hash(userMessages(session));
export const eventTime = e => {
  const v = e?.timestamp ?? e?.at ?? e?.createdAt ?? e?.time ?? e?.ts ?? e?.data?.timestamp ?? e?.data?.at;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return Date.parse(v);
  return null;
};
export const eventSource = e => e.type === 'user/message' ? e.data?.source?.plugin : e.data?.message?.source?.plugin;
// User requests and host control/context messages are not conversation material
// that the summarizer may replace, regardless of their surface role.
const protectedSource = e => !e || e.type === 'user/message' || e.type === 'system/message' || Boolean(eventSource(e));
export const rawText = (session, e) => textBlocks(session.deriveEventMessage(e)?.content);
export const sourceHash = (session, seqs) => hash(seqs.map(seq => {
  const e = session.eventAt(seq);
  if (!e) throw new Error(`Missing source event ${seq}`);
  return [e.seq, e.type, e.data];
}));
export const estimate = text => Math.ceil(String(text).length / 4);
export const hasOpaqueContent = blocks => (blocks || []).some(b => !['text', 'reasoning', 'tool-call', 'tool-result'].includes(b.type) || (b.type === 'tool-result' && hasOpaqueContent(b.content)));
export const entryCost = entry => estimate(entry.summary + '\n' + entry.documents.map(d => `${d.title}\n${d.text}`).join('\n'));

export function validatePrepared(value) {
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !Array.isArray(value.documents)) throw new Error('预处理没有提交完整摘要与文档');
  if (value.documents.some(d => !d || typeof d.title !== 'string' || !d.title.trim() || typeof d.text !== 'string' || !d.text.trim())) throw new Error('详细文档的标题和正文必须完整');
  return { summary: value.summary.trim(), documents: value.documents.map(d => ({ title: d.title.trim(), text: d.text.trim() })) };
}
export function decodeResult(result, toolName) {
  const call = result?.blocks?.findLast(b => b.type === 'tool-call' && b.name === toolName);
  if (!call) throw new Error(`后台未调用 ${toolName}`);
  return typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
}
export function recordText(record, mode = 'detail') {
  const ranges = (record.ranges || []).map(r => `${r.from}..${r.to}`).join(', ');
  const when = record.timeStart == null ? '时间未记录' : new Date(record.timeStart).toISOString() + (record.timeEnd && record.timeEnd !== record.timeStart ? ' — ' + new Date(record.timeEnd).toISOString() : '');
  return `[Context record ${record.id} · ${when} · events ${ranges}]\n${record.summary}`
    + (mode === 'detail' && record.documents.length ? '\n\n' + record.documents.map(d => `## ${d.title}\n${d.text}`).join('\n\n') : '')
    + `\n[Saved documents: recall({"id":"${record.id}"})]`;
}
export function activeRecords(state) { return state.records.filter(r => !r.mergedInto); }
export function liveSpan(session, record) {
  // Older archives may include a host reminder before the first real request.
  // Keep those archives readable, but never replace their control messages.
  if (record.sourceSeqs.some(seq => protectedSource(session.eventAt(seq)))) return null;
  const seqs = record.mode === 'raw' ? record.sourceSeqs : [record.carrierSeq];
  if (!seqs?.length || seqs.some(s => !Number.isSafeInteger(s))) return null;
  const nodes = session.surface.nodes, start = nodes.indexOf(seqs[0]);
  if (start < 0 || seqs.some((seq, i) => nodes[start + i] !== seq)) return null;
  if (record.mode === 'raw' && sourceHash(session, seqs) !== record.sourceHash) return null;
  return { seqs: [...seqs], start, end: start + seqs.length - 1 };
}

export function normalizeChoices(value, state, session, allowedIds) {
  if (!Array.isArray(value?.choices)) throw new Error('中枢未提交 choices');
  const records = new Map(activeRecords(state).map(r => [r.id, r])), used = new Set();
  return value.choices.map(choice => {
    if (!['keep', 'detail', 'brief', 'merge'].includes(choice?.action) || !Array.isArray(choice.ids)) throw new Error('中枢选项无效');
    const ids = choice.ids;
    if (!ids.length || (choice.action !== 'merge' && ids.length !== 1) || (choice.action === 'merge' && ids.length < 2)) throw new Error('单项选择必须一个 ID，合并至少两个');
    const selected = ids.map(id => {
      if (typeof id !== 'string' || !records.has(id) || used.has(id) || (allowedIds && !allowedIds.has(id))) throw new Error(`记录不存在、已合并或重复选择：${id}`);
      used.add(id);
      const r = records.get(id), span = liveSpan(session, r);
      if (!span) throw new Error(`记录已不在当前上下文：${id}`);
      return { id, version: r.version, carrierSeq: r.carrierSeq ?? null, mode: r.mode, start: span.start, sourceHash: r.sourceHash };
    }).sort((a, b) => a.start - b.start);
    let prepared = { summary: '', documents: [] };
    if (choice.action === 'merge') prepared = validatePrepared(choice);
    else if ((choice.summary ?? '') !== '' || (choice.documents ?? []).length) throw new Error('仅合并选项可以生成正文');
    return { action: choice.action, ids: selected.map(r => r.id), observed: selected, ...prepared };
  });
}

export function exposedTrace(session, { maxChars = 0 } = {}) {
  for (const e of session.snapshotEvents().slice().reverse()) {
    if (e.type !== 'assistant/message' || e.data?.message?.source?.plugin) continue;
    const blocks = e.data?.message?.content;
    if (!Array.isArray(blocks)) continue;
    const text = blocks.filter(b => b.type === 'reasoning' && typeof b.text === 'string').map(b => b.text).join('\n').trim();
    if (text) return { sourceSeq: e.seq, at: eventTime(e), text: maxChars > 0 ? text.slice(-maxChars) : text, truncated: maxChars > 0 && text.length > maxChars };
  }
  return null;
}

export function prepareCandidate(session, state, cfg, pairing) {
  const nodes = session.surface.nodes;
  const events = nodes.map(seq => session.eventAt(seq));
  const reserved = new Set(activeRecords(state).flatMap(r => r.mode === 'raw' ? r.sourceSeqs : [r.carrierSeq]));
  const latest = new Map();
  for (const e of events) {
    const src = eventSource(e);
    if (['trisoul-x:state', 'trisoul-x:tasks'].includes(src)) latest.set(src, e.seq);
  }
  const stop = Math.max(0, nodes.length - cfg.keepTailEvents);
  const boundary = e => {
    if (protectedSource(e) || reserved.has(e.seq)) return true;
    if (hasOpaqueContent(session.deriveEventMessage(e)?.content)) return true;
    if (e.data?.source?.form === 'snapshot') return true;
    const src = eventSource(e) || '';
    if (src.startsWith('trisoul-x:context') || src.startsWith('trisoul-x:trace') || src === 'trisoul-x:project-catalog' || src === 'trisoul-x:manual-global') return true;
    if (latest.get(src) === e.seq) return true;
    return !session.deriveEventMessage(e);
  };
  let run = [];
  const take = () => {
    while (run.length && !pairing.before(session, run[0].seq)) run.shift();
    if (!run.length) return null;
    // The window is a preferred size; a tool round-trip is never split.
    let end = Math.min(run.length, cfg.digestWindow);
    while (end < run.length && !pairing.after(session, run[end - 1].seq)) end++;
    if (!pairing.after(session, run[end - 1].seq)) {
      while (end > 0 && !pairing.after(session, run[end - 1].seq)) end--;
    }
    if (!end) return null;
    return run.slice(0, end);
  };
  for (const e of events.slice(0, stop)) {
    if (boundary(e)) { const found = take(); if (found) return found; run = []; }
    else {
      run.push(e);
      if (run.length >= cfg.digestWindow) { const found = take(); if (found) return found; }
    }
  }
  return take();
}

export function candidateInput(session, events, lookback) {
  const all = session.snapshotEvents(), start = all.findIndex(e => e.seq === events[0].seq);
  const prior = lookback > 0 ? all.slice(0, start).filter(e => actualUser(e) || e.type === 'assistant/message' || e.type === 'tool/result').slice(-lookback) : [];
  return { reference: prior.map(e => ({ seq: e.seq, type: e.type, text: rawText(session, e) })),
    segment: events.map(e => ({ seq: e.seq, at: eventTime(e), type: e.type, text: rawText(session, e) })) };
}
export function coordinatorInput(session, state, cfg) {
  return {
    user_messages: userMessages(session),
    context: { entries: session.surface.nodes.map((seq, position) => ({ seq, position })), pressureRatio: cfg.pressureRatio ?? null },
    records: activeRecords(state).flatMap(r => {
      const span = liveSpan(session, r);
      return span ? [{ id: r.id, version: r.version, position: span.start, representation: r.mode, ranges: r.ranges,
        timeStart: r.timeStart, timeEnd: r.timeEnd, summary: r.summary, documents: r.documents,
        originalChars: r.originalChars, detailedChars: recordText(r).length, briefChars: recordText(r, 'brief').length }] : [];
    }),
    recent_events: (cfg.coordinatorRecentEvents ? session.surface.nodes.slice(-cfg.coordinatorRecentEvents) : []).map(seq => {
      const e = session.eventAt(seq); return { seq, type: e.type, text: rawText(session, e) };
    }),
  };
}

export function newRecord(session, events, prepared, binding) {
  const times = events.map(eventTime).filter(Number.isFinite), seqs = events.map(e => e.seq);
  return { id: randomUUID(), version: 1, mode: 'raw', sourceSeqs: seqs, sourceHash: sourceHash(session, seqs),
    ranges: [{ sessionId: session.id, from: Math.min(...seqs), to: Math.max(...seqs) }],
    timeStart: times.length ? Math.min(...times) : null, timeEnd: times.length ? Math.max(...times) : null,
    originalChars: events.reduce((n, e) => n + rawText(session, e).length, 0),
    ...prepared, sessionId: session.id, project: binding.project, scope: binding.scope, createdAt: Date.now(), parents: [] };
}
