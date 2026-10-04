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

// Only cmdgoat-responses replays images from the current user turn.
// Context notices and projected tool results also use role=user, so only the
// actual user source starts a turn. Keep the durable log and attachments intact.
export function withoutHistoricalCommandCodeImages(options, profile) {
  if (options.provider !== 'cmdgoat-responses' || profile?.api !== 'openai-responses') return options;
  try { if (new URL(profile.baseURL).hostname !== 'api.commandcode.ai') return options; }
  catch { return options; }
  const boundary = options.messages.findLastIndex(message => message.role === 'user' && message.source?.kind === 'user');
  if (boundary <= 0) return options;
  let changed = false;
  const messages = options.messages.map((message, index) => {
    if (index >= boundary) return message;
    const content = message.content.filter(block => block.type !== 'image');
    if (content.length === message.content.length) return message;
    changed = true;
    const replay = message.source?.replayState;
    const source = Array.isArray(replay?.blocks) && replay.blocks.length === message.content.length
      ? { ...message.source, replayState: { ...replay,
        blocks: replay.blocks.filter((_block, i) => message.content[i].type !== 'image') } }
      : message.source;
    return freezeMessage({ ...message, content, source });
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
      if (!session || !isManagedSession(session)) return options;
      const deduplicated = withoutDuplicateComputerImages(options);
      if (options.provider !== 'cmdgoat-responses') return deduplicated;
      const profile = ctx.settings?.describe().find(entry => entry.ns === 'llm-pi-ai')?.value?.providers?.[options.provider];
      return withoutHistoricalCommandCodeImages(deduplicated, profile);
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
