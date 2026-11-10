const contains = (ranges, seq) => Number.isFinite(seq) && ranges.some(range => seq >= range.start && seq <= range.end);

// anchorSeq is a render position, not necessarily the durable source seq:
// request prompts and process controls may sit just before their step/turn.
export function hiddenNode(node, state) {
  if (!node) return false;
  const ranges = state.hiddenRanges ?? [], location = node.location;
  if (contains(ranges, node.data?.seq) || contains(ranges, node.anchorSeq)) return true;
  if (location?.kind !== 'turn' && location?.kind !== 'step') return false;
  return state.hiddenTurns?.includes(location.turn.turn) === true
    || location.kind === 'step' && contains(ranges, location.step.start?.seq);
}

export function visibleGroup(group, nodes, state) {
  if (!group) return group;
  const members = group.members.filter(member => !hiddenNode(nodes.get(member.key), state));
  return members.length === group.members.length ? group : members.length ? { ...group, members } : undefined;
}
