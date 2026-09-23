import { symbols } from '@deepseek-ai/cordis';
// Cordis 4.0.4 exports FiberState as a TypeScript const enum.
const UNLOADING = 5;
const untrace = value => value?.[symbols.original] || value;
const installed = Symbol.for('omd.loader-live-entries.alpha2');

function holdClientGraph(loader) {
  const modules = untrace(loader.ctx?.get?.('clientModules'));
  if (!modules || typeof modules.flush !== 'function') return () => {};
  const flush = modules.flush, descriptor = Object.getOwnPropertyDescriptor(modules, 'flush');
  let pending;
  const held = (...args) => { pending = args; };
  Object.defineProperty(modules, 'flush', { value: held, configurable: true, writable: true });
  return () => {
    if (Object.getOwnPropertyDescriptor(modules, 'flush')?.value !== held) return;
    if (descriptor) Object.defineProperty(modules, 'flush', descriptor); else delete modules.flush;
    if (pending) flush.apply(modules, pending);
  };
}

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
      const fiber = entry?.fiber;
      let task;
      const cleanup = () => { tasks.delete(task); if (entry) { const n = removing.get(entry) - 1; if (n) removing.set(entry, n); else removing.delete(entry); } };
      try { task = Promise.resolve(originalRemove.call(this, id, ...args)).then(() => fiber?.dispose?.()); } catch (error) { cleanup(); throw error; }
      tasks.add(task); task.then(cleanup, cleanup);
      return task;
    }
    Object.defineProperty(group, 'remove', { value: remove, configurable: true, writable: true });
    const originalUpdate = group.update, updateOwn = Object.getOwnPropertyDescriptor(group, 'update');
    let tail = Promise.resolve();
    const serialized = untrace(group.tree?.root) === group && group.tree?.filename && typeof originalUpdate === 'function';
    function update(config, ...args) {
      const task = tail.then(async () => {
        // Publish one complete client graph per profile transaction. Per-row
        // intermediate graphs can retire a bundle URL while the browser is
        // still loading it, leaving a partially restored conversation.
        const publish = holdClientGraph(loader);
        try {
          const oldConfig = [...group.data], targetIds = new Set(config.map(row => row.id));
          const retiring = oldConfig.filter(row => !targetIds.has(row.id) &&
            (row.name === 'trisoul_x' || row.name?.startsWith('trisoul_x/host/') || row.name === '@oh-my-dsh/ui-conversation'));
          // Loader 1.0.4 starts incoming services before removing outgoing rows.
          // OMD replaces several exclusive host services: retire our removed
          // rows first so the original services can activate. Keep oldConfig
          // intact for Loader's existing rollback, including preparation failure.
          try {
            for (const row of retiring) await group.remove(row.id, true);
            // Service dependents may still be releasing exclusive registrations.
            // Drain their existing unloads before replacement providers activate.
            for (;;) {
              const pending = [...original.call(loader)].map(e => e.fiber).filter(f => f?.state === UNLOADING && f.inertia).map(f => f.inertia);
              if (!pending.length) break;
              await Promise.all(pending);
            }
          } catch (error) {
            try { await originalUpdate.call(group, oldConfig); }
            catch (rollbackError) { throw new AggregateError([error, rollbackError], 'OMD provider retirement rollback failed'); }
            throw error;
          }
          return await originalUpdate.call(group, config, ...args);
        } finally { publish(); }
      });
      tail = task.catch(() => {});
      tasks.add(task); task.then(() => tasks.delete(task), () => tasks.delete(task));
      return task;
    }
    if (serialized) Object.defineProperty(group, 'update', { value: update, configurable: true, writable: true });
    groups.set(group, () => {
      if (Object.getOwnPropertyDescriptor(group, 'remove')?.value === remove) { if (own) Object.defineProperty(group, 'remove', own); else delete group.remove; }
      if (serialized && Object.getOwnPropertyDescriptor(group, 'update')?.value === update) { if (updateOwn) Object.defineProperty(group, 'update', updateOwn); else delete group.update; }
    });
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
  }, 'OMD live loader iteration');
}
