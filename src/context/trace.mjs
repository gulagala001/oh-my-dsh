import { sourceName } from '../message-source.mjs';
import { installRequestProjection } from '../llm-request-projection.mjs';
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
    // Responses reasoning is part of the tool continuation protocol. Moving a
    // preview into Trace must not remove the original signed/native replay.
    if (message.source?.replayState?.response?.api === 'openai-responses'
      && message.content.some(block => block.type === 'tool-call')) return [message];
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
  installRequestProjection(ctx, options => {
    const session = options.sessionId && ctx.sessions.get(options.sessionId);
    if (isAgentLoopRequest(options) && session && isManagedSession(session) && session.header?.origin !== 'subagent') {
      const messages = withoutMovedReasoning(options.messages, session, context.state(session).traceSlot);
      if (messages !== options.messages) return markAgentLoopRequest(Object.freeze({ ...options, messages: Object.freeze(messages) }));
    }
    return options;
  });
}
