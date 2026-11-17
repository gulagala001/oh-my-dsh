import React, { useCallback, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { bindOverviewResize, readOverviewWidth, OVERVIEW_WIDTH_KEY } from './overview-panel-resize.mjs';

/** One panel per conversation; the native content/composer keeps its mount. */
export function installOverviewPanel(ctx) {
  const panels = new Map(), listeners = new Set();
  let motionRevision = 0;
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const empty = { open: false, motion: 0, sidebarExpanded: false, container: null };
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
    // Publish transition and target geometry in the SAME React commit, before
    // the resize controller (or native children) can force layout measurement.
    const motion = 'open' in patch && patch.open !== previous.open ? ++motionRevision : previous.motion;
    panels.set(sessionId, { ...previous, motion, ...patch });
    for (const listener of listeners) listener();
  };
  const usePanel = sessionId => useSyncExternalStore(subscribe, useCallback(() => read(sessionId), [sessionId]));

  function SidebarState({ Original, ...props }) {
    const expanded = props.useStore(value => value.bySession[props.sessionId]?.layout.expanded ?? false);
    useLayoutEffect(() => {
      const previous = read(props.sessionId);
      update(props.sessionId, { sidebarExpanded: expanded, ...(expanded && !previous.sidebarExpanded ? { open: false } : {}) });
    }, [props.sessionId, expanded]);
    return <Original {...props}/>;
  }
  ctx.slots.inject('conversation.session.header.corner', () => decorateSlotComponent(ctx.slots, 'conversation.session.header.corner', () => true, original => {
    const Original = original.component;
    return props => typeof props.useStore === 'function' && props.actions?.setExpanded
      ? <SidebarState {...props} Original={Original}/> : <Original {...props}/>;
  }));

  function Layout({ sessionId, children }) {
    const panel = usePanel(sessionId);
    const root = useRef(null), handle = useRef(null), resize = useRef(null), id = useId();
    const [width, setWidth] = useState(() => readOverviewWidth());
    const preferred = useRef(width); preferred.current = width;
    useLayoutEffect(() => {
      const controller = bindOverviewResize({ root: root.current, handle: handle.current, preference: () => preferred.current,
        commit: value => { value = Math.max(200, Math.min(480, value)); preferred.current = value; setWidth(value); try { localStorage.setItem(OVERVIEW_WIDTH_KEY, String(value)); } catch {} },
      });
      resize.current = controller;
      return () => { controller.dispose(); resize.current = null; };
    }, []);
    useLayoutEffect(() => { resize.current?.cancel(); resize.current?.refresh(); }, [sessionId, panel.open, panel.sidebarExpanded]);
    useLayoutEffect(() => {
      if (!panel.motion) return;
      const timer = setTimeout(() => {
        if (read(sessionId).motion === panel.motion) update(sessionId, { motion: 0 });
      }, 350);
      return () => clearTimeout(timer);
    }, [sessionId, panel.motion]);
    const attach = useCallback(container => update(sessionId, { container }), [sessionId]);
    return <div ref={root} className="omd-overview-layout" data-overview-open={panel.open || undefined} data-overview-animating={panel.motion || undefined}
      data-overview-floating={panel.sidebarExpanded || undefined} style={{ '--omd-overview-preferred-width': `${width}px` }}>
      <div className="omd-overview-chat">{children}</div>
      <aside id={id} className="omd-overview-rail" aria-label="会话总览" aria-hidden={!panel.open} inert={panel.open ? undefined : ''}>
        <div ref={handle} className="omd-overview-resize" role="separator" tabIndex={0} aria-label="调整会话总览宽度" aria-orientation="vertical" aria-controls={id} title="拖动调节宽度，双击恢复默认"/>
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
