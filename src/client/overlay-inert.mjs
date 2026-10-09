const owners = new WeakMap();

// Layout adapters can overlap during a theme change. The final owner restores
// the element's initial state, independent of mount and cleanup order.
export function acquireOverlayInert(elements) {
  const leases = [...new Set(elements)].map(element => {
    const state = owners.get(element) ?? { count: 0, previous: element.inert };
    state.count++;
    owners.set(element, state);
    element.inert = true;
    return [element, state];
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const [element, state] of leases) {
      if (--state.count !== 0) continue;
      owners.delete(element);
      element.inert = state.previous;
    }
  };
}
