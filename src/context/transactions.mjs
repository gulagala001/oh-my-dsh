import { randomUUID } from 'node:crypto';
import { hash, liveSpan, recordText, recordBlocks, userRevision, exposedTrace, actualUser, carrierBarrier } from './core.mjs';
import { combineAssets, combineUsers, userDocument, attachmentsOf, contentChars, messageTokens } from './materials.mjs';
import { TRACE_HEAD } from './prompts.mjs';

export function createTransaction(session, state, plan, cfg, pairing, pricing = {}) {
  if (state.transaction) return state.transaction;
  if (plan.userRevision !== userRevision(session)) throw new Error('用户消息已变化，本轮替换计划作废');
  const working = structuredClone(state.records), map = new Map(working.map(r => [r.id, r]));
  const operations = [], chosen = new Set(), changedSources = new Set(), origins = new Set();
  let inputChars = 0, outputChars = 0, inputTokens = 0, outputTokens = 0, selectedRecords = 0;
  const barrier = carrierBarrier(session, state, cfg);
  const sourceMessage = seq => session.deriveEventMessage(session.eventAt(seq));
  for (const choice of plan.choices) {
    if (choice.action === 'keep') continue;
    const picked = choice.ids.map((id, i) => {
      const r = map.get(id), observed = choice.observed[i];
      if (!r || r.mergedInto || chosen.has(id) || !observed || observed.version !== r.version || observed.mode !== r.mode || observed.carrierSeq !== (r.carrierSeq ?? null) || observed.sourceHash !== r.sourceHash) throw new Error('记录版本已变化，本轮替换计划作废');
      chosen.add(id);
      const span = liveSpan(session, r);
      if (!span || !pairing.before(session, span.seqs[0]) || !pairing.after(session, span.seqs.at(-1))) throw new Error('替换范围已变化或工具往返不完整');
      return { r, span };
    }).sort((a, b) => a.span.start - b.span.start);
    if (choice.action !== 'merge' && picked[0].r.mode === choice.action) continue;
    let output;
    if (choice.action === 'merge') {
      const originals = picked.map(p => p.r), times = originals.flatMap(r => [r.timeStart, r.timeEnd]).filter(Number.isFinite);
      const users = combineUsers(...originals.map(r => r.userOriginals || []));
      output = { id: randomUUID(), version: 1, mode: choice.mode || 'brief', kind: originals.some(r => r.kind === 'full') ? 'full' : 'window',
        summary: choice.summary, documents: [...structuredClone(choice.documents), ...userDocument(users)], userOriginals: users,
        assets: combineAssets(...originals.map(r => r.assets || [])), summaryFormatVersion: 2,
        sessionId: session.id, scope: state.binding.scope, project: state.binding.project, createdAt: Date.now(),
        parents: originals.map(r => r.id), sourceSeqs: [...new Set(originals.flatMap(r => r.sourceSeqs))],
        originalSeqs: [...new Set(originals.flatMap(r => r.originalSeqs || r.sourceSeqs))].sort((a,b) => a-b),
        ranges: originals.flatMap(r => r.ranges), sourceHash: hash(originals.map(r => r.sourceHash)),
        timeStart: times.length ? Math.min(...times) : null, timeEnd: times.length ? Math.max(...times) : null,
        originalChars: originals.reduce((n, r) => n + r.originalChars, 0) };
      for (const { r } of picked) r.mergedInto = output.id;
      working.push(output); map.set(output.id, output);
    } else { output = picked[0].r; output.mode = choice.action; }
    const selectedSeqs = picked.flatMap(p => p.span.seqs);
    if (selectedSeqs.some(seq => changedSources.has(seq))) throw Error('替换计划包含重叠来源，原文保留');
    for (const seq of selectedSeqs) changedSources.add(seq);
    for (const seq of output.originalSeqs || output.sourceSeqs) origins.add(seq);
    selectedRecords += picked.length;
    output.assets = combineAssets(output.assets || [], ...selectedSeqs.map(seq => attachmentsOf(sourceMessage(seq)?.content, session.id, seq)));
    const content = recordBlocks(output, output.mode), text = recordText(output, output.mode);
    const groups = picked.flatMap(p => p.span.groups || [p.span.seqs]);
    const carrierIndex = groups.findIndex(group => session.surface.nodes.indexOf(group[0]) > barrier);
    if (carrierIndex < 0) throw Error('摘要需要放在前置 CoT 或首条请求之后，请扩大处理窗口；原文保留');
    const orderedGroups = [groups[carrierIndex], ...groups.filter((_, i) => i !== carrierIndex)];
    const sourceTokens = selectedSeqs.reduce((n, seq) => n + messageTokens(sourceMessage(seq), pricing), 0);
    const resultTokens = messageTokens({ role: 'user', content }, pricing);
    inputTokens += sourceTokens; outputTokens += resultTokens;
    inputChars += selectedSeqs.reduce((n, seq) => n + contentChars(sourceMessage(seq)?.content), 0);
    outputChars += contentChars(content);
    orderedGroups.forEach((seqs, i) => operations.push({ id: randomUUID(), kind: i ? 'delete' : 'record',
      ...(i ? {} : { recordId: output.id, content, accountingSeqs: selectedSeqs, originalEventCount: (output.originalSeqs || output.sourceSeqs).length,
        inputTokens: sourceTokens, outputTokens: resultTokens }), seqs, text: i ? '' : text, position: session.surface.nodes.indexOf(seqs[0]) }));
  }
  if (!operations.length) return null;
  let traceSlot = structuredClone(state.traceSlot), trace = cfg.traceEnabled ? exposedTrace(session, { maxChars: cfg.traceMaxChars, afterSeq: state.fullCompaction?.throughSeq ?? -1 }) : null;
  if (trace) {
    const slotLive = traceSlot && session.surface.nodes.includes(traceSlot.carrierSeq);
    const firstChanged = Math.min(...operations.filter(o => o.kind === 'record').map(o => o.position));
    const covered = new Set(operations.flatMap(o => o.seqs));
    const anchor = slotLive ? session.eventAt(traceSlot.carrierSeq) : session.surface.nodes.slice(0, firstChanged).map(seq => session.eventAt(seq)).find(e => actualUser(e) && !covered.has(e.seq));
    if (!anchor && !state.fullCompaction) throw new Error('所选摘要之前没有安全的推理承载位置；原文保留。');
    if (anchor && (!slotLive || traceSlot.traceHash !== hash(trace))) {
      const original = slotLive ? traceSlot.original : structuredClone(anchor.data);
      const text = `[${TRACE_HEAD} · source event ${trace.sourceSeq}${trace.truncated ? ' · excerpt' : ''}]\n${trace.text}\n[End previous analysis]\n`;
      const content = [{ type: 'text', text }, ...(original.content || [])];
      inputChars += contentChars(sourceMessage(anchor.seq)?.content); outputChars += contentChars(content);
      inputTokens += messageTokens(sourceMessage(anchor.seq), pricing); outputTokens += messageTokens({ role: 'user', content }, pricing);
      operations.unshift({ id: randomUUID(), kind: 'trace', seqs: [anchor.seq], text, original, position: session.surface.nodes.indexOf(anchor.seq) });
      traceSlot = { original, traceHash: hash(trace), sourceSeq: trace.sourceSeq, sourceAt: trace.at, truncated: trace.truncated };
    }
  }
  if (cfg.requireShorter !== false && outputTokens >= inputTokens) {
    const error = new Error(`摘要、详细资料与推理前置合计没有缩短上下文（估算 ${inputTokens} → ${outputTokens} tokens），保留原文`);
    error.cost = { inputTokens, outputTokens, inputChars, outputChars }; throw error;
  }
  for (const op of operations) if (plan.sourceCommandId) op.sourceCommandId = plan.sourceCommandId;
  return { id: randomUUID(), planId: plan.id, operations, records: working, traceSlot, inputChars, outputChars, inputTokens, outputTokens,
    stats: { selectedRecords, currentMessages: [...changedSources].filter(seq => sourceMessage(seq)).length, currentNodes: changedSources.size, originalEvents: origins.size, resultRecords: operations.filter(o => o.kind === 'record').length,
      estimatedSavedTokens: inputTokens - outputTokens, costBasis: pricing.imagePricing || pricing.fileText ? 'route-estimate' : 'host-estimate' },
    createdAt: Date.now(), applied: {}, source: plan.source || 'coordinator', userRevision: plan.userRevision };
}

