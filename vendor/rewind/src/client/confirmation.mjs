// A preview and its confirmation share a target. Only the current attempt
// may advance the dialog, while committed session state lives on the server.
export function createConfirmation() {
  let state = { phase: 'closed' };
  const listeners = new Set();
  function enter(phase, detail = {}) {
    state = { phase, ...detail };
    for (const notify of listeners) notify();
    return state;
  }
  return {
    read: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    preview(target) { if (target && state.phase !== 'applying') return enter('previewing', { target }); },
    reviewed(attempt, plan) { if (state === attempt) enter('review', { target: attempt.target, plan }); },
    apply() { if (state.phase === 'review' && state.plan.canApply) return enter('applying', { target: state.target, plan: state.plan }); },
    fail(attempt, error) { if (state === attempt) enter('error', { target: attempt.target, error }); },
    close(attempt) { if (attempt === state || !attempt && state.phase !== 'applying') enter('closed'); },
    reset() { enter('closed'); },
  };
}
