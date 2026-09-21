const textOf = content => (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

// Read the delivered block, never regenerate it from today's task ledger/state.
export function taskInjection(message) {
  if (!message || message.source?.kind !== 'plugin') return null;
  const embedded = message.omdTodo;
  if (!embedded && message.source.plugin !== 'trisoul-x:tasks') return null;
  const text = embedded ? message.content?.[embedded.index]?.text : textOf(message.content);
  if (!text) return null;
  const todo = /^\[todo list\]/m.test(text), runtime = /^\[runtime state(?: ·|\])/m.test(text);
  return {
    text, todo, runtime,
    title: todo && runtime ? 'Todo 与运行状态' : todo ? 'Todo' : runtime ? '运行状态' : '任务上下文',
    total: (text.match(/^\[(?: |x)\] /gm) || []).length,
    done: (text.match(/^\[x\] /gm) || []).length,
  };
}

export const taskInjectionDefinition = {
  kind: 'omd-task-injection', target: 'chat',
  match: event => event.type === 'user/message' && taskInjection(event.data)
    ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => ({ ...taskInjection(match.event.data), seq: match.event.seq }),
  update: context => context.state,
  buildViewNode: context => context.state ? {
    key: context.key, id: context.id, kind: 'omd-task-injection', target: 'chat',
    anchorSeq: context.state.seq, location: { kind: 'session' }, visibility: 'visible', data: context.state,
  } : null,
};

// Compaction refreshes the current task block in a replacement message. When
// no conversation activity separates it from the preceding injection, show
// the refreshed record once at its new position. Keep earlier, used snapshots.
export function supersededTaskInjections(entries) {
  const hidden = new Set();
  let previous = null, compacting = false;
  for (const entry of entries) {
    const event = entry.event || entry, data = event.data || {};
    if (event.type === 'user/message' && taskInjection(data)) {
      if (previous !== null && compacting && data.omdTodo && event.sourceEventSeqs?.includes(previous)) hidden.add(previous);
      previous = event.seq; compacting = false;
    } else if (event.type?.startsWith('compaction/') || event.type === 'user/message' && data.source?.compactionId) {
      compacting = true;
    } else if (event.type === 'system/message' && data.message?.source?.plugin === 'trisoul-x:shadow') {
      // A compaction's surface cleanup is not new conversation activity.
    } else {
      previous = null; compacting = false;
    }
  }
  return hidden;
}

// Batch ids are authoritative. For old logs, join only uninterrupted lifecycle
// runs; input, generation, commands and the final todo refresh end a legacy run.
export function compactionGroups(entries) {
  const parts = new Map(), groups = new Map(), bySeq = new Map();
  let legacyRun = null;
  for (const entry of entries) {
    const event = entry.event || entry, data = event.data || {};
    const checkpoint = event.type === 'user/message' && data.source?.compactionId;
    const lifecycle = ['compaction/start', 'compaction/summary', 'compaction/end'].includes(event.type);
    if (!checkpoint && !lifecycle) {
      if (!(event.type === 'system/message' && data.message?.source?.plugin === 'trisoul-x:shadow')) legacyRun = null;
      continue;
    }
    const id = checkpoint || data.compactionId;
    if (!id) { legacyRun = null; continue; }
    let part = parts.get(id);
    if (!part) {
      const command = data.sourceCommandId || data.source?.sourceCommandId;
      const key = data.omdBatchId ? 'batch:' + data.omdBatchId : command ? 'command:' + command : legacyRun || 'legacy:' + id;
      legacyRun = key;
      part = { id, key, command, seqs: [], summary: null, shadowedSeqs: [], tokens: null, error: null };
      parts.set(id, part);
      if (!groups.has(key)) groups.set(key, { id: key, parts: [] });
      groups.get(key).parts.push(part);
    }
    if (event.type === 'compaction/summary') {
      part.summary = textOf(data.summary);
      part.shadowedSeqs = Array.isArray(data.shadowedSeqs) ? data.shadowedSeqs : [];
      part.tokens = Number.isFinite(data.shadowedTokenCount) ? data.shadowedTokenCount : null;
    }
    if (event.type === 'compaction/end') part.error = data.error || null;
    if (checkpoint) { part.seqs.push(event.seq); part.seq = event.seq; }
    // A todo-carrying replacement reuses the checkpoint's source/id; it isn't
    // another compressed segment, and it completes the old transaction.
    if (data.omdTodo) legacyRun = null;
  }
  for (const group of groups.values()) {
    group.parts = group.parts.filter(part => part.seqs.length || part.error);
    const landed = group.parts.filter(part => part.seqs.length);
    if (!landed.length) continue;
    group.firstSeq = landed[0].seq;
    group.items = new Set(landed.flatMap(part => part.shadowedSeqs)).size;
    group.tokens = landed.every(part => part.tokens !== null) ? landed.reduce((sum, part) => sum + part.tokens, 0) : null;
    for (const part of landed) for (const seq of part.seqs) bySeq.set(seq, group);
    for (const part of landed) if (part.command) bySeq.set('command:' + part.command, group);
  }
  return bySeq;
}
