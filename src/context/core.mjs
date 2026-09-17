import { isTaskInjection, summaryMessageReader, withoutTodo, TODO_META } from '../task-context.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { attachmentsOf, combineAssets, combineUsers, userDocument, describeAsset, materialText, contentChars, messageTokens, assetBlocks } from './materials.mjs';

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
    + ((record.assets || []).length ? `\n[${record.assets.length} saved attachments; recall with id and asset (1-based) to reopen one.]` : '')
    + `\n[${record.documents.length ? "Saved documents" : "Archived record"}: recall({"id":"${record.id}"})]`;
}
export function activeRecords(state) { return state.records.filter(r => !r.mergedInto); }
export function protectedEvent(session, e) {
  if (!e) return true;
  const source = eventSource(e), message = session.deriveEventMessage(e);
  return (e.type === 'system/message' && source !== 'trisoul-x:shadow')
    || (message?.role === 'system' && source !== 'trisoul-x:shadow')
    || source === 'trisoul-x:todo-prefix' || source === '@deepseek-ai/dsh-system-prompt' || source === 'trisoul-x:trace' || source === 'trisoul-x:manual-global';
}
export function preparationStop(session, cfg) {
  const nodes = session.surface.nodes, live = nodes.flatMap((seq, i) => session.deriveEventMessage(session.eventAt(seq)) ? [i] : []);
  const tail = cfg.keepTailEvents ?? 30, nominal = tail ? (live[Math.max(0, live.length - tail)] ?? 0) : nodes.length;
  const pending = new Set(); let balanced = 0;
  for (let i = 0; i < nominal; i++) {
    const blocks = session.deriveEventMessage(session.eventAt(nodes[i]))?.content || [];
    for (const block of blocks) {
      if (block.type === 'tool-call') pending.add(block.id);
      else if (block.type === 'tool-result') pending.delete(block.toolCallId);
    }
    if (!pending.size) balanced = i + 1;
  }
  return balanced;
}
export function carrierBarrier(session, state, cfg) {
  const nodes = session.surface.nodes;
  const saved = state.traceSlot && nodes.includes(state.traceSlot.carrierSeq) ? state.traceSlot.carrierSeq : undefined;
  const trace = saved ?? nodes.find(seq => eventSource(session.eventAt(seq)) === 'trisoul-x:trace');
  const anchor = trace ?? (cfg.traceEnabled && !state.fullCompaction ? nodes.find(seq => actualUser(session.eventAt(seq)) || eventSource(session.eventAt(seq)) === 'trisoul-x:todo-prefix') : undefined);
  return nodes.indexOf(anchor);
}
const windowText = (session, event, retained) => retained && !actualUser(event)
  ? '[Protected host context is retained in place and is not a summary source.]'
  : materialText(session.deriveEventMessage(event)?.content, event.seq);
export function protectedSeqs(session, state, cfg) {
  const keep = new Set(session.surface.nodes.filter(seq => protectedEvent(session, session.eventAt(seq))));
  // The established Trace slot carries the first request. Keep that anchor in
  // place, but read across it; it is never a segmentation boundary.
  if (cfg.traceEnabled && !state.traceSlot && !state.fullCompaction) {
    const anchor = session.surface.nodes.find(seq => actualUser(session.eventAt(seq)) || eventSource(session.eventAt(seq)) === 'trisoul-x:todo-prefix');
    if (anchor !== undefined) keep.add(anchor);
  }
  return keep;
}
export function splitGroups(nodes, seqs) {
  const selected = new Set(seqs), groups = []; let run = [];
  for (const seq of nodes) {
    if (selected.has(seq)) run.push(seq);
    else if (run.length) { groups.push(run); run = []; }
  }
  if (run.length) groups.push(run);
  return groups;
}
export function liveSpan(session, record) {
  if (!(record.kind === 'window' || (record.kind === 'full' && record.mode !== 'raw'))
    && record.sourceSeqs.some(seq => protectedSource(session.eventAt(seq)))) return null;
  const seqs = record.mode === 'raw' ? record.sourceSeqs : [record.carrierSeq];
  if (!seqs?.length || seqs.some(s => !Number.isSafeInteger(s))) return null;
  const nodes = session.surface.nodes, positions = seqs.map(seq => nodes.indexOf(seq));
  if (positions.some((p, i) => p < 0 || (i && p <= positions[i - 1]))) return null;
  const start = positions[0], end = positions.at(-1), groups = splitGroups(nodes, seqs);
  if (record.mode === 'raw') {
    if (record.kind !== 'window' && groups.length !== 1) return null;
    const selected = new Set(seqs), retained = new Set(record.retainedSeqs || []);
    if (nodes.slice(start, end + 1).some(seq => !selected.has(seq) && !retained.has(seq))) return null;
    if (record.kind === 'window' && seqs.some(seq => protectedEvent(session, session.eventAt(seq)))) return null;
    if (sourceHash(session, seqs) !== record.sourceHash) return null;
  }
  return { seqs: [...seqs], groups, start, end };
}

