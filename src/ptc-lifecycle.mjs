import { AsyncLocalStorage } from 'node:async_hooks';
import { symbols } from '@deepseek-ai/cordis';
import { cancellationMessage } from './tool-cancellation.mjs';
import { PTC_CONTROL_NAMES } from './ptc-control-compat.mjs';

const currentRun = new AsyncLocalStorage();
const original = value => value?.[symbols.original] ?? value;
const registries = new WeakMap();
export const currentPtcBudget = () => {
  const run = currentRun.getStore();
  return run ? { budgetMs: run.budget, remainingMs: Math.max(0, run.budget - (performance.now() - run.startedAt)), explicit: run.explicit, adaptive: run.adaptive, defaultMs: run.defaultMs, maximumMs: run.maximumMs } : null;
};
const failure = (message, code, pending = false) => ({
  isError: true, content: [{ type: 'text', text: `Error: ${message}` }],
  error: { message, info: { code, cleanupPending: pending } },
});

// Keep the native transport, scheduler, permissions and process owner. Their
// cooperative timeout does not bound a provider's cleanup or a nested tool
// which ignores cancellation. Bound those waits, but never report them as
// successful cleanup or admit overlapping work in the affected Session.
export function installPtcLifecycle(ctx, { cleanupMs = 5000, adaptiveBudgets = () => false } = {}) {
  const registry = original(ctx.tools);
  let shared = registries.get(registry);
  if (!shared) { shared = { executions: new Map(), runs: new Set(), unowned: {} }; registries.set(registry, shared); }
  const { executions, runs, unowned } = shared, lifetime = {};
  let active = true;
  const ownerOf = exec => exec.agent?.session?.id ?? unowned;
  const pendingRun = exec => [...runs].find(run => run.owner === ownerOf(exec) && run.closed && run.pending.size
    && !(exec.parent === undefined && run.controls.has(exec.name)
      && run.controls.get(exec.name) === ctx.tools.get(exec.name, exec.agent)));
  const runOf = exec => executions.get(exec.token) ?? executions.get(exec.parent);
  const collect = run => {
    if (!run.closed || run.pending.size) return;
    runs.delete(run);
    for (const token of run.tokens) executions.delete(token);
  };
  const stopped = (run, prior) => {
    const reason = run.signal.reason;
    const pending = run.pending.size > 0;
    const message = `${cancellationMessage(reason)}${pending
      ? '; cancellation requested, but cleanup is still pending. Do not repeat operations whose effects are unknown; further operations in this session are blocked until cleanup finishes. Existing direct job controls remain available.' : ''}`;
    const result = failure(message, typeof reason?.code === 'string' ? reason.code : 'ABORTED', pending);
    // A cooperative provider may have already captured output in its native
    // failure. Keep that evidence while marking the overall call unsuccessful.
    if (prior?.isError && prior.content?.length) result.content.unshift(...prior.content);
    return result;
  };
  const blocked = () => failure('A previous PTC call is still cleaning up after cancellation. No new tool was started. Wait for cleanup before retrying.', 'OMD_PTC_CLEANUP_PENDING', true);
  const arm = (run, restart = true) => {
    if (restart) run.startedAt = performance.now();
    clearTimeout(run.timer);
    run.timer = setTimeout(() => run.controller.abort(Object.assign(new Error(`PTC program timed out after ${run.budget}ms (${run.explicit ? 'explicit' : run.budget > run.defaultMs ? 'automatically extended' : 'default'} outer budget). ${run.explicit ? 'An explicit outer deadline cannot extend' : `Automatic extension is bounded by ${run.maximumMs}ms total`}${run.childBudget > run.budget ? `; a nested call requested ${run.childBudget}ms` : ''}. For longer foreground work, set run_code.timeoutMs for the complete program, or start a supported background job. Inspect completed effects before retrying.`),
      { code: 'OMD_PTC_TIMEOUT' })), Math.max(0, run.budget - (performance.now() - run.startedAt)));
  };
  const begin = exec => {
    if (exec.name !== 'run_code') return;
    const timeout = ctx.get('ptcRuntime')?.timeout, requested = exec.arguments?.timeoutMs;
    // Other providers keep their own unsupported/unbounded contract. Invalid
    // arguments still receive native validation, including a null timeout.
    if (!timeout || !Number.isFinite(timeout.defaultMs) || !Number.isFinite(timeout.maxMs)
      || requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) return;
    const controller = new AbortController();
    const run = { owner: ownerOf(exec), controller, signal: AbortSignal.any([exec.signal, controller.signal]),
      budget: Math.min(requested ?? timeout.defaultMs, timeout.maxMs), explicit: requested !== undefined, defaultMs: timeout.defaultMs, maximumMs: timeout.maxMs, adaptive: false,
      adaptiveRequested: requested === undefined && adaptiveBudgets(exec.agent?.session), childBudget: 0, pending: new Set(),
      tokens: new Set([exec.token]), closed: false, root: exec.token, lifetime,
      controls: new Map(PTC_CONTROL_NAMES.map(name => [name, ctx.tools.get(name, exec.agent)]).filter(([, tool]) => tool !== undefined)) };
    const aborted = () => { run.abortedAt = performance.now(); };
    if (run.signal.aborted) aborted(); else run.signal.addEventListener('abort', aborted, { once: true });
    executions.set(exec.token, run); runs.add(run); arm(run);
    return run;
  };

  // Keep observing the original promise after the caller stops waiting. A
  // late rejection is consumed, and only its actual settlement releases the
  // quarantine. The timer/listener belong to this wait, not to that producer.
  async function bounded(run, work, grace = cleanupMs, signal = run.signal, observe = false) {
    if (!observe) signal.throwIfAborted();
    const pending = Promise.resolve().then(() => { if (!observe) signal.throwIfAborted(); return work(); });
    run.pending.add(pending);
    const settled = () => { run.pending.delete(pending); collect(run); };
    pending.then(settled, settled);
    let timer, abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => {
        if (timer !== undefined) return;
        // All nested cleanup shares one grace window; a long batch of stalled
        // post-processors must not multiply that window per queued dispatch.
        const remaining = run.abortedAt === undefined ? grace : Math.max(0, grace - (performance.now() - run.abortedAt));
        timer = setTimeout(() => reject(signal.reason), remaining);
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try { return await Promise.race([pending, cancelled]); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }

  ctx.tools.guard(exec => pendingRun(exec) ? blocked().error.message
    : runOf(exec)?.signal.aborted ? stopped(runOf(exec)).error.message : undefined);
  ctx.on('tools/pre-execute', async (exec, next) => {
    const blockedBy = pendingRun(exec);
    if (blockedBy) { const result = blocked(); return { kind: 'deny', reason: result.error.message, info: result.error.info }; }
    const run = runOf(exec) ?? begin(exec);
    if (!run) return next();
    executions.set(exec.token, run); run.tokens.add(exec.token);
    try {
      const decision = await bounded(run, next, 0);
      // Human approval has its own native cancellation channel. Do not spend
      // the program budget while waiting for the user to grant permission.
      if (exec.token === run.root && decision.kind === 'ask') { clearTimeout(run.timer); run.timer = undefined; }
      return decision;
    }
    catch (error) {
      if (!run.signal.aborted) throw error;
      const result = stopped(run);
      return { kind: 'deny', reason: result.error.message, info: result.error.info };
    }
  }, { global: true, prepend: true });

  ctx.on('tools/execute', async (exec, next) => {
    const run = runOf(exec) ?? begin(exec);
    if (!run) return next();
    const root = exec.token === run.root;
    if (!root) {
      const budgets = [exec.arguments?.timeoutMs, exec.arguments?.timeout_ms, ctx.tools.get(exec.name, exec.agent)?.timeoutMs]
        .filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
      const requested = Math.max(0, ...budgets); run.childBudget = Math.max(run.childBudget, requested);
      if (run.adaptive && requested && !run.signal.aborted) {
        const deadline = Math.min(run.maximumMs, performance.now() - run.startedAt + requested + cleanupMs);
        if (deadline > run.budget) { run.budget = deadline; arm(run, false); }
      }
    }
    if (root && run.timer === undefined) arm(run);
    const upstream = exec.signal;
    const signal = AbortSignal.any([upstream, run.signal]);
    exec.signal = signal;
    try {
      const result = await currentRun.run(run, () => bounded(run, next, root ? cleanupMs * 3 : cleanupMs, signal));
      return run.signal.aborted ? stopped(run, result) : result;
    } catch (error) {
      if (!signal.aborted) throw error;
      if (!run.signal.aborted) run.controller.abort(new Error('PTC program ended before its nested call finished cleaning up'));
      return stopped(run);
    } finally {
      // A middleware may still be awaiting its own I/O before calling next().
      // Keep cancellation on the execution after a bounded wait ends, so that
      // late next() cannot dispatch the body using an un-aborted old signal.
      exec.signal = run.signal.aborted ? signal : upstream;
    }
  }, { global: true, prepend: true });

  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const run = runOf(exec);
    if (!run) return next();
    try { return await bounded(run, next, cleanupMs, run.signal, true); }
    catch (error) {
      if (!run.signal.aborted) throw error;
      // Even a failed tool may need redaction or blocking by post-policy.
      // Never bypass an unfinished policy by accepting its input result.
      return { kind: 'block', feedback: stopped(run).content };
    }
  }, { global: true, prepend: true });
  ctx.on('tools/ptc-dispatch-log', async (dispatch, next) => {
    const run = runOf(dispatch.exec);
    if (!run) return next();
    try { return await bounded(run, next, cleanupMs, run.signal, true); }
    catch (error) { if (!run.signal.aborted) throw error; return dispatch.content; }
  }, { global: true, prepend: true });
  ctx.on('tools/result', exec => {
    const run = runOf(exec);
    if (!run || exec.token !== run.root) return;
    clearTimeout(run.timer); run.closed = true; collect(run);
  }, { global: true });

  ctx.inject(['ptcRuntime'], scope => {
    const runtime = original(scope.ptcRuntime), previous = runtime.run;
    const descriptor = Object.getOwnPropertyDescriptor(runtime, 'run');
    let mounted = true;
    const guarded = async function (spec) {
      const run = currentRun.getStore();
      if (!mounted || !active || !run || !runs.has(run)) return previous.call(this, spec);
      const signal = spec.signal ? AbortSignal.any([spec.signal, run.signal]) : run.signal;
      // A resolved millisecond deadline is the provider's public contract.
      // The native worker retains the hard maximum; the shared signal owns
      // the adaptive default. Explicit caller deadlines are never extended.
      const outer = !run.runtimeStarted; run.runtimeStarted = true;
      if (outer) run.adaptive = run.adaptiveRequested && Number.isFinite(spec.timeoutMs) && spec.timeoutMs > 0;
      const resolved = outer && run.adaptive ? { ...spec, timeoutMs: run.maximumMs, signal } : { ...spec, signal };
      try { return await bounded(run, () => previous.call(this, resolved), cleanupMs, signal); }
      catch (error) {
        if (!signal.aborted) throw error;
        if (!run.signal.aborted) run.controller.abort(signal.reason);
        return { logs: [], error: { kind: 'abort', message: stopped(run).error.message } };
      }
    };
    Object.defineProperty(runtime, 'run', { configurable: true, writable: true, value: guarded });
    scope.effect(() => () => {
      mounted = false;
      if (runtime.run !== guarded) return;
      if (descriptor) Object.defineProperty(runtime, 'run', descriptor); else delete runtime.run;
    });
  });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next(), timeout = ctx.get('ptcRuntime')?.timeout;
    if (!context?.agent || !adaptiveBudgets(context.agent.session) || !timeout) return assembly;
    const policy = `OMD timeout policy: when timeoutMs is omitted, the initial ${timeout.defaultMs}ms budget can extend for actual nested tool timeout requests, up to ${timeout.maxMs}ms total. An explicitly supplied timeoutMs is a hard outer deadline and never extends. Cancellation and cleanup remain active. Use background jobs for work beyond that maximum.`;
    return { ...assembly, tools: assembly.tools.map(tool => tool.name === 'run_code' && tool.parameters?.properties?.timeoutMs
      ? { ...tool, parameters: { ...tool.parameters, properties: { ...tool.parameters.properties,
        timeoutMs: { ...tool.parameters.properties.timeoutMs, description: policy } } } } : tool) };
  }, { global: true });
  ctx.effect(() => () => {
    active = false;
    for (const run of runs) {
      if (run.lifetime !== lifetime) continue;
      clearTimeout(run.timer);
      run.closed = true;
      run.controller.abort(new Error('PTC lifecycle owner disposed'));
      collect(run);
    }
  });
}
