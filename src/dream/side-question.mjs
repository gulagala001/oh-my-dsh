// Identify historical side-question records when reading existing session data.
// Only the first descriptor in this child's own suffix is authoritative.
// An inherited descriptor must never classify an unrelated fork as a side question.
export function btwDescriptor(events, inherited = 0) {
  const event = events.slice(inherited).find(e => e.type === 'subagent/descriptor');
  const d = event?.data;
  return d?.version === 3 && d.mode === 'one-shot' && d.provider === 'fork'
    && typeof d.label === 'string' && /^omd-btw:v1:[0-9a-f-]{36}$/.test(d.label) ? d : null;
}
export function isBtwSession(session) {
  if (!session) return false;
  if (session.header?.origin !== 'subagent' || !session.snapshotEvents) return false;
  return Boolean(btwDescriptor(session.snapshotEvents(), session.inheritedEventCount || 0));
}
