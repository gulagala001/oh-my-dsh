import { AsyncLocalStorage } from 'node:async_hooks';
import { acquireShared } from './shared.mjs';
import { createResponsesAuto } from './engine.mjs';

export const name = 'dsh-response-id-reuse';
export const inject = ['llm'];

/** Public LLM middleware scopes the fetch wrapper to one actual model call. */
export async function install(ctx) {
  const calls = new AsyncLocalStorage();
  const original = globalThis.fetch;
  const engine = await createResponsesAuto({ fetchImpl: original });
  let live = true;
  const wrapped = function(input, init) {
    const call = live && calls.getStore();
    return call ? engine.fetchFor(call, original)(input, init) : original(input, init);
  };
  ctx.effect(() => {
    globalThis.fetch = wrapped;
    return () => {
      live = false;
      if (globalThis.fetch === wrapped) globalThis.fetch = original;
      return engine.close();
    };
  });
  ctx.on('llm/stream', function(options, next) {
    const context = { provider: String(options.provider), model: String(options.model),
      sessionId: options.sessionId === undefined ? undefined : String(options.sessionId) };
    return {
      async *[Symbol.asyncIterator]() {
        const iterator = calls.run(context, () => next()[Symbol.asyncIterator]());
        let done = false;
        try {
          while (true) {
            const result = await calls.run(context, () => iterator.next());
            if (result.done) { done = true; return; }
            yield result.value;
          }
        } finally {
          if (!done) await calls.run(context, () => iterator.return?.());
        }
      },
    };
  });
}

export const apply = (ctx, config = {}) => config.enabled === false ? undefined
  : acquireShared(ctx, 'transport', { name: 'dsh-response-id-reuse-runtime', runtimeRevision: 2, inject, apply: install });
