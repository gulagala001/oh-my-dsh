import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { decorateSlotComponent } from '../../slot-decoration.mjs';

const WIDTH_KEY = 'omd.codexDesktop.rightWidth.v1';
const isCodex = state => state.active !== false && state.skins.find(s => s.id === state.selected)?.layout === 'codex-desktop';

function Geometry({ ctx }) {
  const ref = useRef(null);
  const entry = useSyncExternalStore(fn => ctx.slots.subscribe('root', fn), () => ctx.slots.entriesOfSlot('root')[0]);
  useLayoutEffect(() => {
    const frame = ref.current?.closest('[data-shell-overlay]')?.parentElement;
    if (!frame) return;
    const right = frame.querySelector('[data-rightbar-col]');
    const sync = () => {
      const width = `${right?.getBoundingClientRect().width || 0}px`;
      if (frame.style.getPropertyValue('--codex-right-width') !== width) frame.style.setProperty('--codex-right-width', width);
    };
    const observer = new ResizeObserver(sync);
    if (right) observer.observe(right);
    sync();

    // Only the live root winner owns geometry. The pinned host's factory
    // returns its shared instance; covered or abdicated roots are not seats.
    const store = entry?.store?.create?.();
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
  }, [ctx, entry]);
  return <span ref={ref} hidden/>;
}

export function applyCodexIntegration(ctx, getRuntime, { priority = 0 } = {}) {
  function Shell() {
    const runtime = getRuntime();
    const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return isCodex(state) ? <Geometry ctx={ctx}/> : null;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-codex-geometry', order: 10, priority }, Shell));
  const name = 'conversation.session.header.corner';
  ctx.slots.inject(name, () => decorateSlotComponent(ctx.slots, name, () => true, original => {
    const Original = original.component;
    function Corner(props) {
      if (typeof props.useStore !== 'function' || typeof props.actions?.toggleExpanded !== 'function'
          || typeof props.t !== 'function') return <Original {...props}/>;
      const runtime = getRuntime();
      const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
      const expanded = props.useStore(value => value.bySession[props.sessionId]?.layout.expanded ?? false);
      if (!isCodex(state)) return <Original {...props}/>;
      const label = props.t(expanded ? 'chrome.collapseAria' : 'chrome.expandAria');
      return <button type="button" className="codex-panel-toggle" aria-label={label} title={label} aria-expanded={expanded}
        onClick={() => props.actions.toggleExpanded(props.sessionId)}><IconPanelLeftOutlineRegular/></button>;
    }
    return Corner;
  }));
}
