import React from 'react';
import { createPoller } from './polling.mjs';

export function usePollingAction(request, interval, enabled = true) {
  const [view, setView] = React.useState({ state: null, error: '', requestError: '', operation: null });
  const current = React.useRef(null);
  React.useEffect(() => {
    const owner = { request, writing: false };
    owner.poller = createPoller({
      read: signal => request(undefined, signal),
      onData: state => setView(view => ({ ...view, state, error: '' })),
      onError: error => setView(view => ({ ...view, error: error.message })),
      interval,
    });
    current.current = owner;
    setView({ state: null, error: '', requestError: '', operation: null });
    return () => {
      if (current.current === owner) current.current = null;
      owner.poller.stop();
    };
  }, [request, interval]);
  React.useEffect(() => {
    const owner = current.current;
    owner.enabled = enabled;
    if (enabled && !owner.writing) owner.poller.start();
    else owner.poller.stop();
  }, [request, interval, enabled]);
  const act = async input => {
    const owner = current.current;
    if (!owner || owner.writing) return;
    owner.writing = true;
    setView(view => ({ ...view, operation: { input }, requestError: '' }));
    owner.poller.stop();
    try {
      const state = await owner.request(input);
      if (current.current === owner) setView(view => ({ ...view, state }));
    } catch (error) {
      if (current.current === owner) setView(view => ({ ...view, requestError: error.message }));
    } finally {
      owner.writing = false;
      if (current.current === owner) {
        setView(view => ({ ...view, operation: null }));
        if (owner.enabled) owner.poller.start();
      }
    }
  };
  const { operation, ...snapshot } = view;
  return { ...snapshot, pending: operation !== null, pendingInput: operation?.input, act, refresh: () => current.current?.poller.refresh() };
}
