const key = Symbol.for('dsh.glyph.ownership.v1');
export function glyphOwnership() {
  return globalThis[key] ??= (() => {
    const owners = new Set(), listeners = new Set();
    return {
      hasOmd: () => owners.size > 0,
      subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      claimOmd() { const owner = {}; owners.add(owner); for (const fn of listeners) fn();
        // Allow the departing host to finish its synchronous style cleanup
        // before a standalone owner reapplies its attributes and token layer.
        return () => { owners.delete(owner); queueMicrotask(() => { for (const fn of listeners) fn(); }); }; },
    };
  })();
}
