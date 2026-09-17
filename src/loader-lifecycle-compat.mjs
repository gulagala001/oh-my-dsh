const installed = Symbol.for('omd.loader-live-entries.alpha2');

export function entryIsRegistered(entry) {
  const seen = new Set();
  for (let current = entry; current; current = current.parent?.tree?.ctx?.fiber?.entry) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (current.parent?.tree?.store?.[current.options?.id] !== current) return false;
  }
  return true;
}

// DSH's iterator snapshots Object.values before yielding. A concurrent teardown
// can remove a later row while an audit awaits a prior Fiber. Only live rows
// belong in the next iteration; genuine registered import failures stay visible.
export function bindLiveLoaderEntries(loader) {
  const original = loader.entries, descriptor = Object.getOwnPropertyDescriptor(loader, 'entries');
  function* entries(...args) {
    for (const entry of original.apply(this, args)) if (entryIsRegistered(entry)) yield entry;
  }
  Object.defineProperty(loader, 'entries', { configurable: true, writable: true, value: entries });
  return () => {
    if (loader.entries !== entries) return;
    if (descriptor) Object.defineProperty(loader, 'entries', descriptor); else delete loader.entries;
  };
}

export function installLoaderLifecycleCompatibility(ctx) {
  const root = ctx.root, loader = ctx.loader;
  if (root[installed]) return;
  // The compatibility belongs to the host lifetime: it must still protect the
  // audit which runs after this OMD instance has been unloaded.
  root.effect(() => {
    const dispose = bindLiveLoaderEntries(loader);
    root[installed] = dispose;
    return () => { dispose(); if (root[installed] === dispose) delete root[installed]; };
  }, 'OMD alpha.2 live loader iteration');
}
