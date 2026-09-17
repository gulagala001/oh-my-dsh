import { randomUUID } from 'node:crypto';
import { activeRecords, decodeResult, eventSource, hash, liveSpan, newRecord, recordText, sourceHash, userRevision, carrierBarrier } from './core.mjs';
import { messageTokens } from './materials.mjs';
import { SUMMARY_PROMPT_VERSION, FULL_COMPACT_SYSTEM, FULL_COMPACT_TOOL } from './prompts.mjs';

// Full compaction retains actual prompts, not every plugin-generated record.
export function fullSnapshot(session) {
  const nodes = [...session.surface.nodes];
  const globalSeq = nodes.findLast(seq => eventSource(session.eventAt(seq)) === 'trisoul-x:manual-global');
  const retained = new Set(nodes.filter(seq => {
    const e = session.eventAt(seq), m = session.deriveEventMessage(e);
    return (m?.role === 'system' && eventSource(e) !== 'trisoul-x:shadow') || eventSource(e) === '@deepseek-ai/dsh-system-prompt' || eventSource(e) === 'trisoul-x:trace' || seq === globalSeq;
  }));
  const groups = []; let run = [];
  for (const seq of nodes) {
    if (retained.has(seq)) { if (run.length) groups.push(run); run = []; }
    else run.push(seq);
  }
  if (run.length) groups.push(run);
  return { nodes, groups, retained, sourceHash: sourceHash(session, nodes), userRevision: userRevision(session), throughSeq: session.snapshotEvents().at(-1)?.seq ?? -1 };
}

// Opaque media stays retrievable; never infer unseen image/file contents.
function material(blocks, seq) {
  return (blocks || []).map(b => {
    if (b.type === 'text') return b.text || '';
    if (b.type === 'reasoning') return '[Earlier analysis; may be mistaken]\n' + (b.text || '');
    if (b.type === 'tool-call') return `${b.name}(${typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)})`;
    if (b.type === 'tool-result') return (b.isError ? '[error] ' : '') + material(b.content, seq);
    return `[${b.type || 'attachment'} in original event ${seq}; content not supplied${b.name ? '; name: ' + b.name : ''}. Inspect the original conversation attachment.]`;
  }).join('\n');
}

