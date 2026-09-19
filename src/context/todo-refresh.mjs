import { randomUUID } from 'node:crypto';
import { latestTaskContext, isTaskInjection, withoutTodo, TODO_META } from '../task-context.mjs';
import { contentChars, messageTokens } from './materials.mjs';

function operationMessage(op) {
  if (op.kind === 'delete') return null;
  if (op.kind === 'trace') return { id: op.id, role: 'user', source: { kind: 'plugin', plugin: 'trisoul-x:trace' }, content: op.content || [{ type: 'text', text: op.text }, ...(op.original.content || [])], ...(op.todoMeta ? { [TODO_META]: op.todoMeta } : {}) };
  return { id: op.id, role: 'user', source: { kind: 'plugin', plugin: 'trisoul-x:context-record' }, content: op.content || [{ type: 'text', text: op.text }] };
}
// Native surfaces support append/replace, not insertion. The task text occupies
// a tagged text block immediately after Trace, or before the first user-role
// message after the system prefix. No system message or model/tool pair moves.
export function attachTodoRefresh(session, tx, pricing) {
  if (!tx || tx.todoRefreshVersion) return tx;
  tx.todoRefreshVersion = 1;
  const todo = latestTaskContext(session);
  if (!todo) return tx;
  const nodes = session.surface.nodes.map(seq => ({ key: seq, message: session.deriveEventMessage(session.eventAt(seq)), event: session.eventAt(seq) }));
  const originalTodos = nodes.filter(n => isTaskInjection(n.event) || n.message?.[TODO_META]);
  for (const op of tx.operations) {
    const at = nodes.findIndex(n => n.key === op.seqs[0]), end = nodes.findIndex(n => n.key === op.seqs.at(-1));
    if (at < 0 || end < at) throw Error('无法规划 todo 刷新：压缩范围已变化');
    nodes.splice(at, end - at + 1, { key: op.id, message: operationMessage(op) });
  }
  let target = nodes.find(n => n.message?.source?.plugin === 'trisoul-x:trace');
  target ||= nodes.find(n => n.message?.role === 'user' && !isTaskInjection(n.event) && !n.message.content.some(b => b.type === 'tool-result'));
  if (!target) throw Error('没有安全的 todo 承载位置，原文保留');
  const base = withoutTodo(target.message), index = base.source?.plugin === 'trisoul-x:trace' ? 1 : 0;
  const id = randomUUID(), content = [...base.content]; content.splice(index, 0, { type: 'text', text: todo.text });
  const fresh = { ...base, id, content, source: base.source?.kind === 'user' ? { kind: 'plugin', plugin: 'trisoul-x:todo-prefix' } : base.source,
    [TODO_META]: { baseId: base.id, baseSource: base.source, index, snapshotSeq: todo.snapshotSeq, context: todo.meta,
      originalSeq: target.message[TODO_META]?.originalSeq ?? (typeof target.key === 'number' ? target.key : null) } };
  const account = (node, after) => {
    if (typeof node.key === 'number') {
      tx.inputTokens += messageTokens(node.message, pricing);
      tx.inputChars += contentChars(node.message?.content);
    } else {
      tx.outputTokens -= messageTokens(node.message, pricing);
      tx.outputChars -= contentChars(node.message?.content);
    }
    tx.outputTokens += messageTokens(after, pricing);
    tx.outputChars += contentChars(after?.content);
  };
  account(target, fresh);
  tx.operations.push({ id, kind: 'todo-refresh', seqs: [target.key], message: fresh, text: todo.text, snapshotSeq: todo.snapshotSeq });
  for (const node of nodes) {
    if (node === target || typeof node.key !== 'number') continue;
    if (isTaskInjection(node.event)) {
      account(node, null);
      tx.operations.push({ id: randomUUID(), kind: 'delete', seqs: [node.key], text: '', todoCleanup: true });
    } else if (node.message?.[TODO_META]) {
      const original = withoutTodo(node.message), restoreId = randomUUID(); account(node, original);
      tx.operations.push({ id: restoreId, kind: 'todo-restore', seqs: [node.key], message: { ...original, id: restoreId, source: original.source?.kind === 'user' ? node.message.source : original.source }, text: '' });
    }
  }
  tx.todoRefresh = { snapshotSeq: todo.snapshotSeq, operationId: id, previousCount: originalTodos.length, taskCount: todo.count };
  tx.stats ||= {};
  Object.assign(tx.stats, { todoSnapshotsRemoved: originalTodos.length, todoRefreshed: true, estimatedSavedTokens: tx.inputTokens - tx.outputTokens });
  return tx;
}

export function requireSavings(tx, required = true) {
  if (!tx || !required || tx.outputTokens < tx.inputTokens) return tx;
  const error = Error(`摘要、详细资料、前置推理与最新版 todo 合计没有缩短上下文（估算 ${tx.inputTokens} → ${tx.outputTokens} tokens），保留原文`);
  error.cost = { inputTokens: tx.inputTokens, outputTokens: tx.outputTokens, inputChars: tx.inputChars, outputChars: tx.outputChars };
  throw error;
}
