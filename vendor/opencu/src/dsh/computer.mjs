import { Worker } from 'node:worker_threads';
import { partialReplError, serializeReplError, deserializeReplError } from './repl-output.mjs';
import { createInputReleaseState } from './input-release.mjs';
import { controlFailure } from '../protocol.mjs';

const checked = result => {
  if (result?.ok === false) throw controlFailure(result);
  return result;
};

function timeoutFailure(run) {
  const pendingRequests = [...run.requests.values()].map(value => ({...value}));
  const executing = pendingRequests.filter(value => !value.stage.endsWith('-approval'));
  return Object.assign(new Error('Computer execution timed out; bindings were reset'), {
    code: 'COMPUTER_TIMEOUT',
    details: {stage: executing.length ? 'backend-request' : 'javascript', pendingRequests},
  });
}

function updateDeadline(run) {
  if (run.finished || run.signal.aborted) return;
  const waiting = run.requests.size > 0 && [...run.requests.values()].every(value => value.stage.endsWith('-approval'));
  if (waiting === run.waitingForApproval) return;
  const now = performance.now();
  clearTimeout(run.timer);
  if (waiting) {
    run.remainingMs = Math.max(0, run.deadline - now);
    if (!run.remainingMs) { run.aborter.abort(timeoutFailure(run)); return; }
    run.deadline = Infinity;
  } else {
    run.deadline = now + run.remainingMs;
    run.timer = setTimeout(() => run.aborter.abort(timeoutFailure(run)), run.remainingMs);
  }
  run.waitingForApproval = waiting;
}

/** Keep persistent bindings off the Host thread; only the Host owns dispatch and release. */
export function createComputerSession(request) {
  let context, current, closing, closed = false, releaseOnClose = false, generation = 0, sequence = 0, tail = Promise.resolve();
  const pending = new Set(), inputRelease = createInputReleaseState();
  const stop = async () => checked(await inputRelease.request('stop', undefined, () => request('stop')));
  function initialize() {
    // This plain ESM runtime needs no Host preload, eval or process-only flags.
    const record = { worker: new Worker(new URL('./computer-worker.mjs', import.meta.url), { execArgv: [] }), retired: false };
    record.worker.on('message', message => {
      const run = record.run;
      if (record.retired || !run || message.cell !== run.id) return;
      if (message.type === 'progress') {
        run.partial = {...message.partial, outputs: run.partial.outputs.concat(message.partial.outputs)};
        return;
      }
      if (message.type === 'result') {
        if (performance.now() >= run.deadline) { run.aborter.abort(timeoutFailure(run)); return; }
        if (message.error) run.reject(deserializeReplError(message.error));
        else run.resolve(message.result);
        return;
      }
      if (message.type !== 'request' || run.signal.aborted) return;
      const { endpoint, args } = message;
      const stage = {endpoint, targetId: args?.targetId ?? args?.reference?.id, stage: 'backend-request'};
      run.requests.set(message.id, stage);
      updateDeadline(run);
      const work = inputRelease.request(endpoint, args, async () => { run.signal.throwIfAborted(); return request(endpoint, args, {onApprovalWait: approval => {
        if (record.retired || run.signal.aborted) return;
        Object.assign(stage, {...approval, stage: approval?.kind === 'browser' ? 'browser-approval' : 'application-approval'});
        updateDeadline(run);
        return () => { stage.stage = 'backend-request'; delete stage.requestId; delete stage.appDisplayName; updateDeadline(run); };
      }}); }).then(checked);
      pending.add(work);
      const respond = response => {
        if (!record.retired) record.worker.postMessage({ type: 'response', id: message.id, ...response });
      };
      void work.then(result => respond({ result }), error => respond({ error: serializeReplError(error) }))
        .catch(error => run.reject(error)).finally(() => { pending.delete(work); run.requests.delete(message.id); updateDeadline(run); });
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
      releaseOnClose ||= Boolean(current || pending.size || inputRelease.pending);
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
        const run = { id: ++sequence, aborter, signal: signal ? AbortSignal.any([signal, aborter.signal]) : aborter.signal, requests: new Map(),
          waitingForApproval: false, finished: false, partial: { outputs: [], images: [], deliveries: [], documentation: [] } };
        current = record.run = run;
        record.worker.ref();
        const timeoutMs = Math.min(300000, Math.max(1, args.timeoutMs ?? 30000));
        run.deadline = performance.now() + timeoutMs;
        run.timer = setTimeout(() => aborter.abort(timeoutFailure(run)), timeoutMs);
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
          run.finished = true; clearTimeout(run.timer);
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
