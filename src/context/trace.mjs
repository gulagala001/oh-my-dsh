import { sourceName } from '../message-source.mjs';
import { symbols } from '@deepseek-ai/cordis';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';

// Assistant settlements are immutable host records. Remove only the exposed
// reasoning from request copies, keeping tool calls, results and the audit log.
export function withoutMovedReasoning(messages, session, traceSlot) {
  if (!traceSlot) return messages;
  const carrier = session.deriveEventMessage(session.eventAt(traceSlot.carrierSeq));
  if (!carrier || !messages.some(m => m.id === carrier.id && sourceName(m.source) === 'trisoul-x:trace')) return messages;
  const ids = new Set((traceSlot.movedSourceSeqs || [traceSlot.sourceSeq])
    .map(seq => session.eventAt(seq)?.data?.message?.id).filter(Boolean));
  let changed = false;
  const result = messages.flatMap(message => {
    if (message.role !== 'assistant' || !ids.has(message.id)) return [message];
    const content = message.content.filter(block => !(block.type === 'reasoning' && typeof block.text === 'string'));
    if (content.length === message.content.length) return [message];
    changed = true;
    // Opaque provider replay may contain the old reasoning too. Rebuild this
    // message from its retained canonical blocks instead of replaying that blob.
    const { replayState, ...source } = message.source;
    return content.length ? [freezeMessage({ ...message, source, content })] : [];
  });
  return changed ? result : messages;
}

export function installTraceCleanup(ctx, isManagedSession, context) {
  let active = true;
  const project = options => {
    if (!active) return options;
    const session = options.sessionId && ctx.sessions.get(options.sessionId);
    if (isAgentLoopRequest(options) && session && isManagedSession(session) && session.header?.origin !== 'subagent') {
      const messages = withoutMovedReasoning(options.messages, session, context.state(session).traceSlot);
      if (messages !== options.messages) return markAgentLoopRequest(Object.freeze({ ...options, messages: Object.freeze(messages) }));
    }
    return options;
  };
  // DSH freezes agent requests and llm/stream's next() cannot replace options.
  // Adapt the two public stream entry points before that waterfall; preserve
  // prepared-call ownership, all middleware, cancellation and request branding.
  ctx.effect(() => {
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    const stream = runtime.stream, prepareCall = runtime.prepareCall;
    const descriptors = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
    const wrappedStream = function(options) { return stream.call(this, project(options)); };
    const wrappedPrepare = async function(...args) {
      const prepared = await prepareCall.apply(this, args);
      return Object.freeze({ ...prepared, stream: options => prepared.stream(project(options)) });
    };
    runtime.stream = wrappedStream; runtime.prepareCall = wrappedPrepare;
    return () => {
      active = false;
      for (const [i, key, wrapper] of [[0, 'stream', wrappedStream], [1, 'prepareCall', wrappedPrepare]]) {
        if (runtime[key] !== wrapper) continue;
        if (descriptors[i]) Object.defineProperty(runtime, key, descriptors[i]);
        else delete runtime[key];
      }
    };
  });
}