// Compare the records actually supplied to the coordinator, not a growing
// conversation-wide hash: unrelated new steps must not invalidate good work.
export function recordSnapshot(session, record) {
  if (!record || record.mergedInto) return null;
  const span = liveSpan(session, record); if (!span) return null;
  return hash([record.version, record.mode, record.carrierSeq ?? null, record.sourceHash,
    record.summary, record.documents, record.assets || [], span.seqs,
    span.seqs.map(seq => session.deriveEventMessage(session.eventAt(seq)))]);
}

// Continuation considers fresh work only, never lookback, protected messages,
// old checkpoints, or binary attachment bytes already stored by the host.
export function preparationWorkload(session, state, events) {
  const covered = new Set(activeRecords(state).flatMap(r => liveSpan(session, r)?.seqs || []));
  const fresh = events.filter(e => !covered.has(e.seq) && (actualUser(e)
    || (['assistant/message', 'tool/result'].includes(e.type) && !eventSource(e))));
  return { events: fresh.length, estimatedTokens: Math.ceil(fresh.reduce((n, e) =>
    n + contentChars(session.deriveEventMessage(e)?.content), 0) / 4) };
}

export function normalizeChoices(value, state, session, allowedIds) {
  if (!Array.isArray(value?.choices)) throw new Error('中枢未提交 choices');
  const records = new Map(activeRecords(state).map(r => [r.id, r])), used = new Set();
  return value.choices.map(choice => {
    if (choice?.action === 'merge') throw new Error('中枢合并已关闭');
    if (!['keep', 'detail', 'brief'].includes(choice?.action) || !Array.isArray(choice.ids)) throw new Error('中枢选项无效');
    const ids = choice.ids;
    if (ids.length !== 1) throw new Error('单项选择必须一个 ID');
    const selected = ids.map(id => {
      if (typeof id !== 'string' || !records.has(id) || used.has(id) || (allowedIds && !allowedIds.has(id))) throw new Error(`记录不存在、已合并或重复选择：${id}`);
      used.add(id);
      const r = records.get(id), span = liveSpan(session, r);
      if (!span) throw new Error(`记录已不在当前上下文：${id}`);
      return { id, version: r.version, carrierSeq: r.carrierSeq ?? null, mode: r.mode, start: span.start, sourceHash: r.sourceHash, snapshot: recordSnapshot(session, r) };
    }).sort((a, b) => a.start - b.start);
    if ((choice.summary ?? '') !== '' || (choice.documents ?? []).length) throw new Error('中枢选择不能生成正文');
    return { action: choice.action, ids: selected.map(r => r.id), observed: selected, summary: '', documents: [] };
  });
}

export function exposedTrace(session, { maxChars = 0, afterSeq = -1 } = {}) {
  for (const e of session.snapshotEvents().slice().reverse()) {
    if (e.seq <= afterSeq || e.type !== 'assistant/message' || e.data?.message?.source?.plugin) continue;
    const blocks = e.data?.message?.content;
    if (!Array.isArray(blocks)) continue;
    const text = blocks.filter(b => b.type === 'reasoning' && typeof b.text === 'string').map(b => b.text).join('\n').trim();
    if (text) return { sourceSeq: e.seq, at: eventTime(e), text: maxChars > 0 ? text.slice(-maxChars) : text, truncated: maxChars > 0 && text.length > maxChars };
  }
  return null;
}

