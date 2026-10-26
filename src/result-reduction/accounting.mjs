export function emptyOptimization() {
  return { attempts: 0, requests: 0, failures: 0, cancelled: 0, estimatedSavedTokens: 0, estimatedNetTokens: 0,
    recallTokens: 0, discoveryTokens: 0, processingMs: 0, fallbacks: 0, rules: {}, decisions: {}, lastRequest: null, since: null };
}
export function addOptimization(state, row) {
  state.attempts++;
  state.since = state.since === null ? row.at : Math.min(state.since, row.at);
  state.lastRequest = row;
  state.processingMs += row.processingMs ?? 0;
  state.fallbacks += row.decisions?.fallback ?? 0;
  for (const [key, value] of Object.entries(row.decisions ?? {})) state.decisions[key] = (state.decisions[key] ?? 0) + value;
  if (row.status !== 'success') { state[row.status === 'cancelled' ? 'cancelled' : 'failures']++; return state; }
  state.requests++;
  for (const key of ['estimatedSavedTokens', 'estimatedNetTokens', 'recallTokens', 'discoveryTokens']) state[key] += row[key] ?? 0;
  for (const rule of row.rules ?? []) {
    const entry = state.rules[rule.rule] ??= { requests: 0, savedTokens: 0, images: 0 };
    entry.requests++; entry.savedTokens += rule.saved ?? 0; entry.images += rule.images ?? 0;
  }
  return state;
}
