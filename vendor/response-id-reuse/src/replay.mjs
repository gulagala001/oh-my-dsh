export const plainReasoning = item => item?.type === 'reasoning' && !item.encrypted_content
  && [...(Array.isArray(item.content) ? item.content : []), ...(Array.isArray(item.summary) ? item.summary : [])]
    .some(block => typeof block?.text === 'string' && block.text.length);

// Only native model history may be projected. User text, encrypted state and
// reasoning introduced by another adapter are not evidence about this route.
export function nativeReplayHistory(options) {
  const ids = [];
  let sample;
  for (const message of Array.isArray(options.messages) ? options.messages : []) {
    if (!message || typeof message !== 'object') continue;
    const state = message.source?.replayState, source = state?.response;
    if (message.role !== 'assistant' || source?.kind !== 'pi-ai' || source.version !== 2 || source.api !== 'openai-responses'
      || source.provider !== options.provider || source.model !== options.model
      || message.source.provider !== options.provider || message.source.model !== options.model
      || !Array.isArray(message.content) || !Array.isArray(state.blocks) || state.blocks.length !== message.content.length
      || !['stop', 'toolUse'].includes(source.stopReason)) continue;
    const current = [];
    for (const [index, block] of state.blocks.entries()) {
      if (block?.type !== 'reasoning' || message.content[index]?.type !== 'reasoning' || !block.thinkingSignature) continue;
      try {
        const item = JSON.parse(block.thinkingSignature);
        if (plainReasoning(item) && typeof item.id === 'string') { ids.push(item.id); current.push(item.id); }
      } catch { /* An opaque signature belongs to its adapter. */ }
    }
    if (current.length && typeof source.responseId === 'string' && source.responseId.length
      && message.content.some(block => block.type !== 'reasoning'))
      sample = { id: source.responseId, reasoningIds: current };
  }
  return { ids, sample };
}

export function replayInput(input, history, mode) {
  if (mode !== 'omit-plain' || !history?.ids?.length) return input;
  const ids = new Set(history.ids);
  return input.filter(item => !(plainReasoning(item) && ids.has(item.id)));
}

// Read back an actual completed response, never infer storage semantics from
// a host name or token count. No inference call or durable conversation edit.
export async function storedReplayMode(request, sample, baseFetch) {
  if (typeof sample?.id !== 'string' || !sample.id.length || sample.id.length > 262144
    || !Array.isArray(sample.reasoningIds) || !sample.reasoningIds.length || request.signal.aborted) return null;
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + encodeURIComponent(sample.id);
  url.searchParams.append('include[]', 'reasoning.encrypted_content');
  const headers = new Headers(request.headers);
  headers.delete('content-length'); headers.set('accept', 'application/json');
  try {
    const response = await baseFetch(new Request(url, { method: 'GET', headers, redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]) }));
    if (!response.ok) { await response.body?.cancel(); return null; }
    const stored = await response.json();
    if (stored?.id !== sample.id || stored.status !== 'completed' || stored.store !== true
      || !Array.isArray(stored.output) || !stored.output.some(item => item.type !== 'reasoning')) return null;
    const thoughts = stored.output.filter(item => item.type === 'reasoning');
    if (!thoughts.length) return 'omit-plain';
    return sample.reasoningIds.every(id => thoughts.some(item => item.id === id)) ? 'native' : null;
  } catch { return null; }
}
