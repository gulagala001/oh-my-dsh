// Shared aggregation keeps compact and full views numerically identical.
export function monitorSelection(states, id, range = 'session') {
  const ids = new Set(id ? [id] : states.map(s => s.id));
  if (id) {
    const children = new Map();
    for (const state of states) {
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

export function compactMonitorSnapshot({ metrics, actions, meter, liveCalls, sessionCount, running }) {
  return { metrics: { main: metrics.main || null },
    actions: { contextReplacements: actions.contextReplacements || 0 },
    meter: meter ? { totalTokens: meter.totalTokens } : null,
    liveCalls: liveCalls.map(({ sessionId, kind, startedAt }) => ({ sessionId, kind, startedAt })),
    sessionCount, running };
}
