import { TODO_META } from '../task-context.mjs';
import { CompactionEngine, compactCheckpointSource, toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction';
import { CONTEXT_WINDOW_EXCEEDED_CODE, createUserMessage } from '@deepseek-ai/dsh-llm';
import { appendShadow } from './shadow.mjs';

export function createHostAdapter(hub) {
  const routes = new WeakMap();
  const message = (text, kind) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin:trisoul-x:' + kind } });
  const requestBudget = session => {
    const { route, info } = routes.get(session) ?? { route: session.requestHeader?.()?.config };
    const capacity = info?.context?.contextWindow ?? session.requestContext?.()?.contextWindow;
    if (!capacity) return null;
    const available = capacity - (route?.maxTokens ?? info?.defaultMaxTokens ?? 0);
    const headroom = Math.min(65536, Math.floor(Math.max(0, available) * 0.1));
    return { available, usable: available - headroom, used: hub.ctx.tokenMeter.measure(session).totalTokens };
  };
  return {
    pricing(session) {
      const config = session.requestHeader?.()?.config;
      const llm = hub.ctx.get?.('llm') || hub.ctx.llm;
      return { imagePricing: config && llm?.imageRequestPricing?.(config.provider, config.model),
        fileText: llm?.fileRequestText ? ref => llm.fileRequestText(ref) : undefined };
    },
    pairing: { before: toolPairingBalancedBefore, after: toolPairingBalancedAfter },
    message,
    async prepareRoute(session, route, signal) {
      const info = await hub.ctx.llm?.resolveModelInfo?.(route.provider, route.model, signal);
      routes.set(session, { route, info });
    },
    pressure(session) {
      const budget = requestBudget(session);
      return budget ? budget.used / Math.max(1, budget.usable) : null;
    },
    catalogBudget(session) {
      const budget = requestBudget(session);
      return budget ? Math.max(0, budget.usable - budget.used) : 0;
    },
    catalogCost(text) {
      // The native heuristic underprices CJK. A byte floor keeps publication conservative.
      return Math.max(hub.ctx.tokenMeter.estimateMessage(message(text, 'project-catalog')), Buffer.byteLength(text));
    },
    dreamBudget(session, credit = 0) {
      const budget = requestBudget(session);
      return budget ? Math.max(0, Math.min(9000, Math.floor(budget.available * 0.1),
        Math.max(0, budget.usable - budget.used) + credit)) : 0;
    },
    publish(session, text, kind) { return session.append('user/message', message(text, kind), { surfaceOp: 'append' }); },
    flush(session) { return hub.ctx.sessions?.flush(session); },
    append(session, op, surfaceOp, sourceEventSeqs, { batchId } = {}) {
      if (op.kind === 'delete') return appendShadow(session, sourceEventSeqs, op.id);
      if (op.kind === 'todo-refresh' || op.kind === 'todo-restore') {
        // Editing a prior checkpoint is an OMD context update, not another
        // native checkpoint in an already-closed compaction lifecycle.
        const value = op.message.source?.kind === 'compact-checkpoint'
          ? { ...op.message, source: { kind: 'plugin:trisoul-x:context-record' } } : op.message;
        return session.append('user/message', value, { surfaceOp, sourceEventSeqs });
      }
      if (op.kind === 'trace') return session.append('user/message', {
        ...message('', 'trace'), id: op.id,
        content: op.content || [{ type: 'text', text: op.text }, ...(op.original.content || [])],
        ...(op.todoMeta ? { [TODO_META]: op.todoMeta } : {}),
      }, { surfaceOp, sourceEventSeqs });
      // Native lifecycle events keep host history and token-meter accounting coherent.
      const compactionId = op.id;
      const summary = op.content || [{ type: 'text', text: op.text }];
      // Native V4 describes this exact span; OMD tracks the whole transaction separately.
      const meter = hub.ctx.tokenMeter?.measure(session);
      const shadowedTokenCount = (meter?.nodes || []).filter(n => sourceEventSeqs.includes(n.seq)).reduce((n, node) => n + (node.tokens ?? node.heuristicTokens ?? 0), 0);
      const batch = batchId ? { omdBatchId: batchId } : {};
      const boundary = session.snapshotEvents().findLast(e => e.type === 'turn/start' || e.type === 'turn/end');
      const lifecycle = { compactionId, turn: boundary?.type === 'turn/start' ? boundary.data.turn : null, ...batch, ...(op.sourceCommandId ? { sourceCommandId: op.sourceCommandId } : {}) };
      const start = session.append('compaction/start', lifecycle);
      let closed = false;
      try {
        const record = session.append('compaction/summary', { compactionId, ...batch, ...(op.sourceCommandId ? { sourceCommandId: op.sourceCommandId } : {}), summary,
          shadowedRange: { start: surfaceOp.startSeq, end: surfaceOp.endSeq }, shadowedSeqs: sourceEventSeqs,
          shadowedTokenCount, llmStreamCall: false });
        const checkpoint = session.append('user/message', {
          ...createUserMessage({ content: summary, source: compactCheckpointSource(compactionId, op.sourceCommandId) }), id: op.id, ...batch,
        }, { surfaceOp, sourceEventSeqs: [start.seq, record.seq, ...sourceEventSeqs] });
        const end = session.append('compaction/end', lifecycle); closed = true;
        op.native = { compactionId, startSeq: start.seq, summarySeq: record.seq, endSeq: end.seq, summary, shadowedRange: { start: surfaceOp.startSeq, end: surfaceOp.endSeq }, shadowedSeqs: sourceEventSeqs, shadowedTokenCount };
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

export function installContextErrorRecovery(ctx, hub, isX) {
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    // pi-ai currently classifies this confirmed provider overflow wording as INVALID_REQUEST.
    const overflow = failure.code === CONTEXT_WINDOW_EXCEEDED_CODE || (failure.code === 'INVALID_REQUEST'
      && failure.message.includes("The input is longer than the model's context length"));
    if (isX(agent.session) && overflow && !signal.aborted) {
      const changed = await hub.context.applyReady(agent, { ignoreCooldown: true });
      if (changed) return { kind: 'retry' };
      ctx.logger.warn('上下文已达容量上限，但没有可应用的摘要。原文保留；没有现场调用摘要模型。');
    }
    return next();
  }, { global: true });
}