function eventMessageId(e) { return e.type === 'user/message' ? e.data?.id : e.data?.message?.id; }

// adapter methods use the host's public session append/flush APIs. No model call is made here.
export async function applyTransaction(session, state, tx, store, adapter) {
  if (!tx) return null;
  state.transaction = tx; store.save(state);
  try {
    for (const op of tx.operations) {
      const existing = session.snapshotEvents().find(e => eventMessageId(e) === op.id);
      if (existing) { tx.applied[op.id] = existing.seq; continue; }
      const nodes = session.surface.nodes, index = nodes.indexOf(op.seqs[0]);
      if (index < 0 || op.seqs.some((seq, i) => nodes[index + i] !== seq)) throw new Error('未完成事务的来源区间发生变化；已保留日志，停止发送以免扩大损失');
      const refs = [...op.seqs];
      const event = adapter.append(session, op, { op: 'replace', startSeq: op.seqs[0], endSeq: op.seqs.at(-1) }, refs);
      tx.applied[op.id] = event.seq;
      store.save(state);
    }
    await adapter.flush(session);
    for (const op of tx.operations) {
      if (op.kind === 'record') tx.records.find(r => r.id === op.recordId).carrierSeq = tx.applied[op.id];
      if (op.kind === 'trace') tx.traceSlot.carrierSeq = tx.applied[op.id];
    }
    state.records = tx.records; state.traceSlot = tx.traceSlot;
    if (tx.statePatch) Object.assign(state, tx.statePatch);
    state.pending = null; state.transaction = null;
    state.lastReplacementStep = state.steps;
    const native = tx.operations.filter(o => o.native);
    state.lastReplacement = { ...(native[0]?.native || {}),
      shadowedSeqs: [...new Set(native.flatMap(o => o.native.shadowedSeqs || []))],
      shadowedTokenCount: native.reduce((n, o) => n + (o.native.shadowedTokenCount || 0), 0),
      id: tx.id, source: tx.source, at: Date.now(), inputChars: tx.inputChars, outputChars: tx.outputChars,
      inputTokens: tx.inputTokens, outputTokens: tx.outputTokens, stats: tx.stats || null,
      operations: tx.operations.map(o => ({ kind: o.kind, seqs: o.seqs, resultSeq: tx.applied[o.id], recordId: o.recordId })) };
    store.save(state);
    return state.lastReplacement;
  } catch (error) {
    // Keep the write-ahead transaction. A restart can finish the same operations once.
    state.transaction = tx; tx.error = error.message; store.save(state); throw error;
  }
}
