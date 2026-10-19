import { Worker } from 'node:worker_threads';
import { partialReplError, serializeReplError, deserializeReplError } from './repl-output.mjs';

const checked = result => {
  if (result?.ok === false) throw Object.assign(new Error(result.error.message), result.error);
  return result;
};

/** Keep persistent bindings off the Host thread; only the Host owns dispatch and release. */
export function createComputerSession(request) {
  let context, current, closing, closed = false, releaseOnClose = false, releaseRequired = false, generation = 0, sequence = 0, tail = Promise.resolve();
  const pending = new Set(), heldInputs = new Set();
  const stop = async () => {
    releaseRequired = true;
    const result = checked(await request('stop'));
    releaseRequired = false; heldInputs.clear(); return result;
  };
  function initialize() {
    // This plain ESM runtime needs no Host preload, eval or process-only flags.
    const record = { worker: new Worker(new URL('./computer-worker.mjs', import.meta.url), { execArgv: [] }), retired: false };
    record.worker.on('message', message => {
      const run = record.run;
      if (record.retired || !run || message.cell !== run.id) return;
      if (message.type === 'progress') { run.partial = message.partial; return; }
      if (message.type === 'result') {
        if (performance.now() >= run.deadline) { run.aborter.abort(Object.assign(new Error('Computer JavaScript timed out; bindings were reset'), { code: 'COMPUTER_TIMEOUT' })); return; }
        if (message.error) run.reject(deserializeReplError(message.error));
        else run.resolve(message.result);
        return;
      }
      if (message.type !== 'request' || run.signal.aborted) return;
      const { endpoint, args } = message, action = endpoint === 'act' ? args?.action : null;
      const key = ['keyDown', 'key_down', 'keyUp', 'key_up'].includes(action) ? JSON.stringify([args.targetId, 'key', args.key])
        : ['mouseDown', 'mouse_down', 'mouseUp', 'mouse_up'].includes(action) ? JSON.stringify([args.targetId, 'button', args.button ?? 'left']) : null;
      if (['keyDown', 'key_down', 'mouseDown', 'mouse_down'].includes(action)) heldInputs.add(key);
      const work = Promise.resolve().then(() => { run.signal.throwIfAborted(); return request(endpoint, args); }).then(checked).then(result => {
        if (['keyUp', 'key_up', 'mouseUp', 'mouse_up'].includes(action)) heldInputs.delete(key);
        if (endpoint === 'stop') heldInputs.clear();
        const outcome = result.result ?? result;
        if (action === 'handleDialog' && outcome.handled && !outcome.releasePending)
          for (const held of heldInputs) if (JSON.parse(held)[0] === args.targetId) heldInputs.delete(held);
        return result;
      });
      pending.add(work);
      const respond = response => {
        if (!record.retired) record.worker.postMessage({ type: 'response', id: message.id, ...response });
      };
      void work.then(result => respond({ result }), error => respond({ error: serializeReplError(error) }))
        .catch(error => run.reject(error)).finally(() => pending.delete(work));
    });
    record.worker.on('error', error => { record.failed = error; record.run?.reject(error); });
    record.worker.on('exit', code => {
      if (!record.retired) {
        record.failed = new Error(`Computer JavaScript worker exited (${code}); bindings were reset`);
        record.run?.reject(record.failed);
      }
    });
    record.worker.unref();
    return context = record;
  }
  async function retire(record, release) {
    if (record && !record.retirement) {
      record.retired = true;
      if (context === record) context = undefined;
      record.retirement = record.worker.terminate();
    }
    // Release runs on the Host even when the worker cannot process messages.
    const results = await Promise.allSettled([...(release ? [stop()] : []), ...pending, ...(record ? [record.retirement] : [])]);
    const rejected = release && results[0].status === 'rejected' ? results[0]
      : results.find(result => result.status === 'rejected' && result.reason?.code === 'RELEASE_FAILED');
    if (rejected) throw rejected.reason;
  }
  const session = {
    get signal() { return current?.signal; },
    async reset() {
      generation++;
      const record = context;
      current?.aborter.abort(new Error('Computer session reset'));
      await retire(record, true);
      await tail;
      return { ok: true, reset: true };
    },
    close() {
      if (closing) return closing;
      closed = true; generation++;
      releaseOnClose ||= Boolean(current || pending.size || heldInputs.size || releaseRequired);
      const record = context;
      current?.aborter.abort(new Error('Computer session disposed'));
      closing = (async () => {
        await retire(record, releaseOnClose);
        await tail;
        session.attachments = undefined;
        releaseOnClose = false;
      })().catch(error => { closing = undefined; throw error; });
      return closing;
    },
    run(args = {}, signal) {
      const queuedGeneration = generation;
      const work = tail.then(async () => {
        if (closed) throw new Error('Computer session is disposed');
        if (queuedGeneration !== generation) throw new Error('Computer session reset');
        if (typeof args.code !== 'string') throw new Error('code is required');
        signal?.throwIfAborted();
        const record = context ?? initialize(), aborter = new AbortController();
        const run = { id: ++sequence, aborter, signal: signal ? AbortSignal.any([signal, aborter.signal]) : aborter.signal,
          partial: { outputs: [], images: [], deliveries: [], documentation: [] } };
        current = record.run = run;
        record.worker.ref();
        const timeoutMs = Math.min(300000, Math.max(1, args.timeoutMs ?? 30000));
        run.deadline = performance.now() + timeoutMs;
        const timer = setTimeout(() => aborter.abort(Object.assign(new Error('Computer JavaScript timed out; bindings were reset'), { code: 'COMPUTER_TIMEOUT' })), timeoutMs);
        let cancel;
        try {
          return await new Promise((resolve, reject) => {
            run.resolve = resolve; run.reject = reject;
            cancel = () => reject(run.signal.reason ?? new Error('Computer use cancelled'));
            run.signal.addEventListener('abort', cancel, { once: true });
            if (run.signal.aborted) { cancel(); return; }
            if (record.failed) { reject(record.failed); return; }
            record.worker.postMessage({ type: 'run', cell: run.id, args });
          });
        } catch (error) {
          const result = error?.details?.partialResult ? error : partialReplError(error, run.partial);
          if (run.signal.aborted || record.failed) await retire(record, !closed && !record.retired);
          throw result;
        } finally {
          clearTimeout(timer);
          run.signal.removeEventListener('abort', cancel);
          record.run = undefined; current = undefined;
          record.worker.unref();
        }
      });
      tail = work.then(() => {}, () => {});
      return work;
    },
  };
  return session;
}