function legacyPrepareCandidate(session, state, cfg, pairing) {
  const nodes = session.surface.nodes;
  const events = nodes.map(seq => session.eventAt(seq));
  const reserved = new Set(activeRecords(state).flatMap(r => r.mode === 'raw' ? r.sourceSeqs : [r.carrierSeq]));
  const latest = new Map();
  for (const e of events) {
    const src = eventSource(e);
    if (['trisoul-x:state', 'trisoul-x:tasks'].includes(src)) latest.set(src, e.seq);
  }
  const stop = preparationStop(session, cfg);
  const boundary = e => {
    if (isTaskInjection(e)) return false;
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
    if (!run.length || run.every(isTaskInjection)) return null;
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

export function prepareCandidate(session, state, cfg, pairing) {
  if (cfg.preprocessBoundaries === true) {
    const events = legacyPrepareCandidate(session, state, cfg, pairing);
    if (events?.some(isTaskInjection)) Object.assign(events, { wholeWindow: true, windowSeqs: events.map(e => e.seq), retainedSeqs: [] });
    return events;
  }
  const nodes = session.surface.nodes, stop = preparationStop(session, cfg);
  const keep = protectedSeqs(session, state, cfg), owners = new Map(), spans = new Map();
  for (const record of activeRecords(state)) {
    const span = liveSpan(session, record); if (!span) continue;
    spans.set(record.id, span);
    for (const seq of span.seqs) owners.set(seq, record);
  }
  const summaryRead = summaryMessageReader(session);
  const meaningful = seq => !keep.has(seq) && !isTaskInjection(session.eventAt(seq)) && Boolean(session.deriveEventMessage(session.eventAt(seq)));
  let first = -1;
  for (let i = 0; i < stop; i++) {
    if (!meaningful(nodes[i]) || owners.has(nodes[i])) continue;
    if (pairing.before(session, nodes[i])) { first = i; break; }
  }
  if (first < 0) return null;
  let end = first, lastSafe = -1, chars = 0, members = 0;
  const maxChars = (cfg.prepareInputTokens || 300000) * 4;
  for (; end < stop; end++) {
    const seq = nodes[end], e = session.eventAt(seq);
    if (summaryRead(e)) { chars += JSON.stringify(keep.has(seq) ? '[Protected host context retained in place.]' : materialText(summaryRead(e).content, seq)).length + 80; if (!keep.has(seq)) members++; }
    const splitRecord = [...spans.values()].some(span => span.start <= end && span.end > end);
    if (!splitRecord && pairing.after(session, seq)) {
      if (chars > maxChars) {
        if (lastSafe < first) throw Error('一个完整工具往返超过预处理输入预算；原文保留，请提高输入预算。');
        end = lastSafe; break;
      }
      lastSafe = end;
      if (members >= cfg.digestWindow) break;
    }
  }
  if (end >= stop) end = lastSafe;
  if (end < first || lastSafe < first) return null;
  const windowSeqs = nodes.slice(first, end + 1), selected = windowSeqs.filter(seq => !keep.has(seq));
  if (!selected.some(seq => nodes.indexOf(seq) > carrierBarrier(session, state, cfg) && session.deriveEventMessage(session.eventAt(seq)))) return null;
  const selectedSet = new Set(selected);
  // A previously prepared range is indivisible even when it lies inside this window.
  const parents = activeRecords(state).filter(r => {
    const span = spans.get(r.id); return span && span.seqs.some(seq => selectedSet.has(seq));
  });
  if (parents.some(r => !spans.get(r.id).seqs.every(seq => selectedSet.has(seq)))) return null;
  const events = selected.map(seq => session.eventAt(seq));
  if (!events.some(e => session.deriveEventMessage(e))) return null;
  Object.assign(events, { windowSeqs, retainedSeqs: windowSeqs.filter(seq => keep.has(seq)), parents: parents.map(r => r.id), wholeWindow: true });
  return events;
}
export function backlogView(session, state, cfg) {
  const keep = protectedSeqs(session, state, cfg), reserved = new Set();
  for (const r of activeRecords(state)) for (const seq of liveSpan(session, r)?.seqs || []) reserved.add(seq);
  const nodes = session.surface.nodes, stop = preparationStop(session, cfg);
  let events = 0, tokens = 0, recentEvents = 0;
  for (let i = 0; i < nodes.length; i++) {
    const seq = nodes[i], m = session.deriveEventMessage(session.eventAt(seq));
    if (keep.has(seq) || reserved.has(seq) || !m || isTaskInjection(session.eventAt(seq))) continue;
    if (i >= stop) { recentEvents++; continue; }
    events++; tokens += messageTokens(m);
  }
  return { events, estimatedTokens: tokens, recentEvents, protectedEvents: keep.size };
}
export function candidateInput(session, events, lookback) {
  const read = summaryMessageReader(session);
  const all = session.snapshotEvents(), start = all.findIndex(e => e.seq === events[0].seq);
  const prior = lookback > 0 ? all.slice(0, start).filter(e => actualUser(e) || e.type === 'assistant/message' || e.type === 'tool/result').slice(-lookback) : [];
  const segment = (events.windowSeqs || events.map(e => e.seq)).map(seq => session.eventAt(seq));
  return { summary_scope: { source: 'segment', event_seqs: events.filter(e => !actualUser(e) && !(events.retainedSeqs || []).includes(e.seq) && read(e)).map(e => e.seq), reference_only_fields: ['reference', 'user_messages'] },
    reference: prior.filter(e => read(e)).map(e => ({ seq: e.seq, type: e.type, text: materialText(read(e).content, e.seq) })),
    user_messages: userMessages(session).filter(u => u.seq <= Math.max(...segment.map(e => e.seq))).slice(-8),
    segment: segment.filter(e => read(e)).map(e => ({ seq: e.seq, at: eventTime(e), type: e.type,
      protected: (events.retainedSeqs || []).includes(e.seq), reference_only: actualUser(e),
      text: actualUser(e) ? '[User message archived verbatim; see user_messages for reference only.]' : ((events.retainedSeqs || []).includes(e.seq) ? '[Protected host context retained in place.]' : materialText(read(e).content, e.seq)) })) };
}
export function coordinatorInput(session, state, cfg) {
  const read = summaryMessageReader(session);
  return {
    summary_scope: { source: 'selected records only', reference_only_fields: ['user_messages', 'recent_events', 'compacted_conversation', 'context'] },
    user_messages: userMessages(session).filter(e => e.seq > (state.fullCompaction?.throughSeq ?? -1)),
    ...(state.fullCompaction ? { compacted_conversation: state.records.find(r => r.id === state.fullCompaction.recordId)?.summary } : {}),
    context: { entries: session.surface.nodes.map((seq, position) => ({ seq, position })), pressureRatio: cfg.pressureRatio ?? null,
      backlog: backlogView(session, state, cfg), last_rejection: state.review?.lastRejection || null, summary_target_characters: cfg.summaryTargetChars || 1200 },
    records: activeRecords(state).flatMap(r => {
      const span = liveSpan(session, r);
      return span ? [{ id: r.id, version: r.version, position: span.start, representation: r.mode, ranges: r.ranges,
        timeStart: r.timeStart, timeEnd: r.timeEnd, summary: r.summary, documents: r.documents,
        attachments: (r.assets || []).map(describeAsset),
        currentTokens: span.seqs.reduce((n, seq) => n + messageTokens(session.deriveEventMessage(session.eventAt(seq))), 0),
        detailTokens: messageTokens({ role: 'user', content: recordBlocks(r, 'detail') }), briefTokens: messageTokens({ role: 'user', content: recordBlocks(r, 'brief') }),
        originalChars: r.originalChars, detailedChars: recordText(r).length, briefChars: recordText(r, 'brief').length }] : [];
    }),
    recent_events: (cfg.coordinatorRecentEvents ? session.surface.nodes.slice(-cfg.coordinatorRecentEvents) : []).map(seq => {
      const e = session.eventAt(seq); return { seq, type: e.type, text: read(e) ? materialText(read(e).content, seq) : '[Task state omitted from summary input.]' };
    }),
  };
}

export function newRecord(session, events, prepared, binding, { state, wholeWindow = events.wholeWindow || false } = {}) {
  const times = events.map(eventTime).filter(Number.isFinite), seqs = events.map(e => e.seq);
  const parents = (state?.records || []).filter(r => events.parents?.includes(r.id));
  const originals = events.flatMap(e => {
    if (actualUser(e)) return [e];
    const m = session.deriveEventMessage(e), base = withoutTodo(m);
    if (base?.source?.kind !== 'user' && m?.source?.plugin !== 'trisoul-x:todo-prefix') return [];
    const origin = session.snapshotEvents().find(x => actualUser(x) && (x.seq === m?.[TODO_META]?.originalSeq || x.data.id === base.id));
    return origin ? [origin] : [];
  });
  const userOriginals = combineUsers(...parents.map(r => r.userOriginals || []), originals.map(e => ({
    sessionId: session.id, seq: e.seq, at: eventTime(e), content: structuredClone(e.data.content),
  })));
  const assets = combineAssets(...parents.map(r => r.assets || []), ...events.map(e => attachmentsOf(session.deriveEventMessage(e)?.content, session.id, e.seq)));
  const originalSeqs = [...new Set([...seqs.filter(seq => session.deriveEventMessage(session.eventAt(seq)) && !parents.some(r => r.carrierSeq === seq)), ...parents.flatMap(r => r.originalSeqs || r.sourceSeqs), ...originals.map(e => e.seq)])].sort((a,b) => a-b);
  return { id: randomUUID(), version: 1, mode: 'raw', ...(wholeWindow ? { kind: 'window', retainedSeqs: events.retainedSeqs || [] } : {}),
    sourceSeqs: seqs, sourceHash: sourceHash(session, seqs), originalSeqs,
    ranges: [{ sessionId: session.id, from: Math.min(...originalSeqs), to: Math.max(...originalSeqs) }],
    timeStart: times.length ? Math.min(...times) : null, timeEnd: times.length ? Math.max(...times) : null,
    originalChars: events.reduce((n, e) => n + contentChars(session.deriveEventMessage(e)?.content), 0),
    ...prepared, documents: [...prepared.documents.filter(d => d.kind !== 'user-original'), ...userDocument(userOriginals)], assets, userOriginals,
    sessionId: session.id, project: binding.project, scope: binding.scope, createdAt: Date.now(), parents: parents.map(r => r.id) };
}
export function recordBlocks(record, mode = 'detail') {
  return [{ type: 'text', text: recordText(record, mode) }, ...(mode === 'detail' ? assetBlocks(record) : [])];
}
