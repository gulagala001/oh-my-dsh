import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';

const WIDTH_KEY = 'omd.codexDesktop.rightWidth.v1';
const isCodex = state => state.skins.find(s => s.id === state.selected)?.layout === 'codex-desktop';

function Geometry({ ctx }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const frame = ref.current?.closest('.pI_x6G_frame');
    if (!frame) return;
    const right = frame.querySelector('.pI_x6G_rightbarCol');
    const sync = () => {
      const width = `${right?.getBoundingClientRect().width || 0}px`;
      if (frame.style.getPropertyValue('--codex-right-width') !== width) frame.style.setProperty('--codex-right-width', width);
    };
    const observer = new ResizeObserver(sync);
    if (right) observer.observe(right);
    sync();

    // DSH 0.1.6-alpha.2 registers a shared root store factory (create returns
    // its existing instance). Use its declared geometry actions, so the frame,
    // right pane and native drag handle all agree on the same width.
    const entry = ctx.slots.entries('root').find(item => item.store?.create);
    const store = entry?.store.create();
    let unsubscribe, previous, last;
    if (store?.getSnapshot().layoutInfo && store.actions?.setRightbar) {
      previous = store.getSnapshot().layoutInfo.rightbar;
      let saved;
      try { saved = Number(localStorage.getItem(WIDTH_KEY)); } catch {}
      const preferred = Number.isFinite(saved) && saved >= 300 ? saved : 360;
      store.actions.setRightbar(preferred);
      last = store.getSnapshot().layoutInfo.rightbar;
      unsubscribe = store.subscribe(() => {
        const next = store.getSnapshot().layoutInfo.rightbar;
        if (next === last) return;
        last = next;
        try { localStorage.setItem(WIDTH_KEY, String(next)); } catch {}
      });
    }
    return () => {
      observer.disconnect(); frame.style.removeProperty('--codex-right-width');
      unsubscribe?.();
      if (previous !== undefined) {
        // A null preference means the host's first-open 45% default.
        const fallback = Math.max(300, Math.round(store.getSnapshot().layoutInfo.viewportWidth * .45));
        store.actions.setRightbar(previous ?? fallback);
      }
    };
  }, [ctx]);
  return <span ref={ref} hidden/>;
}

export function applyCodexIntegration(ctx, getRuntime) {
  function Shell() {
    const runtime = getRuntime();
    const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return isCodex(state) ? <Geometry ctx={ctx}/> : null;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-codex-geometry', order: 10 }, Shell));
  const name = 'conversation.session.header.corner';
  ctx.slots.inject(name, () => decorateSlot(ctx.slots, name, () => true, original => {
    const Original = original.component;
    function Corner(props) {
      const runtime = getRuntime();
      const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
      const expanded = props.useStore(value => value.bySession[props.sessionId]?.layout.expanded ?? false);
      if (!isCodex(state)) return <Original {...props}/>;
      const label = props.t(expanded ? 'chrome.collapseAria' : 'chrome.expandAria');
      return <button type="button" className="codex-panel-toggle" aria-label={label} title={label} aria-expanded={expanded}
        onClick={() => props.actions.toggleExpanded(props.sessionId)}><IconPanelLeftOutline16/></button>;
    }
    return { options: { ...original.options, name, store: original.store, locale: original.locale,
      inject: original.inject, children: original.children,
      priority: (original.options.priority ?? 0) - 1 }, component: Corner };
  }));
}
