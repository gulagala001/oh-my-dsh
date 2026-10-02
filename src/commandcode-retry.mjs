import { symbols } from '@deepseek-ai/cordis';
import { setTimeout as delay } from 'node:timers/promises';

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

export function installCommandCodeRetry(ctx) {
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
      if (!active || !prepared || !/(?:^|\/)deepseek(?:-|\/)/i.test(options.model || '')) return open();
      const profile = ctx.settings.describe().find(entry => entry.ns === 'llm-pi-ai')?.value?.providers?.[options.provider];
      let host;
      try { host = new URL(profile?.baseURL).hostname; } catch { return open(); }
      if (profile.api !== 'openai-responses' || host !== 'api.commandcode.ai') return open();
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
