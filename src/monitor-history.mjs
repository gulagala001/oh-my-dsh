import { assembleAssistantStream, assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm';
import { REQUEST_METER_RECORD } from './metering/context.mjs';
import { isUnharnessedPreset } from './experimental-presets.mjs';
import { isLocalImagePreflight } from './monitor-attempt.mjs';

// Read the native archive's own suffix. Preset selection and request headers
// can be inherited, but inherited assistant messages are billed to their owner.
export function importUnharnessedHistory(ledger, { header, events, inherited }, before) {
  let preset = header.agentPreset, config, startedAt, callId;
  if (!isUnharnessedPreset(preset) && !events.some(e => e.type === 'agent-preset/selected' && isUnharnessedPreset(e.data.agentPreset))) return;
  for (const event of events) {
    if (event.type === 'agent-preset/selected') preset = event.data.agentPreset;
    if (event.type === 'request/header') config = event.data.header.config;
    if (event.seq < inherited || !isUnharnessedPreset(preset) || event.time >= before) continue;
    if (['step/start', 'llm/retry-started', REQUEST_METER_RECORD].includes(event.type)) {
      startedAt = event.type === REQUEST_METER_RECORD ? event.time : null;
      callId = null;
    }
    if (event.type !== 'assistant/attempt' && event.type !== 'assistant/message') continue;
    const { stream, message, turn, step } = event.data;
    if (event.type === 'assistant/message' && (message?.source?.kind !== 'model' || !stream?.length)) continue;
    const output = assembleAssistantStream(stream), route = message?.source ?? config;
    const cancelled = event.data.interrupted || output.finish.kind === 'aborted';
    const failed = event.type === 'assistant/attempt' || ['error', 'max-tokens'].includes(output.finish.kind);
    const first = assistantStreamFirstTokenTime(stream);
    const id = callId ?? `native:${header.id}:${event.seq}`;
    const entry = { id, sessionId: header.id, kind: header.origin === 'subagent' ? 'subagent' : 'main',
      at: event.time, turn, step, eventSeq: event.seq, source: 'native', provider: route?.provider, model: route?.model,
      effort: config?.reasoningEffort, usage: event.data.usage ?? output.usage,
      hasOutput: Boolean(message?.content?.length || output.blocks().length), failure: output.finish.failure,
      status: cancelled ? 'cancelled' : failed ? 'error' : 'success', error: output.finish.failure?.message,
      startedAt, durationMs: startedAt != null && event.time >= startedAt ? event.time - startedAt : null,
      firstTokenMs: startedAt != null && first >= startedAt ? first - startedAt : null,
      replace: Boolean(callId) };
    if (!isLocalImagePreflight(entry)) ledger.append(entry);
    // Additional settlements from this metered stream share its identity.
    if (startedAt != null) callId = id;
  }
}
