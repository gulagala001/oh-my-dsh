// Shared aggregation keeps compact and full views numerically identical.
export function monitorSelection(states, id, range = 'session') {
  const ids = new Set(id ? [id] : states.map(s => s.id));
  if (id) {
    const children = new Map();
    for (const state of states) {
      if (state.origin !== 'subagent' && !(state.origin === undefined && state.metrics?.subagent?.calls > 0)) continue;
      const list = children.get(state.parentSession) || [];
      list.push(state.id); children.set(state.parentSession, list);
    }
    const queue = [id];
    for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) || []) {
      if (!ids.has(child)) { ids.add(child); queue.push(child); }
    }
  }
  const selected = range === 'all' ? states : states.filter(s => ids.has(s.id));
  const metrics = {}, actions = {};
  for (const state of selected) {
    for (const [kind, values] of Object.entries(state.metrics || {})) {
      const target = metrics[kind] ||= {};
      for (const [key, n] of Object.entries(values)) target[key] = key === 'peakContext' ? Math.max(target[key] || 0, n) : (target[key] || 0) + n;
    }
    for (const [key, n] of Object.entries(state.actions || {})) actions[key] = (actions[key] || 0) + n;
  }
  return { ids, selected, metrics, actions };
}

// Legacy cumulative counters did not preserve receipt coverage. Keep positive
// subtotals when the ledger is unavailable, never promote initializer zeros or
// use their incomplete buckets as a cache-hit denominator.
export function unavailableMonitorMetrics(metrics) {
  const known = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const buckets = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  const fields = [...buckets, 'outputTokens', 'reasoningTokens', 'peakContext'];
  return Object.fromEntries(Object.entries(metrics).map(([kind, metric]) => {
    const calls = metric.calls || 0;
    if (!calls) return [kind, { ...metric }];
    const values = Object.fromEntries(fields.map(key => [key, known(metric[key])]));
    const sum = keys => keys.some(key => values[key] !== null) ? keys.reduce((total, key) => total + (values[key] || 0), 0) : null;
    const knownInputTokens = sum(buckets), knownTotalTokens = known(metric.totalTokens) ?? sum([...buckets, 'outputTokens']);
    return [kind, { ...metric, ...values, totalTokens: null, inputTotalTokens: null,
      knownInputTokens, knownTotalTokens, unmetered: calls, usageUnreported: knownTotalTokens === null ? calls : 0,
      totalUnreported: calls, inputUnreported: calls, inputBucketUnreported: calls,
      outputUnreported: calls, cacheUnreported: calls, cacheWriteUnreported: calls }];
  }));
}

// Session wall spans include time between calls; merge overlaps instead of summing parallel work.
export function monitorPerformance(performance = {}, liveCalls = [], now = Date.now(), from = 0) {
  const spans = new Map((performance.sessionSpans || []).map(span => [span.sessionId, { ...span }]));
  for (const call of liveCalls) {
    const start = call.startedAt ?? call.preparingAt;
    if (!Number.isFinite(start) || start < 0 || start > now) continue;
    const span = spans.get(call.sessionId);
    spans.set(call.sessionId, { ...span, sessionId: call.sessionId, startedAt: Math.min(span?.startedAt ?? start, start), endedAt: now });
  }
  const intervals = [...spans.values()].map(span => [Math.max(from, span.startedAt), Math.min(now, span.endedAt)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start).sort((a, b) => a[0] - b[0]);
  let sessionMs = null, end = -Infinity;
  for (const [start, until] of intervals) {
    sessionMs = (sessionMs ?? 0) + Math.max(0, until - Math.max(start, end));
    end = Math.max(end, until);
  }
  const sessionUntimedCalls = [...spans.values()].reduce((n, span) => n + (span.untimedCalls || 0), 0);
  if (!sessionMs && sessionUntimedCalls) sessionMs = null;
  return { ...performance, sessionMs, sessionUntimedCalls, sessionSpans: [...spans.values()] };
}

export function compactMonitorSnapshot({ metrics, actions, meter, liveCalls, sessionCount, running }) {
  return { metrics: { main: metrics.main || null },
    actions: { contextReplacements: actions.contextReplacements || 0 },
    meter: meter ? { totalTokens: meter.totalTokens } : null,
    liveCalls: liveCalls.map(({ sessionId, kind, startedAt }) => ({ sessionId, kind, startedAt })),
    sessionCount, running };
}
