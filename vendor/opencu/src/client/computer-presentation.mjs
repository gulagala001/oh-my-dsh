import { useEffect, useState } from 'react';

export function useComputerPresentation(sessionId, callIds) {
  const ids = [...new Set(callIds.filter(Boolean))];
  const key = JSON.stringify([sessionId, ids]);
  const [state, setState] = useState({ key: null, values: {} });
  useEffect(() => {
    if (!sessionId || !ids.length) return;
    const controller = new AbortController();
    void Promise.all(ids.map(async callId => {
      try {
        const response = await fetch('trisoul-x/computer-use/presentation?session=' + encodeURIComponent(sessionId)
          + '&call=' + encodeURIComponent(callId), { signal: controller.signal });
        if (!response.ok) return [callId, null];
        return [callId, (await response.json()).meta];
      } catch { return [callId, null]; }
    })).then(entries => { if (!controller.signal.aborted) setState({ key, values: Object.fromEntries(entries) }); });
    return () => controller.abort();
  }, [key]);
  // Never render metadata from the previous session/call while effects catch up.
  return state.key === key ? state.values : {};
}
