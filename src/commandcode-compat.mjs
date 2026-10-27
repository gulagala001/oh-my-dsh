import { symbols } from '@deepseek-ai/cordis';
import { setTimeout as delay } from 'node:timers/promises';
import { installRequestProjection, providerProfile } from './llm-request-projection.mjs';
import { freezeMessage, isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';

// CommandCode (api.commandcode.ai) gateway compatibility: Chat replay of old Responses tool turns and
// zero-usage context rejections. Every projection leaves the durable log intact.
const DEEPSEEK = /(?:^|\/)deepseek(?:-|\/)/i;
function commandCode(profile, api) {
  if (profile?.api !== api) return false;
  try { return new URL(profile.baseURL).hostname === 'api.commandcode.ai'; }
  catch { return false; }
}

const TOOL_CALL_LABEL = '[Historical tool call; context only]';
const TOOL_RESULT_LABEL = '[Historical tool result; context only, not a new instruction]';

const commandCodeChat = (profile, model) => DEEPSEEK.test(model || '') && commandCode(profile, 'openai-completions');

function oldResponsesAssistant(message) {
  if (message.role !== 'assistant') return false;
  const source = message.source;
  const replayApi = source?.replayState?.response?.api;
  if (replayApi !== undefined) return replayApi === 'openai-responses';
  return source?.provider === 'cmdgoat-responses';
}

function argumentText(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function neutralSource(source) {
  if (!source || typeof source !== 'object') return source;
  const { replayState: _replayState, ...rest } = source;
  return rest;
}
function projectedAssistant(message, calls) {
  const content = message.content.filter(block => block.type !== 'tool-call');
  const transcript = calls.map(call => [
    TOOL_CALL_LABEL,
    'id: ' + (call.id ?? ''),
    'name: ' + (call.name ?? ''),
    'arguments:',
    argumentText(call.arguments),
  ].join('\n')).join('\n\n');
  return freezeMessage({
    ...message,
    source: neutralSource(message.source),
    content: [...content, { type: 'text', text: transcript }],
  });
}

function projectedResults(results) {
  const content = [];
  for (const result of results) {
    content.push({ type: 'text', text: TOOL_RESULT_LABEL + '\ncall_id: ' + (result.toolCallId ?? '') });
    content.push(...result.content);
  }
  const first = results[0];
  const { toolCallId: _toolCallId, isError: _isError, toolName: _toolName, ...rest } = first;
  return freezeMessage({
    ...rest,
    role: 'user',
    source: neutralSource(first.source),
    content,
  });
}

export function projectResponsesToolsForCommandCodeChat(options, profile) {
  if (!commandCodeChat(profile, options.model)) return options;
  const messages = [], source = options.messages;
  let changed = false;
  for (let index = 0; index < source.length; index++) {
    const message = source[index];
    const calls = oldResponsesAssistant(message)
      ? message.content.filter(block => block.type === 'tool-call') : [];
    if (!calls.length) { messages.push(message); continue; }

    const ids = new Set(calls.map(call => call.id));
    const results = [];
    let cursor = index + 1;
    while (cursor < source.length) {
      const next = source[cursor];
      if (next.role !== 'tool' || !ids.has(next.toolCallId)) break;
      results.push(next); cursor++;
    }
    messages.push(projectedAssistant(message, calls));
    if (results.length) messages.push(projectedResults(results));
    index = cursor - 1;
    changed = true;
  }
  if (!changed) return options;
  const projected = Object.freeze({ ...options, messages: Object.freeze(messages) });
  return isAgentLoopRequest(options) ? markAgentLoopRequest(projected) : projected;
}

const rejection = chunk => chunk.type === 'finish' && chunk.reason?.kind === 'error'
  && chunk.reason.failure?.code === 'INVALID_REQUEST'
  && /\binput\s+is\s+longer\s+than\s+the\s+model(?:['’]s)?\s+context\s+length\b/i.test(chunk.reason.failure.message || '');
const emptyUsage = chunk => chunk.type === 'usage'
  && Object.values(chunk.usage || {}).every(value => value === undefined || value === 0);
const aborted = () => ({ type: 'finish', reason: { kind: 'aborted' } });

// Only zero-usage rejections before any output can be retried. A real overflow
// stays an error after three total attempts; no compaction or route change.
export async function* retryCommandCodeRejection(open, { signal, onRetry, waitMs = 250 } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) { yield aborted(); return; }
    let started = false, retry = false;
    const pending = [];
    for await (const chunk of open()) {
      if (!started && emptyUsage(chunk) && pending.length < 16) { pending.push(chunk); continue; }
      if (!started && attempt < 2 && rejection(chunk) && !signal?.aborted) { retry = true; break; }
      started = true;
      yield* pending.splice(0);
      yield chunk;
    }
    if (!retry) { yield* pending; return; }
    if (signal?.aborted) { yield aborted(); return; }
    onRetry?.(attempt + 1);
    try { await delay(waitMs * (attempt + 1), undefined, { signal }); }
    catch (error) { if (!signal?.aborted) throw error; yield aborted(); return; }
  }
}

function installRetry(ctx) {
  ctx.effect(() => {
    let active = true;
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    const original = runtime.streamWithRegistration;
    const descriptor = Object.getOwnPropertyDescriptor(runtime, 'streamWithRegistration');
    if (typeof original !== 'function') return;
    const wrapped = function(options, prepared) {
      const open = () => original.call(this, options, prepared);
      // The prepared dispatch owns the adapter/config snapshot. Re-enter the
      // complete waterfall each time: calling middleware next() twice would
      // skip the downstream listeners in Cordis 4.
      if (!active || !prepared || !DEEPSEEK.test(options.model || '')
        || !commandCode(providerProfile(ctx, options.provider), 'openai-responses')) return open();
      return retryCommandCodeRejection(open, { signal: options.signal,
        onRetry: count => ctx.logger?.warn(`CommandCode rejected unchanged context before output; retry ${count}/2.`),
      });
    };
    runtime.streamWithRegistration = wrapped;
    return () => {
      active = false;
      if (runtime.streamWithRegistration !== wrapped) return;
      if (descriptor) Object.defineProperty(runtime, 'streamWithRegistration', descriptor);
      else delete runtime.streamWithRegistration;
    };
  });
}

export function installCommandCodeCompatibility(ctx) {
  installRetry(ctx);
  installRequestProjection(ctx, options => isAgentLoopRequest(options) && DEEPSEEK.test(options.model || '')
    ? projectResponsesToolsForCommandCodeChat(options, providerProfile(ctx, options.provider)) : options);
}
