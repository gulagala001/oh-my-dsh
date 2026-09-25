import { randomUUID } from 'node:crypto';
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { sourceName } from '../message-source.mjs';

const IDLE_SHADOW_TEXT = '[Archived context segment]';
const latestBoundary = session => session.snapshotEvents().findLast(e => ['turn/start', 'turn/end', 'step/start', 'step/end'].includes(e.type));

// DSH omits empty system messages from deriveMessages(), while user messages
// remain model-visible even when their content is empty.
export function appendShadow(session, seqs, id = randomUUID()) {
  const boundary = latestBoundary(session);
  const options = { surfaceOp: { op: 'replace', startSeq: seqs[0], endSeq: seqs.at(-1) }, sourceEventSeqs: seqs };
  if (boundary?.type === 'step/start') {
    const message = { ...createSystemMessage(''), id, source: { kind: 'system-prompt', omdShadow: true } };
    return session.append('system/message', { turn: boundary.data.turn, step: boundary.data.step, message }, options);
  }
  // Manual maintenance may run after step/end. V4 disallows system/message
  // there, so use a short valid user message until the next in-step repair.
  const message = { ...createUserMessage({ content: [{ type: 'text', text: IDLE_SHADOW_TEXT }], source: { kind: 'plugin:trisoul-x:shadow' } }), id };
  return session.append('user/message', message, options);
}

export function repairShadows(session) {
  if (latestBoundary(session)?.type !== 'step/start') return 0;
  let count = 0;
  for (const seq of [...session.surface.nodes]) {
    const event = session.eventAt(seq), message = session.deriveEventMessage(event);
    if (event.type !== 'user/message' || sourceName(message?.source) !== 'trisoul-x:shadow'
      || !Array.isArray(message.content)
      || !message.content.every(block => block.type === 'text' && (!block.text?.trim() || block.text === IDLE_SHADOW_TEXT))) continue;
    appendShadow(session, [seq]);
    count++;
  }
  return count;
}
