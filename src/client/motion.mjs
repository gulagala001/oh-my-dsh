import { createContext, createElement, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

export const MOTION_MS = Object.freeze({ popup: 160, drawer: 220, collapse: 220 });
const MotionVisible = createContext(true);
export const useMotionVisible = () => useContext(MotionVisible);
const listeners = new Set();
let media, observer;
const reduced = () => typeof document === 'undefined' || document.documentElement.hasAttribute('data-omd-reduce-effects')
  || (media ?? document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)'))?.matches === true;
const changed = () => { for (const listener of listeners) listener(); };
function subscribe(listener) {
  if (!listeners.size && typeof document !== 'undefined') {
    media = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener?.('change', changed);
    observer = new document.defaultView.MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-omd-reduce-effects'] });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    observer?.disconnect(); observer = undefined;
    media?.removeEventListener?.('change', changed); media = undefined;
  };
}

/** Retain only the exit frame. Reopening cancels disposal; owners reset it. */
export function usePresence(open, duration = MOTION_MS.popup, owner) {
  const reduce = useSyncExternalStore(subscribe, reduced, () => true);
  let [state, setState] = useState(() => ({ owner, retained: open }));
  if (state.owner !== owner) {
    state = { owner, retained: open };
    setState(state);
  }
  useLayoutEffect(() => {
    if (open) { setState(previous => previous.retained ? previous : { owner, retained: true }); return; }
    if (!state.retained) return;
    const release = () => setState({ owner, retained: false });
    if (reduce) { release(); return; }
    const timer = setTimeout(release, duration);
    return () => clearTimeout(timer);
  }, [open, reduce, duration, owner, state.retained]);
  return { present: open || state.retained, closing: !open && state.retained };
}

/** Keep the last visible payload, so cancellation can still happen immediately. */
export function useExitContent(content, open, present) {
  const last = useRef(null);
  if (open) last.current = content;
  else if (!present) last.current = null;
  return open ? content : last.current;
}

/** A transparent wrapper for conditional in-console readers and notices. */
export function MotionPresence({ children, kind = 'drawer', owner }) {
  const open = Boolean(children), { present, closing } = usePresence(open, MOTION_MS[kind] ?? MOTION_MS.popup, owner);
  const content = useExitContent(children, open, present);
  return present ? createElement('div', { className: 'omd-motion-presence', 'data-motion-kind': kind,
    'data-motion-exit': closing || undefined, inert: closing ? '' : undefined, 'aria-hidden': closing || undefined,
  }, createElement(MotionVisible.Provider, { value: open }, content)) : null;
}

/** Native controls and fields stay mounted through the height transition. */
export function Collapse({ open, children, id, className = '', animateOnMount = false }) {
  const { present } = usePresence(open, MOTION_MS.collapse);
  const content = useExitContent(children, open, present);
  return createElement('div', { id, className: `omd-motion-collapse ${className}`, 'data-open': open || undefined, 'data-animate-mount': animateOnMount || undefined,
    inert: open ? undefined : '', 'aria-hidden': !open,
  }, createElement('div', { className: 'omd-motion-collapse-content' }, present ? content : null));
}
