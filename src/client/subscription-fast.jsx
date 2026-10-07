import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';

const emptyStore = { subscribe: () => () => {}, getSnapshot: () => undefined };

/** Keep the subscription plugin's routing and show its Fast switch as a bolt. */
export function SubscriptionFast({ ctx, sessionId, loadSpeed, setSpeed }) {
  const store = useMemo(() => ctx.get('sessions')?.binding(sessionId)?.session.projections.faceOf('modelSelection') ?? emptyStore, [ctx, sessionId]);
  const selection = useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot());
  const selected = selection?.next ?? selection?.lastUsed;
  const scope = `${sessionId}/${selected?.provider ?? ''}/${selected?.model ?? ''}`;
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), reading = useRef(loadSpeed);
  reading.current = loadSpeed;
  useEffect(() => {
    const ticket = ++generation.current;
    setState(null); setBusy(false); setError('');
    let inflight = false;
    const refresh = () => {
      if (!reading.current || inflight) return;
      inflight = true;
      void reading.current().then(value => {
        if (ticket === generation.current) setState({ ...value, scope });
      }, () => {}).finally(() => { inflight = false; });
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { ++generation.current; clearInterval(timer); };
  }, [scope]);
  if (!setSpeed || state?.scope !== scope || !state?.visible || selected && selected.provider !== 'codex') return null;
  const enabled = state.tier === 'fast';
  return <button type="button" aria-label="Fast 模式" aria-pressed={enabled} disabled={busy}
    title={error || (enabled ? 'Fast 已开启 · 点击关闭' : 'Fast 已关闭 · 点亮闪电开启')}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
      padding: 4, border: 0, borderRadius: 6, background: 'transparent', cursor: busy ? 'wait' : 'pointer',
      color: enabled ? '#4d6fe9' : 'var(--dsw-alias-label-secondary)' }}
    onClick={() => {
      if (busy) return;
      const ticket = generation.current, tier = enabled ? 'standard' : 'fast';
      setBusy(true); setError('');
      void setSpeed(tier).then(ok => {
        if (ticket !== generation.current) return;
        setBusy(false);
        if (ok) setState({ visible: true, tier, scope });
        else setError('Fast 设置未保存，请重试');
      }, () => { if (ticket === generation.current) { setBusy(false); setError('Fast 设置未保存，请重试'); } });
    }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill={enabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-12h-7l1-8Z"/></svg>
  </button>;
}

export function applySubscriptionFast(ctx) {
  const name = 'conversation.input.right';
  ctx.slots.inject(name, () => {
    // A list cell is identified by id. Filter the ledger before reusing the
    // existing decorator so it never adapts another toolbar contribution.
    const slots = { ctx: ctx.slots.ctx,
      entries: key => ctx.slots.entries(key).filter(entry => entry.options.id === 'codex-speed'),
      subscribe: (key, listener) => ctx.slots.subscribe(key, listener),
      register: (options, component) => ctx.slots.register(options, component),
    };
    return decorateSlot(slots, name, () => true, original => {
      function Fast(props) { return <SubscriptionFast ctx={ctx} {...props}/>; }
      return { options: { ...original.options, name, order: 110, priority: (original.options.priority ?? 0) - 1,
        store: original.store, locale: original.locale, inject: original.inject, children: original.children }, component: Fast };
    });
  });
}
