// Presentation only: identities, membership and outcomes remain host-owned.
export const AGENTS_KIND = 'omd-agents';
export const JOBS_KIND = 'omd-jobs';
export const SOURCES_KIND = 'omd-sources';
export const OUTPUTS_KIND = 'omd-outputs';
export function whaleColor(id) {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 53% 57%)`;
}
export function childAddress(child) {
  if (child.mode === 'external') return null;
  return `dsh-resource://subagentchat/session/${encodeURIComponent(child.id)}?${new URLSearchParams({ parent: child.parentId, mode: child.mode ?? 'unknown' })}`;
}
// Native projection stores already arbitrate sequenced frames and cached hints.
// An empty replacement is authoritative too; never refill it from an older row.
export const projection = (state, id) => state.projectionsBySession?.[id]?.values ?? state.byId?.[id]?.projectionValues ?? {};
function turnStatus(outcome) {
  if (!outcome) return null;
  if (outcome === 'completed') return 'completed';
  if (outcome === 'aborted') return 'cancelled';
  return outcome === 'error' ? 'failed' : 'interrupted';
}
export function collectAgents(rootId, state, statuses) {
  const rows = [], seen = new Set([rootId]), parents = [], teams = [], discoveredWorkflows = new Map();
  function visit(parentId, depth, inherited) {
    parents.push(parentId);
    const values = projection(state, parentId), team = values.agentTeam;
    const workflowMembers = new Map();
    for (const stored of values.omdOverview?.workflows ?? []) {
      const node = { ...stored, ownerId: parentId };
      discoveredWorkflows.set(node.id, node);
      for (const phase of node.data.phases ?? []) for (const member of phase.members ?? []) if (member.childId) workflowMembers.set(member.childId, { node, phase, member });
    }
    if (team && (team.members?.length > 1 || team.tasks?.length || team.failure)) teams.push({ id: parentId, team });
    const members = new Map((team?.members ?? []).filter(m => m.role !== 'lead').map(m => [m.id, m]));
    const catalog = new Map((values.subagentCatalog ?? []).map(child => [child.id, child]));
    for (const member of members.values()) if (!catalog.has(member.id)) catalog.set(member.id, { id: member.id, label: member.name, mode: member.phase === 'active' ? 'continuable' : 'unknown' });
    for (const child of catalog.values()) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const member = members.get(child.id), workflow = workflowMembers.get(child.id), summary = state.byId?.[child.id];
      const childValues = projection(state, child.id), timing = childValues.subagentTiming;
      const running = statuses?.get(child.id)?.running ?? summary?.running ?? false;
      const outcome = childValues.omdOverview?.outcome;
      const currentStatus = turnStatus(outcome);
      const status = member?.phase === 'provisioning' ? 'provisioning' : member?.phase === 'failed' ? 'failed'
        : running ? 'running' : currentStatus ?? (workflow && ['failed', 'cancelled', 'interrupted'].includes(workflow.member.status) ? workflow.member.status
        : timing?.lastTurnCompleted === true ? 'completed' : timing?.lastTurnCompleted === false ? 'interrupted' : child.mode === 'external' ? 'external' : 'idle');
      const group = member ? { kind: 'team', id: parentId, label: 'Agent Team' }
        : workflow ? { kind: 'workflow', id: workflow.node.id, label: workflow.node.data.name, phase: workflow.phase.phase } : inherited;
      rows.push({ ...child, parentId, depth, mode: childValues.subagent?.mode ?? child.mode,
        label: member?.name || workflow?.member.label?.trim() || childValues.subagent?.label || child.label || summary?.title || child.id,
        group, status, timing, model: childValues.modelSelection?.lastUsed, preview: childValues.omdOverview?.activity || summary?.title,
        error: member?.error, available: member?.phase !== 'provisioning' && member?.phase !== 'failed', color: whaleColor(child.id) });
      if (child.mode !== 'external' && member?.phase !== 'provisioning' && member?.phase !== 'failed') visit(child.id, depth + 1, group);
    }
  }
  visit(rootId, 0, { kind: 'ordinary', id: rootId, label: '普通子代理' });
  const projectionIssues = parents.flatMap(id => {
    const snapshot = state.projectionsBySession?.[id], phase = snapshot?.state ?? 'idle';
    if (phase === 'ready' && snapshot.values.omdOverview) return [];
    return [{ id, state: phase, error: snapshot?.error?.message }];
  });
  return { rows, parents, teams, projectionIssues, workflows: [...discoveredWorkflows.values()],
    active: rows.filter(row => ['running', 'provisioning'].includes(row.status)), completed: rows.filter(row => row.status === 'completed').length };
}
export function agentDuration(row, now = Date.now()) {
  const timing = row.timing;
  if (!timing) return '';
  const ms = timing.settledMs + (timing.active ? Math.max(0, (row.status === 'running' ? now : timing.active.through) - timing.active.since) : 0);
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}秒` : seconds < 3600 ? `${Math.floor(seconds / 60)}分 ${seconds % 60}秒` : `${Math.floor(seconds / 3600)}小时 ${Math.floor(seconds / 60) % 60}分`;
}
