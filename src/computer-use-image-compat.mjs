import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';

// Older Computer Use turns could auto-attach a screenshot and explicitly emit
// the same bytes again. Project only adjacent, identical image blocks in that
// tool's result; keep all other content and the immutable session history.
export function withoutDuplicateComputerImages(options) {
  const calls = new Set(options.messages.flatMap(message => message.role === 'assistant'
    ? message.content.filter(block => block.type === 'tool-call' && block.name === 'computer_use').map(block => block.id) : []));
  if (!calls.size) return options;
  let changed = false;
  const messages = options.messages.map(message => {
    if (message.role !== 'tool' || !calls.has(message.toolCallId)) return message;
    const content = message.content.filter((block, index, blocks) => block.type !== 'image'
      || block.offloaded || !block.attachment?.attachmentId || index === 0 || !isDeepStrictEqual(block, blocks[index - 1]));
    if (content.length === message.content.length) return message;
    changed = true;
    return freezeMessage({ ...message, content });
  });
  if (!changed) return options;
  const projected = Object.freeze({ ...options, messages: Object.freeze(messages) });
  return isAgentLoopRequest(options) ? markAgentLoopRequest(projected) : projected;
}

export function installComputerUseImageCompatibility(ctx, isManagedSession) {
  ctx.effect(() => {
    let active = true;
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    const stream = runtime.stream, prepareCall = runtime.prepareCall;
    const descriptors = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
    const project = options => {
      if (!active || !isAgentLoopRequest(options)) return options;
      const session = options.sessionId && ctx.sessions.get(options.sessionId);
      return session && isManagedSession(session) ? withoutDuplicateComputerImages(options) : options;
    };
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
