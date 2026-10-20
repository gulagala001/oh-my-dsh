import { SessionEventStream } from '@deepseek-ai/dsh-api-session-controller/client';

export const HISTORY_SIZE_KEY = 'omd.historyPageSize.v1';
export const HISTORY_SIZES = [50, 200, 500];
export function historySize() {
  try { const value = Number(localStorage.getItem(HISTORY_SIZE_KEY)); if (HISTORY_SIZES.includes(value)) return value; } catch {}
  return 200;
}
// Adapt the host's ordinary page window while leaving jump/repair requests
// alone. RC uses a turn-aligned window capped at 500 instead of maxMessages=50.
export function applyHistorySize(ctx) {
  ctx.effect(() => {
    let active = true;
    const prototype = SessionEventStream.prototype;
    const restore = ['open', 'prepend'].map(name => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name), original = prototype[name];
      function page(request, ...args) {
        // A later plugin may still hold this function after our unload.
        if (!active) return original.call(this, request, ...args);
        const ordinary = request?.maxMessages === 50 || request?.maxMessages === 500
          && request.turnWindow?.minMessages === 50 && request.turnWindow?.minTurns === 2;
        const size = historySize();
        return original.call(this, ordinary ? { ...request, maxMessages: size,
          ...request.turnWindow ? { turnWindow: { ...request.turnWindow, minMessages: size } } : {},
        } : request, ...args);
      }
      Object.defineProperty(prototype, name, { configurable: true, writable: true, value: page });
      return () => {
        if (prototype[name] !== page) return;
        if (descriptor) Object.defineProperty(prototype, name, descriptor); else delete prototype[name];
      };
    });
    return () => { active = false; restore.forEach(fn => fn()); };
  });
}
