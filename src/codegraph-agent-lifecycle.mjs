import { symbols } from '@deepseek-ai/cordis';

// Cordis 4.0.5-alpha.1's public FiberState is an erased TypeScript const enum.
const LOADING = 1, ACTIVE = 2;
const original = value => value?.[symbols.original] ?? value;

export function codegraphCatalogOwner(ctx) {
  const fiber = original(ctx.fiber), uid = fiber?.uid;
  const controller = new AbortController(), pending = new Set();
  const active = () => !controller.signal.aborted && original(ctx.fiber) === fiber
    && (!fiber || uid !== null && fiber.uid === uid && [LOADING, ACTIVE].includes(fiber.state));
  const cancel = () => {
    if (!controller.signal.aborted) controller.abort(new Error('CodeGraph catalog owner 已停止。'));
  };
  const track = task => {
    pending.add(task);
    task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  };
  const observe = changed => {
    if (original(changed) === fiber && !active()) cancel();
  };
  // dispose clears uid before unloading; restart/dependency loss changes state
  // before cleanup. Both notifications precede a loading apply's disposer.
  if (fiber && active()) {
    ctx.on('internal/plugin', observe, { global: true });
    ctx.on('internal/status', observe, { global: true });
  }
  if (active()) ctx.effect?.(() => () => {
    cancel();
    return Promise.allSettled([...pending]);
  });
  const wait = promise => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      controller.signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, controller.signal.reason);
    // Observe both outcomes even after cancellation. The shared catalog belongs
    // to the runtime, not this owner: never stop/dispose it to cancel a waiter.
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    controller.signal.addEventListener('abort', abort, { once: true });
    if (!active()) { cancel(); abort(); }
  });
  return { active, track, wait, signal: controller.signal };
}
