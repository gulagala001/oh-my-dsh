import { AsyncLocalStorage } from 'node:async_hooks';
import { symbols } from '@deepseek-ai/cordis';

const key = Symbol.for('dsh.plugins.prompt-provider-context.alpha2');
export const FULL_PRESENTED_TOOLS = Symbol('omd.full-presented-tools');
// Alpha keeps declarations provider-owned. Carry the assembly context into
// our executor's describe() without changing native admission or dispatch.
export function usePromptContext(ctx) {
  const service = ctx.systemPrompt[symbols.original] ?? ctx.systemPrompt;
  let state = service[key];
  if (!state) {
    const storage = new AsyncLocalStorage(), original = service.assemble;
    const wrapped = function(context = {}) {
      return storage.run({ context, schemas: undefined }, () => original.call(this, context));
    };
    state = { storage, original, wrapped, users: 0 };
    service[key] = state; service.assemble = wrapped;
  }
  state.users++;
  ctx.effect(() => () => {
    if (--state.users) return;
    if (service.assemble === state.wrapped) service.assemble = state.original;
    delete service[key];
  });
  return state.storage;
}
export function setPresentedExecutor(ctx, delegate, project = value => value) {
  const storage = usePromptContext(ctx);
  const executor = {
    sections: delegate.sections,
    describe(definitions) {
      const state = storage.getStore();
      if (!state) throw Error('Tool declarations require a native prompt assembly context');
      const result = project(delegate.describe(definitions), definitions, state.context);
      // Assembly must see the same full presentation used for discovery, not
      // its already reduced Native catalog (which loses the hidden names).
      state.schemas = result[FULL_PRESENTED_TOOLS] ?? result.schemas;
      return result;
    },
    execute: input => delegate.execute(input),
  };
  ctx.tools.setExecutor(executor);
  return executor;
}
export function presentationTools(ctx, context) {
  const service = ctx.systemPrompt[symbols.original] ?? ctx.systemPrompt;
  return service[key]?.storage.getStore()?.schemas
    ?? ctx.tools.schemas(context?.scope ?? context?.agent, context?.toolSet);
}
export function beforeToolResolution(ctx, prepare) {
  const tools = ctx.tools[symbols.original] ?? ctx.tools;
  const key = Symbol.for('dsh.plugins.before-tool-resolution.alpha2');
  let state = tools[key];
  if (!state) {
    const original = tools.resolve, callbacks = new Set();
    const wrapped = async function(context) {
      for (const callback of callbacks) await callback(context.agent);
      return original.call(this, context);
    };
    state = { original, wrapped, callbacks }; tools[key] = state; tools.resolve = wrapped;
  }
  state.callbacks.add(prepare);
  ctx.effect(() => () => {
    state.callbacks.delete(prepare);
    if (!state.callbacks.size) {
      if (tools.resolve === state.wrapped) tools.resolve = state.original;
      delete tools[key];
    }
  });
}
