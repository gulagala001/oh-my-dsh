import { Context } from '@deepseek-ai/cordis';

// The root owns the Fiber. Each plugin scope leases it until its effect exits.
// Keep the v1 cell shape so installed copies can join the same isolate.
export function leaseComponent(ctx, key, label, component, config) {
  const scopes = ctx.root[key] ??= new Map();
  let state = scopes.get(label);
  if (!state) {
    state = { owners: new Set(), host: ctx.root.extend({ [Context.isolate]: ctx[Context.isolate] }),
      pending: Promise.resolve(), fiber: null, phase: 'idle' };
    scopes.set(label, state);
  }
  const revision = component.runtimeRevision;
  if (state.component === undefined || !state.owners.size && revision === undefined || revision !== undefined && revision > (state.runtimeRevision ?? -1)) {
    state.component = component;
    state.config = config;
    state.runtimeRevision = revision;
  }

  async function release() {
    state.phase = 'retiring';
    try { await state.fiber.dispose(); }
    catch (error) { state.phase = 'cleanup-failed'; throw error; }
    state.fiber = null;
    state.phase = 'idle';
  }

  function reconcile() {
    state.pending = state.pending.catch(() => {
      // A v1 peer may have retained a failed Fiber without a phase marker.
      if (state.fiber && !state.phase) state.phase = 'cleanup-failed';
    }).then(async () => {
      while (true) {
        if (state.fiber && (!state.owners.size || state.phase === 'cleanup-failed' || state.fiberRevision !== state.runtimeRevision)) {
          await release();
          continue;
        }
        if (!state.owners.size) {
          if (scopes.get(label) === state) scopes.delete(label);
          return;
        }
        if (state.fiber) return;
        const fiber = state.host.plugin(state.component, state.config);
        state.fiber = fiber;
        state.fiberRevision = state.runtimeRevision;
        state.phase = 'starting';
        try { await fiber; }
        catch (error) {
          try { await release(); }
          catch (cleanup) { throw new AggregateError([error, cleanup], 'Component startup and cleanup failed'); }
          throw error;
        }
        state.phase = 'ready';
      }
    });
    return state.pending;
  }

  const owner = ctx.fiber;
  if (!state.owners.has(owner)) {
    ctx.effect(() => {
      state.owners.add(owner);
      return () => { state.owners.delete(owner); return reconcile(); };
    });
  }
  return reconcile();
}
