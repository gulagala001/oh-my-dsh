import { createPoller } from './polling.mjs';

const EMPTY = Object.freeze({ state: null, error: '', eventRevision: 0 });
export function createComputerStatePool({ read, events = globalThis.window, visibility = globalThis.document, interval = 800 }) {
  const entries = new Map();
  const notify = entry => { for (const listener of entry.listeners) listener(); };
  function publish(id, value, fromPoll = false) {
    const entry = entries.get(id); if (!entry) return;
    const previous = entry.snapshot.state, next = typeof value === 'function' ? value(previous) : value;
    if (!next || previous && ((next.controlEpoch ?? 0) < (previous.controlEpoch ?? 0)
      || (next.navigationRevision ?? 0) < (previous.navigationRevision ?? 0)
      || (next.viewRevision ?? 0) < (previous.viewRevision ?? 0))) return;
    entry.revision++; entry.snapshot = { state: next, error: '', eventRevision: entry.snapshot.eventRevision + (fromPoll ? 0 : 1) }; notify(entry);
  }
  const changed = event => publish(event.detail?.id, event.detail?.state);
  return {
    snapshot: id => entries.get(id)?.snapshot || EMPTY,
    publish,
    subscribe(id, listener) {
      if (!id) return () => {};
      let entry = entries.get(id);
      if (!entry) {
        entry = { snapshot: EMPTY, revision: 0, listeners: new Set() };
        entries.set(id, entry);
        if (entries.size === 1) events?.addEventListener('trisoul-cu-state', changed);
        entry.poller = createPoller({ visibility, interval,
          read: async signal => { const revision = entry.revision; return { revision, data: await read(id, signal) }; },
          onData: ({ revision, data }) => { if (entry.revision === revision) publish(id, data, true); },
          onError: error => { entry.snapshot = { ...entry.snapshot, error: error.message }; notify(entry); },
        });
      }
      entry.listeners.add(listener); entry.poller.start();
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size) return;
        entry.poller.stop();
        if (entries.get(id) === entry) entries.delete(id);
        if (!entries.size) events?.removeEventListener('trisoul-cu-state', changed);
      };
    },
  };
}
