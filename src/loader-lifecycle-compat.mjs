import { symbols } from '@deepseek-ai/cordis';
const untrace = value => value?.[symbols.original] || value;
const installed = Symbol.for('omd.loader-live-entries.alpha2');

export function entryIsRegistered(entry) {
  const seen = new Set();
  for (let current = untrace(entry); current; current = untrace(current.parent?.tree?.ctx?.fiber?.entry)) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (untrace(current.parent?.tree?.store?.[current.options?.id]) !== current) return false;
  }
  return true;
}

// DSH's iterator snapshots Object.values before yielding. A concurrent teardown
// can remove a later row while an audit awaits a prior Fiber. Only live rows
// belong in the next iteration; genuine registered import failures stay visible.
export function bindLiveLoaderEntries(loader) {
  loader = untrace(loader);
  const original = loader.entries, descriptor = Object.getOwnPropertyDescriptor(loader, 'entries');
  const originalAwait = loader.await, awaitDescriptor = Object.getOwnPropertyDescriptor(loader, 'await');
  const removing = new WeakMap(), groups = new Map(), tasks = new Set();
  function watch(group) {
    group = untrace(group);
    if (!group || groups.has(group) || typeof group.remove !== 'function') return;
    const originalRemove = group.remove, own = Object.getOwnPropertyDescriptor(group, 'remove');
    function remove(id, ...args) {
      const entry = untrace(this.tree?.store?.[id]);
      if (entry) removing.set(entry, (removing.get(entry) || 0) + 1);
      let task;
      const cleanup = () => { tasks.delete(task); if (entry) { const n = removing.get(entry) - 1; if (n) removing.set(entry, n); else removing.delete(entry); } };
      try { task = Promise.resolve(originalRemove.call(this, id, ...args)); } catch (error) { cleanup(); throw error; }
      tasks.add(task); task.then(cleanup, cleanup);
      return task;
    }
    Object.defineProperty(group, 'remove', { value: remove, configurable: true, writable: true });
    groups.set(group, () => { if (Object.getOwnPropertyDescriptor(group, 'remove')?.value !== remove) return; if (own) Object.defineProperty(group, 'remove', own); else delete group.remove; });
  }
  function* entries(...args) {
    for (const entry of original.apply(this, args)) {
      watch(entry.parent);
      if (!removing.has(untrace(entry)) && entryIsRegistered(entry)) yield entry;
    }
  }
  Object.defineProperty(loader, 'entries', { configurable: true, writable: true, value: entries });
  // Discover groups before the first removal, not only during its audit.
  for (const entry of original.call(loader)) watch(entry.parent);
  async function settled(...args) {
    for (;;) {
      if (tasks.size) await Promise.all([...tasks]);
      const result = await originalAwait.apply(this, args);
      if (!tasks.size) return result;
    }
  }
  if (typeof originalAwait === 'function') Object.defineProperty(loader, 'await', { configurable: true, writable: true, value: settled });
  return () => {
    for (const restore of [...groups.values()].reverse()) restore(); groups.clear();
    if (Object.getOwnPropertyDescriptor(loader, 'entries')?.value === entries) { if (descriptor) Object.defineProperty(loader, 'entries', descriptor); else delete loader.entries; }
    if (Object.getOwnPropertyDescriptor(loader, 'await')?.value === settled) { if (awaitDescriptor) Object.defineProperty(loader, 'await', awaitDescriptor); else delete loader.await; }
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
