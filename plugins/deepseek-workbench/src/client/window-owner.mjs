// One physical window can host multiple plugin scopes. Preserve the original
// registry shape so a bundled and a standalone contributor can hand off.
export function acquireWindowOwner(ctx, surface, key, mount) {
  const shared = surface[key] ??= { owners: new Map(), leader: null };
  shared.pending ??= Promise.resolve();
  function reconcile() {
    shared.pending = shared.pending.catch(() => {}).then(async () => {
      const leader = shared.leader;
      if (leader && (leader.retiring || shared.owners.get(leader.ctx) !== leader)) {
        leader.retiring = true;
        await leader.dispose?.();
        shared.leader = null;
      }
      if (shared.leader) return;
      const next = shared.owners.values().next().value;
      if (!next) { if (surface[key] === shared) delete surface[key]; return; }
      const cleanups = [];
      const lifetime = new AbortController();
      next.stop = () => lifetime.abort();
      next.dispose = async () => {
        next.stop();
        const errors = [];
        for (const fn of cleanups.slice().reverse()) {
          try { await fn(); cleanups.splice(cleanups.lastIndexOf(fn), 1); }
          catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Window contribution cleanup failed');
      };
      shared.leader = next;
      try { mount(next.ctx, fn => cleanups.push(fn), lifetime.signal); }
      catch (error) {
        if (shared.owners.get(next.ctx) === next) shared.owners.delete(next.ctx);
        next.retiring = true;
        try { await next.dispose(); shared.leader = null; }
        catch (cleanup) { throw new AggregateError([error, cleanup], 'Window contribution startup and cleanup failed'); }
        throw error;
      }
    });
    return shared.pending;
  }
  if (!shared.owners.has(ctx)) {
    const owner = {ctx};
    ctx.effect(() => {
      shared.owners.set(ctx, owner);
      return () => {
        if (shared.owners.get(ctx) === owner) shared.owners.delete(ctx);
        if (shared.leader === owner) owner.stop?.();
        return reconcile();
      };
    });
  }
  return reconcile();
}