export async function compactFull(pipeline, agent, signal, sourceCommandId) {
  const { hub, adapter } = pipeline, session = agent.session, s = pipeline.state(session);
  const snapshot = fullSnapshot(session), seqs = snapshot.groups.flat();
  const visible = seqs.filter(seq => session.deriveEventMessage(session.eventAt(seq)));
  if (!visible.length || (visible.length === 1 && activeRecords(s).some(r => r.kind === 'full' && r.mode === 'brief' && r.carrierSeq === visible[0]))) return null;
  if (!adapter.pairing.before(session, seqs[0]) || !adapter.pairing.after(session, seqs.at(-1))) {
    throw Error('工具调用与返回尚未完整结束，原文保留；请在本轮工具执行结束后全量压缩。');
  }
  const barrier = carrierBarrier(session, s, { traceEnabled: false });
  const carrierIndex = snapshot.groups.findIndex(group => snapshot.nodes.indexOf(group[0]) > barrier);
  if (carrierIndex < 0) return null;
  const orderedGroups = [snapshot.groups[carrierIndex], ...snapshot.groups.filter((_, i) => i !== carrierIndex)];
  const entries = seqs.flatMap(seq => {
    const e = session.eventAt(seq), m = session.deriveEventMessage(e);
    return m ? [{ seq, role: m.role, source: eventSource(e) || m.source?.kind, text: material(m.content, seq) }] : [];
  });
  const inputChars = entries.reduce((n, e) => n + e.text.length, 0);
  if (!inputChars) return null;
  const targetChars = Math.min(6000, Math.max(120, Math.floor(inputChars / 4)));
  signal?.throwIfAborted();
  const cfg = pipeline.config();
  const result = await pipeline.call(agent, 'compactFull', { system: FULL_COMPACT_SYSTEM,
    messages: [adapter.message(JSON.stringify({ target_characters: targetChars, conversation: entries, protected_user_reference: s.traceSlot?.original?.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') }), 'full-compact-input')],
    tools: [FULL_COMPACT_TOOL], ...(cfg.surgeonMaxTokens > 0 ? { maxTokens: cfg.surgeonMaxTokens } : {}),
  }, signal);
  signal?.throwIfAborted();
  const value = decodeResult(result, FULL_COMPACT_TOOL.name);
  if (typeof value?.summary !== 'string' || !value.summary.trim() || Object.keys(value).some(k => k !== 'summary')) {
    throw Error('全量压缩未返回有效的纯摘要，原文保留。');
  }
  const summary = value.summary.trim();
  const calls = (result.blocks || []).filter(b => b.type === 'tool-call');
  const prose = summary.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '').replace(/^\s*>.*$/gm, '');
  const invocation = /<tool_call>\s*<function\s*=/i;
  if (calls.length !== 1 || calls[0].name !== FULL_COMPACT_TOOL.name || invocation.test(prose) || (!prose.trim() && invocation.test(summary))) {
    throw Error('全量摘要包含未执行的工具调用，原文保留。');
  }

  if (hash(session.surface.nodes) !== hash(snapshot.nodes) || userRevision(session) !== snapshot.userRevision
      || sourceHash(session, snapshot.nodes) !== snapshot.sourceHash || s.transaction) {
    throw Error('生成摘要期间会话已变化，本次结果未应用，原文保留。');
  }
  const records = structuredClone(s.records), selected = new Set(seqs);
  const parents = activeRecords(s).filter(r => liveSpan(session, r)?.seqs.every(seq => selected.has(seq)));
  const events = seqs.map(seq => session.eventAt(seq));
  events.parents = parents.map(r => r.id);
  const record = { ...newRecord(session, events, { summary, documents: [] }, s.binding, { state: s }),
    kind: 'full', mode: 'brief', summaryFormatVersion: 2, summaryPromptVersion: SUMMARY_PROMPT_VERSION, parents: parents.map(r => r.id) };
  for (const r of records) if (record.parents.includes(r.id)) r.mergedInto = record.id;
  records.push(record);
  const text = recordText(record, 'brief');
  const pricing = adapter.pricing?.(session);
  const inputTokens = seqs.reduce((n, seq) => n + messageTokens(session.deriveEventMessage(session.eventAt(seq)), pricing), 0);
  const outputTokens = messageTokens({ role: 'user', content: [{ type: 'text', text }] }, pricing);
  if (outputTokens >= inputTokens) throw Error('全量摘要没有缩短上下文，原文保留。');
  const operations = orderedGroups.map((group, i) => ({ id: randomUUID(), kind: i ? 'delete' : 'record',
    ...(i ? {} : { recordId: record.id, accountingSeqs: seqs }), seqs: group, text: i ? '' : text,
    position: snapshot.nodes.indexOf(group[0]), ...(sourceCommandId ? { sourceCommandId } : {}) }));
  return { id: randomUUID(), planId: randomUUID(), source: 'compact-f', operations, records, traceSlot: s.traceSlot && snapshot.retained.has(s.traceSlot.carrierSeq) ? structuredClone(s.traceSlot) : null,
    inputChars, outputChars: text.length, inputTokens, outputTokens,
    stats: { selectedRecords: parents.length, currentMessages: visible.length, currentNodes: seqs.length, originalEvents: record.originalSeqs.length, resultRecords: 1, estimatedSavedTokens: inputTokens - outputTokens, costBasis: 'host-route-estimate' },
    createdAt: Date.now(), applied: {}, userRevision: snapshot.userRevision,
    statePatch: { fullCompaction: { throughSeq: snapshot.throughSeq, recordId: record.id, at: Date.now() },
      initialized: true, eventsSincePrepare: 0, review: { lastAt: 0, lastKey: '', newRecords: 0, needed: false } } };
}
