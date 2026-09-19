import { withoutTodo, isTaskInjection, TODO_META } from '../task-context.mjs';
import { attachTodoRefresh, requireSavings } from './todo-refresh.mjs';
import { randomUUID } from 'node:crypto';
import { hash, liveSpan, recordText, recordBlocks, exposedTrace, actualUser, carrierBarrier, recordSnapshot, sourceHash, splitGroups } from './core.mjs';
import { combineAssets, attachmentsOf, contentChars, messageTokens } from './materials.mjs';
import { TRACE_HEAD } from './prompts.mjs';

export function createTransaction(session, state, plan, cfg, pairing, pricing = {}) {
  if (state.transaction) return state.transaction;
  if (plan.choices.some(c => c.action === 'merge')) throw new Error('中枢合并已关闭');
  const working = structuredClone(state.records), map = new Map(working.map(r => [r.id, r]));
  const operations = [], chosen = new Set(), changedSources = new Set(), origins = new Set();
  let inputChars = 0, outputChars = 0, inputTokens = 0, outputTokens = 0, selectedRecords = 0;
  const barrier = carrierBarrier(session, state, cfg);
  const sourceMessage = seq => session.deriveEventMessage(session.eventAt(seq));
  for (const choice of plan.choices) {
    if (choice.action === 'keep') continue;
    const picked = choice.ids.map((id, i) => {
      const r = map.get(id), observed = choice.observed[i];
      if (!r || r.mergedInto || chosen.has(id) || !observed || observed.version !== r.version || observed.mode !== r.mode || observed.carrierSeq !== (r.carrierSeq ?? null) || observed.sourceHash !== r.sourceHash || (observed.snapshot && observed.snapshot !== recordSnapshot(session, r))) throw new Error('记录版本已变化，本轮替换计划作废');
      chosen.add(id);
      const span = liveSpan(session, r);
      if (!span || !pairing.before(session, span.seqs[0]) || !pairing.after(session, span.seqs.at(-1))) throw new Error('替换范围已变化或工具往返不完整');
      return { r, span };
    }).sort((a, b) => a.span.start - b.span.start);
    if (picked[0].r.mode === choice.action) continue;
    const output = picked[0].r; output.mode = choice.action;
    const selectedSeqs = picked.flatMap(p => p.span.seqs).filter(seq => !isTaskInjection(session.eventAt(seq)));
    if (!selectedSeqs.length) continue;
    if (selectedSeqs.some(seq => changedSources.has(seq))) throw Error('替换计划包含重叠来源，原文保留');
    for (const seq of selectedSeqs) changedSources.add(seq);
    for (const seq of output.originalSeqs || output.sourceSeqs) origins.add(seq);
    selectedRecords += picked.length;
    output.assets = combineAssets(output.assets || [], ...selectedSeqs.map(seq => attachmentsOf(sourceMessage(seq)?.content, session.id, seq)));
    const content = recordBlocks(output, output.mode), text = recordText(output, output.mode);
    const groups = picked.flatMap(p => splitGroups(session.surface.nodes, p.span.seqs.filter(seq => !isTaskInjection(session.eventAt(seq)))));
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
    const anchor = slotLive ? session.eventAt(traceSlot.carrierSeq) : session.surface.nodes.slice(0, firstChanged).map(seq => session.eventAt(seq)).find(e => (actualUser(e) || e.data?.source?.plugin === 'trisoul-x:todo-prefix') && !covered.has(e.seq));
    if (!anchor && !state.fullCompaction) throw new Error('所选摘要之前没有安全的推理承载位置；原文保留。');
    if (anchor && (!slotLive || traceSlot.traceHash !== hash(trace))) {
      const original = slotLive ? traceSlot.original : structuredClone(withoutTodo(anchor.data));
      const text = `[${TRACE_HEAD} · source event ${trace.sourceSeq}${trace.truncated ? ' · excerpt' : ''}]\n${trace.text}\n[End previous analysis]\n`;
      const content = [{ type: 'text', text }, ...(original.content || [])];
      const previous = sourceMessage(anchor.seq), savedTodo = previous?.[TODO_META];
      if (savedTodo) content.splice(1, 0, previous.content[savedTodo.index]);
      const traceId = randomUUID(), todoMeta = savedTodo ? { ...savedTodo, index: 1, baseId: traceId, baseSource: { kind: 'plugin', plugin: 'trisoul-x:trace' } } : null;
      inputChars += contentChars(sourceMessage(anchor.seq)?.content); outputChars += contentChars(content);
      inputTokens += messageTokens(sourceMessage(anchor.seq), pricing); outputTokens += messageTokens({ role: 'user', content }, pricing);
      operations.unshift({ id: traceId, kind: 'trace', seqs: [anchor.seq], text, original, content, ...(todoMeta ? { todoMeta } : {}), position: session.surface.nodes.indexOf(anchor.seq) });
      const movedSourceSeqs = [...new Set([...(traceSlot?.movedSourceSeqs || (traceSlot ? [traceSlot.sourceSeq] : [])), trace.sourceSeq])]
        .filter(seq => session.surface.nodes.includes(seq) && !covered.has(seq));
      traceSlot = { original, traceHash: hash(trace), sourceSeq: trace.sourceSeq, sourceAt: trace.at, truncated: trace.truncated, movedSourceSeqs };
    }
  }
  for (const op of operations) if (plan.sourceCommandId) op.sourceCommandId = plan.sourceCommandId;
  const tx = { id: randomUUID(), planId: plan.id, operations, records: working, traceSlot, inputChars, outputChars, inputTokens, outputTokens,
    stats: { selectedRecords, currentMessages: [...changedSources].filter(seq => sourceMessage(seq)).length, currentNodes: changedSources.size, originalEvents: origins.size, resultRecords: operations.filter(o => o.kind === 'record').length,
      estimatedSavedTokens: inputTokens - outputTokens, costBasis: pricing.imagePricing || pricing.fileText ? 'route-estimate' : 'host-estimate' },
    createdAt: Date.now(), applied: {}, source: plan.source || 'coordinator', userRevision: plan.userRevision };
  return requireSavings(attachTodoRefresh(session, tx, pricing), cfg.requireShorter !== false);
}

