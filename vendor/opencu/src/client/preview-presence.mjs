import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';

export function createPreviewPresence() {
  const entries = new Map();
  const entryFor = id => { if (!entries.has(id)) entries.set(id, { owners: new Set(), listeners: new Set() }); return entries.get(id); };
  const releaseEmpty = (id, entry) => { if (!entry.owners.size && !entry.listeners.size) entries.delete(id); };
  const notify = entry => { for (const listener of entry.listeners) listener(); };
  return {
    visible: id => Boolean(entries.get(id)?.owners.size),
    subscribe(id, listener) {
      if (!id) return () => {};
      const entry = entryFor(id); entry.listeners.add(listener);
      return () => { entry.listeners.delete(listener); releaseEmpty(id, entry); };
    },
    show(id) {
      const entry = entryFor(id), owner = Symbol(), wasVisible = entry.owners.size > 0;
      entry.owners.add(owner); if (!wasVisible) notify(entry);
      return () => { if (!entry.owners.delete(owner)) return; if (!entry.owners.size) notify(entry); releaseEmpty(id, entry); };
    },
  };
}
const presence = globalThis[Symbol.for('opencu.preview-presence.v1')] ||= createPreviewPresence();
export function usePreviewPaneVisible(id) {
  return useSyncExternalStore(useCallback(listener => presence.subscribe(id, listener), [id]), useCallback(() => presence.visible(id), [id]));
}
export function usePreviewPanePresence(id, visible) {
  useLayoutEffect(() => id && visible ? presence.show(id) : undefined, [id, visible]);
}
