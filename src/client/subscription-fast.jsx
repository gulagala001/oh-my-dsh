import { Button } from './native-controls.jsx';
import { Icon } from './native-icons.jsx';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { decorateSlot } from './slot-decoration.mjs';
import { useMainConversation } from './main-conversation.mjs';

const emptyStore = { subscribe: () => () => {}, getSnapshot: () => undefined };

/** Keep the subscription plugin's routing and show its Fast switch as a bolt. */
export function SubscriptionFast({ ctx, sessionId, loadSpeed, setSpeed }) {
  const store = useMemo(() => ctx.get('sessions')?.binding(sessionId)?.session.projections.faceOf('modelSelection') ?? emptyStore, [ctx, sessionId]);
  const selection = useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot());
  const selected = selection?.next ?? selection?.lastUsed;
  const scope = `${sessionId}/${selected?.provider ?? ''}/${selected?.model ?? ''}`;
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), revision = useRef(0), writing = useRef(false), reading = useRef(loadSpeed);
  reading.current = loadSpeed;
  useEffect(() => {
    const ticket = ++generation.current;
    writing.current = false;
    setState(null); setBusy(false); setError('');
    let inflight = false;
    const refresh = () => {
      if (!reading.current || inflight || writing.current) return;
      const readRevision = revision.current;
      inflight = true;
      void reading.current().then(value => {
        if (ticket === generation.current && readRevision === revision.current && !writing.current) setState({ ...value, scope });
      }, () => {}).finally(() => { inflight = false; });
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { ++generation.current; clearInterval(timer); };
  }, [scope]);
  if (!setSpeed || state?.scope !== scope || !state?.visible || selected && !['codex', 'openai-codex'].includes(selected.provider)) return null;
  const enabled = state.tier === 'fast';
  return <><Button size="sm" variant="ghost" type="button" aria-label="Fast 模式" aria-pressed={enabled} disabled={busy}
    title={error || (enabled ? 'Fast 已开启 · 点击关闭' : 'Fast 已关闭 · 点亮闪电开启')}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
      padding: 4, border: 0, borderRadius: 6, background: 'transparent', cursor: busy ? 'wait' : 'pointer',
      color: enabled ? '#4d6fe9' : 'var(--dsw-alias-label-secondary)' }}
    onClick={() => {
      if (busy || writing.current) return;
      const ticket = generation.current, tier = enabled ? 'standard' : 'fast';
      // Invalidate reads already in flight, then pause polling until the write settles.
      ++revision.current; writing.current = true;
      setBusy(true); setError('');
      void setSpeed(tier).then(ok => {
        if (ticket !== generation.current) return;
        writing.current = false;
        setBusy(false);
        if (ok) setState({ visible: true, tier, scope });
        else setError('Fast 设置未保存，请重试');
      }, () => { if (ticket === generation.current) { writing.current = false; setBusy(false); setError('Fast 设置未保存，请重试'); } });
    }}>
    <Icon name="bolt" size={18}/>
  </Button>
    {error && createPortal(<div role="alert" aria-live="assertive" aria-atomic="true"
      style={{ position: 'fixed', top: 12, right: 12, zIndex: 1200, maxWidth: 'calc(100vw - 24px)',
        boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, pointerEvents: 'none',
        border: '1px solid var(--dsw-alias-border-l3, #bbb)', background: 'var(--dsw-alias-bg-layer-2, Canvas)',
        color: 'var(--dsw-alias-state-error-primary, #b84949)', fontSize: 14, lineHeight: '20px',
        overflowWrap: 'anywhere', boxShadow: '0 4px 16px #0003' }}>{error}</div>, document.body)}
  </>;
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
      const Original = original.component;
      function Fast(props) {
        const main = useMainConversation(props);
        return main ? <SubscriptionFast ctx={ctx} {...props}/> : <Original {...props}/>;
      }
      return { options: { ...original.options, name, order: 110, priority: (original.options.priority ?? 0) - 1,
        store: original.store, locale: original.locale, inject: original.inject, children: original.children }, component: Fast };
    });
  });
}
