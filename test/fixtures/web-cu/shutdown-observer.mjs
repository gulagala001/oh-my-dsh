import { appendFileSync, watchFile, unwatchFile } from 'node:fs';
import { resolve, sep } from 'node:path';

// Test-only passive observation of the original root disposer. Never invokes
// dispose, releases a CU lease, changes exit code, or handles shutdown for CLI.
export function apply(ctx, config) {
  const file = resolve(config.file), root = resolve(config.root);
  if (!file.startsWith(root + sep)) throw Error('Shutdown evidence must stay in owned root');
  const fiber = ctx.root.fiber, original = fiber.dispose, descriptor = Object.getOwnPropertyDescriptor(fiber, 'dispose');
  let signal, signalCount = 0;
  const observed = name => { signal = name; signalCount++; };
  const term = () => observed('SIGTERM'), interrupt = () => observed('SIGINT');
  process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  const write = value => appendFileSync(file, JSON.stringify({...value,at:Date.now()}) + '\n');
  let appExitRequested = false;
  if (config.requestFile) {
    const request = resolve(config.requestFile); if (!request.startsWith(root + sep)) throw Error('Unowned shutdown request');
    watchFile(request, { interval: 50 }, current => {
      if (!current.isFile() || appExitRequested) return;
      const exit = ctx.root.get('appExit'); if (typeof exit !== 'function') throw Error('Original appExit service missing');
      appExitRequested = true; write({ source: 'original-app-exit-request', code: 0 }); exit(0);
    });
    ctx.effect(() => () => unwatchFile(request));
    // Remains passive until this disposable Host process ends. A real forced
    // process.exit after root completion must still be visible to the parent.
    const exit = process.exit;
    process.exit = function(code) { write({ source: 'process-exit-called', code }); return Reflect.apply(exit, this, [code]); };
    process.once('beforeExit', code => write({ source: 'natural-before-exit', code }));
    process.once('exit', code => write({ source: 'host-exit', code }));
  }
  function dispose(...args) {
    const service = ctx.root.get('opencu'), leaseCountBefore = service?.leaseCount;
    const pending = Reflect.apply(original, this, args);
    Promise.prototype.then.call(pending, () => {
      write({ source: 'original-root-dispose-fulfilled', signal, signalCount, appExitRequested, leaseCountBefore, leaseCountAfter: service?.leaseCount });
    }, error => write({ source: 'original-root-dispose-rejected', failed: true }));
    return pending;
  }
  Object.defineProperty(fiber, 'dispose', { configurable: true, writable: true, value: dispose });
  ctx.effect(() => () => {
    process.off('SIGTERM', term); process.off('SIGINT', interrupt);
    if (fiber.dispose === dispose) {
      if (descriptor) Object.defineProperty(fiber, 'dispose', descriptor); else delete fiber.dispose;
    }
  });
}
