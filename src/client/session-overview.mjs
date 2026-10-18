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
export const projection = (state, id) => ({ ...state.byId?.[id]?.projectionValues, ...state.projectionsBySession?.[id]?.values });
export function collectAgents(rootId, state, statuses, workflows = [], labels = new Map()) {
  const rows = [], seen = new Set([rootId]), parents = [], teams = [], discoveredWorkflows = new Map();
  const workflowMembers = new Map();
  for (const node of workflows) for (const phase of node.data.phases ?? []) for (const member of phase.members ?? []) {
    if (member.childId) workflowMembers.set(member.childId, { node, phase, member });
  }
  function visit(parentId, depth, inherited) {
    parents.push(parentId);
    const values = projection(state, parentId), team = values.agentTeam;
    for (const stored of values.omdOverview?.workflows ?? []) {
      const node = { ...(parentId === rootId ? workflows.find(node => node.id === stored.id) ?? stored : stored), ownerId: parentId };
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
      const status = member?.phase === 'provisioning' ? 'provisioning' : member?.phase === 'failed' ? 'failed'
        : running ? 'running' : outcome === 'error' ? 'failed' : outcome === 'cancelled' ? 'cancelled' : workflow && ['failed', 'cancelled', 'interrupted'].includes(workflow.member.status) ? workflow.member.status
        : timing?.lastTurnCompleted === true ? 'completed' : timing?.lastTurnCompleted === false ? 'interrupted' : child.mode === 'external' ? 'external' : 'idle';
      const group = member ? { kind: 'team', id: parentId, label: 'Agent Team' }
        : workflow ? { kind: 'workflow', id: workflow.node.id, label: workflow.node.data.name, phase: workflow.phase.phase } : inherited;
      rows.push({ ...child, parentId, depth, mode: childValues.subagent?.mode ?? child.mode,
        label: member?.name || labels.get(child.id) || childValues.subagent?.label || child.label || summary?.title || child.id,
        group, status, timing, model: childValues.modelSelection?.lastUsed, preview: childValues.omdOverview?.activity || summary?.title,
        error: member?.error, available: member?.phase !== 'provisioning' && member?.phase !== 'failed', color: whaleColor(child.id) });
      if (child.mode !== 'external' && member?.phase !== 'provisioning' && member?.phase !== 'failed') visit(child.id, depth + 1, group);
    }
  }
  visit(rootId, 0, { kind: 'ordinary', id: rootId, label: '普通子代理' });
  for (const node of workflows) if (!discoveredWorkflows.has(node.id)) discoveredWorkflows.set(node.id, { ...node, ownerId: rootId });
  return { rows, parents, teams, workflows: [...discoveredWorkflows.values()], active: rows.filter(row => ['running', 'provisioning'].includes(row.status)), completed: rows.filter(row => row.status === 'completed').length };
}
export function agentDuration(row, now = Date.now()) {
  const timing = row.timing;
  if (!timing) return '';
  const ms = timing.settledMs + (timing.active ? Math.max(0, (row.status === 'running' ? now : timing.active.through) - timing.active.since) : 0);
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}秒` : seconds < 3600 ? `${Math.floor(seconds / 60)}分 ${seconds % 60}秒` : `${Math.floor(seconds / 3600)}小时 ${Math.floor(seconds / 60) % 60}分`;
}
export function collectOutputs(chat) {
  const files = new Map(), turns = new Set();
  for (const node of chat?.nodes?.values?.() ?? []) {
    const turn = node.location?.turn;
    if (!turn?.data || turns.has(turn.turn)) continue;
    turns.add(turn.turn);
    const value = turn.data.get('deliverables');
    for (const file of [...value?.produced ?? [], ...value?.presented ?? []]) if (file.path) files.set(file.path, { ...file, id: file.path, label: file.title || file.path.split(/[\\/]/).at(-1) });
  }
  return [...files.values()];
}
// Only durable user message attachments are sources, never arbitrary tool text.
export function collectSources(entries) {
  const sources = new Map();
  for (const entry of entries) {
    const event = entry.event ?? entry;
    if (!['user/message', 'user/steering', 'user/prompt'].includes(event.type)) continue;
    const content = event.data?.message?.content ?? event.data?.content ?? [];
    for (const block of content) {
      if (block.type === 'image' && block.attachment) {
        const attachment = block.attachment;
        sources.set(`image:${attachment.id ?? attachment.attachmentId}`, { id: `image:${attachment.id ?? attachment.attachmentId}`, label: attachment.name || '图片', attachment, kind: 'image' });
      }
      if (block.type === 'file' && block.attachment) sources.set(`file:${block.attachment.attachmentId}`, { id: `file:${block.attachment.attachmentId}`, file: block.attachment, label: block.attachment.name, kind: 'file' });
    }
  }
  return [...sources.values()];
}
