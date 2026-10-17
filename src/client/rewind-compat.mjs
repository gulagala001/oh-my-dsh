// Turn Rewind accepts only the first direct user message after turn/start.
// Host inbox admission may call that same opening message "steering".
export function rewindMessages(events) {
  const messages = new Map();
  let opening = false;
  for (const entry of events) {
    const event = entry.event || entry;
    if (event.type === 'turn/start') opening = true;
    else if (event.type === 'turn/end') opening = false;
    else if (opening && event.type === 'user/message' && event.data?.source?.kind === 'user'
      && event.surfaceOp === 'append') {
      messages.set(event.seq, { messageSeq: event.seq, promptText: (event.data.content || [])
        .filter(block => block.type === 'text').map(block => block.text).join('\n') });
      opening = false;
    }
  }
  return messages;
}

export function rewindPortalTargets(chat, messages, sessionId, document) {
  const targets = [];
  // The keyed store is mutable even when order keeps its identity. Read it at
  // refresh time, not from a memoized array captured before the rows mounted.
  for (const row of document.querySelectorAll('[data-chat-anchor-key][data-chat-flow-kind="user"], [data-chat-anchor-key][data-chat-flow-kind="steering"]')) {
    if (row.closest('[data-conversation-session]')?.dataset.conversationSession !== sessionId) continue;
    const node = chat?.nodes?.get(row.dataset.chatAnchorKey);
    if (!node || !['user', 'steering'].includes(node.kind)) continue;
    const matched = messages.get(node.data.seq);
    const container = row.querySelector('[class*="actions"]');
    if (matched && container) targets.push({ container, matched });
  }
  return targets;
}

export const sameRewindTargets = (left, right) => left.length === right.length && left.every((target, index) =>
  target.container === right[index].container && target.matched.messageSeq === right[index].matched.messageSeq
  && target.matched.promptText === right[index].matched.promptText);
