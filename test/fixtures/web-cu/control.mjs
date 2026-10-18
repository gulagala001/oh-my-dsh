import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// No Promise.race around actions. The existing owner must interrupt and settle
// its real pending operations; a rejected timeout never leaves a free-running
// loser that can later click or submit. Cleanup has its own bounded deadline.
export async function withJourneyControl({ signal, deadline, abortAndSettle }, body) {
  assert(signal instanceof AbortSignal); assert(Number.isSafeInteger(deadline));
  assert.equal(typeof abortAndSettle, 'function');
  const timerController = new AbortController();
  const timer = setTimeout(() => timerController.abort(Error('Web CU absolute deadline exceeded')), Math.max(0, deadline - Date.now()));
  const combined = AbortSignal.any([signal, timerController.signal]);
  let settling, settleError;
  const abort = () => {
    settling ??= Promise.resolve().then(() => abortAndSettle({ reason: combined.reason, deadline: Date.now() + 10000 })).catch(error => { settleError = error; });
  };
  combined.addEventListener('abort', abort, { once: true });
  const check = () => {
    combined.throwIfAborted();
    if (Date.now() >= deadline) { timerController.abort(Error('Web CU absolute deadline exceeded')); combined.throwIfAborted(); }
  };
  const control = { signal: combined, deadline, check,
    async step(work) { check(); const value = await work({ signal: combined, deadline }); check(); return value; },
    async sleep(ms) { check(); await delay(Math.min(ms, Math.max(1, deadline - Date.now())), undefined, { signal: combined }); check(); },
    async until(fn, label, timeout = 30000) {
      const limit = Math.min(deadline, Date.now() + timeout);
      while (Date.now() < limit) { const value = await this.step(fn); if (value) return value; await this.sleep(50); }
      check(); throw Error('Timed out: ' + label);
    } };
  let result, failure;
  try { check(); result = await body(control); check(); }
  catch (error) { failure = error; }
  finally {
    clearTimeout(timer);
    if (combined.aborted) { abort(); await settling; }
    combined.removeEventListener('abort', abort);
  }
  if (settleError) failure = failure ? new AggregateError([failure, settleError], 'Journey abort and owned settling failed') : settleError;
  if (failure) throw failure;
  return result;
}
