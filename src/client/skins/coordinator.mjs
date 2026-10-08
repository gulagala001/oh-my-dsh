// Canonical source: OMAA src/client/themes/coordinator.mjs. OMD carries the same
// small protocol module so either plugin can run without importing the other.
const KEY = Symbol.for('omd.omaa.appearance.v1');

export function appearanceCoordinator(surface = document) {
  if (surface[KEY]) {
    if (surface[KEY].version !== 1) throw new Error('Incompatible appearance coordinator');
    return surface[KEY];
  }
  const providers = new Map(), listeners = new Set(), foregroundOwners = new Map();
  let foreground = { sessionId: null, mode: null }, active, busy = false, pending = false, serial = 0;
  let snapshot = Object.freeze({ foreground, owner: null, key: null, error: null, revision: 0 });
  const publish = error => {
    snapshot = Object.freeze({ foreground: Object.freeze({ ...foreground }), owner: active?.entry.id ?? null,
      key: active?.selection.key ?? null, error: error?.message ?? null, revision: snapshot.revision + 1 });
    for (const listener of [...listeners]) listener();
  };
  const reconcile = () => {
    if (busy) { pending = true; return; }
    busy = true;
    try {
      do {
        pending = false;
        let next, failure;
        for (const entry of [...providers.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
          try {
            const selection = entry.select(foreground);
            if (selection) { next = { entry, selection }; break; }
          } catch (error) { failure = error; }
        }
        if (active?.entry === next?.entry && active?.selection.key === next?.selection.key) {
          publish(failure); continue;
        }
        const previous = active; active = undefined;
        try { previous?.dispose?.(); } catch (error) { failure = error; }
        if (next && providers.get(next.entry.id) === next.entry) {
          try {
            const dispose = next.entry.mount(next.selection, foreground);
            if (typeof dispose !== 'function') throw new Error('Appearance renderer must return a disposer');
            active = { ...next, dispose };
          } catch (error) { failure = error; }
        }
        publish(failure);
      } while (pending);
    } finally { busy = false; }
  };
  const updateForeground = () => {
    const newest = [...foregroundOwners.values()].sort((a, b) => b.order - a.order)[0];
    const next = newest?.selection ?? { sessionId: null, mode: null };
    if (next.sessionId === foreground.sessionId && next.mode === foreground.mode) return;
    foreground = next; reconcile();
  };
  const coordinator = {
    version: 1,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasProvider: id => providers.has(id),
    register({ id, priority = 0, select, mount }) {
      if (providers.has(id)) throw new Error(`Appearance provider already registered: ${id}`);
      if (typeof id !== 'string' || !id || typeof select !== 'function' || typeof mount !== 'function' || !Number.isFinite(priority)) throw new TypeError('Invalid appearance provider');
      const entry = { id, priority, select, mount };
      providers.set(id, entry); reconcile();
      return () => { if (providers.get(id) === entry) { providers.delete(id); reconcile(); } };
    },
    invalidate() { reconcile(); },
    observeForeground(owner) {
      const entry = { order: ++serial, selection: { ...foreground } };
      const token = Symbol(owner); foregroundOwners.set(token, entry);
      let disposed = false;
      return {
        set(selection) {
          if (disposed) return;
          if (selection.sessionId !== null && typeof selection.sessionId !== 'string') throw new TypeError('Invalid foreground session identity');
          if (selection.mode !== null && typeof selection.mode !== 'string') throw new TypeError('Invalid foreground mode');
          entry.selection = { sessionId: selection.sessionId, mode: selection.mode }; updateForeground();
        },
        dispose() { if (!disposed) { disposed = true; foregroundOwners.delete(token); updateForeground(); } },
      };
    },
  };
  Object.defineProperty(surface, KEY, { value: coordinator });
  return coordinator;
}
