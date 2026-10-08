// Loaded before host modules. Boot runs on real time; enable() atomically moves
// registered timers to an explicit epoch. Native I/O and OS scheduling stay real.
import timers from 'node:timers';
import timerPromises from 'node:timers/promises';
import { addAbortListener } from 'node:events';
import { performance } from 'node:perf_hooks';
import { syncBuiltinESMExports } from 'node:module';
import { VirtualClock } from './clock.mjs';

if (process.env.OMD_SIMULATION === '1') {
  const NativeDate = globalThis.Date;
  // Node exposes AbortSignal lazily. Initialize it while node:timers is native,
  // otherwise its internal timeout implementation captures our patched timers.
  const NativeAbortSignal = globalThis.AbortSignal;
  const native = Object.freeze({
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    setImmediate: timers.setImmediate, now: NativeDate.now,
  });
  const handles = new Map();
  const owned = new WeakSet();
  const maxDate = 8640000000000000;
  const realMonotonicNow = performance.now.bind(performance);
  let clock, enabled = false, serial = 0, operation = null, inflightVirtualCallbacks = 0;
  const now = () => enabled ? Math.trunc(clock.now()) : native.now();
  const deadlineNow = () => enabled ? clock.now() : realMonotonicNow();
  const checkpoint = () => new Promise((resolve) => native.setImmediate(resolve));

  // The stable function returned here also works when Date.now was captured
  // during boot. Date arguments (including timezone-bearing strings) retain the
  // native constructor and subclass behavior.
  globalThis.Date = new Proxy(NativeDate, {
    apply: () => new NativeDate(now()).toString(),
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [now()], newTarget),
    get: (target, key) => key === 'now' ? now : Reflect.get(target, key),
  });

  const clearBackingTimer = (handle) => {
    if (handle.virtual) clock.clearTimeout(handle.timer);
    else if (handle.repeat) native.clearInterval(handle.timer);
    else native.clearTimeout(handle.timer);
  };

  const cancel = (value) => {
    const handle = typeof value === 'number' || typeof value === 'string' ? handles.get(Number(value)) : value;
    if (!handle || !owned.has(handle)) {
      // realTimers handles and timers created outside this bridge remain usable.
      native.clearTimeout(value);
      return;
    }
    clearBackingTimer(handle);
    handle.canceled = true;
    handle.generation++;
    handles.delete(handle.id);
  };

  const virtualTimer = (targetClock, handle, delay, generation) => {
    if (Math.abs(targetClock.now() + delay) > maxDate) throw new RangeError('Timer deadline is outside the Date range');
    const timer = targetClock.setTimeout(() => dispatch(handle, generation), delay);
    if (!handle.referenced) timer.unref();
    return timer;
  };

  const arm = (handle, delay) => {
    if (enabled && Math.abs(clock.now() + delay) > maxDate) throw new RangeError('Timer deadline is outside the Date range');
    const generation = ++handle.generation;
    handle.virtual = enabled;
    handle.dueAt = deadlineNow() + delay;
    handle.timer = enabled
      ? virtualTimer(clock, handle, delay, generation)
      : (handle.repeat ? native.setInterval : native.setTimeout)(() => dispatch(handle, generation), delay);
    if (!handle.referenced) handle.timer.unref();
  };

  function dispatch(handle, generation) {
    if (handles.get(handle.id) !== handle || handle.generation !== generation) return;
    if (!handle.repeat) handles.delete(handle.id);
    else if (handle.virtual) {
      // A migrated interval's first delay is only its remaining duration. Every
      // subsequent tick uses its original period, including after refresh().
      try { arm(handle, handle.ms); }
      catch (error) { handles.delete(handle.id); throw error; }
    } else handle.dueAt = realMonotonicNow() + handle.ms;
    const result = handle.fn.apply(handle, handle.args);
    if (!handle.virtual || !result || typeof result.then !== 'function') return result;
    // VirtualClock checkpoints microtasks without waiting on callbacks that may
    // need a future virtual timer, real I/O, or never resolve at all.
    inflightVirtualCallbacks++;
    return Promise.resolve(result).then(
      (value) => { inflightVirtualCallbacks--; return value; },
      (error) => { inflightVirtualCallbacks--; throw error; },
    );
  }

  const schedule = (fn, ms, args, repeat = false) => {
    if (typeof fn !== 'function') throw new TypeError('Timer callback must be a function');
    ms = Number(ms);
    if (!Number.isFinite(ms) || ms < 1 || ms > 2147483647) ms = 1;
    ms = Math.trunc(ms);
    const handle = {
      // Negative IDs cannot collide with native Timeout IDs used by watchdogs.
      id: --serial, fn, args, ms, repeat, virtual: enabled, referenced: true,
      canceled: false, generation: 0, timer: undefined, dueAt: 0,
      ref() { this.referenced = true; this.timer?.ref(); return this; },
      unref() { this.referenced = false; this.timer?.unref(); return this; },
      hasRef() { return this.referenced; },
      refresh() {
        // Native refresh may reactivate an expired timeout, but not a canceled one.
        if (this.canceled) return this;
        if (enabled && Math.abs(clock.now() + this.ms) > maxDate) throw new RangeError('Timer deadline is outside the Date range');
        clearBackingTimer(this);
        arm(this, this.ms);
        handles.set(this.id, this);
        return this;
      },
      [Symbol.toPrimitive]() { return this.id; },
      [Symbol.dispose]() { cancel(this); },
    };
    owned.add(handle);
    arm(handle, ms);
    handles.set(handle.id, handle);
    return handle;
  };

  timers.setTimeout = globalThis.setTimeout = (fn, ms, ...args) => schedule(fn, ms, args);
  timers.setInterval = globalThis.setInterval = (fn, ms, ...args) => schedule(fn, ms, args, true);
  timers.clearTimeout = globalThis.clearTimeout = cancel;
  timers.clearInterval = globalThis.clearInterval = cancel;

  function abortError(signal) {
    const error = new Error('The operation was aborted', { cause: signal.reason });
    error.name = 'AbortError'; error.code = 'ABORT_ERR';
    return error;
  }
  timerPromises.setTimeout = (ms, value, options = {}) => new Promise((resolve, reject) => {
    if (ms !== undefined && typeof ms !== 'number') throw new TypeError('Promise timer delay must be a number');
    if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Timer options must be an object');
    const { signal, ref = true } = options;
    if (typeof ref !== 'boolean') throw new TypeError('Timer ref option must be a boolean');
    if (signal !== undefined && !(signal instanceof NativeAbortSignal)) throw new TypeError('Timer signal must be an AbortSignal');
    if (signal?.aborted) { reject(abortError(signal)); return; }
    let settled = false, handle, abortSubscription;
    const cleanup = () => abortSubscription?.[Symbol.dispose]();
    const aborted = () => {
      if (settled) return;
      settled = true;
      cancel(handle);
      cleanup();
      reject(abortError(signal));
    };
    try {
      handle = schedule(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      }, ms, []);
      if (!ref) handle.unref();
      // Match native promise timers: an earlier listener calling
      // stopImmediatePropagation must not prevent cancellation or leak a timer.
      if (signal) abortSubscription = addAbortListener(signal, aborted);
      if (settled) cleanup();
    } catch (error) {
      if (handle) cancel(handle);
      cleanup();
      reject(error);
    }
  });
  syncBuiltinESMExports();

  const snapshot = () => {
    const currentDeadline = deadlineNow();
    return {
      mode: enabled ? 'virtual' : 'real', now: now(), timers: handles.size, operation,
      pending: [...handles.values()].map((handle) => ({
        id: handle.id, type: handle.repeat ? 'interval' : 'timeout', delay: handle.ms,
        remaining: Math.max(0, handle.dueAt - currentDeadline), refed: handle.referenced,
      })),
      inflightVirtualCallbacks,
      controlled: ['Date.now', 'Date default construction/call', 'setTimeout', 'setInterval', 'node:timers timeout/interval', 'node:timers/promises.setTimeout'],
      real: ['native I/O', 'setImmediate', 'AbortSignal.timeout', 'OS process scheduling', 'browser clock', 'realTimers watchdogs', 'performance.now', 'node:timers/promises.setImmediate', 'node:timers/promises.setInterval', 'node:timers/promises.scheduler'],
      callbackPolicy: 'Microtasks are checkpointed; asynchronous callback completion is not awaited.',
      refPolicy: 'Virtual timer ref state is tracked; only explicit advance runs virtual callbacks.',
    };
  };

  const controller = {
    async enable(start = native.now()) {
      if (operation) throw new Error(`Concurrent clock operations are forbidden (${operation} in progress)`);
      if (enabled) throw new Error('Simulation virtual clock is already enabled');
      if (!Number.isSafeInteger(start) || Math.abs(start) > maxDate) throw new RangeError('Invalid simulation clock epoch');
      const candidate = new VirtualClock({ now: start });
      operation = 'enable';
      try {
        // Let boot callbacks finish on real time. Timers registered or cleared
        // during this checkpoint participate in the same migration transaction.
        await checkpoint();
        const actual = realMonotonicNow();
        const prepared = [...handles.values()].map((handle) => {
          const delay = Math.max(0, handle.dueAt - actual);
          const generation = handle.generation + 1;
          return { handle, generation, dueAt: start + delay, timer: virtualTimer(candidate, handle, delay, generation) };
        });
        // No asynchronous boundary between preparation and commit. A failed
        // preparation leaves every real timer intact and virtual mode disabled.
        for (const { handle } of prepared) clearBackingTimer(handle);
        for (const { handle, generation, dueAt, timer } of prepared) {
          Object.assign(handle, { virtual: true, generation, dueAt, timer });
        }
        clock = candidate;
        enabled = true;
      } catch (error) {
        candidate.dispose();
        throw error;
      } finally {
        operation = null;
      }
      return snapshot();
    },
    async advance(ms) {
      if (operation) throw new Error(`Concurrent clock operations are forbidden (${operation} in progress)`);
      if (!enabled) throw new Error('Virtual time is not enabled');
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || Math.abs(clock.now() + ms) > maxDate) {
        throw new RangeError('advance requires a finite nonnegative duration within the Date range');
      }
      operation = 'advance';
      try { return await clock.advance(ms); }
      finally { operation = null; }
    },
    snapshot,
  };
  Object.defineProperty(controller, 'realTimers', {
    value: Object.freeze({ setTimeout: native.setTimeout, clearTimeout: native.clearTimeout, now: native.now }),
    enumerable: true,
  });
  globalThis[Symbol.for('omd.simulation.clock')] = Object.freeze(controller);
}
