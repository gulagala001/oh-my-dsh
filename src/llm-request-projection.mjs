import { symbols } from '@deepseek-ai/cordis';

// Frozen requests cannot be replaced inside llm/stream middleware. Project at
// both public entry points, retaining native prepared-call ownership and hooks.
export function installRequestProjection(ctx, project) {
  ctx.effect(() => {
    let active = true;
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    const stream = runtime.stream, prepareCall = runtime.prepareCall;
    const descriptors = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
    const apply = options => active ? project(options) : options;
    const wrappedStream = function(options) { return stream.call(this, apply(options)); };
    const wrappedPrepare = async function(...args) {
      const prepared = await prepareCall.apply(this, args);
      return Object.freeze({ ...prepared, stream: options => prepared.stream(apply(options)) });
    };
    runtime.stream = wrappedStream; runtime.prepareCall = wrappedPrepare;
    return () => {
      active = false;
      for (const [i, key, wrapper] of [[0, 'stream', wrappedStream], [1, 'prepareCall', wrappedPrepare]]) {
        if (runtime[key] !== wrapper) continue;
        if (descriptors[i]) Object.defineProperty(runtime, key, descriptors[i]);
        else delete runtime[key];
      }
    };
  });
}
