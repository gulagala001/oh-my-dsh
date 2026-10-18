/** A child remains a child when reopened outside the parent sidebar. */
export function isSubagentSession(sessions, sessionId) {
  const summary = sessions.byId?.[sessionId];
  return summary?.origin === 'subagent'
    || summary?.projectionValues?.subagent != null
    || sessions.projectionsBySession?.[sessionId]?.values.subagent != null;
}

/** Hide main-only controls until the native session identity is resolved. */
export function useMainConversation({ sessionId, useSession, useSessions }) {
  const main = useSession(session => session.subagent === null);
  const child = useSessions(sessions => isSubagentSession(sessions, sessionId));
  return main && !child;
}
