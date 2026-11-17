import React, { useCallback, useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';

/** One panel per conversation; the native content/composer keeps its mount. */
export function installOverviewPanel(ctx) {
  const panels = new Map(), listeners = new Set();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const empty = { open: false, container: null };
  const read = sessionId => {
    if (!sessionId) return empty;
    if (!panels.has(sessionId)) panels.set(sessionId, { ...empty,
      toggle: () => update(sessionId, { open: !read(sessionId).open }),
    });
    return panels.get(sessionId);
  };
  const update = (sessionId, patch) => {
    if (!sessionId) return;
    const previous = read(sessionId);
    if (Object.entries(patch).every(([key, value]) => previous[key] === value)) return;
    panels.set(sessionId, { ...previous, ...patch });
    for (const listener of listeners) listener();
  };
  const usePanel = sessionId => useSyncExternalStore(subscribe, useCallback(() => read(sessionId), [sessionId]));

  function Layout({ sessionId, children }) {
    const panel = usePanel(sessionId);
    const attach = useCallback(container => update(sessionId, { container }), [sessionId]);
    return <div className="omd-overview-layout" data-overview-open={panel.open || undefined}>
      <div className="omd-overview-chat">{children}</div>
      <aside className="omd-overview-rail" aria-label="会话总览" aria-hidden={!panel.open} inert={panel.open ? undefined : ''}>
        <div ref={attach} className="omd-overview-surface"/>
      </aside>
    </div>;
  }
  ctx.slots.inject('main.conversation', () => decorateSlotComponent(ctx.slots, 'main.conversation', () => true, original => {
    const Original = original.component;
    return function Conversation(props) {
      const renderFactorySlot = useCallback((name, owner, options) => {
        const content = props.renderFactorySlot(name, owner, options);
        return name === 'conversation.content' && owner.variant === 'main'
          ? <Layout sessionId={props.sessionId}>{content}</Layout> : content;
      }, [props.renderFactorySlot, props.sessionId]);
      return <Original {...props} renderFactorySlot={renderFactorySlot}/>;
    };
  }));
  ctx.effect(() => () => { panels.clear(); listeners.clear(); });
  return usePanel;
}
