import { monitorCallPrice } from './monitor-pricing.mjs';

const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Match Chat's TTFT: non-empty text, reasoning or tool-call deltas, not headers.
export function monitorTokenChunk(chunk) {
  return chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' ? Boolean(chunk.text)
    : chunk.type === 'tool-call-delta' && Boolean(chunk.argumentsDelta || chunk.name);
}
export async function* monitorCallStream(stream, timing, now = Date.now) {
  timing.streamStartedAt ??= now();
  for await (const chunk of stream) {
    if (timing.firstTokenMs == null && monitorTokenChunk(chunk)) timing.firstTokenMs = Math.max(0, now() - timing.streamStartedAt);
    yield chunk;
  }
}

// Public API prices are automatic; an exact-route custom price takes priority.
export function monitorCallCost(call, prices = [], price = monitorCallPrice(call, prices)) {
  if (!price || !/^[A-Z]{3}$/.test(price.currency)) return null;
  const usage = call.usage || {}, fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  if (!fields.some(key => known(usage[key]))) return null;
  const exact = known(usage.totalTokens) && fields.reduce((n, key) => n + (known(usage[key]) ? usage[key] : 0), 0) === usage.totalTokens;
  let amount = 0, partial = false;
  for (const key of fields) {
    const count = known(usage[key]) ? usage[key] : exact ? 0 : null, rate = price[key];
    if (count === 0 || rate === 0) continue;
    if (count === null || !known(rate)) { partial = true; continue; }
    amount += count * rate / 1e6;
  }
  if (price.source === 'custom' && partial) return null;
  return Number.isFinite(amount) ? { amount, currency: price.currency, source: price.source, partial } : null;
}
