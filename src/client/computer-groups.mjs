const isComputer = root => ['computer_use', 'computer_use_reset'].includes(root?.call?.name ?? root?.name);
const stepKey = node => node.location?.kind === 'step' ? `${node.location.turn.turn}:${node.location.step.step}` : node.kind === 'assistant-step' ? `${node.data.turn}:${node.data.step}` : null;

// A presentation projection only: user messages, other tools, context updates,
// and final answers remain boundaries. No session events or model input change.
export function computerGroups(nodes) {
  const steps = new Map(), result = new Map();
  for (const node of nodes) if (node.kind === 'tool-call') {
    const key = stepKey(node); if (!key) continue;
    const step = steps.get(key) ?? { computer: false, other: false };
    step[isComputer(node.data.root) ? 'computer' : 'other'] = true; steps.set(key, step);
  }
  let group;
  for (const node of nodes) {
    const step = steps.get(stepKey(node));
    const tool = node.kind === 'tool-call' && isComputer(node.data.root);
    const assistant = node.kind === 'assistant-step' && step?.computer && !step.other;
    if (!tool && !assistant) { group = undefined; continue; }
    const turn = node.location?.turn?.turn ?? node.data.turn;
    if (!group || group.turn !== turn) group = { id: node.key, turn, keys: [], calls: [], running: false, failures: 0, stopped: 0, title: '' };
    group.keys.push(node.key); result.set(node.key, group);
    if (tool) {
      const root = node.data.root; if (group.keys.length === 1) group.headerCallId = root.callId; result.set(`call:${root.callId}`, group); group.calls.push(root.callId);
      group.running ||= root.kind !== 'tool-result';
      const aborted = ['ABORTED', 'ABORTED_BEFORE_DISPATCH'].includes(root.error?.code) || root.isError && /tool call aborted|Computer Use (?:was |is )?stopped/i.test((root.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n'));
      if (aborted) group.stopped++; else if (root.isError || root.meta?.computerUseError) group.failures++;
      try { group.title = JSON.parse(root.call?.argsRaw ?? root.argsRaw ?? '{}').title || group.title; } catch {}
    }
  }
  return result;
}
