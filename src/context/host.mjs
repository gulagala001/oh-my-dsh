import { CompactionEngine, compactCheckpointSource, toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction';
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';

export function createHostAdapter(hub) {
  const message = (text, kind) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'trisoul-x:' + kind } });
  return {
    pricing(session) {
      const config = session.requestHeader?.()?.config;
      const llm = hub.ctx.get?.('llm') || hub.ctx.llm;
      return { imagePricing: config && llm?.imageRequestPricing?.(config.provider, config.model),
        fileText: llm?.fileRequestText ? ref => llm.fileRequestText(ref) : undefined };
    },
    pairing: { before: toolPairingBalancedBefore, after: toolPairingBalancedAfter },
    message,
    pressure(session) { const capacity = session.requestContext?.()?.contextWindow; return capacity ? hub.ctx.tokenMeter.measure(session).totalTokens / capacity : null; },
    publish(session, text, kind) { return session.append('user/message', message(text, kind), { surfaceOp: 'append' }); },
    flush(session) { return hub.ctx.sessions?.flush(session); },
    append(session, op, surfaceOp, sourceEventSeqs) {
      const last = session.snapshotEvents().findLast(e => Number.isInteger(e.data?.turn) && Number.isInteger(e.data?.step));
      const turn = last?.data.turn || 1, step = last?.data.step || 1;
      if (op.kind === 'delete') return session.append('system/message', { turn, step,
        message: { ...createSystemMessage('', 'trisoul-x:shadow'), id: op.id } }, { surfaceOp, sourceEventSeqs });
      if (op.kind === 'trace') return session.append('user/message', {
        ...message('', 'trace'), id: op.id,
        content: [{ type: 'text', text: op.text }, ...(op.original.content || [])],
      }, { surfaceOp, sourceEventSeqs });
      // Native lifecycle events keep host history and token-meter accounting coherent.
      const compactionId = op.id;
      const summary = op.content || [{ type: 'text', text: op.text }];
      const accountingSeqs = op.accountingSeqs || sourceEventSeqs;
      const meter = hub.ctx.tokenMeter?.measure(session);
      const shadowedTokenCount = (meter?.nodes || []).filter(n => accountingSeqs.includes(n.seq)).reduce((n, node) => n + (node.tokens ?? node.heuristicTokens ?? 0), 0);
      const lifecycle = { compactionId, turn: null, ...(op.sourceCommandId ? { sourceCommandId: op.sourceCommandId } : {}) };
      const start = session.append('compaction/start', lifecycle);
      let closed = false;
      try {
        const record = session.append('compaction/summary', { compactionId, ...(op.sourceCommandId ? { sourceCommandId: op.sourceCommandId } : {}), summary,
          shadowedRange: { start: surfaceOp.startSeq, end: surfaceOp.endSeq }, shadowedSeqs: accountingSeqs,
          shadowedTokenCount, llmStreamCall: false });
        const checkpoint = session.append('user/message', {
          ...createUserMessage({ content: summary, source: compactCheckpointSource(compactionId, op.sourceCommandId) }), id: op.id,
        }, { surfaceOp, sourceEventSeqs: [start.seq, record.seq, ...sourceEventSeqs] });
        const end = session.append('compaction/end', lifecycle); closed = true;
        op.native = { compactionId, startSeq: start.seq, summarySeq: record.seq, endSeq: end.seq, summary, shadowedRange: { start: surfaceOp.startSeq, end: surfaceOp.endSeq }, shadowedSeqs: accountingSeqs, shadowedTokenCount };
        return checkpoint;
      } catch (error) {
        if (!closed) session.append('compaction/end', { ...lifecycle, error: error.message });
        throw error;
      }
    },
  };
}

export class ReplacementCanvas extends CompactionEngine {
  constructor(ctx, hub) { super(ctx); this.hub = hub; }
  compactIfNeeded(agent, trigger, signal) {
    if (signal?.aborted) return Promise.resolve(null);
    return this.hub.context.applyReady(agent);
  }
  compactNow(agent, signal, sourceCommandId) {
    // /compact consumes existing preparation. It never starts or awaits a model.
    const run = async ownSignal => {
      signal?.throwIfAborted(); ownSignal?.throwIfAborted();
      return this.hub.context.applyReady(agent, { manual: true, sourceCommandId });
    };
    return agent.runMaintenance ? agent.runMaintenance(run) : run(signal);
  }
}
