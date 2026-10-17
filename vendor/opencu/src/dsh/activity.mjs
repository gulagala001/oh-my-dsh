import { randomUUID } from 'node:crypto';

/** Tool activity is independent of the page a user happens to be viewing. */
export function createActivityFeed(currentTurn) {
  const sessions = new Map(), waiters = new Set(), listeners = new Set();
  let revision = 0, closed = false;
  function snapshot({ compact = false } = {}) {
    return { ok: true, revision, sessions: [...sessions.values()].map(session => ({
      ...session, targets: [...session.targets.values()].map(target => {
        if (!compact || !target.observation) return target;
        const { observation, ...value } = target;
        return { ...value, observation: { observationId: observation.observationId, url: observation.url, title: observation.title } };
      }), running: [...session.running.values()],
    })) };
  }
  function publish() { revision++; for (const wake of [...waiters]) wake(); for (const listener of listeners) listener(); }
  function sessionFor(id) {
    let session = sessions.get(id);
    if (!session) {
      session = { sessionId: id, targets: new Map(), running: new Map(), webMcpCalls: [], latest: null };
      const turn = currentTurn?.(id);
      if (turn !== undefined) session.turn = turn;
      sessions.set(id, session);
    }
    return session;
  }
  return {
    begin(sessionId, endpoint, args) {
      if (closed || typeof sessionId !== 'string') return null;
      const session = sessionFor(sessionId);
      const activity = { id: randomUUID(), endpoint, targetId: args.targetId ?? args.reference?.id ?? null,
        title: args.title ?? null, action: args.action ?? null, status: 'running', startedAt: new Date().toISOString() };
      session.running.set(activity.id, activity);
      session.turnUsedComputer = true; session.completion = null;
      session.lastStarted = activity;
      publish();
      return { sessionId, id: activity.id };
    },
    finish(handle, result, error) {
      if (closed || !handle) return;
      const session = sessions.get(handle.sessionId), previous = session?.running.get(handle.id);
      if (!previous) return;
      session.running.delete(handle.id);
      const targetId = result?.targetId ?? result?.target?.id ?? previous.targetId;
      if (result?.result?.replacedTargetId) session.targets.delete(result.result.replacedTargetId);
      const target = result?.target ?? result?.result?.target ?? result?.state?.targets?.find(item => item.id === targetId);
      if (target) {
        const value = { ...session.targets.get(target.id), ...target };
        session.targets.delete(target.id); session.targets.set(target.id, value);
      }
      if (result?.result?.closedTargetId) session.targets.delete(result.result.closedTargetId);
      if (targetId && result?.observation && session.targets.has(targetId)) {
        session.targets.set(targetId, { ...session.targets.get(targetId),
          observation: result.observation, image: result.image ?? null });
      }
      if (result?.result?.webMcpCall) session.webMcpCalls.push(result.result.webMcpCall);
      session.latest = { ...previous, targetId, status: error || result?.ok === false ? 'failed' : 'settled',
        error: error ? { message: error.message, code: error.code ?? 'OPENCU_ERROR' } : result?.error ?? null,
        finishedAt: new Date().toISOString() };
      publish();
    },
    sessionEvent(sessionId, event) {
      if (closed || !['turn/start', 'turn/end'].includes(event.type)) return;
      const session = sessions.get(sessionId) ?? (!currentTurn ? sessionFor(sessionId) : null);
      if (!session) return;
      if (event.type === 'turn/start') {
        session.turn = event.data.turn; session.turnUsedComputer = false; session.completion = null;
      } else if (session.turn === event.data.turn) {
        session.completion = event.data.reason?.kind === 'completed' && session.turnUsedComputer
          ? { id: `${sessionId}:${event.seq}`, at: event.time ?? Date.now() } : null;
      }
      publish();
    },
    forget(sessionId) { if (sessions.delete(sessionId)) publish(); },
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async wait(after, signal, { heartbeat = false, compact = false } = {}) {
      signal?.throwIfAborted();
      if (closed || revision !== after) return snapshot({ compact });
      await new Promise((resolve, reject) => {
        const finish = () => { clearTimeout(timer); waiters.delete(wake); signal?.removeEventListener('abort', abort); };
        const wake = () => { finish(); resolve(); };
        const abort = () => { finish(); reject(signal.reason); };
        const timer = setTimeout(wake, 25000);
        waiters.add(wake);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
      return heartbeat && !closed && revision === after ? { ok: true, revision, unchanged: true } : snapshot({ compact });
    },
    close() { closed = true; sessions.clear(); publish(); listeners.clear(); waiters.clear(); },
  };
}
