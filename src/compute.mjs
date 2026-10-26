import { Worker } from 'node:worker_threads';

// Only trusted deterministic transformations, never tool dispatch or model code.
export const COMPUTE_IDLE_MS = 30_000;
const pending = [];
let worker, current, idle, generation = 0, nextId = 0, stopping;
function finish(item, error, value) {
  item.signal?.removeEventListener('abort', item.abort);
  if (error !== undefined) item.reject(error); else item.resolve(value);
}
function retire(reason) {
  clearTimeout(idle);
  const retired = worker; worker = undefined; generation++;
  if (current) { const item = current; current = undefined; finish(item, reason); }
  if (!retired) return stopping ?? Promise.resolve();
  const done = retired.terminate().then(() => undefined);
  stopping = done;
  done.finally(() => { if (stopping === done) stopping = undefined; drain(); });
  return done;
}
function start() {
  const ownGeneration = generation;
  worker = new Worker(new URL('./compute-worker.mjs', import.meta.url), { execArgv: [] });
  worker.on('message', reply => {
    if (ownGeneration !== generation || !current || current.id !== reply.id) return;
    const item = current; current = undefined;
    let error;
    if (reply.error) { error = new Error(reply.error.message); error.name = reply.error.name; if (reply.error.code !== undefined) error.code = reply.error.code; }
    finish(item, error, reply.value); drain();
  });
  worker.on('error', error => { if (ownGeneration === generation) void retire(error); });
  worker.on('exit', code => {
    if (ownGeneration !== generation) return;
    worker = undefined; generation++;
    if (current) { const item = current; current = undefined; finish(item, new Error(`Tool computation worker exited (${code})`)); }
    drain();
  });
}
function drain() {
  if (current || stopping) return;
  clearTimeout(idle);
  while (pending.length && pending[0].signal?.aborted) {
    const item = pending.shift(); finish(item, item.signal.reason);
  }
  if (!pending.length) {
    worker?.unref();
    if (worker) { idle = setTimeout(() => { void retire(new Error('Idle tool computation worker retired')); }, COMPUTE_IDLE_MS); idle.unref(); }
    return;
  }
  current = pending.shift();
  try { if (!worker) start(); worker.ref(); worker.postMessage({ id: current.id, operation: current.operation, input: current.input }); }
  catch (error) { const item = current; current = undefined; finish(item, error); drain(); }
}
export function compute(operation, input, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const item = { id: ++nextId, operation, input, signal, resolve, reject };
    item.abort = () => {
      if (current === item) { void retire(signal.reason); return; }
      const index = pending.indexOf(item);
      if (index >= 0) { pending.splice(index, 1); finish(item, signal.reason); }
    };
    signal?.addEventListener('abort', item.abort, { once: true });
    pending.push(item); drain();
  });
}
export async function closeToolComputations() {
  const reason = new Error('Tool computations disposed');
  for (const item of pending.splice(0)) finish(item, reason);
  await retire(reason);
  const { clearAstCache } = await import('./result-reduction/ast-engine.mjs');
  clearAstCache();
  const { clearArticleCache } = await import('./result-reduction/article.mjs');
  clearArticleCache();
}
