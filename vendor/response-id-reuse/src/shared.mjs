import { Context } from '@deepseek-ai/cordis';

/** Independent and embedded distributions lease one root-owned component. */
export async function acquireShared(ctx, id, component, config) {
  const key = Symbol.for(`dsh-response-id-reuse.${id}.v1`);
  const label = ctx[Context.isolate]?.llm;
  const groups = ctx.root[key] ??= new Map();
  let state = groups.get(label);
  if (!state) {
    state = { owners: new Set(), fiber: null, pending: Promise.resolve(),
      host: ctx.root.extend({ [Context.isolate]: ctx[Context.isolate] }) };
    groups.set(label, state);
  }
  const revision = component.runtimeRevision ?? 0;
  if (revision > (state.runtimeRevision ?? -1)) {
    state.runtimeRevision = revision;
    state.component = component;
    state.config = config;
  }
  const reconcile = () => state.pending = state.pending.catch(() => {}).then(async () => {
    if (state.owners.size && state.fiber && state.fiberRevision !== state.runtimeRevision) {
      await state.fiber.dispose();
      state.fiber = null;
    }
    if (state.owners.size && !state.fiber) {
      const fiber = state.host.plugin(state.component, state.config);
      state.fiber = fiber;
      state.fiberRevision = state.runtimeRevision;
      try { await fiber; }
      catch (error) { await fiber.dispose(); state.fiber = null; throw error; }
    } else if (!state.owners.size && state.fiber) {
      await state.fiber.dispose();
      state.fiber = null;
    }
  });
  const owner = ctx.fiber;
  if (state.owners.has(owner)) return state.pending;
  ctx.effect(() => {
    state.owners.add(owner);
    return async () => {
      state.owners.delete(owner);
      await reconcile();
      if (!state.owners.size && groups.get(label) === state) groups.delete(label);
    };
  });
  await reconcile();
}
