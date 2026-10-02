import { symbols } from '@deepseek-ai/cordis';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';

// CommandCode can route DeepSeek through two Responses serializers: one puts
// the exposed reasoning in summary, while the other requires reasoning_text.
// Keep the original item and add its exact text only for this verified gateway.
function commandCodeResponses(profile) {
  if (profile?.api !== 'openai-responses') return false;
  try { return new URL(profile.baseURL).hostname === 'api.commandcode.ai'; }
  catch { return false; }
}
function reasoningSignature(signature, block) {
  if (typeof signature !== 'string') return signature;
  let item;
  try { item = JSON.parse(signature); } catch { return signature; }
  if (item?.type !== 'reasoning' || item.encrypted_content
    || (item.content !== undefined && (!Array.isArray(item.content) || item.content.length))
    || !Array.isArray(item.summary) || !item.summary.length
    || item.summary.some(part => part?.type !== 'summary_text' || typeof part.text !== 'string')
    || item.summary.map(part => part.text).join('\n\n') !== block.text) return signature;
  return JSON.stringify({ ...item, content: item.summary.map(part => ({ type: 'reasoning_text', text: part.text })) });
}

export function normalizeResponsesReasoning(options, profile) {
  if (!/(?:^|\/)deepseek(?:-|\/)/i.test(options.model || '')) return options;
  const normalizeSummary = commandCodeResponses(profile);
  let changed = false;
  const messages = options.messages.map(message => {
    const source = message.source, replay = source?.replayState, response = replay?.response;
    if (message.role !== 'assistant' || source?.kind !== 'model'
      || source.provider !== options.provider || source.model !== options.model
      || response?.kind !== 'pi-ai' || response.version !== 2 || response.api !== 'openai-responses'
      || response.provider !== source.provider || response.model !== source.model
      || !['stop', 'toolUse'].includes(response.stopReason)
      || !Array.isArray(replay.blocks) || replay.blocks.length !== message.content.length
      || replay.blocks.some((block, index) => block?.type !== message.content[index].type)) return message;
    let content = message.content, touched = false;
    let blocks = replay.blocks.map((metadata, index) => {
      if (!normalizeSummary || metadata.type !== 'reasoning') return metadata;
      const thinkingSignature = reasoningSignature(metadata.thinkingSignature, content[index]);
      if (thinkingSignature === metadata.thinkingSignature) return metadata;
      touched = true;
      return { ...metadata, thinkingSignature };
    });
    // A genuine tool-only turn has empty reasoning, never invented text.
    if (!content.some(block => block.type === 'reasoning') && content.some(block => block.type === 'tool-call')) {
      content = [{ type: 'reasoning', text: '' }, ...content];
      blocks = [{ type: 'reasoning', thinkingSignature: JSON.stringify({ type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: '' }] }) }, ...blocks];
      touched = true;
    }
    if (!touched) return message;
    changed = true;
    return freezeMessage({ ...message, content, source: { ...source, replayState: { ...replay, blocks } } });
  });
  if (!changed) return options;
  const projected = Object.freeze({ ...options, messages: Object.freeze(messages) });
  return isAgentLoopRequest(options) ? markAgentLoopRequest(projected) : projected;
}

export function installResponsesReasoningCompatibility(ctx) {
  ctx.effect(() => {
    let active = true;
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    const stream = runtime.stream, prepareCall = runtime.prepareCall;
    const descriptors = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
    const project = options => {
      if (!active) return options;
      const profile = ctx.settings?.describe().find(entry => entry.ns === 'llm-pi-ai')?.value?.providers?.[options.provider];
      return normalizeResponsesReasoning(options, profile);
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
