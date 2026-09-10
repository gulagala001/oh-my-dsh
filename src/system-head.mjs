import { createSystemMessage } from '@deepseek-ai/dsh-llm';

// DSH fills/replaces its first system node after pre-step. Reserve that position
// before X appends context; repair older misplaced heads once through the log.
export function ensureSystemHead(session, { turn, step }) {
  const nodes = session.surface.nodes.map(seq => session.eventAt(seq));
  const index = nodes.findIndex(e => e.type === 'system/message' && e.data.message.source?.plugin !== 'trisoul-x:shadow');
  if (index === 0) return false;
  const preceding = index < 0 ? nodes : nodes.slice(0, index);
  const head = index < 0
    ? { type: 'system/message', data: { turn, step, message: createSystemMessage('', 'trisoul-x:system-slot') } }
    : nodes[index];
  // A pre-step context prefix contains no model/tool exchange. Keep the repair
  // local to that prefix; the rest of the history and in-history updates stay put.
  if (preceding.some(e => e.type !== 'user/message' && e.type !== 'system/message')) throw new Error('系统消息之前存在模型或工具记录，无法自动调整顺序');
  for (const [i, event] of [head, ...preceding].entries()) {
    const target = nodes[i], refs = [...new Set([target?.seq, event.seq].filter(Number.isInteger))];
    session.append(event.type, event.data, {
      surfaceOp: target ? { op: 'replace', startSeq: target.seq, endSeq: target.seq } : 'append',
      ...(refs.length ? { sourceEventSeqs: refs } : {}),
    });
  }
  return true;
}
