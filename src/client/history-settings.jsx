import React, { useEffect, useState } from 'react';
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
    const prototype = SessionEventStream.prototype;
    const restore = ['open', 'prepend'].map(name => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name), original = prototype[name];
      function page(request, ...args) {
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
    return () => restore.forEach(fn => fn());
  });
}

export function HistorySizeSetting() {
  const [size, setSize] = useState(historySize), [error, setError] = useState('');
  useEffect(() => {
    const sync = event => { if (event.key === HISTORY_SIZE_KEY || event.key === null) setSize(historySize()); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  return <>
    <label className="omd-appearance-row">每次加载历史<select aria-label="每次加载历史" value={size} onChange={event => {
      const value = Number(event.target.value);
      try { localStorage.setItem(HISTORY_SIZE_KEY, String(value)); setSize(value); setError(''); }
      catch { setError('浏览器无法保存加载数量，原设置保持不变。'); }
    }}>{HISTORY_SIZES.map(value => <option key={value} value={value}>{value} 条{value === 200 ? '（默认）' : ''}</option>)}</select></label>
    <p className="omd-appearance-help">用于初次打开对话和“加载更早”。保存在当前浏览器，已加载的记录与折叠状态不受影响。</p>
    {error && <p role="alert">{error}</p>}
  </>;
}
