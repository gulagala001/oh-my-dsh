import { randomUUID } from 'node:crypto';
import { hash, liveSpan, recordText, rawText, userRevision, exposedTrace, actualUser, eventSource } from './core.mjs';
import { TRACE_HEAD } from './prompts.mjs';

export function createTransaction(session, state, plan, cfg, pairing) {
  if (state.transaction) return state.transaction;
  if (plan.userRevision !== userRevision(session)) throw new Error('用户消息已变化，本轮替换计划作废');
  const working = structuredClone(state.records), map = new Map(working.map(r => [r.id, r]));
  const operations = [], chosen = new Set();
  let inputChars = 0, outputChars = 0;
  for (const choice of plan.choices) {
    const picked = choice.ids.map((id, i) => {
      const r = map.get(id), observed = choice.observed[i];
      if (!r || r.mergedInto || chosen.has(id) || !observed || observed.version !== r.version || observed.mode !== r.mode || observed.carrierSeq !== (r.carrierSeq ?? null) || observed.sourceHash !== r.sourceHash) throw new Error('记录版本已变化，本轮替换计划作废');
      chosen.add(id);
      const span = liveSpan(session, r);
      if (!span || !pairing.before(session, span.seqs[0]) || !pairing.after(session, span.seqs.at(-1))) throw new Error('替换范围已变化或工具往返不完整');
      return { r, span };
    }).sort((a, b) => a.span.start - b.span.start);
    if (choice.action === 'keep') continue;
    if (choice.action !== 'merge' && picked[0].r.mode === choice.action) continue;
    let output;
    if (choice.action === 'merge') {
      const originals = picked.map(p => p.r), times = originals.flatMap(r => [r.timeStart, r.timeEnd]).filter(Number.isFinite);
      output = { id: randomUUID(), version: 1, mode: 'detail', summary: choice.summary, documents: structuredClone(choice.documents),
        sessionId: session.id, scope: state.binding.scope, project: state.binding.project, createdAt: Date.now(),
        parents: originals.map(r => r.id), sourceSeqs: [...new Set(originals.flatMap(r => r.sourceSeqs))],
        ranges: originals.flatMap(r => r.ranges), sourceHash: hash(originals.map(r => r.sourceHash)),
        timeStart: times.length ? Math.min(...times) : null, timeEnd: times.length ? Math.max(...times) : null,
        originalChars: originals.reduce((n, r) => n + r.originalChars, 0) };
      for (const { r } of picked) r.mergedInto = output.id;
      working.push(output); map.set(output.id, output);
    } else { output = picked[0].r; output.mode = choice.action; }
    const text = recordText(output, output.mode), first = picked[0];
    operations.push({ id: randomUUID(), kind: 'record', recordId: output.id, seqs: first.span.seqs, text, position: first.span.start });
    inputChars += picked.reduce((n, p) => n + p.span.seqs.reduce((m, seq) => m + rawText(session, session.eventAt(seq)).length, 0), 0);
    outputChars += text.length;
    for (const { span } of picked.slice(1)) operations.push({ id: randomUUID(), kind: 'delete', seqs: span.seqs, text: '', position: span.start });
  }
  if (!operations.length) return null;
  let traceSlot = structuredClone(state.traceSlot), trace = cfg.traceEnabled ? exposedTrace(session, { maxChars: cfg.traceMaxChars }) : null;
  // Only a real, provider-exposed reasoning text can enter this slot.
  if (trace) {
    const slotLive = traceSlot && session.surface.nodes.includes(traceSlot.carrierSeq);
    const firstChanged = Math.min(...operations.map(o => o.position));
    const covered = new Set(state.records.flatMap(r => r.mode === 'raw' ? r.sourceSeqs : [r.carrierSeq]));
    const anchor = slotLive ? session.eventAt(traceSlot.carrierSeq) : session.surface.nodes.slice(0, firstChanged).map(seq => session.eventAt(seq)).find(e => e.type === 'user/message' && !covered.has(e.seq));
    if (!anchor) throw new Error('所选摘要之前没有安全的推理承载位置；原文保留。可关闭推理前置后应用此旧会话的替换。');
    if (anchor) {
      const original = slotLive ? traceSlot.original : structuredClone(anchor.data);
      const originalText = (original.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const text = `[${TRACE_HEAD} · source event ${trace.sourceSeq}${trace.truncated ? ' · excerpt' : ''}]\n${trace.text}\n[End previous analysis]\n`;
      const oldCost = slotLive ? rawText(session, anchor).length : originalText.length;
      outputChars += text.length + originalText.length - oldCost;
      if (!slotLive || traceSlot.traceHash !== hash(trace)) {
        operations.unshift({ id: randomUUID(), kind: 'trace', seqs: [anchor.seq], text, original, position: session.surface.nodes.indexOf(anchor.seq) });
        traceSlot = { original, traceHash: hash(trace), sourceSeq: trace.sourceSeq, sourceAt: trace.at, truncated: trace.truncated };
      }
    }
  }
  if (cfg.requireShorter !== false && outputChars >= inputChars) throw new Error('摘要、文档与推理前置合计没有缩短上下文，保留原文');
  for (const op of operations) if (plan.sourceCommandId) op.sourceCommandId = plan.sourceCommandId;
  const tx = { id: randomUUID(), planId: plan.id, operations, records: working, traceSlot, inputChars, outputChars,
    createdAt: Date.now(), applied: {}, source: plan.source || 'coordinator', userRevision: plan.userRevision };
  return tx;
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
    state.pending = null; state.transaction = null;
    state.lastReplacementStep = state.steps;
    state.lastReplacement = { ...(tx.operations.find(o => o.native)?.native || {}), id: tx.id, source: tx.source, at: Date.now(), inputChars: tx.inputChars, outputChars: tx.outputChars,
      operations: tx.operations.map(o => ({ kind: o.kind, seqs: o.seqs, resultSeq: tx.applied[o.id], recordId: o.recordId })) };
    store.save(state);
    return state.lastReplacement;
  } catch (error) {
    // Keep the write-ahead transaction. A restart can finish the same operations once.
    state.transaction = tx; tx.error = error.message; store.save(state); throw error;
  }
}