function eventMessageId(e) { return e.type === 'user/message' ? e.data?.id : e.data?.message?.id; }

// adapter methods use the host's public session append/flush APIs. No model call is made here.
export async function applyTransaction(session, state, tx, store, adapter) {
  if (!tx) return null;
  state.transaction = tx; store.save(state);
  try {
    let enteredTodoPhase = false;
    const existingById = new Map();
    for (const event of session.snapshotEvents()) {
      const id = eventMessageId(event);
      if (id && !existingById.has(id)) existingById.set(id, event);
    }
    for (const op of tx.operations) {
      if (!enteredTodoPhase && (op.kind.startsWith('todo-') || op.todoCleanup)) {
        await adapter.flush(session); enteredTodoPhase = true;
      }
      const refs = op.seqs.map(seq => typeof seq === 'number' ? seq : tx.applied[seq]);
      if (refs.some(seq => !Number.isSafeInteger(seq))) throw Error('todo 刷新事务的承载消息尚未提交');
      op.resolvedSeqs = refs;
      const existing = existingById.get(op.id);
      if (existing) { tx.applied[op.id] = existing.seq; continue; }
      const nodes = session.surface.nodes, index = nodes.indexOf(refs[0]);
      if (index < 0 || refs.some((seq, i) => nodes[index + i] !== seq)) throw new Error('未完成事务的来源区间发生变化；已保留日志，停止发送以免扩大损失');
      if (op.kind === 'todo-refresh') {
        const base = withoutTodo(session.deriveEventMessage(session.eventAt(refs[0])));
        op.message = { ...base, ...op.message, source: base.source?.kind === 'user' ? { kind: 'plugin', plugin: 'trisoul-x:todo-prefix' } : base.source,
          [TODO_META]: { ...op.message[TODO_META], baseId: base.id, baseSource: base.source } };
        store.save(state);
      }
      const event = adapter.append(session, op, { op: 'replace', startSeq: refs[0], endSeq: refs.at(-1) }, refs);
      tx.applied[op.id] = event.seq; existingById.set(op.id, event);
      store.save(state);
    }
    await adapter.flush(session);
    for (const op of tx.operations) {
      if (op.kind === 'record') tx.records.find(r => r.id === op.recordId).carrierSeq = tx.applied[op.id];
      if (op.kind === 'trace') tx.traceSlot.carrierSeq = tx.applied[op.id];
      if (op.kind === 'todo-refresh' || op.kind === 'todo-restore' || op.todoCleanup) {
        const before = op.resolvedSeqs[0], after = tx.applied[op.id];
        if (tx.traceSlot?.carrierSeq === before) tx.traceSlot.carrierSeq = after;
        for (const r of tx.records.filter(r => !r.mergedInto)) {
          if (r.carrierSeq === before) { r.carrierSeq = after; r.version++; }
          if (r.mode === 'raw' && r.sourceSeqs.includes(before)) {
            r.originalSeqs ||= [...r.sourceSeqs];
            r.sourceSeqs = r.sourceSeqs.map(seq => seq === before ? after : seq);
            r.sourceHash = sourceHash(session, r.sourceSeqs); r.version++;
          }
          if (r.retainedSeqs) r.retainedSeqs = r.retainedSeqs.map(seq => seq === before ? after : seq);
        }
      }
    }
    state.records = tx.records; state.traceSlot = tx.traceSlot;
    if (tx.todoRefresh) state.todoRefresh = { ...tx.todoRefresh, carrierSeq: tx.applied[tx.todoRefresh.operationId], at: Date.now() };
    if (tx.statePatch) Object.assign(state, tx.statePatch);
    if (tx.source === 'runtime-disable') {
      // Only our control text changed. Preserve prepared decisions and cadence,
      // rebasing their observations over the equivalent retained material.
      for (const choice of state.pending?.choices || []) choice.observed = choice.ids.map(id => {
        const r = state.records.find(r => r.id === id), span = r && liveSpan(session, r);
        return span ? { id, version: r.version, carrierSeq: r.carrierSeq ?? null, mode: r.mode, start: span.start,
          sourceHash: r.sourceHash, snapshot: recordSnapshot(session, r) } : null;
      });
      state.transaction = null; store.save(state);
      return { id: tx.id, source: tx.source, changed: true };
    }
    state.pending = null; state.transaction = null;
    state.lastReplacementStep = state.steps;
    const native = tx.operations.filter(o => o.native);
    state.lastReplacement = { ...(native[0]?.native || {}),
      shadowedSeqs: [...new Set(native.flatMap(o => o.native.shadowedSeqs || []))],
      shadowedTokenCount: native.reduce((n, o) => n + (o.native.shadowedTokenCount || 0), 0),
      id: tx.id, source: tx.source, at: Date.now(), inputChars: tx.inputChars, outputChars: tx.outputChars,
      inputTokens: tx.inputTokens, outputTokens: tx.outputTokens, stats: tx.stats || null,
      operations: tx.operations.map(o => ({ kind: o.kind, seqs: o.resolvedSeqs || o.seqs, resultSeq: tx.applied[o.id], recordId: o.recordId })) };
    store.save(state);
    return state.lastReplacement;
  } catch (error) {
    // Keep the write-ahead transaction. A restart can finish the same operations once.
    state.transaction = tx; tx.error = error.message; store.save(state); throw error;
  }
}
