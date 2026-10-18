// Read the same durable Chat nodes used by the conversation's native panel.
export function headerWorkflows(chat) {
  return (chat?.nodes?.values() ?? []).filter(node => node.kind === 'workflow-run')
    .sort((a, b) => b.anchorSeq - a.anchorSeq);
}

export function workflowPhaseLabel(data) {
  const phases = data.phases ?? [];
  return phases.find(phase => phase.members.some(member => member.status === 'running'))?.phase
    || phases.at(-1)?.phase || data.name;
}

export function workflowChildLabels(entries) {
  const labels = new Map();
  for (const entry of entries) {
    const event = entry.event ?? entry;
    if (event.type === 'tool-workflow/agent-start' && event.data.label?.trim()) {
      labels.set(event.data.childId, event.data.label.trim());
    }
  }
  return labels;
}

// Correct historical workflow labels for the native catalog without rewriting
// a Session, changing membership, or claiming an unverified child mode.
export function withWorkflowLabels(state, parent, labels) {
  const projection = state.projectionsBySession?.[parent];
  const catalog = projection?.values.subagentCatalog;
  if (!catalog?.some(entry => labels.has(entry.id) && labels.get(entry.id) !== entry.label)) return state;
  return { ...state, projectionsBySession: { ...state.projectionsBySession,
    [parent]: { ...projection, values: { ...projection.values, subagentCatalog: catalog.map(entry => labels.has(entry.id) ? { ...entry, label: labels.get(entry.id) } : entry) } } } };
}

// The native tab's opening title is only a fallback. Child Sessions need not
// appear in the root session list; their retained projection is authoritative.
export function subagentTabTitle(address, state, identity, labels, fallback) {
  let url;
  try { url = new URL(address); } catch { return fallback; }
  if (url.protocol !== 'dsh-resource:' || url.hostname !== 'subagentchat') return fallback;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'session') return fallback;
  let child;
  try { child = decodeURIComponent(parts[1]); } catch { return fallback; }
  const parent = url.searchParams.get('parent');
  const label = labels?.get(child)
    ?? identity?.label
    ?? state.projectionsBySession?.[child]?.values.subagent?.label
    ?? state.projectionsBySession?.[parent]?.values.subagentCatalog?.find(entry => entry.id === child)?.label
    ?? state.byId?.[child]?.projectionValues?.subagent?.label;
  return label?.trim() || state.byId?.[child]?.title || fallback;
}
